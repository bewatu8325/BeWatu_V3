/**
 * components/RecommendationInsights.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The transparency surface. Shows the user, in plain language, what BeWatu has
 * learned about their CONTENT interests — and lets them turn personalization off.
 *
 * This is the deliberate opposite of a covert profile: everything the system
 * infers is shown back to the person, framed as preferences (not traits), and
 * fully under their control.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import { loadProfile, type RecommendationProfile } from '../lib/recommendation/profile';
import { recommendationsOptedOut, setRecommendationsOptOut } from '../hooks/useRecommendations';

const GREEN = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface Props {
  uid: string;
}

const RecommendationInsights: React.FC<Props> = ({ uid }) => {
  const [profile, setProfile] = useState<RecommendationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [optedOut, setOptedOut] = useState(recommendationsOptedOut());

  useEffect(() => {
    loadProfile(uid).then(p => { setProfile(p); setLoading(false); });
  }, [uid]);

  const handleToggle = () => {
    const next = !optedOut;
    setRecommendationsOptOut(next);
    setOptedOut(next);
  };

  const topIndustries = profile
    ? Object.entries(profile.industryAffinity).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : [];
  const topRoles = profile
    ? Object.entries(profile.rolePreference).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 2)
    : [];

  const confidenceLabel = {
    early:       'Just getting to know you',
    developing:  'Starting to learn your interests',
    established: 'Tuned to your activity',
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-bold text-stone-900 text-base flex items-center gap-2">
          <svg className="w-5 h-5" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          What BeWatu recommends to you
        </h3>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        These are the content interests we use to suggest pods and challenges. We
        infer interests, not personality — and you can turn this off anytime.
      </p>

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : optedOut ? (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: '#f5f5f4' }}>
          <p className="text-sm text-stone-600">
            Personalized recommendations are <strong>off</strong>. You'll see general,
            non-personalized suggestions. We're not building an interest profile from your activity.
          </p>
        </div>
      ) : !profile || profile.confidence === 'early' ? (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: GREEN_LT }}>
          <p className="text-sm text-stone-700">
            We don't have enough activity yet to personalize. As you join pods and
            take on challenges, this will fill in — and you'll always be able to see exactly what's here.
          </p>
        </div>
      ) : (
        <div className="space-y-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: GREEN_LT, color: GREEN }}>
              {confidenceLabel[profile.confidence]}
            </span>
            <span className="text-xs text-stone-400">based on {profile.eventCount} recent actions</span>
          </div>

          {topIndustries.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Topics you engage with</p>
              <div className="space-y-1.5">
                {topIndustries.map(([industry, weight]) => (
                  <div key={industry} className="flex items-center gap-3">
                    <span className="text-sm text-stone-700 w-28 truncate">{industry}</span>
                    <div className="flex-1 bg-stone-100 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${Math.round((weight as number) * 100)}%`, backgroundColor: GREEN }} />
                    </div>
                    <span className="text-xs text-stone-400 w-10 text-right">{Math.round((weight as number) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {profile.difficultyPreference !== null && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#e7e5e4' }}>
                <p className="text-xs text-stone-400">Difficulty you take on</p>
                <p className="text-sm font-semibold text-stone-800">
                  {['', 'Beginner', 'Intermediate', 'Advanced', 'Expert', 'Elite'][Math.round(profile.difficultyPreference)] ?? '—'}
                </p>
              </div>
            )}
            {profile.followThroughRate !== null && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#e7e5e4' }}>
                <p className="text-xs text-stone-400">You finish what you start</p>
                <p className="text-sm font-semibold text-stone-800">{Math.round(profile.followThroughRate * 100)}% of the time</p>
              </div>
            )}
            {profile.initiationTendency !== null && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#e7e5e4' }}>
                <p className="text-xs text-stone-400">Your style</p>
                <p className="text-sm font-semibold text-stone-800">
                  {profile.initiationTendency >= 0.6 ? 'Initiator' : profile.initiationTendency <= 0.4 ? 'Contributor' : 'Balanced'}
                </p>
              </div>
            )}
            {topRoles.length > 0 && (
              <div className="rounded-lg border p-3" style={{ borderColor: '#e7e5e4' }}>
                <p className="text-xs text-stone-400">Roles you choose</p>
                <p className="text-sm font-semibold text-stone-800 capitalize">{topRoles.map(([r]) => r).join(', ')}</p>
              </div>
            )}
          </div>

          <p className="text-xs text-stone-400">
            This describes your <strong>content preferences</strong> to help you find relevant pods and
            challenges. It is never shown to recruiters and is never used to rank or score you against others.
          </p>
        </div>
      )}

      {/* Opt-out control */}
      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: '#f5f5f4' }}>
        <div>
          <p className="text-sm font-semibold text-stone-800">Personalized recommendations</p>
          <p className="text-xs text-stone-400">{optedOut ? 'Off — general suggestions only' : 'On — tuned to your activity'}</p>
        </div>
        <button
          onClick={handleToggle}
          role="switch"
          aria-checked={!optedOut}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          style={{ backgroundColor: optedOut ? '#d4d4d4' : GREEN }}>
          <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            style={{ transform: optedOut ? 'translateX(4px)' : 'translateX(24px)' }} />
        </button>
      </div>
    </div>
  );
};

export default RecommendationInsights;
