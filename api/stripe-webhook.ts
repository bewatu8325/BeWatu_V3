/**
 * api/stripe-webhook.ts
 * Vercel Edge Function — syncs Stripe subscription events to Firestore.
 */

import Stripe from 'stripe';

export const config = { runtime: 'edge' };

function getTierFromPriceId(priceId: string): string {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)      return 'pro';
  if (priceId === process.env.STRIPE_FACTORY_PRICE_ID)  return 'factory';
  if (priceId === process.env.STRIPE_INVESTOR_PRICE_ID) return 'investor';
  return 'free';
}

async function updateUserSubscription(
  customerId: string,
  updates: Record<string, any>
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey    = process.env.FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    console.error('Missing Firebase env vars');
    return;
  }

  // 1. Find user by stripeCustomerId
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
  const queryRes = await fetch(queryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    }),
  });

  const queryData = await queryRes.json() as any[];
  const userDoc = queryData?.[0]?.document;
  if (!userDoc) {
    console.error(`No user found for stripeCustomerId: ${customerId}`);
    return;
  }

  // 2. Update the document
  const docPath = userDoc.name;
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'string')  fields[key] = { stringValue: value };
    if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    if (typeof value === 'number')  fields[key] = { integerValue: String(value) };
    if (value === null)             fields[key] = { nullValue: null };
  }
  fields['updatedAt'] = { timestampValue: new Date().toISOString() };

  const updateMask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  await fetch(`https://firestore.googleapis.com/v1/${docPath}?key=${apiKey}&${updateMask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2025-10-29.clover',
    typescript: true,
  });

  let event: Stripe.Event;
  const body = await req.text();

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id ?? '';
        await updateUserSubscription(sub.customer as string, {
          subscriptionTier:    getTierFromPriceId(priceId),
          subscriptionStatus:  sub.status,
          subscriptionId:      sub.id,
          subscriptionPriceId: priceId,
          trialEndsAt:         sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          currentPeriodEnd:    (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null,
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
        await updateUserSubscription(sub.customer as string, { subscriptionStatus: 'paused' });
        break;
      }
      case 'customer.subscription.resumed': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id ?? '';
        await updateUserSubscription(sub.customer as string, {
          subscriptionTier:   getTierFromPriceId(priceId),
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
        console.log(`Unhandled event: ${event.type}`);
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
