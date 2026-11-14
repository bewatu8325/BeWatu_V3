// api/security/runtime-anomaly.ts
// POST /api/security/runtime-anomaly
// Vercel Log Drain endpoint — detects runtime anomalies

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';

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

async function alertDirect(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('anomaly alert not sent: RESEND_API_KEY is not set'); return; }
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: 'BeWatu Security <noreply@bewatu.com>', to: [process.env.SECURITY_ALERT_EMAIL ?? process.env.UPTIME_ALERT_EMAIL ?? 'contact@abideus.com'], subject, text }),
  }).catch((e: any) => console.error('anomaly alert failed:', e?.message));
}

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

async function analyzeLogBatch(logs: any[], db: ReturnType<typeof getFirestore>) {
  const now = Date.now();
  const window = 60_000;
  const recent = logs.filter(l => now - l.timestamp < window);

  const deletions = recent.filter(l =>
    l.message?.toLowerCase().includes('delete') &&
    l.message?.toLowerCase().includes('firestore')
  ).length;

  if (deletions > THRESHOLDS.DELETION_RATE_PER_MINUTE) {
    await postFinding(db, {
      category: 'runtime_anomaly', severity: 'critical',
      title: 'Potential mass Firestore deletion — ransomware signal',
      description: `${deletions} Firestore deletions in the last 60 seconds (threshold: ${THRESHOLDS.DELETION_RATE_PER_MINUTE}).`,
      riskScore: 95, affectedAssets: ['firestore_users', 'firestore_messages'],
    });
    await db.collection('security_events').add({
      type: 'DATA_DELETION_SPIKE', source: 'runtime-anomaly-service',
      payload: { deletions, triggeredAt: new Date().toISOString() },
      processed: false, timestamp: FieldValue.serverTimestamp(),
    });
  }

  const authFailures = recent.filter(l =>
    l.statusCode === 401 || l.statusCode === 403 ||
    l.message?.toLowerCase().includes('auth/wrong-password') ||
    l.message?.toLowerCase().includes('too-many-requests')
  ).length;

  if (authFailures > THRESHOLDS.AUTH_FAILURE_RATE) {
    await postFinding(db, {
      category: 'runtime_anomaly', severity: 'high',
      title: 'Auth failure spike — possible credential stuffing',
      description: `${authFailures} auth failures in the last 60 seconds.`,
      riskScore: 75, affectedAssets: ['firebase_auth'],
    });
  }

  const factoryTokenHits = recent.filter(l =>
    l.path?.includes('/api/factory-token') || l.message?.includes('factory-token')
  ).length;

  if (factoryTokenHits > 20) {
    await postFinding(db, {
      category: 'runtime_anomaly', severity: 'high',
      title: 'Repeated requests to /api/factory-token — possible token abuse',
      description: `${factoryTokenHits} requests to factory-token in the last 60 seconds.`,
      riskScore: 70, affectedAssets: ['api_factory_token', 'firebase_auth'],
    });
  }

  const errors5xx = recent.filter(l => (l.statusCode || 0) >= 500).length;
  if (errors5xx > 50) {
    await postFinding(db, {
      category: 'runtime_anomaly', severity: 'medium',
      title: '5xx error rate spike',
      description: `${errors5xx} server errors in the last 60 seconds.`,
      riskScore: 45, affectedAssets: ['bewatu_v3_app'],
    });
  }
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
