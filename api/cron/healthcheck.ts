/**
 * api/cron/healthcheck.ts
 * GET /api/cron/healthcheck        (Vercel Cron, every 5 minutes; Authorization: Bearer $CRON_SECRET)
 * ────────────────────────────────────────────────────────────
 * Uptime monitoring that emails an operator, and leaves a heartbeat for an OUTSIDE watcher (api/health.ts).
 *
 * What it checks, from outside the app the way a member reaches it:
 *   - the site answers                                             (GET /)
 *   - the sign-in page route is served                             (GET /auth/action, a rewrite to the app)
 *   - three token-gated routes load and refuse a stranger cleanly  (POST, expect 401: a crash shows as 500)
 *   - a public route that needs the database AND its secret works  (invitation preview of a made-up link: expect 404 "invalid";
 *                                                                   a missing secret or dead database shows as 503)
 *   - Firebase Auth is reachable with the app's own key            (a sign-in with a made-up account: expect a clean refusal;
 *                                                                   a bad key, outage or block shows as something else)
 *   - the server can read Firestore with its service account       (the same identity every function uses)
 *
 * What changed from the first version, and why (found in an audit):
 *   - Alerts are sent BEFORE anything depends on Firestore. It used to read its state from Firestore first, so a Firestore or
 *     service-account outage crashed it before it could email anyone: silent exactly when it mattered.
 *   - An alert counts as sent only if it was. A failed email used to be recorded as delivered and suppressed for 30 minutes.
 *   - An alert-channel failure turns the run red (503) and is shown on /api/health.
 *   - Every run stamps a heartbeat. api/health.ts serves it, and a watcher OUTSIDE Vercel (GitHub Actions in bewatu-security)
 *     alarms if it goes quiet, so "the monitor stopped running" is itself detected.
 *
 * Env: CRON_SECRET, RESEND_API_KEY, UPTIME_ALERT_EMAIL (or SECURITY_ALERT_EMAIL), FIREBASE_SERVICE_ACCOUNT_APP_SERVER,
 *      VITE_FIREBASE_API_KEY (optional here: without it the Auth probe says it was skipped instead of passing).
 * ────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';

export const SITE_ORIGIN = 'https://www.bewatu.com';
export const ALERT_COOLDOWN_MS = 30 * 60 * 1000;   // one alert per failing check per 30 min
export const FETCH_TIMEOUT_MS = 10_000;
export const AUTH_GATED_ROUTES = ['/api/factory-token', '/api/recruiter-analytics', '/api/ai'];
const FAKE_INVITE = 'AAAAAAAAAAAAAAAA.' + 'B'.repeat(22);   // well-formed, signed by nobody
const STATE = { collection: '_ops_internal', doc: 'uptime_state' };

export interface Probe { name: string; url: string; ok: boolean; detail: string; skipped?: boolean }
export interface Deps {
  now: number;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  env: Record<string, string | undefined>;
  /** Firestore, or null when it cannot even be opened. */
  db: Firestore | null;
  /** Sends an alert; true only if it was really delivered to the provider. */
  send: (subject: string, html: string) => Promise<boolean>;
}

async function timed(d: Deps, url: string, init?: RequestInit): Promise<Response> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
  try { return await d.fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}
const net = (e: unknown) => `network error: ${(e as Error)?.message ?? 'unknown'}`;

