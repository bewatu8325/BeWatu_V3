/**
 * components/profile/SkillsTrajectory.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 2 — "Declining-vs-growing skills insight"
 *
 * A Lens-style insight panel on the user's own Prove profile. Takes their
 * verified/listed skills, asks the backend to classify each as growing /
 * stable / declining (WEF framing), and shows the trajectory visually so the
 * user knows what to lean into and what AI is absorbing.
 *
 * Owner-only (this is personal career guidance, not a public signal).
 * Result is cached to users/{uid}/insights/skillTrajectory so it's instant on
 * return and only recomputed on demand.
 *
 * Matches design language: white rounded-2xl card, #1a4a3a green, teal→amber→
 * rust trajectory colours echoing the research's own palette.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const GREEN = '#1a4a3a';

type Trajectory = 'growing' | 'stable' | 'declining';

interface SkillTrajectory {
  skill: string;
  trajectory: Trajectory;
  rationale: string;
}

interface CachedInsight {
  trajectories: SkillTrajectory[];
  summary: string;
  computedAt: number;
  skillsHash: string;
}

const TRAJ_META: Record<Trajectory, { label: string; color: string; bg: string; order: number; arrow: string }> = {
  growing:   { label: 'Growing',   color: '#0d9488', bg: '#f0fdfa', order: 0, arrow: '↗' },
  stable:    { label: 'Stable',    color: '#b45309', bg: '#fffbeb', order: 1, arrow: '→' },
  declining: { label: 'Declining', color: '#c2410c', bg: '#fff7ed', order: 2, arrow: '↘' },
};

interface Props {
  profileUid: string;
  isOwn: boolean;
  skills: string[]; // verified skill names (or listed skills as fallback)
  industry?: string;
}

function hashSkills(skills: string[]): string {
  return [...skills].sort().join('|').slice(0, 200);
}

const SkillsTrajectory: React.FC<Props> = ({ profileUid, isOwn, skills, industry }) => {
  const [insight, setInsight] = useState<CachedInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // Owner-only — guard BEFORE all hooks so non-owners never trigger a Firestore
  // read against another user's private insights subcollection (permission-denied).
  // React rules: hooks must not be called conditionally, so we keep all useState
  // above this point and use a ref-guarded effect below instead of returning early.
  const isActive = isOwn;

  useEffect(() => {
    if (!isActive) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', profileUid, 'insights', 'skillTrajectory'));
        if (snap.exists()) setInsight(snap.data() as CachedInsight);
      } catch { /* none yet — user hasn't run analysis */ }
      finally { setLoading(false); }
    })();
  }, [profileUid, isActive]);

  async function runAnalysis() {
    // Guard: skills prop may be empty or contain only empty strings after sanitisation
    const validSkills = skills.filter(s => typeof s === 'string' && s.trim());
    if (validSkills.length === 0) {
      setError('Add some skills to your profile first, then come back to see your trajectory.');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const res = await fetch('/api/skills-trajectory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: validSkills, industry }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Surface a helpful message for the no_skills case
        if (data?.error === 'no_skills') {
          setError('Add some skills to your profile first, then come back to see your trajectory.');
        } else {
          setError(data?.message ?? data?.error ?? 'Analysis failed. Please try again.');
        }
        return;
      }
      const cached: CachedInsight = {
        trajectories: data.trajectories ?? [],
        summary: data.summary ?? '',
        computedAt: Date.now(),
        skillsHash: hashSkills(validSkills),
      };
      await setDoc(doc(db, 'users', profileUid, 'insights', 'skillTrajectory'), { ...cached, updatedAt: serverTimestamp() });
      setInsight(cached);
    } catch {
      setError('Could not reach the analysis service. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  if (!isActive || loading) return null;

  const validSkills = skills.filter(s => typeof s === 'string' && s.trim());
  const stale = insight && insight.skillsHash !== hashSkills(validSkills);

  const sorted = insight?.trajectories
    ? [...insight.trajectories].sort((a, b) => TRAJ_META[a.trajectory].order - TRAJ_META[b.trajectory].order)
    : [];

  const counts = {
    growing:   sorted.filter(t => t.trajectory === 'growing').length,
    stable:    sorted.filter(t => t.trajectory === 'stable').length,
    declining: sorted.filter(t => t.trajectory === 'declining').length,
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: GREEN }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18M7 14l4-4 4 4 5-6"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-stone-900 text-sm">Skills Trajectory</h3>
            <p className="text-xs text-stone-400">Where your skills are heading through 2030</p>
          </div>
        </div>
      </div>

      {/* No analysis yet */}
      {!insight ? (
        <div className="rounded-xl border border-dashed p-4 text-center" style={{ borderColor: '#d6d3d1' }}>
          {validSkills.length === 0 ? (
            <>
              <p className="text-sm font-medium text-stone-700 mb-1">No skills on your profile yet</p>
              <p className="text-xs text-stone-400">Add skills to your profile first — then come back here to see how AI is affecting each one.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-600 mb-1">See which of your skills are growing — and which AI is absorbing first.</p>
              <p className="text-xs text-stone-400 mb-3">Based on WEF Future of Jobs research, personalised to your {validSkills.length} skill{validSkills.length !== 1 ? 's' : ''}.</p>
              <button onClick={runAnalysis} disabled={analyzing}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition"
                style={{ backgroundColor: GREEN }}>
                {analyzing
                  ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Analyzing…</>
                  : <>Analyze my {validSkills.length} skill{validSkills.length !== 1 ? 's' : ''}</>}
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      ) : (
        <>
          {/* Distribution bar */}
          <div className="flex h-2 rounded-full overflow-hidden mb-1.5">
            {counts.growing > 0 && <div style={{ flex: counts.growing, backgroundColor: TRAJ_META.growing.color }} />}
            {counts.stable > 0 && <div style={{ flex: counts.stable, backgroundColor: TRAJ_META.stable.color }} />}
            {counts.declining > 0 && <div style={{ flex: counts.declining, backgroundColor: TRAJ_META.declining.color }} />}
          </div>
          <div className="flex gap-3 mb-4 text-[11px]">
            {(['growing', 'stable', 'declining'] as Trajectory[]).map(t => counts[t] > 0 && (
              <span key={t} className="flex items-center gap-1" style={{ color: TRAJ_META[t].color }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: TRAJ_META[t].color }} />
                {counts[t]} {TRAJ_META[t].label.toLowerCase()}
              </span>
            ))}
          </div>

          {/* Summary */}
          {insight.summary && (
            <p className="text-sm text-stone-600 leading-relaxed mb-4 rounded-lg p-3" style={{ backgroundColor: '#fafaf9' }}>
              {insight.summary}
            </p>
          )}

          {/* Skill list */}
          <div className="space-y-1.5">
            {sorted.map((t, i) => {
              const meta = TRAJ_META[t.trajectory];
              return (
                <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2" style={{ backgroundColor: meta.bg }}>
                  <span className="text-sm font-bold flex-shrink-0 mt-0.5" style={{ color: meta.color }}>{meta.arrow}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-stone-800">{t.skill}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">{t.rationale}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Refresh */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-[11px] text-stone-400">
              {stale ? 'Your skills changed since this analysis.' : `Analyzed ${new Date(insight.computedAt).toLocaleDateString()}`}
            </p>
            <button onClick={runAnalysis} disabled={analyzing}
              className="text-xs font-semibold hover:opacity-80 disabled:opacity-50" style={{ color: '#1a6b52' }}>
              {analyzing ? 'Analyzing…' : stale ? 'Re-analyze →' : 'Refresh'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SkillsTrajectory;
