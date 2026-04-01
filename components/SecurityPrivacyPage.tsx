import React, { useState, useEffect } from 'react';
import { User, PrivacySettings, DEFAULT_PRIVACY } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';
import { updateUserInFirestore } from '../lib/firebaseAuth';
import { Download, Trash2 } from 'lucide-react';

// ── Safely import optional auth functions ─────────────────────────────────────
async function safeGetSecurityEvents(uid: string, limit: number): Promise<any[]> {
  try {
    const mod = await import('../lib/firebaseAuth');
    if (typeof (mod as any).getSecurityEvents === 'function') {
      return await (mod as any).getSecurityEvents(uid, limit);
    }
  } catch {}
  return [];
}
async function safeRevokeOtherSessions(uid: string): Promise<void> {
  try {
    const mod = await import('../lib/firebaseAuth');
    if (typeof (mod as any).revokeOtherSessions === 'function') {
      await (mod as any).revokeOtherSessions(uid);
    }
  } catch {}
}
async function safeSendVerificationEmail(): Promise<void> {
  try {
    const mod = await import('../lib/firebaseAuth');
    if (typeof (mod as any).sendVerificationEmail === 'function') {
      await (mod as any).sendVerificationEmail();
    }
  } catch {}
}
function safeIsEmailVerified(): boolean {
  try {
    const { auth } = require('../lib/firebase');
    return auth?.currentUser?.emailVerified ?? false;
  } catch { return false; }
}
async function safeChangePassword(current: string, next: string): Promise<void> {
  const mod = await import('../lib/firebaseAuth');
  if (typeof (mod as any).changePassword === 'function') {
    await (mod as any).changePassword(current, next);
  } else {
    throw new Error('Password change not available.');
  }
}

const IconShield = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
const IconLock   = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>);
const IconEye    = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>);
const IconUsers  = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconBriefcase = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>);
const IconCheck  = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>);
const IconArrowLeft = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>);

const GREEN = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, onChange, disabled }) => (
  <button type="button" onClick={() => !disabled && onChange(!on)}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    style={{ backgroundColor: on ? GREEN : '#d6d3d1' }}>
    <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5"
      style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }} />
  </button>
);

