/**
 * lib/createActions.ts
 * What the Create action offers, for this member, on this page. Everything is always one tap away; the action that fits
 * where you are comes first and is marked as the suggestion. "Post an Arena Challenge" appears only for members who
 * are authorized to post one (a recruiter whose organization is verified for at least one Arena industry); the flow itself
 * still checks eligibility for the chosen industry.
 */
import { navKeyFor, BRIDGE_TALKS_VIEW, BRIDGE_TALK_VIEW } from './routes';

export type CreateActionId = 'post' | 'wisdom' | 'reel' | 'spark' | 'pod' | 'project' | 'invite' | 'talk' | 'challenge';

export interface CreateAction { id: CreateActionId; label: string; hint: string; suggested: boolean }

const ALL: Record<CreateActionId, { label: string; hint: string }> = {
  post:      { label: 'Post an Update',          hint: 'Share a thought, an article link or a question' },
  wisdom:    { label: 'Share Wisdom',            hint: 'Pass on a hard-won career lesson' },
  reel:      { label: 'Upload a Prove Reel',     hint: 'Show a skill in 30 to 90 seconds' },
  spark:     { label: 'Share a Spark',           hint: 'A win, insight or goal that lasts 48 hours' },
  pod:       { label: 'Start a Pod',             hint: 'Bring people together around a goal' },
  project:   { label: 'Start a Project',         hint: 'Build something with a team, from idea to launch' },
  talk:      { label: 'Share a Bridge Talk',     hint: 'A short video of a lesson you learned' },
  invite:    { label: 'Invite your people',      hint: 'Bring colleagues you trust onto BeWatu' },
  challenge: { label: 'Post an Arena Challenge', hint: 'Put a real problem in front of professionals' },
};

export function canPostChallenge(user: { isRecruiter?: boolean } | null | undefined, company: { verifiedIndustries?: string[] } | null | undefined): boolean {
  return !!user?.isRecruiter && Array.isArray(company?.verifiedIndustries) && company!.verifiedIndustries!.length > 0;
}

export function createActions(ctx: { view: string; canPostChallenge: boolean }): CreateAction[] {
  const ids: CreateActionId[] = ['post', 'wisdom', 'talk', 'reel', 'spark', 'pod', 'project', 'invite', ...(ctx.canPostChallenge ? ['challenge' as const] : [])];
  const nav = navKeyFor(ctx.view);
  const fit: CreateActionId =
    nav === 'prove' ? 'reel'
    : nav === 'arenas' ? (ctx.canPostChallenge ? 'challenge' : 'pod')
    : ctx.view === 'BRIDGE' || ctx.view === BRIDGE_TALKS_VIEW || ctx.view === BRIDGE_TALK_VIEW ? 'talk'
    : nav === 'community' ? 'pod'
    : 'post';
  const ordered = [fit, ...ids.filter(i => i !== fit)];
  return ordered.map((id, i) => ({ id, ...ALL[id], suggested: i === 0 }));
}
