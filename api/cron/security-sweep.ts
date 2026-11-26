/**
 * api/cron/security-sweep.ts
 * GET /api/cron/security-sweep       (Vercel Cron, daily; Authorization: Bearer $CRON_SECRET)
 * ────────────────────────────────────────────────────────────
 * The daily housekeeping that keeps the security pipeline honest. It does three things and then stamps a heartbeat the
 * uptime monitor watches (so a sweep that stops is itself an alert).
 *
 *   1. CLOSES THE LOOP on fixes. For each finding whose fix PR was opened, it asks GitHub whether the PR merged and records it.
 *      A merged PR is NOT "fixed": a finding is marked VERIFIED only when at least 8 days (a full weekly scan cycle) have passed
 *      since the merge AND the scanners have not reported it again since. A finding reported again after the merge stays open.
 *   2. NUDGES on approvals. A high or critical remediation waiting for a decision for more than 24 hours is emailed (a digest, at
 *      most once a day per item), and an approval past its expiry is marked expired so the console queue clears.
 *   3. CHECKS RULES DRIFT. It compares the Firestore security rules actually DEPLOYED with firestore.rules on main. A mismatch
 *      usually means a rules change merged but was never deployed (rules are deployed by hand, separately from the app). It is
 *      reported at most once a day. If the credential cannot read the deployed rules it says so and does not guess.
 *
 * It never changes code, merges anything, deploys anything, or touches member data.
 *
 * Env: CRON_SECRET, GITHUB_TOKEN, FIREBASE_SERVICE_ACCOUNT_APP_SERVER, RESEND_API_KEY (+ alert variables as in the monitor).
 *      For rules drift: FIREBASE_SERVICE_ACCOUNT_RULES_VIEWER (a service account with the "Firebase Rules Viewer" role; best),
 *      falling back to FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY then FIREBASE_SERVICE_ACCOUNT. The app-server account is Firestore-only
 *      by design and is deliberately not used.
 * ────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { Octokit } from '@octokit/rest';
import { createHash, timingSafeEqual } from 'node:crypto';

// ── how an alert leaves the building ─────────────────────────────────────────
// One copy per route that raises alerts (api/ routes cannot import each other); test/monitor-depth fails if a copy differs
// from the one in api/cron/healthcheck.ts. Change it there, then paste the block into each file that has the markers.
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

const OWNER = 'bewatu8325';
export const REPOS: Record<string, string> = { bewatu_v3: 'BeWatu_V3', bewatu_ops: 'bewatu-ops', bewatu_factory: 'bewatu-factory', shared: 'BeWatu_V3' };
const HOUR = 3_600_000, DAY = 24 * HOUR;
export const VERIFY_AFTER_MS = 8 * DAY;          // one full weekly scan cycle, plus a day
export const NUDGE_AFTER_MS = 24 * HOUR;
export const NUDGE_REPEAT_MS = 24 * HOUR;
export const DRIFT_REPEAT_MS = 24 * HOUR;
const RULES_URL = `https://raw.githubusercontent.com/${OWNER}/BeWatu_V3/main/firestore.rules`;

export interface PrState { merged: boolean; mergedAt: number | null; closed: boolean }
export interface RulesPort {
  /** firestore.rules on main, or null if it could not be fetched. */
  repoText(): Promise<string | null>;
  /** The deployed rules text, or a reason it could not be read. */
  deployed(): Promise<{ text: string } | { skipped: string }>;
}
export interface Deps {
  db: Firestore; now: number;
  github: { prState(repo: string, n: number): Promise<PrState> };
  rules: RulesPort;
  send(subject: string, body: string): Promise<boolean>;
  /** Asks approve.ts to act as the agent on one approval (it re-checks the policy and the daily cap itself). */
  agentApprove?(approvalId: string): Promise<{ ok: boolean; detail: string }>;
  env?: Record<string, string | undefined>;
}
export interface SweepResult { merged: number; verified: number; githubErrors: number; nudged: number; expired: number; retired: number; reopenedExpired: number; closed: number; agentPrs: number; agentRefused: number; rules: string }
// <autonomy-policy>
export type AutonomyMode = 'observe' | 'propose' | 'auto_low_risk';
export interface AutonomyPolicy { mode: AutonomyMode; suspended: boolean; suspendedReason: string | null; maxAgentPrsPerDay: number; lowRiskRules: string[]; maxAutoSeverity: 'low' | 'medium' }
/**
 * What the agent may do without a person. "propose" is today's behaviour: it records findings and proposes fixes, and a
 * platform admin approves every one. Only an admin can change this (with a fresh sign-in); the agent itself never writes it.
 */
