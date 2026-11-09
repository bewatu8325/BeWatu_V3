/**
 * lib/investorMembership.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Investor membership, the browser side without UI or Firebase in it, so it can be tested: what an application collects and
 * what must be filled in, the stages an application moves through, and the one function that decides whether someone may use
 * investor features right now.
 *
 * Three things are kept apart on purpose:
 *   1. the APPLICATION and its decision (apply free; a reviewer approves, asks for more, or declines);
 *   2. the SUBSCRIPTION (only after approval, started by the member's own explicit activation, billed by Stripe);
 *   3. ELIGIBILITY for any particular investment opportunity (never implied by membership; checked separately).
 * Investor features need 1 AND 2. api/investor-membership.ts and api/investor-webhook.ts are the only things that change either,
 * and api/investor-membership.ts repeats the table and entitlement rule below (it cannot import from lib/); a test keeps them equal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PRICE = { monthly: 199, trialDays: 14, currency: 'USD' } as const;
/** How long access continues after a failed payment while the card is retried. A product decision; shown to the member. */
export const GRACE_DAYS = 7;

// ── the application ──
export type AppStatus = 'draft' | 'submitted' | 'under_review' | 'needs_info' | 'approved' | 'declined' | 'withdrawn';
export type Actor = 'applicant' | 'reviewer';
export const STATUS_LABEL: Record<AppStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', needs_info: 'More information required', approved: 'Approved', declined: 'Declined', withdrawn: 'Withdrawn',
};
/** What each status means, in plain words. Nothing here promises an outcome or a time. */
export const STATUS_HINT: Record<AppStatus, string> = {
  draft: 'Saved on your account. Nothing has been sent yet.',
  submitted: 'We have your application. A BeWatu reviewer will look at it.',
  under_review: 'A BeWatu reviewer is looking at your application.',
  needs_info: 'A reviewer needs a little more from you before deciding.',
  approved: 'You are approved for Investor access. Your membership starts only when you choose to activate it.',
  declined: 'We were not able to approve this application.',
  withdrawn: 'You withdrew this application.',
};
/** Who may move an application from one status to another. The server enforces the same table. */
export const TRANSITIONS: Record<AppStatus, Partial<Record<AppStatus, Actor[]>>> = {
  draft:        { submitted: ['applicant'] },
  submitted:    { under_review: ['reviewer'], needs_info: ['reviewer'], approved: ['reviewer'], declined: ['reviewer'], withdrawn: ['applicant'] },
  under_review: { needs_info: ['reviewer'], approved: ['reviewer'], declined: ['reviewer'], withdrawn: ['applicant'] },
  needs_info:   { submitted: ['applicant'], under_review: ['reviewer'], approved: ['reviewer'], declined: ['reviewer'], withdrawn: ['applicant'] },
  approved:     {},
  declined:     {},
  withdrawn:    {},
};
export const canMove = (from: AppStatus, to: AppStatus, actor: Actor): boolean => !!TRANSITIONS[from]?.[to]?.includes(actor);
export const isOpen = (s: AppStatus) => s === 'submitted' || s === 'under_review' || s === 'needs_info';
/** The steps shown on the status page, in order, with where this application is. */
export function timeline(s: AppStatus): { id: string; label: string; state: 'done' | 'current' | 'todo' | 'ended' }[] {
  const ended = s === 'declined' || s === 'withdrawn';
  const at = s === 'draft' ? 0 : s === 'submitted' ? 1 : s === 'under_review' || s === 'needs_info' ? 2 : s === 'approved' ? 3 : 1;
  const steps = [['draft', 'Application'], ['submitted', 'Submitted'], ['review', s === 'needs_info' ? 'More information required' : 'Review'], ['decision', ended ? STATUS_LABEL[s] : 'Approved']];
  return steps.map(([id, label], i) => ({ id, label, state: ended && i === 3 ? 'ended' : i < at ? 'done' : i === at && !ended ? 'current' : ended && i === at ? 'done' : 'todo' }));
}

// ── what is collected: only what the review needs ──
export type InvestorKind = 'individual' | 'organization';
export const KINDS: { id: InvestorKind; label: string; hint: string }[] = [
  { id: 'individual', label: 'Individual investor', hint: 'You invest your own capital' },
  { id: 'organization', label: 'Organizational investor', hint: 'You invest on behalf of a fund, firm, family office or corporate' },
];
export const SECTORS = ['Fintech', 'Healthcare', 'AI and machine learning', 'Software (SaaS)', 'Marketplaces', 'Consumer', 'Deep tech', 'Climate and energy', 'Education', 'Property', 'Agriculture', 'Logistics', 'Media and gaming', 'Other'];
export const STAGES = [{ id: 'pre-seed', label: 'Pre-seed' }, { id: 'seed', label: 'Seed' }, { id: 'series-a', label: 'Series A' }, { id: 'series-b', label: 'Series B' }, { id: 'growth', label: 'Growth' }];
export const GEOGRAPHIES = ['East Africa', 'West Africa', 'Southern Africa', 'North Africa', 'Europe', 'North America', 'Latin America', 'Middle East', 'South Asia', 'East and Southeast Asia', 'Global'];
export const LIMITS = { background: { min: 40, max: 800 }, experience: { min: 20, max: 800 }, preferences: { max: 600 }, organization: { max: 120 }, role: { max: 80 }, link: 300, message: { min: 5, max: 1500 }, note: { max: 500 } };

