import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Whitelist of approved models — update here when Google deprecates models.
//
// P2, found via a live production error while verifying an unrelated fix:
// gemini-2.0-flash-lite/-flash were shut down by Google on 2026-06-01 —
// every call here had been returning a clean 404 from Google (caught and
// surfaced as a 500, not a crash) since then, so every AI feature routed
// through this endpoint (chat greeting/replies, synergy analysis, job-match
// analysis) had likely been silently failing for months. Replaced with the
// current (Sept 2026) Gemini 3.x line — gemini-3.5-flash-lite is Google's
// own migration recommendation for gemini-2.0-flash-lite specifically, and
// is the newest currently-GA "lite" tier.
const APPROVED_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-pro',
];

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

// P1 (cost-abuse / input validation): this endpoint proxies to a paid
// Gemini model and had NO authentication at all — anyone on the
// internet could call it indefinitely and spend BeWatu's Gemini budget
// with no cap. Now requires a valid Firebase ID token, same pattern as
// factory-token.ts / api/claude.js.
//
// This also moves the function off the Edge runtime: Firebase Admin's
// verifyIdToken needs Node APIs it doesn't have on Edge. Nothing here
// depended on Edge-specific behavior (no streaming), so this is a safe
// runtime change, not a functional one — same request/response shape.
//
// P0 7 (least privilege): only ever calls verifyIdToken — Auth-only
// service account, falling back to the shared key until the scoped one
// is provisioned.
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? process.env.FIREBASE_SERVICE_ACCOUNT!
  );
  return initializeApp({ credential: cert(serviceAccount) });
}

// P1 (rate limiting, launch-readiness review): auth alone stops a
// stranger, not a legitimate signed-in user looping this to burn
// Gemini's budget. Rate-limit state needs real Firestore access, which
// the auth-only app above deliberately doesn't have — rather than widen
// that account's scope, this is a second, separately-named app using the
// broader (Firestore-capable) key, same least-privilege reasoning as
// every other server-side collection in this review.
function getRateLimitDb() {
  const name = 'rateLimitApp';
  const app = getApps().some(a => a.name === name)
    ? getApp(name)
    : initializeApp(
        { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!)) },
        name
      );
  return getFirestore(app);
}

const RL_MIN_INTERVAL_MS = 3 * 1000;       // 3s between calls per uid
const RL_WINDOW_MS       = 60 * 60 * 1000; // rolling 1-hour window
const RL_MAX_PER_WINDOW  = 40;             // generous for real chat use, caps abuse

/** Returns an error message if the uid is currently rate-limited, else null. */
async function checkAndBumpRateLimit(db: FirebaseFirestore.Firestore, collection: string, uid: string): Promise<string | null> {
  const ref = db.doc(`${collection}/${uid}`);
  const now = Date.now();
  const rl = (await ref.get()).data() as { sendCount?: number; windowStart?: number; lastSentAt?: number } | undefined;
  if (rl?.lastSentAt && now - rl.lastSentAt < RL_MIN_INTERVAL_MS) {
    return 'Too many requests — please slow down.';
  }
  const windowStart = rl?.windowStart && now - rl.windowStart < RL_WINDOW_MS ? rl.windowStart : now;
  const sendCount    = windowStart === rl?.windowStart ? (rl?.sendCount ?? 0) : 0;
  if (sendCount >= RL_MAX_PER_WINDOW) {
    return 'Too many requests this hour — please try again later.';
  }
  await ref.set({ lastSentAt: now, windowStart, sendCount: sendCount + 1, updatedAt: FieldValue.serverTimestamp() });
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  let callerUid: string;
  try {
    callerUid = (await getAuth(getAdminApp()).verifyIdToken(authHeader.slice('Bearer '.length))).uid;
  } catch (err: any) {
    console.error('gemini proxy auth error:', err?.message ?? err);
    return res.status(401).json({ error: 'Invalid or expired ID token' });
  }

  const rateLimitError = await checkAndBumpRateLimit(getRateLimitDb(), 'gemini_rate_limits', callerUid);
  if (rateLimitError) return res.status(429).json({ error: rateLimitError });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const body = req.body ?? {};

    // Always use server-controlled model — ignore anything the client sends
    const model = DEFAULT_MODEL;
    void APPROVED_MODELS; // kept for reference / future client-selectable models

    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model,
      contents: body.contents ?? [{ parts: [{ text: body.prompt }] }],
    });

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
