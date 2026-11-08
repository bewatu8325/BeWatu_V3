/**
 * lib/invitations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser side of "Invite your people" (api/invitations.ts does the real work and every check). Kept free of the UI so it can be
 * tested: what each invitation purpose says, the first draft of the message, reading a list of email addresses, and remembering
 * which invitation someone opened while they sign up or sign in.
 *
 * The remembered invitation is only a pointer (the opaque token from the link, nothing about anyone). It lives on this device for a
 * limited time and is checked again by the server when it is used, so an edited or stale pointer can open nothing it should not.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type InvitePurpose = 'connect' | 'community' | 'pod' | 'arena';
export type InviteStatus = 'pending' | 'joined' | 'expired' | 'revoked';

export interface InviteContext {
  purpose: InvitePurpose;
  /** The Pod (its Firestore id) or Arena challenge this invitation is for, when it is for one. */
  targetId?: string | null;
  targetName?: string | null;
}

export const PURPOSES: { id: InvitePurpose; label: string; hint: string }[] = [
  { id: 'connect',   label: 'Connect on BeWatu',        hint: 'Meet you and build a professional connection' },
  { id: 'community', label: 'Join a Community',         hint: 'Find people who share their interests' },
  { id: 'pod',       label: 'Join a Pod',               hint: 'Work on a goal with a small group' },
  { id: 'arena',     label: 'Explore an Arena challenge', hint: 'Put their expertise to work on a real problem' },
];
export const purposeLabel = (p: InvitePurpose) => PURPOSES.find(x => x.id === p)?.label ?? 'Invitation';

/** A Pod made for a community is a "community"; every other kind of Pod is a "Pod". */
export const purposeForPod = (podType?: string): InvitePurpose => (podType === 'community' ? 'community' : 'pod');

const first = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || '';

/** The first draft of the note. Plain and warm, in the member's voice; they can change every word. */
export function defaultMessage(purpose: InvitePurpose, o: { name?: string | null; targetName?: string | null } = {}): string {
  const t = o.targetName?.trim();
  switch (purpose) {
    case 'connect':   return "I've been building my professional network on BeWatu and thought of you. I'd love to have you there.";
    case 'community': return t ? `I'm part of ${t} on BeWatu and think you'd add a lot to it.` : "I'm part of a community on BeWatu and think you'd add a lot to it.";
    case 'pod':       return t ? `I'm in a Pod called ${t} on BeWatu and think you'd be a great fit.` : "I'm working in a Pod on BeWatu and think you'd be a great fit.";
    case 'arena':     return t ? `I found an Arena challenge on BeWatu, "${t}", that looks right up your street.` : "I found Arena challenges on BeWatu that look right up your street.";
  }
}

/** What goes with the link when it is shared from a phone or copied: their note, then the link. */
export const shareText = (message: string, url: string) => (message.trim() ? `${message.trim()}\n\n${url}` : url);

// ── a list of email addresses typed by hand ──────────────────────────────────
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
export const MAX_EMAILS = 5;
export function parseEmails(text: string): { valid: string[]; invalid: string[]; tooMany: boolean } {
  const valid: string[] = [], invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)) {
    const e = raw.toLowerCase();
    if (EMAIL_RE.test(e) && e.length <= 254) { if (!valid.includes(e)) valid.push(e); }
    else if (!invalid.includes(raw)) invalid.push(raw);
  }
  return { valid: valid.slice(0, MAX_EMAILS), invalid, tooMany: valid.length > MAX_EMAILS };
}

// ── the invitation someone opened, kept while they sign up or sign in ────────
export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const PENDING_KEY = 'bewatuPendingInvite';
export const PENDING_TTL_MS = 30 * 86_400_000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;

