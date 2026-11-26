// api/security/runtime-anomaly.ts
// POST /api/security/runtime-anomaly
// Vercel Log Drain endpoint — detects runtime anomalies

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash, timingSafeEqual } from 'node:crypto';

const THRESHOLDS = {
  DELETION_RATE_PER_MINUTE: 50,
  WRITE_RATE_PER_MINUTE:    500,
  AUTH_FAILURE_RATE:        100,
  ADMIN_SDK_WRITES:         200,
};

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
  return { db: getFirestore() };
}

/** Constant-time, and never true when either side is empty. */
export function safeEqual(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

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
const alertDirect = (subject: string, text: string) => sendAlert(process.env, subject, text);

// The result used to be ignored, so a refused or failed post silently dropped a "critical" signal. Now: if the finding cannot be
// recorded, email the operator directly with what was seen, and fail the request so the drain can retry it.
async function postFinding(db: ReturnType<typeof getFirestore>, partial: Record<string, unknown>) {
  let ok = false, detail = '';
  try {
    const r = await fetch('https://www.bewatu.com/api/security/finding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}` },
      body: JSON.stringify({ sensor: 'runtime-anomaly', repo: 'bewatu_v3', ...partial }),
    });
    ok = r.ok; if (!ok) detail = `HTTP ${r.status}`;
  } catch (e: any) { detail = e?.message ?? 'network error'; }
  if (!ok) {
    await alertDirect(`🔴 Runtime anomaly (could not be recorded): ${String(partial.title)}`, `${String(partial.description)}\n\nThe finding pipeline refused it (${detail}), so this email is the only record. Check /api/security/finding and BEWATU_SECURITY_TOKEN.`);
    throw new Error(`finding not recorded: ${detail}`);
  }
}

// ── detection: pure, so it is tested on fixtures ─────────────────────────────
export interface LogLine { ts: number; status: number; path: string; ip: string | null; ua: string; message: string }
/** Vercel log drain lines (and the older flat shape) to one shape. Anything unparseable is dropped, not guessed. */
export function normalizeLogs(raw: unknown[]): LogLine[] {
  return raw.filter((l): l is Record<string, any> => !!l && typeof l === 'object').map(l => ({
    ts: Number(l.timestamp ?? l.proxy?.timestamp ?? 0),
    status: Number(l.statusCode ?? l.proxy?.statusCode ?? 0),
    path: String(l.path ?? l.proxy?.path ?? '').slice(0, 300),
    ip: typeof (l.proxy?.clientIp ?? l.clientIp) === 'string' ? String(l.proxy?.clientIp ?? l.clientIp) : null,
    ua: String(l.proxy?.userAgent?.[0] ?? l.proxy?.userAgent ?? l.userAgent ?? '').slice(0, 200),
    message: String(l.message ?? '').slice(0, 500),
  })).filter(l => Number.isFinite(l.ts) && l.ts > 0);
}
/** Client IPs are never stored: only a short one-way hash, enough to tell "the same client" apart. */
export const clientKey = (ip: string | null, salt: string) => (ip ? createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 12) : 'unknown');
export const RUNTIME_THRESHOLDS = { ...THRESHOLDS, UNAUTHORIZED_PER_CLIENT: 10, REQUESTS_PER_CLIENT: 300, DISTINCT_PATHS_PER_CLIENT: 150, RATE_LIMITED: 20 };
const SENSITIVE = /^\/api\/(ops|admin|security|factory-token)\b/;
const GOOD_BOTS = /googlebot|bingbot|duckduckbot|applebot|slurp/i;
export interface Detection { type: string; severity: 'critical' | 'high' | 'medium' | 'low'; summary: string; payload: Record<string, unknown>; blocked?: boolean; finding?: Record<string, unknown> }

