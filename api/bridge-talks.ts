// api/bridge-talks.ts
// ─────────────────────────────────────────────────────────────────────────────
// Bridge Talks: the only way a Talk is created, changed, submitted or published. firestore.rules lets nobody write a Talk from a
// browser (except a member toggling their own like), because what matters here cannot be written as a rule:
//   - only an authorized contributor can start a Talk, and only its speaker edits it, and only while it is a draft;
//   - only a BeWatu platform admin publishes, rejects, asks for changes or unpublishes, and each step follows one table of
//     allowed moves (Draft → Submitted → Under review → Published, plus Rejected, Unpublished and Archived);
//   - the video, thumbnail and captions must be files this speaker uploaded to BeWatu's own storage, and are checked there;
//   - the speaker's name, photo and headline are copied from their real profile, never from the request;
//   - a public Talk needs the speaker's explicit consent, and a Talk can never become visible without an approval.
//
// POST /api/bridge-talks   Authorization: Bearer <idToken>
//   { action: 'me' }                                                               what this member may do
//   { action: 'save', id?, title, summary, experience, category, keyTakeaways, discussionPrompt, transcript, captionsVtt,
//                     visibility, publicConsent, videoUrl, thumbnailUrl, durationSec }   contributor, drafts only
//   { action: 'transition', id, to, note? }       speaker or admin, per the table (submit, withdraw, publish, reject, …)
//   { action: 'delete', id }                                                       speaker, drafts only
//   { action: 'request_access', expertise, topics }                                any member
//   { action: 'suggest_speaker', name, why, topic? }                               any member
//   { action: 'comment_notify', talkId, commentId }                                the comment's author
//   { action: 'admin_list', kind: 'requests' | 'suggestions' }                     platform admin
//   { action: 'resolve_request', uid, decision: 'approve' | 'decline', note? }     platform admin
//   { action: 'revoke_contributor', uid }                                          platform admin
//   { action: 'resolve_suggestion', id }                                           platform admin
//
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel (the limits and the table below mirror lib/bridgeTalks.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const CATEGORY_IDS = ['leadership', 'career', 'entrepreneurship', 'technology', 'finance', 'healthcare', 'engineering', 'wisdom'];
export const LIMITS = {
  title: 100, summary: 400, experience: 300, takeaway: 140, takeaways: 3, question: 200, transcript: 30_000, captions: 120_000, comment: 2000,
  minSec: 30, maxSec: 45 * 60, maxVideoBytes: 500 * 1024 * 1024, maxImageBytes: 5 * 1024 * 1024,
  videoTypes: ['video/mp4', 'video/quicktime', 'video/webm'], imageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  note: { min: 5, max: 500 }, expertise: { min: 20, max: 600 }, why: { min: 10, max: 500 },
  openDrafts: 10, savesPerHour: 80, submitsPerDay: 10, requestsPerDay: 3, suggestionsPerDay: 5, notifiesPerHour: 120, openRequests: 1,
};

export type TalkStatus = 'draft' | 'submitted' | 'under_review' | 'published' | 'rejected' | 'unpublished' | 'archived';
type Actor = 'speaker' | 'admin';
export const TRANSITIONS: Record<TalkStatus, Partial<Record<TalkStatus, Actor[]>>> = {
  draft:        { submitted: ['speaker'], archived: ['speaker', 'admin'] },
  submitted:    { draft: ['speaker', 'admin'], under_review: ['admin'], published: ['admin'], rejected: ['admin'], archived: ['speaker', 'admin'] },
  under_review: { draft: ['admin'], published: ['admin'], rejected: ['admin'], archived: ['admin'] },
  published:    { unpublished: ['speaker', 'admin'], archived: ['admin'] },
  rejected:     { draft: ['speaker'], archived: ['speaker', 'admin'] },
  unpublished:  { published: ['admin'], draft: ['speaker'], archived: ['speaker', 'admin'] },
  archived:     {},
};
export const canMove = (from: TalkStatus, to: TalkStatus, actors: Actor[]) => actors.some(a => TRANSITIONS[from]?.[to]?.includes(a));

export interface Deps {
  db: Firestore;
  now: number;
  /** The type and size of a file in storage, or null if it cannot be read. */
  inspect: (url: string) => Promise<{ type: string; size: number } | null>;
  /** The bucket uploads must live in (when known). */
  bucket?: string;
}

// ── small helpers ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-control-regex
const oneLine = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// eslint-disable-next-line no-control-regex
const multiLine = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const idOf = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v)) throw new HttpError(400, 'That Talk was not found.');
  return v;
};

