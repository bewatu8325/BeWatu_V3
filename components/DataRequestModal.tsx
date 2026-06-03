/**
 * components/DataRequestModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * GDPR-compliant data download request flow:
 * Step 1 — Confirm: explain what data will be included, confirm intent
 * Step 2 — KYC: confirm identity (password re-entry or re-auth prompt)
 * Step 3 — Submitted: acknowledge receipt, set expectation (3–5 business days)
 *
 * On submit: writes to data_requests collection → ops portal picks it up →
 * agent approves → Resend sends email with download link.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface DataRequestModalProps {
  userName: string;
  userEmail: string;
  userNumericId: number;
  onClose: () => void;
}

type Step = 'confirm' | 'kyc' | 'submitted' | 'error';

const DataRequestModal: React.FC<DataRequestModalProps> = ({
  userName, userEmail, userNumericId, onClose,
}) => {
  const { fbUser } = useFirebase() as any;
  const [step, setStep]       = useState<Step>('confirm');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState('');

  const handleKyc = async () => {
    if (!password.trim()) { setError('Please enter your password to confirm your identity.'); return; }
    setSubmitting(true);
    setError('');
    try {
      // Re-authenticate to confirm identity
      const { EmailAuthProvider, reauthenticateWithCredential } = await import('firebase/auth');
      const { auth } = await import('../lib/firebase');
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      // Identity confirmed — write the request
      await submitRequest();
    } catch (err: any) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        setError('Incorrect password. Please try again.');
      } else {
        setError(err?.message ?? 'Verification failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitRequest = async () => {
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      await addDoc(collection(db, 'data_requests'), {
        uid:          fbUser.uid,
        numericId:    userNumericId,
        email:        userEmail,
        displayName:  userName,
        type:         'data_export',
        status:       'pending',
        requestedAt:  serverTimestamp(),
        reviewedAt:   null,
        reviewedBy:   null,
        downloadUrl:  null,
        expiresAt:    null,
      });
      setStep('submitted');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to submit request. Please try again.');
      setStep('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: '#f5f5f4' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900">Download my data</h2>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            {(['confirm', 'kyc', 'submitted'] as Step[]).map((s, i) => (
              <React.Fragment key={s}>
                <div
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{ backgroundColor: step === s || (step === 'submitted' && s === 'submitted') ? GREEN : '#d4d4d4' }}
                />
                {i < 2 && <div className="flex-1 h-px" style={{ backgroundColor: '#e7e5e4' }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* ── Step 1: Confirm ─────────────────────────────────────────── */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: GREEN_LT }}>
                <p className="text-sm font-semibold text-stone-800 mb-2">Your data export will include:</p>
                <ul className="space-y-1 text-sm text-stone-600">
                  {[
                    'Profile information (name, bio, skills, location)',
                    'Posts, comments, and reactions',
                    'Connection requests and connections',
                    'Pod memberships and activity',
                    'Messages you have sent',
                    'Notifications history',
                    'Account settings and preferences',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border p-4 text-sm text-stone-600 space-y-2" style={{ borderColor: '#e7e5e4' }}>
                <p>📋 <strong className="text-stone-800">Processing time:</strong> 3–5 business days</p>
                <p>📧 <strong className="text-stone-800">Delivery:</strong> Download link sent to {userEmail}</p>
                <p>⏱️ <strong className="text-stone-800">Link expires:</strong> 7 days after delivery</p>
              </div>
              <p className="text-xs text-stone-400">
                This request is processed by the BeWatu Trust & Safety team in accordance with our Privacy Policy and applicable data protection regulations.
              </p>
              <button
                onClick={() => setStep('kyc')}
                className="w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                Continue
              </button>
            </div>
          )}

          {/* ── Step 2: KYC ─────────────────────────────────────────────── */}
          {step === 'kyc' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: GREEN_LT }}>
                  <svg className="w-6 h-6" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="font-bold text-stone-900">Confirm your identity</h3>
                <p className="text-sm text-stone-500 mt-1">
                  For your security, please enter your password before we process this request.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleKyc()}
                  placeholder="Your BeWatu password"
                  className="mt-1 w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: error ? '#ef4444' : '#e7e5e4', '--tw-ring-color': GREEN } as any}
                  autoFocus
                />
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              </div>
              <button
                onClick={handleKyc}
                disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: GREEN }}>
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                    </svg>
                    Verifying…
                  </span>
                ) : 'Submit data request'}
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="w-full text-sm text-stone-400 hover:text-stone-600 transition-colors">
                ← Back
              </button>
            </div>
          )}

          {/* ── Step 3: Submitted ────────────────────────────────────────── */}
          {step === 'submitted' && (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: GREEN_LT }}>
                <svg className="w-8 h-8" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900">Request received</h3>
                <p className="text-sm text-stone-500 mt-2">
                  We've received your data export request. Our team will process it within <strong className="text-stone-700">3–5 business days</strong>.
                </p>
              </div>
              <div className="rounded-xl border p-4 text-sm text-stone-600 text-left space-y-2" style={{ borderColor: '#e7e5e4' }}>
                <p>📧 A confirmation has been sent to <strong className="text-stone-800">{userEmail}</strong></p>
                <p>🔔 You'll receive a notification inside BeWatu when your data is ready</p>
                <p>📥 A download link will be emailed to you once approved</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                Done
              </button>
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────────────── */}
          {step === 'error' && (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-red-50">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900">Something went wrong</h3>
                <p className="text-sm text-stone-500 mt-1">{error || 'Unable to submit your request. Please try again.'}</p>
              </div>
              <button onClick={() => { setStep('kyc'); setError(''); }}
                className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataRequestModal;
