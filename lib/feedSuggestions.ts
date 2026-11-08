/**
 * lib/feedSuggestions.ts
 * What the end of the feed recommends, chosen from real records only: people you are not yet connected to (those in
 * your own industry first), and pods you are not in that anyone may ask to join (largest first).
 */
import type { Circle, User } from '../types';

/** People who share something real with you (industry), nearest first. Anyone else only fills remaining places. */
export function suggestPeople(users: User[], me: User, connected: Set<number>, max = 3): User[] {
  const mine = (me.industry ?? '').trim().toLowerCase();
  return users
    .filter(u => u.id !== me.id && !connected.has(u.id) && u.name)
    .map(u => ({ u, shared: mine && (u.industry ?? '').trim().toLowerCase() === mine ? 1 : 0 }))
    .sort((a, b) => b.shared - a.shared || (b.u.reputation ?? 0) - (a.u.reputation ?? 0))
    .slice(0, max).map(x => x.u);
}

export function suggestPods(circles: Circle[], me: User, max = 3): Circle[] {
  return circles
    .filter(c => !c.members.includes(me.id) && c.visibility !== 'invite' && c.name)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, max);
}
