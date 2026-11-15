/**
 * api/cron/healthcheck.ts
 * GET /api/cron/healthcheck        (Vercel Cron, every 5 minutes; Authorization: Bearer $CRON_SECRET)
 * ────────────────────────────────────────────────────────────
 * The uptime and tripwire monitor. It emails an operator (and optionally pings a phone or chat channel), and leaves a heartbeat
 * for an OUTSIDE watcher (api/health.ts, polled by a GitHub Actions job in bewatu-security).
 *
 * STATES it reports (a check is failing until it passes, then a recovery notice is sent):
 *   - the site answers; the sign-in route is served; three token-gated routes load and refuse a stranger (401, a crash is 500)
 *   - a public route that needs the database AND its secret works (invitation preview of a made-up link: 404 "invalid")
 *   - Firebase Auth is reachable with the app's own key; the server can read Firestore with its service account
 *   - LOGIN JOURNEY (optional): a dedicated probe account signs in and calls a protected API. Needs UPTIME_PROBE_EMAIL and
 *     UPTIME_PROBE_PASSWORD; without them it says SKIPPED rather than passing.
 *   - DELETIONS: member data does not suddenly shrink. Document counts of the important collections are sampled every run;
 *     a big drop over 5 minutes or an hour is a failure. This sees deletes from ANY source (browser, admin, console), which a
 *     server-log sensor cannot. A deliberate purge will trip it once and clears when the window passes.
 *   - SCHEDULED JOBS: each daily job stamps a heartbeat; one that has not run in 26 hours is a failure.
 * EVENTS it announces once (not a state): a change to who has privileged (ops staff) access.
 *
 * Why it is built this way (an audit found the first version silent when it mattered):
 *   - Alerts go out BEFORE anything depends on Firestore; Firestore being unreadable is itself an alert.
 *   - An alert counts as sent only if it was; otherwise the next run (5 minutes on) retries, and the run turns red.
 *   - Every run stamps a heartbeat so "the monitor stopped" is detected from outside.
 *
 * ALERT DRILL: set UPTIME_DRILL_UNTIL to an ISO time (see docs/alert-drill.md). A time that is past, unreadable or more than
 * 2 hours away is ignored, so a typo can never leave a drill running.
 *
 * Env: CRON_SECRET, RESEND_API_KEY, UPTIME_ALERT_EMAIL (or SECURITY_ALERT_EMAIL), FIREBASE_SERVICE_ACCOUNT_APP_SERVER,
 *      VITE_FIREBASE_API_KEY (optional: without it the Auth and login probes say SKIPPED),
 *      ALERT_WEBHOOK_URL + ALERT_WEBHOOK_FORMAT (optional second channel: slack | discord | ntfy),
 *      UPTIME_PROBE_EMAIL + UPTIME_PROBE_PASSWORD (optional login probe), UPTIME_DRILL_UNTIL (only during a drill).
 * ────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';

// ── how an alert leaves the building ─────────────────────────────────────────
// One copy per route that raises alerts (api/ routes cannot import each other); test/monitor-depth fails if a copy differs.
// <alert-sender>
/** Email (Resend) and, if ALERT_WEBHOOK_URL is set, a second channel (slack | discord | ntfy). True if ANY channel delivered. */
export async function sendAlert(env: Record<string, string | undefined>, subject: string, text: string): Promise<boolean> {
  let delivered = false;
  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: 'BeWatu Alerts <noreply@bewatu.com>', to: [env.SECURITY_ALERT_EMAIL || env.UPTIME_ALERT_EMAIL || 'support@bewatu.com'], subject, text }),
      });
      if (r.ok) delivered = true; else console.error('alert email refused by Resend:', r.status, await r.text());
    } catch (e: any) { console.error('alert email failed:', e?.message); }
  } else console.error('alert email not sent: RESEND_API_KEY is not set');
  const hook = env.ALERT_WEBHOOK_URL;
  if (hook && /^https:\/\//i.test(hook)) {
    try {
      const fmt = (env.ALERT_WEBHOOK_FORMAT || 'slack').toLowerCase();
      const init: RequestInit = fmt === 'ntfy'
        ? { method: 'POST', headers: { Title: subject.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 120) || 'BeWatu alert', Priority: 'high' }, body: text.slice(0, 3500) }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fmt === 'discord' ? { content: `**${subject}**\n${text}`.slice(0, 1900) } : { text: `*${subject}*\n${text}`.slice(0, 3500) }) };
      const r = await fetch(hook, { ...init, signal: AbortSignal.timeout(8000) });
      if (r.ok) delivered = true; else console.error('alert webhook refused:', r.status);
    } catch (e: any) { console.error('alert webhook failed:', e?.message); }
  }
  return delivered;
}
// </alert-sender>

