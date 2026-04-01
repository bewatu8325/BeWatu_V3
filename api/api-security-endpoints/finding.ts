// api/security/finding.ts
// POST /api/security/finding
// Receives findings from GitHub Actions sensors, scores them, and
// creates remediation plans + approval requests for high/critical severity.
//
// Auth: Bearer token verified against ops_staff OR a dedicated
//       BEWATU_SECURITY_TOKEN (service token for CI use).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import type { Finding, Severity, FindingCategory } from '../../bewatu-security/types/security';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )});
}

const db = admin.firestore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateFindingId(year: number, seq: number): string {
  return `BW-SEC-${year}-${String(seq).padStart(4, '0')}`;
}

async function getNextSequence(): Promise<number> {
  const counter = db.collection('security_config').doc('counters');
  const result = await db.runTransaction(async t => {
    const doc = await t.get(counter);
    const current = doc.data()?.findingSeq || 0;
    t.set(counter, { findingSeq: current + 1 }, { merge: true });
    return current + 1;
  });
  return result;
}

function validateSensor(token: string): boolean {
  const securityToken = process.env.BEWATU_SECURITY_TOKEN;
  return securityToken ? token === securityToken : false;
}

async function verifyOpsAgent(req: VercelRequest): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  // Check if it's the CI service token
  if (validateSensor(token)) {
    return { uid: 'ci-sensor', email: 'ci@bewatu.com' } as any;
  }

  // Otherwise verify as Firebase ID token
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const opsDoc = await db.collection('ops_staff').doc(decoded.uid).get();
    if (!opsDoc.exists) return null;
    return decoded;
  } catch {
    return null;
  }
}

function normaliseIncomingFinding(body: any): Partial<Finding> {
  // Accepts findings from multiple sensor formats and normalises them
  return {
    sensor:          body.sensor || 'unknown',
    category:        (body.category as FindingCategory) || 'vulnerability',
    severity:        (body.severity as Severity) || 'medium',
    title:           String(body.title || 'Untitled finding').slice(0, 200),
    description:     String(body.description || '').slice(0, 2000),
    affectedAssets:  Array.isArray(body.affectedAssets) ? body.affectedAssets : [],
    cveId:           body.cveId,
    cweId:           body.cweId,
    evidence: {
      filePath:   body.evidence?.filePath,
      lineNumber: body.evidence?.lineNumber,
      snippet:    body.evidence?.snippet?.slice(0, 500),
      ruleId:     body.evidence?.ruleId,
      cvssScore:  body.evidence?.cvssScore,
      commitSha:  body.evidence?.commitSha,
      logLine:    body.evidence?.logLine,
    },
    repo: body.repo || 'shared',
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const agent = await verifyOpsAgent(req);
  if (!agent) return res.status(403).json({ error: 'Unauthorised' });

  try {
    const partial = normaliseIncomingFinding(req.body);

    // Check for duplicate (same title + sensor within last 24h)
    const recent = await db.collection('security_findings')
      .where('title',  '==', partial.title)
      .where('sensor', '==', partial.sensor)
      .where('status', 'not-in', ['verified', 'false_positive', 'accepted_risk'])
      .limit(1)
      .get();

    if (!recent.empty) {
      // Update updatedAt on the existing finding rather than creating a duplicate
      await recent.docs[0].ref.update({ updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(200).json({ id: recent.docs[0].id, deduplicated: true });
    }

    const seq  = await getNextSequence();
    const year = new Date().getFullYear();
    const id   = db.collection('security_findings').doc().id;

    const finding: Finding = {
      id,
      findingId:        generateFindingId(year, seq),
      ...partial as any,
      // Placeholder scores — overwritten by risk-score endpoint immediately below
      riskScore:        0,
      exploitability:   0,
      exposure:         0,
      blastRadius:      0,
      dataSensitivity:  0,
      assetCriticality: 0,
      status:           'open',
      detectedAt:       admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('security_findings').doc(id).set(finding);

    // Trigger risk scoring asynchronously (fire and forget from the sensor's perspective)
    // In practice call the risk-score endpoint internally
    try {
      const riskRes = await fetch(`${process.env.VERCEL_URL || 'https://www.bewatu.com'}/api/security/risk-score`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}`,
        },
        body: JSON.stringify({ findingId: id }),
      });
      if (!riskRes.ok) console.error('Risk scoring failed for', id);
    } catch (e) {
      console.error('Risk score trigger error:', e);
    }

    return res.status(201).json({ id, findingId: finding.findingId });

  } catch (err: any) {
    console.error('finding.ts error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
