// api/investor-membership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Investor membership: apply free, get approved, choose when to activate. This route is the only thing that changes an investor
// application, an approval, or the investor subscription state, and it is also the Stripe webhook (POST ?webhook=1).
//
//   - An application is moved only along one table of allowed moves (Draft, Submitted, Under review, More information required,
//     Approved, Declined, Withdrawn). Only a reviewer approves, asks for more, or declines; only the applicant withdraws or answers.
//   - Approval never charges anyone. A paid subscription is created only by `activate`, which needs the member's explicit
//     confirmation, an approved application, and no live subscription already. The 14-day trial starts at that moment, once.
//   - Investor access ("entitled") needs BOTH an approval and a live subscription (trial, paid, a short grace after a failed
//     payment, or the paid-through date after cancelling). It is written to users/{uid}.investorEntitled by this file alone and is
//     checked by firestore.rules, so the browser cannot grant itself access. Approval is never proof of accreditation or of
//     eligibility for any particular opportunity.
//   - The webhook is verified, idempotent (each Stripe event is processed once; a failed one is retried), order-tolerant, and
//     refuses a second subscription for someone who already has one.
//
// POST /api/investor-membership   Authorization: Bearer <idToken>
//   applicant: state, save_draft {form}, submit {form}, provide_info {message}, withdraw, activate {confirm, terms}, portal,
//              feature_used {feature}   (the Investor tools call it once, the first time they are used)
//   reviewer:  admin_list {filter?}, admin_get {id}, admin_decide {id, to, applicantMessage?, internalNote?},
//              admin_revoke {uid, reason}, admin_reinstate {uid}
// POST /api/investor-membership?webhook=1   (Stripe)
//
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel (the table, limits and entitlement rule below mirror
// lib/investorMembership.ts; a test keeps them equal).
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// ── The BeWatu email layout ─────────────────────────────────────────────────
// A copy of the block in api/auth-email.ts (each api/ route is deployed alone and cannot import another). test/auth-email/run-tests.mjs
// fails if this differs from that one: change the look in api/auth-email.ts, then paste the block into every file that has the markers.
// <email-shell>
const MAIL = {
  green: '#1a4a3a', site: 'https://www.bewatu.com', support: 'support@bewatu.com', legal: 'BeWatu LLC · United States',
  logo: 'https://www.bewatu.com/email/logo-white.png', font: "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif",
};
const escHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export interface EmailParts {
  /** The grey line some inboxes show next to the subject. */ preheader: string;
  heading: string;
  /** Plain text, one per paragraph. Escaped for you. */ paragraphs: string[];
  /** Trusted HTML shown between the paragraphs and the button (a code box, a summary). Give `extraText` for the plain version. */
  extraHtml?: string; extraText?: string;
  button?: { label: string; url: string };
  /** Small print under the button. Plain text. */ fine?: string[];
  /** Small print that contains a link (an unsubscribe line). `html` is trusted; give the same line as `text` for the plain version. */ fineRich?: { html: string; text: string }[];
  /** The address this was sent to, shown in the footer. */ to?: string;
}
export function emailHtml(p: EmailParts): string {
  const { green: G, font: F } = MAIL;
  const para = (t: string) => `<p style="margin:0 0 14px;font-family:${F};font-size:15px;line-height:23px;color:#292524">${escHtml(t).replace(/\n/g, '<br>')}</p>`;
  const button = p.button ? `<tr><td style="padding:10px 32px 4px"><a href="${escHtml(p.button.url)}" style="display:inline-block;background:${G};color:#ffffff;text-decoration:none;font-family:${F};font-weight:600;font-size:15px;line-height:20px;padding:13px 26px;border-radius:10px">${escHtml(p.button.label)}</a></td></tr>`
    + `<tr><td style="padding:14px 32px 0;font-family:${F};font-size:12px;line-height:18px;color:#78716c">If the button does not work, copy this address into your browser:<br><a href="${escHtml(p.button.url)}" style="color:${G};word-break:break-all">${escHtml(p.button.url)}</a></td></tr>` : '';
  const fineLine = (h: string) => `<p style="margin:0 0 8px;font-family:${F};font-size:13px;line-height:20px;color:#78716c">${h}</p>`;
  const fine = [...(p.fine ?? []).map(t => fineLine(escHtml(t))), ...(p.fineRich ?? []).map(r => fineLine(r.html))].join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escHtml(p.heading)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f5f5f4"><div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f5f5f4">${escHtml(p.preheader)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:14px">`
    + `<tr><td style="background:${G};padding:22px 32px;border-radius:13px 13px 0 0"><a href="${MAIL.site}" style="text-decoration:none"><img src="${MAIL.logo}" alt="BeWatu" width="112" height="34" style="display:block;border:0;width:112px;height:34px;color:#ffffff;font-family:${F};font-size:20px"></a></td></tr>`
    + `<tr><td style="padding:30px 32px 6px;font-family:${F};font-size:15px;line-height:23px;color:#292524"><h1 style="margin:0 0 16px;font-family:${F};font-size:22px;line-height:28px;font-weight:700;color:#1c1917">${escHtml(p.heading)}</h1>${p.paragraphs.map(para).join('')}${p.extraHtml ?? ''}</td></tr>`
    + button
    + `<tr><td style="padding:22px 32px 26px">${fine}</td></tr>`
    + `<tr><td style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:20px 32px;border-radius:0 0 13px 13px;font-family:${F};font-size:12px;line-height:19px;color:#78716c">`
    + `<strong style="color:${G}">BeWatu</strong><br>Questions? Write to <a href="mailto:${MAIL.support}" style="color:${G}">${MAIL.support}</a><br><a href="${MAIL.site}" style="color:${G}">www.bewatu.com</a> · ${escHtml(MAIL.legal)}`
    + (p.to ? `<br><span style="color:#a8a29e">Sent to ${escHtml(p.to)}</span>` : '') + `</td></tr></table></td></tr></table></body></html>`;
}
export function emailText(p: EmailParts): string {
  return [p.heading, '', ...p.paragraphs.flatMap(t => [t, '']), ...(p.extraText ? [p.extraText, ''] : []), ...(p.button ? [`${p.button.label}: ${p.button.url}`, ''] : []),
    ...(p.fine ?? []).flatMap(t => [t, '']), ...(p.fineRich ?? []).flatMap(r => [r.text, '']), '--', `BeWatu · ${MAIL.site}`, `Questions? Write to ${MAIL.support}`, MAIL.legal, ...(p.to ? [`Sent to ${p.to}`] : [])].join('\n');
}
// </email-shell>

export const config = { api: { bodyParser: false } };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ── policy (mirrors lib/investorMembership.ts) ───────────────────────────────
export const PRICE = { monthly: 199, trialDays: 14 };
export const GRACE_DAYS = 7;
export const COOLDOWN_DAYS = 14;
export const REVIEW_ROLES = ['platform_admin', 'trust_manager', 'trust_agent'];
export type AppStatus = 'draft' | 'submitted' | 'under_review' | 'needs_info' | 'approved' | 'declined' | 'withdrawn';
type Actor = 'applicant' | 'reviewer';
export const TRANSITIONS: Record<AppStatus, Partial<Record<AppStatus, Actor[]>>> = {
  draft:        { submitted: ['applicant'] },
  submitted:    { under_review: ['reviewer'], needs_info: ['reviewer'], approved: ['reviewer'], declined: ['reviewer'], withdrawn: ['applicant'] },
  under_review: { needs_info: ['reviewer'], approved: ['reviewer'], declined: ['reviewer'], withdrawn: ['applicant'] },
  needs_info:   { submitted: ['applicant'], under_review: ['reviewer'], approved: ['reviewer'], declined: ['reviewer'], withdrawn: ['applicant'] },
  approved:     {},
  declined:     {},
  withdrawn:    {},
};
export const canMove = (from: AppStatus, to: AppStatus, actor: Actor) => !!TRANSITIONS[from]?.[to]?.includes(actor);
const OPEN: AppStatus[] = ['submitted', 'under_review', 'needs_info'];
export const SECTORS = ['Fintech', 'Healthcare', 'AI and machine learning', 'Software (SaaS)', 'Marketplaces', 'Consumer', 'Deep tech', 'Climate and energy', 'Education', 'Property', 'Agriculture', 'Logistics', 'Media and gaming', 'Other'];
export const STAGES = ['pre-seed', 'seed', 'series-a', 'series-b', 'growth'];
export const GEOGRAPHIES = ['East Africa', 'West Africa', 'Southern Africa', 'North Africa', 'Europe', 'North America', 'Latin America', 'Middle East', 'South Asia', 'East and Southeast Asia', 'Global'];
export const LIMITS = { background: { min: 40, max: 800 }, experience: { min: 20, max: 800 }, preferences: 600, organization: 120, role: 80, link: 300, message: { min: 5, max: 1500 }, note: 500, draftsPerHour: 60, submitsPerDay: 5, infoPerDay: 10, activatePerHour: 10, portalPerHour: 20 };
export const DECLARATIONS = ['actingForSelf', 'accurate', 'notAccreditation', 'privacy', 'terms'] as const;

export type SubStatus = 'none' | 'incomplete' | 'trialing' | 'active' | 'past_due' | 'unpaid' | 'canceled';
export interface Membership { status: SubStatus; trialEnd: number | null; currentPeriodEnd: number | null; cancelAtPeriodEnd: boolean; pastDueSince: number | null }
export const noMembership = (): Membership => ({ status: 'none', trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pastDueSince: null });
const DAY = 86_400_000;
export type EntitlementState = 'no_approval' | 'revoked' | 'approved_inactive' | 'trial' | 'active' | 'ending' | 'payment_grace' | 'payment_failed' | 'ended';
export function entitlement(approval: { status: 'approved' | 'revoked' | null }, m: Membership, now: number): { entitled: boolean; state: EntitlementState; until: number | null } {
  if (approval.status === 'revoked') return { entitled: false, state: 'revoked', until: null };
  if (approval.status !== 'approved') return { entitled: false, state: 'no_approval', until: null };
  const no = (state: EntitlementState) => ({ entitled: false, state, until: null as number | null });
  const end = m.status === 'trialing' ? (m.trialEnd ?? m.currentPeriodEnd) : m.currentPeriodEnd;
  const lapsed = end != null && now >= end;
  switch (m.status) {
    case 'none': case 'incomplete': return no('approved_inactive');
    case 'trialing': return lapsed ? no('ended') : { entitled: true, state: m.cancelAtPeriodEnd ? 'ending' : 'trial', until: end };
    case 'active':   return lapsed ? no('ended') : { entitled: true, state: m.cancelAtPeriodEnd ? 'ending' : 'active', until: end };
    case 'past_due': { const stopsAt = (m.pastDueSince ?? now) + GRACE_DAYS * DAY; return now < stopsAt ? { entitled: true, state: 'payment_grace', until: stopsAt } : no('payment_failed'); }
    case 'unpaid':   return no('payment_failed');
    case 'canceled': return no('ended');
  }
  return no('no_approval');
}
const LIVE: SubStatus[] = ['trialing', 'active', 'past_due'];

// ── dependencies, injected so the whole thing is testable ────────────────────
export interface Mail { to: string; subject: string; html: string; text?: string }
export interface StripeOps {
  checkout(p: { uid: string; email: string; customerId: string | null; trialDays: number; applicationId: string; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ url: string }>;
  portal(p: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  cancelNow(subscriptionId: string): Promise<void>;
}
export interface Deps { db: Firestore; now: number; mail: (m: Mail) => Promise<boolean>; stripe: StripeOps; origin: string }
export interface Caller { uid: string; email: string; emailVerified: boolean; name: string }

// ── helpers ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-control-regex
const oneLine = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// eslint-disable-next-line no-control-regex
const multiLine = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const httpsLink = (v: unknown, max: number): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  if (s.length > max) throw new HttpError(400, 'A link is too long.');
  try { const u = new URL(s); if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) throw 0; return u.toString(); }
  catch { throw new HttpError(400, 'Links must be full https:// addresses.'); }
};
const ms = (v: any): number | null => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : null);

export async function hit(db: Firestore, key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const ref = db.collection('investor_rate_limits').doc(key.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 200));
  return db.runTransaction(async tx => {
    const s = (await tx.get(ref)).data() as { count?: number; windowStart?: number } | undefined;
    const fresh = !s?.windowStart || now - s.windowStart >= windowMs;
    const count = fresh ? 0 : (s?.count ?? 0);
    if (count >= max) return false;
    tx.set(ref, { count: count + 1, windowStart: fresh ? now : s!.windowStart, updatedAt: now });
    return true;
  });
}
const limit = async (d: Deps, key: string, max: number, windowMs: number, text: string) => { if (!(await hit(d.db, key, max, windowMs, d.now))) throw new HttpError(429, text); };

