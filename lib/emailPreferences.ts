/**
 * lib/emailPreferences.ts
 * Browser side of api/email-preferences.ts: read and change whether this member gets "product updates" email.
 */
import { auth } from './firebase';

async function call(body: Record<string, unknown>): Promise<{ productUpdates: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/email-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Could not reach BeWatu. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.');
  return data;
}

export const getProductUpdates = async (): Promise<boolean> => (await call({ action: 'get' })).productUpdates;
export const setProductUpdates = async (on: boolean): Promise<boolean> => (await call({ action: 'set', productUpdates: on })).productUpdates;
