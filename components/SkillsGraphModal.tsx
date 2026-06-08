/**
 * components/SkillsGraphModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Skills modal — two clearly separated concerns:
 *
 * TAB 1 — "My Skills"  (self-reported, always visible on profile)
 *   • Shows current skills list with remove (×) per skill
 *   • Input to type + stage new skills INSIDE the modal before committing
 *   • Staged skills render immediately as chips within the modal
 *   • ONE confirm action "Save [N] skills" writes all staged at once
 *   • No per-skill Firestore writes while the modal is open
 *
 * TAB 2 — "Verify skills"  (AI evidence-based, shown with verified badge)
 *   • Lists unverified skills as candidates for verification
 *   • Evidence sources: platform context, optional resume / links / testimonials
 *   • Clear disclaimer: verified = evidence shown, not a substitute for due diligence
 *   • "Generate verified skills" → calls onSubmit → writes verifiedSkills
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface Props {
  currentUser: User;
  onSubmit:          (resume: string, digitalFootprint: string, references: string) => Promise<void>;
  onSaveUserSkills:  (newSkills: string[]) => Promise<void>;
  onRemoveUserSkill: (skillName: string) => Promise<void>;
  onClose:           () => void;
}

const SkillsGraphModal: React.FC<Props> = ({
  currentUser, onSubmit, onSaveUserSkills, onRemoveUserSkill, onClose,
}) => {
  const [tab, setTab] = useState<'manage' | 'verify'>('manage');

  // ── Tab 1 state ─────────────────────────────────────────────────────────
  const [input, setInput]       = useState('');
  const [staged, setStaged]     = useState<string[]>([]);  // not yet saved
  const [saving, setSaving]     = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);

  // ── Tab 2 state ─────────────────────────────────────────────────────────
  const [resume, setResume]         = useState('');
  const [digitalFP, setDigitalFP]   = useState('');
  const [references, setReferences] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentSkills: string[] = (currentUser.skills ?? []).map((s: any) =>
    typeof s === 'string' ? s : s.name
  );
  const verifiedNames = new Set(
    (currentUser.verifiedSkills ?? []).map((s: any) => (s.name ?? '').toLowerCase())
  );
  const unverifiedSkills = currentSkills.filter(n => !verifiedNames.has(n.toLowerCase()));

  // ── Tab 1 handlers ───────────────────────────────────────────────────────

  function stageSkill() {
    const trimmed = input.trim();
    if (!trimmed) return;
    const alreadyExists = currentSkills.some(s => s.toLowerCase() === trimmed.toLowerCase());
    const alreadyStaged = staged.some(s => s.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyExists && !alreadyStaged) {
      setStaged(s => [...s, trimmed]);
    }
    setInput('');
    inputRef.current?.focus();
  }

  function unstage(name: string) {
    setStaged(s => s.filter(x => x.toLowerCase() !== name.toLowerCase()));
  }

  async function handleSave() {
    if (staged.length === 0) return;
    setSaving(true);
    try {
      await onSaveUserSkills(staged);
      setStaged([]);
    } finally {
      setSaving(false);
    }
  }

  // ── Tab 2 handlers ───────────────────────────────────────────────────────

  async function handleVerify() {
    setSubmitting(true);
    try {
      await onSubmit(resume, digitalFP, references);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: GREEN_LT }}>
                <svg className="w-5 h-5" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900">Skills</h2>
                <p className="text-xs text-stone-400">Add your skills or request evidence-based verification</p>
              </div>
            </div>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 mt-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab strip */}
          <div className="flex border-b" style={{ borderColor: '#e7e5e4' }}>
            {[
              { id: 'manage', label: 'My Skills' },
              { id: 'verify', label: 'Verify skills' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className="px-4 py-2.5 text-sm font-semibold transition-colors"
                style={{
                  color: tab === t.id ? GREEN : '#78716c',
                  borderBottom: tab === t.id ? `2px solid ${GREEN}` : '2px solid transparent',
                  marginBottom: -1,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Tab 1: My Skills ── */}
          {tab === 'manage' && (
            <div className="space-y-5">

              {/* Current skills */}
              {currentSkills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                    Your skills ({currentSkills.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentSkills.map(name => (
                      <span key={name} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border"
                        style={{ backgroundColor: verifiedNames.has(name.toLowerCase()) ? GREEN_LT : '#f5f5f4', color: verifiedNames.has(name.toLowerCase()) ? '#1a6b52' : '#44403c', borderColor: verifiedNames.has(name.toLowerCase()) ? '#1a6b52' : '#d6d3d1' }}>
                        {verifiedNames.has(name.toLowerCase()) && (
                          <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {name}
                        <button onClick={() => onRemoveUserSkill(name)}
                          className="ml-0.5 flex-shrink-0 text-stone-400 hover:text-red-500 transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Staged (not yet saved) */}
              {staged.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: GREEN }}>
                    Ready to add ({staged.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {staged.map(name => (
                      <span key={name} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border-2"
                        style={{ backgroundColor: '#fefce8', color: '#713f12', borderColor: '#fbbf24' }}>
                        {name}
                        <button onClick={() => unstage(name)}
                          className="ml-0.5 flex-shrink-0 text-amber-400 hover:text-red-500 transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                  Add a skill
                </p>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); stageSkill(); } }}
                    placeholder="e.g. System design, Figma, Python…"
                    className="flex-1 text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2"
                    style={{ borderColor: '#e7e5e4' }}
                    autoFocus
                  />
                  <button onClick={stageSkill} disabled={!input.trim()}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-40"
                    style={{ borderColor: '#e7e5e4', color: '#374151' }}>
                    Add
                  </button>
                </div>
                <p className="text-xs text-stone-400 mt-1.5">Press Enter or click Add. Skills appear here before saving.</p>
              </div>

              {/* Empty state */}
              {currentSkills.length === 0 && staged.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-stone-400">No skills yet. Add your first skill above.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab 2: Verify skills ── */}
          {tab === 'verify' && (
            <div className="space-y-5">

              {/* Disclaimer */}
              <div className="flex gap-3 rounded-xl p-3 border" style={{ backgroundColor: '#fffbeb', borderColor: '#fef08a' }}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>What "verified" means:</strong> BeWatu has reviewed evidence you've provided towards this skill — your AI workflows, learning logs, resume, and platform activity. It is <strong>not</strong> a certification, examination, or guarantee of proficiency. Employers and collaborators should conduct their own due diligence.
                </p>
              </div>

              {/* Skill candidates */}
              {unverifiedSkills.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                    Skills to verify ({unverifiedSkills.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unverifiedSkills.map(name => (
                      <span key={name} className="rounded-full px-3 py-1 text-sm font-medium border bg-stone-50 text-stone-700" style={{ borderColor: '#d6d3d1' }}>
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-stone-400 mt-2">All of the above will be considered. Evidence from your AI Workflows and Learning Log is included automatically.</p>
                </div>
              ) : currentSkills.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-stone-500">Add some skills in "My Skills" first.</p>
                </div>
              ) : (
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: GREEN_LT }}>
                  <p className="text-sm font-semibold" style={{ color: GREEN }}>All your skills are already verified ✓</p>
                </div>
              )}

              {/* Additional context (optional) */}
              <div>
                <button onClick={() => setShowContext(!showContext)}
                  className="text-xs font-semibold flex items-center gap-1 transition-colors"
                  style={{ color: GREEN }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={showContext ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"} />
                  </svg>
                  Add more context (resume, portfolio, testimonials)
                </button>
                {showContext && (
                  <div className="mt-3 space-y-3">
                    <textarea value={resume} onChange={e => setResume(e.target.value)}
                      placeholder="Paste your resume or work history…"
                      rows={3} className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
                    <textarea value={digitalFP} onChange={e => setDigitalFP(e.target.value)}
                      placeholder="Links to your work (GitHub, portfolio, articles)…"
                      rows={2} className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
                    <textarea value={references} onChange={e => setReferences(e.target.value)}
                      placeholder="Testimonials or reference text…"
                      rows={2} className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: '#e7e5e4' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-stone-50 transition-colors"
            style={{ borderColor: '#e7e5e4', color: '#374151' }}>
            {tab === 'manage' && staged.length === 0 ? 'Close' : 'Cancel'}
          </button>

          {tab === 'manage' ? (
            <button onClick={handleSave} disabled={staged.length === 0 || saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: GREEN }}>
              {saving
                ? <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              }
              Save {staged.length > 0 ? `${staged.length} skill${staged.length > 1 ? 's' : ''}` : 'skills'}
            </button>
          ) : (
            <button onClick={handleVerify} disabled={submitting || (currentSkills.length === 0)}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: GREEN }}>
              {submitting
                ? <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
              }
              Generate verified skills
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillsGraphModal;
