/**
 * api/claude.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel serverless function — Claude API proxy.
 * Place this file at the root of your BeWatu_V3 repo as api/claude.js
 * Vercel will expose it at https://www.bewatu.com/api/claude
 *
 * Add to Vercel dashboard → Settings → Environment Variables:
 *   ANTHROPIC_API_KEY = sk-ant-...
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// P1 (cost-abuse / input validation): this endpoint proxies to a paid
// Anthropic model and had NO authentication at all — the CORS header
// above only restricts which origins a *browser* will let read the
// response, it does nothing to stop a direct curl/script call. Anyone
// on the internet could hit this endpoint indefinitely and spend
// BeWatu's Anthropic budget with no cap. Now requires a valid Firebase
// ID token, same pattern as factory-token.ts.
//
// P0 7 (least privilege): this only ever calls verifyIdToken — it never
// touches Firestore/Storage — so it should run on an Auth-only service
// account, not the shared full-access key every other function uses.
// Falls back to the shared key until the scoped one is provisioned.
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? process.env.FIREBASE_SERVICE_ACCOUNT
  );
  return initializeApp({ credential: cert(serviceAccount) });
}

// Highest maxTokens any real caller in this codebase asks for is 2000
// (services/claudeService.ts's JSON-generating calls) — 2500 leaves
// headroom without leaving the cap effectively unbounded.
const MAX_TOKENS_CEILING = 2500;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    await getAuth(getAdminApp()).verifyIdToken(authHeader.slice('Bearer '.length));
  } catch (err) {
    console.error('claude proxy auth error:', err?.message ?? err);
    return res.status(401).json({ error: 'Invalid or expired ID token' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { system, prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const requestedTokens = Number((req.body ?? {}).maxTokens);
  const maxTokens = Number.isFinite(requestedTokens) && requestedTokens > 0
    ? Math.min(Math.floor(requestedTokens), MAX_TOKENS_CEILING)
    : 500;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system:     typeof system === 'string' ? system : 'You are a concise career intelligence assistant for BeWatu.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    return res.json({ text: data.content?.[0]?.text ?? '' });

  } catch (err) {
    console.error('Claude proxy error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
