// api/invitations.ts
// ─────────────────────────────────────────────────────────────────────────────
// "Invite your people": a member invites someone who is not on BeWatu yet (by email, or with a personal link they share
// themselves), and the invited person arrives at the right place with the right context.
//
// Signed-in (Authorization: Bearer <idToken>), POST { action, ... }
//   create   { purpose, targetId?, kind: 'link'|'email', emails?, message?, reminder? }
//   list     my invitations, with status (pending, joined, expired, revoked) and how they are going
//   revoke   { id }                     stop an invitation working (people who already joined stay joined)
//   resend   { id }                     email invitations only: once a day, three sends in all
//   shared   { id, channel }            the member copied / shared the link (for the funnel)
//   prefs    { joinedAlerts? }          read or set "tell me when someone I invited joins"
//   accept   { token, confirm? }       the invited person is now signed in. Without `confirm` it only records the arrival.
//                                       With `confirm: true` (they pressed "Accept invitation") a CONNECT invitation does its
//                                       job: see "Connecting" below.
//   check    { token }                  read-only: can THIS member accept it? (ok, already accepted, already connected, own,
//                                       expired, withdrawn, used, unavailable). Writes and counts nothing.
//   complete { token }                  they took the invited step (verified here, from the real records)
// Public
//   GET  ?token=...                     what the invitation says (inviter identity only if their profile is public)
//   POST { action: 'started', token, intent?, path? }   the invited person pressed Accept / Sign up / Sign in on the page
//   GET  ?og=1&t=...                    link-preview HTML for crawlers only (vercel.json sends only bots here): first name only,
//                                       only if their profile is public, never the note, never the token; noindex
//   GET/POST ?optout=1&e=..&t=..        "don't invite me again" from the email (a scanner fetching it does nothing)
//   GET  ?cron=1                        daily: one gentle reminder, activation check (Authorization: Bearer CRON_SECRET)
//
// What an invitation is, and is not
//   - The link carries a signed random id and nothing else: no email, no name, no account detail. Everything is looked up
//     here. Anyone can hold a link; it opens a page that explains the invitation and asks them to sign up or sign in.
//   - An invitation never grants access to anything. Accepting it records who arrived. A private Pod still gets a join REQUEST
//     that its admin approves; a restricted Arena is still restricted. Those rules live in firestore.rules and the pages
//     themselves; this route does not bypass them. A private Pod's name is not shown to the invited person before they are in.
//   - Connecting (purpose 'connect' only). The inviter has already asked, so the invited person ACCEPTS; they never send a second
//     request. It happens only when the person presses Accept (`confirm: true`), never on arrival, and only after this route has
//     written the records. An EMAILED invitation names one person, so accepting completes the connection. A personal LINK can be
//     opened by up to 50 people, so accepting it only sends the inviter a request to approve. The page says which will happen.
//   - Email goes only to addresses the member typed for this invitation. There is no contact import. One invitation per
//     person per destination, a cap on how often anyone can be emailed, and an opt-out that is honoured everywhere.
//   - Every number we keep is about people: opened, started signing up, joined, took the invited step, became active. Not
//     about how many were sent.
//
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// Secret: INVITATION_SECRET, or COMMS_UNSUBSCRIBE_SECRET if that is what is set. With neither, nothing here works (fail closed).
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  /** `state` is a short code the invitation page turns into a friendly screen (expired, revoked, used, own, unavailable). */
  constructor(public status: number, message: string, public state?: string) { super(message); }
}

// ── limits ───────────────────────────────────────────────────────────────────
const DAY = 86_400_000;
export const LIMITS = {
  TTL_MS: 30 * DAY,
  MESSAGE_MAX: 500,
  EMAILS_PER_REQUEST: 5,
  CREATES_PER_HOUR: 40,
  EMAILS_PER_DAY: 20,
  RECIPIENT_PER_WEEK: 3,          // across every member: nobody is mailed more than this
  RESEND_COOLDOWN_MS: DAY,
  MAX_SENDS: 3,                   // the first email and two resends
  REMINDER_AFTER_MS: 5 * DAY,
  LINK_MAX_JOINS: 50,
  ACTIVATION_WINDOW_MS: 14 * DAY,
  OPEN_PER_HOUR_PER_IP: 300,
  STARTED_PER_HOUR_PER_IP: 60,
};

export type Purpose = 'connect' | 'community' | 'pod' | 'arena';
export const PURPOSES: Purpose[] = ['connect', 'community', 'pod', 'arena'];
export type Status = 'pending' | 'joined' | 'expired' | 'revoked';
export type EventType = 'created' | 'shared' | 'opened' | 'opened_bot' | 'accept_clicked' | 'signup_started' | 'signup_completed' | 'accepted_existing' | 'accepted' | 'connected' | 'completed' | 'activated' | 'reminded' | 'revoked' | 'expired';

