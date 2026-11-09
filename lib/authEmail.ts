/**
 * lib/authEmail.ts
 * The browser's way to ask for the two account emails (verify your address, reset your password). BeWatu sends them itself, from
 * its own address and in its own layout (api/auth-email.ts); the browser no longer asks Firebase to send anything.
 *
 * Errors carry a Firebase-style `code` where one already means the same thing, so the pages that map codes to wording keep working.
 */
import { auth } from './firebase';

async function call(body: Record<string, unknown>, token?: string): Promise<{ ok: true; alreadyVerified?: boolean }> {
  let res: Response;
  try {
    res = await fetch('/api/auth-email', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('Could not reach BeWatu. Check your connection and try again.'), { code: 'auth/network-request-failed' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? 'We could not send the email. Try again in a few minutes.'), { status: res.status, code: res.status === 429 ? 'auth/too-many-requests' : undefined });
  return data;
}

/** Sends the signed-in member a link to confirm their email address. Resolves quietly if it is already confirmed. */
export async function requestVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await call({ kind: 'verify' }, await user.getIdToken());
}

/** Emails a password-reset link. Resolves the same way whether or not the address belongs to a member. */
export async function requestPasswordReset(email: string): Promise<void> {
  await call({ kind: 'reset', email });
}
