// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/plan-subscriptions/run-tests.mjs"
// Guards how a member's plan (Pro, Factory) is recorded (api/create-subscription.ts, api/stripe-webhook.ts):
//   - only the server writes it; the member is found from the uid stamped on the subscription, never from the browser
//   - each Stripe event is applied once, a failed one is retried, an older one never overwrites a newer one
//   - a plan counts only while the subscription is live; anything else is Free
//   - investor membership is left to its own flow
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applySubscriptionEvent, planFields, planFromPrice } from '../../api/stripe-webhook.ts';
import { recordSubscription, TRIAL_DAYS } from '../../api/create-subscription.ts';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-plans' });
const db = getFirestore();
const ENV = { STRIPE_PRO_PRICE_ID: 'price_pro', STRIPE_FACTORY_PRICE_ID: 'price_fac', STRIPE_INVESTOR_PRICE_ID: 'price_inv' };
const T = 1_800_000_000;
let n = 0;
const sub = (o = {}) => ({ id: 'sub_1', status: 'trialing', metadata: { uid: 'ann', tier: 'pro' }, trial_end: T + 30 * 86400, current_period_end: T + 30 * 86400, items: { data: [{ price: { id: 'price_pro' } }] }, ...o });
const ev = (type, object, created = T) => ({ id: 'evt_' + ++n, type, created, data: { object } });
const user = async uid => (await db.collection('users').doc(uid).get()).data();
const apply = e => applySubscriptionEvent(db, e, ENV);
const reset = async () => { for (const c of ['users', 'plan_stripe_events', 'plan_subscriptions']) { const s = await db.collection(c).get(); for (const x of s.docs) { for (const sc of await x.ref.listCollections()) (await sc.get()).docs.forEach(d => d.ref.delete()); await x.ref.delete(); } } await db.collection('users').doc('ann').set({ displayName: 'Ann', subscriptionTier: 'free' }); };
await reset();