export const SITE_ORIGIN = 'https://www.bewatu.com';
export const ALERT_COOLDOWN_MS = 30 * 60 * 1000;   // one alert per failing check per 30 min
export const FETCH_TIMEOUT_MS = 10_000;
export const AUTH_GATED_ROUTES = ['/api/factory-token', '/api/recruiter-analytics', '/api/ai'];
const FAKE_INVITE = 'AAAAAAAAAAAAAAAA.' + 'B'.repeat(22);   // well-formed, signed by nobody
const STATE = { collection: '_ops_internal', doc: 'uptime_state' };
const MIN = 60_000, HOUR = 3_600_000;

export interface Probe { name: string; url: string; ok: boolean; detail: string; skipped?: boolean }
export interface Deps {
  now: number;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  env: Record<string, string | undefined>;
  /** Firestore, or null when it cannot even be opened. */
  db: Firestore | null;
  /** Sends an alert; true only if at least one channel really delivered it. */
  send: (subject: string, body: string) => Promise<boolean>;
}

async function timed(d: Deps, url: string, init?: RequestInit): Promise<Response> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
  try { return await d.fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}
const net = (e: unknown) => `network error: ${(e as Error)?.message ?? 'unknown'}`;

// ── probes that need only the network ────────────────────────────────────────
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
  out.push(loginJourneyProbe(d));
  return Promise.all(out);
}

/** A real sign-in with a dedicated probe account, then one protected API call: proves Auth + token check + API + database together. */
export async function loginJourneyProbe(d: Deps): Promise<Probe> {
  const name = 'login journey (probe account)';
  const { VITE_FIREBASE_API_KEY: key, UPTIME_PROBE_EMAIL: email, UPTIME_PROBE_PASSWORD: password } = d.env;
  if (!key || !email || !password) return { name, url: 'sign-in then /api/investor-membership', ok: true, skipped: true, detail: 'SKIPPED: UPTIME_PROBE_EMAIL / UPTIME_PROBE_PASSWORD are not set, so the full login journey is not being probed' };
  try {
    const s = await timed(d, `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const body = await s.json().catch(() => ({} as any));
    if (!s.ok || !body?.idToken) return { name, url: 'sign-in', ok: false, detail: `the probe account could not sign in: HTTP ${s.status} ${String(body?.error?.message ?? '').slice(0, 60)}` };
    const r = await timed(d, `${SITE_ORIGIN}/api/investor-membership`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.idToken}` }, body: JSON.stringify({ action: 'state' }) });
    return { name, url: `${SITE_ORIGIN}/api/investor-membership`, ok: r.status === 200, detail: `signed in, then a protected API answered HTTP ${r.status} (expected 200)` };
  } catch (e) { return { name, url: 'login journey', ok: false, detail: net(e) }; }
}

// ── tripwire: member data must not suddenly shrink ───────────────────────────
export const WATCHED_COLLECTIONS = ['users', 'posts', 'messages', 'connections', 'pods', 'circles', 'reels', 'companies', 'jobs', 'support_tickets', 'bridge_talks'];
export const COUNT_WINDOWS = [
  { label: '5 minutes', ms: 6 * MIN, minDrop: 10, minRatio: 0.10, absDrop: 500 },     // a burst
  { label: '1 hour',    ms: 65 * MIN, minDrop: 25, minRatio: 0.15, absDrop: 2000 },    // a slow drain
];
export const COUNT_SAMPLES_KEPT = 16;
export interface CountSample { at: number; counts: Record<string, number> }
export interface Drop { collection: string; window: string; from: number; to: number; drop: number }

