import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { PIPELINE_STAGES } from '../../lib/applicationStage';

// ── Exported types & constants expected by RecruiterConsole ───────────────────
export interface PipelineCandidate {
  id: string;
  userId: number;
  stage: string;
  name: string;
  headline: string;
  avatarUrl: string;
  notes?: string;
  addedAt?: string;
  // Hydrated from the applicant's real profile by getPipelineCandidates —
  // optional because a candidate can still render (with placeholders)
  // even if the profile lookup fails.
  bio?: string;
  skills?: { name: string; endorsements?: number }[];
  availability?: string;
  values?: string[];
  isVerified?: boolean;
  applicantUid?: string;
}

// Schema decision 2, part 2 (launch-readiness review): sourced from the
// single canonical stage vocabulary shared with lib/firestoreService.ts
// and ApplicantInbox.tsx, rather than a locally-duplicated list. Includes
// 'Rejected' as a real column now -- a rejected candidate used to leave
// the board entirely (see RecruiterConsole.tsx's onReject before this).
export const DEFAULT_PIPELINE_STAGES: string[] = PIPELINE_STAGES;

// ── Expanded card: bio/skills/availability/values + the action row ────────────

interface ExpandedPipelineViewProps {
  candidate: PipelineCandidate;
  stages: string[];
  isBlindMode: boolean;
  onMoveCandidate?: (id: string, to: string) => Promise<void>;
  onAddNote?: (id: string, note: string) => Promise<void>;
  onScheduleInterview?: (id: string) => void;
  onReject?: (id: string, reason: string) => Promise<void>;
  onViewProfile?: (userId: string) => void;
}

