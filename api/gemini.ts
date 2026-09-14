import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Whitelist of approved models — update here when Google deprecates models
const APPROVED_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
];

const DEFAULT_MODEL = 'gemini-2.0-flash-lite';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    await getAuth(getAdminApp()).verifyIdToken(authHeader.slice('Bearer '.length));
  } catch (err: any) {
    console.error('gemini proxy auth error:', err?.message ?? err);
    return res.status(401).json({ error: 'Invalid or expired ID token' });
  }

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
