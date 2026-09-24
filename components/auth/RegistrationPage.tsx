import React, { useState, useEffect, useRef } from 'react';
import AuthLayout from '../AuthLayout';
import PaymentForm from '../PaymentForm';
import BillingPolicyModal from '../BillingPolicyModal';
import { LoadingIcon } from '../../constants';
import { useTranslation } from '../../hooks/useTranslation';
import { registerWithEmail } from '../../lib/firebaseAuth';
import { auth } from '../../lib/firebase';

// Define Stripe types locally as we can't import them
declare global {
  interface Window {
    Stripe: any;
  }
}

interface RegistrationPageProps {
  onRegisterSuccess: (name: string, email: string, isRecruiter: boolean, stripeCustomerId?: string) => void;
  // Same handler LoginPage's Google button already uses -- App.tsx's
  // handleGoogleLogin now prompts a brand-new recruiter for payment right
  // after signup (see its own comment), so this form doesn't need its own
  // payment-collection step for the Google path the way it does for the
  // email/password one below.
  onGoogleRegister?: (isRecruiter: boolean) => Promise<void>;
  onNavigateToLogin: () => void;
  onNavigateToConnect: () => void;
  onNavigateToLanding: () => void;
  onNavigateToTerms?:     () => void;
  onNavigateToPrivacy?:   () => void;
  onNavigateToCommunity?: () => void;
}

