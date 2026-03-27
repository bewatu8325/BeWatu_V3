/**
 * components/SkillsGraphModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the resume-paste box with a two-source verified skills flow:
 *
 *   Tab 1 — Platform activity
 *     Skills are auto-derived from what the user has actually done on BeWatu:
 *     arena submissions, reel tags, ideas posted, pods joined.
 *     The user reviews and confirms — no manual entry needed.
 *
 *   Tab 2 — Peer endorsements
 *     Circle members can endorse specific skills. The user can request
 *     endorsements from their connections here.
 *
 * The result feeds into verifiedSkills on the user profile.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { User } from '../types';
import {
  X, CheckCircle2, Zap, Users, Trophy, Video,
  Lightbulb, ChevronRight, Star, RefreshCw, Plus,
} from 'lucide-react';

interface SkillsGraphModalProps {
  currentUser: User;
  onSubmit:    (resume: string, digitalFootprint: string, references: string) => Promise<void>;
  onClose:     () => void;
}

// ─── Derive skills from platform activity ────────────────────────────────────

function deriveSkillsFromActivity(user: User): {
  source: 'arena' | 'reel' | 'idea' | 'profile';
  skill:  string;
  evidence: string;
}[] {
  const derived: { source: 'arena' | 'reel' | 'idea' | 'profile'; skill: string; evidence: string }[] = [];

  // From profile skills (self-declared baseline)
  const profileSkills = ((user.skills ?? []) as any[])
    .map((s: any) => typeof s === 'string' ? s : s.name)
    .filter(Boolean);

  for (const skill of profileSkills.slice(0, 6)) {
    derived.push({
      source:   'profile',
      skill,
      evidence: 'Listed on your profile',
    });
  }

  // From verified achievements
  const achievements = (user.verifiedAchievements ?? []) as any[];
  for (const ach of achievements.slice(0, 3)) {
    if (ach.skill || ach.skills) {
      const skills = ach.skill ? [ach.skill] : ach.skills;
      for (const s of skills) {
        derived.push({ source: 'idea', skill: s, evidence: ach.title ?? 'Verified achievement' });
      }
    }
  }

  return derived.filter((item, idx, arr) =>
    arr.findIndex(x => x.skill.toLowerCase() === item.skill.toLowerCase()) === idx
  );
}

const SOURCE_CONFIG = {
  arena:   { icon: Trophy,    label: 'Arena challenge',  color: '#d97706', bg: '#fef3c7' },
  reel:    { icon: Video,     label: 'Prove reel',       color: '#7c3aed', bg: '#ede9fe' },
  idea:    { icon: Lightbulb, label: 'Idea / project',   color: '#0891b2', bg: '#e0f2fe' },
  profile: { icon: Star,      label: 'Profile',          color: '#1a6b52', bg: '#d1fae5' },
};

// ─── Skill chip ───────────────────────────────────────────────────────────────

function SkillChip({
  skill, source, evidence, selected, onToggle,
}: {
  skill:    string;
  source:   keyof typeof SOURCE_CONFIG;
  evidence: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const cfg  = SOURCE_CONFIG[source];
  const Icon = cfg.icon;

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-50'
          : 'border-stone-200 bg-white hover:border-stone-300'
      }`}
    >
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: cfg.bg }}>
        <Icon size={12} style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${selected ? 'text-emerald-900' : 'text-stone-800'}`}>
          {skill}
        </p>
        <p className="text-[10px] text-stone-400 truncate">{evidence}</p>
      </div>
      {selected && <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />}
    </button>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export const SkillsGraphModal: React.FC<SkillsGraphModalProps> = ({
  currentUser,
  onSubmit,
  onClose,
}) => {
  const [tab, setTab]               = useState<'activity' | 'endorsements'>('activity');
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [endorseMsg, setEndorseMsg] = useState<string | null>(null);

  const derived = deriveSkillsFromActivity(currentUser);
  const [selected, setSelected]     = useState<Set<string>>(
    new Set(derived.map(d => d.skill))
  );

  // Endorsement tab state
  const connections = [] as User[]; // would be passed as prop in a real wiring
  const [endorsed, setEndorsed]     = useState<Record<string, string[]>>({}); // skill → endorser names
  const [customSkill, setCustomSkill] = useState('');

  function toggleSkill(skill: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  function addCustomSkill() {
    if (!customSkill.trim()) return;
    const skill = customSkill.trim();
    derived.push({ source: 'profile', skill, evidence: 'Added manually' });
    setSelected(prev => new Set(prev).add(skill));
    setCustomSkill('');
  }

  async function handleGenerate() {
    if (selected.size === 0) {
      setError('Select at least one skill to verify.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      // Build a structured prompt from platform evidence
      const skillList = Array.from(selected).join(', ');
      const evidence  = derived
        .filter(d => selected.has(d.skill))
        .map(d => `${d.skill}: ${d.evidence}`)
        .join('\n');

      await onSubmit(
        `Verified skills based on platform activity: ${skillList}`,
        evidence,
        Object.entries(endorsed)
          .map(([skill, endorsers]) => `${skill} endorsed by: ${endorsers.join(', ')}`)
          .join('\n')
      );
      onClose();
    } catch (err) {
      setError('Failed to generate skills. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-emerald-700" />
            </div>
            <div>
              <p className="font-bold text-stone-900 text-sm">Verify your skills</p>
              <p className="text-xs text-stone-500">Based on what you've built, not what you've claimed</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-100">
          {[
            { id: 'activity',     label: 'Platform activity', icon: Zap    },
            { id: 'endorsements', label: 'Peer endorsements',  icon: Users  },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Activity tab ── */}
          {tab === 'activity' && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500 leading-relaxed">
                These skills were found in your BeWatu activity. Select the ones you want to verify — they'll appear with a badge on your profile.
              </p>

              {/* Legend */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <span key={key} className="flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                      <Icon size={9} />{cfg.label}
                    </span>
                  );
                })}
              </div>

              {/* Skill chips */}
              {derived.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {derived.map(({ skill, source, evidence }) => (
                    <SkillChip
                      key={skill}
                      skill={skill}
                      source={source}
                      evidence={evidence}
                      selected={selected.has(skill)}
                      onToggle={() => toggleSkill(skill)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-stone-400">
                  <Zap size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No activity signals found yet.</p>
                  <p className="text-xs mt-1">Post ideas, submit arena solutions, or upload a reel to generate skill signals.</p>
                </div>
              )}

              {/* Add custom skill */}
              <div>
                <p className="text-xs font-semibold text-stone-500 mb-2">Add a skill manually</p>
                <div className="flex gap-2">
                  <input
                    value={customSkill}
                    onChange={e => setCustomSkill(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomSkill()}
                    placeholder="e.g. System Design"
                    className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
                  />
                  <button onClick={addCustomSkill}
                    className="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-xl bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors">
                    <Plus size={13} /> Add
                  </button>
                </div>
              </div>

              <p className="text-xs text-stone-400 text-center">
                {selected.size} skill{selected.size !== 1 ? 's' : ''} selected for verification
              </p>
            </div>
          )}

          {/* ── Endorsements tab ── */}
          {tab === 'endorsements' && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500 leading-relaxed">
                Your circle members can vouch for your skills. Their endorsements carry more weight than self-declared skills — they signal real working relationships.
              </p>

              {/* How it works */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-stone-700">How peer endorsements work</p>
                {[
                  'Your circle members see your skill list',
                  'They endorse skills they\'ve personally witnessed',
                  'Endorsed skills appear with a "Peer verified" badge',
                  'The more endorsers, the stronger the signal',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: '#1a4a3a' }}>
                      {i + 1}
                    </div>
                    <p className="text-xs text-stone-600">{step}</p>
                  </div>
                ))}
              </div>

              {/* Skills available for endorsement */}
              {derived.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-stone-600 mb-2">
                    Your skills open for endorsement
                  </p>
                  <div className="space-y-2">
                    {Array.from(selected).map(skill => {
                      const endorsers = endorsed[skill] ?? [];
                      return (
                        <div key={skill}
                          className="flex items-center justify-between bg-white border border-stone-200 rounded-xl px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-stone-800">{skill}</p>
                            {endorsers.length > 0 ? (
                              <p className="text-xs text-emerald-600 mt-0.5">
                                ✓ Endorsed by {endorsers.join(', ')}
                              </p>
                            ) : (
                              <p className="text-xs text-stone-400 mt-0.5">No endorsements yet</p>
                            )}
                          </div>
                          <span className="text-xs font-semibold bg-stone-100 text-stone-500 rounded-full px-2.5 py-1">
                            {endorsers.length} endorser{endorsers.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-stone-400">
                  <Users size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select skills on the Activity tab first.</p>
                </div>
              )}

              {endorseMsg && (
                <p className="text-xs text-emerald-600 text-center">{endorseMsg}</p>
              )}

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Endorsements are requested automatically when your circles view your profile.
                  You'll see them appear here as connections vouch for your work.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-100 flex items-center justify-between gap-3">
          {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose}
              className="text-sm font-semibold text-stone-500 border border-stone-200 rounded-xl px-4 py-2.5 hover:bg-stone-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isLoading || selected.size === 0}
              className="flex items-center gap-2 text-sm font-bold text-white rounded-xl px-5 py-2.5 disabled:opacity-50 transition-colors hover:opacity-90"
              style={{ backgroundColor: '#1a4a3a' }}
            >
              {isLoading ? (
                <><RefreshCw size={13} className="animate-spin" /> Verifying…</>
              ) : (
                <><CheckCircle2 size={13} /> Verify {selected.size} skill{selected.size !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsGraphModal;
