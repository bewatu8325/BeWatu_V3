// api/submit-report.ts
// ─────────────────────────────────────────────────────────────────────────────
// Creates the support ticket (and, for account-compromise fraud reports, the
// fraud case) behind components/ReportModal.tsx's "Report a person" and
// "Report fraud" flows.
//
// Why this is a server route: firestore.rules only lets ops staff create
// support_tickets / fraud_cases (that's deliberate -- a client that could
// write its own ticket could also pick its own priority, status, assignee and
// SLA, or flood the queue). The modal used to write them straight from the
// browser, which Firestore rejected with PERMISSION_DENIED for every normal
// user, so reports filed a content_reports doc and then errored, and nothing
// reached the support queue. Here the Admin SDK writes them, with the
// reporter's identity taken from the verified ID token and priority/SLA
// derived server-side from the (allow-listed) reason, never from the client.
//
// content_reports stays a direct client write (rules: any signed-in user may
// create). The modal passes the id of the one it just wrote as linkedReportId
// so the ticket can reference it.
//
// Required env vars (same as api/send-endorsement-request.ts):
//   FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT)
//
// POST /api/submit-report
//   Headers: Authorization: Bearer <idToken>
//   Body: {
//     type: 'user' | 'fraud',
//     reason: string,            // type 'user'  -- one of USER_REASONS
//     fraudType: string,         // type 'fraud' -- one of FRAUD_TYPES
//     details?: string,          // required (>= 10 chars) for 'fraud'
//     target?: { user?: { firestoreId: string, name?: string } },
//     linkedReportId?: string    // content_reports doc this reporter just wrote
//   }
//   Returns: { success: true, ticketId: string, fraudCaseId?: string }
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Keep in sync with the option lists in components/ReportModal.tsx.
const USER_REASONS = new Set([
  'harassment', 'hate_speech', 'fake_account', 'scam', 'spam',
  'doxxing', 'inappropriate', 'other',
]);
const FRAUD_TYPES = new Set([
  'account_compromised', 'fake_recruiter', 'fake_job',
  'payment_fraud', 'identity_theft', 'suspicious_activity',
]);

const MAX_DETAILS_LENGTH = 2000;
const MIN_FRAUD_DETAILS  = 10;
const MAX_NAME_LENGTH    = 200;
const MAX_ID_LENGTH      = 128;

const MIN_INTERVAL_MS = 5 * 1000;          // 1 report per 5s per user (double-click guard)
const WINDOW_MS       = 60 * 60 * 1000;    // rolling 1-hour window
const MAX_PER_WINDOW  = 10;                // ...capped at 10 tickets in it

type Priority = 'critical' | 'high' | 'medium';

function severityFromReason(r: string): Priority {
  if (['csam', 'violence', 'self_harm'].includes(r)) return 'critical';
  if (['harassment', 'hate_speech', 'doxxing', 'scam', 'fraud', 'identity_theft', 'payment_fraud'].includes(r)) return 'high';
  return 'medium';
}

