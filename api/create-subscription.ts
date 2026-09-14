/**
 * api/create-subscription.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel Edge Function — creates a Stripe customer + subscription.
 * Supports all BeWatu tiers: pro, factory, investor.
 *
 * Auth (launch-readiness review, P1): this endpoint used to have no
 * authentication at all, and never tied the Stripe customer it created to
 * any BeWatu account — a direct, bypassed POST could spam Stripe with
 * orphaned trial subscriptions. Now requires a valid Firebase ID token and
 * stamps the verified uid onto both the customer and subscription metadata.
 *
 * Verified via jose's createRemoteJWKSet/jwtVerify against Google's public
 * JWKS rather than firebase-admin/auth — the latter needs the Node runtime,
 * which this Edge function doesn't have (see the jwks-rsa/jose ESM
 * incompatibility incident elsewhere in this review for why that
 * distinction matters: firebase-admin/auth crashed under Vercel's real
 * bundler the one time it was tried on a comparable Edge/serverless path).
 *
 * This requires every caller to have a real Firebase account BEFORE calling
 * this endpoint. RegistrationPage.tsx's recruiter signup flow used to call
 * Stripe first, Firebase second — reordered (Firebase account first, then
 * this call) specifically to make this auth requirement possible without
 * breaking live recruiter registration.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Stripe from 'stripe';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const config = { runtime: 'edge' };

const PRICE_IDS: Record<string, string | undefined> = {
  pro:      process.env.STRIPE_PRO_PRICE_ID,
  factory:  process.env.STRIPE_FACTORY_PRICE_ID,
  investor: process.env.STRIPE_INVESTOR_PRICE_ID,
};

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/** Verifies the caller's Firebase ID token and returns their uid, or throws. */
async function verifyCaller(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) throw new Error('Missing bearer token');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Server configuration error: missing FIREBASE_PROJECT_ID');

  const { payload } = await jwtVerify(match[1], GOOGLE_JWKS, {
    issuer:   `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub) throw new Error('Token has no subject');
  return payload.sub;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  let uid: string;
  try {
    uid = await verifyCaller(req);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Unauthorized: ${err.message ?? 'invalid token'}` }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
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

    // 1. Create Stripe customer — tagged with the verified uid so this
    //    customer/subscription can never be orphaned from a real account.
    const customer = await stripe.customers.create({
      email,
      name,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
      metadata: { tier, uid },
    });

    // 2. Create subscription with 30-day trial for pro, 14-day for factory/investor
    const trialDays = tier === 'pro' ? 30 : 14;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      expand: ['latest_invoice.payment_intent'],
      metadata: { tier, uid },
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
