/**
 * lib/analytics/eventLogger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Consent-aware, batched behavioral event logger.
 *
 * TWO design constraints baked in:
 *
 * 1. CONSENT. Behavioral events are personalization data. They are only logged
 *    when the user has granted Analytics consent (the tier you already built in
 *    CookieBanner). No consent → events are silently dropped. This keeps the
 *    pipeline lawful-by-default and honours the choice the user already made.
 *
 * 2. COST. Writing one Firestore document per behavioral event is the exact
 *    write-amplification pattern that blows up the bill (a single active user
 *    can generate dozens of events per session). So events are BUFFERED in
 *    memory and FLUSHED in batches via a single writeBatch. At real scale the
 *    correct sink is a logging endpoint that forwards to BigQuery, not Firestore
 *    at all — see SCALE NOTE below. The interface here stays the same either way.
 *
 * Usage:
 *   import { logEvent } from './lib/analytics/eventLogger';
 *   logEvent(makeEvent(uid, 'pod_created', 'pod', { targetId, tags: { industry } }));
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BehavioralEvent } from './events';
import { hasAnalyticsConsent } from '../../components/CookieBanner';

const FLUSH_SIZE     = 20;     // flush once this many events are buffered
const FLUSH_INTERVAL = 15_000; // …or every 15s, whichever comes first
const MAX_BUFFER     = 200;    // hard cap so a consent-less tab can't grow unbounded

let buffer: BehavioralEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Queue a behavioral event. No-op (dropped) without Analytics consent.
 * Never throws — telemetry must never break a user flow.
 */
export function logEvent(event: BehavioralEvent): void {
  try {
    if (!hasAnalyticsConsent()) return;            // consent gate
    buffer.push(event);
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
    if (buffer.length >= FLUSH_SIZE) {
      void flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL);
    }
  } catch { /* telemetry is best-effort */ }
}

/** Flush the buffer to the sink in a single batched write. */
export async function flush(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (buffer.length === 0) return;
  const batchEvents = buffer;
  buffer = [];
  try {
    const { writeBatch, doc, collection, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    const batch = writeBatch(db);
    for (const ev of batchEvents) {
      // Events live under the user's own doc so Firestore rules can scope
      // read access to the user + platform only. One batched write, not N.
      const ref = doc(collection(db, 'users', ev.userId, 'events'));
      batch.set(ref, { ...ev, serverTime: serverTimestamp() });
    }
    await batch.commit();
  } catch (err) {
    // On failure, re-queue (bounded) so a transient error doesn't lose data
    buffer = [...batchEvents.slice(-MAX_BUFFER), ...buffer].slice(-MAX_BUFFER);
    console.warn('eventLogger flush failed, will retry:', err);
  }
}

/**
 * Flush on page hide / unload so we don't lose the tail of a session.
 * Uses visibilitychange (more reliable than beforeunload on mobile).
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SCALE NOTE — when you outgrow Firestore as the event sink
 *
 * Per-user `events` subcollections in Firestore are fine for getting the pipe
 * running and for low volume. But behavioral telemetry is append-only, write-
 * heavy, and read in bulk for training — the opposite of Firestore's strengths.
 * When event volume climbs, swap the body of flush() to POST the batch to a
 * lightweight endpoint (/api/events) that streams into BigQuery. The logEvent /
 * flush interface above does not change, so nothing upstream is affected. This
 * also keeps your training data out of your operational database entirely.
 * ───────────────────────────────────────────────────────────────────────────── */