/** Compare the current counts with the biggest count seen inside each window. A collection must lose BOTH enough documents and enough of itself. */
export function findDrops(samples: CountSample[], now: number, current: Record<string, number>): Drop[] {
  const found: Drop[] = [];
  for (const [collection, to] of Object.entries(current)) {
    for (const w of COUNT_WINDOWS) {
      const seen = samples.filter(s => now - s.at <= w.ms && typeof s.counts[collection] === 'number').map(s => s.counts[collection]);
      if (!seen.length) continue;
      const from = Math.max(...seen), drop = from - to;
      if (drop >= w.absDrop || (drop >= w.minDrop && drop >= from * w.minRatio)) { found.push({ collection, window: w.label, from, to, drop }); break; }   // the shorter window wins
    }
  }
  return found.sort((a, b) => b.drop - a.drop);
}

async function watchDeletions(d: Deps): Promise<Probe | null> {
  if (!d.db) return null;
  const name = 'firestore deletions (collection counts)';
  const ref = d.db.collection(STATE.collection).doc('collection_counts');
  const current: Record<string, number> = {}; const unreadable: string[] = [];
  await Promise.all(WATCHED_COLLECTIONS.map(async c => { try { current[c] = (await d.db!.collection(c).count().get()).data().count; } catch { unreadable.push(c); } }));
  if (!Object.keys(current).length) return { name, url: 'firestore.googleapis.com', ok: true, skipped: true, detail: `SKIPPED: could not count any collection (${unreadable.length} failed), so deletions are not being watched` };
  let samples: CountSample[] = [];
  try { samples = ((await ref.get()).data()?.samples as CountSample[] | undefined) ?? []; } catch { /* no history: baseline below */ }
  const drops = findDrops(samples, d.now, current);
  try { await ref.set({ samples: [...samples, { at: d.now, counts: current }].slice(-COUNT_SAMPLES_KEPT) }); } catch (e) { console.error('healthcheck: cannot store counts:', (e as Error)?.message); }
  if (!samples.length) return { name, url: 'firestore.googleapis.com', ok: true, detail: `baseline recorded for ${Object.keys(current).length} collections` };
  if (!drops.length) return { name, url: 'firestore.googleapis.com', ok: true, detail: `no unusual drop in ${Object.keys(current).length} collections${unreadable.length ? ` (${unreadable.length} not readable)` : ''}` };
  const top = drops.slice(0, 5).map(x => `${x.collection}: ${x.from} -> ${x.to} (-${x.drop}) within ${x.window}`).join('; ');
  return { name, url: 'firestore.googleapis.com', ok: false, detail: `Documents disappeared: ${top}. If someone did this on purpose (a purge, an account clean-up) it clears by itself once the window passes. If not, treat it as an incident: see the mass-deletion playbook.` };
}

// ── event: who has privileged access changed ─────────────────────────────────
export interface StaffEntry { role: string | null; isActive: boolean; email: string | null }
/** Human-readable lines for every change between two snapshots of ops_staff. Empty when nothing changed. */
export function diffStaff(prev: Record<string, StaffEntry>, cur: Record<string, StaffEntry>): string[] {
  const who = (id: string, e: StaffEntry) => `${e.email ?? 'no email'} (${id})`;
  const lines: string[] = [];
  for (const [id, e] of Object.entries(cur)) {
    const p = prev[id];
    if (!p) { lines.push(`ADDED ${who(id, e)} as ${e.role ?? 'no role'}, ${e.isActive ? 'active' : 'inactive'}`); continue; }
    if (p.role !== e.role) lines.push(`ROLE CHANGED ${who(id, e)}: ${p.role ?? 'none'} -> ${e.role ?? 'none'}`);
    if (p.isActive !== e.isActive) lines.push(`${e.isActive ? 'ACTIVATED' : 'DEACTIVATED'} ${who(id, e)}`);
  }
  for (const [id, p] of Object.entries(prev)) if (!(id in cur)) lines.push(`REMOVED ${who(id, p)} (was ${p.role ?? 'no role'})`);
  return lines;
}

