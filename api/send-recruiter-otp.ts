// api/send-recruiter-otp.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sends a 6-digit OTP to a work email address for recruiter verification.
// Uses Resend for email delivery.
//
// Required env vars (set in Vercel):
//   RESEND_API_KEY   — your Resend API key
//   OTP_SECRET       — any random string used to sign OTPs (e.g. openssl rand -hex 32)
//
// POST /api/send-recruiter-otp
//   Body: { email: string, uid: string }
//   Returns: { success: true, expiresAt: string }
//
// POST /api/send-recruiter-otp?action=verify
//   Body: { email: string, otp: string, uid: string }
//   Returns: { valid: true } or { valid: false, error: string }
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const OTP_SECRET     = process.env.OTP_SECRET ?? 'bewatu-otp-secret-change-me';
const OTP_TTL_MS     = 10 * 60 * 1000; // 10 minutes

// In-memory OTP store — fine for serverless (each invocation is stateless,
// but Vercel reuses instances so this works for the OTP lifetime).
// For production scale, swap with Redis/Upstash.
const otpStore = new Map<string, { hash: string; expiresAt: number }>();

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

  const otp        = generateOtp();
  const hash       = hashOtp(otp, email);
  const expiresAt  = Date.now() + OTP_TTL_MS;
  const storeKey   = `${uid}:${email.toLowerCase()}`;

  otpStore.set(storeKey, { hash, expiresAt });

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

  const storeKey = `${uid}:${email.toLowerCase()}`;
  const stored   = otpStore.get(storeKey);

  if (!stored) {
    return res.status(400).json({ valid: false, error: 'No verification code found. Please request a new one.' });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(storeKey);
    return res.status(400).json({ valid: false, error: 'Code has expired. Please request a new one.' });
  }

  const expectedHash = hashOtp(otp, email);
  if (expectedHash !== stored.hash) {
    return res.status(400).json({ valid: false, error: 'Incorrect code. Please check your email and try again.' });
  }

  // Valid — consume the OTP so it can't be reused
  otpStore.delete(storeKey);
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