// ── small helpers ────────────────────────────────────────────────────────────
const safeId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : '');
/** Free text from a member: control characters out, newlines kept (at most two in a row), trimmed, capped. */
export function cleanMessage(v: unknown, max = LIMITS.MESSAGE_MAX): string {
  // eslint-disable-next-line no-control-regex
  return (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
const oneLine = (v: unknown, max: number) => cleanMessage(v, max).replace(/\s+/g, ' ');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const firstName = (n: string) => (n.trim().split(/\s+/)[0] || 'A member');

// ── tokens: a random id and a signature over it (the server can always re-derive the link; nothing guessable) ──
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest();
const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;
export const newInvitationId = () => randomBytes(12).toString('base64url');
export function tokenFor(secret: string, id: string): string {
  return `${id}.${hmac(secret, 'invite-token:' + id).subarray(0, 16).toString('base64url')}`;
}
/** The invitation id a token names, or null when the token is not one we issued. */
export function idFromToken(secret: string | undefined, token: unknown): string | null {
  if (!secret || typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const id = token.slice(0, 16);
  const a = Buffer.from(tokenFor(secret, id)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

// ── email ────────────────────────────────────────────────────────────────────
export const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
export function normalizeEmail(v: unknown): string | null {
  const e = (typeof v === 'string' ? v : '').trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}
/** Not reversible without the secret; the same address always gives the same value. */
export const emailHash = (secret: string, email: string) => hmac(secret, 'invite-email:' + email).toString('hex');
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}${'•'.repeat(Math.min(3, Math.max(1, local.length - 1)))}@${domain}`;
}
const optoutSig = (secret: string, h: string) => hmac(secret, 'invite-optout:' + h).toString('hex');
const optoutOk = (secret: string | undefined, h: unknown, t: unknown) => {
  if (!secret || typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h) || typeof t !== 'string') return false;
  const a = Buffer.from(optoutSig(secret, h)), b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
};

// ── status ───────────────────────────────────────────────────────────────────
export interface InvitationDoc {
  inviterUid: string; purpose: Purpose; targetId: string | null; targetKind: 'pod' | 'challenge' | null;
  targetName: string | null; targetPublic: boolean; kind: 'link' | 'email';
  recipientEmail?: string; recipientHash?: string; message: string; reminder: boolean;
  status: 'pending' | 'joined' | 'revoked'; createdAt: number; expiresAt: number; dedupe: string;
  sends: number; lastSentAt: number | null; remindedAt: number | null; deliveryFailed?: boolean;
  opens: number; shares: number; joinedCount: number; completedCount: number; revokedAt?: number | null;
}
/** What the member sees: expiry is derived, never stored, so it can never be stale. */
export function statusOf(inv: Pick<InvitationDoc, 'status' | 'expiresAt' | 'joinedCount'>, now: number): Status {
  if (inv.status === 'revoked') return 'revoked';
  if (inv.status === 'joined' || inv.joinedCount > 0) return 'joined';
  return inv.expiresAt <= now ? 'expired' : 'pending';
}
/** Whether the link still lets someone in. An email invitation is for one person; a personal link works for a few. */
export function usable(inv: InvitationDoc, now: number): boolean {
  if (inv.status === 'revoked' || inv.expiresAt <= now) return false;
  return inv.kind === 'link' ? inv.joinedCount < LIMITS.LINK_MAX_JOINS : inv.joinedCount < 1;
}

// ── injected edges, so the logic can be tested without sending mail ──────────
export interface Mail { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
export interface Deps {
  db: Firestore; secret: string | undefined; now: number;
  mail: (m: Mail) => Promise<boolean>;
  /** The member who owns this email address, if any (used only to respect their email choices; never revealed). */
  memberByEmail?: (email: string) => Promise<string | null>;
  origin?: string;
}
const originOf = (d: Deps) => d.origin ?? 'https://www.bewatu.com';
const need = (d: Deps) => { if (!d.secret) throw new HttpError(503, 'Invitations are not available right now.'); return d.secret; };

// ── rate limits (a counter per key and window; the same shape the other routes use) ──
export async function hit(db: Firestore, key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const ref = db.collection('invitation_rate_limits').doc(key.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 200));
  return db.runTransaction(async tx => {
    const s = (await tx.get(ref)).data() as { count?: number; windowStart?: number } | undefined;
    const fresh = !s?.windowStart || now - s.windowStart >= windowMs;
    const count = fresh ? 0 : (s?.count ?? 0);
    if (count >= max) return false;
    tx.set(ref, { count: count + 1, windowStart: fresh ? now : s!.windowStart, updatedAt: now });
    return true;
  });
}
const clientKey = (secret: string, ip: string) => hmac(secret, 'invite-ip:' + ip).toString('hex').slice(0, 32);

// ── events and the funnel counters ───────────────────────────────────────────
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);
export async function track(d: Deps, type: EventType, inv: Pick<InvitationDoc, 'inviterUid' | 'purpose'> & { id: string }, extra: Record<string, unknown> = {}) {
  try {
    await d.db.collection('invitation_events').add({ type, invitationId: inv.id, inviterUid: inv.inviterUid, purpose: inv.purpose, at: d.now, ...extra });
    await d.db.collection('invitation_metrics').doc(dayKey(d.now)).set({
      day: dayKey(d.now), [type]: FieldValue.increment(1), [`${inv.purpose}_${type}`]: FieldValue.increment(1),
    }, { merge: true });
  } catch (e: any) { console.error('invitation track failed:', e?.code ?? e?.message); }
}
/** The funnel from the daily counters: what share of people who OPENED went on to join and to do something, not how many were sent. */
export function funnel(c: Partial<Record<EventType, number>>) {
  const n = (k: EventType) => c[k] ?? 0;
  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return {
    created: n('created'), opened: n('opened'), acceptClicked: n('accept_clicked'), signupStarted: n('signup_started'), joined: n('signup_completed') + n('accepted_existing'),
    accepted: n('accepted'), connected: n('connected'), expired: n('expired'),
    completed: n('completed'), activated: n('activated'),
    acceptedPerClicked: rate(n('accepted'), n('accept_clicked')), connectedPerAccepted: rate(n('connected'), n('accepted')),
    openedPerCreated: rate(n('opened'), n('created')), joinedPerOpened: rate(n('signup_completed') + n('accepted_existing'), n('opened')),
    completedPerJoined: rate(n('completed'), n('signup_completed') + n('accepted_existing')), activatedPerJoined: rate(n('activated'), n('signup_completed') + n('accepted_existing')),
  };
}

// ── is the inviter still there? ──────────────────────────────────────────────
const GONE_STATUSES = new Set(['pending_deletion', 'deleted', 'suspended', 'banned', 'disabled']);
/** A closed, suspended or missing account cannot be connected with. */
export const inviterAvailable = (u: Record<string, any> | undefined): boolean => !!u && !GONE_STATUSES.has(String(u.status ?? '')) && !u.deletedAt;
/** An emailed invitation names one person, so accepting it completes the connection. A personal link is open to many, so it only asks. */
export const connectsOnAccept = (inv: Pick<InvitationDoc, 'kind'>) => inv.kind === 'email';
export type ConnectionOutcome = 'connected' | 'already_connected' | 'requested' | 'already_requested' | 'already_accepted' | 'not_accepting';
const DEAD_CONNECTION = ['cancelled', 'declined'];

// ── who is inviting, and where ───────────────────────────────────────────────
export interface PublicIdentity { name: string; avatarUrl: string | null; headline: string | null }
/** The inviter / invitee as a stranger may see them: only members whose profile is public. */
export function publicIdentity(u: Record<string, any> | undefined): PublicIdentity | null {
  if (!u) return null;
  const vis = u.privacySettings?.profileVisibility;
  if (u.isPublic === false || vis === 'private' || vis === 'connections') return null;
  const name = oneLine(u.displayName, 80);
  if (!name) return null;
  return { name, avatarUrl: typeof u.photoURL === 'string' && /^https:\/\//.test(u.photoURL) ? u.photoURL : null, headline: oneLine(u.headline, 120) || null };
}

const memberOfPod = (pod: Record<string, any>, uid: string, numericId: unknown) => {
  const members: unknown[] = Array.isArray(pod.members) ? pod.members : [];
  return members.includes(uid) || (numericId != null && members.includes(numericId))
    || pod.adminUid === uid || pod.creatorUid === uid || (numericId != null && pod.adminId === numericId);
};
const PRIVATE_POD = (pod: Record<string, any>) => pod.visibility === 'invite' || pod.visibility === 'apply';

interface Target { targetId: string | null; targetKind: 'pod' | 'challenge' | null; targetName: string | null; targetPublic: boolean }
/** Checks the destination is real and that this member may invite people to it. Private Pods: only their own members. */
export async function resolveTarget(db: Firestore, purpose: Purpose, targetIdIn: unknown, uid: string, numericId: unknown, now: number): Promise<Target> {
  const none: Target = { targetId: null, targetKind: null, targetName: null, targetPublic: false };
  const targetId = targetIdIn == null || targetIdIn === '' ? '' : safeId(targetIdIn);
  if (targetIdIn != null && targetIdIn !== '' && !targetId) throw new HttpError(400, 'That destination is not valid.');
  if (purpose === 'connect') {
    if (targetId) throw new HttpError(400, 'A connection invitation has no destination.');
    return none;
  }
  if (!targetId) return none;
  if (purpose === 'arena') {
    const s = await db.collection('arena_challenges').doc(targetId).get();
    const c = s.data();
    const deadline = typeof c?.deadline === 'string' ? Date.parse(c.deadline) : NaN;
    if (!s.exists || c?.verificationStatus !== 'live' || (Number.isFinite(deadline) && deadline <= now)) throw new HttpError(404, 'That challenge is not open.');
    return { targetId, targetKind: 'challenge', targetName: oneLine(c?.title, 120) || null, targetPublic: true };
  }
  for (const col of ['pods', 'circles']) {
    const s = await db.collection(col).doc(targetId).get();
    if (!s.exists) continue;
    const pod = s.data()!;
    const isPrivate = PRIVATE_POD(pod);
    if (isPrivate && !memberOfPod(pod, uid, numericId)) throw new HttpError(403, 'Only members can invite people to this Pod.');
    return { targetId, targetKind: 'pod', targetName: oneLine(pod.name, 120) || null, targetPublic: !isPrivate };
  }
  throw new HttpError(404, 'That Pod was not found.');
}

/** Where the invited person ends up, and the one step offered there. They are only ever offered a request, never a seat. */
export function destinationFor(inv: Pick<InvitationDoc, 'purpose' | 'targetId' | 'targetKind'>): { type: 'profile' | 'pod' | 'pods' | 'community' | 'challenge' | 'arenas'; id: string | null; action: 'connect' | 'request_to_join' | 'view_challenge' | 'explore' } {
  switch (inv.purpose) {
    case 'connect': return { type: 'profile', id: null, action: 'connect' };
    case 'community':
    case 'pod': return inv.targetId ? { type: 'pod', id: inv.targetId, action: 'request_to_join' } : { type: inv.purpose === 'community' ? 'community' : 'pods', id: null, action: 'explore' };
    case 'arena': return inv.targetId ? { type: 'challenge', id: inv.targetId, action: 'view_challenge' } : { type: 'arenas', id: null, action: 'explore' };
  }
}

const dedupeKey = (secret: string, inviter: string, purpose: string, target: string | null, who: string) =>
  hmac(secret, ['invite-dedupe', inviter, purpose, target ?? '', who].join('|')).toString('hex');

function view(inv: InvitationDoc & { id: string }, d: Deps) {
  const status = statusOf(inv, d.now);
  const canResend = inv.kind === 'email' && status === 'pending' && inv.sends < LIMITS.MAX_SENDS && (!inv.lastSentAt || d.now - inv.lastSentAt >= LIMITS.RESEND_COOLDOWN_MS);
  return {
    id: inv.id, kind: inv.kind, purpose: inv.purpose, targetId: inv.targetId, targetName: inv.targetName, status,
    recipient: inv.recipientEmail ? maskEmail(inv.recipientEmail) : null,
    createdAt: inv.createdAt, expiresAt: inv.expiresAt, joinedCount: inv.joinedCount, completedCount: inv.completedCount,
    sends: inv.sends, shares: inv.shares ?? 0, opens: inv.opens ?? 0, deliveryFailed: inv.deliveryFailed === true, reminder: inv.reminder,
    canResend, canRevoke: status === 'pending' || (inv.kind === 'link' && status === 'joined'),
    url: status === 'pending' || (inv.kind === 'link' && usable(inv, d.now)) ? `${originOf(d)}/invite/${tokenFor(d.secret!, inv.id)}` : null,
  };
}

// ── the email ────────────────────────────────────────────────────────────────
const PURPOSE_LINE: Record<Purpose, string> = {
  connect: 'to connect on BeWatu',
  community: 'to join a community on BeWatu',
  pod: 'to join a Pod on BeWatu',
  arena: 'to explore an Arena challenge on BeWatu',
};
export function buildEmail(d: Deps, inv: InvitationDoc & { id: string }, inviterName: string, reminder: boolean): Mail {
  const secret = need(d);
  const url = `${originOf(d)}/invite/${tokenFor(secret, inv.id)}`;
  const h = emailHash(secret, inv.recipientEmail!);
  const optout = `${originOf(d)}/api/invitations?optout=1&e=${h}&t=${optoutSig(secret, h)}`;
  const dest = inv.targetPublic && inv.targetName ? ` (${inv.targetName})` : '';
  const subject = reminder
    ? `A reminder: ${inviterName} invited you to BeWatu`
    : inv.targetPublic && inv.targetName ? `${inviterName} invited you to ${inv.targetName} on BeWatu` : `${inviterName} invited you to BeWatu`;
  const html = `<div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1917">
<div style="font-weight:800;color:#1a4a3a;font-size:20px;margin-bottom:20px">BeWatu</div>
<h1 style="font-size:20px;margin:0 0 8px">${esc(inviterName)} invited you ${esc(PURPOSE_LINE[inv.purpose])}${esc(dest)}</h1>
<p style="color:#57534e;font-size:14px;line-height:1.6;margin:0 0 16px">Good connections make great things possible.</p>
${inv.message ? `<div style="background:#f5f5f4;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;white-space:pre-wrap;color:#292524;margin:0 0 20px">${esc(inv.message)}</div>` : ''}
<p style="text-align:center;margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#1a4a3a;color:#fff;font-weight:700;font-size:14px;padding:13px 26px;border-radius:10px;text-decoration:none">See the invitation</a></p>
<p style="color:#78716c;font-size:12px;line-height:1.6;margin:0">You can look without signing up. Nothing happens until you choose to join. If you weren't expecting this, you can ignore it.</p>
<hr style="border:none;border-top:1px solid #e7e5e4;margin:22px 0 12px"/>
<p style="color:#a8a29e;font-size:11px;line-height:1.6;margin:0">${esc(inviterName)} typed your address to send this invitation; BeWatu did not read anyone's contacts. <a href="${optout}" style="color:#78716c">Don't invite me to BeWatu again</a>.</p></div>`;
  const text = `${inviterName} invited you ${PURPOSE_LINE[inv.purpose]}${dest}.\n\n${inv.message ? inv.message + '\n\n' : ''}See the invitation: ${url}\n\nYou can look without signing up. If you weren't expecting this, ignore it.\nDon't invite me to BeWatu again: ${optout}\n`;
  return { to: inv.recipientEmail!, subject, html, text, headers: { 'List-Unsubscribe': `<${optout}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

type Result = Record<string, unknown>;
const BOT_RE = /bot|crawler|spider|preview|slurp|facebookexternalhit|whatsapp|telegram|slack|discord|linkedinbot|twitterbot|skypeuripreview|embedly|quora link|pinterest|headless|curl|wget|python-requests|go-http-client/i;
export const isBot = (ua: unknown) => typeof ua !== 'string' || ua.length < 8 || BOT_RE.test(ua);

async function loadInvitation(d: Deps, token: unknown): Promise<(InvitationDoc & { id: string }) | null> {
  const id = idFromToken(d.secret, token);
  if (!id) return null;
  const s = await d.db.collection('invitations').doc(id).get();
  return s.exists ? { ...(s.data() as InvitationDoc), id } : null;
}
async function loadOwned(d: Deps, uid: string, idIn: unknown) {
  const id = typeof idIn === 'string' && ID_RE.test(idIn) ? idIn : '';
  if (!id) throw new HttpError(400, 'An invitation is required.');
  const s = await d.db.collection('invitations').doc(id).get();
  if (!s.exists || s.data()!.inviterUid !== uid) throw new HttpError(404, 'Invitation not found.');
  return { ref: s.ref, inv: { ...(s.data() as InvitationDoc), id } };
}

/** May we email this address? Not if they asked not to be invited, or are a member who has turned email off. */
async function mayEmail(d: Deps, email: string): Promise<boolean> {
  const secret = need(d);
  if ((await d.db.collection('email_suppressions').doc(emailHash(secret, email)).get()).exists) return false;
  const memberUid = d.memberByEmail ? await d.memberByEmail(email).catch(() => null) : null;
  if (memberUid && (await d.db.collection('users').doc(memberUid).get()).data()?.commsOptOut === true) return false;
  return true;
}

async function sendInvitationEmail(d: Deps, ref: DocumentReference, inv: InvitationDoc & { id: string }, inviterName: string, reminder = false): Promise<boolean> {
  let ok = false;
  try { ok = await d.mail(buildEmail(d, inv, inviterName, reminder)); } catch (e: any) { console.error('invitation mail failed:', e?.message); }
  await ref.update(reminder
    ? { remindedAt: d.now }
    : { sends: FieldValue.increment(1), lastSentAt: d.now, deliveryFailed: !ok });
  return ok;
}

// ═════════════════════════════════════════════════════════════════════════════
// signed-in actions
// ═════════════════════════════════════════════════════════════════════════════
export async function runAction(d: Deps, uid: string, body: any, auth: { email?: string } = {}): Promise<Result> {
  if (!uid) throw new HttpError(401, 'Unauthorized');
  const secret = need(d);
  const users = d.db.collection('users');

  switch (body?.action) {
    case 'create': {
      const purpose = body.purpose as Purpose;
      if (!PURPOSES.includes(purpose)) throw new HttpError(400, 'Choose what you are inviting them to.');
      const kind = body.kind === 'email' ? 'email' : body.kind === 'link' ? 'link' : null;
      if (!kind) throw new HttpError(400, 'Choose email or link.');
      if (!(await hit(d.db, `create:${uid}`, LIMITS.CREATES_PER_HOUR, 3_600_000, d.now))) throw new HttpError(429, 'You have sent a lot of invitations. Please try again in a little while.');

      const me = await users.doc(uid).get();
      if (!me.exists) throw new HttpError(404, 'Account not found.');
      const inviterName = oneLine(me.data()!.displayName, 80) || 'A BeWatu member';
      const target = await resolveTarget(d.db, purpose, body.targetId, uid, me.data()!.numericId, d.now);
      const message = cleanMessage(body.message);
      const base = { inviterUid: uid, purpose, ...target, message, reminder: body.reminder === true };

      const make = async (extra: Partial<InvitationDoc> & { dedupe: string }) => {
        const id = newInvitationId();
        const doc: InvitationDoc = { ...base, kind, status: 'pending', createdAt: d.now, expiresAt: d.now + LIMITS.TTL_MS, sends: 0, lastSentAt: null, remindedAt: null, opens: 0, shares: 0, joinedCount: 0, completedCount: 0, ...extra } as InvitationDoc;
        const ref = d.db.collection('invitations').doc(id);
        await ref.set(doc);
        // A link only counts as an invitation once it is actually shared (see 'shared'); an email counts when it is made.
        if (kind === 'email') await track(d, 'created', { id, inviterUid: uid, purpose }, { kind });
        return { id, doc, ref };
      };

      if (kind === 'link') {
        const key = dedupeKey(secret, uid, purpose, target.targetId, 'link');
        const same = await d.db.collection('invitations').where('dedupe', '==', key).get();
        const live = same.docs.map(s => ({ ...(s.data() as InvitationDoc), id: s.id })).filter(i => usable(i, d.now)).sort((a, b) => b.createdAt - a.createdAt)[0];
        if (live) {
          // The same link again, with the latest wording if they changed it.
          if (message && message !== live.message) { await d.db.collection('invitations').doc(live.id).update({ message }); live.message = message; }
          return { invitation: view(live, d), reused: true };
        }
        const { id, doc } = await make({ dedupe: key });
        return { invitation: view({ ...doc, id }, d), reused: false };
      }

      // email: each address on its own, so one bad address never spoils the rest
      const seen = new Set<string>();
      const raw: unknown[] = Array.isArray(body.emails) ? body.emails : [];
      if (raw.length === 0) throw new HttpError(400, 'Add at least one email address.');
      if (raw.length > LIMITS.EMAILS_PER_REQUEST) throw new HttpError(400, `Invite up to ${LIMITS.EMAILS_PER_REQUEST} people at a time.`);
      const results: Result[] = [];
      for (const entry of raw) {
        const email = normalizeEmail(entry);
        if (!email) { results.push({ email: oneLine(entry, 60), result: 'invalid' }); continue; }
        if (seen.has(email)) continue;
        seen.add(email);
        if (auth.email && auth.email.toLowerCase() === email) { results.push({ email: maskEmail(email), result: 'self' }); continue; }
        const key = dedupeKey(secret, uid, purpose, target.targetId, emailHash(secret, email));
        const same = await d.db.collection('invitations').where('dedupe', '==', key).get();
        const open = same.docs.map(s => ({ ...(s.data() as InvitationDoc), id: s.id })).find(i => i.status !== 'revoked' && (i.expiresAt > d.now || i.joinedCount > 0));
        if (open) { results.push({ email: maskEmail(email), result: 'duplicate', invitation: view(open, d) }); continue; }
        // "not delivered" is the same answer whether they opted out or are a member who turned email off: it reveals nothing.
        if (!(await mayEmail(d, email))) { results.push({ email: maskEmail(email), result: 'not_delivered' }); continue; }
        const h = emailHash(secret, email);
        if (!(await hit(d.db, `email:${uid}`, LIMITS.EMAILS_PER_DAY, DAY, d.now))) { results.push({ email: maskEmail(email), result: 'limited', reason: 'daily' }); continue; }
        if (!(await hit(d.db, `recipient:${h}`, LIMITS.RECIPIENT_PER_WEEK, 7 * DAY, d.now))) { results.push({ email: maskEmail(email), result: 'limited', reason: 'recipient' }); continue; }
        const { id, doc, ref } = await make({ dedupe: key, recipientEmail: email, recipientHash: h });
        const ok = await sendInvitationEmail(d, ref, { ...doc, id }, inviterName);
        const fresh = { ...doc, id, sends: 1, lastSentAt: d.now, deliveryFailed: !ok };
        results.push({ email: maskEmail(email), result: ok ? 'sent' : 'failed', invitation: view(fresh, d) });
      }
      return { results };
    }

    case 'list': {
      const snap = await d.db.collection('invitations').where('inviterUid', '==', uid).limit(200).get();
      const items = snap.docs.map(s => view({ ...(s.data() as InvitationDoc), id: s.id }, d)).sort((a, b) => b.createdAt - a.createdAt);
      const me = (await users.doc(uid).get()).data();
      const joined = items.reduce((n, i) => n + i.joinedCount, 0);
      return { invitations: items, summary: { pending: items.filter(i => i.status === 'pending').length, joined, completed: items.reduce((n, i) => n + i.completedCount, 0) }, joinedAlerts: me?.inviteJoinedAlerts !== false };
    }

    case 'revoke': {
      const { ref, inv } = await loadOwned(d, uid, body.id);
      if (inv.status === 'revoked') return { invitation: view(inv, d) };
      if (inv.kind === 'email' && inv.joinedCount > 0) throw new HttpError(409, 'This person has already joined.');
      await ref.update({ status: 'revoked', revokedAt: d.now });
      await track(d, 'revoked', inv);
      return { invitation: view({ ...inv, status: 'revoked' }, d) };
    }

    case 'resend': {
      const { ref, inv } = await loadOwned(d, uid, body.id);
      if (inv.kind !== 'email' || !inv.recipientEmail) throw new HttpError(400, 'Only email invitations can be sent again.');
      if (statusOf(inv, d.now) !== 'pending') throw new HttpError(409, 'This invitation is no longer pending.');
      if (inv.sends >= LIMITS.MAX_SENDS) throw new HttpError(429, 'This invitation has already been sent three times.');
      if (inv.lastSentAt && d.now - inv.lastSentAt < LIMITS.RESEND_COOLDOWN_MS) throw new HttpError(429, 'You can send this again tomorrow.');
      if (!(await mayEmail(d, inv.recipientEmail))) throw new HttpError(409, 'This invitation could not be delivered.');
      if (!(await hit(d.db, `email:${uid}`, LIMITS.EMAILS_PER_DAY, DAY, d.now))) throw new HttpError(429, 'You have reached today\'s email limit.');
      if (!(await hit(d.db, `recipient:${inv.recipientHash}`, LIMITS.RECIPIENT_PER_WEEK, 7 * DAY, d.now))) throw new HttpError(429, 'This person has received enough invitations for now.');
      const me = (await users.doc(uid).get()).data();
      const ok = await sendInvitationEmail(d, ref, inv, oneLine(me?.displayName, 80) || 'A BeWatu member');
      if (!ok) throw new HttpError(502, 'The email could not be sent. Please try again.');
      return { invitation: view({ ...inv, sends: inv.sends + 1, lastSentAt: d.now, deliveryFailed: false }, d) };
    }

    case 'shared': {
      const { ref, inv } = await loadOwned(d, uid, body.id);
      if (inv.kind !== 'link') throw new HttpError(400, 'Only links are shared.');
      if (statusOf(inv, d.now) === 'revoked') throw new HttpError(409, 'This invitation was withdrawn.');
      const channel = ['copy', 'native', 'other'].includes(body.channel) ? body.channel : 'other';
      // Their note travels with the link: the page the person opens shows what the member wrote when they shared it.
      const message = body.message === undefined ? inv.message : cleanMessage(body.message);
      await ref.update({ shares: FieldValue.increment(1), message });
      if ((inv.shares ?? 0) === 0) await track(d, 'created', inv, { kind: 'link' });
      await track(d, 'shared', inv, { channel });
      return { ok: true };
    }

    case 'prefs': {
      if (typeof body.joinedAlerts === 'boolean') await users.doc(uid).set({ inviteJoinedAlerts: body.joinedAlerts }, { merge: true });
      return { joinedAlerts: (await users.doc(uid).get()).data()?.inviteJoinedAlerts !== false };
    }

    case 'accept': {
      const inv = await loadInvitation(d, body.token);
      if (!inv) throw new HttpError(404, 'This invitation link is not valid.', 'invalid');
      if (inv.inviterUid === uid) throw new HttpError(400, 'This is your own invitation link. Share it with someone else.', 'own');
      const joinRef = d.db.collection('invitation_joins').doc(`${inv.id}_${uid}`);
      const me = (await users.doc(uid).get()).data();
      if (!me) throw new HttpError(404, 'Account not found.');
      const created = typeof me.createdAt?.toMillis === 'function' ? me.createdAt.toMillis() : 0;
      const existingMember = created > 0 && created < inv.createdAt;
      const inviter = (await users.doc(inv.inviterUid).get()).data();
      // Only the person's own "Accept invitation" counts, and only a connect invitation connects anyone.
      const confirm = body.confirm === true && inv.purpose === 'connect';
      if (confirm) {
        if (!inviterAvailable(inviter)) throw new HttpError(409, 'The person who invited you is no longer on BeWatu, so this invitation can not be completed.', 'unavailable');
        if (me.numericId == null || inviter!.numericId == null) throw new HttpError(409, 'Your account is still being set up. Please try again in a moment.');
      }

      const already = (await joinRef.get()).exists;
      if (!already) {
        if (!usable(inv, d.now)) { const st = statusOf(inv, d.now); throw new HttpError(410, st === 'revoked' ? 'This invitation was withdrawn.' : st === 'expired' ? 'This invitation has expired.' : 'This invitation has already been used.', st === 'joined' ? 'used' : st); }
        const first = await d.db.runTransaction(async tx => {
          const fresh = await tx.get(d.db.collection('invitations').doc(inv.id));
          const cur = fresh.data() as InvitationDoc;
          if (!usable({ ...cur, id: inv.id } as any, d.now)) return false;
          tx.set(joinRef, { invitationId: inv.id, inviterUid: inv.inviterUid, inviteeUid: uid, purpose: inv.purpose, existingMember, joinedAt: d.now, completedAt: null, activation: 'pending' });
          tx.update(fresh.ref, { joinedCount: FieldValue.increment(1), status: 'joined' });
          return true;
        });
        if (!first) throw new HttpError(410, 'This invitation has already been used.', 'used');
        await track(d, existingMember ? 'accepted_existing' : 'signup_completed', inv, { existingMember });
      }

      let connection: ConnectionOutcome | null = null;
      if (confirm) {
        const join = (await joinRef.get()).data() ?? {};
        if (!join.acceptedAt) { await joinRef.update({ acceptedAt: d.now }); await track(d, 'accepted', inv, { existingMember }); }
        if (join.completedAt) {
          // Done once already. Never recreate a connection that has since ended: report what is true now.
          connection = (await liveConnections(d, uid, inv.inviterUid)).some(c => c.status === 'accepted') ? 'already_connected' : 'already_accepted';
        } else {
          connection = await connectOnAccept(d, inv, { uid, numericId: me.numericId }, { numericId: inviter!.numericId, privacySettings: inviter!.privacySettings });
          if (connection === 'connected' || connection === 'already_connected' || connection === 'requested' || connection === 'already_requested') {
            await joinRef.update({ completedAt: d.now });
            await d.db.collection('invitations').doc(inv.id).update({ completedCount: FieldValue.increment(1) });
            await track(d, 'completed', inv, { step: 'connect' });
          }
          if (connection === 'connected') await track(d, 'connected', inv, { mode: connectsOnAccept(inv) ? 'direct' : 'approved' });
        }
        if (!already) await notifyInviter(d, inv, me, existingMember, connection);
      } else if (!already) {
        await notifyInviter(d, inv, me, existingMember, null);
      }

      const dest = destinationFor(inv);
      const canConnect = dest.action === 'connect' ? (inviter?.privacySettings?.allowConnectionRequests !== false) : false;
      return {
        ok: true, alreadyAccepted: already, existingMember, purpose: inv.purpose, destination: dest,
        action: dest.action === 'connect' && !canConnect ? 'explore' : dest.action,
        connection, mode: inv.purpose === 'connect' ? (connectsOnAccept(inv) ? 'direct' : 'request') : null,
        inviter: inviter ? { uid: inv.inviterUid, numericId: inviter.numericId ?? null, name: oneLine(inviter.displayName, 80), username: inviter.username ?? null } : null,
        target: inv.targetId ? { id: inv.targetId, kind: inv.targetKind, name: inv.targetName } : null,
      };
    }

    // Can THIS member accept it? Read-only: nothing is written, counted or sent.
    case 'check': {
      if (!(await hit(d.db, `check:${uid}`, 120, 3_600_000, d.now))) throw new HttpError(429, 'Too many requests. Please try again in a little while.');
      const inv = await loadInvitation(d, body.token);
      if (!inv) throw new HttpError(404, 'This invitation link is not valid.', 'invalid');
      if (inv.inviterUid === uid) return { state: 'own' };
      const them = (await users.doc(inv.inviterUid).get()).data();
      if (!inviterAvailable(them)) return { state: 'unavailable' };
      const join = (await d.db.collection('invitation_joins').doc(`${inv.id}_${uid}`).get()).data();
      if (inv.purpose === 'connect') {
        const live = await liveConnections(d, uid, inv.inviterUid);
        // Someone already connected may see who it is (so the page can open their profile); nobody else is told anything about them.
        if (live.some(c => c.status === 'accepted')) return { state: 'already_connected', inviter: { numericId: them!.numericId ?? null, username: them!.username ?? null, name: oneLine(them!.displayName, 80) } };
        if (join?.completedAt) return { state: 'already_accepted' };
        if (!connectsOnAccept(inv) && live.some(c => c.mine && c.status === 'pending')) return { state: 'already_requested' };
      } else if (join?.completedAt) return { state: 'already_accepted' };
      if (!join) {
        const st = statusOf(inv, d.now);
        if (!usable(inv, d.now)) return { state: st === 'joined' ? 'used' : st };
      }
      return { state: 'ok' };
    }

    case 'complete': {
      const inv = await loadInvitation(d, body.token);
      if (!inv) throw new HttpError(404, 'This invitation link is not valid.');
      const joinRef = d.db.collection('invitation_joins').doc(`${inv.id}_${uid}`);
      const join = (await joinRef.get()).data();
      if (!join) throw new HttpError(409, 'Open the invitation first.');
      if (join.completedAt) return { ok: true, completed: true, already: true };
      const me = (await users.doc(uid).get()).data() ?? {};
      const done = await tookTheStep(d, inv, uid, me.numericId);
      if (!done) return { ok: true, completed: false };
      await joinRef.update({ completedAt: d.now });
      await d.db.collection('invitations').doc(inv.id).update({ completedCount: FieldValue.increment(1) });
      await track(d, 'completed', inv, { step: destinationFor(inv).action });
      return { ok: true, completed: true };
    }

    default: throw new HttpError(400, 'Unknown action.');
  }
}

/** Every connection between two members that has not been cancelled or declined, with who started it. */
async function liveConnections(d: Deps, me: string, other: string): Promise<{ ref: DocumentReference; status: string; mine: boolean }[]> {
  const col = d.db.collection('connections');
  const [a, b] = await Promise.all([col.where('senderUid', '==', me).where('receiverUid', '==', other).get(), col.where('senderUid', '==', other).where('receiverUid', '==', me).get()]);
  return [...a.docs.map(s => ({ s, mine: true })), ...b.docs.map(s => ({ s, mine: false }))]
    .filter(x => !DEAD_CONNECTION.includes(x.s.data().status))
    .map(x => ({ ref: x.s.ref, status: String(x.s.data().status), mine: x.mine }));
}

/**
 * The connection an accepted invitation stands for, written the way the rest of the app writes one: a `connections` document that
 * starts pending and is then accepted (functions/src/index.ts counts connections on that pending-to-accepted change, so it is not
 * created already accepted). Idempotent: pressing Accept twice, or on two devices, makes one connection.
 */
async function connectOnAccept(d: Deps, inv: InvitationDoc & { id: string }, me: { uid: string; numericId: number }, inviter: { numericId: number; privacySettings?: any }): Promise<ConnectionOutcome> {
  const live = await liveConnections(d, me.uid, inv.inviterUid);
  if (live.some(c => c.status === 'accepted')) return 'already_connected';
  const accept = (ref: DocumentReference) => ref.update({ status: 'accepted', updatedAt: FieldValue.serverTimestamp(), acceptedVia: 'invitation', invitationId: inv.id });
  const fromInviter = live.find(c => !c.mine);     // they already asked: accepting the invitation accepts that
  const fromMe = live.find(c => c.mine);
  const start = async (sender: { uid: string; numericId: number }, receiver: { uid: string; numericId: number }): Promise<DocumentReference | null> => {
    const ref = d.db.collection('connections').doc(`inv_${inv.id}_${me.uid}`);   // per person: a personal link is used by several
    try {
      await ref.create({ senderUid: sender.uid, senderNumericId: sender.numericId, receiverUid: receiver.uid, receiverNumericId: receiver.numericId, status: 'pending', via: 'invitation', invitationId: inv.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return ref;
    } catch (e: any) {
      if (e?.code !== 6 && !/already exists/i.test(String(e?.message))) throw e;
      const cur = (await ref.get()).data();
      return cur && !DEAD_CONNECTION.includes(cur.status) ? ref : null;   // one that has since ended is not revived
    }
  };
  const them = { uid: inv.inviterUid, numericId: inviter.numericId };

  if (connectsOnAccept(inv)) {
    const open = fromInviter ?? fromMe;
    if (open) { await accept(open.ref); return 'connected'; }
    const ref = await start(them, me);
    if (!ref) return 'already_accepted';
    await accept(ref);
    return 'connected';
  }

  // A personal link: the inviter approves.
  if (fromInviter) { await accept(fromInviter.ref); return 'connected'; }
  if (fromMe) return 'already_requested';
  if (inviter.privacySettings?.allowConnectionRequests === false) return 'not_accepting';
  const ref = await start(me, them);
  return ref ? 'requested' : 'already_accepted';
}

/** The step the invitation offered, checked against the real records. Looking at a challenge is not joining anything. */
async function tookTheStep(d: Deps, inv: InvitationDoc & { id: string }, uid: string, numericId: unknown): Promise<boolean> {
  const dest = destinationFor(inv);
  if (dest.action === 'connect') {
    const a = await d.db.collection('connections').where('senderUid', '==', uid).where('receiverUid', '==', inv.inviterUid).get();
    const b = await d.db.collection('connections').where('senderUid', '==', inv.inviterUid).where('receiverUid', '==', uid).get();
    const f = await d.db.collection('followRequests').where('senderUid', '==', uid).where('receiverUid', '==', inv.inviterUid).get();
    return [...a.docs, ...b.docs, ...f.docs].some(s => !['cancelled', 'declined'].includes(s.data().status));
  }
  if (dest.action === 'request_to_join' && inv.targetId) {
    for (const col of ['pods', 'circles']) {
      const s = await d.db.collection(col).doc(inv.targetId).get();
      if (!s.exists) continue;
      const p = s.data()!;
      const ids = [...(Array.isArray(p.members) ? p.members : []), ...(Array.isArray(p.pendingMembers) ? p.pendingMembers : [])];
      return ids.includes(uid) || (numericId != null && ids.includes(numericId));
    }
    return false;
  }
  if (dest.action === 'view_challenge' && inv.targetId) {
    const s = await d.db.collection('arena_challenges').doc(inv.targetId).collection('submissions').where('authorUid', '==', uid).limit(1).get();
    return !s.empty;
  }
  return false;
}

/** Tell the inviter someone arrived: not at all if they turned it off, and by name only if the newcomer's profile is public. */
async function notifyInviter(d: Deps, inv: InvitationDoc & { id: string }, invitee: Record<string, any>, existingMember: boolean, connection: ConnectionOutcome | null) {
  try {
    const inviter = (await d.db.collection('users').doc(inv.inviterUid).get()).data();
    if (!inviter || inviter.inviteJoinedAlerts === false) return;
    const who = publicIdentity(invitee)?.name;
    const name = who ?? 'Someone you invited';
    const message = connection === 'connected' ? `${name} accepted your invitation. You are now connected.`
      : connection === 'requested' ? `${name} accepted your invitation and asked to connect. Their request is waiting for you.`
      : existingMember ? `${name} accepted your invitation`
      : `${name} joined BeWatu from your invitation`;
    await d.db.collection('users').doc(inv.inviterUid).collection('notifications').add({
      type: 'invitation_joined', message, invitationId: inv.id, isRead: false, createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e: any) { console.error('invitation notify failed:', e?.code ?? e?.message); }
}

// ═════════════════════════════════════════════════════════════════════════════
// public: what the invitation says
// ═════════════════════════════════════════════════════════════════════════════
export async function previewInvitation(d: Deps, token: unknown, ua: unknown, ip: string, quiet = false): Promise<{ status: number; body: Result }> {
  const secret = need(d);
  if (!(await hit(d.db, `open:${clientKey(secret, ip)}`, LIMITS.OPEN_PER_HOUR_PER_IP, 3_600_000, d.now))) return { status: 429, body: { state: 'busy', error: 'Too many requests. Please try again in a little while.' } };
  const inv = await loadInvitation(d, token);
  if (!inv) return { status: 404, body: { state: 'invalid', error: 'This invitation link is not valid.' } };
  const st = statusOf(inv, d.now);
  const inviterDoc = (await d.db.collection('users').doc(inv.inviterUid).get()).data();
  const inviter = publicIdentity(inviterDoc);
  const bot = isBot(ua);
  // `quiet` is the signed-in app looking again after sign-up: the person already counted as having opened it.
  if (st !== 'revoked' && !quiet) {
    // Link previews and scanners are counted apart, so "opened" means a person.
    await track(d, bot ? 'opened_bot' : 'opened', inv);
    if (!bot) await d.db.collection('invitations').doc(inv.id).update({ opens: FieldValue.increment(1) }).catch(() => {});
  }
  if (st === 'revoked') return { status: 410, body: { state: 'revoked', error: 'This invitation was withdrawn.' } };
  const dest = destinationFor(inv);
  const gone = !inviterAvailable(inviterDoc);
  return {
    status: 200,
    body: {
      state: gone ? 'unavailable' : usable(inv, d.now) ? 'ok' : st === 'expired' ? 'expired' : 'used',
      purpose: inv.purpose,
      // What accepting will do, so the page can say so before the tap: a named invitation connects, a shared link asks.
      mode: inv.purpose === 'connect' ? (connectsOnAccept(inv) ? 'direct' : 'request') : null,
      inviter,                                                                  // null unless their profile is public
      message: inv.message || null,
      // A private Pod is not named to someone who is not in it yet.
      target: inv.targetId ? { kind: inv.targetKind, name: inv.targetPublic ? inv.targetName : null, private: !inv.targetPublic } : null,
      action: dest.action, expiresAt: inv.expiresAt,
    },
  };
}

/** The person pressed a button on the invitation page. A press is only a press: `accept_clicked` is not a connection. */
export async function markStarted(d: Deps, token: unknown, ip: string, ua: unknown, step: { intent?: unknown; path?: unknown } = {}): Promise<void> {
  const secret = need(d);
  if (isBot(ua)) return;
  if (!(await hit(d.db, `started:${clientKey(secret, ip)}`, LIMITS.STARTED_PER_HOUR_PER_IP, 3_600_000, d.now))) return;
  const inv = await loadInvitation(d, token);
  if (!inv || !usable(inv, d.now)) return;
  if (step.intent === 'accept') await track(d, 'accept_clicked', inv);
  // Creating an account is "sign up started"; signing in is not. A press with no detail is the older page: sign up.
  if (step.intent !== 'accept' || step.path === 'register') await track(d, 'signup_started', inv);
}

// ═════════════════════════════════════════════════════════════════════════════
// link previews (WhatsApp, iMessage, LinkedIn, Slack...)
// ═════════════════════════════════════════════════════════════════════════════
const PREVIEW_WHAT: Record<Purpose, string> = { connect: 'to connect on BeWatu', community: 'to join a community on BeWatu', pod: 'to join a Pod on BeWatu', arena: 'to explore an Arena challenge on BeWatu' };
/**
 * The title and description a chat app shows for an invitation link. Privacy first: the inviter's FIRST name appears only when their
 * profile is public (the same rule as the page); the personal note, the Pod or challenge name, the address the invitation was sent to
 * and the token never appear; an expired, withdrawn or unknown link looks exactly like any other. Never indexed.
 */
export function previewCard(p: { state?: string; purpose?: Purpose; inviter?: { name: string } | null }): { title: string; description: string } {
  const first = p.state === 'ok' ? (p.inviter?.name ?? '').trim().split(/\s+/)[0] : '';
  if (!first || !p.purpose) return { title: "You've been invited to BeWatu", description: 'Accept your invitation to join a professional network built on good connections.' };
  return {
    title: `${first} invited you ${PREVIEW_WHAT[p.purpose]}`,
    description: p.purpose === 'connect' ? `Join ${first} on BeWatu to connect, exchange ideas, and discover opportunities together.` : 'Good connections make great things possible.',
  };
}
export async function shareCard(d: Deps, token: unknown, ua: unknown, ip: string): Promise<string> {
  let card = previewCard({});
  try { const r = await previewInvitation(d, token, ua, ip); if (r.status === 200) card = previewCard(r.body as any); } catch { /* a generic card is always safe */ }
  const origin = originOf(d);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><title>${esc(card.title)}</title>`
    + `<meta property="og:site_name" content="BeWatu"><meta property="og:type" content="website"><meta property="og:title" content="${esc(card.title)}"><meta property="og:description" content="${esc(card.description)}"><meta property="og:image" content="${origin}/android-chrome-512x512.png">`
    + `<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(card.title)}"><meta name="twitter:description" content="${esc(card.description)}"></head><body><p>${esc(card.title)}</p></body></html>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// "don't invite me again"
// ═════════════════════════════════════════════════════════════════════════════
export async function suppress(d: Deps, h: unknown, t: unknown, undo = false): Promise<boolean> {
  if (!optoutOk(d.secret, h, t)) return false;
  const ref = d.db.collection('email_suppressions').doc(h as string);
  if (undo) await ref.delete(); else await ref.set({ at: d.now, reason: 'invite_optout' });
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// daily: one reminder (only when the member asked for it), and who became active
// ═════════════════════════════════════════════════════════════════════════════
export async function runDaily(d: Deps): Promise<{ reminded: number; activated: number; lapsed: number }> {
  need(d);
  let reminded = 0, activated = 0, lapsed = 0;

  const pending = await d.db.collection('invitations').where('status', '==', 'pending').limit(500).get();
  for (const s of pending.docs) {
    const inv = { ...(s.data() as InvitationDoc), id: s.id };
    if (inv.expiresAt <= d.now && inv.joinedCount === 0 && !(s.data() as any).expiryTracked) { await track(d, 'expired', inv); await s.ref.update({ expiryTracked: true }); continue; }
    if (inv.kind !== 'email' || !inv.reminder || inv.remindedAt || inv.sends !== 1 || inv.deliveryFailed) continue;
    if (d.now - inv.createdAt < LIMITS.REMINDER_AFTER_MS || inv.expiresAt <= d.now + DAY) continue;
    if (!inv.recipientEmail || !(await mayEmail(d, inv.recipientEmail))) continue;
    if (!(await hit(d.db, `recipient:${inv.recipientHash}`, LIMITS.RECIPIENT_PER_WEEK, 7 * DAY, d.now))) continue;
    const name = oneLine((await d.db.collection('users').doc(inv.inviterUid).get()).data()?.displayName, 80) || 'A BeWatu member';
    if (await sendInvitationEmail(d, s.ref, inv, name, true)) { reminded++; await track(d, 'reminded', inv); }
    else await s.ref.update({ remindedAt: d.now });   // one attempt only
  }

  const joins = await d.db.collection('invitation_joins').where('activation', '==', 'pending').limit(500).get();
  for (const s of joins.docs) {
    const j = s.data();
    if (d.now - j.joinedAt > LIMITS.ACTIVATION_WINDOW_MS) { await s.ref.update({ activation: 'lapsed' }); lapsed++; continue; }
    if (await isActive(d, j.inviteeUid)) {
      await s.ref.update({ activation: 'activated', activatedAt: d.now });
      await track(d, 'activated', { id: j.invitationId, inviterUid: j.inviterUid, purpose: j.purpose });
      activated++;
    }
  }
  return { reminded, activated, lapsed };
}

/** Real engagement: an accepted connection, a seat in a Pod, or a Prove reel. Joining alone is not activity. */
async function isActive(d: Deps, uid: string): Promise<boolean> {
  const me = (await d.db.collection('users').doc(uid).get()).data();
  const [a, b, reels, pods, circles] = await Promise.all([
    d.db.collection('connections').where('senderUid', '==', uid).where('status', '==', 'accepted').limit(1).get(),
    d.db.collection('connections').where('receiverUid', '==', uid).where('status', '==', 'accepted').limit(1).get(),
    d.db.collection('reels').where('authorUid', '==', uid).limit(1).get(),
    d.db.collection('pods').where('members', 'array-contains', uid).limit(1).get(),
    me?.numericId != null ? d.db.collection('circles').where('members', 'array-contains', me.numericId).limit(1).get() : Promise.resolve({ empty: true }),
  ]);
  return !a.empty || !b.empty || !reels.empty || !pods.empty || !(circles as any).empty;
}

// ═════════════════════════════════════════════════════════════════════════════
// HTTP
// ═════════════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com'];

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}
async function resendMail(m: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: 'BeWatu <noreply@bewatu.com>', to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }),
  });
  if (!r.ok) console.error('Resend error:', await r.text());
  return r.ok;
}
const ipOf = (req: VercelRequest) => {
  const f = req.headers['x-forwarded-for'];
  return ((Array.isArray(f) ? f[0] : f)?.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
};
const page = (title: string, inner: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="margin:0;background:#f5f5f4;font-family:Inter,Helvetica,Arial,sans-serif;color:#1c1917"><main style="max-width:460px;margin:60px auto;padding:0 18px"><div style="font-weight:800;color:#1a4a3a;font-size:20px;margin-bottom:16px">BeWatu</div><div style="background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:26px">${inner}</div></main></body></html>`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = (k: string) => { const v = req.query?.[k]; return Array.isArray(v) ? v[0] : v; };
  try {
    const db = getFirestore(getAdminApp());
    const d: Deps = {
      db, secret: process.env.INVITATION_SECRET ?? process.env.COMMS_UNSUBSCRIBE_SECRET, now: Date.now(), mail: resendMail,
      memberByEmail: async email => { try { return (await getAuth(getAdminApp()).getUserByEmail(email)).uid; } catch { return null; } },
    };

    // the email's "don't invite me again": a GET only asks, a POST (also what a mail app's one-click button sends) does it
    if (q('optout')) {
      const h = q('e'), t = q('t');
      const link = `/api/invitations?optout=1&e=${encodeURIComponent(String(h))}&t=${encodeURIComponent(String(t))}`;
      const html = (s: number, title: string, inner: string) => res.status(s).setHeader('Content-Type', 'text/html; charset=utf-8').send(page(title, inner));
      if (!optoutOk(d.secret, h, t)) return html(400, 'Link not valid', '<h1 style="margin:0 0 10px;font-size:20px">This link isn\'t valid</h1><p style="margin:0;line-height:1.6;color:#57534e">It may be incomplete. Write to support@bewatu.com and we\'ll help.</p>');
      if (req.method === 'POST') {
        const undo = q('a') === 'undo';
        await suppress(d, h, t, undo);
        return undo
          ? html(200, 'Invitations on', '<h1 style="margin:0 0 10px;font-size:20px">Invitations are back on</h1><p style="margin:0;line-height:1.6;color:#57534e">Members can invite this address to BeWatu again.</p>')
          : html(200, 'Done', `<h1 style="margin:0 0 10px;font-size:20px">We won't send you invitations</h1><p style="margin:0 0 18px;line-height:1.6;color:#57534e">Nobody can invite this address to BeWatu by email any more.</p><form method="POST" action="${esc(link)}&amp;a=undo"><button type="submit" style="background:#fff;color:#1a4a3a;border:1px solid #1a4a3a;border-radius:10px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer">Changed your mind? Undo</button></form>`);
      }
      return html(200, 'Stop invitations', `<h1 style="margin:0 0 10px;font-size:20px">Stop BeWatu invitations?</h1><p style="margin:0 0 18px;line-height:1.6;color:#57534e">Members will no longer be able to invite this address to BeWatu by email.</p><form method="POST" action="${esc(link)}"><button type="submit" style="background:#1a4a3a;color:#fff;border:0;border-radius:10px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer">Don't invite me again</button></form>`);
    }

    if (q('cron')) {
      const cs = process.env.CRON_SECRET;
      if (!cs || req.headers.authorization !== `Bearer ${cs}`) return res.status(401).json({ error: 'Unauthorized' });
      return res.status(200).json(await runDaily(d));
    }

    // Link previews: vercel.json sends only crawlers here (people get the app). Nothing private goes in a preview.
    if (req.method === 'GET' && q('og')) {
      const out = await shareCard(d, q('t'), req.headers['user-agent'], ipOf(req));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(out);
    }
    if (req.method === 'GET') {
      const out = await previewInvitation(d, q('token'), req.headers['user-agent'], ipOf(req), q('resume') === '1');
      return res.status(out.status).json(out.body);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (req.body?.action === 'started') {
      await markStarted(d, req.body.token, ipOf(req), req.headers['user-agent'], { intent: req.body.intent, path: req.body.path });
      return res.status(200).json({ ok: true });
    }

    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = await getAuth(getAdminApp()).verifyIdToken(h.slice(7));
    return res.status(200).json(await runAction(d, decoded.uid, req.body ?? {}, { email: decoded.email }));
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, ...(e.state ? { state: e.state } : {}) });
    if (e?.code === 'auth/argument-error' || e?.code === 'auth/id-token-expired' || e?.code === 'auth/invalid-id-token') return res.status(401).json({ error: 'Please sign in again.' });
    console.error('invitations error:', e?.code ?? e?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
