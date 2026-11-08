/**
 * lib/bridgeTalks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridge Talks, the browser side without any UI or Firebase in it, so it can be tested: the categories, the lifecycle of a Talk,
 * what must be filled in before it can be submitted, how a Talk is described, searched, ranked and related to others, how a
 * discussion is threaded, how far someone has really watched, and where a Talk lives on the web.
 *
 * api/bridge-talks.ts is the only thing that changes a Talk's status or publishes it, and it re-checks everything here that
 * matters (it cannot import this file, so the limits and the transition table are repeated there and tested against each other).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { deviceStore, type KeyValueStore } from './invitations';

// ── categories (add one here and in api/bridge-talks.ts; an old Talk whose category is removed still shows) ──
export const CATEGORIES: { id: string; label: string }[] = [
  { id: 'leadership', label: 'Leadership' },
  { id: 'career', label: 'Career Development' },
  { id: 'entrepreneurship', label: 'Entrepreneurship' },
  { id: 'technology', label: 'Technology & Innovation' },
  { id: 'finance', label: 'Finance & Business' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'engineering', label: 'Engineering & Manufacturing' },
  { id: 'wisdom', label: 'Life & Professional Wisdom' },
];
export const categoryLabel = (id: string | null | undefined): string => {
  if (!id) return '';
  return CATEGORIES.find(c => c.id === id)?.label ?? id.replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
};

// ── limits ──
export const LIMITS = {
  title: 100, summary: 400, experience: 300, takeaway: 140, takeaways: 3, question: 200, transcript: 30_000, captions: 120_000,
  comment: 2000, maxReplyDepth: 1,
  /** A Talk is a few minutes, one lesson. These are guidance, not a wall: only the outer bounds are enforced. */
  recommendedMinSec: 8 * 60, recommendedMaxSec: 15 * 60, minSec: 30, maxSec: 45 * 60,
  maxVideoBytes: 500 * 1024 * 1024, maxImageBytes: 5 * 1024 * 1024,
  videoTypes: ['video/mp4', 'video/quicktime', 'video/webm'] as string[],
  imageTypes: ['image/jpeg', 'image/png', 'image/webp'] as string[],
};

// ── the lifecycle ──
export type TalkStatus = 'draft' | 'submitted' | 'under_review' | 'published' | 'rejected' | 'unpublished' | 'archived';
export type Actor = 'speaker' | 'admin';
export type Visibility = 'members' | 'public';
export const STATUS_LABEL: Record<TalkStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', published: 'Published', rejected: 'Not accepted', unpublished: 'Unpublished', archived: 'Archived',
};
export const STATUS_HINT: Record<TalkStatus, string> = {
  draft: 'Only you can see this.',
  submitted: 'Waiting for a BeWatu reviewer.',
  under_review: 'A BeWatu reviewer is watching it now.',
  published: 'Members can watch it in Bridge.',
  rejected: 'This one was not accepted. You can revise it and submit it again.',
  unpublished: 'Hidden from Bridge. Only you and BeWatu can see it.',
  archived: 'Kept for your records. Not shown anywhere.',
};
/** Who may move a Talk from one status to another. The server enforces the same table. */
export const TRANSITIONS: Record<TalkStatus, Partial<Record<TalkStatus, Actor[]>>> = {
  draft:        { submitted: ['speaker'], archived: ['speaker', 'admin'] },
  submitted:    { draft: ['speaker', 'admin'], under_review: ['admin'], published: ['admin'], rejected: ['admin'], archived: ['speaker', 'admin'] },
  under_review: { draft: ['admin'], published: ['admin'], rejected: ['admin'], archived: ['admin'] },
  published:    { unpublished: ['speaker', 'admin'], archived: ['admin'] },
  rejected:     { draft: ['speaker'], archived: ['speaker', 'admin'] },
  unpublished:  { published: ['admin'], draft: ['speaker'], archived: ['speaker', 'admin'] },
  archived:     {},
};
export const canMove = (from: TalkStatus, to: TalkStatus, actor: Actor): boolean => !!TRANSITIONS[from]?.[to]?.includes(actor);
/** Fields of a Talk the speaker may still change. A Talk that is waiting, live or archived is not edited in place. */
export const speakerCanEdit = (s: TalkStatus) => s === 'draft';