export function detect(logs: LogLine[], now: number, salt: string): Detection[] {
  const T = RUNTIME_THRESHOLDS, recent = logs.filter(l => now - l.ts < 60_000 && l.ts <= now + 5_000), out: Detection[] = [];
  const deletions = recent.filter(l => /delete/i.test(l.message) && /firestore/i.test(l.message)).length;
  if (deletions > T.DELETION_RATE_PER_MINUTE) out.push({ type: 'DATA_DELETION_SPIKE', severity: 'critical', summary: `${deletions} Firestore deletions in 60 seconds (threshold ${T.DELETION_RATE_PER_MINUTE})`, payload: { deletions },
    finding: { category: 'runtime_anomaly', severity: 'critical', title: 'Potential mass Firestore deletion — ransomware signal', description: `${deletions} Firestore deletions in the last 60 seconds (threshold: ${T.DELETION_RATE_PER_MINUTE}).`, riskScore: 95, affectedAssets: ['firestore_users', 'firestore_messages'] } });
  const authFailures = recent.filter(l => l.status === 401 || l.status === 403 || /auth\/wrong-password|too-many-requests/i.test(l.message)).length;
  if (authFailures > T.AUTH_FAILURE_RATE) out.push({ type: 'AUTH_FAILURE_SPIKE', severity: 'high', summary: `${authFailures} authentication failures in 60 seconds`, payload: { authFailures },
    finding: { category: 'runtime_anomaly', severity: 'high', title: 'Auth failure spike — possible credential stuffing', description: `${authFailures} auth failures in the last 60 seconds.`, riskScore: 75, affectedAssets: ['firebase_auth'] } });
  const factoryTokenHits = recent.filter(l => l.path.includes('/api/factory-token') || l.message.includes('factory-token')).length;
  if (factoryTokenHits > 20) out.push({ type: 'TOKEN_ENDPOINT_ABUSE', severity: 'high', summary: `${factoryTokenHits} requests to /api/factory-token in 60 seconds`, payload: { factoryTokenHits },
    finding: { category: 'runtime_anomaly', severity: 'high', title: 'Repeated requests to /api/factory-token — possible token abuse', description: `${factoryTokenHits} requests to factory-token in the last 60 seconds.`, riskScore: 70, affectedAssets: ['api_factory_token', 'firebase_auth'] } });
  const errors5xx = recent.filter(l => l.status >= 500).length;
  if (errors5xx > 50) out.push({ type: 'ERROR_SPIKE', severity: 'medium', summary: `${errors5xx} server errors in 60 seconds`, payload: { errors5xx },
    finding: { category: 'runtime_anomaly', severity: 'medium', title: '5xx error rate spike', description: `${errors5xx} server errors in the last 60 seconds.`, riskScore: 45, affectedAssets: ['bewatu_v3_app'] } });
  // Per client: refused access to staff-only routes, raw request volume, broad crawling. Hashed client keys only.
  const byClient = new Map<string, LogLine[]>();
  for (const l of recent) { if (!l.ip) continue; const k = clientKey(l.ip, salt); (byClient.get(k) ?? byClient.set(k, []).get(k)!).push(l); }
  for (const [k, ls] of byClient) {
    const denied = ls.filter(l => (l.status === 401 || l.status === 403) && SENSITIVE.test(l.path));
    if (denied.length > T.UNAUTHORIZED_PER_CLIENT) out.push({ type: 'UNAUTHORIZED_ACCESS', severity: 'high', summary: `One client was refused ${denied.length} times on staff-only routes in 60 seconds`, payload: { client: k, count: denied.length, paths: [...new Set(denied.map(l => l.path.split('?')[0]))].slice(0, 5) } });
    if (ls.length > T.REQUESTS_PER_CLIENT) out.push({ type: 'API_ABUSE', severity: 'medium', summary: `One client made ${ls.length} requests in 60 seconds`, payload: { client: k, count: ls.length, topPaths: [...new Set(ls.map(l => l.path.split('?')[0]))].slice(0, 5) } });
    const distinct = new Set(ls.filter(l => l.status < 400).map(l => l.path.split('?')[0])).size;
    if (distinct > T.DISTINCT_PATHS_PER_CLIENT && !ls.every(l => GOOD_BOTS.test(l.ua))) out.push({ type: 'SCRAPING', severity: 'medium', summary: `One client fetched ${distinct} different pages in 60 seconds`, payload: { client: k, distinctPaths: distinct, userAgent: ls[0]?.ua.slice(0, 80) ?? '' } });
  }
  const limited = recent.filter(l => l.status === 429).length;
  if (limited > T.RATE_LIMITED) out.push({ type: 'RATE_LIMITED', severity: 'low', summary: `${limited} requests refused by rate limits in 60 seconds`, payload: { count: limited }, blocked: true });
  return out;
}

