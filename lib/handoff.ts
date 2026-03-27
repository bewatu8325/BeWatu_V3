// lib/handoff.ts
// Simple redirect — Firebase auth is shared across domains
// via the same Firebase project and authorised domains config

export async function redirectToFactory(returnPath = "/"): Promise<void> {
  window.location.href = `https://factory.bewatu.com${returnPath}`;
}
