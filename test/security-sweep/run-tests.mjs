// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/security-sweep/run-tests.mjs"
// Guards the daily security sweep (api/cron/security-sweep.ts) and the finding re-raise it relies on:
//   - a merged fix is recorded as merged; it is VERIFIED only after a full scan cycle with no new report, never sooner
//   - one broken lookup never stops the rest; running twice changes nothing twice
//   - a high or critical approval nobody decides is nudged (a digest, once a day); expired approvals clear the queue
//   - deployed Firestore rules that differ from main are reported (once a day); an unreadable deployment is "skipped", never guessed
//   - an open finding with no pending approval gets a fresh one instead of being absorbed forever
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { sweep, normalizeRules, VERIFY_AFTER_MS, NUDGE_AFTER_MS, DRIFT_REPEAT_MS } from '../../api/cron/security-sweep.ts';
import { needsFreshApproval } from '../../api/security/finding.ts';

let pass = 0, fail = 0;
async function t(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-security-sweep' });
const db = getFirestore();
const ROOT = new URL('../../', import.meta.url).pathname;
const HOUR = 3_600_000, DAY = 86_400_000, NOW = 1_800_000_000_000;
const ts = m => Timestamp.fromMillis(m);

const wipe = async () => { for (const c of ['security_findings', 'remediation_plans', 'approval_requests', 'audit_log', '_ops_internal']) { const s = await db.collection(c).get(); await Promise.all(s.docs.map(x => x.ref.delete())); } mails.length = 0; mailOk = true; };
const mails = []; let mailOk = true;
const send = async (subject, body) => { if (!mailOk) return false; mails.push({ subject, body }); return true; };
const RULES = 'rules_version = \'2\';\nservice cloud.firestore {\n  match /databases/{d}/documents { match /{x=**} { allow read, write: if false; } }\n}\n';
const deps = (o = {}) => ({
  db, now: o.now ?? NOW, send: o.send ?? send,
  github: o.github ?? { prState: async () => ({ merged: false, mergedAt: null, closed: false }) },
  rules: o.rules ?? { repoText: async () => RULES, deployed: async () => ({ text: RULES }) },
});
const get = async p => (await db.doc(p).get()).data();
const auditActions = async () => (await db.collection('audit_log').get()).docs.map(d => d.data().action).sort();

async function seedFix(o = {}) {
  await db.doc(`security_findings/${o.id ?? 'f1'}`).set({ findingId: 'BW-SEC-1', status: o.status ?? 'remediation_pending', repo: o.repo ?? 'bewatu_v3', remediationPlanId: `p-${o.id ?? 'f1'}`, riskScore: 80,
    detectedAt: ts(o.detectedAt ?? NOW - 20 * DAY), updatedAt: ts(o.updatedAt ?? NOW - 15 * DAY), ...(o.lastReportedAt === undefined ? {} : { lastReportedAt: ts(o.lastReportedAt) }) });
  await db.doc(`remediation_plans/p-${o.id ?? 'f1'}`).set({ findingId: o.id ?? 'f1', status: 'completed', ...(o.noPr ? {} : { prNumber: 7 }) });
}
const merged = ago => ({ prState: async () => ({ merged: true, mergedAt: NOW - ago, closed: true }) });

console.log('== closing the loop on fixes ==');
await t('a PR merged 3 days ago is recorded as merged but NOT verified', async () => {
  await wipe(); await seedFix({ lastReportedAt: NOW - 10 * DAY });
  const r = await sweep(deps({ github: merged(3 * DAY) }));
  const f = await get('security_findings/f1'); assert(r.merged === 1 && r.verified === 0 && f.prMerged === true && f.status === 'remediation_pending', JSON.stringify({ r, status: f.status }));
});
await t('a PR merged more than 8 days ago and not reported again since IS verified, with an audit entry', async () => {
  await wipe(); await seedFix({ lastReportedAt: NOW - 12 * DAY });
  const r = await sweep(deps({ github: merged(VERIFY_AFTER_MS + DAY) }));
  const f = await get('security_findings/f1'); assert(r.verified === 1 && f.status === 'verified' && f.verifiedBy === 'security-sweep' && f.resolvedAt, JSON.stringify(f));
  assert((await auditActions()).join() === 'security_finding_auto_verified,security_fix_merged', (await auditActions()).join());
});
await t('a finding reported AGAIN after the merge is never verified: the fix did not work', async () => {
  await wipe(); await seedFix({ lastReportedAt: NOW - 2 * DAY });   // reported two days ago; merge was ten days ago... then re-reported
  const r = await sweep(deps({ github: merged(10 * DAY) }));
  assert(r.verified === 0 && (await get('security_findings/f1')).status === 'remediation_pending', 'still open');
});
await t('findings from before lastReportedAt existed fall back to updatedAt: a later touch blocks verification', async () => {
  await wipe(); await seedFix({ updatedAt: NOW - 1 * DAY });   // no lastReportedAt; touched after the merge
  assert((await sweep(deps({ github: merged(10 * DAY) }))).verified === 0, 'touched after merge');
  await wipe(); await seedFix({ updatedAt: NOW - 15 * DAY });
  assert((await sweep(deps({ github: merged(10 * DAY) }))).verified === 1, 'untouched since before the merge');
});
await t('an unmerged PR, and an issue with no PR, change nothing', async () => {
  await wipe(); await seedFix({ id: 'a' }); await seedFix({ id: 'b', noPr: true });
  const r = await sweep(deps()); assert(r.merged === 0 && r.verified === 0 && (await auditActions()).length === 0, JSON.stringify(r));
});
await t('marking a merge leaves updatedAt alone (the sweep relies on it meaning "last touched")', async () => {
  await wipe(); await seedFix({ updatedAt: NOW - 15 * DAY, lastReportedAt: NOW - 15 * DAY });
  await sweep(deps({ github: merged(3 * DAY) })); assert((await get('security_findings/f1')).updatedAt.toMillis() === NOW - 15 * DAY, 'updatedAt moved');
});
await t('one broken GitHub lookup is counted but never stops the others; running twice does not duplicate anything', async () => {
  await wipe(); await seedFix({ id: 'good', lastReportedAt: NOW - 20 * DAY }); await seedFix({ id: 'bad', lastReportedAt: NOW - 20 * DAY });
  await db.doc('remediation_plans/p-bad').update({ prNumber: 99 });
  const gh = { prState: async (_r, n) => { if (n === 99) throw new Error('GitHub rate limited'); return { merged: true, mergedAt: NOW - 12 * DAY, closed: true }; } };
  const quiet = console.error; console.error = () => {};
  try { const r = await sweep(deps({ github: gh })); assert(r.githubErrors === 1 && r.verified === 1 && (await get('security_findings/good')).status === 'verified', JSON.stringify(r)); await sweep(deps({ github: gh })); } finally { console.error = quiet; }
  assert((await auditActions()).filter(a => a === 'security_finding_auto_verified').length === 1, 'verified once');
});

console.log('== approvals nobody decides ==');
const approval = async (id, o = {}) => db.doc(`approval_requests/${id}`).set({ status: 'pending', severity: o.severity ?? 'high', title: o.title ?? 'Unescaped value', createdAt: ts(o.createdAt ?? NOW - 30 * HOUR), expiresAt: ts(o.expiresAt ?? NOW + 5 * DAY), ...(o.lastNudgedAt ? { lastNudgedAt: o.lastNudgedAt } : {}) });
await t('a high approval waiting over a day is nudged once, in a digest; not again the same day; again the next day', async () => {
  await wipe(); await approval('a1'); await approval('a2', { severity: 'critical', title: 'Secret in repo' });
  const r = await sweep(deps()); assert(r.nudged === 2 && mails.length === 1 && /2 security fixes are waiting/.test(mails[0].subject) && /Secret in repo/.test(mails[0].body), JSON.stringify(mails));
  await sweep(deps({ now: NOW + 2 * HOUR })); assert(mails.length === 1, 'quiet inside the day');
  await sweep(deps({ now: NOW + 25 * HOUR })); assert(mails.length === 2, 'again the next day');
});
await t('young, medium and low approvals are never nudged; a failed email is retried, not recorded as sent', async () => {
  await wipe(); await approval('young', { createdAt: NOW - 2 * HOUR }); await approval('med', { severity: 'medium' });
  await sweep(deps()); assert(mails.length === 0, 'nothing to nudge');
  await approval('a1'); mailOk = false; await sweep(deps()); assert((await get('approval_requests/a1')).lastNudgedAt === undefined, 'not stamped');
  mailOk = true; await sweep(deps({ now: NOW + HOUR })); assert(mails.length === 1, 'retried at the next sweep');
});
await t('an approval past its expiry is marked expired so the queue clears, and is not nudged', async () => {
  await wipe(); await approval('old', { expiresAt: NOW - HOUR });
  const r = await sweep(deps()); assert(r.expired === 1 && (await get('approval_requests/old')).status === 'expired' && mails.length === 0, JSON.stringify(r));
});

console.log('== Firestore rules drift ==');
await t('in sync (even with line-ending and trailing-space differences): silent', async () => {
  await wipe(); const r = await sweep(deps({ rules: { repoText: async () => RULES, deployed: async () => ({ text: RULES.replace(/\n/g, '\r\n').replace('{', '{  ') }) } }));
  assert(r.rules === 'in sync' && mails.length === 0, r.rules); assert(normalizeRules('a \r\nb  ') === 'a\nb', 'normalise');
});
await t('different rules are reported once a day, with both fingerprints and the deploy command; never the rules themselves', async () => {
  await wipe(); const drift = { repoText: async () => RULES, deployed: async () => ({ text: RULES.replace('false', 'true') }) };
  const r = await sweep(deps({ rules: drift })); assert(/^DRIFT/.test(r.rules) && mails.length === 1 && /firebase deploy --only firestore:rules/.test(mails[0].body) && /deployed:/.test(mails[0].body), JSON.stringify(mails));
  assert(!mails[0].body.includes('allow read'), 'the rules text is never emailed');
  await sweep(deps({ rules: drift, now: NOW + 2 * HOUR })); assert(mails.length === 1, 'not again inside the day');
  await sweep(deps({ rules: drift, now: NOW + DRIFT_REPEAT_MS + HOUR })); assert(mails.length === 2, 'again the next day');
  await sweep(deps({ rules: { repoText: async () => RULES, deployed: async () => ({ text: RULES }) }, now: NOW + 3 * DAY })); assert((await get('_ops_internal/security_sweep')).rulesDriftAlertedAt === undefined, 'cleared once back in sync');
});
await t('an unreadable deployment or an unreachable repo is "skipped" with the reason: never an alert, never a guess', async () => {
  await wipe();
  let r = await sweep(deps({ rules: { repoText: async () => RULES, deployed: async () => ({ skipped: 'the service account may not read the deployed rules (HTTP 403)' }) } })); assert(/^skipped: .*403/.test(r.rules) && mails.length === 0, r.rules);
  r = await sweep(deps({ rules: { repoText: async () => null, deployed: async () => ({ text: RULES }) } })); assert(/^skipped: could not fetch/.test(r.rules) && mails.length === 0, r.rules);
  r = await sweep(deps({ rules: { repoText: async () => RULES, deployed: async () => { throw new Error('boom'); } } })); assert(/^skipped: error: boom/.test(r.rules) && mails.length === 0, r.rules);
});

console.log('== heartbeat and the monitor ==');
await t('every sweep stamps the heartbeat the monitor watches, and records what it did', async () => {
  await wipe(); await sweep(deps());
  const hb = await get('_ops_internal/cron_security_sweep'); assert(hb.lastRunAt === NOW && hb.ok === true, JSON.stringify(hb));
  const s = await get('_ops_internal/security_sweep'); assert(s.lastRunOk === true && s.lastSummary.rules, JSON.stringify(s));
});
await t('the monitor watches the sweep, and vercel.json actually schedules it daily', () => {
  assert(/name: 'security_sweep'/.test(readFileSync(ROOT + 'api/cron/healthcheck.ts', 'utf8')), 'watched by the monitor');
  assert(JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8')).crons.some(c => c.path === '/api/cron/security-sweep' && /^\d+ \d+ \* \* \*$/.test(c.schedule)), 'scheduled daily');
});

console.log('== re-raising an approval for an open finding ==');
await t('an open finding with NO pending approval needs a fresh one; with a pending one, or being handled, or low risk, it does not', async () => {
  await wipe();
  await db.doc('security_findings/f1').set({ status: 'approval_pending', riskScore: 80 });
  assert(await needsFreshApproval(db, 'f1', { status: 'approval_pending', riskScore: 80 }) === true, 'orphaned');
  await db.doc('approval_requests/x').set({ findingId: 'f1', status: 'expired' });
  assert(await needsFreshApproval(db, 'f1', { status: 'approval_pending', riskScore: 80 }) === true, 'only an expired one');
  await db.doc('approval_requests/y').set({ findingId: 'f1', status: 'pending' });
  assert(await needsFreshApproval(db, 'f1', { status: 'approval_pending', riskScore: 80 }) === false, 'a pending one exists');
  assert(await needsFreshApproval(db, 'f2', { status: 'executing', riskScore: 80 }) === false, 'being executed');
  assert(await needsFreshApproval(db, 'f2', { status: 'remediation_pending', riskScore: 80 }) === false, 'a fix is open');
  assert(await needsFreshApproval(db, 'f2', { status: 'approval_pending', riskScore: 30 }) === false, 'below the approval threshold');
});

console.log('== alert sender copies ==');
await t('the sweep carries the same alert sender as every other alerting route', () => {
  const grab = f => readFileSync(ROOT + f, 'utf8').match(/\/\/ <alert-sender>\n([\s\S]*?)\/\/ <\/alert-sender>/)?.[1];
  assert(grab('api/cron/security-sweep.ts') && grab('api/cron/security-sweep.ts') === grab('api/cron/healthcheck.ts'), 'api/cron/security-sweep.ts differs from api/cron/healthcheck.ts');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
