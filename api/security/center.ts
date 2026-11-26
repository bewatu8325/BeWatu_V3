/**
 * api/security/center.ts: the Security Center's server (ops console -> Security).
 * ────────────────────────────────────────────────────────────
 *   GET  /api/security/center                  The whole picture: posture and score, monitoring coverage, vulnerabilities (with
 *                                              their lifecycle), threats and incidents, remediation, security controls, recovery,
 *                                              the security agent, and the audit log. Security staff only.
 *   GET  /api/security/center?finding=<id>     One finding with its plan, approvals and audit history.
 *   POST /api/security/center  {action, ...}   Triage (platform_admin, cyber_agent) and governance (platform_admin; the
 *                                              sensitive ones need a sign-in from the last 10 minutes). Every action is written to
 *                                              the hash-chained security_audit log.
 *   GET  /api/security/center?cron=posture     Daily (CRON_SECRET): reads backups and certificates, records the day's metrics,
 *                                              and sends the configurable notifications, at most once a day each.
 *
 * It is not a second security engine. It reads what the existing pipeline records (finding.ts, scan-complete.ts, approve.ts,
 * verify.ts, the security sweep, the uptime monitor, the runtime sensor) and adds what was missing around it: triage,
 * governance, incidents, a transparent score and an audit trail that shows tampering.
 *
 * Honesty rule: every figure comes from a stored record or a live read. What could not be read is "unavailable" with the
 * reason, what is not set up is "not configured", and neither is ever shown as zero.
 *
 * Self-contained on purpose: api/ routes cannot import each other (shared code is copied between marked blocks, test-enforced).
 * ────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createHash, timingSafeEqual } from 'node:crypto';
import { connect as tlsConnect } from 'node:tls';

const ALLOWED_ORIGINS = ['https://ops.bewatu.com', 'https://www.bewatu.com'];
// <cors>
// Browsers may call this route only from the sites in ALLOWED_ORIGINS (and local dev servers, outside production). The header
// always carries one of those listed values, never the request's own Origin, so a forged origin is never echoed back.
const CORS_DEV_ORIGINS: readonly string[] = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];
export const corsPermitted = (allowed: readonly string[]): readonly string[] => (process.env.VERCEL_ENV === 'production' ? allowed : [...allowed, ...CORS_DEV_ORIGINS]);
// </cors>
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

// ═════════════════════════════════════════════════════════════════════════════
// Constants and policy
// ═════════════════════════════════════════════════════════════════════════════
type Rec = Record<string, any>;
const MIN = 60_000, HOUR = 3_600_000, DAY = 24 * HOUR;
const OWNER = 'bewatu8325';
export const REPOS: Record<string, string> = { bewatu_v3: 'BeWatu_V3', bewatu_ops: 'bewatu-ops', bewatu_factory: 'bewatu-factory' };
export const CLOSED = ['verified', 'false_positive', 'accepted_risk'];
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational'] as const;
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
/** Time allowed to fix an open finding, from detection. Breaches are flagged on the Overview and in the daily digest. */
export const SLA_HOURS: Record<string, number> = { critical: 48, high: 7 * 24, medium: 30 * 24, low: 90 * 24, informational: Infinity };

/** Who may do what. The server enforces this; the console only hides what a role cannot use. */
export const ROLE_CAN = {
  view:   ['platform_admin', 'cyber_agent', 'auditor'],
  triage: ['platform_admin', 'cyber_agent'],
  govern: ['platform_admin'],
};
/** Sensitive actions need a sign-in this recent (Firebase ID token auth_time). The console asks for the password again. */
export const STEP_UP_MAX_AGE_S = 10 * 60;

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

export const DEFAULT_NOTIFICATIONS = { coverage: true, backup: true, certificates: true, sla: true };
/** These always notify and cannot be muted here: critical/high findings, incidents, failed remediation, a stopped monitor. */
export const ALWAYS_ON_NOTIFICATIONS = ['critical and high findings', 'security incidents', 'failed remediation', 'the monitor or agent stopping', 'automation suspended or resumed'];

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const ms = (v: any): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : (v && typeof v.toMillis === 'function') ? v.toMillis() : typeof v === 'string' && !isNaN(Date.parse(v)) ? Date.parse(v) : null);

// ═════════════════════════════════════════════════════════════════════════════
// Evidence handling: scan results, logs and descriptions are untrusted input
// ═════════════════════════════════════════════════════════════════════════════
// <redact>
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,                                  // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,                // Stripe
  /\bre_[A-Za-z0-9_]{20,}\b/g,                                       // Resend
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, /\bsk-[A-Za-z0-9]{32,}\b/g,      // Anthropic, OpenAI
  /\bAIza[0-9A-Za-z_-]{35}\b/g,                                      // Google API key
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,                                // Slack
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /("?(?:password|passwd|secret|token|api[_-]?key|private[_-]?key)"?\s*[:=]\s*)("[^"]{6,}"|'[^']{6,}'|[^\s,;]{8,})/gi,
];
/** Removes anything that looks like a credential, keeping the first 4 characters so a person can still recognise which one. */
export function redact(text: unknown, max = 2000): string {
  let s = String(text ?? '').slice(0, max * 2);
  for (const re of SECRET_PATTERNS) s = s.replace(re, (m: string, k?: string) => (k && typeof k === 'string' && /[:=]\s*$/.test(k) ? `${k}[REDACTED]` : `${m.slice(0, 4)}…[REDACTED]`));
  return s.slice(0, max);
}
// </redact>

// ═════════════════════════════════════════════════════════════════════════════
// Findings: lifecycle, exposure, priority, framework mapping
// ═════════════════════════════════════════════════════════════════════════════
export const STAGES = ['detected', 'validated', 'prioritized', 'remediation_proposed', 'testing', 'approval', 'deployment', 'verified', 'closed'] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABEL: Record<Stage, string> = {
  detected: 'Detected', validated: 'Validated', prioritized: 'Prioritized', remediation_proposed: 'Remediation proposed',
  testing: 'Testing', approval: 'Approval', deployment: 'Deployment', verified: 'Verified', closed: 'Closed',
};
/** Rule id without its namespace: "Semgrep: javascript.express.security.x.x" -> "x". */
export const ruleOf = (f: Rec): string => String(f.evidence?.ruleId ?? f.title ?? '').replace(/^Semgrep: /, '').split('.').pop() ?? '';
export const isValidated = (f: Rec): boolean =>
  !!f.validatedAt || f.sensor === 'dependency-risk'
  || ((ms(f.lastReportedAt) ?? 0) - (ms(f.detectedAt) ?? 0) > HOUR);   // seen again by a later, independent scan

/**
 * Where a finding is in Detected -> Validated -> Prioritized -> Remediation proposed -> Testing -> Approval -> Deployment ->
 * Verified -> Closed. Mapped onto what the pipeline really does: a proposed fix waits for an admin's go-ahead (an approval
 * request); the agent then opens a pull request, CI tests it (Testing); a person merges it once checks pass (Approval);
 * the merge deploys (Deployment); a full scan cycle without the problem verifies it; a week later without recurrence closes it.
 */
export function stageOf(f: Rec, ctx: { approvalPending: boolean; pr?: { checks?: string; merged?: boolean } | null }): { stage: Stage; closedAs?: string } {
  if (f.status === 'false_positive') return { stage: 'closed', closedAs: 'false positive' };
  if (f.status === 'accepted_risk') return { stage: 'closed', closedAs: 'risk accepted' };
  if (f.status === 'verified') return f.closedAt ? { stage: 'closed', closedAs: 'fixed' } : { stage: 'verified' };
  if (f.prMerged || ctx.pr?.merged) return { stage: 'deployment' };
  if (f.status === 'remediation_pending') {
    if (!f.prUrl) return { stage: 'remediation_proposed' };            // an issue for a person to fix, no pull request
    return { stage: ctx.pr?.checks === 'passed' ? 'approval' : 'testing' };
  }
  if (f.status === 'executing') return { stage: 'testing' };            // the fix is being generated and its pull request opened
  if (ctx.approvalPending) return { stage: 'remediation_proposed' };
  if (isValidated(f)) return { stage: 'prioritized' };                 // validated findings are prioritized at once (below)
  return { stage: 'detected' };
}

