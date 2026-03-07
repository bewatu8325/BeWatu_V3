/**
 * ManageJobsView.tsx
 * Recruiter job management table — stone/green theme, verification-aware.
 *
 * Behaviour by verificationStatus:
 *  - 'unverified'  → full lock notice, "Post a New Role" hidden
 *  - 'pending'     → amber "under review" banner, "Post a New Role" hidden, jobs listed (drafts visible)
 *  - 'rejected'    → red notice, "Post a New Role" hidden
 *  - 'verified'    → full access, all controls shown
 *  - 'suspended'   → red suspension banner, all controls locked
 */
import React, { useState } from 'react';
import {
  Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  Clock, CheckCircle, XCircle, AlertTriangle, CalendarDays,
  Briefcase, ChevronRight,
} from 'lucide-react';
import { Job, Company } from '../types';
import JobEditorModal from './recruiter/JobEditorModal';
import { useTranslation } from '../hooks/useTranslation';
import type { CompanyVerificationStatus } from '../lib/verification';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface ManageJobsViewProps {
  jobs:               Job[];
  companies:          Company[];
  recruiterId:        number;
  verificationStatus: CompanyVerificationStatus;
  onAddJob:           (jobData: Omit<Job, 'id'>) => void;
  onUpdateJob:        (job: Job) => void;
  onDeleteJob:        (jobId: number) => void;
  onToggleJobStatus:  (jobId: number, currentStatus: 'Active' | 'Suspended') => void;
  onGoToVerification: () => void;
}

// ── Status badge ────────────────────────────────────────────────────────────
const JobStatusBadge: React.FC<{ job: Job }> = ({ job }) => {
  const now        = new Date();
  const liveDate   = new Date(job.liveDate);
  const expiryDate = new Date(job.expiryDate);

  if (job.status === 'Suspended') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Suspended
      </span>
    );
  }
  if (now > expiryDate) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-50 text-red-600 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Expired
      </span>
    );
  }
  if (now < liveDate) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-stone-100 text-stone-600 border border-stone-200">
        <CalendarDays className="w-3 h-3" />
        Scheduled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full border"
      style={{ background: GREEN_LT, color: GREEN, borderColor: '#b6ddd2' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
      Active
    </span>
  );
};

