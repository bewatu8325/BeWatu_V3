// api/security/risk-score.ts
// POST /api/security/risk-score

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

const ASSET_CRITICALITY: Record<string, number> = {
  'firebase_auth':              1.0,
  'secret_firebase_admin':      1.0,
  'firestore_users':            0.95,
  'firestore_support_tickets':  0.9,
  'api_factory_token':          0.9,
  'secret_stripe':              0.9,
  'bewatu_ops_app':             0.85,
  'bewatu_v3_app':              0.8,
  'bewatu_factory_app':         0.75,
  'secret_resend':              0.7,
  'secret_anthropic':           0.5,
  'firestore_posts':            0.3,
};

function calculateRiskScore(factors: {
  exploitability: number; assetCriticality: number;
  exposure: number; dataSensitivity: number; blastRadius: number;
}): number {
  const raw = factors.exploitability * factors.assetCriticality *
              factors.exposure * factors.dataSensitivity * factors.blastRadius;
  return Math.min(Math.round(raw * 100 * 10), 100);
}

function mapScoreToSeverity(score: number): string {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'informational';
}

async function calculateBlastRadius(assetId: string, db: ReturnType<typeof getFirestore>): Promise<number> {
  const allAssets = await db.collection('asset_graph').get();
  const totalAssets = allAssets.size;
  if (totalAssets === 0) return 0.5;
  const visited = new Set<string>();
  const queue = [assetId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const dependents = await db.collection('asset_edges')
      .where('toId', '==', current)
      .where('relationship', 'in', ['depends_on', 'reads_from', 'authenticates_via'])
      .get();
    dependents.docs.forEach(d => {
      if (!visited.has(d.data().fromId)) queue.push(d.data().fromId);
    });
  }
  return visited.size / totalAssets;
}

function validateServiceToken(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  return auth.slice(7) === process.env.BEWATU_SECURITY_TOKEN;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, auth } = initAdmin();

    if (!validateServiceToken(req)) {
      try { await auth.verifyIdToken(req.headers.authorization?.slice(7) || ''); }
      catch { return res.status(403).json({ error: 'Unauthorised' }); }
    }

    const { findingId } = req.body;
    if (!findingId) return res.status(400).json({ error: 'findingId required' });

    const findingDoc = await db.collection('security_findings').doc(findingId).get();
    if (!findingDoc.exists) return res.status(404).json({ error: 'Finding not found' });
    const finding = findingDoc.data()!;

    // Get asset factors
    const affectedAssets: string[] = finding.affectedAssets || [];
    let maxCriticality = 0.5, maxDataSensitivity = 0.5, maxExposure = 0.5;
    for (const assetId of affectedAssets) {
      const hardcoded = ASSET_CRITICALITY[assetId];
      if (hardcoded) maxCriticality = Math.max(maxCriticality, hardcoded);
      const assetDoc = await db.collection('asset_graph').doc(assetId).get();
      if (assetDoc.exists) {
        const a = assetDoc.data()!;
        maxCriticality     = Math.max(maxCriticality,     a.criticality     || 0);
        maxDataSensitivity = Math.max(maxDataSensitivity, a.dataSensitivity || 0);
        maxExposure        = Math.max(maxExposure,        a.internetFacing ? 1.0 : 0.3);
      }
    }

    const blastRadius = affectedAssets.length > 0
      ? await calculateBlastRadius(affectedAssets[0], db)
      : 0.3;

    const exploitabilityMap: Record<string, number> = {
      secret_leak: 0.9, vulnerability: 0.7, misconfiguration: 0.6,
      dependency_risk: 0.5, runtime_anomaly: 0.8, policy_violation: 0.3,
    };
    const exploitability = finding.evidence?.cvssScore
      ? Math.min(finding.evidence.cvssScore / 10, 1.0)
      : exploitabilityMap[finding.category] ?? 0.5;

    const factors = {
      exploitability,
      assetCriticality: maxCriticality,
      exposure:         maxExposure,
      dataSensitivity:  maxDataSensitivity,
      blastRadius,
    };

    const riskScore = calculateRiskScore(factors);
    const severity  = mapScoreToSeverity(riskScore);

    await findingDoc.ref.update({
      riskScore, severity, ...factors, status: 'triaged',
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (riskScore >= 40) {
      fetch('https://www.bewatu.com/api/security/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}` },
        body: JSON.stringify({ findingId }),
      }).catch(e => console.error('Remediation trigger error:', e));
    }

    return res.status(200).json({ findingId, riskScore, severity, factors });

  } catch (err: any) {
    console.error('risk-score.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
