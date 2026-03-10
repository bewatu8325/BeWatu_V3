/**
 * lib/handoff.ts  (goes in bewatu.com)
 * ─────────────────────────────────────────────────────────────────────────────
 * Call redirectToFactory() from any button/link on bewatu.com.
 * It fetches a custom token from the Cloud Function and redirects the user
 * to factory.bewatu.com/auth/handoff?token=xxx
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

const FACTORY_URL = "https://factory.bewatu.com";

export async function redirectToFactory(returnPath = "/"): Promise<void> {
  console.log("1. redirectToFactory called");

  const functions = getFunctions(getApp());
  console.log("2. got functions instance");

  const mint = httpsCallable<void, { token: string }>(functions, "mintHandoffToken");
  console.log("3. calling mintHandoffToken...");

  const result = await mint();
  console.log("4. got token, redirecting...");

  const { token } = result.data;

  const url = new URL("/auth/handoff", FACTORY_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("next", returnPath);

  window.location.href = url.toString();
}

