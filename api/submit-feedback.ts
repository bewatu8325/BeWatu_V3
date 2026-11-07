// api/submit-feedback.ts
// ─────────────────────────────────────────────────────────────────────────────
// Backs the in-app "Share feedback" entry point (components/FeedbackModal.tsx,
// opened from the Header's user menu). A signed-in member sends an idea, a
// problem, or a note; it is saved to platform_feedback (server-side only, see
// firestore.rules) and emailed to the team so it is actually read.
//
// Required env vars:
//   RESEND_API_KEY
//   FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT)
// Optional:
//   FEEDBACK_TO_EMAIL   (defaults to support@bewatu.com)
//
// POST /api/submit-feedback
//   Headers: Authorization: Bearer <idToken>
//   Body: { message: string, category: 'idea' | 'problem' | 'other' }
//   Returns: { success: true }
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FEEDBACK_TO = process.env.FEEDBACK_TO_EMAIL ?? 'support@bewatu.com';

const MIN_INTERVAL_MS    = 30 * 1000;
const WINDOW_MS          = 60 * 60 * 1000;
const MAX_PER_WINDOW     = 10;
const MIN_MESSAGE_LEN    = 3;
const MAX_MESSAGE_LEN    = 2000;

const CATEGORIES = ['idea', 'problem', 'other'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_LABEL: Record<Category, string> = {
  idea: 'Idea',
  problem: 'Problem',
  other: 'Other',
};

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

// Member-supplied text goes into an HTML email, so it must be escaped.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  const { message, category } = req.body ?? {};
  if (typeof message !== 'string' || message.trim().length < MIN_MESSAGE_LEN) {
    return res.status(400).json({ error: 'Please write a little more before sending.' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: `Feedback must be ${MAX_MESSAGE_LEN} characters or fewer.` });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid category.' });
  }
  const text = message.trim();

  try {
    const adminApp = getAdminApp();
    const decoded = await getAuth(adminApp).verifyIdToken(authHeader.split('Bearer ')[1]);
    const uid = decoded.uid;
    const db = getFirestore(adminApp);

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const userData = userSnap.data() ?? {};
    const name: string = userData.displayName ?? 'A BeWatu member';
    const email: string | null = decoded.email ?? null;

    // Rolling-window rate limit, same shape as api/send-endorsement-request.ts.
    const rlRef = db.collection('feedback_rate_limits').doc(uid);
    const now = Date.now();
    const existing = (await rlRef.get()).data() as
      | { lastSentAt?: number; windowStart?: number; sendCount?: number }
      | undefined;

    if (existing?.lastSentAt && now - existing.lastSentAt < MIN_INTERVAL_MS) {
      const waitSec = Math.ceil((MIN_INTERVAL_MS - (now - existing.lastSentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec}s before sending more feedback.` });
    }
    const windowStart = existing?.windowStart && now - existing.windowStart < WINDOW_MS
      ? existing.windowStart
      : now;
    const sendCount = windowStart === existing?.windowStart ? (existing?.sendCount ?? 0) : 0;
    if (sendCount >= MAX_PER_WINDOW) {
      return res.status(429).json({ error: 'You have sent a lot of feedback. Please try again in an hour.' });
    }

    await rlRef.set({
      lastSentAt: now,
      windowStart,
      sendCount: sendCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('platform_feedback').add({
      uid,
      name,
      email,
      category,
      message: text,
      foundingMember: userData.foundingMember === true,
      status: 'new',
      createdAt: FieldValue.serverTimestamp(),
    });

    // The feedback is already saved; a mail failure must not make the member
    // think it was lost, so log it and still report success.
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'BeWatu <noreply@bewatu.com>',
          to: [FEEDBACK_TO],
          ...(email ? { reply_to: email } : {}),
          subject: `[Feedback · ${CATEGORY_LABEL[category as Category]}] from ${name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
              <p style="color:#78716c; font-size:12px; margin:0 0 4px;">
                ${escapeHtml(CATEGORY_LABEL[category as Category])}${userData.foundingMember === true ? ' · Founding Member' : ''}
              </p>
              <h1 style="font-size:18px; color:#1c1917; margin:0 0 16px;">${escapeHtml(name)}${email ? ` &lt;${escapeHtml(email)}&gt;` : ''}</h1>
              <p style="color:#1c1917; font-size:14px; line-height:1.6; white-space:pre-wrap; margin:0;">${escapeHtml(text)}</p>
            </div>
          `,
        }),
      });
      if (!emailRes.ok) console.error('submit-feedback: Resend error:', await emailRes.text());
    } catch (mailErr) {
      console.error('submit-feedback: email send failed:', mailErr);
    }

    return res.status(200).json({ success: true });

  } catch (err: any) {
    console.error('submit-feedback error:', err);
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid ID token' });
    }
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