// ── a Talk ──
export interface Talk {
  id: string; speakerUid: string; speakerId: number | null; speakerName: string; speakerHeadline: string; speakerAvatar: string | null; speakerUsername: string | null;
  title: string; summary: string; experience: string; category: string; keyTakeaways: string[]; discussionPrompt: string; transcript: string; captionsVtt: string;
  durationSec: number; videoUrl: string; thumbnailUrl: string | null; visibility: Visibility; publicConsent: boolean;
  status: TalkStatus; publishedAt: number | null; createdAt: number; updatedAt: number; likedByUids: string[];
}
const ms = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return null;
};
/** A Firestore document, as a Talk. Tolerates a missing field (an older or hand-edited document) instead of throwing. */
export function toTalk(id: string, d: Record<string, any>): Talk {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id, speakerUid: str(d.speakerUid), speakerId: typeof d.speakerId === 'number' ? d.speakerId : null, speakerName: str(d.speakerName) || 'BeWatu member',
    speakerHeadline: str(d.speakerHeadline), speakerAvatar: str(d.speakerAvatar) || null, speakerUsername: str(d.speakerUsername) || null,
    title: str(d.title), summary: str(d.summary), experience: str(d.experience), category: str(d.category),
    keyTakeaways: Array.isArray(d.keyTakeaways) ? d.keyTakeaways.filter((x: unknown) => typeof x === 'string' && x) : [],
    discussionPrompt: str(d.discussionPrompt), transcript: str(d.transcript), captionsVtt: str(d.captionsVtt),
    durationSec: typeof d.durationSec === 'number' ? d.durationSec : 0, videoUrl: str(d.videoUrl), thumbnailUrl: str(d.thumbnailUrl) || null,
    visibility: d.visibility === 'public' ? 'public' : 'members', publicConsent: d.publicConsent === true,
    status: (['draft', 'submitted', 'under_review', 'published', 'rejected', 'unpublished', 'archived'] as string[]).includes(d.status) ? d.status : 'draft',
    publishedAt: ms(d.publishedAt), createdAt: ms(d.createdAt) ?? 0, updatedAt: ms(d.updatedAt) ?? 0,
    likedByUids: Array.isArray(d.likedByUids) ? d.likedByUids.filter((x: unknown) => typeof x === 'string') : [],
  };
}

// ── what a member may do ──
export interface MemberLike { isPlatformAdmin?: boolean; bridgeContributor?: boolean }
export const canContribute = (u: MemberLike | null | undefined): boolean => !!u && (u.bridgeContributor === true || u.isPlatformAdmin === true);

// ── words ──
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
/** 3:05 or 1:02:09, for a seek bar. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
/** A nudge when the length is outside what most Talks are. Never a blocker. */
export function lengthNote(sec: number): string | null {
  if (!sec) return null;
  if (sec < LIMITS.recommendedMinSec) return 'Most Talks run 8 to 15 minutes. A shorter one is fine if it makes one clear point.';
  if (sec > LIMITS.recommendedMaxSec) return 'Most Talks run 8 to 15 minutes. If this covers more than one lesson, consider splitting it.';
  return null;
}
export function ago(then: number | null, now: number = Date.now()): string {
  if (!then) return '';
  const d = Math.max(0, now - then), m = Math.floor(d / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 330 ? 'numeric' : undefined });
}