/** Funnel counters and a record of each step, for measuring application conversion and approved-to-paid conversion. */
export async function track(d: Deps, type: string, uid: string, extra: Record<string, unknown> = {}) {
  try {
    const day = new Date(d.now).toISOString().slice(0, 10);
    await d.db.collection('investor_events').add({ type, uid, at: d.now, ...extra });
    await d.db.collection('investor_metrics').doc(day).set({ day, [type]: FieldValue.increment(1) }, { merge: true });
  } catch (e: any) { console.error('investor track failed:', e?.code ?? e?.message); }
}
async function notify(d: Deps, uid: string, n: { type: 'investor_application' | 'investor_billing'; message: string }, dedupeId?: string) {
  const col = d.db.collection('users').doc(uid).collection('notifications');
  const data = { ...n, isRead: false, createdAt: FieldValue.serverTimestamp() };
  try { if (dedupeId) await col.doc(dedupeId).create(data); else await col.add(data); }
  catch (e: any) { if (e?.code !== 6 && !/already exists/i.test(String(e?.message))) console.error('investor notify failed:', e?.code ?? e?.message); }
}
/** The plain-text version of a short HTML body: paragraphs and line breaks kept, tags dropped, entities undone. */
const plainOf = (h: string) => h.replace(/<\/p>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
const memberMail = (to: string, subject: string, body: string): Mail => {
  const parts: EmailParts = { preheader: subject, heading: subject, paragraphs: [], extraHtml: body, extraText: plainOf(body), fine: ['This message is about your BeWatu Investor membership.'], to };
  return { to, subject, html: emailHtml(parts), text: emailText(parts) };
};
const quote = (m: string | null | undefined) => (m ? `<blockquote style="border-left:3px solid #d6d3d1;margin:12px 0;padding:4px 12px;color:#44403c;white-space:pre-wrap">${esc(m)}</blockquote>` : '');
async function emailMember(d: Deps, to: string | undefined, subject: string, body: string) { if (to) { try { await d.mail(memberMail(to, subject, body)); } catch (e: any) { console.error('investor mail failed:', e?.message); } } }

// ── who may review ───────────────────────────────────────────────────────────
async function reviewerOf(db: Firestore, uid: string): Promise<{ role: string; email: string } | null> {
  const [u, o] = await Promise.all([db.collection('users').doc(uid).get(), db.collection('ops_staff').doc(uid).get()]);
  const ops = o.data();
  if (ops?.isActive === true && typeof ops.role === 'string' && REVIEW_ROLES.includes(ops.role)) return { role: ops.role, email: String(ops.email ?? '') };
  if (u.data()?.isPlatformAdmin === true) return { role: 'platform_admin', email: String(u.data()?.email ?? '') };
  return null;
}
async function requireReviewer(db: Firestore, uid: string) {
  const r = await reviewerOf(db, uid);
  if (!r) throw new HttpError(403, 'BeWatu reviewer access is required.');
  return r;
}
async function audit(d: Deps, uid: string, who: { role: string; email: string }, action: string, targetId: string, after: unknown, reason = '') {
  try { await d.db.collection('audit_log').add({ action, actorUid: uid, actorEmail: who.email, actorRole: who.role, targetId, targetType: 'investor_application', before: null, after: after ?? null, reason, ip: 'api', requiresApproval: false, approved: false, ts: FieldValue.serverTimestamp() }); }
  catch (e: any) { console.error('investor audit failed:', e?.code ?? e?.message); }
}

// ── the application form, checked ────────────────────────────────────────────
export interface CleanForm {
  kind: 'individual' | 'organization'; background: string; organization: string; role: string; experience: string;
  sectors: string[]; stages: string[]; geographies: string[]; preferences: string; linkedin: string; website: string;
  declarations: Record<(typeof DECLARATIONS)[number], boolean>;
}
const pick = (v: unknown, allowed: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)) : []).filter((x, i, a) => a.indexOf(x) === i);
/** Cleans what the form sent (lengths, lists, links). Does not demand completeness: a draft may be partial. */
export function cleanForm(b: any): CleanForm {
  const dec = (b?.declarations && typeof b.declarations === 'object') ? b.declarations : {};
  return {
    kind: b?.kind === 'organization' ? 'organization' : 'individual',
    background: multiLine(b?.background, LIMITS.background.max), organization: oneLine(b?.organization, LIMITS.organization), role: oneLine(b?.role, LIMITS.role),
    experience: multiLine(b?.experience, LIMITS.experience.max), sectors: pick(b?.sectors, SECTORS), stages: pick(b?.stages, STAGES), geographies: pick(b?.geographies, GEOGRAPHIES),
    preferences: multiLine(b?.preferences, LIMITS.preferences), linkedin: httpsLink(b?.linkedin, LIMITS.link), website: httpsLink(b?.website, LIMITS.link),
    declarations: Object.fromEntries(DECLARATIONS.map(k => [k, dec[k] === true])) as CleanForm['declarations'],
  };
}
/** What must be present before an application can be submitted. null when complete. */
export function incomplete(f: CleanForm, kindGiven: boolean): string | null {
  if (!kindGiven) return 'Choose how you invest.';
  if (f.background.length < LIMITS.background.min) return 'Tell us a little more about your professional background.';
  if (f.experience.length < LIMITS.experience.min) return 'Describe your relevant investing experience.';
  if (f.kind === 'organization' && (!f.organization || !f.role)) return 'Name the organization you invest for and your role there.';
  if (!f.sectors.length || !f.stages.length || !f.geographies.length) return 'Choose at least one sector, one stage and one region.';
  if (DECLARATIONS.some(k => !f.declarations[k])) return 'Please confirm each declaration to submit.';
  return null;
}

