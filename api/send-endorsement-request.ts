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

const RESEND_API_KEY = process.env.RESEND_API_KEY!;

const MIN_RESEND_INTERVAL_MS = 60 * 1000;       // 1 send per minute per requester
const SEND_WINDOW_MS         = 60 * 60 * 1000;  // rolling 1-hour window
const MAX_SENDS_PER_WINDOW   = 10;              // ...capped at 10 sends in it
const MAX_SKILLS_PER_REQUEST = 20;              // generous ceiling, not a real limit for any real profile

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
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'BeWatu <noreply@bewatu.com>',
        to: [colleagueEmail],
        subject: `${requesterName} wants your endorsement on BeWatu`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="margin-bottom: 24px;">
              <img src="https://www.bewatu.com/logo.png" alt="BeWatu" height="32" style="height:32px;" />
            </div>
            <h1 style="font-size: 20px; font-weight: 800; color: #1c1917; margin-bottom: 8px;">
              ${requesterName} is asking for your endorsement
            </h1>
            <p style="color: #78716c; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
              They'd like you to vouch for their <strong>${formatSkillList(skillNames)}</strong> ${skillNames.length === 1 ? 'skill' : 'skills'} on BeWatu.
              It only takes a minute, and you do not need an account to do it.
            </p>
            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${link}" style="display: inline-block; background: #1a4a3a; color: #fff; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 10px; text-decoration: none;">
                Leave an endorsement
              </a>
            </div>
            <p style="color: #a8a29e; font-size: 12px; line-height: 1.6;">
              If you weren't expecting this, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 24px 0;" />
            <p style="color: #d6d3d1; font-size: 11px;">
              BeWatu · Endorsement request · This email was sent to ${colleagueEmail}
            </p>
          </div>
        `,
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
