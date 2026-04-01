// src/utils/factoryHandoff.ts
// ─────────────────────────────────────────────────────────────────────────────
// Call this when the user clicks "Go to Factory" anywhere on bewatu.com.
// Generates a custom token via our serverless function and redirects the
// user to factory.bewatu.com/auth/handoff?token=XXX
//
// Usage:
//   import { goToFactory } from '../utils/factoryHandoff';
//   <button onClick={() => goToFactory(firebaseUser)}>Go to Factory</button>
// ─────────────────────────────────────────────────────────────────────────────

import { User as FirebaseUser } from 'firebase/auth';

const FACTORY_URL = 'https://factory.bewatu.com';
const TOKEN_ENDPOINT = '/api/factory-token';

interface HandoffOptions {
  /** Where to land in Factory after sign-in. Defaults to '/' */
  next?: string;
}

/**
 * Navigates the user from bewatu.com to factory.bewatu.com,
 * carrying their auth session via a custom token handoff.
 */
export async function goToFactory(
  firebaseUser: FirebaseUser | null,
  options: HandoffOptions = {}
): Promise<void> {
  const { next = '/' } = options;

  if (!firebaseUser) {
    // Not logged in — just open Factory and let it redirect to bewatu.com
    window.location.href = FACTORY_URL;
    return;
  }

  try {
    // Get the current user's ID token
    const idToken = await firebaseUser.getIdToken();

    // Exchange it for a custom token via our serverless function
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Token endpoint returned ${res.status}`);
    }

    const { token } = await res.json();

    if (!token) {
      throw new Error('No token returned');
    }

    // Redirect to Factory's handoff page with the custom token
    const handoffUrl = new URL('/auth/handoff', FACTORY_URL);
    handoffUrl.searchParams.set('token', token);
    handoffUrl.searchParams.set('next', next);

    window.location.href = handoffUrl.toString();

  } catch (err) {
    console.error('Factory handoff failed:', err);
    // Fallback — open Factory normally and let the user see what happens
    window.location.href = FACTORY_URL;
  }
}
