/**
 * lib/arenaClient.ts
 * Browser side of the Arenas landing page: the open challenges, the member's Arena follows and alert choice
 * (api/arena-interests.ts), and linking a reel to a challenge (api/reel-arena-link.ts).
 */
import { auth } from './firebase';
import { getAllArenaChallenges } from './arenaService';
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

/** Live challenges as plain records (the industry is `arenaIndustryId` on newer records and `arenaIndustry` on older ones). */
export async function loadChallenges(): Promise<ChallengeLite[]> {
  const list = await getAllArenaChallenges(100);
  return list.map((c: any) => ({
    id: c.id, title: String(c.title ?? ''), description: String(c.description ?? ''), arenaIndustry: String(c.arenaIndustryId ?? c.arenaIndustry ?? ''),
    companyName: c.companyName, skills: Array.isArray(c.skills) ? c.skills : [], difficulty: c.difficulty, tier: c.tier,
    prizeAmount: Number(c.prizeAmount) || 0, prizeType: c.prizeType, deadline: String(c.deadline ?? ''), verificationStatus: c.verificationStatus,
    createdAt: c.createdAt, liveDate: c.liveDate ?? null,
  })).filter(c => c.id && c.arenaIndustry);
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
