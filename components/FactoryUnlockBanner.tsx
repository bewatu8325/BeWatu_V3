/**
 * components/FactoryUnlockBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a banner when a user has earned Factory access through real
 * platform activity. Shown on the home feed once a minimum of progress
 * is visible.
 *
 * Previously read lib/graduation.ts's four signal fields on users/{uid}
 * (ideaTractionScore, collaborationScore, teamFormationScore,
 * arenaPerformanceScore) — nothing anywhere ever wrote to those fields, so
 * every user's progress was permanently 0% and this banner never actually
 * appeared in production. It now reads the real, live
 * factory_reputation/{uid}.xp field (bewatu-factory's own XP system,
 * awarded server-side via /api/award-xp) instead of maintaining a second,
 * parallel scoring system.
 *
 * The level/rank table below mirrors bewatu-factory's lib/types.ts
 * LEVEL_RANKS (the one its real reputation UI uses) — factory_reputation
 * docs do store their own level/rank fields, but nothing recalculates them
 * after the document's initial creation, so they go stale as xp grows.
 * Computing level/rank from the real xp number here avoids showing a
 * user's reputation as permanently "Newcomer".
 *
 * FACTORY_UNLOCK_LEVEL below is a product choice (Level 5 / "Expert"),
 * not something inherent to the data — worth revisiting if the intended
 * free-unlock bar should sit somewhere else.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Factory, X, Flame, ChevronRight } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { db } from '../lib/firebase';

const LEVEL_RANKS: { level: number; rank: string; minXP: number }[] = [
  { level: 1,  rank: 'Newcomer',       minXP: 0 },
  { level: 2,  rank: 'Contributor',    minXP: 100 },
  { level: 3,  rank: 'Problem Solver', minXP: 300 },
  { level: 4,  rank: 'Innovator',      minXP: 600 },
  { level: 5,  rank: 'Expert',         minXP: 1000 },
  { level: 6,  rank: 'Master',         minXP: 1500 },
  { level: 7,  rank: 'Visionary',      minXP: 2200 },
  { level: 8,  rank: 'Legend',         minXP: 3000 },
  { level: 9,  rank: 'Pioneer',        minXP: 4000 },
  { level: 10, rank: 'Titan',          minXP: 5500 },
];

const FACTORY_UNLOCK_LEVEL = LEVEL_RANKS[4]; // Level 5 / "Expert" / 1000 XP

function levelFor(xp: number) {
  let current = LEVEL_RANKS[0];
  for (const l of LEVEL_RANKS) {
    if (xp >= l.minXP) current = l;
  }
  return current;
}

interface FactoryUnlockBannerProps {
  onUnlock: () => void;
}

export default function FactoryUnlockBanner({ onUnlock }: FactoryUnlockBannerProps) {
  const { currentUser, fbUser } = useFirebase();
  const [xp,         setXp]         = useState<number | null>(null);
  const [dismissed,  setDismissed]  = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!fbUser) return;
    getDoc(doc(db, 'factory_reputation', fbUser.uid))
      .then(snap => setXp(snap.exists() ? (snap.data().xp ?? 0) : 0))
      .catch(err => { console.error(err); setXp(0); })
      .finally(() => setLoading(false));
  }, [fbUser]);

  // Don't show if already on factory/investor tier
  const tier = (currentUser as any)?.subscriptionTier ?? 'free';
  if (tier === 'factory' || tier === 'investor') return null;
  if (dismissed || loading || xp === null) return null;

  const percentage = Math.min(100, Math.round((xp / FACTORY_UNLOCK_LEVEL.minXP) * 100));
  const qualified  = percentage >= 100;
  const level      = levelFor(xp);

  // Only show if the user has some real progress, or is fully qualified
  if (percentage < 20) return null;

  return (
    <div className={`relative rounded-xl border p-4 mb-4 ${
      qualified
        ? 'bg-emerald-50 border-emerald-300'
        : 'bg-stone-50 border-stone-200'
    }`}>
      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-stone-600 hover:text-stone-600"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${qualified ? 'bg-emerald-100' : 'bg-stone-100'}`}>
          {qualified
            ? <Factory className="h-5 w-5 text-emerald-600" />
            : <Flame className="h-5 w-5 text-stone-600" />
          }
        </div>

        <div className="flex-1 min-w-0">
          {qualified ? (
            <>
              <p className="font-semibold text-emerald-900 text-sm">
                🎉 You've unlocked Factory access!
              </p>
              <p className="text-emerald-700 text-xs mt-0.5">
                Your activity on BeWatu has earned you access to the Factory workspace.
              </p>
              <button
                onClick={onUnlock}
                className="mt-3 inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-500 transition-colors"
              >
                Activate Factory <ChevronRight className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold text-stone-900 text-sm">
                You're {percentage}% of the way to Factory
              </p>
              <p className="text-stone-600 text-xs mt-0.5">
                {level.rank} · {xp} / {FACTORY_UNLOCK_LEVEL.minXP} XP toward Factory access
              </p>

              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
