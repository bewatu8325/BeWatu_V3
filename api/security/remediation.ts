// api/security/remediation.ts
// POST /api/security/remediation
// Generates a RemediationPlan for a finding, then creates an ApprovalRequest
// and notifies the ops team.
//
// Body: { findingId: string }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import type {
  Finding,
  RemediationPlan,
  ApprovalRequest,
  RemediationAction,
} from '../../bewatu-security/types/security';
import { APPROVAL_EXPIRY_DAYS } from '../../bewatu-security/config/risk-thresholds';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )});
}

const db = admin.firestore();

// ── Remediation logic ─────────────────────────────────────────────────────────

function determineActions(finding: Finding): RemediationAction[] {
  switch (finding.category) {
    case 'secret_leak':
      return ['rotate_secret', 'code_change'];
    case 'dependency_risk':
      return ['patch_dependency'];
    case 'vulnerability':
      return ['code_change'];
    case 'misconfiguration':
      return finding.affectedAssets.includes('firestore_rules')
        ? ['rules_update']
        : ['config_change'];
    case 'runtime_anomaly':
      return finding.title.toLowerCase().includes('deletion')
        ? ['revoke_access', 'manual']
        : ['manual'];
    default:
      return ['manual'];
  }
}

function estimateEffort(actions: RemediationAction[]): string {
  if (actions.includes('manual'))          return '1–4 hours (manual investigation required)';
  if (actions.includes('rotate_secret'))   return '30 minutes';
  if (actions.includes('patch_dependency'))return '1–2 hours';
  if (actions.includes('code_change'))     return '1–4 hours';
  if (actions.includes('config_change'))   return '30 minutes';
  if (actions.includes('rules_update'))    return '1 hour';
  return '2–4 hours';
}

function isAutomatable(actions: RemediationAction[], finding: Finding): boolean {
  // Only patch_dependency and simple code_change with a known diff can be automated
  if (actions.includes('manual') || actions.includes('revoke_access')) return false;
  if (actions.includes('patch_dependency')) return true;
  if (actions.includes('code_change') && finding.evidence?.filePath) return true;
  return false;
}

function generateSummary(finding: Finding, actions: RemediationAction[]): string {
  const actionStr = actions.map(a => a.replace(/_/g, ' ')).join(', ');
  return `${finding.title} (risk score: ${finding.riskScore}/100, ${finding.severity}). ` +
    `Remediation requires: ${actionStr}. ` +
    `Affects: ${finding.affectedAssets.slice(0, 3).join(', ')}${finding.affectedAssets.length > 3 ? ` and ${finding.affectedAssets.length - 3} more` : ''}.`;
}

function generateRollbackPlan(finding: Finding, actions: RemediationAction[]): string {
  if (actions.includes('patch_dependency')) {
    return 'Revert the dependency update PR. The previous version remains available. No data changes are involved.';
  }
  if (actions.includes('rotate_secret')) {
    return 'If the new secret causes service failures, temporarily restore the old secret in Vercel env vars and redeploy while investigating. File the incident immediately.';
  }
  if (actions.includes('rules_update')) {
    return 'Revert firestore.rules to the previous commit. Deploy via `firebase deploy --only firestore:rules`. Verify access is restored in the emulator before deploying.';
  }
  if (actions.includes('config_change')) {
    return 'Revert the config change via Vercel dashboard. Redeploy the previous deployment using the Vercel rollback button.';
  }
  return 'Revert the associated PR or config change. Verify platform functionality after rollback.';
}

function generateVerificationSteps(finding: Finding): string[] {
  const base = ['Confirm the finding no longer appears in the next CI scan.'];

  if (finding.category === 'dependency_risk') {
    return [
      ...base,
      'Run `npm audit` locally and confirm the CVE is no longer listed.',
      'Deploy to preview environment and run smoke tests.',
    ];
  }
  if (finding.category === 'secret_leak') {
    return [
      'Confirm the old secret is revoked in the source system (Stripe/Resend/Anthropic/Firebase).',
      'Confirm no API calls using the old secret succeed (test via curl).',
      'Run Gitleaks on the repo and confirm no secrets found.',
      'Check Vercel logs for any 401/403 errors indicating services using the old key.',
    ];
  }
  if (finding.category === 'misconfiguration') {
    return [
      ...base,
      'Confirm the posture check passes on next run.',
      'Test the affected endpoint/resource with an unauthenticated request to confirm access is denied.',
    ];
  }
  return [
    ...base,
    'Verify in Firestore that the finding status is updated to `verified`.',
    'Confirm no new related findings appear within 24 hours.',
  ];
}

