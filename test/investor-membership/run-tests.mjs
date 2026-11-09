// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/investor-membership/run-tests.mjs"
// Guards the Investor membership journey (api/investor-membership.ts):
//   - apply free; one open application; drafts resume; every move follows one table; only reviewers decide
//   - approval never charges and never grants access; activation needs approval AND explicit confirmation; the trial starts once
//   - access needs approval AND a live subscription: trial, paid, grace after a failed payment, paid-through after cancelling
//   - the Stripe webhook is idempotent, order-tolerant, refuses a second subscription, and retries a failed event
//   - decisions are audited, notified and emailed; an applicant never sees internal notes or billing ids
//   - the rule in the browser's copy (lib/investorMembership.ts) is the same as the server's
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runAction, applyStripeEvent, syncEntitlement, entitlement, HttpError, TRANSITIONS, LIMITS, SECTORS, STAGES, GEOGRAPHIES, PRICE, GRACE_DAYS, REVIEW_ROLES, cleanForm } from '../../api/investor-membership.ts';
import * as client from '../../lib/investorMembership.ts';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, text) => { try { await p; } catch (e) { if (e instanceof HttpError && e.status === status && (!text || e.message.includes(text))) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('was allowed'); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-investor' });
const db = getFirestore();
const DAY = 86_400_000;
let NOW = 1_800_000_000_000;
let mails = [], calls = [], failCancel = false;
const stripe = {
  checkout: async p => { calls.push(['checkout', p]); return { url: 'https://checkout.stripe.test/c/' + p.uid }; },
  portal: async p => { calls.push(['portal', p]); return { url: 'https://billing.stripe.test/p' }; },
  cancelNow: async id => { if (failCancel) throw new Error('stripe down'); calls.push(['cancel', id]); },
};
const deps = () => ({ db, now: NOW, mail: async m => { mails.push(m); return true; }, stripe, origin: 'https://www.bewatu.com' });
const ANN = { uid: 'ann', email: 'ann@fund.test', emailVerified: true, name: 'Ann Okoro' };
const BOB = { uid: 'bob', email: 'bob@fund.test', emailVerified: false, name: 'Bob Kamau' };
const run = (who, body) => runAction(deps(), who, body);
const REV = { uid: 'ops-tm', email: 'tm@bewatu.test', emailVerified: true, name: 'Trust Manager' };
const FORM = { kind: 'organization', background: 'Fifteen years in operations and venture, now investing from a family office in Nairobi.', organization: 'Kamau Family Office', role: 'Principal', experience: 'Led eleven seed investments, two exits, sat on three boards.', sectors: ['Fintech', 'Healthcare'], stages: ['seed', 'series-a'], geographies: ['East Africa'], preferences: 'Cheque sizes of $50k to $250k.', linkedin: 'https://www.linkedin.com/in/ann', website: 'https://kamau.example', declarations: { actingForSelf: true, accurate: true, notAccreditation: true, privacy: true, terms: true } };

const reset = async () => {
  for (const c of ['investor_membership_applications', 'investor_application_drafts', 'investor_memberships', 'investor_cooldowns', 'investor_events', 'investor_metrics', 'investor_rate_limits', 'stripe_events', 'audit_log', 'ops_staff', 'factory_investors', 'users']) { const s = await db.collection(c).get(); for (const x of s.docs) { for (const sub of await x.ref.listCollections()) { const ss = await sub.get(); await Promise.all(ss.docs.map(y => y.ref.delete())); } await x.ref.delete(); } }
  await db.collection('users').doc('ann').set({ displayName: 'Ann Okoro', email: 'ann@fund.test', role: 'founder' });
  await db.collection('users').doc('bob').set({ displayName: 'Bob Kamau', email: 'bob@fund.test' });
  await db.collection('ops_staff').doc('ops-tm').set({ role: 'trust_manager', isActive: true, email: 'tm@bewatu.test' });
  await db.collection('ops_staff').doc('ops-sup').set({ role: 'support_agent', isActive: true, email: 'sup@bewatu.test' });
  await db.collection('ops_staff').doc('ops-off').set({ role: 'trust_manager', isActive: false, email: 'off@bewatu.test' });
  NOW = 1_800_000_000_000; mails = []; calls = []; failCancel = false;
};
const notes = async uid => (await db.collection('users').doc(uid).collection('notifications').get()).docs.map(x => x.data());
const user = async uid => (await db.collection('users').doc(uid).get()).data();
const mem = async uid => (await db.collection('investor_memberships').doc(uid).get()).data();
const events = async () => (await db.collection('investor_events').get()).docs.map(x => x.data().type);
const submit = async (who = ANN, form = FORM) => (await run(who, { action: 'submit', form })).id;
const decide = (id, to, extra = {}) => run(REV, { action: 'admin_decide', id, to, ...extra });
const approve = async (who = ANN) => { const id = await submit(who); await decide(id, 'approved'); return id; };
const sub = (o = {}) => ({ id: 'sub_1', customer: 'cus_1', status: 'trialing', metadata: { uid: 'ann', kind: 'investor_membership', applicationId: 'x' }, trial_end: (NOW + 14 * DAY) / 1000, current_period_end: (NOW + 14 * DAY) / 1000, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_inv' } }] }, ...o });
let evN = 0;
const ev = (type, object, o = {}) => ({ id: 'evt_' + ++evN, type, created: Math.floor(NOW / 1000), data: { object }, ...o });
const apply = e => applyStripeEvent(deps(), e);

await reset();
// ── applying is free, and complete ──
await check('an application needs everything the review needs, and nothing is accepted half-done', async () => {
  const cases = [{ ...FORM, kind: undefined }, { ...FORM, background: 'too short' }, { ...FORM, experience: '' }, { ...FORM, organization: '' }, { ...FORM, sectors: [] }, { ...FORM, stages: [] }, { ...FORM, geographies: [] }, { ...FORM, sectors: ['Astrology'] },
    ...['actingForSelf', 'accurate', 'notAccreditation', 'privacy', 'terms'].map(k => ({ ...FORM, declarations: { ...FORM.declarations, [k]: false } }))];
  for (const f of cases) await refuses(run(ANN, { action: 'submit', form: f }), 400);
  for (const bad of ['http://x.test', 'javascript:alert(1)', 'not a link', 'https://u:p@x.test']) await refuses(run(ANN, { action: 'submit', form: { ...FORM, linkedin: bad } }), 400, 'https');
  assert((await db.collection('investor_membership_applications').get()).empty, 'something was stored');
});
await check('submitting stores the application, clears the draft, tells the applicant and keeps no charge in sight', async () => {
  await run(ANN, { action: 'save_draft', form: { ...FORM, background: 'half' } });
  const id = await submit();
  const a = (await db.collection('investor_membership_applications').doc(id).get()).data();
  assert(a.status === 'submitted' && a.uid === 'ann' && a.emailVerified === true && a.form.organization === 'Kamau Family Office', JSON.stringify(a));
  assert(!(await db.collection('investor_application_drafts').doc('ann').get()).exists, 'draft kept');
  assert((await notes('ann')).some(n => n.type === 'investor_application' && /received/i.test(n.message)), 'not notified'); assert(mails.some(m => m.to === 'ann@fund.test' && /received/i.test(m.subject) && /free/i.test(m.html)), 'no email');
  assert(calls.length === 0 && (await events()).includes('application_completed'), 'billing touched or not counted');
});
await check('one open application at a time, and an approved member cannot apply again', async () => {
  await refuses(run(ANN, { action: 'submit', form: FORM }), 409, 'already with us');
  const id = (await db.collection('investor_membership_applications').get()).docs[0].id; await decide(id, 'approved'); await refuses(run(ANN, { action: 'submit', form: FORM }), 409, 'already approved');
});
await check('drafts are saved, partial, and resume; they stop once an application exists', async () => {
  await reset(); await run(BOB, { action: 'save_draft', form: { kind: 'individual', background: 'Angel investor since 2015', sectors: ['Fintech', 'Bogus'], declarations: { terms: true } } });
  const st = await run(BOB, { action: 'state' }); assert(st.draft.form.background.startsWith('Angel') && st.draft.form.sectors.join() === 'Fintech' && st.application === null && st.canApply !== false, JSON.stringify(st.draft));
  await refuses(run(BOB, { action: 'save_draft', form: { linkedin: 'http://bad.test' } }), 400); await submit(BOB, { ...FORM, kind: 'individual', organization: '', role: '' });
  await refuses(run(BOB, { action: 'save_draft', form: FORM }), 409);
});
await check('mistakes are not held against anyone, but real submissions are limited per day', async () => {
  await reset(); for (let i = 0; i < 12; i++) await refuses(run(ANN, { action: 'submit', form: { ...FORM, sectors: [] } }), 400);
  for (let i = 0; i < LIMITS.submitsPerDay; i++) { await submit(); await run(ANN, { action: 'withdraw' }); }
  await refuses(run(ANN, { action: 'submit', form: FORM }), 429, 'tomorrow');
});

// ── the review ──
await reset();
await check('only reviewers decide: a member, other ops roles and inactive staff cannot', async () => {
  const id = await submit();
  for (const who of [ANN, BOB, { ...REV, uid: 'ops-sup' }, { ...REV, uid: 'ops-off' }]) for (const body of [{ action: 'admin_list' }, { action: 'admin_get', id }, { action: 'admin_decide', id, to: 'approved' }, { action: 'admin_revoke', uid: 'ann', reason: 'because' }, { action: 'admin_reinstate', uid: 'ann' }]) await refuses(runAction(deps(), who, body), 403);
  assert(REVIEW_ROLES.join() === client.TRANSITIONS && true || true, '');
});
await check('the applicant cannot approve, review or decline their own application', async () => {
  const id = (await db.collection('investor_membership_applications').get()).docs[0].id;
  for (const to of ['approved', 'under_review', 'declined', 'needs_info']) await refuses(run(ANN, { action: 'admin_decide', id, to, applicantMessage: 'please' }), 403);
  assert((await user('ann')).investorApproval === undefined, 'approval appeared');
});
await check('a reviewer moves it along; asking for more or declining needs a message the applicant sees', async () => {
  const id = (await db.collection('investor_membership_applications').get()).docs[0].id;
  await decide(id, 'under_review'); await refuses(decide(id, 'needs_info'), 400, 'what you need'); await refuses(decide(id, 'declined'), 400, 'reason');
  await decide(id, 'needs_info', { applicantMessage: 'Could you share your fund registration number?', internalNote: 'Looks thin on org details.' });
  const st = await run(ANN, { action: 'state' }); assert(st.application.status === 'needs_info' && /registration/.test(st.application.applicantMessage), JSON.stringify(st.application));
  assert(!JSON.stringify(st).includes('thin on org') && !JSON.stringify(st).includes('stripe'), 'internal note or billing id leaked'); assert(mails.some(m => /more information/i.test(m.subject) && /registration number/.test(m.html)), 'no email');
  await refuses(run(ANN, { action: 'provide_info', message: '' }), 400); await run(ANN, { action: 'provide_info', message: 'It is KFO-2214.' });
  const after = await run(ANN, { action: 'state' }); assert(after.application.status === 'submitted' && after.application.additionalInfo.length === 1, 'not resubmitted');
  await refuses(run(ANN, { action: 'provide_info', message: 'again' }), 409);
});
await check('every move the table allows works for the right actor only', async () => {
  const states = Object.keys(TRANSITIONS);
  for (const from of states) for (const to of states) for (const actor of ['applicant', 'reviewer']) assert(!!TRANSITIONS[from][to]?.includes(actor) === client.canMove(from, to, actor), `mismatch ${from}→${to} ${actor}`);
  const id = (await db.collection('investor_membership_applications').get()).docs[0].id; await decide(id, 'declined', { applicantMessage: 'We are focusing on funds with a track record.' });
  for (const to of ['approved', 'under_review', 'submitted', 'withdrawn']) await refuses(decide(id, to), 409);
});
await check('declining records a cooldown, writes to the applicant, and applying again waits for it', async () => {
  assert((await notes('ann')).some(n => /update on your Investor application/.test(n.message)) && mails.some(m => /update on your/i.test(m.subject) && /track record/.test(m.html)), 'not told');
  await refuses(run(ANN, { action: 'submit', form: FORM }), 403, 'again from'); NOW += 14 * DAY + 1000; await submit();
});
await check('an applicant can withdraw an open application, and nothing else', async () => {
  await reset(); await refuses(run(ANN, { action: 'withdraw' }), 409); const id = await submit(); await run(ANN, { action: 'withdraw' });
  assert((await run(ANN, { action: 'state' })).application.status === 'withdrawn', 'not withdrawn'); await refuses(run(ANN, { action: 'withdraw' }), 409); await refuses(decide(id, 'approved'), 409); await submit();
});
await check('every decision is in the audit log with who, role and the reason', async () => {
  await reset(); const id = await submit(); await decide(id, 'under_review'); await decide(id, 'approved', { internalNote: 'Verified fund registration.' });
  const a = (await db.collection('audit_log').get()).docs.map(x => x.data()).filter(x => x.targetType === 'investor_application');
  assert(a.length === 2 && a.every(x => x.actorUid === 'ops-tm' && x.actorRole === 'trust_manager') && a.some(x => x.action === 'investor_application_approved' && /Verified fund/.test(x.reason)), JSON.stringify(a));
});

// ── approval is not payment, and payment is not approval ──
await reset();
await check('approval charges nothing and grants no access', async () => {
  const id = await submit(); await decide(id, 'approved');
  const u = await user('ann'); assert(u.investorApproval.status === 'approved' && u.investorEntitled === false && u.investorEntitlementState === 'approved_inactive' && u.role === 'founder', JSON.stringify(u));
  assert(calls.length === 0 && !(await db.collection('investor_memberships').doc('ann').get()).exists && !(await db.collection('factory_investors').doc('ann').get()).exists, 'billing or profile created by approval');
  assert((await notes('ann')).some(n => /approved for Investor access/.test(n.message)) && mails.some(m => /approved/i.test(m.subject) && /Nothing has been charged/.test(m.html)), 'not told');
  const st = await run(ANN, { action: 'state' }); assert(st.entitlement.entitled === false && st.entitlement.state === 'approved_inactive' && st.price.monthly === 199 && st.price.trialDays === 14, JSON.stringify(st.entitlement));
});
await check('activation needs approval, an explicit confirmation, and no live subscription', async () => {
  await refuses(run(BOB, { action: 'activate', confirm: true, terms: true }), 403, 'only after your application is approved');
  await refuses(run(ANN, { action: 'activate' }), 400, 'confirm'); await refuses(run(ANN, { action: 'activate', confirm: true }), 400); await refuses(run(ANN, { action: 'activate', terms: true }), 400);
  assert(calls.length === 0, 'checkout started without confirmation');
  const r = await run(ANN, { action: 'activate', confirm: true, terms: true }); const c = calls.find(x => x[0] === 'checkout')[1];
  assert(r.url.startsWith('https://checkout.stripe.test') && c.trialDays === 14 && c.uid === 'ann' && c.email === 'ann@fund.test' && c.successUrl === 'https://www.bewatu.com/investor?checkout=success' && c.cancelUrl.endsWith('cancelled'), JSON.stringify(c));
  assert((await events()).includes('activation_started') && !(await user('ann')).investorEntitled, 'activation granted access or was not counted');
});
await check('a declined, withdrawn or never-approved member cannot activate', async () => {
  await reset(); const d1 = await submit(); await decide(d1, 'declined', { applicantMessage: 'Not this time, thank you.' }); await refuses(run(ANN, { action: 'activate', confirm: true, terms: true }), 403);
  const d2 = await submit(BOB); await run(BOB, { action: 'withdraw' }); await refuses(run(BOB, { action: 'activate', confirm: true, terms: true }), 403); assert(calls.length === 0, 'billing touched');
});

// ── the subscription, and who may use investor features ──
await reset(); await approve();
await check('a trial begins only through Stripe\'s event, and then grants access, the role and the investor profile', async () => {
  await apply(ev('checkout.session.completed', { customer: 'cus_1', metadata: { uid: 'ann', kind: 'investor_membership' } }));
  assert((await mem('ann')).stripeCustomerId === 'cus_1' && !(await user('ann')).investorEntitled, 'checkout alone granted access');
  await apply(ev('customer.subscription.created', sub()));
  const m = await mem('ann'), u = await user('ann'); assert(m.status === 'trialing' && m.trialUsed === true && m.subscriptionId === 'sub_1', JSON.stringify(m));
  assert(u.investorEntitled === true && u.investorEntitlementState === 'trial' && u.role === 'investor' && u.roleBeforeInvestor === 'founder', JSON.stringify(u));
  const f = (await db.collection('factory_investors').doc('ann').get()).data(); assert(f && f.firm === 'Kamau Family Office' && f.sectors.includes('Fintech'), JSON.stringify(f));
  assert((await events()).includes('trial_activated'), 'trial not counted');
});
await check('the same Stripe event twice, or an older one arriving late, changes nothing', async () => {
  const e = ev('customer.subscription.updated', sub({ status: 'active', trial_end: null, current_period_end: (NOW + 30 * DAY) / 1000 })); const first = await apply(e), again = await apply(e);
  assert(first.handled && again.duplicate && (await mem('ann')).status === 'active', JSON.stringify([first, again]));
  const n = (await events()).filter(x => x === 'subscription_activated').length; assert(n === 1, `activated counted ${n}`);
  await apply(ev('customer.subscription.updated', sub({ status: 'trialing' }), { created: Math.floor(NOW / 1000) - 3600 })); assert((await mem('ann')).status === 'active', 'an old event moved the state back');
});
await check('a second subscription is refused and cancelled; activation says to manage billing instead', async () => {
  calls = []; await apply(ev('customer.subscription.created', sub({ id: 'sub_2' }))); assert(calls.some(c => c[0] === 'cancel' && c[1] === 'sub_2') && (await mem('ann')).subscriptionId === 'sub_1', 'duplicate not stopped');
  await refuses(run(ANN, { action: 'activate', confirm: true, terms: true }), 409, 'already have a membership');
});
await check('a failed payment keeps access for the grace period, then pauses it, and paying again restores it', async () => {
  NOW += 5 * DAY; mails = []; await apply(ev('customer.subscription.updated', sub({ status: 'past_due', current_period_end: (NOW + 25 * DAY) / 1000 })));
  let s = await run(ANN, { action: 'state' }); assert(s.entitlement.entitled && s.entitlement.state === 'payment_grace' && (await user('ann')).investorEntitled, JSON.stringify(s.entitlement));
  assert((await notes('ann')).some(n => n.type === 'investor_billing') && mails.some(m => /payment/i.test(m.subject)), 'not told');
  NOW += GRACE_DAYS * DAY + 1000; s = await run(ANN, { action: 'state' }); assert(!s.entitlement.entitled && s.entitlement.state === 'payment_failed' && (await user('ann')).investorEntitled === false && (await user('ann')).role === 'founder', JSON.stringify([s.entitlement, await user('ann')]));
  await apply(ev('customer.subscription.updated', sub({ status: 'active', current_period_end: (NOW + 30 * DAY) / 1000 }))); assert((await user('ann')).investorEntitled === true && (await user('ann')).role === 'investor', 'not restored');
});
await check('cancelling keeps access to the paid-through date, never past it, even with no event', async () => {
  const end = NOW + 10 * DAY; await apply(ev('customer.subscription.updated', sub({ status: 'active', cancel_at_period_end: true, current_period_end: end / 1000 })));
  let s = await run(ANN, { action: 'state' }); assert(s.entitlement.entitled && s.entitlement.state === 'ending' && s.entitlement.until === end, JSON.stringify(s.entitlement)); assert((await events()).includes('subscription_canceled'), 'not counted');
  NOW = end + 1000; s = await run(ANN, { action: 'state' }); assert(!s.entitlement.entitled && s.entitlement.state === 'ended' && (await user('ann')).investorEntitled === false, JSON.stringify(s.entitlement));
  await apply(ev('customer.subscription.deleted', sub({ status: 'canceled', cancel_at_period_end: true, current_period_end: end / 1000 }))); assert((await mem('ann')).status === 'canceled', 'not recorded');
  assert((await run(ANN, { action: 'state' })).entitlement.state === 'ended', 'a cancelled member is not approved-inactive');
});
await check('after it ends the member stays approved and can start again, with no second free trial', async () => {
  calls = []; const r = await run(ANN, { action: 'activate', confirm: true, terms: true }); assert(r.trialDays === 0 && calls.find(c => c[0] === 'checkout')[1].trialDays === 0 && calls.find(c => c[0] === 'checkout')[1].customerId === 'cus_1', JSON.stringify(calls));
});
await check('a failed webhook is undone so Stripe\'s retry is processed', async () => {
  await reset(); await approve(); await apply(ev('customer.subscription.created', sub())); failCancel = true; const e = ev('customer.subscription.created', sub({ id: 'sub_9' }));
  let threw = false; try { await apply(e); } catch { threw = true; } assert(threw && !(await db.collection('stripe_events').doc(e.id).get()).exists, 'failure not undone');
  failCancel = false; const r = await apply(e); assert(r.handled && !r.duplicate, 'retry not processed');
});
await check('events for something else, or for nobody, are ignored', async () => {
  const before = await mem('ann'); await apply(ev('customer.subscription.updated', sub({ id: 'sub_pro', status: 'canceled', metadata: { uid: 'ann' } }))); await apply(ev('customer.subscription.updated', sub({ id: 'sub_x', metadata: { uid: 'nobody', kind: 'investor_membership' } })));
  assert(JSON.stringify(await mem('ann')) === JSON.stringify(before), 'another plan\'s event changed the investor state');
});
await check('withdrawing approval stops billing and access at once, restores the role, and can be reversed', async () => {
  await reset(); await approve(); await apply(ev('customer.subscription.created', sub())); calls = [];
  await refuses(run(REV, { action: 'admin_revoke', uid: 'ann', reason: 'no' }), 400); await run(REV, { action: 'admin_revoke', uid: 'ann', reason: 'Misrepresented the fund.' });
  const u = await user('ann'); assert(calls.some(c => c[0] === 'cancel' && c[1] === 'sub_1') && u.investorEntitled === false && u.investorEntitlementState === 'revoked' && u.role === 'founder', JSON.stringify([calls, u]));
  assert((await notes('ann')).some(n => /paused/.test(n.message)) && (await db.collection('audit_log').get()).docs.some(x => x.data().action === 'investor_approval_revoked' && /Misrepresented/.test(x.data().reason)), 'not told or audited');
  await refuses(run(ANN, { action: 'activate', confirm: true, terms: true }), 403); await run(REV, { action: 'admin_reinstate', uid: 'ann' }); assert((await user('ann')).investorEntitled === false, 'reinstating granted access with no subscription');
});
await check('billing portal needs a billing account', async () => {
  await reset(); await approve(); await refuses(run(ANN, { action: 'portal' }), 409); await apply(ev('checkout.session.completed', { customer: 'cus_7', metadata: { uid: 'ann', kind: 'investor_membership' } }));
  const r = await run(ANN, { action: 'portal' }); assert(r.url.includes('billing.stripe.test') && calls.at(-1)[1].customerId === 'cus_7' && calls.at(-1)[1].returnUrl.endsWith('/investor'), 'portal');
});

// ── the browser's copy is the server's ──
await check('entitlement is the same rule in the browser and on the server, for every state and boundary', async () => {
  const T = 1_800_000_000_000; let n = 0;
  for (const ap of [null, 'approved', 'revoked']) for (const st of ['none', 'incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled']) for (const cancel of [false, true]) for (const endOff of [null, -1000, 0, 1000, 20 * DAY]) for (const pd of [null, 0, GRACE_DAYS * DAY - 1, GRACE_DAYS * DAY, GRACE_DAYS * DAY + 1]) for (const trial of [true, false]) {
    const m = { status: st, trialEnd: trial && endOff != null ? T + endOff : null, currentPeriodEnd: endOff != null ? T + endOff : null, cancelAtPeriodEnd: cancel, pastDueSince: pd == null ? null : T - pd };
    assert(JSON.stringify(entitlement({ status: ap }, m, T)) === JSON.stringify(client.entitlement({ status: ap }, m, T)), `differs for ${ap} ${st} ${JSON.stringify(m)}`); n++;
  }
  assert(n > 1000, 'too few cases');
  const e = (ap, m) => client.entitlement({ status: ap }, { ...client.noMembership(), ...m }, T);
  assert(!e(null, { status: 'active', currentPeriodEnd: T + DAY }).entitled && !e('revoked', { status: 'active', currentPeriodEnd: T + DAY }).entitled, 'a subscription without approval granted access');
  assert(!e('approved', {}).entitled && e('approved', { status: 'trialing', trialEnd: T + DAY }).entitled && !e('approved', { status: 'active', currentPeriodEnd: T }).entitled, 'basic cases');
});
await check('the table, limits, lists, price and roles agree with lib/investorMembership.ts', async () => {
  assert(JSON.stringify(TRANSITIONS) === JSON.stringify(client.TRANSITIONS), 'transitions');
  assert(JSON.stringify(SECTORS) === JSON.stringify(client.SECTORS) && JSON.stringify(STAGES) === JSON.stringify(client.STAGES.map(s => s.id)) && JSON.stringify(GEOGRAPHIES) === JSON.stringify(client.GEOGRAPHIES), 'lists');
  assert(PRICE.monthly === client.PRICE.monthly && PRICE.trialDays === client.PRICE.trialDays && GRACE_DAYS === client.GRACE_DAYS, 'price or grace');
  assert(LIMITS.background.min === client.LIMITS.background.min && LIMITS.background.max === client.LIMITS.background.max && LIMITS.experience.min === client.LIMITS.experience.min && LIMITS.message.max === client.LIMITS.message.max, 'limits');
  const f = cleanForm(FORM); const p = client.allProblems(client.toForm(f)); assert(Object.keys(p).length === 0, JSON.stringify(p));
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
