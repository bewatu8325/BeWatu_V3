import React, { useState, useEffect } from 'react';
import {
  Briefcase, Users, ChevronRight, ChevronDown, Loader2,
  MessageSquare, Calendar, Star, Search, Award,
  MapPin, Clock, Filter, ArrowLeft, ExternalLink,
  CheckCircle, XCircle, AlertCircle, Inbox,
} from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  fetchJobsForRecruiter,
  fetchApplicantsForJob,
  updateApplicationStage,
  addPipelineNote,
} from '../../lib/firestoreService';
import { PIPELINE_STAGES, type ApplicationStage } from '../../lib/applicationStage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Applicant {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userHeadline: string;
  userLocation?: string;
  userSkills?: string[];
  appliedAt: any;
  stage: ApplicationStage;
  source: 'applied' | 'prove' | 'sourced';
  notes?: { text: string; createdAt: string }[];
  score?: number;
}

interface JobWithCount {
  id: number;
  _firestoreId: string;
  title: string;
  location: string;
  type: string;
  status: string;
  applicantCount: number;
  newCount: number;
  liveDate: string;
  expiryDate: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Schema decision 2, part 2 (launch-readiness review): this used to be a
// separate 5-value `status` vocabulary (new/reviewing/shortlisted/rejected/
// hired) that didn't recognize 'applied' -- the value the real "Apply" flow
// actually writes -- and crashed this whole component for every normally-
// applied candidate. Now keyed on the same canonical `stage` vocabulary
// TalentPipeline.tsx uses, via lib/applicationStage.ts.
const STAGE_CONFIG: Record<ApplicationStage, { label: string; color: string; bg: string; icon: typeof AlertCircle }> = {
  'New Applicants': { label: 'New',        color: 'text-[#1a6b52]', bg: 'bg-[#e8f4f0] border-[#1a4a3a]/20',    icon: AlertCircle },
  Sourced:          { label: 'Sourced',    color: 'text-sky-600',   bg: 'bg-sky-500/10 border-sky-500/20',     icon: Search      },
  Screening:        { label: 'Screening',  color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: Clock       },
  Interview:        { label: 'Interview',  color: 'text-indigo-500',bg: 'bg-indigo-500/10 border-indigo-500/20', icon: Calendar  },
  Offer:            { label: 'Offer',      color: 'text-purple-400',bg: 'bg-purple-500/10 border-purple-500/20', icon: Award     },
  Hired:            { label: 'Hired',      color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', icon: CheckCircle },
  Rejected:         { label: 'Rejected',   color: 'text-red-600',   bg: 'bg-red-500/10 border-red-500/20',     icon: XCircle     },
};

const STAGE_ORDER: ApplicationStage[] = PIPELINE_STAGES;

// ─── Applicant Card ───────────────────────────────────────────────────────────

function ApplicantCard({
  applicant,
  onStageChange,
  onViewProfile,
  onAddNote,
  isBlind,
  index,
}: {
  applicant: Applicant;
  onStageChange: (id: string, stage: ApplicationStage) => void;
  onViewProfile?: (userId: string) => void;
  onAddNote: (id: string, note: string) => void;
  isBlind: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [changingStage, setChangingStage] = useState(false);

  // Fallback guards against any stage value STAGE_CONFIG doesn't know about
  // (this crashed the whole app for every normally-applied candidate before
  // the old status/stage vocabularies were unified -- see git history).
  const cfg = STAGE_CONFIG[applicant.stage] ?? STAGE_CONFIG['New Applicants'];
  const StatusIcon = cfg.icon;
  const displayName = isBlind ? `Candidate #${index + 1}` : (applicant.userName || 'Unknown');
  const displayAvatar = isBlind ? null : applicant.userAvatar;

  async function handleStageChange(stage: ApplicationStage) {
    setChangingStage(true);
    try { await onStageChange(applicant.id, stage); }
    finally { setChangingStage(false); }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await onAddNote(applicant.id, noteText.trim());
      setNoteText('');
    } finally { setSavingNote(false); }
  }

  const appliedDate = applicant.appliedAt?.toDate?.()?.toLocaleDateString() ?? 'Recently';

  return (
    <div className={`rounded-xl border transition-all ${expanded ? 'border-[#1a4a3a]/30 bg-white/80' : 'border-stone-200 bg-white/40 hover:border-stone-200'}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Avatar */}
        <div className="shrink-0">
          {displayAvatar ? (
            <img src={displayAvatar} alt="" className="h-10 w-10 rounded-full object-cover border border-stone-200" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-stone-100 flex items-center justify-center text-sm font-bold text-stone-600">
              {isBlind ? `C${index + 1}` : (applicant.userName?.[0] ?? '?')}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-stone-900">{displayName}</p>
            {applicant.source === 'prove' && (
              <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-400">PROVE</span>
            )}
            {applicant.score != null && (
              <span className="flex items-center gap-0.5 text-xs text-amber-400">
                <Star className="h-3 w-3" />{applicant.score}
              </span>
            )}
          </div>
          {!isBlind && (
            <p className="text-xs text-stone-600 truncate mt-0.5">{applicant.userHeadline}</p>
          )}
        </div>

        {/* Status + date */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
            <StatusIcon className="h-3 w-3" />{cfg.label}
          </span>
          <span className="text-[10px] text-stone-600">{appliedDate}</span>
        </div>

        <ChevronDown className={`h-4 w-4 text-stone-600 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-stone-200 p-4 space-y-4">
          {/* Skills */}
          {!isBlind && applicant.userSkills && applicant.userSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {applicant.userSkills.slice(0, 8).map(s => (
                <span key={s} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">{s}</span>
              ))}
            </div>
          )}

          {/* Location */}
          {!isBlind && applicant.userLocation && (
            <p className="flex items-center gap-1.5 text-xs text-stone-600">
              <MapPin className="h-3.5 w-3.5" />{applicant.userLocation}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {STAGE_ORDER.filter(s => s !== applicant.stage).map(stage => {
              const c = STAGE_CONFIG[stage];
              return (
                <button
                  key={stage}
                  onClick={() => handleStageChange(stage)}
                  disabled={changingStage}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${c.bg} ${c.color} hover:opacity-80`}
                >
                  <c.icon className="h-3 w-3" />
                  Move to {c.label}
                </button>
              );
            })}
            {!isBlind && onViewProfile && (
              <button
                onClick={() => onViewProfile(applicant.userId)}
                className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />View Profile
              </button>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            {applicant.notes && applicant.notes.length > 0 && (
              <div className="space-y-1.5">
                {applicant.notes.map((note, i) => (
                  <div key={i} className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-700 border border-stone-200">
                    <p>{note.text}</p>
                    <p className="text-[10px] text-stone-600 mt-1">{new Date(note.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                placeholder="Add a private note..."
                className="flex-1 rounded-lg border  bg-stone-50 px-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-600 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}
              />
              <button
                onClick={handleAddNote}
                disabled={savingNote || !noteText.trim()}
                className="flex items-center gap-1 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-200 disabled:opacity-50 transition-colors"
              >
                {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────

function JobRow({ job, isSelected, onClick }: { job: JobWithCount; isSelected: boolean; onClick: () => void }) {
  const expired = new Date(job.expiryDate) < new Date();
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
        isSelected
          ? 'border-[#1a4a3a]/40 bg-[#1a4a3a]/5'
          : 'border-stone-200 bg-white/40 hover:border-stone-200'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100">
        <Briefcase className="h-4 w-4 text-stone-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-stone-900 truncate">{job.title}</p>
        <p className="text-xs text-stone-600 truncate">{job.location} · {job.type}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="flex items-center gap-1 text-sm font-bold text-stone-800">
          <Users className="h-3.5 w-3.5 text-stone-600" />{job.applicantCount}
        </span>
        {job.newCount > 0 && (
          <span className="rounded-full bg-[#1a4a3a] px-1.5 py-0.5 text-[10px] font-bold text-white">
            {job.newCount} new
          </span>
        )}
        {expired && (
          <span className="text-[10px] text-red-600">Expired</span>
        )}
      </div>
      <ChevronRight className={`h-4 w-4 text-stone-600 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-[#1a6b52]' : ''}`} />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ApplicantInboxProps {
  onViewProfile?: (userId: number) => void;
}

export function ApplicantInbox({ onViewProfile }: ApplicantInboxProps) {
  const { fbUser } = useFirebase();
  const [jobs, setJobs] = useState<JobWithCount[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [stageFilter, setStageFilter] = useState<ApplicationStage | 'all'>('all');
  const [isBlind, setIsBlind] = useState(false);
  const [mobileShowApplicants, setMobileShowApplicants] = useState(false);

  // Load recruiter's jobs
  useEffect(() => {
    if (!fbUser) return;
    setLoadingJobs(true);
    fetchJobsForRecruiter(fbUser.uid)
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [fbUser]);

  // Load applicants when job selected
  useEffect(() => {
    if (!selectedJobId) { setApplicants([]); return; }
    setLoadingApplicants(true);
    // fetchApplicantsForJob already normalizes each applicant's `stage` via
    // deriveApplicationStage (lib/applicationStage.ts), so every document
    // -- however it was created, whatever vintage of the old dual stage/
    // status vocabulary it still carries -- arrives with a real, canonical
    // value here.
    fetchApplicantsForJob(selectedJobId)
      .then(setApplicants)
      .catch(console.error)
      .finally(() => setLoadingApplicants(false));
  }, [selectedJobId]);

  async function handleStageChange(applicationId: string, stage: ApplicationStage) {
    await updateApplicationStage(applicationId, stage);
    setApplicants(prev => prev.map(a => a.id === applicationId ? { ...a, stage } : a));
    // Update new count on job
    setJobs(prev => prev.map(j => j._firestoreId === selectedJobId
      ? { ...j, newCount: j.newCount - (stage !== 'New Applicants' ? 1 : 0) }
      : j
    ));
  }

  async function handleAddNote(applicationId: string, note: string) {
    await addPipelineNote(applicationId, note);
    setApplicants(prev => prev.map(a =>
      a.id === applicationId
        ? { ...a, notes: [...(a.notes ?? []), { text: note, createdAt: new Date().toISOString() }] }
        : a
    ));
  }

  function selectJob(firestoreId: string) {
    setSelectedJobId(firestoreId);
    setStageFilter('all');
    setMobileShowApplicants(true);
  }

  const selectedJob = jobs.find(j => j._firestoreId === selectedJobId);
  const filtered = applicants.filter(a => stageFilter === 'all' || a.stage === stageFilter);

  const stageCounts = applicants.reduce((acc, a) => {
    acc[a.stage] = (acc[a.stage] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-stone-900">
            <Inbox className="h-5 w-5 text-[#1a6b52]" />Applicant Inbox
          </h1>
          <p className="mt-0.5 text-sm text-stone-600">
            {jobs.length} active {jobs.length === 1 ? 'role' : 'roles'} · {jobs.reduce((s, j) => s + j.applicantCount, 0)} total applicants
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Job list — hidden on mobile when viewing applicants */}
        <div className={`lg:col-span-1 flex flex-col gap-2 ${mobileShowApplicants ? 'hidden lg:flex' : 'flex'}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-600 px-1">Your Roles</p>
          {loadingJobs ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-stone-600" /></div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 py-12 text-center">
              <Briefcase className="h-8 w-8 text-stone-600" />
              <p className="mt-2 text-sm text-stone-600">No active job postings yet.</p>
              <p className="text-xs text-stone-600 mt-1">Post a role in Manage Jobs to see applicants here.</p>
            </div>
          ) : (
            jobs.map(job => (
              <JobRow
                key={job._firestoreId}
                job={job}
                isSelected={selectedJobId === job._firestoreId}
                onClick={() => selectJob(job._firestoreId)}
              />
            ))
          )}
        </div>

        {/* Applicant list */}
        <div className={`lg:col-span-2 flex flex-col gap-3 ${!mobileShowApplicants ? 'hidden lg:flex' : 'flex'}`}>
          {!selectedJobId ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 py-20 text-center">
              <Users className="h-10 w-10 text-stone-600" />
              <p className="mt-3 text-sm text-stone-600">Select a role to view applicants</p>
            </div>
          ) : (
            <>
              {/* Subheader */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setMobileShowApplicants(false)}
                  className="lg:hidden flex items-center gap-1 text-xs text-stone-600 hover:text-stone-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />Back
                </button>
                <h2 className="text-sm font-bold text-stone-900 flex-1">{selectedJob?.title}</h2>
                {/* Blind mode toggle */}
                <button
                  onClick={() => setIsBlind(b => !b)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isBlind ? 'bg-stone-200 text-stone-800' : 'bg-stone-100/50 text-stone-600 hover:text-stone-800'
                  }`}
                >
                  Blind Mode {isBlind ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Stage filter tabs */}
              <div className="flex gap-1.5 flex-wrap">
                {(['all', ...STAGE_ORDER] as const).map(s => {
                  const count = s === 'all' ? applicants.length : (stageCounts[s] ?? 0);
                  const cfg = s === 'all' ? null : STAGE_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => setStageFilter(s)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        stageFilter === s
                          ? s === 'all' ? 'bg-[#1a4a3a] text-white' : `${cfg!.bg} ${cfg!.color} border`
                          : 'bg-stone-100/50 text-stone-600 hover:text-stone-800'
                      }`}
                    >
                      {s === 'all' ? 'All' : STAGE_CONFIG[s].label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        stageFilter === s ? 'bg-stone-100 text-stone-800' : 'bg-stone-100 text-stone-600'
                      }`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Applicant cards */}
              {loadingApplicants ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-stone-600" /></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 py-12 text-center">
                  <Filter className="h-8 w-8 text-stone-600" />
                  <p className="mt-2 text-sm text-stone-600">
                    {applicants.length === 0 ? 'No applicants yet for this role.' : 'No applicants match this filter.'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 overflow-y-auto">
                  {filtered.map((applicant, i) => (
                    <ApplicantCard
                      key={applicant.id}
                      applicant={applicant}
                      index={i}
                      isBlind={isBlind}
                      onStageChange={handleStageChange}
                      onAddNote={handleAddNote}
                      onViewProfile={onViewProfile ? (uid) => {
                        const numId = applicants.find(a => a.userId === uid)?.userId;
                        if (numId) onViewProfile(Number(numId));
                      } : undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ApplicantInbox;
