/**
 * lib/graduation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * BeWatu → Factory graduation system.
 *
 * Two-step gate:
 *   Step 1 — Earn access (composite score ≥ 60)
 *   Step 2 — Activate with $49/month Factory subscription
 *
 * Score signals (each 0–100, weighted):
 *   ideaTractionScore      30% — upvotes, forks, comments on ideas
 *   collaborationScore     25% — team joins, pod contributions, connections
 *   teamFormationScore     25% — teams created/joined, projects started
 *   arenaPerformanceScore  20% — solutions submitted, shortlisted, won
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIGNAL_WEIGHTS = {
  ideaTractionScore:     0.30,
  collaborationScore:    0.25,
  teamFormationScore:    0.25,
  arenaPerformanceScore: 0.20,
} as const;

export const GRADUATION_THRESHOLD  = 60;
export const FACTORY_PRICE_MONTHLY = 49;
export const INVESTOR_PRICE_MONTHLY = 199;

export type SubscriptionTier = 'free' | 'pro' | 'factory' | 'investor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraduationStatus {
  compositeScore:        number;
  hasEarnedAccess:       boolean;
  hasActiveSubscription: boolean;
  hasFactoryAccess:      boolean;
  tier:                  SubscriptionTier;
  signals: {
    ideaTractionScore:     number;
    collaborationScore:    number;
    teamFormationScore:    number;
    arenaPerformanceScore: number;
  };
  pointsToGo:    number;
  weakestSignal: keyof typeof SIGNAL_WEIGHTS;
  nextActions:   string[];
}

// GraduationProgress is the shape FactoryUnlockBanner uses
export interface GraduationProgress {
  percentage: number;
  signals: { label: string; score: number }[];
  hasEarnedAccess: boolean;
}

// Raw signals shape returned by getGraduationSignals
export interface RawSignals {
  ideaTractionScore:     number;
  collaborationScore:    number;
  teamFormationScore:    number;
  arenaPerformanceScore: number;
  factoryUnlocked?:      boolean;
  subscriptionTier?:     string;
}

// ─── Core computation ─────────────────────────────────────────────────────────

export function computeGraduationStatus(user: {
  ideaTractionScore?:     number;
  collaborationScore?:    number;
  teamFormationScore?:    number;
  arenaPerformanceScore?: number;
  factoryUnlocked?:       boolean;
  subscriptionTier?:      string;
}): GraduationStatus {
  const signals = {
    ideaTractionScore:     user.ideaTractionScore     ?? 0,
    collaborationScore:    user.collaborationScore     ?? 0,
    teamFormationScore:    user.teamFormationScore     ?? 0,
    arenaPerformanceScore: user.arenaPerformanceScore  ?? 0,
  };

  const compositeScore = Math.round(
    signals.ideaTractionScore     * SIGNAL_WEIGHTS.ideaTractionScore     +
    signals.collaborationScore    * SIGNAL_WEIGHTS.collaborationScore    +
    signals.teamFormationScore    * SIGNAL_WEIGHTS.teamFormationScore    +
    signals.arenaPerformanceScore * SIGNAL_WEIGHTS.arenaPerformanceScore
  );

  const tier = (user.subscriptionTier ?? 'free') as SubscriptionTier;
  const hasEarnedAccess       = compositeScore >= GRADUATION_THRESHOLD;
  const hasActiveSubscription = tier === 'factory' || tier === 'investor' || user.factoryUnlocked === true;
  const hasFactoryAccess      = hasEarnedAccess && hasActiveSubscription;
  const pointsToGo            = Math.max(0, GRADUATION_THRESHOLD - compositeScore);

  const weightedSignals = (Object.entries(signals) as [keyof typeof SIGNAL_WEIGHTS, number][])
    .map(([key, val]) => ({ key, weighted: val * SIGNAL_WEIGHTS[key] }));
  const weakestSignal = weightedSignals.sort((a, b) => a.weighted - b.weighted)[0].key;

  const nextActions: string[] = [];
  if (signals.ideaTractionScore     < 40) nextActions.push('Post an idea and get it to 10+ upvotes');
  if (signals.collaborationScore    < 40) nextActions.push('Join a pod and contribute 3 times this week');
  if (signals.teamFormationScore    < 40) nextActions.push('Join a team or form one around a validated idea');
  if (signals.arenaPerformanceScore < 40) nextActions.push('Submit a solution to an open arena challenge');
  if (nextActions.length === 0)           nextActions.push("You've qualified — activate your Factory subscription");

  return {
    compositeScore, hasEarnedAccess, hasActiveSubscription,
    hasFactoryAccess, tier, signals, pointsToGo, weakestSignal, nextActions,
  };
}

// ─── Signal metadata ──────────────────────────────────────────────────────────

export const SIGNAL_META: Record<keyof typeof SIGNAL_WEIGHTS, {
  label: string; weight: string; desc: string; actions: string[];
}> = {
  ideaTractionScore: {
    label: 'Idea traction', weight: '30%',
    desc: 'Your ideas gaining traction in the community',
    actions: ['Post ideas', 'Get upvotes', 'Receive comments', 'Have ideas forked'],
  },
  collaborationScore: {
    label: 'Collaboration', weight: '25%',
    desc: 'Active participation and connecting with others',
    actions: ['Join pods', 'Make connections', 'Contribute to discussions', 'Join teams'],
  },
  teamFormationScore: {
    label: 'Team formation', weight: '25%',
    desc: 'Building and joining teams to execute on ideas',
    actions: ['Create a team', 'Join a team', 'Start a project', 'Complete milestones'],
  },
  arenaPerformanceScore: {
    label: 'Arena performance', weight: '20%',
    desc: 'Competing and winning in industry challenges',
    actions: ['Submit solutions', 'Get shortlisted', 'Win arena challenges'],
  },
};

// ─── Async API (used by FactoryUnlockBanner) ──────────────────────────────────

/**
 * Fetches the user's raw signal scores from Firestore.
 * Returns a RawSignals object — pass it to getGraduationProgress().
 */
export async function getGraduationSignals(uid: string): Promise<RawSignals> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return {
      ideaTractionScore: 0, collaborationScore: 0,
      teamFormationScore: 0, arenaPerformanceScore: 0,
    };
    const data = snap.data();
    return {
      ideaTractionScore:     data.ideaTractionScore     ?? 0,
      collaborationScore:    data.collaborationScore     ?? 0,
      teamFormationScore:    data.teamFormationScore     ?? 0,
      arenaPerformanceScore: data.arenaPerformanceScore  ?? 0,
      factoryUnlocked:       data.factoryUnlocked        ?? false,
      subscriptionTier:      data.subscriptionTier       ?? 'free',
    };
  } catch {
    return {
      ideaTractionScore: 0, collaborationScore: 0,
      teamFormationScore: 0, arenaPerformanceScore: 0,
    };
  }
}

/**
 * Converts raw signals into the GraduationProgress shape
 * that FactoryUnlockBanner expects.
 */
export function getGraduationProgress(signals: RawSignals): GraduationProgress {
  const status = computeGraduationStatus(signals);
  const percentage = Math.min(100, Math.round((status.compositeScore / GRADUATION_THRESHOLD) * 100));

  return {
    percentage,
    hasEarnedAccess: status.hasEarnedAccess,
    signals: [
      { label: 'Idea traction',     score: signals.ideaTractionScore     },
      { label: 'Collaboration',     score: signals.collaborationScore     },
      { label: 'Team formation',    score: signals.teamFormationScore     },
      { label: 'Arena performance', score: signals.arenaPerformanceScore  },
    ],
  };
}
