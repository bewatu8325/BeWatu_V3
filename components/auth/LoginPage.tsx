/**
 * LoginPage.tsx — v0-style split panel design.
 * Left: dark green brand panel. Right: light form panel.
 */
import React, { useState } from 'react';
import { LogoIcon } from '../../constants';

type UserType = 'user' | 'recruiter';

interface LoginPageProps {
  onLoginSuccess: (email: string, isRecruiterLogin: boolean) => void;
  onFirebaseLogin?: (email: string, password: string, isRecruiter: boolean) => Promise<void>;
  onGoogleLogin?: (isRecruiter: boolean) => Promise<void>;
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
  onNavigateToConnect?: () => void;
  onNavigateToLanding: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onFirebaseLogin,
  onGoogleLogin,
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onNavigateToConnect,
  onNavigateToLanding,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userType, setUserType] = useState<UserType>('user');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    const isRecruiter = userType === 'recruiter';
    if (onFirebaseLogin) {
      try {
        setIsLoading(true);
        await onFirebaseLogin(email, password, isRecruiter);
      } catch (err: any) {
        setError(err.message ?? 'Login failed. Please check your credentials.');
      } finally { setIsLoading(false); }
    } else {
      onLoginSuccess(email, isRecruiter);
    }
  };

  const handleGoogleClick = async () => {
    if (!onGoogleLogin) return;
    try {
      setIsLoading(true);
      await onGoogleLogin(userType === 'recruiter');
    } catch (err: any) {
      setError(err.message ?? 'Google sign-in failed.');
    } finally { setIsLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — dark green brand ──────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-5/12 flex-col justify-between p-12"
        style={{ backgroundColor: '#1a4a3a' }}
      >
        {/* Logo */}
        <button onClick={onNavigateToLanding} className="hover:opacity-80 transition-opacity">
          <LogoIcon className="h-10 w-auto" style={{ color: '#ffffff' }} />
        </button>

        {/* Middle copy */}
        <div className="space-y-4">
          <p className="text-4xl font-bold text-white leading-tight">
            Connect. Work. Grow.
          </p>
          <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
            BeWatu redefines professional networking by merging authenticity, AI, and verified
            skill-building. Build careers based on capability, not clout.
          </p>
        </div>

        {/* Bottom social proof */}
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          © {new Date().getFullYear()} BeWatu. All rights reserved.
        </p>
      </div>

      {/* ── Right panel — light form ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-stone-50 px-6 py-12">
        {/* Mobile logo */}
        <button onClick={onNavigateToLanding} className="mb-8 lg:hidden hover:opacity-80 transition-opacity">
          <LogoIcon className="h-10 w-auto" style={{ color: '#1a4a3a' }} />
        </button>

        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">
              {userType === 'recruiter' ? 'Recruiter Login' : 'Welcome back'}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {userType === 'recruiter'
                ? 'Access your recruiter console'
                : 'Sign in to continue your professional journey'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <button
                  type="button"
                  onClick={onNavigateToForgotPassword}
                  className="text-sm font-semibold hover:underline"
                  style={{ color: '#1a6b52' }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              style={{ backgroundColor: '#1a4a3a' }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          {/* Divider */}
          {onGoogleLogin && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={handleGoogleClick}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-60"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {/* Footer links */}
          <p className="mt-7 text-center text-sm text-gray-500">
            {userType === 'user' ? (
              <>
                Don't have an account?{' '}
                <button onClick={onNavigateToRegister} className="font-semibold hover:underline" style={{ color: '#1a6b52' }}>
                  Sign up
                </button>
                <span className="mx-2 text-gray-300">·</span>
                <button onClick={() => setUserType('recruiter')} className="font-semibold hover:underline" style={{ color: '#1a6b52' }}>
                  Recruiter login
                </button>
              </>
            ) : (
              <>
                Not a recruiter?{' '}
                <button onClick={() => setUserType('user')} className="font-semibold hover:underline" style={{ color: '#1a6b52' }}>
                  User login
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
