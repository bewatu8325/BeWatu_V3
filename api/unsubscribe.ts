// api/unsubscribe.ts
// ─────────────────────────────────────────────────────────────────────────────
// The link in every "product updates" email BeWatu sends from the ops console.
//
//   GET   shows a confirmation page with one button (a mail provider's link
//         scanner that merely fetches the link must not unsubscribe anyone)
//   POST  does it. This is also what a mail app's built-in "Unsubscribe" button
//         calls (RFC 8058 one-click, via the List-Unsubscribe-Post header).
//   POST ...&a=resubscribe   undoes it, from the "Changed your mind?" button on the confirmation
//         page. Like unsubscribing it needs the signed link and a POST, so a link scanner
//         cannot resubscribe (or unsubscribe) anyone by fetching it. Members can also change
//         this at any time in Settings (api/email-preferences.ts).
//
// The link carries the member id and an HMAC of it (COMMS_UNSUBSCRIBE_SECRET), so
// it can't be forged for someone else. Unsubscribing only stops *product update*
// emails; account, security and policy messages ("service" emails) still arrive.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function tokenFor(secret: string, uid: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${uid}`).digest('hex');
}
export function tokenIsValid(secret: string | undefined, uid: unknown, token: unknown): boolean {
  if (!secret || typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') || typeof token !== 'string') return false;
  const a = Buffer.from(tokenFor(secret, uid)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Records the opt-out. Returns false when the link is not valid. */
export async function unsubscribe(db: Firestore, secret: string | undefined, uid: unknown, token: unknown): Promise<boolean> {
  if (!tokenIsValid(secret, uid, token)) return false;
  await db.collection('users').doc(uid as string).set({ commsOptOut: true, commsOptOutAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

/** Turns product-update email back on. Returns false when the link is not valid. */
export async function resubscribe(db: Firestore, secret: string | undefined, uid: unknown, token: unknown): Promise<boolean> {
  if (!tokenIsValid(secret, uid, token)) return false;
  await db.collection('users').doc(uid as string).set({ commsOptOut: false, commsResubscribedAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const page = (title: string, inner: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="margin:0;background:#f5f5f4;font-family:Inter,Helvetica,Arial,sans-serif;color:#1c1917"><main style="max-width:460px;margin:60px auto;padding:0 18px"><div style="font-weight:800;color:#1a4a3a;font-size:20px;margin-bottom:16px">BeWatu</div><div style="background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:26px">${inner}</div></main></body></html>`;

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const secret = process.env.COMMS_UNSUBSCRIBE_SECRET;
  const q = (k: string) => { const v = req.query?.[k]; return Array.isArray(v) ? v[0] : v; };
  const uid = q('u'), token = q('t');

  if (req.method === 'GET') {
    if (!tokenIsValid(secret, uid, token)) {
      return res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Link not valid', '<h1 style="margin:0 0 10px;font-size:20px">This link isn\'t valid</h1><p style="margin:0;line-height:1.6;color:#57534e">It may be incomplete or out of date. You can manage email in your BeWatu settings, or write to support@bewatu.com.</p>'));
    }
    return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Unsubscribe', `<h1 style="margin:0 0 10px;font-size:20px">Unsubscribe from product updates?</h1><p style="margin:0 0 18px;line-height:1.6;color:#57534e">You'll stop getting news and feature emails from BeWatu. Important messages about your account and security will still reach you.</p><form method="POST" action="/api/unsubscribe?u=${encodeURIComponent(String(uid))}&t=${encodeURIComponent(String(token))}"><button type="submit" style="background:#1a4a3a;color:#fff;border:0;border-radius:10px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer">Unsubscribe</button></form>`));
  }

  if (req.method === 'POST') {
    const resub = q('a') === 'resubscribe';
    const link = `/api/unsubscribe?u=${encodeURIComponent(String(uid))}&t=${encodeURIComponent(String(token))}`;
    const btn = (label: string, filled: boolean) => `<button type="submit" style="${filled ? 'background:#1a4a3a;color:#fff;border:0' : 'background:#fff;color:#1a4a3a;border:1px solid #1a4a3a'};border-radius:10px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer">${label}</button>`;
    try {
      const db = getFirestore(getAdminApp());
      const ok = resub ? await resubscribe(db, secret, uid, token) : await unsubscribe(db, secret, uid, token);
      if (!ok) return res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Link not valid', '<h1 style="margin:0;font-size:20px">This link isn\'t valid</h1>'));
      if (resub) {
        return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Subscribed', '<h1 style="margin:0 0 10px;font-size:20px">Welcome back</h1><p style="margin:0;line-height:1.6;color:#57534e">You\'ll get BeWatu product updates again. You can change this any time in Settings, or with the unsubscribe link in any update email.</p>'));
      }
      return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Unsubscribed', `<h1 style="margin:0 0 10px;font-size:20px">You're unsubscribed</h1><p style="margin:0 0 18px;line-height:1.6;color:#57534e">You won't get product update emails from BeWatu any more. Important account and security messages will still arrive.</p><p style="margin:0 0 10px;font-size:14px;color:#57534e">Changed your mind?</p><form method="POST" action="${esc(link)}&amp;a=resubscribe">${btn('Resubscribe', false)}</form>`));
    } catch (e: any) {
      console.error('unsubscribe error:', e?.code ?? e?.message);
      return res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Something went wrong', '<h1 style="margin:0;font-size:20px">Something went wrong</h1><p style="color:#57534e">Please try again in a moment.</p>'));
    }
  }
  return res.status(405).setHeader('Allow', 'GET, POST').end();
}
