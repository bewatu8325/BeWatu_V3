// api/email-preferences.ts
// ─────────────────────────────────────────────────────────────────────────────
// A signed-in member's own choice about "product updates" email (news and features sent from the ops console).
//
//   get   { productUpdates: boolean }   true unless the member has opted out
//   set   { productUpdates: boolean }   opt in (resubscribe) or opt out, for the caller only
//
// Account, security and policy messages ("service" emails) are not a preference: they always arrive, and this route
// cannot change that. The opt-out itself is the same field the unsubscribe link writes (`commsOptOut`), so a choice
// made in an email and a choice made here are always one choice.
//
// POST /api/email-preferences   Authorization: Bearer <idToken>   { action, productUpdates? }
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function runAction(db: Firestore, uid: string, body: any): Promise<{ productUpdates: boolean }> {
  if (!uid) throw new HttpError(401, 'Unauthorized');
  const ref = db.collection('users').doc(uid);
  switch (body?.action) {
    case 'get': {
      const snap = await ref.get();
      return { productUpdates: snap.data()?.commsOptOut !== true };
    }
    case 'set': {
      if (typeof body.productUpdates !== 'boolean') throw new HttpError(400, 'productUpdates must be true or false.');
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Account not found.');
      const optOut = !body.productUpdates;
      // Only write when it changes, so repeated taps leave the record of WHEN they chose untouched.
      if ((snap.data()?.commsOptOut === true) !== optOut) {
        await ref.set(optOut
          ? { commsOptOut: true, commsOptOutAt: FieldValue.serverTimestamp() }
          : { commsOptOut: false, commsResubscribedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return { productUpdates: body.productUpdates };
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
    console.error('email-preferences error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
