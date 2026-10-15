/**
 * components/ImportLinkedInModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Import from LinkedIn — two steps:
 *
 * STEP 1 — "input"   Pick one of three ways to bring in LinkedIn data
 *   • Paste text   — copy/paste straight from a LinkedIn profile
 *   • Upload PDF   — LinkedIn's instant "Save to PDF" export
 *   • Upload ZIP   — LinkedIn's full "Get a copy of your data" export
 *   All three are turned into plain text client-side (lib/linkedinImport.ts)
 *   then handed to onExtract, which calls the AI extraction endpoint.
 *
 * STEP 2 — "review"  Nothing is saved yet. Every proposed field/experience/
 *   skill is a checkbox the user can accept or skip, so an AI extraction
 *   mistake never silently overwrites something the user wrote themselves.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { User, Experience } from '../types';
import { extractPdfText, extractZipText, LinkedInExtraction } from '../lib/linkedinImport';

const GREEN    = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

interface Props {
  user: User;
  onExtract:      (rawText: string) => Promise<LinkedInExtraction>;
  onSaveProfile:  (updates: Record<string, any>) => Promise<void>;
  onImportSkills: (names: string[]) => Promise<void>;
  onClose:        () => void;
}

type InputTab = 'paste' | 'pdf' | 'zip';

const normalize = (s: string) => s.trim().toLowerCase();

function isDuplicateExperience(exp: { role: string; company: string; startDate: string }, existing: Experience[]): boolean {
  return existing.some(e =>
    normalize(e.company) === normalize(exp.company) &&
    normalize(e.role) === normalize(exp.role) &&
    normalize(e.startDate) === normalize(exp.startDate)
  );
}

const ImportLinkedInModal: React.FC<Props> = ({ user, onExtract, onSaveProfile, onImportSkills, onClose }) => {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [tab, setTab] = useState<InputTab>('paste');
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const [extraction, setExtraction] = useState<LinkedInExtraction | null>(null);
  const [acceptHeadline, setAcceptHeadline] = useState(false);
  const [acceptBio, setAcceptBio] = useState(false);
  const [acceptLocation, setAcceptLocation] = useState(false);
  const [acceptedExperiences, setAcceptedExperiences] = useState<Set<number>>(new Set());
  const [acceptedSkills, setAcceptedSkills] = useState<Set<string>>(new Set());

  const existingExperiences = user.experiences ?? [];
  const existingSkillNames = new Set(
    (user.skills ?? []).map((s: any) => normalize(typeof s === 'string' ? s : s.name))
  );

  function selectTab(next: InputTab) {
    setTab(next);
    setFile(null);
    setError('');
  }

  async function handleExtract() {
    setError('');
    setExtracting(true);
    try {
      let rawText = '';
      if (tab === 'paste') {
        rawText = pastedText.trim();
        if (!rawText) throw new Error('Paste some profile text first.');
      } else if (tab === 'pdf') {
        if (!file) throw new Error('Choose a PDF file first.');
        rawText = await extractPdfText(file);
      } else {
        if (!file) throw new Error('Choose a ZIP file first.');
        rawText = await extractZipText(file);
      }

      const result = await onExtract(rawText);

      setAcceptHeadline(!!result.headline && result.headline !== user.headline);
      setAcceptBio(!!result.bio && result.bio !== user.bio);
      setAcceptLocation(!!result.location && result.location !== (user as any).location);
      setAcceptedExperiences(new Set(
        result.experiences
          .map((exp, i) => (isDuplicateExperience(exp, existingExperiences) ? -1 : i))
          .filter(i => i >= 0)
      ));
      setAcceptedSkills(new Set(
        result.skills.filter(s => !existingSkillNames.has(normalize(s)))
      ));

      setExtraction(result);
      setStep('review');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setExtracting(false);
    }
  }

  function toggleExperience(i: number) {
    setAcceptedExperiences(s => {
      const next = new Set(s);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleSkill(name: string) {
    setAcceptedSkills(s => {
      const next = new Set(s);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const acceptedCount =
    (acceptHeadline ? 1 : 0) + (acceptBio ? 1 : 0) + (acceptLocation ? 1 : 0) +
    acceptedExperiences.size + acceptedSkills.size;

  async function handleApply() {
    if (!extraction) return;
    setError('');
    setApplying(true);
    try {
      const profileUpdates: Record<string, any> = {};
      if (acceptHeadline && extraction.headline) profileUpdates.headline = extraction.headline;
      if (acceptBio && extraction.bio) profileUpdates.bio = extraction.bio;
      if (acceptLocation && extraction.location) profileUpdates.location = extraction.location;

      const newExperiences: Experience[] = extraction.experiences
        .map((exp, i) => ({ exp, i }))
        .filter(({ i }) => acceptedExperiences.has(i))
        .map(({ exp, i }) => ({
          id:        `${Date.now()}-${i}`,
          role:      exp.role,
          company:   exp.company,
          startDate: exp.startDate,
          endDate:   exp.endDate,
          outcomes:  exp.outcomes.length ? exp.outcomes : [''],
        }));
      if (newExperiences.length > 0) {
        profileUpdates.experiences = [...existingExperiences, ...newExperiences];
      }

      if (Object.keys(profileUpdates).length > 0) {
        await onSaveProfile(profileUpdates);
      }

      const skillsToAdd = extraction.skills.filter(s => acceptedSkills.has(s));
      if (skillsToAdd.length > 0) {
        await onImportSkills(skillsToAdd);
      }

      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save.');
    } finally {
      setApplying(false);
    }
  }

  const hasNothingToImport = extraction
    ? !extraction.headline && !extraction.bio && !extraction.location
      && extraction.experiences.length === 0 && extraction.skills.length === 0
    : false;

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
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: GREEN_LT }}>
                <svg className="w-5 h-5" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900">Import from LinkedIn</h2>
                <p className="text-xs text-stone-600">
                  {step === 'input' ? 'Bring in your experience and skills from your own LinkedIn data' : 'Review before anything is saved'}
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-stone-600 hover:text-stone-600 mt-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {step === 'input' && (
            <div className="flex border-b" style={{ borderColor: '#e7e5e4' }}>
              {([
                { id: 'paste', label: 'Paste text' },
                { id: 'pdf',   label: 'Upload PDF' },
                { id: 'zip',   label: 'Upload ZIP' },
              ] as const).map(t => (
                <button key={t.id} onClick={() => selectTab(t.id)}
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
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {step === 'input' && (
            <div className="space-y-4">
              {tab === 'paste' && (
                <div>
                  <textarea
                    value={pastedText}
                    onChange={e => setPastedText(e.target.value)}
                    placeholder="Copy your About and Experience sections from your LinkedIn profile and paste them here…"
                    rows={10}
                    className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2"
                    style={{ borderColor: '#e7e5e4' }}
                  />
                </div>
              )}

              {tab === 'pdf' && (
                <div className="space-y-3">
                  <p className="text-xs text-stone-600 leading-relaxed">
                    On your own LinkedIn profile, click the <strong>More</strong> button near your photo, then <strong>Save to PDF</strong>. It downloads instantly — no waiting.
                  </p>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm"
                  />
                  {file && <p className="text-xs text-stone-600">Selected: {file.name}</p>}
                </div>
              )}

              {tab === 'zip' && (
                <div className="space-y-3">
                  <p className="text-xs text-stone-600 leading-relaxed">
                    Go to LinkedIn <strong>Settings &amp; Privacy → Data privacy → Get a copy of your data</strong>, request the <strong>basic</strong> export, and upload the ZIP LinkedIn emails you. This usually takes LinkedIn 24–72 hours to prepare.
                  </p>
                  <input
                    type="file"
                    accept="application/zip,.zip"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm"
                  />
                  {file && <p className="text-xs text-stone-600">Selected: {file.name}</p>}
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {step === 'review' && extraction && (
            <div className="space-y-5">
              {hasNothingToImport ? (
                <p className="text-sm text-stone-600">Could not find any profile details to import. Try pasting more text, or a different export.</p>
              ) : (
                <>
                  {(extraction.headline || extraction.bio || extraction.location) && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">Profile details</p>
                      {extraction.headline && (
                        <label className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer" style={{ borderColor: '#e7e5e4' }}>
                          <input type="checkbox" checked={acceptHeadline} onChange={e => setAcceptHeadline(e.target.checked)} className="mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-stone-600">Headline</p>
                            <p className="text-sm text-stone-800">{extraction.headline}</p>
                          </div>
                        </label>
                      )}
                      {extraction.bio && (
                        <label className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer" style={{ borderColor: '#e7e5e4' }}>
                          <input type="checkbox" checked={acceptBio} onChange={e => setAcceptBio(e.target.checked)} className="mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-stone-600">Bio</p>
                            <p className="text-sm text-stone-800">{extraction.bio}</p>
                          </div>
                        </label>
                      )}
                      {extraction.location && (
                        <label className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer" style={{ borderColor: '#e7e5e4' }}>
                          <input type="checkbox" checked={acceptLocation} onChange={e => setAcceptLocation(e.target.checked)} className="mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-stone-600">Location</p>
                            <p className="text-sm text-stone-800">{extraction.location}</p>
                          </div>
                        </label>
                      )}
                    </div>
                  )}

                  {extraction.experiences.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">
                        Experience ({extraction.experiences.length})
                      </p>
                      {extraction.experiences.map((exp, i) => {
                        const duplicate = isDuplicateExperience(exp, existingExperiences);
                        return (
                          <label key={i} className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer" style={{ borderColor: '#e7e5e4' }}>
                            <input type="checkbox" checked={acceptedExperiences.has(i)} onChange={() => toggleExperience(i)} className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-stone-800">{exp.role} · {exp.company}</p>
                                {duplicate && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                                    Possible duplicate
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-stone-600">{exp.startDate} – {exp.endDate || 'Present'}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {extraction.skills.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">
                        Skills ({extraction.skills.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {extraction.skills.map(name => {
                          const already = existingSkillNames.has(normalize(name));
                          const active = acceptedSkills.has(name);
                          return (
                            <button key={name} onClick={() => !already && toggleSkill(name)} disabled={already}
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors disabled:opacity-50"
                              style={active
                                ? { backgroundColor: GREEN_LT, color: 'var(--bw-green-mid)', borderColor: GREEN }
                                : { backgroundColor: 'transparent', color: '#57534e', borderColor: '#e7e5e4' }}>
                              {name}{already ? ' (already added)' : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: '#e7e5e4' }}>
          <button
            onClick={step === 'review' ? () => { setStep('input'); setExtraction(null); } : onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-stone-50 transition-colors"
            style={{ borderColor: '#e7e5e4', color: '#374151' }}>
            {step === 'review' ? 'Back' : 'Cancel'}
          </button>

          {step === 'input' ? (
            <button onClick={handleExtract} disabled={extracting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: GREEN }}>
              {extracting && <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>}
              {extracting ? 'Reading…' : 'Extract'}
            </button>
          ) : (
            <button onClick={handleApply} disabled={applying || acceptedCount === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: GREEN }}>
              {applying && <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>}
              {applying ? 'Saving…' : `Apply ${acceptedCount > 0 ? acceptedCount : ''}`.trim()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportLinkedInModal;