/** The token in an address like /invite/<token>, or null. */
export function tokenFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/invite\/([^/?#]+)\/?$/);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}
export function savePending(store: KeyValueStore, token: string, now: number = Date.now()): boolean {
  if (!TOKEN_RE.test(token)) return false;
  try { store.setItem(PENDING_KEY, JSON.stringify({ token, savedAt: now })); return true; } catch { return false; }
}
export function loadPending(store: KeyValueStore, now: number = Date.now()): string | null {
  let raw: string | null = null;
  try { raw = store.getItem(PENDING_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const x = JSON.parse(raw);
    if (!x || typeof x.token !== 'string' || !TOKEN_RE.test(x.token) || typeof x.savedAt !== 'number' || now - x.savedAt > PENDING_TTL_MS || x.savedAt > now + 60_000) throw new Error('bad');
    return x.token;
  } catch { try { store.removeItem(PENDING_KEY); } catch { /* ignore */ } return null; }
}
export function clearPending(store: KeyValueStore) { try { store.removeItem(PENDING_KEY); } catch { /* ignore */ } }

/** localStorage when this browser allows it, otherwise a store that forgets (so a blocked browser never throws). */
export const deviceStore = (): KeyValueStore => {
  try { if (typeof localStorage !== 'undefined') { localStorage.getItem('x'); return localStorage; } } catch { /* blocked */ }
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
};

// ── what the server sends back ───────────────────────────────────────────────
export interface InvitationView {
  id: string; kind: 'link' | 'email'; purpose: InvitePurpose; targetId: string | null; targetName: string | null; status: InviteStatus;
  recipient: string | null; createdAt: number; expiresAt: number; joinedCount: number; completedCount: number; sends: number; shares: number; opens: number;
  deliveryFailed: boolean; reminder: boolean; canResend: boolean; canRevoke: boolean; url: string | null;
}
export type EmailResult = 'sent' | 'duplicate' | 'invalid' | 'self' | 'not_delivered' | 'limited' | 'failed';
export interface CreateEmailResponse { results: { email: string; result: EmailResult; reason?: string; invitation?: InvitationView }[] }
export interface Preview {
  state: 'ok' | 'expired' | 'used' | 'revoked' | 'invalid' | 'busy';
  purpose?: InvitePurpose; inviter?: { name: string; avatarUrl: string | null; headline: string | null } | null; message?: string | null;
  target?: { kind: 'pod' | 'challenge'; name: string | null; private: boolean } | null; action?: string; expiresAt?: number; error?: string;
}
export interface AcceptResult {
  ok: true; alreadyAccepted: boolean; existingMember: boolean; purpose: InvitePurpose;
  destination: { type: 'profile' | 'pod' | 'pods' | 'community' | 'challenge' | 'arenas'; id: string | null; action: 'connect' | 'request_to_join' | 'view_challenge' | 'explore' };
  action: 'connect' | 'request_to_join' | 'view_challenge' | 'explore';
  inviter: { uid: string; numericId: number | null; name: string; username: string | null } | null;
  target: { id: string; kind: 'pod' | 'challenge' | null; name: string | null } | null;
}

/** What a result means to the person who sent it, in plain words. */
export function resultText(r: CreateEmailResponse['results'][number]): { ok: boolean; text: string } {
  switch (r.result) {
    case 'sent':          return { ok: true,  text: `Invitation sent to ${r.email}` };
    case 'duplicate':     return { ok: true,  text: `You already invited ${r.email} to this. See it under Your invitations.` };
    case 'invalid':       return { ok: false, text: `${r.email} doesn't look like an email address` };
    case 'self':          return { ok: false, text: "That's your own address" };
    case 'not_delivered': return { ok: false, text: `We couldn't deliver to ${r.email}. Share your invitation link with them instead.` };
    case 'limited':       return { ok: false, text: r.reason === 'recipient' ? `${r.email} has had enough invitations for now. Try again next week.` : "You've reached today's limit for emailed invitations. A link still works." };
    default:              return { ok: false, text: `We couldn't send to ${r.email}. It's saved under Your invitations, so you can try again.` };
  }
}

// ── talking to the server ────────────────────────────────────────────────────
async function post(path: string, body: Record<string, unknown>, token?: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  } catch { throw new Error('Could not reach BeWatu. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data?.error ?? 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
  return data;
}
async function idToken(): Promise<string> {
  const { auth } = await import('./firebase');
  const u = auth.currentUser;
  if (!u) throw new Error('Please sign in again.');
  return u.getIdToken();
}
/** A signed-in call to the invitations route. */
export async function invite<T = any>(body: Record<string, unknown>): Promise<T> { return post('/api/invitations', body, await idToken()); }

/** What an invitation link says. Works signed out. */
export async function fetchPreview(token: string): Promise<Preview> {
  try {
    const res = await fetch('/api/invitations?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : { state: data?.state ?? 'invalid', error: data?.error };
  } catch { return { state: 'busy', error: 'Could not reach BeWatu. Check your connection and try again.' }; }
}
/** The person pressed Sign up / Sign in on the invitation page (for the funnel only; nothing depends on it). */
export function reportStarted(token: string) { post('/api/invitations', { action: 'started', token }).catch(() => {}); }
