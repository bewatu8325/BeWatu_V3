import React, { useState, useEffect } from 'react';
import {
  Sword, PlusCircle, Filter, Loader2, Clock, Users, Zap,
  Code, Palette, BarChart3, PenTool, Database, ArrowLeft,
  Star, EyeOff, Eye, CheckCircle, Send, Trophy, X, Plus,
} from 'lucide-react';
import {
  getChallenges,
  submitChallenge,
  getChallengeSubmissions,
  scoreSubmission,
  shortlistSubmission,
  createChallenge,
  type ChallengeDifficulty,
  type ChallengeType,
} from '../lib/firestoreService';
import { useFirebase } from '../contexts/FirebaseContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_FILTERS: { value: ChallengeType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'code', label: 'Code' },
  { value: 'design', label: 'Design' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'writing', label: 'Writing' },
  { value: 'data', label: 'Data' },
];

const DIFFICULTY_FILTERS = [
  { value: 'all', label: 'All Levels' },
  { value: 'entry', label: 'Level 1' },
  { value: 'mid', label: 'Level 2' },
  { value: 'senior', label: 'Level 3' },
];

const TYPE_CONFIG: Record<string, { icon: typeof Code; label: string; gradient: string; accent: string }> = {
  code:     { icon: Code,     label: 'Code Challenge',     gradient: 'from-blue-500/20 to-purple-500/20',  accent: 'from-blue-500/20 to-purple-500/20'  },
  design:   { icon: Palette,  label: 'Design Challenge',   gradient: 'from-pink-500/20 to-orange-500/20', accent: 'from-pink-500/20 to-orange-500/20'  },
  strategy: { icon: BarChart3,label: 'Strategy Challenge', gradient: 'from-cyan-500/20 to-teal-500/20',   accent: 'from-cyan-500/20 to-teal-500/20'   },
  writing:  { icon: PenTool,  label: 'Writing Challenge',  gradient: 'from-amber-500/20 to-yellow-500/20',accent: 'from-amber-500/20 to-yellow-500/20' },
  data:     { icon: Database, label: 'Data Challenge',     gradient: 'from-emerald-500/20 to-green-500/20',accent:'from-emerald-500/20 to-green-500/20' },
};

const DIFF_CONFIG: Record<string, { label: string; level: number; color: string }> = {
  entry:  { label: 'Level 1', level: 1, color: 'text-green-400' },
  mid:    { label: 'Level 2', level: 2, color: 'text-amber-400' },
  senior: { label: 'Level 3', level: 3, color: 'text-red-400'   },
};

const CHALLENGE_TYPES: { value: ChallengeType; label: string }[] = [
  { value: 'code', label: 'Code' },
  { value: 'design', label: 'Design' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'writing', label: 'Writing' },
  { value: 'data', label: 'Data' },
];

const CHALLENGE_DIFFS: { value: ChallengeDifficulty; label: string }[] = [
  { value: 'entry', label: 'Level 1 (Entry)' },
  { value: 'mid',   label: 'Level 2 (Mid)'   },
  { value: 'senior',label: 'Level 3 (Senior)'},
];

// ─── Inline ArrowRight (not in lucide@0.263.1) ───────────────────────────────
function ArrowRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

// ─── Submissions Panel ────────────────────────────────────────────────────────

