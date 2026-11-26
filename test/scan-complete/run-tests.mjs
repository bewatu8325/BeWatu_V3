// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/scan-complete/run-tests.mjs"
// Guards what keeps the security alerts honest:
//   - a scan of main closes the findings it no longer sees (and withdraws their approvals, so nobody is nudged about them)
//   - only main, only complete result sets, never a finding being worked on; a broken scan cannot wipe the board (safety brake)
//   - a finding is never rated higher than its scanner rated it (no more daily CRITICAL for a Semgrep "warning")
//   - the nudge digest groups duplicates and says where they are
//   - every GitHub Action is pinned to a commit SHA, and Dependabot waits a week before proposing a new release
import { readFileSync, readdirSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { reconcile, HttpError, BRAKE } from '../../api/security/scan-complete.ts';
import { capSeverity, recapReported } from '../../api/security/finding.ts';
import { nudgeLines, shortTitle } from '../../api/cron/security-sweep.ts';

let pass = 0, fail = 0;
async function t(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, text) => { try { await p; } catch (e) { if (e instanceof HttpError && e.status === status && (!text || e.message.includes(text))) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('should have been refused'); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-scan-complete' });
const db = getFirestore();
const ROOT = new URL('../../', import.meta.url).pathname;
const alerts = [];
const deps = () => ({ db, now: 1_800_000_000_000, alert: async (s, b) => { alerts.push({ s, b }); return true; } });
const wipe = async () => { for (const c of ['security_findings', 'approval_requests', 'remediation_plans', 'audit_log']) { const s = await db.collection(c).get(); await Promise.all(s.docs.map(x => x.ref.delete())); } alerts.length = 0; };
const TAG = 'Semgrep: yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag';
async function finding(id, o = {}) {
  await db.doc(`security_findings/${id}`).set({ title: o.title ?? TAG, sensor: o.sensor ?? 'code-analysis', repo: o.repo ?? 'bewatu_v3', status: o.status ?? 'approval_pending', evidence: { filePath: o.file ?? `.github/workflows/${id}.yml` }, remediationPlanId: `p-${id}` });
  await db.doc(`remediation_plans/p-${id}`).set({ findingId: id, status: 'pending_approval' });
  await db.doc(`approval_requests/a-${id}`).set({ findingId: id, status: 'pending', severity: 'critical', title: o.title ?? TAG });
}
const status = async id => (await db.doc(`security_findings/${id}`).get()).data().status;
const main = (present, o = {}) => ({ sensor: 'code-analysis', repo: 'bewatu_v3', ref: 'refs/heads/main', present, ...o });

console.log('== a scan of main closes what it no longer sees ==');
await t('gone findings are verified, their approvals withdrawn and plans superseded; present ones stay open', async () => {
  await wipe(); await finding('ci'); await finding('security'); await finding('rollback');
  const r = await reconcile(deps(), main([{ title: TAG, filePath: '.github/workflows/rollback.yml' }]));
  assert(r.closed === 2 && r.open === 3, JSON.stringify(r));
  assert(await status('ci') === 'verified' && await status('security') === 'verified' && await status('rollback') === 'approval_pending', 'statuses');
  const f = (await db.doc('security_findings/ci').get()).data(); assert(f.verifiedBy === 'scan' && /no longer reported/.test(f.resolution), JSON.stringify(f));
  assert((await db.doc('approval_requests/a-ci').get()).data().status === 'superseded' && (await db.doc('approval_requests/a-rollback').get()).data().status === 'pending', 'approvals');
  assert((await db.doc('remediation_plans/p-ci').get()).data().status === 'superseded', 'plan');
  assert((await db.collection('audit_log').get()).docs.filter(d => d.data().action === 'security_finding_resolved_by_scan').length === 2, 'audited');
});
await t('it only ever touches this scanner, this repository, and open findings; a finding being executed is left alone', async () => {
  await wipe();
  await finding('mine'); await finding('ops', { repo: 'bewatu_ops' }); await finding('deps', { sensor: 'dependency-risk' }); await finding('runtime', { sensor: 'runtime-anomaly' });
  await finding('fp', { status: 'false_positive' }); await finding('busy', { status: 'executing' });
  const r = await reconcile(deps(), main([]));
  assert(await status('mine') === 'verified', 'mine closed');
  for (const [id, want] of [['ops', 'approval_pending'], ['deps', 'approval_pending'], ['runtime', 'approval_pending'], ['fp', 'false_positive'], ['busy', 'executing']]) assert(await status(id) === want, `${id} should stay ${want}`);
  assert(r.skippedExecuting === 1, JSON.stringify(r));
});
await t('running it again closes nothing more (idempotent)', async () => {
  await wipe(); await finding('a'); await reconcile(deps(), main([]));
  const r = await reconcile(deps(), main([])); assert(r.closed === 0 && r.open === 0, JSON.stringify(r));
});

console.log('== only what can be trusted ==');
await t('refused: a branch other than main, a scanner without complete results, an unknown repo, a truncated or malformed list', async () => {
  await wipe(); await finding('x');
  await refuses(reconcile(deps(), main([], { ref: 'refs/heads/feature' })), 400, 'main');
  await refuses(reconcile(deps(), main([], { ref: undefined })), 400, 'main');
  await refuses(reconcile(deps(), main([], { sensor: 'runtime-anomaly' })), 400, 'complete result sets');
  await refuses(reconcile(deps(), main([], { repo: 'somewhere' })), 400, 'Unknown');
  await refuses(reconcile(deps(), main([], { truncated: true })), 409, 'truncated');
  await refuses(reconcile(deps(), main('nope')), 400);
  await refuses(reconcile(deps(), main(new Array(2001).fill({ title: 'x' }))), 400);
  assert(await status('x') === 'approval_pending', 'nothing closed by any refused call');
});
await t('SAFETY BRAKE: a scan that would close 10+ and more than half of what is open is refused, an operator is alerted, nothing changes', async () => {
  await wipe(); for (let i = 0; i < 12; i++) await finding(`f${i}`);
  await refuses(reconcile(deps(), main([])), 409, 'safety brake');
  assert(alerts.length === 1 && /refused/.test(alerts[0].s) && /scanner may have failed/.test(alerts[0].b), JSON.stringify(alerts));
  for (let i = 0; i < 12; i++) assert(await status(`f${i}`) === 'approval_pending', `f${i} was closed`);
});
await t('the brake allows ordinary progress: a few at a time, or a big share of a small set', async () => {
  await wipe(); for (let i = 0; i < 12; i++) await finding(`f${i}`);
  const keep = Array.from({ length: 7 }, (_, i) => ({ title: TAG, filePath: `.github/workflows/f${i}.yml` }));
  assert((await reconcile(deps(), main(keep))).closed === 5, '5 of 12');
  await wipe(); for (let i = 0; i < BRAKE.minCount - 1; i++) await finding(`s${i}`);
  assert((await reconcile(deps(), main([]))).closed === BRAKE.minCount - 1, 'all 9 of 9 is fine: below the brake count');
});

console.log('== severity is never inflated ==');
await t('a finding is never rated above what its scanner said; it is never raised; with no reported severity nothing changes', () => {
  const crit = { riskScore: 86, severity: 'critical' };
  const m = capSeverity(crit, 'medium'); assert(m.severity === 'medium' && m.riskScore === 64, JSON.stringify(m));
  const h = capSeverity(crit, 'high'); assert(h.severity === 'high' && h.riskScore === 84, JSON.stringify(h));
  assert(capSeverity(crit, 'critical').severity === 'critical' && capSeverity(crit, 'CRITICAL').severity === 'critical', 'critical stays');
  assert(capSeverity({ riskScore: 30, severity: 'low' }, 'critical').severity === 'low', 'never raised');
  for (const r of [undefined, null, '', 'urgent', 7]) assert(capSeverity(crit, r).severity === 'critical', `unchanged for ${r}`);
  assert(capSeverity(crit, 'medium').riskScore < 65, 'a Semgrep warning no longer reaches the alert or nudge threshold (65)');
});

await t('an old finding stored above its scanner\'s rating is corrected when reported again; below the approval line its approval is withdrawn', async () => {
  await wipe();
  await finding('note'); await db.doc('security_findings/note').update({ riskScore: 86, severity: 'critical' });
  const low = await recapReported(db, 'note', (await db.doc('security_findings/note').get()).data(), 'low');
  assert(low.severity === 'low' && low.riskScore === 39 && low.status === 'triaged' && low.severityCappedFrom === 'critical', JSON.stringify(low));
  const a = (await db.doc('approval_requests/a-note').get()).data(); assert(a.status === 'superseded' && /rates it low/.test(a.supersededReason), JSON.stringify(a));
  assert((await db.doc('remediation_plans/p-note').get()).data().status === 'superseded', 'plan');
  await finding('warn'); await db.doc('security_findings/warn').update({ riskScore: 86, severity: 'critical' });
  const med = await recapReported(db, 'warn', (await db.doc('security_findings/warn').get()).data(), 'medium');
  assert(med.severity === 'medium' && med.riskScore === 64 && med.status === undefined, JSON.stringify(med));
  const b = (await db.doc('approval_requests/a-warn').get()).data(); assert(b.status === 'pending' && b.severity === 'medium' && b.riskScore === 64, JSON.stringify(b));
  assert(Object.keys(await recapReported(db, 'warn', { riskScore: 64, severity: 'medium', status: 'approval_pending' }, 'medium')).length === 0, 'already right: nothing changes');
  assert(Object.keys(await recapReported(db, 'warn', { riskScore: 86, severity: 'critical', status: 'approval_pending' }, undefined)).length === 0, 'no reported severity: nothing changes');
});
await t('the scan step rates a Semgrep note as low and a warning as medium', () => {
  assert(readFileSync(ROOT + '.github/workflows/security.yml', 'utf8').includes("severity: r.level === 'error' ? 'high' : r.level === 'warning' ? 'medium' : 'low'"), 'mapping');
});

console.log('== the nudge says what and where ==');
await t('duplicates are grouped with a count and their places; titles are readable; most severe first', () => {
  const due = [...Array.from({ length: 9 }, (_, i) => ({ title: TAG, severity: 'critical', hours: 26 + i, where: `BeWatu_V3 .github/workflows/f${i}.yml` })),
    { title: 'Semgrep: package_managers.dependabot.dependabot-missing-cooldown.dependabot-missing-cooldown', severity: 'high', hours: 30, where: 'BeWatu_V3 .github/dependabot.yml' }];
  const lines = nudgeLines(due);
  assert(lines.length === 2, JSON.stringify(lines));
  assert(/^- \[CRITICAL\] Semgrep: github-actions-mutable-action-tag \(x9\), waiting 34h: BeWatu_V3 \.github\/workflows\/f0\.yml/.test(lines[0]) && /and 4 more/.test(lines[0]), lines[0]);
  assert(/^- \[HIGH\] Semgrep: dependabot-missing-cooldown, waiting 30h: BeWatu_V3 \.github\/dependabot\.yml$/.test(lines[1]), lines[1]);
  assert(shortTitle('Not a semgrep title') === 'Not a semgrep title', 'other titles unchanged');
});

console.log('== the configuration the scanner flagged ==');
await t('every GitHub Action in every workflow is pinned to a full commit SHA (with its version as a comment)', () => {
  const bad = [];
  for (const f of readdirSync(ROOT + '.github/workflows')) for (const [i, line] of readFileSync(`${ROOT}.github/workflows/${f}`, 'utf8').split('\n').entries()) {
    const m = line.match(/uses:\s*([^\s#]+)@([^\s#]+)/); if (m && !/^[0-9a-f]{40}$/.test(m[2])) bad.push(`${f}:${i + 1} ${m[1]}@${m[2]}`);
  }
  assert(!bad.length, 'unpinned: ' + bad.join(', '));
});
await t('Dependabot waits a week before proposing a new release', () => { assert(/cooldown:\s*\n\s*default-days:\s*7/.test(readFileSync(ROOT + '.github/dependabot.yml', 'utf8')), 'no cooldown'); });
await t('the scan step closes findings only for a completed scan of main, through the endpoint with the brake; a nosemgrep result counts as gone', () => {
  const wf = readFileSync(ROOT + '.github/workflows/security.yml', 'utf8');
  assert(wf.includes("IS_MAIN_SCAN: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/main' }}") && wf.includes('executionSuccessful') && wf.includes('/api/security/scan-complete') && wf.includes('truncated: present.length > 2000') && wf.includes('.filter(r => !(r.suppressions && r.suppressions.length))'), 'scan step');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
