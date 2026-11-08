// api/reel-arena-link.ts
// ─────────────────────────────────────────────────────────────────────────────
// Connects a member's Prove reel to an Arena challenge they actually took part in.
//
//   mine      the challenges the caller has a submission for (the only ones a reel may be linked to)
//   link      { reelId, challengeId, contribution?, skills? }  attach the link to the caller's own reel
//   unlink    { reelId }                                        remove it
//   refresh   { reelId }                                        re-read the submission's current status
//
// What a link means, and does not mean:
//   - It says "this reel is about my work on that challenge". The proof is that a submission by the caller EXISTS on that
//     challenge: it is checked here, on the server, every time. Uploading a reel alone never creates a link.
//   - `contribution` and `skills` are the member's own words, and are shown as such.
//   - `outcome` is copied from the submission record: 'submitted' by default, 'shortlisted' or 'winner' only when the
//     challenge's reviewer recorded that. A rejected submission is shown as plain 'submitted' (we never publish a rejection).
//     It is never inferred from the reel, and the page shows when it was last checked.
//   - Clients cannot write `arenaLink` themselves (firestore.rules), so nothing on a reel claiming a challenge link or an
//     outcome can have come from anywhere but this route.
//
// POST /api/reel-arena-link   Authorization: Bearer <idToken>   { action, ... }
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Outcome = 'submitted' | 'shortlisted' | 'winner';

const clean = (v: unknown, max: number) =>
  // eslint-disable-next-line no-control-regex
  (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const safeId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : '';

/** The outcome we may show for a submission record. Rejections and unknown states are not shown. */
export function outcomeOf(sub: { status?: unknown; isShortlisted?: unknown } | undefined): Outcome {
  if (sub?.status === 'winner') return 'winner';
  if (sub?.status === 'shortlisted' || sub?.isShortlisted === true) return 'shortlisted';
  return 'submitted';
}

async function mySubmission(db: Firestore, challengeId: string, uid: string) {
  const snap = await db.collection('arena_challenges').doc(challengeId).collection('submissions').where('authorUid', '==', uid).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, data: snap.docs[0].data() };
}

async function myReel(db: Firestore, reelId: string, uid: string) {
  if (!safeId(reelId)) throw new HttpError(400, 'A reel is required.');
  const ref = db.collection('reels').doc(reelId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Reel not found.');
  if (snap.data()?.authorUid !== uid) throw new HttpError(403, 'You can only link your own reels.');
  return { ref, data: snap.data()! };
}

export async function runAction(db: Firestore, uid: string, body: any, now: number = Date.now()): Promise<Record<string, unknown>> {
  if (!uid) throw new HttpError(401, 'Unauthorized');
  switch (body?.action) {
    case 'mine': {
      // The caller's submissions, across challenges. (Needs the collection-group index on submissions.authorUid; see firestore.indexes.json.)
      let snap;
      try { snap = await db.collectionGroup('submissions').where('authorUid', '==', uid).limit(50).get(); }
      catch (e: any) {
        if (e?.code === 9 || /index/i.test(String(e?.message))) return { challenges: [], unavailable: true };
        throw e;
      }
      const out: { challengeId: string; title: string; industry: string; outcome: Outcome }[] = [];
      for (const d of snap.docs) {
        const challengeId = d.ref.parent.parent?.id; if (!challengeId) continue;
        const c = await db.collection('arena_challenges').doc(challengeId).get();
        if (!c.exists) continue;
        out.push({ challengeId, title: clean(c.data()!.title, 120), industry: clean(c.data()!.arenaIndustry, 40), outcome: outcomeOf(d.data()) });
      }
      return { challenges: out };
    }
    case 'link': {
      const { ref } = await myReel(db, body.reelId, uid);
      const challengeId = safeId(body.challengeId);
      if (!challengeId) throw new HttpError(400, 'A challenge is required.');
      const [challenge, sub] = await Promise.all([db.collection('arena_challenges').doc(challengeId).get(), mySubmission(db, challengeId, uid)]);
      if (!challenge.exists) throw new HttpError(404, 'Challenge not found.');
      // The evidence: this member really submitted to this challenge.
      if (!sub) throw new HttpError(403, 'You can link a reel to a challenge only after you have submitted to it.');
      const seen = new Set<string>();
      const skills = (Array.isArray(body.skills) ? body.skills : []).map((x: unknown) => clean(x, 40)).filter((x: string) => {
        const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true;
      }).slice(0, 6);
      const link = {
        challengeId, challengeTitle: clean(challenge.data()!.title, 120), industry: clean(challenge.data()!.arenaIndustry, 40),
        submissionId: sub.id, contribution: clean(body.contribution, 280), skills,
        outcome: outcomeOf(sub.data), outcomeCheckedAt: now, linkedAt: now,
      };
      await ref.update({ arenaLink: link, updatedAt: FieldValue.serverTimestamp() });
      return { arenaLink: link };
    }
    case 'unlink': {
      const { ref } = await myReel(db, body.reelId, uid);
      await ref.update({ arenaLink: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      return { ok: true };
    }
    case 'refresh': {
      const { ref, data } = await myReel(db, body.reelId, uid);
      const link = data.arenaLink;
      if (!link?.challengeId) return { arenaLink: null };
      const sub = await mySubmission(db, link.challengeId, uid);
      if (!sub) { await ref.update({ arenaLink: FieldValue.delete() }); return { arenaLink: null }; }   // the evidence is gone, so is the link
      const next = { ...link, outcome: outcomeOf(sub.data), outcomeCheckedAt: now };
      await ref.update({ arenaLink: next });
      return { arenaLink: next };
    }
    default: throw new HttpError(400, 'Unknown action.');
  }
}

const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com'];

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(authHeader.split('Bearer ')[1]);
    const result = await runAction(getFirestore(app), decoded.uid, req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (String(err?.code ?? '').startsWith('auth/')) return res.status(401).json({ error: 'Unauthorized' });
    console.error('reel-arena-link error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