export const DEFAULT_POLICY: AutonomyPolicy = { mode: 'propose', suspended: false, suspendedReason: null, maxAgentPrsPerDay: 2, lowRiskRules: ['unsafe-formatstring', 'missing-integrity'], maxAutoSeverity: 'medium' };
/**
 * The only rules an admin may mark as low-risk for the agent: small, local fixes that CI fully checks. A rule whose fix lands
 * on a protected path (CI workflows, Dependabot) becomes an issue for a person instead: the agent never edits the pipeline.
 */
export const LOW_RISK_RULE_CATALOG = ['github-actions-mutable-action-tag', 'dependabot-missing-cooldown', 'missing-integrity', 'unsafe-formatstring'];
export function readPolicy(raw: Record<string, any> | undefined, env: Record<string, string | undefined>): AutonomyPolicy & { envKill: boolean } {
  const p: AutonomyPolicy = { ...DEFAULT_POLICY, ...(raw ?? {}) };
  if (!['observe', 'propose', 'auto_low_risk'].includes(p.mode)) p.mode = DEFAULT_POLICY.mode;
  p.lowRiskRules = (Array.isArray(p.lowRiskRules) ? p.lowRiskRules : []).filter(r => LOW_RISK_RULE_CATALOG.includes(r));
  p.maxAgentPrsPerDay = Math.max(0, Math.min(5, Number(p.maxAgentPrsPerDay) || 0));
  if (!['low', 'medium'].includes(p.maxAutoSeverity)) p.maxAutoSeverity = 'medium';
  // The environment kill switch works even if Firestore is unreachable or tampered with: set it in Vercel and redeploy.
  const envKill = env.SECURITY_AUTOMATION_DISABLED === '1' || env.SECURITY_AUTOMATION_DISABLED === 'true';
  return { ...p, suspended: p.suspended === true || envKill, envKill };
}
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
/** null = the agent may open a pull request for this approval on its own; otherwise why not. */
export function agentRefusal(p: AutonomyPolicy, approval: { severity?: string; title?: string }, ruleId: string): string | null {
  if (p.suspended) return 'automated remediation is suspended';
  if (p.mode !== 'auto_low_risk') return `the autonomy policy is "${p.mode}"`;
  if (!p.lowRiskRules.includes(ruleId)) return `${ruleId || 'this rule'} is not on the admin's low-risk list`;
  if ((SEVERITY_ORDER[String(approval.severity)] ?? 0) < SEVERITY_ORDER[p.maxAutoSeverity]) return `${approval.severity} is above the agent's limit (${p.maxAutoSeverity})`;
  return null;
}
// </autonomy-policy>
export const CLOSE_AFTER_VERIFIED_MS = 7 * DAY;
const CLOSED = ['verified', 'false_positive', 'accepted_risk'];

const ms = (v: any): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);

// ── 1. close the loop on fixes ───────────────────────────────────────────────
async function closeLoop(d: Deps, r: SweepResult) {
  const open = await d.db.collection('security_findings').where('status', '==', 'remediation_pending').limit(200).get();
  for (const f of open.docs) {
    const finding = f.data();
    try {
      const plan = finding.remediationPlanId ? (await d.db.collection('remediation_plans').doc(String(finding.remediationPlanId)).get()).data() : undefined;
      if (!plan?.prNumber) continue;                                   // an issue, not a PR: a person closes those
      const repo = REPOS[String(finding.repo ?? 'shared')]; if (!repo) continue;
      const pr = await d.github.prState(repo, Number(plan.prNumber));
      if (!pr.merged) continue;
      const mergedAt = pr.mergedAt ?? d.now;
      if (!finding.prMerged) {
        // updatedAt is left alone on purpose: it means "last touched by a report or a person", which the check below relies on.
        await f.ref.update({ prMerged: true, prMergedAt: mergedAt });
        await d.db.collection('audit_log').add({ action: 'security_fix_merged', findingId: f.id, planId: finding.remediationPlanId, prNumber: plan.prNumber, by: 'security-sweep', timestamp: FieldValue.serverTimestamp() });
        r.merged++;
      }
      const lastSeen = ms(finding.lastReportedAt) ?? ms(finding.updatedAt) ?? ms(finding.detectedAt) ?? 0;
      if (d.now - mergedAt >= VERIFY_AFTER_MS && lastSeen < mergedAt) {
        // The sweep's own clock, the same one the close-after-7-days step measures with.
        await f.ref.update({ status: 'verified', resolvedAt: d.now, verifiedBy: 'security-sweep' });
        await d.db.collection('audit_log').add({ action: 'security_finding_auto_verified', findingId: f.id, planId: finding.remediationPlanId, prNumber: plan.prNumber, reason: 'fix merged, and not reported again across a full scan cycle', by: 'security-sweep', timestamp: FieldValue.serverTimestamp() });
        r.verified++;
      }
    } catch (e: any) { r.githubErrors++; console.error('security-sweep: could not check', f.id, e?.message); }   // one bad finding must not stop the rest
  }
}

