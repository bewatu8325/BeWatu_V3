import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, ShieldCheck, UserPlus, Copy, Check, X, RefreshCw,
  AlertTriangle, ChevronRight, Trash2, Crown, Users, Link2,
  CheckCircle, Clock, Mail,
} from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  getCompanyForRecruiter,
  createCompanyWithAdmin,
  generateInviteCode,
  redeemInviteCode,
  removeRecruiterFromCompany,
  updateCompanyProfile,
  fetchUsers,
} from '../../lib/firestoreService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyVerificationProps {
  currentUserName: string;
  onCompanyVerified?: (companyName: string) => void;
}

interface CompanyData {
  _firestoreId: string;
  name: string;
  description: string;
  industry: string;
  website: string;
  adminUid: string;
  verifiedRecruiters: string[];
  pendingInvites: PendingInvite[];
}

interface PendingInvite {
  code: string;
  forEmail: string | null;
  expiresAt: string;
  createdAt: string;
  usedBy: string | null;
}

type ScreenState = 'loading' | 'no_company' | 'create_company' | 'redeem_code' | 'dashboard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BG = 'bg-stone-50 min-h-full';
const CARD = 'rounded-xl border bg-white p-6 shadow-sm';
const BTN_GREEN = 'rounded-lg bg-[#1a4a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#163d30] transition-colors disabled:opacity-50';
const BTN_OUTLINE = 'rounded-lg border px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors';
const INPUT = 'w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-[#1a4a3a] transition-colors';

// ─── Main Component ───────────────────────────────────────────────────────────

