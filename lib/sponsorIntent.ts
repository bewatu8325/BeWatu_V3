/**
 * lib/sponsorIntent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "I want to sponsor this Arena" has to survive the detour through creating or claiming an organization, which can take minutes
 * (a claim may even wait for BeWatu to review it) and may span a reload or a sign-out. So when someone starts sponsoring from an Arena
 * we remember which Arena (and nothing else: no organization, no branding, no personal details) on this device, per member, for a
 * limited time, and pick it up again when they come back.
 *
 * It is only a pointer. Everything that matters (is this organization yours, is it verified, is there already a request) is checked
 * on the server when the flow resumes, so a stale or edited pointer can never bypass anything; at worst it opens the same screen
 * the member could have opened themselves. There is at most one pointer per member, and finishing a request clears it, so a
 * resumed flow cannot create a second request (the server also refuses a duplicate).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface SponsorIntent { arenaId: string; arenaName: string; via: 'create' | 'claim' | null; savedAt: number }

export const INTENT_TTL_MS = 14 * 86_400_000;
const KEY = (uid: string) => `bewatuSponsorIntent:${uid}`;
const ARENA_RE = /^[a-z0-9_-]{2,40}$/;

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function saveIntent(store: KeyValueStore, uid: string, arenaId: string, arenaName: string, via: SponsorIntent['via'], now: number = Date.now()): SponsorIntent | null {
  if (!uid || !ARENA_RE.test(arenaId)) return null;
  const intent: SponsorIntent = { arenaId, arenaName: String(arenaName ?? '').slice(0, 80), via, savedAt: now };
  try { store.setItem(KEY(uid), JSON.stringify(intent)); } catch { return null; }
  return intent;
}

/** The saved pointer, or null if there is none, it has expired, or it is not something this code wrote. */
export function loadIntent(store: KeyValueStore, uid: string, now: number = Date.now()): SponsorIntent | null {
  if (!uid) return null;
  let raw: string | null = null;
  try { raw = store.getItem(KEY(uid)); } catch { return null; }
  if (!raw) return null;
  try {
    const x = JSON.parse(raw);
    if (!x || typeof x !== 'object' || typeof x.arenaId !== 'string' || !ARENA_RE.test(x.arenaId) || typeof x.savedAt !== 'number') throw new Error('shape');
    if (now - x.savedAt > INTENT_TTL_MS || x.savedAt > now + 60_000) throw new Error('expired');
    return { arenaId: x.arenaId, arenaName: typeof x.arenaName === 'string' ? x.arenaName.slice(0, 80) : '', via: x.via === 'create' || x.via === 'claim' ? x.via : null, savedAt: x.savedAt };
  } catch { try { store.removeItem(KEY(uid)); } catch { /* ignore */ } return null; }
}

export function clearIntent(store: KeyValueStore, uid: string) { try { store.removeItem(KEY(uid)); } catch { /* ignore */ } }

/** What the resume step should do, given what the server says about this member and Arena. Pure, so the decision is tested. */
export type ResumeAction = 'open_flow' | 'wait_for_verification' | 'finish_setup' | 'done' | 'arena_closed';
export function resumeAction(e: { arena: { open: boolean }; organizations: { state: string; existing: string | null }[]; pendingClaims: unknown[] }): ResumeAction {
  if (!e.arena.open) return 'arena_closed';
  if (e.organizations.some(o => o.existing)) return 'done';                       // a request is already in: nothing more to start
  if (e.organizations.some(o => o.state === 'eligible')) return 'open_flow';
  if (e.organizations.some(o => o.state === 'pending_verification') || e.pendingClaims.length > 0) return 'wait_for_verification';
  return 'finish_setup';
}
