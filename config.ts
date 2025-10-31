// Vercel Serverless Function: /api/config.ts
// This endpoint provides public configuration variables to the frontend.

export default async function handler(req: Request): Promise<Response> {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', 'Allow': 'GET' },
        });
    }

    try {
        const publishableConfig = {
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        };

        if (!publishableConfig.stripePublishableKey) {
            console.error("STRIPE_PUBLISHABLE_KEY environment variable is not set.");
            // In a real app, you might throw an error or handle this more gracefully.
            // For this context, we return an empty object to avoid breaking the client,
            // though Stripe will fail to initialize.
            return new Response(JSON.stringify({ error: 'Server configuration incomplete.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify(publishableConfig), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in config handler:', error);
        return new Response(JSON.stringify({ error: 'Failed to retrieve configuration' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

export const config = {
    runtime: 'edge',
};