export async function hit(db: Firestore, key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const ref = db.collection('bridge_rate_limits').doc(key.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 200));
  return db.runTransaction(async tx => {
    const s = (await tx.get(ref)).data() as { count?: number; windowStart?: number } | undefined;
    const fresh = !s?.windowStart || now - s.windowStart >= windowMs;
    const count = fresh ? 0 : (s?.count ?? 0);
    if (count >= max) return false;
    tx.set(ref, { count: count + 1, windowStart: fresh ? now : s!.windowStart, updatedAt: now });
    return true;
  });
}
async function limit(d: Deps, key: string, max: number, windowMs: number, message: string) {
  if (!(await hit(d.db, key, max, windowMs, d.now))) throw new HttpError(429, message);
}

const isAdmin = async (db: Firestore, uid: string) => (await db.collection('users').doc(uid).get()).data()?.isPlatformAdmin === true;
async function requireAdmin(db: Firestore, uid: string) {
  if (!(await isAdmin(db, uid))) throw new HttpError(403, 'BeWatu reviewer access is required.');
}
async function requireContributor(db: Firestore, uid: string) {
  const u = (await db.collection('users').doc(uid).get()).data();
  if (u?.bridgeContributor !== true && u?.isPlatformAdmin !== true) throw new HttpError(403, 'Bridge Talks are shared by invited contributors. You can ask for access from Bridge.');
}

/** The speaker as members see them, copied from their profile. */
export function speakerSnapshot(uid: string, u: Record<string, any> | undefined) {
  const photo = typeof u?.photoURL === 'string' && /^https:\/\//.test(u.photoURL) ? u.photoURL : null;
  const publicProfile = u?.isPublic !== false && !['private', 'connections'].includes(u?.privacySettings?.profileVisibility);
  return {
    speakerUid: uid, speakerId: typeof u?.numericId === 'number' ? u.numericId : null, speakerName: oneLine(u?.displayName, 80) || 'BeWatu member',
    speakerHeadline: oneLine(u?.headline, 120), speakerAvatar: photo, speakerUsername: publicProfile && typeof u?.username === 'string' ? u.username.slice(0, 40) : null,
  };
}

// ── files: only this speaker's own uploads, in BeWatu's own storage ──────────
export function ownUpload(url: unknown, uid: string, bucket: string | undefined, what: string): string {
  if (typeof url !== 'string' || url.length > 2048) throw new HttpError(400, `${what} must be uploaded to BeWatu.`);
  let u: URL;
  try { u = new URL(url); } catch { throw new HttpError(400, `${what} must be uploaded to BeWatu.`); }
  const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!m || u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com' || u.port || u.username || u.password) {
    throw new HttpError(400, `${what} must be uploaded to BeWatu.`);
  }
  if (bucket && m[1] !== bucket) throw new HttpError(400, `${what} must be uploaded to BeWatu.`);
  let path = '';
  try { path = decodeURIComponent(m[2]); } catch { throw new HttpError(400, `${what} must be uploaded to BeWatu.`); }
  if (!path.startsWith(`bridge-talks/${uid}/`) || path.includes('..')) throw new HttpError(400, `${what} must be your own upload.`);
  return url;
}

