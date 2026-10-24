// api/submit-endorsement.ts
// ─────────────────────────────────────────────────────────────────────────────
// The anonymous half of the endorsement-request invite loop
// (components/EndorseRequestPage.tsx, served at /endorse/:token). No
// Authorization header required or expected here -- the colleague clicking
// the emailed link has no BeWatu account, by design (see
// api/send-endorsement-request.ts and the plan this shipped from: lowest
// friction for the actual endorsement, the "join BeWatu" prompt comes after,
// as the real conversion moment). One request can now cover several skills
// at once (one email, not one per skill) -- the colleague leaves a single
// name + note that's recorded against every skill in the request.
//
// GET  /api/submit-endorsement?token=...
//   Returns public-safe request details: { requesterName, skillNames, status }
//
// POST /api/submit-endorsement
//   Body: { token: string, name: string, note?: string }
//   Returns: { success: true }
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const REQUEST_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_NAME_LEN = 100;
const MAX_NOTE_LEN = 500;

function getAdminDb() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

function isExpired(createdAtMs: number): boolean {
  return Date.now() - createdAtMs > REQUEST_EXPIRY_MS;
}

// Requests sent before multi-skill support stored a single `skillName`
// string; this keeps any still-pending (unexpired) ones from that window
// readable instead of 404ing.
function skillNamesOf(data: Record<string, any>): string[] {
  if (Array.isArray(data.skillNames)) return data.skillNames;
  return data.skillName ? [data.skillName] : [];
}

function formatSkillList(skills: string[]): string {
  if (skills.length === 1) return skills[0];
  if (skills.length === 2) return `${skills[0]} and ${skills[1]}`;
  return `${skills.slice(0, -1).join(', ')}, and ${skills[skills.length - 1]}`;
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const token = req.query.token as string;
  if (!token) return res.status(400).json({ error: 'token is required' });

  const db = getAdminDb();
  const snap = await db.collection('endorsement_requests').doc(token).get();
  if (!snap.exists) return res.status(404).json({ error: 'This endorsement link is not valid.' });

  const data = snap.data()!;
  const createdAtMs: number = data.createdAt?.toMillis?.() ?? 0;
  if (data.status === 'pending' && isExpired(createdAtMs)) {
    return res.status(410).json({ error: 'This endorsement link has expired.' });
  }
  if (data.status !== 'pending') {
    return res.status(410).json({ error: 'This endorsement request has already been completed.' });
  }

  return res.status(200).json({
    requesterName: data.requesterName,
    skillNames: skillNamesOf(data),
    status: data.status,
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { token, name, note } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'token is required' });
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Your name is required' });
  }
  if (name.length > MAX_NAME_LEN) {
    return res.status(400).json({ error: `Name must be ${MAX_NAME_LEN} characters or fewer` });
  }
  if (note && (typeof note !== 'string' || note.length > MAX_NOTE_LEN)) {
    return res.status(400).json({ error: `Note must be ${MAX_NOTE_LEN} characters or fewer` });
  }

  const db = getAdminDb();
  const reqRef = db.collection('endorsement_requests').doc(token);
  const snap = await reqRef.get();
  if (!snap.exists) return res.status(404).json({ error: 'This endorsement link is not valid.' });

  const data = snap.data()!;
  const createdAtMs: number = data.createdAt?.toMillis?.() ?? 0;
  if (data.status !== 'pending') {
    return res.status(410).json({ error: 'This endorsement request has already been completed.' });
  }
  if (isExpired(createdAtMs)) {
    return res.status(410).json({ error: 'This endorsement link has expired.' });
  }

  const requesterUid: string = data.requesterUid;
  const skillNames = skillNamesOf(data);
  if (skillNames.length === 0) return res.status(410).json({ error: 'This endorsement link is not valid.' });
  const trimmedName = name.trim();
  const trimmedNote = typeof note === 'string' ? note.trim() : undefined;

  const userRef = db.collection('users').doc(requesterUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return res.status(404).json({ error: 'The person who asked for this is no longer on BeWatu.' });

  const endorsements: { skillName: string; endorsedBy?: string[]; unclaimedEndorsers?: any[] }[] =
    userSnap.data()?.endorsements ?? [];
  // note is optional in the UI -- omit the key entirely rather than set it
  // to undefined, which the Admin SDK's update() rejects when nested in an
  // array (unlike a top-level field, where undefined is silently dropped).
  const newEntry: { name: string; note?: string; requestId: string; createdAt: string } = {
    name: trimmedName,
    requestId: token,
    createdAt: new Date().toISOString(),
  };
  if (trimmedNote) newEntry.note = trimmedNote;
  // Same single name+note recorded against every skill in the request --
  // one colleague submission, not one per skill.
  for (const skillName of skillNames) {
    const idx = endorsements.findIndex(e => e.skillName === skillName);
    if (idx >= 0) {
      endorsements[idx].unclaimedEndorsers = [...(endorsements[idx].unclaimedEndorsers ?? []), newEntry];
    } else {
      endorsements.push({ skillName, endorsedBy: [], unclaimedEndorsers: [newEntry] });
    }
  }

  await userRef.update({ endorsements, updatedAt: FieldValue.serverTimestamp() });

  await reqRef.update({
    status: 'fulfilled',
    fulfilledAt: FieldValue.serverTimestamp(),
    endorserName: trimmedName,
    endorserNote: trimmedNote ?? null,
  });

  // notifications/{uid}/items (the old 'ENDORSEMENT' NotificationType's
  // home) turned out to be fully dead -- nothing in the live app ever
  // subscribed to it, including the NotificationsDropdown.tsx component
  // that looked like it rendered that type (it was never imported
  // anywhere). users/{uid}/notifications is the real system:
  // components/Header.tsx's NotificationsPanel reads it directly and is
  // what actually renders the bell dropdown. Writing here, same as every
  // other real notification in this app.
  await db.collection('users').doc(requesterUid).collection('notifications').add({
    type: 'endorsement_fulfilled',
    message: `${trimmedName} endorsed your ${formatSkillList(skillNames)} ${skillNames.length === 1 ? 'skill' : 'skills'}`,
    actorName: trimmedName,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return res.status(200).json({ success: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('submit-endorsement error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}
