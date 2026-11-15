// api/security/verify.ts
// POST /api/security/verify   { planId }       (Authorization: Bearer BEWATU_SECURITY_TOKEN)
// ─────────────────────────────────────────────────────────────────────────────
// Looks at the pull request a remediation opened and records whether a person has MERGED it.
//
// A merged PR is not a fixed problem, and this no longer says it is. It records `prMerged` and an audit entry, and leaves the
// finding in "remediation pending". A finding is "verified" only when the next scan stops reporting it (or an operator confirms
// that in the console). The repository and PR number come from the stored plan and finding, never from the request, so the
// caller cannot point this at another repository.
//
// Self-contained on purpose: api/ routes cannot import each other.
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { Octokit } from '@octokit/rest';
import { timingSafeEqual } from 'node:crypto';

/** Constant-time, and never true when either side is empty. */
export function safeEqual(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const OWNER = 'bewatu8325';
export const REPOS: Record<string, string> = { bewatu_v3: 'BeWatu_V3', bewatu_ops: 'bewatu-ops', bewatu_factory: 'bewatu-factory', shared: 'BeWatu_V3' };
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export interface Deps { db: Firestore; now: number; prIsMerged(repo: string, prNumber: number): Promise<boolean> }

export async function check(d: Deps, body: any): Promise<Record<string, unknown>> {
  const planId = typeof body?.planId === 'string' ? body.planId : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(planId)) throw new HttpError(400, 'planId required');
  const planRef = d.db.collection('remediation_plans').doc(planId);
  const plan = (await planRef.get()).data();
  if (!plan) throw new HttpError(404, 'Plan not found');
  const findingRef = d.db.collection('security_findings').doc(String(plan.findingId));
  const finding = (await findingRef.get()).data();
  if (!finding) throw new HttpError(404, 'Finding not found');

  if (!plan.prNumber) return { planId, merged: false, verified: false, message: 'No pull request was opened for this plan. Verify it by hand.' };
  const repo = REPOS[String(finding.repo ?? 'shared')];
  if (!repo) throw new HttpError(409, 'The finding names a repository this check does not know');

  // A failure to ask GitHub is an error, not "not merged yet": the caller must be able to tell the two apart.
  let merged: boolean;
  try { merged = await d.prIsMerged(repo, Number(plan.prNumber)); }
  catch (e: any) { throw new HttpError(502, `Could not read pull request #${plan.prNumber} from GitHub: ${String(e?.message ?? 'error').slice(0, 120)}`); }

  if (!merged) return { planId, merged: false, verified: false, message: `PR #${plan.prNumber} is not merged yet.` };
  if (!plan.prMerged) {
    await planRef.update({ prMerged: true, prMergedSeenAt: FieldValue.serverTimestamp() });
    await findingRef.update({ prMerged: true });   // deliberately NOT updatedAt: the daily sweep reads that as "last touched"
    await d.db.collection('audit_log').add({ action: 'security_fix_merged', findingId: plan.findingId, planId, prNumber: plan.prNumber, timestamp: FieldValue.serverTimestamp() });
  }
  return { planId, merged: true, verified: false, message: 'The PR is merged. It is verified only once the next scan no longer reports the finding.' };
}

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ') || !safeEqual(h.slice(7), process.env.BEWATU_SECURITY_TOKEN)) return res.status(403).json({ error: 'Unauthorised' });
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });
    const o = new Octokit({ auth: token });
    const out = await check({ db: initAdmin(), now: Date.now(), prIsMerged: async (repo, n) => (await o.pulls.get({ owner: OWNER, repo, pull_number: n })).data.merged }, req.body ?? {});
    return res.status(200).json(out);
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('verify.ts error:', e?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