async function analyzeLogBatch(raw: unknown[], db: ReturnType<typeof getFirestore>) {
  const now = Date.now();
  const logs = normalizeLogs(raw);
  // The heartbeat: the Security Center tells "quiet" from "not connected" by this.
  await db.collection('_ops_internal').doc('runtime_sensor').set({ lastBatchAt: now, lastBatchSize: raw.length, batches: FieldValue.increment(1) }, { merge: true });
  for (const x of detect(logs, now, process.env.BEWATU_SECURITY_TOKEN ?? 'bewatu')) {
    const ev = db.collection('security_events').doc();
    await ev.set({ type: x.type, severity: x.severity, summary: x.summary, source: 'runtime-anomaly-service', payload: x.payload, blocked: x.blocked === true, processed: false, timestamp: FieldValue.serverTimestamp() });
    if (x.severity === 'critical') await openIncident(db, ev.id, x, now);
    if (x.finding) await postFinding(db, x.finding);
  }
}

/** A critical signal opens an incident at once (or joins the one already open for the same kind of signal today). */
async function openIncident(db: ReturnType<typeof getFirestore>, eventId: string, x: Detection, now: number) {
  const key = `runtime:${x.type}:${new Date(now).toISOString().slice(0, 10)}`;
  const existing = await db.collection('security_incidents').where('key', '==', key).limit(1).get();
  const entry = { at: now, by: 'runtime sensor', kind: 'signal', note: x.summary };
  if (!existing.empty && existing.docs[0].data().status !== 'resolved') {
    await existing.docs[0].ref.update({ eventIds: FieldValue.arrayUnion(eventId), timeline: FieldValue.arrayUnion(entry) });
    await db.collection('security_events').doc(eventId).update({ incidentId: existing.docs[0].id });
    return;
  }
  const ref = db.collection('security_incidents').doc();
  await ref.set({ key, title: `${x.type.replace(/_/g, ' ').toLowerCase()} detected`, summary: x.summary, severity: x.severity, status: 'open', affected: [], eventIds: [eventId], openedAt: now, openedBy: 'runtime sensor', firstSignalAt: now, containment: [], timeline: [{ ...entry, kind: 'opened' }] });
  await db.collection('security_events').doc(eventId).update({ incidentId: ref.id });
  await alertDirect(`🚨 Security incident opened automatically: ${x.type}`, `${x.summary}\n\nAn incident was opened in the ops console (Security, Threats and incidents). Investigate, contain, and record what you did there.`);
}

// P1 (input validation): the comment this replaced claimed "log drain
// secret verification is handled by Vercel's signature header" — but no
// such verification was ever implemented anywhere in this file. This
// handler accepted any unauthenticated POST body as a "log batch" and fed
// it straight into analyzeLogBatch(), which can write directly to
// security_events (a real Firestore write, no rules layer in front of it
// since this runs on the Admin SDK) — an unauthenticated caller could
// spam fabricated "mass deletion" / "auth failure spike" log lines to
// pollute the security-monitoring pipeline with fake critical events.
// Configure Vercel's Log Drain with this same BEWATU_SECURITY_TOKEN as
// its bearer credential so real log deliveries keep working.
function validateServiceToken(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  return safeEqual(auth.slice(7), process.env.BEWATU_SECURITY_TOKEN);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateServiceToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { db } = initAdmin();
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    await analyzeLogBatch(logs, db);
    return res.status(200).json({ processed: logs.length });
  } catch (err: any) {
    console.error('runtime-anomaly.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
