#!/usr/bin/env node
// scripts/rollback.mjs
// Supervised rollback of the production deployment on Vercel ("instant rollback": the production domains are pointed at an earlier
// build; nothing is rebuilt). Run it from the "Roll back production" workflow (.github/workflows/rollback.yml).
//
//   - It is a DRY RUN unless execute=true. A dry run only reads from Vercel and prints what it would do.
//   - Executing needs the exact confirmation text ROLLBACK, so a stray click cannot roll production back.
//   - Only a READY PRODUCTION deployment, younger than 30 days, other than the current one, is a valid target. By default the target
//     is the newest one before the current one; you may name another (uid, url or commit sha).
//   - After promoting it probes the live site (the same checks as the post-deploy smoke test) with retries, and FAILS if production
//     is still unhealthy, so a rollback that did not help is never reported as success.
//   - It does not touch Firestore rules or indexes (those are deployed separately) or any data. If the bad change included a rules
//     change, that needs its own decision.
//
// Env: VERCEL_TOKEN, VERCEL_PROJECT (default be-watu-v4), VERCEL_TEAM_SLUG (default be-watu),
//      INPUT_DEPLOYMENT (optional), INPUT_EXECUTE ("true" to execute), INPUT_CONFIRM (must be ROLLBACK to execute).
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MAX_AGE_DAYS = 30;
export const SITE = 'https://www.bewatu.com';
export const CONFIRM_TEXT = 'ROLLBACK';

const idOf = d => d.uid ?? d.id;
const when = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const short = d => `${idOf(d)} (${d.meta?.githubCommitSha?.slice(0, 7) ?? 'no commit'}: ${String(d.meta?.githubCommitMessage ?? 'no message').split('\n')[0].slice(0, 70)}, ${when(d.created)})`;

/**
 * Pure. deployments = READY production deployments from Vercel, in any order. currentId = the deployment serving production now.
 * Returns { current, target, problems }. `problems` empty means the plan is allowed.
 */
