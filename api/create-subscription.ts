/**
 * api/create-subscription.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel Edge Function — creates a Stripe customer + subscription.
 * Supports all BeWatu tiers: pro, factory, investor.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Stripe from 'stripe';

export const config = { runtime: 'edge' };

const PRICE_IDS: Record<string, string | undefined> = {
  pro:      process.env.STRIPE_PRO_PRICE_ID,
  factory:  process.env.STRIPE_FACTORY_PRICE_ID,
  investor: process.env.STRIPE_INVESTOR_PRICE_ID,
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { name, email, paymentMethodId, tier = 'pro' } = await req.json();

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error('Server configuration error: missing Stripe key');

    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Invalid tier: ${tier}` }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!name || !email || !paymentMethodId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2025-10-29.clover',
      typescript: true,
    });

    // 1. Create Stripe customer
    const customer = await stripe.customers.create({
      email,
      name,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
      metadata: { tier },
    });

    // 2. Create subscription with 30-day trial for pro, 14-day for factory/investor
    const trialDays = tier === 'pro' ? 30 : 14;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      expand: ['latest_invoice.payment_intent'],
      metadata: { tier },
    });

    return new Response(JSON.stringify({
      customerId:     customer.id,
      subscriptionId: subscription.id,
      status:         subscription.status,
      tier,
      trialEnd:       subscription.trial_end,
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Stripe error:', error);
    return new Response(JSON.stringify({ error: error.message ?? 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
