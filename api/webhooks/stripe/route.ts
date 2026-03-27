/**
 * app/api/webhooks/stripe/route.ts  (bewatu.com)
 * Handles all Stripe webhook events for subscriptions.
 *
 * Events handled:
 *   checkout.session.completed     → activate subscription
 *   customer.subscription.deleted  → deactivate subscription
 *   customer.subscription.updated  → handle tier changes
 *
 * Register in Stripe dashboard:
 *   Endpoint: https://www.bewatu.com/api/webhooks/stripe
 *   Events: checkout.session.completed, customer.subscription.deleted, customer.subscription.updated
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: any;
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2024-04-10" });
    const body   = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  if (!getApps().length) initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  const db = getFirestore();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { uid, tier, bewatu_type } = session.metadata ?? {};

    if (!uid || !["factory_subscription", "investor_subscription"].includes(bewatu_type)) {
      return NextResponse.json({ received: true });
    }

    // Activate subscription on user doc
    await db.collection("users").doc(uid).update({
      subscriptionTier:          tier,
      factoryUnlocked:           true,
      subscriptionActivatedAt:   new Date().toISOString(),
      stripeCustomerId:          session.customer,
      stripeSubscriptionId:      session.subscription,
      updatedAt:                 FieldValue.serverTimestamp(),
    });

    // Mirror to factory_users
    await db.collection("factory_users").doc(uid).set({
      uid,
      subscriptionTier: tier,
      factoryUnlocked:  true,
      joinedAt:         FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    }, { merge: true });

    // Send welcome notification
    await db.collection("factory_notifications").add({
      uid,
      type:      "factory_subscription_activated",
      tier,
      message:   tier === "factory"
        ? "Welcome to BeWatu Factory! Your workspace is ready."
        : "Welcome to the Investor Console! Your deal flow is ready.",
      read:      false,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Subscription activated: ${uid} → ${tier}`);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const uid = sub.metadata?.uid;
    if (!uid) return NextResponse.json({ received: true });

    // Deactivate — revert to free or pro
    await db.collection("users").doc(uid).update({
      subscriptionTier:        "free",
      factoryUnlocked:         false,
      subscriptionCancelledAt: new Date().toISOString(),
      updatedAt:               FieldValue.serverTimestamp(),
    });

    await db.collection("factory_users").doc(uid).update({
      subscriptionTier: "free",
      factoryUnlocked:  false,
      updatedAt:        FieldValue.serverTimestamp(),
    });

    console.log(`⚠️ Subscription cancelled: ${uid}`);
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const uid = sub.metadata?.uid;
    if (!uid) return NextResponse.json({ received: true });

    const isActive = sub.status === "active" || sub.status === "trialing";
    if (!isActive) {
      await db.collection("users").doc(uid).update({
        subscriptionTier: "free",
        factoryUnlocked:  false,
        updatedAt:        FieldValue.serverTimestamp(),
      });
    }
  }

  return NextResponse.json({ received: true });
}
