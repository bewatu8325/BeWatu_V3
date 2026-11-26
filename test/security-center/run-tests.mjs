// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/security-center/run-tests.mjs"
// The Security Center (api/security/center.ts) and the enforcement it relies on in the pipeline:
//   - honest numbers: no telemetry is "unavailable" or "never", not zero; no score without enough coverage; caps that override
//   - the lifecycle Detected -> ... -> Closed, priority, deadlines, OWASP/CWE/CVE mapping, redaction of credentials
//   - authorization: roles enforced on the server, a fresh sign-in for sensitive actions, every action in a hash-chained log
//   - autonomy: observe/propose/auto_low_risk, the suspension switch (in Firestore and in the environment), the agent's cap
//   - the whole lifecycle end to end in a controlled environment (emulator, fake GitHub, fake AI): detect, validate, prioritize,
//     propose, approve, generate a fix and pull request, test, merge, verify, close, and reopen when it comes back
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as C from '../../api/security/center.ts';
import { ingest } from '../../api/security/finding.ts';
import { decide } from '../../api/security/approve.ts';
import { check as verifyCheck } from '../../api/security/verify.ts';
import { sweep } from '../../api/cron/security-sweep.ts';
import { reconcile } from '../../api/security/scan-complete.ts';
import { detect, normalizeLogs, clientKey } from '../../api/security/runtime-anomaly.ts';