// ── Pending review banner ────────────────────────────────────────────────────
function PendingBanner({ onGoToVerification }: { onGoToVerification: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Clock className="w-5 h-5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-amber-900">Verification under review</p>
        <p className="text-sm text-amber-700 mt-0.5 leading-relaxed">
          Your company verification is being reviewed by our team. Job listings will go live automatically once approved — usually within 1–2 business days.
        </p>
      </div>
      <button
        onClick={onGoToVerification}
        className="flex-shrink-0 flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors"
      >
        View status <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Lock notice (unverified / rejected / suspended) ─────────────────────────
function LockNotice({
  status,
  onGoToVerification,
}: {
  status: CompanyVerificationStatus;
  onGoToVerification: () => void;
}) {
  const isRejected  = status === 'rejected';
  const isSuspended = status === 'suspended';

  const icon = isSuspended || isRejected
    ? <XCircle className="w-7 h-7" />
    : <Briefcase className="w-7 h-7" />;

  const title = isSuspended
    ? 'Account suspended'
    : isRejected
    ? 'Verification rejected'
    : 'Verification required to post jobs';

  const body = isSuspended
    ? 'Your company account has been suspended. Contact support to resolve this.'
    : isRejected
    ? 'Your verification was not approved. Please resubmit with additional information.'
    : 'Job listings from unverified companies are not shown to candidates. Complete verification in under 2 minutes.';

  const btnLabel = isSuspended ? 'Contact support' : isRejected ? 'Resubmit verification' : 'Verify company';
  const btnBg    = isSuspended || isRejected ? '#dc2626' : GREEN;

  return (
    <div className="rounded-2xl border p-8 flex flex-col items-center text-center gap-4"
      style={{
        background:   isSuspended || isRejected ? '#fef2f2' : '#fafaf9',
        borderColor:  isSuspended || isRejected ? '#fecaca' : '#e7e5e4',
      }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{
          background: isSuspended || isRejected ? '#fee2e2' : GREEN_LT,
          color:      isSuspended || isRejected ? '#dc2626' : GREEN,
        }}>
        {icon}
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="font-black text-stone-900">{title}</p>
        <p className="text-sm text-stone-500 leading-relaxed">{body}</p>
      </div>
      {!isSuspended && (
        <button
          onClick={onGoToVerification}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-black text-white hover:opacity-90 transition-opacity"
          style={{ background: btnBg }}
        >
          {btnLabel} <ChevronRight className="w-4 h-4" />
        </button>
      )}
      {!isSuspended && !isRejected && (
        <p className="text-xs text-stone-400">Takes under 2 minutes · Work email or document review</p>
      )}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onPost }: { onPost: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: GREEN_LT }}>
        <Briefcase className="w-7 h-7" style={{ color: GREEN }} />
      </div>
      <p className="font-bold text-stone-700">No jobs posted yet</p>
      <p className="text-sm text-stone-400 max-w-xs">Post your first role to start attracting verified talent on BeWatu.</p>
      <button
        onClick={onPost}
        className="mt-1 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white hover:opacity-90 transition-opacity"
        style={{ background: GREEN }}
      >
        <Plus className="w-4 h-4" /> Post a role
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
const ManageJobsView: React.FC<ManageJobsViewProps> = ({
  jobs,
  companies,
  recruiterId,
  verificationStatus,
  onAddJob,
  onUpdateJob,
  onDeleteJob,
  onToggleJobStatus,
  onGoToVerification,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJob,  setEditingJob]  = useState<Job | null>(null);
  const { t } = useTranslation();

  const isVerified  = verificationStatus === 'verified';
  const isPending   = verificationStatus === 'pending';
  const canPost     = isVerified;

  const openCreate = () => { setEditingJob(null);  setIsModalOpen(true); };
  const openEdit   = (job: Job) => { setEditingJob(job); setIsModalOpen(true); };

  const getCompanyName = (companyId: number) =>
    companies.find(c => c.id === companyId)?.name ?? 'Unknown company';

  return (
    <div className="px-4 py-6 md:px-6 space-y-5 bg-stone-50 min-h-full">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-stone-900">Manage Jobs</h1>
          <p className="text-sm text-stone-500 mt-0.5">Post and manage your open roles.</p>
        </div>
        {canPost && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white hover:opacity-90 transition-opacity flex-shrink-0"
            style={{ background: GREEN }}
          >
            <Plus className="w-4 h-4" /> Post a New Role
          </button>
        )}
      </div>

      {/* Verification state notices */}
      {isPending && <PendingBanner onGoToVerification={onGoToVerification} />}
      {!isVerified && !isPending && (
        <LockNotice status={verificationStatus} onGoToVerification={onGoToVerification} />
      )}

      {/* Jobs table — shown for all states so pending/unverified can see draft jobs */}
      {(isVerified || isPending || jobs.length > 0) && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          {jobs.length === 0 ? (
            isVerified
              ? <EmptyState onPost={openCreate} />
              : (
                <div className="text-center py-10 text-sm text-stone-400">
                  No jobs posted yet.
                </div>
              )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                {/* thead */}
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    {['Job title', 'Company', 'Live date', 'Expiry date', 'Status', 'Actions'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-[10px] font-black text-stone-400 uppercase tracking-wider ${i === 5 ? 'text-right' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* tbody */}
                <tbody>
                  {jobs.map((job, idx) => (
                    <tr
                      key={job.id}
                      className={`border-b border-stone-50 last:border-0 hover:bg-stone-50 transition-colors ${!isVerified ? 'opacity-60' : ''}`}
                    >
                      <td className="px-5 py-4 font-bold text-stone-900 max-w-[200px] truncate">
                        {job.title}
                      </td>
                      <td className="px-5 py-4 text-stone-500 max-w-[150px] truncate">
                        {getCompanyName(job.companyId)}
                      </td>
                      <td className="px-5 py-4 text-stone-500 whitespace-nowrap">
                        {new Date(job.liveDate).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-stone-500 whitespace-nowrap">
                        {new Date(job.expiryDate).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <JobStatusBadge job={job} />
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        {isVerified ? (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => onToggleJobStatus(job.id, job.status)}
                              className="flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors"
                              title={job.status === 'Active' ? 'Suspend' : 'Activate'}
                            >
                              {job.status === 'Active'
                                ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                                : <ToggleLeft  className="w-4 h-4 text-stone-400" />}
                              {job.status === 'Active' ? 'Suspend' : 'Activate'}
                            </button>
                            <button
                              onClick={() => openEdit(job)}
                              className="flex items-center gap-1 text-xs font-bold hover:opacity-70 transition-opacity"
                              style={{ color: GREEN }}
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete "${job.title}"? This cannot be undone.`)) {
                                  onDeleteJob(job.id);
                                }
                              }}
                              className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-stone-300 italic">Locked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Job editor modal */}
      {isModalOpen && (
        <JobEditorModal
          job={editingJob}
          companies={companies}
          recruiterId={recruiterId}
          onClose={() => setIsModalOpen(false)}
          onSave={(jobData) => {
            if (editingJob) {
              onUpdateJob({ ...editingJob, ...jobData } as Job);
            } else {
              onAddJob(jobData as Omit<Job, 'id'>);
            }
            setIsModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default ManageJobsView;