// ── the form ──
export interface Draft {
  title: string; summary: string; experience: string; category: string; keyTakeaways: string[]; discussionPrompt: string;
  transcript: string; captionsVtt: string; visibility: Visibility; publicConsent: boolean;
  videoUrl: string; thumbnailUrl: string | null; durationSec: number;
}
export const emptyDraft = (): Draft => ({
  title: '', summary: '', experience: '', category: '', keyTakeaways: [], discussionPrompt: '', transcript: '', captionsVtt: '',
  visibility: 'members', publicConsent: false, videoUrl: '', thumbnailUrl: null, durationSec: 0,
});
export type Field = keyof Draft;
/** What is missing, by field, in plain words. `forSubmit` adds what a reviewer needs; saving a draft needs almost nothing. */
export function problems(d: Draft, forSubmit: boolean): Partial<Record<Field, string>> {
  const p: Partial<Record<Field, string>> = {};
  if (d.title.length > LIMITS.title) p.title = `Keep the title to ${LIMITS.title} characters.`;
  if (d.summary.length > LIMITS.summary) p.summary = `Keep the summary to ${LIMITS.summary} characters.`;
  if (d.experience.length > LIMITS.experience) p.experience = `Keep this to ${LIMITS.experience} characters.`;
  if (d.keyTakeaways.length > LIMITS.takeaways) p.keyTakeaways = `At most ${LIMITS.takeaways} takeaways.`;
  if (d.keyTakeaways.some(t => t.length > LIMITS.takeaway)) p.keyTakeaways = `Keep each takeaway to ${LIMITS.takeaway} characters.`;
  if (d.discussionPrompt.length > LIMITS.question) p.discussionPrompt = `Keep the question to ${LIMITS.question} characters.`;
  if (d.captionsVtt && !/^﻿?WEBVTT/.test(d.captionsVtt)) p.captionsVtt = 'Captions must be a WebVTT (.vtt) file.';
  if (d.captionsVtt.length > LIMITS.captions) p.captionsVtt = 'That captions file is too large.';
  if (d.durationSec && (d.durationSec < LIMITS.minSec || d.durationSec > LIMITS.maxSec)) p.durationSec = `A Talk is between ${formatDuration(LIMITS.minSec)} and ${formatDuration(LIMITS.maxSec)}.`;
  if (d.visibility === 'public' && !d.publicConsent) p.publicConsent = 'Confirm that you are happy for anyone with the link to see this Talk.';
  if (forSubmit) {
    if (!d.videoUrl) p.videoUrl = 'Upload your video first.';
    if (!d.title.trim()) p.title = 'Give your Talk a title.';
    if (!d.summary.trim()) p.summary = 'Add a short summary so members know what they will learn.';
    if (!d.category) p.category = 'Choose a topic.';
    if (!d.experience.trim()) p.experience = 'Say what experience you are speaking from.';
    if (!d.durationSec) p.durationSec = 'We could not read the length of your video.';
  }
  return p;
}
export const firstProblem = (p: Partial<Record<Field, string>>): string | null => Object.values(p).find(Boolean) ?? null;

/** Checks a file chosen for upload. Returns the reason it cannot be used, or null. */
export function fileProblem(f: { type: string; size: number }, kind: 'video' | 'image'): string | null {
  if (kind === 'video') {
    if (!LIMITS.videoTypes.includes(f.type)) return 'Use an MP4, MOV or WebM video. An MP4 (H.264) plays everywhere.';
    if (f.size > LIMITS.maxVideoBytes) return `That video is ${Math.round(f.size / 1048576)} MB. The limit is ${LIMITS.maxVideoBytes / 1048576} MB; export it at a lower bitrate and try again.`;
  } else {
    if (!LIMITS.imageTypes.includes(f.type)) return 'Use a JPEG, PNG or WebP image.';
    if (f.size > LIMITS.maxImageBytes) return `That image is too large. The limit is ${LIMITS.maxImageBytes / 1048576} MB.`;
  }
  return f.size > 0 ? null : 'That file is empty.';
}
export const extOf = (name: string, fallback: string) => (name.split('.').pop() || fallback).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || fallback;