// ── 2. approvals that wait too long ──────────────────────────────────────────
/** "Semgrep: yaml.github-actions.security.x.x" -> "Semgrep: x": the rule's last segment is the readable part. */
export const shortTitle = (t: string) => t.replace(/^(Semgrep: )(?:[\w-]+\.)+([\w-]+)$/, '$1$2');
/** One line per distinct problem, with how many are waiting and where (first 5 places), most severe and oldest first. */
export function nudgeLines(due: { title: string; severity: string; hours: number; where: string | null }[]): string[] {
  const rank: Record<string, number> = { critical: 0, high: 1 };
  const groups = new Map<string, { title: string; severity: string; hours: number; where: string[] }>();
  for (const x of due) {
    const k = `${x.severity}\u0000${x.title}`;
    const g = groups.get(k) ?? { title: x.title, severity: x.severity, hours: 0, where: [] };
    g.hours = Math.max(g.hours, x.hours); if (x.where && !g.where.includes(x.where)) g.where.push(x.where);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || b.hours - a.hours).slice(0, 10).map(g => {
    const n = due.filter(x => x.title === g.title && x.severity === g.severity).length;
    const places = g.where.length ? `: ${g.where.slice(0, 5).join('; ')}${g.where.length > 5 ? `; and ${g.where.length - 5} more` : ''}` : '';
    return `- [${g.severity.toUpperCase()}] ${shortTitle(g.title)}${n > 1 ? ` (x${n})` : ''}, waiting ${g.hours}h${places}`;
  });
}
async function approvals(d: Deps, r: SweepResult) {
  const pending = await d.db.collection('approval_requests').where('status', '==', 'pending').limit(200).get();
  const due: { ref: DocumentReference; title: string; severity: string; hours: number; where: string | null }[] = [];
  for (const a of pending.docs) {
    const x = a.data(); const created = ms(x.createdAt); const expires = ms(x.expiresAt);
    if (expires !== null && expires < d.now) { await a.ref.update({ status: 'expired', expiredAt: FieldValue.serverTimestamp() }); r.expired++; continue; }
    const f = x.findingId ? (await d.db.collection('security_findings').doc(String(x.findingId)).get()).data() : undefined;
    // Nothing left to decide: the finding was closed (fixed, false positive, accepted risk) or no longer exists. Withdraw it, so the
    // Approvals tab and this nudge only ever show decisions about problems that are still open.
    if (!f || CLOSED.includes(String(f.status))) {
      const why = !f ? 'its finding no longer exists' : `its finding is closed (${f.status})`;
      await a.ref.update({ status: 'superseded', supersededAt: FieldValue.serverTimestamp(), supersededReason: why });
      await d.db.collection('audit_log').add({ action: 'security_approval_retired', approvalId: a.id, findingId: x.findingId ?? null, reason: why, by: 'security-sweep', timestamp: FieldValue.serverTimestamp() });
      r.retired++; continue;
    }
    if (!['high', 'critical'].includes(String(x.severity)) || created === null || d.now - created < NUDGE_AFTER_MS) continue;
    const last = ms(x.lastNudgedAt); if (last !== null && d.now - last < NUDGE_REPEAT_MS) continue;
    // Say WHERE: the approval only has a title, which is the same for every file a rule fires in.
    const where = f ? `${REPOS[String(f.repo ?? 'shared')] ?? String(f.repo)}${f.evidence?.filePath ? ` ${f.evidence.filePath}` : ''}` : null;
    due.push({ ref: a.ref, title: String(x.title ?? 'untitled'), severity: String(x.severity), hours: Math.floor((d.now - created) / HOUR), where });
  }
  if (!due.length) return;
  const sent = await d.send(`🔔 ${due.length} security fix${due.length > 1 ? 'es are' : ' is'} waiting for your decision`, `${nudgeLines(due).join('\n')}\n\nReview them in the ops console: https://ops.bewatu.com (Security, Approvals). An approval that nobody decides leaves a known problem open.`);
  if (sent) { await Promise.all(due.map(x => x.ref.update({ lastNudgedAt: d.now }))); r.nudged = due.length; }   // unsent: tried again tomorrow
}