async function watchPrivileged(d: Deps): Promise<void> {
  if (!d.db) return;
  try {
    const snap = await d.db.collection('ops_staff').limit(500).get();
    const cur: Record<string, StaffEntry> = {};
    for (const s of snap.docs) { const x = s.data(); cur[s.id] = { role: typeof x.role === 'string' ? x.role : null, isActive: x.isActive === true, email: typeof x.email === 'string' ? x.email : null }; }
    const ref = d.db.collection(STATE.collection).doc('privileged_snapshot');
    const prev = (await ref.get()).data()?.staff as Record<string, StaffEntry> | undefined;
    if (!prev) { await ref.set({ staff: cur, at: d.now }); return; }                        // first run: a baseline, not an alert
    const lines = diffStaff(prev, cur);
    if (!lines.length) return;
    const sent = await d.send(`🔐 BeWatu privileged access changed (${lines.length})`, `Ops staff access changed in the last few minutes:\n\n${lines.map(l => `- ${l}`).join('\n')}\n\nIf you did not do this, treat it as an incident: remove the access and rotate credentials. See the secret-leak playbook.`);
    if (sent) await ref.set({ staff: cur, at: d.now });                                      // an unsent notice is retried at the next run
  } catch (e) { console.error('healthcheck: privileged-access watch failed:', (e as Error)?.message); }
}

// ── scheduled jobs: each stamps `_ops_internal/cron_<name>` when it finishes ──
export const WATCHED_CRONS: { name: string; label: string; maxAgeMs: number }[] = [
  { name: 'invitations', label: 'invitations daily job', maxAgeMs: 26 * HOUR },
];
async function cronProbes(d: Deps, state: Record<string, any>, updates: Record<string, unknown>): Promise<Probe[]> {
  if (!d.db) return [];
  const out: Probe[] = [];
  const since: Record<string, number> = { ...(state.cronWatchSince ?? {}) };
  for (const c of WATCHED_CRONS) {
    const name = `scheduled job: ${c.label}`;
    try {
      const hb = (await d.db.collection(STATE.collection).doc(`cron_${c.name}`).get()).data();
      const last = typeof hb?.lastRunAt === 'number' ? hb.lastRunAt : null;
      if (last === null) {
        since[c.name] = since[c.name] ?? d.now;                                              // grace period: it may simply not have run yet
        const waited = d.now - since[c.name];
        out.push({ name, url: `cron_${c.name}`, ok: waited < c.maxAgeMs, detail: waited < c.maxAgeMs ? 'waiting for its first run' : `it has never reported a run in ${Math.round(waited / HOUR)} hours` });
      } else if (hb?.ok === false) out.push({ name, url: `cron_${c.name}`, ok: false, detail: `its last run (${new Date(last).toISOString()}) reported an error` });
      else out.push({ name, url: `cron_${c.name}`, ok: d.now - last <= c.maxAgeMs, detail: `last ran ${Math.round((d.now - last) / HOUR)} hours ago (allowed ${c.maxAgeMs / HOUR})` });
    } catch (e) { out.push({ name, url: `cron_${c.name}`, ok: false, detail: `could not read its heartbeat: ${(e as Error)?.message}` }); }
  }
  updates.cronWatchSince = since;
  return out;
}

// ── drill ────────────────────────────────────────────────────────────────────
export const DRILL_MAX_AHEAD_MS = 2 * HOUR;
export const DRILL_NAME = 'DRILL (planned test, not a real failure)';
/** One synthetic failure while a drill is running; nothing otherwise. A past, unreadable or too-far-ahead time is ignored. */
export function drillProbe(raw: string | undefined, now: number): Probe | null {
  if (!raw) return null;
  const until = Date.parse(raw);
  if (!Number.isFinite(until) || until <= now || until > now + DRILL_MAX_AHEAD_MS) return null;
  return { name: DRILL_NAME, url: 'planned alert drill', ok: false, detail: `A planned alert drill is running until ${new Date(until).toISOString()}. If you received this, alert delivery works. It will resolve by itself.` };
}