let pass = 0, fail = 0;
async function t(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.stack?.split('\n').slice(0, 3).join(' | ') ?? e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, text) => { try { await p; } catch (e) { if (e.status === status && (!text || String(e.message).includes(text))) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('should have been refused'); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-security-center' });
const db = getFirestore();
const ROOT = new URL('../../', import.meta.url).pathname;
const H = 3_600_000, D = 24 * H, NOW = 1_800_000_000_000, NOW_S = Math.floor(NOW / 1000);
const COLLECTIONS = ['security_findings', 'approval_requests', 'remediation_plans', 'audit_log', 'security_incidents', 'security_events', 'security_policy', 'security_audit', 'security_audit_meta', 'security_metrics', 'security_drills', '_ops_internal', 'ops_staff', 'security_config'];
const wipe = async () => { for (const c of COLLECTIONS) { const s = await db.collection(c).get(); await Promise.all(s.docs.map(x => x.ref.delete())); } alerts.length = 0; };
const alerts = []; const alert = async (s, b) => { alerts.push({ s, b }); return true; };
const get = async p => (await db.doc(p).get()).data();
const data = (o = {}) => ({ findings: [], approvals: [], plans: [], incidents: [], events: [], drills: [], metrics: [], audit: [], pipelineAudit: [], internal: {}, policy: undefined, notifications: undefined, platformAdmins: null, github: C.emptyGitHub('not configured in this test'), env: { has: {}, automationKill: false }, ...o });
const admin = { uid: 'admin1', email: 'admin@bewatu.com', role: 'platform_admin', authTime: NOW_S - 60 };
const cyber = { uid: 'cyber1', email: 'cyber@bewatu.com', role: 'cyber_agent', authTime: NOW_S - 60 };
const auditor = { uid: 'aud1', email: 'audit@bewatu.com', role: 'auditor', authTime: NOW_S - 60 };
const deps = (o = {}) => ({ db, now: o.now ?? NOW, env: o.env ?? {}, github: o.github ?? null, alert });
const staff = async () => { for (const a of [admin, cyber, auditor]) await db.doc(`ops_staff/${a.uid}`).set({ role: a.role, isActive: true, email: a.email }); };
const fresh = (o = {}) => ({ uptime_state: { lastRunAt: NOW - 2 * 60_000, lastRunOk: true, alertChannelOk: true, alertChannelCheckedAt: NOW - D }, cron_security_sweep: { lastRunAt: NOW - 3 * H, ok: true },
  security_sweep: { lastRunAt: NOW - 3 * H, lastSummary: { rules: 'in sync', githubErrors: 0 } }, collection_counts: { samples: [{ at: NOW - 3 * 60_000, counts: {} }] }, privileged_snapshot: { staff: {} },
  scan_state: Object.fromEntries(['bewatu_v3', 'bewatu_ops', 'bewatu_factory'].flatMap(r => [[`code-analysis:${r}`, { lastCompleteAt: NOW - D, present: 0 }], [`dependency-risk:${r}`, { lastCompleteAt: NOW - D, present: 0 }]])),
  runtime_sensor: { lastBatchAt: NOW - 10 * 60_000, lastBatchSize: 40 }, posture_state: { lastRunAt: NOW - 2 * H, lastRunOk: true, certsCheckedAt: NOW - 2 * H, certs: [{ host: 'www.bewatu.com', daysLeft: 60 }] },
  recovery_state: { checkedAt: NOW - 2 * H, pitr: 'POINT_IN_TIME_RECOVERY_ENABLED', deleteProtection: 'DELETE_PROTECTION_ENABLED', backups: { count: 30, newestAt: NOW - 10 * H } }, ...o });

// ═════════════════════════════════════════════════════════════════════════════
console.log('== honest numbers ==');
await t('with no telemetry at all: no score, sensors "never"/"not configured"/"unavailable", detection time not measurable, nothing shown as zero risk', () => {
  const s = C.buildSnapshot(data(), NOW, { role: 'auditor' });
  assert(s.posture.score === null && s.posture.grade === 'Insufficient data' && /telemetry/.test(s.posture.reason), JSON.stringify(s.posture));
  const by = id => s.coverage.sensors.find(x => x.id === id);
  assert(by('uptime-monitor').status === 'never' && by('runtime-sensor').status === 'not_configured' && by('outside-watchdog').status === 'unavailable' && by('ci-security:bewatu_v3').status === 'unavailable', JSON.stringify(s.coverage.sensors.map(x => [x.id, x.status])));
  assert(s.mttd.medianMinutes === null && /Not measurable/.test(s.mttd.note) && s.mttr.overall.medianHours === null, 'mttd/mttr');
  assert(s.vulnerabilities.lastScanAt === null && s.threats.blocked.measured === false, 'no scan, blocking not measured');
  assert(s.attention.some(a => a.kind === 'coverage' && /never reported/.test(a.text)), 'coverage gaps are called out');
  assert(s.controls.find(c => c.id === 'rec.pitr').status === 'unknown' && s.controls.find(c => c.id === 'rec.restore-drill').status === 'missing', 'unknown is not missing; a missing drill is missing');
  assert(!s.viewer.can.triage && !s.viewer.can.govern, 'auditor: view only');
});
await t('with healthy telemetry the score is computed, every domain shows its factors, and the methodology is in the payload', () => {
  const s = C.buildSnapshot(data({ internal: fresh(), platformAdmins: 2, drills: [{ kind: 'restore', outcome: 'passed', performedAt: NOW - 30 * D, durationMinutes: 42 }, { kind: 'alert', outcome: 'passed', performedAt: NOW - 30 * D }] }), NOW, { role: 'platform_admin' });
  assert(typeof s.posture.score === 'number' && s.posture.coverage >= 0.5 && s.posture.domains.length === 6 && s.posture.weights.vulnerability === 30, JSON.stringify(s.posture).slice(0, 400));
  assert(s.posture.domains.find(x => x.id === 'vulnerability').score === 100, 'no open findings');
  assert(s.recovery.rpo === 'About 1 minute (point-in-time recovery)' && /42 minutes/.test(s.recovery.rto), `${s.recovery.rpo} / ${s.recovery.rto}`);
  assert(s.viewer.can.triage && s.viewer.can.govern, 'admin can act');
});
await t('caps override a good score: a critical incident caps it at 40, a silent monitor at 50, and the reasons are listed', () => {
  const base = data({ internal: fresh(), platformAdmins: 1 });
  const crit = C.buildSnapshot({ ...base, incidents: [{ id: 'i1', status: 'open', severity: 'critical', title: 'x', openedAt: NOW }] }, NOW, { role: 'auditor' });
  assert(crit.posture.score <= 40 && crit.posture.caps.some(c => /critical security incident/.test(c.reason)), JSON.stringify(crit.posture.caps));
  const silent = C.buildSnapshot(data({ internal: fresh({ uptime_state: { lastRunAt: NOW - 2 * H } }), platformAdmins: 1 }), NOW, { role: 'auditor' });
  assert(silent.posture.score <= 50 && silent.posture.caps.some(c => /monitor/.test(c.reason)), JSON.stringify(silent.posture.caps));
  const vuln = C.scorePosture([], [{ severity: 'critical', status: 'approval_pending', detectedAt: NOW - 3 * D }], [], [{ id: 'code-analysis:bewatu_v3', status: 'fresh', lastAt: NOW }, { id: 'uptime-monitor', status: 'fresh' }], NOW);
  assert(vuln.domains[0].score === 75 && vuln.caps.some(c => /48-hour/.test(c.reason)), JSON.stringify(vuln));
});
await t('recovery: "not configured" is unknown (no false alarm); PITR off or no recent backup is missing; certificates under 21 days are degraded', () => {
  const skipped = C.buildSnapshot(data({ internal: fresh({ recovery_state: { skipped: 'Not configured: set X' } }) }), NOW, { role: 'auditor' });
  assert(skipped.controls.find(c => c.id === 'rec.backups').status === 'unknown' && skipped.coverage.sensors.find(s => s.id === 'recovery-telemetry').status === 'not_configured', 'skipped');
  const bad = C.buildSnapshot(data({ internal: fresh({ recovery_state: { checkedAt: NOW, pitr: 'POINT_IN_TIME_RECOVERY_DISABLED', deleteProtection: 'DELETE_PROTECTION_DISABLED', backups: { count: 1, newestAt: NOW - 3 * D } }, posture_state: { certsCheckedAt: NOW, certs: [{ host: 'a', daysLeft: 12 }] } }) }), NOW, { role: 'auditor' });
  for (const id of ['rec.pitr', 'rec.backups', 'rec.delete-protection']) assert(bad.controls.find(c => c.id === id).status === 'missing', id);
  assert(bad.controls.find(c => c.id === 'infra.tls').status === 'degraded', 'tls');
});

console.log('== findings: lifecycle, priority, deadlines, frameworks, redaction ==');
await t('the lifecycle stage follows what the pipeline really did', () => {
  const s = (f, ctx = {}) => C.stageOf(f, { approvalPending: false, pr: null, ...ctx }).stage;
  assert(s({ status: 'approval_pending', detectedAt: NOW, lastReportedAt: NOW }) === 'detected', 'one report');
  assert(s({ status: 'approval_pending', detectedAt: NOW - 2 * H, lastReportedAt: NOW }) === 'prioritized', 'seen again: validated and prioritized');
  assert(s({ status: 'approval_pending' }, { approvalPending: true }) === 'remediation_proposed', 'proposal waiting');
  assert(s({ status: 'executing' }) === 'testing' && s({ status: 'remediation_pending', prUrl: 'u' }, { pr: { checks: 'pending' } }) === 'testing', 'testing');
  assert(s({ status: 'remediation_pending', prUrl: 'u' }, { pr: { checks: 'passed' } }) === 'approval', 'checks green: awaiting the merge');
  assert(s({ status: 'remediation_pending', prMerged: true }) === 'deployment' && s({ status: 'verified' }) === 'verified' && s({ status: 'verified', closedAt: 1 }) === 'closed', 'deploy/verify/close');
  assert(C.stageOf({ status: 'false_positive' }, { approvalPending: false }).closedAs === 'false positive' && C.stageOf({ status: 'accepted_risk' }, { approvalPending: false }).closedAs === 'risk accepted', 'closed as');
});
await t('priority rises with exposure and a missed deadline; a person\'s choice wins; deadlines follow severity', () => {
  assert(C.priorityOf({ severity: 'critical', evidence: { filePath: 'api/x.ts' }, detectedAt: NOW }, NOW) === 'P1', 'internet critical');
  assert(C.priorityOf({ severity: 'high', evidence: { filePath: '.github/workflows/a.yml' }, detectedAt: NOW }, NOW) === 'P3', 'pipeline high');
  assert(C.priorityOf({ severity: 'high', evidence: { filePath: '.github/workflows/a.yml' }, detectedAt: NOW - 8 * D, status: 'approval_pending' }, NOW) === 'P2', 'late: raised');
  assert(C.priorityOf({ severity: 'low', priority: 'P1' }, NOW) === 'P1', 'manual');
  const sla = C.slaOf({ severity: 'critical', detectedAt: NOW - 49 * H, status: 'approval_pending' }, NOW); assert(sla.breached && sla.dueAt === NOW - H, JSON.stringify(sla));
  assert(!C.slaOf({ severity: 'critical', detectedAt: NOW - 49 * H, status: 'verified' }, NOW).breached, 'closed is never late');
});
await t('OWASP, CWE and CVE/GHSA: the scanner\'s own metadata first, then the rule family; dependencies map to A06', () => {
  const dep = C.frameworksOf({ sensor: 'dependency-risk', cveIds: ['GHSA-rq7h-c2jc-7f22'], cweIds: ['CWE-200'] });
  assert(dep.owasp[0].startsWith('A06:2021') && dep.cve[0] === 'GHSA-rq7h-c2jc-7f22' && dep.cwe[0] === 'CWE-200', JSON.stringify(dep));
  const own = C.frameworksOf({ sensor: 'code-analysis', title: 'Semgrep: x.cors-misconfiguration', owasp: ['A07:2021 Identification'], cweIds: ['CWE-346'] }); assert(own.owasp[0].startsWith('A07'), JSON.stringify(own));
  const fam = C.frameworksOf({ sensor: 'code-analysis', title: 'Semgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration' }); assert(fam.cwe[0] === 'CWE-346', JSON.stringify(fam));
});
await t('credentials are redacted from evidence (kept recognisable), ordinary text is untouched', () => {
  const secrets = ['ghp_' + 'a'.repeat(36), 'sk_live_' + 'b'.repeat(24), 'AKIA' + 'C'.repeat(16), 're_' + 'd'.repeat(30), 'AIza' + 'e'.repeat(35)];
  const pem = (edge) => `-----${edge} ` + 'PRIVATE KEY-----';   // assembled, so no literal key block sits in the repository
  const out = C.redact(`token ${secrets.join(' ')} password="hunter2hunter2" ${pem('BEGIN')}\nabc\n${pem('END')} ok`);
  for (const x of secrets) assert(!out.includes(x), `leaked ${x.slice(0, 6)}`);
  assert(!out.includes('hunter2hunter2') && !out.includes('abc\n') && out.includes('[REDACTED]') && out.endsWith(' ok'), out);
  assert(C.redact('A plain description of a CORS issue in api/x.ts') === 'A plain description of a CORS issue in api/x.ts', 'plain text');
});

console.log('== the audit log shows tampering ==');
await t('every entry links to the one before; editing or deleting an entry is detected', async () => {
  await wipe();
  for (let i = 0; i < 4; i++) await C.appendAudit(db, NOW + i, admin, 'validate', `f${i}`, { note: `n${i}` });
  const load = async () => (await db.collection('security_audit').orderBy('seq', 'desc').get()).docs.map(x => x.data());
  let es = await load(); assert(C.verifyChain(es).ok && es.length === 4 && es[0].seq === 4, JSON.stringify(C.verifyChain(es)));
  await db.doc('security_audit/0000000002').update({ details: { note: 'changed' } });
  es = await load(); assert(!C.verifyChain(es).ok && C.verifyChain(es).brokenAt === 2, 'edit detected');
  await db.doc('security_audit/0000000002').delete(); es = await load(); assert(!C.verifyChain(es).ok && C.verifyChain(es).brokenAt === 3, 'gap detected');
});

console.log('== authorization: roles on the server, a fresh sign-in for sensitive actions ==');
await t('auditors only view; cyber agents triage but cannot govern; unknown actions are refused', async () => {
  await wipe(); await staff(); await db.doc('security_findings/f1').set({ title: 'x', status: 'approval_pending', severity: 'high', riskScore: 70 });
  await refuses(C.act(deps(), auditor, { action: 'validate', findingId: 'f1' }), 403, 'auditor');
  await refuses(C.act(deps(), cyber, { action: 'policy_set', mode: 'observe', maxAgentPrsPerDay: 0, lowRiskRules: [] }), 403, 'cyber_agent');
  await refuses(C.act(deps(), admin, { action: 'delete_everything' }), 400, 'Unknown');
  assert((await C.act(deps(), cyber, { action: 'validate', findingId: 'f1', note: 'reproduced' })).ok, 'cyber validates');
});
await t('accepting a risk, changing policy, suspending and confirming a brake need a sign-in from the last 10 minutes', async () => {
  await wipe(); await staff(); await db.doc('security_findings/f1').set({ title: 'x', status: 'approval_pending', severity: 'high', riskScore: 70 });
  const stale = { ...admin, authTime: NOW_S - 11 * 60 };
  for (const body of [{ action: 'accept_risk', findingId: 'f1', reason: 'compensating control in place', days: 30 }, { action: 'policy_set', mode: 'observe', maxAgentPrsPerDay: 0, lowRiskRules: [] }, { action: 'automation_suspend', reason: 'testing' }, { action: 'brake_confirm', sensor: 'code-analysis', repo: 'bewatu_v3' }])
    await refuses(C.act(deps(), stale, body), 401, 'step_up_required');
  await refuses(C.act(deps(), { ...admin, authTime: null }, { action: 'automation_suspend', reason: 'testing' }), 401, 'step_up_required');
  assert((await C.act(deps(), admin, { action: 'accept_risk', findingId: 'f1', reason: 'compensating control in place', days: 30 })).ok, 'fresh admin');
});

console.log('== triage and governance actions ==');
await t('assign: only an active admin or cyber agent can own a finding; false positive closes it and withdraws its approval and plan', async () => {
  await wipe(); await staff(); await db.doc('ops_staff/x').set({ role: 'support_agent', isActive: true, email: 's@b' });
  await db.doc('security_findings/f1').set({ title: 'x', status: 'approval_pending', severity: 'high', riskScore: 70, remediationPlanId: 'p1' });
  await db.doc('remediation_plans/p1').set({ status: 'pending_approval' }); await db.doc('approval_requests/a1').set({ findingId: 'f1', status: 'pending' });
  await refuses(C.act(deps(), admin, { action: 'assign', findingId: 'f1', ownerUid: 'x' }), 400, 'owner');
  await C.act(deps(), admin, { action: 'assign', findingId: 'f1', ownerUid: 'cyber1' }); assert((await get('security_findings/f1')).owner.email === 'cyber@bewatu.com', 'owner');
  await refuses(C.act(deps(), cyber, { action: 'false_positive', findingId: 'f1', reason: 'short' }), 400, 'at least 10');
  await C.act(deps(), cyber, { action: 'false_positive', findingId: 'f1', reason: 'The origin comes from a fixed list.' });
  assert((await get('security_findings/f1')).status === 'false_positive' && (await get('approval_requests/a1')).status === 'superseded' && (await get('remediation_plans/p1')).status === 'superseded', 'closed and withdrawn');
  const chain = (await db.collection('security_audit').get()).docs.map(x => x.data().action).sort(); assert(chain.join() === 'assign,false_positive', chain.join());
});
await t('risk acceptance is time-limited (1 to 90 days) and the sweep reopens it when it runs out; reopen by hand needs a reason', async () => {
  await wipe(); await staff(); await db.doc('security_findings/f1').set({ title: 'x', status: 'approval_pending', severity: 'high', riskScore: 70 });
  await refuses(C.act(deps(), admin, { action: 'accept_risk', findingId: 'f1', reason: 'compensating control', days: 365 }), 400, '1 to 90');
  await C.act(deps(), admin, { action: 'accept_risk', findingId: 'f1', reason: 'compensating control', days: 7 });
  const f = await get('security_findings/f1'); assert(f.status === 'accepted_risk' && f.acceptedUntil === NOW + 7 * D, JSON.stringify(f));
  const sw = await sweep({ db, now: NOW + 8 * D, send: alert, github: { prState: async () => ({ merged: false, mergedAt: null, closed: false }) }, rules: { repoText: async () => null, deployed: async () => ({ skipped: 'test' }) } });
  assert(sw.reopenedExpired === 1 && (await get('security_findings/f1')).status === 'approval_pending' && (await get('security_findings/f1')).reopenCount === 1, JSON.stringify(sw));
  await db.doc('security_findings/f2').set({ title: 'y', status: 'verified', riskScore: 30 });
  await refuses(C.act(deps(), cyber, { action: 'reopen', findingId: 'f2', reason: 'no' }), 400, 'at least 10');
  await C.act(deps(), cyber, { action: 'reopen', findingId: 'f2', reason: 'It is back in production logs.' }); assert((await get('security_findings/f2')).status === 'triaged', 'reopened');
});
await t('incidents: opened with a timeline (and an alert when high), containment recorded, resolution required, resolved ones are final', async () => {
  await wipe(); await staff(); await db.doc('security_events/e1').set({ type: 'AUTH_FAILURE_SPIKE', severity: 'high', timestamp: Timestamp.fromMillis(NOW - 30 * 60_000) });
  const out = await C.act(deps(), cyber, { action: 'incident_open', title: 'Credential stuffing on login', severity: 'high', summary: 'Spike of auth failures from many clients.', affected: ['firebase_auth'], eventIds: ['e1'] });
  assert(alerts.some(a => /incident opened \(high\)/.test(a.s)) && (await get('security_events/e1')).incidentId === out.id, 'alerted and linked');
  await C.act(deps(), cyber, { action: 'incident_update', incidentId: out.id, status: 'contained', note: 'Rate limit tightened', containment: 'Login rate limit lowered to 5/min' });
  await refuses(C.act(deps(), cyber, { action: 'incident_update', incidentId: out.id, status: 'resolved', note: 'done' }), 400, 'resolution');
  await C.act(deps(), cyber, { action: 'incident_update', incidentId: out.id, status: 'resolved', note: 'No accounts taken over', resolution: 'Blocked; all affected users reset passwords.' });
  const i = await get(`security_incidents/${out.id}`); assert(i.status === 'resolved' && i.timeline.length === 3 && i.containment.length === 1 && i.firstSignalAt === NOW - 30 * 60_000, JSON.stringify(i));
  await refuses(C.act(deps(), cyber, { action: 'incident_update', incidentId: out.id, note: 'more' }), 409, 'resolved');
  const s = C.buildSnapshot(data({ incidents: [{ id: out.id, ...i }] }), NOW, { role: 'auditor' }); assert(s.mttd.medianMinutes === 30 && s.mttd.n === 1, JSON.stringify(s.mttd));
});
await t('policy: only catalogued low-risk rules, a cap of 0 to 5; notifications are switches; every change is audited with before and after', async () => {
  await wipe(); await staff();
  await refuses(C.act(deps(), admin, { action: 'policy_set', mode: 'auto_low_risk', maxAgentPrsPerDay: 2, lowRiskRules: ['cors-misconfiguration'] }), 400, 'low-risk catalog');
  await refuses(C.act(deps(), admin, { action: 'policy_set', mode: 'yolo', maxAgentPrsPerDay: 2, lowRiskRules: [] }), 400, 'mode');
  await C.act(deps(), admin, { action: 'policy_set', mode: 'auto_low_risk', maxAgentPrsPerDay: 1, lowRiskRules: ['github-actions-mutable-action-tag'] });
  const p = C.readPolicy(await get('security_policy/autonomy'), {}); assert(p.mode === 'auto_low_risk' && p.maxAgentPrsPerDay === 1 && !p.suspended, JSON.stringify(p));
  await refuses(C.act(deps(), admin, { action: 'notifications_set', coverage: 'yes', backup: true, certificates: true, sla: true }), 400);
  await C.act(deps(), admin, { action: 'notifications_set', coverage: false, backup: true, certificates: true, sla: true });
  const a = (await db.collection('security_audit').get()).docs.map(x => x.data()).find(x => x.action === 'policy_set'); assert(a.details.from === 'default' && a.details.to.mode === 'auto_low_risk', JSON.stringify(a.details));
});
await t('the environment switch suspends automation even when Firestore says otherwise', () => {
  assert(C.readPolicy({ mode: 'auto_low_risk', suspended: false }, { SECURITY_AUTOMATION_DISABLED: '1' }).suspended, 'env kill');
  assert(C.readPolicy({ mode: 'nonsense', lowRiskRules: ['rm -rf', 'missing-integrity'], maxAgentPrsPerDay: 99 }, {}).mode === 'propose', 'bad mode falls back');
  const p = C.readPolicy({ lowRiskRules: ['rm -rf', 'missing-integrity'], maxAgentPrsPerDay: 99 }, {}); assert(p.lowRiskRules.join() === 'missing-integrity' && p.maxAgentPrsPerDay === 5, JSON.stringify(p));
});
await t('a refused reconciliation is confirmed by an admin: each finding is re-checked, one reported again since is kept', async () => {
  await wipe(); await staff();
  for (const id of ['g1', 'g2', 'g3']) await db.doc(`security_findings/${id}`).set({ title: `t${id}`, sensor: 'code-analysis', repo: 'bewatu_v3', status: 'approval_pending', lastReportedAt: Timestamp.fromMillis(NOW - 2 * D) });
  await db.doc('security_findings/g3').update({ lastReportedAt: Timestamp.fromMillis(NOW - H) });
  await db.doc('_ops_internal/scan_state').set({ 'code-analysis:bewatu_v3': { pendingClose: { ids: ['g1', 'g2', 'g3'], open: 4, at: NOW - D } } });
  const out = await C.act(deps(), admin, { action: 'brake_confirm', sensor: 'code-analysis', repo: 'bewatu_v3' });
  assert(out.closed === 2 && out.skipped === 1 && (await get('security_findings/g3')).status === 'approval_pending' && (await get('security_findings/g1')).status === 'verified', JSON.stringify(out));
  await refuses(C.act(deps(), admin, { action: 'brake_confirm', sensor: 'code-analysis', repo: 'bewatu_v3' }), 404, 'Nothing');
});
await t('drills are recorded with validation; scans start through GitHub only when a token is configured', async () => {
  await wipe(); await staff();
  await refuses(C.act(deps(), admin, { action: 'drill_record', kind: 'restore', outcome: 'passed', performedAt: '2030-01-01', notes: 'Restored to a scratch database.' }), 400, 'within the last year');
  await C.act(deps(), admin, { action: 'drill_record', kind: 'restore', outcome: 'passed', performedAt: new Date(NOW - D).toISOString(), durationMinutes: 35, notes: 'Restored to a scratch database and compared counts.' });
  await refuses(C.act(deps(), cyber, { action: 'scan_trigger', repo: 'bewatu_v3' }), 503, 'GITHUB_TOKEN');
  const calls = []; await C.act(deps({ github: { view: async () => C.emptyGitHub('x'), dispatch: async (r, w) => { calls.push([r, w]); } } }), cyber, { action: 'scan_trigger', repo: 'bewatu_ops' });
  assert(calls[0][0] === 'bewatu-ops' && calls[0][1] === 'security.yml', JSON.stringify(calls));
});

console.log('== the pipeline enforces the policy ==');
const SEMGREP = { sensor: 'code-analysis', category: 'vulnerability', severity: 'medium', title: 'Semgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration', description: 'CORS from user input', repo: 'bewatu_v3', evidence: { filePath: 'api/x.ts', lineNumber: 4, snippet: 'const k = "sk_live_' + 'z'.repeat(24) + '"' }, cweIds: ['CWE-346'], owasp: ['A07:2021 - Identification and Authentication Failures'] };
await t('ingest: evidence is redacted; "observe" records but proposes nothing; "propose" raises an approval', async () => {
  await wipe();
  await db.doc('security_policy/autonomy').set({ mode: 'observe' });
  const a = await ingest(deps(), SEMGREP); const f = await get(`security_findings/${a.body.id}`);
  assert(a.status === 201 && !a.body.approvalId && f.status === 'triaged' && !f.evidence.snippet.includes('z'.repeat(24)) && f.cweIds[0] === 'CWE-346' && f.owasp.length === 1, JSON.stringify(f));
  await wipe(); const b = await ingest(deps(), SEMGREP); assert(b.body.approvalId, 'proposed');
});
await t('ingest: a false positive is not re-created by the next scan; a verified fix that comes back is reopened, with history kept', async () => {
  await wipe(); const a = await ingest(deps(), SEMGREP);
  await db.doc(`security_findings/${a.body.id}`).update({ status: 'false_positive' });
  const again = await ingest(deps(), SEMGREP); assert(again.body.closedAs === 'false_positive' && (await db.collection('security_findings').get()).size === 1, JSON.stringify(again.body));
  await db.doc(`security_findings/${a.body.id}`).update({ status: 'verified', closedAt: NOW });
  const back = await ingest(deps(), SEMGREP); const f = await get(`security_findings/${a.body.id}`);
  assert(back.body.reopened && f.reopenCount === 1 && f.closedAt === undefined && (await db.collection('security_findings').get()).size === 1, JSON.stringify(f));
  assert((await db.collection('audit_log').get()).docs.some(x => x.data().action === 'security_finding_reopened') && alerts.some(x => /came back/.test(x.s)), 'audited and alerted');
});
const fakeGithub = () => { const calls = []; return { calls, getFile: async () => 'const a = 1;\nres.setHeader("Access-Control-Allow-Origin", req.headers.origin);\n', openFixPr: async a => { calls.push(['pr', a]); return { prUrl: 'https://github.com/bewatu8325/BeWatu_V3/pull/901', prNumber: 901 }; }, openIssue: async a => { calls.push(['issue', a]); return { issueUrl: 'https://github.com/bewatu8325/BeWatu_V3/issues/902', issueNumber: 902 }; } }; };
const fakeFix = async (_f, content) => ({ fixedContent: content.replace('req.headers.origin', 'ALLOWED.find(o => o === req.headers.origin) ?? ALLOWED[0]'), explanation: 'Answer only with listed origins.', summary: 'Pick CORS origin from the allowlist' });
// Approvals are dated by ingest on the real clock, so the approve and sweep steps below run on it too.
const REAL = () => Date.now(), signedIn = (secondsAgo = 30) => ({ ...admin, authTime: Math.floor(REAL() / 1000) - secondsAgo });
const approveDeps = (o = {}) => ({ db, now: o.now ?? REAL(), env: o.env ?? {}, github: o.github ?? fakeGithub(), generateFix: fakeFix, alert });
await t('approve: a person needs a fresh sign-in; the suspension switch (Firestore or environment) blocks every fix but not a rejection', async () => {
  await wipe(); await staff(); const a = await ingest(deps(), SEMGREP);
  await refuses(decide(approveDeps(), signedIn(3600), { approvalId: a.body.approvalId, decision: 'approved' }), 401, 'step_up_required');
  await db.doc('security_policy/autonomy').set({ mode: 'propose', suspended: true, suspendedReason: 'incident in progress' });
  await refuses(decide(approveDeps(), signedIn(), { approvalId: a.body.approvalId, decision: 'approved' }), 423, 'incident in progress');
  await db.doc('security_policy/autonomy').set({ mode: 'propose', suspended: false });
  await refuses(decide(approveDeps({ env: { SECURITY_AUTOMATION_DISABLED: 'true' } }), signedIn(), { approvalId: a.body.approvalId, decision: 'approved' }), 423, 'SECURITY_AUTOMATION_DISABLED');
  assert((await decide(approveDeps({ env: { SECURITY_AUTOMATION_DISABLED: 'true' } }), signedIn(), { approvalId: a.body.approvalId, decision: 'rejected', note: 'Will fix by hand' })).decision === 'rejected', 'rejecting still works');
});
await t('the agent: refused under "propose"; under "auto_low_risk" only listed rules within severity, never more than the daily cap, never a rejection, never the pipeline', async () => {
  await wipe(); await staff();
  const fmt = { ...SEMGREP, title: 'Semgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring', evidence: { filePath: 'api/x.ts' } };
  const tag = { ...SEMGREP, title: 'Semgrep: yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag', evidence: { filePath: '.github/workflows/a.yml' } };
  const x1 = await ingest(deps(), fmt), x2 = await ingest(deps(), { ...fmt, evidence: { filePath: 'api/y.ts' } }), cors = await ingest(deps(), { ...SEMGREP, evidence: { filePath: 'api/z.ts' } }), ci = await ingest(deps(), tag);
  const agent = { uid: 'security-agent', email: 'agent', agent: true };
  await refuses(decide(approveDeps(), agent, { approvalId: x1.body.approvalId, decision: 'approved' }), 403, '"propose"');
  await db.doc('security_policy/autonomy').set({ mode: 'auto_low_risk', maxAgentPrsPerDay: 2, lowRiskRules: ['unsafe-formatstring', 'github-actions-mutable-action-tag'], maxAutoSeverity: 'medium' });
  await refuses(decide(approveDeps(), agent, { approvalId: cors.body.approvalId, decision: 'approved' }), 403, 'low-risk list');
  await refuses(decide(approveDeps(), agent, { approvalId: x1.body.approvalId, decision: 'rejected' }), 403, 'cannot reject');
  const gh = fakeGithub(); const ok = await decide(approveDeps({ github: gh }), agent, { approvalId: x1.body.approvalId, decision: 'approved' });
  assert(ok.mode === 'auto-fix' && gh.calls[0][0] === 'pr', JSON.stringify(ok));
  const gh2 = fakeGithub(); const pipe = await decide(approveDeps({ github: gh2 }), agent, { approvalId: ci.body.approvalId, decision: 'approved' });
  assert(pipe.mode === 'issue' && gh2.calls[0][0] === 'issue' && /protected/.test(pipe.note), 'a CI file becomes an issue for a person: ' + JSON.stringify(pipe));
  await refuses(decide(approveDeps(), agent, { approvalId: x2.body.approvalId, decision: 'approved' }), 403, 'daily limit');
  assert(Object.values(await get('_ops_internal/agent_counters'))[0] === 2, 'counted');
});
await t('the sweep\'s agent pass asks only when the policy allows, and only for eligible approvals', async () => {
  await wipe();
  const fmt = { ...SEMGREP, title: 'Semgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring', evidence: { filePath: 'api/x.ts' } };
  await ingest(deps(), fmt); await ingest(deps(), { ...SEMGREP, evidence: { filePath: 'api/z.ts' } });
  const asked = []; const sw = o => sweep({ db, now: REAL(), send: alert, env: o?.env ?? {}, agentApprove: async id => { asked.push(id); return { ok: true, detail: '' }; }, github: { prState: async () => ({ merged: false, mergedAt: null, closed: false }) }, rules: { repoText: async () => null, deployed: async () => ({ skipped: 'test' }) } });
  await sw(); assert(asked.length === 0, 'propose: nothing');
  await db.doc('security_policy/autonomy').set({ mode: 'auto_low_risk', maxAgentPrsPerDay: 2, lowRiskRules: ['unsafe-formatstring'] });
  await sw({ env: { SECURITY_AUTOMATION_DISABLED: '1' } }); assert(asked.length === 0, 'env switch: nothing');
  const r = await sw(); assert(asked.length === 1 && r.agentPrs === 1, `${asked.length} ${JSON.stringify(r)}`);
});
await t('scan-complete records freshness; a brake refusal is stored for an admin to confirm', async () => {
  await wipe();
  for (let i = 0; i < 12; i++) await db.doc(`security_findings/b${i}`).set({ title: `t${i}`, sensor: 'dependency-risk', repo: 'bewatu_ops', status: 'approval_pending' });
  await reconcile({ db, now: NOW, alert }, { sensor: 'dependency-risk', repo: 'bewatu_ops', ref: 'refs/heads/main', present: [] }).catch(() => {});
  const st = (await get('_ops_internal/scan_state'))['dependency-risk:bewatu_ops']; assert(st.pendingClose.ids.length === 12 && st.refused.gone === 12 && st.lastCompleteAt === NOW, JSON.stringify(st));
  await db.doc('security_findings/b0').update({ status: 'verified' });
  await reconcile({ db, now: NOW + H, alert }, { sensor: 'dependency-risk', repo: 'bewatu_ops', ref: 'refs/heads/main', present: Array.from({ length: 11 }, (_, i) => ({ title: `t${i + 1}`, filePath: null })) });
  const st2 = (await get('_ops_internal/scan_state'))['dependency-risk:bewatu_ops']; assert(st2.pendingClose === undefined && st2.lastCompleteAt === NOW + H && st2.closed === 0, JSON.stringify(st2));
});

console.log('== runtime threats ==');
await t('refused access to staff routes, request floods, crawling and rate-limit blocks are detected per client, with hashed client ids only', () => {
  const now = NOW, L = (o) => ({ timestamp: now - 1000, proxy: { statusCode: 200, path: '/', clientIp: '203.0.113.9', userAgent: ['curl'] }, ...o });
  const raw = [
    ...Array.from({ length: 12 }, () => L({ proxy: { statusCode: 403, path: '/api/ops/user-data', clientIp: '198.51.100.7', userAgent: ['x'] } })),
    ...Array.from({ length: 160 }, (_, i) => L({ proxy: { statusCode: 200, path: `/be/user${i}/work`, clientIp: '203.0.113.9', userAgent: ['scraper'] } })),
    ...Array.from({ length: 160 }, (_, i) => L({ proxy: { statusCode: 200, path: `/be/user${i}/work`, clientIp: '192.0.2.1', userAgent: ['Googlebot/2.1'] } })),
    ...Array.from({ length: 25 }, () => L({ proxy: { statusCode: 429, path: '/api/contact', clientIp: '192.0.2.50', userAgent: ['x'] } })),
  ];
  const out = detect(normalizeLogs(raw), now, 'salt'), types = out.map(x => x.type);
  assert(types.includes('UNAUTHORIZED_ACCESS') && types.includes('SCRAPING') && types.includes('RATE_LIMITED'), types.join());
  assert(out.filter(x => x.type === 'SCRAPING').length === 1, 'Googlebot is not scraping');
  assert(out.find(x => x.type === 'RATE_LIMITED').blocked === true, 'blocks are marked');
  assert(!JSON.stringify(out).includes('198.51.100.7') && out.find(x => x.type === 'UNAUTHORIZED_ACCESS').payload.client === clientKey('198.51.100.7', 'salt'), 'no raw IPs');
  assert(detect(normalizeLogs(raw.map(l => ({ ...l, timestamp: now - 5 * 60_000 }))), now, 'salt').length === 0, 'old lines ignored');
});

console.log('== the whole lifecycle, end to end, in a controlled environment ==');
await t('detect -> validate -> prioritize -> propose -> approve -> fix + PR -> test -> merge -> deploy -> verify -> close -> recur -> reopen', async () => {
  await wipe(); await staff();
  const T0 = Date.now(); const stageNow = async (id, pr = null) => { const d = await C.loadData({ db, now: Date.now(), env: {}, github: null }); if (pr) d.github.prs['BeWatu_V3#901'] = pr; return C.buildSnapshot(d, Date.now(), { role: 'platform_admin' }).vulnerabilities.items.find(x => x.id === id); };
  // 1. detected by a scan
  const first = await ingest(deps({ now: T0 }), SEMGREP); const id = first.body.id;
  assert(first.status === 201 && first.body.approvalId, 'recorded with a proposed fix');
  // 2. validated (a person confirms it) and prioritized
  await C.act(deps({ now: T0 }), cyber, { action: 'validate', findingId: id, note: 'Reproduced: the origin is echoed.' });
  await C.act(deps({ now: T0 }), cyber, { action: 'assign', findingId: id, ownerUid: 'cyber1' });
  await C.act(deps({ now: T0 }), cyber, { action: 'prioritize', findingId: id, priority: 'P2', note: 'Internet-facing, bearer auth limits impact.' });
  let s = await stageNow(id); assert(s.stage === 'remediation_proposed' && s.priority === 'P2' && s.owner.email === 'cyber@bewatu.com' && s.confidence === 'high', JSON.stringify(s));
  // 3. approved by an admin with a fresh sign-in: the fix is generated and a pull request opened (never merged by the agent)
  const gh = fakeGithub(); const ok = await decide(approveDeps({ github: gh, now: T0 }), { ...admin, authTime: Math.floor(T0 / 1000) - 30 }, { approvalId: first.body.approvalId, decision: 'approved' });
  assert(ok.mode === 'auto-fix' && gh.calls.length === 1 && gh.calls[0][1].content.includes('ALLOWED.find'), JSON.stringify(ok));
  s = await stageNow(id, { merged: false, state: 'open', checks: 'pending' }); assert(s.stage === 'testing' && s.prUrl.endsWith('/901'), s.stage);
  s = await stageNow(id, { merged: false, state: 'open', checks: 'passed' }); assert(s.stage === 'approval', s.stage);
  // 4. a person merges: deployment
  const plan = (await get(`security_findings/${id}`)).remediationPlanId;
  const merged = await verifyCheck({ db, now: T0, prIsMerged: async () => true }, { planId: plan }); assert(merged.merged && !merged.verified, JSON.stringify(merged));
  s = await stageNow(id); assert(s.stage === 'deployment', s.stage);
  // 5. a full scan cycle without the problem: verified, independently of the fix's author
  const mergedAt = Date.now() + 1000;
  const sw = now => sweep({ db, now, send: alert, github: { prState: async () => ({ merged: true, mergedAt, closed: true }) }, rules: { repoText: async () => null, deployed: async () => ({ skipped: 'test' }) } });
  const r1 = await sw(mergedAt + 8 * D + H); assert(r1.verified === 1 && (await get(`security_findings/${id}`)).status === 'verified', JSON.stringify(r1));
  // 6. a week later without recurrence: closed
  const resolvedAt = C.ms((await get(`security_findings/${id}`)).resolvedAt);
  const r2 = await sw(resolvedAt + 7 * D + H); assert(r2.closed === 1 && (await get(`security_findings/${id}`)).closedAt, JSON.stringify(r2));
  s = await stageNow(id); assert(s.stage === 'closed' && s.closedAs === 'fixed', JSON.stringify(s));
  // 7. it comes back: reopened, not duplicated, with its history
  const back = await ingest(deps(), SEMGREP); assert(back.body.reopened && back.body.id === id, JSON.stringify(back.body));
  s = await stageNow(id); assert(s.reopenCount === 1 && s.stage === 'remediation_proposed', JSON.stringify(s));
  // the human actions are all in the tamper-evident log
  const audit = (await db.collection('security_audit').orderBy('seq', 'desc').get()).docs.map(x => x.data());
  assert(C.verifyChain(audit).ok && audit.map(x => x.action).reverse().join() === 'validate,assign,prioritize', audit.map(x => x.action).join());
  const pipe = (await db.collection('audit_log').get()).docs.map(x => x.data().action);
  for (const a of ['security_remediation_approved', 'security_remediation_executed', 'security_fix_merged', 'security_finding_auto_verified', 'security_finding_reopened']) assert(pipe.includes(a), `missing ${a}: ${pipe.join()}`);
});

console.log('== the snapshot over real stored data, and the copied blocks ==');
await t('loadData + buildSnapshot over the emulator: counts, approvals and freshness come from the stored records', async () => {
  await wipe(); await staff();
  await ingest(deps(), SEMGREP); await ingest(deps(), { ...SEMGREP, severity: 'error', evidence: { filePath: 'api/y.ts' } });
  for (const [k, v] of Object.entries(fresh())) await db.doc(`_ops_internal/${k}`).set(v);
  const s = C.buildSnapshot(await C.loadData({ db, now: NOW, env: { GITHUB_TOKEN: 'x' }, github: null }), NOW, { role: 'cyber_agent' });
  assert(s.vulnerabilities.items.length === 2 && s.remediation.pendingApprovals.length === 2 && s.coverage.sensors.find(x => x.id === 'uptime-monitor').status === 'fresh', JSON.stringify({ n: s.vulnerabilities.items.length, a: s.remediation.pendingApprovals.length }));
  assert(s.platformAdmins === undefined && s.agent.permissions.find(p => p.id === 'GITHUB_TOKEN').configured === true, 'env flags only, never values');
  assert(!JSON.stringify(s).includes('z'.repeat(24)), 'no secret in the payload');
});
await t('the copied blocks are identical everywhere (alert sender, CORS, redaction, autonomy policy); new collections are server-write-only in the rules', () => {
  const grab = (f, tag) => { const m = readFileSync(ROOT + f, 'utf8').match(new RegExp(`// <${tag}>\\n([\\s\\S]*?)// </${tag}>`)); return m ? m[1] : null; };
  for (const [tag, files] of [['alert-sender', ['api/cron/healthcheck.ts', 'api/security/center.ts']], ['cors', ['api/factory-token.ts', 'api/security/center.ts']], ['redact', ['api/security/center.ts', 'api/security/finding.ts']], ['autonomy-policy', ['api/security/center.ts', 'api/security/approve.ts', 'api/cron/security-sweep.ts']]]) {
    const [a, ...rest] = files.map(f => grab(f, tag)); assert(a, `${tag} missing in ${files[0]}`);
    rest.forEach((x, i) => assert(x === a, `${files[i + 1]} has a different <${tag}> block`));
  }
  const rules = readFileSync(ROOT + 'firestore.rules', 'utf8');
  for (const c of ['security_incidents', 'security_policy', 'security_audit', 'security_audit_meta', 'security_metrics', 'security_drills']) assert(new RegExp(`match /${c}/\\{\\w+\\} \\{\\s*allow read:\\s*if isSecurityStaff\\(\\);\\s*allow write: if false;`).test(rules), `${c} rules`);
  // checkRevoked needs the Firebase Auth admin API; the routes run on a Firestore-only identity, so it rejected every sign-in.
  for (const f of ['api/security/center.ts', 'api/security/approve.ts']) assert(!/verifyIdToken\([^)]*,\s*true\)/.test(readFileSync(ROOT + f, 'utf8')), `${f} must not use checkRevoked`);
  const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8')); assert(vercel.crons.some(c => c.path === '/api/security/center?cron=posture'), 'posture cron');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
