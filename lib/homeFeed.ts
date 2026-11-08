/**
 * lib/homeFeed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The decisions behind Home, kept free of the UI so they can be tested. Everything works on real records only: a post
 * is shown because of something true about it (you follow or are connected to the author, you share an industry or a skill,
 * it has real engagement), never to fill space, and a recommendation card is placed at most once per feed.
 *
 *   For You    your network, people who share your industry or a skill, and posts that people have really engaged with
 *   Following  people you follow or are connected to
 *
 * There are no organization posts in BeWatu yet (a post is written by a member), so Following is people only today.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { FollowRequest, Job, Post, User } from '../types';

export type FeedTab = 'for_you' | 'following';

/** Engagement (appreciations, comments, shares) that makes a post from outside your circles worth showing: ranking weights match Feed. */
export const ENGAGEMENT_FLOOR = 3;
export const postEngagement = (p: Pick<Post, 'appreciations' | 'comments' | 'shares'>): number =>
  p.appreciations.helpful + p.appreciations.thoughtProvoking + p.appreciations.collaborationReady + p.comments + p.shares;

const norm = (v: unknown) => (typeof v === 'string' ? v : '').trim().toLowerCase();

/** Everyone this member has followed (accepted follow requests they sent). */
export function followingIdsOf(meId: number, followRequests: FollowRequest[] | undefined): Set<number> {
  const out = new Set<number>();
  for (const r of followRequests ?? []) if (r.status === 'accepted' && r.fromUserId === meId) out.add(r.toUserId);
  return out;
}

/** Posts written in a pod belong to the pod, not to the home feed. */
const isGlobal = (p: Post) => !p.circleId;

/** People you follow, people you are connected to, and you. */
export function followingPosts(posts: Post[], meId: number, followingIds: Set<number>, connectedIds: Set<number>): Post[] {
  return posts.filter(p => isGlobal(p) && (p.authorId === meId || followingIds.has(p.authorId) || connectedIds.has(p.authorId)));
}

export interface ForYouContext { me: User; networkIds: Set<number>; followingIds: Set<number>; authorOf: (id: number) => User | undefined }

/**
 * Your network (connections, pod members, people you follow), plus posts from outside it that have a real reason to be here:
 * the author shares your industry or at least one skill, or the post already has real engagement. Members whose profile is
 * private never surface to people outside their network.
 */
export function forYouPosts(posts: Post[], ctx: ForYouContext): Post[] {
  const myIndustry = norm(ctx.me.industry);
  const mySkills = new Set((ctx.me.skills ?? []).map(s => norm(s?.name)).filter(Boolean));
  return posts.filter(p => {
    if (!isGlobal(p)) return false;
    if (p.authorId === ctx.me.id || ctx.networkIds.has(p.authorId) || ctx.followingIds.has(p.authorId)) return true;
    const a = ctx.authorOf(p.authorId);
    if (!a || a.privacySettings?.profileVisibility === 'private' || a.privacySettings?.profileVisibility === 'connections') return false;
    if (myIndustry && norm(a.industry) === myIndustry) return true;
    if ((a.skills ?? []).some(s => mySkills.has(norm(s?.name)))) return true;
    return postEngagement(p) >= ENGAGEMENT_FLOOR;
  });
}

// ── recommendation cards inside the feed ─────────────────────────────────────

export type DiscoveryKind = 'arena' | 'community' | 'opportunities';
export interface DiscoverySlot { kind: DiscoveryKind; after: number }

const POSITIONS: Record<DiscoveryKind, number> = { arena: 3, community: 7, opportunities: 11 };
/** Below this many posts the end of the feed already recommends people, pods and organizations, so no community card is added. */
const COMMUNITY_MIN_POSTS = 7;

/**
 * Where each recommendation goes: after the Nth post, one of each kind at most, never one the member has put away. With a short
 * feed the Arena and opportunity cards sit at its end (before the end-of-feed suggestions) so a newer member still finds them.
 * `available` says which kinds have something real to show.
 */
export function discoverySlots(postCount: number, dismissed: ReadonlySet<DiscoveryKind>, available: Record<DiscoveryKind, boolean>): DiscoverySlot[] {
  const out: DiscoverySlot[] = [];
  (['arena', 'community', 'opportunities'] as DiscoveryKind[]).forEach(kind => {
    if (dismissed.has(kind) || !available[kind]) return;
    if (kind === 'community' && postCount < COMMUNITY_MIN_POSTS) return;
    out.push({ kind, after: Math.min(POSITIONS[kind], postCount) });
  });
  return out;
}

