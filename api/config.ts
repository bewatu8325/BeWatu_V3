export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!stripePublishableKey) {
    return new Response(JSON.stringify({ error: 'Server configuration incomplete.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ stripePublishableKey }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

export const config = { runtime: 'edge' };
