// api/security/finding.ts
// POST /api/security/finding
// Receives findings, scores them inline, and triggers remediation for medium+

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGINS = [
  'https://ops.bewatu.com',
  'https://www.bewatu.com',
];

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

function validateSensor(token: string): boolean {
  const securityToken = process.env.BEWATU_SECURITY_TOKEN;
  return !!securityToken && token === securityToken;
}

function normaliseIncomingFinding(body: any) {
  return {
    sensor:         body.sensor || 'unknown',
    category:       body.category || 'vulnerability',
    severity:       body.severity || 'medium',
    title:          String(body.title || 'Untitled finding').slice(0, 200),
    description:    String(body.description || '').slice(0, 2000),
    affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets : [],
    cveId:          body.cveId || null,
    cweId:          body.cweId || null,
    evidence: {
      filePath:   body.evidence?.filePath   || null,
      lineNumber: body.evidence?.lineNumber || null,
      snippet:    body.evidence?.snippet?.slice(0, 500) || null,
      ruleId:     body.evidence?.ruleId     || null,
      cvssScore:  body.evidence?.cvssScore  || null,
      commitSha:  body.evidence?.commitSha  || null,
      logLine:    body.evidence?.logLine    || null,
    },
    repo: body.repo || 'shared',
  };
}

// ── Inline risk scoring ───────────────────────────────────────────────────────

const ASSET_CRITICALITY: Record<string, number> = {
  'firebase_auth':         1.0, 'secret_firebase_admin': 1.0,
  'firestore_users':       0.95, 'api_factory_token':    0.9,
  'secret_stripe':         0.9,  'bewatu_ops_app':       0.85,
  'bewatu_v3_app':         0.8,  'bewatu_factory_app':   0.75,
  'secret_resend':         0.7,  'secret_anthropic':     0.5,
};

function scoreRisk(finding: any): { riskScore: number; severity: string } {
  const exploitMap: Record<string, number> = {
    secret_leak: 0.9, runtime_anomaly: 0.8, vulnerability: 0.7,
    misconfiguration: 0.6, dependency_risk: 0.5, policy_violation: 0.3,
  };
  const exploitability = finding.evidence?.cvssScore
    ? Math.min(finding.evidence.cvssScore / 10, 1.0)
    : exploitMap[finding.category] ?? 0.5;

  const assets: string[] = finding.affectedAssets || [];
  const criticality = assets.reduce((max, id) =>
    Math.max(max, ASSET_CRITICALITY[id] || 0.5), 0.5);
  const exposure     = 0.7; // default — refined by asset graph later
  const sensitivity  = 0.7;
  const blastRadius  = 0.5;

  const raw = exploitability * criticality * exposure * sensitivity * blastRadius;
  const riskScore = Math.min(Math.round(raw * 100 * 10), 100);

  const severity =
    riskScore >= 85 ? 'critical' :
    riskScore >= 65 ? 'high' :
    riskScore >= 40 ? 'medium' :
    riskScore >= 20 ? 'low' : 'informational';

  return { riskScore, severity };
}

// ── Inline remediation plan creation ─────────────────────────────────────────

const APPROVAL_EXPIRY_DAYS = 7;

function determineActions(category: string): string[] {
  const map: Record<string, string[]> = {
    secret_leak:       ['rotate_secret', 'code_change'],
    dependency_risk:   ['patch_dependency'],
    vulnerability:     ['code_change'],
    misconfiguration:  ['config_change'],
    runtime_anomaly:   ['manual'],
    policy_violation:  ['manual'],
  };
  return map[category] || ['manual'];
}

function estimateEffort(actions: string[]): string {
  if (actions.includes('manual'))           return '1–4 hours';
  if (actions.includes('rotate_secret'))    return '30 minutes';
  if (actions.includes('patch_dependency')) return '1–2 hours';
  if (actions.includes('code_change'))      return '1–4 hours';
  return '2–4 hours';
}

function generateRollbackPlan(actions: string[]): string {
  if (actions.includes('patch_dependency'))  return 'Revert the dependency update PR.';
  if (actions.includes('rotate_secret'))     return 'Restore old secret in Vercel env vars and redeploy.';
  if (actions.includes('code_change'))       return 'Revert the associated PR.';
  return 'Revert the config change via Vercel dashboard.';
}

async function generateAIExplanation(finding: any, riskScore: number, actions: string[]): Promise<string> {
  try {
    const prompt = `You are a security advisor explaining a software vulnerability to a non-technical operations manager who needs to decide whether to approve a fix.

Finding details:
- Title: ${finding.title}
- Category: ${finding.category?.replace(/_/g, ' ')}
- Severity: ${finding.severity}
- Risk Score: ${riskScore}/100
- Description: ${finding.description}
- Affected assets: ${(finding.affectedAssets || []).join(', ') || 'unknown'}
- Fix actions required: ${actions.map((a: string) => a.replace(/_/g, ' ')).join(', ')}
${finding.evidence?.filePath ? `- File: ${finding.evidence.filePath}${finding.evidence.lineNumber ? ` line ${finding.evidence.lineNumber}` : ''}` : ''}
${finding.evidence?.snippet ? `- Code snippet: ${finding.evidence.snippet}` : ''}

Write a clear, jargon-free explanation with exactly these four sections. Keep each section to 2-3 sentences maximum. Use plain English — no technical jargon unless absolutely necessary, and if you must use a technical term, explain it immediately.

**What happened**
[Explain what this vulnerability or issue actually is, as if explaining to someone with no coding background]

**What could go wrong**
[Explain the real-world risk — what an attacker could do, what data could be exposed, what could break]

**What the fix does**
[Explain what the proposed fix will actually change, and why that makes things safer]

**Should you approve?**
[Give a clear recommendation — approve confidently, approve with caution, or investigate further first — and why]`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('AI explanation failed:', response.status);
      return '';
    }

    const data = await response.json() as any;
    return data.content?.[0]?.text || '';
  } catch (e) {
    console.error('AI explanation error:', e);
    return '';
  }
}

