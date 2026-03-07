/**
 * components/recruiter/CompanyVerification.tsx
 *
 * Company management panel for recruiters:
 *  – Create company (you become admin)
 *  – Join via invite code
 *  – Edit all company fields (admin only)
 *  – Delete company with type-to-confirm guard (admin only)
 *  – Submit / re-submit verification
 *  – Feature access summary
 *  – Team management: invite, view, remove recruiters
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, ShieldCheck, UserPlus, Copy, Check, X, RefreshCw,
  AlertTriangle, ChevronRight, Trash2, Crown, Users, Link2,
  CheckCircle, Clock, Mail, ArrowLeft, Zap, FileText, Globe,
  AlertCircle, Shield, Edit2, Save, ExternalLink, Info,
} from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  getCompanyForRecruiter,
  createCompanyWithAdmin,
  updateCompanyProfile,
  deleteCompanyByAdmin,
  generateInviteCode,
  redeemInviteCode,
  removeRecruiterFromCompany,
  fetchUsers,
  createVerificationRequest,
  getVerificationRequestForCompany,
} from '../../lib/firestoreService';
import {
  isWorkEmail,
  emailMatchesCompanyDomain,
  getRestrictions,
  getVerificationDisplay,
  validateCompanyForVerification,
  type CompanyVerificationStatus,
} from '../../lib/verification';
import { VerifiedBadge, UnverifiedWarningBanner } from '../VerifiedBadge';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';
const CARD  = 'rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm';
const INPUT = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-[#1a4a3a] focus:ring-2 focus:ring-[#1a4a3a]/10 transition-all';
const BTN_G = 'rounded-xl px-4 py-2.5 text-sm font-black text-white hover:opacity-90 disabled:opacity-40 transition-opacity';
const BTN_O = 'rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors';

interface CompanyData {
  _firestoreId: string;
  id?: string;
  name: string;
  description: string;
  industry: string;
  website: string;
  adminUid: string;
  verifiedRecruiters: string[];
  pendingInvites: any[];
  verificationStatus: CompanyVerificationStatus;
  rejectionReason?: string;
}

type ScreenState = 'loading' | 'no_company' | 'create_company' | 'redeem_code' | 'verify_email' | 'dashboard';

interface Props {
  currentUserName: string;
  onCompanyVerified?: (companyName: string) => void;
}

function EmailDomainPill({ email, website }: { email: string; website: string }) {
  if (!email || !website) return null;
  const isWork  = isWorkEmail(email);
  const matches = isWork && emailMatchesCompanyDomain(email, website);
  const domain  = email.split('@')[1] ?? '';
  if (matches) return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
      <Zap className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      <div>
        <p className="text-xs font-black text-emerald-800">Instant verification available</p>
        <p className="text-xs text-emerald-600 mt-0.5"><strong>{domain}</strong> matches your company website — no wait.</p>
      </div>
    </div>
  );
  if (!isWork) return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <div>
        <p className="text-xs font-black text-amber-800">Personal email detected</p>
        <p className="text-xs text-amber-700 mt-0.5"><strong>{domain}</strong> is a personal address — manual review required.</p>
      </div>
    </div>
  );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
      <FileText className="w-4 h-4 text-stone-400 flex-shrink-0" />
      <div>
        <p className="text-xs font-black text-stone-700">Manual review required</p>
        <p className="text-xs text-stone-500 mt-0.5"><strong>{domain}</strong> doesn't match the website — our team will review.</p>
      </div>
    </div>
  );
}

function DeleteModal({ companyName, onConfirm, onCancel, loading }: {
  companyName: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-black text-stone-900">Delete company</h3>
            <p className="text-sm text-stone-500 mt-1 leading-relaxed">
              This permanently deletes <strong>{companyName}</strong> and hides all associated job listings. This cannot be undone.
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-stone-500 mb-1.5">
            Type <strong className="text-stone-800">{companyName}</strong> to confirm
          </p>
          <input className={INPUT} placeholder={companyName} value={typed}
            onChange={e => setTyped(e.target.value)} autoFocus />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className={BTN_O + ' flex-1'} disabled={loading}>Cancel</button>
          <button onClick={onConfirm} disabled={typed !== companyName || loading}
            className={BTN_G + ' flex-1'} style={{ background: '#dc2626' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Deleting…</span>
              : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, editing, inputType = 'text', onChange, placeholder, hint }: {
  label: string; value: string; editing: boolean; inputType?: string;
  onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div className="py-3 border-b border-stone-50 last:border-0">
      <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">{label}</p>
      {editing ? (
        <div>
          {inputType === 'textarea' ? (
            <textarea className={INPUT + ' resize-none mt-0.5'} rows={3}
              value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
          ) : (
            <input className={INPUT + ' mt-0.5'} type={inputType}
              value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
          )}
          {hint && <p className="text-[10px] text-stone-400 mt-1">{hint}</p>}
        </div>
      ) : (
        <p className="text-sm text-stone-800 font-medium min-h-[1.25rem]">
          {value || <span className="text-stone-400 italic font-normal">Not set</span>}
        </p>
      )}
    </div>
  );
}

const CompanyVerification: React.FC<Props> = ({ currentUserName, onCompanyVerified }) => {
  const { fbUser } = useFirebase();
  const recruiterEmail = fbUser?.email ?? '';

  const [screen, setScreen]               = useState<ScreenState>('loading');
  const [company, setCompany]             = useState<CompanyData | null>(null);
  const [verifRequest, setVerifRequest]   = useState<any | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState<string | null>(null);
  const [createForm, setCreateForm]       = useState({ name: '', description: '', industry: '', website: '' });
  const [createErrors, setCreateErrors]   = useState<string[]>([]);
  const [redeemCode, setRedeemCode]       = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode]       = useState(false);
  const [inviteEmail, setInviteEmail]     = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [verifyNotes, setVerifyNotes]     = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [memberNames, setMemberNames]     = useState<Record<string, string>>({});
  const [editing, setEditing]             = useState(false);
  const [editForm, setEditForm]           = useState({ name: '', description: '', industry: '', website: '' });
  const [editLoading, setEditLoading]     = useState(false);
  const [showDelete, setShowDelete]       = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const companyId    = company?._firestoreId ?? company?.id ?? '';
  const isAdmin      = company?.adminUid === fbUser?.uid;
  const verifStatus: CompanyVerificationStatus = company?.verificationStatus ?? 'unverified';
  const restrictions = getRestrictions(verifStatus);
  const display      = getVerificationDisplay(verifStatus);
  const canInstant   = !!company?.website && isWorkEmail(recruiterEmail) && emailMatchesCompanyDomain(recruiterEmail, company.website);

  const load = useCallback(async () => {
    if (!fbUser) return;
    setLoading(true);
    try {
      const c = await getCompanyForRecruiter(fbUser.uid);
      if (c) {
        setCompany(c);
        setScreen('dashboard');
        if (c.verificationStatus === 'verified') onCompanyVerified?.(c.name);
        try { const users = await fetchUsers(); const nm: Record<string,string> = {}; for (const u of users) { if (u._firestoreUid) nm[u._firestoreUid] = u.name; } setMemberNames(nm); } catch {}
        try { const req = await getVerificationRequestForCompany(c._firestoreId ?? c.id); setVerifRequest(req); } catch {}
      } else {
        setScreen('no_company');
      }
    } catch { setScreen('no_company'); }
    finally { setLoading(false); }
  }, [fbUser]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (company) setEditForm({ name: company.name ?? '', description: company.description ?? '', industry: company.industry ?? '', website: company.website ?? '' });
  }, [company]);

  const handleCreate = async () => {
    const errs = validateCompanyForVerification(createForm);
    if (errs.length) { setCreateErrors(errs); return; }
    setCreateErrors([]); if (!fbUser) return;
    setLoading(true); setError(null);
    try { await createCompanyWithAdmin(fbUser.uid, currentUserName, createForm); setSuccess(`Company "${createForm.name}" created.`); await load(); }
    catch (e: any) { setError(e.message ?? 'Failed to create company.'); }
    finally { setLoading(false); }
  };

  const handleRedeem = async () => {
    if (!fbUser || !redeemCode.trim()) return;
    setLoading(true); setError(null);
    try {
      const result = await redeemInviteCode(fbUser.uid, redeemCode.trim());
      const ok = (result as any)?.success ?? !!result;
      if (ok) { setSuccess(`Joined ${(result as any).companyName ?? 'the company'} as a verified recruiter.`); await load(); }
      else { setError((result as any).error ?? 'Invalid or expired code.'); }
    } catch (e: any) { setError(e.message ?? 'Failed to redeem code.'); }
    finally { setLoading(false); }
  };

  const handleSubmitVerification = async () => {
    if (!fbUser || !company) return;
    setVerifyLoading(true); setError(null);
    try {
      const { instant } = await createVerificationRequest({ companyId, recruiterUid: fbUser.uid, recruiterName: currentUserName, recruiterEmail, companyName: company.name, companyWebsite: company.website, notes: verifyNotes.trim() || undefined });
      setSuccess(instant ? '🎉 Verified instantly! All features unlocked.' : 'Request submitted. Our team will review within 1–2 business days.');
      await load(); setScreen('dashboard');
    } catch (e: any) { setError(e.message ?? 'Failed to submit.'); }
    finally { setVerifyLoading(false); }
  };

  const handleSaveEdit = async () => {
    if (!company) return;
    const errs = validateCompanyForVerification(editForm);
    if (errs.length) { setError(errs.join(' · ')); return; }
    setEditLoading(true); setError(null);
    try { await updateCompanyProfile(companyId, editForm); setSuccess('Company details updated.'); setEditing(false); await load(); }
    catch (e: any) { setError(e.message ?? 'Failed to save.'); }
    finally { setEditLoading(false); }
  };

  const handleCancelEdit = () => {
    if (company) setEditForm({ name: company.name ?? '', description: company.description ?? '', industry: company.industry ?? '', website: company.website ?? '' });
    setEditing(false); setError(null);
  };

  const handleDelete = async () => {
    if (!company) return;
    setDeleteLoading(true); setError(null);
    try { await deleteCompanyByAdmin(companyId); setShowDelete(false); setCompany(null); setScreen('no_company'); setSuccess('Company deleted. All job listings have been hidden.'); }
    catch (e: any) { setError(e.message ?? 'Failed to delete company.'); }
    finally { setDeleteLoading(false); }
  };

  const handleGenerateInvite = async () => {
    if (!fbUser || !company) return;
    setLoading(true); setError(null);
    try { const code = await generateInviteCode(companyId, inviteEmail || undefined); setGeneratedCode(code); setInviteEmail(''); setShowInviteForm(false); await load(); }
    catch (e: any) { setError(e.message ?? 'Failed to generate invite.'); }
    finally { setLoading(false); }
  };

  const handleCopy = (code: string) => { navigator.clipboard.writeText(code).catch(() => {}); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); };

  const handleRemove = async (uid: string) => {
    if (!fbUser || !company || !window.confirm('Remove this recruiter from the company?')) return;
    setLoading(true); setError(null);
    try { await removeRecruiterFromCompany(companyId, uid); await load(); }
    catch (e: any) { setError(e.message ?? 'Failed to remove.'); }
    finally { setLoading(false); }
  };

  if (screen === 'loading') return (
    <div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-stone-400" /></div>
  );

  return (
    <div className="px-4 py-6 md:px-8 bg-stone-50 min-h-full">
      {showDelete && company && <DeleteModal companyName={company.name} onConfirm={handleDelete} onCancel={() => setShowDelete(false)} loading={deleteLoading} />}

      <div className="mx-auto max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          {['create_company','redeem_code','verify_email'].includes(screen) && (
            <button onClick={() => setScreen(company ? 'dashboard' : 'no_company')}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-stone-900 flex items-center gap-2">
              <Shield className="h-5 w-5 flex-shrink-0" style={{ color: GREEN }} /> Company Verification
            </h1>
            <p className="mt-0.5 text-sm text-stone-500">Verify your company to post live jobs and contact candidates.</p>
          </div>
          {screen === 'dashboard' && (
            <button onClick={() => load()} className="flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 hover:text-stone-700 transition-colors" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{success}</span>
            <button onClick={() => setSuccess(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* NO COMPANY */}
        {screen === 'no_company' && (
          <div className={CARD + ' space-y-4'}>
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">No company on file</p>
                <p className="text-xs text-amber-700 mt-0.5">Job posts will be hidden until your company is verified.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { icon: Building2, title: 'Create company profile', sub: 'You become the verified admin', s: 'create_company' as ScreenState },
                { icon: Link2, title: 'Join with invite code', sub: 'Your admin sent a 6-character code', s: 'redeem_code' as ScreenState },
              ].map(({ icon: Icon, title, sub, s }) => (
                <button key={s} onClick={() => setScreen(s)}
                  className="flex flex-col items-start gap-3 rounded-2xl border-2 border-dashed border-stone-200 p-5 text-left hover:border-[#1a4a3a] hover:bg-[#e8f4f0] transition-all group">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 group-hover:bg-[#1a4a3a] transition-colors">
                    <Icon className="h-5 w-5 text-stone-500 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <p className="font-bold text-stone-800">{title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CREATE COMPANY */}
        {screen === 'create_company' && (
          <div className={CARD + ' space-y-5'}>
            <div>
              <h2 className="font-black text-stone-900 flex items-center gap-2"><Building2 className="h-5 w-5" style={{ color: GREEN }} /> Company profile</h2>
              <p className="text-xs text-stone-500 mt-1">A website is required — we match it against your work email for instant verification.</p>
            </div>
            {recruiterEmail && createForm.website && <EmailDomainPill email={recruiterEmail} website={createForm.website} />}
            {createErrors.length > 0 && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-1">
                {createErrors.map(e => <p key={e} className="text-xs text-red-700 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{e}</p>)}
              </div>
            )}
            <div className="space-y-3">
              {([{ key: 'name', label: 'Company name *', placeholder: 'Acme Corp' }, { key: 'industry', label: 'Industry *', placeholder: 'Technology, Finance, Healthcare…' }] as const).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="mb-1.5 block text-xs font-bold text-stone-600">{label}</label>
                  <input className={INPUT} placeholder={placeholder} value={(createForm as any)[key]} onChange={e => setCreateForm(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-stone-600">Website * <span className="font-normal text-stone-400 ml-1">— required for email domain verification</span></label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <input className={INPUT + ' pl-9'} placeholder="https://acme.com" value={createForm.website} onChange={e => setCreateForm(p => ({ ...p, website: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-stone-600">Description</label>
                <textarea className={INPUT + ' resize-none'} rows={3} placeholder="What does your company do?" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setScreen('no_company')} className={BTN_O}>Cancel</button>
              <button onClick={handleCreate} disabled={loading || !createForm.name.trim()} className={BTN_G + ' flex-1'} style={{ background: GREEN }}>{loading ? 'Creating…' : 'Create & become admin'}</button>
            </div>
          </div>
        )}

        {/* REDEEM CODE */}
        {screen === 'redeem_code' && (
          <div className={CARD + ' space-y-4'}>
            <div>
              <h2 className="font-black text-stone-900 flex items-center gap-2"><Link2 className="h-5 w-5" style={{ color: GREEN }} /> Enter invite code</h2>
              <p className="text-sm text-stone-500 mt-1">Ask your admin to generate a code from their Company page.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-stone-600">Invite code</label>
              <input className={INPUT + ' font-mono tracking-[0.3em] uppercase text-2xl text-center font-black h-16'} placeholder="XXXXXX" maxLength={6} value={redeemCode} onChange={e => setRedeemCode(e.target.value.toUpperCase())} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setScreen('no_company')} className={BTN_O}>Cancel</button>
              <button onClick={handleRedeem} disabled={loading || redeemCode.length < 4} className={BTN_G + ' flex-1'} style={{ background: GREEN }}>{loading ? 'Verifying…' : 'Verify & join'}</button>
            </div>
          </div>
        )}

        {/* SUBMIT VERIFICATION */}
        {screen === 'verify_email' && company && (
          <div className={CARD + ' space-y-5'}>
            <div>
              <h2 className="font-black text-stone-900 flex items-center gap-2"><ShieldCheck className="h-5 w-5" style={{ color: GREEN }} /> Request verification</h2>
              <p className="text-xs text-stone-500 mt-1">We verify companies to protect candidates from fraudulent listings.</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Your verification email</p>
              <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                <Mail className="h-4 w-4 text-stone-400 flex-shrink-0" />
                <span className="text-sm text-stone-700 font-medium">{recruiterEmail || '(no email)'}</span>
              </div>
              {recruiterEmail && company.website && <EmailDomainPill email={recruiterEmail} website={company.website} />}
            </div>
            {canInstant ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                <p className="font-black text-emerald-800 flex items-center gap-2"><Zap className="h-5 w-5" /> Verifies instantly</p>
                <p className="text-sm text-emerald-700 leading-relaxed">Your email domain matches <strong>{company.website}</strong>. Click submit and your company is verified immediately.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-black text-amber-800 flex items-center gap-2 mb-1"><FileText className="h-5 w-5" /> Manual review required</p>
                  <p className="text-sm text-amber-700 leading-relaxed">Our team reviews within <strong>1–2 business days</strong>.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-stone-600">Additional context <span className="font-normal text-stone-400">(optional but recommended)</span></label>
                  <textarea className={INPUT + ' resize-none'} rows={3} placeholder="e.g. I'm the Head of Talent at Acme. LinkedIn: linkedin.com/company/acme" value={verifyNotes} onChange={e => setVerifyNotes(e.target.value)} maxLength={500} />
                  <p className="text-[10px] text-stone-300 text-right mt-0.5">{verifyNotes.length}/500</p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setScreen('dashboard')} className={BTN_O}>Cancel</button>
              <button onClick={handleSubmitVerification} disabled={verifyLoading}
                className={BTN_G + ' flex-1 flex items-center justify-center gap-2'} style={{ background: canInstant ? '#059669' : GREEN }}>
                {verifyLoading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting…</> : canInstant ? <><Zap className="h-4 w-4" /> Verify instantly</> : <><FileText className="h-4 w-4" /> Submit for review</>}
              </button>
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {screen === 'dashboard' && company && (
          <>
            {verifStatus !== 'verified' && (
              <UnverifiedWarningBanner status={verifStatus} companyName={company.name} rejectionReason={company.rejectionReason} onStartVerification={() => setScreen('verify_email')} />
            )}

            {/* Company header */}
            <div className={CARD + ' flex items-center gap-4'}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: GREEN_LT }}>
                <Building2 className="h-7 w-7" style={{ color: GREEN }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-stone-900 text-lg">{company.name}</p>
                  <VerifiedBadge status={verifStatus} />
                </div>
                <p className="text-sm text-stone-500 mt-0.5 truncate">
                  {company.industry}
                  {company.website && (
                    <a href={company.website} target="_blank" rel="noopener noreferrer"
                      className="ml-2 inline-flex items-center gap-0.5 hover:underline" style={{ color: GREEN }}
                      onClick={e => e.stopPropagation()}>
                      {company.website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              </div>
              {isAdmin && (
                <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border flex-shrink-0"
                  style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                  <Crown className="h-3 w-3" /> Admin
                </span>
              )}
            </div>

            {/* Verify CTA */}
            {verifStatus === 'unverified' && isAdmin && (
              <button onClick={() => setScreen('verify_email')}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white hover:opacity-90 transition-opacity"
                style={{ background: GREEN }}>
                <ShieldCheck className="h-4 w-4" /> Submit for verification
              </button>
            )}

            {/* ── Company Details (editable) ─────────────────────── */}
            <div className={CARD}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" style={{ color: GREEN }} /> Company details
                </h3>
                {isAdmin && !editing && (
                  <button onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 text-sm font-bold hover:opacity-70 transition-opacity" style={{ color: GREEN }}>
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                {editing && (
                  <div className="flex items-center gap-2">
                    <button onClick={handleCancelEdit} className="text-xs font-bold text-stone-400 hover:text-stone-600 px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors">Cancel</button>
                    <button onClick={handleSaveEdit} disabled={editLoading || !editForm.name.trim()}
                      className="flex items-center gap-1.5 text-xs font-black text-white px-3 py-1.5 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
                      style={{ background: GREEN }}>
                      {editLoading ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save</>}
                    </button>
                  </div>
                )}
              </div>

              {!isAdmin && (
                <div className="flex items-center gap-2 mb-3 mt-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2">
                  <Info className="h-3.5 w-3.5 text-stone-400 flex-shrink-0" />
                  <p className="text-xs text-stone-500">Only the company admin can edit these details.</p>
                </div>
              )}

              <FieldRow label="Company name" value={editing ? editForm.name : company.name}
                editing={editing} onChange={v => setEditForm(p => ({ ...p, name: v }))} placeholder="Acme Corp" />
              <FieldRow label="Industry" value={editing ? editForm.industry : (company.industry ?? '')}
                editing={editing} onChange={v => setEditForm(p => ({ ...p, industry: v }))} placeholder="Technology" />
              <FieldRow label="Website" value={editing ? editForm.website : (company.website ?? '')}
                editing={editing} inputType="url" onChange={v => setEditForm(p => ({ ...p, website: v }))} placeholder="https://acme.com"
                hint={editing ? 'Changing the website may affect your verification status.' : undefined} />
              <FieldRow label="Description" value={editing ? editForm.description : (company.description ?? '')}
                editing={editing} inputType="textarea" onChange={v => setEditForm(p => ({ ...p, description: v }))} placeholder="What does your company do?" />
            </div>

            {/* Verification request status */}
            {verifRequest && verifStatus !== 'unverified' && (
              <div className={CARD + ' space-y-3'}>
                <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2"><Shield className="h-4 w-4" style={{ color: GREEN }} /> Verification request</h3>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-black" style={{ background: display.bg, color: display.color, border: `1px solid ${display.border}` }}>{display.badgeLabel}</span>
                      <span className="text-xs text-stone-400">{verifRequest.verificationType === 'email_domain' ? '⚡ Instant' : '👤 Manual review'}</span>
                    </div>
                    {verifRequest.submittedAt?.toDate && <p className="text-xs text-stone-400">Submitted {verifRequest.submittedAt.toDate().toLocaleDateString()}</p>}
                    {company.rejectionReason && <p className="text-xs text-red-700"><strong>Reason:</strong> {company.rejectionReason}</p>}
                  </div>
                  {verifStatus === 'rejected' && isAdmin && (
                    <button onClick={() => setScreen('verify_email')} className="text-xs font-black px-3 py-1.5 rounded-xl text-white flex-shrink-0" style={{ background: '#dc2626' }}>Resubmit</button>
                  )}
                </div>
              </div>
            )}

            {/* Feature access */}
            <div className={CARD + ' space-y-1'}>
              <h3 className="font-bold text-stone-900 text-sm mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /> Feature access</h3>
              {[
                { label: 'Post live jobs',      ok: restrictions.canPostJobs },
                { label: 'Contact candidates',  ok: restrictions.canContactCandidates },
                { label: 'View full profiles',  ok: restrictions.canViewFullProfiles },
                { label: 'AI candidate search', ok: restrictions.canRunAISearch },
                { label: 'Job feed visibility', ok: restrictions.jobVisibility === 'full', partial: restrictions.jobVisibility === 'limited', partialLabel: 'Preview only' },
              ].map(({ label, ok, partial, partialLabel }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                  <span className="text-sm text-stone-700">{label}</span>
                  {ok ? <span className="text-xs font-black flex items-center gap-1" style={{ color: GREEN }}><CheckCircle className="h-3.5 w-3.5" /> On</span>
                  : partial ? <span className="text-xs font-black text-amber-600 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {partialLabel}</span>
                  : <span className="text-xs font-black text-stone-400 flex items-center gap-1"><X className="h-3.5 w-3.5" /> Locked</span>}
                </div>
              ))}
            </div>

            {/* Team */}
            <div className={CARD + ' space-y-4'}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2"><Users className="h-4 w-4" style={{ color: GREEN }} /> Verified recruiters ({company.verifiedRecruiters?.length ?? 0})</h3>
                {isAdmin && (
                  <button onClick={() => setShowInviteForm(v => !v)} className="flex items-center gap-1.5 text-sm font-bold hover:opacity-80 transition-opacity" style={{ color: GREEN }}>
                    <UserPlus className="h-4 w-4" /> Invite
                  </button>
                )}
              </div>
              {isAdmin && showInviteForm && (
                <div className="rounded-xl border border-stone-100 bg-stone-50 p-4 space-y-3">
                  <p className="text-xs text-stone-600 font-medium">Generate a one-time invite code.</p>
                  <div className="flex gap-2">
                    <input className={INPUT + ' flex-1'} placeholder="Optional: restrict to email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                    <button onClick={handleGenerateInvite} disabled={loading} className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>Generate</button>
                  </div>
                  {generatedCode && (
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3 border" style={{ background: GREEN_LT, borderColor: '#b6ddd2' }}>
                      <span className="font-mono text-2xl font-black tracking-[0.2em]" style={{ color: GREEN }}>{generatedCode}</span>
                      <button onClick={() => handleCopy(generatedCode)} className="ml-auto flex items-center gap-1.5 text-sm font-bold" style={{ color: GREEN }}>
                        {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiedCode ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {(company.verifiedRecruiters ?? []).map(uid => (
                  <div key={uid} className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: '#e7e5e4' }}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white" style={{ background: GREEN }}>
                      {(memberNames[uid] ?? uid)[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{memberNames[uid] ?? 'Recruiter'}</p>
                      <p className="text-xs text-stone-400">{uid === company.adminUid ? 'Admin' : ''}{uid === fbUser?.uid ? (uid === company.adminUid ? ' · You' : 'You') : ''}</p>
                    </div>
                    {isAdmin && uid !== fbUser?.uid && (
                      <button onClick={() => handleRemove(uid)} className="text-stone-300 hover:text-red-500 transition-colors p-1"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              {!isAdmin && <p className="text-xs text-stone-400 text-center py-1">Contact your admin to manage team members.</p>}
            </div>

            {/* Pending invites */}
            {isAdmin && (company.pendingInvites ?? []).filter(i => !i.usedBy && new Date(i.expiresAt) > new Date()).length > 0 && (
              <div className={CARD + ' space-y-3'}>
                <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-stone-500" /> Pending invites</h3>
                {(company.pendingInvites ?? []).filter(i => !i.usedBy && new Date(i.expiresAt) > new Date()).map(invite => (
                  <div key={invite.code} className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: '#e7e5e4' }}>
                    <span className="font-mono text-sm font-black tracking-widest text-stone-700">{invite.code}</span>
                    {invite.forEmail && <span className="flex items-center gap-1 text-xs text-stone-500"><Mail className="h-3 w-3" />{invite.forEmail}</span>}
                    <span className="ml-auto text-xs text-stone-400">Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                    <button onClick={() => handleCopy(invite.code)} className="text-stone-400 hover:text-[#1a4a3a] p-1"><Copy className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Danger zone */}
            {isAdmin && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3">
                <p className="text-xs font-black text-red-500 uppercase tracking-wider">Danger zone</p>
                <p className="text-xs text-red-600 leading-relaxed">Deleting your company permanently removes it from BeWatu and hides all associated job listings. This cannot be undone.</p>
                <button onClick={() => setShowDelete(true)}
                  className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-4 w-4" /> Delete company
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CompanyVerification;
