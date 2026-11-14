// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/healthcheck/run-tests.mjs"
// Guards the uptime monitor (api/cron/healthcheck.ts) and its heartbeat (api/health.ts):
//   - it alerts even when Firestore itself is down (it used to crash before sending anything)
//   - an alert counts as sent only if it was sent; a broken alert channel is itself visible
//   - a repeat is not re-sent inside the cooldown, a recovery is announced once, a failed recovery notice is retried
//   - it checks what a member depends on (database + secret, Firebase Auth, the sign-in route), not just that "/" answers
//   - the heartbeat says when the monitor has stopped, so a watcher outside Vercel can notice
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runHealthcheck, runProbes, ALERT_COOLDOWN_MS, SITE_ORIGIN } from '../../api/cron/healthcheck.ts';
import { evaluate, HEARTBEAT_MAX_AGE_MS } from '../../api/health.ts';

let pass = 0, fail = 0;
async function t(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-healthcheck' });
const db = getFirestore();
const stateRef = db.doc('_ops_internal/uptime_state');
const MIN = 60_000;
const T0 = 1_800_000_000_000;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// The world as it should be; a test overrides one answer at a time.
const world = (over = {}) => async url => {
  for (const [needle, answer] of Object.entries(over)) if (url.includes(needle)) { if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer() : answer; }
  if (url.includes('identitytoolkit')) return json(400, { error: { message: 'EMAIL_NOT_FOUND' } });
  if (url.includes('/api/invitations')) return json(404, { state: 'invalid' });
  if (/\/api\/(factory-token|recruiter-analytics|ai)$/.test(url)) return json(401, { error: 'Unauthorized' });
  return new Response('<html></html>', { status: 200 });
};
const mails = []; let mailOk = true;
const send = async (subject, html) => { if (!mailOk) return false; mails.push({ subject, html }); return true; };
const deps = (o = {}) => ({ now: o.now ?? T0, fetch: o.fetch ?? world(), env: o.env ?? { VITE_FIREBASE_API_KEY: 'k' }, db: o.db === undefined ? db : o.db, send: o.send ?? send });
const reset = async () => { await stateRef.delete(); mails.length = 0; mailOk = true; };
const state = async () => (await stateRef.get()).data() ?? {};

console.log('== what it checks ==');
await t('when everything is fine: silent, green, and it leaves a heartbeat', async () => {
  await reset(); const o = await runHealthcheck(deps());
  assert(o.status === 200 && mails.length === 0 && o.results.every(r => r.ok), JSON.stringify(o.results.filter(r => !r.ok)));
  const s = await state(); assert(s.lastRunAt === T0 && s.lastRunOk === true, JSON.stringify(s));
  assert(o.results.length === 8, 'site, sign-in route, 3 gated routes, database+secret, Firebase Auth, Firestore: ' + o.results.length);
});
await t('a broken function behind "/" is caught: a gated route that crashes (500) or answers 200 to a stranger is a failure', async () => {
  for (const bad of [json(500, {}), json(200, {}), json(404, {})]) { await reset(); const o = await runHealthcheck(deps({ fetch: world({ '/api/ai': bad }) })); assert(o.results.find(r => r.name === '/api/ai').ok === false && o.status === 503, 'status ' + bad.status); }
});
await t('the public database route catches a missing secret (503) and a dead database, which "/" never would', async () => {
  for (const bad of [json(503, { state: 'busy' }), json(500, {}), json(404, { error: 'no state' })]) { const r = (await runProbes(deps({ fetch: world({ '/api/invitations': bad }) }))).find(x => x.name.startsWith('/api/invitations')); assert(!r.ok, `${bad.status}: ${r.detail}`); }
});
await t('the sign-in route being un-served is caught', async () => {
  const r = (await runProbes(deps({ fetch: world({ '/auth/action': json(404, {}) }) }))).find(x => x.name === '/auth/action'); assert(!r.ok, r.detail);
});
await t('Firebase Auth: a clean refusal passes; a bad key, an outage or a timeout fails; with no key it says it was SKIPPED rather than passing', async () => {
  const find = async fetchOver => (await runProbes(deps({ fetch: world(fetchOver) }))).find(x => x.name === 'firebase-auth sign-in');
  assert((await find({})).ok, 'clean refusal');
  assert(!(await find({ identitytoolkit: json(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }) })).ok, 'bad key');
  assert(!(await find({ identitytoolkit: json(503, {}) })).ok, 'outage');
  assert(!(await find({ identitytoolkit: new Error('socket hang up') })).ok, 'network');
  const none = (await runProbes(deps({ env: {} }))).find(x => x.name === 'firebase-auth sign-in'); assert(none.ok && none.skipped && /SKIPPED/.test(none.detail), 'no key: ' + none.detail);
});

