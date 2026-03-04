import React, { useState } from 'react';
import {
  ChevronRight, ChevronLeft, Calendar, XCircle,
  EyeOff, Eye, StickyNote, Send, User,
  Star, GripVertical, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineCandidate {
  id: string;
  userId: string;
  stage: string;
  status: string;
  notes: { text: string; createdAt: string }[];
  interviewDate?: string;
  challengeScore?: number;
  score?: number;
  jobTitle?: string;
  jobId?: string;
  applicantData?: {
    displayName?: string;
    headline?: string;
    avatarUrl?: string;
    skills?: string[];
  } | null;
}

export interface PipelineStage {
  id: string;
  label: string;
  color: string;
}

export interface TalentPipelineProps {
  stages: PipelineStage[];
  candidates: PipelineCandidate[];
  onMoveCandidate: (candidateId: string, fromStage: string, toStage: string) => Promise<void>;
  onAddNote: (candidateId: string, note: string) => Promise<void>;
  onScheduleInterview: (candidateId: string, date: string) => Promise<void>;
  onRejectCandidate: (candidateId: string, reason: string) => Promise<void>;
  onViewProfile?: (userId: string) => void;
  isBlindMode: boolean;
  onToggleBlindMode: () => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'applied',   label: 'Applied',   color: 'slate'   },
  { id: 'screening', label: 'Screening', color: 'blue'    },
  { id: 'challenge', label: 'Challenge', color: 'purple'  },
  { id: 'interview', label: 'Interview', color: 'cyan'    },
  { id: 'offer',     label: 'Offer',     color: 'green'   },
  { id: 'hired',     label: 'Hired',     color: 'emerald' },
];

// ─── Color map ────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, { border: string; text: string; dot: string; headerBg: string }> = {
  slate:   { border: 'border-slate-700',    text: 'text-slate-400',   dot: 'bg-slate-400',   headerBg: 'bg-slate-800/50' },
  blue:    { border: 'border-blue-500/30',  text: 'text-blue-400',    dot: 'bg-blue-500',    headerBg: 'bg-blue-900/20'  },
  purple:  { border: 'border-purple-500/30',text: 'text-purple-400',  dot: 'bg-purple-500',  headerBg: 'bg-purple-900/20'},
  cyan:    { border: 'border-cyan-500/30',  text: 'text-cyan-400',    dot: 'bg-cyan-500',    headerBg: 'bg-cyan-900/20'  },
  green:   { border: 'border-green-500/30', text: 'text-green-400',   dot: 'bg-green-500',   headerBg: 'bg-green-900/20' },
  emerald: { border: 'border-emerald-500/30',text:'text-emerald-400', dot: 'bg-emerald-500', headerBg: 'bg-emerald-900/20'},
};

function getColors(color: string) {
  return STAGE_COLORS[color] ?? STAGE_COLORS.slate;
}

