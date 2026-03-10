/**
 * lib/graduation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks user activity signals and determines when a user has earned
 * the right to unlock the Factory tier.
 *
 * Signals tracked:
 *   - Idea traction (engagements on ideas)
 *   - Collaboration activity (circle posts, comments)
 *   - Team formation (teams created or joined)
 *   - Arena performance (solutions ranked top 3)
 *   - Pro subscription duration (30+ days)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// ── Signal weights ────────────────────────────────────────────────────────────

export interface GraduationSignals {
  ideaTractionScore:     number;   // 0-100, based on idea engagements
  collaborationScore:    number;   // 0-100, based on posts/comments
  teamFormationScore:    number;   // 0-100, based on teams created/joined
  arenaPerformanceScore: number;   // 0-100, based on arena rankings
  proSubscriptionDays:   number;   // days as Pro subscriber
  totalScore:            number;   // weighted total
  factoryUnlocked:       boolean;  // whether Factory has been unlocked
  factoryUnlockedAt?:    string;   // ISO date when unlocked
  factoryUnlockReason?:  string;   // what triggered the unlock
}

const WEIGHTS = {
  ideaTraction:     0.30,
  collaboration:    0.20,
  teamFormation:    0.25,
  arenaPerformance: 0.25,
};

const FACTORY_UNLOCK_THRESHOLD = 60; // out of 100

// ── Compute total score ───────────────────────────────────────────────────────

export function computeGraduationScore(signals: Omit<GraduationSignals, 'totalScore' | 'factoryUnlocked' | 'factoryUnlockedAt' | 'factoryUnlockReason'>): number {
  return Math.round(
    signals.ideaTractionScore     * WEIGHTS.ideaTraction     +
    signals.collaborationScore    * WEIGHTS.collaboration     +
    signals.teamFormationScore    * WEIGHTS.teamFormation     +
    signals.arenaPerformanceScore * WEIGHTS.arenaPerformance
  );
}

// ── Check if user qualifies for Factory unlock ────────────────────────────────

export function qualifiesForFactory(signals: GraduationSignals): { qualifies: boolean; reason: string } {
  // Direct qualification paths
  if (signals.ideaTractionScore >= 80) {
    return { qualifies: true, reason: 'Your idea gained significant traction in the community' };
  }
  if (signals.teamFormationScore >= 80) {
    return { qualifies: true, reason: 'You successfully formed a team and started collaborating' };
  }
  if (signals.arenaPerformanceScore >= 80) {
    return { qualifies: true, reason: 'Your arena solutions ranked in the top performers' };
  }
  if (signals.proSubscriptionDays >= 30 && signals.totalScore >= 40) {
    return { qualifies: true, reason: 'You\'ve been an active Pro member and are ready for Factory' };
  }

  // Overall score threshold
  if (signals.totalScore >= FACTORY_UNLOCK_THRESHOLD) {
    return { qualifies: true, reason: 'You\'ve demonstrated strong engagement across the platform' };
  }

  return { qualifies: false, reason: '' };
}

// ── Fetch graduation signals from Firestore ───────────────────────────────────

export async function getGraduationSignals(uid: string): Promise<GraduationSignals> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('User not found');

  const data = snap.data();

  const signals: GraduationSignals = {
    ideaTractionScore:     data.ideaTractionScore     ?? 0,
    collaborationScore:    data.collaborationScore     ?? 0,
    teamFormationScore:    data.teamFormationScore     ?? 0,
    arenaPerformanceScore: data.arenaPerformanceScore  ?? 0,
    proSubscriptionDays:   data.proSubscriptionDays    ?? 0,
    totalScore:            0,
    factoryUnlocked:       data.factoryUnlocked        ?? false,
    factoryUnlockedAt:     data.factoryUnlockedAt,
    factoryUnlockReason:   data.factoryUnlockReason,
  };

  signals.totalScore = computeGraduationScore(signals);
  return signals;
}

// ── Update a specific signal ──────────────────────────────────────────────────

export async function updateGraduationSignal(
  uid: string,
  signal: keyof Pick<GraduationSignals, 'ideaTractionScore' | 'collaborationScore' | 'teamFormationScore' | 'arenaPerformanceScore'>,
  value: number
): Promise<void> {
  const clampedValue = Math.min(100, Math.max(0, value));
  await updateDoc(doc(db, 'users', uid), {
    [signal]: clampedValue,
    updatedAt: serverTimestamp(),
  });
}

// ── Check and unlock Factory if qualified ────────────────────────────────────

export async function checkAndUnlockFactory(uid: string): Promise<{ unlocked: boolean; reason?: string }> {
  const signals = await getGraduationSignals(uid);

  // Already unlocked
  if (signals.factoryUnlocked) return { unlocked: true };

  const { qualifies, reason } = qualifiesForFactory(signals);

  if (qualifies) {
    await updateDoc(doc(db, 'users', uid), {
      factoryUnlocked:     true,
      factoryUnlockedAt:   new Date().toISOString(),
      factoryUnlockReason: reason,
      updatedAt:           serverTimestamp(),
    });
    return { unlocked: true, reason };
  }

  return { unlocked: false };
}

// ── Progress helpers for UI ───────────────────────────────────────────────────

export interface GraduationProgress {
  score:       number;
  threshold:   number;
  percentage:  number;
  signals: {
    label:       string;
    score:       number;
    weight:      number;
    description: string;
  }[];
}

export function getGraduationProgress(signals: GraduationSignals): GraduationProgress {
  return {
    score:      signals.totalScore,
    threshold:  FACTORY_UNLOCK_THRESHOLD,
    percentage: Math.min(100, Math.round((signals.totalScore / FACTORY_UNLOCK_THRESHOLD) * 100)),
    signals: [
      {
        label:       'Idea Traction',
        score:       signals.ideaTractionScore,
        weight:      30,
        description: 'Get engagement on your ideas — likes, comments, and saves',
      },
      {
        label:       'Team Formation',
        score:       signals.teamFormationScore,
        weight:      25,
        description: 'Create or join teams and collaborate with others',
      },
      {
        label:       'Arena Performance',
        score:       signals.arenaPerformanceScore,
        weight:      25,
        description: 'Submit solutions to arenas and rank in the top performers',
      },
      {
        label:       'Collaboration',
        score:       signals.collaborationScore,
        weight:      20,
        description: 'Actively post, comment, and contribute in circles',
      },
    ],
  };
}
