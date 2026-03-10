/**
 * components/FactoryUnlockBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a banner when a user has earned Factory access via graduation signals.
 * Shown on the home feed once the threshold is met.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState } from 'react';
import { Factory, X, ChevronRight, Flame } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { getGraduationProgress, getGraduationSignals, GraduationProgress } from '../lib/graduation';

interface FactoryUnlockBannerProps {
  onUnlock: () => void;
}

export default function FactoryUnlockBanner({ onUnlock }: FactoryUnlockBannerProps) {
  const { currentUser, fbUser } = useFirebase();
  const [progress,    setProgress]    = useState<GraduationProgress | null>(null);
  const [dismissed,   setDismissed]   = useState(false);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!fbUser) return;

    getGraduationSignals(fbUser.uid)
      .then((signals) => {
        setProgress(getGraduationProgress(signals));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fbUser]);

  // Don't show if already on factory/investor tier
  const tier = (currentUser as any)?.subscriptionTier ?? 'free';
  if (tier === 'factory' || tier === 'investor') return null;
  if (dismissed || loading || !progress) return null;

  const qualified = progress.percentage >= 100;

  // Only show if user has some progress (> 20%) or is fully qualified
  if (progress.percentage < 20) return null;

  return (
    <div className={`relative rounded-xl border p-4 mb-4 ${
      qualified
        ? 'bg-emerald-50 border-emerald-300'
        : 'bg-stone-50 border-stone-200'
    }`}>
      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-stone-400 hover:text-stone-600"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${qualified ? 'bg-emerald-100' : 'bg-stone-100'}`}>
          {qualified
            ? <Factory className="h-5 w-5 text-emerald-600" />
            : <Flame className="h-5 w-5 text-stone-500" />
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
                You're {progress.percentage}% of the way to Factory
              </p>
              <p className="text-stone-500 text-xs mt-0.5">
                Keep contributing to unlock your startup workspace.
              </p>

              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              {/* Signal breakdown */}
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {progress.signals.map((signal) => (
                  <div key={signal.label} className="text-xs text-stone-500">
                    <span className="font-medium text-stone-700">{signal.label}:</span>{' '}
                    {signal.score}/100
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
