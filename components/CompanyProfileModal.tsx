/**
 * CompanyProfileModal — full-screen overlay for company profiles
 *
 * Features:
 *  - Follow / Unfollow company
 *  - View company challenges with skill-match highlighting
 *  - Post challenge (company owners/recruiters)
 *  - Submit to challenges inline
 *  - Info banner explaining skill challenge flow
 */
import React, { useState, useEffect } from 'react';
import {
  X, Building2, Globe, Zap, Plus, Clock,
  CheckCircle, Star, Send, Bookmark, Trophy, ArrowLeft, Loader2,
  Eye, EyeOff, Sword, Info, BookOpen, Target, ChevronDown,
  UserPlus, Briefcase, Calendar, MessageSquare, Gift, Link2,
  AlertCircle, Check, MoreHorizontal,
} from 'lucide-react';
import { Company, Job } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  followCompany,
  unfollowCompany,
  getChallengesForCompany,
  createSkillChallenge,
  submitSkillChallenge,
  updateSubmissionStatus,
  getChallengeSubmissions,
  scoreSubmission,
  shortlistSubmission,
  saveSubmissionToTalentPool,
  linkSubmissionToJob,
  sendChallengeOutreach,
  proposeInterviewFromChallenge,
  sendRoleOffer,
  fetchOutreachTemplates,
  fetchJobsForRecruiter,
  type ChallengeDifficulty,
  type ChallengeType,
} from '../lib/firestoreService';