async function createRemediationPlan(
  db: ReturnType<typeof getFirestore>,
  findingId: string,
  finding: any,
  riskScore: number,
  severity: string
): Promise<{ planId: string; approvalId: string }> {
  const actions   = determineActions(finding.category);
  const summary   = `${finding.title} (risk: ${riskScore}/100, ${severity}). Requires: ${actions.map((a: string) => a.replace(/_/g, ' ')).join(', ')}.`;
  const automatable = actions.includes('patch_dependency') ||
    (actions.includes('code_change') && !!finding.evidence?.filePath);

  const planRef = db.collection('remediation_plans').doc();
  await planRef.set({
    id:               planRef.id,
    findingId,
    status:           'pending_approval',
    priority:         riskScore >= 85 ? 1 : riskScore >= 65 ? 2 : 3,
    actions,
    summary,
    rollbackPlan:     generateRollbackPlan(actions),
    verificationSteps: ['Confirm finding no longer appears in next CI scan.'],
    estimatedEffort:  estimateEffort(actions),
    automatable,
    createdAt:        FieldValue.serverTimestamp(),
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_EXPIRY_DAYS);

  const approvalRef = db.collection('approval_requests').doc();
  const aiExplanation = await generateAIExplanation(finding, riskScore, actions);

  await approvalRef.set({
    id:                approvalRef.id,
    remediationPlanId: planRef.id,
    findingId,
    severity,
    riskScore,
    title:             finding.title,
    summary,
    aiExplanation,
    rollbackPlan:      generateRollbackPlan(actions),
    affectedAssets:    finding.affectedAssets || [],
    estimatedEffort:   estimateEffort(actions),
    status:            'pending',
    expiresAt:         Timestamp.fromDate(expiresAt),
    createdAt:         FieldValue.serverTimestamp(),
  });

  return { planId: planRef.id, approvalId: approvalRef.id };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, auth } = initAdmin();

    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(403).json({ error: 'Unauthorised' });
    const token = authHeader.slice(7);

    if (!validateSensor(token)) {
      try {
        const decoded = await auth.verifyIdToken(token);
        const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
        if (!opsDoc.exists) return res.status(403).json({ error: 'Unauthorised' });
      } catch {
        return res.status(403).json({ error: 'Unauthorised' });
      }
    }

    const partial = normaliseIncomingFinding(req.body);

    // Deduplicate — skip the compound query, use simple title match instead
    const recent = await db.collection('security_findings')
      .where('title',  '==', partial.title)
      .where('sensor', '==', partial.sensor)
      .limit(5)
      .get();

    const openDupe = recent.docs.find(d =>
      !['verified', 'false_positive', 'accepted_risk'].includes(d.data().status)
    );

    if (openDupe) {
      await openDupe.ref.update({ updatedAt: FieldValue.serverTimestamp() });
      return res.status(200).json({ id: openDupe.id, deduplicated: true });
    }

    // Score inline
    const { riskScore, severity } = scoreRisk(partial);

    const seq  = await db.runTransaction(async t => {
      const counter = db.collection('security_config').doc('counters');
      const doc = await t.get(counter);
      const current = doc.data()?.findingSeq || 0;
      t.set(counter, { findingSeq: current + 1 }, { merge: true });
      return current + 1;
    });

    const year      = new Date().getFullYear();
    const findingId = `BW-SEC-${year}-${String(seq).padStart(4, '0')}`;
    const docRef    = db.collection('security_findings').doc();

    const finding = {
      id:               docRef.id,
      findingId,
      ...partial,
      riskScore,
      severity,
      exploitability:   0,
      exposure:         0.7,
      blastRadius:      0.5,
      dataSensitivity:  0.7,
      assetCriticality: 0.5,
      status:           riskScore >= 40 ? 'approval_pending' : 'triaged',
      detectedAt:       FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    };

    await docRef.set(finding);

    // Create remediation plan for medium and above
    let planId: string | null = null;
    let approvalId: string | null = null;

    if (riskScore >= 40) {
      const result = await createRemediationPlan(db, docRef.id, partial, riskScore, severity);
      planId     = result.planId;
      approvalId = result.approvalId;

      await docRef.update({ remediationPlanId: planId });
    }

    return res.status(201).json({
      id: docRef.id, findingId, riskScore, severity, planId, approvalId,
    });

  } catch (err: any) {
    console.error('finding.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