function blindId(id: string) {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return `Candidate #${(hash % 9000) + 1000}`;
}

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidateCard({
  candidate, stage, stages, isBlindMode,
  onMoveCandidate, onAddNote, onScheduleInterview, onRejectCandidate, onViewProfile,
}: {
  candidate: PipelineCandidate;
  stage: PipelineStage;
  stages: PipelineStage[];
  isBlindMode: boolean;
  onMoveCandidate: TalentPipelineProps['onMoveCandidate'];
  onAddNote: TalentPipelineProps['onAddNote'];
  onScheduleInterview: TalentPipelineProps['onScheduleInterview'];
  onRejectCandidate: TalentPipelineProps['onRejectCandidate'];
  onViewProfile?: TalentPipelineProps['onViewProfile'];
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);

  const stageIdx = stages.findIndex(s => s.id === stage.id);
  const nextStage = stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null;
  const prevStage = stageIdx > 0 ? stages[stageIdx - 1] : null;

  const displayName = isBlindMode ? blindId(candidate.id) : (candidate.applicantData?.displayName ?? 'Unknown');
  const headline = isBlindMode ? 'Skills-based evaluation' : (candidate.applicantData?.headline ?? '');
  const initials = isBlindMode ? '#' : (candidate.applicantData?.displayName ?? '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  async function act(fn: () => Promise<void>) {
    setLoading(true);
    try { await fn(); } finally { setLoading(false); }
  }

  if (candidate.status === 'rejected') return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 shadow-sm hover:shadow-md transition-shadow">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-3 p-3 text-left">
        <GripVertical className="h-4 w-4 text-slate-600" />
        {!isBlindMode && candidate.applicantData?.avatarUrl ? (
          <img src={candidate.applicantData.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-200">{displayName}</p>
          <p className="truncate text-xs text-slate-400">{headline}</p>
        </div>
        {candidate.score && (
          <div className="flex items-center gap-0.5 rounded-full bg-amber-900/30 px-2 py-0.5">
            <Star className="h-3 w-3 text-amber-400" />
            <span className="text-xs font-bold text-amber-400">{candidate.score}</span>
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-700 px-3 pb-3 pt-2 space-y-2">
          {candidate.jobTitle && (
            <p className="text-xs text-slate-400">Applied for <span className="font-medium text-slate-200">{candidate.jobTitle}</span></p>
          )}

          {!isBlindMode && candidate.applicantData?.skills && candidate.applicantData.skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {candidate.applicantData.skills.slice(0, 5).map(s => (
                <span key={s} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{s}</span>
              ))}
            </div>
          )}

          {candidate.challengeScore != null && (
            <p className="text-xs text-slate-400">Challenge Score: <span className="font-bold text-slate-200">{candidate.challengeScore}/100</span></p>
          )}

          {candidate.interviewDate && (
            <div className="flex items-center gap-1.5 rounded-md bg-cyan-900/30 border border-cyan-500/20 px-2 py-1 text-xs text-cyan-400">
              <Calendar className="h-3 w-3" />
              Interview: {new Date(candidate.interviewDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          )}

          {candidate.notes && candidate.notes.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-400">Notes</p>
              {candidate.notes.slice(-3).map((n, i) => (
                <div key={i} className="rounded-md bg-slate-700/50 px-2 py-1 text-xs text-slate-200">
                  {n.text}
                  <span className="ml-1 text-slate-500">{new Date(n.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inline inputs */}
          {showNote && (
            <div className="flex gap-1.5">
              <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." onKeyDown={e => e.key === 'Enter' && act(() => onAddNote(candidate.id, noteText.trim()).then(() => { setNoteText(''); setShowNote(false); }))}
                className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none" />
              <button onClick={() => act(() => onAddNote(candidate.id, noteText.trim()).then(() => { setNoteText(''); setShowNote(false); }))} disabled={loading || !noteText.trim()}
                className="rounded-md bg-cyan-600 px-2 py-1 text-xs text-white disabled:opacity-50">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </button>
            </div>
          )}

          {showSchedule && (
            <div className="flex gap-1.5">
              <input type="datetime-local" value={interviewDate} onChange={e => setInterviewDate(e.target.value)}
                className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none" />
              <button onClick={() => act(() => onScheduleInterview(candidate.id, interviewDate).then(() => { setInterviewDate(''); setShowSchedule(false); }))} disabled={loading || !interviewDate}
                className="rounded-md bg-cyan-600 px-2 py-1 text-xs text-white disabled:opacity-50">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
              </button>
            </div>
          )}

          {showReject && (
            <div className="space-y-1.5">
              <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..."
                className="w-full rounded-md border border-red-500/30 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-red-500 focus:outline-none" />
              <div className="flex gap-1.5">
                <button onClick={() => act(() => onRejectCandidate(candidate.id, rejectReason.trim()).then(() => { setRejectReason(''); setShowReject(false); }))} disabled={loading || !rejectReason.trim()}
                  className="rounded-md bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50">
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm Reject'}
                </button>
                <button onClick={() => setShowReject(false)} className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-200">Cancel</button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {prevStage && (
              <button onClick={() => act(() => onMoveCandidate(candidate.id, stage.id, prevStage.id))} disabled={loading}
                className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 disabled:opacity-50 transition-colors">
                <ChevronLeft className="h-3 w-3" />{prevStage.label}
              </button>
            )}
            {nextStage && (
              <button onClick={() => act(() => onMoveCandidate(candidate.id, stage.id, nextStage.id))} disabled={loading}
                className="inline-flex items-center gap-1 rounded-md bg-cyan-600/20 border border-cyan-500/30 px-2 py-1 text-xs font-medium text-cyan-400 hover:bg-cyan-600/30 disabled:opacity-50 transition-colors">
                {nextStage.label}<ChevronRight className="h-3 w-3" />
              </button>
            )}
            <div className="flex-1" />
            <button onClick={() => { setShowNote(!showNote); setShowSchedule(false); setShowReject(false); }} className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors" title="Add note">
              <StickyNote className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setShowSchedule(!showSchedule); setShowNote(false); setShowReject(false); }} className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-cyan-400 transition-colors" title="Schedule interview">
              <Calendar className="h-3.5 w-3.5" />
            </button>
            {!isBlindMode && onViewProfile && (
              <button onClick={() => onViewProfile(candidate.userId)} className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors" title="View profile">
                <User className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => { setShowReject(!showReject); setShowNote(false); setShowSchedule(false); }} className="rounded-md p-1 text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-colors" title="Reject">
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Column ──────────────────────────────────────────────────────────

function PipelineColumn({ stage, stages, candidates, isBlindMode, onMoveCandidate, onAddNote, onScheduleInterview, onRejectCandidate, onViewProfile }: {
  stage: PipelineStage; stages: PipelineStage[]; candidates: PipelineCandidate[];
  isBlindMode: boolean;
  onMoveCandidate: TalentPipelineProps['onMoveCandidate'];
  onAddNote: TalentPipelineProps['onAddNote'];
  onScheduleInterview: TalentPipelineProps['onScheduleInterview'];
  onRejectCandidate: TalentPipelineProps['onRejectCandidate'];
  onViewProfile?: TalentPipelineProps['onViewProfile'];
}) {
  const colors = getColors(stage.color);
  const stageCandidates = candidates.filter(c => c.stage === stage.id && c.status !== 'rejected');

  return (
    <div className={`flex min-w-[260px] flex-col rounded-xl border ${colors.border} bg-slate-900/50`}>
      <div className={`flex items-center gap-2 rounded-t-xl px-3 py-2.5 ${colors.headerBg}`}>
        <div className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
        <h3 className={`text-xs font-bold uppercase tracking-wide ${colors.text}`}>{stage.label}</h3>
        <span className="ml-auto rounded-full bg-slate-800 px-1.5 py-0.5 text-xs font-bold text-slate-200">{stageCandidates.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {stageCandidates.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-700 py-6">
            <p className="text-xs text-slate-500">No candidates</p>
          </div>
        ) : (
          stageCandidates.map(c => (
            <CandidateCard key={c.id} candidate={c} stage={stage} stages={stages}
              isBlindMode={isBlindMode} onMoveCandidate={onMoveCandidate}
              onAddNote={onAddNote} onScheduleInterview={onScheduleInterview}
              onRejectCandidate={onRejectCandidate} onViewProfile={onViewProfile} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function TalentPipeline({
  stages, candidates, onMoveCandidate, onAddNote, onScheduleInterview,
  onRejectCandidate, onViewProfile, isBlindMode, onToggleBlindMode,
}: TalentPipelineProps) {
  const active = candidates.filter(c => c.status !== 'rejected').length;
  const rejected = candidates.filter(c => c.status === 'rejected').length;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-slate-100">Talent Pipeline</h2>
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-400">{active} active</span>
          {rejected > 0 && <span className="rounded-full bg-red-900/30 border border-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">{rejected} rejected</span>}
        </div>
        <button onClick={onToggleBlindMode}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${isBlindMode ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
          {isBlindMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {isBlindMode ? 'Blind Mode ON' : 'Blind Mode'}
        </button>
      </div>

      {/* Stage legend */}
      <div className="flex flex-wrap gap-3">
        {stages.map(s => {
          const colors = getColors(s.color);
          const count = candidates.filter(c => c.stage === s.id && c.status !== 'rejected').length;
          return (
            <div key={s.id} className="flex items-center gap-1.5 text-xs text-slate-400">
              <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
              <span>{s.label}</span>
              <span className="font-bold text-slate-200">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Board */}
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-3" style={{ minWidth: `${stages.length * 280}px` }}>
          {stages.map(stage => (
            <PipelineColumn key={stage.id} stage={stage} stages={stages} candidates={candidates}
              isBlindMode={isBlindMode} onMoveCandidate={onMoveCandidate}
              onAddNote={onAddNote} onScheduleInterview={onScheduleInterview}
              onRejectCandidate={onRejectCandidate} onViewProfile={onViewProfile} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default TalentPipeline;
