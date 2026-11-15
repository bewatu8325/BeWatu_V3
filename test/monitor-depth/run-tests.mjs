// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/monitor-depth/run-tests.mjs"
// Guards the monitor's tripwires (api/cron/healthcheck.ts) and the alert channels:
//   - deletions: member data suddenly shrinking is caught from ANY source, small drift and growth are not
//   - privileged access: a change to ops staff is announced once, a failed notice is retried, a baseline is silent
//   - scheduled jobs: a daily job that stops, errors, or never reports is a failure, with a grace period for a new one
//   - login journey: a real sign-in then a protected call; credentials never appear in any result
//   - alert channels: email and an optional webhook (slack / discord / ntfy); delivered if ANY channel worked
//   - every route that raises alerts carries an identical copy of the sender
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runHealthcheck, findDrops, diffStaff, loginJourneyProbe, sendAlert, WATCHED_CRONS, WATCHED_COLLECTIONS, COUNT_WINDOWS } from '../../api/cron/healthcheck.ts';
import { evaluate } from '../../api/health.ts';

let pass = 0, fail = 0;
async function t(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-monitor-depth' });
const db = getFirestore();
const ROOT = new URL('../../', import.meta.url).pathname;
const MIN = 60_000, HOUR = 3_600_000, T0 = 1_800_000_000_000;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const world = (over = {}) => async url => {
  for (const [needle, answer] of Object.entries(over)) if (url.includes(needle)) { if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer(url) : answer; }
  if (url.includes('identitytoolkit')) return json(400, { error: { message: 'EMAIL_NOT_FOUND' } });
  if (url.includes('/api/invitations')) return json(404, { state: 'invalid' });
  if (/\/api\/(factory-token|recruiter-analytics|ai)$/.test(url)) return json(401, {});
  return new Response('<html></html>', { status: 200 });
};
const mails = []; let mailOk = true;
const send = async (subject, body) => { if (!mailOk) return false; mails.push({ subject, body }); return true; };
const deps = (o = {}) => ({ now: o.now ?? T0, fetch: o.fetch ?? world(), env: o.env ?? { VITE_FIREBASE_API_KEY: 'k' }, db: o.db === undefined ? db : o.db, send: o.send ?? send });
const wipeAll = async () => {
  for (const c of [...WATCHED_COLLECTIONS, 'ops_staff', '_ops_internal']) { const s = await db.collection(c).get(); for (let i = 0; i < s.docs.length; i += 400) { const b = db.batch(); s.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); } }
  mails.length = 0; mailOk = true;
};
const addDocs = async (col, n, start = 0) => { for (let i = 0; i < n; i += 400) { const b = db.batch(); for (let k = i; k < Math.min(n, i + 400); k++) b.set(db.collection(col).doc(`d${start + k}`), { n: start + k }); await b.commit(); } };
const delDocs = async (col, from, n) => { const b = db.batch(); for (let k = from; k < from + n; k++) b.delete(db.collection(col).doc(`d${k}`)); await b.commit(); };
const subjects = () => mails.map(m => m.subject).join(' | ');

console.log('== deletions: the maths ==');
const S = (at, counts) => ({ at, counts });
await t('a burst is caught: it must lose BOTH enough documents and enough of itself', () => {
  assert(findDrops([S(T0 - 5 * MIN, { users: 100 })], T0, { users: 85 }).length === 1, '15 of 100 in 5 minutes');
  assert(findDrops([S(T0 - 5 * MIN, { users: 100 })], T0, { users: 95 }).length === 0, '5 documents is normal churn');
  assert(findDrops([S(T0 - 5 * MIN, { users: 100000 })], T0, { users: 99900 }).length === 0, '100 of 100,000 is 0.1%: not a burst');
  assert(findDrops([S(T0 - 5 * MIN, { users: 100000 })], T0, { users: 99400 }).length === 1, '600 in 5 minutes is huge in absolute terms');
});
await t('a slow drain is caught over the hour even if no single 5 minutes looks bad', () => {
  const hour = [S(T0 - 60 * MIN, { posts: 1000 }), S(T0 - 45 * MIN, { posts: 960 }), S(T0 - 30 * MIN, { posts: 920 }), S(T0 - 15 * MIN, { posts: 880 }), S(T0 - 5 * MIN, { posts: 850 })];
  const d = findDrops(hour, T0, { posts: 840 }); assert(d.length === 1 && d[0].window === '1 hour' && d[0].from === 1000 && d[0].drop === 160, JSON.stringify(d));
});
await t('growth, steady counts and old history never trigger; the shorter window wins; results are biggest first', () => {
  assert(findDrops([S(T0 - 5 * MIN, { users: 100 })], T0, { users: 500 }).length === 0, 'growth');
  assert(findDrops([S(T0 - 5 * MIN, { users: 100 })], T0, { users: 100 }).length === 0, 'steady');
  assert(findDrops([S(T0 - 3 * HOUR, { users: 1000 })], T0, { users: 100 }).length === 0, 'three hours ago is outside both windows');
  assert(findDrops([S(T0 - 4 * MIN, { users: 100 })], T0, { users: 80 })[0].window === '5 minutes', 'shorter window');
  const many = findDrops([S(T0 - 4 * MIN, { a: 100, b: 100 })], T0, { a: 70, b: 50 }); assert(many[0].collection === 'b' && many[1].collection === 'a', 'biggest drop first');
  assert(findDrops([], T0, { users: 1 }).length === 0 && COUNT_WINDOWS.length === 2, 'no history');
});