export function exposureOf(f: Rec): { level: 'internet' | 'production' | 'pipeline' | 'client' | 'dependency' | 'repository'; text: string } {
  const p = String(f.evidence?.filePath ?? '');
  if (f.sensor === 'runtime-anomaly') return { level: 'production', text: 'Observed in production traffic' };
  if (f.sensor === 'dependency-risk') return { level: 'dependency', text: 'Third-party package (runtime or build use is not distinguished)' };
  if (/^api\//.test(p)) return { level: 'internet', text: 'Internet-facing API route' };
  if (/^\.github\//.test(p)) return { level: 'pipeline', text: 'CI/CD pipeline (supply chain)' };
  if (/^functions\//.test(p)) return { level: 'production', text: 'Cloud Functions (server-side)' };
  if (/^(src|components|app|pages|index\.html|public)\b/.test(p)) return { level: 'client', text: 'Browser application' };
  return { level: 'repository', text: 'Repository code or configuration' };
}

export function confidenceOf(f: Rec): 'high' | 'medium' | 'low' {
  if (f.sensor === 'dependency-risk') return 'high';                   // an exact advisory/version match
  if (f.validatedAt) return 'high';                                    // a person confirmed it
  if (f.sensor === 'runtime-anomaly') return 'medium';                 // threshold heuristics on real traffic
  return isValidated(f) ? 'medium' : 'low';                            // a pattern match, stronger once seen again
}

/** P1 fix now ... P4 when convenient: severity raised by exposure and by a breached deadline; a person's choice wins. */
export function priorityOf(f: Rec, now: number): 'P1' | 'P2' | 'P3' | 'P4' {
  if (/^P[1-4]$/.test(String(f.priority ?? ''))) return f.priority;
  const sev = SEV_RANK[String(f.severity)] ?? 4, ex = exposureOf(f).level;
  const exposed = ex === 'internet' || ex === 'production';
  let p = sev <= 0 ? (exposed ? 1 : 2) : sev === 1 ? (exposed ? 2 : 3) : sev === 2 ? 3 : 4;
  if (slaOf(f, now).breached) p = Math.max(1, p - 1);
  return `P${p}` as 'P1' | 'P2' | 'P3' | 'P4';
}

export function slaOf(f: Rec, now: number): { dueAt: number | null; breached: boolean } {
  const det = ms(f.detectedAt), h = SLA_HOURS[String(f.severity)] ?? Infinity;
  if (det === null || !isFinite(h) || CLOSED.includes(f.status)) return { dueAt: det !== null && isFinite(h) ? det + h * HOUR : null, breached: false };
  return { dueAt: det + h * HOUR, breached: now > det + h * HOUR };
}

/** OWASP Top 10 (2021) and CWE for a finding: the scanner's own metadata first, then the rule family. */
const RULE_FRAMEWORK: [RegExp, { owasp: string[]; cwe: string[] }][] = [
  [/cors/i, { owasp: ['A05:2021 Security Misconfiguration'], cwe: ['CWE-346'] }],
  [/raw-html|xss|script-tag|dangerously|innerhtml/i, { owasp: ['A03:2021 Injection'], cwe: ['CWE-79'] }],
  [/formatstring/i, { owasp: ['A03:2021 Injection'], cwe: ['CWE-134'] }],
  [/missing-integrity/i, { owasp: ['A08:2021 Software and Data Integrity Failures'], cwe: ['CWE-353'] }],
  [/mutable-action-tag|pnpm-|dependabot/i, { owasp: ['A08:2021 Software and Data Integrity Failures'], cwe: ['CWE-829'] }],
  [/sql|nosql|injection/i, { owasp: ['A03:2021 Injection'], cwe: ['CWE-89'] }],
  [/secret|credential|hardcoded|api-key/i, { owasp: ['A07:2021 Identification and Authentication Failures'], cwe: ['CWE-798'] }],
  [/auth|jwt|token/i, { owasp: ['A07:2021 Identification and Authentication Failures'], cwe: ['CWE-287'] }],
  [/deletion|ransomware/i, { owasp: ['A01:2021 Broken Access Control'], cwe: ['CWE-284'] }],
  [/credential stuffing|auth failure/i, { owasp: ['A07:2021 Identification and Authentication Failures'], cwe: ['CWE-307'] }],
];
export function frameworksOf(f: Rec): { owasp: string[]; cwe: string[]; cve: string[] } {
  const cve = [f.cveId, ...(Array.isArray(f.cveIds) ? f.cveIds : [])].filter(x => typeof x === 'string' && /^(CVE|GHSA)-/i.test(x));
  const own = { owasp: [f.owasp].flat().filter(Boolean).map(String), cwe: [f.cweId, ...(Array.isArray(f.cweIds) ? f.cweIds : [])].filter(Boolean).map(String) };
  if (f.sensor === 'dependency-risk') return { owasp: own.owasp.length ? own.owasp : ['A06:2021 Vulnerable and Outdated Components'], cwe: own.cwe.length ? own.cwe : ['CWE-1395'], cve };
  if (own.owasp.length || own.cwe.length) return { ...own, cve };
  const hit = RULE_FRAMEWORK.find(([re]) => re.test(`${ruleOf(f)} ${f.title ?? ''}`));
  return { owasp: hit?.[1].owasp ?? [], cwe: hit?.[1].cwe ?? [], cve };
}

const ASSET_IMPACT: Record<string, string> = {
  firestore_users: 'member accounts and profile data', firebase_auth: 'sign-in and sessions', firestore_messages: 'private messages',
  api_factory_token: 'Factory access tokens', secret_stripe: 'payments', bewatu_v3_app: 'the bewatu.com application',
  bewatu_ops_app: 'the operations console', bewatu_factory_app: 'Factory', secret_firebase_admin: 'full database access',
};
export function impactOf(f: Rec): string {
  const assets = (Array.isArray(f.affectedAssets) ? f.affectedAssets : []).map((a: string) => ASSET_IMPACT[a]).filter(Boolean);
  if (assets.length) return `Could affect ${assets.slice(0, 3).join(', ')}.`;
  const ex = exposureOf(f).level;
  if (ex === 'internet') return 'A public API route: anyone on the internet can reach it.';
  if (ex === 'pipeline') return 'The build pipeline: a compromise here could ship altered code to production.';
  if (ex === 'dependency') return 'Code BeWatu runs but does not write: impact depends on whether the vulnerable path is used.';
  if (ex === 'client') return 'Runs in members\' browsers.';
  if (ex === 'production') return 'Production systems.';
  return 'Repository code or configuration.';
}

export function recommendationOf(f: Rec, plan: Rec | undefined): string {
  if (plan?.summary) return redact(plan.summary, 600);
  const r = ruleOf(f);
  if (f.sensor === 'dependency-risk') return 'Upgrade the package to a patched version (npm/pnpm audit names it); if a parent pins it, override that pin and test.';
  if (/cors/i.test(r)) return 'Answer only with origins from a fixed list; never echo the request\'s Origin header.';
  if (/raw-html|script-tag/i.test(r)) return 'Escape every untrusted value before it goes into HTML, and test with hostile input.';
  if (/mutable-action-tag/i.test(r)) return 'Pin the action to a full commit SHA, with its version as a comment.';
  if (/missing-integrity/i.test(r)) return 'Add an integrity hash, or document why the resource must load unpinned.';
  return redact(f.description ?? 'Review the evidence and fix the cause.', 600);
}

// ═════════════════════════════════════════════════════════════════════════════
// The data the snapshot is built from
// ═════════════════════════════════════════════════════════════════════════════
export interface RunView { at: number; status: string; conclusion: string | null; url: string; title?: string; jobs?: { name: string; conclusion: string | null }[] }
export interface GitHubView {
  available: boolean; reason?: string;
  security: Record<string, RunView | null>;       // latest completed security.yml run on main, per repo key
  ci: RunView | null;                             // BeWatu_V3 ci.yml on main (the test-enforced controls)
  watchdog: RunView | null;                       // bewatu-security watchdog
  rollback: { last: RunView | null; lastDryRun: RunView | null; lastExecute: RunView | null };
  prs: Record<string, { merged: boolean; state: string; checks: 'passed' | 'failed' | 'pending' | 'unknown' }>;
  tokenExpiresAt: number | null;
}
export interface Data {
  findings: Rec[]; approvals: Rec[]; plans: Rec[]; incidents: Rec[]; events: Rec[]; drills: Rec[]; metrics: Rec[]; audit: Rec[]; pipelineAudit: Rec[];
  internal: Record<string, Rec | undefined>;
  policy: Rec | undefined; notifications: Rec | undefined;
  platformAdmins: number | null;
  assignees?: { uid: string; email: string; role: string }[];
  github: GitHubView;
  env: { has: Record<string, boolean>; automationKill: boolean };
}

// ═════════════════════════════════════════════════════════════════════════════
// Monitoring coverage: which sensors are reporting, and how fresh their data is
// ═════════════════════════════════════════════════════════════════════════════
export type SensorStatus = 'fresh' | 'stale' | 'never' | 'not_configured' | 'unavailable';
export interface Sensor { id: string; label: string; group: string; status: SensorStatus; lastAt: number | null; maxAgeMs: number; detail: string }
function age(lastAt: number | null, maxAgeMs: number, now: number): SensorStatus { return lastAt === null ? 'never' : now - lastAt <= maxAgeMs ? 'fresh' : 'stale'; }
const ago = (t: number | null, now: number) => (t === null ? 'never' : now - t < HOUR ? `${Math.max(1, Math.round((now - t) / MIN))} min ago` : now - t < 2 * DAY ? `${Math.round((now - t) / HOUR)} h ago` : `${Math.round((now - t) / DAY)} days ago`);

export function evaluateSensors(d: Data, now: number): Sensor[] {
  const I = d.internal, out: Sensor[] = [];
  const up = ms(I.uptime_state?.lastRunAt);
  out.push({ id: 'uptime-monitor', label: 'Uptime and integrity monitor', group: 'Availability', status: age(up, 15 * MIN, now), lastAt: up, maxAgeMs: 15 * MIN,
    detail: up === null ? 'The monitor has never reported (CRON_SECRET missing?).' : `Runs every 5 minutes; last ${ago(up, now)}${I.uptime_state?.lastRunOk === false ? ', with failing checks' : ''}.` });
  const wd = d.github.watchdog;
  out.push(!d.github.available ? { id: 'outside-watchdog', label: 'Outside watchdog', group: 'Availability', status: 'unavailable', lastAt: null, maxAgeMs: HOUR, detail: `GitHub could not be read: ${d.github.reason}` }
    : { id: 'outside-watchdog', label: 'Outside watchdog', group: 'Availability', status: wd ? (wd.conclusion === 'success' ? age(wd.at, HOUR, now) : 'stale') : 'never', lastAt: wd?.at ?? null, maxAgeMs: HOUR,
      detail: wd ? `bewatu-security checks /api/health every 15 minutes; last run ${ago(wd.at, now)}: ${wd.conclusion ?? wd.status}.` : 'No run visible (the token may not reach bewatu-security).' });
  for (const [key, name] of Object.entries(REPOS)) {
    for (const [sensor, label, group] of [['code-analysis', 'Code analysis (Semgrep)', 'Vulnerabilities'], ['dependency-risk', 'Dependency audit', 'Vulnerabilities']] as const) {
      const st = I.scan_state?.[`${sensor}:${key}`], at = ms(st?.lastCompleteAt);
      out.push({ id: `${sensor}:${key}`, label: `${label}: ${name}`, group, status: age(at, 8 * DAY, now), lastAt: at, maxAgeMs: 8 * DAY,
        detail: at === null ? 'No completed scan of main recorded yet (recorded since the Security Center release).' : `Last completed scan of main ${ago(at, now)}: ${st.present ?? '?'} result(s)${st.refused ? `; the last reconciliation was refused by the safety brake (${st.refused.gone} of ${st.refused.open})` : ''}.` });
    }
    const run = d.github.security[key];
    out.push(!d.github.available ? { id: `ci-security:${key}`, label: `Security checks: ${name}`, group: 'Pipeline', status: 'unavailable', lastAt: null, maxAgeMs: 8 * DAY, detail: `GitHub could not be read: ${d.github.reason}` }
      : { id: `ci-security:${key}`, label: `Security checks: ${name}`, group: 'Pipeline', status: run ? (run.conclusion === 'success' ? age(run.at, 8 * DAY, now) : 'stale') : 'never', lastAt: run?.at ?? null, maxAgeMs: 8 * DAY,
        detail: run ? `Secret detection, Semgrep, dependency risk, cloud posture on main; last ${ago(run.at, now)}: ${run.conclusion}${(run.jobs ?? []).filter(j => j.conclusion && !['success', 'skipped'].includes(j.conclusion)).map(j => `; ${j.name} ${j.conclusion}`).join('')}.` : 'No completed run on main.' });
  }
  const rs = I.runtime_sensor, rAt = ms(rs?.lastBatchAt);
  out.push({ id: 'runtime-sensor', label: 'Runtime traffic sensor', group: 'Threats', status: rAt === null ? 'not_configured' : age(rAt, HOUR, now), lastAt: rAt, maxAgeMs: HOUR,
    detail: rAt === null ? 'No log batch has ever arrived. Connect a Vercel log drain to /api/security/runtime-anomaly (Bearer BEWATU_SECURITY_TOKEN) to see auth failures, API abuse and scraping.' : `Last log batch ${ago(rAt, now)} (${rs.lastBatchSize ?? '?'} lines).` });
  const cc = I.collection_counts?.samples, ccAt = Array.isArray(cc) && cc.length ? ms(cc[cc.length - 1].at) : null;
  out.push({ id: 'deletion-tripwire', label: 'Mass-deletion tripwire', group: 'Data', status: age(ccAt, 15 * MIN, now), lastAt: ccAt, maxAgeMs: 15 * MIN, detail: ccAt === null ? 'No collection counts recorded.' : `Counts 11 collections every 5 minutes; last ${ago(ccAt, now)}.` });
  out.push({ id: 'privileged-monitor', label: 'Privileged-access monitor', group: 'Identity', status: I.privileged_snapshot ? age(up, 15 * MIN, now) : 'never', lastAt: I.privileged_snapshot ? up : null, maxAgeMs: 15 * MIN,
    detail: I.privileged_snapshot ? 'Compares ops staff roles every 5 minutes and alerts on any change.' : 'No baseline of ops staff recorded yet.' });
  const sw = ms(I.cron_security_sweep?.lastRunAt), rules = String(I.security_sweep?.lastSummary?.rules ?? '');
  out.push({ id: 'security-sweep', label: 'Daily security sweep', group: 'Agent', status: age(sw, 26 * HOUR, now), lastAt: sw, maxAgeMs: 26 * HOUR, detail: sw === null ? 'Never ran.' : `Verifies fixes, nudges approvals, retires stale ones; last ${ago(sw, now)}${I.cron_security_sweep?.ok === false ? ' with an error' : ''}.` });
  out.push({ id: 'rules-drift', label: 'Firestore rules drift check', group: 'Data', status: sw === null ? 'never' : /^skipped/.test(rules) ? 'not_configured' : age(sw, 26 * HOUR, now), lastAt: sw, maxAgeMs: 26 * HOUR, detail: rules ? `Last result: ${rules}.` : 'Not run yet.' });
  const rec = I.recovery_state, recAt = ms(rec?.checkedAt);
  out.push({ id: 'recovery-telemetry', label: 'Backup and recovery telemetry', group: 'Recovery', status: rec?.skipped ? 'not_configured' : age(recAt, 26 * HOUR, now), lastAt: recAt, maxAgeMs: 26 * HOUR,
    detail: rec?.skipped ? String(rec.skipped) : recAt === null ? 'Not read yet (the daily posture job reads it).' : `Read ${ago(recAt, now)}.` });
  const certAt = ms(I.posture_state?.certsCheckedAt);
  out.push({ id: 'certificates', label: 'TLS certificate expiry', group: 'Infrastructure', status: age(certAt, 26 * HOUR, now), lastAt: certAt, maxAgeMs: 26 * HOUR, detail: certAt === null ? 'Not checked yet (the daily posture job checks it).' : `Checked ${ago(certAt, now)}.` });
  const ch = I.uptime_state?.alertChannelOk, chAt = ms(I.uptime_state?.alertChannelCheckedAt);
  out.push({ id: 'alert-channel', label: 'Alert delivery', group: 'Availability', status: ch === true ? 'fresh' : ch === false ? 'stale' : 'never', lastAt: chAt, maxAgeMs: Infinity,
    detail: ch === true ? `The last alert was delivered (${ago(chAt, now)}).` : ch === false ? 'The last alert could NOT be delivered: check RESEND_API_KEY and the alert address.' : 'No alert has been sent yet, so delivery is unproven (run the alert drill).' });
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// Security controls, mapped to OWASP and CWE, each with its live evidence
// ═════════════════════════════════════════════════════════════════════════════
export type ControlStatus = 'active' | 'degraded' | 'missing' | 'unknown';
export type Domain = 'detection' | 'identity' | 'data' | 'infrastructure' | 'recovery';
export interface Control { id: string; name: string; domain: Domain; owasp: string[]; cwe: string[]; status: ControlStatus; evidence: string; source: string }

export function evaluateControls(d: Data, sensors: Sensor[], now: number, openFindings: Rec[]): Control[] {
  const S = (id: string) => sensors.find(s => s.id === id);
  const fromSensor = (s: Sensor | undefined): ControlStatus => !s ? 'unknown' : s.status === 'fresh' ? 'active' : s.status === 'stale' ? 'degraded' : s.status === 'unavailable' ? 'unknown' : 'missing';
  const group = (prefix: string): ControlStatus => {
    const xs = sensors.filter(s => s.id.startsWith(prefix)); if (!xs.length) return 'unknown';
    if (xs.every(s => s.status === 'unavailable')) return 'unknown';
    const fresh = xs.filter(s => s.status === 'fresh').length;
    return fresh === xs.length ? 'active' : fresh > 0 || xs.some(s => s.status === 'stale') ? 'degraded' : 'missing';
  };
  const job = (repo: string, name: RegExp): { status: ControlStatus; text: string } => {
    if (!d.github.available) return { status: 'unknown', text: `GitHub could not be read: ${d.github.reason}` };
    const run = d.github.security[repo]; const j = run?.jobs?.find(x => name.test(x.name));
    if (!run || !j) return { status: 'missing', text: 'No completed run with this check on main.' };
    return { status: j.conclusion === 'success' ? (now - run.at <= 8 * DAY ? 'active' : 'degraded') : 'degraded', text: `${j.name}: ${j.conclusion} (${ago(run.at, now)}).` };
  };
  const ci = d.github.ci;
  const ciStatus: { status: ControlStatus; text: string } = !d.github.available ? { status: 'unknown', text: `GitHub could not be read: ${d.github.reason}` }
    : !ci ? { status: 'missing', text: 'No CI run on main.' } : { status: ci.conclusion === 'success' ? 'active' : 'degraded', text: `Enforced by tests in CI; last run on main ${ago(ci.at, now)}: ${ci.conclusion}.` };
  const secrets = (['bewatu_v3', 'bewatu_ops', 'bewatu_factory'] as const).map(r => job(r, /secret/i));
  const ai = job('bewatu_v3', /AI provider boundary/i);
  const rec = d.internal.recovery_state;
  const newest = ms(rec?.backups?.newestAt);
  const certs: Rec[] = Array.isArray(d.internal.posture_state?.certs) ? d.internal.posture_state!.certs : [];
  const minCertDays = certs.length ? Math.min(...certs.map(c => typeof c.daysLeft === 'number' ? c.daysLeft : Infinity)) : null;
  const tokenDays = d.github.tokenExpiresAt ? Math.floor((d.github.tokenExpiresAt - now) / DAY) : null;
  const lastDrill = (kind: string) => d.drills.filter(x => x.kind === kind && x.outcome === 'passed').map(x => ms(x.performedAt) ?? 0).sort((a, b) => b - a)[0] ?? null;
  const restore = lastDrill('restore'), alertDrill = lastDrill('alert');
  const rb = d.github.rollback.last;
  const depHigh = openFindings.filter(f => f.sensor === 'dependency-risk' && ['critical', 'high'].includes(f.severity)).length;
  const policy = readPolicy(d.policy, { SECURITY_AUTOMATION_DISABLED: d.env.automationKill ? '1' : undefined });
  const C: Control[] = [
    // detection
    { id: 'det.uptime', name: 'Uptime and integrity monitoring', domain: 'detection', owasp: ['A09:2021 Security Logging and Monitoring Failures'], cwe: ['CWE-778'], status: fromSensor(S('uptime-monitor')), evidence: S('uptime-monitor')!.detail, source: 'api/cron/healthcheck.ts' },
    { id: 'det.watchdog', name: 'Independent outside watchdog', domain: 'detection', owasp: ['A09:2021 Security Logging and Monitoring Failures'], cwe: ['CWE-778'], status: fromSensor(S('outside-watchdog')), evidence: S('outside-watchdog')!.detail, source: 'bewatu-security/.github/workflows/watchdog.yml' },
    { id: 'det.sast', name: 'Static code analysis on every main push and weekly', domain: 'detection', owasp: ['A03:2021 Injection', 'A05:2021 Security Misconfiguration'], cwe: ['CWE-79', 'CWE-89', 'CWE-346'], status: group('code-analysis:'), evidence: `${sensors.filter(s => s.id.startsWith('code-analysis:') && s.status === 'fresh').length} of 3 repositories scanned within 8 days.`, source: 'security.yml (Semgrep) -> finding.ts, scan-complete.ts' },
    { id: 'det.deps', name: 'Dependency vulnerability audit', domain: 'detection', owasp: ['A06:2021 Vulnerable and Outdated Components'], cwe: ['CWE-1395'], status: group('dependency-risk:'), evidence: `${sensors.filter(s => s.id.startsWith('dependency-risk:') && s.status === 'fresh').length} of 3 repositories audited within 8 days.`, source: 'security.yml (npm/pnpm audit)' },
    { id: 'det.runtime', name: 'Runtime anomaly detection (auth failures, abuse, deletions)', domain: 'detection', owasp: ['A09:2021 Security Logging and Monitoring Failures'], cwe: ['CWE-778', 'CWE-307'], status: fromSensor(S('runtime-sensor')), evidence: S('runtime-sensor')!.detail, source: 'api/security/runtime-anomaly.ts' },
    { id: 'det.alerting', name: 'Alerts reach a person', domain: 'detection', owasp: ['A09:2021 Security Logging and Monitoring Failures'], cwe: ['CWE-223'], status: fromSensor(S('alert-channel')), evidence: S('alert-channel')!.detail, source: 'Resend email, optional webhook' },
    // identity
    { id: 'id.rbac', name: 'Server-enforced role-based access', domain: 'identity', owasp: ['A01:2021 Broken Access Control'], cwe: ['CWE-285'], status: ciStatus.status, evidence: `Firestore rules and every route check the ops role on the server. ${ciStatus.text}`, source: 'firestore.rules, api/security/*' },
    { id: 'id.stepup', name: 'Fresh sign-in for sensitive security actions', domain: 'identity', owasp: ['A07:2021 Identification and Authentication Failures'], cwe: ['CWE-308'], status: ciStatus.status, evidence: `Approvals, policy changes, risk acceptance and suspension need a sign-in from the last ${STEP_UP_MAX_AGE_S / 60} minutes. ${ciStatus.text}`, source: 'api/security/center.ts, approve.ts' },
    { id: 'id.privileged', name: 'Privileged-access change alerts', domain: 'identity', owasp: ['A01:2021 Broken Access Control'], cwe: ['CWE-269'], status: fromSensor(S('privileged-monitor')), evidence: S('privileged-monitor')!.detail, source: 'api/cron/healthcheck.ts' },
    { id: 'id.admins', name: 'Few platform admins', domain: 'identity', owasp: ['A01:2021 Broken Access Control'], cwe: ['CWE-250'], status: d.platformAdmins === null ? 'unknown' : d.platformAdmins <= 3 ? 'active' : 'degraded', evidence: d.platformAdmins === null ? 'Could not count ops staff.' : `${d.platformAdmins} active platform admin(s) (target: 3 or fewer).`, source: 'ops_staff' },
    { id: 'id.auth-abuse', name: 'Credential-stuffing and auth-failure detection', domain: 'identity', owasp: ['A07:2021 Identification and Authentication Failures'], cwe: ['CWE-307'], status: fromSensor(S('runtime-sensor')), evidence: S('runtime-sensor')!.status === 'fresh' ? 'Auth failure spikes are detected from live traffic.' : 'Needs the runtime traffic sensor (no log drain connected).', source: 'api/security/runtime-anomaly.ts' },
    // data
    { id: 'data.rules', name: 'Deployed Firestore rules match reviewed code', domain: 'data', owasp: ['A01:2021 Broken Access Control'], cwe: ['CWE-284'], status: /DRIFT/.test(String(d.internal.security_sweep?.lastSummary?.rules ?? '')) ? 'degraded' : fromSensor(S('rules-drift')), evidence: S('rules-drift')!.detail, source: 'api/cron/security-sweep.ts' },
    { id: 'data.deletion', name: 'Mass-deletion tripwire', domain: 'data', owasp: ['A01:2021 Broken Access Control'], cwe: ['CWE-284'], status: fromSensor(S('deletion-tripwire')), evidence: S('deletion-tripwire')!.detail, source: 'api/cron/healthcheck.ts' },
    { id: 'data.secrets', name: 'Secret scanning before code reaches main', domain: 'data', owasp: ['A07:2021 Identification and Authentication Failures'], cwe: ['CWE-798'], status: secrets.every(x => x.status === 'active') ? 'active' : secrets.every(x => x.status === 'unknown') ? 'unknown' : secrets.some(x => x.status === 'active') ? 'degraded' : 'missing', evidence: secrets.map((x, i) => `${Object.values(REPOS)[i]}: ${x.text}`).join(' '), source: 'gitleaks in security.yml and pre-push hooks' },
    { id: 'data.redaction', name: 'Credentials redacted from security evidence', domain: 'data', owasp: ['A09:2021 Security Logging and Monitoring Failures'], cwe: ['CWE-532'], status: ciStatus.status, evidence: `Evidence is redacted when stored and again when shown. ${ciStatus.text}`, source: 'finding.ts, center.ts' },
    { id: 'data.cors-escaping', name: 'CORS allowlists and HTML escaping', domain: 'data', owasp: ['A05:2021 Security Misconfiguration', 'A03:2021 Injection'], cwe: ['CWE-346', 'CWE-79'], status: ciStatus.status, evidence: ciStatus.text, source: 'test/cors-and-html' },
    // infrastructure
    { id: 'infra.pipeline', name: 'Security checks pass on main', domain: 'infrastructure', owasp: ['A05:2021 Security Misconfiguration'], cwe: ['CWE-1104'], status: group('ci-security:'), evidence: sensors.filter(s => s.id.startsWith('ci-security:')).map(s => s.detail).join(' '), source: 'security.yml' },
    { id: 'infra.supply-chain', name: 'Pinned actions and delayed dependency updates', domain: 'infrastructure', owasp: ['A08:2021 Software and Data Integrity Failures'], cwe: ['CWE-829'], status: ciStatus.status, evidence: `Every action is pinned to a commit SHA; Dependabot waits 7 days. ${ciStatus.text}`, source: 'test/scan-complete' },
    { id: 'infra.dependencies', name: 'No high or critical vulnerable dependencies', domain: 'infrastructure', owasp: ['A06:2021 Vulnerable and Outdated Components'], cwe: ['CWE-1395'], status: group('dependency-risk:') === 'missing' ? 'unknown' : depHigh === 0 ? 'active' : 'degraded', evidence: depHigh === 0 ? 'No open high or critical dependency findings.' : `${depHigh} open high or critical dependency finding(s).`, source: 'dependency-risk findings' },
    { id: 'infra.tls', name: 'TLS certificates valid for 21+ days', domain: 'infrastructure', owasp: ['A02:2021 Cryptographic Failures'], cwe: ['CWE-298'], status: minCertDays === null ? (S('certificates')!.status === 'never' ? 'unknown' : 'unknown') : minCertDays >= 21 ? 'active' : minCertDays >= 7 ? 'degraded' : 'missing', evidence: certs.length ? certs.map(c => `${c.host}: ${c.error ? `error (${c.error})` : `${c.daysLeft} days`}`).join('; ') : 'Not checked yet.', source: 'daily posture job' },
    { id: 'infra.credentials', name: 'Automation credentials not about to expire', domain: 'infrastructure', owasp: ['A07:2021 Identification and Authentication Failures'], cwe: ['CWE-324'], status: !d.github.available ? 'unknown' : tokenDays === null ? 'active' : tokenDays >= 14 ? 'active' : tokenDays >= 0 ? 'degraded' : 'missing', evidence: !d.github.available ? 'GitHub could not be read.' : tokenDays === null ? 'The GitHub token reports no expiry date.' : `The GitHub token expires in ${tokenDays} day(s).`, source: 'GitHub API response header' },
    { id: 'infra.abuse', name: 'Bot, scraping and API-abuse detection', domain: 'infrastructure', owasp: ['A04:2021 Insecure Design'], cwe: ['CWE-770', 'CWE-799'], status: fromSensor(S('runtime-sensor')), evidence: S('runtime-sensor')!.status === 'fresh' ? 'Per-client request rates and broad crawling are checked on live traffic.' : 'Needs the runtime traffic sensor (no log drain connected).', source: 'api/security/runtime-anomaly.ts' },
    { id: 'infra.ai-boundary', name: 'AI provider boundary', domain: 'infrastructure', owasp: ['OWASP LLM02:2025 Sensitive Information Disclosure'], cwe: ['CWE-200'], status: ai.status, evidence: ai.text, source: 'scripts/check-ai-provider-boundary.sh' },
    { id: 'infra.agent-guardrails', name: 'AI remediation guardrails and autonomy limits', domain: 'infrastructure', owasp: ['OWASP LLM06:2025 Excessive Agency', 'OWASP LLM01:2025 Prompt Injection'], cwe: ['CWE-250'], status: ciStatus.status, evidence: `Autonomy: ${policy.mode}${policy.suspended ? ' (SUSPENDED)' : ''}. Fixes are limited in size and path, never touch CI, open a pull request a person merges, and cannot change their own policy. ${ciStatus.text}`, source: 'approve.ts, center.ts, security-sweep.ts' },
    // recovery
    { id: 'rec.pitr', name: 'Point-in-time recovery', domain: 'recovery', owasp: [], cwe: ['CWE-1229'], status: !rec || rec.skipped ? 'unknown' : rec.pitr === 'POINT_IN_TIME_RECOVERY_ENABLED' ? 'active' : 'missing', evidence: !rec || rec.skipped ? (rec?.skipped ?? 'Not read yet.') : `${rec.pitr === 'POINT_IN_TIME_RECOVERY_ENABLED' ? 'Enabled' : 'DISABLED'}${rec.versionRetention ? `, retention ${rec.versionRetention}` : ''}.`, source: 'Firestore Admin API' },
    { id: 'rec.backups', name: 'Daily backups, newest under 36 hours old', domain: 'recovery', owasp: [], cwe: ['CWE-1229'], status: !rec || rec.skipped ? 'unknown' : newest !== null && now - newest <= 36 * HOUR ? 'active' : 'missing', evidence: !rec || rec.skipped ? (rec?.skipped ?? 'Not read yet.') : `${rec.backups?.count ?? 0} backup(s); newest ${ago(newest, now)}.`, source: 'Firestore Admin API' },
    { id: 'rec.delete-protection', name: 'Database delete protection', domain: 'recovery', owasp: [], cwe: ['CWE-1229'], status: !rec || rec.skipped ? 'unknown' : rec.deleteProtection === 'DELETE_PROTECTION_ENABLED' ? 'active' : 'missing', evidence: !rec || rec.skipped ? (rec?.skipped ?? 'Not read yet.') : rec.deleteProtection === 'DELETE_PROTECTION_ENABLED' ? 'Enabled.' : 'DISABLED: gcloud firestore databases update --database=\'(default)\' --delete-protection', source: 'Firestore Admin API' },
    { id: 'rec.restore-drill', name: 'Restore drill within 180 days', domain: 'recovery', owasp: [], cwe: ['CWE-1229'], status: restore !== null && now - restore <= 180 * DAY ? 'active' : 'missing', evidence: restore === null ? 'No successful restore drill recorded: recovery time is unmeasured.' : `Last successful drill ${ago(restore, now)}.`, source: 'security_drills' },
    { id: 'rec.rollback', name: 'Rollback rehearsed within 90 days', domain: 'recovery', owasp: [], cwe: ['CWE-1229'], status: !d.github.available ? 'unknown' : rb && rb.conclusion === 'success' && now - rb.at <= 90 * DAY ? 'active' : 'missing', evidence: !d.github.available ? 'GitHub could not be read.' : rb ? `Last rollback run ${ago(rb.at, now)}: ${rb.title ?? ''} ${rb.conclusion}.` : 'The rollback workflow has never run (do a dry run).', source: '.github/workflows/rollback.yml' },
    { id: 'rec.alert-drill', name: 'Alert drill within 180 days', domain: 'recovery', owasp: [], cwe: ['CWE-223'], status: alertDrill !== null && now - alertDrill <= 180 * DAY ? 'active' : d.internal.uptime_state?.alertChannelOk === true ? 'degraded' : 'missing', evidence: alertDrill !== null ? `Last drill ${ago(alertDrill, now)}.` : 'No alert drill recorded (docs/alert-drill.md).', source: 'security_drills' },
  ];
  return C;
}

// ═════════════════════════════════════════════════════════════════════════════
// Score: transparent, configurable, and capped by anything that makes it untrustworthy
// ═════════════════════════════════════════════════════════════════════════════
export const DOMAIN_WEIGHTS: Record<'vulnerability' | Domain, number> = { vulnerability: 30, detection: 20, identity: 15, data: 10, infrastructure: 10, recovery: 15 };
export const DOMAIN_LABEL: Record<'vulnerability' | Domain, string> = { vulnerability: 'Vulnerability exposure', detection: 'Detection readiness', identity: 'Identity and access', data: 'Data protection', infrastructure: 'Infrastructure and supply chain', recovery: 'Recovery' };
export const VULN_PENALTY: Record<string, number> = { critical: 25, high: 10, medium: 3, low: 1, informational: 0 };
export const STATUS_POINTS: Record<ControlStatus, number | null> = { active: 1, degraded: 0.5, missing: 0, unknown: null };
export const MIN_COVERAGE = 0.5;

export interface Posture { score: number | null; raw: number | null; grade: string; coverage: number; caps: { reason: string; max: number }[]; domains: { id: string; label: string; weight: number; score: number | null; known: number; total: number; factors: string[] }[]; reason?: string }
export function scorePosture(controls: Control[], openFindings: Rec[], incidents: Rec[], sensors: Sensor[], now: number): Posture {
  const vulnTelemetry = sensors.some(s => (s.id.startsWith('code-analysis:') || s.id.startsWith('dependency-risk:')) && s.lastAt !== null);
  const counted = openFindings.filter(f => f.status !== 'accepted_risk');
  const penalty = counted.reduce((a, f) => a + (VULN_PENALTY[f.severity] ?? 0), 0);
  const bySev = SEVERITIES.map(s => [s, counted.filter(f => f.severity === s).length] as const).filter(([, n]) => n);
  const domains: Posture['domains'] = [{ id: 'vulnerability', label: DOMAIN_LABEL.vulnerability, weight: DOMAIN_WEIGHTS.vulnerability, score: vulnTelemetry ? Math.max(0, 100 - penalty) : null, known: vulnTelemetry ? 1 : 0, total: 1,
    factors: vulnTelemetry ? [`100 minus ${penalty} (${bySev.map(([s, n]) => `${n} ${s} x ${VULN_PENALTY[s]}`).join(', ') || 'no open findings'})`] : ['No scan has reported yet'] }];
  for (const dom of ['detection', 'identity', 'data', 'infrastructure', 'recovery'] as Domain[]) {
    const cs = controls.filter(c => c.domain === dom), known = cs.filter(c => STATUS_POINTS[c.status] !== null);
    const pts = known.reduce((a, c) => a + (STATUS_POINTS[c.status] ?? 0), 0);
    domains.push({ id: dom, label: DOMAIN_LABEL[dom], weight: DOMAIN_WEIGHTS[dom], score: known.length ? Math.round((100 * pts) / known.length) : null, known: known.length, total: cs.length,
      factors: cs.filter(c => c.status !== 'active').map(c => `${c.name}: ${c.status}`) });
  }
  const known = domains.reduce((a, x) => a + x.known, 0), total = domains.reduce((a, x) => a + x.total, 0);
  const coverage = total ? known / total : 0;
  const scored = domains.filter(x => x.score !== null);
  const raw = scored.length ? Math.round(scored.reduce((a, x) => a + x.weight * (x.score as number), 0) / scored.reduce((a, x) => a + x.weight, 0)) : null;
  const caps: Posture['caps'] = [];
  const openInc = incidents.filter(i => i.status !== 'resolved');
  if (openInc.some(i => i.severity === 'critical')) caps.push({ reason: 'A critical security incident is open', max: 40 });
  else if (openInc.some(i => i.severity === 'high')) caps.push({ reason: 'A high-severity incident is open', max: 60 });
  const mon = sensors.find(s => s.id === 'uptime-monitor');
  if (mon && mon.status !== 'fresh') caps.push({ reason: 'The uptime and integrity monitor is not reporting', max: 50 });
  if (counted.some(f => f.severity === 'critical' && slaOf(f, now).breached)) caps.push({ reason: 'A critical finding is past its 48-hour deadline', max: 50 });
  const scans = sensors.filter(s => s.id.startsWith('code-analysis:') || s.id.startsWith('dependency-risk:'));
  if (scans.length && scans.every(s => s.status === 'stale')) caps.push({ reason: 'Every vulnerability scan is out of date', max: 60 });
  if (sensors.find(s => s.id === 'alert-channel')?.status === 'stale') caps.push({ reason: 'Alerts are not being delivered', max: 60 });
  if (raw === null || coverage < MIN_COVERAGE) return { score: null, raw, grade: 'Insufficient data', coverage, caps, domains, reason: `Only ${Math.round(coverage * 100)}% of the scored controls have telemetry (at least ${MIN_COVERAGE * 100}% is needed for a score).` };
  const score = Math.min(raw, ...caps.map(c => c.max));
  const grade = score >= 85 ? 'Strong' : score >= 70 ? 'Fair' : score >= 50 ? 'Weak' : 'Critical';
  return { score, raw, grade, coverage, caps, domains };
}

// ═════════════════════════════════════════════════════════════════════════════
// The snapshot
// ═════════════════════════════════════════════════════════════════════════════
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function enrichFinding(f: Rec, d: Data, now: number): Rec {
  const approval = d.approvals.find(a => a.findingId === f.id && a.status === 'pending');
  const plan = f.remediationPlanId ? d.plans.find(p => p.id === f.remediationPlanId) : undefined;
  const prKey = f.prUrl ? String(f.prUrl).replace(/^https:\/\/github\.com\/[^/]+\//, '').replace('/pull/', '#') : null;
  const pr = prKey ? d.github.prs[prKey] ?? null : null;
  const { stage, closedAs } = stageOf(f, { approvalPending: !!approval, pr });
  const sla = slaOf(f, now);
  return {
    id: f.id, findingId: f.findingId ?? f.id, title: redact(f.title, 200), shortTitle: redact(String(f.title ?? '').replace(/^(Semgrep: )(?:[\w-]+\.)+([\w-]+)$/, '$1$2'), 200), rule: ruleOf(f), severity: f.severity ?? 'informational', riskScore: f.riskScore ?? null,
    confidence: confidenceOf(f), priority: CLOSED.includes(f.status) ? null : priorityOf(f, now), status: f.status, stage, stageLabel: STAGE_LABEL[stage], closedAs: closedAs ?? null,
    component: { repo: f.repo ?? null, repoName: REPOS[f.repo] ?? f.repo ?? null, file: f.evidence?.filePath ?? null, line: f.evidence?.lineNumber ?? null },
    environment: f.sensor === 'runtime-anomaly' ? 'production' : 'main branch (deployed to production)',
    source: f.sensor ?? 'unknown', category: f.category ?? null,
    description: redact(f.description, 1500), evidence: { snippet: f.evidence?.snippet ? redact(f.evidence.snippet, 500) : null, ruleId: f.evidence?.ruleId ?? null },
    frameworks: frameworksOf(f), exposure: exposureOf(f), impact: impactOf(f), recommendation: recommendationOf(f, plan),
    owner: f.owner ? { uid: f.owner.uid, email: f.owner.email } : null,
    detectedAt: ms(f.detectedAt), lastReportedAt: ms(f.lastReportedAt), resolvedAt: ms(f.resolvedAt), closedAt: ms(f.closedAt), validatedAt: ms(f.validatedAt),
    slaDueAt: sla.dueAt, slaBreached: sla.breached, reopenCount: f.reopenCount ?? 0, acceptedUntil: ms(f.acceptedUntil),
    verification: f.status === 'verified' ? { by: f.verifiedBy ?? null, resolution: redact(f.resolution ?? '', 400) } : null,
    approvalId: approval?.id ?? null, prUrl: f.prUrl ?? null, issueUrl: f.issueUrl ?? null, prChecks: pr?.checks ?? null,
    falsePositiveReason: f.falsePositiveReason ? redact(f.falsePositiveReason, 400) : null,
  };
}

export function buildSnapshot(d: Data, now: number, viewer: { role: string }): Rec {
  const sensors = evaluateSensors(d, now);
  const open = d.findings.filter(f => !CLOSED.includes(f.status));
  const controls = evaluateControls(d, sensors, now, open);
  const posture = scorePosture(controls, open, d.incidents, sensors, now);
  const enriched = d.findings.map(f => enrichFinding(f, d, now));
  const openE = enriched.filter(f => !CLOSED.includes(f.status));
  const sevCount = (xs: Rec[]) => Object.fromEntries(SEVERITIES.map(s => [s, xs.filter(f => f.severity === s).length]));
  const policy = readPolicy(d.policy, { SECURITY_AUTOMATION_DISABLED: d.env.automationKill ? '1' : undefined });

  // MTTR from real resolutions (90 days); MTTD only where the start of the problem is known (runtime incidents).
  const resolved = d.findings.filter(f => f.status === 'verified' && ms(f.resolvedAt) !== null && now - (ms(f.resolvedAt) as number) <= 90 * DAY && ms(f.detectedAt) !== null);
  const mttr = Object.fromEntries(SEVERITIES.map(s => { const xs = resolved.filter(f => f.severity === s).map(f => ((ms(f.resolvedAt) as number) - (ms(f.detectedAt) as number)) / HOUR); return [s, { medianHours: median(xs), n: xs.length }]; }));
  const allMttr = resolved.map(f => ((ms(f.resolvedAt) as number) - (ms(f.detectedAt) as number)) / HOUR);
  const detectXs = d.incidents.filter(i => ms(i.firstSignalAt) !== null && ms(i.openedAt) !== null).map(i => ((ms(i.openedAt) as number) - (ms(i.firstSignalAt) as number)) / MIN);

  // Weekly vulnerability trend, straight from detection and resolution times (8 weeks).
  const weeks = Array.from({ length: 8 }, (_, i) => { const end = now - (7 - i) * 7 * DAY, start = end - 7 * DAY;
    return { weekEnding: dayKey(end), detected: d.findings.filter(f => { const t = ms(f.detectedAt); return t !== null && t > start && t <= end; }).length,
      resolved: d.findings.filter(f => { const t = ms(f.resolvedAt) ?? (CLOSED.includes(f.status) ? ms(f.updatedAt) : null); return CLOSED.includes(f.status) && t !== null && t > start && t <= end; }).length,
      incidents: d.incidents.filter(x => { const t = ms(x.openedAt); return t !== null && t > start && t <= end; }).length }; });

  const events30 = d.events.filter(e => (ms(e.timestamp) ?? 0) >= now - 30 * DAY);
  const openIncidents = d.incidents.filter(i => i.status !== 'resolved');
  const plans90 = d.plans.filter(p => (ms(p.createdAt) ?? 0) >= now - 90 * DAY);
  const executed = plans90.filter(p => ['completed', 'approved', 'failed'].includes(p.status) || p.prNumber);
  const failed = plans90.filter(p => p.status === 'failed' && p.approvedBy);
  const verifiedAfterFix = d.findings.filter(f => f.status === 'verified' && f.remediationPlanId && executed.some(p => p.id === f.remediationPlanId));
  const reopened = d.findings.filter(f => (f.reopenCount ?? 0) > 0);
  // A fix still in flight (pull request open, not yet merged or verified) has no outcome yet: it counts neither way.
  const reopenedAfterFix = d.findings.filter(f => (f.reopenCount ?? 0) > 0 && f.remediationPlanId && executed.some(p => p.id === f.remediationPlanId));
  const outcomes = verifiedAfterFix.length + failed.length + reopenedAfterFix.length;
  const scanState = d.internal.scan_state ?? {};
  const refused = Object.entries(scanState).filter(([, v]) => v && typeof v === 'object' && (v as Rec).pendingClose?.ids?.length).map(([k, v]) => ({ key: k, ...(v as Rec).pendingClose, at: ms((v as Rec).pendingClose.at) }));

  // What a person should look at first.
  const attention: Rec[] = [];
  for (const i of openIncidents.filter(x => ['critical', 'high'].includes(x.severity))) attention.push({ kind: 'incident', severity: i.severity, text: `Open ${i.severity} incident: ${redact(i.title, 120)}`, target: { section: 'threats', id: i.id } });
  const breached = openE.filter(f => f.slaBreached);
  if (breached.length) attention.push({ kind: 'sla', severity: breached.some(f => f.severity === 'critical') ? 'critical' : 'high', text: `${breached.length} finding(s) past their fix deadline`, target: { section: 'vulnerabilities', filter: 'sla' } });
  const unassigned = openE.filter(f => ['critical', 'high'].includes(f.severity) && !f.owner);
  if (unassigned.length) attention.push({ kind: 'owner', severity: 'high', text: `${unassigned.length} critical or high finding(s) have no owner`, target: { section: 'vulnerabilities', filter: 'unassigned' } });
  const oldApprovals = d.approvals.filter(a => a.status === 'pending' && now - (ms(a.createdAt) ?? now) > DAY);
  if (oldApprovals.length) attention.push({ kind: 'approval', severity: 'medium', text: `${oldApprovals.length} proposed fix(es) waiting over a day for a decision`, target: { section: 'remediation' } });
  for (const r of refused) attention.push({ kind: 'brake', severity: 'high', text: `A scan wants to close ${r.ids.length} findings at once (${r.key}): confirm or investigate`, target: { section: 'remediation', id: r.key } });
  for (const s of sensors.filter(x => ['stale', 'never'].includes(x.status) && !['alert-channel'].includes(x.id))) attention.push({ kind: 'coverage', severity: ['uptime-monitor', 'security-sweep'].includes(s.id) ? 'critical' : 'medium', text: `${s.label}: ${s.status === 'never' ? 'never reported' : 'out of date'}`, target: { section: 'controls', id: s.id } });
  for (const c of controls.filter(x => x.domain === 'recovery' && x.status === 'missing')) attention.push({ kind: 'recovery', severity: 'medium', text: `${c.name}: not in place`, target: { section: 'recovery', id: c.id } });
  if (policy.suspended) attention.push({ kind: 'suspended', severity: 'info', text: `Automated remediation is suspended${policy.envKill ? ' by the SECURITY_AUTOMATION_DISABLED switch' : ''}`, target: { section: 'agent' } });
  const chain = verifyChain(d.audit);
  if (!chain.ok) attention.push({ kind: 'audit', severity: 'critical', text: `The security audit log failed its integrity check at entry ${chain.brokenAt}`, target: { section: 'audit' } });
  attention.sort((a, b) => (SEV_RANK[a.severity] ?? 5) - (SEV_RANK[b.severity] ?? 5));

  // The agent: the scheduled jobs and sensors that act on the platform's behalf.
  const beats = ['uptime-monitor', 'security-sweep', 'outside-watchdog', 'runtime-sensor'].map(id => sensors.find(s => s.id === id)!).filter(Boolean);
  const postureAt = ms(d.internal.posture_state?.lastRunAt);
  const coreDown = sensors.find(s => s.id === 'uptime-monitor')?.status !== 'fresh' || sensors.find(s => s.id === 'security-sweep')?.status === 'stale';
  const findings30 = d.findings.filter(f => (ms(f.detectedAt) ?? 0) >= now - 30 * DAY);
  const counter = d.internal.agent_counters ?? {};
  const agentErrors: string[] = [];
  if (d.internal.cron_security_sweep?.ok === false) agentErrors.push('The last security sweep reported an error.');
  if ((d.internal.security_sweep?.lastSummary?.githubErrors ?? 0) > 0) agentErrors.push(`The last sweep could not check ${d.internal.security_sweep.lastSummary.githubErrors} pull request(s) on GitHub.`);
  if (d.internal.posture_state?.lastRunOk === false) agentErrors.push(`The last posture job failed: ${redact(d.internal.posture_state.lastError ?? 'unknown', 200)}`);
  if (!d.github.available) agentErrors.push(`GitHub is not readable: ${d.github.reason}`);
  for (const r of refused) agentErrors.push(`Safety brake: ${r.key} wanted to close ${r.ids.length} of ${r.open} findings.`);

  return {
    generatedAt: now,
    viewer: { role: viewer.role, can: { triage: ROLE_CAN.triage.includes(viewer.role), govern: ROLE_CAN.govern.includes(viewer.role) }, stepUpMaxAgeS: STEP_UP_MAX_AGE_S },
    assignees: d.assignees ?? [],
    posture: { ...posture, history: d.metrics.map(m => ({ date: m.date, score: m.score ?? null, coverage: m.coverage ?? null, open: m.open ?? null, incidentsOpen: m.incidentsOpen ?? null })), weights: DOMAIN_WEIGHTS, penalties: VULN_PENALTY, minCoverage: MIN_COVERAGE },
    coverage: { sensors, fresh: sensors.filter(s => s.status === 'fresh').length, total: sensors.length },
    vulnerabilities: {
      open: sevCount(openE), byStage: Object.fromEntries(STAGES.map(s => [s, enriched.filter(f => f.stage === s).length])),
      slaBreached: breached.length, unassigned: unassigned.length, reopened: reopened.length, lastScanAt: Math.max(0, ...sensors.filter(s => s.id.startsWith('code-analysis:') || s.id.startsWith('dependency-risk:')).map(s => s.lastAt ?? 0)) || null,
      items: enriched.sort((a, b) => Number(CLOSED.includes(a.status)) - Number(CLOSED.includes(b.status)) || (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9') || (SEV_RANK[a.severity] ?? 5) - (SEV_RANK[b.severity] ?? 5) || (b.detectedAt ?? 0) - (a.detectedAt ?? 0)),
      sla: SLA_HOURS,
    },
    threats: {
      events30d: events30.length, eventsBySeverity: sevCount(events30.map(e => ({ severity: e.severity ?? 'medium' }))),
      events: events30.slice(0, 100).map(e => ({ id: e.id, type: e.type, severity: e.severity ?? 'medium', at: ms(e.timestamp), source: e.source ?? null, summary: redact(e.summary ?? e.type, 300), incidentId: e.incidentId ?? null, blocked: e.blocked === true })),
      blocked: { count: events30.filter(e => e.blocked === true).length, measured: events30.some(e => typeof e.blocked === 'boolean'), note: 'Counts only events an enforcement point marked as blocked. CORS refusals and rate limits do not report here yet.' },
      incidents: d.incidents.map(i => ({ ...i, title: redact(i.title, 200), summary: redact(i.summary ?? '', 1500), openedAt: ms(i.openedAt), resolvedAt: ms(i.resolvedAt), firstSignalAt: ms(i.firstSignalAt),
        timeline: (Array.isArray(i.timeline) ? i.timeline : []).map((t: Rec) => ({ ...t, at: ms(t.at), note: redact(t.note ?? '', 1000) })) })),
      openIncidents: openIncidents.length,
      monitored: { runtime: sensors.find(s => s.id === 'runtime-sensor')?.status ?? 'never', privileged: sensors.find(s => s.id === 'privileged-monitor')?.status ?? 'never', deletions: sensors.find(s => s.id === 'deletion-tripwire')?.status ?? 'never' },
    },
    remediation: {
      pendingApprovals: d.approvals.filter(a => a.status === 'pending').map(a => ({ id: a.id, findingId: a.findingId, title: redact(String(a.title ?? '').replace(/^(Semgrep: )(?:[\w-]+\.)+([\w-]+)$/, '$1$2'), 200), severity: d.findings.find(f => f.id === a.findingId)?.severity ?? a.severity, summary: redact(a.summary ?? '', 1000), rollbackPlan: redact(a.rollbackPlan ?? '', 600), explanation: redact(a.aiExplanation ?? '', 3000), diff: a.diff ? redact(a.diff, 4000) : null, createdAt: ms(a.createdAt), expiresAt: ms(a.expiresAt), lastFailure: a.lastFailure ? redact(a.lastFailure, 300) : null })),
      inProgress: openE.filter(f => ['testing', 'approval', 'deployment'].includes(f.stage)).map(f => ({ id: f.id, title: f.shortTitle, stage: f.stage, prUrl: f.prUrl, issueUrl: f.issueUrl, prChecks: f.prChecks })),
      stats90d: { proposed: plans90.length, executed: executed.length, failed: failed.length, byAgent: plans90.filter(p => p.approvedBy === 'security-agent').length, verified: verifiedAfterFix.length, reopened: reopened.length,
        inFlight: Math.max(0, executed.length - outcomes), successRate: outcomes ? verifiedAfterFix.length / outcomes : null, failureRate: outcomes ? (failed.length + reopenedAfterFix.length) / outcomes : null },
      refusedReconciliations: refused,
    },
    mttr: { bySeverity: mttr, overall: { medianHours: median(allMttr), n: allMttr.length } },
    mttd: detectXs.length ? { medianMinutes: median(detectXs), n: detectXs.length, note: 'Measured on incidents: from the first signal to the incident being opened.' } : { medianMinutes: null, n: 0, note: 'Not measurable yet: detection time needs the moment a problem began, which only runtime incidents record, and none has been recorded.' },
    trends: { weeks, startedAt: d.metrics[0]?.date ?? null },
    attention,
    controls,
    recovery: {
      state: d.internal.recovery_state ? { ...d.internal.recovery_state, checkedAt: ms(d.internal.recovery_state.checkedAt), backups: d.internal.recovery_state.backups ? { ...d.internal.recovery_state.backups, newestAt: ms(d.internal.recovery_state.backups.newestAt) } : null } : null,
      controls: controls.filter(c => c.domain === 'recovery'),
      rpo: d.internal.recovery_state?.pitr === 'POINT_IN_TIME_RECOVERY_ENABLED' ? 'About 1 minute (point-in-time recovery)' : ms(d.internal.recovery_state?.backups?.newestAt) !== null ? `Up to ${Math.round((now - (ms(d.internal.recovery_state!.backups.newestAt) as number)) / HOUR)} hours (newest backup)` : null,
      rto: (() => { const r = d.drills.filter(x => x.kind === 'restore' && x.outcome === 'passed' && typeof x.durationMinutes === 'number').sort((a, b) => (ms(b.performedAt) ?? 0) - (ms(a.performedAt) ?? 0))[0]; return r ? `${r.durationMinutes} minutes (restore drill ${dayKey(ms(r.performedAt) as number)})` : null; })(),
      drills: d.drills.map(x => ({ ...x, performedAt: ms(x.performedAt), notes: redact(x.notes ?? '', 600) })),
      rollback: d.github.rollback,
    },
    agent: {
      status: policy.suspended ? 'suspended' : coreDown ? 'degraded' : 'operational',
      heartbeats: [...beats, { id: 'posture', label: 'Daily posture job', group: 'Agent', status: age(postureAt, 26 * HOUR, now), lastAt: postureAt, maxAgeMs: 26 * HOUR, detail: postureAt === null ? 'Never ran.' : `Last ${ago(postureAt, now)}.` }],
      lastSuccessAt: Math.max(...[d.internal.uptime_state?.lastRunOk ? ms(d.internal.uptime_state.lastRunAt) : null, d.internal.cron_security_sweep?.ok ? ms(d.internal.cron_security_sweep.lastRunAt) : null, d.internal.posture_state?.lastRunOk ? postureAt : null].map(x => x ?? 0)) || null,
      policy: { mode: policy.mode, suspended: policy.suspended, suspendedReason: policy.suspendedReason, envKill: policy.envKill, maxAgentPrsPerDay: policy.maxAgentPrsPerDay, lowRiskRules: policy.lowRiskRules, maxAutoSeverity: policy.maxAutoSeverity, catalog: LOW_RISK_RULE_CATALOG, updatedBy: d.policy?.updatedBy ?? null, updatedAt: ms(d.policy?.updatedAt) },
      agentPrsToday: counter[dayKey(now)] ?? 0,
      capabilities: [
        { id: 'detect', label: 'Detect: scans, runtime sensor, monitors', enabled: true },
        { id: 'validate', label: 'Validate: re-detection by a later scan, advisory matches', enabled: true },
        { id: 'prioritize', label: 'Prioritize: severity, exposure and deadline', enabled: true },
        { id: 'propose', label: 'Propose fixes (an approval request per finding)', enabled: !policy.suspended && policy.mode !== 'observe' },
        { id: 'generate', label: 'Generate a fix and open a pull request once approved', enabled: !policy.suspended && d.env.has.GITHUB_TOKEN && d.env.has.ANTHROPIC_API_KEY },
        { id: 'auto-low-risk', label: `Open pull requests for pre-approved low-risk fixes (max ${policy.maxAgentPrsPerDay}/day)`, enabled: !policy.suspended && policy.mode === 'auto_low_risk' },
        { id: 'verify', label: 'Verify fixes independently (a full scan cycle without the problem)', enabled: true },
        { id: 'reopen', label: 'Reopen a finding that comes back', enabled: true },
        { id: 'rollback', label: 'Rollback: supervised (a person runs the rollback workflow)', enabled: false },
        { id: 'merge', label: 'Merge or deploy: never (a person merges every pull request)', enabled: false },
      ],
      permissions: [
        { id: 'GITHUB_TOKEN', label: 'GitHub: open pull requests and issues (no merge, no workflow edits)', configured: d.env.has.GITHUB_TOKEN },
        { id: 'ANTHROPIC_API_KEY', label: 'AI model: draft fixes (output is validated, size- and path-limited)', configured: d.env.has.ANTHROPIC_API_KEY },
        { id: 'FIREBASE_SERVICE_ACCOUNT_APP_SERVER', label: 'Firestore: write security records', configured: d.env.has.FIREBASE_SERVICE_ACCOUNT_APP_SERVER },
        { id: 'FIREBASE_SERVICE_ACCOUNT_RULES_VIEWER', label: 'Firebase Rules: read deployed rules (drift check)', configured: d.env.has.FIREBASE_SERVICE_ACCOUNT_RULES_VIEWER },
        { id: 'FIREBASE_SERVICE_ACCOUNT_BACKUP_VIEWER', label: 'Firestore Admin: read backups, PITR and delete protection', configured: d.env.has.FIREBASE_SERVICE_ACCOUNT_BACKUP_VIEWER },
        { id: 'BEWATU_SECURITY_TOKEN', label: 'Sensors: report findings and log batches', configured: d.env.has.BEWATU_SECURITY_TOKEN },
      ],
      schedule: [
        { job: 'Uptime and integrity monitor', when: 'Every 5 minutes' },
        { job: 'Outside watchdog (bewatu-security)', when: 'Every 15 minutes' },
        { job: 'Security scans of main', when: 'On every push to main, and Mondays 06:00 UTC' },
        { job: 'Security sweep (verify, nudge, retire, agent pass)', when: 'Daily 08:30 UTC' },
        { job: 'Posture job (backups, certificates, metrics, notifications)', when: 'Daily 08:45 UTC' },
      ],
      findingsBySensor30d: Object.entries(findings30.reduce((a: Rec, f) => { a[f.sensor ?? 'unknown'] = (a[f.sensor ?? 'unknown'] ?? 0) + 1; return a; }, {})).map(([sensor, n]) => ({ sensor, n })),
      pendingApprovals: d.approvals.filter(a => a.status === 'pending').length,
      errors: agentErrors,
      gaps: sensors.filter(s => s.status !== 'fresh').map(s => ({ id: s.id, label: s.label, status: s.status, detail: s.detail })),
    },
    audit: {
      chain, entries: d.audit.map(a => ({ seq: a.seq, at: a.at, actorEmail: a.actorEmail, role: a.role, action: a.action, target: a.target, details: a.details, hash: String(a.hash ?? '').slice(0, 12) })),
      pipeline: d.pipelineAudit.map(a => ({ id: a.id, action: a.action, at: ms(a.timestamp), by: a.by ?? a.actorEmail ?? a.actorUid ?? null, findingId: a.findingId ?? null, reason: redact(a.reason ?? a.note ?? '', 300) })),
    },
    notifications: { ...DEFAULT_NOTIFICATIONS, ...(d.notifications ?? {}), alwaysOn: ALWAYS_ON_NOTIFICATIONS },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Tamper-evident audit: each entry carries the hash of the one before it
// ═════════════════════════════════════════════════════════════════════════════
export const auditHash = (e: { seq: number; at: number; actorUid: string; action: string; target: string | null; details: unknown; prevHash: string }) =>
  createHash('sha256').update(JSON.stringify([e.seq, e.at, e.actorUid, e.action, e.target, e.details, e.prevHash])).digest('hex');

/** entries newest first, as loaded. ok=false names the first entry whose hash or link does not match. */
export function verifyChain(entries: Rec[]): { ok: boolean; checked: number; brokenAt: number | null } {
  const asc = [...entries].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < asc.length; i++) {
    const e = asc[i];
    if (auditHash({ seq: e.seq, at: e.at, actorUid: e.actorUid, action: e.action, target: e.target ?? null, details: e.details ?? null, prevHash: e.prevHash }) !== e.hash) return { ok: false, checked: asc.length, brokenAt: e.seq };
    if (i > 0 && (asc[i - 1].seq !== e.seq - 1 || asc[i - 1].hash !== e.prevHash)) return { ok: false, checked: asc.length, brokenAt: e.seq };
  }
  return { ok: true, checked: asc.length, brokenAt: null };
}

export async function appendAudit(db: Firestore, now: number, actor: Actor, action: string, target: string | null, details: Rec): Promise<number> {
  const head = db.collection('security_audit_meta').doc('head');
  return db.runTransaction(async tx => {
    const h = (await tx.get(head)).data() ?? { seq: 0, hash: 'genesis' };
    const seq = (h.seq as number) + 1;
    const entry = { seq, at: now, actorUid: actor.uid, actorEmail: actor.email, role: actor.role, action, target, details: JSON.parse(JSON.stringify(details ?? {})), prevHash: h.hash as string };
    const hash = auditHash(entry);
    tx.set(db.collection('security_audit').doc(String(seq).padStart(10, '0')), { ...entry, hash });
    tx.set(head, { seq, hash, at: now });
    return seq;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Actions
// ═════════════════════════════════════════════════════════════════════════════
export interface Actor { uid: string; email: string; role: string; authTime: number | null }
export interface Deps {
  db: Firestore; now: number; env: Record<string, string | undefined>;
  github: GitHubPort | null;
  alert: (subject: string, text: string) => Promise<boolean>;
}
export interface GitHubPort {
  view(prKeys: string[]): Promise<GitHubView>;
  dispatch(repo: string, workflow: string): Promise<void>;
}

const str = (v: unknown, name: string, min = 1, max = 2000): string => {
  if (typeof v !== 'string') throw new HttpError(400, `${name} is required`);
  const s = v.trim(); if (s.length < min) throw new HttpError(400, `${name} must be at least ${min} characters`); if (s.length > max) throw new HttpError(400, `${name} is too long (max ${max})`);
  return s;
};
const docId = (v: unknown, name: string) => { const s = str(v, name, 1, 128); if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new HttpError(400, `${name} is not a valid id`); return s; };

export const ACTIONS: Record<string, { need: 'triage' | 'govern'; stepUp: boolean }> = {
  assign: { need: 'triage', stepUp: false }, validate: { need: 'triage', stepUp: false }, prioritize: { need: 'triage', stepUp: false },
  false_positive: { need: 'triage', stepUp: false }, reopen: { need: 'triage', stepUp: false },
  incident_open: { need: 'triage', stepUp: false }, incident_update: { need: 'triage', stepUp: false }, scan_trigger: { need: 'triage', stepUp: false },
  accept_risk: { need: 'govern', stepUp: true }, policy_set: { need: 'govern', stepUp: true }, notifications_set: { need: 'govern', stepUp: false },
  automation_suspend: { need: 'govern', stepUp: true }, automation_resume: { need: 'govern', stepUp: true },
  brake_confirm: { need: 'govern', stepUp: true }, drill_record: { need: 'govern', stepUp: false },
};

export function authorizeAction(actor: Actor, action: string, nowS: number): void {
  const spec = ACTIONS[action]; if (!spec) throw new HttpError(400, 'Unknown action');
  if (!ROLE_CAN[spec.need].includes(actor.role)) throw new HttpError(403, `Your role (${actor.role}) cannot ${action.replace(/_/g, ' ')}`);
  if (spec.stepUp && (actor.authTime === null || nowS - actor.authTime > STEP_UP_MAX_AGE_S)) throw new HttpError(401, 'step_up_required');
}

async function withdrawApprovals(db: Firestore, findingId: string, x: Rec, reason: string) {
  const waiting = await db.collection('approval_requests').where('findingId', '==', findingId).where('status', '==', 'pending').get();
  for (const a of waiting.docs) await a.ref.update({ status: 'superseded', supersededAt: FieldValue.serverTimestamp(), supersededReason: reason });
  if (x.remediationPlanId) await db.collection('remediation_plans').doc(String(x.remediationPlanId)).update({ status: 'superseded' }).catch(() => {});
}

export async function act(d: Deps, actor: Actor, body: any): Promise<Rec> {
  const action = String(body?.action ?? '');
  authorizeAction(actor, action, Math.floor(d.now / 1000));
  const db = d.db;
  const finding = async () => { const id = docId(body.findingId, 'findingId'); const ref = db.collection('security_findings').doc(id); const snap = await ref.get(); if (!snap.exists) throw new HttpError(404, 'Finding not found'); return { id, ref, x: snap.data() as Rec }; };
  let target: string | null = null; const details: Rec = {}; let result: Rec = { ok: true };

  switch (action) {
    case 'assign': {
      const { id, ref } = await finding(); target = id;
      if (body.ownerUid === null) { await ref.update({ owner: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }); details.owner = null; break; }
      const uid = docId(body.ownerUid, 'ownerUid'); const s = (await db.collection('ops_staff').doc(uid).get()).data();
      if (!s || s.isActive !== true || !ROLE_CAN.triage.includes(s.role)) throw new HttpError(400, 'The owner must be an active platform admin or cyber agent');
      await ref.update({ owner: { uid, email: s.email ?? null }, assignedAt: FieldValue.serverTimestamp(), assignedBy: actor.uid });
      details.owner = s.email ?? uid; break;
    }
    case 'validate': {
      const { id, ref, x } = await finding(); target = id; if (CLOSED.includes(x.status)) throw new HttpError(409, 'Closed findings cannot be validated');
      const note = body.note ? str(body.note, 'note', 0, 1000) : null;
      await ref.update({ validatedAt: FieldValue.serverTimestamp(), validatedBy: actor.uid, validationNote: note }); details.note = note; break;
    }
    case 'prioritize': {
      const { id, ref, x } = await finding(); target = id; if (CLOSED.includes(x.status)) throw new HttpError(409, 'Closed findings cannot be prioritized');
      const p = String(body.priority); if (!/^P[1-4]$/.test(p)) throw new HttpError(400, 'priority must be P1, P2, P3 or P4');
      const note = str(body.note, 'note', 3, 1000);
      await ref.update({ priority: p, priorityNote: note, prioritizedBy: actor.uid, prioritizedAt: FieldValue.serverTimestamp() }); Object.assign(details, { priority: p, note }); break;
    }
    case 'false_positive': {
      const { id, ref, x } = await finding(); target = id; if (CLOSED.includes(x.status)) throw new HttpError(409, 'The finding is already closed');
      if (x.status === 'executing') throw new HttpError(409, 'A fix is being generated for this finding right now; try again in a minute');
      const reason = str(body.reason, 'reason', 10, 1000);
      await ref.update({ status: 'false_positive', falsePositiveReason: reason, closedBy: actor.uid, resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await withdrawApprovals(db, id, x, 'marked as a false positive'); details.reason = reason; break;
    }
    case 'accept_risk': {
      const { id, ref, x } = await finding(); target = id; if (CLOSED.includes(x.status)) throw new HttpError(409, 'The finding is already closed');
      const reason = str(body.reason, 'reason', 10, 1000); const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new HttpError(400, 'days must be a whole number from 1 to 90');
      const until = d.now + days * DAY;
      await ref.update({ status: 'accepted_risk', acceptedReason: reason, acceptedUntil: until, acceptedBy: actor.uid, resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await withdrawApprovals(db, id, x, 'risk accepted for a limited time'); Object.assign(details, { reason, until: new Date(until).toISOString() }); break;
    }
    case 'reopen': {
      const { id, ref, x } = await finding(); target = id; if (!CLOSED.includes(x.status)) throw new HttpError(409, 'Only a closed finding can be reopened');
      const reason = str(body.reason, 'reason', 10, 1000);
      await ref.update({ status: (x.riskScore ?? 0) >= 40 ? 'approval_pending' : 'triaged', reopenCount: FieldValue.increment(1), reopenedAt: FieldValue.serverTimestamp(), reopenReason: reason,
        closedAt: FieldValue.delete(), resolvedAt: FieldValue.delete(), acceptedUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      details.reason = reason; break;
    }
    case 'incident_open': {
      const title = str(body.title, 'title', 5, 200), summary = str(body.summary, 'summary', 10, 4000);
      const severity = String(body.severity); if (!['critical', 'high', 'medium', 'low'].includes(severity)) throw new HttpError(400, 'severity must be critical, high, medium or low');
      const affected = (Array.isArray(body.affected) ? body.affected : []).slice(0, 20).map((a: unknown) => str(a, 'affected resource', 1, 200));
      const eventIds = (Array.isArray(body.eventIds) ? body.eventIds : []).slice(0, 50).map((e: unknown) => docId(e, 'eventId'));
      const firstSignal = eventIds.length ? Math.min(...(await Promise.all(eventIds.map((e: string) => db.collection('security_events').doc(e).get()))).map(s => ms(s.data()?.timestamp) ?? d.now)) : null;
      const ref = db.collection('security_incidents').doc();
      await ref.set({ title, summary, severity, status: 'open', affected, eventIds, openedAt: d.now, openedBy: actor.email, firstSignalAt: firstSignal, containment: [], timeline: [{ at: d.now, by: actor.email, kind: 'opened', note: summary }] });
      for (const e of eventIds) await db.collection('security_events').doc(e).update({ incidentId: ref.id }).catch(() => {});
      if (['critical', 'high'].includes(severity)) await d.alert(`🚨 Security incident opened (${severity}): ${title}`, `${actor.email} opened an incident.\n\n${summary}\n\nAffected: ${affected.join(', ') || 'not stated'}\n\nOps console: https://ops.bewatu.com (Security, Threats and incidents)`);
      target = ref.id; Object.assign(details, { title, severity }); result = { ok: true, id: ref.id }; break;
    }
    case 'incident_update': {
      const id = docId(body.incidentId, 'incidentId'); const ref = db.collection('security_incidents').doc(id); const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Incident not found'); const x = snap.data() as Rec; target = id;
      if (x.status === 'resolved') throw new HttpError(409, 'The incident is resolved; open a new one');
      const note = str(body.note, 'note', 3, 2000);
      const status = body.status ? String(body.status) : x.status; if (!['open', 'investigating', 'contained', 'resolved'].includes(status)) throw new HttpError(400, 'status must be open, investigating, contained or resolved');
      const upd: Rec = { status, timeline: FieldValue.arrayUnion({ at: d.now, by: actor.email, kind: status !== x.status ? `status: ${status}` : body.containment ? 'containment' : 'note', note }) };
      if (body.containment) upd.containment = FieldValue.arrayUnion({ at: d.now, by: actor.email, measure: str(body.containment, 'containment', 3, 500) });
      if (status === 'resolved') { upd.resolvedAt = d.now; upd.resolution = str(body.resolution, 'resolution', 10, 2000); }
      await ref.update(upd); Object.assign(details, { status, note });
      if (status === 'resolved' || status === 'contained') await d.alert(`Security incident ${status}: ${redact(x.title, 120)}`, `${actor.email}: ${note}`);
      break;
    }
    case 'scan_trigger': {
      const repo = String(body.repo); if (!REPOS[repo]) throw new HttpError(400, 'Unknown repository');
      if (!d.github) throw new HttpError(503, 'GITHUB_TOKEN is not set, so scans cannot be started from here');
      try { await d.github.dispatch(REPOS[repo], 'security.yml'); }
      catch (e: any) { throw new HttpError(502, `GitHub refused to start the scan (${e?.message ?? 'error'}). The token needs "Actions: read and write" on ${REPOS[repo]}.`); }
      target = repo; details.workflow = 'security.yml'; break;
    }
    case 'policy_set': {
      const cur = (await db.collection('security_policy').doc('autonomy').get()).data();
      const mode = String(body.mode); if (!['observe', 'propose', 'auto_low_risk'].includes(mode)) throw new HttpError(400, 'mode must be observe, propose or auto_low_risk');
      const maxAgentPrsPerDay = Number(body.maxAgentPrsPerDay); if (!Number.isInteger(maxAgentPrsPerDay) || maxAgentPrsPerDay < 0 || maxAgentPrsPerDay > 5) throw new HttpError(400, 'maxAgentPrsPerDay must be 0 to 5');
      const rules = Array.isArray(body.lowRiskRules) ? body.lowRiskRules.map(String) : []; const bad = rules.filter((r: string) => !LOW_RISK_RULE_CATALOG.includes(r));
      if (bad.length) throw new HttpError(400, `Not in the low-risk catalog: ${bad.join(', ')}`);
      const maxAutoSeverity = String(body.maxAutoSeverity ?? 'medium'); if (!['low', 'medium'].includes(maxAutoSeverity)) throw new HttpError(400, 'maxAutoSeverity must be low or medium');
      const next = { mode, maxAgentPrsPerDay, lowRiskRules: rules, maxAutoSeverity, suspended: cur?.suspended === true, suspendedReason: cur?.suspendedReason ?? null, updatedBy: actor.email, updatedAt: d.now };
      await db.collection('security_policy').doc('autonomy').set(next);
      Object.assign(details, { from: cur ? { mode: cur.mode, maxAgentPrsPerDay: cur.maxAgentPrsPerDay, lowRiskRules: cur.lowRiskRules } : 'default', to: { mode, maxAgentPrsPerDay, lowRiskRules: rules, maxAutoSeverity } });
      target = 'security_policy/autonomy'; break;
    }
    case 'notifications_set': {
      const next: Rec = {}; for (const k of Object.keys(DEFAULT_NOTIFICATIONS)) { if (typeof body[k] !== 'boolean') throw new HttpError(400, `${k} must be true or false`); next[k] = body[k]; }
      await db.collection('security_policy').doc('notifications').set({ ...next, updatedBy: actor.email, updatedAt: d.now });
      target = 'security_policy/notifications'; Object.assign(details, next); break;
    }
    case 'automation_suspend': case 'automation_resume': {
      const reason = str(body.reason, 'reason', 5, 500); const suspended = action === 'automation_suspend';
      await db.collection('security_policy').doc('autonomy').set({ suspended, suspendedReason: suspended ? reason : null, suspendedBy: suspended ? actor.email : null, suspendedAt: suspended ? d.now : null, updatedBy: actor.email, updatedAt: d.now }, { merge: true });
      await d.alert(suspended ? '⏸ Automated security remediation SUSPENDED' : '▶️ Automated security remediation resumed', `${actor.email}: ${reason}\n\nWhile suspended, no fix is generated and no pull request is opened, by a person's approval or by the agent. Detection and alerts continue.`);
      target = 'security_policy/autonomy'; details.reason = reason; break;
    }
    case 'brake_confirm': {
      const sensor = String(body.sensor), repo = String(body.repo); if (!['code-analysis', 'dependency-risk'].includes(sensor) || !REPOS[repo]) throw new HttpError(400, 'Unknown scanner or repository');
      const stateRef = db.collection('_ops_internal').doc('scan_state'); const st = (await stateRef.get()).data()?.[`${sensor}:${repo}`];
      const pend = st?.pendingClose; if (!pend?.ids?.length) throw new HttpError(404, 'Nothing is waiting for confirmation');
      if (d.now - (ms(pend.at) ?? 0) > 7 * DAY) throw new HttpError(409, 'That reconciliation is over a week old; wait for the next scan of main');
      let closed = 0, skipped = 0;
      for (const fid of pend.ids as string[]) {
        const ref = db.collection('security_findings').doc(fid); const x = (await ref.get()).data();
        // Skip anything that changed since the scan: closed meanwhile, being fixed, or reported again (so it is NOT gone).
        if (!x || CLOSED.includes(x.status) || x.status === 'executing' || (ms(x.lastReportedAt) ?? 0) > (ms(pend.at) ?? 0)) { skipped++; continue; }
        await ref.update({ status: 'verified', resolvedAt: FieldValue.serverTimestamp(), verifiedBy: 'scan', resolution: `no longer reported by the scanner on main (closed after ${actor.email} confirmed a safety-brake refusal)` });
        await withdrawApprovals(db, fid, x, 'the finding is no longer reported');
        await db.collection('audit_log').add({ action: 'security_finding_resolved_by_scan', findingId: fid, sensor, repo, title: x.title ?? null, by: actor.email, timestamp: FieldValue.serverTimestamp() });
        closed++;
      }
      await stateRef.set({ [`${sensor}:${repo}`]: { pendingClose: FieldValue.delete() } }, { merge: true });
      target = `${sensor}:${repo}`; Object.assign(details, { closed, skipped }); result = { ok: true, closed, skipped }; break;
    }
    case 'drill_record': {
      const kind = String(body.kind); if (!['restore', 'rollback', 'alert'].includes(kind)) throw new HttpError(400, 'kind must be restore, rollback or alert');
      const outcome = String(body.outcome); if (!['passed', 'failed'].includes(outcome)) throw new HttpError(400, 'outcome must be passed or failed');
      const at = Date.parse(String(body.performedAt)); if (isNaN(at) || at > d.now + MIN || at < d.now - 365 * DAY) throw new HttpError(400, 'performedAt must be a date within the last year');
      const dur = body.durationMinutes === undefined || body.durationMinutes === null ? null : Number(body.durationMinutes);
      if (dur !== null && (!Number.isFinite(dur) || dur < 0 || dur > 10_000)) throw new HttpError(400, 'durationMinutes must be 0 to 10000');
      const notes = str(body.notes, 'notes', 10, 2000);
      const ref = db.collection('security_drills').doc(); await ref.set({ kind, outcome, performedAt: at, durationMinutes: dur, notes, recordedBy: actor.email, recordedAt: d.now });
      target = ref.id; Object.assign(details, { kind, outcome, performedAt: new Date(at).toISOString(), durationMinutes: dur }); break;
    }
  }
  const seq = await appendAudit(db, d.now, actor, action, target, details);
  return { ...result, auditSeq: seq };
}

// ═════════════════════════════════════════════════════════════════════════════
// Loading the data (one round of reads; GitHub in parallel, with a time limit)
// ═════════════════════════════════════════════════════════════════════════════
const INTERNAL_DOCS = ['uptime_state', 'security_sweep', 'cron_security_sweep', 'cron_invitations', 'scan_state', 'runtime_sensor', 'recovery_state', 'posture_state', 'collection_counts', 'privileged_snapshot', 'agent_counters'];
const ENV_FLAGS = ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_APP_SERVER', 'FIREBASE_SERVICE_ACCOUNT_RULES_VIEWER', 'FIREBASE_SERVICE_ACCOUNT_BACKUP_VIEWER', 'BEWATU_SECURITY_TOKEN'];

export async function loadData(d: Pick<Deps, 'db' | 'now' | 'env' | 'github'>): Promise<Data> {
  const db = d.db;
  const all = async (q: FirebaseQuery) => (await q.get()).docs.map(x => ({ id: x.id, ...x.data() }));
  const [findings, approvals, plans, incidents, events, drills, metrics, audit, pipelineAuditRaw, internalSnaps, policy, notifications, admins] = await Promise.all([
    all(db.collection('security_findings').limit(1500)),
    all(db.collection('approval_requests').where('status', '==', 'pending').limit(300)),
    all(db.collection('remediation_plans').limit(1500)),
    all(db.collection('security_incidents').orderBy('openedAt', 'desc').limit(200)),
    all(db.collection('security_events').where('timestamp', '>=', Timestamp.fromMillis(d.now - 30 * DAY)).orderBy('timestamp', 'desc').limit(300)),
    all(db.collection('security_drills').orderBy('performedAt', 'desc').limit(50)),
    all(db.collection('security_metrics').orderBy('date', 'desc').limit(90)),
    all(db.collection('security_audit').orderBy('seq', 'desc').limit(100)),
    all(db.collection('audit_log').orderBy('timestamp', 'desc').limit(400)),
    Promise.all(INTERNAL_DOCS.map(n => db.collection('_ops_internal').doc(n).get())),
    db.collection('security_policy').doc('autonomy').get(),
    db.collection('security_policy').doc('notifications').get(),
    db.collection('ops_staff').where('role', '==', 'platform_admin').where('isActive', '==', true).count().get().then(s => s.data().count).catch(() => null),
  ]);
  const assignees = (await db.collection('ops_staff').where('role', 'in', ROLE_CAN.triage).limit(100).get()).docs.filter(x => x.data().isActive === true).map(x => ({ uid: x.id, email: String(x.data().email ?? x.id), role: String(x.data().role) }));
  const prKeys = findings.filter((f: Rec) => f.prUrl && !CLOSED.includes(f.status)).map((f: Rec) => String(f.prUrl).replace(/^https:\/\/github\.com\/[^/]+\//, '').replace('/pull/', '#')).slice(0, 15);
  const github = d.github ? await d.github.view(prKeys) : emptyGitHub('GITHUB_TOKEN is not set');
  return {
    findings, approvals, plans, incidents, events, drills, metrics: metrics.reverse(), audit,
    pipelineAudit: pipelineAuditRaw.filter((a: Rec) => /^security_/.test(String(a.action ?? ''))).slice(0, 100),
    internal: Object.fromEntries(INTERNAL_DOCS.map((n, i) => [n, internalSnaps[i].data()])),
    policy: policy.data(), notifications: notifications.data(), platformAdmins: admins, assignees,
    github, env: { has: Object.fromEntries(ENV_FLAGS.map(k => [k, !!d.env[k]])), automationKill: d.env.SECURITY_AUTOMATION_DISABLED === '1' || d.env.SECURITY_AUTOMATION_DISABLED === 'true' },
  };
}
type FirebaseQuery = ReturnType<Firestore['collection']> | ReturnType<ReturnType<Firestore['collection']>['where']>;
export const emptyGitHub = (reason: string): GitHubView => ({ available: false, reason, security: {}, ci: null, watchdog: null, rollback: { last: null, lastDryRun: null, lastExecute: null }, prs: {}, tokenExpiresAt: null });

/** Reads GitHub with a token: only GETs, plus workflow_dispatch for an on-demand scan. Failures become "unavailable". */
export function githubPort(token: string, fetcher: typeof fetch = fetch): GitHubPort {
  let expires: number | null = null;
  const gh = async (path: string, init?: RequestInit) => {
    const r = await fetcher(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(6000) });
    const exp = r.headers.get('github-authentication-token-expiration'); if (exp && !isNaN(Date.parse(exp))) expires = Date.parse(exp);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path.split('?')[0]}`);
    return r.status === 204 ? null : r.json();
  };
  const run = (x: Rec): RunView => ({ at: Date.parse(x.updated_at ?? x.created_at), status: x.status, conclusion: x.conclusion ?? null, url: x.html_url, title: x.display_title ?? x.name });
  const latest = async (repo: string, file: string, branch = true): Promise<Rec | null> => {
    const j = await gh(`/repos/${OWNER}/${repo}/actions/workflows/${file}/runs?per_page=10${branch ? '&branch=main&event=push' : ''}&status=completed`);
    return (j.workflow_runs ?? [])[0] ?? null;
  };
  const withJobs = async (repo: string, x: Rec | null): Promise<RunView | null> => {
    if (!x) return null; const j = await gh(`/repos/${OWNER}/${repo}/actions/runs/${x.id}/jobs?per_page=50`);
    return { ...run(x), jobs: (j.jobs ?? []).map((y: Rec) => ({ name: y.name, conclusion: y.conclusion ?? null })) };
  };
  return {
    async view(prKeys) {
      try {
        const sec = await Promise.all(Object.entries(REPOS).map(async ([k, repo]) => {
          // Prefer the latest scheduled or push run on main; fall back to any completed run on main.
          const x = (await latest(repo, 'security.yml')) ?? (await gh(`/repos/${OWNER}/${repo}/actions/workflows/security.yml/runs?per_page=5&branch=main&status=completed`)).workflow_runs?.[0] ?? null;
          return [k, await withJobs(repo, x)] as const;
        }));
        const [ci, wd, rbAll, prs] = await Promise.all([
          latest('BeWatu_V3', 'ci.yml').then(x => (x ? run(x) : null)),
          gh(`/repos/${OWNER}/bewatu-security/actions/workflows/watchdog.yml/runs?per_page=1&status=completed`).then(j => (j.workflow_runs?.[0] ? run(j.workflow_runs[0]) : null)).catch(() => null),
          gh(`/repos/${OWNER}/BeWatu_V3/actions/workflows/rollback.yml/runs?per_page=20&status=completed`).then(j => (j.workflow_runs ?? []).map(run)).catch(() => [] as RunView[]),
          Promise.all(prKeys.map(async k => {
            const [repo, n] = k.split('#'); if (!repo || !/^\d+$/.test(n ?? '')) return [k, null] as const;
            try {
              const p = await gh(`/repos/${OWNER}/${repo}/pulls/${n}`);
              const cr = await gh(`/repos/${OWNER}/${repo}/commits/${p.head.sha}/check-runs?per_page=100`);
              const runs: Rec[] = cr.check_runs ?? [];
              const checks = !runs.length ? 'unknown' : runs.some(c => c.status !== 'completed') ? 'pending' : runs.every(c => ['success', 'skipped', 'neutral'].includes(c.conclusion)) ? 'passed' : 'failed';
              return [k, { merged: !!p.merged, state: p.state, checks }] as const;
            } catch { return [k, null] as const; }
          })),
        ]);
        return { available: true, security: Object.fromEntries(sec), ci, watchdog: wd, rollback: { last: rbAll[0] ?? null, lastDryRun: rbAll.find(r => /dry run/i.test(r.title ?? '')) ?? null, lastExecute: rbAll.find(r => /EXECUTE/.test(r.title ?? '')) ?? null },
          prs: Object.fromEntries(prs.filter(([, v]) => v) as [string, GitHubView['prs'][string]][]), tokenExpiresAt: expires };
      } catch (e: any) { return emptyGitHub(String(e?.message ?? 'error').slice(0, 200)); }
    },
    async dispatch(repo, workflow) { await gh(`/repos/${OWNER}/${repo}/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }), headers: { 'Content-Type': 'application/json' } }); },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// The daily posture job: backups, certificates, metrics, notifications
// ═════════════════════════════════════════════════════════════════════════════
export const CERT_HOSTS = ['www.bewatu.com', 'bewatu.com', 'ops.bewatu.com', 'factory.bewatu.com'];
export function certDays(host: string, now: number): Promise<{ host: string; daysLeft?: number; validTo?: string; error?: string }> {
  return new Promise(resolve => {
    const sock = tlsConnect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const c = sock.getPeerCertificate(); sock.end();
      const to = c?.valid_to ? Date.parse(c.valid_to) : NaN;
      resolve(isNaN(to) ? { host, error: 'no certificate' } : { host, validTo: new Date(to).toISOString(), daysLeft: Math.floor((to - now) / DAY) });
    });
    sock.on('error', e => resolve({ host, error: e.message.slice(0, 120) }));
    sock.on('timeout', () => { sock.destroy(); resolve({ host, error: 'timeout' }); });
  });
}

export interface RecoveryPort { read(): Promise<Rec> }
/** Firestore's own record of PITR, delete protection and backups, read with a viewer-only service account. */
export function recoveryPort(env: Record<string, string | undefined>): RecoveryPort {
  return {
    async read() {
      const sa = env.FIREBASE_SERVICE_ACCOUNT_BACKUP_VIEWER;
      if (!sa) return { skipped: 'Not configured: set FIREBASE_SERVICE_ACCOUNT_BACKUP_VIEWER (a service account with the Cloud Datastore Viewer role) so backups, PITR and delete protection can be read.' };
      const json = JSON.parse(sa); const name = 'backup-viewer';
      const app = getApps().find(a => a.name === name) ?? initializeApp({ credential: cert(json) }, name);
      const token = (await (app.options.credential as any).getAccessToken()).access_token as string;
      const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(json.project_id)}`;
      const get = async (p: string) => { const r = await fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }); if (!r.ok) throw new Error(`HTTP ${r.status} for ${p}`); return r.json(); };
      try {
        const [db, backups, schedules] = await Promise.all([get('/databases/(default)'), get('/locations/-/backups'), get('/databases/(default)/backupSchedules')]);
        const list: Rec[] = (backups.backups ?? []).filter((b: Rec) => String(b.database ?? '').endsWith('/databases/(default)') && b.state === 'READY');
        const times = list.map(b => Date.parse(b.snapshotTime)).filter(t => !isNaN(t)).sort((a, b) => b - a);
        return { pitr: db.pointInTimeRecoveryEnablement ?? null, versionRetention: db.versionRetentionPeriod ?? null, earliestVersionTime: db.earliestVersionTime ?? null, deleteProtection: db.deleteProtectionState ?? null,
          backups: { count: list.length, newestAt: times[0] ?? null, oldestAt: times[times.length - 1] ?? null }, schedules: (schedules.backupSchedules ?? []).map((s: Rec) => ({ retention: s.retention ?? null, daily: !!s.dailyRecurrence, weekly: s.weeklyRecurrence ?? null })) };
      } catch (e: any) { return { skipped: `Could not read recovery settings (${String(e?.message ?? e).slice(0, 150)}); the service account may need the Cloud Datastore Viewer role.` }; }
    },
  };
}

export interface PostureDeps extends Deps { recovery: RecoveryPort; certs: (host: string, now: number) => Promise<Rec> }
export const NOTIFY_COOLDOWN_MS = 24 * HOUR;
export async function runPosture(d: PostureDeps): Promise<Rec> {
  const internal = d.db.collection('_ops_internal');
  const stateRef = internal.doc('posture_state');
  const prev = (await stateRef.get()).data() ?? {};
  const errors: string[] = [];
  const recovery = await d.recovery.read().catch((e: any) => ({ skipped: `error: ${e?.message}` }));
  await internal.doc('recovery_state').set({ ...recovery, checkedAt: d.now });
  const certs = await Promise.all(CERT_HOSTS.map(h => d.certs(h, d.now)));
  const data = await loadData(d);
  data.internal.recovery_state = { ...recovery, checkedAt: d.now };
  data.internal.posture_state = { ...prev, certs, certsCheckedAt: d.now };
  const snap = buildSnapshot(data, d.now, { role: 'system' });
  const date = dayKey(d.now);
  await d.db.collection('security_metrics').doc(date).set({ date, at: d.now, score: snap.posture.score, raw: snap.posture.raw, coverage: snap.posture.coverage, caps: snap.posture.caps.map((c: Rec) => c.reason),
    domains: Object.fromEntries(snap.posture.domains.map((x: Rec) => [x.id, x.score])), open: snap.vulnerabilities.open, incidentsOpen: snap.threats.openIncidents, slaBreached: snap.vulnerabilities.slaBreached,
    sensorsFresh: snap.coverage.fresh, sensorsTotal: snap.coverage.total });

  // Configurable notifications, each key at most once a day.
  const prefs = { ...DEFAULT_NOTIFICATIONS, ...(data.notifications ?? {}) };
  const notified: Rec = { ...(prev.notified ?? {}) };
  const due: { key: string; pref: keyof typeof DEFAULT_NOTIFICATIONS; subject: string; text: string }[] = [];
  const stale = snap.coverage.sensors.filter((s: Sensor) => ['stale', 'never'].includes(s.status) && s.id !== 'alert-channel');
  if (stale.length) due.push({ key: `coverage:${stale.map((s: Sensor) => s.id).sort().join(',')}`, pref: 'coverage', subject: `⚠️ Security monitoring coverage: ${stale.length} sensor(s) not reporting`, text: stale.map((s: Sensor) => `- ${s.label}: ${s.detail}`).join('\n') });
  for (const c of snap.recovery.controls.filter((x: Control) => ['rec.pitr', 'rec.backups', 'rec.delete-protection'].includes(x.id) && x.status === 'missing')) due.push({ key: `backup:${c.id}`, pref: 'backup', subject: `⚠️ Recovery: ${c.name} is not in place`, text: c.evidence });
  for (const c of certs.filter(x => (typeof x.daysLeft === 'number' && x.daysLeft < 21) || x.error)) due.push({ key: `cert:${c.host}:${c.daysLeft ?? 'err'}`, pref: 'certificates', subject: `⚠️ TLS certificate for ${c.host}: ${c.error ? 'could not be checked' : `expires in ${c.daysLeft} days`}`, text: c.error ? `The check failed: ${c.error}` : `Valid until ${c.validTo}.` });
  if (data.github.tokenExpiresAt && data.github.tokenExpiresAt - d.now < 14 * DAY) due.push({ key: `cred:github:${dayKey(data.github.tokenExpiresAt)}`, pref: 'certificates', subject: '⚠️ The security agent\'s GitHub token expires soon', text: `GITHUB_TOKEN expires ${new Date(data.github.tokenExpiresAt).toISOString()}. Without it, no fix pull request can be opened and pipeline checks go unread.` });
  const breached = snap.vulnerabilities.items.filter((f: Rec) => f.slaBreached);
  if (breached.length) due.push({ key: `sla:${dayKey(d.now)}`, pref: 'sla', subject: `⏰ ${breached.length} security finding(s) past their fix deadline`, text: breached.slice(0, 15).map((f: Rec) => `- [${f.severity.toUpperCase()}] ${f.title} (${f.component.repoName ?? ''} ${f.component.file ?? ''}), due ${new Date(f.slaDueAt).toISOString().slice(0, 10)}${f.owner ? `, owner ${f.owner.email}` : ', no owner'}`).join('\n') });
  let sent = 0;
  for (const n of due) {
    if (!prefs[n.pref]) continue;
    if (notified[n.key] && d.now - notified[n.key] < NOTIFY_COOLDOWN_MS) continue;
    if (await d.alert(n.subject, `${n.text}\n\nSecurity Center: https://ops.bewatu.com (Security)`)) { notified[n.key] = d.now; sent++; } else errors.push(`could not send: ${n.subject}`);
  }
  for (const k of Object.keys(notified)) if (d.now - notified[k] > 7 * DAY) delete notified[k];   // keep the dedupe map small
  await stateRef.set({ certs, certsCheckedAt: d.now, lastRunAt: d.now, lastRunOk: errors.length === 0, lastError: errors[0] ?? null, notified }, { merge: false });
  await internal.doc('cron_security_posture').set({ lastRunAt: d.now, ok: errors.length === 0 }, { merge: true });
  return { date, score: snap.posture.score, coverage: snap.posture.coverage, notificationsSent: sent, errors };
}

// ═════════════════════════════════════════════════════════════════════════════
// HTTP
// ═════════════════════════════════════════════════════════════════════════════
function openDb(): Firestore {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}
export function safeEqual(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** The signed-in ops staff member, from a Firebase ID token and their ops_staff record. null = not security staff. */
export async function actorFrom(db: Firestore, decoded: { uid: string; email?: string; auth_time?: number }): Promise<Actor | null> {
  const s = (await db.collection('ops_staff').doc(decoded.uid).get()).data();
  if (!s || s.isActive !== true || !ROLE_CAN.view.includes(s.role)) return null;
  return { uid: decoded.uid, email: s.email ?? decoded.email ?? decoded.uid, role: s.role, authTime: typeof decoded.auth_time === 'number' ? decoded.auth_time : null };
}
let githubCache: { at: number; view: GitHubView; keys: string } | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', corsPermitted(ALLOWED_ORIGINS).find(o => o === requested) ?? ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const env = process.env;
  const h = String(req.headers.authorization ?? '');
  try {
    const db = openDb();
    const token = env.GITHUB_TOKEN;
    const rawPort = token ? githubPort(token) : null;
    // GitHub reads are cached for a minute per instance: the console refreshes, GitHub's rate limit stays untouched.
    const github: GitHubPort | null = rawPort && { dispatch: rawPort.dispatch, async view(keys) { const k = keys.join(','); if (githubCache && githubCache.keys === k && Date.now() - githubCache.at < MIN) return githubCache.view; const v = await rawPort.view(keys); githubCache = { at: Date.now(), view: v, keys: k }; return v; } };

    if (req.method === 'GET' && req.query.cron === 'posture') {
      if (!h.startsWith('Bearer ') || !safeEqual(h.slice(7), env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
      const out = await runPosture({ db, now: Date.now(), env, github, alert: (s, t) => sendAlert(env, s, t), recovery: recoveryPort(env), certs: certDays });
      return res.status(200).json(out);
    }
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in again' });
    let decoded: { uid: string; email?: string; auth_time?: number };
    // No revocation lookup (checkRevoked): it needs the Firebase Auth admin API, and this route's identity is Firestore-only by
    // design. Same as every other route; access is still checked against the live ops_staff record below on every request.
    try { decoded = await getAuth().verifyIdToken(h.slice(7)); } catch (e: any) { console.error('security center: token rejected:', e?.code ?? e?.message); return res.status(401).json({ error: 'Sign in again' }); }
    const actor = await actorFrom(db, decoded);
    if (!actor) return res.status(403).json({ error: 'The Security Center is for platform admins, cyber agents and auditors' });
    const now = Date.now();

    if (req.method === 'GET') {
      if (typeof req.query.finding === 'string') {
        const id = docId(req.query.finding, 'finding');
        const data = await loadData({ db, now, env, github });
        const f = data.findings.find(x => x.id === id); if (!f) return res.status(404).json({ error: 'Finding not found' });
        const [pipe, center] = await Promise.all([
          db.collection('audit_log').where('findingId', '==', id).limit(100).get(),
          db.collection('security_audit').where('target', '==', id).limit(100).get(),
        ]);
        const history = [...pipe.docs.map(x => ({ at: ms(x.data().timestamp), action: x.data().action, by: x.data().by ?? x.data().actorEmail ?? null, note: redact(x.data().reason ?? x.data().note ?? '', 300) })),
          ...center.docs.map(x => ({ at: x.data().at, action: x.data().action, by: x.data().actorEmail, note: redact(JSON.stringify(x.data().details ?? {}), 300), seq: x.data().seq }))].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
        const approvals = (await db.collection('approval_requests').where('findingId', '==', id).limit(20).get()).docs.map(x => ({ id: x.id, status: x.data().status, createdAt: ms(x.data().createdAt), decisionBy: x.data().decisionBy ?? null, supersededReason: x.data().supersededReason ?? null }));
        return res.status(200).json({ finding: enrichFinding(f, data, now), history, approvals });
      }
      const data = await loadData({ db, now, env, github });
      return res.status(200).json(buildSnapshot(data, now, actor));
    }
    if (req.method === 'POST') {
      const out = await act({ db, now, env, github, alert: (s, t) => sendAlert(env, s, t) }, actor, req.body ?? {});
      return res.status(200).json(out);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('security center error:', e?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