const RegistrationPage: React.FC<RegistrationPageProps> = ({
  onRegisterSuccess, onGoogleRegister, onNavigateToLogin, onNavigateToConnect, onNavigateToLanding,
  onNavigateToTerms, onNavigateToPrivacy, onNavigateToCommunity,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsProcessing(true);

    try {
      if (isRecruiter) {
        // ── Recruiter: Firebase account first, then Stripe ──────────────────
        // Reordered (launch-readiness review): api/create-subscription.ts now
        // requires a verified Firebase ID token, which only exists once the
        // account itself does. Validate everything that doesn't need the
        // account first, so a bad payment form still fails before any account
        // is created.
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

        // Create Firebase account + Firestore user doc
        await registerWithEmail(name, email, password, true);

        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          // Extremely unlikely (registerWithEmail just succeeded, so
          // auth.currentUser must be set) — but the account is real either
          // way, so let them into the app rather than strand them on a form
          // that will now reject a retry with 'email-already-in-use'.
          onRegisterSuccess(name, email, true);
          return;
        }

        const { stripe, card } = stripeElementsRef.current;
        const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card,
          billing_details: { name, email },
        });

        if (paymentMethodError) {
          // The account already exists at this point — proceed into the app
          // rather than leave them stuck; they can add payment later via the
          // same Stripe flow from the recruiter paywall/upgrade modal.
          onRegisterSuccess(name, email, true);
          return;
        }

        const response = await fetch('/api/create-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ name, email, paymentMethodId: paymentMethod.id, tier: 'pro' }),
        });
        const subscriptionData = await response.json();
        if (!response.ok) {
          // Same reasoning as the payment-method-error branch above.
          onRegisterSuccess(name, email, true);
          return;
        }

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

  const handleGoogleClick = async () => {
    if (!onGoogleRegister) return;
    setError('');
    setIsProcessing(true);
    try {
      await onGoogleRegister(isRecruiter);
    } catch (err: any) {
      setError(err.message ?? 'Google sign-up failed.');
    } finally {
      setIsProcessing(false);
    }
  };

    const inputClass = "w-full rounded-xl border border-stone-200 bg-white pl-10 pr-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:border-green-700 transition";
    const passwordInputClass = "w-full rounded-xl border border-stone-200 bg-white pl-10 pr-10 py-2.5 text-sm text-stone-900 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:border-green-700 transition";

    // Same icon set as LoginPage.tsx, for visual parity between sign-up and sign-in.
    const FieldIcon = ({ path }: { path: string }) => (
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-600 pointer-events-none">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={path} />
        </svg>
      </span>
    );
    const PERSON_ICON_PATH = "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z";
    const MAIL_ICON_PATH = "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z";
    const LOCK_ICON_PATH = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";
    const PasswordToggle = () => (
      <button
        type="button"
        onClick={() => setShowPassword(s => !s)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-stone-600 hover:text-stone-800 transition"
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
    );

  return (
    <AuthLayout
      title={t('createYourAccount')}
      onNavigateToConnect={onNavigateToConnect}
      onNavigateToLanding={onNavigateToLanding}
      onNavigateToTerms={onNavigateToTerms}
      onNavigateToPrivacy={onNavigateToPrivacy}
      onNavigateToCommunity={onNavigateToCommunity}
    >
      {isPolicyVisible && <BillingPolicyModal onClose={() => setIsPolicyVisible(false)} />}
      <p className="text-sm text-center text-stone-600 -mt-3 mb-6 text-pretty">{t('registerSubtitle')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm text-center bg-red-50 border border-red-200 p-3 rounded-xl">{error}</p>}
        <div>
          <label className="text-stone-700 text-sm font-medium mb-1.5 block">{t('fullName')}</label>
          <div className="relative">
            <FieldIcon path={PERSON_ICON_PATH} />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Jane Doe" disabled={isProcessing} />
          </div>
        </div>
        <div>
          <label className="text-stone-700 text-sm font-medium mb-1.5 block">{t('email')}</label>
          <div className="relative">
            <FieldIcon path={MAIL_ICON_PATH} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" disabled={isProcessing} />
          </div>
        </div>
        <div>
          <label className="text-stone-700 text-sm font-medium mb-1.5 block">{t('password')}</label>
          <div className="relative">
            <FieldIcon path={LOCK_ICON_PATH} />
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={passwordInputClass} placeholder="Enter your password" disabled={isProcessing} />
            <PasswordToggle />
          </div>
        </div>
        <div>
          <label className="text-stone-700 text-sm font-medium mb-1.5 block">{t('confirmPassword')}</label>
          <div className="relative">
            <FieldIcon path={LOCK_ICON_PATH} />
            <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={passwordInputClass} placeholder="Re-enter your password" disabled={isProcessing} />
            <PasswordToggle />
          </div>
        </div>

        <div className="pt-2">
            <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={isRecruiter} onChange={(e) => setIsRecruiter(e.target.checked)} className="h-4 w-4 rounded border-stone-300 text-green-700 focus:ring-green-700" disabled={isProcessing} />
                <span className="text-stone-700 text-sm">{t('wantRecruiterAccess')}</span>
            </label>
        </div>

        {isRecruiter && (
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-3 animate-fade-in-up">
                <p className="text-xs text-center text-stone-600">
                    {t('recruiterTrialInfo')}
                </p>
                <PaymentForm onReady={handleStripeReady} disabled={isProcessing} />
                 <div>
                    <label className="flex items-center space-x-2 cursor-pointer mt-2">
                        <input type="checkbox" checked={agreedToPolicy} onChange={(e) => setAgreedToPolicy(e.target.checked)} className="h-4 w-4 rounded border-stone-300 text-green-700 focus:ring-green-700" disabled={isProcessing}/>
                        <span className="text-stone-600 text-xs">
                            {t('agreeToPolicy')}{' '}
                            <button type="button" onClick={() => setIsPolicyVisible(true)} className="font-semibold text-cyan-400 hover:underline">
                                {t('billingPolicy')}
                            </button>.
                        </span>
                    </label>
                </div>
            </div>
        )}

        <button type="submit" className="w-full font-semibold py-3 rounded-xl text-white hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center min-h-[44px]" style={{ backgroundColor: "#1a4a3a" }} disabled={isProcessing}>
          {isProcessing ? <LoadingIcon className="w-5 h-5 animate-spin"/> : t('createAccount')}
        </button>
      </form>

      {onGoogleRegister && (
        <>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-200" />
            <span className="text-xs text-stone-600">or</span>
            <div className="h-px flex-1 bg-stone-200" />
          </div>
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 active:bg-stone-100 transition disabled:opacity-60"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {isRecruiter ? 'Continue with Google (recruiter)' : 'Continue with Google'}
          </button>
        </>
      )}

      <div className="mt-6 text-center">
        <p className="text-sm text-stone-600">
          {t('alreadyHaveAccount')}{' '}
          <button onClick={onNavigateToLogin} className="font-semibold hover:underline" style={{ color: "#1a6b52" }}>
            {t('signIn')}
          </button>
        </p>
      </div>
    </AuthLayout>
  );
};

export default RegistrationPage;
