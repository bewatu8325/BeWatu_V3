/**
 * components/profile/ProfileImportReview.tsx
 *
 * Shared review-and-apply step for both Import from LinkedIn and Import
 * from Resume: nothing is saved yet. Every proposed field/experience/skill
 * is a checkbox the user can accept or skip, so an AI extraction mistake
 * never silently overwrites something the user wrote themselves. Pulled
 * out of ImportLinkedInModal.tsx when resume import was added, since both
 * flows need this exact same screen once they have an extraction result —
 * only how they got there (paste/PDF/ZIP vs. an already-uploaded resume)
 * differs.
 */

import React, { useState } from 'react';
import { User, Experience } from '../../types';
import { ProfileExtraction } from '../../lib/profileImport';

const GREEN    = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

interface Props {
  user: User;
  extraction: ProfileExtraction;
  onSaveProfile: (updates: Record<string, any>) => Promise<void>;
  /** Shown as the footer's left button. Omit to show nothing (e.g. when there is no separate input step to go back to). */
  onBack?: () => void;
  backLabel?: string;
  /** Called after a successful Apply. */
  onDone: () => void;
}

const normalize = (s: string) => s.trim().toLowerCase();

function isDuplicateExperience(exp: { role: string; company: string; startDate: string }, existing: Experience[]): boolean {
  return existing.some(e =>
    normalize(e.company) === normalize(exp.company) &&
    normalize(e.role) === normalize(exp.role) &&
    normalize(e.startDate) === normalize(exp.startDate)
  );
}

const ProfileImportReview: React.FC<Props> = ({ user, extraction, onSaveProfile, onBack, backLabel, onDone }) => {
  const existingExperiences = user.experiences ?? [];
  const existingSkillNames = new Set(
    (user.skills ?? []).map((s: any) => normalize(typeof s === 'string' ? s : s.name))
  );

  const [acceptHeadline, setAcceptHeadline] = useState(!!extraction.headline && extraction.headline !== user.headline);
  const [acceptBio, setAcceptBio] = useState(!!extraction.bio && extraction.bio !== user.bio);
  const [acceptLocation, setAcceptLocation] = useState(!!extraction.location && extraction.location !== (user as any).location);
  const [acceptedExperiences, setAcceptedExperiences] = useState<Set<number>>(new Set(
    extraction.experiences
      .map((exp, i) => (isDuplicateExperience(exp, existingExperiences) ? -1 : i))
      .filter(i => i >= 0)
  ));
  const [acceptedSkills, setAcceptedSkills] = useState<Set<string>>(new Set(
    extraction.skills.filter(s => !existingSkillNames.has(normalize(s)))
  ));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

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

      // Folded into the same onSaveProfile call rather than a separate
      // skills-only call — App.tsx's save handlers each merge onto their
      // own closed-over snapshot of currentUser, so two sequential calls
      // race and the second silently clobbers the first in local state
      // (Firestore itself stays correct either way, since each write only
      // ever touches its own fields there — this was a local-state-only
      // bug, confirmed earlier by reading the written document directly).
      // One call, one merge.
      const skillsToAdd = extraction.skills.filter(s => acceptedSkills.has(s));
      if (skillsToAdd.length > 0) {
        const existingSkills: any[] = user.skills ?? [];
        profileUpdates.skills = [...existingSkills, ...skillsToAdd.map(name => ({ name, endorsements: 0 }))];
      }

      if (Object.keys(profileUpdates).length > 0) {
        await onSaveProfile(profileUpdates);
      }

      onDone();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save.');
    } finally {
      setApplying(false);
    }
  }

  const hasNothingToImport =
    !extraction.headline && !extraction.bio && !extraction.location
    && extraction.experiences.length === 0 && extraction.skills.length === 0;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-5">
          {hasNothingToImport ? (
            <p className="text-sm text-stone-600">Could not find any profile details to import. Try a different file, or paste the text directly.</p>
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
      </div>

      <div className="px-6 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: '#e7e5e4' }}>
        {onBack ? (
          <button onClick={onBack}
            className="px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-stone-50 transition-colors"
            style={{ borderColor: '#e7e5e4', color: '#374151' }}>
            {backLabel ?? 'Back'}
          </button>
        ) : <span />}

        <button onClick={handleApply} disabled={applying || acceptedCount === 0}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: GREEN }}>
          {applying && <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>}
          {applying ? 'Saving…' : `Apply ${acceptedCount > 0 ? acceptedCount : ''}`.trim()}
        </button>
      </div>
    </>
  );
};

export default ProfileImportReview;
