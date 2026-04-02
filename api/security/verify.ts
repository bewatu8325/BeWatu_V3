// api/security/verify.ts
// POST /api/security/verify

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Octokit } from '@octokit/rest';

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore() };
}

function validateServiceToken(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  return auth.slice(7) === process.env.BEWATU_SECURITY_TOKEN;
}

function getGHRepo(repo: string): { owner: string; repo: string } {
  const map: Record<string, { owner: string; repo: string }> = {
    bewatu_v3:      { owner: 'bewatu', repo: 'BeWatu_V3' },
    bewatu_factory: { owner: 'bewatu', repo: 'bewatu-factory-main-3' },
    bewatu_ops:     { owner: 'bewatu', repo: 'bewatu-ops' },
  };
  return map[repo] || map.bewatu_v3;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateServiceToken(req)) return res.status(403).json({ error: 'Unauthorised' });

  try {
    const { db } = initAdmin();
    const { planId, prNumber, repo } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });

    const planDoc = await db.collection('remediation_plans').doc(planId).get();
    if (!planDoc.exists) return res.status(404).json({ error: 'Plan not found' });
    const plan = planDoc.data()!;

    let prMerged = false;
    if (prNumber && repo && process.env.GITHUB_TOKEN) {
      try {
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const { owner, repo: repoName } = getGHRepo(repo);
        const pr = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });
        prMerged = pr.data.merged;
      } catch (e) { console.warn('Could not fetch PR status:', e); }
    }

    if (prMerged) {
      await planDoc.ref.update({ status: 'completed', verifiedAt: FieldValue.serverTimestamp() });
      await db.collection('security_findings').doc(plan.findingId).update({
        status: 'verified', resolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('audit_log').add({
        action: 'security_finding_verified', findingId: plan.findingId,
        planId, prNumber, timestamp: FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ verified: true, planId });
    }

    return res.status(200).json({
      verified: false,
      message: prNumber ? `PR #${prNumber} not yet merged.` : 'Manual verification required.',
      planId,
    });

  } catch (err: any) {
    console.error('verify.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
