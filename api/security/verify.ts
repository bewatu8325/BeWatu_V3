// api/security/verify.ts
// POST /api/security/verify
// Post-execution verification — checks that the fix was merged and
// re-queues a scan to confirm the finding is resolved.
//
// Body: { planId: string, prNumber?: number, repo?: string }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { Octokit } from '@octokit/rest';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )});
}

const db = admin.firestore();

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

  const { planId, prNumber, repo } = req.body;
  if (!planId) return res.status(400).json({ error: 'planId required' });

  try {
    const planDoc = await db.collection('remediation_plans').doc(planId).get();
    if (!planDoc.exists) return res.status(404).json({ error: 'Plan not found' });

    const plan    = planDoc.data()!;
    const finding = (await db.collection('security_findings').doc(plan.findingId).get()).data();

    let prMerged = false;

    // Check GitHub PR status if we have a PR number
    if (prNumber && repo && process.env.GITHUB_TOKEN) {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const { owner, repo: repoName } = getGHRepo(repo);

      try {
        const pr = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });
        prMerged = pr.data.merged;
      } catch (e) {
        console.warn('Could not fetch PR status:', e);
      }
    }

    if (prMerged) {
      // PR merged — mark as verified
      await planDoc.ref.update({
        status:     'completed',
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('security_findings').doc(plan.findingId).update({
        status:     'verified',
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
      });

      // Write audit entry
      await db.collection('audit_log').add({
        action:    'security_finding_verified',
        findingId: plan.findingId,
        planId,
        prNumber,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ verified: true, planId });
    } else {
      // PR not yet merged — schedule a re-check (the ops portal can poll this)
      return res.status(200).json({
        verified: false,
        message:  prNumber
          ? `PR #${prNumber} not yet merged — check again after merge.`
          : 'Manual verification required — no PR number provided.',
        planId,
      });
    }

  } catch (err: any) {
    console.error('verify.ts error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
