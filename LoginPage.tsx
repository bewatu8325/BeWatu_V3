import React, { useState } from 'react';
import AuthLayout from './AuthLayout';

type UserType = 'user' | 'recruiter';

interface LoginPageProps {
  onLoginSuccess: (email: string, isRecruiterLogin: boolean) => void;
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
  onNavigateToConnect: () => void;
  onNavigateToLanding: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onNavigateToRegister, onNavigateToForgotPassword, onNavigateToConnect, onNavigateToLanding }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<UserType>('user');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Basic validation
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    // In a real app, this would be an API call
    onLoginSuccess(email, userType === 'recruiter');
  };

  const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400";

  return (
    <AuthLayout title={userType === 'user' ? "Welcome Back" : "Recruiter Login"} onNavigateToConnect={onNavigateToConnect} onNavigateToLanding={onNavigateToLanding}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <div>
          <label className="text-slate-400 text-sm font-semibold mb-1 block">Email</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputStyles}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="text-slate-400 text-sm font-semibold mb-1 block">Password</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputStyles}
            placeholder="••••••••"
          />
        </div>
        <div className="flex justify-end">
            <button type="button" onClick={onNavigateToForgotPassword} className="text-xs text-cyan-400 hover:underline">
                Forgot Password?
            </button>
        </div>
        <button type="submit" className="w-full bg-cyan-500 text-slate-900 font-semibold py-2 rounded-lg hover:bg-cyan-400 transition-colors">
          Sign In
        </button>
      </form>
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