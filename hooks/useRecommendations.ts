/**
 * hooks/useRecommendations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the user's transparent recommendation profile and ranks a set of
 * content candidates. Respects an explicit opt-out — when off, returns the
 * candidates unranked (no personalization applied).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo } from 'react';
import { loadProfile, type RecommendationProfile } from '../lib/recommendation/profile';
import { rankCandidates, confidenceBanner, type Candidate, type ScoredCandidate } from '../lib/recommendation/recommend';

const OPTOUT_KEY = 'bewatu_recommendations_off';

export function recommendationsOptedOut(): boolean {
  try { return localStorage.getItem(OPTOUT_KEY) === 'true'; } catch { return false; }
}

export function setRecommendationsOptOut(off: boolean): void {
  try {
    if (off) localStorage.setItem(OPTOUT_KEY, 'true');
    else localStorage.removeItem(OPTOUT_KEY);
  } catch {}
}

export function useRecommendations(uid: string | null, candidates: Candidate[], limit = 10) {
  const [profile, setProfile] = useState<RecommendationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [optedOut, setOptedOut] = useState(recommendationsOptedOut());

  useEffect(() => {
    let active = true;
    if (!uid || optedOut) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    loadProfile(uid).then(p => { if (active) { setProfile(p); setLoading(false); } });
    return () => { active = false; };
  }, [uid, optedOut]);

  const ranked: ScoredCandidate[] = useMemo(() => {
    if (optedOut) {
      // No personalization — return candidates as-is with a neutral reason
      return candidates.slice(0, limit).map(c => ({ ...c, score: 0, reasons: [] }));
    }
    return rankCandidates(candidates, profile, limit);
  }, [candidates, profile, optedOut, limit]);

  const toggleOptOut = (off: boolean) => {
    setRecommendationsOptOut(off);
    setOptedOut(off);
  };

  return {
    recommendations: ranked,
    profile,
    loading,
    optedOut,
    toggleOptOut,
    banner: optedOut ? 'Personalized recommendations are off.' : confidenceBanner(profile),
  };
}
