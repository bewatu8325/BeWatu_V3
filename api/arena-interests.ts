// api/arena-interests.ts
// ─────────────────────────────────────────────────────────────────────────────
// Which Arena industries a member follows, and whether they want to hear when a new challenge goes live in them.
//
//   get      { industries: string[], notify: boolean }
//   set      { industries: string[], notify: boolean }       replace both (industries must be real Arena industries)
//   follow   { industry, follow: boolean }                   add or remove one
//
// Following is for the member's own discovery ("for you" on the Arenas page). Notifications are a separate, explicit
// opt-in: a member can follow without being notified. The alert itself is sent by the Cloud Function that watches
// challenges go live (functions/src/arenaAlerts.ts).
//
// POST /api/arena-interests   Authorization: Bearer <idToken>   { action, ... }
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const MAX_FOLLOWS = 12;

async function realIndustries(db: Firestore): Promise<Set<string>> {
  const snap = await db.collection('arena_industries').limit(60).get();
  return new Set(snap.docs.filter(d => d.data().isActive !== false).map(d => d.id));
}

const read = (x: FirebaseFirestore.DocumentData | undefined) => ({
  industries: Array.isArray(x?.arenaFollows) ? x!.arenaFollows.filter((s: unknown) => typeof s === 'string').slice(0, MAX_FOLLOWS) as string[] : [],
  notify: x?.arenaNotify === true,
});

export async function runAction(db: Firestore, uid: string, body: any): Promise<{ industries: string[]; notify: boolean }> {
  if (!uid) throw new HttpError(401, 'Unauthorized');
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  switch (body?.action) {
    case 'get': return read(snap.data());
    case 'set':
    case 'follow': {
      if (!snap.exists) throw new HttpError(404, 'Account not found.');
      const current = read(snap.data());
      let industries: string[]; let notify = current.notify;
      if (body.action === 'set') {
        if (!Array.isArray(body.industries) || body.industries.some((s: unknown) => typeof s !== 'string')) throw new HttpError(400, 'industries must be a list.');
        if (typeof body.notify !== 'boolean') throw new HttpError(400, 'notify must be true or false.');
        industries = [...new Set<string>(body.industries)]; notify = body.notify;
      } else {
        if (typeof body.industry !== 'string' || typeof body.follow !== 'boolean') throw new HttpError(400, 'industry and follow are required.');
        industries = body.follow ? [...new Set([...current.industries, body.industry])] : current.industries.filter(s => s !== body.industry);
      }
      if (industries.length > MAX_FOLLOWS) throw new HttpError(400, `You can follow up to ${MAX_FOLLOWS} industries.`);
      const real = await realIndustries(db);
      const unknown = industries.filter(s => !real.has(s));
      // Removing something that no longer exists is fine; adding it is not.
      const toKeep = body.action === 'follow' && body.follow === false ? industries : industries.filter(s => real.has(s));
      if (body.action === 'set' && unknown.length) throw new HttpError(400, 'Unknown Arena industry.');
      if (body.action === 'follow' && body.follow === true && !real.has(body.industry)) throw new HttpError(400, 'Unknown Arena industry.');
      await ref.set({ arenaFollows: toKeep, arenaNotify: notify, arenaFollowsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { industries: toKeep, notify };
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
    console.error('arena-interests error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
