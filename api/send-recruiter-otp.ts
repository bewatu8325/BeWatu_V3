// api/send-recruiter-otp.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sends a 6-digit OTP to a work email address for recruiter verification.
// Uses Resend for email delivery.
//
// Required env vars (set in Vercel):
//   RESEND_API_KEY   — your Resend API key
//   OTP_SECRET       — any random string used to sign OTPs (e.g. openssl rand -hex 32)
//   FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT) — Admin SDK,
//     Firestore-only (P0 7 least-privilege), used for OTP state + rate limits.
//
// POST /api/send-recruiter-otp
//   Body: { email: string, uid: string }
//   Returns: { success: true, expiresAt: string }
//
// POST /api/send-recruiter-otp?action=verify
//   Body: { email: string, otp: string, uid: string }
//   Returns: { valid: true } or { valid: false, error: string }
//
// P1 fix (rate limiting) — two real bugs fixed together, since fixing one
// meant touching the same storage layer as the other:
//
// 1. No rate limiting at all: any caller could hit `sendOtp` in a tight loop
//    to email-bomb an arbitrary address via Resend (their cost, their sender
//    reputation), or hit `verifyOtp` in a loop to brute-force a 6-digit code
//    (1,000,000 possibilities — trivially guessable with no attempt cap).
//    Fixed: a per uid+email pair send cooldown + hourly send cap, and a
//    verify-attempt cap that invalidates the code once exceeded.
// 2. The in-memory `Map` this used to live in was NOT actually safe for
//    this, despite its own comment claiming otherwise: Vercel does not
//    guarantee the *same* instance handles `sendOtp` and the later
//    `verifyOtp` call for one user — new invocations can land on a fresh
//    cold instance at any time (scale-up, idle recycle, a different edge
//    region), silently wiping the map and producing "No verification code
//    found" for a legitimate, recently-sent code. Moving state into
//    Firestore fixes this as a side effect of fixing the rate limiting
//    (which needs persistent counters across invocations anyway).
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const OTP_SECRET     = process.env.OTP_SECRET ?? 'bewatu-otp-secret-change-me';
const OTP_TTL_MS     = 10 * 60 * 1000; // 10 minutes

const MIN_RESEND_INTERVAL_MS = 60 * 1000;       // 1 send per minute per uid+email
const SEND_WINDOW_MS         = 60 * 60 * 1000;  // rolling 1-hour window
const MAX_SENDS_PER_WINDOW   = 5;               // ...capped at 5 sends in it
const MAX_VERIFY_ATTEMPTS    = 5;                // wrong guesses before the code is dead

