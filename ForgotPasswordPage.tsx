import React, { useState } from 'react';
import AuthLayout from './AuthLayout';

interface ForgotPasswordPageProps {
  onResetRequest: () => void;
  onNavigateToLogin: () => void;
  onNavigateToConnect: () => void;
  onNavigateToLanding: () => void;
}

const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onResetRequest, onNavigateToLogin, onNavigateToConnect, onNavigateToLanding }) => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would be an API call
    setSubmitted(true);
    setTimeout(() => {
        onResetRequest();
    }, 3000);
  };

  const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400";

  return (
    <AuthLayout title="Reset Your Password" onNavigateToConnect={onNavigateToConnect} onNavigateToLanding={onNavigateToLanding}>
      {submitted ? (
        <div className="text-center text-slate-300">
            <p>If an account with that email exists, we've sent a password reset link to it.</p>
            <p className="text-sm mt-2">Redirecting to login shortly...</p>
        </div>
      ) : (
        <>
          <p className="text-slate-400 text-sm text-center mb-4">
            Enter your email and we'll send you a link to get back into your account.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm font-semibold mb-1 block">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputStyles}
                placeholder="you@example.com"
                required
              />
            </div>
            <button type="submit" className="w-full bg-cyan-500 text-slate-900 font-semibold py-2 rounded-lg hover:bg-cyan-400 transition-colors">
              Send Reset Link
            </button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={onNavigateToLogin} className="font-semibold text-cyan-400 hover:underline text-sm">
                &larr; Back to Sign In
            </button>
          </div>
        </>
      )}
    </AuthLayout>
  );
};

export default ForgotPasswordPage;