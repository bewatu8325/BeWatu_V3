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

import { init, ErrorBoundary, captureException } from '@sentry/react';

/**
 * An invitation link is a secret: whoever holds it can open the invitation. Error reports record page addresses and the requests the
 * page made, so the token is removed from every address before anything leaves the browser.
 */
export function scrubInviteToken(text: string): string {
  return text
    .replace(/(\/invite\/)[^/?#\s"']+/g, '$1[token]')
    .replace(/([?&](?:token|t)=)[^&#\s"']+/g, '$1[token]');
}
const scrubValue = (v: unknown) => (typeof v === 'string' ? scrubInviteToken(v) : v);
/** Applied to every event and breadcrumb. Exported so a test can prove no token survives. */
export function scrubEvent<T extends Record<string, any>>(event: T): T {
  const e: any = event;
  if (e.request?.url) e.request.url = scrubInviteToken(e.request.url);
  if (e.request?.headers?.Referer) e.request.headers.Referer = scrubInviteToken(e.request.headers.Referer);
  if (e.transaction) e.transaction = scrubInviteToken(e.transaction);
  if (e.message) e.message = scrubInviteToken(e.message);
  for (const b of e.breadcrumbs ?? []) { scrubBreadcrumb(b); }
  for (const ex of e.exception?.values ?? []) if (ex.value) ex.value = scrubInviteToken(ex.value);
  return event;
}
export function scrubBreadcrumb<T extends Record<string, any>>(crumb: T): T {
  const c: any = crumb;
  if (c.message) c.message = scrubInviteToken(c.message);
  if (c.data) for (const k of ['url', 'from', 'to']) if (c.data[k]) c.data[k] = scrubValue(c.data[k]);
  return crumb;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.info('[sentry] VITE_SENTRY_DSN not set — error tracking disabled.');
    return;
  }
  init({
    dsn,
    environment: import.meta.env.MODE,
    // Conservative default — this is a first pass at observability, not a
    // full performance-monitoring rollout. Raise once there's a real usage
    // pattern to size it against, not guessed up front.
    tracesSampleRate: 0.1,
    beforeSend: event => scrubEvent(event),
    beforeBreadcrumb: crumb => scrubBreadcrumb(crumb),
  });
}

export { ErrorBoundary, captureException };
