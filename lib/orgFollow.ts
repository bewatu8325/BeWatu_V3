/**
 * lib/orgFollow.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One place that knows which organizations this member follows RIGHT NOW in this browser, shared by every list that
 * offers a Follow button (the recommendations sidebar, the end of the feed, the directory, a profile). Without it each
 * list kept its own copy, so following someone in one place left them recommended in another until a reload.
 *
 *   - Optimistic: follow()/unfollow() change the state at once, and put it back if the server refuses.
 *   - One request at a time per organization (a second tap while one is in flight is ignored), and following someone
 *     already followed makes no request. The server is also idempotent (api/companies.ts follows inside a transaction),
 *     so a duplicate can never be stored.
 *   - Per member: switching accounts starts from that member's own list.
 *
 * `createFollowStore` takes the API as an argument so it can be tested without a browser; the real instance is in
 * lib/orgFollowInstance.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface FollowApi {
  follow: (id: string) => Promise<unknown>;
  unfollow: (id: string) => Promise<unknown>;
}

export interface FollowSnapshot { uid: string; followed: ReadonlySet<string>; pending: ReadonlySet<string> }
export type FollowResult = { ok: true; changed: boolean } | { ok: false; reason: 'busy' | 'failed'; message?: string };

export function createFollowStore(api: FollowApi) {
  let uid = '';
  let followed = new Set<string>();
  let pending = new Set<string>();
  let snap: FollowSnapshot = { uid, followed, pending };
  const listeners = new Set<() => void>();
  const emit = () => { snap = { uid, followed: new Set(followed), pending: new Set(pending) }; listeners.forEach(l => l()); };

  /** Tell the store who is signed in and what the account already says they follow. Safe to call on every render. */
  function seed(forUid: string, ids: readonly string[]) {
    if (forUid !== uid) { uid = forUid; followed = new Set(); pending = new Set(); }
    let changed = false;
    for (const id of ids) if (typeof id === 'string' && id && !followed.has(id) && !pending.has(id)) { followed.add(id); changed = true; }
    if (changed || snap.uid !== uid) emit();
  }

  /** Record a change made elsewhere (the profile, the directory) so every list agrees. */
  function mark(id: string, isFollowing: boolean) {
    if (isFollowing === followed.has(id)) return;
    if (isFollowing) followed.add(id); else followed.delete(id);
    emit();
  }

  async function change(id: string, want: boolean): Promise<FollowResult> {
    if (pending.has(id)) return { ok: false, reason: 'busy' };
    if (followed.has(id) === want) return { ok: true, changed: false };          // already so: no request, no duplicate
    pending.add(id);
    if (want) followed.add(id); else followed.delete(id);                         // optimistic
    emit();
    try {
      await (want ? api.follow(id) : api.unfollow(id));
      pending.delete(id); emit();
      return { ok: true, changed: true };
    } catch (e: any) {
      if (want) followed.delete(id); else followed.add(id);                      // put it back
      pending.delete(id); emit();
      return { ok: false, reason: 'failed', message: typeof e?.message === 'string' ? e.message : undefined };
    }
  }

  return {
    seed, mark,
    follow: (id: string) => change(id, true),
    unfollow: (id: string) => change(id, false),
    getSnapshot: (): FollowSnapshot => snap,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export type FollowStore = ReturnType<typeof createFollowStore>;
