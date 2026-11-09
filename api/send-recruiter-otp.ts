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

// ── The BeWatu email layout ─────────────────────────────────────────────────
// A copy of the block in api/auth-email.ts (each api/ route is deployed alone and cannot import another). test/auth-email/run-tests.mjs
// fails if this differs from that one: change the look in api/auth-email.ts, then paste the block into every file that has the markers.
// <email-shell>
const MAIL = {
  green: '#1a4a3a', site: 'https://www.bewatu.com', support: 'support@bewatu.com', legal: 'BeWatu LLC · United States',
  logo: 'https://www.bewatu.com/email/logo-white.png', font: "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif",
};
const escHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export interface EmailParts {
  /** The grey line some inboxes show next to the subject. */ preheader: string;
  heading: string;
  /** Plain text, one per paragraph. Escaped for you. */ paragraphs: string[];
  /** Trusted HTML shown between the paragraphs and the button (a code box, a summary). Give `extraText` for the plain version. */
  extraHtml?: string; extraText?: string;
  button?: { label: string; url: string };
  /** Small print under the button. Plain text. */ fine?: string[];
  /** Small print that contains a link (an unsubscribe line). `html` is trusted; give the same line as `text` for the plain version. */ fineRich?: { html: string; text: string }[];
  /** The address this was sent to, shown in the footer. */ to?: string;
}
export function emailHtml(p: EmailParts): string {
  const { green: G, font: F } = MAIL;
  const para = (t: string) => `<p style="margin:0 0 14px;font-family:${F};font-size:15px;line-height:23px;color:#292524">${escHtml(t).replace(/\n/g, '<br>')}</p>`;
  const button = p.button ? `<tr><td style="padding:10px 32px 4px"><a href="${escHtml(p.button.url)}" style="display:inline-block;background:${G};color:#ffffff;text-decoration:none;font-family:${F};font-weight:600;font-size:15px;line-height:20px;padding:13px 26px;border-radius:10px">${escHtml(p.button.label)}</a></td></tr>`
    + `<tr><td style="padding:14px 32px 0;font-family:${F};font-size:12px;line-height:18px;color:#78716c">If the button does not work, copy this address into your browser:<br><a href="${escHtml(p.button.url)}" style="color:${G};word-break:break-all">${escHtml(p.button.url)}</a></td></tr>` : '';
  const fineLine = (h: string) => `<p style="margin:0 0 8px;font-family:${F};font-size:13px;line-height:20px;color:#78716c">${h}</p>`;
  const fine = [...(p.fine ?? []).map(t => fineLine(escHtml(t))), ...(p.fineRich ?? []).map(r => fineLine(r.html))].join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escHtml(p.heading)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f5f5f4"><div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f5f5f4">${escHtml(p.preheader)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:14px">`
    + `<tr><td style="background:${G};padding:22px 32px;border-radius:13px 13px 0 0"><a href="${MAIL.site}" style="text-decoration:none"><img src="${MAIL.logo}" alt="BeWatu" width="112" height="34" style="display:block;border:0;width:112px;height:34px;color:#ffffff;font-family:${F};font-size:20px"></a></td></tr>`
    + `<tr><td style="padding:30px 32px 6px;font-family:${F};font-size:15px;line-height:23px;color:#292524"><h1 style="margin:0 0 16px;font-family:${F};font-size:22px;line-height:28px;font-weight:700;color:#1c1917">${escHtml(p.heading)}</h1>${p.paragraphs.map(para).join('')}${p.extraHtml ?? ''}</td></tr>`
    + button
    + `<tr><td style="padding:22px 32px 26px">${fine}</td></tr>`
    + `<tr><td style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:20px 32px;border-radius:0 0 13px 13px;font-family:${F};font-size:12px;line-height:19px;color:#78716c">`
    + `<strong style="color:${G}">BeWatu</strong><br>Questions? Write to <a href="mailto:${MAIL.support}" style="color:${G}">${MAIL.support}</a><br><a href="${MAIL.site}" style="color:${G}">www.bewatu.com</a> · ${escHtml(MAIL.legal)}`
    + (p.to ? `<br><span style="color:#a8a29e">Sent to ${escHtml(p.to)}</span>` : '') + `</td></tr></table></td></tr></table></body></html>`;
}
export function emailText(p: EmailParts): string {
  return [p.heading, '', ...p.paragraphs.flatMap(t => [t, '']), ...(p.extraText ? [p.extraText, ''] : []), ...(p.button ? [`${p.button.label}: ${p.button.url}`, ''] : []),
    ...(p.fine ?? []).flatMap(t => [t, '']), ...(p.fineRich ?? []).flatMap(r => [r.text, '']), '--', `BeWatu · ${MAIL.site}`, `Questions? Write to ${MAIL.support}`, MAIL.legal, ...(p.to ? [`Sent to ${p.to}`] : [])].join('\n');
}
// </email-shell>

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

function otpMail(otp: string, to: string): EmailParts {
  return {
    preheader: `Your BeWatu verification code is ${otp}`,
    heading: 'Verify your work email',
    paragraphs: ['Use the code below to verify your company email and unlock recruiter access on BeWatu. This code expires in 10 minutes.'],
    extraHtml: `<div style="background:#e8f4f0;border-radius:12px;padding:22px;text-align:center;margin:6px 0 10px"><p style="margin:0;font-size:36px;font-weight:800;letter-spacing:0.3em;color:#1a4a3a">${otp}</p></div>`,
    extraText: `Your code: ${otp}`,
    fine: ["If you didn't request this, you can safely ignore this email. Someone may have entered your email address by mistake."], to,
  };
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
      reply_to: MAIL.support,
      to:      [email],
      subject: `Your BeWatu recruiter verification code: ${otp}`,
      html: emailHtml(otpMail(otp, email)),
      text: emailText(otpMail(otp, email)),
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