export interface Declarations { actingForSelf: boolean; accurate: boolean; notAccreditation: boolean; privacy: boolean; terms: boolean }
export interface ApplicationForm {
  kind: InvestorKind | ''; background: string; organization: string; role: string; experience: string;
  sectors: string[]; stages: string[]; geographies: string[]; preferences: string; linkedin: string; website: string;
  declarations: Declarations;
}
export const emptyForm = (): ApplicationForm => ({
  kind: '', background: '', organization: '', role: '', experience: '', sectors: [], stages: [], geographies: [], preferences: '', linkedin: '', website: '',
  declarations: { actingForSelf: false, accurate: false, notAccreditation: false, privacy: false, terms: false },
});
/** What each declaration says, in the words the member agrees to. */
export const DECLARATION_TEXT: Record<keyof Declarations, string> = {
  actingForSelf: 'I am applying for myself, or I am authorised to apply on behalf of the organization I named.',
  accurate: 'What I have written is accurate, and BeWatu may check it with the links and details I gave.',
  notAccreditation: 'I understand that approval is approval of my BeWatu Investor membership only. It is not a check that I am accredited, and it does not make me eligible for any particular investment. Each opportunity may have its own requirements.',
  privacy: 'I agree that BeWatu may use these details to review my application, and keep a record of the decision.',
  terms: 'I have read the Investor membership terms. I understand that applying is free and that a paid subscription begins only if I am approved and then choose to activate it.',
};
export type Step = 0 | 1 | 2;
export const STEPS = ['Investor profile', 'Investment interests', 'Eligibility and submission'];
const URL_RE = /^https:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;
export const isHttps = (v: string) => v === '' || (v.length <= LIMITS.link && URL_RE.test(v.trim()));

export type Problems = Partial<Record<keyof ApplicationForm | keyof Declarations, string>>;
/** What is missing or wrong on one step, by field, in plain words. */
export function stepProblems(f: ApplicationForm, step: Step): Problems {
  const p: Problems = {};
  if (step === 0) {
    if (!f.kind) p.kind = 'Choose how you invest.';
    if (f.background.trim().length < LIMITS.background.min) p.background = `Tell us a little about your professional background (at least ${LIMITS.background.min} characters).`;
    if (f.background.length > LIMITS.background.max) p.background = `Keep this to ${LIMITS.background.max} characters.`;
    if (f.kind === 'organization') {
      if (!f.organization.trim()) p.organization = 'Name the organization you invest for.';
      if (!f.role.trim()) p.role = 'What is your role there?';
    }
    if (f.experience.trim().length < LIMITS.experience.min) p.experience = 'Describe your relevant investing experience (a sentence or two is enough).';
    if (f.experience.length > LIMITS.experience.max) p.experience = `Keep this to ${LIMITS.experience.max} characters.`;
    if (!isHttps(f.linkedin)) p.linkedin = 'Use a full https:// link, or leave this empty.';
    if (!isHttps(f.website)) p.website = 'Use a full https:// link, or leave this empty.';
  }
  if (step === 1) {
    if (!f.sectors.length) p.sectors = 'Choose at least one sector.';
    if (!f.stages.length) p.stages = 'Choose at least one stage.';
    if (!f.geographies.length) p.geographies = 'Choose at least one region.';
    if (f.preferences.length > LIMITS.preferences.max) p.preferences = `Keep this to ${LIMITS.preferences.max} characters.`;
  }
  if (step === 2) for (const k of Object.keys(f.declarations) as (keyof Declarations)[]) if (!f.declarations[k]) p[k] = 'Please confirm this to continue.';
  return p;
}
export const allProblems = (f: ApplicationForm): Problems => ({ ...stepProblems(f, 0), ...stepProblems(f, 1), ...stepProblems(f, 2) });
export const firstProblem = (p: Problems): string | null => Object.values(p).find(Boolean) ?? null;
/** A stored draft or application, read safely (an older or hand-edited document never throws). */
export function toForm(d: Record<string, any> | null | undefined): ApplicationForm {
  const e = emptyForm(); if (!d) return e;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const dec = d.declarations && typeof d.declarations === 'object' ? d.declarations : {};
  return {
    kind: d.kind === 'individual' || d.kind === 'organization' ? d.kind : '', background: str(d.background), organization: str(d.organization), role: str(d.role), experience: str(d.experience),
    sectors: list(d.sectors), stages: list(d.stages), geographies: list(d.geographies), preferences: str(d.preferences), linkedin: str(d.linkedin), website: str(d.website),
    declarations: { actingForSelf: dec.actingForSelf === true, accurate: dec.accurate === true, notAccreditation: dec.notAccreditation === true, privacy: dec.privacy === true, terms: dec.terms === true },
  };
}

