/**
 * lib/analytics/events.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical behavioral event record + Tier-1 event taxonomy.
 *
 * ONE schema covers every behavior. Build the pipe once; everything downstream
 * (recommendations, analytics, product insight) reads from this single shape.
 *
 * IMPORTANT — scope of what this captures:
 * This logs *product interactions* (what someone created, joined, completed) to
 * power relevance — "you engage with fintech challenges, here are more." It does
 * NOT capture protected attributes, and it is gated on the user's Analytics
 * consent (see eventLogger.ts). It is the substrate for transparent, opt-in
 * personalization — not covert profiling. See the note in eventLogger.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Surface =
  | 'pod'
  | 'arena'
  | 'feed'
  | 'profile'
  | 'messaging'
  | 'jobs'
  | 'companies'
  | 'discover';

export type EventType =
  // ── Tier 1: initiation vs participation (the agency signal) ──
  | 'pod_created'
  | 'pod_joined'
  | 'arena_challenge_initiated'
  | 'arena_challenge_joined'
  | 'thread_started'
  | 'thread_replied'
  // ── Tier 1: role-in-group ──
  | 'role_selected'
  // ── Tier 1: problem/topic selection ──
  | 'challenge_viewed'
  | 'challenge_attempted'
  | 'challenge_completed'
  | 'challenge_abandoned'
  | 'pod_topic_viewed'
  // ── Tier 1: follow-through (state transitions) ──
  | 'item_started'
  | 'item_completed'
  | 'item_abandoned'
  // ── Tier 2: solution style + directionality ──
  | 'submission_revised'
  | 'team_formed'
  | 'comment_made'
  | 'reaction_given'
  | 'wisdom_answer_given'
  // ── Tier 2: network ──
  | 'connection_made';

export type Role = 'builder' | 'strategist' | 'connector' | 'operator';
export type Outcome = 'completed' | 'abandoned' | 'pending' | 'started';

/**
 * The canonical event record. Every behavior is one row in this shape.
 * Keep it flat and stable — downstream consumers depend on these field names.
 */
export interface BehavioralEvent {
  /** Firebase UID of the actor. */
  userId: string;
  /** Event time (client-set; server also stamps on write). */
  timestamp: number;
  /** What happened. */
  eventType: EventType;
  /** Where it happened. */
  surface: Surface;
  /** The thing acted on (pod id, challenge id, post id, person id). */
  targetId?: string;
  /** What kind of thing the target is. */
  targetType?: 'pod' | 'challenge' | 'post' | 'comment' | 'person' | 'job' | 'company';
  /** Role taken, where a role is selectable. */
  role?: Role;
  /** Outcome / state transition. */
  outcome?: Outcome;
  /** A numeric magnitude where meaningful (revision count, difficulty tier). */
  magnitude?: number;
  /** Parent record id (e.g. the thread a reply belongs to). */
  parentId?: string;
  /** Free-form tags carried for content signal — industry, difficulty. */
  tags?: { industry?: string; difficultyTier?: string; [k: string]: string | undefined };
  /** Schema version for forward-compatibility. */
  v: 1;
}

/** Helper: build a well-formed event with sane defaults. */
export function makeEvent(
  userId: string,
  eventType: EventType,
  surface: Surface,
  fields: Partial<Omit<BehavioralEvent, 'userId' | 'eventType' | 'surface' | 'timestamp' | 'v'>> = {}
): BehavioralEvent {
  return {
    userId,
    eventType,
    surface,
    timestamp: Date.now(),
    v: 1,
    ...fields,
  };
}
