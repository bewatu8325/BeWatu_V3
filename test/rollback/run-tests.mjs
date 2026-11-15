// Run: node test/rollback/run-tests.mjs
// Guards the rollback tool (scripts/rollback.mjs): it is a dry run unless confirmed, only allows a sane target, never reports success
// if production is still unhealthy, and never leaks the token.
import { planRollback, smoke, run, MAX_AGE_DAYS, CONFIRM_TEXT } from '../../scripts/rollback.mjs';
let pass = 0, fail = 0;
const t = async (label, fn) => { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const DAY = 86_400_000, NOW = 1_800_000_000_000;
const dep = (uid, ageDays, o = {}) => ({ uid, url: `${uid}.vercel.app`, state: 'READY', target: 'production', created: NOW - ageDays * DAY, meta: { githubCommitSha: uid.padEnd(40, 'a'), githubCommitMessage: `commit ${uid}` }, ...o });
const list = [dep('dpl_cur', 0.1), dep('dpl_prev', 2), dep('dpl_old', 5), dep('dpl_ancient', 45)];

await t('by default the target is the newest ready production build BEFORE the current one', () => {
  const p = planRollback(list, 'dpl_cur', '', NOW); assert(p.problems.length === 0 && p.current.uid === 'dpl_cur' && p.target.uid === 'dpl_prev', JSON.stringify(p));
});
await t('if production was already rolled back, "current" is what is serving, not just the newest build', () => {
  const p = planRollback(list, 'dpl_prev', '', NOW); assert(p.current.uid === 'dpl_prev' && p.target.uid === 'dpl_old', JSON.stringify(p));
});
await t('a named target can be an id, a url or a commit sha', () => {
  for (const q of ['dpl_old', 'dpl_old.vercel.app', 'https://dpl_old.vercel.app', 'dpl_old'.padEnd(40, 'a').slice(0, 9)]) { const p = planRollback(list, 'dpl_cur', q, NOW); assert(p.target?.uid === 'dpl_old' && p.problems.length === 0, `${q}: ${JSON.stringify(p.problems)}`); }
});
await t('it refuses: the current build, an unknown build, a build that is not READY or not production, and anything older than 30 days', () => {
  assert(planRollback(list, 'dpl_cur', 'dpl_cur', NOW).problems.some(p => /already serving/.test(p)), 'current');
  assert(planRollback(list, 'dpl_cur', 'nope', NOW).problems.some(p => /No deployment matches/.test(p)), 'unknown');
  const mixed = [...list, dep('dpl_err', 1, { state: 'ERROR' }), dep('dpl_prev_env', 1, { target: 'preview' })];
  assert(planRollback(mixed, 'dpl_cur', 'dpl_err', NOW).problems.some(p => /not READY/.test(p)), 'not ready');
  assert(planRollback(mixed, 'dpl_cur', 'dpl_prev_env', NOW).problems.some(p => /not a production/.test(p)), 'preview');
  assert(planRollback(list, 'dpl_cur', 'dpl_ancient', NOW).problems.some(p => new RegExp(`older than ${MAX_AGE_DAYS} days`).test(p)), 'too old');
  assert(planRollback([dep('dpl_cur', 0)], 'dpl_cur', '', NOW).problems.some(p => /no earlier ready/.test(p)), 'nothing to go back to');
  assert(planRollback([], 'x', '', NOW).problems.length === 1, 'no deployments');
});

const healthy = async url => (url.includes('/api/invitations') ? new Response('{"state":"invalid"}', { status: 404 }) : url.endsWith('/api/ai') ? new Response('{}', { status: 401 }) : new Response('ok', { status: 200 }));
await t('smoke: passes when production is healthy; retries a slow takeover; fails if it never recovers', async () => {
  assert((await smoke(healthy, { waitMs: 0 })).ok, 'healthy');
  let calls = 0; const slow = async (u, i) => (++calls <= 4 ? new Response('x', { status: 502 }) : healthy(u, i));
  const s = await smoke(slow, { waitMs: 0 }); assert(s.ok && s.attempt === 2, 'recovered on the second try: ' + JSON.stringify({ ok: s.ok, attempt: s.attempt }));
  const dead = await smoke(async () => new Response('x', { status: 500 }), { waitMs: 0 }); assert(!dead.ok && dead.lines.some(l => l.startsWith('FAIL')), 'never recovers');
  const wrongBody = await smoke(async u => (u.includes('/api/invitations') ? new Response('{"state":"busy"}', { status: 404 }) : healthy(u)), { waitMs: 0 }); assert(!wrongBody.ok, 'the invitation probe must see "invalid"');
});

// A fake Vercel that records every request, so we can prove what was and was not called.
const vercel = (o = {}) => { const calls = []; const f = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method ?? 'GET', auth: init.headers?.Authorization });
  const u = String(url);
  if (u.includes('/promote/')) return o.promoteFails ? new Response('{}', { status: 403 }) : new Response('{}', { status: 201 });
  if (u.includes('api.vercel.com/v9/projects/')) return o.projectFails ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ id: 'prj_1', targets: { production: { id: 'dpl_cur' } } }), { status: 200 });
  if (u.includes('api.vercel.com/v6/deployments')) return new Response(JSON.stringify({ deployments: list.map(d => ({ ...d, created: Date.now() - (NOW - d.created) })) }), { status: 200 });
  return (o.siteFetch ?? healthy)(u, init);
}; return { f, calls }; };
const baseEnv = { VERCEL_TOKEN: 'tok_SECRET_VALUE' };
const quiet = () => { const lines = []; return { log: s => lines.push(s), lines }; };

