/**
 * api/ops/comms.ts
 * POST /api/ops/comms
 * ─────────────────────────────────────────────────────────────────────────────
 * How BeWatu staff talk to members from the ops console: in-app notifications
 * (the bell), email, and a site-wide banner, to everyone or to a chosen group.
 *
 *   preview   who would receive it (a count and a few masked examples)
 *   test      send it to yourself only
 *   send      create the campaign and start delivering
 *   continue  deliver the next batch (a send is chunked, so it never hits a
 *             function timeout and can be resumed)
 *   cancel    stop delivering; takes a banner down
 *   list/get  history and progress
 *
 * Safety rails (each one is tested):
 *  - Staff only (active ops_staff). Managers and the platform admin can send;
 *    agents and auditors cannot. Sending to everyone, a critical alert, or a
 *    banner needs the platform admin.
 *  - `send` must carry the recipient count the sender saw in the preview. If the
 *    audience has changed since, nothing is sent.
 *  - Delivery is idempotent: notifications have a fixed id per campaign, emails
 *    carry an idempotency key per batch, and the cursor moves with the writes.
 *    Resuming after a crash or a double click cannot message anyone twice.
 *  - Two kinds of email. "service" (account, security, policy) reaches everyone.
 *    "updates" (news, features) skips anyone who unsubscribed and always carries
 *    a signed unsubscribe link; it is refused if COMMS_UNSUBSCRIBE_SECRET is unset.
 *  - Nothing sensitive leaves the server: previews show masked emails only, and
 *    message text is escaped before it goes into HTML.
 *  - Every campaign is written to audit_log with who, what and how many.
 *
 * Env: RESEND_API_KEY, COMMS_UNSUBSCRIBE_SECRET (for "updates" email),
 *      FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or FIREBASE_SERVICE_ACCOUNT),
 *      FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY (only for "specific people by email").
 * Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ── Policy ───────────────────────────────────────────────────────────────────
export const COMPOSE_ROLES = ['platform_admin', 'support_manager', 'trust_manager', 'legal_manager'];
export const VIEW_ROLES    = [...COMPOSE_ROLES, 'auditor'];
const ADMIN_ONLY_RECIPIENTS = 500;         // more recipients than this needs the platform admin
const MAX_SPECIFIC = 200;
const PAGE = 300;                          // users examined per batch
const BATCH_BUDGET_MS = 7000;              // stop starting new batches after this
const LOCK_MS = 30_000;
const MAX_SCAN = 50_000;
const CAMPAIGNS_PER_DAY = 10;
const TESTS_PER_HOUR = 10;
const EXCLUDED_STATUS = new Set(['deactivated', 'pending_deletion', 'suspended', 'banned', 'deleted']);
const APP_URL = 'https://www.bewatu.com';

export type Channel = 'notification' | 'email' | 'banner';
export type Severity = 'info' | 'warning' | 'critical';
export type EmailCategory = 'service' | 'updates';

export interface Audience {
  kind: 'all' | 'segment' | 'specific';
  roles?: ('member' | 'recruiter')[];
  founding?: boolean;
  industries?: string[];
  tiers?: string[];
  joinedAfter?: string;
  joinedBefore?: string;
  inactiveDays?: number;
  emails?: string[];
  uids?: string[];
}

export interface Message {
  title: string;
  body: string;
  severity: Severity;
  link?: string;
  linkLabel?: string;
  emailSubject?: string;
  emailCategory: EmailCategory;
  bannerEndsAt?: string;
  bannerDismissible?: boolean;
}

export interface Staff { uid: string; email: string; role: string }
export interface OutgoingEmail { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
export interface Deps {
  sendEmails: (batch: OutgoingEmail[], idempotencyKey: string) => Promise<{ failed: number }>;
  lookupUidsByEmail: (emails: string[]) => Promise<Map<string, string>>;
  unsubscribeSecret: string | undefined;
}

// ── Small helpers ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const httpsOrNull = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try { const u = new URL(raw.trim()); return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null; } catch { return null; }
};
export const maskEmail = (e: string | null | undefined) => { if (!e) return null; const at = e.indexOf('@'); return at < 1 ? '***' : `${e[0]}***${e.slice(at)}`; };
const toMs = (v: any): number | null => {
  if (v == null) return null; if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis(); if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null;
};
const firstName = (name: unknown) => (typeof name === 'string' ? name.trim().split(/\s+/)[0] : '') || 'there';

export function unsubscribeToken(secret: string, uid: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${uid}`).digest('hex');
}
export function verifyUnsubscribe(secret: string, uid: string, token: string): boolean {
  const a = Buffer.from(unsubscribeToken(secret, uid)), b = Buffer.from(String(token ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Validation ───────────────────────────────────────────────────────────────
export function validateMessage(raw: any, channels: Channel[]): Message {
  const title = clean(raw?.title, 90);
  const body = clean(raw?.body, 1500);
  if (title.length < 3) throw new HttpError(400, 'Add a title of at least 3 characters.');
  if (body.length < 3) throw new HttpError(400, 'Write the message.');
  const severity: Severity = (['info', 'warning', 'critical'] as const).includes(raw?.severity) ? raw.severity : 'info';
  let link: string | undefined; let linkLabel: string | undefined;
  if (raw?.link) {
    link = httpsOrNull(raw.link) ?? undefined;
    if (!link) throw new HttpError(400, 'The link must be a secure https:// address.');
    linkLabel = clean(raw?.linkLabel, 40) || 'Learn more';
  }
  const emailCategory: EmailCategory = raw?.emailCategory === 'service' ? 'service' : 'updates';
  const m: Message = { title, body, severity, link, linkLabel, emailCategory, emailSubject: clean(raw?.emailSubject, 150) || title };
  if (channels.includes('banner')) {
    const ends = toMs(raw?.bannerEndsAt);
    if (ends == null || ends <= Date.now()) throw new HttpError(400, 'Choose when the banner should end (in the future).');
    if (ends - Date.now() > 90 * 86400000) throw new HttpError(400, 'A banner can run for at most 90 days.');
    m.bannerEndsAt = new Date(ends).toISOString(); m.bannerDismissible = raw?.bannerDismissible !== false;
  }
  return m;
}

export function validateAudience(raw: any): Audience {
  const kind = raw?.kind;
  if (kind === 'all') return { kind };
  if (kind === 'specific') {
    const emails = Array.isArray(raw.emails) ? [...new Set(raw.emails.map((e: unknown) => clean(e, 200).toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))] as string[] : [];
    const uids = Array.isArray(raw.uids) ? [...new Set(raw.uids.map((u: unknown) => clean(u, 128)).filter((u: string) => u && !u.includes('/')))] as string[] : [];
    if (emails.length + uids.length === 0) throw new HttpError(400, 'Add at least one email address or member id.');
    if (emails.length + uids.length > MAX_SPECIFIC) throw new HttpError(400, `Choose at most ${MAX_SPECIFIC} specific people. Use a group for more.`);
    return { kind, emails, uids };
  }
  if (kind === 'segment') {
    const a: Audience = { kind };
    const roles = (Array.isArray(raw.roles) ? raw.roles : []).filter((r: unknown) => r === 'member' || r === 'recruiter');
    if (roles.length) a.roles = [...new Set(roles)] as Audience['roles'];
    if (raw.founding === true || raw.founding === false) a.founding = raw.founding;
    const industries = (Array.isArray(raw.industries) ? raw.industries : []).map((i: unknown) => clean(i, 60).toLowerCase()).filter(Boolean).slice(0, 20);
    if (industries.length) a.industries = industries;
    const tiers = (Array.isArray(raw.tiers) ? raw.tiers : []).map((t: unknown) => clean(t, 30).toLowerCase()).filter(Boolean).slice(0, 10);
    if (tiers.length) a.tiers = tiers;
    for (const k of ['joinedAfter', 'joinedBefore'] as const) { const ms = toMs(raw[k]); if (ms != null) a[k] = new Date(ms).toISOString(); }
    if (Number.isInteger(raw.inactiveDays) && raw.inactiveDays >= 1 && raw.inactiveDays <= 3650) a.inactiveDays = raw.inactiveDays;
    if (Object.keys(a).length === 1) throw new HttpError(400, 'Choose at least one filter, or pick "Everyone".');
    return a;
  }
  throw new HttpError(400, 'Choose who this is for.');
}

export function validateChannels(raw: any): Channel[] {
  const ch = [...new Set((Array.isArray(raw) ? raw : []).filter((c: unknown) => c === 'notification' || c === 'email' || c === 'banner'))] as Channel[];
  if (ch.length === 0) throw new HttpError(400, 'Choose how to send it: notification, email or banner.');
  return ch;
}

// ── Who matches ──────────────────────────────────────────────────────────────
export function isEligible(u: Record<string, any>): boolean {
  return !EXCLUDED_STATUS.has(String(u.status ?? '').toLowerCase());
}

export function matchesSegment(u: Record<string, any>, a: Audience, now: number): boolean {
  if (a.roles?.length) {
    const kind = u.isRecruiter === true ? 'recruiter' : 'member';
    if (!a.roles.includes(kind)) return false;
  }
  if (a.founding !== undefined && (u.foundingMember === true) !== a.founding) return false;
  if (a.industries?.length && !a.industries.includes(String(u.industry ?? '').toLowerCase())) return false;
  if (a.tiers?.length && !a.tiers.includes(String(u.subscriptionTier ?? 'free').toLowerCase())) return false;
  const created = toMs(u.createdAt);
  if (a.joinedAfter && !(created != null && created >= new Date(a.joinedAfter).getTime())) return false;
  if (a.joinedBefore && !(created != null && created <= new Date(a.joinedBefore).getTime())) return false;
  if (a.inactiveDays) {
    const last = toMs(u.lastActiveAt);
    if (last != null && now - last < a.inactiveDays * 86400000) return false;
  }
  return true;
}

async function resolveSpecific(db: Firestore, a: Audience, deps: Deps): Promise<string[]> {
  const uids = new Set<string>(a.uids ?? []);
  if (a.emails?.length) { const m = await deps.lookupUidsByEmail(a.emails); m.forEach(uid => uids.add(uid)); }
  const out: string[] = [];
  const refs = [...uids].map(u => db.collection('users').doc(u));
  for (let i = 0; i < refs.length; i += PAGE) {
    const snaps = await db.getAll(...refs.slice(i, i + PAGE));
    snaps.forEach(s => { if (s.exists && isEligible(s.data()!)) out.push(s.id); });
  }
  return out.sort();
}

interface Scan { matched: number; examined: number; truncated: boolean; samples: { name: string; email: string | null }[]; withEmail: number; optedOut: number; noEmail: number; uids?: string[] }

async function contactEmails(db: Firestore, uids: string[], legacy: Map<string, any>): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < uids.length; i += PAGE) {
    const chunk = uids.slice(i, i + PAGE);
    const snaps = await db.getAll(...chunk.map(u => db.doc(`users/${u}/private/contact`)));
    snaps.forEach((s, n) => {
      const uid = chunk[n];
      const e = clean(s.data()?.email ?? legacy.get(uid)?.email, 200).toLowerCase();
      out.set(uid, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null);
    });
  }
  return out;
}

async function scanAudience(db: Firestore, a: Audience, channels: Channel[], emailCategory: EmailCategory, deps: Deps, now: number): Promise<Scan> {
  const wantEmail = channels.includes('email');
  const updates = emailCategory === 'updates';
  const scan: Scan = { matched: 0, examined: 0, truncated: false, samples: [], withEmail: 0, optedOut: 0, noEmail: 0 };

  const account = async (rows: { uid: string; data: Record<string, any> }[]) => {
    const emails = wantEmail ? await contactEmails(db, rows.map(r => r.uid), new Map(rows.map(r => [r.uid, r.data]))) : new Map<string, string | null>();
    for (const r of rows) {
      scan.matched++;
      if (wantEmail) {
        const e = emails.get(r.uid) ?? null;
        if (!e) scan.noEmail++;
        else if (updates && r.data.commsOptOut === true) scan.optedOut++;
        else scan.withEmail++;
        if (scan.samples.length < 5) scan.samples.push({ name: firstName(r.data.displayName), email: maskEmail(e) });
      } else if (scan.samples.length < 5) scan.samples.push({ name: firstName(r.data.displayName), email: null });
    }
  };

  if (a.kind === 'specific') {
    const uids = await resolveSpecific(db, a, deps); scan.uids = uids; scan.examined = uids.length;
    const refs = uids.map(u => db.collection('users').doc(u));
    for (let i = 0; i < refs.length; i += PAGE) {
      const snaps = await db.getAll(...refs.slice(i, i + PAGE));
      await account(snaps.map(s => ({ uid: s.id, data: s.data() ?? {} })));
    }
    return scan;
  }

  let cursor: string | null = null;
  for (;;) {
    let q = db.collection('users').orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    scan.examined += snap.size;
    const rows = snap.docs.map(d => ({ uid: d.id, data: d.data() })).filter(r => isEligible(r.data) && (a.kind === 'all' || matchesSegment(r.data, a, now)));
    await account(rows);
    cursor = snap.docs[snap.docs.length - 1].id;
    if (scan.examined >= MAX_SCAN) { scan.truncated = true; break; }
    if (snap.size < PAGE) break;
  }
  return scan;
}

// ── Message rendering ────────────────────────────────────────────────────────
function render(m: Message, name: string, unsubUrl: string | null): { subject: string; html: string; text: string } {
  const fill = (s: string) => fillName(s, name);
  const body = fill(m.body), title = fill(m.title), subject = fill(m.emailSubject ?? m.title);
  const paras = body.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.6;color:#44403c;font-size:15px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const cta = m.link ? `<p style="margin:22px 0 4px"><a href="${esc(m.link)}" style="background:#1a4a3a;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;font-size:14px;display:inline-block">${esc(m.linkLabel ?? 'Learn more')}</a></p>` : '';
  const footer = unsubUrl
    ? `You're receiving this because you have a BeWatu account. <a href="${esc(unsubUrl)}" style="color:#78716c">Unsubscribe from product updates</a>. Important account and security messages will still reach you.`
    : 'This is an important message about your BeWatu account.';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Inter,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:28px 16px"><div style="font-weight:800;color:#1a4a3a;font-size:20px;margin-bottom:18px">BeWatu</div><div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:26px"><h1 style="margin:0 0 14px;font-size:20px;color:#1c1917">${esc(title)}</h1>${paras}${cta}</div><p style="font-size:12px;color:#78716c;line-height:1.5;margin:16px 4px 0">${footer}</p></div></body></html>`;
  const text = `${title}\n\n${body}\n${m.link ? `\n${m.linkLabel ?? 'Learn more'}: ${m.link}\n` : ''}\n--\n${unsubUrl ? `Unsubscribe from product updates: ${unsubUrl}` : 'This is an important message about your BeWatu account.'}`;
  return { subject, html, text };
}

// ── Staff / limits / audit ───────────────────────────────────────────────────
function canSendToEveryone(role: string) { return role === 'platform_admin'; }

async function takeToken(db: Firestore, key: string, windowMs: number, max: number, message: string, now: number) {
  const ref = db.collection('ops_reveal_rate_limits').doc(key);
  await db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() as { windowStart?: number; count?: number } | undefined;
    const inWindow = !!cur?.windowStart && now - cur.windowStart < windowMs;
    const count = inWindow ? (cur?.count ?? 0) : 0;
    if (count >= max) throw new HttpError(429, message);
    tx.set(ref, { windowStart: inWindow ? cur!.windowStart : now, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

async function audit(db: Firestore, staff: Staff, ip: string, e: { action: string; targetId: string; after?: any; reason: string }) {
  await db.collection('audit_log').add({
    action: e.action, actorUid: staff.uid, actorEmail: staff.email, actorRole: staff.role,
    targetId: e.targetId, targetType: 'comms_campaign', before: null, after: e.after ?? null,
    reason: e.reason, ip, requiresApproval: false, approved: false, ts: FieldValue.serverTimestamp(),
  });
}

const requireCompose = (s: Staff) => { if (!COMPOSE_ROLES.includes(s.role)) throw new HttpError(403, 'Your role cannot send messages to members.'); };

function checkAuthority(staff: Staff, a: Audience, channels: Channel[], m: Message, matched: number) {
  if (a.kind === 'all' && !canSendToEveryone(staff.role)) throw new HttpError(403, 'Only a platform admin can message everyone. Choose a group or specific people.');
  if (matched > ADMIN_ONLY_RECIPIENTS && !canSendToEveryone(staff.role)) throw new HttpError(403, `Messages to more than ${ADMIN_ONLY_RECIPIENTS} members need a platform admin.`);
  if (channels.includes('banner') && !canSendToEveryone(staff.role)) throw new HttpError(403, 'Only a platform admin can put up a site-wide banner.');
  if (m.severity === 'critical' && !canSendToEveryone(staff.role)) throw new HttpError(403, 'Only a platform admin can send a critical alert.');
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function preview(db: Firestore, staff: Staff, body: any, deps: Deps, now: number) {
  requireCompose(staff);
  const channels = validateChannels(body.channels);
  const audience = validateAudience(body.audience);
  const category: EmailCategory = body.message?.emailCategory === 'service' ? 'service' : 'updates';
  const scan = await scanAudience(db, audience, channels, category, deps, now);
  const warnings: string[] = [];
  const updates = category === 'updates';
  if (channels.includes('email') && updates && !deps.unsubscribeSecret) warnings.push('Product-update emails are switched off until COMMS_UNSUBSCRIBE_SECRET is set on the server. Use an account/security (service) email, or ask an engineer to set it.');
  if (scan.truncated) warnings.push('This audience is very large; only the first part was counted.');
  if (audience.kind === 'specific' && scan.matched === 0) warnings.push('None of those people matched an active member account.');
  return {
    audience: { count: scan.matched, examined: scan.examined },
    email: channels.includes('email') ? { willSend: scan.withEmail, noEmailOnFile: scan.noEmail, unsubscribed: scan.optedOut } : null,
    samples: scan.samples,
    needsPlatformAdmin: audience.kind === 'all' || scan.matched > ADMIN_ONLY_RECIPIENTS || channels.includes('banner'),
    warnings,
  };
}

const fillName = (s: string, name: string) => s.replace(/\{\{\s*firstName\s*\}\}/gi, name);

function notificationDoc(c: { id: string; title: string; body: string; severity: Severity; link?: string; linkLabel?: string }, name = 'there') {
  return {
    type: 'announcement', title: fillName(c.title, name), message: fillName(c.body, name), severity: c.severity, link: c.link ?? null, linkLabel: c.linkLabel ?? null,
    campaignId: c.id, source: 'ops', isRead: false, createdAt: FieldValue.serverTimestamp(),
  };
}

async function test(db: Firestore, staff: Staff, body: any, deps: Deps, now: number) {
  requireCompose(staff);
  const channels = validateChannels(body.channels).filter(c => c !== 'banner');
  if (channels.length === 0) throw new HttpError(400, 'A test goes to you as a notification or an email. Choose one of those.');
  const m = validateMessage(body.message, channels);
  await takeToken(db, `comms_test_${staff.uid}`, 3_600_000, TESTS_PER_HOUR, 'Too many tests. Try again later.', now);
  const result: Record<string, unknown> = { ok: true, sentTo: {} as Record<string, string> };
  if (channels.includes('notification')) {
    const me = await db.collection('users').doc(staff.uid).get();
    if (me.exists) { await db.doc(`users/${staff.uid}/notifications/comms_test_${now}`).set(notificationDoc({ id: 'test', ...m })); (result.sentTo as any).notification = 'your member account'; }
    else (result.sentTo as any).notification = 'skipped: your staff login has no member account';
  }
  if (channels.includes('email')) {
    if (m.emailCategory === 'updates' && !deps.unsubscribeSecret) throw new HttpError(409, 'Product-update emails need COMMS_UNSUBSCRIBE_SECRET on the server. Test as an account/security email, or set it first.');
    const unsub = m.emailCategory === 'updates' && deps.unsubscribeSecret ? `${APP_URL}/api/unsubscribe?u=${encodeURIComponent(staff.uid)}&t=${unsubscribeToken(deps.unsubscribeSecret, staff.uid)}` : null;
    const r = render(m, firstName(staff.email.split('@')[0]), unsub);
    const out = await deps.sendEmails([{ to: staff.email, subject: `[TEST] ${r.subject}`, html: r.html, text: r.text }], `test:${staff.uid}:${now}`);
    if (out.failed) throw new HttpError(502, 'The email provider did not accept the test email.');
    (result.sentTo as any).email = maskEmail(staff.email);
  }
  return result;
}

async function send(db: Firestore, staff: Staff, ip: string, body: any, deps: Deps, now: number) {
  requireCompose(staff);
  const channels = validateChannels(body.channels);
  const audience = validateAudience(body.audience);
  const m = validateMessage(body.message, channels);
  const expected = Number.isInteger(body.expectedCount) ? body.expectedCount : -1;

  if (channels.includes('email') && m.emailCategory === 'updates' && !deps.unsubscribeSecret) throw new HttpError(409, 'Product-update emails need COMMS_UNSUBSCRIBE_SECRET on the server. Send an account/security (service) email, or set it first.');
  const bannerOnly = channels.length === 1 && channels[0] === 'banner';
  if (bannerOnly && audience.kind === 'specific') throw new HttpError(400, 'A banner is shown to everyone or to a group, not to specific people.');

  const scan: Scan = bannerOnly
    ? { matched: 0, examined: 0, truncated: false, samples: [], withEmail: 0, optedOut: 0, noEmail: 0 }
    : await scanAudience(db, audience, channels, m.emailCategory, deps, now);
  checkAuthority(staff, audience, channels, m, scan.matched);
  if (scan.matched === 0 && !bannerOnly) throw new HttpError(400, 'Nobody matches that audience.');
  if (!bannerOnly && expected !== scan.matched) throw new HttpError(409, `The audience changed: ${scan.matched.toLocaleString()} people match now, not ${expected < 0 ? 'the number you previewed' : expected.toLocaleString()}. Preview again to confirm.`);
  await takeToken(db, `comms_send_${staff.uid}`, 86_400_000, CAMPAIGNS_PER_DAY, 'You have reached the daily limit for campaigns.', now);

  const ref = db.collection('comms_campaigns').doc();
  const camp = {
    title: m.title, body: m.body, severity: m.severity, link: m.link ?? null, linkLabel: m.linkLabel ?? null,
    channels, emailCategory: m.emailCategory, emailSubject: m.emailSubject ?? m.title,
    audience, expected: bannerOnly ? 0 : scan.matched, specificUids: audience.kind === 'specific' ? scan.uids ?? [] : null,
    createdBy: { uid: staff.uid, email: staff.email, role: staff.role },
    status: bannerOnly ? 'done' : 'sending', cursor: null, lockUntil: 0,
    stats: { examined: 0, matched: 0, notified: 0, emailed: 0, noEmail: 0, optedOut: 0, emailFailed: 0 },
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(ref, camp);
  if (channels.includes('banner')) {
    batch.set(db.collection('site_announcements').doc(ref.id), {
      title: m.title, body: m.body, severity: m.severity, link: m.link ?? null, linkLabel: m.linkLabel ?? null,
      audience: audience.kind === 'segment' && audience.roles?.length === 1 ? (audience.roles[0] === 'recruiter' ? 'recruiters' : 'members') : 'all',
      startsAt: Timestamp.fromMillis(now), endsAt: Timestamp.fromMillis(new Date(m.bannerEndsAt!).getTime()),
      dismissible: m.bannerDismissible !== false, active: true, campaignId: ref.id, createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  await audit(db, staff, ip, {
    action: 'comms.campaign_created', targetId: ref.id,
    after: { channels, audience: audience.kind, recipients: scan.matched, severity: m.severity, emailCategory: m.emailCategory, title: m.title },
    reason: `Sent "${m.title}" via ${channels.join(' + ')} to ${scan.matched.toLocaleString()} member(s).`,
  });
  if (bannerOnly) return { ok: true, campaignId: ref.id, status: 'done' };
  return continueCampaign(db, staff, { campaignId: ref.id }, deps, now);
}

async function continueCampaign(db: Firestore, staff: Staff, body: any, deps: Deps, now: number) {
  requireCompose(staff);
  const id = typeof body.campaignId === 'string' && body.campaignId && !body.campaignId.includes('/') ? body.campaignId : '';
  if (!id) throw new HttpError(400, 'A campaign is required.');
  const ref = db.collection('comms_campaigns').doc(id);

  // Take a short lease so two tabs (or a double click) cannot deliver the same batch at once.
  const camp = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpError(404, 'Campaign not found.');
    const c = s.data()!;
    if (c.createdBy?.uid !== staff.uid && staff.role !== 'platform_admin') throw new HttpError(403, 'Only the sender or a platform admin can continue this campaign.');
    if (c.status !== 'sending') return { ...c, _skip: true };
    if ((c.lockUntil ?? 0) > Date.now()) throw new HttpError(409, 'This campaign is already being delivered. Give it a moment.');
    tx.update(ref, { lockUntil: Date.now() + LOCK_MS });
    return c;
  });
  if ((camp as any)._skip) return summary(id, camp);

  const started = Date.now();
  const m: Message = { title: camp.title, body: camp.body, severity: camp.severity, link: camp.link ?? undefined, linkLabel: camp.linkLabel ?? undefined, emailCategory: camp.emailCategory, emailSubject: camp.emailSubject };
  const wantNotif = camp.channels.includes('notification'), wantEmail = camp.channels.includes('email');
  let cursor: string | number | null = camp.cursor ?? null;
  let finished = false;

  while (Date.now() - started < BATCH_BUDGET_MS) {
    // Stop if someone cancelled while we were working.
    if ((await ref.get()).data()?.status !== 'sending') break;

    let rows: { uid: string; data: Record<string, any> }[] = [];
    let nextCursor: string | number | null; let examined = 0;
    if (camp.audience.kind === 'specific') {
      const all: string[] = camp.specificUids ?? []; const from = typeof cursor === 'number' ? cursor : 0;
      const slice = all.slice(from, from + PAGE);
      if (slice.length === 0) { finished = true; break; }
      const snaps = await db.getAll(...slice.map((u: string) => db.collection('users').doc(u)));
      rows = snaps.filter(s => s.exists && isEligible(s.data()!)).map(s => ({ uid: s.id, data: s.data()! }));
      nextCursor = from + slice.length; examined = slice.length;
    } else {
      let q = db.collection('users').orderBy(FieldPath.documentId()).limit(PAGE);
      if (typeof cursor === 'string') q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) { finished = true; break; }
      examined = snap.size;
      rows = snap.docs.map(d => ({ uid: d.id, data: d.data() })).filter(r => isEligible(r.data) && (camp.audience.kind === 'all' || matchesSegment(r.data, camp.audience, now)));
      nextCursor = snap.docs[snap.docs.length - 1].id;
      if (snap.size < PAGE) finished = true;
    }

    const emails = wantEmail ? await contactEmails(db, rows.map(r => r.uid), new Map(rows.map(r => [r.uid, r.data]))) : new Map<string, string | null>();
    const out: OutgoingEmail[] = [];
    let noEmail = 0, optedOut = 0;
    if (wantEmail) {
      for (const r of rows) {
        const e = emails.get(r.uid) ?? null;
        if (!e) { noEmail++; continue; }
        if (camp.emailCategory === 'updates' && r.data.commsOptOut === true) { optedOut++; continue; }
        const unsub = camp.emailCategory === 'updates' && deps.unsubscribeSecret ? `${APP_URL}/api/unsubscribe?u=${encodeURIComponent(r.uid)}&t=${unsubscribeToken(deps.unsubscribeSecret, r.uid)}` : null;
        const rendered = render(m, firstName(r.data.displayName), unsub);
        out.push({ to: e, subject: rendered.subject, html: rendered.html, text: rendered.text, ...(unsub ? { headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) });
      }
    }

    // Email first (idempotent by key), then the notifications and the cursor move together in one commit.
    let emailed = 0, emailFailed = 0;
    for (let i = 0; i < out.length; i += 100) {
      const chunk = out.slice(i, i + 100);
      const r = await deps.sendEmails(chunk, `${id}:${cursor ?? 'start'}:${i / 100}`);
      emailFailed += r.failed; emailed += chunk.length - r.failed;
    }
    const batch = db.batch();
    if (wantNotif) for (const r of rows) batch.set(db.doc(`users/${r.uid}/notifications/comms_${id}`), notificationDoc({ id, ...m }, firstName(r.data.displayName)));
    batch.update(ref, {
      cursor: nextCursor, updatedAt: FieldValue.serverTimestamp(),
      'stats.examined': FieldValue.increment(examined), 'stats.matched': FieldValue.increment(rows.length),
      'stats.notified': FieldValue.increment(wantNotif ? rows.length : 0), 'stats.emailed': FieldValue.increment(emailed),
      'stats.noEmail': FieldValue.increment(noEmail), 'stats.optedOut': FieldValue.increment(optedOut), 'stats.emailFailed': FieldValue.increment(emailFailed),
    });
    await batch.commit();
    cursor = nextCursor;
    if (finished) break;
  }

  await ref.update({ lockUntil: 0, ...(finished ? { status: 'done', finishedAt: FieldValue.serverTimestamp() } : {}) });
  return summary(id, (await ref.get()).data()!);
}

function summary(id: string, c: Record<string, any>) {
  return { ok: true, campaignId: id, status: c.status, expected: c.expected ?? 0, stats: c.stats, done: c.status !== 'sending' };
}

async function cancel(db: Firestore, staff: Staff, ip: string, body: any) {
  requireCompose(staff);
  const id = typeof body.campaignId === 'string' && body.campaignId && !body.campaignId.includes('/') ? body.campaignId : '';
  if (!id) throw new HttpError(400, 'A campaign is required.');
  const ref = db.collection('comms_campaigns').doc(id);
  const s = await ref.get();
  if (!s.exists) throw new HttpError(404, 'Campaign not found.');
  const c = s.data()!;
  if (c.createdBy?.uid !== staff.uid && staff.role !== 'platform_admin') throw new HttpError(403, 'Only the sender or a platform admin can stop this campaign.');
  const batch = db.batch();
  if (c.status === 'sending') batch.update(ref, { status: 'cancelled', lockUntil: 0, finishedAt: FieldValue.serverTimestamp() });
  if (c.channels?.includes('banner')) batch.set(db.collection('site_announcements').doc(id), { active: false, endedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  await audit(db, staff, ip, { action: 'comms.campaign_cancelled', targetId: id, reason: `Stopped "${c.title}" (${c.status}).` });
  return { ok: true, campaignId: id, status: c.status === 'sending' ? 'cancelled' : c.status };
}

const iso = (v: any) => (v?.toDate ? v.toDate().toISOString() : null);
function publicCampaign(id: string, c: Record<string, any>) {
  return {
    id, title: c.title, severity: c.severity, channels: c.channels, emailCategory: c.emailCategory, audience: c.audience?.kind,
    audienceSummary: c.audience, status: c.status, expected: c.expected, stats: c.stats,
    createdBy: { email: maskEmail(c.createdBy?.email), role: c.createdBy?.role }, createdAt: iso(c.createdAt), finishedAt: iso(c.finishedAt),
  };
}

async function list(db: Firestore, staff: Staff) {
  if (!VIEW_ROLES.includes(staff.role)) throw new HttpError(403, 'Your role cannot view sent messages.');
  const snap = await db.collection('comms_campaigns').orderBy('createdAt', 'desc').limit(30).get();
  return { campaigns: snap.docs.map(d => publicCampaign(d.id, d.data())) };
}

export async function runAction(db: Firestore, staff: Staff, ip: string, body: any, deps: Deps, now: number = Date.now()): Promise<Record<string, unknown>> {
  switch (body?.action) {
    case 'preview':  return preview(db, staff, body, deps, now);
    case 'test':     return test(db, staff, body, deps, now);
    case 'send':     return send(db, staff, ip, body, deps, now);
    case 'continue': return continueCampaign(db, staff, body, deps, now);
    case 'cancel':   return cancel(db, staff, ip, body);
    case 'list':     return list(db, staff);
    default: throw new HttpError(400, 'Unknown action.');
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const PROD_ORIGINS = ['https://ops.bewatu.com', 'https://www.bewatu.com'];
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:4173'];

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}
function getLookupAuth() {
  const name = 'auth-lookup';
  let app = getApps().find(a => a.name === name);
  if (!app) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? process.env.FIREBASE_SERVICE_ACCOUNT ?? process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER;
    if (!sa) throw new Error('No Firebase service account configured');
    app = initializeApp({ credential: cert(JSON.parse(sa)) }, name);
  }
  return getAuth(app);
}

export function liveDeps(): Deps {
  return {
    unsubscribeSecret: process.env.COMMS_UNSUBSCRIBE_SECRET || undefined,
    sendEmails: async (batch, key) => {
      const key_ = process.env.RESEND_API_KEY;
      if (!key_) throw new HttpError(503, 'Email is not configured on the server.');
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key_}`, 'Content-Type': 'application/json', 'Idempotency-Key': key.slice(0, 250) },
        body: JSON.stringify(batch.map(b => ({ from: 'BeWatu <noreply@bewatu.com>', reply_to: 'support@bewatu.com', to: [b.to], subject: b.subject, html: b.html, text: b.text, ...(b.headers ? { headers: b.headers } : {}) }))),
      });
      if (!res.ok) { console.error('comms email batch failed:', res.status); return { failed: batch.length }; }
      return { failed: 0 };
    },
    lookupUidsByEmail: async (emails) => {
      const out = new Map<string, string>();
      const auth = getLookupAuth();
      for (let i = 0; i < emails.length; i += 100) {
        try { const r = await auth.getUsers(emails.slice(i, i + 100).map(email => ({ email }))); r.users.forEach(u => { if (u.email) out.set(u.email.toLowerCase(), u.uid); }); }
        catch (e: any) { throw new HttpError(503, 'Looking people up by email is unavailable right now. Use member ids, or choose a group.'); }
      }
      return out;
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigins = process.env.VERCEL_ENV === 'production' ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.find(o => o === req.headers.origin) ?? PROD_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const app = getAdminApp(); const db = getFirestore(app);
    const decoded = await getAuth(app).verifyIdToken(header.slice(7));
    const snap = await db.collection('ops_staff').doc(decoded.uid).get();
    const d = snap.data();
    if (!snap.exists || d?.isActive !== true || typeof d?.role !== 'string') return res.status(403).json({ error: 'Not authorised' });
    const fwd = req.headers['x-forwarded-for']; const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || 'unknown';
    const out = await runAction(db, { uid: decoded.uid, email: decoded.email ?? d.email ?? '', role: d.role }, ip, req.body ?? {}, liveDeps());
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (String(err?.code ?? '').startsWith('auth/')) return res.status(401).json({ error: 'Unauthorized' });
    console.error('ops/comms error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
