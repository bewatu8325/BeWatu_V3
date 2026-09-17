/**
 * api/cosentiment-teaser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel serverless endpoint — fetches CoSentiment teaser score for a company
 * domain.
 *
 * Caching strategy:
 *   - Check Firestore `cosentiment_cache/{domain}` first
 *   - If cached and < 24 hours old, return cached data immediately
 *   - Otherwise fetch from CoSentiment API and cache the result
 *   - If CoSentiment returns no data, cache the null result for 1 hour
 *     (to avoid hammering their API for unknown companies)
 *
 * Usage:
 *   GET /api/cosentiment-teaser?domain=apple.com
 *
 * Launch-readiness review, P1 rate-limiting/auth sweep — two real bugs found
 * here, not one:
 *
 * 1. No authentication at all. The cache is keyed per-domain, so a caller
 *    could hit a fresh, never-seen domain on every request and bypass it
 *    entirely, burning through the CoSentiment API budget indefinitely —
 *    same class of bug already fixed for api/claude.js/gemini.ts/
 *    skills-trajectory.ts, missed in that pass. The only real caller
 *    (CompanyProfileModal.tsx, rendered exclusively from App.tsx's
 *    authenticated shell — confirmed not reachable from any logged-out
 *    page) always has a signed-in user, so requiring one here doesn't break
 *    anything real.
 *
 * 2. The cache itself never actually worked. This file used to run on the
 *    Edge runtime and talk to Firestore over plain REST with only a Web API
 *    key (no service-account credential) — that path is NOT an Admin SDK
 *    bypass, it's subject to firestore.rules exactly like a real client
 *    call, and no rule exists for cosentiment_cache at all. Confirmed
 *    empirically: the identical REST call against production returns
 *    `403 PERMISSION_DENIED`. Every read/write silently failed and was
 *    swallowed by this file's own catch blocks — every single call has
 *    been an unconditional cache MISS, hitting the live CoSentiment API
 *    every time regardless of repeat requests for the same domain. Moving
 *    to Node + firebase-admin/firestore (same Edge→Node tradeoff
 *    api/gemini.ts already made, for the same reason: Admin SDK needs
 *    Node) fixes this for real, since Admin SDK writes bypass rules
 *    entirely rather than needing a public one.
 *
 * Rate limit: auth alone stops a stranger, not a legitimate signed-in user
 * looping this to burn CoSentiment's budget on fresh domains. Capped
 * per-uid, same inline Firestore-doc sliding-window shape as
 * api/contact.ts / api/send-recruiter-otp.ts / api/verify-reel.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const COSENTIMENT_API     = 'https://www.cosentiment.com/api/bewatu';
const CACHE_TTL_MS        = 24 * 60 * 60 * 1000; // 24 hours for successful results
const EMPTY_CACHE_TTL_MS  =  1 * 60 * 60 * 1000; // 1 hour for null results

const MIN_INTERVAL_MS = 2 * 1000;        // 2s between requests per uid
const WINDOW_MS       = 60 * 60 * 1000;  // rolling 1-hour window
const MAX_PER_WINDOW  = 60;              // generous for real browsing, caps abuse

function getAdmin() {
  if (!getApps().length) {
    // P0 7 (least privilege): only ever reads/writes cosentiment_cache and
    // this endpoint's own rate-limit doc, plus verifyIdToken (read-only
    // against Auth) — no Auth-admin writes, no Cloud Functions calls.
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

async function getCachedTeaser(db: FirebaseFirestore.Firestore, docKey: string): Promise<{ data: any; cachedAt: number } | null> {
  const snap = await db.doc(`cosentiment_cache/${docKey}`).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { data: d.data !== undefined ? JSON.parse(d.data) : null, cachedAt: d.cachedAt ?? 0 };
}

async function setCachedTeaser(db: FirebaseFirestore.Firestore, docKey: string, domain: string, data: any): Promise<void> {
  await db.doc(`cosentiment_cache/${docKey}`).set({
    domain,
    data:     JSON.stringify(data),
    cachedAt: Date.now(),
    hasData:  data !== null && data?.teaser?.has_data === true,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { db, auth } = getAdmin();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }
  let callerUid: string;
  try {
    callerUid = (await auth.verifyIdToken(authHeader.slice(7))).uid;
  } catch {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }

  const rateLimitRef = db.doc(`cosentiment_rate_limits/${callerUid}`);
  const now = Date.now();
  const rl = (await rateLimitRef.get()).data() as
    | { sendCount?: number; windowStart?: number; lastSentAt?: number }
    | undefined;
  if (rl?.lastSentAt && now - rl.lastSentAt < MIN_INTERVAL_MS) {
    return res.status(429).json({ error: 'Too many requests — please slow down.' });
  }
  const windowStart = rl?.windowStart && now - rl.windowStart < WINDOW_MS ? rl.windowStart : now;
  const sendCount    = windowStart === rl?.windowStart ? (rl?.sendCount ?? 0) : 0;
  if (sendCount >= MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests this hour — please try again later.' });
  }
  await rateLimitRef.set({
    lastSentAt: now, windowStart, sendCount: sendCount + 1,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const domain = String(req.query.domain ?? '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!domain) {
    return res.status(400).json({ error: 'domain is required' });
  }

  // P1 (input validation): domain was passed straight through into a
  // Firestore document ID and a URL path segment with only a dot->underscore
  // swap, no real format check. Real domains are letters/digits/hyphens/dots
  // only.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain) || domain.length > 253) {
    return res.status(400).json({ error: 'domain is not a valid hostname' });
  }

  const apiKey = process.env.COSENTIMENT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CoSentiment API key not configured' });
  }

  const docKey = domain.replace(/\./g, '_'); // Firestore keys can't contain dots

  // ── Check cache ─────────────────────────────────────────────────────────────
  try {
    const cached = await getCachedTeaser(db, docKey);
    if (cached) {
      const age = Date.now() - cached.cachedAt;
      const ttl = cached.data !== null ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;
      if (age < ttl) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Age', String(Math.round(age / 1000)));
        return res.status(200).json(cached.data);
      }
    }
  } catch {
    // Cache read failure — proceed to fetch from API
  }

  // ── Fetch from CoSentiment ──────────────────────────────────────────────────
  try {
    const apiRes = await fetch(`${COSENTIMENT_API}/score/${encodeURIComponent(domain)}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-bewatu-api-key': apiKey,
      },
    });

    const data = apiRes.ok ? await apiRes.json() : null;

    // Cache the result (fire and forget)
    setCachedTeaser(db, docKey, domain, data).catch(() => {});

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    console.error('CoSentiment fetch error:', err);
    // CoSentiment is additive, never blocking — 200 with null, not an error.
    return res.status(200).json(null);
  }
}