function slaMs(priority: Priority): number {
  return ({ critical: 2, high: 8, medium: 24 } as const)[priority] * 3_600_000;
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, reason, fraudType, details: rawDetails, target, linkedReportId } = req.body ?? {};

  if (type !== 'user' && type !== 'fraud') {
    return res.status(400).json({ error: 'type must be "user" or "fraud"' });
  }
  if (type === 'user' && !(typeof reason === 'string' && USER_REASONS.has(reason))) {
    return res.status(400).json({ error: 'A valid reason is required' });
  }
  if (type === 'fraud' && !(typeof fraudType === 'string' && FRAUD_TYPES.has(fraudType))) {
    return res.status(400).json({ error: 'A valid fraudType is required' });
  }
  if (rawDetails !== undefined && rawDetails !== null && typeof rawDetails !== 'string') {
    return res.status(400).json({ error: 'details must be a string' });
  }
  const details: string = (rawDetails ?? '').trim();
  if (details.length > MAX_DETAILS_LENGTH) {
    return res.status(400).json({ error: `details must be at most ${MAX_DETAILS_LENGTH} characters` });
  }
  if (type === 'fraud' && details.length < MIN_FRAUD_DETAILS) {
    return res.status(400).json({ error: `Please describe what happened (at least ${MIN_FRAUD_DETAILS} characters)` });
  }

  const targetUser = target?.user;
  if (targetUser !== undefined && targetUser !== null) {
    if (typeof targetUser.firestoreId !== 'string' || !targetUser.firestoreId
        || targetUser.firestoreId.length > MAX_ID_LENGTH || targetUser.firestoreId.includes('/')) {
      return res.status(400).json({ error: 'Invalid target user' });
    }
    if (targetUser.name !== undefined && typeof targetUser.name !== 'string') {
      return res.status(400).json({ error: 'Invalid target user' });
    }
  }
  if (linkedReportId !== undefined && linkedReportId !== null
      && (typeof linkedReportId !== 'string' || !linkedReportId
          || linkedReportId.length > MAX_ID_LENGTH || linkedReportId.includes('/'))) {
    return res.status(400).json({ error: 'Invalid linkedReportId' });
  }

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const db = getFirestore(adminApp);

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const uid = decoded.uid;

    // Rate limit (rolling window, same shape as api/send-endorsement-request.ts,
    // but in a transaction so two concurrent submits can't both slip past).
    // Server-side only: report_rate_limits is deny-all in firestore.rules.
    const rlRef = db.collection('report_rate_limits').doc(uid);
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      const existing = (await tx.get(rlRef)).data() as
        | { lastSubmittedAt?: number; windowStart?: number; count?: number }
        | undefined;

      if (existing?.lastSubmittedAt && now - existing.lastSubmittedAt < MIN_INTERVAL_MS) {
        throw new HttpError(429, 'Please wait a few seconds before submitting another report.');
      }
      const inWindow = !!existing?.windowStart && now - existing.windowStart < WINDOW_MS;
      const windowStart = inWindow ? existing!.windowStart! : now;
      const count = inWindow ? (existing?.count ?? 0) : 0;
      if (count >= MAX_PER_WINDOW) {
        throw new HttpError(429, 'Too many reports submitted. Please try again in an hour.');
      }
      tx.set(rlRef, {
        lastSubmittedAt: now,
        windowStart,
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Reporter identity comes from the verified token + the users doc, never
    // from the request body.
    const userSnap = await db.collection('users').doc(uid).get();
    const reporterName: string = userSnap.data()?.displayName ?? decoded.name ?? 'BeWatu member';
    const reporterEmail: string = decoded.email ?? '';

    // If the modal says it already filed a content_reports doc, make sure it's
    // really this reporter's before we link a ticket to it.
    if (linkedReportId) {
      const reportSnap = await db.collection('content_reports').doc(linkedReportId).get();
      if (!reportSnap.exists || reportSnap.data()?.reportedBy !== uid) {
        throw new HttpError(400, 'Invalid linkedReportId');
      }
    }

    // Prefer the target's real display name over whatever the client sent.
    let targetUserId: string | null = null;
    let targetUserName: string | null = null;
    if (targetUser) {
      targetUserId = targetUser.firestoreId;
      const targetSnap = await db.collection('users').doc(targetUser.firestoreId).get();
      targetUserName = (targetSnap.data()?.displayName
        ?? (typeof targetUser.name === 'string' ? targetUser.name : null)) ?? null;
      if (targetUserName) targetUserName = targetUserName.slice(0, MAX_NAME_LENGTH);
    }

    const ticketRef = db.collection('support_tickets').doc();
    const batch = db.batch();
    let fraudCaseId: string | undefined;

    if (type === 'user') {
      const priority = severityFromReason(reason);
      batch.set(ticketRef, {
        subject: `User report: ${reason.replace(/_/g, ' ')} — ${targetUserName ?? 'Unknown'}`,
        category: 'safety', priority,
        userId: uid, userName: reporterName, userEmail: reporterEmail,
        body: details || 'No additional details provided.',
        status: 'open', assignedTo: null, assignedName: null,
        slaBreached: false, slaDeadline: new Date(now + slaMs(priority)),
        notes: [], createdByOps: false, linkedReportId: linkedReportId ?? null,
        metadata: { reportType: 'user_report', targetUserId, targetUserName },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), resolvedAt: null,
      });
    } else {
      const isCompromise = ['account_compromised', 'identity_theft'].includes(fraudType);
      const priority: Priority = isCompromise ? 'critical' : 'high';
      batch.set(ticketRef, {
        subject: `Fraud report: ${fraudType.replace(/_/g, ' ')}${targetUserName ? ` — ${targetUserName}` : ''}`,
        category: 'safety', priority,
        userId: uid, userName: reporterName, userEmail: reporterEmail,
        body: details, status: 'open', assignedTo: null, assignedName: null,
        slaBreached: false, slaDeadline: new Date(now + slaMs(priority)),
        notes: [], createdByOps: false,
        metadata: { reportType: 'fraud_report', fraudType, isCompromise, targetUserId, targetUserName },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), resolvedAt: null,
      });

      if (isCompromise) {
        const caseRef = db.collection('fraud_cases').doc();
        fraudCaseId = caseRef.id;
        const ts = new Date(now).toISOString();
        batch.set(caseRef, {
          userId: uid, userName: reporterName, userEmail: reporterEmail,
          type: fraudType, severity: 'high', status: 'open', riskScore: 60,
          signals: [{ type: 'manual_flag', description: `User self-reported: ${details.slice(0, 200)}`, ts }],
          attestationsNeeded: 2, attestationsReceived: 0, attestations: [],
          assignedTo: null, assignedName: null,
          notes: [{ body: `Self-reported. Details: ${details}`, authorName: 'System (user self-report)', authorUid: uid, ts }],
          linkedTicketId: ticketRef.id, source: 'user_self_report',
          resolvedAt: null, resolution: null,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Ticket and fraud case commit together or not at all.
    await batch.commit();

    return res.status(200).json({ success: true, ticketId: ticketRef.id, ...(fraudCaseId ? { fraudCaseId } : {}) });

  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('submit-report error:', err);
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token' || err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Invalid ID token' });
    }
    return res.status(500).json({ error: 'Failed to submit the report. Please try again.' });
  }
}