// ── state ────────────────────────────────────────────────────────────────────
interface AppDoc { uid: string; status: AppStatus; form: CleanForm; name: string; email: string; emailVerified: boolean; submittedAt: any; updatedAt: any; history: { atMs: number; by: string; action: string; note?: string }[]; applicantMessage: string | null; internalNote: string | null; additionalInfo: { atMs: number; message: string }[] }
async function currentApp(d: Deps, uid: string): Promise<{ id: string; data: AppDoc } | null> {
  const s = await d.db.collection('investor_membership_applications').where('uid', '==', uid).orderBy('submittedAt', 'desc').limit(1).get();
  return s.empty ? null : { id: s.docs[0].id, data: s.docs[0].data() as AppDoc };
}
async function readMembership(d: Deps, uid: string): Promise<Membership & { stripeCustomerId: string | null; subscriptionId: string | null; trialUsed: boolean }> {
  const m = (await d.db.collection('investor_memberships').doc(uid).get()).data();
  return { status: (m?.status ?? 'none') as SubStatus, trialEnd: ms(m?.trialEnd), currentPeriodEnd: ms(m?.currentPeriodEnd), cancelAtPeriodEnd: m?.cancelAtPeriodEnd === true, pastDueSince: ms(m?.pastDueSince), stripeCustomerId: m?.stripeCustomerId ?? null, subscriptionId: m?.subscriptionId ?? null, trialUsed: m?.trialUsed === true };
}
const approvalOf = async (d: Deps, uid: string): Promise<{ status: 'approved' | 'revoked' | null; applicationId: string | null }> => {
  const a = (await d.db.collection('users').doc(uid).get()).data()?.investorApproval;
  return { status: a?.status === 'approved' || a?.status === 'revoked' ? a.status : null, applicationId: a?.applicationId ?? null };
};

