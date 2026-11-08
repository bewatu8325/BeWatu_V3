/**
 * lib/bridgeTalksService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridge Talks, talking to Firebase and to api/bridge-talks.ts. The rules of what a Talk is live in lib/bridgeTalks.ts (testable
 * without a browser); the checks that matter live on the server. This file only moves data.
 *
 * Reads go straight to Firestore (rules show a member only published Talks, a speaker their own, a reviewer what is waiting),
 * and a page of Talks is fetched on demand with a cursor, so the library never loads everything.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, updateDoc, setDoc, deleteDoc, addDoc,
  arrayUnion, arrayRemove, onSnapshot, serverTimestamp, type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, type UploadTask } from 'firebase/storage';
import { db, storage, auth } from './firebase';
import { toTalk, toComment, type Talk, type Comment, LIMITS, extOf } from './bridgeTalks';

// ── the server ───────────────────────────────────────────────────────────────
export async function talksApi<T = any>(body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/bridge-talks', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body) });
  } catch { throw new Error('Could not reach BeWatu. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data?.error ?? 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
  return data;
}
export interface Me { contributor: boolean; admin: boolean; request: { status: 'pending' | 'approved' | 'declined'; note: string | null } | null }
let meCache: { uid: string; at: number; me: Me } | null = null;
/** What this member may do in Bridge. Cached for a minute; pass force after a request or a decision. */
export async function fetchMe(force = false): Promise<Me> {
  const uid = auth.currentUser?.uid ?? '';
  if (!force && meCache && meCache.uid === uid && Date.now() - meCache.at < 60_000) return meCache.me;
  const me = await talksApi<Me>({ action: 'me' });
  meCache = { uid, at: Date.now(), me };
  return me;
}

// ── reading Talks ────────────────────────────────────────────────────────────
export interface Page { items: Talk[]; cursor: QueryDocumentSnapshot<DocumentData> | null; done: boolean }
const toPage = (snap: { docs: QueryDocumentSnapshot<DocumentData>[] }, size: number): Page => ({
  items: snap.docs.map(d => toTalk(d.id, d.data())), cursor: snap.docs[snap.docs.length - 1] ?? null, done: snap.docs.length < size,
});
/** A page of published Talks, newest first. `category` narrows it; `cursor` continues from where the last page ended. */
export async function fetchPublished(o: { category?: string; cursor?: QueryDocumentSnapshot<DocumentData> | null; size?: number } = {}): Promise<Page> {
  const size = o.size ?? 12;
  const parts: any[] = [where('status', '==', 'published')];
  if (o.category) parts.push(where('category', '==', o.category));
  parts.push(orderBy('publishedAt', 'desc'));
  if (o.cursor) parts.push(startAfter(o.cursor));
  parts.push(limit(size));
  return toPage(await getDocs(query(collection(db, 'bridge_talks'), ...parts)), size);
}
export async function fetchBySpeakers(uids: string[], size = 12): Promise<Talk[]> {
  const list = uids.slice(0, 10);   // Firestore's `in` takes ten
  if (!list.length) return [];
  const snap = await getDocs(query(collection(db, 'bridge_talks'), where('status', '==', 'published'), where('speakerUid', 'in', list), orderBy('publishedAt', 'desc'), limit(size)));
  return snap.docs.map(d => toTalk(d.id, d.data()));
}
/** Published Talks by speakers named by their numeric BeWatu id (how follows are recorded). */
export async function fetchBySpeakerIds(ids: number[], size = 24): Promise<Talk[]> {
  const list = ids.slice(0, 10);
  if (!list.length) return [];
  const snap = await getDocs(query(collection(db, 'bridge_talks'), where('status', '==', 'published'), where('speakerId', 'in', list), orderBy('publishedAt', 'desc'), limit(size)));
  return snap.docs.map(d => toTalk(d.id, d.data()));
}
export async function fetchTalk(id: string): Promise<Talk | null> {
  try {
    const s = await getDoc(doc(db, 'bridge_talks', id));
    return s.exists() ? toTalk(s.id, s.data()) : null;
  } catch (e: any) { if (e?.code === 'permission-denied') return null; throw e; }   // not published and not yours: the same as not there
}
export async function fetchMyTalks(uid: string): Promise<Talk[]> {
  const s = await getDocs(query(collection(db, 'bridge_talks'), where('speakerUid', '==', uid), orderBy('updatedAt', 'desc'), limit(50)));
  return s.docs.map(d => toTalk(d.id, d.data()));
}
/** Reviewers: what is waiting, and what is live. */
export async function fetchAdminTalks(kind: 'waiting' | 'published'): Promise<Talk[]> {
  const q = kind === 'waiting'
    ? query(collection(db, 'bridge_talks'), where('status', 'in', ['submitted', 'under_review']), orderBy('updatedAt', 'desc'), limit(50))
    : query(collection(db, 'bridge_talks'), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(50));
  return (await getDocs(q)).docs.map(d => toTalk(d.id, d.data()));
}
export interface ReviewNote { note: string | null; history: { atMs: number; by: string; action: string; note?: string }[] }
export async function fetchReview(id: string): Promise<ReviewNote | null> {
  try { const s = await getDoc(doc(db, 'bridge_talk_reviews', id)); return s.exists() ? { note: s.data().note ?? null, history: s.data().history ?? [] } : null; }
  catch { return null; }
}

