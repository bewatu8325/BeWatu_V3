/**
 * components/SkillsGraphModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Skills verification modal — "Based on what you've built, not what you've claimed"
 *
 * TWO TABS:
 * 1. Platform activity — AI-detected skills from BeWatu activity (→ verifiedSkills)
 * 2. Peer endorsements — skills endorsed by connections (→ verifiedSkills)
 *
 * "Add a skill manually" → goes to userAddedSkills (NOT verifiedSkills)
 * Manual skills are self-reported and require peer endorsement to become verified.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { User } from '../types';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface Props {
  currentUser: User;
  onSubmit: (resume: string, digitalFootprint: string, references: string) => Promise<void>;
  onAddUserSkill?: (skillName: string) => Promise<void>;
  onClose: () => void;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  arena:   { label: 'Arena challenge', color: '#92400e', bg: '#fef3c7', icon: '🏆' },
  reel:    { label: 'Prove reel',       color: '#5b21b6', bg: '#ede9fe', icon: '📹' },
  idea:    { label: 'Idea / project',   color: '#1e40af', bg: '#dbeafe', icon: '💡' },
  profile: { label: 'Profile',          color: '#065f46', bg: '#d1fae5', icon: '⭐' },
};

const SkillsGraphModal: React.FC<Props> = ({ currentUser, onSubmit, onAddUserSkill, onClose }) => {
  const [tab,            setTab]           = useState<'activity' | 'peers'>('activity');
  const [activitySkills, setActivitySkills] = useState<any[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [manualSkill,    setManualSkill]    = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [addingManual,   setAddingManual]   = useState(false);
  const [resume,         setResume]         = useState('');
  const [digitalFP,      setDigitalFP]      = useState('');
  const [references,     setReferences]     = useState('');
  const [showAdvanced,   setShowAdvanced]   = useState(false);

  // Load activity-derived skill signals from user's existing skills/posts
  useEffect(() => {
    const skills: any[] = [];

    // Derive from existing platform skills
    (currentUser.skills ?? []).forEach((s: any) => {
      const name = typeof s === 'string' ? s : s.name;
      if (name) skills.push({ name, source: 'profile', endorsements: s.endorsements ?? 0 });
    });

    setActivitySkills(skills);
  }, [currentUser.id]);

  const toggleSkill = (name: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAddManual = async () => {
    const trimmed = manualSkill.trim();
    if (!trimmed) return;
    setAddingManual(true);
    try {
      // Manual skills → userAddedSkills (self-reported, NOT verified)
      if (onAddUserSkill) await onAddUserSkill(trimmed);
      setManualSkill('');
    } finally {
      setAddingManual(false);
    }
  };

  const handleVerify = async () => {
    if (selectedSkills.size === 0) return;
    setSubmitting(true);
    try {
      // Build context from selected skills for Claude analysis
      const skillList = Array.from(selectedSkills).join(', ');
      await onSubmit(
        resume || `Skills to verify: ${skillList}`,
        digitalFP,
        references
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: GREEN_LT }}>
              <svg className="w-6 h-6" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-stone-900">Verify your skills</h2>
              <p className="text-sm text-stone-500">Based on what you've built, not what you've claimed</p>
            </div>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors mt-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b mt-5" style={{ borderColor: '#e7e5e4' }}>
            {[
              { id: 'activity', label: 'Platform activity', icon: '⚡' },
              { id: 'peers',    label: 'Peer endorsements', icon: '👤' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-colors"
                style={{
                  color: tab === t.id ? GREEN : '#78716c',
                  borderBottom: tab === t.id ? `2px solid ${GREEN}` : '2px solid transparent',
                  marginBottom: -1,
                }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {tab === 'activity' && (
            <>
              <p className="text-sm text-stone-600">
                These skills were found in your BeWatu activity. Select the ones you want to verify — they'll appear with a badge on your profile.
              </p>

              {/* Source legend */}
              <div className="flex flex-wrap gap-2">
                {Object.values(SOURCE_LABELS).map(s => (
                  <span key={s.label} className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>
                    {s.icon} {s.label}
                  </span>
                ))}
              </div>

              {/* Skill signals */}
              {activitySkills.length > 0 ? (
                <div className="space-y-2">
                  {activitySkills.map(skill => (
                    <button
                      key={skill.name}
                      onClick={() => toggleSkill(skill.name)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                      style={{
                        borderColor: selectedSkills.has(skill.name) ? GREEN : '#e7e5e4',
                        backgroundColor: selectedSkills.has(skill.name) ? GREEN_LT : 'transparent',
                      }}>
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-stone-800">{skill.name}</span>
                        {skill.endorsements > 0 && (
                          <span className="ml-2 text-xs text-stone-400">{skill.endorsements} endorsements</span>
                        )}
                      </div>
                      {selectedSkills.has(skill.name) && (
                        <svg className="w-4 h-4 flex-shrink-0" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="w-8 h-8 mx-auto mb-2 text-stone-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-sm font-semibold text-stone-500">No activity signals found yet.</p>
                  <p className="text-xs text-stone-400 mt-1">Post ideas, submit arena solutions, or upload a reel to generate skill signals.</p>
                </div>
              )}

              {/* Advanced: paste resume for Claude analysis */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs font-semibold flex items-center gap-1 transition-colors"
                  style={{ color: GREEN }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={showAdvanced ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"} />
                  </svg>
                  Add context for better results (resume, bio, references)
                </button>
                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <textarea
                      value={resume}
                      onChange={e => setResume(e.target.value)}
                      placeholder="Paste your resume or work history…"
                      rows={4}
                      className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2"
                      style={{ borderColor: '#e7e5e4' }}
                    />
                    <textarea
                      value={digitalFP}
                      onChange={e => setDigitalFP(e.target.value)}
                      placeholder="Links to your work (GitHub, portfolio, articles)…"
                      rows={2}
                      className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2"
                      style={{ borderColor: '#e7e5e4' }}
                    />
                    <textarea
                      value={references}
                      onChange={e => setReferences(e.target.value)}
                      placeholder="Testimonials or reference text…"
                      rows={2}
                      className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2"
                      style={{ borderColor: '#e7e5e4' }}
                    />
                  </div>
                )}
              </div>

              {/* Manual add — goes to userAddedSkills, NOT verifiedSkills */}
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Add a skill manually</p>
                <p className="text-xs text-stone-400 mb-3">
                  Manually added skills appear as <strong>self-reported</strong> on your profile. They need a peer endorsement to become verified.
                </p>
                <div className="flex gap-2">
                  <input
                    value={manualSkill}
                    onChange={e => setManualSkill(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                    placeholder="e.g. System Design"
                    className="flex-1 text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2"
                    style={{ borderColor: '#e7e5e4' }}
                  />
                  <button
                    onClick={handleAddManual}
                    disabled={!manualSkill.trim() || addingManual}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-stone-50 transition-colors disabled:opacity-40"
                    style={{ borderColor: '#e7e5e4', color: '#374151' }}>
                    {addingManual ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                      </svg>
                    ) : '+ Add'}
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'peers' && (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: GREEN_LT }}>
                <svg className="w-7 h-7" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-stone-800 mb-2">Peer endorsements coming soon</h3>
              <p className="text-sm text-stone-400 max-w-xs mx-auto">
                Your connections will be able to endorse your skills directly from your profile. Endorsed skills appear with a verified badge.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: '#e7e5e4' }}>
          <p className="text-xs text-stone-400">
            {selectedSkills.size === 0
              ? '0 skills selected for verification'
              : `${selectedSkills.size} skill${selectedSkills.size > 1 ? 's' : ''} selected for verification`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-stone-50 transition-colors"
              style={{ borderColor: '#e7e5e4', color: '#374151' }}>
              Cancel
            </button>
            <button
              onClick={handleVerify}
              disabled={selectedSkills.size === 0 || submitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: GREEN }}>
              {submitting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              )}
              Verify {selectedSkills.size} skill{selectedSkills.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsGraphModal;