console.log('== deletions: a real run against Firestore ==');
await t('baseline is silent; a real deletion alerts with the numbers; it recovers when the window passes', async () => {
  await wipeAll(); await addDocs('users', 60);
  const a = await runHealthcheck(deps({ now: T0 })); assert(mails.length === 0 && a.results.find(r => r.name.startsWith('firestore deletions')).detail.includes('baseline'), 'baseline: ' + subjects());
  await delDocs('users', 0, 20);
  const b = await runHealthcheck(deps({ now: T0 + 5 * MIN }));
  assert(b.status === 503 && /deletions/.test(subjects()), 'alert: ' + subjects());
  const body = mails[0].body; assert(/users: 60 -> 40 \(-20\)/.test(body) && /mass-deletion playbook/.test(body), body);
  const h = evaluate((await db.doc('_ops_internal/uptime_state').get()).data(), T0 + 6 * MIN); assert(!h.ok && h.failing.some(n => /deletions/.test(n)), 'health is red: ' + JSON.stringify(h));
  await runHealthcheck(deps({ now: T0 + 80 * MIN })); await runHealthcheck(deps({ now: T0 + 85 * MIN }));
  assert(mails.some(m => /recovered: firestore deletions/.test(m.subject)), 'recovered once the windows passed: ' + subjects());
  assert(evaluate((await db.doc('_ops_internal/uptime_state').get()).data(), T0 + 86 * MIN).ok, 'green again');
});
await t('ordinary churn and growth raise nothing', async () => {
  await wipeAll(); await addDocs('posts', 200);
  await runHealthcheck(deps({ now: T0 })); await delDocs('posts', 0, 6); await addDocs('posts', 30, 500);
  const o = await runHealthcheck(deps({ now: T0 + 5 * MIN })); assert(o.status === 200 && mails.length === 0, subjects());
});

console.log('== privileged access ==');
const staff = (o = {}) => ({ role: 'platform_admin', isActive: true, email: 'a@bewatu.com', ...o });
await t('diffStaff names every kind of change and is empty when nothing changed', () => {
  const prev = { a: staff(), b: staff({ role: 'support_agent', email: 'b@x.com' }), c: staff({ email: 'c@x.com' }) };
  assert(diffStaff(prev, prev).length === 0, 'unchanged');
  const lines = diffStaff(prev, { a: staff(), b: staff({ role: 'platform_admin', email: 'b@x.com' }), d: staff({ email: 'd@x.com', isActive: false }) });
  assert(lines.some(l => /^ROLE CHANGED b@x.com \(b\): support_agent -> platform_admin/.test(l)) && lines.some(l => /^ADDED d@x.com \(d\) as platform_admin, inactive/.test(l)) && lines.some(l => /^REMOVED c@x.com \(c\)/.test(l)), JSON.stringify(lines));
  assert(diffStaff({ a: staff() }, { a: staff({ isActive: false }) })[0].startsWith('DEACTIVATED'), 'deactivated');
});
await t('the first run records a baseline silently; a new admin is announced once; a failed notice is retried', async () => {
  await wipeAll(); await db.doc('ops_staff/a').set({ role: 'platform_admin', isActive: true, email: 'a@bewatu.com' });
  await runHealthcheck(deps({ now: T0 })); assert(!mails.some(m => /privileged/.test(m.subject)), 'baseline is silent');
  await db.doc('ops_staff/evil').set({ role: 'platform_admin', isActive: true, email: 'evil@x.com' });
  mailOk = false; await runHealthcheck(deps({ now: T0 + 5 * MIN })); assert(mails.length === 0, 'send failed');
  mailOk = true; await runHealthcheck(deps({ now: T0 + 10 * MIN }));
  const m = mails.filter(x => /privileged/.test(x.subject)); assert(m.length === 1 && /ADDED evil@x.com/.test(m[0].body) && /secret-leak playbook/.test(m[0].body), 'retried and sent once: ' + subjects());
  await runHealthcheck(deps({ now: T0 + 15 * MIN })); assert(mails.filter(x => /privileged/.test(x.subject)).length === 1, 'not repeated');
  await db.doc('ops_staff/a').update({ role: 'support_agent' }); await runHealthcheck(deps({ now: T0 + 20 * MIN }));
  assert(mails.some(x => /ROLE CHANGED a@bewatu.com/.test(x.body)), 'a demotion is also a change');
});