// ── likes and saves ──────────────────────────────────────────────────────────
export const setLike = (talkId: string, uid: string, on: boolean) =>
  updateDoc(doc(db, 'bridge_talks', talkId), { likedByUids: on ? arrayUnion(uid) : arrayRemove(uid) });
export async function fetchSavedIds(uid: string): Promise<Set<string>> {
  try { return new Set((await getDocs(collection(db, 'users', uid, 'savedTalks'))).docs.map(d => d.id)); } catch { return new Set(); }
}
export const setSaved = (uid: string, talkId: string, on: boolean) => on
  ? setDoc(doc(db, 'users', uid, 'savedTalks', talkId), { talkId, savedAt: serverTimestamp() })
  : deleteDoc(doc(db, 'users', uid, 'savedTalks', talkId));
/** The Talks a member saved that are still published (a Talk taken down simply stops appearing). */
export async function fetchSavedTalks(uid: string): Promise<Talk[]> {
  const ids = [...(await fetchSavedIds(uid))].slice(0, 60);
  const all = await Promise.all(ids.map(id => fetchTalk(id).catch(() => null)));
  return all.filter((t): t is Talk => !!t && t.status === 'published');
}

// ── the discussion ───────────────────────────────────────────────────────────
export function watchComments(talkId: string, on: (c: Comment[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(query(collection(db, 'bridge_talks', talkId, 'comments'), orderBy('createdAt', 'asc'), limit(400)),
    s => on(s.docs.map(d => toComment(d.id, talkId, d.data()))), e => onError(e as Error));
}
export interface Author { uid: string; name: string; avatarUrl?: string | null; headline?: string | null }
export async function addComment(talkId: string, me: Author, o: { content: string; parent?: Comment | null }): Promise<string> {
  const root = o.parent ? (o.parent.parentId ?? o.parent.id) : null;
  const created = await addDoc(collection(db, 'bridge_talks', talkId, 'comments'), {
    authorUid: me.uid, authorName: me.name.slice(0, 80), authorAvatar: me.avatarUrl ?? null, authorHeadline: (me.headline ?? '').slice(0, 120),
    content: o.content.trim().slice(0, LIMITS.comment), parentId: root, replyToUid: o.parent ? o.parent.authorUid : null, replyToName: o.parent ? o.parent.authorName : null,
    depth: root ? 1 : 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), edited: false, likedByUids: [],
  });
  if (root) talksApi({ action: 'comment_notify', talkId, commentId: created.id }).catch(() => {});   // best effort: the reply is already posted
  return created.id;
}
export const editComment = (talkId: string, id: string, content: string) =>
  updateDoc(doc(db, 'bridge_talks', talkId, 'comments', id), { content: content.trim().slice(0, LIMITS.comment), updatedAt: serverTimestamp(), edited: true });
export const setCommentLike = (talkId: string, id: string, uid: string, on: boolean) =>
  updateDoc(doc(db, 'bridge_talks', talkId, 'comments', id), { likedByUids: on ? arrayUnion(uid) : arrayRemove(uid) });
export const deleteComment = (talkId: string, id: string) => deleteDoc(doc(db, 'bridge_talks', talkId, 'comments', id));

// ── uploading ────────────────────────────────────────────────────────────────
export interface Upload { promise: Promise<string>; cancel: () => void }
/** A resumable upload of a video, thumbnail or image into the speaker's own folder for this Talk. Reports 0 to 100. */
export function uploadAsset(uid: string, session: string, file: File | Blob, name: 'video' | 'thumb', onProgress: (pct: number) => void): Upload {
  const ext = file instanceof File ? extOf(file.name, name === 'video' ? 'mp4' : 'jpg') : 'jpg';
  const task: UploadTask = uploadBytesResumable(ref(storage, `bridge-talks/${uid}/${session}/${name}-${Date.now()}.${ext}`), file, { contentType: file.type });
  const promise = new Promise<string>((resolve, reject) => {
    task.on('state_changed', s => onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, async () => resolve(await getDownloadURL(task.snapshot.ref)));
  });
  return { promise, cancel: () => { task.cancel(); } };
}
/** Reads a chosen video's length and size in the browser. Rejects when the browser cannot decode it (the usual processing failure). */
export function readVideoMeta(file: File, timeoutMs = 12_000): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video'); const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: { durationSec: number; width: number; height: number } | Error) => {
      if (settled) return; settled = true;
      clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); v.load();      // let go of the file, after what was needed has been read
      if (result instanceof Error) reject(result); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => finish(Number.isFinite(v.duration) && v.duration > 0 ? { durationSec: Math.round(v.duration), width: v.videoWidth, height: v.videoHeight } : new Error('unreadable'));
    v.onerror = () => finish(new Error('unreadable'));
    v.src = url;
  });
}
