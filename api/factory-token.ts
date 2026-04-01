// api/factory-token.ts
// ─────────────────────────────────────────────────────────────────────────────
// Vercel serverless function — bewatu.com
// Generates a Firebase custom token for the authenticated user so they can
// sign into factory.bewatu.com without a separate login.
//
// Called by the "Go to Factory" button on bewatu.com.
// Returns: { token: string } or { error: string }
//
// Uses Firebase Admin SDK — requires FIREBASE_SERVICE_ACCOUNT env var.
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialise Firebase Admin once (Vercel reuses function instances)
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — only bewatu.com can call this
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://www.bewatu.com',
    'https://bewatu.com',
    'http://localhost:5173', // local dev
    'http://localhost:3000',
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get the Firebase ID token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token using Admin SDK
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Generate a custom token for the same UID
    // This token can be used on factory.bewatu.com to sign in as the same user
    const customToken = await adminAuth.createCustomToken(uid, {
      // Pass along useful claims
      fromBewatu: true,
    });

    return res.status(200).json({ token: customToken });

  } catch (err: any) {
    console.error('factory-token error:', err);

    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid ID token' });
    }

    return res.status(500).json({ error: 'Failed to generate token' });
  }
}