function generateDiff(finding: Finding): string | undefined {
  // Known automatable fix: CORS wildcard
  if (finding.evidence?.ruleId === 'bewatu-cors-wildcard' && finding.evidence?.filePath) {
    return `--- a/${finding.evidence.filePath}
+++ b/${finding.evidence.filePath}
@@ -${finding.evidence.lineNumber || 1},1 +${finding.evidence.lineNumber || 1},5 @@
-  res.setHeader('Access-Control-Allow-Origin', '*');
+  const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://factory.bewatu.com', 'https://ops.bewatu.com'];
+  const origin = req.headers.origin as string | undefined;
+  if (origin && ALLOWED_ORIGINS.includes(origin)) {
+    res.setHeader('Access-Control-Allow-Origin', origin);
+  }`;
  }
  return undefined;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function validateServiceToken(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  return auth.slice(7) === process.env.BEWATU_SECURITY_TOKEN;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateServiceToken(req)) return res.status(403).json({ error: 'Unauthorised' });

  const { findingId } = req.body;
  if (!findingId) return res.status(400).json({ error: 'findingId required' });

  try {
    const findingDoc = await db.collection('security_findings').doc(findingId).get();
    if (!findingDoc.exists) return res.status(404).json({ error: 'Finding not found' });

    const finding = { id: findingDoc.id, ...findingDoc.data() } as Finding;

    // Check if a plan already exists
    const existing = await db.collection('remediation_plans')
      .where('findingId', '==', findingId)
      .where('status', 'not-in', ['completed', 'rolled_back', 'failed'])
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(200).json({ planId: existing.docs[0].id, existing: true });
    }

    const actions    = determineActions(finding);
    const automatable = isAutomatable(actions, finding);
    const diff       = generateDiff(finding);

    const planRef = db.collection('remediation_plans').doc();
    const plan: RemediationPlan = {
      id:               planRef.id,
      findingId:        findingId,
      status:           'pending_approval',
      priority:         finding.riskScore >= 85 ? 1 : finding.riskScore >= 65 ? 2 : 3,
      actions,
      summary:          generateSummary(finding, actions),
      diff:             diff ?? undefined,
      rollbackPlan:     generateRollbackPlan(finding, actions),
      verificationSteps: generateVerificationSteps(finding),
      estimatedEffort:  estimateEffort(actions),
      automatable,
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
    };

    await planRef.set(plan);

    // Update finding status
    await findingDoc.ref.update({
      status:            'approval_pending',
      remediationPlanId: planRef.id,
      updatedAt:         admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create approval request
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + APPROVAL_EXPIRY_DAYS);

    const approvalRef = db.collection('approval_requests').doc();
    const approval: ApprovalRequest = {
      id:                approvalRef.id,
      remediationPlanId: planRef.id,
      findingId,
      severity:          finding.severity,
      riskScore:         finding.riskScore,
      title:             finding.title,
      summary:           plan.summary,
      diff:              diff,
      rollbackPlan:      plan.rollbackPlan,
      affectedAssets:    finding.affectedAssets,
      estimatedEffort:   plan.estimatedEffort,
      status:            'pending',
      expiresAt:         admin.firestore.Timestamp.fromDate(expiresAt),
      createdAt:         admin.firestore.FieldValue.serverTimestamp(),
    };

    await approvalRef.set(approval);

    // Write a security event
    await db.collection('security_events').add({
      type:      'CODE_PUSHED',
      source:    'remediation-service',
      payload:   { findingId, planId: planRef.id, approvalId: approvalRef.id },
      processed: false,
      findingId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      planId:    planRef.id,
      approvalId: approvalRef.id,
      automatable,
    });

  } catch (err: any) {
    console.error('remediation.ts error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