function SubmissionsPanel({
  challengeId, submissions, isRecruiter, blindMode,
  onRefresh, recruiterId, onViewProfile,
}: {
  challengeId: string;
  submissions: any[];
  isRecruiter: boolean;
  blindMode: boolean;
  onRefresh: () => void;
  recruiterId?: string;
  onViewProfile?: (userId: string) => void;
}) {
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [scoreValue, setScoreValue] = useState(0);
  const [feedbackValue, setFeedbackValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [shortlisting, setShortlisting] = useState<string | null>(null);

  const ranked = [...submissions].filter(s => s.score != null).sort((a, b) => (b.score || 0) - (a.score || 0));
  const unscored = submissions.filter(s => s.score == null);

  const medalColor = (i: number) => i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-slate-500';

  async function handleScore(subId: string) {
    if (scoreValue < 0 || scoreValue > 100) return;
    setSaving(true);
    try { await scoreSubmission(challengeId, subId, scoreValue, feedbackValue); setScoringId(null); onRefresh(); }
    finally { setSaving(false); }
  }

  async function handleShortlist(subId: string) {
    setShortlisting(subId);
    try { await shortlistSubmission(challengeId, subId, recruiterId ?? ''); onRefresh(); }
    finally { setShortlisting(null); }
  }

  const displayName = (sub: any, idx: number) => (blindMode && isRecruiter) ? `Candidate #${idx + 1}` : sub.userName || 'Anonymous';

  return (
    <div className="flex flex-col gap-6">
      {/* Leaderboard */}
      {ranked.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Trophy className="h-4 w-4 text-yellow-400" />Leaderboard
          </h3>
          <div className="mt-4 flex flex-col gap-2">
            {ranked.slice(0, 10).map((sub, i) => (
              <div key={sub.id} className={`flex items-center gap-3 rounded-lg p-3 ${i < 3 ? 'bg-slate-700/50' : ''}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${i < 3 ? 'bg-slate-800 border border-slate-700' : ''} ${medalColor(i)}`}>
                  {i < 3 ? <Trophy className="h-4 w-4" /> : <span>{i + 1}</span>}
                </div>
                {!blindMode ? (
                  <div className="h-8 w-8 rounded-full bg-slate-700 overflow-hidden shrink-0">
                    {sub.userAvatar ? <img src={sub.userAvatar} alt="" className="h-full w-full object-cover" /> :
                      <div className="h-full w-full flex items-center justify-center text-xs font-bold text-slate-400">{(sub.userName || '?')[0]}</div>}
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                    <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{displayName(sub, i)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-sm font-bold text-slate-100">{sub.score}</span>
                  <span className="text-xs text-slate-400">/100</span>
                </div>
                {sub.isShortlisted && <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-400">SHORTLISTED</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recruiter view */}
      {isRecruiter && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <Eye className="h-4 w-4 text-cyan-400" />Submissions ({submissions.length})
            </h3>
            {blindMode && (
              <span className="flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                <EyeOff className="h-3 w-3" />Blind Mode
              </span>
            )}
          </div>
          {submissions.length === 0 ? (
            <p className="mt-4 text-center text-sm text-slate-400">No submissions yet.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {[...unscored, ...ranked].map((sub, idx) => (
                <div key={sub.id} className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {!blindMode ? (
                        <div className="h-7 w-7 rounded-full bg-slate-700 overflow-hidden shrink-0">
                          {sub.userAvatar ? <img src={sub.userAvatar} alt="" className="h-full w-full object-cover" /> :
                            <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-slate-400">{(sub.userName || '?')[0]}</div>}
                        </div>
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0"><EyeOff className="h-3 w-3 text-slate-400" /></div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{displayName(sub, idx)}</p>
                        <p className="text-[10px] text-slate-500">{sub.submittedAt?.toDate?.()?.toLocaleDateString() ?? ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {sub.score != null && (
                        <span className="flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-bold text-cyan-400">
                          <Star className="h-3 w-3" />{sub.score}/100
                        </span>
                      )}
                      {sub.isShortlisted && <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">PIPELINE</span>}
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-slate-800 p-3">
                    <p className="whitespace-pre-wrap text-xs text-slate-200">{sub.content}</p>
                  </div>
                  {sub.feedback && (
                    <div className="mt-2 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                      <p className="text-[10px] font-medium text-amber-400 mb-1">Feedback</p>
                      <p className="text-xs text-slate-200">{sub.feedback}</p>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {sub.score == null && scoringId !== sub.id && (
                      <button onClick={() => { setScoringId(sub.id); setScoreValue(0); setFeedbackValue(''); }}
                        className="flex items-center gap-1 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                        <Star className="h-3 w-3" />Score
                      </button>
                    )}
                    {!sub.isShortlisted && (
                      <button onClick={() => handleShortlist(sub.id)} disabled={shortlisting === sub.id}
                        className="flex items-center gap-1 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors">
                        {shortlisting === sub.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                        Move to Pipeline
                      </button>
                    )}
                    {!blindMode && onViewProfile && (
                      <button onClick={() => onViewProfile(sub.userId)} className="text-xs text-slate-400 hover:text-cyan-400 transition-colors">View Profile</button>
                    )}
                  </div>
                  {scoringId === sub.id && (
                    <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-medium text-slate-200">Score (0-100)</label>
                        <input type="number" min={0} max={100} value={scoreValue} onChange={e => setScoreValue(Number(e.target.value))}
                          className="w-20 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200 outline-none focus:border-cyan-500" />
                      </div>
                      <textarea value={feedbackValue} onChange={e => setFeedbackValue(e.target.value)} rows={2}
                        placeholder="Add feedback (visible to candidate)..."
                        className="w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500" />
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleScore(sub.id)} disabled={saving}
                          className="flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors">
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}Submit Score
                        </button>
                        <button onClick={() => setScoringId(null)} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}



// ─── Challenge Detail ─────────────────────────────────────────────────────────

function ChallengeDetail({
  challengeId, onBack, onViewProfile,
}: {
  challengeId: string;
  onBack: () => void;
  onViewProfile?: (userId: number) => void;
}) {
  const { currentUser, fbUser } = useFirebase();
  const [challenge, setChallenge] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [mySubmission, setMySubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [blindMode, setBlindMode] = useState(true);

  const isRecruiter = (currentUser as any)?.isRecruiter ?? false;

  async function load() {
    setLoading(true);
    try {
      const [subs] = await Promise.all([
        getChallengeSubmissions(challengeId).catch(() => []),
      ]);
      setSubmissions(subs);
      if (fbUser) {
        const mine = subs.find((s: any) => s.userId === fbUser.uid);
        if (mine) { setMySubmission(mine); setSubmitted(true); }
      }
    } finally {
      setLoading(false);
    }
  }

  // Load challenge from submissions list (passed from parent)
  useEffect(() => { load(); }, [challengeId]);

  async function handleSubmit() {
    if (!currentUser || !fbUser || !content.trim()) return;
    setSubmitting(true);
    try {
      await submitChallenge(challengeId, {
        userId: fbUser.uid,
        userName: currentUser.name,
        userAvatar: currentUser.avatarUrl,
        content: content.trim(),
      });
      setSubmitted(true); setContent(''); load();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <button onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
        <ArrowLeft className="h-4 w-4" />Back to Challenges
      </button>

      {!submitted && !isRecruiter && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <h2 className="text-sm font-bold text-slate-100">Submit Your Solution</h2>
          <p className="mt-1 text-xs text-slate-400">Top performers earn credits and may be shortlisted. Submissions are anonymous to recruiters by default.</p>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
            placeholder="Write your solution, paste code, or describe your approach..."
            className="mt-3 w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500" />
          <div className="mt-3 flex items-center justify-end">
            <button onClick={handleSubmit} disabled={submitting || !content.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Submit
            </button>
          </div>
        </div>
      )}

      {submitted && !isRecruiter && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-5">
          <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-100">Submission received</p>
            <p className="text-xs text-slate-400">
              {mySubmission?.score != null
                ? `Score: ${mySubmission.score}/100${mySubmission.feedback ? ` — ${mySubmission.feedback}` : ''}`
                : 'Waiting for review from the challenge creator.'}
            </p>
          </div>
        </div>
      )}

      {isRecruiter && (
        <div className="flex items-center justify-end">
          <button onClick={() => setBlindMode(b => !b)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${blindMode ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
            <EyeOff className="h-3.5 w-3.5" />Blind Mode {blindMode ? 'ON' : 'OFF'}
          </button>
        </div>
      )}

      <SubmissionsPanel
        challengeId={challengeId}
        submissions={submissions}
        isRecruiter={isRecruiter}
        blindMode={blindMode}
        onRefresh={load}
        recruiterId={fbUser?.uid}
        onViewProfile={onViewProfile ? (uid) => {
          const user = submissions.find((s: any) => s.userId === uid);
          if (user) onViewProfile(0); // TODO: map uid to numericId
        } : undefined}
      />
    </div>
  );
}

// ─── Create Challenge Dialog ──────────────────────────────────────────────────

function CreateChallengeDialog({
  open, onClose, onCreated, companyName,
}: {
  open: boolean; onClose: () => void; onCreated: () => void; companyName: string;
}) {
  const { fbUser } = useFirebase();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChallengeType>('code');
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>('entry');
  const [timeLimit, setTimeLimit] = useState(60);
  const [credits, setCredits] = useState(50);
  const [badge, setBadge] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [daysUntilExpiry, setDaysUntilExpiry] = useState(14);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  function addSkill() {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) { setSkills([...skills, s]); setSkillInput(''); }
  }

  async function handleCreate() {
    if (!fbUser || !title.trim() || !description.trim()) { setError('Title and description are required.'); return; }
    setError(''); setCreating(true);
    try {
      await createChallenge({
        title: title.trim(), description: description.trim(),
        recruiterId: fbUser.uid, companyName, skills, difficulty, type, timeLimit,
        reward: { credits, badge: badge.trim() || `${title.trim()} Champion`, visibility: true },
        expiresAt: new Date(Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000).toISOString(),
      });
      setTitle(''); setDescription(''); setSkills([]); setBadge('');
      onCreated(); onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create challenge.');
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 transition-colors"><X className="h-5 w-5" /></button>
        <h2 className="text-lg font-bold text-slate-100">Create a Prove Challenge</h2>
        <p className="mt-1 text-xs text-slate-400">Design a quest-style challenge to discover top talent.</p>
        {error && <div className="mt-3 rounded-lg bg-red-900/20 border border-red-500/30 px-3 py-2 text-xs text-red-400">{error}</div>}

        <div className="mt-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-200 mb-1 block">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Build a responsive dashboard"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-200 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Describe what participants need to build, solve, or design..."
              className="w-full resize-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-200 mb-1 block">Type</label>
              <select value={type} onChange={e => setType(e.target.value as ChallengeType)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500">
                {CHALLENGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-200 mb-1 block">Difficulty</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value as ChallengeDifficulty)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500">
                {CHALLENGE_DIFFS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-200 mb-1 block">Time Limit (min)</label>
              <input type="number" min={15} max={480} value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-200 mb-1 block">Expires in (days)</label>
              <input type="number" min={1} max={90} value={daysUntilExpiry} onChange={e => setDaysUntilExpiry(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-200 mb-1 block flex items-center gap-1"><Zap className="h-3 w-3 text-amber-400" />Credits Reward</label>
              <input type="number" min={0} value={credits} onChange={e => setCredits(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-200 mb-1 block">Badge Name</label>
              <input value={badge} onChange={e => setBadge(e.target.value)} placeholder="Auto-generated if empty"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-200 mb-1 block">Required Skills</label>
            <div className="flex gap-2">
              <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                placeholder="Add a skill"
                className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
              <button onClick={addSkill} className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-600 transition-colors">
                <Plus className="h-3 w-3" />Add
              </button>
            </div>
            {skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map(s => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-400">
                    {s}
                    <button onClick={() => setSkills(skills.filter(x => x !== s))}><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleCreate} disabled={creating || !title.trim()}
            className="mt-2 w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors">
            {creating ? 'Creating...' : 'Launch Challenge'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Challenge Card ───────────────────────────────────────────────────────────

function ChallengeCard({ challenge, onClick }: { challenge: any; onClick: () => void }) {
  const diff = DIFF_CONFIG[challenge.difficulty] ?? DIFF_CONFIG.entry;
  const typeConf = TYPE_CONFIG[challenge.type] ?? TYPE_CONFIG.code;
  const TypeIcon = typeConf.icon;
  const expired = challenge.expiresAt ? new Date(challenge.expiresAt) < new Date() : false;
  const daysLeft = challenge.expiresAt
    ? Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <button onClick={onClick} className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 text-left transition-all hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5">
      <div className={`relative bg-gradient-to-r ${typeConf.gradient} px-5 py-4`}>
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900/80">
            <TypeIcon className="h-5 w-5 text-slate-200" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              {[1, 2, 3].map(lvl => (
                <div key={lvl} className={`h-2 w-5 rounded-full ${lvl <= diff.level ? 'bg-slate-100' : 'bg-slate-100/20'}`} />
              ))}
            </div>
            <span className={`text-xs font-bold ${diff.color}`}>{diff.label}</span>
          </div>
        </div>
        {expired && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">EXPIRED</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <div>
          <p className="text-xs font-medium text-slate-400">{challenge.companyName}</p>
          <h3 className="mt-0.5 text-sm font-bold text-slate-100 line-clamp-2 group-hover:text-cyan-400 transition-colors">{challenge.title}</h3>
        </div>
        <p className="text-xs text-slate-400 line-clamp-2">{challenge.description}</p>
        {challenge.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {challenge.skills.slice(0, 3).map((skill: string) => (
              <span key={skill} className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300">{skill}</span>
            ))}
            {challenge.skills.length > 3 && <span className="text-[10px] text-slate-500">+{challenge.skills.length - 3}</span>}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between border-t border-slate-700 pt-3">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{challenge.timeLimit}m</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{challenge.submissionCount || 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {challenge.reward?.credits > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                <Zap className="h-2.5 w-2.5" />{challenge.reward.credits}
              </span>
            )}
            {daysLeft !== null && !expired && (
              <span className={`text-[10px] font-medium ${daysLeft <= 3 ? 'text-red-400' : 'text-slate-500'}`}>{daysLeft}d left</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main Prove View ──────────────────────────────────────────────────────────

interface ProveViewProps {
  onViewProfile?: (userId: number) => void;
}

export function ProveView({ onViewProfile }: ProveViewProps) {
  const { currentUser, fbUser } = useFirebase();
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ChallengeType | 'all'>('all');
  const [diffFilter, setDiffFilter] = useState('all');
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const isRecruiter = (currentUser as any)?.isRecruiter ?? false;

  async function loadChallenges() {
    setLoading(true);
    try { setChallenges(await getChallenges()); }
    catch { setChallenges([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadChallenges(); }, []);

  const filtered = challenges.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (diffFilter !== 'all' && c.difficulty !== diffFilter) return false;
    return true;
  });

  if (activeChallengeId) {
    return <ChallengeDetail challengeId={activeChallengeId} onBack={() => setActiveChallengeId(null)} onViewProfile={onViewProfile} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <Sword className="h-5 w-5 text-cyan-400" />Prove
          </h1>
          <p className="mt-1 text-sm text-slate-400">Skill-based challenges from real companies. Prove your talent, earn credits.</p>
        </div>
        {isRecruiter && (
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors">
            <PlusCircle className="h-4 w-4" />Create Challenge
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-slate-400" />
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(f => (
            <button key={f.value} onClick={() => setTypeFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${typeFilter === f.value ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-700" />
        <div className="flex flex-wrap gap-1.5">
          {DIFFICULTY_FILTERS.map(f => (
            <button key={f.value} onClick={() => setDiffFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${diffFilter === f.value ? 'bg-slate-200 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-16">
          <Sword className="h-10 w-10 text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-400">No challenges match your filters.</p>
          {isRecruiter && (
            <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
              Create the first challenge
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(challenge => (
            <ChallengeCard key={challenge.id} challenge={challenge} onClick={() => setActiveChallengeId(challenge.id)} />
          ))}
        </div>
      )}

      <CreateChallengeDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={loadChallenges}
        companyName={(currentUser as any)?.company ?? (currentUser as any)?.headline ?? 'Company'}
      />
    </div>
  );
}

export default ProveView;