// ── a draft, checked ─────────────────────────────────────────────────────────
export interface Clean {
  title: string; summary: string; experience: string; category: string; keyTakeaways: string[]; discussionPrompt: string;
  transcript: string; captionsVtt: string; visibility: 'members' | 'public'; publicConsent: boolean;
  videoUrl: string; thumbnailUrl: string | null; durationSec: number;
}
/** Cleans what the form sent. Throws on anything that is not allowed at all (a bad file, a wrong category). */
export async function cleanDraft(d: Deps, uid: string, b: Record<string, any>, previous?: Partial<Clean>): Promise<Clean> {
  const takeaways = Array.isArray(b.keyTakeaways) ? b.keyTakeaways : [];
  if (takeaways.length > LIMITS.takeaways) throw new HttpError(400, `At most ${LIMITS.takeaways} takeaways.`);
  const category = typeof b.category === 'string' ? b.category : '';
  if (category && !CATEGORY_IDS.includes(category)) throw new HttpError(400, 'Choose one of the listed topics.');
  const visibility = b.visibility === 'public' ? 'public' : 'members';
  const captions = multiLine(b.captionsVtt, LIMITS.captions + 1);
  if (captions.length > LIMITS.captions) throw new HttpError(400, 'That captions file is too large.');
  if (captions && !/^﻿?WEBVTT/.test(captions)) throw new HttpError(400, 'Captions must be a WebVTT (.vtt) file.');
  const dur = Number(b.durationSec);
  if (b.durationSec != null && b.durationSec !== 0 && (!Number.isFinite(dur) || dur < LIMITS.minSec || dur > LIMITS.maxSec)) {
    throw new HttpError(400, `A Talk is between ${LIMITS.minSec} seconds and ${LIMITS.maxSec / 60} minutes.`);
  }
  let videoUrl = '';
  if (b.videoUrl) {
    videoUrl = ownUpload(b.videoUrl, uid, d.bucket, 'The video');
    if (videoUrl !== previous?.videoUrl) {          // a new file: look at what it really is
      const info = await d.inspect(videoUrl);
      if (!info) throw new HttpError(400, 'We could not read that video. Upload it again.');
      if (!LIMITS.videoTypes.includes(info.type)) throw new HttpError(400, 'Use an MP4, MOV or WebM video.');
      if (info.size > LIMITS.maxVideoBytes) throw new HttpError(400, 'That video is too large.');
    }
  }
  let thumbnailUrl: string | null = null;
  if (b.thumbnailUrl) {
    thumbnailUrl = ownUpload(b.thumbnailUrl, uid, d.bucket, 'The thumbnail');
    if (thumbnailUrl !== previous?.thumbnailUrl) {
      const info = await d.inspect(thumbnailUrl);
      if (!info || !LIMITS.imageTypes.includes(info.type) || info.size > LIMITS.maxImageBytes) throw new HttpError(400, 'The thumbnail must be a JPEG, PNG or WebP image under 5 MB.');
    }
  }
  return {
    title: oneLine(b.title, LIMITS.title), summary: multiLine(b.summary, LIMITS.summary), experience: multiLine(b.experience, LIMITS.experience), category,
    keyTakeaways: takeaways.map((t: unknown) => oneLine(t, LIMITS.takeaway)).filter(Boolean), discussionPrompt: oneLine(b.discussionPrompt, LIMITS.question),
    transcript: multiLine(b.transcript, LIMITS.transcript), captionsVtt: captions, visibility, publicConsent: b.publicConsent === true, videoUrl, thumbnailUrl,
    durationSec: Number.isFinite(dur) ? Math.round(dur) : 0,
  };
}
/** What a reviewer needs to see before a Talk can be submitted or published. null when complete. */
export function incomplete(t: Partial<Clean>): string | null {
  if (!t.videoUrl) return 'Upload your video first.';
  if (!t.title) return 'Give your Talk a title.';
  if (!t.summary) return 'Add a short summary.';
  if (!t.category) return 'Choose a topic.';
  if (!t.experience) return 'Say what experience you are speaking from.';
  if (!t.durationSec) return 'We could not read the length of your video.';
  if (t.visibility === 'public' && t.publicConsent !== true) return 'Confirm that you are happy for anyone with the link to see this Talk.';
  return null;
}

// ── review notes and history, kept apart from the Talk members can read ──────
const historyEntry = (by: string, action: string, note?: string) => ({ atMs: Date.now(), by, action, ...(note ? { note } : {}) });
async function notify(d: Deps, toUid: string, n: { type: string; message: string; talkId?: string }, id?: string) {
  const col = d.db.collection('users').doc(toUid).collection('notifications');
  const data = { ...n, isRead: false, createdAt: FieldValue.serverTimestamp() };
  try { if (id) await col.doc(id).create(data); else await col.add(data); }
  catch (e: any) { if (e?.code !== 6 && !/already exists/i.test(String(e?.message))) console.error('bridge notify failed:', e?.code ?? e?.message); }
}