// ── the subscription, and who may use investor features ──
export type SubStatus = 'none' | 'incomplete' | 'trialing' | 'active' | 'past_due' | 'unpaid' | 'canceled';
export interface Membership { status: SubStatus; trialEnd: number | null; currentPeriodEnd: number | null; cancelAtPeriodEnd: boolean; pastDueSince: number | null; endedByReview?: boolean }
export interface Approval { status: 'approved' | 'revoked' | null }
export const noMembership = (): Membership => ({ status: 'none', trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pastDueSince: null });
export type EntitlementState =
  | 'no_approval'        // not approved (never applied, pending, declined or withdrawn)
  | 'revoked'            // approval was withdrawn by BeWatu
  | 'approved_inactive'  // approved, no membership started
  | 'trial'              // in the trial
  | 'active'             // paid
  | 'ending'             // cancelled, still paid through the end of the period
  | 'payment_grace'      // a payment failed; still within the grace period
  | 'payment_failed'     // a payment failed and the grace period is over
  | 'ended';             // cancelled or expired
export interface Entitlement { entitled: boolean; state: EntitlementState; /** until when access is certain, or null */ until: number | null }
const DAY = 86_400_000;
/**
 * The only rule for "may this person use investor features now". Approval alone is never enough, and a subscription alone is never
 * enough. Access during a cancellation lasts to the paid-through date, never past it, even if the webhook is late.
 */
export function entitlement(approval: Approval, m: Membership, now: number): Entitlement {
  if (approval.status === 'revoked') return { entitled: false, state: 'revoked', until: null };
  if (approval.status !== 'approved') return { entitled: false, state: 'no_approval', until: null };
  const no = (state: EntitlementState): Entitlement => ({ entitled: false, state, until: null });
  const end = m.status === 'trialing' ? (m.trialEnd ?? m.currentPeriodEnd) : m.currentPeriodEnd;
  const lapsed = end != null && now >= end;
  switch (m.status) {
    case 'none': case 'incomplete': return no('approved_inactive');
    case 'trialing': return lapsed ? no('ended') : { entitled: true, state: m.cancelAtPeriodEnd ? 'ending' : 'trial', until: end };
    case 'active':   return lapsed ? no('ended') : { entitled: true, state: m.cancelAtPeriodEnd ? 'ending' : 'active', until: end };
    case 'past_due': {
      const stopsAt = (m.pastDueSince ?? now) + GRACE_DAYS * DAY;
      return now < stopsAt ? { entitled: true, state: 'payment_grace', until: stopsAt } : no('payment_failed');
    }
    case 'unpaid':   return no('payment_failed');
    case 'canceled': return no('ended');
  }
  return no('no_approval');
}
/** What a member sees for each state: a title, one sentence, and what they can do. */
export const ENTITLEMENT_COPY: Record<EntitlementState, { title: string; body: string }> = {
  no_approval: { title: 'Investor access needs approval', body: 'Apply at no cost. Your subscription begins only after approval and your confirmation.' },
  revoked: { title: 'Investor access is paused', body: 'BeWatu has paused your Investor approval. Contact support if you would like to understand why.' },
  approved_inactive: { title: "You're approved for Investor access.", body: 'Your membership is ready when you are.' },
  trial: { title: 'Your trial is active', body: 'You have full Investor access during your trial.' },
  active: { title: 'Your membership is active', body: 'You have full Investor access.' },
  ending: { title: 'Your membership is ending', body: 'You are cancelled. You keep Investor access until the date shown.' },
  payment_grace: { title: 'We could not take your last payment', body: `You still have access while we retry. Update your payment method to keep it.` },
  payment_failed: { title: 'Payment failed', body: 'Investor access is paused until your payment method is updated.' },
  ended: { title: 'Your membership has ended', body: 'You can start it again whenever you like. You stay approved.' },
};
export const canActivate = (e: Entitlement, m: Membership) => e.state === 'approved_inactive' || e.state === 'ended' && m.status !== 'trialing' && m.status !== 'active';
export const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const dollars = (n: number) => `$${n}`;
/** The disclosure shown beside the price, before anyone applies and before anyone pays. */
export const TRIAL_DISCLOSURE = `${PRICE.trialDays}-day trial after approval, then ${dollars(PRICE.monthly)}/month unless canceled.`;
export const APPLY_SUPPORT = 'Apply at no cost. Your subscription begins only after approval and your confirmation.';

// ── addresses ──
export const INVESTOR_PATH = '/investor';
