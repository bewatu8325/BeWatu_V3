// api/security/risk-score.ts
// POST /api/security/risk-score
// Scores a finding using the BeWatu risk formula and, if severity is
// high/critical, automatically creates a remediation plan.
//
// Body: { findingId: string }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import type { Finding, RiskFactors, Severity } from '../../bewatu-security/types/security';
import { ASSET_CRITICALITY } from '../../bewatu-security/config/asset-graph';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )});
}

const db = admin.firestore();

// ── Risk formula ──────────────────────────────────────────────────────────────

function calculateRiskScore(factors: RiskFactors): number {
  const raw =
    factors.exploitability *
    factors.assetCriticality *
    factors.exposure *
    factors.dataSensitivity *
    factors.blastRadius;

  return Math.min(Math.round(raw * 100 * 10), 100);
}

function mapScoreToSeverity(score: number): Severity {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'informational';
}

// ── Blast radius — BFS traversal of asset graph ───────────────────────────────

async function calculateBlastRadius(assetId: string): Promise<number> {
  const allAssets = await db.collection('asset_graph').get();
  const totalAssets = allAssets.size;
  if (totalAssets === 0) return 0.5; // fallback if graph not seeded

  const visited = new Set<string>();
  const queue   = [assetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const dependents = await db.collection('asset_edges')
      .where('toId', '==', current)
      .where('relationship', 'in', ['depends_on', 'reads_from', 'authenticates_via'])
      .get();

    dependents.docs.forEach(d => {
      const fromId = d.data().fromId;
      if (!visited.has(fromId)) queue.push(fromId);
    });
  }

  return visited.size / totalAssets;
}

async function getAssetFactors(affectedAssets: string[]): Promise<{
  criticality: number;
  dataSensitivity: number;
  exposure: number;
  blastRadius: number;
}> {
  if (affectedAssets.length === 0) {
    return { criticality: 0.5, dataSensitivity: 0.5, exposure: 0.5, blastRadius: 0.3 };
  }

  // Use the highest-criticality asset as the reference
  let maxCriticality = 0;
  let maxDataSensitivity = 0;
  let maxExposure = 0;

  for (const assetId of affectedAssets) {
    // Check hardcoded criticality map first (fast path)
    const hardcoded = ASSET_CRITICALITY[assetId];
    if (hardcoded) maxCriticality = Math.max(maxCriticality, hardcoded);

    // Try Firestore asset graph
    const assetDoc = await db.collection('asset_graph').doc(assetId).get();
    if (assetDoc.exists) {
      const a = assetDoc.data()!;
      maxCriticality     = Math.max(maxCriticality, a.criticality || 0);
      maxDataSensitivity = Math.max(maxDataSensitivity, a.dataSensitivity || 0);
      maxExposure        = Math.max(maxExposure, a.internetFacing ? 1.0 : 0.3);
    }
  }

  // Blast radius from the highest-criticality asset
  const primaryAsset = affectedAssets[0];
  const blastRadius  = await calculateBlastRadius(primaryAsset);

  return {
    criticality:     maxCriticality     || 0.5,
    dataSensitivity: maxDataSensitivity || 0.5,
    exposure:        maxExposure        || 0.5,
    blastRadius,
  };
}

function getExploitability(finding: Finding): number {
  // Use CVSS if available
  if (finding.evidence?.cvssScore) {
    return Math.min(finding.evidence.cvssScore / 10, 1.0);
  }
  // Infer from category and severity
  const base: Record<string, number> = {
    'secret_leak':       0.9,   // Already leaked = trivially exploitable
    'vulnerability':     0.7,
    'misconfiguration':  0.6,
    'dependency_risk':   0.5,
    'runtime_anomaly':   0.8,
    'policy_violation':  0.3,
  };
  return base[finding.category] ?? 0.5;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function validateServiceToken(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  return token === process.env.BEWATU_SECURITY_TOKEN;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!validateServiceToken(req)) {
    // Also accept ops agent ID tokens
    try {
      const auth = req.headers.authorization?.slice(7);
      if (!auth) return res.status(403).json({ error: 'Unauthorised' });
      await admin.auth().verifyIdToken(auth);
    } catch {
      return res.status(403).json({ error: 'Unauthorised' });
    }
  }

  const { findingId } = req.body;
  if (!findingId) return res.status(400).json({ error: 'findingId required' });

  try {
    const findingDoc = await db.collection('security_findings').doc(findingId).get();
    if (!findingDoc.exists) return res.status(404).json({ error: 'Finding not found' });

    const finding = { id: findingDoc.id, ...findingDoc.data() } as Finding;

    const assetFactors  = await getAssetFactors(finding.affectedAssets);
    const exploitability = getExploitability(finding);

    const factors: RiskFactors = {
      exploitability,
      assetCriticality: assetFactors.criticality,
      exposure:         assetFactors.exposure,
      dataSensitivity:  assetFactors.dataSensitivity,
      blastRadius:      assetFactors.blastRadius,
    };

    const riskScore = calculateRiskScore(factors);
    const severity  = mapScoreToSeverity(riskScore);

    // Update the finding with scores
    await findingDoc.ref.update({
      riskScore,
      severity,
      exploitability:   factors.exploitability,
      exposure:         factors.exposure,
      blastRadius:      factors.blastRadius,
      dataSensitivity:  factors.dataSensitivity,
      assetCriticality: factors.assetCriticality,
      status:           'triaged',
      updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
    });

    // Auto-create remediation plan for medium and above
    if (riskScore >= 40) {
      try {
        await fetch(`${process.env.VERCEL_URL || 'https://www.bewatu.com'}/api/security/remediation`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}`,
          },
          body: JSON.stringify({ findingId }),
        });
      } catch (e) {
        console.error('Remediation trigger error:', e);
      }
    }

    return res.status(200).json({ findingId, riskScore, severity, factors });

  } catch (err: any) {
    console.error('risk-score.ts error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
