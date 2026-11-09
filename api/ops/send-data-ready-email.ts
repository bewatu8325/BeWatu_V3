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

  const parts: EmailParts = {
    preheader: 'The data you requested from BeWatu is ready to download.',
    heading: 'Your data export is ready',
    paragraphs: [`Hi ${name ?? 'there'}, the data you requested from BeWatu is ready to download. This link expires in 7 days.`],
    button: { label: 'Download your data', url: String(downloadUrl) },
    fine: requestId ? [`Reference: request ${requestId}`] : [], to: String(to),
  };
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    'BeWatu <noreply@bewatu.com>',
        reply_to: MAIL.support,
        to:      [to],
        subject: 'Your BeWatu data export is ready',
        html: emailHtml(parts),
        text: emailText(parts),
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