export function planRollback(deployments, currentId, requested, now) {
  const ready = deployments.filter(d => d.state === 'READY' && d.target === 'production').sort((a, b) => b.created - a.created);
  const current = ready.find(d => idOf(d) === currentId) ?? ready[0] ?? null;
  const problems = [];
  if (!current) { problems.push('Could not tell which deployment is serving production.'); return { current: null, target: null, problems }; }
  let target = null;
  if (requested) {
    const q = String(requested).trim();
    target = deployments.find(d => idOf(d) === q || d.url === q.replace(/^https?:\/\//, '') || (q.length >= 7 && d.meta?.githubCommitSha?.startsWith(q))) ?? null;
    if (!target) problems.push(`No deployment matches "${q}".`);
  } else {
    target = ready.find(d => d.created < current.created) ?? null;
    if (!target) problems.push('There is no earlier ready production deployment to roll back to.');
  }
  if (target) {
    if (idOf(target) === idOf(current)) problems.push('That is the deployment production is already serving.');
    if (target.state !== 'READY') problems.push(`${idOf(target)} is not READY (it is ${target.state}).`);
    if (target.target !== 'production') problems.push(`${idOf(target)} is not a production deployment.`);
    if (now - target.created > MAX_AGE_DAYS * 86_400_000) problems.push(`${idOf(target)} is older than ${MAX_AGE_DAYS} days. Roll back by redeploying a known-good commit instead.`);
  }
  return { current, target, problems };
}

/** Probe the live site; retry because a new alias takes a moment. Returns { ok, lines }. */
export async function smoke(fetchFn, { tries = 3, waitMs = 20_000, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const lines = [];
  for (let attempt = 1; attempt <= tries; attempt++) {
    lines.length = 0; let ok = true;
    if (waitMs) await sleep(waitMs);
    const check = async (name, want, url, init, extra) => {
      let code = 0, body = '';
      try { const r = await fetchFn(url, { ...init, signal: AbortSignal.timeout(15_000) }); code = r.status; body = extra ? await r.text() : ''; } catch { code = 0; }
      const pass = code === want && (!extra || extra(body));
      if (!pass) ok = false; lines.push(`${pass ? 'ok  ' : 'FAIL'} ${name} (${code || 'no answer'}, expected ${want})`);
    };
    await check('site root', 200, `${SITE}/`);
    await check('sign-in route', 200, `${SITE}/auth/action`);
    await check('/api/ai refuses a stranger', 401, `${SITE}/api/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await check('database + secret (invitation preview)', 404, `${SITE}/api/invitations?token=AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB`, undefined, b => b.includes('"state":"invalid"'));
    if (ok) return { ok: true, lines, attempt };
  }
  return { ok: false, lines, attempt: tries };
}

export async function run({ env, fetch: fetchFn, log = console.log, sleep, summaryFile = env.GITHUB_STEP_SUMMARY }) {
  const out = [];
  const say = s => { out.push(s); log(s); };
  const token = env.VERCEL_TOKEN;
  if (!token) { say('ERROR: VERCEL_TOKEN is not set.'); return 1; }
  const project = env.VERCEL_PROJECT || 'be-watu-v4', slug = env.VERCEL_TEAM_SLUG || 'be-watu';
  const execute = String(env.INPUT_EXECUTE ?? '').toLowerCase() === 'true';
  const headers = { Authorization: `Bearer ${token}` };
  const q = `slug=${encodeURIComponent(slug)}`;
  const finish = code => { if (summaryFile) { try { appendFileSync(summaryFile, `### Rollback ${execute ? '(EXECUTE)' : '(dry run)'}\n\n\`\`\`\n${out.join('\n')}\n\`\`\`\n`); } catch { /* optional */ } } return code; };

  const pr = await fetchFn(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}?${q}`, { headers });
  if (!pr.ok) { say(`ERROR: Vercel answered ${pr.status} for project "${project}" (team "${slug}"). Check the token's scope.`); return finish(1); }
  const proj = await pr.json();
  const dr = await fetchFn(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(proj.id)}&target=production&state=READY&limit=30&${q}`, { headers });
  if (!dr.ok) { say(`ERROR: could not list deployments (${dr.status}).`); return finish(1); }
  const deployments = (await dr.json()).deployments ?? [];
  const plan = planRollback(deployments, proj.targets?.production?.id, env.INPUT_DEPLOYMENT, Date.now());

  say(`Production is serving: ${plan.current ? short(plan.current) : 'unknown'}`);
  say(`Rollback target:       ${plan.target ? short(plan.target) : 'none'}`);
  if (plan.problems.length) { for (const p of plan.problems) say(`REFUSED: ${p}`); return finish(1); }
  if (!execute) { say('\nDRY RUN: nothing was changed. To roll back, run the workflow again with execute ticked and the confirmation text ROLLBACK.'); return finish(0); }
  if (env.INPUT_CONFIRM !== CONFIRM_TEXT) { say(`REFUSED: to execute, the confirmation must be exactly ${CONFIRM_TEXT}.`); return finish(1); }

  say('\nExecuting: promoting the target to production...');
  const pm = await fetchFn(`https://api.vercel.com/v10/projects/${encodeURIComponent(proj.id)}/promote/${encodeURIComponent(idOf(plan.target))}?${q}`, { method: 'POST', headers });
  if (!pm.ok) { say(`ERROR: Vercel refused the promotion (${pm.status}). Production was NOT changed.`); return finish(1); }
  say('Promoted. Checking that production is healthy...');
  const s = await smoke(fetchFn, { sleep });
  for (const l of s.lines) say(`  ${l}`);
  if (!s.ok) { say('\nFAILED: production is still unhealthy after the rollback. Do not assume it worked. Check the Vercel dashboard now.'); return finish(1); }
  say(`\nDONE: production is serving ${idOf(plan.target)} and passed the smoke checks.`);
  say('Next: revert or fix the bad commit on main, and check whether the bad change also included a Firestore rules or index change (deployed separately).');
  return finish(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run({ env: process.env, fetch }).then(code => process.exit(code), e => { console.log('ERROR:', e.message); process.exit(1); });
