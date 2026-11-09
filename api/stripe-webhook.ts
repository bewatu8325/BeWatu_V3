/**
 * api/stripe-webhook.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe → BeWatu: keeps a member's plan (Pro, Factory) in step with their subscription.
 *
 * This is the one place the plan fields on a member's profile are written (with api/create-subscription.ts, which records the
 * subscription it has just made). The browser cannot write them: firestore.rules freezes subscriptionTier, subscriptionStatus,
 * subscriptionId, subscriptionPriceId, trialEndsAt, currentPeriodEnd and factoryUnlocked for everyone but BeWatu staff.
 *
 *   - Signature verified. Each Stripe event is applied once (a failed one is undone so Stripe's retry runs), and an older event
 *     arriving after a newer one is ignored.
 *   - The member comes from the uid that api/create-subscription.ts stamped on the subscription, never from anything a browser sent.
 *   - Investor membership has its own approval-aware flow (api/investor-membership.ts) and is ignored here.
 *   - A plan counts only while the subscription is live (trialing, active, past due); anything else puts the member back on Free.
 *
 * Previously this was an Edge function writing to Firestore over REST with the web key. Security rules reject those writes, and it
 * looked members up by a field that is stored elsewhere, so it could never have updated anyone; the browser did the writing instead.
 * Stripe: POST /api/stripe-webhook, signing secret in STRIPE_WEBHOOK_SECRET.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

export type Plan = 'free' | 'pro' | 'factory';
const LIVE = ['trialing', 'active', 'past_due'];

/** The plan a Stripe price buys. Investor is deliberately not here. */
export function planFromPrice(priceId: string | undefined | null, env: Record<string, string | undefined> = process.env): Plan {
  if (priceId && priceId === env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId && priceId === env.STRIPE_FACTORY_PRICE_ID) return 'factory';
  return 'free';
}
const iso = (secs: unknown) => (typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null);

/** The fields of a member's profile that say which plan they have, from a Stripe subscription. */
export function planFields(sub: any, env: Record<string, string | undefined> = process.env) {
  const item = sub?.items?.data?.[0];
  const priceId: string | null = item?.price?.id ?? null;
  const live = LIVE.includes(sub?.status);
  return {
    subscriptionTier: live ? planFromPrice(priceId, env) : 'free',
    subscriptionStatus: String(sub?.status ?? 'canceled'),
    subscriptionId: live ? String(sub.id) : null,
    subscriptionPriceId: live ? priceId : null,
    trialEndsAt: live ? iso(sub?.trial_end) : null,
    currentPeriodEnd: live ? iso(sub?.current_period_end ?? item?.current_period_end) : null,
  };
}

const isInvestor = (sub: any, env: Record<string, string | undefined>) => sub?.metadata?.kind === 'investor_membership' || (!!env.STRIPE_INVESTOR_PRICE_ID && sub?.items?.data?.some((i: any) => i?.price?.id === env.STRIPE_INVESTOR_PRICE_ID));

/** Writes a member's plan fields. The one and only writer (besides create-subscription, which uses this too). */
export async function writePlan(db: Firestore, uid: string, fields: Record<string, unknown>) {
  await db.collection('users').doc(uid).set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** One verified Stripe event, applied once. Returns what happened, for logs and tests. */
export async function applySubscriptionEvent(db: Firestore, event: { id: string; type: string; created: number; data: { object: any } }, env: Record<string, string | undefined> = process.env): Promise<{ handled: boolean; duplicate?: boolean; reason?: string }> {
  const evRef = db.collection('plan_stripe_events').doc(event.id);     // its own collection: the investor webhook sees the same event ids
  try { await evRef.create({ type: event.type, at: Date.now() }); } catch (e: any) { if (e?.code === 6 || /already exists/i.test(String(e?.message))) return { handled: false, duplicate: true }; throw e; }
  try {
    const o = event.data.object;
    const TYPES = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed', 'customer.subscription.trial_will_end'];
    if (!TYPES.includes(event.type)) return { handled: false, reason: 'not a plan event' };
    if (isInvestor(o, env)) return { handled: false, reason: 'investor membership' };
    const uid = o?.metadata?.uid;
    if (typeof uid !== 'string' || !uid) return { handled: false, reason: 'no member on the subscription' };
    if (!(await db.collection('users').doc(uid).get()).exists) return { handled: false, reason: 'unknown member' };

    const stamp = db.collection('plan_subscriptions').doc(uid);
    const last = (await stamp.get()).data()?.lastEventAt;
    if (typeof last === 'number' && event.created * 1000 < last) return { handled: false, reason: 'older than what is recorded' };

    if (event.type === 'customer.subscription.trial_will_end') await writePlan(db, uid, { trialEndingSoon: true, trialEndsAt: iso(o.trial_end) });
    else if (event.type === 'customer.subscription.deleted') await writePlan(db, uid, planFields({ ...o, status: 'canceled' }, env));
    else if (event.type === 'customer.subscription.paused') await writePlan(db, uid, { subscriptionStatus: 'paused', subscriptionTier: 'free' });
    else await writePlan(db, uid, { ...planFields(o, env), trialEndingSoon: false });
    await stamp.set({ lastEventAt: event.created * 1000, subscriptionId: o.id ?? null }, { merge: true });
    return { handled: true };
  } catch (e) { await evRef.delete().catch(() => {}); throw e; }   // let Stripe retry it
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}
async function rawBody(req: VercelRequest): Promise<string> { const chunks: Buffer[] = []; for await (const c of req as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); return Buffer.concat(chunks).toString('utf8'); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const secret = process.env.STRIPE_WEBHOOK_SECRET, key = process.env.STRIPE_SECRET_KEY, sig = req.headers['stripe-signature'];
  if (!secret || !key) return res.status(500).send('Server configuration error');
  if (typeof sig !== 'string') return res.status(400).send('Missing signature');
  let event: Stripe.Event;
  try { event = await new Stripe(key, { apiVersion: '2025-10-29.clover' }).webhooks.constructEventAsync(await rawBody(req), sig, secret); }
  catch (e: any) { console.error('Webhook signature verification failed:', e.message); return res.status(400).send(`Webhook error: ${e.message}`); }
  try {
    const out = await applySubscriptionEvent(getFirestore(getAdminApp()), event as any);
    return res.status(200).json({ received: true, ...out });
  } catch (e: any) {
    console.error('Error processing webhook:', e?.code ?? e?.message);
    return res.status(500).send('Webhook processing error');
  }
}
