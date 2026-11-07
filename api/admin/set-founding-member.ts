// api/admin/set-founding-member.ts
// ─────────────────────────────────────────────────────────────────────────────
// Platform-admin tool: add existing members to (or remove them from) the
// Founding Members beta, in bulk, by email. Backs the "Founding members" view
// in components/AdminPanel.tsx.
//
// Why this is a server route: users/{uid}.foundingMember is frozen against
// every client write in firestore.rules (platform admins included), so the
// badge can't be self-granted. The Admin SDK bypasses rules, so this route is
// the one sanctioned way to change it after signup. It re-checks that the
// caller really is a platform admin (users/{uid}.isPlatformAdmin === true,
// the same check api/admin/discount-codes.ts uses).
//
// Emails are resolved through Firebase Auth (the source of truth for a
// member's sign-in email; the users doc deliberately doesn't carry it).
//
// POST /api/admin/set-founding-member
//   Headers: Authorization: Bearer <idToken>
//   Body: { action: 'add' | 'remove', emails: string[] }   (max 200 emails)
//   Returns: { results: [{ email, status, uid?, name? }], summary: { ... } }
//   status: 'added' | 'removed' | 'already' | 'not_found' | 'no_profile' | 'invalid'
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const MAX_EMAILS        = 200;
const AUTH_LOOKUP_CHUNK = 100;  // getUsers() accepts at most 100 identifiers
const GET_ALL_CHUNK     = 100;
const WRITE_CHUNK       = 200;  // 2 writes per member (profile + audit entry) stays under the 500-write batch cap

type Status = 'added' | 'removed' | 'already' | 'not_found' | 'no_profile' | 'invalid';
interface Result { email: string; status: Status; uid?: string; name?: string }

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = ['https://www.bewatu.com', 'https://bewatu.com', 'http://localhost:5173', 'http://localhost:3000'];
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, emails } = req.body ?? {};
  if (action !== 'add' && action !== 'remove') {
    return res.status(400).json({ error: 'action must be "add" or "remove"' });
  }
  if (!Array.isArray(emails) || emails.length === 0 || !emails.every((e: unknown) => typeof e === 'string')) {
    return res.status(400).json({ error: 'emails must be a non-empty list of strings' });
  }
  if (emails.length > MAX_EMAILS) {
    return res.status(400).json({ error: `At most ${MAX_EMAILS} emails per request` });
  }

  try {
    const adminApp  = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const db        = getFirestore(adminApp);

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const actorSnap = await db.collection('users').doc(decoded.uid).get();
    if (!actorSnap.exists || actorSnap.data()?.isPlatformAdmin !== true) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }
    const actorName: string = actorSnap.data()?.displayName ?? decoded.email ?? 'Platform admin';

    // Normalise and de-duplicate, keeping the first-seen order for the report.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const raw of emails as string[]) {
      const email = raw.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      ordered.push(email);
    }

    const results = new Map<string, Result>();
    const valid: string[] = [];
    for (const email of ordered) {
      if (EMAIL_RE.test(email)) valid.push(email);
      else results.set(email, { email, status: 'invalid' });
    }

    // email -> uid, via Firebase Auth.
    const uidByEmail = new Map<string, string>();
    for (const part of chunk(valid, AUTH_LOOKUP_CHUNK)) {
      const found = await adminAuth.getUsers(part.map(email => ({ email })));
      for (const u of found.users) {
        if (u.email) uidByEmail.set(u.email.toLowerCase(), u.uid);
      }
    }
    for (const email of valid) {
      if (!uidByEmail.has(email)) results.set(email, { email, status: 'not_found' });
    }

    // uid -> profile doc, to see who actually needs a change.
    const matched = valid.filter(e => uidByEmail.has(e));
    const profiles = new Map<string, { name: string; founding: boolean }>();
    for (const part of chunk(matched.map(e => uidByEmail.get(e)!), GET_ALL_CHUNK)) {
      const snaps = await db.getAll(...part.map(uid => db.collection('users').doc(uid)));
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const d = snap.data() ?? {};
        profiles.set(snap.id, { name: d.displayName ?? '', founding: d.foundingMember === true });
      }
    }

    const wantFounding = action === 'add';
    const toChange: { email: string; uid: string; name: string }[] = [];
    for (const email of matched) {
      const uid = uidByEmail.get(email)!;
      const profile = profiles.get(uid);
      if (!profile) { results.set(email, { email, status: 'no_profile', uid }); continue; }
      if (profile.founding === wantFounding) {
        results.set(email, { email, status: 'already', uid, name: profile.name });
        continue;
      }
      toChange.push({ email, uid, name: profile.name });
    }

    for (const part of chunk(toChange, WRITE_CHUNK)) {
      const batch = db.batch();
      for (const m of part) {
        batch.update(db.collection('users').doc(m.uid), {
          foundingMember: wantFounding,
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(db.collection('adminAuditLog').doc(), {
          actorUid: decoded.uid,
          actorName,
          action: wantFounding ? 'founding_member_added' : 'founding_member_removed',
          targetType: 'founding_member',
          targetId: m.uid,
          targetName: m.name || m.email,
          details: `${wantFounding ? 'Added to' : 'Removed from'} the Founding Members beta by email`,
          previousValue: !wantFounding,
          newValue: wantFounding,
          timestamp: FieldValue.serverTimestamp(),
          userAgent: 'server',
        });
      }
      await batch.commit();
      for (const m of part) {
        results.set(m.email, { email: m.email, status: wantFounding ? 'added' : 'removed', uid: m.uid, name: m.name });
      }
    }

    const list = ordered.map(e => results.get(e)!);
    const summary: Record<string, number> = {};
    for (const r of list) summary[r.status] = (summary[r.status] ?? 0) + 1;

    return res.status(200).json({ results: list, summary });

  } catch (err: any) {
    console.error('set-founding-member error:', err);
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token' || err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Invalid ID token' });
    }
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