const GREEN     = '#1a4a3a';
const GREEN_MID = '#1a6b52';
const GREEN_LT  = '#e8f4f0';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(val: any): string {
  try {
    const d = val?.toDate ? val.toDate() : new Date(val);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  submitted:    { label: 'Submitted',    color: '#0369a1', bg: '#e0f2fe' },
  under_review: { label: 'Under Review', color: '#b45309', bg: '#fef3c7' },
  scored:       { label: 'Scored',       color: '#7c3aed', bg: '#f3f0ff' },
  shortlisted:  { label: 'Shortlisted',  color: GREEN,     bg: GREEN_LT  },
  invited:      { label: 'Invited!',     color: '#059669', bg: '#d1fae5' },
  not_selected: { label: 'Not selected', color: '#78716c', bg: '#f5f5f4' },
};

const DIFF_META: Record<string, { label: string; color: string }> = {
  entry:  { label: 'Entry',  color: '#059669' },
  mid:    { label: 'Mid',    color: '#0369a1' },
  senior: { label: 'Senior', color: '#7c3aed' },
};

const TYPE_META: Record<string, { label: string; gradient: string }> = {
  code:     { label: 'Code',     gradient: 'from-blue-500/15 to-purple-500/10'  },
  design:   { label: 'Design',   gradient: 'from-pink-500/15 to-orange-500/10'  },
  strategy: { label: 'Strategy', gradient: 'from-cyan-500/15 to-teal-500/10'    },
  writing:  { label: 'Writing',  gradient: 'from-amber-500/15 to-yellow-500/10' },
  data:     { label: 'Data',     gradient: 'from-emerald-500/15 to-green-500/10'},
};

const CHALLENGE_TYPES = ['code','design','strategy','writing','data'] as const;
const CHALLENGE_DIFFS = ['entry','mid','senior'] as const;
const SUBMISSION_FORMATS = ['text','url','file','video'] as const;

// ─── Input helpers ────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 placeholder:text-stone-400';
const focusStyle = { '--tw-ring-color': GREEN } as React.CSSProperties;

// ─── Create Challenge Sheet ───────────────────────────────────────────────────
function CreateChallengeSheet({
  company, linkedJobId, onClose, onCreated,
}: {
  company: Company;
  linkedJobId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { fbUser } = useFirebase();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Step 1: basics
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [targetedSkill, setTargetedSkill] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills]         = useState<string[]>([]);
  const [type, setType]             = useState<ChallengeType>('code');
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>('entry');

  // Step 2: details
  const [instructions, setInstructions] = useState('');
  const [timeLimit, setTimeLimit]       = useState(60);
  const [dueDate, setDueDate]           = useState('');
  const [submissionFormat, setSubmissionFormat] = useState<'text' | 'url' | 'file' | 'video'>('text');
  const [daysUntilExpiry, setDaysUntilExpiry] = useState(14);

  // Step 3: rubric + reward
  const [rubric, setRubric] = useState([
    { label: 'Technical accuracy', weight: 40, description: '' },
    { label: 'Clarity', weight: 30, description: '' },
    { label: 'Creativity', weight: 30, description: '' },
  ]);
  const [credits, setCredits] = useState(50);
  const [badge, setBadge]     = useState('');

  function addSkill() {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) { setSkills(p => [...p, s]); setSkillInput(''); }
  }

  function updateRubric(i: number, field: 'label' | 'weight' | 'description', val: string | number) {
    setRubric(r => r.map((x, j) => j === i ? { ...x, [field]: val } : x));
  }

  function addRubricRow() {
    setRubric(r => [...r, { label: '', weight: 0, description: '' }]);
  }

  async function handlePublish() {
    if (!fbUser) return;
    setError(''); setBusy(true);
    try {
      const total = rubric.reduce((s, r) => s + Number(r.weight), 0);
      if (total !== 100) { setError('Rubric weights must sum to 100%'); setBusy(false); return; }
      await createSkillChallenge({
        title, description, instructions,
        companyId: company._firestoreId,
        companyName: company.name,
        companyLogoUrl: company.logoUrl,
        recruiterId: fbUser.uid,
        targetedSkill,
        skills: skills.includes(targetedSkill) ? skills : [targetedSkill, ...skills],
        difficulty, type, timeLimit,
        dueDate: dueDate || undefined,
        submissionFormat,
        scoringRubric: rubric.map(r => ({ ...r, weight: Number(r.weight) })),
        linkedJobId,
        reward: { credits, badge: badge || `${title} Champion`, visibility: true },
        expiresAt: new Date(Date.now() + daysUntilExpiry * 86400000).toISOString(),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to publish challenge');
    } finally {
      setBusy(false);
    }
  }

  const canNext1 = title.trim() && description.trim() && targetedSkill.trim();
  const canNext2 = instructions.trim();

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-t-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>

        {/* Step header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: '#e7e5e4' }}>
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)} className="p-1 rounded-lg hover:bg-stone-100">
              <ArrowLeft className="w-4 h-4 text-stone-600" />
            </button>
          )}
          <div className="flex-1">
            <h2 className="font-black text-stone-900 text-base">
              {step === 1 ? 'New Skill Challenge' : step === 2 ? 'Details & Format' : 'Scoring & Reward'}
            </h2>
            <p className="text-xs text-stone-400">Step {step} of 3</p>
          </div>
          {/* Step dots */}
          <div className="flex gap-1.5">
            {[1,2,3].map(n => (
              <div key={n} className="h-2 w-2 rounded-full" style={{ background: n <= step ? GREEN : '#e7e5e4' }} />
            ))}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100">
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-600">{error}</div>}

          {/* ── Step 1 ── */}
          {step === 1 && (
            <>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Title</label>
                <input className={inputCls} style={focusStyle} placeholder="e.g. Build a responsive dashboard" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Description</label>
                <textarea className={inputCls} style={focusStyle} rows={3} placeholder="What participants need to build, solve, or create..." value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Primary skill being tested <span className="text-red-400">*</span></label>
                <input className={inputCls} style={focusStyle} placeholder="e.g. React, Product Strategy, Copywriting" value={targetedSkill} onChange={e => setTargetedSkill(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Additional skills</label>
                <div className="flex gap-2">
                  <input className={`${inputCls} flex-1`} style={focusStyle} placeholder="Add skill" value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())} />
                  <button onClick={addSkill} className="px-3 rounded-xl text-xs font-bold text-white" style={{ background: GREEN }}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {skills.map(s => (
                      <span key={s} className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: GREEN_LT, color: GREEN }}>
                        {s}
                        <button onClick={() => setSkills(p => p.filter(x => x !== s))}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Type</label>
                  <select className={inputCls} style={focusStyle} value={type} onChange={e => setType(e.target.value as ChallengeType)}>
                    {CHALLENGE_TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Level</label>
                  <select className={inputCls} style={focusStyle} value={difficulty} onChange={e => setDifficulty(e.target.value as ChallengeDifficulty)}>
                    {CHALLENGE_DIFFS.map(d => <option key={d} value={d}>{DIFF_META[d].label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Instructions</label>
                <textarea className={inputCls} style={focusStyle} rows={5} placeholder="Step-by-step instructions for participants..." value={instructions} onChange={e => setInstructions(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Time limit (min)</label>
                  <input type="number" min={15} max={480} className={inputCls} style={focusStyle} value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Due date (optional)</label>
                  <input type="date" className={inputCls} style={focusStyle} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Submission format</label>
                <div className="grid grid-cols-4 gap-2">
                  {SUBMISSION_FORMATS.map(fmt => (
                    <button key={fmt} onClick={() => setSubmissionFormat(fmt as any)}
                      className="rounded-xl border-2 py-2 text-xs font-bold capitalize transition-all"
                      style={{ borderColor: submissionFormat === fmt ? GREEN : '#e7e5e4', color: submissionFormat === fmt ? GREEN : '#78716c', background: submissionFormat === fmt ? GREEN_LT : 'white' }}>
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Challenge expires in (days)</label>
                <input type="number" min={1} max={90} className={inputCls} style={focusStyle} value={daysUntilExpiry} onChange={e => setDaysUntilExpiry(Number(e.target.value))} />
              </div>
            </>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Scoring rubric</label>
                  <span className="text-xs font-bold" style={{ color: rubric.reduce((s, r) => s + Number(r.weight), 0) === 100 ? GREEN : '#ef4444' }}>
                    Total: {rubric.reduce((s, r) => s + Number(r.weight), 0)}%
                  </span>
                </div>
                <div className="space-y-2">
                  {rubric.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-2 p-3 rounded-xl border" style={{ borderColor: '#e7e5e4' }}>
                      <div className="space-y-1.5">
                        <input className={inputCls} style={focusStyle} placeholder="Criterion label" value={row.label} onChange={e => updateRubric(i, 'label', e.target.value)} />
                        <input className={`${inputCls} text-xs`} style={focusStyle} placeholder="Description (optional)" value={row.description} onChange={e => updateRubric(i, 'description', e.target.value)} />
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} className="w-16 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5 text-sm text-center font-bold focus:outline-none" value={row.weight} onChange={e => updateRubric(i, 'weight', e.target.value)} />
                        <span className="text-xs text-stone-400">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addRubricRow} className="mt-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: GREEN }}>
                  <Plus className="w-3.5 h-3.5" /> Add criterion
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Credits reward</label>
                  <input type="number" min={0} className={inputCls} style={focusStyle} value={credits} onChange={e => setCredits(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Badge name</label>
                  <input className={inputCls} style={focusStyle} placeholder="Auto-generated" value={badge} onChange={e => setBadge(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 border-t flex-shrink-0" style={{ borderColor: '#f5f5f4' }}>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
              disabled={step === 1 ? !canNext1 : !canNext2}
              className="w-full py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
              style={{ background: GREEN }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={busy}
              className="w-full py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
              style={{ background: GREEN }}
            >
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : '🚀 Publish Challenge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Submit Challenge Sheet ───────────────────────────────────────────────────
function SubmitChallengeSheet({
  challenge, onClose, onSubmitted,
}: {
  challenge: any;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { currentUser, fbUser } = useFirebase();
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const format: string = challenge.submissionFormat ?? 'text';

  async function handleSubmit() {
    if (!fbUser || !currentUser || !content.trim()) return;
    setBusy(true);
    try {
      await submitSkillChallenge(challenge.id, {
        userId: fbUser.uid,
        userName: currentUser.name,
        userAvatar: currentUser.avatarUrl,
        content: content.trim(),
        format: format as any,
      });
      onSubmitted();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-stone-200" /></div>
        <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: '#e7e5e4' }}>
          <div className="flex-1">
            <h2 className="font-black text-stone-900 text-base">Submit your response</h2>
            <p className="text-xs text-stone-400">{challenge.title}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Instructions recap */}
          {challenge.instructions && (
            <div className="rounded-xl p-4 border" style={{ background: GREEN_LT, borderColor: '#b6ddd2' }}>
              <p className="text-xs font-bold mb-1" style={{ color: GREEN }}>Instructions</p>
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{challenge.instructions}</p>
            </div>
          )}

          {/* Scoring rubric preview */}
          {challenge.scoringRubric?.length > 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: '#e7e5e4' }}>
              <p className="text-xs font-bold text-stone-500 mb-2 uppercase tracking-wider">Scoring rubric</p>
              <div className="space-y-1.5">
                {challenge.scoringRubric.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-stone-700">{r.label}</span>
                    <span className="font-bold text-xs" style={{ color: GREEN }}>{r.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-600">{error}</div>}

          <div>
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
              Your submission {format !== 'text' && `(${format})`}
            </label>
            {format === 'url' ? (
              <input className={inputCls} style={focusStyle} placeholder="Paste your URL here (GitHub, Figma, Loom, etc.)" value={content} onChange={e => setContent(e.target.value)} />
            ) : (
              <textarea className={inputCls} style={focusStyle} rows={8}
                placeholder={format === 'text' ? 'Write your response here...' : 'Describe your submission or paste a link...'}
                value={content} onChange={e => setContent(e.target.value)} />
            )}
            {challenge.timeLimit > 0 && (
              <p className="text-xs text-stone-400 mt-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Suggested time: {challenge.timeLimit} min
              </p>
            )}
          </div>
        </div>

        <div className="px-5 pb-8 pt-3 border-t flex-shrink-0" style={{ borderColor: '#f5f5f4' }}>
          <button onClick={handleSubmit} disabled={busy || !content.trim()}
            className="w-full py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
            style={{ background: GREEN }}>
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Challenge Card ───────────────────────────────────────────────────────────
function ChallengeCard({
  challenge, isOwner, userSkills, userSubmission, onSubmit, onViewSubmissions,
}: {
  challenge: any;
  isOwner: boolean;
  userSkills: string[];
  userSubmission?: any;
  onSubmit: () => void;
  onViewSubmissions: () => void;
}) {
  const diff = DIFF_META[challenge.difficulty] ?? DIFF_META.entry;
  const type = TYPE_META[challenge.type] ?? TYPE_META.code;
  const challengeSkills = (challenge.skills ?? []).map((s: string) => s.toLowerCase());
  const hasSkillMatch = userSkills.some(s => challengeSkills.some((cs: string) => cs.includes(s) || s.includes(cs)));
  const expired = challenge.expiresAt ? new Date(challenge.expiresAt) < new Date() : false;
  const dl = challenge.expiresAt ? daysLeft(challenge.expiresAt) : null;

  const statusMeta = userSubmission ? STATUS_META[userSubmission.status ?? 'submitted'] : null;

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md ${hasSkillMatch ? 'ring-1' : ''}`}
      style={{ borderColor: hasSkillMatch ? '#b6ddd2' : '#e7e5e4', ringColor: GREEN }}>

      {/* Type gradient header */}
      <div className={`bg-gradient-to-r ${type.gradient} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 text-stone-700">{type.label}</span>
          <span className="text-xs font-bold" style={{ color: diff.color }}>{diff.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasSkillMatch && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: GREEN_LT, color: GREEN }}>
              ✓ Skill match
            </span>
          )}
          {expired && <span className="text-xs font-bold text-red-400 bg-red-50 px-2 py-0.5 rounded-full">Expired</span>}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-bold text-stone-900 text-sm leading-snug">{challenge.title}</h3>
          <p className="text-xs text-stone-500 mt-1 line-clamp-2">{challenge.description}</p>
        </div>

        {/* Skills */}
        {challenge.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {challenge.skills.slice(0, 4).map((skill: string) => {
              const match = userSkills.some(s => skill.toLowerCase().includes(s) || s.includes(skill.toLowerCase()));
              return (
                <span key={skill} className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: match ? GREEN_LT : '#f5f5f4', color: match ? GREEN : '#78716c' }}>
                  {skill}
                </span>
              );
            })}
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-stone-400">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{challenge.timeLimit}m</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{challenge.submissionCount || 0}</span>
          {challenge.reward?.credits > 0 && (
            <span className="flex items-center gap-1 font-bold" style={{ color: '#f59e0b' }}>
              <Zap className="w-3 h-3" />{challenge.reward.credits}
            </span>
          )}
          {dl !== null && !expired && <span className={dl <= 3 ? 'text-red-400 font-semibold' : ''}>{dl}d left</span>}
        </div>

        {/* Submission status badge */}
        {statusMeta && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: statusMeta.bg }}>
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statusMeta.color }} />
            <span className="text-xs font-bold" style={{ color: statusMeta.color }}>
              {statusMeta.label}
            </span>
            {userSubmission.score != null && (
              <span className="ml-auto text-xs font-bold flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400" />
                {userSubmission.score}/100
              </span>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          {isOwner ? (
            <button onClick={onViewSubmissions}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold border transition-all hover:shadow-sm"
              style={{ borderColor: GREEN, color: GREEN }}>
              <Eye className="w-3.5 h-3.5" /> View submissions ({challenge.submissionCount || 0})
            </button>
          ) : (
            <>
              {!userSubmission && !expired && (
                <button onClick={onSubmit}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ background: GREEN }}>
                  <Send className="w-3.5 h-3.5" /> Submit
                </button>
              )}
              {userSubmission && (
                <button disabled className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold border opacity-60"
                  style={{ borderColor: '#e7e5e4', color: '#78716c' }}>
                  <CheckCircle className="w-3.5 h-3.5" /> Submitted
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Submissions Review Panel ─────────────────────────────────────────────────

// ─── Conversion Action Drawer ─────────────────────────────────────────────────
// The full post-score hiring flow lives here: shortlist → pipeline → outreach
// → interview → link job → offer. Each action is a separate panel within the
// drawer, accessible from any submission card regardless of current status.

type ConversionAction =
  | 'shortlist'
  | 'pipeline'
  | 'outreach'
  | 'interview'
  | 'link-job'
  | 'offer';

interface ConversionDrawerProps {
  submission: any;
  challenge: any;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const ACTION_STEPS: {
  id: ConversionAction;
  icon: React.ElementType;
  label: string;
  desc: string;
  color: string;
  bg: string;
}[] = [
  { id: 'shortlist',  icon: Bookmark,      label: 'Shortlist',          desc: 'Flag as a top candidate',              color: GREEN,     bg: GREEN_LT  },
  { id: 'pipeline',   icon: Briefcase,      label: 'Save to Pipeline',   desc: 'Add to talent pool with notes & tags', color: '#0369a1', bg: '#e0f2fe' },
  { id: 'outreach',   icon: MessageSquare,  label: 'Send Outreach',      desc: 'Use a template or write custom',       color: '#7c3aed', bg: '#f3f0ff' },
  { id: 'interview',  icon: Calendar,       label: 'Invite to Interview', desc: 'Propose time slots',                  color: '#b45309', bg: '#fef3c7' },
  { id: 'link-job',   icon: Link2,          label: 'Connect to Job Req', desc: 'Attach to an open role',               color: '#0891b2', bg: '#ecfeff' },
  { id: 'offer',      icon: Gift,           label: 'Extend an Offer',    desc: 'Project, internship, or full-time',    color: '#059669', bg: '#d1fae5' },
];

function ConversionDrawer({ submission, challenge, onClose, onDone }: ConversionDrawerProps) {
  const { fbUser, currentUser } = useFirebase();
  const [panel, setPanel] = useState<ConversionAction | null>(null);

  // ── Shortlist ──
  const [shortlisting, setShortlisting] = useState(false);

  // ── Pipeline ──
  const [pipelineNotes, setPipelineNotes] = useState('');
  const [pipelineTags, setPipelineTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [pipelineBusy, setPipelineBusy] = useState(false);

  // ── Outreach ──
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [outreachBody, setOutreachBody] = useState('');
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // ── Interview ──
  const [slots, setSlots] = useState([
    { datetime: '', duration: 30 },
    { datetime: '', duration: 30 },
  ]);
  const [jobTitleForInterview, setJobTitleForInterview] = useState(challenge.title);
  const [interviewBusy, setInterviewBusy] = useState(false);

  // ── Link Job ──
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  // ── Offer ──
  const [offerType, setOfferType] = useState<'project'|'internship'|'full-time'|'contract'|'part-time'>('full-time');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerBusy, setOfferBusy] = useState(false);

  // Load templates when outreach panel opens
  useEffect(() => {
    if (panel === 'outreach' && fbUser) {
      setLoadingTemplates(true);
      fetchOutreachTemplates(fbUser.uid)
        .then(setTemplates)
        .catch(() => {})
        .finally(() => setLoadingTemplates(false));
    }
    if (panel === 'link-job' && fbUser) {
      setLoadingJobs(true);
      fetchJobsForRecruiter(fbUser.uid)
        .then(setJobs)
        .catch(() => {})
        .finally(() => setLoadingJobs(false));
    }
  }, [panel, fbUser]);

  function applyTemplate(t: any) {
    const body = (t.body as string)
      .replace(/\{candidateName\}/g, submission.userName || 'there')
      .replace(/\{company\}/g, challenge.companyName || 'our company')
      .replace(/\{jobTitle\}/g, challenge.title)
      .replace(/\{recruiterName\}/g, currentUser?.name || 'The Hiring Team');
    setOutreachBody(body);
    setSelectedTemplate(t.id);
  }

  // ── Handlers ──

  async function handleShortlist() {
    setShortlisting(true);
    try {
      await shortlistSubmission(challenge.id, submission.id, fbUser?.uid ?? '');
      await updateSubmissionStatus(challenge.id, submission.id, 'shortlisted');
      onDone('Shortlisted ✓');
    } finally { setShortlisting(false); }
  }

  async function handleSavePipeline() {
    if (!fbUser) return;
    setPipelineBusy(true);
    try {
      await saveSubmissionToTalentPool(fbUser.uid, {
        userId: submission.userId,
        userName: submission.userName,
        userAvatar: submission.userAvatar,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        companyName: challenge.companyName,
        score: submission.score,
        targetedSkill: challenge.targetedSkill,
      }, pipelineNotes, pipelineTags);
      onDone('Saved to pipeline ✓');
    } finally { setPipelineBusy(false); }
  }

  async function handleOutreach() {
    if (!fbUser || !outreachBody.trim()) return;
    setOutreachBusy(true);
    try {
      await sendChallengeOutreach(
        fbUser.uid,
        (currentUser as any)?.id ?? 0,
        submission.userId,
        submission.userNumericId ?? 0,
        outreachBody.trim()
      );
      onDone('Message sent ✓');
    } finally { setOutreachBusy(false); }
  }

  async function handleInterview() {
    if (!fbUser) return;
    const filled = slots.filter(s => s.datetime.trim());
    if (filled.length === 0) return;
    setInterviewBusy(true);
    try {
      await proposeInterviewFromChallenge(
        fbUser.uid,
        challenge.id,
        submission.id,
        submission.userId,
        submission.userName,
        jobTitleForInterview,
        filled
      );
      onDone('Interview proposed ✓');
    } finally { setInterviewBusy(false); }
  }

  async function handleLinkJob() {
    if (!selectedJobId) return;
    setLinkBusy(true);
    try {
      await linkSubmissionToJob(
        challenge.id,
        submission.id,
        selectedJobId,
        { userId: submission.userId, userName: submission.userName }
      );
      onDone('Linked to job ✓');
    } finally { setLinkBusy(false); }
  }

  async function handleOffer() {
    if (!fbUser || !offerTitle.trim() || !offerMessage.trim()) return;
    setOfferBusy(true);
    try {
      await sendRoleOffer(
        challenge.id,
        submission.id,
        {
          type: offerType,
          title: offerTitle,
          companyName: challenge.companyName,
          message: offerMessage,
          linkedJobId: selectedJobId || undefined,
        },
        fbUser.uid,
        (currentUser as any)?.id ?? 0,
        submission.userId,
        submission.userNumericId ?? 0
      );
      onDone('Offer sent ✓');
    } finally { setOfferBusy(false); }
  }

  const currentAction = ACTION_STEPS.find(a => a.id === panel);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-12 h-1 rounded-full bg-stone-200" />
        </div>

        {/* Candidate header strip */}
        <div
          className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
          style={{ borderColor: '#f0ede6' }}
        >
          {panel && (
            <button
              onClick={() => setPanel(null)}
              className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-stone-500" />
            </button>
          )}
          <div
            className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-sm font-black text-white"
            style={{ background: GREEN }}
          >
            {submission.userAvatar
              ? <img src={submission.userAvatar} alt="" className="w-full h-full object-cover" />
              : (submission.userName?.[0] ?? '?')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-stone-900 text-sm truncate">
              {submission.userName || 'Anonymous'}
            </p>
            <p className="text-xs text-stone-400 truncate">
              {panel ? currentAction?.label : 'Choose a hiring action'}
            </p>
          </div>
          {submission.score != null && (
            <div
              className="flex items-center gap-1 rounded-xl px-2.5 py-1 flex-shrink-0"
              style={{ background: '#fef3c7' }}
            >
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-sm font-black text-amber-700">{submission.score}</span>
            </div>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>

        {/* Main scroll area */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Action menu (no panel selected) ── */}
          {!panel && (
            <div className="px-4 py-4 space-y-2">
              {/* Existing status badges row */}
              <div className="flex flex-wrap gap-1.5 pb-2">
                {submission.isShortlisted && (
                  <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-bold px-2.5 py-1"
                    style={{ background: GREEN_LT, color: GREEN }}>
                    <Bookmark className="w-3 h-3" /> Shortlisted
                  </span>
                )}
                {submission.status === 'invited' && (
                  <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-bold px-2.5 py-1"
                    style={{ background: '#d1fae5', color: '#059669' }}>
                    <CheckCircle className="w-3 h-3" /> Invited
                  </span>
                )}
                {submission.offer && (
                  <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-bold px-2.5 py-1"
                    style={{ background: '#fef3c7', color: '#b45309' }}>
                    <Gift className="w-3 h-3" /> Offer sent
                  </span>
                )}
              </div>

              {ACTION_STEPS.map(action => {
                const Icon = action.icon;
                const done =
                  (action.id === 'shortlist' && submission.isShortlisted) ||
                  (action.id === 'interview' && submission.status === 'invited') ||
                  (action.id === 'offer' && !!submission.offer);

                return (
                  <button
                    key={action.id}
                    onClick={() => action.id === 'shortlist' ? handleShortlist() : setPanel(action.id)}
                    disabled={action.id === 'shortlist' && (submission.isShortlisted || shortlisting)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all hover:shadow-sm disabled:opacity-50 active:scale-[0.99]"
                    style={{
                      borderColor: done ? action.color + '40' : '#f0ede6',
                      background: done ? action.bg : 'white',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: action.bg }}
                    >
                      {action.id === 'shortlist' && shortlisting
                        ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: action.color }} />
                        : <Icon className="w-5 h-5" style={{ color: action.color }} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-stone-900 text-sm">{action.label}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{action.desc}</p>
                    </div>
                    {done
                      ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: action.color }} />
                      : action.id !== 'shortlist' && <ChevronDown className="w-4 h-4 text-stone-300 flex-shrink-0 -rotate-90" />
                    }
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Pipeline panel ── */}
          {panel === 'pipeline' && (
            <div className="px-5 py-4 space-y-4">
              <div
                className="rounded-2xl p-4 border"
                style={{ background: '#e0f2fe', borderColor: '#bae6fd' }}
              >
                <p className="text-xs font-bold text-blue-700">Save to Talent Pool</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  This candidate will appear in your Recruiter Console under Talent Pool, tagged as challenge-sourced.
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
                  Notes
                </label>
                <textarea
                  className={inputCls}
                  style={focusStyle}
                  rows={3}
                  placeholder={`Strong submission for ${challenge.targetedSkill ?? 'this challenge'}. Reached out on…`}
                  value={pipelineNotes}
                  onChange={e => setPipelineNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
                  Tags
                </label>
                <div className="flex gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    style={focusStyle}
                    placeholder="e.g. React, Top 10%, Follow-up"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const t = tagInput.trim().replace(/,$/, '');
                        if (t && !pipelineTags.includes(t)) setPipelineTags(p => [...p, t]);
                        setTagInput('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (tagInput.trim()) {
                        setPipelineTags(p => [...p, tagInput.trim()]);
                        setTagInput('');
                      }
                    }}
                    className="px-3 rounded-xl text-xs font-bold text-white flex-shrink-0"
                    style={{ background: '#0369a1' }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {pipelineTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pipelineTags.map(t => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ background: '#e0f2fe', color: '#0369a1' }}
                      >
                        {t}
                        <button onClick={() => setPipelineTags(p => p.filter(x => x !== t))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="rounded-2xl p-3 border flex items-start gap-2"
                style={{ borderColor: '#e7e5e4' }}
              >
                <Star className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0 fill-amber-400" />
                <p className="text-xs text-stone-500">
                  Rating auto-set from score: <strong>{submission.score != null ? Math.round(submission.score / 20) : 3}/5 stars</strong>
                </p>
              </div>
            </div>
          )}

          {/* ── Outreach panel ── */}
          {panel === 'outreach' && (
            <div className="px-5 py-4 space-y-4">
              {loadingTemplates ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                </div>
              ) : templates.length > 0 ? (
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-2">
                    Templates
                  </label>
                  <div className="space-y-1.5">
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm text-left transition-all hover:shadow-sm"
                        style={{
                          borderColor: selectedTemplate === t.id ? '#7c3aed' : '#e7e5e4',
                          background: selectedTemplate === t.id ? '#f3f0ff' : 'white',
                        }}
                      >
                        <div>
                          <p className="font-semibold text-stone-800">{t.name}</p>
                          <p className="text-xs text-stone-400 truncate max-w-[240px]">{t.subject}</p>
                        </div>
                        {selectedTemplate === t.id && <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl p-3 border flex items-center gap-2"
                  style={{ borderColor: '#e7e5e4', background: '#fafaf9' }}
                >
                  <AlertCircle className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  <p className="text-xs text-stone-500">
                    No saved templates. Write a message below or create templates in the Recruiter Console.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
                  Message
                </label>
                <textarea
                  className={inputCls}
                  style={focusStyle}
                  rows={8}
                  placeholder={`Hi ${submission.userName?.split(' ')[0] || 'there'},\n\nWe reviewed your submission for "${challenge.title}" and were impressed…`}
                  value={outreachBody}
                  onChange={e => setOutreachBody(e.target.value)}
                />
                <p className="text-[10px] text-stone-400 mt-1">
                  Sent as a direct message via BeWatu. Candidate will see it in their inbox.
                </p>
              </div>
            </div>
          )}

          {/* ── Interview panel ── */}
          {panel === 'interview' && (
            <div className="px-5 py-4 space-y-4">
              <div
                className="rounded-2xl p-4 border"
                style={{ background: '#fef3c7', borderColor: '#fde68a' }}
              >
                <p className="text-xs font-bold text-amber-700">Interview invitation</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Propose up to 3 time slots. {submission.userName} will be notified and can confirm one.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
                  Role / Context
                </label>
                <input
                  className={inputCls}
                  style={focusStyle}
                  value={jobTitleForInterview}
                  onChange={e => setJobTitleForInterview(e.target.value)}
                  placeholder="e.g. Frontend Engineer — challenge follow-up"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                  Proposed Slots
                </label>
                {slots.map((slot, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <input
                      type="datetime-local"
                      className={inputCls}
                      style={focusStyle}
                      value={slot.datetime}
                      onChange={e => setSlots(s => s.map((x, j) => j === i ? { ...x, datetime: e.target.value } : x))}
                    />
                    <select
                      className="rounded-xl border border-stone-200 bg-stone-50 px-2 py-2 text-sm text-stone-700 focus:outline-none"
                      value={slot.duration}
                      onChange={e => setSlots(s => s.map((x, j) => j === i ? { ...x, duration: Number(e.target.value) } : x))}
                    >
                      {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d}m</option>)}
                    </select>
                  </div>
                ))}
                {slots.length < 3 && (
                  <button
                    onClick={() => setSlots(s => [...s, { datetime: '', duration: 30 }])}
                    className="text-xs font-semibold flex items-center gap-1"
                    style={{ color: '#b45309' }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add another slot
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Link Job panel ── */}
          {panel === 'link-job' && (
            <div className="px-5 py-4 space-y-4">
              <div
                className="rounded-2xl p-4 border"
                style={{ background: '#ecfeff', borderColor: '#a5f3fc' }}
              >
                <p className="text-xs font-bold text-[#1a4a3a]">Connect to a Job Req</p>
                <p className="text-xs text-[#1a6b52] mt-0.5">
                  This submission will be added as an application to the selected open role, visible in your pipeline.
                </p>
              </div>

              {loadingJobs ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                </div>
              ) : jobs.length === 0 ? (
                <div
                  className="rounded-2xl p-3 border flex items-center gap-2"
                  style={{ borderColor: '#e7e5e4' }}
                >
                  <AlertCircle className="w-4 h-4 text-stone-400" />
                  <p className="text-xs text-stone-500">No open roles found. Create one in the Job Editor.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                    Select Role
                  </label>
                  {jobs.map((job: any) => (
                    <button
                      key={job.id}
                      onClick={() => setSelectedJobId(job.id)}
                      className="w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all"
                      style={{
                        borderColor: selectedJobId === job.id ? '#0891b2' : '#e7e5e4',
                        background: selectedJobId === job.id ? '#ecfeff' : 'white',
                      }}
                    >
                      <div>
                        <p className="font-semibold text-stone-800 text-sm">{job.title}</p>
                        <p className="text-xs text-stone-400">{job.location} · {job.type}</p>
                      </div>
                      {selectedJobId === job.id && <Check className="w-4 h-4 text-[#1a4a3a]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Offer panel ── */}
          {panel === 'offer' && (
            <div className="px-5 py-4 space-y-4">
              <div
                className="rounded-2xl p-4 border"
                style={{ background: '#d1fae5', borderColor: '#6ee7b7' }}
              >
                <p className="text-xs font-bold text-emerald-700">Extend an Offer</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Sent as a direct message. Use formal offer letters for binding agreements.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-2">
                  Offer Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['full-time', 'internship', 'project', 'contract', 'part-time'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setOfferType(t)}
                      className="rounded-xl border-2 py-2 text-xs font-bold capitalize transition-all"
                      style={{
                        borderColor: offerType === t ? '#059669' : '#e7e5e4',
                        background: offerType === t ? '#d1fae5' : 'white',
                        color: offerType === t ? '#059669' : '#78716c',
                      }}
                    >
                      {t.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
                  Role title
                </label>
                <input
                  className={inputCls}
                  style={focusStyle}
                  placeholder="e.g. Frontend Contractor, Summer Intern"
                  value={offerTitle}
                  onChange={e => setOfferTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
                  Offer message
                </label>
                <textarea
                  className={inputCls}
                  style={focusStyle}
                  rows={5}
                  placeholder={`Hi ${submission.userName?.split(' ')[0] || 'there'},\n\nWe'd love to offer you a ${offerType} role based on your challenge submission…`}
                  value={offerMessage}
                  onChange={e => setOfferMessage(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA — only shown when a panel is active */}
        {panel && (
          <div className="px-5 pb-8 pt-3 border-t flex-shrink-0" style={{ borderColor: '#f0ede6' }}>
            {panel === 'pipeline' && (
              <button
                onClick={handleSavePipeline}
                disabled={pipelineBusy}
                className="w-full py-3 rounded-2xl font-black text-white text-sm hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
                style={{ background: '#0369a1' }}
              >
                {pipelineBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                {pipelineBusy ? 'Saving…' : 'Save to Talent Pipeline'}
              </button>
            )}
            {panel === 'outreach' && (
              <button
                onClick={handleOutreach}
                disabled={outreachBusy || !outreachBody.trim()}
                className="w-full py-3 rounded-2xl font-black text-white text-sm hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
                style={{ background: '#7c3aed' }}
              >
                {outreachBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {outreachBusy ? 'Sending…' : 'Send Message'}
              </button>
            )}
            {panel === 'interview' && (
              <button
                onClick={handleInterview}
                disabled={interviewBusy || slots.every(s => !s.datetime)}
                className="w-full py-3 rounded-2xl font-black text-white text-sm hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
                style={{ background: '#b45309' }}
              >
                {interviewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                {interviewBusy ? 'Proposing…' : 'Propose Interview Slots'}
              </button>
            )}
            {panel === 'link-job' && (
              <button
                onClick={handleLinkJob}
                disabled={linkBusy || !selectedJobId}
                className="w-full py-3 rounded-2xl font-black text-white text-sm hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
                style={{ background: '#0891b2' }}
              >
                {linkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {linkBusy ? 'Linking…' : 'Connect to Job Req'}
              </button>
            )}
            {panel === 'offer' && (
              <button
                onClick={handleOffer}
                disabled={offerBusy || !offerTitle.trim() || !offerMessage.trim()}
                className="w-full py-3 rounded-2xl font-black text-white text-sm hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
                style={{ background: '#059669' }}
              >
                {offerBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                {offerBusy ? 'Sending offer…' : 'Send Offer'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Submissions Review ───────────────────────────────────────────────────────
// Full pipeline review: leaderboard + per-submission scoring + conversion drawer

function SubmissionsReview({
  challenge, onBack,
}: {
  challenge: any;
  onBack: () => void;
}) {
  const { fbUser } = useFirebase();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [blindMode, setBlindMode] = useState(false);

  // Scoring state
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [scoreValue, setScoreValue] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [scoreBusy, setScoreBusy] = useState(false);

  // Expanded content
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Conversion drawer
  const [conversionTarget, setConversionTarget] = useState<any | null>(null);
  const [toast, setToast] = useState('');

  async function load() {
    setLoading(true);
    try { setSubmissions(await getChallengeSubmissions(challenge.id)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [challenge.id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleScore(subId: string) {
    setScoreBusy(true);
    try {
      await scoreSubmission(challenge.id, subId, scoreValue, feedback);
      await updateSubmissionStatus(challenge.id, subId, 'scored', { score: scoreValue, feedback });
      setScoringId(null);
      load();
    } finally { setScoreBusy(false); }
  }

  function handleConversionDone(msg: string) {
    setConversionTarget(null);
    showToast(msg);
    load();
  }

  const displayName = (sub: any, i: number) =>
    blindMode ? `Candidate #${i + 1}` : sub.userName || 'Anonymous';

  const ranked = [...submissions]
    .filter(s => s.score != null)
    .sort((a, b) => b.score - a.score);

  const unscored = submissions.filter(s => s.score == null);

  // Compute completion stats
  const shortlisted = submissions.filter(s => s.isShortlisted).length;
  const invited     = submissions.filter(s => s.status === 'invited').length;
  const withOffers  = submissions.filter(s => s.offer).length;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-xl flex items-center gap-2"
          style={{ background: GREEN }}
        >
          <Check className="w-4 h-4" />{toast}
        </div>
      )}

      <div className="space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-stone-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-stone-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-stone-900 truncate">{challenge.title}</h3>
            <p className="text-xs text-stone-400">
              {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setBlindMode(b => !b)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border-2 transition-all"
            style={blindMode
              ? { background: GREEN, borderColor: GREEN, color: 'white' }
              : { borderColor: '#e7e5e4', color: '#78716c' }}
          >
            {blindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {blindMode ? 'Blind' : 'Named'}
          </button>
        </div>

        {/* Pipeline stats strip */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Total',       value: submissions.length, color: '#78716c', bg: '#f5f5f4' },
              { label: 'Shortlisted', value: shortlisted,        color: GREEN,     bg: GREEN_LT  },
              { label: 'Invited',     value: invited,            color: '#059669', bg: '#d1fae5' },
              { label: 'Offers',      value: withOffers,         color: '#b45309', bg: '#fef3c7' },
            ].map(stat => (
              <div
                key={stat.label}
                className="rounded-2xl p-3 text-center border"
                style={{ background: stat.bg, borderColor: stat.color + '30' }}
              >
                <p className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-[10px] font-semibold text-stone-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: GREEN }} />
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center rounded-2xl border-2 border-dashed" style={{ borderColor: '#e7e5e4' }}>
            <Inbox className="w-10 h-10 text-stone-200" />
            <p className="font-bold text-stone-400 text-sm">No submissions yet</p>
            <p className="text-xs text-stone-300">Share this challenge to attract candidates</p>
          </div>
        ) : (
          <>
            {/* Leaderboard — only shown when 2+ scored */}
            {ranked.length >= 2 && (
              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
                <div
                  className="px-4 py-3 border-b flex items-center gap-2"
                  style={{ borderColor: '#f0ede6', background: '#fefce8' }}
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black text-amber-800 uppercase tracking-wider">
                    Leaderboard
                  </span>
                </div>
                {ranked.slice(0, 5).map((sub, i) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                    style={{ borderColor: '#f5f5f4', background: i === 0 ? '#fffbeb' : 'white' }}
                  >
                    <span
                      className="text-sm font-black w-6 text-center flex-shrink-0"
                      style={{ color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#d4d4d4' }}
                    >
                      {i + 1}
                    </span>
                    <p className="flex-1 text-sm font-semibold text-stone-800 truncate">
                      {displayName(sub, i)}
                    </p>
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="font-black text-stone-900">{sub.score}</span>
                      <span className="text-xs text-stone-400">/100</span>
                    </div>
                    {sub.isShortlisted && (
                      <span
                        className="text-[10px] font-black rounded-full px-2 py-0.5"
                        style={{ background: GREEN_LT, color: GREEN }}
                      >
                        ★
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* All submissions */}
            <div className="space-y-3">
              {submissions.map((sub, i) => {
                const statusMeta = STATUS_META[sub.status ?? 'submitted'];
                const isExpanded = expandedId === sub.id;
                const isScoring  = scoringId === sub.id;

                return (
                  <div
                    key={sub.id}
                    className="bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-sm"
                    style={{ borderColor: sub.isShortlisted ? '#b6ddd2' : '#e7e5e4' }}
                  >
                    {/* Card header */}
                    <div className="px-4 pt-4 pb-3">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-sm font-black text-white"
                          style={{ background: GREEN }}
                        >
                          {!blindMode && sub.userAvatar
                            ? <img src={sub.userAvatar} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            : <span>{blindMode ? i + 1 : (sub.userName?.[0] ?? '?')}</span>
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-stone-900 text-sm">
                              {displayName(sub, i)}
                            </p>
                            <span
                              className="text-[10px] font-bold rounded-full px-2 py-0.5"
                              style={{ background: statusMeta.bg, color: statusMeta.color }}
                            >
                              {statusMeta.label}
                            </span>
                            {sub.isShortlisted && (
                              <span
                                className="text-[10px] font-bold rounded-full px-2 py-0.5"
                                style={{ background: GREEN_LT, color: GREEN }}
                              >
                                Shortlisted
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-400 mt-0.5">{timeAgo(sub.submittedAt)}</p>
                        </div>

                        {sub.score != null && (
                          <div
                            className="flex items-center gap-1 rounded-xl px-2.5 py-1 flex-shrink-0"
                            style={{ background: '#fef3c7' }}
                          >
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                            <span className="text-sm font-black text-amber-700">{sub.score}</span>
                          </div>
                        )}
                      </div>

                      {/* Submission content — collapsible */}
                      <div
                        className={`mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-700 whitespace-pre-wrap cursor-pointer select-none transition-all ${isExpanded ? '' : 'line-clamp-3'}`}
                        onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                        style={{ borderColor: '#f0ede6', border: '1px solid' }}
                      >
                        {sub.content}
                      </div>
                      {!isExpanded && sub.content?.length > 200 && (
                        <button
                          onClick={() => setExpandedId(sub.id)}
                          className="mt-1 text-xs font-semibold"
                          style={{ color: GREEN }}
                        >
                          Read full response ↓
                        </button>
                      )}

                      {/* Feedback display */}
                      {sub.feedback && (
                        <div
                          className="mt-2 rounded-xl p-3 border text-xs text-stone-600 italic"
                          style={{ borderColor: '#fde68a', background: '#fefce8' }}
                        >
                          "{sub.feedback}"
                        </div>
                      )}
                    </div>

                    {/* Scoring form (inline) */}
                    {isScoring && (
                      <div
                        className="px-4 pb-4 pt-1 space-y-3 border-t"
                        style={{ borderColor: '#f0ede6', background: '#fafaf9' }}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                            <span>Score</span>
                            <span
                              className="text-2xl font-black tabular-nums"
                              style={{ color: scoreValue >= 70 ? GREEN : scoreValue >= 40 ? '#b45309' : '#ef4444' }}
                            >
                              {scoreValue}
                              <span className="text-sm font-normal text-stone-400">/100</span>
                            </span>
                          </div>
                          <input
                            type="range" min={0} max={100} value={scoreValue}
                            onChange={e => setScoreValue(Number(e.target.value))}
                            className="w-full h-2 rounded-full appearance-none cursor-pointer"
                            style={{ accentColor: GREEN }}
                          />
                          <div className="flex justify-between text-[10px] text-stone-300">
                            <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                          </div>
                        </div>
                        <textarea
                          className={inputCls}
                          style={focusStyle}
                          rows={2}
                          placeholder="Feedback for candidate (optional, they'll see this)"
                          value={feedback}
                          onChange={e => setFeedback(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setScoringId(null)}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-stone-500 border border-stone-200 hover:bg-stone-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleScore(sub.id)}
                            disabled={scoreBusy}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
                            style={{ background: GREEN }}
                          >
                            {scoreBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            {scoreBusy ? 'Saving…' : 'Save Score'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action bar */}
                    {!isScoring && (
                      <div
                        className="flex items-center gap-1.5 px-4 py-3 border-t"
                        style={{ borderColor: '#f5f5f4', background: '#fafaf9' }}
                      >
                        {/* Score / Re-score */}
                        <button
                          onClick={() => { setScoringId(sub.id); setScoreValue(sub.score ?? 0); setFeedback(sub.feedback ?? ''); }}
                          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all hover:shadow-sm"
                          style={{ borderColor: '#e7e5e4', color: '#78716c' }}
                        >
                          <Star className="w-3.5 h-3.5" />
                          {sub.score != null ? 'Re-score' : 'Score'}
                        </button>

                        {/* Hire flow CTA */}
                        <button
                          onClick={() => setConversionTarget(sub)}
                          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black border-2 transition-all hover:shadow-sm ml-auto"
                          style={{ borderColor: GREEN, color: GREEN, background: GREEN_LT }}
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Move forward
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Conversion drawer */}
      {conversionTarget && (
        <ConversionDrawer
          submission={conversionTarget}
          challenge={challenge}
          onClose={() => setConversionTarget(null)}
          onDone={handleConversionDone}
        />
      )}
    </>
  );
}

// Missing lucide icon not in 0.263.1
function Inbox({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
}

// ─── Main CompanyProfileModal ─────────────────────────────────────────────────
interface CompanyProfileModalProps {
  company: Company;
  allJobs: Job[];
  onClose: () => void;
}

export function CompanyProfileModal({ company, allJobs, onClose }: CompanyProfileModalProps) {
  const { currentUser, fbUser } = useFirebase();

  const [challenges, setChallenges] = useState<any[]>([]);
  const [userSubmissions, setUserSubmissions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'challenges'>('overview');

  const [isFollowing, setIsFollowing] = useState(
    (currentUser as any)?.followingCompanies?.includes(company._firestoreId) ?? false
  );
  const [followBusy, setFollowBusy] = useState(false);

  const [showCreateChallenge, setShowCreateChallenge] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<any | null>(null);
  const [reviewTarget, setReviewTarget] = useState<any | null>(null);

  const companyJobs = allJobs.filter(j => j.companyId === company.id);
  const isOwner = company.adminUid === fbUser?.uid || (company.verifiedRecruiters ?? []).includes(fbUser?.uid ?? '');
  const userSkills = [
    ...((currentUser as any)?.skills ?? []).map((s: any) => (typeof s === 'string' ? s : s.name).toLowerCase()),
    ...((currentUser as any)?.verifiedSkills ?? []).map((s: any) => s.name.toLowerCase()),
  ];

  async function loadChallenges() {
    if (!company._firestoreId) { setLoading(false); return; }
    setLoading(true);
    try {
      const chs = await getChallengesForCompany(company._firestoreId);
      setChallenges(chs);
      // Load user's submissions for these challenges
      if (fbUser) {
        const subMap: Record<string, any> = {};
        await Promise.all(
          chs.map(async (ch: any) => {
            const subs = await getChallengeSubmissions(ch.id);
            const mine = subs.find((s: any) => s.userId === fbUser.uid);
            if (mine) subMap[ch.id] = mine;
          })
        );
        setUserSubmissions(subMap);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadChallenges(); }, [company._firestoreId]);

  async function handleFollow() {
    if (!fbUser || !company._firestoreId) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await unfollowCompany(fbUser.uid, company._firestoreId);
        setIsFollowing(false);
      } else {
        await followCompany(fbUser.uid, company._firestoreId);
        setIsFollowing(true);
      }
    } finally {
      setFollowBusy(false);
    }
  }

  if (reviewTarget) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#f5f5f4' }}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <SubmissionsReview challenge={reviewTarget} onBack={() => setReviewTarget(null)} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#f5f5f4' }}>
        <div className="min-h-screen max-w-2xl mx-auto flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b flex items-center gap-3 px-4 py-3" style={{ borderColor: '#e7e5e4' }}>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100"><X className="w-5 h-5 text-stone-600" /></button>
            <h1 className="font-black text-stone-900 flex-1 truncate">{company.name}</h1>
            <button
              onClick={handleFollow}
              disabled={followBusy || !fbUser}
              className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold border-2 transition-all disabled:opacity-50"
              style={isFollowing
                ? { borderColor: GREEN, background: GREEN_LT, color: GREEN }
                : { borderColor: GREEN, color: GREEN }}>
              {followBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : isFollowing ? '✓ Following' : '+ Follow'}
            </button>
          </div>

          {/* Company hero */}
          <div className="bg-white px-5 py-6 border-b" style={{ borderColor: '#e7e5e4' }}>
            <div className="flex items-start gap-4">
              {company.logoUrl ? (
                <img src={company.logoUrl} alt={company.name} className="w-16 h-16 rounded-2xl object-cover border" style={{ borderColor: '#e7e5e4' }} />
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black" style={{ background: GREEN }}>
                  {company.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-stone-900 text-xl">{company.name}</h2>
                <p className="text-stone-500 text-sm">{company.industry}</p>
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1 mt-1 hover:underline" style={{ color: GREEN_MID }}>
                    <Globe className="w-3 h-3" />{company.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>
            {company.description && (
              <p className="mt-4 text-sm text-stone-600 leading-relaxed">{company.description}</p>
            )}
          </div>

          {/* Follower info banner */}
          {isFollowing && (
            <div className="mx-4 mt-4 rounded-2xl p-4 border flex items-start gap-3" style={{ background: GREEN_LT, borderColor: '#b6ddd2' }}>
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: GREEN }} />
              <div>
                <p className="text-sm font-bold" style={{ color: GREEN }}>You follow {company.name}</p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Skill challenges they post will be matched to your skills and surfaced in your Prove feed.
                </p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mx-4 mt-4 p-1 rounded-2xl bg-stone-100">
            {(['overview', 'challenges'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-1.5 rounded-xl text-xs font-bold capitalize transition-all"
                style={{ background: tab === t ? 'white' : 'transparent', color: tab === t ? '#1c1917' : '#78716c', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {t === 'challenges' ? `Challenges${challenges.length > 0 ? ` (${challenges.length})` : ''}` : 'Overview'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 px-4 py-4 pb-24 space-y-4">
            {tab === 'overview' && (
              <>
                {/* Jobs */}
                {companyJobs.length > 0 && (
                  <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: '#e7e5e4' }}>
                    <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                      <Building2 className="w-4 h-4" style={{ color: GREEN }} /> Open Roles ({companyJobs.length})
                    </h3>
                    {companyJobs.map(job => (
                      <div key={job.id} className="flex items-start justify-between py-2 border-t" style={{ borderColor: '#f5f5f4' }}>
                        <div>
                          <p className="font-semibold text-stone-800 text-sm">{job.title}</p>
                          <p className="text-xs text-stone-400">{job.location} · {job.type}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: GREEN_LT, color: GREEN }}>
                          {job.experienceLevel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* How skill challenges work */}
                <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: '#e7e5e4' }}>
                  <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                    <Sword className="w-4 h-4 text-amber-500" /> How Skill Challenges Work
                  </h3>
                  {[
                    { icon: Target, text: 'Companies post skill-based challenges linked to open roles' },
                    { icon: BookOpen, text: 'Your skills are matched — relevant challenges surface in your Prove feed' },
                    { icon: Send, text: 'You submit your work within the time limit or due date' },
                    { icon: Star, text: 'Recruiters score and shortlist the best responses' },
                    { icon: CheckCircle, text: 'Top candidates are invited directly to interview' },
                  ].map(({ icon: Icon, text }, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GREEN_LT }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: GREEN }} />
                      </div>
                      <p className="text-sm text-stone-600">{text}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'challenges' && (
              <>
                {isOwner && (
                  <button onClick={() => setShowCreateChallenge(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90"
                    style={{ background: GREEN }}>
                    <Plus className="w-4 h-4" /> Post a Challenge
                  </button>
                )}

                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: GREEN }} />
                  </div>
                ) : challenges.length === 0 ? (
                  <div className="flex flex-col items-center py-14 text-center gap-3">
                    <Sword className="w-10 h-10 text-stone-300" />
                    <p className="font-bold text-stone-500">No active challenges</p>
                    {isOwner && <p className="text-xs text-stone-400">Post your first skill challenge to find talent</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {challenges.map(ch => (
                      <ChallengeCard
                        key={ch.id}
                        challenge={ch}
                        isOwner={isOwner}
                        userSkills={userSkills}
                        userSubmission={userSubmissions[ch.id]}
                        onSubmit={() => setSubmitTarget(ch)}
                        onViewSubmissions={() => setReviewTarget(ch)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showCreateChallenge && (
        <CreateChallengeSheet
          company={company}
          onClose={() => setShowCreateChallenge(false)}
          onCreated={() => { setShowCreateChallenge(false); loadChallenges(); }}
        />
      )}

      {submitTarget && (
        <SubmitChallengeSheet
          challenge={submitTarget}
          onClose={() => setSubmitTarget(null)}
          onSubmitted={loadChallenges}
        />
      )}
    </>
  );
}

export default CompanyProfileModal;