/**
 * Writes what the browser and the rules read: users/{uid}.investorEntitled and its state. The Factory role follows it (set while
 * entitled, put back when not), and the investor profile Factory shows is made once from the approved application.
 */
export async function syncEntitlement(d: Deps, uid: string): Promise<ReturnType<typeof entitlement>> {
  const [approval, m] = await Promise.all([approvalOf(d, uid), readMembership(d, uid)]);
  const e = entitlement({ status: approval.status }, m, d.now);
  const userRef = d.db.collection('users').doc(uid);
  const u = (await userRef.get()).data() ?? {};
  const patch: Record<string, unknown> = { investorEntitled: e.entitled, investorEntitlementState: e.state, updatedAt: FieldValue.serverTimestamp() };
  if (e.entitled && u.role !== 'investor') { patch.role = 'investor'; patch.roleBeforeInvestor = u.role ?? null; }
  if (!e.entitled && u.role === 'investor' && 'roleBeforeInvestor' in u) { patch.role = u.roleBeforeInvestor ?? FieldValue.delete(); patch.roleBeforeInvestor = FieldValue.delete(); }
  await userRef.set(patch, { merge: true });
  if (e.entitled && approval.applicationId) {
    const ref = d.db.collection('factory_investors').doc(uid);
    if (!(await ref.get()).exists) {
      const f = ((await d.db.collection('investor_membership_applications').doc(approval.applicationId).get()).data() as AppDoc | undefined)?.form;
      await ref.set({ user: { id: uid, name: u.displayName ?? '', email: u.email ?? '' }, type: f?.kind === 'individual' ? 'angel' : null, firm: f?.organization ?? '', thesis: f?.preferences ?? '', stages: f?.stages ?? [], sectors: f?.sectors ?? [], approvedFrom: approval.applicationId, createdAt: FieldValue.serverTimestamp() });
    }
  }
  return e;
}

const publicApp = (id: string, a: AppDoc) => ({
  id, status: a.status, form: a.form, applicantMessage: a.applicantMessage ?? null, submittedAt: ms(a.submittedAt), updatedAt: ms(a.updatedAt),
  history: (a.history ?? []).map(h => ({ atMs: h.atMs, action: h.action })), additionalInfo: (a.additionalInfo ?? []).map(x => ({ atMs: x.atMs, message: x.message })),
});

