/**
 * api/create-subscription.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a Stripe customer and a subscription for Pro or Factory, and records the plan on the member's profile.
 *
 *   - The caller must be signed in; the verified uid is stamped on the Stripe customer and subscription, so a subscription can
 *     never be orphaned from a real account, and api/stripe-webhook.ts finds the member from it later.
 *   - The plan is written here, by the server, right after Stripe accepts the subscription. The browser used to write it itself,
 *     which let any member set their own plan; firestore.rules now freezes those fields.
 *   - Investor membership is never bought here. It starts with an application and is activated only after approval, through
 *     api/investor-membership.ts.
 *
 * Previously an Edge function (jose-verified token, no database access). It is a Node function now so it can use the Admin SDK
 * to record the plan and to verify the token the same way every other route does.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

export const PRICE_IDS: Record<string, string | undefined> = {
  pro:     process.env.STRIPE_PRO_PRICE_ID,
  factory: process.env.STRIPE_FACTORY_PRICE_ID,
};
export const TRIAL_DAYS: Record<string, number> = { pro: 30, factory: 14 };

/** Records a just-created subscription on the member's profile, and their Stripe customer in their private contact record. */
export async function recordSubscription(db: Firestore, uid: string, s: { tier: string; status: string; subscriptionId: string; priceId: string; trialEnd: number | null; customerId: string }) {
  await db.collection('users').doc(uid).set({
    subscriptionTier: s.tier, subscriptionStatus: s.status, subscriptionId: s.subscriptionId, subscriptionPriceId: s.priceId,
    trialEndsAt: s.trialEnd ? new Date(s.trialEnd * 1000).toISOString() : null, updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('users').doc(uid).collection('private').doc('contact').set({ stripeCustomerId: s.customerId }, { merge: true });
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let uid: string;
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new Error('Missing bearer token');
    uid = (await getAuth(getAdminApp()).verifyIdToken(h.slice(7))).uid;
  } catch (err: any) {
    return res.status(401).json({ error: `Unauthorized: ${err.message ?? 'invalid token'}` });
  }

  try {
    const { name, email, paymentMethodId, tier = 'pro', discountCode } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error('Server configuration error: missing Stripe key');

    // Investor membership is never bought directly: it starts with an application and is activated only after approval, through
    // api/investor-membership.ts. Without this, anyone could skip the approval by calling this route with tier: 'investor'.
    if (tier === 'investor') return res.status(403).json({ error: 'Investor membership starts with an application.' });

    const priceId = PRICE_IDS[tier];
    if (!priceId) return res.status(400).json({ error: `Invalid tier: ${tier}` });
    if (!name || !email || !paymentMethodId) return res.status(400).json({ error: 'Missing required fields' });

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-10-29.clover', typescript: true });

    // 1. Customer, tagged with the verified uid so it can never be orphaned from a real account.
    const customer = await stripe.customers.create({
      email, name, payment_method: paymentMethodId, invoice_settings: { default_payment_method: paymentMethodId }, metadata: { tier, uid },
    });

    // 2. Subscription with a 30-day trial for Pro, 14-day for Factory. An admin-generated discount code is looked up against
    //    Stripe's own Promotion Code object, so expiry, redemption limits and active state are enforced by Stripe itself.
    let discounts: Stripe.SubscriptionCreateParams['discounts'];
    if (discountCode) {
      const promos = await stripe.promotionCodes.list({ code: String(discountCode).toUpperCase(), active: true, limit: 1 });
      const promo = promos.data[0];
      if (!promo) return res.status(400).json({ error: 'That discount code is invalid or has expired.' });
      discounts = [{ promotion_code: promo.id }];
    }
    const subscription = await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: priceId }], trial_period_days: TRIAL_DAYS[tier] ?? 14, discounts,
      expand: ['latest_invoice.payment_intent'], metadata: { tier, uid },
    });

    // 3. Record the plan, server-side.
    await recordSubscription(getFirestore(getAdminApp()), uid, { tier, status: subscription.status, subscriptionId: subscription.id, priceId, trialEnd: subscription.trial_end ?? null, customerId: customer.id });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ customerId: customer.id, subscriptionId: subscription.id, subscriptionPriceId: priceId, status: subscription.status, tier, trialEnd: subscription.trial_end });
  } catch (error: any) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
