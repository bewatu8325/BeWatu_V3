/**
 * components/GoToFactoryButton.tsx  (goes in bewatu.com)
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this button anywhere in the bewatu.com UI.
 * Shows only when the user is signed in; hides for investors.
 * ─────────────────────────────────────────────────────────────────────────────
 */
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/firebase/auth-context"; // bewatu.com's own auth context
import { redirectToFactory } from "@/lib/handoff";
import { Factory, Loader2 } from "lucide-react";

interface GoToFactoryButtonProps {
  /** Where inside Factory to land after handoff. Defaults to "/" */
  returnPath?: string;
  className?: string;
}

export function GoToFactoryButton({
  returnPath = "/",
  className = "",
}: GoToFactoryButtonProps) {
  const { firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  // Don't render for investors or logged-out users
  if (!firebaseUser) return null;

  // If you store role in the Firestore profile, pass it here and check:
  // if (userProfile?.role === "investor") return null;

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      await redirectToFactory(returnPath);
      // redirectToFactory navigates away, so we won't reach here on success
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors ${className}`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Factory className="h-4 w-4" />
        )}
        {loading ? "Launching…" : "Go to Factory →"}
      </button>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
