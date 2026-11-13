/**
 * lib/invitations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser side of "Invite your people" (api/invitations.ts does the real work and every check). Kept free of the UI so it can be
 * tested: what each invitation purpose says, the first draft of the message, reading a list of email addresses, and remembering
 * which invitation someone opened while they sign up or sign in.
 *
 * The remembered invitation is only a pointer (the opaque token from the link, nothing about anyone). It lives on this device for a
 * limited time and is checked again by the server when it is used, so an edited or stale pointer can open nothing it should not.
 * It also remembers WHETHER the person pressed "Accept invitation" before signing up or in, and for a day only: a pointer left over
 * from last week never accepts anything for them.
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
/** How long "I pressed Accept" is honoured after sign-up or sign-in. After that the page asks again. */
export const ACCEPT_INTENT_TTL_MS = 86_400_000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;

/** The token in an address like /invite/<token>, or null. */
export function tokenFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/invite\/([^/?#]+)\/?$/);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}
/** Remember the invitation. `accepted` is true only when the person pressed "Accept invitation" (not merely opened the page). */
export function savePending(store: KeyValueStore, token: string, now: number = Date.now(), accepted = false): boolean {
  if (!TOKEN_RE.test(token)) return false;
  try { store.setItem(PENDING_KEY, JSON.stringify(accepted ? { token, savedAt: now, acceptedAt: now } : { token, savedAt: now })); return true; } catch { return false; }
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
/** The remembered invitation and whether the person chose to accept it, recently enough to carry on without asking again. */
export function loadPendingIntent(store: KeyValueStore, now: number = Date.now()): { token: string; accepted: boolean } | null {
  const token = loadPending(store, now);
  if (!token) return null;
  try {
    const x = JSON.parse(store.getItem(PENDING_KEY) ?? '{}');
    const at = x?.acceptedAt;
    return { token, accepted: typeof at === 'number' && at <= now + 60_000 && now - at <= ACCEPT_INTENT_TTL_MS };
  } catch { return { token, accepted: false }; }
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
  state: 'ok' | 'expired' | 'used' | 'revoked' | 'invalid' | 'busy' | 'unavailable';
  purpose?: InvitePurpose; inviter?: { name: string; avatarUrl: string | null; headline: string | null } | null; message?: string | null;
  /** For a connect invitation: 'direct' (an emailed invitation: accepting connects you) or 'request' (a shared link: accepting asks them). */
  mode?: 'direct' | 'request' | null;
  target?: { kind: 'pod' | 'challenge'; name: string | null; private: boolean } | null; action?: string; expiresAt?: number; error?: string;
}
/** Where THIS signed-in person stands with an invitation (from the server's read-only `check`). */
export type CheckState = 'ok' | 'own' | 'unavailable' | 'already_connected' | 'already_accepted' | 'already_requested' | 'expired' | 'revoked' | 'used' | 'invalid';
export type ConnectionOutcome = 'connected' | 'already_connected' | 'requested' | 'already_requested' | 'already_accepted' | 'not_accepting';
export interface AcceptResult {
  ok: true; alreadyAccepted: boolean; existingMember: boolean; purpose: InvitePurpose;
  /** Set only when the person pressed Accept on a connect invitation, and only once the server has written the records. */
  connection?: ConnectionOutcome | null; mode?: 'direct' | 'request' | null;
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
  if (!res.ok) { const e: any = new Error(data?.error ?? 'Something went wrong. Please try again.'); e.status = res.status; e.state = data?.state; throw e; }
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
export async function fetchPreview(token: string, quiet = false): Promise<Preview> {
  try {
    const res = await fetch('/api/invitations?token=' + encodeURIComponent(token) + (quiet ? '&resume=1' : ''), { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : { state: data?.state ?? 'invalid', error: data?.error };
  } catch { return { state: 'busy', error: 'Could not reach BeWatu. Check your connection and try again.' }; }
}
/** The person pressed a button on the invitation page (for the funnel only; nothing depends on it, and a press is not a connection). */
export function reportStarted(token: string, step?: { intent?: 'accept'; path?: 'register' | 'login' | null }) { post('/api/invitations', { action: 'started', token, ...step }).catch(() => {}); }
/** Where this signed-in person stands with the invitation. Read-only on the server. */
export interface CheckResult { state: CheckState; /** Only when they are already connected: who, so the page can open their profile. */ inviter?: { numericId: number | null; username: string | null; name: string } }
export async function checkInvitation(token: string): Promise<CheckResult> {
  try { return await invite<CheckResult>({ action: 'check', token }); }
  catch (e: any) { if (e?.state) return { state: e.state as CheckState }; throw e; }
}
/** The person chose to accept. The server writes the records first; only its answer says what happened. */
export function acceptInvitation(token: string): Promise<AcceptResult> { return invite<AcceptResult>({ action: 'accept', token, confirm: true }); }

// ── what the page says ───────────────────────────────────────────────────────
// One place for the words, so they can be tested: an invitation someone already sent is ACCEPTED, never answered with a new request.
export const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || '';
const PURPOSE_TO: Record<InvitePurpose, string> = { connect: 'to connect', community: 'to join a community', pod: 'to join a Pod', arena: 'to explore an Arena challenge' };
export const headline = (purpose: InvitePurpose, first: string) => `${first ? first + ' invited you' : "You've been invited"} ${PURPOSE_TO[purpose]}.`;
export function valueLine(purpose: InvitePurpose, first: string): string {
  switch (purpose) {
    case 'connect':   return first ? `Join ${first} on BeWatu to connect, exchange ideas, and discover opportunities together.` : 'Join BeWatu to connect, exchange ideas, and discover opportunities together.';
    case 'community': return 'Join BeWatu to find people who share your interests.';
    case 'pod':       return 'Join BeWatu to work on a goal with a small group.';
    case 'arena':     return 'Join BeWatu to put your expertise to work on real problems.';
  }
}
/** The one line that says what pressing Accept does, before it is pressed. */
export function acceptNote(purpose: InvitePurpose, mode: 'direct' | 'request' | null | undefined, first: string, action?: string): string {
  const who = first || 'them';
  if (purpose === 'connect') return mode === 'request' ? `Accepting sends ${who} a request to connect. You're connected once they confirm.` : `Accepting connects you with ${who}.`;
  if (action === 'request_to_join') return "You can ask to join. The Pod's admin decides, so nothing happens without their say.";
  if (action === 'view_challenge') return 'You can read the challenge and decide whether to take part.';
  return 'You can look around and decide what is for you.';
}
export const acceptLabel = (purpose: InvitePurpose, signedIn: boolean) => (purpose === 'connect' ? 'Accept invitation' : signedIn ? 'Continue on BeWatu' : 'Join BeWatu');
export const signInLabel = (purpose: InvitePurpose) => (purpose === 'connect' ? 'Already on BeWatu? Sign in to accept' : 'Already on BeWatu? Sign in');
export const fineprint = (purpose: InvitePurpose, first: string, expiresAt?: number) => {
  const when = expiresAt ? new Date(expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : 'soon';
  return purpose === 'connect' ? `Expires ${when}. Nothing is shared with ${first || 'them'} until you accept.` : `Expires ${when}. Nothing happens until you choose to join.`;
};

export interface Screen { title: string; body: string; action?: { label: string; to: 'join' | 'home' | 'retry' | 'profile' }; secondary?: { label: string; to: 'home' } }
/** A friendly screen for every state an invitation can be in. No error codes, no blame, always a way forward. */
export function stateScreen(state: CheckState | 'busy', first: string, signedIn: boolean, error?: string): Screen {
  const who = first || 'the person who invited you';
  const onward: Screen['action'] = signedIn ? { label: 'Go to BeWatu', to: 'home' } : { label: 'Join BeWatu', to: 'join' };
  switch (state) {
    case 'expired':   return { title: 'This invitation has expired', body: `Ask ${who} to send you a new one. You can still join BeWatu in the meantime.`, action: onward };
    case 'revoked':   return { title: 'This invitation was withdrawn', body: `${first ? first + ' has' : 'The person who sent it has'} taken it back. You are welcome to join BeWatu on your own.`, action: onward };
    case 'used':      return { title: 'This invitation has already been used', body: `Someone has already accepted it. Ask ${who} to send you one of your own.`, action: onward };
    case 'invalid':   return { title: "We couldn't find that invitation", body: 'The link may be incomplete. Open it again from your message or email, or ask for a new one.', action: onward };
    case 'unavailable': return { title: "This invitation can't be completed", body: 'The person who invited you is no longer available on BeWatu. You can still join and build your own network.', action: onward };
    case 'own':       return { title: 'This is your own invitation', body: "Share it with the people you'd like to invite. They'll see it as an invitation from you.", action: { label: 'Go to BeWatu', to: 'home' } };
    case 'already_accepted':  return { title: `You've already accepted ${first ? first + "'s" : 'this'} invitation`, body: "You accepted it earlier, so it can't be used again.", action: { label: 'Go to BeWatu', to: 'home' } };
    case 'already_connected': return { title: first ? `You're already connected with ${first}` : "You're already connected", body: 'Start a conversation or explore your professional network.', action: { label: 'View profile', to: 'profile' }, secondary: { label: 'Explore BeWatu', to: 'home' } };
    case 'already_requested': return { title: first ? `Your request to ${first} is waiting` : 'Your request is waiting', body: `${first || 'They'} will see it and confirm. We'll let you know when you're connected.`, action: { label: 'Explore BeWatu', to: 'home' } };
    case 'busy':      return { title: "We couldn't open this just now", body: error ?? 'Please try again in a moment.', action: { label: 'Try again', to: 'retry' } };
    default:          return { title: "We couldn't open this just now", body: 'Please try again in a moment.', action: { label: 'Try again', to: 'retry' } };
  }
}
/** What to show once the server has CONFIRMED what happened. Never before it. */
export function successScreen(c: ConnectionOutcome, first: string): Screen {
  switch (c) {
    case 'connected':
    case 'already_connected': return { title: first ? `You're connected with ${first}.` : "You're connected.", body: 'Your BeWatu connection is ready. Start a conversation or explore your professional network.', action: { label: 'View profile', to: 'profile' }, secondary: { label: 'Explore BeWatu', to: 'home' } };
    case 'requested':
    case 'already_requested': return { title: first ? `Request sent to ${first}.` : 'Request sent.', body: `${first || 'They'} will see it and confirm. We'll let you know when you're connected.`, action: { label: 'Explore BeWatu', to: 'home' } };
    case 'not_accepting':     return { title: first ? `${first} isn't taking new connection requests right now.` : "They aren't taking new connection requests right now.", body: "You're all set up on BeWatu, though, so you can explore and find other people to connect with.", action: { label: 'Explore BeWatu', to: 'home' } };
    default:                  return stateScreen('already_accepted', first, true);
  }
}
