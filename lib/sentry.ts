/**
 * lib/sentry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side error tracking (launch-readiness review — "no observability at
 * all" was a real, standing P2 gap: no error tracking, no uptime monitoring,
 * no alerting anywhere in this codebase). Before this, an uncaught render
 * error just white-screened the user with zero visibility for anyone —
 * there was no React error boundary anywhere either, so this file also
 * exports one (see ErrorBoundary below), not just crash reporting.
 *
 * Required env var (Vercel → Settings → Environment Variables):
 *   VITE_SENTRY_DSN — from a free Sentry project. Same convention as every
 *   other client-exposed key in this app (VITE_FIREBASE_*, etc., see
 *   lib/firebase.ts) — a DSN is meant to be public; it only lets Sentry
 *   accept events tagged with it, it can't read anything back.
 *
 * Silently disabled (not an error) when the DSN isn't set, so local dev
 * without it still works exactly as before.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.info('[sentry] VITE_SENTRY_DSN not set — error tracking disabled.');
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Conservative default — this is a first pass at observability, not a
    // full performance-monitoring rollout. Raise once there's a real usage
    // pattern to size it against, not guessed up front.
    tracesSampleRate: 0.1,
  });
}

export const ErrorBoundary = Sentry.ErrorBoundary;
export const captureException = Sentry.captureException;
