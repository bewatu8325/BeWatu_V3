/**
 * lib/recommendation/profile.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a TRANSPARENT recommendation profile from a user's behavioral events.
 *
 * This is the honest cousin of the "genome": every field is human-readable and
 * inspectable by the user. It models CONTENT PREFERENCE ("you engage with
 * fintech, at high difficulty, and you finish what you start"), not personality.
 * It is never used to score the person or feed recruiter/hiring surfaces — it
 * only ranks content (pods, challenges) for the user themselves.
 *
 * Cold-start is honest: thin users get low confidence and the UI says so.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BehavioralEvent, Role } from '../analytics/events';

export interface RecommendationProfile {
  /** Recency-weighted engagement per industry/topic tag. Normalized to sum≈1. */
  industryAffinity: Record<string, number>;
  /** Average difficulty tier the user engages with (1–5), or null if unknown. */
  difficultyPreference: number | null;
  /** 0 = only joins others' things, 1 = always initiates. null if too few signals. */
  initiationTendency: number | null;
  /** completed / (completed + abandoned). null if no finished items yet. */
  followThroughRate: number | null;
  /** Recency-weighted role selection. */
  rolePreference: Partial<Record<Role, number>>;
  /** How much behavior we've actually seen — drives confidence + cold-start. */
  eventCount: number;
  /** Honest confidence label surfaced to the user. */
  confidence: 'early' | 'developing' | 'established';
  /** When this profile was computed. */
  computedAt: number;
}

const HALF_LIFE_DAYS = 30; // older events count less; ~1 month half-life
const MS_PER_DAY = 86_400_000;

/** Exponential recency weight: an event from `ageDays` ago is worth less. */
function recencyWeight(timestamp: number, now: number): number {
  const ageDays = Math.max(0, (now - timestamp) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function difficultyToNumber(tier?: string): number | null {
  if (!tier) return null;
  const map: Record<string, number> = {
    beginner: 1, easy: 1, '1': 1,
    intermediate: 2, '2': 2,
    advanced: 3, '3': 3,
    hard: 4, expert: 4, '4': 4,
    elite: 5, '5': 5,
  };
  return map[tier.toLowerCase()] ?? null;
}

const INITIATION_EVENTS = new Set(['pod_created', 'arena_challenge_initiated', 'thread_started']);
const PARTICIPATION_EVENTS = new Set(['pod_joined', 'arena_challenge_joined', 'thread_replied']);

/**
 * Pure function: events in → transparent profile out. Easy to unit-test.
 */
export function buildProfile(events: BehavioralEvent[], now = Date.now()): RecommendationProfile {
  const industryAffinity: Record<string, number> = {};
  const rolePreference: Partial<Record<Role, number>> = {};

  let difficultySum = 0, difficultyWeight = 0;
  let initiationCount = 0, participationCount = 0;
  let completed = 0, abandoned = 0;

  for (const ev of events) {
    const w = recencyWeight(ev.timestamp, now);

    // Industry / topic affinity
    const industry = ev.tags?.industry;
    if (industry) industryAffinity[industry] = (industryAffinity[industry] ?? 0) + w;

    // Difficulty preference (weighted average)
    const d = difficultyToNumber(ev.tags?.difficultyTier);
    if (d !== null) { difficultySum += d * w; difficultyWeight += w; }

    // Initiation vs participation
    if (INITIATION_EVENTS.has(ev.eventType)) initiationCount += w;
    else if (PARTICIPATION_EVENTS.has(ev.eventType)) participationCount += w;

    // Follow-through
    if (ev.outcome === 'completed' || ev.eventType === 'item_completed' || ev.eventType === 'challenge_completed') completed += w;
    if (ev.outcome === 'abandoned' || ev.eventType === 'item_abandoned' || ev.eventType === 'challenge_abandoned') abandoned += w;

    // Role preference
    if (ev.role) rolePreference[ev.role] = (rolePreference[ev.role] ?? 0) + w;
  }

  // Normalize industry affinity to sum≈1 so it reads as a share of attention
  const industryTotal = Object.values(industryAffinity).reduce((a, b) => a + b, 0);
  if (industryTotal > 0) {
    for (const k of Object.keys(industryAffinity)) industryAffinity[k] = industryAffinity[k] / industryTotal;
  }
  // Normalize role preference likewise
  const roleTotal = Object.values(rolePreference).reduce((a, b) => a + (b ?? 0), 0);
  if (roleTotal > 0) {
    for (const k of Object.keys(rolePreference) as Role[]) rolePreference[k] = (rolePreference[k] ?? 0) / roleTotal;
  }

  const initParticipationTotal = initiationCount + participationCount;
  const finishedTotal = completed + abandoned;

  const eventCount = events.length;
  const confidence: RecommendationProfile['confidence'] =
    eventCount >= 40 ? 'established' : eventCount >= 12 ? 'developing' : 'early';

  return {
    industryAffinity,
    difficultyPreference: difficultyWeight > 0 ? difficultySum / difficultyWeight : null,
    initiationTendency: initParticipationTotal > 0 ? initiationCount / initParticipationTotal : null,
    followThroughRate: finishedTotal > 0 ? completed / finishedTotal : null,
    rolePreference,
    eventCount,
    confidence,
    computedAt: now,
  };
}

// ── Persistence: compute from a bounded event window, cache on a profile doc ──

/**
 * Read the user's recent events (bounded — cost-safe), build the profile, and
 * cache it. Call this nightly in batch or lazily on demand, NOT on every page
 * load. Returns the profile so callers can use it immediately.
 */
export async function computeAndStoreProfile(uid: string): Promise<RecommendationProfile | null> {
  try {
    const { getDocs, query, collection, orderBy, limit, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('../firebase');

    // Bounded read — most recent 300 events is plenty for a recency-weighted profile
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'events'),
      orderBy('timestamp', 'desc'),
      limit(300)
    ));
    const events = snap.docs.map(d => d.data() as BehavioralEvent);
    const profile = buildProfile(events);

    // Cache on a single doc so recommendations don't re-read the event stream
    await setDoc(doc(db, 'users', uid, 'recommendation', 'profile'), {
      ...profile,
      updatedAt: serverTimestamp(),
    });
    return profile;
  } catch (err) {
    console.warn('computeAndStoreProfile failed:', err);
    return null;
  }
}

/** Load the cached profile (single doc read). Null if not computed yet. */
export async function loadProfile(uid: string): Promise<RecommendationProfile | null> {
  try {
    const { getDoc, doc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    const snap = await getDoc(doc(db, 'users', uid, 'recommendation', 'profile'));
    return snap.exists() ? (snap.data() as RecommendationProfile) : null;
  } catch {
    return null;
  }
}
