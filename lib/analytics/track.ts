/**
 * lib/analytics/track.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin, named instrumentation helpers for the Tier-1 events.
 *
 * Call these from your existing handlers — they're one-liners that build a
 * well-formed event and queue it. Wiring examples at the bottom.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { makeEvent } from './events';
import { logEvent } from './eventLogger';
import type { Role, Surface } from './events';

// ── Initiation vs participation (the agency signal) ───────────────────────────

export const trackPodCreated = (uid: string, podId: string, industry?: string) =>
  logEvent(makeEvent(uid, 'pod_created', 'pod', { targetId: podId, targetType: 'pod', outcome: 'started', tags: { industry } }));

export const trackPodJoined = (uid: string, podId: string, industry?: string) =>
  logEvent(makeEvent(uid, 'pod_joined', 'pod', { targetId: podId, targetType: 'pod', tags: { industry } }));

export const trackChallengeInitiated = (uid: string, challengeId: string, industry?: string, difficultyTier?: string) =>
  logEvent(makeEvent(uid, 'arena_challenge_initiated', 'arena', { targetId: challengeId, targetType: 'challenge', outcome: 'started', tags: { industry, difficultyTier } }));

export const trackChallengeJoined = (uid: string, challengeId: string, industry?: string, difficultyTier?: string) =>
  logEvent(makeEvent(uid, 'arena_challenge_joined', 'arena', { targetId: challengeId, targetType: 'challenge', tags: { industry, difficultyTier } }));

export const trackThreadStarted = (uid: string, surface: Surface, threadId: string) =>
  logEvent(makeEvent(uid, 'thread_started', surface, { targetId: threadId, targetType: 'post', outcome: 'started' }));

export const trackThreadReplied = (uid: string, surface: Surface, threadId: string, parentId?: string) =>
  logEvent(makeEvent(uid, 'thread_replied', surface, { targetId: threadId, targetType: 'post', parentId }));

// ── Role-in-group ─────────────────────────────────────────────────────────────

export const trackRoleSelected = (uid: string, surface: Surface, targetId: string, role: Role) =>
  logEvent(makeEvent(uid, 'role_selected', surface, { targetId, role }));

// ── Problem/topic selection ───────────────────────────────────────────────────

export const trackChallengeViewed = (uid: string, challengeId: string, industry?: string, difficultyTier?: string) =>
  logEvent(makeEvent(uid, 'challenge_viewed', 'arena', { targetId: challengeId, targetType: 'challenge', tags: { industry, difficultyTier } }));

export const trackChallengeCompleted = (uid: string, challengeId: string, industry?: string, difficultyTier?: string) =>
  logEvent(makeEvent(uid, 'challenge_completed', 'arena', { targetId: challengeId, targetType: 'challenge', outcome: 'completed', tags: { industry, difficultyTier } }));

export const trackChallengeAbandoned = (uid: string, challengeId: string, industry?: string, difficultyTier?: string) =>
  logEvent(makeEvent(uid, 'challenge_abandoned', 'arena', { targetId: challengeId, targetType: 'challenge', outcome: 'abandoned', tags: { industry, difficultyTier } }));

// ── Follow-through (generic start/finish on any item) ─────────────────────────

export const trackItemStarted = (uid: string, surface: Surface, targetId: string) =>
  logEvent(makeEvent(uid, 'item_started', surface, { targetId, outcome: 'started' }));

export const trackItemCompleted = (uid: string, surface: Surface, targetId: string) =>
  logEvent(makeEvent(uid, 'item_completed', surface, { targetId, outcome: 'completed' }));

export const trackItemAbandoned = (uid: string, surface: Surface, targetId: string) =>
  logEvent(makeEvent(uid, 'item_abandoned', surface, { targetId, outcome: 'abandoned' }));

// ── Tier-2: directionality + style ────────────────────────────────────────────

export const trackCommentMade = (uid: string, surface: Surface, targetId: string, parentId?: string) =>
  logEvent(makeEvent(uid, 'comment_made', surface, { targetId, targetType: 'comment', parentId }));

export const trackReactionGiven = (uid: string, surface: Surface, targetId: string) =>
  logEvent(makeEvent(uid, 'reaction_given', surface, { targetId, targetType: 'post' }));

export const trackConnectionMade = (uid: string, targetPersonId: string) =>
  logEvent(makeEvent(uid, 'connection_made', 'profile', { targetId: targetPersonId, targetType: 'person' }));

/* ─────────────────────────────────────────────────────────────────────────────
 * WIRING EXAMPLES — drop these calls into your existing handlers in App.tsx
 *
 *   // handleApplyToCircle / createCircle success:
 *   trackPodCreated(fbUser.uid, circle._firestoreId, circle.industry);
 *
 *   // requestToJoinCircle success:
 *   trackPodJoined(fbUser.uid, circle._firestoreId, circle.industry);
 *
 *   // addComment success in PodPostCard:
 *   trackCommentMade(fbUser.uid, 'pod', postFirestoreId);
 *
 *   // appreciatePost success:
 *   trackReactionGiven(fbUser.uid, 'pod', postFirestoreId);
 *
 *   // handleConnectionRequest('accepted'):
 *   trackConnectionMade(fbUser.uid, String(otherUserId));
 *
 *   // ArenaChallengeDetail open / submit:
 *   trackChallengeViewed(fbUser.uid, challengeId, industry, tier);
 *   trackChallengeCompleted(fbUser.uid, challengeId, industry, tier);
 *
 * Each call is a no-op unless the user granted Analytics consent.
 * ───────────────────────────────────────────────────────────────────────────── */
