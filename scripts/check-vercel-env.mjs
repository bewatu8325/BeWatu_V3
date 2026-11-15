#!/usr/bin/env node
// scripts/check-vercel-env.mjs
// Daily posture check of the Vercel project's environment variables. Reads NAMES, TYPES and TARGETS only: values are never printed,
// stored or sent anywhere. (The Vercel API returns the value of a `plain` variable, so nothing here may log the whole object.)
//
//   CRITICAL (fails the job): a variable that will be baked into the browser bundle (VITE_* / NEXT_PUBLIC_*) but is named like a secret
//   WARNING  (annotation + summary, job stays green): a secret-looking variable stored as `plain` (readable by anyone with dashboard
//            access), a required variable that is missing or is not set for Production
//
// Env: VERCEL_TOKEN, VERCEL_PROJECT (default be-watu-v4), VERCEL_TEAM_SLUG (default be-watu).
// With no token, or a token the project does not accept, it says SKIPPED and exits 0: a check that cannot run must not break CI.
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SECRETISH = /(SECRET|PASSWORD|PRIVATE|SERVICE_ACCOUNT|TOKEN)/i;
const CLIENT_PREFIX = /^(VITE_|NEXT_PUBLIC_)/;

/** Pure: envs = [{ key, type, target }], expected = config/expected-env.json. Returns findings, never values. */
export function analyzeEnv(envs, expected) {
  const critical = [], warnings = [];
  const byKey = new Map();
  for (const e of envs) { if (!byKey.has(e.key)) byKey.set(e.key, []); byKey.get(e.key).push(e); }
  const publicOk = new Set(expected.publicByDesign ?? []);
  for (const [key, list] of byKey) {
    if (CLIENT_PREFIX.test(key) && SECRETISH.test(key) && !publicOk.has(key)) critical.push(`${key} is exposed to the browser bundle (${key.match(CLIENT_PREFIX)[1]} prefix) but is named like a secret. Rename it without the prefix and rotate it.`);
    if (SECRETISH.test(key) && !publicOk.has(key) && list.some(e => e.type === 'plain')) warnings.push(`${key} is stored as a plain variable, readable in the dashboard by anyone with project access. Re-save it as Sensitive.`);
  }
  const inProd = key => (byKey.get(key) ?? []).some(e => !Array.isArray(e.target) || e.target.includes('production'));
  for (const key of expected.required ?? []) {
    if (!byKey.has(key)) warnings.push(`${key} is required but not set.`);
    else if (!inProd(key)) warnings.push(`${key} is set, but not for Production.`);
  }
  for (const group of expected.anyOf ?? []) if (!group.some(k => byKey.has(k) && inProd(k))) warnings.push(`None of ${group.join(' / ')} is set for Production (one is needed).`);
  for (const key of expected.recommended ?? []) if (!byKey.has(key) && !(expected.required ?? []).includes(key)) warnings.push(`${key} is recommended but not set.`);
  return { critical, warnings, checked: byKey.size };
}

export function formatReport(r) {
  const lines = [`Checked ${r.checked} environment variable names (values are never read or printed).`];
  for (const c of r.critical) lines.push(`CRITICAL: ${c}`);
  for (const w of r.warnings) lines.push(`warning: ${w}`);
  if (!r.critical.length && !r.warnings.length) lines.push('No problems found.');
  return lines.join('\n');
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.log('SKIPPED: VERCEL_TOKEN is not set, so the Vercel environment is not being checked.'); return 0; }
  const project = process.env.VERCEL_PROJECT || 'be-watu-v4', slug = process.env.VERCEL_TEAM_SLUG || 'be-watu';
  const expected = JSON.parse(readFileSync(new URL('../config/expected-env.json', import.meta.url), 'utf8'));
  const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/env?slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.log(`SKIPPED: the Vercel API answered ${res.status} for project "${project}" (team "${slug}"), so the environment is not being checked. Check the token's scope.`); return 0; }
  const body = await res.json();
  const envs = (body.envs ?? []).map(e => ({ key: String(e.key), type: String(e.type ?? ''), target: e.target }));   // deliberately drops `value`
  const report = analyzeEnv(envs, expected);
  const text = formatReport(report);
  console.log(text);
  for (const c of report.critical) console.log(`::error title=Vercel environment::${c}`);
  for (const w of report.warnings) console.log(`::warning title=Vercel environment::${w}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Vercel environment posture\n\n\`\`\`\n${text}\n\`\`\`\n`);
  return report.critical.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(code => process.exit(code), e => { console.log('SKIPPED: the check could not run:', e.message); process.exit(0); });
