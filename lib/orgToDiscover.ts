/**
 * lib/orgToDiscover.ts
 * The list logic behind "Organizations to discover": what is shown, what waits in line, and how the list refills after one is
 * followed. Pure, so the rules (never someone you follow, never twice, keep it full when there is more) are tested.
 */
export interface Suggestion { id: string }

/** Keep only organizations that are not followed and not already seen, in order, each at most once. */
export function usable<T extends Suggestion>(incoming: readonly T[], followed: ReadonlySet<string>, exclude: ReadonlySet<string> = new Set()): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const s of incoming) {
    if (!s?.id || followed.has(s.id) || exclude.has(s.id) || seen.has(s.id)) continue;
    seen.add(s.id); out.push(s);
  }
  return out;
}

/** Fill the visible list up to `size` from the front of the queue. Nothing in either list is followed or repeated. */
export function refill<T extends Suggestion>(visible: readonly T[], queue: readonly T[], followed: ReadonlySet<string>, size: number): { visible: T[]; queue: T[] } {
  const shownIds = new Set<string>();
  const v: T[] = [];
  for (const s of visible) if (!followed.has(s.id) && !shownIds.has(s.id)) { shownIds.add(s.id); v.push(s); }
  const q: T[] = [];
  for (const s of queue) {
    if (followed.has(s.id) || shownIds.has(s.id)) continue;
    if (v.length < size) { shownIds.add(s.id); v.push(s); } else { shownIds.add(s.id); q.push(s); }
  }
  return { visible: v.slice(0, size), queue: [...v.slice(size), ...q] };
}

/** Put an organization back where it was (Undo), pushing the last one down into the queue so the list stays the same length. */
export function restoreAt<T extends Suggestion>(visible: readonly T[], queue: readonly T[], item: T, index: number, size: number): { visible: T[]; queue: T[] } {
  const without = visible.filter(s => s.id !== item.id);
  const v = [...without.slice(0, index), item, ...without.slice(index)];
  return { visible: v.slice(0, size), queue: [...v.slice(size), ...queue.filter(s => s.id !== item.id)] };
}

/** True when more should be fetched: the list cannot be kept full from what is already waiting. */
export const needsMore = (visibleCount: number, queueCount: number, size: number, hasMore: boolean) => hasMore && visibleCount + queueCount < size + 2;