// ── discovery ──
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
/** Every word typed must start a word in the title, speaker, topic, summary or takeaways. */
export function matches(t: Talk, query: string): boolean {
  const q = words(query);
  if (!q.length) return true;
  const hay = words([t.title, t.speakerName, t.speakerHeadline, categoryLabel(t.category), t.summary, t.keyTakeaways.join(' ')].join(' '));
  return q.every(w => hay.some(h => h.startsWith(w)));
}
export interface RankContext { followedUids: ReadonlySet<string>; interests: readonly string[]; now?: number }
/** Why a Talk is shown for you: people you follow, topics you have, and how fresh it is. Never how often it was viewed. */
export function relevance(t: Talk, ctx: RankContext): number {
  const now = ctx.now ?? Date.now();
  let score = 0;
  if (ctx.followedUids.has(t.speakerUid)) score += 50;
  const want = new Set(ctx.interests.flatMap(words));
  const have = words([categoryLabel(t.category), t.title, t.speakerHeadline].join(' '));
  score += Math.min(3, have.filter(w => w.length > 3 && want.has(w)).length) * 12;
  const ageDays = Math.max(0, (now - (t.publishedAt ?? t.createdAt)) / 86_400_000);
  score += Math.max(0, 20 - ageDays / 3);   // fresh for about two months
  return score;
}
export type SortMode = 'newest' | 'relevant';
export function sortTalks(list: readonly Talk[], mode: SortMode, ctx: RankContext): Talk[] {
  const byNew = (a: Talk, b: Talk) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt);
  if (mode === 'newest') return [...list].sort(byNew);
  return [...list].sort((a, b) => relevance(b, ctx) - relevance(a, ctx) || byNew(a, b));
}
/** Why this one is here, in a few words, when there is a real reason. */
export function reasonFor(t: Talk, ctx: RankContext): string | null {
  if (ctx.followedUids.has(t.speakerUid)) return `From ${t.speakerName.split(' ')[0]}, who you follow`;
  const want = new Set(ctx.interests.flatMap(words));
  if (words(categoryLabel(t.category)).some(w => w.length > 3 && want.has(w))) return `Because you are interested in ${categoryLabel(t.category)}`;
  return null;
}
export function relatedTalks(current: Talk, all: readonly Talk[], max = 4): Talk[] {
  const others = all.filter(t => t.id !== current.id && t.status === 'published');
  const score = (t: Talk) => (t.category === current.category ? 2 : 0) + (t.speakerUid === current.speakerUid ? 1 : 0);
  return others.map(t => ({ t, s: score(t) })).filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.t.publishedAt ?? 0) - (a.t.publishedAt ?? 0)).slice(0, max).map(x => x.t);
}
/** Generational Pods whose own words overlap the Talk's topic. A Pod is only ever suggested, never joined for anyone. */
export function relatedPods<P extends { id: string; name?: string; title?: string; description?: string; purpose?: string; topic?: string }>(talk: Talk, pods: readonly P[], max = 2): P[] {
  const want = new Set(words([categoryLabel(talk.category), talk.title, talk.keyTakeaways.join(' ')].join(' ')).filter(w => w.length > 3));
  return pods.map(p => ({ p, s: words([p.name, p.title, p.description, p.purpose, p.topic].filter(Boolean).join(' ')).filter(w => want.has(w)).length }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map(x => x.p);
}

// ── the discussion ──
export interface Comment {
  id: string; talkId: string; authorUid: string; authorName: string; authorAvatar: string | null; authorHeadline: string;
  content: string; parentId: string | null; replyToUid: string | null; replyToName: string | null; depth: number;
  createdAt: number; updatedAt: number; edited: boolean; likedByUids: string[];
}
export function toComment(id: string, talkId: string, d: Record<string, any>): Comment {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id, talkId, authorUid: str(d.authorUid), authorName: str(d.authorName) || 'BeWatu member', authorAvatar: str(d.authorAvatar) || null, authorHeadline: str(d.authorHeadline),
    content: str(d.content), parentId: str(d.parentId) || null, replyToUid: str(d.replyToUid) || null, replyToName: str(d.replyToName) || null,
    depth: d.depth === 1 ? 1 : 0, createdAt: ms(d.createdAt) ?? Date.now(), updatedAt: ms(d.updatedAt) ?? ms(d.createdAt) ?? Date.now(), edited: d.edited === true,
    likedByUids: Array.isArray(d.likedByUids) ? d.likedByUids.filter((x: unknown) => typeof x === 'string') : [],
  };
}
export interface ThreadNode { comment: Comment | null; /** null when the comment was removed but replies remain */ id: string; replies: Comment[]; isSpeaker: boolean }
/**
 * One level of replies. Top level: newest first, so what was just written sits by the composer. Replies: oldest first, so they
 * read as a conversation. A reply to a reply is shown in the same group. If a comment was removed, its replies stay under a
 * "removed" stub rather than disappearing or floating.
 */
export function buildThread(comments: readonly Comment[], speakerUid: string): ThreadNode[] {
  const tops = comments.filter(c => !c.parentId);
  const byParent = new Map<string, Comment[]>();
  for (const c of comments) if (c.parentId) { const g = byParent.get(c.parentId) ?? []; g.push(c); byParent.set(c.parentId, g); }
  const nodes: ThreadNode[] = tops.sort((a, b) => b.createdAt - a.createdAt)
    .map(c => ({ comment: c, id: c.id, replies: (byParent.get(c.id) ?? []).sort((a, b) => a.createdAt - b.createdAt), isSpeaker: c.authorUid === speakerUid }));
  const known = new Set(tops.map(c => c.id));
  for (const [pid, rs] of byParent) if (!known.has(pid)) nodes.push({ comment: null, id: pid, replies: rs.sort((a, b) => a.createdAt - b.createdAt), isSpeaker: false });
  return nodes;
}
/** The top-level comment a reply belongs to, however deep the one replied to is. */
export const threadRoot = (target: Comment): string => target.parentId ?? target.id;
export const commentProblem = (text: string): string | null => {
  const t = text.trim();
  if (!t) return 'Write something first.';
  return t.length > LIMITS.comment ? `Keep it to ${LIMITS.comment} characters.` : null;
};

// ── watching ──
export const MILESTONES = [25, 50, 75] as const;
/**
 * Counts time actually watched, not where the bar was dragged to: only small forward steps of the clock count, so skipping to the
 * end does not complete a Talk. update() returns the milestones newly reached (25, 50, 75) and 'completed' at 95%, each once.
 */
export class WatchTracker {
  private last: number | null = null; private watched = 0; private fired = new Set<string>();
  constructor(private duration: number) {}
  seek() { this.last = null; }
  update(t: number): (number | 'completed')[] {
    if (!this.duration) return [];
    if (this.last !== null) { const d = t - this.last; if (d > 0 && d <= 2.5) this.watched += d; }
    this.last = t;
    const pct = (this.watched / this.duration) * 100, out: (number | 'completed')[] = [];
    for (const m of MILESTONES) if (pct >= m && !this.fired.has(String(m))) { this.fired.add(String(m)); out.push(m); }
    if (pct >= 95 && !this.fired.has('done')) { this.fired.add('done'); out.push('completed'); }
    return out;
  }
  get percent() { return this.duration ? Math.min(100, Math.round((this.watched / this.duration) * 100)) : 0; }
}

const POS_KEY = (id: string) => `bewatuTalkPos:${id}`;
export function savePosition(id: string, t: number, duration: number, store: KeyValueStore = deviceStore(), now: number = Date.now()) {
  try {
    if (t < 10 || t > duration - 15) store.removeItem(POS_KEY(id));      // barely started, or as good as finished: nothing to resume
    else store.setItem(POS_KEY(id), JSON.stringify({ t: Math.floor(t), at: now }));
  } catch { /* storage may be unavailable */ }
}
/** Where to offer to pick up, or null. Forgotten after 60 days. */
export function loadPosition(id: string, duration: number, store: KeyValueStore = deviceStore(), now: number = Date.now()): number | null {
  try {
    const raw = store.getItem(POS_KEY(id));
    if (!raw) return null;
    const x = JSON.parse(raw);
    if (typeof x?.t !== 'number' || typeof x?.at !== 'number' || now - x.at > 60 * 86_400_000 || x.t < 10 || x.t > duration - 15) return null;
    return x.t;
  } catch { return null; }
}

// ── addresses and sharing ──
export const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const talkPath = (id: string) => `/community/bridge/talks/${id}`;
export const publicTalkPath = (id: string) => `/talks/${id}`;
/** The link to hand someone: a page anyone can open if the speaker allowed it, otherwise the in-app page (members sign in). */
export function shareUrl(t: Pick<Talk, 'id' | 'visibility' | 'publicConsent' | 'status'>, origin: string): string {
  const open = t.status === 'published' && t.visibility === 'public' && t.publicConsent;
  return origin + (open ? publicTalkPath(t.id) : talkPath(t.id));
}
export const shareText = (t: Pick<Talk, 'title' | 'speakerName'>) => `"${t.title}", a Bridge Talk by ${t.speakerName} on BeWatu`;

// ── the discussion's name for the speaker: shown, never promised ──
export const SPEAKER_LABEL = 'Speaker';
