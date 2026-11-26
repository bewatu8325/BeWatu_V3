// api/security/finding.ts
// POST /api/security/finding
// Receives findings, scores them inline, and triggers remediation for medium+

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { timingSafeEqual } from 'node:crypto';

const ALLOWED_ORIGINS = [
  'https://ops.bewatu.com',
  'https://www.bewatu.com',
];
// <cors>
// Browsers may call this route only from the sites in ALLOWED_ORIGINS (and local dev servers, outside production). The header
// always carries one of those listed values, never the request's own Origin, so a forged origin is never echoed back.
const CORS_DEV_ORIGINS: readonly string[] = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];
export const corsPermitted = (allowed: readonly string[]): readonly string[] => (process.env.VERCEL_ENV === 'production' ? allowed : [...allowed, ...CORS_DEV_ORIGINS]);
// </cors>

function setCors(req: VercelRequest, res: VercelResponse) {
  const requested = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', corsPermitted(ALLOWED_ORIGINS).find(o => o === requested) ?? ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function initAdmin() {
  if (!getApps().length) {
    // P0 7 (least privilege): this endpoint only ever reads/writes Firestore
    // (security_findings, remediation_plans, audit_log, etc.) — never calls
    // Auth-admin, Cloud Functions, or service-account impersonation APIs. It
    // should run on a Firestore-read-write-only identity, not the shared
    // FIREBASE_SERVICE_ACCOUNT every function also used to use.
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

/** Constant-time, and never true when either side is empty (an unset or blank secret must not authenticate "Bearer "). */
export function safeEqual(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function validateSensor(token: string): boolean {
  return safeEqual(token, process.env.BEWATU_SECURITY_TOKEN);
}

/** Is this the same open problem we already know about? Same title and sensor AND the same repository and file. */
export function isSameFinding(existing: Record<string, any>, partial: { repo?: string; evidence?: { filePath?: string | null } }): boolean {
  if (['verified', 'false_positive', 'accepted_risk'].includes(existing.status)) return false;
  return (existing.repo ?? 'shared') === (partial.repo ?? 'shared') && (existing.evidence?.filePath ?? null) === (partial.evidence?.filePath ?? null);
}

// ── tell a person ────────────────────────────────────────────────────────────
// Findings used to land in a console nobody was told to open. High and critical ones are emailed; a repeat of a known one is
// re-sent at most every 6 hours, so an old unresolved finding can never silence a new incident forever.
export const ALERT_MIN_SCORE = 65;
export const ALERT_REPEAT_MS = 6 * 3_600_000;
export const shouldAlert = (riskScore: number, lastAlertedAt: number | null | undefined, now: number) =>
  riskScore >= ALERT_MIN_SCORE && (!lastAlertedAt || now - lastAlertedAt >= ALERT_REPEAT_MS);
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
const alertOps = (subject: string, text: string) => sendAlert(process.env, subject, text);

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

function normaliseIncomingFinding(body: any) {
  return {
    sensor:         body.sensor || 'unknown',
    category:       body.category || 'vulnerability',
    severity:       body.severity || 'medium',
    title:          redact(String(body.title || 'Untitled finding'), 200),
    description:    redact(body.description || '', 2000),
    affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets : [],
    cveId:          body.cveId || null,
    cweId:          typeof body.cweId === 'string' && /^CWE-\d{1,5}$/.test(body.cweId) ? body.cweId : null,
    cweIds:         (Array.isArray(body.cweIds) ? body.cweIds : []).filter((x: unknown) => typeof x === 'string' && /^CWE-\d{1,5}$/.test(x)).slice(0, 5),
    cveIds:         (Array.isArray(body.cveIds) ? body.cveIds : []).filter((x: unknown) => typeof x === 'string' && /^(CVE-\d{4}-\d{4,7}|GHSA(-[23456789cfghjmpqrvwx]{4}){3})$/i.test(x)).slice(0, 10),
    owasp:          (Array.isArray(body.owasp) ? body.owasp : []).filter((x: unknown) => typeof x === 'string' && /^A\d{2}:20\d{2}/.test(x)).map((x: string) => x.slice(0, 80)).slice(0, 3),
    evidence: {
      filePath:   body.evidence?.filePath   || null,
      lineNumber: body.evidence?.lineNumber || null,
      snippet:    body.evidence?.snippet ? redact(body.evidence.snippet, 500) : null,
      ruleId:     body.evidence?.ruleId     || null,
      cvssScore:  body.evidence?.cvssScore  || null,
      commitSha:  body.evidence?.commitSha  || null,
      logLine:    body.evidence?.logLine    || null,
    },
    repo: body.repo || 'shared',
  };
}

// ── Inline risk scoring ───────────────────────────────────────────────────────

const ASSET_CRITICALITY: Record<string, number> = {
  'firebase_auth':         1.0, 'secret_firebase_admin': 1.0,
  'firestore_users':       0.95, 'api_factory_token':    0.9,
  'secret_stripe':         0.9,  'bewatu_ops_app':       0.85,
  'bewatu_v3_app':         0.8,  'bewatu_factory_app':   0.75,
  'secret_resend':         0.7,  'secret_anthropic':     0.5,
};

function scoreRisk(finding: any): { riskScore: number; severity: string } {
  const exploitMap: Record<string, number> = {
    secret_leak: 0.9, runtime_anomaly: 0.8, vulnerability: 0.7,
    misconfiguration: 0.6, dependency_risk: 0.5, policy_violation: 0.3,
  };
  const exploitability = finding.evidence?.cvssScore
    ? Math.min(finding.evidence.cvssScore / 10, 1.0)
    : exploitMap[finding.category] ?? 0.5;

  const assets: string[] = finding.affectedAssets || [];
  const criticality = assets.reduce((max, id) =>
    Math.max(max, ASSET_CRITICALITY[id] || 0.5), 0.5);
  const exposure     = 0.7; // default — refined by asset graph later
  const sensitivity  = 0.7;
  const blastRadius  = 0.5;

  const raw = exploitability * criticality * exposure * sensitivity * blastRadius;
  const riskScore = Math.min(Math.round(raw * 100 * 10), 100);

  const severity =
    riskScore >= 85 ? 'critical' :
    riskScore >= 65 ? 'high' :
    riskScore >= 40 ? 'medium' :
    riskScore >= 20 ? 'low' : 'informational';

  return { riskScore, severity };
}

// ── The sensor knows its own finding: never rate it HIGHER than the sensor did ──
// The inline score above has no real exploitability or exposure data yet, so it rates almost every code finding about 86
// ("critical"). Semgrep's own level said "warning" for the GitHub Actions hygiene rules that were then emailed as CRITICAL every day.
const SEVERITY_RANK: Record<string, number> = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 };
const SEVERITY_CEILING: Record<string, number> = { informational: 19, low: 39, medium: 64, high: 84, critical: 100 };
export function capSeverity(computed: { riskScore: number; severity: string }, reported: unknown): { riskScore: number; severity: string } {
  const r = typeof reported === 'string' ? reported.toLowerCase() : '';
  if (!(r in SEVERITY_RANK) || SEVERITY_RANK[computed.severity] <= SEVERITY_RANK[r]) return computed;
  return { riskScore: Math.min(computed.riskScore, SEVERITY_CEILING[r]), severity: r };
}

// ── Inline remediation plan creation ─────────────────────────────────────────

const APPROVAL_EXPIRY_DAYS = 7;

function determineActions(category: string): string[] {
  const map: Record<string, string[]> = {
    secret_leak:       ['rotate_secret', 'code_change'],
    dependency_risk:   ['patch_dependency'],
    vulnerability:     ['code_change'],
    misconfiguration:  ['config_change'],
    runtime_anomaly:   ['manual'],
    policy_violation:  ['manual'],
  };
  return map[category] || ['manual'];
}

function estimateEffort(actions: string[]): string {
  if (actions.includes('manual'))           return '1–4 hours';
  if (actions.includes('rotate_secret'))    return '30 minutes';
  if (actions.includes('patch_dependency')) return '1–2 hours';
  if (actions.includes('code_change'))      return '1–4 hours';
  return '2–4 hours';
}

function generateRollbackPlan(actions: string[]): string {
  if (actions.includes('patch_dependency'))  return 'Revert the dependency update PR.';
  if (actions.includes('rotate_secret'))     return 'Restore old secret in Vercel env vars and redeploy.';
  if (actions.includes('code_change'))       return 'Revert the associated PR.';
  return 'Revert the config change via Vercel dashboard.';
}

async function generateAIExplanation(finding: any, riskScore: number, actions: string[]): Promise<string> {
  try {
    const prompt = `You are a security advisor explaining a software vulnerability to a non-technical operations manager who needs to decide whether to approve a fix.

Finding details:
- Title: ${finding.title}
- Category: ${finding.category?.replace(/_/g, ' ')}
- Severity: ${finding.severity}
- Risk Score: ${riskScore}/100
- Description: ${finding.description}
- Affected assets: ${(finding.affectedAssets || []).join(', ') || 'unknown'}
- Fix actions required: ${actions.map((a: string) => a.replace(/_/g, ' ')).join(', ')}
${finding.evidence?.filePath ? `- File: ${finding.evidence.filePath}${finding.evidence.lineNumber ? ` line ${finding.evidence.lineNumber}` : ''}` : ''}
${finding.evidence?.snippet ? `- Code snippet: ${finding.evidence.snippet}` : ''}

Write a clear, jargon-free explanation with exactly these four sections. Keep each section to 2-3 sentences maximum. Use plain English — no technical jargon unless absolutely necessary, and if you must use a technical term, explain it immediately.

**What happened**
[Explain what this vulnerability or issue actually is, as if explaining to someone with no coding background]

**What could go wrong**
[Explain the real-world risk — what an attacker could do, what data could be exposed, what could break]

**What the fix does**
[Explain what the proposed fix will actually change, and why that makes things safer]

**Should you approve?**
[Give a clear recommendation — approve confidently, approve with caution, or investigate further first — and why]`;

    if (!process.env.ANTHROPIC_API_KEY) return '';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('AI explanation failed:', response.status);
      return '';
    }

    const data = await response.json() as any;
    return data.content?.[0]?.text || '';
  } catch (e) {
    console.error('AI explanation error:', e);
    return '';
  }
}

/**
 * An open finding that is reported again but has NO pending approval (the old one expired, or its fix attempt failed and was
 * closed) is orphaned: dedupe would keep absorbing reports and nobody could ever act on it. It needs a fresh approval request.
 */
export async function needsFreshApproval(db: ReturnType<typeof getFirestore>, findingDocId: string, known: Record<string, any>): Promise<boolean> {
  if ((known.riskScore ?? 0) < 40) return false;
  if (!['approval_pending', 'triaged'].includes(String(known.status))) return false;      // executing / remediation_pending are being handled
  if (typeof known.proposalRejectedAt === 'number' && Date.now() - known.proposalRejectedAt < 30 * 24 * 3_600_000) return false;   // a person declined the last proposal
  const pending = await db.collection('approval_requests').where('findingId', '==', findingDocId).where('status', '==', 'pending').limit(1).get();
  return pending.empty;
}

/**
 * Findings recorded before the severity cap existed kept the rating our own scoring gave them (a Semgrep "warning" stored as
 * CRITICAL). When one is reported again, the scanner's severity now caps it. If that takes it below the approval threshold it is
 * handled like a new low finding: triaged, its waiting approval withdrawn and its plan superseded, so nobody is asked to decide on
 * it or nudged about it. Above the threshold, a waiting approval just takes the corrected rating.
 */
export async function recapReported(db: ReturnType<typeof getFirestore>, findingDocId: string, known: Record<string, any>, reported: unknown): Promise<Record<string, unknown>> {
  const before = { riskScore: Number(known.riskScore ?? 0), severity: String(known.severity ?? 'medium') };
  const after = capSeverity(before, reported);
  if (after.riskScore === before.riskScore && after.severity === before.severity) return {};
  const update: Record<string, unknown> = { riskScore: after.riskScore, severity: after.severity, severityCappedFrom: before.severity };
  const waiting = await db.collection('approval_requests').where('findingId', '==', findingDocId).where('status', '==', 'pending').get();
  if (after.riskScore < 40) {
    if (known.status === 'approval_pending') update.status = 'triaged';
    for (const a of waiting.docs) await a.ref.update({ status: 'superseded', supersededAt: FieldValue.serverTimestamp(), supersededReason: `its scanner rates it ${after.severity}: no approval is needed` });
    if (known.remediationPlanId) await db.collection('remediation_plans').doc(String(known.remediationPlanId)).update({ status: 'superseded' }).catch(() => {});
  } else {
    for (const a of waiting.docs) await a.ref.update({ riskScore: after.riskScore, severity: after.severity });
  }
  return update;
}

async function createRemediationPlan(
  db: ReturnType<typeof getFirestore>,
  findingId: string,
  finding: any,
  riskScore: number,
  severity: string
): Promise<{ planId: string; approvalId: string }> {
  const actions   = determineActions(finding.category);
  const summary   = `${finding.title} (risk: ${riskScore}/100, ${severity}). Requires: ${actions.map((a: string) => a.replace(/_/g, ' ')).join(', ')}.`;
  const automatable = actions.includes('patch_dependency') ||
    (actions.includes('code_change') && !!finding.evidence?.filePath);

  const planRef = db.collection('remediation_plans').doc();
  await planRef.set({
    id:               planRef.id,
    findingId,
    status:           'pending_approval',
    priority:         riskScore >= 85 ? 1 : riskScore >= 65 ? 2 : 3,
    actions,
    summary,
    rollbackPlan:     generateRollbackPlan(actions),
    verificationSteps: ['Confirm finding no longer appears in next CI scan.'],
    estimatedEffort:  estimateEffort(actions),
    automatable,
    createdAt:        FieldValue.serverTimestamp(),
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_EXPIRY_DAYS);

  const approvalRef = db.collection('approval_requests').doc();
  const aiExplanation = await generateAIExplanation(finding, riskScore, actions);

  await approvalRef.set({
    id:                approvalRef.id,
    remediationPlanId: planRef.id,
    findingId,
    severity,
    riskScore,
    title:             finding.title,
    summary,
    aiExplanation,
    rollbackPlan:      generateRollbackPlan(actions),
    affectedAssets:    finding.affectedAssets || [],
    estimatedEffort:   estimateEffort(actions),
    status:            'pending',
    expiresAt:         Timestamp.fromDate(expiresAt),
    createdAt:         FieldValue.serverTimestamp(),
  });

  return { planId: planRef.id, approvalId: approvalRef.id };
}

// ── Ingest (the handler's work, testable without HTTP) ────────────────────────
export interface IngestDeps { db: ReturnType<typeof getFirestore>; now: number; env: Record<string, string | undefined>; alert(subject: string, text: string): Promise<boolean> }
/**
 * Records a finding from a sensor or a person. Deduplicates (same title, sensor, repository and file), caps the severity at the
 * scanner's own rating, reopens a fixed finding that comes back, and proposes a fix (an approval request) for medium and above,
 * unless the admin-set autonomy policy is "observe". Only an admin changes that policy; this route only reads it.
 */
export async function ingest(d: IngestDeps, body: any): Promise<{ status: number; body: Record<string, unknown> }> {
  const db = d.db;
  const policy = (await db.collection('security_policy').doc('autonomy').get()).data();
  const proposes = (policy?.mode ?? 'propose') !== 'observe';
  const partial = normaliseIncomingFinding(body);

  // Deduplicate — skip the compound query, use simple title match instead
  const recent = await db.collection('security_findings')
    .where('title',  '==', partial.title)
    .where('sensor', '==', partial.sensor)
    .limit(25)
    .get();

  // Same title is not enough: the same problem in two repositories, or two files, is two findings.
  const openDupe = recent.docs.find(d => isSameFinding(d.data(), partial));

  if (openDupe) {
    const recapped = await recapReported(db, openDupe.id, openDupe.data(), body?.severity);
    const known = { ...openDupe.data(), ...recapped };
    // lastReportedAt is what the daily sweep uses to decide a merged fix really worked (no longer reported since the merge).
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), lastReportedAt: FieldValue.serverTimestamp(), ...recapped };
    if (proposes && await needsFreshApproval(db, openDupe.id, known)) {
      const fresh = await createRemediationPlan(db, openDupe.id, partial, known.riskScore ?? 0, known.severity ?? 'medium');
      update.remediationPlanId = fresh.planId; update.status = 'approval_pending';
    }
    if (shouldAlert(known.riskScore ?? 0, known.lastAlertedAt, d.now)
      && await d.alert(`🔴 Security (still open, seen again): ${partial.title}`, `${known.findingId} is still unresolved and was reported again.\nSeverity: ${known.severity} (risk ${known.riskScore}/100)\nRepo: ${partial.repo}\n\n${partial.description}\n\nReview it in the ops console: https://ops.bewatu.com`)) {
      update.lastAlertedAt = d.now;
    }
    await openDupe.ref.update(update);
    return { status: 200, body: { id: openDupe.id, deduplicated: true } };
  }

  // Already known and closed. A false positive or an accepted risk (until it expires) stays closed: noted, not re-created.
  // A finding verified as fixed that comes back is REOPENED, so its history stays in one place.
  const closedMatch = recent.docs.find(x => ['verified', 'false_positive', 'accepted_risk'].includes(x.data().status)
    && (x.data().repo ?? 'shared') === (partial.repo ?? 'shared') && (x.data().evidence?.filePath ?? null) === (partial.evidence?.filePath ?? null));
  if (closedMatch && closedMatch.data().status !== 'verified') {
    await closedMatch.ref.update({ lastReportedAt: FieldValue.serverTimestamp(), reportedWhileClosed: FieldValue.increment(1) });
    return { status: 200, body: { id: closedMatch.id, deduplicated: true, closedAs: closedMatch.data().status } };
  }
  if (closedMatch) {
    const known = closedMatch.data();
    const { riskScore: rs, severity: sev } = capSeverity(scoreRisk(partial), body?.severity);
    const reopened: Record<string, unknown> = { status: rs >= 40 && proposes ? 'approval_pending' : 'triaged', riskScore: rs, severity: sev, reopenCount: FieldValue.increment(1), reopenedAt: FieldValue.serverTimestamp(),
      reopenReason: 'reported again after it was verified fixed', closedAt: FieldValue.delete(), resolvedAt: FieldValue.delete(), prMerged: FieldValue.delete(), lastReportedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    if (rs >= 40 && proposes) reopened.remediationPlanId = (await createRemediationPlan(db, closedMatch.id, partial, rs, sev)).planId;
    await closedMatch.ref.update(reopened);
    await db.collection('audit_log').add({ action: 'security_finding_reopened', findingId: closedMatch.id, reason: 'reported again after it was verified fixed', by: 'finding-ingest', timestamp: FieldValue.serverTimestamp() });
    await d.alert(`↩️ Security finding came back: ${partial.title}`, `${known.findingId} was verified as fixed, and the ${partial.sensor} sensor reported it again in ${partial.repo}${partial.evidence?.filePath ? ` (${partial.evidence.filePath})` : ''}. It has been reopened.\n\nOps console: https://ops.bewatu.com (Security)`);
    return { status: 200, body: { id: closedMatch.id, reopened: true } };
  }

  // Score inline
  const { riskScore, severity } = capSeverity(scoreRisk(partial), body?.severity);

  const seq  = await db.runTransaction(async t => {
    const counter = db.collection('security_config').doc('counters');
    const doc = await t.get(counter);
    const current = doc.data()?.findingSeq || 0;
    t.set(counter, { findingSeq: current + 1 }, { merge: true });
    return current + 1;
  });

  const year      = new Date().getFullYear();
  const findingId = `BW-SEC-${year}-${String(seq).padStart(4, '0')}`;
  const docRef    = db.collection('security_findings').doc();

  const finding = {
    id:               docRef.id,
    findingId,
    ...partial,
    riskScore,
    severity,
    exploitability:   0,
    exposure:         0.7,
    blastRadius:      0.5,
    dataSensitivity:  0.7,
    assetCriticality: 0.5,
    status:           riskScore >= 40 && proposes ? 'approval_pending' : 'triaged',
    detectedAt:       FieldValue.serverTimestamp(),
    lastReportedAt:   FieldValue.serverTimestamp(),
    updatedAt:        FieldValue.serverTimestamp(),
  };

  await docRef.set(finding);

  // Create remediation plan for medium and above
  let planId: string | null = null;
  let approvalId: string | null = null;

  if (riskScore >= 40 && proposes) {
    const result = await createRemediationPlan(db, docRef.id, partial, riskScore, severity);
    planId     = result.planId;
    approvalId = result.approvalId;

    await docRef.update({ remediationPlanId: planId });
  }

  // A person must hear about anything serious. Best effort: a mail failure must never lose the finding.
  if (shouldAlert(riskScore, null, d.now)
    && await d.alert(`🔴 Security ${severity.toUpperCase()}: ${partial.title}`, `${findingId} (${severity}, risk ${riskScore}/100)\nSensor: ${partial.sensor}\nRepo: ${partial.repo}${partial.evidence?.filePath ? `\nFile: ${partial.evidence.filePath}` : ''}\n\n${partial.description}\n\n${approvalId ? 'A remediation is waiting for approval' : 'No automatic remediation was proposed'} in the ops console: https://ops.bewatu.com`)) {
    await docRef.update({ lastAlertedAt: d.now }).catch(() => {});
  }

  return { status: 201, body: { id: docRef.id, findingId, riskScore, severity, planId, approvalId } };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, auth } = initAdmin();

    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(403).json({ error: 'Unauthorised' });
    const token = authHeader.slice(7);

    if (!validateSensor(token)) {
      try {
        const decoded = await auth.verifyIdToken(token);
        const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
        if (!opsDoc.exists || opsDoc.data()?.isActive !== true) return res.status(403).json({ error: 'Unauthorised' });
      } catch {
        return res.status(403).json({ error: 'Unauthorised' });
      }
    }

    const out = await ingest({ db, now: Date.now(), env: process.env, alert: alertOps }, req.body);
    return res.status(out.status).json(out.body);

  } catch (err: any) {
    console.error('finding.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