console.log('== scheduled jobs ==');
const job = WATCHED_CRONS[0];
await t('a job that has not reported yet gets a grace period, then fails; fresh is ok; stale or erroring fails', async () => {
  await wipeAll();
  const a = await runHealthcheck(deps({ now: T0 })); assert(a.results.find(r => /invitations daily job/.test(r.name)).ok, 'grace at first sight');
  const b = await runHealthcheck(deps({ now: T0 + job.maxAgeMs + HOUR })); assert(!b.results.find(r => /invitations daily job/.test(r.name)).ok && mails.some(m => /never reported/.test(m.body)), 'a job that never ran: ' + subjects());
  await db.doc('_ops_internal/cron_invitations').set({ lastRunAt: T0 + job.maxAgeMs + 2 * HOUR, ok: true });
  const c = await runHealthcheck(deps({ now: T0 + job.maxAgeMs + 3 * HOUR })); assert(c.results.find(r => /invitations daily job/.test(r.name)).ok, 'fresh heartbeat');
  const d2 = await runHealthcheck(deps({ now: T0 + job.maxAgeMs + 2 * HOUR + 27 * HOUR })); assert(!d2.results.find(r => /invitations daily job/.test(r.name)).ok, 'stale heartbeat');
  await db.doc('_ops_internal/cron_invitations').set({ lastRunAt: T0 + 100 * HOUR, ok: false });
  const e = await runHealthcheck(deps({ now: T0 + 101 * HOUR })); assert(/reported an error/.test(e.results.find(r => /invitations daily job/.test(r.name)).detail), 'a run that errored');
});
await t('the invitations cron actually stamps the heartbeat the monitor reads', () => {
  const src = readFileSync(ROOT + 'api/invitations.ts', 'utf8');
  assert(src.includes("doc('cron_invitations')") && src.includes('lastRunAt: d.now'), 'heartbeat stamp is in the cron branch');
});

console.log('== login journey ==');
const probeEnv = { VITE_FIREBASE_API_KEY: 'KEY', UPTIME_PROBE_EMAIL: 'probe@bewatu.com', UPTIME_PROBE_PASSWORD: 'S3cret-Pass!' };
await t('without a probe account it says SKIPPED; with one it signs in, then calls a protected API with that token', async () => {
  const none = await loginJourneyProbe(deps()); assert(none.skipped && none.ok && /SKIPPED/.test(none.detail), none.detail);
  let seen = [];
  const f = async (url, init) => { seen.push({ url, init }); if (url.includes('identitytoolkit')) return json(200, { idToken: 'TOK123' }); return json(200, { state: 'none' }); };
  const ok = await loginJourneyProbe(deps({ fetch: f, env: probeEnv })); assert(ok.ok && !ok.skipped, ok.detail);
  assert(seen[1].url.endsWith('/api/investor-membership') && seen[1].init.headers.Authorization === 'Bearer TOK123', 'used the token it was given');
});
await t('each way the journey can break is a failure, and no result ever contains the password or the token', async () => {
  const cases = [
    ['bad password', async u => (u.includes('identitytoolkit') ? json(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }) : json(200, {}))],
    ['sign-in outage', async u => (u.includes('identitytoolkit') ? json(503, {}) : json(200, {}))],
    ['protected API crashes', async u => (u.includes('identitytoolkit') ? json(200, { idToken: 'TOK123' }) : json(500, {}))],
    ['protected API refuses a valid token', async u => (u.includes('identitytoolkit') ? json(200, { idToken: 'TOK123' }) : json(401, {}))],
    ['network', async () => { throw new Error('socket hang up'); }],
  ];
  for (const [label, fetch] of cases) { const r = await loginJourneyProbe(deps({ fetch, env: probeEnv })); assert(!r.ok, `${label} should fail: ${r.detail}`); assert(!JSON.stringify(r).includes('S3cret-Pass!') && !JSON.stringify(r).includes('TOK123'), `${label} leaks a secret`); }
});