// ═════════════════════════════════════════════════════════════════════════════
export async function runAction(d: Deps, who: Caller, body: Record<string, any>): Promise<Record<string, any>> {
  const { db } = d; const uid = who.uid;
  const apps = db.collection('investor_membership_applications');
  const action = typeof body?.action === 'string' ? body.action : '';

  switch (action) {
    case 'state': {
      const [app, draft, approval, m, cool] = await Promise.all([currentApp(d, uid), db.collection('investor_application_drafts').doc(uid).get(), approvalOf(d, uid), readMembership(d, uid), db.collection('investor_cooldowns').doc(uid).get()]);
      const e = entitlement({ status: approval.status }, m, d.now);
      // A paid-through date or a grace period can pass with no event from Stripe; reading the state heals what the rules read.
      if (((await db.collection('users').doc(uid).get()).data()?.investorEntitled === true) !== e.entitled) await syncEntitlement(d, uid);
      const until = ms(cool.data()?.until);
      return {
        application: app ? publicApp(app.id, app.data) : null, draft: draft.exists ? { form: draft.data()!.form, updatedAt: ms(draft.data()!.updatedAt) } : null, approval: { status: approval.status },
        membership: { status: m.status, trialEnd: m.trialEnd, currentPeriodEnd: m.currentPeriodEnd, cancelAtPeriodEnd: m.cancelAtPeriodEnd, pastDueSince: m.pastDueSince, hasCustomer: !!m.stripeCustomerId, trialUsed: m.trialUsed },
        entitlement: e, cooldownUntil: until && until > d.now ? until : null, price: { monthly: PRICE.monthly, trialDays: PRICE.trialDays }, graceDays: GRACE_DAYS,
        emailVerified: who.emailVerified,
      };
    }

    case 'save_draft': {
      await limit(d, `draft:${uid}`, LIMITS.draftsPerHour, 3_600_000, 'You are saving very quickly. Try again in a minute.');
      const app = await currentApp(d, uid);
      if (app && (OPEN.includes(app.data.status) || app.data.status === 'approved')) throw new HttpError(409, 'You already have an application with us.');
      const form = cleanForm(body.form);
      await db.collection('investor_application_drafts').doc(uid).set({ uid, form, updatedAt: FieldValue.serverTimestamp() });
      return { ok: true };
    }

    case 'submit': {
      await limit(d, `submit-try:${uid}`, 40, 3_600_000, 'Please wait a little before trying again.');   // attempts, however many mistakes
      const app = await currentApp(d, uid);
      if (app && OPEN.includes(app.data.status)) throw new HttpError(409, 'Your application is already with us. You can follow it on your status page.');
      if (app && app.data.status === 'approved') throw new HttpError(409, 'You are already approved.');
      const cool = ms((await db.collection('investor_cooldowns').doc(uid).get()).data()?.until);
      if (cool && cool > d.now) throw new HttpError(403, `You can apply again from ${new Date(cool).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.`);
      const form = cleanForm(body.form);
      const problem = incomplete(form, body?.form?.kind === 'individual' || body?.form?.kind === 'organization');
      if (problem) throw new HttpError(400, problem);
      await limit(d, `submit:${uid}`, LIMITS.submitsPerDay, 86_400_000, 'You have submitted several times today. Please try again tomorrow.');   // real submissions
      const ref = apps.doc();
      const name = oneLine(who.name, 80) || 'there';
      await ref.set({ uid, name, email: who.email, emailVerified: who.emailVerified, form, status: 'submitted', applicantMessage: null, internalNote: null, additionalInfo: [], submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), history: [{ atMs: d.now, by: uid, action: 'submitted' }] });
      await db.collection('investor_application_drafts').doc(uid).delete().catch(() => {});
      await notify(d, uid, { type: 'investor_application', message: 'We received your Investor application. You can follow it on your status page.' }, `inv_received_${ref.id}`);
      await emailMember(d, who.email, 'We received your BeWatu Investor application', `<p>Hi ${esc(name)},</p><p>We received your Investor application. A BeWatu reviewer will look at it, and we will write to you here and by email as it moves. Applying is free. A subscription begins only if you are approved and then choose to activate it.</p>`);
      await track(d, 'application_completed', uid, { applicationId: ref.id });
      return { ok: true, id: ref.id, status: 'submitted' };
    }

    case 'provide_info': {
      await limit(d, `info:${uid}`, LIMITS.infoPerDay, 86_400_000, 'Please try again tomorrow.');
      const app = await currentApp(d, uid);
      if (!app || app.data.status !== 'needs_info') throw new HttpError(409, 'There is nothing to answer right now.');
      const message = multiLine(body.message, LIMITS.message.max);
      if (message.length < LIMITS.message.min) throw new HttpError(400, 'Write your answer first.');
      await apps.doc(app.id).update({ status: 'submitted', additionalInfo: [...(app.data.additionalInfo ?? []), { atMs: d.now, message }].slice(-20), history: [...(app.data.history ?? []), { atMs: d.now, by: uid, action: 'info_provided' }].slice(-60), updatedAt: FieldValue.serverTimestamp() });
      await notify(d, uid, { type: 'investor_application', message: 'Thank you. We have your answer and your application is back with a reviewer.' });
      return { ok: true, status: 'submitted' };
    }

    case 'withdraw': {
      const app = await currentApp(d, uid);
      if (!app || !canMove(app.data.status, 'withdrawn', 'applicant')) throw new HttpError(409, 'There is no open application to withdraw.');
      await apps.doc(app.id).update({ status: 'withdrawn', history: [...(app.data.history ?? []), { atMs: d.now, by: uid, action: 'withdrawn' }].slice(-60), updatedAt: FieldValue.serverTimestamp() });
      await track(d, 'application_withdrawn', uid, { applicationId: app.id });
      return { ok: true, status: 'withdrawn' };
    }

    case 'activate': {
      if (body.confirm !== true || body.terms !== true) throw new HttpError(400, 'Please confirm the membership terms to continue.');
      await limit(d, `activate:${uid}`, LIMITS.activatePerHour, 3_600_000, 'Please wait a little before trying again.');
      const approval = await approvalOf(d, uid);
      if (approval.status !== 'approved' || !approval.applicationId) throw new HttpError(403, 'Investor membership can be activated only after your application is approved.');
      const m = await readMembership(d, uid);
      if (LIVE.includes(m.status)) throw new HttpError(409, 'You already have a membership. You can manage it from your billing page.');
      await track(d, 'activation_started', uid, { applicationId: approval.applicationId });
      const s = await d.stripe.checkout({
        uid, email: who.email, customerId: m.stripeCustomerId, trialDays: m.trialUsed ? 0 : PRICE.trialDays, applicationId: approval.applicationId,
        successUrl: `${d.origin}/investor?checkout=success`, cancelUrl: `${d.origin}/investor?checkout=cancelled`, idempotencyKey: `investor-activate-${uid}-${Math.floor(d.now / 60_000)}`,
      });
      return { ok: true, url: s.url, trialDays: m.trialUsed ? 0 : PRICE.trialDays };
    }

    case 'feature_used': {
      // Called by the Investor tools the first time they are used. Counts once per member, and only for someone who has access.
      const u = (await db.collection('users').doc(uid).get()).data();
      if (u?.investorEntitled !== true || u?.investorFirstFeatureAt) return { ok: true, counted: false };
      await db.collection('users').doc(uid).set({ investorFirstFeatureAt: d.now }, { merge: true });
      await track(d, 'first_feature_used', uid, { feature: oneLine(body.feature, 40) });
      return { ok: true, counted: true };
    }

    case 'portal': {
      await limit(d, `portal:${uid}`, LIMITS.portalPerHour, 3_600_000, 'Please wait a little before trying again.');
      const m = await readMembership(d, uid);
      if (!m.stripeCustomerId) throw new HttpError(409, 'There is no billing account yet.');
      const s = await d.stripe.portal({ customerId: m.stripeCustomerId, returnUrl: `${d.origin}/investor` });
      return { ok: true, url: s.url };
    }

    // ── reviewers ──
    case 'admin_list': {
      await requireReviewer(db, uid);
      const f = typeof body.filter === 'string' ? body.filter : 'open';
      const q = f === 'open' ? apps.where('status', 'in', OPEN) : f === 'all' ? apps : apps.where('status', '==', f);
      const s = await q.orderBy('submittedAt', 'desc').limit(100).get();
      return { items: s.docs.map(x => { const a = x.data() as AppDoc; return { id: x.id, uid: a.uid, name: a.name, email: a.email, kind: a.form.kind, organization: a.form.organization, status: a.status, submittedAt: ms(a.submittedAt), updatedAt: ms(a.updatedAt) }; }) };
    }
    case 'admin_get': {
      await requireReviewer(db, uid);
      const id = typeof body.id === 'string' && /^[A-Za-z0-9]{1,64}$/.test(body.id) ? body.id : null;
      if (!id) throw new HttpError(404, 'That application was not found.');
      const snap = await apps.doc(id).get();
      if (!snap.exists) throw new HttpError(404, 'That application was not found.');
      const a = snap.data() as AppDoc; const [approval, m] = await Promise.all([approvalOf(d, a.uid), readMembership(d, a.uid)]);
      return { id, uid: a.uid, name: a.name, email: a.email, emailVerified: a.emailVerified, form: a.form, status: a.status, applicantMessage: a.applicantMessage, internalNote: a.internalNote, additionalInfo: a.additionalInfo ?? [], history: a.history ?? [], submittedAt: ms(a.submittedAt), approval: approval.status, membership: { status: m.status, trialEnd: m.trialEnd, currentPeriodEnd: m.currentPeriodEnd, cancelAtPeriodEnd: m.cancelAtPeriodEnd }, entitlement: entitlement({ status: approval.status }, m, d.now) };
    }
    case 'admin_decide': {
      const reviewer = await requireReviewer(db, uid);
      const id = typeof body.id === 'string' ? body.id : '';
      const to = typeof body.to === 'string' ? body.to as AppStatus : null;
      if (!to || !(to in TRANSITIONS)) throw new HttpError(400, 'Unknown status.');
      const msg = multiLine(body.applicantMessage, LIMITS.message.max), note = oneLine(body.internalNote, LIMITS.note);
      if ((to === 'needs_info' || to === 'declined') && msg.length < LIMITS.message.min) throw new HttpError(400, to === 'needs_info' ? 'Say what you need from the applicant.' : 'Please give the applicant a short, kind reason.');
      const ref = apps.doc(id);
      const out = await db.runTransaction(async tx => {
        const snap = await tx.get(ref); if (!snap.exists) throw new HttpError(404, 'That application was not found.');
        const a = snap.data() as AppDoc;
        if (!canMove(a.status, to, 'reviewer')) throw new HttpError(409, `A ${a.status.replace('_', ' ')} application cannot move to ${to.replace('_', ' ')}.`);
        tx.update(ref, { status: to, applicantMessage: msg || (to === 'approved' || to === 'under_review' ? null : a.applicantMessage), internalNote: note || a.internalNote || null, reviewedBy: uid, decidedAt: to === 'approved' || to === 'declined' ? FieldValue.serverTimestamp() : null, history: [...(a.history ?? []), { atMs: d.now, by: uid, action: to, ...(note ? { note } : {}) }].slice(-60), updatedAt: FieldValue.serverTimestamp() });
        return a;
      });
      const name = out.name || 'there';
      if (to === 'approved') {
        await db.collection('users').doc(out.uid).set({ investorApproval: { status: 'approved', applicationId: id, at: d.now }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await syncEntitlement(d, out.uid);                       // approved but not subscribed: no access yet
        await notify(d, out.uid, { type: 'investor_application', message: "You're approved for Investor access. Your membership is ready when you are." });
        await emailMember(d, out.email, "You're approved for BeWatu Investor access", `<p>Hi ${esc(name)},</p><p>You're approved for Investor access. Your membership is ready when you are.</p><p>Nothing has been charged. When you choose to activate, you will see the price (${'$'}${PRICE.monthly}/month), the ${PRICE.trialDays}-day trial and how to cancel before you confirm.</p>`);
        await track(d, 'application_approved', out.uid, { applicationId: id });
      } else if (to === 'declined') {
        await db.collection('investor_cooldowns').doc(out.uid).set({ until: d.now + COOLDOWN_DAYS * DAY, applicationId: id });
        await notify(d, out.uid, { type: 'investor_application', message: 'An update on your Investor application is ready.' });
        await emailMember(d, out.email, 'An update on your BeWatu Investor application', `<p>Hi ${esc(name)},</p><p>Thank you for applying. We were not able to approve your Investor application this time.</p>${quote(msg)}<p>You are welcome to apply again after ${COOLDOWN_DAYS} days.</p>`);
        await track(d, 'application_declined', out.uid, { applicationId: id });
      } else if (to === 'needs_info') {
        await notify(d, out.uid, { type: 'investor_application', message: 'We need a little more information for your Investor application.' });
        await emailMember(d, out.email, 'We need a little more information for your BeWatu Investor application', `<p>Hi ${esc(name)},</p><p>A reviewer needs a little more information before deciding:</p>${quote(msg)}<p>You can answer on your Investor status page.</p>`);
      }
      await audit(d, uid, reviewer, `investor_application_${to}`, id, { from: out.status, to }, note || msg);
      return { ok: true, id, status: to };
    }
    case 'admin_revoke': {
      const reviewer = await requireReviewer(db, uid);
      const target = typeof body.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.uid) ? body.uid : '';
      const reason = oneLine(body.reason, LIMITS.note);
      if (!target) throw new HttpError(404, 'That member was not found.');
      if (reason.length < 5) throw new HttpError(400, 'Record a reason for withdrawing approval.');
      const approval = await approvalOf(d, target);
      if (approval.status !== 'approved') throw new HttpError(409, 'That member is not currently approved.');
      await db.collection('users').doc(target).set({ investorApproval: { status: 'revoked', applicationId: approval.applicationId, at: d.now }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const m = await readMembership(d, target);
      if (m.subscriptionId && LIVE.includes(m.status)) {
        await d.stripe.cancelNow(m.subscriptionId);   // stop billing: access is gone, so charging would be wrong
        await db.collection('investor_memberships').doc(target).set({ status: 'canceled', cancelAtPeriodEnd: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });   // what Stripe's event will say next
      }
      await syncEntitlement(d, target);
      await notify(d, target, { type: 'investor_application', message: 'Your Investor access has been paused.' });
      await audit(d, uid, reviewer, 'investor_approval_revoked', approval.applicationId ?? target, { uid: target }, reason);
      return { ok: true };
    }
    case 'admin_reinstate': {
      const reviewer = await requireReviewer(db, uid);
      const target = typeof body.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.uid) ? body.uid : '';
      const approval = await approvalOf(d, target);
      if (approval.status !== 'revoked') throw new HttpError(409, 'That approval was not withdrawn.');
      await db.collection('users').doc(target).set({ investorApproval: { status: 'approved', applicationId: approval.applicationId, at: d.now }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await syncEntitlement(d, target);
      await audit(d, uid, reviewer, 'investor_approval_reinstated', approval.applicationId ?? target, { uid: target });
      return { ok: true };
    }
    default:
      throw new HttpError(400, 'Unknown action.');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Stripe webhook: the only place the subscription state is written
// ═════════════════════════════════════════════════════════════════════════════
const mapStatus = (s: string): SubStatus => s === 'trialing' || s === 'active' || s === 'past_due' || s === 'unpaid' || s === 'incomplete' ? s : s === 'canceled' || s === 'incomplete_expired' || s === 'paused' ? (s === 'paused' ? 'unpaid' : 'canceled') : 'none';
const secs = (n: unknown) => (typeof n === 'number' ? n * 1000 : null);

/** One Stripe event, applied. `event` is a plain Stripe event object (the handler has already verified its signature). */
export async function applyStripeEvent(d: Deps, event: { id: string; type: string; created: number; data: { object: any } }): Promise<{ handled: boolean; duplicate?: boolean }> {
  const evRef = d.db.collection('stripe_events').doc(event.id);
  try { await evRef.create({ type: event.type, at: d.now }); } catch (e: any) { if (e?.code === 6 || /already exists/i.test(String(e?.message))) return { handled: false, duplicate: true }; throw e; }
  try {
    const out = await applyOnce(d, event);
    return { handled: out };
  } catch (e) { await evRef.delete().catch(() => {}); throw e; }   // let Stripe retry it
}

async function uidFor(d: Deps, o: any): Promise<string | null> {
  const meta = o?.metadata ?? o?.subscription_details?.metadata;
  if (meta?.kind === 'investor_membership' && typeof meta.uid === 'string') return meta.uid;
  const customer = typeof o?.customer === 'string' ? o.customer : o?.customer?.id;
  if (customer) { const s = await d.db.collection('investor_memberships').where('stripeCustomerId', '==', customer).limit(1).get(); if (!s.empty) return s.docs[0].id; }
  return null;
}

async function applyOnce(d: Deps, event: { type: string; created: number; data: { object: any } }): Promise<boolean> {
  const o = event.data.object;
  const memRef = (uid: string) => d.db.collection('investor_memberships').doc(uid);

  if (event.type === 'checkout.session.completed') {
    if (o.metadata?.kind !== 'investor_membership' || typeof o.metadata.uid !== 'string') return false;
    const uid = o.metadata.uid;
    await memRef(uid).set({ stripeCustomerId: typeof o.customer === 'string' ? o.customer : o.customer?.id ?? null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await track(d, 'checkout_completed', uid);
    return true;
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    if (o.metadata?.kind !== 'investor_membership') return false;
    const uid = await uidFor(d, o); if (!uid) { console.error('investor webhook: subscription with no member', o.id); return true; }
    const prev = await readMembership(d, uid); const prevDoc = (await memRef(uid).get()).data();
    if (typeof prevDoc?.lastSubEventAt === 'number' && event.created * 1000 < prevDoc.lastSubEventAt) return true;     // an older event arriving late
    // never a second subscription: a different one while this member already has a live one is cancelled at once
    if (prev.subscriptionId && prev.subscriptionId !== o.id && LIVE.includes(prev.status) && event.type !== 'customer.subscription.deleted') { await d.stripe.cancelNow(o.id); return true; }
    const status: SubStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(o.status);
    const item = o.items?.data?.[0];
    const periodEnd = secs(o.current_period_end) ?? secs(item?.current_period_end);
    const pastDueSince = status === 'past_due' ? (prev.status === 'past_due' && prev.pastDueSince ? prev.pastDueSince : d.now) : null;
    await memRef(uid).set({
      stripeCustomerId: typeof o.customer === 'string' ? o.customer : o.customer?.id ?? prev.stripeCustomerId, subscriptionId: o.id, status, priceId: item?.price?.id ?? null,
      trialEnd: secs(o.trial_end), currentPeriodEnd: periodEnd, cancelAtPeriodEnd: o.cancel_at_period_end === true, pastDueSince,
      trialUsed: prev.trialUsed || status === 'trialing' || o.trial_end != null, lastSubEventAt: event.created * 1000, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const e = await syncEntitlement(d, uid);
    // the funnel, counted once per real change
    if (status === 'trialing' && prev.status !== 'trialing') await track(d, 'trial_activated', uid);
    if (status === 'active' && prev.status !== 'active') await track(d, 'subscription_activated', uid, { fromTrial: prev.status === 'trialing' });
    if ((o.cancel_at_period_end === true && !prev.cancelAtPeriodEnd) || (status === 'canceled' && prev.status !== 'canceled')) await track(d, 'subscription_canceled', uid);
    if (status === 'past_due' && prev.status !== 'past_due') {
      await notify(d, uid, { type: 'investor_billing', message: 'We could not take your last payment. Update your payment method to keep Investor access.' });
      await emailMember(d, (await d.db.collection('users').doc(uid).get()).data()?.email, 'We could not take your BeWatu Investor payment', `<p>We could not take your last payment. You keep Investor access for ${GRACE_DAYS} days while we try again. Please update your payment method from your Investor page.</p>`);
    }
    void e;
    return true;
  }

  if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
    const uid = await uidFor(d, o); if (!uid) return false;
    if (!(await memRef(uid).get()).exists) return false;
    await track(d, event.type === 'invoice.paid' ? 'payment_succeeded' : 'payment_failed', uid);
    return true;
  }
  return false;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com', 'https://ops.bewatu.com', 'https://factory.bewatu.com'];   // the console and Factory call this too
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}
async function rawBody(req: VercelRequest): Promise<string> { const chunks: Buffer[] = []; for await (const c of req as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); return Buffer.concat(chunks).toString('utf8'); }
async function resendMail(m: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY; if (!key) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ from: 'BeWatu <noreply@bewatu.com>', reply_to: MAIL.support, to: [m.to], subject: m.subject, html: m.html, text: m.text }) });
  if (!r.ok) console.error('Resend error:', await r.text());
  return r.ok;
}
function liveStripe(): StripeOps {
  const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new HttpError(503, 'Billing is not available right now.');
  const stripe = new Stripe(key, { apiVersion: '2025-10-29.clover', typescript: true });
  const priceId = process.env.STRIPE_INVESTOR_PRICE_ID;
  return {
    async checkout(p) {
      if (!priceId) throw new HttpError(503, 'Billing is not available right now.');
      const meta = { uid: p.uid, kind: 'investor_membership', applicationId: p.applicationId };
      const s = await stripe.checkout.sessions.create({
        mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }], client_reference_id: p.uid, metadata: meta,
        ...(p.customerId ? { customer: p.customerId } : { customer_email: p.email }),
        subscription_data: { metadata: meta, ...(p.trialDays > 0 ? { trial_period_days: p.trialDays } : {}) },
        payment_method_collection: 'always', billing_address_collection: 'auto', success_url: p.successUrl, cancel_url: p.cancelUrl,
      }, { idempotencyKey: p.idempotencyKey });
      if (!s.url) throw new HttpError(502, 'Checkout could not be opened. Please try again.');
      return { url: s.url };
    },
    async portal(p) { const s = await stripe.billingPortal.sessions.create({ customer: p.customerId, return_url: p.returnUrl }); return { url: s.url }; },
    async cancelNow(id) { await stripe.subscriptions.cancel(id, { prorate: false }); },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const origin = ALLOWED_ORIGINS.includes(requested) && !requested.includes('ops.') && !requested.includes('factory.') ? requested : 'https://www.bewatu.com';   // Stripe returns members to the app, never to the console

  try {
    const app = getAdminApp();
    const raw = await rawBody(req);
    const deps = (): Deps => ({ db: getFirestore(app), now: Date.now(), mail: resendMail, stripe: liveStripe(), origin });

    if (req.query?.webhook) {
      const secret = process.env.STRIPE_INVESTOR_WEBHOOK_SECRET, key = process.env.STRIPE_SECRET_KEY;
      const sig = req.headers['stripe-signature'];
      if (!secret || !key || typeof sig !== 'string') return res.status(400).json({ error: 'Not configured' });
      let event: Stripe.Event;
      try { event = await new Stripe(key, { apiVersion: '2025-10-29.clover' }).webhooks.constructEventAsync(raw, sig, secret); }
      catch (e: any) { return res.status(400).json({ error: `Webhook error: ${e.message}` }); }
      const out = await applyStripeEvent(deps(), event as any);
      return res.status(200).json({ received: true, ...out });
    }

    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = await getAuth(app).verifyIdToken(h.slice(7));
    let body: Record<string, any> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return res.status(400).json({ error: 'Bad request' }); }
    const result = await runAction(deps(), { uid: decoded.uid, email: decoded.email ?? '', emailVerified: decoded.email_verified === true, name: String(decoded.name ?? '') }, body);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (String(err?.code ?? '').startsWith('auth/')) return res.status(401).json({ error: 'Please sign in again.' });
    console.error('investor-membership error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
