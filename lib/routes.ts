/**
 * lib/routes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The address of each major destination, and the way back from an address to a destination. Used for deep links, the
 * browser's Back and Forward buttons, and links in notifications.
 *
 *   /                          Home
 *   /community                 Community: connections       /community/pods   Pods       /community/bridge  Bridge
 *   /arenas                    Arenas landing               /arenas/<industry>            one industry's Arena
 *   /arenas/challenge/<id>     one challenge
 *   /prove                     Prove (reels)                /prove?tab=following|mine
 *   /discover                  Discover hub                 /discover/people              People
 *   /messages  /jobs  /organizations
 *
 * Views without an address (a profile, Pricing, the AI assistant...) are shown at "/" and are still restored by Back, because
 * the browser entry also remembers which view it was. Addresses that mean something else (/be/<name>, /terms, /privacy,
 * /community-guidelines, /login, /register, /endorse/...) are never read as destinations.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { View } from '../types';

export const ARENA_INDUSTRY_VIEW = 'ARENA_INDUSTRY';
export const ARENA_CHALLENGE_VIEW = 'ARENA_CHALLENGE';

export interface AppLocation {
  /** A View value, or ARENA_INDUSTRY / ARENA_CHALLENGE. */
  view: string;
  industry?: string;
  challengeId?: string;
}

const STATIC: Record<string, string> = {
  [View.Feed]: '/',
  [View.Connections]: '/community',
  [View.Circles]: '/community/pods',
  [View.Bridge]: '/community/bridge',
  [View.Arenas]: '/arenas',
  [View.Prove]: '/prove',
  [View.Discover]: '/discover',
  [View.People]: '/discover/people',
  [View.Messaging]: '/messages',
  [View.Jobs]: '/jobs',
  [View.Companies]: '/organizations',
};
const BY_PATH = new Map<string, string>(Object.entries(STATIC).map(([view, path]) => [path, view]));
// "/companies" is the directory's older address and still opens it.
BY_PATH.set('/companies', View.Companies);

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The path for a location ("/" when that view has no address of its own). */
export function pathFor(loc: AppLocation): string {
  if (loc.view === ARENA_CHALLENGE_VIEW && loc.challengeId && SAFE_ID.test(loc.challengeId)) return '/arenas/challenge/' + loc.challengeId;
  if (loc.view === ARENA_INDUSTRY_VIEW && loc.industry && SAFE_ID.test(loc.industry)) return '/arenas/' + loc.industry;
  return STATIC[loc.view] ?? '/';
}

/** The destination an address names, or null when it is not one (including "/"). */
export function parsePath(pathname: string): AppLocation | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '') return null;
  const direct = BY_PATH.get(path);
  if (direct) return { view: direct };
  let m = path.match(/^\/arenas\/challenge\/([^/]+)$/);
  if (m && SAFE_ID.test(m[1])) return { view: ARENA_CHALLENGE_VIEW, challengeId: m[1] };
  m = path.match(/^\/arenas\/([^/]+)$/);
  if (m && SAFE_ID.test(m[1]) && m[1] !== 'challenge') return { view: ARENA_INDUSTRY_VIEW, industry: m[1] };
  return null;
}

/** Views that count as the Community destination in navigation. */
export const COMMUNITY_VIEWS: string[] = [View.Connections, View.Circles, View.Bridge];
/** Views that count as the Discover destination in navigation. */
export const DISCOVER_VIEWS: string[] = [View.Discover, View.People, View.Jobs, View.Companies];
/** Views that count as the Arenas destination in navigation. */
export const ARENA_VIEWS: string[] = [View.Arenas, ARENA_INDUSTRY_VIEW, ARENA_CHALLENGE_VIEW];

/** Which top-level navigation item a view belongs under. */
export type NavKey = 'home' | 'community' | 'arenas' | 'prove' | 'discover' | 'messages' | 'you' | null;
export function navKeyFor(view: string): NavKey {
  if (view === View.Feed) return 'home';
  if (COMMUNITY_VIEWS.includes(view)) return 'community';
  if (ARENA_VIEWS.includes(view)) return 'arenas';
  if (view === View.Prove) return 'prove';
  if (DISCOVER_VIEWS.includes(view)) return 'discover';
  if (view === View.Messaging) return 'messages';
  if (view === View.Profile) return 'you';
  return null;
}
