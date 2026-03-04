/**
 * LoginPage.tsx — updated to support real Firebase auth.
 * 
 * New props added:
 *   onFirebaseLogin(email, password, isRecruiter) — calls Firebase directly
 *   onGoogleLogin(isRecruiter) — Google OAuth
 * 
 * The original onLoginSuccess prop is kept for backward compatibility
 * but onFirebaseLogin should be preferred.
 */
import React, { useState } from 'react';
import AuthLayout from '../AuthLayout';

type UserType = 'user' | 'recruiter';

interface LoginPageProps {
  onLoginSuccess: (email: string, isRecruiterLogin: boolean) => void;
  onFirebaseLogin?: (email: string, password: string, isRecruiter: boolean) => Promise<void>;
  onGoogleLogin?: (isRecruiter: boolean) => Promise<void>;
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
  onNavigateToConnect: () => void;
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
  const [userType, setUserType] = useState<UserType>('user');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const inputStyles =
    'w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    const isRecruiter = userType === 'recruiter';

    if (onFirebaseLogin) {
      try {
        setIsLoading(true);
        await onFirebaseLogin(email, password, isRecruiter);
      } catch (err: any) {
        setError(err.message ?? 'Login failed. Please check your credentials.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Fallback for compatibility
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title={userType === 'user' ? 'Welcome Back' : 'Recruiter Login'}
      onNavigateToConnect={onNavigateToConnect}
      onNavigateToLanding={onNavigateToLanding}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <div>
          <label className="text-slate-400 text-sm font-semibold mb-1 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={inputStyles}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="text-slate-400 text-sm font-semibold mb-1 block">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={inputStyles}
            placeholder="••••••••"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNavigateToForgotPassword}
            className="text-xs text-cyan-400 hover:underline"
          >
            Forgot Password?
          </button>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-cyan-500 text-slate-900 font-semibold py-2 rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      {/* Google Sign-In — only shown when Firebase is wired up */}
      {onGoogleLogin && (
        <div className="mt-4">
          <div className="flex items-center gap-2 my-3">
            <hr className="flex-grow border-slate-600" />
            <span className="text-slate-500 text-xs">or</span>
            <hr className="flex-grow border-slate-600" />
          </div>
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 border border-slate-600 text-slate-200 py-2 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
        </div>
      )}

      <div className="mt-6 text-center">
        {userType === 'user' ? (
          <>
            <p className="text-sm text-slate-400">
              Don't have an account?{' '}
              <button onClick={onNavigateToRegister} className="font-semibold text-cyan-400 hover:underline">
                Sign Up
              </button>
            </p>
            <p className="text-sm text-slate-400 mt-2">
              Are you a recruiter?{' '}
              <button onClick={() => setUserType('recruiter')} className="font-semibold text-cyan-400 hover:underline">
                Login here
              </button>
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Not a recruiter?{' '}
            <button onClick={() => setUserType('user')} className="font-semibold text-cyan-400 hover:underline">
              Login as a user
            </button>
          </p>
        )}
      </div>
    </AuthLayout>
  );
};

export default LoginPage;
