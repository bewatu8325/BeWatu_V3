/**
 * api/auth-email.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The two account emails every member gets: "verify your email" and "reset your password".
 *
 * They used to be sent by Firebase itself, which meant they came from noreply@bewatu-2d04e.firebaseapp.com, were plain text in a
 * Firebase-styled layout, and linked to bewatu-2d04e.firebaseapp.com. Members saw the name of the service behind BeWatu. Now:
 *
 *   - Firebase only makes the one-time code (Admin SDK generate*Link). It never sends anything.
 *   - The email goes out through Resend as "BeWatu <noreply@bewatu.com>", in BeWatu's own layout (logo, contact details).
 *   - The link points at https://www.bewatu.com/auth/action (components/auth/AuthActionPage.tsx), which redeems the code.
 *
 * POST /api/auth-email
 *   { kind: 'verify' }                    signed in (Bearer token). Sent to the address on the account, never one from the request.
 *   { kind: 'reset',  email: '...' }      not signed in. Always answers { ok: true } whether or not an account exists, so the form
 *                                         cannot be used to find out who is a member. Rate-limited per address and per IP.
 *
 * Env: RESEND_API_KEY. FIREBASE_SERVICE_ACCOUNT_APP_SERVER (token check, rate-limit counters) and, for creating the links,
 * FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY (falls back to FIREBASE_SERVICE_ACCOUNT): the app-server account deliberately has no Auth
 * permissions, exactly as api/ops/user-data.ts and api/factory-token.ts handle it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// ── The BeWatu email layout ──────────────────────────────────────────────────
// One look for every message a member gets from us. Each api/ route is deployed on its own and cannot import from another, so
// routes that send mail carry a copy of this block, and test/auth-email/run-tests.mjs fails if any copy differs from this one.
// To change the look, change it here, then paste the same block into the other files (the test names them).
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

// ── The two messages ─────────────────────────────────────────────────────────
export interface Mail { to: string; subject: string; html: string; text: string }
const firstName = (n: unknown) => String(n ?? '').trim().split(/\s+/)[0]?.slice(0, 40) ?? '';

export function verificationMail(to: string, name: unknown, url: string): Mail {
  const hi = firstName(name);
  const parts: EmailParts = {
    preheader: 'Confirm this is your email address to finish setting up your account.',
    heading: 'Confirm your email address',
    paragraphs: [hi ? `Hi ${hi},` : 'Hi,', 'Thanks for joining BeWatu. Confirm that this is your email address so we can keep your account secure and help you get back in if you ever lose your password.'],
    button: { label: 'Verify email address', url },
    fine: ['If you did not create a BeWatu account, you can ignore this email.'], to,
  };
  return { to, subject: 'Verify your email for BeWatu', html: emailHtml(parts), text: emailText(parts) };
}
export function resetMail(to: string, name: unknown, url: string): Mail {
  const hi = firstName(name);
  const parts: EmailParts = {
    preheader: 'Use this link to choose a new password.',
    heading: 'Reset your password',
    paragraphs: [hi ? `Hi ${hi},` : 'Hi,', 'We received a request to reset the password for your BeWatu account. Choose a new one with the button below. The link works once and expires soon.'],
    button: { label: 'Choose a new password', url },
    fine: ['If you did not ask for this, you can ignore this email. Your password stays the same until you choose a new one.', 'Do not forward this email. Anyone with the link can reset your password.'], to,
  };
  return { to, subject: 'Reset your BeWatu password', html: emailHtml(parts), text: emailText(parts) };
}

/** The address a member opens. Firebase's own link (on firebaseapp.com) is used only to read the one-time code out of it. */
export function actionLink(origin: string, mode: 'verifyEmail' | 'resetPassword', firebaseLink: string): string {
  const code = new URL(firebaseLink).searchParams.get('oobCode');
  if (!code) throw new Error('The link has no code');
  return `${origin}/auth/action?mode=${mode}&oobCode=${encodeURIComponent(code)}`;
}

// ── Rules ────────────────────────────────────────────────────────────────────
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const MIN = 60_000, HOUR = 3_600_000;
export const LIMITS = {
  VERIFY_COOLDOWN_MS: MIN, VERIFY_PER_HOUR: 5,
  RESET_COOLDOWN_MS: MIN, RESET_PER_HOUR: 3,
  RESET_PER_IP_PER_HOUR: 20,
};
export const normalizeEmail = (v: unknown): string | null => { const e = String(v ?? '').trim().toLowerCase(); return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null; };

export interface AuthUser { uid: string; email?: string; displayName?: string; emailVerified?: boolean; disabled?: boolean }
export interface Deps {
  db: Firestore; now: number; origin: string;
  auth: { getUser(uid: string): Promise<AuthUser>; getUserByEmail(email: string): Promise<AuthUser>; generateEmailVerificationLink(email: string): Promise<string>; generatePasswordResetLink(email: string): Promise<string> };
  mail(m: Mail): Promise<boolean>;
}
export interface Caller { uid?: string; ip: string }