const VisibilityOption: React.FC<{
  value: PrivacySettings['profileVisibility']; current: PrivacySettings['profileVisibility'];
  label: string; desc: string; icon: React.ReactNode; onSelect: (v: PrivacySettings['profileVisibility']) => void;
}> = ({ value, current, label, desc, icon, onSelect }) => {
  const active = value === current;
  return (
    <button type="button" onClick={() => onSelect(value)}
      className="w-full text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-all"
      style={{ borderColor: active ? GREEN : '#e7e5e4', backgroundColor: active ? GREEN_LT : 'white' }}>
      <div className="mt-0.5 flex-shrink-0" style={{ color: active ? GREEN : '#78716c' }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm" style={{ color: active ? GREEN : '#1c1917' }}>{label}</p>
        <p className="text-xs text-stone-500 mt-0.5">{desc}</p>
      </div>
      {active && <div className="flex-shrink-0 mt-0.5" style={{ color: GREEN }}><IconCheck /></div>}
    </button>
  );
};

interface SecurityPrivacyPageProps {
  user: User;
  onBack: () => void;
  onChangePassword: () => void;
  onDeleteAccount?: () => void;
  onExportData?: () => Promise<void>;
}

const SecurityPrivacyPage: React.FC<SecurityPrivacyPageProps> = ({ user, onBack, onChangePassword, onDeleteAccount, onExportData }) => {
  const { fbUser } = useFirebase();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacySaved, setPrivacySaved] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacySettings>({ ...DEFAULT_PRIVACY, ...(user.privacySettings ?? {}) });
  const setP = (key: keyof PrivacySettings, val: any) => setPrivacy(p => ({ ...p, [key]: val }));
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  useEffect(() => {
    setEmailVerified(safeIsEmailVerified());
    if (fbUser) {
      setLoadingEvents(true);
      safeGetSecurityEvents(fbUser.uid, 10).then(setSecurityEvents).catch(() => {}).finally(() => setLoadingEvents(false));
    }
  }, [fbUser]);

  async function handleChangePasswordFull(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    if (!currentPasswordInput) { setPasswordError('Current password is required.'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords don't match."); return; }
    setChangingPassword(true);
    try {
      await safeChangePassword(currentPasswordInput, newPassword);
      setPasswordSuccess(true);
      setNewPassword(''); setConfirmPassword(''); setCurrentPasswordInput('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (err: any) {
      setPasswordError(err.message?.includes('wrong-password') || err.message?.includes('invalid-credential')
        ? 'Current password is incorrect.' : err.message ?? 'Failed to update password.');
    } finally { setChangingPassword(false); }
  }

  async function handleSavePrivacy() {
    if (!fbUser) return;
    setSavingPrivacy(true);
    try { await updateUserInFirestore(fbUser.uid, { privacySettings: privacy } as any); setPrivacySaved(true); setTimeout(() => setPrivacySaved(false), 3000); }
    finally { setSavingPrivacy(false); }
  }

  async function handleRevokeOtherSessions() {
    if (!fbUser) return;
    setRevokingSessions(true);
    try { await safeRevokeOtherSessions(fbUser.uid); setRevokeSuccess(true); setTimeout(() => setRevokeSuccess(false), 4000); }
    finally { setRevokingSessions(false); }
  }

  async function handleSendVerification() {
    setSendingVerify(true);
    try { await safeSendVerificationEmail(); setVerifySent(true); setTimeout(() => setVerifySent(false), 5000); }
    finally { setSendingVerify(false); }
  }

  async function handleExport() {
    if (!onExportData) return;
    setExportLoading(true);
    try { await onExportData(); setExportDone(true); setTimeout(() => setExportDone(false), 3000); }
    catch (err) { console.error('Export failed:', err); }
    finally { setExportLoading(false); }
  }

  function formatEventTime(val: any): string {
    try { const d = val?.toDate ? val.toDate() : new Date(val); return d.toLocaleString(); } catch { return ''; }
  }

  const EVENT_META: Record<string, { label: string; color: string; icon: string }> = {
    login:               { label: 'Signed in',                 color: GREEN,     icon: '🔓' },
    password_change:     { label: 'Password changed',          color: '#b45309', icon: '🔑' },
    email_change:        { label: 'Email changed',             color: '#0369a1', icon: '✉️' },
    suspicious_login:    { label: 'Suspicious sign-in',        color: '#dc2626', icon: '⚠️' },
    session_revoked:     { label: 'Other sessions signed out', color: '#7c3aed', icon: '🚪' },
    two_factor_enrolled: { label: '2-step verification on',    color: GREEN,     icon: '🛡️' },
    two_factor_removed:  { label: '2-step verification off',   color: '#dc2626', icon: '🛡️' },
  };

  const inputCls = "w-full p-2.5 bg-stone-50 text-stone-800 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a4a3a]/30 placeholder:text-stone-400 text-sm";

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: GREEN }}>
          <IconArrowLeft /> Back to profile
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white flex-shrink-0" style={{ backgroundColor: GREEN }}><IconShield /></div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Security & Privacy</h1>
          <p className="text-sm text-stone-500">Manage your password, privacy, and account data</p>
        </div>
      </div>

      {/* Password */}
      <div className="bg-white rounded-2xl border p-5 sm:p-6 space-y-4" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-2"><IconLock /><h2 className="font-bold text-stone-900">Change Password</h2></div>
        {!emailVerified && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800">Email not verified</p>
              <p className="text-xs text-amber-700 mt-0.5">Verify your email to enable password recovery.</p>
              {verifySent ? <p className="text-xs font-semibold mt-2" style={{ color: GREEN }}>✓ Verification email sent</p>
                : <button onClick={handleSendVerification} disabled={sendingVerify} className="mt-2 text-xs font-bold underline disabled:opacity-50" style={{ color: '#b45309' }}>{sendingVerify ? 'Sending…' : 'Send verification email'}</button>}
            </div>
          </div>
        )}
        <form onSubmit={handleChangePasswordFull} className="space-y-3">
          <div><label className="text-xs font-semibold text-stone-500 mb-1 block">Current password *</label><input type="password" className={inputCls} placeholder="Your current password" value={currentPasswordInput} onChange={e => setCurrentPasswordInput(e.target.value)} autoComplete="current-password" /></div>
          <div><label className="text-xs font-semibold text-stone-500 mb-1 block">New password *</label><input type="password" className={inputCls} placeholder="Min 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></div>
          <div><label className="text-xs font-semibold text-stone-500 mb-1 block">Confirm new password *</label><input type="password" className={inputCls} placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" /></div>
          {newPassword.length > 0 && (
            <div className="rounded-xl bg-stone-50 border border-stone-100 p-3 space-y-1.5">
              {[{ ok: newPassword.length >= 8, label: 'At least 8 characters' }, { ok: /[A-Z]/.test(newPassword), label: 'One uppercase letter' }, { ok: /[0-9]/.test(newPassword), label: 'One number' }, { ok: /[^A-Za-z0-9]/.test(newPassword), label: 'One special character (recommended)' }].map(({ ok, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs"><span className={ok ? 'text-emerald-500' : 'text-stone-300'}>{ok ? '✓' : '○'}</span><span className={ok ? 'text-stone-600' : 'text-stone-400'}>{label}</span></div>
              ))}
            </div>
          )}
          {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: GREEN }}><IconCheck /> Password updated</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={!newPassword || !confirmPassword || !currentPasswordInput || changingPassword}
              className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40" style={{ backgroundColor: GREEN }}>
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>

      {/* Profile Visibility */}
      <div className="bg-white rounded-2xl border p-5 sm:p-6 space-y-4" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-2"><IconEye /><h2 className="font-bold text-stone-900">Profile Visibility</h2></div>
        <p className="text-sm text-stone-500">Choose who can find and view your profile.</p>
        <div className="space-y-2">
          <VisibilityOption value="public" current={privacy.profileVisibility} label="Public" desc="Anyone on BeWatu can see your profile" icon={<IconEye />} onSelect={v => setP('profileVisibility', v)} />
          <VisibilityOption value="connections" current={privacy.profileVisibility} label="Connections only" desc="Only people you're connected with can see your full profile" icon={<IconUsers />} onSelect={v => setP('profileVisibility', v)} />
          <VisibilityOption value="private" current={privacy.profileVisibility} label="Private" desc="Your profile is hidden from all searches" icon={<IconLock />} onSelect={v => setP('profileVisibility', v)} />
        </div>
      </div>

      {/* Social Permissions */}
      <div className="bg-white rounded-2xl border p-5 sm:p-6 space-y-5" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-2"><IconUsers /><h2 className="font-bold text-stone-900">Social Permissions</h2></div>
        {([{ key: 'allowConnectionRequests', label: 'Allow connection requests', desc: 'Others can send you a request to connect' }, { key: 'allowFollow', label: 'Allow following', desc: 'Others can follow your posts without connecting' }] as const).map(({ key, label, desc }, i) => (
          <React.Fragment key={key}>
            {i > 0 && <div className="h-px bg-stone-100" />}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><p className="font-semibold text-sm text-stone-900">{label}</p><p className="text-xs text-stone-500 mt-0.5">{desc}</p></div>
              <Toggle on={privacy[key] as boolean} onChange={v => setP(key, v)} />
            </div>
          </React.Fragment>
        ))}
        <div className="h-px bg-stone-100" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex items-start gap-2"><div className="mt-0.5"><IconBriefcase /></div>
            <div><p className="font-semibold text-sm text-stone-900">Visible to recruiters</p>
              <p className="text-xs text-stone-500 mt-0.5">Recruiters can find your profile in talent searches.{privacy.profileVisibility === 'private' && <span className="block mt-1 font-medium text-amber-600">⚠ Profile is private — recruiters won't see it regardless.</span>}</p>
            </div>
          </div>
          <Toggle on={privacy.visibleToRecruiters} onChange={v => setP('visibleToRecruiters', v)} disabled={privacy.profileVisibility === 'private'} />
        </div>
      </div>

      {/* Account Protection */}
      <div className="bg-white rounded-2xl border p-5 sm:p-6 space-y-5" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-2"><IconShield /><h2 className="font-bold text-stone-900">Account Protection</h2></div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-stone-900">Sign out other devices</p>
            <p className="text-xs text-stone-500 mt-0.5">Revoke access from all devices except this one.</p>
            {revokeSuccess && <p className="text-xs font-semibold mt-1.5" style={{ color: GREEN }}>✓ Other sessions signed out</p>}
          </div>
          <button onClick={handleRevokeOtherSessions} disabled={revokingSessions}
            className="flex-shrink-0 rounded-xl border px-4 py-2 text-xs font-bold transition-all hover:shadow-sm disabled:opacity-50" style={{ borderColor: '#e7e5e4', color: '#dc2626' }}>
            {revokingSessions ? 'Revoking…' : 'Sign out all'}
          </button>
        </div>
        <div className="h-px bg-stone-100" />
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Recent Security Activity</p>
          {loadingEvents ? <p className="text-xs text-stone-400">Loading activity…</p>
            : securityEvents.length === 0 ? <p className="text-xs text-stone-400">No security events recorded yet.</p>
            : <div className="space-y-2">{securityEvents.map((ev, i) => { const meta = EVENT_META[ev.type] ?? { label: ev.type, color: '#78716c', icon: '🔔' }; return (
              <div key={ev.id ?? i} className="flex items-start gap-3 p-3 rounded-xl border" style={{ borderColor: '#f0ede6' }}>
                <span className="text-base leading-none flex-shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</p>
                    <p className="text-[10px] text-stone-400 flex-shrink-0">{formatEventTime(ev.timestamp)}</p>
                  </div>
                  {ev.details && <p className="text-xs text-stone-400 mt-0.5">{ev.details}</p>}
                </div>
              </div>);})}</div>}
        </div>
      </div>

      {/* Your Data */}
      <div className="bg-white rounded-2xl border p-5 sm:p-6 space-y-4" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-2"><Download size={16} className="text-stone-600" /><h2 className="font-bold text-stone-900">Your Data</h2></div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-stone-900">Download your data</p>
            <p className="text-xs text-stone-500 mt-0.5">Get a copy of all your BeWatu data as a JSON file.</p>
            {exportDone && <p className="text-xs font-semibold mt-1.5" style={{ color: GREEN }}>✓ Download started</p>}
          </div>
          {onExportData && (
            <button onClick={handleExport} disabled={exportLoading}
              className="flex-shrink-0 rounded-xl border px-4 py-2 text-xs font-bold transition-all hover:shadow-sm disabled:opacity-50" style={{ borderColor: '#e7e5e4', color: GREEN }}>
              {exportLoading ? 'Preparing…' : 'Download'}
            </button>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      {onDeleteAccount && (
        <div className="bg-white rounded-2xl border border-red-100 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2"><Trash2 size={16} className="text-red-500" /><h2 className="font-bold text-red-600">Danger Zone</h2></div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-stone-900">Delete account</p>
              <p className="text-xs text-stone-500 mt-0.5">Permanently delete your account and all data. Anonymised within 30 days, fully deleted within 12 months.</p>
            </div>
            <button onClick={onDeleteAccount} className="flex-shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors">Delete</button>
          </div>
        </div>
      )}

      {/* Save Privacy */}
      <div className="flex items-center justify-between gap-4">
        {privacySaved && <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: GREEN }}><IconCheck /> Settings saved</p>}
        <div className="ml-auto">
          <button onClick={handleSavePrivacy} disabled={savingPrivacy}
            className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: GREEN }}>
            {savingPrivacy ? 'Saving…' : 'Save Privacy Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecurityPrivacyPage;
