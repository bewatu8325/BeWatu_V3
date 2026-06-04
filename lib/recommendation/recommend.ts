/**
 * lib/recommendation/recommend.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scores CONTENT candidates (pods, challenges) against a transparent profile
 * and returns a ranked list WITH plain-English reasons.
 *
 * Hard guarantees by construction:
 *   • Candidates are content items, never people. The type makes it impossible
 *     to pass a user in as something to be ranked.
 *   • Every recommendation carries its reasons — no opaque scores reach the UI.
 *   • Cold start is honest: thin profiles fall back to recency/popularity and
 *     the caller is told confidence is low.
 *   • Nothing here is exported to recruiter or hiring surfaces.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RecommendationProfile } from './profile';

/** A content item that can be recommended. Deliberately NOT a person. */
export interface Candidate {
  id: string;
  kind: 'pod' | 'challenge';
  title: string;
  industry?: string;
  difficultyTier?: string;
  /** Recency / popularity priors for cold-start and tie-breaking. */
  createdAt?: number;
  memberCount?: number;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  /** Human-readable reasons, shown to the user as "why you're seeing this". */
  reasons: string[];
}

function difficultyToNumber(tier?: string): number | null {
  if (!tier) return null;
  const map: Record<string, number> = {
    beginner: 1, easy: 1, '1': 1, intermediate: 2, '2': 2,
    advanced: 3, '3': 3, hard: 4, expert: 4, '4': 4, elite: 5, '5': 5,
  };
  return map[tier.toLowerCase()] ?? null;
}

/**
 * Score one candidate against the profile. Returns score + reasons.
 * Score is a weighted sum of interpretable components, each of which also
 * produces a reason string when it contributes meaningfully.
 */
export function scoreCandidate(c: Candidate, profile: RecommendationProfile | null): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  // No profile yet → pure cold-start (recency + popularity)
  if (!profile || profile.confidence === 'early') {
    const recency = c.createdAt ? Math.max(0, 1 - (Date.now() - c.createdAt) / (60 * 86_400_000)) : 0; // 60-day decay
    const popularity = c.memberCount ? Math.min(1, c.memberCount / 100) : 0;
    score = recency * 0.5 + popularity * 0.5;
    if (popularity > 0.3) reasons.push('Popular on BeWatu right now');
    if (recency > 0.5) reasons.push('Recently created');
    if (reasons.length === 0) reasons.push('Suggested to help you get started');
    return { ...c, score, reasons };
  }

  // 1. Industry affinity — the strongest content signal
  if (c.industry && profile.industryAffinity[c.industry]) {
    const affinity = profile.industryAffinity[c.industry]; // 0..1 share of attention
    score += affinity * 3.0;
    if (affinity >= 0.15) {
      const pct = Math.round(affinity * 100);
      reasons.push(`You spend about ${pct}% of your activity on ${c.industry}`);
    }
  }

  // 2. Difficulty fit — prefer items near the user's engaged difficulty
  const cd = difficultyToNumber(c.difficultyTier);
  if (cd !== null && profile.difficultyPreference !== null) {
    const gap = Math.abs(cd - profile.difficultyPreference);
    const fit = Math.max(0, 1 - gap / 4); // 0 gap → 1.0, 4 gap → 0
    score += fit * 1.0;
    if (fit >= 0.75) reasons.push('Matches the difficulty level you usually take on');
  }

  // 3. Initiation tendency — initiators get a nudge toward create-friendly pods
  if (c.kind === 'pod' && profile.initiationTendency !== null && profile.initiationTendency >= 0.6) {
    score += 0.5;
    reasons.push('You tend to start things — this is a space to lead');
  }

  // Tie-breakers: gentle recency + popularity so good-but-new items surface
  const recency = c.createdAt ? Math.max(0, 1 - (Date.now() - c.createdAt) / (60 * 86_400_000)) : 0;
  score += recency * 0.2;
  const popularity = c.memberCount ? Math.min(1, c.memberCount / 100) : 0;
  score += popularity * 0.2;

  if (reasons.length === 0) reasons.push('Related to your recent activity');

  return { ...c, score, reasons };
}

/**
 * Rank a set of candidates. Returns them sorted best-first, each with reasons.
 * `limit` caps how many you surface.
 */
export function rankCandidates(
  candidates: Candidate[],
  profile: RecommendationProfile | null,
  limit = 10
): ScoredCandidate[] {
  return candidates
    .map(c => scoreCandidate(c, profile))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * A short, honest banner string for the UI describing how confident the
 * recommendations are — matches the spec's "predictions sharpen as you do more".
 */
export function confidenceBanner(profile: RecommendationProfile | null): string {
  if (!profile || profile.confidence === 'early')
    return 'These are general suggestions — they’ll get more personal as you use BeWatu.';
  if (profile.confidence === 'developing')
    return 'Recommendations are starting to reflect your interests and will keep sharpening.';
  return 'Recommendations are tuned to your activity. You can see and adjust what we’ve learned anytime.';
}
