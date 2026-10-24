// lib/engagementGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Weekly-active gating for Factory, the investor tier, and the recruiter
// upgrade path. Only accounts created after this shipped carry
// engagementGateApplies — every pre-existing account is ungated by default,
// which is the retroactive-scope guarantee this whole feature depends on.
// ─────────────────────────────────────────────────────────────────────────────

import type { User } from '../types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isWeeklyActive(user: Pick<User, 'lastActiveAt'>): boolean {
  if (!user.lastActiveAt) return false;
  return Date.now() - new Date(user.lastActiveAt).getTime() < WEEK_MS;
}

// "lastActiveAt within 7 days" alone is trivially true the instant a brand
// new account is stamped for the first time -- every signup would clear
// the gate on their very first page load. Account age is what actually
// makes this "weekly active" rather than "has ever opened the app": the
// account itself must be at least a week old, on top of having been
// recently active. createdAt is a Firestore Timestamp (or the
// serverTimestamp() sentinel, right after signup, before it resolves) —
// either case is treated as "too new" by design, the safe default.
function accountAgeMs(user: Pick<User, 'createdAt'>): number {
  const createdAt: any = user.createdAt;
  const createdMs = createdAt?.toDate?.()?.getTime?.();
  if (!Number.isFinite(createdMs)) return 0;
  return Date.now() - createdMs;
}

export function isEngagementGated(
  user: Pick<User, 'lastActiveAt' | 'engagementGateApplies' | 'createdAt'>
): boolean {
  if (user.engagementGateApplies !== true) return false;
  return accountAgeMs(user) < WEEK_MS || !isWeeklyActive(user);
}

export const ENGAGEMENT_GATE_TOOLTIP = 'Unlocks after a week of activity on BeWatu';
