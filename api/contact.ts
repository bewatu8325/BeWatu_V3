// api/contact.ts
// ─────────────────────────────────────────────────────────────────────────────
// Delivers the "Connect with us" contact form (components/ConnectPage.tsx) to
// a real inbox via Resend.
//
// Required env vars (set in Vercel):
//   RESEND_API_KEY                       — same key api/send-recruiter-otp.ts uses
//   FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT) — Admin SDK,
//     Firestore-only (P0 7 least-privilege), used for the per-IP rate limit below.
//
// POST /api/contact
//   Body: { name: string, email: string, message: string }
//   Returns: { success: true }
//
// Launch-readiness finding: ConnectPage.tsx's handleSubmit was entirely fake —
// a hardcoded setTimeout that always showed "Message sent" with no API call at
// all, so no message was ever actually delivered anywhere. This is the real
// send, routed to contact@abideus.com per direct confirmation.
//
// This is a public, unauthenticated form (no uid to key a rate limit on, unlike
// send-recruiter-otp.ts) — rate-limited by IP instead, same cooldown/window
// shape as that endpoint, to keep it from being used to spam the destination
// inbox or burn Resend's send quota/sender reputation.
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const CONTACT_INBOX  = 'contact@abideus.com';

const MIN_RESEND_INTERVAL_MS = 30 * 1000;       // 1 submission per 30s per IP (blocks double-click/double-submit)
const SEND_WINDOW_MS         = 60 * 60 * 1000;  // rolling 1-hour window
const MAX_SENDS_PER_WINDOW   = 5;               // ...capped at 5 submissions in it

const MAX_NAME_LEN    = 200;
const MAX_MESSAGE_LEN = 5000;
const EMAIL_RE         = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAdminDb() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first?.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
}

// Doc IDs can't safely embed raw IPs (colons in IPv6, and no reason to store
// them in plaintext) — hash instead, same as any other opaque rate-limit key.
function rateLimitDocId(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, message } = req.body ?? {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email and message are required.' });
  }
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
    return res.status(400).json({ error: 'Invalid field types.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (name.length > MAX_NAME_LEN || message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: 'Name or message is too long.' });
  }

  const db     = getAdminDb();
  const ip     = clientIp(req);
  const docRef = db.doc(`contact_rate_limits/${rateLimitDocId(ip)}`);
  const now    = Date.now();

  const existing = (await docRef.get()).data() as
    | { sendCount?: number; windowStart?: number; lastSentAt?: number }
    | undefined;

  if (existing?.lastSentAt && now - existing.lastSentAt < MIN_RESEND_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_RESEND_INTERVAL_MS - (now - existing.lastSentAt)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before sending another message.` });
  }

  const windowStart = existing?.windowStart && now - existing.windowStart < SEND_WINDOW_MS
    ? existing.windowStart
    : now;
  const sendCount = windowStart === existing?.windowStart ? (existing?.sendCount ?? 0) : 0;

  if (sendCount >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many messages sent. Please try again in an hour.' });
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:     'BeWatu Contact Form <noreply@bewatu.com>',
      to:       [CONTACT_INBOX],
      reply_to: email,
      subject:  `New message from ${name} via bewatu.com`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
          <h1 style="font-size: 18px; font-weight: 800; color: #1c1917; margin-bottom: 16px;">
            New "Connect with us" submission
          </h1>
          <p style="color: #57534e; font-size: 14px; margin: 4px 0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p style="color: #57534e; font-size: 14px; margin: 4px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
          <div style="margin-top: 16px; padding: 16px; background: #f5f5f4; border-radius: 8px; white-space: pre-wrap; color: #292524; font-size: 14px; line-height: 1.6;">${escapeHtml(message)}</div>
          <p style="color: #a8a29e; font-size: 11px; margin-top: 24px;">Sent from the Connect with us form on bewatu.com. Reply-To is set to the sender's address.</p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const body = await emailRes.text();
    console.error('Resend error:', body);
    return res.status(500).json({ error: 'Failed to send your message. Please try again.' });
  }

  await docRef.set({
    lastSentAt: now,
    windowStart,
    sendCount:  sendCount + 1,
    updatedAt:  FieldValue.serverTimestamp(),
  });

  return res.status(200).json({ success: true });
}
