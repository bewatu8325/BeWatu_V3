/**
 * lib/orgFollowInstance.ts
 * The browser's one follow store (see lib/orgFollow.ts), wired to the real API (api/companies.ts, which saves the
 * follow on the member's account inside a transaction), plus the React hook the lists use.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { createFollowStore } from './orgFollow';
import { setFollowing } from './companiesService';

export const followStore = createFollowStore({
  follow: id => setFollowing(id, true),
  unfollow: id => setFollowing(id, false),
});

/** The member's followed organizations (shared by every list) and the actions to change them. */
export function useOrgFollows(uid: string | undefined, accountFollows: readonly string[] | undefined) {
  // Seed from the account (idempotent), then follow the store.
  useEffect(() => { if (uid) followStore.seed(uid, accountFollows ?? []); }, [uid, accountFollows]);
  const snap = useSyncExternalStore(followStore.subscribe, followStore.getSnapshot);
  return { followed: snap.followed, pending: snap.pending, follow: followStore.follow, unfollow: followStore.unfollow, mark: followStore.mark };
}
