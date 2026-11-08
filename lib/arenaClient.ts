/**
 * lib/arenaClient.ts
 * Browser side of the Arenas landing page: the open challenges, the member's Arena follows and alert choice
 * (api/arena-interests.ts), and linking a reel to a challenge (api/reel-arena-link.ts).
 */
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import type { ArenaIndustry } from './arenaService';
import { auth, db } from './firebase';
import type { ChallengeLite } from './arenaDiscovery';

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export async function postApi(path: string, body: Record<string, unknown>): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new ApiError('Please sign in again.', 401);
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() }, body: JSON.stringify(body) });
  } catch { throw new ApiError('Could not reach BeWatu. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? 'Something went wrong. Please try again.', res.status);
  return data;
}

/**
 * The active Arena industries, in their display order. Read with no filter or ordering on the server (there are only a few),
 * then filtered and sorted here, so it needs no composite index. (getArenaIndustries filters and orders, and so depends on
 * an index being deployed.)
 */
export async function loadIndustries(): Promise<ArenaIndustry[]> {
  const snap = await getDocs(query(collection(db, 'arena_industries'), limit(60)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ArenaIndustry))
    .filter(i => (i as any).isActive !== false && i.name)
    .sort((a, b) => (Number((a as any).sortOrder) || 0) - (Number((b as any).sortOrder) || 0) || a.name.localeCompare(b.name));
}

/** A date stored as text, a Firestore Timestamp, or {seconds}, as ISO text ('' when there is none). */
const toIso = (v: any): string => {
  if (typeof v === 'string') return v;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return '';
};

/**
 * Live challenges as plain records (the industry is `arenaIndustryId` on newer records and `arenaIndustry` on older ones).
 * One equality filter and no ordering, so it needs no composite index (the page sorts by deadline itself); a query that
 * also ordered by date would silently depend on an index that was never built.
 */
export async function loadChallenges(): Promise<ChallengeLite[]> {
  const snap = await getDocs(query(collection(db, 'arena_challenges'), where('verificationStatus', '==', 'live'), limit(200)));
  return snap.docs.map(d => { const c: any = d.data(); return {
    id: d.id, title: String(c.title ?? ''), description: String(c.description ?? ''), arenaIndustry: String(c.arenaIndustryId ?? c.arenaIndustry ?? ''),
    companyName: c.companyName, skills: Array.isArray(c.skills) ? c.skills : [], difficulty: c.difficulty, tier: c.tier,
    prizeAmount: Number(c.prizeAmount) || 0, prizeType: c.prizeType, deadline: toIso(c.deadline), verificationStatus: c.verificationStatus,
    createdAt: toIso(c.createdAt), liveDate: c.liveDate ? toIso(c.liveDate) : null,
  }; }).filter(c => c.id && c.arenaIndustry);
}

export interface ArenaInterests { industries: string[]; notify: boolean }
export const getArenaInterests = (): Promise<ArenaInterests> => postApi('/api/arena-interests', { action: 'get' });
export const followArenaIndustry = (industry: string, follow: boolean): Promise<ArenaInterests> => postApi('/api/arena-interests', { action: 'follow', industry, follow });
export const setArenaInterests = (industries: string[], notify: boolean): Promise<ArenaInterests> => postApi('/api/arena-interests', { action: 'set', industries, notify });

export type Outcome = 'submitted' | 'shortlisted' | 'winner';
export interface ArenaLink { challengeId: string; challengeTitle: string; industry: string; submissionId: string; contribution: string; skills: string[]; outcome: Outcome; outcomeCheckedAt: number; linkedAt: number }
export interface MyChallenge { challengeId: string; title: string; industry: string; outcome: Outcome }
export const myArenaChallenges = (): Promise<{ challenges: MyChallenge[]; unavailable?: boolean }> => postApi('/api/reel-arena-link', { action: 'mine' });
export const linkReel = (reelId: string, challengeId: string, contribution: string, skills: string[]): Promise<{ arenaLink: ArenaLink }> => postApi('/api/reel-arena-link', { action: 'link', reelId, challengeId, contribution, skills });
export const unlinkReel = (reelId: string): Promise<{ ok: true }> => postApi('/api/reel-arena-link', { action: 'unlink', reelId });
export const refreshReelLink = (reelId: string): Promise<{ arenaLink: ArenaLink | null }> => postApi('/api/reel-arena-link', { action: 'refresh', reelId });
