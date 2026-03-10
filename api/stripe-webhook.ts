/**
 * api/stripe-webhook.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel Edge Function — receives Stripe subscription events and keeps
 * the user's Firestore doc in sync with their subscription status.
 *
 * Events handled:
 *   customer.subscription.created  → set tier, status, dates
 *   customer.subscription.updated  → update tier, status, dates
 *   customer.subscription.deleted  → downgrade to 'free'
 *   customer.subscription.paused   → pause access
 *   customer.subscription.resumed  → restore access
 *   customer.subscription.trial_will_end → flag upcoming trial end
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Stripe from 'stripe';

export const config = { runtime: 'edge' };

// ── Price ID → BeWatu tier mapping ────────────────────────────────────────────
function getTierFromPriceId(priceId: string): string {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)       return 'pro';
  if (priceId === process.env.STRIPE_FACTORY_PRICE_ID)   return 'factory';
  if (priceId === process.env.STRIPE_INVESTOR_PRICE_ID)  return 'investor';
  return 'free';
}

// ── Update Firestore via Firebase REST API ────────────────────────────────────
// We use the REST API here because the Admin SDK isn't available in Edge runtime.
// The webhook looks up the user by stripeCustomerId stored in Firestore.
async function updateUserSubscription(
  customerId: string,
  updates: Record<string, any>
): Promise<void> {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const apiKey    = process.env.VITE_FIREBASE_API_KEY;

  // 1. Query Firestore for user with this stripeCustomerId
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;

  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'stripeCustomerId' },
          op: 'EQUAL',
          value: { stringValue: customerId },
        },
      },
      limit: 1,
    },
  };

  const queryRes = await fetch(queryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody),
  });

  const queryData = await queryRes.json() as any[];
  const userDoc = queryData?.[0]?.document;
  if (!userDoc) {
    console.error(`No user found for stripeCustomerId: ${customerId}`);
    return;
  }

  // 2. Extract the document path and update it
  const docPath = userDoc.name; // e.g. projects/.../documents/users/UID
  const updateUrl = `https://firestore.googleapis.com/v1/${docPath}?key=${apiKey}`;

  // Convert updates object to Firestore field format
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'string')  fields[key] = { stringValue: value };
    if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    if (typeof value === 'number')  fields[key] = { integerValue: String(value) };
    if (value === null)             fields[key] = { nullValue: null };
  }
  fields['updatedAt'] = { timestampValue: new Date().toISOString() };

  const updateMask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');

  await fetch(`${updateUrl}&${updateMask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey     = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2025-10-29.clover',
    typescript: true,
  });

  // Verify webhook signature
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  let event: Stripe.Event;
  const body = await req.text();

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  // Handle events
  try {
    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id ?? '';
        const tier = getTierFromPriceId(priceId);

        await updateUserSubscription(sub.customer as string, {
          subscriptionTier:     tier,
          subscriptionStatus:   sub.status,
          subscriptionId:       sub.id,
          subscriptionPriceId:  priceId,
          trialEndsAt:          sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          currentPeriodEnd:     new Date((sub as any).current_period_end * 1000).toISOString(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await updateUserSubscription(sub.customer as string, {
          subscriptionTier:    'free',
          subscriptionStatus:  'canceled',
          subscriptionId:      null,
          subscriptionPriceId: null,
          trialEndsAt:         null,
          currentPeriodEnd:    null,
        });
        break;
      }

      case 'customer.subscription.paused': {
        const sub = event.data.object as Stripe.Subscription;
        await updateUserSubscription(sub.customer as string, {
          subscriptionStatus: 'paused',
        });
        break;
      }

      case 'customer.subscription.resumed': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id ?? '';
        await updateUserSubscription(sub.customer as string, {
          subscriptionTier:  getTierFromPriceId(priceId),
          subscriptionStatus: 'active',
        });
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        await updateUserSubscription(sub.customer as string, {
          trialEndingSoon: true,
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        });
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
    return new Response('Webhook processing error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