const failingSubject = (n: string) => `🔴 BeWatu health check failing: ${n}`;
export interface Outcome { status: 200 | 503; results: Probe[]; alertFailed: boolean; stateOk: boolean }

/** One run: probe, alert (before anything needs Firestore), then record state and the heartbeat. */
export async function runHealthcheck(d: Deps): Promise<Outcome> {
  const results = await runProbes(d);
  const drill = drillProbe(d.env.UPTIME_DRILL_UNTIL, d.now); if (drill) results.push(drill);
  const ref = d.db ? d.db.collection(STATE.collection).doc(STATE.doc) : null;

  // Firestore is both a thing we check and where we keep our notes. If it is down we still alert, just without memory of the past.
  let state: Record<string, any> = {}, stateOk = true;
  try { if (!ref) throw new Error('no Firestore'); state = (await ref.get()).data() ?? {}; } catch (e) { stateOk = false; console.error('healthcheck: cannot read state:', (e as Error)?.message); }
  results.push(stateOk ? { name: 'firestore (server read)', url: 'firestore.googleapis.com', ok: true, detail: 'read ok' } : { name: 'firestore (server read)', url: 'firestore.googleapis.com', ok: false, detail: 'the server could not read its own state document from Firestore' });

  const updates: Record<string, unknown> = {};
  if (stateOk) {
    const del = await watchDeletions(d); if (del) results.push(del);
    results.push(...await cronProbes(d, state, updates));
  }

  let alertFailed = false, attempted = false;
  for (const r of results) {
    const prior = state[r.name] as { failingSince?: number; lastAlertedAt?: number | null } | undefined;
    if (!r.ok) {
      const failingSince = prior?.failingSince ?? d.now;
      const due = !prior?.lastAlertedAt || d.now - prior.lastAlertedAt >= ALERT_COOLDOWN_MS;
      let sent = false;
      if (due) {
        attempted = true;
        sent = await d.send(failingSubject(r.name), `${r.name} (${r.url}) is failing.\n\n${r.detail}\n\nFailing since: ${new Date(failingSince).toISOString()}`);
        if (!sent) alertFailed = true;
      }
      // Stamp "alerted" only if the notice really went; otherwise the next run (5 minutes on) tries again.
      updates[r.name] = { failingSince, lastAlertedAt: due ? (sent ? d.now : (prior?.lastAlertedAt ?? null)) : (prior?.lastAlertedAt ?? null) };
    } else if (prior?.failingSince) {
      attempted = true;
      const sent = await d.send(`✅ BeWatu health check recovered: ${r.name}`, `${r.name} (${r.url}) is passing again.\n\nWas failing since: ${new Date(prior.failingSince).toISOString()}`);
      if (sent) updates[r.name] = FieldValue.delete(); else alertFailed = true;   // keep the note so the recovery notice is retried
    }
  }
  // A "failing" note whose check no longer reports at all (a drill that ended, a probe renamed or removed) is treated as recovered.
  const reported = new Set(results.map(r => r.name));
  for (const [name, v] of Object.entries(state)) {
    if (reported.has(name) || !v || typeof v !== 'object' || typeof (v as any).failingSince !== 'number') continue;
    attempted = true;
    const sent = await d.send(`✅ BeWatu health check recovered: ${name}`, `${name} is no longer being reported as failing (the check ended or was removed).\n\nWas failing since: ${new Date((v as any).failingSince).toISOString()}`);
    if (sent) updates[name] = FieldValue.delete(); else alertFailed = true;
  }

  if (stateOk) await watchPrivileged(d);

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const h = req.headers['authorization'];
  if (typeof h !== 'string' || !h.startsWith('Bearer ') || !safeEqual(h.slice(7), process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  const out = await runHealthcheck({ now: Date.now(), fetch: (u, i) => fetch(u, i), env: process.env, db: openDb(), send: (s, t) => sendAlert(process.env, s, t) });
  // The login probe only ever reports status codes, never the account's credentials.
  return res.status(out.status).json({ results: out.results, alertFailed: out.alertFailed, stateOk: out.stateOk });
}