const ExpandedPipelineView: React.FC<ExpandedPipelineViewProps> = ({
  candidate, stages, isBlindMode,
  onMoveCandidate, onAddNote, onScheduleInterview, onReject, onViewProfile,
}) => {
  const { t } = useTranslation();
  const [noteText, setNoteText]     = useState('');
  const [isSavingNote, setSavingNote] = useState(false);
  const [isRejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isMoving, setMoving]       = useState(false);

  const topSkills = (candidate.skills ?? []).slice(0, 3).map(s => s.name).join(', ');

  const handleMove = async (to: string) => {
    if (!onMoveCandidate || to === candidate.stage) return;
    setMoving(true);
    try { await onMoveCandidate(candidate.id, to); } finally { setMoving(false); }
  };

  const handleAddNote = async () => {
    if (!onAddNote || !noteText.trim()) return;
    setSavingNote(true);
    try { await onAddNote(candidate.id, noteText.trim()); setNoteText(''); }
    finally { setSavingNote(false); }
  };

  const handleConfirmReject = async () => {
    if (!onReject || !rejectReason.trim()) return;
    await onReject(candidate.id, rejectReason.trim());
    setRejecting(false);
  };

  return (
    <div className="bg-stone-50/70 p-4 rounded-b-lg border border-stone-200 border-t-0 -mt-1 animate-fade-in-up space-y-3">
      {candidate.bio && <p className="text-sm text-stone-700 line-clamp-3">{candidate.bio}</p>}
      <div className="text-xs space-y-1">
        <p><strong className="text-stone-600 font-semibold">{t('topSkills')}:</strong> <span className="text-[#1a6b52]">{topSkills || 'N/A'}</span></p>
        <p><strong className="text-stone-600 font-semibold">{t('availability')}:</strong> {candidate.availability ?? 'N/A'}</p>
        <p><strong className="text-stone-600 font-semibold">{t('values')}:</strong> {(candidate.values ?? []).join(', ') || 'N/A'}</p>
        {candidate.notes && (
          <p className="whitespace-pre-line pt-1 border-t border-stone-200 mt-1"><strong className="text-stone-600 font-semibold">Notes:</strong> {candidate.notes}</p>
        )}
      </div>

      {/* ── Action row ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-200">
        <select
          value={candidate.stage}
          disabled={isMoving}
          onChange={(e) => handleMove(e.target.value)}
          className="text-xs border border-stone-300 rounded px-2 py-1 bg-white disabled:opacity-50"
          onClick={(e) => e.stopPropagation()}
        >
          {stages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {onScheduleInterview && (
          <button
            onClick={(e) => { e.stopPropagation(); onScheduleInterview(candidate.id); }}
            className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 text-stone-700"
          >
            Schedule interview
          </button>
        )}

        {!isBlindMode && onViewProfile && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewProfile(String(candidate.userId)); }}
            className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 text-stone-700"
          >
            View profile
          </button>
        )}

        {onReject && !isRejecting && (
          <button
            onClick={(e) => { e.stopPropagation(); setRejecting(true); }}
            className="text-xs px-2 py-1 rounded border border-red-200 bg-white hover:bg-red-50 text-red-600"
          >
            Reject
          </button>
        )}
      </div>

      {isRejecting && (
        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (visible in your own notes only)"
            className="flex-1 min-w-[160px] text-xs border border-stone-300 rounded px-2 py-1"
          />
          <button
            onClick={handleConfirmReject}
            disabled={!rejectReason.trim()}
            className="text-xs px-2 py-1 rounded bg-red-600 text-white disabled:opacity-40"
          >
            Confirm reject
          </button>
          <button
            onClick={() => { setRejecting(false); setRejectReason(''); }}
            className="text-xs px-2 py-1 rounded border border-stone-300 bg-white"
          >
            Cancel
          </button>
        </div>
      )}

      {onAddNote && (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 text-xs border border-stone-300 rounded px-2 py-1"
          />
          <button
            onClick={handleAddNote}
            disabled={isSavingNote || !noteText.trim()}
            className="text-xs px-2 py-1 rounded bg-[#1a4a3a] text-white disabled:opacity-40"
          >
            {isSavingNote ? '…' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Card ────────────────────────────────────────────────────────────────────

interface CandidateCardProps {
  candidate: PipelineCandidate;
  displayNumber: number;
  isBlindMode: boolean;
  onClick: () => void;
}

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, displayNumber, isBlindMode, onClick }) => (
  <button onClick={onClick} className="w-full text-left p-3 bg-white rounded-md border border-stone-200 cursor-pointer hover:bg-stone-100/50 transition-colors">
    <div className="flex items-center space-x-2">
      <img
        src={isBlindMode ? `https://i.pravatar.cc/150?u=${candidate.id}` : candidate.avatarUrl}
        alt={isBlindMode ? `Candidate #${displayNumber}` : candidate.name}
        className={`w-8 h-8 rounded-full object-cover ${isBlindMode ? 'filter grayscale' : ''}`}
      />
      <div>
        <p className="text-sm font-semibold text-stone-800">
          {isBlindMode ? `Candidate #${displayNumber}` : candidate.name}
        </p>
        <p className="text-xs text-stone-600 truncate">{isBlindMode ? '' : candidate.headline}</p>
      </div>
    </div>
  </button>
);

// ── Column ──────────────────────────────────────────────────────────────────

interface PipelineColumnProps {
  title: string;
  candidates: PipelineCandidate[];
  stages: string[];
  isBlindMode: boolean;
  expandedCandidateId: string | null;
  onToggleExpand: (id: string) => void;
  onMoveCandidate?: (id: string, to: string) => Promise<void>;
  onAddNote?: (id: string, note: string) => Promise<void>;
  onScheduleInterview?: (id: string) => void;
  onReject?: (id: string, reason: string) => Promise<void>;
  onViewProfile?: (userId: string) => void;
}

const PipelineColumn: React.FC<PipelineColumnProps> = ({
  title, candidates, stages, isBlindMode, expandedCandidateId, onToggleExpand,
  onMoveCandidate, onAddNote, onScheduleInterview, onReject, onViewProfile,
}) => (
  <div className="flex-shrink-0 w-[260px] sm:w-72 bg-white rounded-lg border border-stone-200">
    <h3 className="p-3 text-md font-semibold text-stone-900 border-b border-stone-200 flex justify-between items-center">
      {title}
      <span className="text-sm font-normal text-stone-600 bg-stone-100 px-2 rounded-full">{candidates.length}</span>
    </h3>
    <div className="p-2 space-y-2 h-[calc(100vh-22rem)] sm:h-[calc(100vh-20rem)] overflow-y-auto">
      {candidates.map((candidate, i) => (
        <div key={candidate.id}>
          <CandidateCard
            candidate={candidate}
            displayNumber={i + 1}
            isBlindMode={isBlindMode}
            onClick={() => onToggleExpand(candidate.id)}
          />
          {expandedCandidateId === candidate.id && (
            <ExpandedPipelineView
              candidate={candidate}
              stages={stages}
              isBlindMode={isBlindMode}
              onMoveCandidate={onMoveCandidate}
              onAddNote={onAddNote}
              onScheduleInterview={onScheduleInterview}
              onReject={onReject}
              onViewProfile={onViewProfile}
            />
          )}
        </div>
      ))}
      {candidates.length === 0 && (
        <p className="text-xs text-stone-600 text-center py-6">No candidates</p>
      )}
    </div>
  </div>
);

// ── Board ───────────────────────────────────────────────────────────────────

interface TalentPipelinesProps {
  stages: string[];
  pipelineData: { [key: string]: PipelineCandidate[] };
  isBlindMode: boolean;
  onMoveCandidate?: (id: string, to: string) => Promise<void>;
  onAddNote?: (id: string, note: string) => Promise<void>;
  onScheduleInterview?: (id: string) => void;
  onReject?: (id: string, reason: string) => Promise<void>;
  onViewProfile?: (userId: string) => void;
  onToggleBlindMode?: () => void;
}

const TalentPipelines: React.FC<TalentPipelinesProps> = ({
  stages, pipelineData, isBlindMode,
  onMoveCandidate, onAddNote, onScheduleInterview, onReject, onViewProfile, onToggleBlindMode,
}) => {
  const { t } = useTranslation();
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);

  const handleToggleExpand = (id: string) => {
    setExpandedCandidateId(prevId => (prevId === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{t('talentPipelines')}</h1>
          <p className="text-stone-600 text-sm mt-1">{t('talentPipelinesDesc')}</p>
        </div>
        {onToggleBlindMode && (
          <button
            onClick={onToggleBlindMode}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              isBlindMode ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-stone-300 text-stone-600'
            }`}
          >
            {isBlindMode ? 'Blind mode: on' : 'Blind mode: off'}
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {stages.map(columnTitle => (
          <PipelineColumn
            key={columnTitle}
            title={columnTitle}
            candidates={pipelineData[columnTitle] || []}
            stages={stages}
            isBlindMode={isBlindMode}
            expandedCandidateId={expandedCandidateId}
            onToggleExpand={handleToggleExpand}
            onMoveCandidate={onMoveCandidate}
            onAddNote={onAddNote}
            onScheduleInterview={onScheduleInterview}
            onReject={onReject}
            onViewProfile={onViewProfile}
          />
        ))}
      </div>
    </div>
  );
};

// ── Exported wrapper — buckets `candidates` by `stage` into pipelineData and
// threads every callback down into the real UI controls above. Previously
// this dropped candidates/onMoveCandidate/onAddNote/onScheduleInterview/
// onReject/onViewProfile/isBlindMode/onToggleBlindMode entirely and always
// rendered six empty columns — see RecruiterConsole.tsx's history for the
// original finding. ──────────────────────────────────────────────────────────
export const TalentPipeline: React.FC<{
  stages?: string[];
  candidates?: PipelineCandidate[];
  pipelineData?: { [key: string]: PipelineCandidate[] };
  onMoveCandidate?: (id: string, to: string) => Promise<void>;
  onAddNote?: (id: string, note: string) => Promise<void>;
  onScheduleInterview?: (id: string) => void;
  onReject?: (id: string, reason: string) => Promise<void>;
  onViewProfile?: (userId: string) => void;
  isBlindMode?: boolean;
  onToggleBlindMode?: () => void;
}> = ({
  stages = DEFAULT_PIPELINE_STAGES, candidates, pipelineData,
  onMoveCandidate, onAddNote, onScheduleInterview, onReject, onViewProfile,
  isBlindMode = false, onToggleBlindMode,
}) => {
  const data: { [key: string]: PipelineCandidate[] } = pipelineData
    ? Object.fromEntries(stages.map(s => [s, pipelineData[s] ?? []]))
    : Object.fromEntries(stages.map(s => [s, []]));

  if (!pipelineData && candidates) {
    for (const c of candidates) {
      const stage = stages.includes(c.stage) ? c.stage : stages[0];
      data[stage].push(c);
    }
  }

  return (
    <TalentPipelines
      stages={stages}
      pipelineData={data}
      isBlindMode={isBlindMode}
      onMoveCandidate={onMoveCandidate}
      onAddNote={onAddNote}
      onScheduleInterview={onScheduleInterview}
      onReject={onReject}
      onViewProfile={onViewProfile}
      onToggleBlindMode={onToggleBlindMode}
    />
  );
};

export default TalentPipelines;
