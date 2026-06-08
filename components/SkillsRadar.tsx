/**
 * components/SkillsRadar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Feature 2 — growing vs declining skills insight for the Lens (AI co-pilot) view.
 *
 * Takes the user's verified + self-reported skills, classifies each against the
 * WEF-derived trend reference (lib/skillTrends.ts), and shows:
 *   - a headline read on the overall portfolio
 *   - growing skills (lean in)
 *   - judgment / stable skills (the human moat)
 *   - declining skills (AI absorbs first — pair with judgment)
 *
 * Read-only insight. No new collection, no writes — purely computed from the
 * skills already on the user's profile. Drop into the Lens view as a card.
 *
 * Mount:
 *   <SkillsRadar skills={[...user.verifiedSkills, ...user.skills]} onAddPlaybook={...} />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo } from 'react';
import { TrendingUp, Minus, TrendingDown, Compass, ArrowRight } from 'lucide-react';
import { classifySkills, portfolioGuidance, type SkillTrend } from '../lib/skillTrends';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';
const AMBER    = '#d97706';
const AMBER_LT = '#fef3c7';
const BORDER   = '#e7e5e4';

const BUCKET_CONFIG: Record<Exclude<SkillTrend, 'unknown'>, { label: string; icon: any; color: string; bg: string; blurb: string }> = {
  growing:   { label: 'Growing',  icon: TrendingUp,   color: GREEN, bg: GREEN_LT, blurb: 'Rising in demand — lean in and show these in context.' },
  stable:    { label: 'Judgment', icon: Minus,        color: '#0369a1', bg: '#e0f2fe', blurb: 'The human moat — judgment and relationships AI can\'t replace.' },
  declining: { label: 'Absorbing', icon: TrendingDown, color: AMBER, bg: AMBER_LT, blurb: 'AI absorbs these first — pair them with judgment and visible work.' },
};

interface SkillsRadarProps {
  skills: string[];
  /** Optional: lets the user jump to creating a Playbook from the insight. */
  onAddPlaybook?: () => void;
}

const SkillsRadar: React.FC<SkillsRadarProps> = ({ skills, onAddPlaybook }) => {
  const { results, guidance, buckets } = useMemo(() => {
    const deduped = Array.from(new Set(skills.map(s => s.trim()).filter(Boolean)));
    const results = classifySkills(deduped);
    const buckets = {
      growing:   results.filter(r => r.trend === 'growing'),
      stable:    results.filter(r => r.trend === 'stable'),
      declining: results.filter(r => r.trend === 'declining'),
      unknown:   results.filter(r => r.trend === 'unknown'),
    };
    return { results, guidance: portfolioGuidance(results), buckets };
  }, [skills]);

  if (skills.length === 0) {
    return (
      <div className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2 mb-1">
          <Compass className="w-4 h-4" style={{ color: GREEN }} />
          <h3 className="font-bold text-stone-900 text-sm">Skills Radar</h3>
        </div>
        <p className="text-xs text-stone-400 mt-1">Add a few skills to your profile and the radar will map where each one is heading through 2030.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: BORDER }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <Compass className="w-4 h-4" style={{ color: GREEN }} />
          <h3 className="font-bold text-stone-900 text-sm">Skills Radar</h3>
          <span className="text-[10px] text-stone-400 font-medium px-2 py-0.5 rounded-full bg-stone-100">through 2030</span>
        </div>
        <p className="text-sm text-stone-600 leading-relaxed">{guidance}</p>
      </div>

      {/* Buckets */}
      <div className="px-5 pb-5 space-y-3">
        {(['growing', 'stable', 'declining'] as const).map(key => {
          const cfg = BUCKET_CONFIG[key];
          const items = buckets[key];
          if (items.length === 0) return null;
          const Icon = cfg.icon;
          return (
            <div key={key} className="rounded-xl border p-3" style={{ borderColor: BORDER }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: cfg.bg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                </div>
                <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="text-[10px] text-stone-400">· {items.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {items.map((r, i) => (
                  <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: cfg.bg, color: cfg.color }}>
                    {r.skill}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-stone-500 leading-snug">{cfg.blurb}</p>
            </div>
          );
        })}

        {/* Unknown — shown honestly, never guessed */}
        {buckets.unknown.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: '#fafaf9' }}>
            <p className="text-[11px] text-stone-400 mb-1.5">Not yet mapped:</p>
            <div className="flex flex-wrap gap-1.5">
              {buckets.unknown.map((r, i) => (
                <span key={i} className="text-xs text-stone-500 px-2.5 py-1 rounded-full bg-white border" style={{ borderColor: BORDER }}>
                  {r.skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action nudge — only when there are growing or declining signals */}
        {(buckets.growing.length > 0 || buckets.declining.length > 0) && onAddPlaybook && (
          <button onClick={onAddPlaybook}
            className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
            style={{ background: GREEN }}>
            <span>Turn a growing skill into a Playbook</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default SkillsRadar;
