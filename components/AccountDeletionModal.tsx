// src/components/AccountDeletionModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Three-step account deletion flow:
//   Step 1 — Warning: explain what deletion means
//   Step 2 — Confirm: type "DELETE" to proceed
//   Step 3 — Done: soft-delete written, user signed out
//
// Soft delete: sets status='pending_deletion', deletedAt, anonymises display data
// Hard delete: Cloud Function runs after 1 year (see firestoreService.ts)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2, CheckCircle2 } from 'lucide-react';

interface AccountDeletionModalProps {
  userName: string;
  onConfirm: () => Promise<void>;
  onClose:   () => void;
}

type Step = 'warning' | 'confirm' | 'deleting' | 'done';

export default function AccountDeletionModal({
  userName,
  onConfirm,
  onClose,
}: AccountDeletionModalProps) {
  const [step,        setStep]        = useState<Step>('warning');
  const [inputValue,  setInputValue]  = useState('');
  const [error,       setError]       = useState('');

  const canConfirm = inputValue.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!canConfirm) return;
    setStep('deleting');
    setError('');
    try {
      await onConfirm();
      setStep('done');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
      setStep('confirm');
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <Trash2 size={15} className="text-red-500" />
            </div>
            <h2 className="text-sm font-semibold text-stone-900">Delete account</h2>
          </div>
          {step !== 'deleting' && step !== 'done' && (
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Step 1 — Warning */}
        {step === 'warning' && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-red-700">This action is irreversible</p>
                <p className="text-xs text-red-600 leading-relaxed">
                  Once you request deletion, your account will be anonymised within 30 days and permanently deleted within 12 months.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-stone-700">What will be deleted:</p>
              <ul className="space-y-1.5 text-xs text-stone-500">
                {[
                  'Your profile, name, photo, and bio',
                  'Your posts, sparks, and reels',
                  'Your connections and messages',
                  'Your job applications and recruiter data',
                  'Your Factory ideas, solutions, and team memberships',
                  'Your subscription (no refund for remaining period)',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">×</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-stone-700">What will be retained (anonymised):</p>
              <ul className="space-y-1.5 text-xs text-stone-500">
                {[
                  'Aggregated platform analytics (no personal identifiers)',
                  'Billing records required by law (7 years)',
                  'Abuse/fraud records if any exist on your account',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-stone-400 mt-0.5 flex-shrink-0">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-50 transition-colors">
                Keep my account
              </button>
              <button onClick={() => setStep('confirm')}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Confirm */}
        {step === 'confirm' && (
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <p className="text-sm text-stone-700 leading-relaxed">
                Hi <strong>{userName}</strong>, this will permanently delete your BeWatu account and all associated data.
              </p>
              <p className="text-xs text-stone-500">
                Type <strong className="text-stone-700 font-mono">DELETE</strong> below to confirm.
              </p>
            </div>

            <input
              type="text"
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setError(''); }}
              placeholder="Type DELETE to confirm"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border text-sm font-mono tracking-wide transition-colors focus:outline-none"
              style={{
                borderColor: canConfirm ? '#ef4444' : '#e7e5e4',
                backgroundColor: canConfirm ? '#fef2f2' : '#ffffff',
              }}
            />

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setStep('warning'); setInputValue(''); setError(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-50 transition-colors">
                Back
              </button>
              <button
                onClick={handleDelete}
                disabled={!canConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: canConfirm ? '#ef4444' : '#f87171' }}>
                Delete my account
              </button>
            </div>

            <p className="text-[11px] text-stone-400 text-center">
              You will be signed out immediately. Your data will be anonymised within 30 days.
            </p>
          </div>
        )}

        {/* Step 3 — Deleting */}
        {step === 'deleting' && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <Loader2 size={28} className="text-stone-400 animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-stone-900">Deleting your account…</p>
              <p className="text-xs text-stone-500">Please wait, do not close this window.</p>
            </div>
          </div>
        )}

        {/* Step 4 — Done */}
        {step === 'done' && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 size={28} className="text-green-500" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-stone-900">Account deletion requested</p>
              <p className="text-xs text-stone-500 leading-relaxed max-w-xs">
                Your account has been scheduled for deletion. You will be signed out now. Your data will be fully removed within 12 months.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