// ── 3. the rest of the lifecycle: expired risk acceptance reopens; a verified fix that stays quiet closes ──
async function lifecycle(d: Deps, r: SweepResult) {
  const accepted = await d.db.collection('security_findings').where('status', '==', 'accepted_risk').limit(300).get();
  for (const f of accepted.docs) {
    const x = f.data(), until = ms(x.acceptedUntil);
    if (until === null || until > d.now) continue;                   // an acceptance without an end date predates time limits
    await f.ref.update({ status: (x.riskScore ?? 0) >= 40 ? 'approval_pending' : 'triaged', reopenCount: FieldValue.increment(1), reopenedAt: FieldValue.serverTimestamp(), reopenReason: 'the risk acceptance expired', acceptedUntil: FieldValue.delete(), resolvedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    await d.db.collection('audit_log').add({ action: 'security_finding_reopened', findingId: f.id, reason: 'the risk acceptance expired', by: 'security-sweep', timestamp: FieldValue.serverTimestamp() });
    r.reopenedExpired++;
  }
  const verified = await d.db.collection('security_findings').where('status', '==', 'verified').limit(1000).get();
  for (const f of verified.docs) {
    const x = f.data(); if (x.closedAt) continue;
    const res = ms(x.resolvedAt); if (res === null || d.now - res < CLOSE_AFTER_VERIFIED_MS) continue;
    if ((ms(x.lastReportedAt) ?? 0) > res) continue;                // reported after it was verified: not closed (ingest reopens it)
    await f.ref.update({ closedAt: d.now });
    r.closed++;
  }
}

// ── 4. the agent: opens pull requests for pre-approved low-risk fixes, if (and only if) an admin's policy allows it ──
async function agentPass(d: Deps, r: SweepResult) {
  if (!d.agentApprove) return;
  const policy = readPolicy((await d.db.collection('security_policy').doc('autonomy').get()).data(), d.env ?? {});
  if (policy.suspended || policy.mode !== 'auto_low_risk' || policy.maxAgentPrsPerDay < 1) return;
  const pending = await d.db.collection('approval_requests').where('status', '==', 'pending').limit(200).get();
  const eligible = pending.docs.filter(a => agentRefusal(policy, a.data(), String(a.data().title ?? '').replace(/^Semgrep: /, '').split('.').pop() ?? '') === null);
  for (const a of eligible.slice(0, policy.maxAgentPrsPerDay)) {
    const out = await d.agentApprove(a.id).catch((e: any) => ({ ok: false, detail: String(e?.message ?? e) }));
    if (out.ok) r.agentPrs++; else { r.agentRefused++; console.error('security agent: not done for', a.id, out.detail); }
  }
}

// ── 5. rules drift ───────────────────────────────────────────────────────────
export const normalizeRules = (t: string) => t.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
const fp = (t: string) => createHash('sha256').update(normalizeRules(t)).digest('hex').slice(0, 12);

async function rulesDrift(d: Deps, state: Record<string, any>, updates: Record<string, unknown>, r: SweepResult) {
  const [repo, dep] = await Promise.all([d.rules.repoText().catch(() => null), d.rules.deployed().catch(e => ({ skipped: `error: ${(e as Error)?.message}` }))]);
  if (repo === null) { r.rules = 'skipped: could not fetch firestore.rules from main'; return; }
  if ('skipped' in dep) { r.rules = `skipped: ${dep.skipped}`; return; }
  if (normalizeRules(repo) === normalizeRules(dep.text)) { r.rules = 'in sync'; updates.rulesDriftAlertedAt = FieldValue.delete(); return; }
  r.rules = `DRIFT (main ${fp(repo)}, deployed ${fp(dep.text)})`;
  const last = typeof state.rulesDriftAlertedAt === 'number' ? state.rulesDriftAlertedAt : null;
  if (last !== null && d.now - last < DRIFT_REPEAT_MS) return;
  const sent = await d.send('⚠️ Firestore rules deployed do not match main', `The security rules running in production differ from firestore.rules on main.\n\nmain: ${fp(repo)}   deployed: ${fp(dep.text)}\n\nMost often a rules change merged but was not deployed (rules are deployed by hand, separately from the app). If that is the case, run:\n\n  firebase deploy --only firestore:rules --project bewatu-2d04e\n\nIf nobody changed rules, someone edited them directly in the Firebase console: treat that as an incident.`);
  if (sent) updates.rulesDriftAlertedAt = d.now;
}

export async function sweep(d: Deps): Promise<SweepResult> {
  const r: SweepResult = { merged: 0, verified: 0, githubErrors: 0, nudged: 0, expired: 0, retired: 0, reopenedExpired: 0, closed: 0, agentPrs: 0, agentRefused: 0, rules: 'not run' };
  const ref = d.db.collection('_ops_internal').doc('security_sweep');
  const state = (await ref.get()).data() ?? {};
  const updates: Record<string, unknown> = {};
  let ok = true;
  for (const step of [() => closeLoop(d, r), () => approvals(d, r), () => lifecycle(d, r), () => agentPass(d, r), () => rulesDrift(d, state, updates, r)]) {
    try { await step(); } catch (e: any) { ok = false; console.error('security-sweep step failed:', e?.message); }
  }
  await ref.set({ ...updates, lastRunAt: d.now, lastRunOk: ok, lastSummary: r }, { merge: true });
  // The heartbeat the uptime monitor watches.
  await d.db.collection('_ops_internal').doc('cron_security_sweep').set({ lastRunAt: d.now, ok }, { merge: true });
  return r;
}

// ── real edges ───────────────────────────────────────────────────────────────
function safeEqual(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function openDb(): Firestore {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}
function realRules(env: Record<string, string | undefined>): RulesPort {
  return {
    async repoText() {
      try { const r = await fetch(RULES_URL, { signal: AbortSignal.timeout(10_000) }); return r.ok ? await r.text() : null; } catch { return null; }
    },
    async deployed() {
      const sa = env.FIREBASE_SERVICE_ACCOUNT_RULES_VIEWER ?? env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? env.FIREBASE_SERVICE_ACCOUNT;
      if (!sa) return { skipped: 'no service account with rules access is configured (set FIREBASE_SERVICE_ACCOUNT_RULES_VIEWER)' };
      const json = JSON.parse(sa);
      const name = 'rules-drift';
      const app = getApps().find(a => a.name === name) ?? initializeApp({ credential: cert(json) }, name);
      const token = (await (app.options.credential as any).getAccessToken()).access_token as string;
      const base = `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(json.project_id)}`;
      const rel = await fetch(`${base}/releases/cloud.firestore`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (rel.status === 403 || rel.status === 401) return { skipped: `the service account may not read the deployed rules (HTTP ${rel.status}); grant it the Firebase Rules Viewer role` };
      if (!rel.ok) return { skipped: `the Rules API answered HTTP ${rel.status}` };
      const rs = await fetch(`https://firebaserules.googleapis.com/v1/${(await rel.json()).rulesetName}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (!rs.ok) return { skipped: `could not read the ruleset (HTTP ${rs.status})` };
      const files = (await rs.json())?.source?.files ?? [];
      const text = files.map((f: any) => f.content).join('\n');
      return text ? { text } : { skipped: 'the deployed ruleset was empty' };
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const h = req.headers['authorization'];
  if (typeof h !== 'string' || !h.startsWith('Bearer ') || !safeEqual(h.slice(7), process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const out = await sweep({
      db: openDb(), now: Date.now(), rules: realRules(process.env),
      github: { async prState(repo, n) { const p = (await gh.pulls.get({ owner: OWNER, repo, pull_number: n })).data; return { merged: !!p.merged, mergedAt: p.merged_at ? Date.parse(p.merged_at) : null, closed: p.state === 'closed' }; } },
      send: (s, t) => sendAlert(process.env, s, t),
      env: process.env,
      async agentApprove(approvalId) {
        const t = process.env.BEWATU_SECURITY_TOKEN; if (!t) return { ok: false, detail: 'BEWATU_SECURITY_TOKEN is not set' };
        const x = await fetch('https://www.bewatu.com/api/security/approve', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ approvalId, decision: 'approved', agent: true, note: 'Opened by the security agent under the admin\'s low-risk policy.' }), signal: AbortSignal.timeout(120_000) });
        return { ok: x.ok, detail: `HTTP ${x.status}: ${(await x.text()).slice(0, 300)}` };
      },
    });
    return res.status(200).json(out);
  } catch (e: any) {
    console.error('security-sweep error:', e?.message);
    return res.status(500).json({ error: 'sweep failed' });
  }
}
