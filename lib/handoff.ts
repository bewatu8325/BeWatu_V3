import { getAuth } from "firebase/auth";

const FACTORY_URL     = "https://factory.bewatu.com";
const HANDOFF_API_URL = `${FACTORY_URL}/api/auth/handoff`;
const HANDOFF_SECRET  = process.env.NEXT_PUBLIC_HANDOFF_SECRET ?? "";

export async function redirectToFactory(returnPath = "/"): Promise<void> {
  console.log("1. redirectToFactory called");

  const auth = getAuth();
  const user = auth.currentUser;
  console.log("2. current user:", user?.email ?? "none");

  if (!user) throw new Error("User is not signed in");

  const idToken = await user.getIdToken(true);
  console.log("3. got ID token, calling handoff API...");

  const response = await fetch(HANDOFF_API_URL, {
    method: "POST",
    headers: {
      "Authorization":    `Bearer ${idToken}`,
      "X-Handoff-Secret": HANDOFF_SECRET,
      "Content-Type":     "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Handoff API failed: ${response.status}`);
  }

  const { token } = await response.json();
  console.log("4. got custom token, redirecting...");

  const url = new URL("/auth/handoff", FACTORY_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("next", returnPath);

  window.location.href = url.toString();
}
