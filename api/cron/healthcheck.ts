/**
 * api/cron/healthcheck.ts
 * GET /api/cron/healthcheck
 * ─────────────────────────────────────────────────────────────────────────────
 * Uptime monitoring — this app had none. Sentry (once its DSN is set) reports
 * an error the moment a real request hits a broken endpoint, but nothing
 * ever probed the app on a schedule to catch an outage with zero traffic, or
 * a crash on a route real users rarely hit.
 *
 * Triggered by Vercel Cron (see the "crons" entry in vercel.json). Vercel
 * attaches `Authorization: Bearer $CRON_SECRET` to cron-triggered requests
 * when CRON_SECRET is set on the project — same fail-closed shared-secret
 * pattern already used for api/ops/migrate-circles-to-pods.ts, just Vercel's
 * own convention for this trigger instead of a custom header.
 *
 * Checks:
 *   1. The site itself responds (GET /).
 *   2. A handful of Firebase-ID-token-gated API routes return a clean 401
 *      for an unauthenticated call, instead of crashing. This is deliberate,
 *      not incidental: the exact incident this review's own report documents
 *      (a jwks-rsa/jose ESM bundling bug that made api/factory-token.ts and
 *      api/recruiter-analytics.ts crash with FUNCTION_INVOCATION_FAILED for
 *      some unknown period before anyone noticed) is precisely the failure
 *      mode an unauthenticated probe against these same routes would have
 *      caught immediately instead of by chance.
 *
 * On failure: sends one alert email via Resend (same provider/pattern as
 * api/contact.ts), then suppresses repeat alerts for the same check for
 * ALERT_COOLDOWN_MS so an ongoing outage doesn't spam the inbox once per
 * cron tick — state tracked in Firestore (`_ops_internal/uptime_state`,
 * Admin-SDK-only, no client rules needed). Sends a one-time "recovered"
 * email when a previously-failing check passes again.
 *
 * Required env vars:
 *   CRON_SECRET                          — set in Vercel; must match what
 *                                           Vercel's own Cron trigger sends
 *   RESEND_API_KEY                       — already configured
 *   UPTIME_ALERT_EMAIL                   — where alerts go (falls back to
 *                                           the confirmed contact inbox)
 *   FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const SITE_ORIGIN     = 'https://www.bewatu.com';
const RESEND_API_KEY  = process.env.RESEND_API_KEY!;
const ALERT_EMAIL     = process.env.UPTIME_ALERT_EMAIL || 'contact@abideus.com';
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // one alert per failing check per 30 min
const FETCH_TIMEOUT_MS  = 10_000;

interface CheckResult {
  name: string;
  url: string;
  ok: boolean;
  detail: string;
}

function initAdmin() {
  if (!getApps().length) {
    // P0 7 (least privilege): Firestore-only, reads/writes only
    // `_ops_internal/uptime_state`.
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkSiteUp(): Promise<CheckResult> {
  const url = `${SITE_ORIGIN}/`;
  try {
    const r = await fetchWithTimeout(url);
    return { name: 'site-root', url, ok: r.ok, detail: `HTTP ${r.status}` };
  } catch (err) {
    return { name: 'site-root', url, ok: false, detail: `network error: ${(err as Error).message}` };
  }
}

// These routes require a valid Firebase ID token. A clean 401 with no token
// proves the function loaded and ran its auth check; anything else (a 500,
// a timeout, a non-401 4xx) means the function itself is broken, not just
// "correctly rejecting an unauthenticated caller".
const AUTH_GATED_ROUTES = ['/api/factory-token', '/api/recruiter-analytics', '/api/claude'];

async function checkAuthGatedRoute(path: string): Promise<CheckResult> {
  const url = `${SITE_ORIGIN}${path}`;
  try {
    const r = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { name: path, url, ok: r.status === 401, detail: `HTTP ${r.status} (expected 401)` };
  } catch (err) {
    return { name: path, url, ok: false, detail: `network error: ${(err as Error).message}` };
  }
}

async function sendAlertEmail(subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'BeWatu Uptime Monitor <noreply@bewatu.com>',
      to: [ALERT_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error('Resend error sending uptime alert:', await res.text());
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers['authorization'];
  if (!process.env.CRON_SECRET || token !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = await Promise.all([
    checkSiteUp(),
    ...AUTH_GATED_ROUTES.map(checkAuthGatedRoute),
  ]);

  const db = initAdmin();
  const stateRef = db.collection('_ops_internal').doc('uptime_state');
  const stateSnap = await stateRef.get();
  const state = (stateSnap.data() ?? {}) as Record<string, { failingSince?: number; lastAlertedAt?: number }>;

  const now = Date.now();
  const updates: Record<string, unknown> = {};

  for (const result of results) {
    const prior = state[result.name];

    if (!result.ok) {
      const failingSince = prior?.failingSince ?? now;
      const shouldAlert = !prior?.lastAlertedAt || now - prior.lastAlertedAt >= ALERT_COOLDOWN_MS;
      if (shouldAlert) {
        await sendAlertEmail(
          `🔴 BeWatu health check failing: ${result.name}`,
          `<p><strong>${result.name}</strong> (${result.url}) is failing.</p><p>${result.detail}</p><p>Failing since: ${new Date(failingSince).toISOString()}</p>`
        );
      }
      updates[result.name] = {
        failingSince,
        lastAlertedAt: shouldAlert ? now : (prior?.lastAlertedAt ?? now),
      };
    } else if (prior?.failingSince) {
      // Was failing, now passing — send one recovery email and clear state.
      await sendAlertEmail(
        `✅ BeWatu health check recovered: ${result.name}`,
        `<p><strong>${result.name}</strong> (${result.url}) is passing again.</p><p>Was failing since: ${new Date(prior.failingSince).toISOString()}</p>`
      );
      updates[result.name] = FieldValue.delete();
    }
  }

  if (Object.keys(updates).length > 0) {
    await stateRef.set(updates, { merge: true });
  }

  const allOk = results.every(r => r.ok);
  return res.status(allOk ? 200 : 503).json({ results });
}