// ═════════════════════════════════════════════════════════════════════════════
export async function runAction(d: Deps, uid: string, body: Record<string, any>): Promise<Record<string, any>> {
  const { db } = d;
  const talks = db.collection('bridge_talks');
  const reviews = db.collection('bridge_talk_reviews');
  const action = typeof body?.action === 'string' ? body.action : '';

  switch (action) {
    case 'me': {
      const u = (await db.collection('users').doc(uid).get()).data();
      const r = (await db.collection('bridge_contributor_requests').doc(uid).get()).data();
      return { contributor: u?.bridgeContributor === true || u?.isPlatformAdmin === true, admin: u?.isPlatformAdmin === true, request: r ? { status: r.status, note: r.status === 'declined' ? r.note ?? null : null } : null };
    }

    case 'save': {
      await requireContributor(db, uid);
      await limit(d, `save:${uid}`, LIMITS.savesPerHour, 3_600_000, 'You are saving very quickly. Try again in a few minutes.');
      const me = (await db.collection('users').doc(uid).get()).data();
      if (body.id) {
        const id = idOf(body.id);
        const ref = talks.doc(id);
        const snap = await ref.get();
        if (!snap.exists || snap.data()!.speakerUid !== uid) throw new HttpError(404, 'That Talk was not found.');
        if (snap.data()!.status !== 'draft') throw new HttpError(409, 'Only a draft can be edited. Withdraw it first to make changes.');
        // What the form did not send stays as it was (a metadata-only save must not drop the video).
        const clean = await cleanDraft(d, uid, { ...snap.data(), ...body }, snap.data() as any);
        await ref.update({ ...clean, ...speakerSnapshot(uid, me), updatedAt: FieldValue.serverTimestamp() });
        return { ok: true, id, status: 'draft' };
      }
      const open = await talks.where('speakerUid', '==', uid).where('status', '==', 'draft').limit(LIMITS.openDrafts + 1).get();
      if (open.size >= LIMITS.openDrafts) throw new HttpError(409, `You have ${LIMITS.openDrafts} drafts open. Finish or delete one first.`);
      const clean = await cleanDraft(d, uid, body);
      const ref = talks.doc();
      await ref.set({ ...clean, ...speakerSnapshot(uid, me), status: 'draft', publishedAt: null, likedByUids: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await reviews.doc(ref.id).set({ speakerUid: uid, note: null, history: [historyEntry(uid, 'created')] });
      return { ok: true, id: ref.id, status: 'draft' };
    }

    case 'transition': {
      const id = idOf(body.id);
      const to = typeof body.to === 'string' ? body.to as TalkStatus : null;
      if (!to || !(to in TRANSITIONS)) throw new HttpError(400, 'Unknown status.');
      const note = oneLine(body.note, LIMITS.note.max);
      const admin = await isAdmin(db, uid);
      const ref = talks.doc(id);
      const first = await ref.get();
      if (!first.exists) throw new HttpError(404, 'That Talk was not found.');
      const owner = first.data()!.speakerUid === uid;
      if (!owner && !admin) throw new HttpError(404, 'That Talk was not found.');     // not yours: it may as well not exist
      const actors: Actor[] = [...(owner ? ['speaker' as const] : []), ...(admin ? ['admin' as const] : [])];
      if (!canMove(first.data()!.status as TalkStatus, to, actors)) throw new HttpError(409, `A ${String(first.data()!.status).replace('_', ' ')} Talk cannot move to ${to.replace('_', ' ')}.`);
      if (to === 'submitted') {
        await requireContributor(db, uid);
        await limit(d, `submit:${uid}`, LIMITS.submitsPerDay, 86_400_000, 'You have submitted several Talks today. Please try again tomorrow.');
      }
      // "Asking for changes" (to a draft), declining, and hiding a Talk each need a reason the speaker can read.
      const adminOnly = admin && !owner;
      const needsNote = adminOnly && ((to === 'draft') || to === 'rejected' || to === 'unpublished');
      if (needsNote && note.length < LIMITS.note.min) throw new HttpError(400, 'Please give the speaker a short reason.');
      const speakerDoc = (await db.collection('users').doc(first.data()!.speakerUid).get()).data();

      const out = await db.runTransaction(async tx => {
        const rref = reviews.doc(id);
        const [snap, rsnap] = await Promise.all([tx.get(ref), tx.get(rref)]);
        const t = snap.data() as any;
        if (!snap.exists) throw new HttpError(404, 'That Talk was not found.');
        const from = t.status as TalkStatus;
        if (!canMove(from, to, actors)) throw new HttpError(409, `A ${from.replace('_', ' ')} Talk cannot move to ${to.replace('_', ' ')}.`);
        const patch: Record<string, unknown> = { status: to, updatedAt: FieldValue.serverTimestamp() };
        if (to === 'submitted' || to === 'published') {
          const problem = incomplete(t);
          if (problem) throw new HttpError(400, problem);
        }
        if (to === 'published') {
          if (t.visibility === 'public' && t.publicConsent !== true) throw new HttpError(400, 'The speaker has not agreed to public viewing.');
          Object.assign(patch, speakerSnapshot(t.speakerUid, speakerDoc));          // the profile as it is today
          if (!t.publishedAt) patch.publishedAt = FieldValue.serverTimestamp();
        }
        tx.update(ref, patch);
        const r = rsnap.data() as any;
        const hist = [...(r?.history ?? []), historyEntry(uid, to, note || undefined)].slice(-60);
        tx.set(rref, { speakerUid: t.speakerUid, note: adminOnly ? (needsNote ? note : null) : (r?.note ?? null), history: hist }, { merge: true });
        return { from, title: t.title, speakerUid: t.speakerUid as string };
      });

      if (adminOnly) {
        const title = out.title || 'your Talk';
        const msg: Record<string, string | undefined> = {
          published: `Your Talk "${title}" is live in Bridge.`,
          rejected: `Your Talk "${title}" was not accepted. ${note}`,
          draft: `A reviewer asked for changes to "${title}": ${note}`,
          unpublished: `"${title}" was taken down from Bridge. ${note}`,
        };
        if (msg[to]) await notify(d, out.speakerUid, { type: 'talk_review', message: msg[to]!, talkId: id });
      }
      return { ok: true, id, status: to };
    }

    case 'delete': {
      const id = idOf(body.id);
      const ref = talks.doc(id);
      const snap = await ref.get();
      if (!snap.exists || snap.data()!.speakerUid !== uid) throw new HttpError(404, 'That Talk was not found.');
      if (snap.data()!.status !== 'draft') throw new HttpError(409, 'Only a draft can be deleted. Archive it instead.');
      await ref.delete();
      await reviews.doc(id).delete().catch(() => {});
      return { ok: true, id };
    }

    case 'request_access': {
      const me = (await db.collection('users').doc(uid).get()).data();
      if (me?.bridgeContributor === true || me?.isPlatformAdmin === true) throw new HttpError(409, 'You can already share Talks.');
      const expertise = multiLine(body.expertise, LIMITS.expertise.max);
      if (expertise.length < LIMITS.expertise.min) throw new HttpError(400, 'Tell us a little more about your experience and what you would speak about.');
      const topics = (Array.isArray(body.topics) ? body.topics : []).filter((x: unknown) => typeof x === 'string' && CATEGORY_IDS.includes(x)).slice(0, 3);
      await limit(d, `request:${uid}`, LIMITS.requestsPerDay, 86_400_000, 'You have already asked today. We will get back to you.');
      const ref = db.collection('bridge_contributor_requests').doc(uid);
      const prev = (await ref.get()).data();
      if (prev?.status === 'pending') throw new HttpError(409, 'Your request is already with us.');
      await ref.set({ uid, status: 'pending', expertise, topics, name: oneLine(me?.displayName, 80) || 'BeWatu member', headline: oneLine(me?.headline, 120), createdAt: FieldValue.serverTimestamp(), decidedAt: null, note: null });
      return { ok: true, status: 'pending' };
    }

    case 'suggest_speaker': {
      const name = oneLine(body.name, 80), why = multiLine(body.why, LIMITS.why.max), topic = typeof body.topic === 'string' && CATEGORY_IDS.includes(body.topic) ? body.topic : null;
      if (name.length < 2) throw new HttpError(400, 'Who would you like to hear from?');
      if (why.length < LIMITS.why.min) throw new HttpError(400, 'Say a little about what they could teach.');
      await limit(d, `suggest:${uid}`, LIMITS.suggestionsPerDay, 86_400_000, 'You have sent several suggestions today. Thank you; try again tomorrow.');
      const ref = db.collection('bridge_talk_suggestions').doc();
      await ref.set({ fromUid: uid, name, why, topic, status: 'new', createdAt: FieldValue.serverTimestamp() });
      return { ok: true, id: ref.id };
    }

    case 'comment_notify': {
      const talkId = idOf(body.talkId), commentId = idOf(body.commentId);
      await limit(d, `notify:${uid}`, LIMITS.notifiesPerHour, 3_600_000, 'Too many requests.');
      const talk = (await talks.doc(talkId).get()).data();
      if (!talk || talk.status !== 'published') return { ok: true, notified: 0 };
      const c = (await talks.doc(talkId).collection('comments').doc(commentId).get()).data();
      if (!c || c.authorUid !== uid) throw new HttpError(403, 'You can only announce your own comment.');
      const who = oneLine(c.authorName, 60) || 'Someone';
      const title = oneLine(talk.title, 80);
      const recipients = new Map<string, string>();
      if (c.parentId) {
        const parent = (await talks.doc(talkId).collection('comments').doc(String(c.parentId)).get()).data();
        const speakerReplying = uid === talk.speakerUid;
        if (parent?.authorUid && parent.authorUid !== uid) {
          recipients.set(parent.authorUid, speakerReplying ? `${who}, the speaker, replied to your question on "${title}".` : `${who} replied to your comment on "${title}".`);
        }
        if (typeof c.replyToUid === 'string' && c.replyToUid !== uid && !recipients.has(c.replyToUid)) {
          recipients.set(c.replyToUid, speakerReplying ? `${who}, the speaker, replied to you on "${title}".` : `${who} replied to you on "${title}".`);
        }
      }
      let n = 0;
      for (const [to, message] of recipients) {
        const prefs = (await db.collection('users').doc(to).get()).data();
        if (prefs?.talkReplyAlerts === false) continue;                    // their choice, honoured
        await notify(d, to, { type: uid === talk.speakerUid ? 'talk_speaker_reply' : 'talk_reply', message, talkId }, `talk_${commentId}_${to}`.slice(0, 200));
        n++;
      }
      return { ok: true, notified: n };
    }

    // ── reviewers ──
    case 'admin_list': {
      await requireAdmin(db, uid);
      if (body.kind === 'requests') {
        const s = await db.collection('bridge_contributor_requests').where('status', '==', 'pending').limit(100).get();
        return { items: s.docs.map(x => ({ id: x.id, ...x.data(), createdAt: x.data().createdAt?.toMillis?.() ?? null })) };
      }
      if (body.kind === 'suggestions') {
        const s = await db.collection('bridge_talk_suggestions').where('status', '==', 'new').limit(100).get();
        return { items: s.docs.map(x => ({ id: x.id, ...x.data(), createdAt: x.data().createdAt?.toMillis?.() ?? null })) };
      }
      throw new HttpError(400, 'Unknown list.');
    }
    case 'resolve_request': {
      await requireAdmin(db, uid);
      const target = idOf(body.uid);
      const decision = body.decision === 'approve' ? 'approved' : body.decision === 'decline' ? 'declined' : null;
      if (!decision) throw new HttpError(400, 'Choose approve or decline.');
      const note = oneLine(body.note, LIMITS.note.max);
      if (decision === 'declined' && note.length < LIMITS.note.min) throw new HttpError(400, 'Please give a short, kind reason.');
      const ref = db.collection('bridge_contributor_requests').doc(target);
      const r = (await ref.get()).data();
      if (!r || r.status !== 'pending') throw new HttpError(409, 'That request is not waiting for a decision.');
      await ref.update({ status: decision, note: note || null, decidedAt: FieldValue.serverTimestamp(), decidedBy: uid });
      if (decision === 'approved') await db.collection('users').doc(target).set({ bridgeContributor: true }, { merge: true });
      await notify(d, target, {
        type: 'talk_review',
        message: decision === 'approved' ? 'You can now share Bridge Talks. Open Bridge and choose Share a Bridge Talk.' : `Thank you for your interest in sharing a Bridge Talk. ${note}`,
      });
      return { ok: true, status: decision };
    }
    case 'revoke_contributor': {
      await requireAdmin(db, uid);
      const target = idOf(body.uid);
      await db.collection('users').doc(target).set({ bridgeContributor: false }, { merge: true });
      return { ok: true };
    }
    case 'resolve_suggestion': {
      await requireAdmin(db, uid);
      const id = idOf(body.id);
      await db.collection('bridge_talk_suggestions').doc(id).update({ status: 'reviewed', reviewedBy: uid, reviewedAt: FieldValue.serverTimestamp() });
      return { ok: true };
    }

    default:
      throw new HttpError(400, 'Unknown action.');
  }
}

// ── HTTP handler ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com'];

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

/** HEAD the uploaded file to learn what it really is. Never throws; a failure just means "could not read it". */
export async function inspectFile(url: string): Promise<{ type: string; size: number } | null> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return null;
    return { type: (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(), size: Number(r.headers.get('content-length') ?? 0) };
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(authHeader.split('Bearer ')[1]);
    const result = await runAction({ db: getFirestore(app), now: Date.now(), inspect: inspectFile, bucket: process.env.VITE_FIREBASE_STORAGE_BUCKET ?? process.env.FIREBASE_STORAGE_BUCKET }, decoded.uid, req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (String(err?.code ?? '').startsWith('auth/')) return res.status(401).json({ error: 'Please sign in again.' });
    console.error('bridge-talks error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
