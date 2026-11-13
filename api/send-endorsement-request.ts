// api/send-endorsement-request.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lets a signed-in BeWatu user ask a colleague -- including one who isn't a
// BeWatu member yet -- to endorse one or more of their skills in a single
// request (one email, not one per skill). Sends a Resend email with a link
// to /endorse/:token (components/EndorseRequestPage.tsx, an unauthenticated
// page); the colleague can leave the endorsement without ever creating an
// account (see api/submit-endorsement.ts). This is the invite-loop
// mechanic: the ask is the thing that pulls a new person in.
//
// Required env vars (same set api/send-recruiter-otp.ts already uses):
//   RESEND_API_KEY
//   FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT)
//
// POST /api/send-endorsement-request
//   Headers: Authorization: Bearer <idToken>
//   Body: { skillNames: string[], colleagueEmail: string }
//   Returns: { success: true }
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

const MIN_RESEND_INTERVAL_MS = 60 * 1000;       // 1 send per minute per requester
const SEND_WINDOW_MS         = 60 * 60 * 1000;  // rolling 1-hour window
const MAX_SENDS_PER_WINDOW   = 10;              // ...capped at 10 sends in it
const MAX_SKILLS_PER_REQUEST = 20;              // generous ceiling, not a real limit for any real profile

// requesterName, skill names and colleagueEmail are all attacker-controlled and
// end up in an email that arrives from BeWatu's own domain, so everything
// interpolated into the HTML body must be escaped. (The subject line is not HTML.)
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSkillList(skills: string[]): string {
  if (skills.length === 1) return skills[0];
  if (skills.length === 2) return `${skills[0]} and ${skills[1]}`;
  return `${skills.slice(0, -1).join(', ')}, and ${skills[skills.length - 1]}`;
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const { skillNames, colleagueEmail } = req.body ?? {};
  if (!Array.isArray(skillNames) || skillNames.length === 0 || !skillNames.every((s: any) => typeof s === 'string' && s.trim())) {
    return res.status(400).json({ error: 'At least one skillName is required' });
  }
  if (skillNames.length > MAX_SKILLS_PER_REQUEST) {
    return res.status(400).json({ error: `At most ${MAX_SKILLS_PER_REQUEST} skills per request` });
  }
  if (!colleagueEmail || !isValidEmail(colleagueEmail)) {
    return res.status(400).json({ error: 'A valid colleague email is required' });
  }

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const db = getFirestore(adminApp);

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const uid = decoded.uid;

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const requesterName: string = userSnap.data()?.displayName ?? 'A BeWatu member';

    // Rate limit, same rolling-window shape as api/send-recruiter-otp.ts --
    // this sends real email to an address outside our control, same
    // cost/sender-reputation concern that file's own rate limit guards
    // against, so it needs the same protection from day one.
    const rlRef = db.collection('endorsement_request_rate_limits').doc(uid);
    const now = Date.now();
    const existing = (await rlRef.get()).data() as
      | { lastSentAt?: number; windowStart?: number; sendCount?: number }
      | undefined;

    if (existing?.lastSentAt && now - existing.lastSentAt < MIN_RESEND_INTERVAL_MS) {
      const waitSec = Math.ceil((MIN_RESEND_INTERVAL_MS - (now - existing.lastSentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec}s before sending another request.` });
    }
    const windowStart = existing?.windowStart && now - existing.windowStart < SEND_WINDOW_MS
      ? existing.windowStart
      : now;
    const sendCount = windowStart === existing?.windowStart ? (existing?.sendCount ?? 0) : 0;
    if (sendCount >= MAX_SENDS_PER_WINDOW) {
      return res.status(429).json({ error: 'Too many endorsement requests sent. Please try again in an hour.' });
    }

    const token = crypto.randomBytes(24).toString('base64url');

    await db.collection('endorsement_requests').doc(token).set({
      requesterUid: uid,
      requesterName,
      skillNames,
      colleagueEmail,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    await rlRef.set({
      lastSentAt: now,
      windowStart,
      sendCount: sendCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const link = `https://www.bewatu.com/endorse/${token}`;
    const parts: EmailParts = {
      preheader: `${requesterName} would like you to vouch for their work.`,
      heading: `${requesterName} is asking for your endorsement`,
      paragraphs: [`They'd like you to vouch for their ${formatSkillList(skillNames)} ${skillNames.length === 1 ? 'skill' : 'skills'} on BeWatu. It only takes a minute, and you do not need an account to do it.`],
      button: { label: 'Leave an endorsement', url: link },
      fine: ["If you weren't expecting this, you can safely ignore this email."], to: colleagueEmail,
    };
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'BeWatu <noreply@bewatu.com>',
        reply_to: MAIL.support,
        to: [colleagueEmail],
        subject: `${requesterName} wants your endorsement on BeWatu`,
        html: emailHtml(parts),
        text: emailText(parts),
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      console.error('Resend error:', body);
      return res.status(500).json({ error: 'Failed to send the request email. Please try again.' });
    }

    return res.status(200).json({ success: true });

  } catch (err: any) {
    console.error('send-endorsement-request error:', err);
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid ID token' });
    }
    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}
