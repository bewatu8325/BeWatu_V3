// Vercel Serverless Function: /api/check-breached-password.ts

// In a real application, you would use a service like Have I Been Pwned's Pwned Passwords API.
// For this simulation, we'll use a hardcoded list of common weak passwords.
const breachedPasswords = new Set([
  '123456', 'password', '123456789', '12345678', '12345', '111111', '123123', 'qwerty', 'iloveyou'
]);

export default async function handler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { password } = await req.json();
        if (typeof password !== 'string' || !password) {
            return new Response(JSON.stringify({ error: 'Password is required.' }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const isBreached = breachedPasswords.has(password);

        return new Response(JSON.stringify({ isBreached }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error in breached password check handler:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}

export const config = {
    runtime: 'edge',
};