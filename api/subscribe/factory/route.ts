/**
 * app/api/subscribe/factory/route.ts  (bewatu.com)
 * Creates a Stripe Checkout session for the Factory ($49/mo) subscription.
 * On success, webhook fires and sets subscriptionTier: "factory" on the user.
 *
 * Also handles: /api/subscribe/investor for the $199/mo investor tier.
 * Use the same file for both by checking the URL path or a body param.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { uid, annual = false } = await req.json();
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2024-04-10",
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.bewatu.com";

    // Price IDs — create these in Stripe dashboard
    // Factory monthly: $49/mo  → STRIPE_FACTORY_PRICE_MONTHLY
    // Factory annual:  $490/yr → STRIPE_FACTORY_PRICE_ANNUAL
    const priceId = annual
      ? (process.env.STRIPE_FACTORY_PRICE_ANNUAL ?? "")
      : (process.env.STRIPE_FACTORY_PRICE_MONTHLY ?? "");

    const session = await stripe.checkout.sessions.create({
      mode:                 "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        bewatu_type: "factory_subscription",
        uid,
        tier:        "factory",
      },
      subscription_data: {
        trial_period_days: 14,
        metadata: { uid, tier: "factory" },
      },
      success_url: `${baseUrl}/factory-welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}?factory=cancelled`,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error("Factory subscription error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
