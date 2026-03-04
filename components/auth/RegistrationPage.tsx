import React, { useState, useEffect, useRef } from 'react';
import AuthLayout from '../AuthLayout';
import PaymentForm from '../PaymentForm';
import BillingPolicyModal from '../BillingPolicyModal';
import { LoadingIcon } from '../../constants';
import { useTranslation } from '../../hooks/useTranslation';
import { registerWithEmail } from '../../lib/authService';

// Define Stripe types locally as we can't import them
declare global {
  interface Window {
    Stripe: any;
  }
}

interface RegistrationPageProps {
  onRegisterSuccess: (name: string, email: string, isRecruiter: boolean, stripeCustomerId?: string) => void;
  onNavigateToLogin: () => void;
  onNavigateToConnect: () => void;
  onNavigateToLanding: () => void;
}

const RegistrationPage: React.FC<RegistrationPageProps> = ({ onRegisterSuccess, onNavigateToLogin, onNavigateToConnect, onNavigateToLanding }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRecruiter, setIsRecruiter] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [isPolicyVisible, setIsPolicyVisible] = useState(false);
  
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const stripeElementsRef = useRef<{stripe: any; card: any} | null>(null);

  const handleStripeReady = (elements: {stripe: any, card: any}) => {
    stripeElementsRef.current = elements;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password) {
      setError('Please fill in all primary fields.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsProcessing(true);

    try {
      if (isRecruiter) {
        // ── Recruiter: Stripe first, then Firebase ──────────────────────────
        if (!agreedToPolicy) {
          setError('You must agree to the Billing and Payment Policy.');
          setIsProcessing(false);
          return;
        }
        if (!stripeElementsRef.current) {
          setError('Payment form is not ready. Please wait a moment.');
          setIsProcessing(false);
          return;
        }

        const { stripe, card } = stripeElementsRef.current;
        const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card,
          billing_details: { name, email },
        });

        if (paymentMethodError) {
          setError(paymentMethodError.message || 'An error occurred with your payment details.');
          setIsProcessing(false);
          return;
        }

        const response = await fetch('/api/create-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, paymentMethodId: paymentMethod.id }),
        });
        const subscriptionData = await response.json();
        if (!response.ok) throw new Error(subscriptionData.error || 'Failed to create subscription.');

        // Create Firebase account + Firestore user doc
        await registerWithEmail(name, email, password, true);
        onRegisterSuccess(name, email, true, subscriptionData.customerId);

      } else {
        // ── Regular user: Firebase only ────────────────────────────────────
        await registerWithEmail(name, email, password, false);
        onRegisterSuccess(name, email, false);
      }
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Try signing in instead.');
      } else if (code === 'auth/weak-password') {
        setError('Password must be at least 6 characters.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message ?? 'Registration failed. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400";

  return (
    <AuthLayout title={t('createYourAccount')} onNavigateToConnect={onNavigateToConnect} onNavigateToLanding={onNavigateToLanding}>
      {isPolicyVisible && <BillingPolicyModal onClose={() => setIsPolicyVisible(false)} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-500/30 p-2 rounded-md">{error}</p>}
        <div>
          <label className="text-slate-400 text-sm font-semibold mb-1 block">{t('fullName')}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputStyles} placeholder="Jane Doe" disabled={isProcessing} />
        </div>
        <div>
          <label className="text-slate-400 text-sm font-semibold mb-1 block">{t('email')}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputStyles} placeholder="you@example.com" disabled={isProcessing} />
        </div>
        <div>
          <label className="text-slate-400 text-sm font-semibold mb-1 block">{t('password')}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputStyles} placeholder="••••••••" disabled={isProcessing} />
        </div>

        <div className="pt-2">
            <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={isRecruiter} onChange={(e) => setIsRecruiter(e.target.checked)} className="h-4 w-4 rounded bg-slate-700 border-slate-500 text-cyan-500 focus:ring-cyan-500" disabled={isProcessing} />
                <span className="text-slate-300 text-sm">{t('wantRecruiterAccess')}</span>
            </label>
        </div>

        {isRecruiter && (
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3 animate-fade-in-up">
                <p className="text-xs text-center text-slate-400">
                    {t('recruiterTrialInfo')}
                </p>
                <PaymentForm onReady={handleStripeReady} disabled={isProcessing} />
                 <div>
                    <label className="flex items-center space-x-2 cursor-pointer mt-2">
                        <input type="checkbox" checked={agreedToPolicy} onChange={(e) => setAgreedToPolicy(e.target.checked)} className="h-4 w-4 rounded bg-slate-700 border-slate-500 text-cyan-500 focus:ring-cyan-500" disabled={isProcessing}/>
                        <span className="text-slate-400 text-xs">
                            {t('agreeToPolicy')}{' '}
                            <button type="button" onClick={() => setIsPolicyVisible(true)} className="font-semibold text-cyan-400 hover:underline">
                                {t('billingPolicy')}
                            </button>.
                        </span>
                    </label>
                </div>
            </div>
        )}

        <button type="submit" className="w-full bg-cyan-500 text-slate-900 font-semibold py-2 rounded-lg hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 disabled:text-slate-500 flex items-center justify-center min-h-[40px]" disabled={isProcessing}>
          {isProcessing ? <LoadingIcon className="w-5 h-5 animate-spin"/> : t('createAccount')}
        </button>
      </form>
      <div className="mt-6 text-center">
        <p className="text-sm text-slate-400">
          {t('alreadyHaveAccount')}{' '}
          <button onClick={onNavigateToLogin} className="font-semibold text-cyan-400 hover:underline">
            {t('signIn')}
          </button>
        </p>
      </div>
    </AuthLayout>
  );
};

export default RegistrationPage;
