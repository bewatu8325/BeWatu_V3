// Run: tsx test/investor-membership/client-tests.mjs
// Guards the browser side of Investor membership (lib/investorMembership.ts): the application's rules, the status timeline,
// what each billing state says and allows, and the wording that must never promise more than is true.
import * as m from '../../lib/investorMembership.ts';
import { parsePath, pathFor, navKeyFor } from '../../lib/routes.ts';
let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, x) => { if (!c) throw new Error(x); };
const good = () => ({ ...m.emptyForm(), kind: 'organization', background: 'Fifteen years in operations and venture, now investing from a family office.', organization: 'Kamau FO', role: 'Principal', experience: 'Led eleven seed investments and two exits.', sectors: ['Fintech'], stages: ['seed'], geographies: ['East Africa'], declarations: { actingForSelf: true, accurate: true, notAccreditation: true, privacy: true, terms: true } });

check('the price, trial and disclosures say exactly what is offered', () => {
  assert(m.PRICE.monthly === 199 && m.PRICE.trialDays === 14, 'price');
  assert(m.TRIAL_DISCLOSURE === '14-day trial after approval, then $199/month unless canceled.', m.TRIAL_DISCLOSURE);
  assert(m.APPLY_SUPPORT === 'Apply at no cost. Your subscription begins only after approval and your confirmation.', 'support text');
});
check('no wording promises approval, a time, or access before approval', () => {
  const all = [...Object.values(m.STATUS_HINT), ...Object.values(m.ENTITLEMENT_COPY).flatMap(c => [c.title, c.body]), ...Object.values(m.DECLARATION_TEXT), m.APPLY_SUPPORT, m.TRIAL_DISCLOSURE].join(' ');
  assert(!/within \d|business days|guarantee|instant|will be approved|you will get/i.test(all), 'promises something');
  assert(/not a check that I am accredited/.test(m.DECLARATION_TEXT.notAccreditation) && /Each opportunity may have its own requirements/.test(m.DECLARATION_TEXT.notAccreditation), 'membership is not accreditation or eligibility');
});
check('step 1 needs how you invest, background and experience; an organization also needs its name and your role', () => {
  const p = m.stepProblems(m.emptyForm(), 0); for (const k of ['kind', 'background', 'experience']) assert(p[k], `${k} not required`);
  const org = { ...m.emptyForm(), kind: 'organization' }; assert(m.stepProblems(org, 0).organization && m.stepProblems(org, 0).role, 'org fields');
  assert(!m.stepProblems({ ...good(), kind: 'individual', organization: '', role: '' }, 0).organization, 'individual asked for an organization');
  assert(m.firstProblem(m.stepProblems(good(), 0)) === null, 'a complete step was refused');
});
check('links must be full https addresses, or empty', () => {
  for (const bad of ['http://x.test', 'javascript:alert(1)', 'linkedin.com/in/me', 'https://', 'https://x']) assert(!m.isHttps(bad), `${bad} accepted`);
  for (const ok of ['', 'https://www.linkedin.com/in/ann', 'https://kamau.example']) assert(m.isHttps(ok), `${ok} refused`);
  assert(m.stepProblems({ ...good(), linkedin: 'http://x.test' }, 0).linkedin, 'bad link not flagged');
});
check('step 2 needs a sector, a stage and a region', () => {
  const p = m.stepProblems(m.emptyForm(), 1); for (const k of ['sectors', 'stages', 'geographies']) assert(p[k], `${k}`); assert(m.firstProblem(m.stepProblems(good(), 1)) === null, 'complete step refused');
});
check('step 3 needs every declaration, one by one', () => {
  assert(Object.keys(m.stepProblems(m.emptyForm(), 2)).length === 5, 'five declarations');
  for (const k of Object.keys(m.emptyForm().declarations)) assert(m.stepProblems({ ...good(), declarations: { ...good().declarations, [k]: false } }, 2)[k], `${k} not required`);
  assert(Object.keys(m.allProblems(good())).length === 0, 'complete application has problems');
});
check('a stored draft is read safely, whatever it holds', () => {
  const f = m.toForm({ kind: 'robot', background: 5, sectors: ['A', 3, null], declarations: { terms: true, accurate: 'yes' } }); assert(f.kind === '' && f.background === '' && f.sectors.join() === 'A' && f.declarations.terms && !f.declarations.accurate, JSON.stringify(f));
  assert(JSON.stringify(m.toForm(null)) === JSON.stringify(m.emptyForm()) && m.toForm(undefined).sectors.length === 0, 'empty');
});
check('the status table: only reviewers decide, only applicants withdraw or answer, and the end states are final', () => {
  assert(m.canMove('draft', 'submitted', 'applicant') && !m.canMove('draft', 'submitted', 'reviewer') && !m.canMove('submitted', 'approved', 'applicant') && m.canMove('submitted', 'approved', 'reviewer'), 'basics');
  assert(m.canMove('needs_info', 'submitted', 'applicant') && m.canMove('under_review', 'withdrawn', 'applicant') && !m.canMove('approved', 'withdrawn', 'applicant'), 'answer or withdraw');
  for (const end of ['approved', 'declined', 'withdrawn']) assert(Object.keys(m.TRANSITIONS[end]).length === 0, `${end} is not final`);
  assert(m.isOpen('submitted') && m.isOpen('under_review') && m.isOpen('needs_info') && !m.isOpen('approved') && !m.isOpen('draft'), 'isOpen');
  assert(Object.keys(m.STATUS_LABEL).length === 7 && m.STATUS_LABEL.needs_info === 'More information required', 'seven statuses, named as specified');
});
check('the timeline shows where an application is, and how it ended', () => {
  const st = s => m.timeline(s).map(x => x.state).join();
  assert(st('draft') === 'current,todo,todo,todo', st('draft')); assert(st('submitted') === 'done,current,todo,todo', st('submitted')); assert(st('under_review') === 'done,done,current,todo', st('under_review'));
  assert(st('approved') === 'done,done,done,current' || st('approved') === 'done,done,done,done', st('approved')); assert(m.timeline('needs_info')[2].label === 'More information required', 'needs_info label');
  assert(m.timeline('declined')[3].state === 'ended' && m.timeline('declined')[3].label === 'Declined' && m.timeline('withdrawn')[3].label === 'Withdrawn', 'ended');
});
check('entitlement: approval alone is nothing, a subscription alone is nothing, both is access', () => {
  const T = 1_800_000_000_000, DAY = 86_400_000, M = o => ({ ...m.noMembership(), ...o });
  const e = (ap, mm) => m.entitlement({ status: ap }, mm, T);
  assert(!e(null, M({ status: 'active', currentPeriodEnd: T + DAY })).entitled, 'subscription without approval');
  assert(!e('approved', M()).entitled && e('approved', M()).state === 'approved_inactive', 'approval without subscription');
  assert(e('approved', M({ status: 'trialing', trialEnd: T + DAY })).state === 'trial' && e('approved', M({ status: 'active', currentPeriodEnd: T + DAY })).state === 'active', 'both');
  assert(e('revoked', M({ status: 'active', currentPeriodEnd: T + DAY })).state === 'revoked' && !e('revoked', M({ status: 'active', currentPeriodEnd: T + DAY })).entitled, 'revoked');
});
check('entitlement: cancelling keeps access to the paid-through date and no longer', () => {
  const T = 1_800_000_000_000, DAY = 86_400_000, c = (now) => m.entitlement({ status: 'approved' }, { ...m.noMembership(), status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: T + 5 * DAY }, now);
  assert(c(T).entitled && c(T).state === 'ending' && c(T + 5 * DAY - 1).entitled && !c(T + 5 * DAY).entitled && c(T + 5 * DAY).state === 'ended', 'paid-through');
});
check('entitlement: a failed payment has a grace period and then stops, and says so', () => {
  const T = 1_800_000_000_000, DAY = 86_400_000, p = (since, now) => m.entitlement({ status: 'approved' }, { ...m.noMembership(), status: 'past_due', pastDueSince: since, currentPeriodEnd: T + 20 * DAY }, now);
  assert(p(T, T + DAY).state === 'payment_grace' && p(T, T + DAY).until === T + 7 * DAY && p(T, T + 7 * DAY).state === 'payment_failed' && !p(T, T + 7 * DAY).entitled, 'grace');
  assert(/retry/.test(m.ENTITLEMENT_COPY.payment_grace.body) && /paused/.test(m.ENTITLEMENT_COPY.payment_failed.body), 'copy');
});
check('every state has plain wording, and only the right ones offer activation', () => {
  const states = ['no_approval', 'revoked', 'approved_inactive', 'trial', 'active', 'ending', 'payment_grace', 'payment_failed', 'ended']; for (const s of states) assert(m.ENTITLEMENT_COPY[s]?.title && m.ENTITLEMENT_COPY[s]?.body, `${s} has no copy`);
  const T = 1_800_000_000_000, ap = m.entitlement({ status: 'approved' }, m.noMembership(), T); assert(m.canActivate(ap, m.noMembership()), 'approved-inactive should activate');
  assert(!m.canActivate(m.entitlement({ status: null }, m.noMembership(), T), m.noMembership()), 'unapproved can activate');
  assert(m.ENTITLEMENT_COPY.approved_inactive.title === "You're approved for Investor access." && m.ENTITLEMENT_COPY.approved_inactive.body === 'Your membership is ready when you are.', 'specified approval wording');
});
check('the investor page has its own address inside the app', () => {
  assert(pathFor({ view: 'INVESTOR' }) === '/investor', 'path'); assert(parsePath('/investor')?.view === 'INVESTOR' && parsePath('/investor/')?.view === 'INVESTOR', 'parse'); assert(navKeyFor('INVESTOR') === 'discover' || navKeyFor('INVESTOR') === 'you' || navKeyFor('INVESTOR') === null, 'nav key');
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