await check('a price buys the right plan, and investor is not one of them', async () => {
  assert(planFromPrice('price_pro', ENV) === 'pro' && planFromPrice('price_fac', ENV) === 'factory' && planFromPrice('price_inv', ENV) === 'free' && planFromPrice('price_other', ENV) === 'free' && planFromPrice(null, ENV) === 'free' && planFromPrice(undefined, {}) === 'free', 'prices');
});
await check('a plan counts only while the subscription is live', async () => {
  for (const [status, tier] of [['trialing', 'pro'], ['active', 'pro'], ['past_due', 'pro'], ['canceled', 'free'], ['unpaid', 'free'], ['incomplete', 'free'], ['incomplete_expired', 'free'], ['paused', 'free']]) { const f = planFields(sub({ status }), ENV); assert(f.subscriptionTier === tier && f.subscriptionStatus === status, `${status} → ${f.subscriptionTier}`); }
  assert(planFields(sub({ status: 'canceled' }), ENV).subscriptionId === null, 'a dead subscription kept its id');
});
await check('a new subscription puts the member on the plan, with its dates', async () => {
  const r = await apply(ev('customer.subscription.created', sub())); const u = await user('ann');
  assert(r.handled && u.subscriptionTier === 'pro' && u.subscriptionStatus === 'trialing' && u.subscriptionId === 'sub_1' && u.subscriptionPriceId === 'price_pro' && u.trialEndsAt === new Date((T + 30 * 86400) * 1000).toISOString(), JSON.stringify(u));
});
await check('the same event twice changes nothing; an older event never overwrites a newer one', async () => {
  const e = ev('customer.subscription.updated', sub({ status: 'active', trial_end: null }), T + 100); const a = await apply(e), b = await apply(e); assert(a.handled && b.duplicate, JSON.stringify([a, b]));
  const late = await apply(ev('customer.subscription.updated', sub({ status: 'trialing' }), T + 50)); assert(!late.handled && (await user('ann')).subscriptionStatus === 'active', 'an old event won');
});
await check('a failed event is undone so Stripe\'s retry is applied', async () => {
  const bad = ev('customer.subscription.updated', sub({ status: 'active' }), T + 200); const real = db.collection.bind(db); let boom = true;
  const flaky = new Proxy(db, { get(t, p) { if (p === 'collection') return c => { const col = real(c); if (c === 'plan_subscriptions' && boom) return { doc: () => ({ get: async () => { throw new Error('db down'); } }) }; return col; }; return t[p].bind ? t[p].bind(t) : t[p]; } });
  let threw = false; try { await applySubscriptionEvent(flaky, bad, ENV); } catch { threw = true; } boom = false;
  assert(threw && !(await db.collection('plan_stripe_events').doc(bad.id).get()).exists, 'failure not undone'); assert((await apply(bad)).handled, 'retry not applied');
});
await check('ending the subscription puts the member back on Free and clears it', async () => {
  await apply(ev('customer.subscription.deleted', sub({ status: 'active' }), T + 300)); const u = await user('ann');
  assert(u.subscriptionTier === 'free' && u.subscriptionStatus === 'canceled' && u.subscriptionId === null && u.trialEndsAt === null, JSON.stringify(u));
});
await check('a trial ending soon, pausing and resuming are recorded', async () => {
  await apply(ev('customer.subscription.created', sub({ id: 'sub_2', status: 'trialing', items: { data: [{ price: { id: 'price_fac' } }] } }), T + 400)); assert((await user('ann')).subscriptionTier === 'factory', 'factory');
  await apply(ev('customer.subscription.trial_will_end', sub({ id: 'sub_2' }), T + 410)); assert((await user('ann')).trialEndingSoon === true, 'trial warning');
  await apply(ev('customer.subscription.paused', sub({ id: 'sub_2' }), T + 420)); assert((await user('ann')).subscriptionTier === 'free' && (await user('ann')).subscriptionStatus === 'paused', 'paused');
  await apply(ev('customer.subscription.updated', sub({ id: 'sub_2', status: 'active', items: { data: [{ price: { id: 'price_fac' } }] } }), T + 430)); assert((await user('ann')).subscriptionTier === 'factory' && (await user('ann')).trialEndingSoon === false, 'resumed');
});
await check('investor membership and unknown members are left alone', async () => {
  const before = JSON.stringify(await user('ann'));
  const a = await apply(ev('customer.subscription.created', sub({ id: 'sub_i', metadata: { uid: 'ann', kind: 'investor_membership' }, items: { data: [{ price: { id: 'price_inv' } }] } }), T + 500));
  const b = await apply(ev('customer.subscription.created', sub({ id: 'sub_j', metadata: { uid: 'ann' }, items: { data: [{ price: { id: 'price_inv' } }] } }), T + 510));
  const c = await apply(ev('customer.subscription.created', sub({ id: 'sub_k', metadata: { uid: 'nobody' } }), T + 520)); const d = await apply(ev('customer.subscription.created', sub({ id: 'sub_l', metadata: {} }), T + 530)); const e = await apply(ev('invoice.paid', { id: 'in_1' }, T + 540));
  assert(![a, b, c, d, e].some(x => x.handled) && JSON.stringify(await user('ann')) === before, JSON.stringify([a, b, c, d, e]));
});
await check('creating a subscription records the plan and the Stripe customer on the server side', async () => {
  await reset(); await recordSubscription(db, 'ann', { tier: 'pro', status: 'trialing', subscriptionId: 'sub_9', priceId: 'price_pro', trialEnd: T + 30 * 86400, customerId: 'cus_9' });
  const u = await user('ann'); assert(u.subscriptionTier === 'pro' && u.subscriptionStatus === 'trialing' && u.subscriptionId === 'sub_9' && u.subscriptionPriceId === 'price_pro', JSON.stringify(u));
  assert((await db.collection('users').doc('ann').collection('private').doc('contact').get()).data().stripeCustomerId === 'cus_9', 'customer id not recorded'); assert(TRIAL_DAYS.pro === 30 && TRIAL_DAYS.factory === 14 && TRIAL_DAYS.investor === undefined, 'trial days');
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
