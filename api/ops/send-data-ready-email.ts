/**
 * api/ops/send-data-ready-email.ts
 * POST /api/ops/send-data-ready-email
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends the "your data export is ready" email — the exact call
 * bewatu-ops/src/DataRequestsQueue.js's own header comment already
 * specified ("Add Resend email call in approveDataRequest... Call
 * /api/ops/send-data-ready-email with { to, name, downloadUrl, requestId }")
 * but was never actually built. Until this existed, an approved data
 * request only ever produced an in-app notification — no email, despite
 * that being the explicit promise in DataRequestModal.tsx's own UI copy.
 *
 * Auth: verifies a real Firebase ID token belongs to an active ops_staff
 * member — same pattern as api/security/approve.ts, not the shared-secret
 * pattern api/ops/migrate-circles-to-pods.ts uses (that one's a one-time
 * migration script; this runs on every approval, so it gets the stronger,
 * per-staffer check).
 *
 * Required env vars (already configured for other endpoints):
 *   RESEND_API_KEY
 *   FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT)
 *
 * Body: { to: string, name: string, downloadUrl: string, requestId: string }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGINS = ['https://ops.bewatu.com', 'https://www.bewatu.com'];
const RESEND_API_KEY = process.env.RESEND_API_KEY!;

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function initAdmin() {
  if (!getApps().length) {
    // P0 7 (least privilege): only ever reads ops_staff to verify the
    // caller — Firestore-read-only-equivalent, no Auth-admin writes, no
    // Cloud Functions calls.
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

async function verifyOpsAgent(
  req: VercelRequest,
  db: ReturnType<typeof getFirestore>,
  auth: ReturnType<typeof getAuth>
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await auth.verifyIdToken(authHeader.slice(7));
    const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
    if (!opsDoc.exists || opsDoc.data()?.isActive !== true) return null;
    return decoded;
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { db, auth } = initAdmin();
  const agent = await verifyOpsAgent(req, db, auth);
  if (!agent) return res.status(401).json({ error: 'Unauthorized' });

  const { to, name, downloadUrl, requestId } = req.body ?? {};
  if (!to || !downloadUrl) {
    return res.status(400).json({ error: 'to and downloadUrl are required' });
  }

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    'BeWatu <noreply@bewatu.com>',
        to:      [to],
        subject: 'Your BeWatu data export is ready',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="margin-bottom: 24px;">
              <img src="https://www.bewatu.com/logo.png" alt="BeWatu" height="32" style="height:32px;" />
            </div>
            <h1 style="font-size: 20px; font-weight: 800; color: #1c1917; margin-bottom: 8px;">
              Your data export is ready
            </h1>
            <p style="color: #78716c; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
              Hi ${name ?? 'there'}, the data you requested from BeWatu is ready to download.
              This link expires in 7 days.
            </p>
            <a href="${downloadUrl}" style="display: inline-block; background: #1a4a3a; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 700;">
              Download your data
            </a>
            <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 32px 0 16px;" />
            <p style="color: #d6d3d1; font-size: 11px;">
              BeWatu · Data export ${requestId ? `· request ${requestId}` : ''} · sent to ${to}
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      console.error('Resend error:', body);
      return res.status(500).json({ error: 'Failed to send email.' });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('send-data-ready-email error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}