function getAdminDb() {
  if (!getApps().length) {
    // P0 7 (least privilege): this endpoint only ever reads/writes its own
    // otp_verifications/{docId} doc — Firestore only, no Auth-admin calls.
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

function otpDocId(uid: string, email: string): string {
  // Doc IDs can't contain '/'; uid and email are both safe here in practice
  // (Firebase uid, and email already validated by isPersonalEmail's split).
  return `${uid}_${email.toLowerCase()}`;
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string, email: string): string {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(`${otp}:${email.toLowerCase()}`)
    .digest('hex');
}

function isPersonalEmail(email: string): boolean {
  const personal = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'proton', 'aol', 'live', 'me.com'];
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return personal.some(p => domain.includes(p));
}

async function sendOtp(req: VercelRequest, res: VercelResponse) {
  const { email, uid } = req.body ?? {};

  if (!email || !uid) {
    return res.status(400).json({ error: 'email and uid required' });
  }

  if (isPersonalEmail(email)) {
    return res.status(400).json({ error: 'Personal email addresses are not accepted. Please use your company email.' });
  }

  const db     = getAdminDb();
  const docRef = db.doc(`otp_verifications/${otpDocId(uid, email)}`);
  const now    = Date.now();

  const existing = (await docRef.get()).data() as
    | { sendCount?: number; windowStart?: number; lastSentAt?: number }
    | undefined;

  if (existing?.lastSentAt && now - existing.lastSentAt < MIN_RESEND_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_RESEND_INTERVAL_MS - (now - existing.lastSentAt)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before requesting another code.` });
  }

  const windowStart = existing?.windowStart && now - existing.windowStart < SEND_WINDOW_MS
    ? existing.windowStart
    : now; // window expired or doesn't exist yet — start a new one
  const sendCount = windowStart === existing?.windowStart ? (existing?.sendCount ?? 0) : 0;

  if (sendCount >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many codes requested. Please try again in an hour.' });
  }

  const otp       = generateOtp();
  const hash      = hashOtp(otp, email);
  const expiresAt = now + OTP_TTL_MS;

  await docRef.set({
    hash,
    expiresAt,
    lastSentAt:     now,
    windowStart,
    sendCount:      sendCount + 1,
    verifyAttempts: 0, // reset on every new code
    updatedAt:      FieldValue.serverTimestamp(),
  });

  // Send via Resend
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    'BeWatu <noreply@bewatu.com>',
      to:      [email],
      subject: `Your BeWatu recruiter verification code: ${otp}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <div style="margin-bottom: 24px;">
            <img src="https://www.bewatu.com/logo.png" alt="BeWatu" height="32" style="height:32px;" />
          </div>
          <h1 style="font-size: 20px; font-weight: 800; color: #1c1917; margin-bottom: 8px;">
            Verify your work email
          </h1>
          <p style="color: #78716c; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Use the code below to verify your company email and unlock recruiter access on BeWatu.
            This code expires in <strong>10 minutes</strong>.
          </p>
          <div style="background: #e8f4f0; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="font-size: 40px; font-weight: 900; letter-spacing: 0.3em; color: #1a4a3a; margin: 0;">
              ${otp}
            </p>
          </div>
          <p style="color: #a8a29e; font-size: 12px; line-height: 1.6;">
            If you didn't request this, you can safely ignore this email. Someone may have entered your email address by mistake.
          </p>
          <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 24px 0;" />
          <p style="color: #d6d3d1; font-size: 11px;">
            BeWatu · Recruiter verification · This email was sent to ${email}
          </p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const body = await emailRes.text();
    console.error('Resend error:', body);
    return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
  }

  return res.status(200).json({
    success: true,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

async function verifyOtp(req: VercelRequest, res: VercelResponse) {
  const { email, otp, uid } = req.body ?? {};

  if (!email || !otp || !uid) {
    return res.status(400).json({ valid: false, error: 'email, otp, and uid required' });
  }

  const db     = getAdminDb();
  const docRef = db.doc(`otp_verifications/${otpDocId(uid, email)}`);
  const snap   = await docRef.get();
  const stored = snap.data() as
    | { hash?: string; expiresAt?: number; verifyAttempts?: number }
    | undefined;

  if (!stored || !stored.hash) {
    return res.status(400).json({ valid: false, error: 'No verification code found. Please request a new one.' });
  }

  if (Date.now() > (stored.expiresAt ?? 0)) {
    await docRef.delete();
    return res.status(400).json({ valid: false, error: 'Code has expired. Please request a new one.' });
  }

  if ((stored.verifyAttempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    await docRef.delete();
    return res.status(429).json({ valid: false, error: 'Too many incorrect attempts. Please request a new code.' });
  }

  const expectedHash = hashOtp(otp, email);
  if (expectedHash !== stored.hash) {
    await docRef.update({ verifyAttempts: FieldValue.increment(1) });
    return res.status(400).json({ valid: false, error: 'Incorrect code. Please check your email and try again.' });
  }

  // Valid — consume the OTP so it can't be reused
  await docRef.delete();
  return res.status(200).json({ valid: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.query.action as string;
  if (action === 'verify') return verifyOtp(req, res);
  return sendOtp(req, res);
}