export async function runProbes(d: Deps): Promise<Probe[]> {
  const out: Promise<Probe>[] = [];
  out.push((async (): Promise<Probe> => { const url = `${SITE_ORIGIN}/`; try { const r = await timed(d, url); return { name: 'site-root', url, ok: r.ok, detail: `HTTP ${r.status}` }; } catch (e) { return { name: 'site-root', url, ok: false, detail: net(e) }; } })());
  out.push((async (): Promise<Probe> => { const url = `${SITE_ORIGIN}/auth/action`; try { const r = await timed(d, url); return { name: '/auth/action', url, ok: r.status === 200, detail: `HTTP ${r.status} (expected 200)` }; } catch (e) { return { name: '/auth/action', url, ok: false, detail: net(e) }; } })());
  for (const path of AUTH_GATED_ROUTES) out.push((async (): Promise<Probe> => { const url = `${SITE_ORIGIN}${path}`; try { const r = await timed(d, url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return { name: path, url, ok: r.status === 401, detail: `HTTP ${r.status} (expected 401)` }; } catch (e) { return { name: path, url, ok: false, detail: net(e) }; } })());
  out.push((async (): Promise<Probe> => {
    const url = `${SITE_ORIGIN}/api/invitations?token=${FAKE_INVITE}`;
    try { const r = await timed(d, url); let state = ''; try { state = (await r.json())?.state ?? ''; } catch { /* not json */ } return { name: '/api/invitations (database + secret)', url, ok: r.status === 404 && state === 'invalid', detail: `HTTP ${r.status}${state ? ` state=${state}` : ''} (expected 404 invalid)` }; }
    catch (e) { return { name: '/api/invitations (database + secret)', url, ok: false, detail: net(e) }; }
  })());
  out.push((async (): Promise<Probe> => {
    const key = d.env.VITE_FIREBASE_API_KEY; const name = 'firebase-auth sign-in';
    if (!key) return { name, url: 'identitytoolkit.googleapis.com', ok: true, skipped: true, detail: 'SKIPPED: VITE_FIREBASE_API_KEY is not available to functions, so Firebase Auth is not being probed' };
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`;
    try {
      const r = await timed(d, url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'uptime-probe-nobody@example.invalid', password: 'not-a-real-password', returnSecureToken: false }) });
      let msg = ''; try { msg = String((await r.json())?.error?.message ?? ''); } catch { /* not json */ }
      return { name, url: 'identitytoolkit.googleapis.com', ok: r.status === 400 && /EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/.test(msg), detail: `HTTP ${r.status} ${msg} (expected a clean refusal)` };
    } catch (e) { return { name, url: 'identitytoolkit.googleapis.com', ok: false, detail: net(e) }; }
  })());
  return Promise.all(out);
}

const failingSubject = (n: string) => `🔴 BeWatu health check failing: ${n}`;
export interface Outcome { status: 200 | 503; results: Probe[]; alertFailed: boolean; stateOk: boolean }

/** One run: probe, alert (before anything needs Firestore), then record state and the heartbeat. */
export async function runHealthcheck(d: Deps): Promise<Outcome> {
  const results = await runProbes(d);
  const ref = d.db ? d.db.collection(STATE.collection).doc(STATE.doc) : null;

  // Firestore is both a thing we check and where we keep our notes. If it is down we still alert, just without memory of the past.
  let state: Record<string, any> = {}, stateOk = true;
  try { if (!ref) throw new Error('no Firestore'); state = (await ref.get()).data() ?? {}; } catch (e) { stateOk = false; console.error('healthcheck: cannot read state:', (e as Error)?.message); }
  if (!stateOk) results.push({ name: 'firestore (server read)', url: 'firestore.googleapis.com', ok: false, detail: 'the server could not read its own state document from Firestore' });
  else results.push({ name: 'firestore (server read)', url: 'firestore.googleapis.com', ok: true, detail: 'read ok' });

  const updates: Record<string, unknown> = {};
  let alertFailed = false, attempted = false;
  for (const r of results) {
    const prior = state[r.name] as { failingSince?: number; lastAlertedAt?: number | null } | undefined;
    if (!r.ok) {
      const failingSince = prior?.failingSince ?? d.now;
      const due = !prior?.lastAlertedAt || d.now - prior.lastAlertedAt >= ALERT_COOLDOWN_MS;
      let sent = false;
      if (due) {
        attempted = true;
        sent = await d.send(failingSubject(r.name), `<p><strong>${r.name}</strong> (${r.url}) is failing.</p><p>${r.detail}</p><p>Failing since: ${new Date(failingSince).toISOString()}</p>`);
        if (!sent) alertFailed = true;
      }
      // Stamp "alerted" only if the email really went; otherwise the next run (5 minutes on) tries again.
      updates[r.name] = { failingSince, lastAlertedAt: due ? (sent ? d.now : (prior?.lastAlertedAt ?? null)) : (prior?.lastAlertedAt ?? null) };
    } else if (prior?.failingSince) {
      attempted = true;
      const sent = await d.send(`✅ BeWatu health check recovered: ${r.name}`, `<p><strong>${r.name}</strong> (${r.url}) is passing again.</p><p>Was failing since: ${new Date(prior.failingSince).toISOString()}</p>`);
      if (sent) updates[r.name] = FieldValue.delete(); else alertFailed = true;   // keep the note so the recovery notice is retried
    }
  }
  const allOk = results.every(r => r.ok);
  updates.lastRunAt = d.now; updates.lastRunOk = allOk;
  if (attempted) { updates.alertChannelOk = !alertFailed; updates.alertChannelCheckedAt = d.now; }
  if (ref) { try { await ref.set(updates, { merge: true }); } catch (e) { stateOk = false; console.error('healthcheck: cannot write state:', (e as Error)?.message); } }

  return { status: allOk && stateOk && !alertFailed ? 200 : 503, results, alertFailed, stateOk };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function safeEqual(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function openDb(): Firestore | null {
  try {
    if (!getApps().length) {
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!sa) return null;
      initializeApp({ credential: cert(JSON.parse(sa)) });
    }
    return getFirestore();
  } catch (e) { console.error('healthcheck: cannot open Firestore:', (e as Error)?.message); return null; }
}
async function sendViaResend(subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('healthcheck: RESEND_API_KEY is not set, so alerts cannot be sent'); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: 'BeWatu Uptime Monitor <noreply@bewatu.com>', to: [process.env.UPTIME_ALERT_EMAIL || process.env.SECURITY_ALERT_EMAIL || 'support@bewatu.com'], subject, html }),
    });
    if (!r.ok) console.error('healthcheck: Resend refused the alert:', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error('healthcheck: Resend unreachable:', (e as Error)?.message); return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const h = req.headers['authorization'];
  if (typeof h !== 'string' || !h.startsWith('Bearer ') || !safeEqual(h.slice(7), process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  const out = await runHealthcheck({ now: Date.now(), fetch: (u, i) => fetch(u, i), env: process.env, db: openDb(), send: sendViaResend });
  return res.status(out.status).json({ results: out.results, alertFailed: out.alertFailed, stateOk: out.stateOk });
}
