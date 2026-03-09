/**
 * lib/handoff.ts  (goes in bewatu.com)
 * ─────────────────────────────────────────────────────────────────────────────
 * Call redirectToFactory() from any button/link on bewatu.com.
 * It fetches a custom token from the Cloud Function and redirects the user
 * to factory.bewatu.com/auth/handoff?token=xxx
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getAuth } from "firebase/auth";

const MINT_URL =
  process.env.NEXT_PUBLIC_MINT_HANDOFF_URL ??
  "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/mintHandoffToken";

const FACTORY_URL =
  process.env.NEXT_PUBLIC_FACTORY_URL ?? "https://factory.bewatu.com";

/**
 * Redirects the currently signed-in user to factory.bewatu.com with a
 * short-lived custom token so they don't have to log in again.
 *
 * Throws if the user is not signed in or the function call fails.
 */
export async function redirectToFactory(returnPath = "/"): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error("User is not signed in");
  }

  // Get a fresh ID token to send to the Cloud Function
  const idToken = await user.getIdToken(/* forceRefresh */ true);

  // Ask the Cloud Function to mint a custom token for this UID
  const response = await fetch(MINT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Mint failed: ${response.status}`);
  }

  const { token } = await response.json();

  // Redirect to the Factory handoff page with the token + intended destination
  const url = new URL("/auth/handoff", FACTORY_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("next", returnPath);

  window.location.href = url.toString();
}
