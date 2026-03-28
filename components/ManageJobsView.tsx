/**
 * components/ManageJobsView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Recruiter job management view.
 * - Lists active and past job posts
 * - Create / edit / toggle / delete jobs
 * - Salary range REQUIRED on all posts
 * - Free tier: max 3 active posts (enforced client + server side)
 * - Direct employer confirmation required
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { Job, Company } from '../types';
import {
  Plus, Briefcase, MapPin, Clock, Edit2, Trash2,
  ToggleLeft, ToggleRight, AlertCircle, CheckCircle,
  Lock, DollarSign, Users,
} from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';
const FREE_LIMIT = 3;

type CompanyVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

interface ManageJobsViewProps {
  jobs:               Job[];
  companies:          Company[];
  onAddJob:           (job: Omit<Job, 'id'>) => void;
  onUpdateJob:        (job: Job) => void;
  onDeleteJob:        (jobId: number) => void;
  onToggleJobStatus:  (jobId: number) => void;
  recruiterId:        number;
  verificationStatus: CompanyVerificationStatus;
  onGoToVerification: () => void;
}

const JOB_TYPES    = ['Full-time', 'Contract', 'Internship', 'Remote'] as const;
const EXP_LEVELS   = ['Entry-level', 'Mid-level', 'Senior-level'] as const;
const CURRENCIES   = ['GBP', 'USD', 'EUR', 'CAD', 'AUD'];
const PERIODS      = [
  { value: 'year',  label: 'per year' },
  { value: 'month', label: 'per month' },
  { value: 'day',   label: 'per day' },
  { value: 'hour',  label: 'per hour' },
] as const;

function formatSalary(job: Job): string {
  if (!job.salaryMin && !job.salaryMax) return 'No salary listed';
  const currency = job.salaryCurrency ?? 'GBP';
  const period   = PERIODS.find(p => p.value === (job.salaryPeriod ?? 'year'))?.label ?? 'per year';
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (job.salaryMin && job.salaryMax)
    return `${currency} ${fmt(job.salaryMin)}–${fmt(job.salaryMax)} ${period}`;
  if (job.salaryMin) return `${currency} ${fmt(job.salaryMin)}+ ${period}`;
  return `Up to ${currency} ${fmt(job.salaryMax!)} ${period}`;
}

// ── Job form ──────────────────────────────────────────────────────────────────

interface JobFormData {
  title:          string;
  location:       string;
  description:    string;
  type:           Job['type'];
  experienceLevel: Job['experienceLevel'];
  salaryMin:      string;
  salaryMax:      string;
  salaryCurrency: string;
  salaryPeriod:   'year' | 'month' | 'day' | 'hour';
  isDirectEmployer: boolean;
}

const emptyForm = (): JobFormData => ({
  title:           '',
  location:        '',
  description:     '',
  type:            'Full-time',
  experienceLevel: 'Mid-level',
  salaryMin:       '',
  salaryMax:       '',
  salaryCurrency:  'GBP',
  salaryPeriod:    'year',
  isDirectEmployer: false,
});

function JobForm({
  initial, onSave, onCancel, isEdit,
}: {
  initial:   JobFormData;
  onSave:    (data: JobFormData) => void;
  onCancel:  () => void;
  isEdit:    boolean;
}) {
  const [form, setForm] = useState<JobFormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: keyof JobFormData, value: any) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim())       e.title       = 'Job title is required';
    if (!form.location.trim())    e.location    = 'Location is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (!form.salaryMin && !form.salaryMax)
      e.salary = 'Salary range is required — transparency is a BeWatu standard';
    if (form.salaryMin && form.salaryMax && Number(form.salaryMin) > Number(form.salaryMax))
      e.salary = 'Minimum salary cannot exceed maximum';
    if (!form.isDirectEmployer)
      e.isDirectEmployer = 'You must confirm you represent this company directly';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const inputCls = (field: string) =>
    `w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none ${
      errors[field] ? 'border-red-400 bg-red-50' : 'border-stone-200'
    }`;

  return (
    <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-4" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-stone-900">{isEdit ? 'Edit job post' : 'New job post'}</h3>
        <button onClick={onCancel} className="text-xs text-stone-400 hover:text-stone-600">Cancel</button>
      </div>

      {/* Title */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Job title *</label>
        <input value={form.title} onChange={e => set('title', e.target.value)}
          className={inputCls('title')} placeholder="e.g. Senior Product Manager" />
        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
      </div>

      {/* Location + type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Location *</label>
          <input value={form.location} onChange={e => set('location', e.target.value)}
            className={inputCls('location')} placeholder="London / Remote" />
          {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
        </div>
        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value as Job['type'])}
            className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none">
            {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Experience level */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Experience level</label>
        <div className="flex gap-2">
          {EXP_LEVELS.map(l => (
            <button key={l} onClick={() => set('experienceLevel', l)}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-all"
              style={form.experienceLevel === l
                ? { backgroundColor: GREEN_LT, color: GREEN, borderColor: GREEN }
                : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Salary range — REQUIRED */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Salary range *</label>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-red-600 bg-red-50">Required</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <select value={form.salaryCurrency} onChange={e => set('salaryCurrency', e.target.value)}
            className="col-span-1 px-2 py-2.5 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none">
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input type="number" value={form.salaryMin} onChange={e => set('salaryMin', e.target.value)}
            className="col-span-1 px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none"
            placeholder="Min" min="0" />
          <span className="flex items-center justify-center text-stone-400 text-sm">–</span>
          <input type="number" value={form.salaryMax} onChange={e => set('salaryMax', e.target.value)}
            className="col-span-1 px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none"
            placeholder="Max" min="0" />
          <select value={form.salaryPeriod} onChange={e => set('salaryPeriod', e.target.value as any)}
            className="col-span-1 px-2 py-2.5 rounded-xl border border-stone-200 text-xs bg-white focus:outline-none">
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {errors.salary && (
          <p className="flex items-center gap-1.5 text-xs text-red-500 mt-1.5">
            <AlertCircle size={11} /> {errors.salary}
          </p>
        )}
        <p className="text-[10px] text-stone-400 mt-1">
          Salary transparency is required on BeWatu. Candidates can filter by range.
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Description *</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={5}
          className={`${inputCls('description')} resize-none`}
          placeholder="Role overview, key responsibilities, what good looks like in this role..." />
        {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
      </div>

      {/* Direct employer confirmation */}
      <div className={`rounded-xl p-3 border ${errors.isDirectEmployer ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-stone-50'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={form.isDirectEmployer}
            onChange={e => set('isDirectEmployer', e.target.checked)}
            className="mt-0.5 rounded flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-stone-800">
              I represent this company directly
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              I confirm this role is for my own organisation — not on behalf of a client or third party.
              Agency recruiting is not permitted on BeWatu.
            </p>
          </div>
        </label>
        {errors.isDirectEmployer && (
          <p className="text-xs text-red-500 mt-2 ml-6">{errors.isDirectEmployer}</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 text-sm text-stone-600 border rounded-xl hover:bg-stone-50 font-semibold"
          style={{ borderColor: '#e7e5e4' }}>
          Cancel
        </button>
        <button onClick={() => validate() && onSave(form)}
          className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          {isEdit ? 'Save changes' : 'Post job'}
        </button>
      </div>
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({
  job, onEdit, onDelete, onToggle,
}: {
  job:      Job;
  onEdit:   () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const isActive = job.status === 'Active';

  return (
    <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="font-bold text-stone-900 text-sm">{job.title}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isActive ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'
            }`}>
              {isActive ? 'Active' : 'Paused'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
              {job.type}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-stone-400 flex-wrap">
            <span className="flex items-center gap-1"><MapPin size={10} />{job.location}</span>
            <span className="flex items-center gap-1"><Clock size={10} />{job.experienceLevel}</span>
            <span className="flex items-center gap-1 font-semibold text-stone-600">
              <DollarSign size={10} />{formatSalary(job)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
            <Edit2 size={13} />
          </button>
          <button onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: isActive ? GREEN : '#9ca3af' }}
            title={isActive ? 'Pause listing' : 'Reactivate listing'}>
            {isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
          <button onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">{job.description}</p>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

const ManageJobsView: React.FC<ManageJobsViewProps> = ({
  jobs, companies, onAddJob, onUpdateJob, onDeleteJob, onToggleJobStatus,
  recruiterId, verificationStatus, onGoToVerification,
}) => {
  const [showForm, setShowForm]       = useState(false);
  const [editingJob, setEditingJob]   = useState<Job | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const activeJobs = jobs.filter(j => j.status === 'Active');
  const atLimit    = activeJobs.length >= FREE_LIMIT;
  const canPost    = verificationStatus !== 'unverified';

  const defaultCompanyId = companies[0]?.id ?? 1;

  const handleSave = (data: JobFormData) => {
    const base = {
      title:           data.title,
      location:        data.location,
      description:     data.description,
      type:            data.type,
      experienceLevel: data.experienceLevel,
      status:          'Active' as const,
      recruiterId,
      companyId:       defaultCompanyId,
      liveDate:        new Date().toISOString().slice(0, 10),
      expiryDate:      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      salaryMin:       data.salaryMin ? Number(data.salaryMin) : undefined,
      salaryMax:       data.salaryMax ? Number(data.salaryMax) : undefined,
      salaryCurrency:  data.salaryCurrency,
      salaryPeriod:    data.salaryPeriod,
      isDirectEmployer: data.isDirectEmployer,
    };

    if (editingJob) {
      onUpdateJob({ ...editingJob, ...base });
      setEditingJob(null);
    } else {
      onAddJob(base);
      setShowForm(false);
    }
  };

  const handleEdit = (job: Job) => {
    setEditingJob(job);
    setShowForm(false);
  };

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Job Posts</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            {activeJobs.length} / {FREE_LIMIT} free active listings used
          </p>
        </div>
        {!showForm && !editingJob && (
          <button
            onClick={() => { if (!atLimit && canPost) setShowForm(true); }}
            disabled={atLimit || !canPost}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}
            title={atLimit ? 'Upgrade to post more than 3 active jobs' : !canPost ? 'Verify your company first' : ''}
          >
            <Plus size={14} /> Post a role
          </button>
        )}
      </div>

      {/* Post limit warning */}
      {atLimit && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border"
          style={{ backgroundColor: '#fef3c7', borderColor: '#fde68a' }}>
          <Lock size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">3-post limit reached</p>
            <p className="text-xs text-amber-700 mt-0.5">
              You've used all 3 free active listings. Pause or delete a listing to post a new one,
              or upgrade to BeWatu Pro for unlimited posts.
            </p>
          </div>
          <button className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex-shrink-0"
            style={{ backgroundColor: '#d97706' }}>
            Upgrade
          </button>
        </div>
      )}

      {/* Verification warning */}
      {!canPost && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-stone-200 bg-stone-50">
          <AlertCircle size={15} className="text-stone-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-stone-700">Company setup required</p>
            <p className="text-xs text-stone-500 mt-0.5">Set up your company profile before posting roles.</p>
          </div>
          <button onClick={onGoToVerification}
            className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex-shrink-0"
            style={{ backgroundColor: GREEN }}>
            Set up
          </button>
        </div>
      )}

      {/* Free tier progress */}
      <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Briefcase size={13} style={{ color: GREEN }} />
            <span className="text-xs font-bold text-stone-700">Free tier usage</span>
          </div>
          <span className="text-xs font-bold" style={{ color: atLimit ? '#d97706' : GREEN }}>
            {activeJobs.length}/{FREE_LIMIT}
          </span>
        </div>
        <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (activeJobs.length / FREE_LIMIT) * 100)}%`,
              backgroundColor: atLimit ? '#d97706' : GREEN,
            }} />
        </div>
        <p className="text-[10px] text-stone-400 mt-1.5">
          {atLimit
            ? 'Upgrade to Pro for unlimited active listings'
            : `${FREE_LIMIT - activeJobs.length} listing${FREE_LIMIT - activeJobs.length !== 1 ? 's' : ''} remaining on the free tier`}
        </p>
      </div>

      {/* Create form */}
      {showForm && (
        <JobForm
          initial={emptyForm()}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          isEdit={false}
        />
      )}

      {/* Edit form */}
      {editingJob && (
        <JobForm
          initial={{
            title:           editingJob.title,
            location:        editingJob.location,
            description:     editingJob.description,
            type:            editingJob.type,
            experienceLevel: editingJob.experienceLevel,
            salaryMin:       String(editingJob.salaryMin ?? ''),
            salaryMax:       String(editingJob.salaryMax ?? ''),
            salaryCurrency:  editingJob.salaryCurrency ?? 'GBP',
            salaryPeriod:    editingJob.salaryPeriod ?? 'year',
            isDirectEmployer: editingJob.isDirectEmployer ?? false,
          }}
          onSave={handleSave}
          onCancel={() => setEditingJob(null)}
          isEdit
        />
      )}

      {/* Job list */}
      {jobs.length === 0 && !showForm ? (
        <div className="text-center py-16 border-2 border-dashed rounded-2xl" style={{ borderColor: '#e7e5e4' }}>
          <Briefcase size={28} className="mx-auto mb-3 text-stone-300" />
          <p className="font-semibold text-stone-600 mb-1">No job posts yet</p>
          <p className="text-xs text-stone-400 mb-5 max-w-xs mx-auto">
            Post your first role to reach verified BeWatu talent. Salary range required.
          </p>
          {canPost && !atLimit && (
            <button onClick={() => setShowForm(true)}
              className="text-sm font-bold px-5 py-2.5 text-white rounded-xl hover:opacity-90"
              style={{ backgroundColor: GREEN }}>
              Post your first role
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            confirmDelete === job.id ? (
              <div key={job.id} className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <p className="text-sm text-red-700 font-semibold">Delete "{job.title}"? This cannot be undone.</p>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setConfirmDelete(null)}
                    className="text-xs font-semibold px-3 py-1.5 border rounded-lg border-stone-200 text-stone-600 hover:bg-white">
                    Cancel
                  </button>
                  <button onClick={() => { onDeleteJob(job.id); setConfirmDelete(null); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white bg-red-600 hover:bg-red-700">
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <JobCard
                key={job.id}
                job={job}
                onEdit={() => handleEdit(job)}
                onDelete={() => setConfirmDelete(job.id)}
                onToggle={() => onToggleJobStatus(job.id)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default ManageJobsView;
