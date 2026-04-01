// src/components/SecurityPrivacyPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Security & Privacy settings page
// Props: user, onBack, onChangePassword, onDeleteAccount, onExportData
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  ArrowLeft, Lock, Shield, Download, Trash2,
  Eye, EyeOff, ChevronRight, CheckCircle2,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { User } from '../types';

interface SecurityPrivacyPageProps {
  user:               User;
  onBack:             () => void;
  onChangePassword:   (current: string, next: string) => Promise<void>;
  onDeleteAccount?:   () => void;
  onExportData?:      () => Promise<void>;
}

export default function SecurityPrivacyPage({
  user,
  onBack,
  onChangePassword,
  onDeleteAccount,
  onExportData,
}: SecurityPrivacyPageProps) {

  // ── Password change ────────────────────────────────────────────────────────
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPw,        setCurrentPw]        = useState('');
  const [newPw,            setNewPw]            = useState('');
  const [confirmPw,        setConfirmPw]        = useState('');
  const [showCurrentPw,    setShowCurrentPw]    = useState(false);
  const [showNewPw,        setShowNewPw]        = useState(false);
  const [pwLoading,        setPwLoading]        = useState(false);
  const [pwError,          setPwError]          = useState('');
  const [pwSuccess,        setPwSuccess]        = useState(false);

  // ── Data export ────────────────────────────────────────────────────────────
  const [exportLoading,    setExportLoading]    = useState(false);
  const [exportDone,       setExportDone]       = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await onChangePassword(currentPw, newPw);
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setPwSuccess(false); setShowPasswordForm(false); }, 2000);
    } catch (err: any) {
      setPwError(err.message ?? 'Failed to update password. Check your current password.');
    } finally {
      setPwLoading(false);
    }
  }

  async function handleExport() {
    if (!onExportData) return;
    setExportLoading(true);
    try {
      await onExportData();
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportLoading(false);
    }
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-stone-100">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="divide-y divide-stone-100">{children}</div>
    </div>
  );

  const Row = ({
    icon: Icon, label, description, action, danger = false,
  }: {
    icon: React.ComponentType<any>;
    label: string;
    description?: string;
    action?: React.ReactNode;
    danger?: boolean;
  }) => (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        danger ? 'bg-red-50' : 'bg-stone-100'
      }`}>
        <Icon size={15} className={danger ? 'text-red-500' : 'text-stone-500'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? 'text-red-600' : 'text-stone-900'}`}>{label}</p>
        {description && <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f5f4' }}>

      {/* Header */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button onClick={onBack}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-semibold text-stone-900">Security & Privacy</h1>
            <p className="text-xs text-stone-500">{user.name}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-20">

        {/* Account security */}
        <Section title="Account security">
          <Row
            icon={Lock}
            label="Password"
            description="Change your account password"
            action={
              <button
                onClick={() => setShowPasswordForm(p => !p)}
                className="text-xs font-semibold text-[#1a4a3a] hover:text-[#1a6b52] flex items-center gap-1 transition-colors">
                {showPasswordForm ? 'Cancel' : 'Change'} <ChevronRight size={13} />
              </button>
            }
          />

          {/* Password form */}
          {showPasswordForm && (
            <div className="px-5 pb-5">
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                {/* Current password */}
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder="Current password"
                    required
                    className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 pr-10"
                  />
                  <button type="button"
                    onClick={() => setShowCurrentPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {showCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* New password */}
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    required
                    className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 pr-10"
                  />
                  <button type="button"
                    onClick={() => setShowNewPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Confirm password */}
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400"
                />

                {pwError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                    <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{pwError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pwLoading || pwSuccess}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
                  style={{ backgroundColor: '#1a4a3a' }}>
                  {pwLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Updating…
                    </span>
                  ) : pwSuccess ? (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle2 size={14} /> Password updated
                    </span>
                  ) : 'Update password'}
                </button>
              </form>
            </div>
          )}
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <Row
            icon={Shield}
            label="Profile visibility"
            description={user.isPublic ? 'Your profile is visible to all members' : 'Your profile is private'}
            action={
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                user.isPublic
                  ? 'bg-[#e8f4f0] text-[#1a4a3a]'
                  : 'bg-stone-100 text-stone-500'
              }`}>
                {user.isPublic ? 'Public' : 'Private'}
              </span>
            }
          />
        </Section>

        {/* Your data */}
        <Section title="Your data">
          <Row
            icon={Download}
            label="Download your data"
            description="Get a copy of all your BeWatu data as a JSON file"
            action={
              <button
                onClick={handleExport}
                disabled={exportLoading}
                className="text-xs font-semibold text-[#1a4a3a] hover:text-[#1a6b52] flex items-center gap-1 transition-colors disabled:opacity-50">
                {exportLoading ? (
                  <><Loader2 size={12} className="animate-spin" /> Preparing…</>
                ) : exportDone ? (
                  <><CheckCircle2 size={12} className="text-green-500" /> Downloaded</>
                ) : (
                  <>Download <ChevronRight size={13} /></>
                )}
              </button>
            }
          />
        </Section>

        {/* Danger zone */}
        <Section title="Danger zone">
          <Row
            icon={Trash2}
            label="Delete account"
            description="Permanently delete your account and all associated data. This cannot be undone."
            danger
            action={
              onDeleteAccount ? (
                <button
                  onClick={onDeleteAccount}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors">
                  Delete <ChevronRight size={13} />
                </button>
              ) : undefined
            }
          />
        </Section>

        <p className="text-center text-xs text-stone-400 pb-4">
          Questions? Contact{' '}
          <a href="mailto:privacy@bewatu.com"
            className="text-[#1a4a3a] underline underline-offset-2">
            privacy@bewatu.com
          </a>
        </p>

      </div>
    </div>
  );
}
