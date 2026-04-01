// api/security/runtime-anomaly.ts
// POST /api/security/runtime-anomaly
// Receives Vercel Log Drain payloads and detects anomalies.
// Configure in Vercel Dashboard → Project → Settings → Log Drains
// Drain URL: https://www.bewatu.com/api/security/runtime-anomaly
// Log types: lambda, edge, build (select all)
//
// Auth: VERCEL_LOG_DRAIN_SECRET header

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { ANOMALY_THRESHOLDS } from '../../bewatu-security/config/risk-thresholds';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )});
}

const db = admin.firestore();

interface VercelLogEntry {
  id:        string;
  message:   string;
  timestamp: number;
  source:    string;
  projectId: string;
  level:     string;
  statusCode?: number;
  path?:     string;
}

async function createFinding(partial: {
  category: string;
  severity:  string;
  title:     string;
  description: string;
  riskScore: number;
  affectedAssets: string[];
  evidence?: Record<string, any>;
}) {
  await fetch(`${process.env.VERCEL_URL || 'https://www.bewatu.com'}/api/security/finding`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}`,
    },
    body: JSON.stringify({ sensor: 'runtime-anomaly', ...partial }),
  });
}

async function triggerEmergencyResponse(type: string, details: string) {
  // 1. Create security event for audit trail
  await db.collection('security_events').add({
    type:      'DATA_DELETION_SPIKE',
    source:    'runtime-anomaly-service',
    payload:   { type, details, triggeredAt: new Date().toISOString() },
    processed: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 2. Notify ops team via email — POST to the ops notification endpoint
  // (The bewatu-ops app handles email delivery via Resend when it sees a new security_event)
  console.error(`EMERGENCY RESPONSE TRIGGERED: ${type} — ${details}`);
}

async function analyzeLogBatch(logs: VercelLogEntry[]) {
  const now    = Date.now();
  const window = 60_000; // 1 minute

  // Filter to recent logs only
  const recent = logs.filter(l => now - l.timestamp < window);

  // ── 1. Mass deletion spike ────────────────────────────────────────────────
  const deletions = recent.filter(l =>
    l.message.toLowerCase().includes('delete') &&
    l.message.toLowerCase().includes('firestore')
  ).length;

  if (deletions > ANOMALY_THRESHOLDS.DELETION_RATE_PER_MINUTE) {
    await createFinding({
      category:       'runtime_anomaly',
      severity:        'critical',
      title:          'Potential mass Firestore deletion — ransomware signal',
      description:    `${deletions} Firestore deletions detected in the last 60 seconds (threshold: ${ANOMALY_THRESHOLDS.DELETION_RATE_PER_MINUTE}). This may indicate ransomware or a compromised service account.`,
      riskScore:      95,
      affectedAssets: ['firestore_users', 'firestore_messages', 'firestore_tickets'],
      evidence:       { logLine: `${deletions} deletions in 60s` },
    });
    await triggerEmergencyResponse('mass_deletion', `${deletions} deletions in 60s`);
  }

  // ── 2. Auth failure spike ─────────────────────────────────────────────────
  const authFailures = recent.filter(l =>
    (l.statusCode === 401 || l.statusCode === 403) ||
    l.message.toLowerCase().includes('auth/wrong-password') ||
    l.message.toLowerCase().includes('auth/user-not-found') ||
    l.message.toLowerCase().includes('too-many-requests')
  ).length;

  if (authFailures > ANOMALY_THRESHOLDS.AUTH_FAILURE_RATE) {
    await createFinding({
      category:       'runtime_anomaly',
      severity:        'high',
      title:          'Auth failure spike — possible credential stuffing',
      description:    `${authFailures} auth failures in the last 60 seconds (threshold: ${ANOMALY_THRESHOLDS.AUTH_FAILURE_RATE}). This may indicate a brute force or credential stuffing attack.`,
      riskScore:      75,
      affectedAssets: ['firebase_auth'],
      evidence:       { logLine: `${authFailures} auth failures in 60s` },
    });
  }

  // ── 3. Factory token endpoint abuse ──────────────────────────────────────
  const factoryTokenHits = recent.filter(l =>
    l.path?.includes('/api/factory-token') ||
    l.message.includes('factory-token')
  ).length;

  if (factoryTokenHits > 20) { // normal: < 5 per minute
    await createFinding({
      category:       'runtime_anomaly',
      severity:        'high',
      title:          'Repeated requests to /api/factory-token — possible token abuse',
      description:    `${factoryTokenHits} requests to the factory-token endpoint in the last 60 seconds. The factory-token endpoint generates Firebase custom tokens and should only be called once per user sign-in.`,
      riskScore:      70,
      affectedAssets: ['api_factory_token', 'firebase_auth'],
      evidence:       { logLine: `${factoryTokenHits} requests in 60s` },
    });
  }

  // ── 4. Admin SDK write spike ──────────────────────────────────────────────
  const adminWrites = recent.filter(l =>
    l.message.toLowerCase().includes('admin') &&
    (l.message.toLowerCase().includes('write') || l.message.toLowerCase().includes('set(') || l.message.toLowerCase().includes('update('))
  ).length;

  if (adminWrites > ANOMALY_THRESHOLDS.ADMIN_SDK_WRITES) {
    await createFinding({
      category:       'runtime_anomaly',
      severity:        'critical',
      title:          'Admin SDK write spike',
      description:    `${adminWrites} Admin SDK writes detected in the last 60 seconds (threshold: ${ANOMALY_THRESHOLDS.ADMIN_SDK_WRITES}). This may indicate a compromised service account performing mass data manipulation.`,
      riskScore:      90,
      affectedAssets: ['secret_firebase_admin', 'firestore_users'],
      evidence:       { logLine: `${adminWrites} admin writes in 60s` },
    });
    await triggerEmergencyResponse('admin_write_spike', `${adminWrites} admin writes in 60s`);
  }

  // ── 5. Error rate spike ───────────────────────────────────────────────────
  const errors5xx = recent.filter(l => (l.statusCode || 0) >= 500).length;
  if (errors5xx > 50) {
    await createFinding({
      category:       'runtime_anomaly',
      severity:        'medium',
      title:          '5xx error rate spike',
      description:    `${errors5xx} server errors in the last 60 seconds. This may indicate a service disruption or active attack.`,
      riskScore:      45,
      affectedAssets: ['bewatu_v3_app', 'bewatu_factory_app'],
      evidence:       { logLine: `${errors5xx} 5xx errors in 60s` },
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Vercel log drain secret
  const drainSecret = process.env.VERCEL_LOG_DRAIN_SECRET;
  if (drainSecret) {
    const provided = req.headers['x-vercel-log-drain-secret'] ||
                     req.headers['x-vercel-signature'];
    if (provided !== drainSecret) {
      return res.status(403).json({ error: 'Invalid log drain secret' });
    }
  }

  try {
    const logs: VercelLogEntry[] = Array.isArray(req.body) ? req.body : [req.body];
    await analyzeLogBatch(logs);
    return res.status(200).json({ processed: logs.length });
  } catch (err: any) {
    console.error('runtime-anomaly.ts error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
