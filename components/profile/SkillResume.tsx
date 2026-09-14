/**
 * components/profile/SkillResume.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a skill-based resume from the user's existing profile data.
 * No new data entry — reuses name, headline, bio, skills, verifiedSkills,
 * experiences, careerArc, professionalGoals, values, availability, industry.
 *
 * Owner-only. Sits in the right column of ProfilePage below ExperienceSection.
 * Calls /api/claude (the existing working proxy — no SDK dependency).
 * Result is displayed inline and can be copied as plain text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface SkillResumeProps {
  user: {
    name: string;
    headline?: string;
    bio?: string;
    industry?: string;
    availability?: string;
    professionalGoals?: string[];
    values?: string[];
    skills?: any[];
    verifiedSkills?: any[];
    experiences?: any[];
    careerArc?: any[];
    [key: string]: any;
  };
  isOwn: boolean;
}

function buildPrompt(user: SkillResumeProps['user']): string {
  const skills = [
    ...(user.verifiedSkills ?? []).map((s: any) => `${typeof s === 'string' ? s : s.name} (verified)`),
    ...(user.skills ?? []).map((s: any) => typeof s === 'string' ? s : s.name).filter(Boolean),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const experiences = [
    ...(user.experiences ?? []),
    ...(user.careerArc ?? []),
  ].filter(Boolean);

  return `You are an expert resume writer specialising in skills-first, modern resume formats.
Write a professional, skills-based resume for the person below using ONLY the information provided.
Do not invent facts, titles, companies, or dates.

FORMAT:
- Start with a 2–3 sentence professional summary that highlights their value proposition.
- A "Core Skills" section listing skills in order of relevance, grouped by theme if there are 6+.
- An "Experience" section only if experiences are provided — list them chronologically.
- A "Professional Goals" section only if goals are provided.
- Do NOT include: photo placeholder, references, hobbies, or fictional content.
- Use clean plain text — no markdown headers (no ##), no asterisks. Use ALL-CAPS for section headings.
- Keep the whole resume under 500 words.

PERSON:
Name: ${user.name || 'Not provided'}
Headline: ${user.headline || 'Not provided'}
Industry: ${user.industry || 'Not provided'}
Availability: ${user.availability || 'Not provided'}
Bio: ${user.bio || 'Not provided'}
Skills: ${skills.length ? skills.join(', ') : 'Not provided'}
Professional goals: ${(user.professionalGoals ?? []).join('; ') || 'Not provided'}
Values: ${(user.values ?? []).join(', ') || 'Not provided'}
${experiences.length
  ? `Experiences:\n${experiences.map((e: any) =>
      `- ${e.role ?? e.title ?? 'Role'} at ${e.company ?? e.organisation ?? 'Company'}${e.period ?? e.duration ? ` (${e.period ?? e.duration})` : ''}${e.description ? ': ' + e.description : ''}`
    ).join('\n')}`
  : ''}

Write the resume now:`;
}

const SkillResume: React.FC<SkillResumeProps> = ({ user, isOwn }) => {
  const [resume,    setResume]    = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [copied,    setCopied]    = useState(false);
  const [expanded,  setExpanded]  = useState(false);

  if (!isOwn) return null;

  const hasEnoughData =
    user.name && (
      (user.skills?.length ?? 0) > 0 ||
      (user.verifiedSkills?.length ?? 0) > 0 ||
      user.bio ||
      (user.experiences?.length ?? 0) > 0
    );

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResume('');
    setExpanded(true);
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: 'You are an expert resume writer. Output plain text only — no markdown, no asterisks, no bullet symbols. Use ALL-CAPS for section headings.',
          prompt: buildPrompt(user),
          maxTokens: 900,
        }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setResume(data.text ?? '');
    } catch (err: any) {
      setError('Could not generate resume right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!resume) return;
    navigator.clipboard?.writeText(resume).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#f0efee' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white flex-shrink-0"
            style={{ backgroundColor: GREEN }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900">Skills-Based Resume</h3>
            <p className="text-xs text-stone-400">Generated from your profile — no extra input needed</p>
          </div>
        </div>

        {resume && (
          <button onClick={() => setExpanded(v => !v)}
            className="text-xs font-semibold hover:opacity-70 transition-opacity flex items-center gap-1"
            style={{ color: '#78716c' }}>
            {expanded ? 'Collapse' : 'Expand'}
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        {/* No data warning */}
        {!hasEnoughData && (
          <div className="rounded-xl p-3 mb-3 text-xs text-amber-700 flex items-start gap-2"
            style={{ backgroundColor: '#fef3c7' }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor"
              strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Add skills, a bio, or experience to get a more complete resume.
          </div>
        )}

        {/* Generate button */}
        {!resume && !loading && (
          <button onClick={handleGenerate} disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Generate resume from profile
          </button>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6">
            <svg className="w-5 h-5 animate-spin" style={{ color: GREEN }}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span className="text-sm text-stone-500">Writing your resume…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl p-3 text-sm text-red-600 flex items-center justify-between gap-3"
            style={{ backgroundColor: '#fef2f2' }}>
            <span>{error}</span>
            <button onClick={handleGenerate}
              className="text-xs font-semibold flex-shrink-0 underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        {/* Resume output */}
        {resume && expanded && (
          <div className="mt-1">
            <pre className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap font-sans p-4 rounded-xl"
              style={{ backgroundColor: '#fafaf9', border: '1px solid #f0efee' }}>
              {resume}
            </pre>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              <button onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: GREEN }}>
                {copied ? (
                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg> Copied!</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg> Copy text</>
                )}
              </button>
              <button onClick={handleGenerate}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#e7e5e4', color: '#44403c' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Regenerate
              </button>
              <p className="text-[11px] text-stone-400 ml-auto">
                Based on your current profile
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillResume;
