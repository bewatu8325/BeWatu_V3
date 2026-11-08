/**
 * lib/createActions.ts
 * What the Create action offers, for this member, on this page. Everything is always one tap away; the action that fits
 * where you are comes first and is marked as the suggestion. "Post an Arena Challenge" appears only for members who
 * are authorized to post one (a recruiter whose organization is verified for at least one Arena industry); the flow itself
 * still checks eligibility for the chosen industry.
 */
import { navKeyFor } from './routes';

export type CreateActionId = 'post' | 'reel' | 'pod' | 'project' | 'challenge';

export interface CreateAction { id: CreateActionId; label: string; hint: string; suggested: boolean }

const ALL: Record<CreateActionId, { label: string; hint: string }> = {
  post:      { label: 'Write a Post',            hint: 'Share a thought, a link or a lesson' },
  reel:      { label: 'Upload a Reel',           hint: 'Show a skill in 30 to 90 seconds' },
  pod:       { label: 'Start a Pod',             hint: 'Bring people together around a goal' },
  project:   { label: 'Start a Project',         hint: 'Build something with a team, from idea to launch' },
  challenge: { label: 'Post an Arena Challenge', hint: 'Put a real problem in front of professionals' },
};

export function canPostChallenge(user: { isRecruiter?: boolean } | null | undefined, company: { verifiedIndustries?: string[] } | null | undefined): boolean {
  return !!user?.isRecruiter && Array.isArray(company?.verifiedIndustries) && company!.verifiedIndustries!.length > 0;
}

export function createActions(ctx: { view: string; canPostChallenge: boolean }): CreateAction[] {
  const ids: CreateActionId[] = ['post', 'reel', 'pod', 'project', ...(ctx.canPostChallenge ? ['challenge' as const] : [])];
  const nav = navKeyFor(ctx.view);
  const fit: CreateActionId =
    nav === 'prove' ? 'reel'
    : nav === 'arenas' ? (ctx.canPostChallenge ? 'challenge' : 'pod')
    : nav === 'community' ? 'pod'
    : 'post';
  const ordered = [fit, ...ids.filter(i => i !== fit)];
  return ordered.map((id, i) => ({ id, ...ALL[id], suggested: i === 0 }));
}