// ── opportunities ────────────────────────────────────────────────────────────

/**
 * Real, open jobs for the "opportunities" card: live, not suspended, not past their expiry. Jobs that mention one of the member's
 * skills come first, then the newest; nothing is invented and an empty list means no card.
 */
export function suggestJobs(jobs: Job[], me: Pick<User, 'skills'>, max = 2, now: number = Date.now()): Job[] {
  const skills = (me.skills ?? []).map(s => norm(s?.name)).filter(s => s.length > 2);
  const t = (iso: unknown) => { const v = typeof iso === 'string' ? Date.parse(iso) : NaN; return Number.isFinite(v) ? v : 0; };
  return jobs
    .filter(j => j.status === 'Active' && (j.verificationStatus === undefined || j.verificationStatus === 'live') && (!j.expiryDate || t(j.expiryDate) === 0 || t(j.expiryDate) > now))
    .map(j => ({ j, hit: skills.some(k => norm(j.title).includes(k) || norm(j.description).includes(k)) ? 1 : 0 }))
    .sort((a, b) => b.hit - a.hit || t(b.j.liveDate) - t(a.j.liveDate) || a.j.id - b.j.id)
    .slice(0, max).map(x => x.j);
}

// ── small per-member memories kept on this device ────────────────────────────

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const DAY = 86_400_000;
export const DISMISS_MS = 7 * DAY;
const DISMISS_KEY = (uid: string) => `bewatuHomeDismissed:${uid}`;
const KINDS: DiscoveryKind[] = ['arena', 'community', 'opportunities'];

/** Recommendation cards the member closed in the last week. */
export function loadDismissed(store: KeyValueStore, uid: string, now: number = Date.now()): Set<DiscoveryKind> {
  const out = new Set<DiscoveryKind>();
  if (!uid) return out;
  try {
    const raw = store.getItem(DISMISS_KEY(uid));
    const x = raw ? JSON.parse(raw) : null;
    if (x && typeof x === 'object') for (const k of KINDS) if (typeof x[k] === 'number' && now - x[k] < DISMISS_MS && x[k] <= now + 60_000) out.add(k);
  } catch { /* unreadable: nothing dismissed */ }
  return out;
}
export function dismissCard(store: KeyValueStore, uid: string, kind: DiscoveryKind, now: number = Date.now()) {
  if (!uid || !KINDS.includes(kind)) return;
  try {
    let x: Record<string, number> = {};
    try { const p = JSON.parse(store.getItem(DISMISS_KEY(uid)) ?? 'null'); if (p && typeof p === 'object') x = p; } catch { /* start fresh */ }
    const next: Record<string, number> = {};
    for (const k of KINDS) if (typeof x[k] === 'number' && now - x[k] < DISMISS_MS) next[k] = x[k];
    next[kind] = now;
    store.setItem(DISMISS_KEY(uid), JSON.stringify(next));
  } catch { /* storage unavailable: it simply comes back next time */ }
}

/**
 * Whether the last visit had something in a row (Sparks, Reels). Home reserves room for a row that was there last time while it
 * loads, so it does not push the feed down; a row that has never had anything reserves nothing (and a new member never sees a
 * placeholder for something that is not coming).
 */
export type RowName = 'sparks' | 'reels';
const HINT_KEY = (uid: string, row: RowName) => `bewatuHomeRow:${uid}:${row}`;
export function readRowHint(store: KeyValueStore, uid: string, row: RowName): boolean {
  if (!uid) return false;
  try { return store.getItem(HINT_KEY(uid, row)) === '1'; } catch { return false; }
}
export function writeRowHint(store: KeyValueStore, uid: string, row: RowName, had: boolean) {
  if (!uid) return;
  try { if (had) store.setItem(HINT_KEY(uid, row), '1'); else store.removeItem(HINT_KEY(uid, row)); } catch { /* ignore */ }
}

/** Which tab to open on: the one you left, if it is one of ours. */
export const TAB_KEY = 'bewatuHomeTab';
export function parseTab(v: unknown): FeedTab { return v === 'following' ? 'following' : 'for_you'; }