/** Counts one use of a key. Keys are hashed before they are stored, so no address or IP is kept. */
async function hit(d: Deps, key: string, o: { cooldownMs?: number; max: number; windowMs: number }): Promise<{ ok: true } | { ok: false; reason: 'cooldown' | 'limit'; waitSec: number }> {
  const ref = d.db.collection('auth_email_rate_limits').doc(createHash('sha256').update(key).digest('hex'));
  return d.db.runTransaction(async tx => {
    const s = (await tx.get(ref)).data() as { windowStart?: number; count?: number; lastAt?: number } | undefined;
    const fresh = !s?.windowStart || d.now - s.windowStart >= o.windowMs;
    const count = fresh ? 0 : (s?.count ?? 0);
    if (!fresh && o.cooldownMs && s?.lastAt && d.now - s.lastAt < o.cooldownMs) return { ok: false as const, reason: 'cooldown' as const, waitSec: Math.ceil((o.cooldownMs - (d.now - s.lastAt)) / 1000) };
    if (count >= o.max) return { ok: false as const, reason: 'limit' as const, waitSec: Math.ceil(((s?.windowStart ?? d.now) + o.windowMs - d.now) / 1000) };
    tx.set(ref, { windowStart: fresh ? d.now : s!.windowStart, count: count + 1, lastAt: d.now });
    return { ok: true as const };
  });
}

const UNAVAILABLE = 'We could not send the email right now. Please try again in a few minutes.';
const code = (e: any) => String(e?.code ?? e?.errorInfo?.code ?? e?.message ?? 'unknown');

export async function runAction(d: Deps, caller: Caller, body: any): Promise<{ ok: true; alreadyVerified?: boolean }> {
  const kind = body?.kind;

  if (kind === 'verify') {
    if (!caller.uid) throw new HttpError(401, 'Please sign in again.');
    let user: AuthUser;
    try { user = await d.auth.getUser(caller.uid); } catch (e) { console.error('auth-email: lookup failed', code(e)); throw new HttpError(503, UNAVAILABLE); }
    if (!user.email) throw new HttpError(400, 'Your account has no email address.');
    if (user.emailVerified) return { ok: true, alreadyVerified: true };
    const gate = await hit(d, `verify:${caller.uid}`, { cooldownMs: LIMITS.VERIFY_COOLDOWN_MS, max: LIMITS.VERIFY_PER_HOUR, windowMs: HOUR });
    if (gate.ok === false) throw new HttpError(429, gate.reason === 'cooldown' ? `Please wait ${gate.waitSec} seconds before asking for another email.` : 'Too many emails were requested. Try again in an hour.');
    let url: string;
    try { url = actionLink(d.origin, 'verifyEmail', await d.auth.generateEmailVerificationLink(user.email)); } catch (e) { console.error('auth-email: could not create verification link', code(e)); throw new HttpError(503, UNAVAILABLE); }
    if (!(await d.mail(verificationMail(user.email, user.displayName, url)))) throw new HttpError(502, UNAVAILABLE);
    return { ok: true };
  }

  if (kind === 'reset') {
    const email = normalizeEmail(body?.email);
    if (!email) throw new HttpError(400, 'Enter a valid email address.');
    const ip = await hit(d, `reset-ip:${caller.ip}`, { max: LIMITS.RESET_PER_IP_PER_HOUR, windowMs: HOUR });
    if (!ip.ok) throw new HttpError(429, 'Too many requests. Try again later.');
    // A repeat request for the same address is answered like any other, so the form does not show which addresses are members.
    const gate = await hit(d, `reset:${email}`, { cooldownMs: LIMITS.RESET_COOLDOWN_MS, max: LIMITS.RESET_PER_HOUR, windowMs: HOUR });
    if (!gate.ok) return { ok: true };
    let user: AuthUser;
    try { user = await d.auth.getUserByEmail(email); }
    catch (e) { if (code(e) === 'auth/user-not-found') return { ok: true }; console.error('auth-email: lookup failed', code(e)); throw new HttpError(503, UNAVAILABLE); }
    if (user.disabled) return { ok: true };
    let url: string;
    try { url = actionLink(d.origin, 'resetPassword', await d.auth.generatePasswordResetLink(email)); } catch (e) { console.error('auth-email: could not create reset link', code(e)); throw new HttpError(503, UNAVAILABLE); }
    if (!(await d.mail(resetMail(email, user.displayName, url)))) throw new HttpError(502, UNAVAILABLE);
    return { ok: true };
  }

  throw new HttpError(400, 'Unknown request.');
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com'];
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}
// Creating the sign-in links is an Auth permission. See the note at the top of this file.
function getAuthAdmin() {
  const name = 'auth-email-admin';
  let app = getApps().find(a => a.name === name);
  if (!app) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? process.env.FIREBASE_SERVICE_ACCOUNT ?? process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER;
    if (!sa) throw new Error('No Firebase service account configured');
    app = initializeApp({ credential: cert(JSON.parse(sa)) }, name);
  }
  return getAuth(app);
}
async function resendMail(m: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('auth-email: RESEND_API_KEY is not set'); return false; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: 'BeWatu <noreply@bewatu.com>', reply_to: MAIL.support, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
  });
  if (!r.ok) console.error('auth-email: Resend refused the message', r.status, await r.text());
  return r.ok;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const origin = ALLOWED_ORIGINS.includes(requested) || localDev ? requested : ALLOWED_ORIGINS[0];

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    let uid: string | undefined;
    const h = req.headers.authorization;
    if (body?.kind === 'verify') {
      if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Please sign in again.' });
      try { uid = (await getAuth(getAdminApp()).verifyIdToken(h.slice(7))).uid; } catch { return res.status(401).json({ error: 'Please sign in again.' }); }
    }
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    const out = await runAction({ db: getFirestore(getAdminApp()), now: Date.now(), origin, auth: getAuthAdmin() as any, mail: resendMail }, { uid, ip }, body);
    return res.status(200).json(out);
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('auth-email: unexpected error', code(e));
    return res.status(500).json({ error: UNAVAILABLE });
  }
}