await t('DEFAULT IS A DRY RUN: it reads from Vercel, prints the plan, and changes nothing', async () => {
  const v = vercel(); const q = quiet(); const code = await run({ env: baseEnv, fetch: v.f, log: q.log, summaryFile: null });
  assert(code === 0 && /DRY RUN/.test(q.lines.join('\n')), q.lines.join('\n'));
  assert(!v.calls.some(c => c.method === 'POST' || c.url.includes('/promote/')), 'a dry run must never promote');
});
await t('executing without the exact confirmation text is refused, and nothing is promoted', async () => {
  for (const confirm of [undefined, '', 'rollback', 'yes', 'ROLLBACK ']) { const v = vercel(); const q = quiet(); const code = await run({ env: { ...baseEnv, INPUT_EXECUTE: 'true', INPUT_CONFIRM: confirm }, fetch: v.f, log: q.log, summaryFile: null }); assert(code === 1 && /REFUSED/.test(q.lines.join('\n')) && !v.calls.some(c => c.url.includes('/promote/')), `confirm ${JSON.stringify(confirm)}`); }
});
await t('a confirmed rollback promotes the right build, then checks production, and succeeds only if it is healthy', async () => {
  const v = vercel(); const q = quiet(); const code = await run({ env: { ...baseEnv, INPUT_EXECUTE: 'true', INPUT_CONFIRM: CONFIRM_TEXT }, fetch: v.f, log: q.log, summaryFile: null, sleep: async () => {} });
  const promote = v.calls.filter(c => c.url.includes('/promote/')); assert(code === 0 && promote.length === 1 && /\/promote\/dpl_prev\?/.test(promote[0].url) && promote[0].method === 'POST' && /prj_1/.test(promote[0].url), JSON.stringify(promote));
  assert(/passed the smoke checks/.test(q.lines.join('\n')) && /Firestore rules/.test(q.lines.join('\n')), 'tells the next steps');
});
await t('if production is STILL unhealthy after the rollback it fails loudly instead of claiming success', async () => {
  const v = vercel({ siteFetch: async () => new Response('x', { status: 500 }) }); const q = quiet();
  const code = await run({ env: { ...baseEnv, INPUT_EXECUTE: 'true', INPUT_CONFIRM: CONFIRM_TEXT }, fetch: v.f, log: q.log, summaryFile: null, sleep: async () => {} });
  assert(code === 1 && /still unhealthy/.test(q.lines.join('\n')) && !/^DONE/m.test(q.lines.join('\n')), q.lines.join('\n'));
});
await t('if Vercel refuses the promotion it says production was NOT changed; a bad token or project fails clearly', async () => {
  let q = quiet(); assert(await run({ env: { ...baseEnv, INPUT_EXECUTE: 'true', INPUT_CONFIRM: CONFIRM_TEXT }, fetch: vercel({ promoteFails: true }).f, log: q.log, summaryFile: null }) === 1 && /NOT changed/.test(q.lines.join('\n')), 'refused promotion');
  q = quiet(); assert(await run({ env: baseEnv, fetch: vercel({ projectFails: true }).f, log: q.log, summaryFile: null }) === 1 && /Check the token's scope/.test(q.lines.join('\n')), 'bad project');
  q = quiet(); assert(await run({ env: {}, fetch: vercel().f, log: q.log, summaryFile: null }) === 1 && /VERCEL_TOKEN is not set/.test(q.lines.join('\n')), 'no token');
});
await t('a named target is honoured, and the token never appears in any output', async () => {
  const v = vercel(); const q = quiet(); await run({ env: { ...baseEnv, INPUT_DEPLOYMENT: 'dpl_old', INPUT_EXECUTE: 'true', INPUT_CONFIRM: CONFIRM_TEXT }, fetch: v.f, log: q.log, summaryFile: null, sleep: async () => {} });
  assert(v.calls.some(c => /\/promote\/dpl_old\?/.test(c.url)), 'named target');
  assert(!q.lines.join('\n').includes('tok_SECRET_VALUE'), 'the token must never be printed');
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
