/**
 * ForgotPasswordPage.tsx
 * Handles both "forgot password" (email reset) and username recovery.
 * Firebase Auth sends a reset link — no passwords are stored client-side.
 * Path in App: authState === 'forgot_password'
 */
import React, { useState } from 'react';
import { LogoIcon } from '../../constants';

interface ForgotPasswordPageProps {
  onResetRequest: (email: string) => Promise<void>;
  onBack?: () => void;
  onNavigateToLogin?: () => void;     // alias for onBack — both accepted
  onNavigateToConnect?: () => void;
  onNavigateToLanding?: () => void;
}

type Step = 'form' | 'sent';
type Mode = 'password' | 'username';

const GREEN = '#1a4a3a';
const GREEN_MID = '#1a6b52';

function MailIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onResetRequest, onBack: _onBack, onNavigateToLogin }) => {
  const onBack = _onBack ?? onNavigateToLogin ?? (() => {});
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    try {
      await onResetRequest(email.trim().toLowerCase());
      setStep('sent');
    } catch (err: any) {
      // Intentionally vague — don't reveal whether the account exists (account enumeration protection)
      setError('If an account with that email exists, we\'ve sent a reset link. Check your inbox.');
      setStep('sent'); // show sent screen regardless to prevent enumeration
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#f5f5f4' }}>
      {/* Left brand panel */}
      <div
        className="hidden lg:flex lg:w-5/12 flex-col justify-between p-12"
        style={{ backgroundColor: GREEN }}
      >
        <button onClick={onBack} className="hover:opacity-80 transition-opacity w-fit">
          <LogoIcon className="h-10 w-auto" style={{ color: '#ffffff' }} />
        </button>

        <div className="space-y-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <ShieldIcon />
          </div>
          <div className="space-y-3">
            <p className="text-3xl font-bold text-white leading-tight">
              Account recovery done right.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
              We use email-based verification to protect your account. No security questions, no guessing — just a secure link to your inbox.
            </p>
          </div>
          <div className="space-y-2.5">
            {[
              'Reset link expires in 1 hour',
              'Link can only be used once',
              'All active sessions are signed out on reset',
            ].map(point => (
              <div key={point} className="flex items-center gap-2.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{point}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © {new Date().getFullYear()} BeWatu
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-12">
        {/* Mobile logo */}
        <button onClick={onBack} className="mb-8 lg:hidden hover:opacity-80">
          <LogoIcon className="h-10 w-auto" style={{ color: GREEN }} />
        </button>

        <div className="w-full max-w-sm">
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium mb-8 hover:gap-2.5 transition-all"
            style={{ color: '#78716c' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to sign in
          </button>

          {step === 'form' ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-stone-900">
                  {mode === 'password' ? 'Reset your password' : 'Find your account'}
                </h1>
                <p className="mt-2 text-sm text-stone-500">
                  {mode === 'password'
                    ? 'Enter the email you signed up with and we\'ll send a reset link.'
                    : 'Enter your email and we\'ll remind you of your username.'}
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-xl border border-stone-200 p-1 mb-6 bg-stone-50">
                {(['password', 'username'] as Mode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(''); }}
                    className="flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={mode === m
                      ? { background: 'white', color: '#1c1917', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                      : { color: '#78716c' }}
                  >
                    {m === 'password' ? 'Forgot password' : 'Forgot username'}
                  </button>
                ))}
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                      <MailIcon />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoFocus
                      autoComplete="email"
                      className="w-full rounded-xl border border-stone-200 bg-white pl-11 pr-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 transition"
                      style={{ '--tw-ring-color': GREEN + '33' } as React.CSSProperties}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ backgroundColor: GREEN }}
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Sending…
                    </>
                  ) : mode === 'password' ? 'Send reset link' : 'Send username reminder'}
                </button>
              </form>

              {/* Security note */}
              <div className="mt-6 rounded-xl border border-stone-100 bg-stone-50 p-4 flex items-start gap-3">
                <div className="mt-0.5 text-stone-400 flex-shrink-0">
                  <ShieldIcon />
                </div>
                <div>
                  <p className="text-xs font-semibold text-stone-600">Security note</p>
                  <p className="text-xs text-stone-400 mt-0.5 leading-relaxed">
                    For your protection, we never confirm whether an email is registered.
                    If you don't receive an email within a few minutes, check your spam folder.
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Success screen */
            <div className="text-center">
              <div
                className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ background: '#e8f4f0', color: GREEN }}
              >
                <CheckCircleIcon />
              </div>
              <h1 className="text-2xl font-bold text-stone-900 mb-2">Check your inbox</h1>
              <p className="text-sm text-stone-500 leading-relaxed mb-2">
                If <strong className="text-stone-700">{email}</strong> is registered with BeWatu, you'll receive a{' '}
                {mode === 'password' ? 'password reset link' : 'username reminder'} shortly.
              </p>
              <p className="text-xs text-stone-400 mb-8">
                The link expires in 1 hour. Check your spam folder if it doesn't arrive.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => { setStep('form'); setEmail(''); setError(''); }}
                  className="w-full rounded-xl border border-stone-200 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition"
                >
                  Try a different email
                </button>
                <button
                  onClick={onBack}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white hover:opacity-90 transition"
                  style={{ backgroundColor: GREEN }}
                >
                  Back to sign in
                </button>
              </div>

              {/* Didn't get it? */}
              <p className="mt-6 text-xs text-stone-400">
                Still having trouble?{' '}
                <a
                  href="mailto:support@bewatu.com"
                  className="font-semibold hover:underline"
                  style={{ color: GREEN_MID }}
                >
                  Contact support
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