console.log('== alerting ==');
await t('a failing check sends one alert and remembers it; a repeat within 30 minutes stays quiet; after 30 it reminds', async () => {
  await reset(); const bad = { fetch: world({ '/api/ai': json(500, {}) }) };
  const o = await runHealthcheck(deps({ ...bad })); assert(o.status === 503 && mails.length === 1 && /\/api\/ai/.test(mails[0].subject), JSON.stringify(mails));
  const s = await state(); assert(s['/api/ai'].failingSince === T0 && s['/api/ai'].lastAlertedAt === T0, JSON.stringify(s['/api/ai']));
  await runHealthcheck(deps({ ...bad, now: T0 + 5 * MIN })); assert(mails.length === 1, 'quiet inside the cooldown');
  await runHealthcheck(deps({ ...bad, now: T0 + ALERT_COOLDOWN_MS + MIN })); assert(mails.length === 2, 'reminded after the cooldown');
  assert((await state())['/api/ai'].failingSince === T0, 'still failing since the first time');
});
await t('recovery is announced once and the note is cleared', async () => {
  await reset(); await runHealthcheck(deps({ fetch: world({ '/api/ai': json(500, {}) }) }));
  await runHealthcheck(deps({ now: T0 + 10 * MIN })); await runHealthcheck(deps({ now: T0 + 15 * MIN }));
  const rec = mails.filter(m => /recovered/.test(m.subject)); assert(rec.length === 1, 'one recovery email: ' + mails.map(m => m.subject).join(' | '));
  assert(!('/api/ai' in (await state())), 'cleared');
});
await t('THE AUDIT BUG: if Firestore is unreadable the monitor still emails (it used to crash first and say nothing)', async () => {
  await reset(); const o = await runHealthcheck(deps({ db: null, fetch: world({ '/api/ai': json(500, {}) }) }));
  const subjects = mails.map(m => m.subject).join(' | ');
  assert(/\/api\/ai/.test(subjects) && /firestore/i.test(subjects), 'alerts despite no database: ' + subjects);
  assert(o.status === 503 && o.stateOk === false, 'and reports it');
});
await t('THE AUDIT BUG: a failed alert email is NOT recorded as sent, so the next run tries again', async () => {
  await reset(); mailOk = false; const bad = { fetch: world({ '/api/ai': json(500, {}) }) };
  const o = await runHealthcheck(deps({ ...bad })); assert(o.alertFailed === true && o.status === 503, 'the run is red');
  const s = await state(); assert(s['/api/ai'].lastAlertedAt === null && s.alertChannelOk === false, 'not stamped as alerted: ' + JSON.stringify(s['/api/ai']));
  mailOk = true; await runHealthcheck(deps({ ...bad, now: T0 + 5 * MIN }));
  assert(mails.length === 1 && /\/api\/ai/.test(mails[0].subject), 'retried at the very next run, not 30 minutes later');
  assert((await state()).alertChannelOk === true, 'the channel is healthy again');
});
await t('a recovery notice that could not be sent is retried, not forgotten', async () => {
  await reset(); await runHealthcheck(deps({ fetch: world({ '/api/ai': json(500, {}) }) }));
  mailOk = false; await runHealthcheck(deps({ now: T0 + 5 * MIN }));
  assert('/api/ai' in (await state()), 'the note stays so the notice is retried');
  mailOk = true; await runHealthcheck(deps({ now: T0 + 10 * MIN }));
  assert(mails.filter(m => /recovered/.test(m.subject)).length === 1 && !('/api/ai' in (await state())), 'sent on the next run');
});
await t('the site being unreachable names the network error', async () => {
  await reset(); await runHealthcheck(deps({ fetch: world({ [`${SITE_ORIGIN}/`]: new Error('getaddrinfo ENOTFOUND') }) }));
  assert(mails.some(m => /site-root/.test(m.subject) && /ENOTFOUND/.test(m.html)), JSON.stringify(mails));
});

console.log('== the heartbeat an outside watcher reads ==');
await t('healthy and fresh: ok; the boundary is exactly 15 minutes', () => {
  const s = { lastRunAt: T0, lastRunOk: true };
  assert(evaluate(s, T0 + MIN).ok && evaluate(s, T0 + HEARTBEAT_MAX_AGE_MS).ok, 'fresh');
  const stale = evaluate(s, T0 + HEARTBEAT_MAX_AGE_MS + 1); assert(!stale.ok && /not run for/.test(stale.reason), 'stale: ' + stale.reason);
});
await t('it says so when the monitor never ran, a check is failing, or alert emails are not delivered', () => {
  assert(/never reported/.test(evaluate(undefined, T0).reason) && !evaluate({}, T0).ok, 'never');
  const f = evaluate({ lastRunAt: T0, '/api/ai': { failingSince: T0 - MIN }, '/api/x': { failingSince: T0 } }, T0 + MIN);
  assert(!f.ok && f.failing.join() === '/api/ai,/api/x' && /2 check/.test(f.reason), JSON.stringify(f));
  assert(/not being delivered/.test(evaluate({ lastRunAt: T0, alertChannelOk: false }, T0).reason), 'alert channel');
});
await t('the heartbeat written by a real run is what the endpoint reads', async () => {
  await reset(); await runHealthcheck(deps({ now: T0 }));
  assert(evaluate(await state(), T0 + 2 * MIN).ok, 'green after a clean run');
  await runHealthcheck(deps({ now: T0 + 5 * MIN, fetch: world({ '/api/ai': json(500, {}) }) }));
  const h = evaluate(await state(), T0 + 6 * MIN); assert(!h.ok && h.failing.includes('/api/ai'), JSON.stringify(h));
});

console.log('== where alerts go when nothing is configured ==');
await t('every alert path falls back to support@bewatu.com, never a personal or other-company address', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['api/cron/healthcheck.ts', 'api/security/approve.ts', 'api/security/finding.ts', 'api/security/runtime-anomaly.ts']) {
    const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert(src.includes("'support@bewatu.com'") && !/abideus/i.test(src), f + ' must fall back to support@bewatu.com');
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