console.log('== alert channels ==');
const realFetch = globalThis.fetch;
const withFetch = async (handler, fn) => { const calls = []; globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); }; try { return await fn(calls); } finally { globalThis.fetch = realFetch; } };
const logs = console.error; const quiet = async fn => { console.error = () => {}; try { return await fn(); } finally { console.error = logs; } };
await t('email only: delivered, to the right inbox, with the fallback chain', async () => {
  await withFetch(() => json(200, {}), async calls => {
    assert(await sendAlert({ RESEND_API_KEY: 'r' }, 'S', 'B') === true, 'delivered');
    assert(JSON.parse(calls[0].init.body).to[0] === 'support@bewatu.com', 'default inbox');
    await sendAlert({ RESEND_API_KEY: 'r', UPTIME_ALERT_EMAIL: 'up@x.com' }, 'S', 'B'); assert(JSON.parse(calls[1].init.body).to[0] === 'up@x.com', 'uptime inbox');
    await sendAlert({ RESEND_API_KEY: 'r', UPTIME_ALERT_EMAIL: 'up@x.com', SECURITY_ALERT_EMAIL: 'sec@x.com' }, 'S', 'B'); assert(JSON.parse(calls[2].init.body).to[0] === 'sec@x.com', 'security inbox wins');
    assert(calls.length === 3, 'no webhook configured, none called');
  });
});
await t('webhook formats: slack (default), discord, ntfy', async () => {
  await withFetch(() => json(200, {}), async calls => {
    await sendAlert({ ALERT_WEBHOOK_URL: 'https://hooks.example/x' }, '🔴 Down', 'detail'); assert(/"text":"\*🔴 Down\*\\ndetail"/.test(calls[0].init.body), calls[0].init.body);
    await sendAlert({ ALERT_WEBHOOK_URL: 'https://hooks.example/x', ALERT_WEBHOOK_FORMAT: 'discord' }, 'Down', 'detail'); assert(/"content":"\*\*Down\*\*/.test(calls[1].init.body), calls[1].init.body);
    await sendAlert({ ALERT_WEBHOOK_URL: 'https://ntfy.sh/topic', ALERT_WEBHOOK_FORMAT: 'ntfy' }, '🔴 BeWatu down', 'detail'); assert(calls[2].init.body === 'detail' && calls[2].init.headers.Priority === 'high' && calls[2].init.headers.Title === 'BeWatu down', JSON.stringify(calls[2].init.headers));
  });
});
await t('delivered if ANY channel worked; false only if all failed; a non-https webhook is never called', async () => {
  await quiet(async () => {
    await withFetch(u => (u.includes('resend') ? json(500, {}) : json(200, {})), async () => assert(await sendAlert({ RESEND_API_KEY: 'r', ALERT_WEBHOOK_URL: 'https://h.example/x' }, 'S', 'B') === true, 'email down, webhook up'));
    await withFetch(u => (u.includes('resend') ? json(200, {}) : json(500, {})), async () => assert(await sendAlert({ RESEND_API_KEY: 'r', ALERT_WEBHOOK_URL: 'https://h.example/x' }, 'S', 'B') === true, 'email up, webhook down'));
    await withFetch(() => json(500, {}), async () => assert(await sendAlert({ RESEND_API_KEY: 'r', ALERT_WEBHOOK_URL: 'https://h.example/x' }, 'S', 'B') === false, 'all down'));
    await withFetch(() => { throw new Error('boom'); }, async () => assert(await sendAlert({ RESEND_API_KEY: 'r', ALERT_WEBHOOK_URL: 'https://h.example/x' }, 'S', 'B') === false, 'exceptions are contained'));
    await withFetch(() => json(200, {}), async calls => { assert(await sendAlert({ ALERT_WEBHOOK_URL: 'http://insecure.example/x' }, 'S', 'B') === false && calls.length === 0, 'plain http refused'); });
    await withFetch(() => json(200, {}), async calls => { assert(await sendAlert({}, 'S', 'B') === false && calls.length === 0, 'nothing configured'); });
  });
});
await t('every route that raises alerts carries an identical copy of the sender, and none keeps its own email code', () => {
  const grab = f => { const m = readFileSync(ROOT + f, 'utf8').match(/\/\/ <alert-sender>\n([\s\S]*?)\/\/ <\/alert-sender>/); return m ? m[1] : null; };
  const files = ['api/cron/healthcheck.ts', 'api/security/approve.ts', 'api/security/finding.ts', 'api/security/runtime-anomaly.ts'];
  const canonical = grab(files[0]); assert(canonical && canonical.length > 500, 'canonical sender not found');
  for (const f of files) { assert(grab(f) === canonical, `${f} has a different alert sender from api/cron/healthcheck.ts`); assert((readFileSync(ROOT + f, 'utf8').match(/api\.resend\.com/g) || []).length === 1, `${f} still has its own email code`); }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