const CompanyVerification: React.FC<CompanyVerificationProps> = ({ currentUserName, onCompanyVerified }) => {
  const { fbUser } = useFirebase();

  const [screen, setScreen] = useState<ScreenState>('loading');
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({ name: '', description: '', industry: '', website: '' });

  // Redeem form
  const [redeemCode, setRedeemCode] = useState('');

  // Invite
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Team members display
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  const isAdmin = company?.adminUid === fbUser?.uid;

  // ── Load company ────────────────────────────────────────────────────────────
  const loadCompany = useCallback(async () => {
    if (!fbUser) return;
    setLoading(true);
    try {
      const c = await getCompanyForRecruiter(fbUser.uid);
      if (c) {
        setCompany(c);
        setScreen('dashboard');
        onCompanyVerified?.(c.name);
        // Load member display names
        try {
          const users = await fetchUsers();
          const names: Record<string, string> = {};
          for (const u of users) {
            if (u._firestoreUid) names[u._firestoreUid] = u.name;
          }
          setMemberNames(names);
        } catch {}
      } else {
        setScreen('no_company');
      }
    } catch {
      setScreen('no_company');
    } finally {
      setLoading(false);
    }
  }, [fbUser]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  // ── Create company ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!fbUser || !createForm.name.trim()) return;
    setLoading(true); setError(null);
    try {
      await createCompanyWithAdmin(fbUser.uid, currentUserName, createForm);
      setSuccess(`Company "${createForm.name}" created. You are now the verified admin.`);
      await loadCompany();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create company.');
    } finally {
      setLoading(false);
    }
  };

  // ── Redeem code ─────────────────────────────────────────────────────────────
  const handleRedeem = async () => {
    if (!fbUser || !redeemCode.trim()) return;
    setLoading(true); setError(null);
    try {
      const result = await redeemInviteCode(fbUser.uid, redeemCode.trim());
      if (result.success) {
        setSuccess(`You are now a verified recruiter for ${result.companyName}!`);
        await loadCompany();
      } else {
        setError(result.error ?? 'Invalid code.');
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to redeem code.');
    } finally {
      setLoading(false);
    }
  };

  // ── Generate invite ─────────────────────────────────────────────────────────
  const handleGenerateInvite = async () => {
    if (!fbUser || !company) return;
    setLoading(true); setError(null);
    try {
      const code = await generateInviteCode(company._firestoreId, fbUser.uid, inviteEmail || undefined);
      setGeneratedCode(code);
      setInviteEmail('');
      setShowInviteForm(false);
      await loadCompany();
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate invite.');
    } finally {
      setLoading(false);
    }
  };

  // ── Copy code ───────────────────────────────────────────────────────────────
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ── Remove recruiter ────────────────────────────────────────────────────────
  const handleRemove = async (uid: string) => {
    if (!fbUser || !company) return;
    if (!window.confirm('Remove this recruiter from your company?')) return;
    setLoading(true); setError(null);
    try {
      await removeRecruiterFromCompany(company._firestoreId, fbUser.uid, uid);
      await loadCompany();
    } catch (e: any) {
      setError(e.message ?? 'Failed to remove recruiter.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className={BG + ' flex items-center justify-center py-24'}>
        <RefreshCw className="h-6 w-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className={BG + ' px-4 py-6 md:px-8'}>
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#1a4a3a]" />
            Company Verification
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Verify your company affiliation to post live job listings.
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-[#e8f4f0] px-4 py-3 text-sm text-[#1a4a3a]">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* ── NO COMPANY ── */}
        {screen === 'no_company' && (
          <div className={CARD + ' space-y-4'}>
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Not verified for any company</p>
                <p className="text-xs text-amber-700 mt-0.5">Your job posts will be hidden until you verify your company affiliation.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => setScreen('create_company')}
                className="flex flex-col items-start gap-2 rounded-xl border-2 border-dashed border-stone-200 p-5 text-left hover:border-[#1a4a3a] hover:bg-[#e8f4f0] transition-all group"
              >
                <Building2 className="h-6 w-6 text-stone-400 group-hover:text-[#1a4a3a]" />
                <div>
                  <p className="font-semibold text-stone-800">Create Company Profile</p>
                  <p className="text-xs text-stone-500 mt-0.5">You'll become the verified admin</p>
                </div>
                <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-[#1a4a3a]" />
              </button>
              <button
                onClick={() => setScreen('redeem_code')}
                className="flex flex-col items-start gap-2 rounded-xl border-2 border-dashed border-stone-200 p-5 text-left hover:border-[#1a4a3a] hover:bg-[#e8f4f0] transition-all group"
              >
                <Link2 className="h-6 w-6 text-stone-400 group-hover:text-[#1a4a3a]" />
                <div>
                  <p className="font-semibold text-stone-800">Redeem Invite Code</p>
                  <p className="text-xs text-stone-500 mt-0.5">Your company admin sent you a code</p>
                </div>
                <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-[#1a4a3a]" />
              </button>
            </div>
          </div>
        )}

        {/* ── CREATE COMPANY ── */}
        {screen === 'create_company' && (
          <div className={CARD + ' space-y-4'}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-stone-900 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#1a4a3a]" /> Create Company Profile
              </h2>
              <button onClick={() => setScreen('no_company')} className="text-stone-400 hover:text-stone-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              {[
                { key: 'name', label: 'Company Name *', placeholder: 'Acme Corp', required: true },
                { key: 'industry', label: 'Industry', placeholder: 'Technology, Finance, Healthcare…' },
                { key: 'website', label: 'Website', placeholder: 'https://acme.com' },
              ].map(({ key, label, placeholder, required }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-stone-600">{label}</label>
                  <input
                    className={INPUT}
                    style={{ borderColor: '#e7e5e4' }}
                    placeholder={placeholder}
                    value={(createForm as any)[key]}
                    onChange={e => setCreateForm(p => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Description</label>
                <textarea
                  className={INPUT + ' resize-none'}
                  style={{ borderColor: '#e7e5e4' }}
                  rows={3}
                  placeholder="What does your company do?"
                  value={createForm.description}
                  onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setScreen('no_company')} className={BTN_OUTLINE} style={{ borderColor: '#e7e5e4' }}>Cancel</button>
              <button onClick={handleCreate} disabled={loading || !createForm.name.trim()} className={BTN_GREEN}>
                {loading ? 'Creating…' : 'Create & Become Admin'}
              </button>
            </div>
          </div>
        )}

        {/* ── REDEEM CODE ── */}
        {screen === 'redeem_code' && (
          <div className={CARD + ' space-y-4'}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-stone-900 flex items-center gap-2">
                <Link2 className="h-5 w-5 text-[#1a4a3a]" /> Enter Invite Code
              </h2>
              <button onClick={() => setScreen('no_company')} className="text-stone-400 hover:text-stone-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-stone-500">Ask your company admin to generate an invite code from their Company Verification page.</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Invite Code</label>
              <input
                className={INPUT + ' font-mono tracking-widest uppercase text-lg'}
                style={{ borderColor: '#e7e5e4' }}
                placeholder="XXXXXX"
                maxLength={6}
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setScreen('no_company')} className={BTN_OUTLINE} style={{ borderColor: '#e7e5e4' }}>Cancel</button>
              <button onClick={handleRedeem} disabled={loading || redeemCode.length < 4} className={BTN_GREEN}>
                {loading ? 'Verifying…' : 'Verify & Join'}
              </button>
            </div>
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {screen === 'dashboard' && company && (
          <>
            {/* Verified badge */}
            <div className={CARD + ' flex items-center gap-4'}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e8f4f0]">
                <Building2 className="h-6 w-6 text-[#1a4a3a]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-stone-900 truncate">{company.name}</p>
                  <span className="flex items-center gap-1 rounded-full bg-[#e8f4f0] px-2 py-0.5 text-xs font-medium text-[#1a4a3a]">
                    <ShieldCheck className="h-3 w-3" /> Verified
                  </span>
                </div>
                <p className="text-sm text-stone-500 truncate">{company.industry || 'Company'}</p>
              </div>
              {isAdmin && (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Crown className="h-3 w-3" /> Admin
                </span>
              )}
            </div>

            {/* Team members */}
            <div className={CARD + ' space-y-4'}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-stone-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#1a4a3a]" />
                  Verified Recruiters ({company.verifiedRecruiters?.length ?? 0})
                </h3>
                {isAdmin && (
                  <button
                    onClick={() => setShowInviteForm(v => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-[#1a4a3a] hover:text-[#163d30]"
                  >
                    <UserPlus className="h-4 w-4" /> Invite
                  </button>
                )}
              </div>

              {/* Invite form */}
              {isAdmin && showInviteForm && (
                <div className="rounded-lg border bg-stone-50 p-4 space-y-3" style={{ borderColor: '#e7e5e4' }}>
                  <p className="text-xs text-stone-600">Generate a one-time invite code (expires in 7 days).</p>
                  <div className="flex gap-2">
                    <input
                      className={INPUT + ' flex-1'}
                      style={{ borderColor: '#e7e5e4' }}
                      placeholder="Optional: restrict to email address"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                    />
                    <button onClick={handleGenerateInvite} disabled={loading} className={BTN_GREEN}>
                      Generate
                    </button>
                  </div>
                  {generatedCode && (
                    <div className="flex items-center gap-3 rounded-lg border border-[#1a4a3a]/20 bg-[#e8f4f0] px-4 py-3">
                      <span className="font-mono text-xl font-bold tracking-widest text-[#1a4a3a]">{generatedCode}</span>
                      <button onClick={() => handleCopy(generatedCode)} className="ml-auto flex items-center gap-1.5 text-sm text-[#1a4a3a] hover:text-[#163d30]">
                        {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedCode ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Member list */}
              <div className="space-y-2">
                {(company.verifiedRecruiters ?? []).map(uid => (
                  <div key={uid} className="flex items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: '#e7e5e4' }}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600">
                      {(memberNames[uid] ?? uid)[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">
                        {memberNames[uid] ?? 'Recruiter'}
                        {uid === company.adminUid && (
                          <span className="ml-2 text-xs text-amber-600 font-normal">Admin</span>
                        )}
                        {uid === fbUser?.uid && (
                          <span className="ml-2 text-xs text-stone-400 font-normal">You</span>
                        )}
                      </p>
                    </div>
                    {isAdmin && uid !== fbUser?.uid && (
                      <button onClick={() => handleRemove(uid)} className="text-stone-400 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pending invites (admin only) */}
            {isAdmin && (company.pendingInvites ?? []).filter(i => !i.usedBy && new Date(i.expiresAt) > new Date()).length > 0 && (
              <div className={CARD + ' space-y-3'}>
                <h3 className="font-semibold text-stone-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-stone-500" /> Pending Invites
                </h3>
                {(company.pendingInvites ?? [])
                  .filter(i => !i.usedBy && new Date(i.expiresAt) > new Date())
                  .map(invite => (
                    <div key={invite.code} className="flex items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: '#e7e5e4' }}>
                      <span className="font-mono text-sm font-bold tracking-widest text-stone-700">{invite.code}</span>
                      {invite.forEmail && (
                        <span className="flex items-center gap-1 text-xs text-stone-500">
                          <Mail className="h-3 w-3" />{invite.forEmail}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-stone-400">
                        Expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </span>
                      <button onClick={() => handleCopy(invite.code)} className="text-stone-400 hover:text-[#1a4a3a]">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {/* Info for non-admins */}
            {!isAdmin && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500">
                Contact your company admin to add or remove team members.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CompanyVerification;
