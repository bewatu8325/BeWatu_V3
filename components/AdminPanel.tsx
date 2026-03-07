/**
 * components/AdminPanel.tsx
 *
 * BeWatu Platform Admin Panel — accessible only to users with isPlatformAdmin=true
 * in their Firestore user doc.
 *
 * Features:
 *  1. Company list with search, filter by status, quick-actions
 *  2. Create company (direct, no verification email needed)
 *  3. Edit any company field
 *  4. Verify / reject companies with notes
 *  5. Assign company admins by Firebase UID or name lookup
 *  6. Manage recruiter permissions (grant / revoke)
 *  7. Company activity: jobs, challenges, verification history
 *  8. Suspend / reinstate / delete companies with confirmation
 *  9. Full audit log — global and per-company
 *
 * Architecture:
 *  - Single-file, all sub-views as local components
 *  - No router — internal `AdminView` state machine
 *  - All mutations go through firestoreService admin functions which
 *    write to adminAuditLog before returning
 *  - Admin check is done at App.tsx level; component trusts the guard
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Building2, ShieldCheck, Shield, Users, Search, Plus,
  Edit2, Trash2, Clock, CheckCircle, XCircle, AlertTriangle,
  ChevronRight, ChevronLeft, ChevronDown, X, RefreshCw,
  Crown, UserPlus, UserX, Eye, BarChart3, FileText,
  LogOut, Filter, Calendar, Globe, Mail, Zap, Lock,
  Check, Copy, Info, Bell, Activity,
} from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  getAllCompanies,
  adminCreateCompany,
  adminUpdateCompany,
  adminVerifyCompany,
  adminRejectCompany,
  adminSuspendCompany,
  adminReinstateCompany,
  adminDeleteCompany,
  adminAssignCompanyAdmin,
  adminSetRecruiterPermission,
  getCompanyActivity,
  getCompanyAuditLog,
  getAdminAuditLog,
  getPendingVerificationRequests,
  fetchUsers,
} from '../lib/firestoreService';
import {
  getVerificationDisplay,
  getRestrictions,
  type CompanyVerificationStatus,
} from '../lib/verification';

// ─── Design tokens ────────────────────────────────────────────────────────────
const G   = '#1a4a3a';   // brand green
const GLT = '#e8f4f0';   // light green bg
const GMD = '#1a6b52';   // mid green

// ─── Types ────────────────────────────────────────────────────────────────────
type AdminView =
  | 'list'
  | 'create'
  | 'detail'
  | 'edit'
  | 'audit_global'
  | 'verify_queue';

interface CompanyRecord {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  website?: string;
  adminUid?: string;
  adminName?: string;
  adminEmail?: string;
  verifiedRecruiters?: string[];
  verificationStatus?: CompanyVerificationStatus;
  suspensionReason?: string;
  rejectionReason?: string;
  createdAt?: any;
  followerCount?: number;
}

interface Props {
  onExit: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const INPUT = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-[#1a4a3a] focus:ring-2 focus:ring-[#1a4a3a]/10 transition-all';
const CARD  = 'rounded-2xl border border-stone-200 bg-white shadow-sm';
const BTN_G = `rounded-xl px-4 py-2.5 text-sm font-black text-white hover:opacity-90 transition-opacity disabled:opacity-40`;
const BTN_O = `rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors`;

function fmtDate(ts: any): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

function StatusPill({ status }: { status?: CompanyVerificationStatus }) {
  const s = status ?? 'unverified';
  const d = getVerificationDisplay(s);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black"
      style={{ background: d.bg, color: d.color, border: `1px solid ${d.border}` }}
    >
      {s === 'verified'  && <CheckCircle className="w-3 h-3" />}
      {s === 'pending'   && <Clock className="w-3 h-3" />}
      {s === 'rejected'  && <XCircle className="w-3 h-3" />}
      {s === 'suspended' && <Lock className="w-3 h-3" />}
      {s === 'unverified'&& <Shield className="w-3 h-3" />}
      {d.badgeLabel}
    </span>
  );
}

function AuditBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    company_created:   { label: 'Created',    color: '#1a4a3a', bg: '#e8f4f0' },
    company_updated:   { label: 'Updated',    color: '#1d4ed8', bg: '#eff6ff' },
    company_verified:  { label: 'Verified',   color: '#059669', bg: '#ecfdf5' },
    company_rejected:  { label: 'Rejected',   color: '#dc2626', bg: '#fef2f2' },
    company_suspended: { label: 'Suspended',  color: '#b45309', bg: '#fef3c7' },
    company_reinstated:{ label: 'Reinstated', color: '#7c3aed', bg: '#f5f3ff' },
    company_deleted:   { label: 'Deleted',    color: '#9f1239', bg: '#fff1f2' },
    admin_assigned:    { label: 'Admin set',  color: '#0e7490', bg: '#ecfeff' },
    recruiter_granted: { label: 'Access ✓',   color: '#1a4a3a', bg: '#e8f4f0' },
    recruiter_revoked: { label: 'Access ✗',   color: '#dc2626', bg: '#fef2f2' },
  };
  const cfg = map[action] ?? { label: action, color: '#78716c', bg: '#f5f5f4' };
  return (
    <span className="rounded-lg px-2 py-0.5 text-xs font-black whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── Confirmation modal ───────────────────────────────────────────────────────
function ConfirmModal({
  title, message, confirmLabel, danger,
  onConfirm, onCancel,
  requireTyping,
}: {
  title: string; message: string; confirmLabel: string;
  danger?: boolean; onConfirm: () => void; onCancel: () => void;
  requireTyping?: string;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = !requireTyping || typed === requireTyping;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-50' : 'bg-amber-50'}`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-500' : 'text-amber-500'}`} />
          </div>
          <div>
            <h3 className="font-black text-stone-900">{title}</h3>
            <p className="text-sm text-stone-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        {requireTyping && (
          <div>
            <p className="text-xs font-bold text-stone-500 mb-1.5">
              Type <strong className="text-stone-800">{requireTyping}</strong> to confirm
            </p>
            <input className={INPUT} value={typed} onChange={e => setTyped(e.target.value)}
              placeholder={requireTyping} />
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className={BTN_O + ' flex-1'}>Cancel</button>
          <button onClick={onConfirm} disabled={!canConfirm}
            className={`${BTN_G} flex-1`}
            style={{ background: danger ? '#dc2626' : G }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create / Edit form ───────────────────────────────────────────────────────
function CompanyForm({
  initial, onSave, onCancel, loading,
}: {
  initial?: Partial<CompanyRecord>;
  onSave: (data: any) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    name:        initial?.name        ?? '',
    description: initial?.description ?? '',
    industry:    initial?.industry    ?? '',
    website:     initial?.website     ?? '',
    adminUid:    initial?.adminUid    ?? '',
    adminName:   initial?.adminName   ?? '',
    adminEmail:  initial?.adminEmail  ?? '',
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { key: 'name' as const,     label: 'Company name *',  placeholder: 'Acme Corp' },
          { key: 'industry' as const, label: 'Industry *',       placeholder: 'Technology' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="mb-1.5 block text-xs font-black text-stone-500 uppercase tracking-wider">{label}</label>
            <input className={INPUT} placeholder={placeholder} value={form[key]} onChange={f(key)} />
          </div>
        ))}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-black text-stone-500 uppercase tracking-wider">Website</label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className={INPUT + ' pl-9'} placeholder="https://acme.com" value={form.website} onChange={f('website')} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-black text-stone-500 uppercase tracking-wider">Description</label>
        <textarea className={INPUT + ' resize-none'} rows={3} placeholder="What this company does…"
          value={form.description} onChange={f('description')} />
      </div>

      <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 space-y-3">
        <p className="text-xs font-black text-stone-500 uppercase tracking-wider flex items-center gap-2">
          <Crown className="w-3.5 h-3.5" /> Company admin (optional)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { key: 'adminName' as const,  label: 'Admin name',  placeholder: 'Jane Smith' },
            { key: 'adminEmail' as const, label: 'Admin email', placeholder: 'jane@acme.com' },
            { key: 'adminUid' as const,   label: 'Firebase UID', placeholder: 'uid…' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="mb-1 block text-[10px] font-bold text-stone-400 uppercase tracking-wider">{label}</label>
              <input className={INPUT} placeholder={placeholder} value={form[key]} onChange={f(key)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className={BTN_O}>Cancel</button>
        <button
          onClick={() => onSave(form)}
          disabled={loading || !form.name.trim() || !form.industry.trim()}
          className={BTN_G + ' flex-1'}
          style={{ background: G }}
        >
          {loading ? <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</span> : 'Save company'}
        </button>
      </div>
    </div>
  );
}

// ─── Company detail ───────────────────────────────────────────────────────────
function CompanyDetail({
  company, actorUid, actorName, onBack, onMutated,
}: {
  company: CompanyRecord;
  actorUid: string; actorName: string;
  onBack: () => void;
  onMutated: (msg: string) => void;
}) {
  type DetailTab = 'overview' | 'recruiters' | 'activity' | 'audit';
  const [tab, setTab]           = useState<DetailTab>('overview');
  const [activity, setActivity] = useState<any | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [modal, setModal]       = useState<null | 'verify' | 'reject' | 'suspend' | 'reinstate' | 'delete' | 'assign_admin' | 'edit'>(null);
  const [noteInput, setNoteInput]   = useState('');
  const [assignUid, setAssignUid]   = useState('');
  const [assignName, setAssignName] = useState('');
  const [addRecruiterUid, setAddRecruiterUid]   = useState('');
  const [addRecruiterName, setAddRecruiterName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const status = company.verificationStatus ?? 'unverified';
  const restrictions = getRestrictions(status);

  useEffect(() => {
    if (tab === 'activity' && !activity) {
      getCompanyActivity(company.id).then(setActivity).catch(() => setActivity({ jobs: [], challenges: [], verificationHistory: [] }));
    }
    if (tab === 'audit' && auditLog.length === 0) {
      getCompanyAuditLog(company.id).then(setAuditLog).catch(() => {});
    }
    if ((tab === 'recruiters' || modal === 'assign_admin') && allUsers.length === 0) {
      fetchUsers().then(setAllUsers).catch(() => {});
    }
  }, [tab, modal]);

  const act = async (fn: () => Promise<void>, msg: string) => {
    setLoading(true);
    try { await fn(); onMutated(msg); setModal(null); }
    catch (e: any) { alert(e.message ?? 'Error'); }
    finally { setLoading(false); }
  };

  const handleVerify = () => act(
    () => adminVerifyCompany(actorUid, actorName, company.id, company.name, noteInput),
    `${company.name} has been verified.`
  );
  const handleReject = () => act(
    () => adminRejectCompany(actorUid, actorName, company.id, company.name, noteInput),
    `${company.name} verification rejected.`
  );
  const handleSuspend = () => act(
    () => adminSuspendCompany(actorUid, actorName, company.id, company.name, noteInput),
    `${company.name} suspended.`
  );
  const handleReinstate = () => act(
    () => adminReinstateCompany(actorUid, actorName, company.id, company.name),
    `${company.name} reinstated.`
  );
  const handleDelete = () => act(
    () => adminDeleteCompany(actorUid, actorName, company.id, company.name),
    `${company.name} deleted.`
  );
  const handleAssignAdmin = () => act(
    () => adminAssignCompanyAdmin(actorUid, actorName, company.id, company.name, assignUid, assignName),
    `Admin updated for ${company.name}.`
  );
  const handleGrantRecruiter = (uid: string, name: string) => act(
    () => adminSetRecruiterPermission(actorUid, actorName, company.id, company.name, uid, name, true),
    `Recruiter ${name} granted access.`
  );
  const handleRevokeRecruiter = (uid: string, name: string) => act(
    () => adminSetRecruiterPermission(actorUid, actorName, company.id, company.name, uid, name, false),
    `Recruiter ${name} access revoked.`
  );
  const handleEdit = async (formData: any) => {
    setEditLoading(true);
    try {
      await adminUpdateCompany(actorUid, actorName, company.id, company.name, formData);
      onMutated(`${company.name} updated.`);
      setModal(null);
    } catch (e: any) { alert(e.message ?? 'Error'); }
    finally { setEditLoading(false); }
  };

  const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview',  label: 'Overview',   icon: <Building2 className="w-4 h-4" /> },
    { key: 'recruiters',label: 'Recruiters', icon: <Users className="w-4 h-4" /> },
    { key: 'activity',  label: 'Activity',   icon: <Activity className="w-4 h-4" /> },
    { key: 'audit',     label: 'Audit log',  icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Modals */}
      {modal === 'edit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 my-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-stone-900">Edit {company.name}</h3>
              <button onClick={() => setModal(null)} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
            </div>
            <CompanyForm initial={company} onSave={handleEdit} onCancel={() => setModal(null)} loading={editLoading} />
          </div>
        </div>
      )}

      {(modal === 'verify' || modal === 'reject' || modal === 'suspend') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-black text-stone-900">
              {modal === 'verify'  && `Verify ${company.name}`}
              {modal === 'reject'  && `Reject ${company.name}`}
              {modal === 'suspend' && `Suspend ${company.name}`}
            </h3>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-stone-500">
                {modal === 'verify' ? 'Notes (optional)' : 'Reason (required)'}
              </label>
              <textarea className={INPUT + ' resize-none'} rows={3}
                placeholder={
                  modal === 'verify'  ? 'e.g. Verified via LinkedIn + company email' :
                  modal === 'reject'  ? 'e.g. Website unreachable, no verifiable contact' :
                  'e.g. Multiple spam job postings reported'
                }
                value={noteInput} onChange={e => setNoteInput(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className={BTN_O}>Cancel</button>
              <button
                onClick={modal === 'verify' ? handleVerify : modal === 'reject' ? handleReject : handleSuspend}
                disabled={loading || (modal !== 'verify' && !noteInput.trim())}
                className={BTN_G + ' flex-1'}
                style={{ background: modal === 'verify' ? G : modal === 'reject' ? '#dc2626' : '#b45309' }}
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> :
                  modal === 'verify' ? 'Verify company' :
                  modal === 'reject' ? 'Reject' : 'Suspend company'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'reinstate' && (
        <ConfirmModal title={`Reinstate ${company.name}`}
          message="This will restore verified status and re-enable all company features."
          confirmLabel="Reinstate" onConfirm={handleReinstate} onCancel={() => setModal(null)} />
      )}

      {modal === 'delete' && (
        <ConfirmModal title={`Delete ${company.name}`} danger
          message="This permanently deletes the company and hides all associated jobs. This cannot be undone."
          confirmLabel="Delete permanently" requireTyping={company.name}
          onConfirm={handleDelete} onCancel={() => setModal(null)} />
      )}

      {modal === 'assign_admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-black text-stone-900 flex items-center gap-2"><Crown className="w-5 h-5 text-amber-500" /> Assign company admin</h3>
            <p className="text-sm text-stone-500">Enter the Firebase UID and display name of the new admin.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-stone-500">Firebase UID</label>
                <input className={INPUT} placeholder="uid…" value={assignUid} onChange={e => setAssignUid(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-stone-500">Display name</label>
                <input className={INPUT} placeholder="Jane Smith" value={assignName} onChange={e => setAssignName(e.target.value)} />
              </div>
              {allUsers.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-stone-100 divide-y divide-stone-50">
                  {allUsers.filter(u => u._firestoreUid).slice(0, 20).map(u => (
                    <button key={u._firestoreUid} onClick={() => { setAssignUid(u._firestoreUid); setAssignName(u.name); }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-stone-50 text-left transition-colors">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: G }}>
                        {u.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-800 truncate">{u.name}</p>
                        <p className="text-xs text-stone-400 truncate">{u._firestoreUid}</p>
                      </div>
                      {assignUid === u._firestoreUid && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className={BTN_O}>Cancel</button>
              <button onClick={handleAssignAdmin} disabled={loading || !assignUid.trim() || !assignName.trim()}
                className={BTN_G + ' flex-1'} style={{ background: G }}>
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : 'Assign admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-black text-stone-900">{company.name}</h2>
            <StatusPill status={status} />
          </div>
          <p className="text-sm text-stone-400 mt-0.5">{company.industry} {company.website && `· ${company.website.replace(/^https?:\/\//, '')}`}</p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setModal('edit')} className={BTN_O + ' flex items-center gap-1.5'}>
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
          {status !== 'verified' && status !== 'suspended' && (
            <button onClick={() => { setNoteInput(''); setModal('verify'); }}
              className={BTN_G + ' flex items-center gap-1.5'} style={{ background: G }}>
              <ShieldCheck className="w-3.5 h-3.5" /> Verify
            </button>
          )}
          {status === 'verified' && (
            <button onClick={() => { setNoteInput(''); setModal('suspend'); }}
              className={BTN_G + ' flex items-center gap-1.5'} style={{ background: '#b45309' }}>
              <Lock className="w-3.5 h-3.5" /> Suspend
            </button>
          )}
          {status === 'suspended' && (
            <button onClick={() => setModal('reinstate')}
              className={BTN_G + ' flex items-center gap-1.5'} style={{ background: '#7c3aed' }}>
              <CheckCircle className="w-3.5 h-3.5" /> Reinstate
            </button>
          )}
          {(status === 'unverified' || status === 'pending') && (
            <button onClick={() => { setNoteInput(''); setModal('reject'); }}
              className={BTN_G + ' flex items-center gap-1.5'} style={{ background: '#dc2626' }}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white border border-stone-200 rounded-xl mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-stone-100 text-stone-900' : 'text-stone-400 hover:text-stone-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Status card */}
          <div className={CARD + ' p-5'}>
            <p className="text-xs font-black text-stone-400 uppercase tracking-wider mb-3">Verification status</p>
            <StatusPill status={status} />
            {company.suspensionReason && (
              <p className="text-sm text-amber-700 mt-2 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span><strong>Suspension reason:</strong> {company.suspensionReason}</span>
              </p>
            )}
            {company.rejectionReason && (
              <p className="text-sm text-red-600 mt-2 flex items-start gap-1.5">
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span><strong>Rejection reason:</strong> {company.rejectionReason}</span>
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Post jobs',        ok: restrictions.canPostJobs },
                { label: 'Contact candidates', ok: restrictions.canContactCandidates },
                { label: 'Full profiles',    ok: restrictions.canViewFullProfiles },
                { label: 'AI search',        ok: restrictions.canRunAISearch },
                { label: 'Public job feed',  ok: restrictions.jobVisibility === 'full',
                  partial: restrictions.jobVisibility === 'limited' },
              ].map(({ label, ok, partial }) => (
                <div key={label} className={`rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5 ${
                  ok ? 'bg-emerald-50 text-emerald-700' : partial ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-400'
                }`}>
                  {ok ? <CheckCircle className="w-3.5 h-3.5" /> : partial ? <Clock className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Company info */}
          <div className={CARD + ' p-5 space-y-4'}>
            <p className="text-xs font-black text-stone-400 uppercase tracking-wider">Company info</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {[
                { label: 'Name',     value: company.name },
                { label: 'Industry', value: company.industry },
                { label: 'Website',  value: company.website },
                { label: 'Created',  value: fmtDate(company.createdAt) },
                { label: 'Followers',value: company.followerCount ?? 0 },
                { label: 'Recruiters', value: company.verifiedRecruiters?.length ?? 0 },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider">{label}</p>
                  <p className="font-semibold text-stone-800 mt-0.5">{value || '—'}</p>
                </div>
              ))}
            </div>
            {company.description && (
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-stone-600 leading-relaxed">{company.description}</p>
              </div>
            )}
          </div>

          {/* Admin */}
          <div className={CARD + ' p-5'}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-500" /> Company admin
              </p>
              <button onClick={() => setModal('assign_admin')}
                className="text-xs font-bold flex items-center gap-1" style={{ color: G }}>
                <Edit2 className="w-3 h-3" /> Change
              </button>
            </div>
            {company.adminUid ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: G }}>
                  {(company.adminName ?? 'A')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-stone-800">{company.adminName ?? 'Admin'}</p>
                  <p className="text-xs text-stone-400">{company.adminEmail ?? ''}</p>
                  <p className="text-[10px] text-stone-300 font-mono">{company.adminUid}</p>
                </div>
              </div>
            ) : (
              <button onClick={() => setModal('assign_admin')}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 p-4 text-stone-400 hover:border-stone-400 hover:text-stone-600 transition-colors text-sm font-semibold">
                <UserPlus className="w-4 h-4" /> Assign an admin
              </button>
            )}
          </div>

          {/* Danger zone */}
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3">
            <p className="text-xs font-black text-red-500 uppercase tracking-wider">Danger zone</p>
            <button onClick={() => setModal('delete')}
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" /> Delete company permanently
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: RECRUITERS ──────────────────────────────────────── */}
      {tab === 'recruiters' && (
        <div className="space-y-4">
          {/* Add recruiter */}
          <div className={CARD + ' p-5 space-y-3'}>
            <p className="text-xs font-black text-stone-400 uppercase tracking-wider">Grant recruiter access</p>
            <div className="flex gap-2">
              <input className={INPUT + ' flex-1'} placeholder="Firebase UID"
                value={addRecruiterUid} onChange={e => setAddRecruiterUid(e.target.value)} />
              <input className={INPUT + ' flex-1'} placeholder="Display name"
                value={addRecruiterName} onChange={e => setAddRecruiterName(e.target.value)} />
              <button
                onClick={() => { handleGrantRecruiter(addRecruiterUid, addRecruiterName); setAddRecruiterUid(''); setAddRecruiterName(''); }}
                disabled={!addRecruiterUid.trim() || !addRecruiterName.trim() || loading}
                className={BTN_G + ' whitespace-nowrap'} style={{ background: G }}>
                + Grant
              </button>
            </div>
            {/* Quick-pick from known users */}
            {allUsers.filter(u => u._firestoreUid && !company.verifiedRecruiters?.includes(u._firestoreUid)).length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-stone-400 mb-1">Quick-add from known users</p>
                <div className="flex flex-wrap gap-2">
                  {allUsers.filter(u => u._firestoreUid && !company.verifiedRecruiters?.includes(u._firestoreUid)).slice(0, 8).map(u => (
                    <button key={u._firestoreUid}
                      onClick={() => { setAddRecruiterUid(u._firestoreUid); setAddRecruiterName(u.name); }}
                      className={`rounded-full px-3 py-1 text-xs font-bold border transition-colors ${
                        addRecruiterUid === u._firestoreUid ? 'border-[#1a4a3a] bg-[#e8f4f0] text-[#1a4a3a]' : 'border-stone-200 text-stone-500 hover:border-stone-400'
                      }`}>{u.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Current list */}
          <div className={CARD + ' overflow-hidden'}>
            <div className="px-5 py-3 border-b border-stone-100">
              <p className="text-xs font-black text-stone-400 uppercase tracking-wider">
                Current recruiters ({company.verifiedRecruiters?.length ?? 0})
              </p>
            </div>
            {(company.verifiedRecruiters ?? []).length === 0 ? (
              <p className="px-5 py-8 text-sm text-stone-400 text-center">No verified recruiters yet.</p>
            ) : (
              <div className="divide-y divide-stone-50">
                {(company.verifiedRecruiters ?? []).map(uid => {
                  const u = allUsers.find(x => x._firestoreUid === uid);
                  const isAdmin = uid === company.adminUid;
                  return (
                    <div key={uid} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: G }}>
                        {(u?.name ?? uid)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-800 truncate">{u?.name ?? 'Recruiter'}</p>
                        <p className="text-[10px] text-stone-400 font-mono truncate">{uid}</p>
                      </div>
                      {isAdmin && (
                        <span className="text-[10px] font-black rounded-full px-2 py-0.5 flex items-center gap-1"
                          style={{ background: '#fef3c7', color: '#92400e' }}>
                          <Crown className="w-2.5 h-2.5" /> Admin
                        </span>
                      )}
                      {!isAdmin && (
                        <button onClick={() => handleRevokeRecruiter(uid, u?.name ?? uid)}
                          className="text-stone-300 hover:text-red-500 transition-colors p-1" title="Revoke access">
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: ACTIVITY ────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="space-y-4">
          {!activity ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-stone-300" />
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Jobs posted',     value: activity.jobs.length,              icon: <FileText className="w-5 h-5" /> },
                  { label: 'Challenges',       value: activity.challenges.length,        icon: <Zap className="w-5 h-5" /> },
                  { label: 'Verif. requests',  value: activity.verificationHistory.length, icon: <Shield className="w-5 h-5" /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className={CARD + ' p-4 text-center'}>
                    <div className="flex justify-center mb-1" style={{ color: G }}>{icon}</div>
                    <p className="text-2xl font-black text-stone-900">{value}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Jobs */}
              {activity.jobs.length > 0 && (
                <div className={CARD + ' overflow-hidden'}>
                  <div className="px-5 py-3 border-b border-stone-100">
                    <p className="text-xs font-black text-stone-400 uppercase tracking-wider">Recent jobs</p>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {activity.jobs.slice(0, 8).map((job: any) => (
                      <div key={job.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-stone-800 truncate">{job.title}</p>
                          <p className="text-xs text-stone-400">{job.location} · {job.type}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${job.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                          {job.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Challenges */}
              {activity.challenges.length > 0 && (
                <div className={CARD + ' overflow-hidden'}>
                  <div className="px-5 py-3 border-b border-stone-100">
                    <p className="text-xs font-black text-stone-400 uppercase tracking-wider">Skill challenges</p>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {activity.challenges.slice(0, 6).map((ch: any) => (
                      <div key={ch.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-stone-800 truncate">{ch.title}</p>
                          <p className="text-xs text-stone-400">{ch.skill ?? ch.category ?? ''}</p>
                        </div>
                        <span className="text-xs text-stone-400">{fmtDate(ch.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification history */}
              {activity.verificationHistory.length > 0 && (
                <div className={CARD + ' overflow-hidden'}>
                  <div className="px-5 py-3 border-b border-stone-100">
                    <p className="text-xs font-black text-stone-400 uppercase tracking-wider">Verification history</p>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {activity.verificationHistory.map((vr: any) => (
                      <div key={vr.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-stone-800">{vr.verificationType === 'email_domain' ? '⚡ Email domain' : '👤 Manual review'}</p>
                          <p className="text-xs text-stone-400">{vr.recruiterEmail}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          vr.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                          vr.status === 'rejected' ? 'bg-red-50 text-red-600' :
                          'bg-amber-50 text-amber-700'
                        }`}>{vr.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activity.jobs.length === 0 && activity.challenges.length === 0 && (
                <div className="text-center py-16 text-stone-400">
                  <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No activity yet</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: AUDIT LOG ────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className={CARD + ' overflow-hidden'}>
          <div className="px-5 py-3 border-b border-stone-100">
            <p className="text-xs font-black text-stone-400 uppercase tracking-wider">Company audit log</p>
          </div>
          {auditLog.length === 0 ? (
            <p className="px-5 py-10 text-sm text-stone-400 text-center">No audit entries for this company.</p>
          ) : (
            <div className="divide-y divide-stone-50 max-h-[600px] overflow-y-auto">
              {auditLog.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AuditBadge action={entry.action} />
                      <span className="text-xs text-stone-500">by <strong>{entry.actorName}</strong></span>
                    </div>
                    {entry.details && <p className="text-xs text-stone-500 mt-1 leading-relaxed">{entry.details}</p>}
                  </div>
                  <span className="text-[10px] text-stone-300 whitespace-nowrap flex-shrink-0">{fmtDate(entry.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────
const AdminPanel: React.FC<Props> = ({ onExit }) => {
  const { fbUser, currentUser } = useFirebase();

  const [view, setView]                 = useState<AdminView>('list');
  const [companies, setCompanies]       = useState<CompanyRecord[]>([]);
  const [pendingVerif, setPendingVerif] = useState<any[]>([]);
  const [globalAudit, setGlobalAudit]   = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRecord | null>(null);
  const [loading, setLoading]           = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<CompanyVerificationStatus | 'all'>('all');
  const [toast, setToast]               = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const actorUid  = fbUser?.uid ?? '';
  const actorName = currentUser?.name ?? fbUser?.email ?? 'Admin';

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cos, pending] = await Promise.all([
        getAllCompanies(),
        getPendingVerificationRequests(),
      ]);
      setCompanies(cos);
      setPendingVerif(pending);
    } catch (e: any) {
      showToast('Failed to load companies: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (view === 'audit_global' && globalAudit.length === 0) {
      getAdminAuditLog(200).then(setGlobalAudit).catch(() => {});
    }
  }, [view]);

  const handleMutated = (msg: string) => {
    showToast(msg);
    setView('list');
    setSelectedCompany(null);
    loadData();
  };

  const handleCreate = async (formData: any) => {
    setCreateLoading(true);
    try {
      await adminCreateCompany(actorUid, actorName, formData);
      handleMutated(`Company "${formData.name}" created.`);
    } catch (e: any) { showToast('Error: ' + e.message); }
    finally { setCreateLoading(false); }
  };

  // Filtered companies
  const filtered = companies.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.industry ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.website ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.verificationStatus === statusFilter ||
      (!c.verificationStatus && statusFilter === 'unverified');
    return matchSearch && matchStatus;
  });

  const statusCounts = companies.reduce((acc, c) => {
    const s = c.verificationStatus ?? 'unverified';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl max-w-sm">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center gap-4 h-14">
          {/* Logo / title */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: G }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-stone-900 hidden sm:inline">Admin Panel</span>
          </div>

          {/* Nav */}
          <div className="flex gap-1 ml-2">
            {([
              { key: 'list' as AdminView,         label: 'Companies' },
              { key: 'verify_queue' as AdminView, label: `Queue${pendingVerif.length ? ` (${pendingVerif.length})` : ''}` },
              { key: 'audit_global' as AdminView, label: 'Audit log' },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setView(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  view === key || (view === 'detail' && key === 'list')
                    ? 'bg-stone-100 text-stone-900'
                    : 'text-stone-400 hover:text-stone-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Create + exit */}
          <button onClick={() => setView('create')}
            className={`${BTN_G} hidden sm:flex items-center gap-1.5`} style={{ background: G }}>
            <Plus className="w-4 h-4" /> New company
          </button>
          <button onClick={onExit}
            className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-50 transition-colors">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Exit admin</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">

        {/* ══════════════════════════════════════════════════════════
            VIEW: COMPANY LIST
        ══════════════════════════════════════════════════════════ */}
        {(view === 'list') && (
          <div className="space-y-5">
            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {([
                { label: 'Total',     count: companies.length,              key: 'all',        color: '#78716c' },
                { label: 'Verified',  count: statusCounts.verified ?? 0,    key: 'verified',   color: G },
                { label: 'Pending',   count: statusCounts.pending ?? 0,     key: 'pending',    color: '#b45309' },
                { label: 'Unverified',count: statusCounts.unverified ?? 0,  key: 'unverified', color: '#64748b' },
                { label: 'Suspended', count: statusCounts.suspended ?? 0,   key: 'suspended',  color: '#dc2626' },
              ] as const).map(({ label, count, key, color }) => (
                <button key={key}
                  onClick={() => setStatusFilter(key as any)}
                  className={`${CARD} p-4 text-left transition-all hover:shadow-md ${statusFilter === key ? 'ring-2 ring-offset-1' : ''}`}
                  style={{ ringColor: color }}>
                  <p className="text-2xl font-black" style={{ color }}>{count}</p>
                  <p className="text-xs text-stone-400 mt-0.5 font-semibold">{label}</p>
                </button>
              ))}
            </div>

            {/* Search + filter */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  className={INPUT + ' pl-9'}
                  placeholder="Search companies by name, industry, website…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button onClick={() => setView('create')}
                className={`${BTN_G} sm:hidden flex items-center gap-1`} style={{ background: G }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-stone-300" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-stone-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">{search ? 'No companies match your search.' : 'No companies yet.'}</p>
              </div>
            ) : (
              <div className={CARD + ' overflow-hidden'}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50">
                        {['Company', 'Industry', 'Status', 'Recruiters', 'Created', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-stone-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {filtered.map(co => (
                        <tr key={co.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: G }}>
                                {co.name[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-stone-900 truncate max-w-[180px]">{co.name}</p>
                                {co.website && <p className="text-[10px] text-stone-400 truncate max-w-[180px]">{co.website.replace(/^https?:\/\//, '')}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{co.industry ?? '—'}</td>
                          <td className="px-4 py-3"><StatusPill status={co.verificationStatus} /></td>
                          <td className="px-4 py-3 text-stone-500">{co.verifiedRecruiters?.length ?? 0}</td>
                          <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap">{fmtDate(co.createdAt)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => { setSelectedCompany(co); setView('detail'); }}
                              className="flex items-center gap-1 text-xs font-bold hover:opacity-80 transition-opacity whitespace-nowrap"
                              style={{ color: G }}>
                              Manage <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            VIEW: CREATE COMPANY
        ══════════════════════════════════════════════════════════ */}
        {view === 'create' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('list')}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 hover:text-stone-700 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-xl font-black text-stone-900">New company</h2>
            </div>
            <div className={CARD + ' p-6'}>
              <CompanyForm onSave={handleCreate} onCancel={() => setView('list')} loading={createLoading} />
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            VIEW: COMPANY DETAIL
        ══════════════════════════════════════════════════════════ */}
        {view === 'detail' && selectedCompany && (
          <CompanyDetail
            company={selectedCompany}
            actorUid={actorUid}
            actorName={actorName}
            onBack={() => { setView('list'); setSelectedCompany(null); loadData(); }}
            onMutated={(msg) => { handleMutated(msg); loadData(); }}
          />
        )}

        {/* ══════════════════════════════════════════════════════════
            VIEW: VERIFICATION QUEUE
        ══════════════════════════════════════════════════════════ */}
        {view === 'verify_queue' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-stone-900">Verification queue</h2>
              <button onClick={() => getPendingVerificationRequests().then(setPendingVerif)}
                className="flex items-center gap-1.5 text-sm font-bold text-stone-400 hover:text-stone-700 transition-colors">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            {pendingVerif.length === 0 ? (
              <div className="text-center py-24">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-300" />
                <p className="font-bold text-stone-500">Queue is clear — no pending requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingVerif.map(req => {
                  const co = companies.find(c => c.id === req.companyId);
                  return (
                    <div key={req.id} className={CARD + ' p-5'}>
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black text-white flex-shrink-0" style={{ background: G }}>
                          {req.companyName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-stone-900">{req.companyName}</p>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                              {req.verificationType === 'email_domain' ? '⚡ Email domain' : '👤 Manual review'}
                            </span>
                          </div>
                          <p className="text-sm text-stone-500">
                            <Mail className="w-3.5 h-3.5 inline mr-1" />{req.recruiterEmail}
                            {req.companyWebsite && <> · <Globe className="w-3.5 h-3.5 inline mx-1" />{req.companyWebsite}</>}
                          </p>
                          {req.notes && (
                            <p className="text-sm text-stone-600 bg-stone-50 rounded-xl px-3 py-2 mt-2">
                              <Info className="w-3.5 h-3.5 inline mr-1.5 text-stone-400" />
                              {req.notes}
                            </p>
                          )}
                          <p className="text-xs text-stone-400">Submitted {fmtDate(req.submittedAt)}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => {
                              const c = companies.find(x => x.id === req.companyId);
                              if (c) { setSelectedCompany(c); setView('detail'); }
                            }}
                            className={BTN_O + ' flex items-center gap-1'}>
                            <Eye className="w-3.5 h-3.5" /> Review
                          </button>
                          <button
                            onClick={async () => {
                              await adminVerifyCompany(actorUid, actorName, req.companyId, req.companyName, 'Approved from verification queue');
                              showToast(`${req.companyName} verified.`);
                              loadData();
                              getPendingVerificationRequests().then(setPendingVerif);
                            }}
                            className={BTN_G + ' flex items-center gap-1'} style={{ background: G }}>
                            <ShieldCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            VIEW: GLOBAL AUDIT LOG
        ══════════════════════════════════════════════════════════ */}
        {view === 'audit_global' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-stone-900">Audit log</h2>
              <button onClick={() => getAdminAuditLog(200).then(setGlobalAudit)}
                className="flex items-center gap-1.5 text-sm font-bold text-stone-400 hover:text-stone-700 transition-colors">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            <div className={CARD + ' overflow-hidden'}>
              {globalAudit.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="w-6 h-6 animate-spin text-stone-300" />
                </div>
              ) : (
                <div className="divide-y divide-stone-50">
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-2.5 bg-stone-50 border-b border-stone-100">
                    {['Action', 'Details', 'Actor', 'Date'].map(h => (
                      <p key={h} className="text-[10px] font-black text-stone-400 uppercase tracking-wider">{h}</p>
                    ))}
                  </div>
                  {globalAudit.map(entry => (
                    <div key={entry.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-start px-5 py-3 hover:bg-stone-50 transition-colors">
                      <AuditBadge action={entry.action} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800 truncate">{entry.targetName}</p>
                        {entry.details && <p className="text-xs text-stone-400 truncate">{entry.details}</p>}
                      </div>
                      <p className="text-xs text-stone-500 whitespace-nowrap">{entry.actorName}</p>
                      <p className="text-[10px] text-stone-300 whitespace-nowrap">{fmtDate(entry.timestamp)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;
