/**
 * api/algolia-search-key.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mints a short-lived Algolia secured API key for the caller, once they've
 * proven they're a real signed-in BeWatu user.
 *
 * Why this exists: the People directory (users) and Jobs board indices are
 * synced from Firestore collections that firestore.rules already lets any
 * signed-in user read in full (`allow read: if isAuth()` / equivalent) — so
 * search itself needs no per-record filtering. What it does need is the same
 * boundary the app already has everywhere else: no anonymous internet caller
 * should be able to search (or enumerate) either index. A bare Algolia
 * search-only key shipped in the JS bundle can't enforce that — anyone could
 * pull it out of the bundle and query Algolia directly, with no BeWatu
 * session at all. Minting a secured key per-request, only after verifying a
 * real Firebase ID token, closes that gap: the key itself expires in
 * minutes, and getting one at all already proves the caller is
 * authenticated.
 *
 * Node runtime (not Edge): Algolia's generateSecuredApiKey helper is only
 * exposed on the Node build of the JS client — confirmed by trying the Edge
 * build first, where the method isn't on the returned client's type at all.
 * jose (for token verification below) works identically in both runtimes, so
 * nothing about the verification itself changes moving to Node.
 *
 * Verifies the token via jose's createRemoteJWKSet/jwtVerify against
 * Google's real JWKS — the same pattern already used in
 * api/create-subscription.ts (there, on the Edge runtime; here, on Node,
 * since jose has no runtime-specific dependencies either way).
 *
 * Required env vars (set in Vercel):
 *   ALGOLIA_APP_ID          — Algolia application ID
 *   ALGOLIA_SEARCH_API_KEY  — a restricted, search-only Algolia API key
 *     (ACL: search only — never the Admin key). Secured keys are generated
 *     FROM this key, so its own ACL ceiling matters: keep it search-only so
 *     a bug here can never do more than search.
 *
 * POST /api/algolia-search-key
 *   Headers: Authorization: Bearer <Firebase ID token>
 *   Returns: { appId: string, apiKey: string, validUntil: number }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { algoliasearch } from 'algoliasearch';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const KEY_TTL_SECONDS = 5 * 60; // 5 minutes — short-lived on purpose

// generateSecuredApiKey is a real method on the Node build of this client at
// runtime (this file runs under real Node.js on Vercel) — but this project's
// tsconfig uses moduleResolution: "bundler", which resolves the package's
// `exports` map to the browser build for type-checking purposes only, so TS
// can't see the method here. A type-only gap, not a runtime one.
type AlgoliaClientWithSecuredKey = ReturnType<typeof algoliasearch> & {
  generateSecuredApiKey: (opts: {
    parentApiKey: string;
    restrictions?: { validUntil?: number; userToken?: string };
  }) => string;
};

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

async function verifyCaller(req: VercelRequest): Promise<string> {
  const authHeader = req.headers.authorization ?? '';
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) throw new Error('Missing bearer token');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Server configuration error: missing FIREBASE_PROJECT_ID');

  const { payload } = await jwtVerify(match[1], GOOGLE_JWKS, {
    issuer:   `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub) throw new Error('Token has no subject');
  return payload.sub;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let uid: string;
  try {
    uid = await verifyCaller(req);
  } catch (err: any) {
    return res.status(401).json({ error: `Unauthorized: ${err.message ?? 'invalid token'}` });
  }

  const appId     = process.env.ALGOLIA_APP_ID;
  const parentKey = process.env.ALGOLIA_SEARCH_API_KEY;
  if (!appId || !parentKey) {
    return res.status(500).json({ error: 'Server configuration error: missing Algolia credentials' });
  }

  const validUntil = Math.floor(Date.now() / 1000) + KEY_TTL_SECONDS;
  const client = algoliasearch(appId, parentKey) as AlgoliaClientWithSecuredKey;
  const apiKey = client.generateSecuredApiKey({
    parentApiKey: parentKey,
    restrictions: {
      validUntil,
      // Tags every search this key makes with the caller's uid — shows up in
      // Algolia's own analytics/logs, useful for abuse investigation without
      // needing a separate audit log.
      userToken: uid,
    },
  });

  return res.status(200).json({ appId, apiKey, validUntil });
}
