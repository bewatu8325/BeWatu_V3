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
import { User, Experience, Education } from '../../types';
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
  /** Called when the user closes the success screen after a completed Apply. */
  onDone: () => void;
  /** Used to phrase the "we could not find X" copy on the success screen — e.g. "LinkedIn data" or "resume". */
  sourceLabel?: string;
}

const normalize = (s: string) => s.trim().toLowerCase();

function isDuplicateExperience(exp: { role: string; company: string; startDate: string }, existing: Experience[]): boolean {
  return existing.some(e =>
    normalize(e.company) === normalize(exp.company) &&
    normalize(e.role) === normalize(exp.role) &&
    normalize(e.startDate) === normalize(exp.startDate)
  );
}

function isDuplicateEducation(edu: { institution: string; degree: string; startDate: string }, existing: Education[]): boolean {
  return existing.some(e =>
    normalize(e.institution) === normalize(edu.institution) &&
    normalize(e.degree) === normalize(edu.degree) &&
    normalize(e.startDate) === normalize(edu.startDate)
  );
}

const ProfileImportReview: React.FC<Props> = ({ user, extraction, onSaveProfile, onBack, backLabel, onDone, sourceLabel = 'import' }) => {
  const existingExperiences = user.experiences ?? [];
  const existingEducation = (user as any).education ?? [];
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
  const [acceptedEducation, setAcceptedEducation] = useState<Set<number>>(new Set(
    extraction.education
      .map((edu, i) => (isDuplicateEducation(edu, existingEducation) ? -1 : i))
      .filter(i => i >= 0)
  ));
  const [acceptedSkills, setAcceptedSkills] = useState<Set<string>>(new Set(
    extraction.skills.filter(s => !existingSkillNames.has(normalize(s)))
  ));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  // null = still on the review screen; set once Apply succeeds, to show a
  // real summary of what was added and what was not found, instead of just
  // closing the modal silently.
  const [applied, setApplied] = useState<string[] | null>(null);

  function toggleExperience(i: number) {
    setAcceptedExperiences(s => {
      const next = new Set(s);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleEducation(i: number) {
    setAcceptedEducation(s => {
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
    acceptedExperiences.size + acceptedEducation.size + acceptedSkills.size;

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

      const newEducation: Education[] = extraction.education
        .map((edu, i) => ({ edu, i }))
        .filter(({ i }) => acceptedEducation.has(i))
        .map(({ edu, i }) => ({
          id:          `${Date.now()}-edu-${i}`,
          institution: edu.institution,
          degree:      edu.degree,
          field:       edu.field,
          startDate:   edu.startDate,
          endDate:     edu.endDate,
        }));
      if (newEducation.length > 0) {
        profileUpdates.education = [...existingEducation, ...newEducation];
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

      const summary: string[] = [];
      if (acceptHeadline && extraction.headline) summary.push('Headline');
      if (acceptBio && extraction.bio) summary.push('Bio');
      if (acceptLocation && extraction.location) summary.push('Location');
      if (newExperiences.length > 0) summary.push(`${newExperiences.length} experience${newExperiences.length !== 1 ? 's' : ''}`);
      if (newEducation.length > 0) summary.push(`${newEducation.length} education entr${newEducation.length !== 1 ? 'ies' : 'y'}`);
      if (skillsToAdd.length > 0) summary.push(`${skillsToAdd.length} skill${skillsToAdd.length !== 1 ? 's' : ''}`);
      setApplied(summary);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save.');
    } finally {
      setApplying(false);
    }
  }

  const hasNothingToImport =
    !extraction.headline && !extraction.bio && !extraction.location
    && extraction.experiences.length === 0 && extraction.education.length === 0
    && extraction.skills.length === 0;

  // What the extraction never found at all, regardless of what the user
  // chose to accept — a real prompt to fill these in by hand rather than
  // just letting the modal close and leaving the gap invisible.
  const notFound: string[] = [];
  if (!extraction.headline) notFound.push('Headline');
  if (!extraction.bio) notFound.push('Bio');
  if (!extraction.location) notFound.push('Location');
  if (extraction.experiences.length === 0) notFound.push('Work experience');
  if (extraction.education.length === 0) notFound.push('Education');
  if (extraction.skills.length === 0) notFound.push('Skills');

  const username = (user as any).username as string | undefined;

  if (applied) {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: GREEN_LT }}>
              <svg className="w-4 h-4" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">Added to your profile</p>
              {applied.length > 0 ? (
                <ul className="mt-1 text-sm text-stone-600 list-disc list-inside">
                  {applied.map(label => <li key={label}>{label}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-stone-600">Nothing new — everything in this import already matched your profile.</p>
              )}
            </div>
          </div>

          {notFound.length > 0 && (
            <div className="rounded-xl border p-3" style={{ borderColor: '#e7e5e4' }}>
              <p className="text-sm font-medium text-stone-800">We could not find these in your {sourceLabel}</p>
              <p className="text-xs text-stone-600 mt-0.5 mb-2">Add them manually to complete your profile.</p>
              <ul className="text-sm text-stone-600 list-disc list-inside">
                {notFound.map(label => <li key={label}>{label}</li>)}
              </ul>
            </div>
          )}

          {username && (
            <a href={`https://www.bewatu.com/be/${username}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: GREEN }}>
              View your public profile
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </a>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end" style={{ borderColor: '#e7e5e4' }}>
          <button onClick={onDone}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: GREEN }}>
            Done
          </button>
        </div>
      </>
    );
  }

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

              {extraction.education.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">
                    Education ({extraction.education.length})
                  </p>
                  {extraction.education.map((edu, i) => {
                    const duplicate = isDuplicateEducation(edu, existingEducation);
                    return (
                      <label key={i} className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer" style={{ borderColor: '#e7e5e4' }}>
                        <input type="checkbox" checked={acceptedEducation.has(i)} onChange={() => toggleEducation(i)} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-stone-800">
                              {edu.institution}{edu.degree ? ` · ${edu.degree}` : ''}
                            </p>
                            {duplicate && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                                Possible duplicate
                              </span>
                            )}
                          </div>
                          {(edu.field || edu.startDate || edu.endDate) && (
                            <p className="text-xs text-stone-600">
                              {edu.field}{edu.field && (edu.startDate || edu.endDate) ? ' · ' : ''}
                              {edu.startDate}{edu.startDate && edu.endDate ? ' – ' : ''}{edu.endDate}
                            </p>
                          )}
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
