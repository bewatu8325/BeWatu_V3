// Vercel Serverless Function: /api/create-subscription.ts
// NOTE: This function requires the 'stripe' npm package to be installed in the environment.
// As I cannot add dependencies, this code is provided assuming 'stripe' is available.
import Stripe from 'stripe';

export default async function handler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { name, email, paymentMethodId } = await req.json();
        
        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        if (!STRIPE_SECRET_KEY) {
            console.error("STRIPE_SECRET_KEY environment variable not set.");
            throw new Error("Server configuration error.");
        }
        
        // This is a placeholder Price ID. In a real application, you would create a product
        // and price in your Stripe dashboard and use the Price ID here.
        // e.g., A "$20/month Recruiter Pro" plan.
        const RECRUITER_PRO_PRICE_ID = 'price_1PVI1cRxK61qs0K2qK8tE1rB'; // Replace with your actual Price ID

        if (!name || !email || !paymentMethodId) {
            return new Response(JSON.stringify({ error: 'Missing required fields.' }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Initialize Stripe with the secret key
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
            apiVersion: '2024-06-20',
            typescript: true,
        });

        // 1. Create a new customer in Stripe
        const customer = await stripe.customers.create({
            email,
            name,
            payment_method: paymentMethodId,
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });
        
        // 2. Create a subscription for the customer with a 30-day trial
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: RECRUITER_PRO_PRICE_ID }],
            trial_period_days: 30,
            expand: ['latest_invoice.payment_intent'],
        });
        
        return new Response(JSON.stringify({
            customerId: customer.id,
            subscriptionId: subscription.id,
            status: subscription.status,
        }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Stripe API Error:', error);
        return new Response(JSON.stringify({ error: error.message || 'An internal server error occurred.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}

export const config = {
    runtime: 'edge',
};