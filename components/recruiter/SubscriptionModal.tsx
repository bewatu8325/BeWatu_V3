import React, { useState, useCallback } from 'react';
import { LogoIcon } from '../../constants';
import { setStripeCustomerId, updateUserInFirestore } from '../../lib/firebaseAuth';
import { useFirebase } from '../../contexts/FirebaseContext';
import PaymentForm from '../PaymentForm';

interface SubscriptionModalProps {
  onClose: () => void;
  onSubscribe: () => void;
  // 'setupPayment': a brand-new recruiter (signed up via Google, so no
  // payment step ever ran) is being asked to add a payment method for the
  // trial they already have -- saying "Your Trial Has Ended" here would be
  // factually wrong, since it just started.
  reason?: 'trialEnded' | 'setupPayment';
}

type Step = 'review' | 'processing' | 'error';

// Bug fix: this modal used to just flip a local boolean on click — real
// pricing copy ("BeWatu Recruiter Pro, $20/month"), zero Stripe
// integration, no charge, ever. Now uses the same proven flow
// UpgradeModal.tsx already uses for the general Pro tier: Stripe Elements
// card collection -> /api/create-subscription -> Firestore persistence.
// Confirmed with the user this is the same $20/mo "pro" tier UpgradeModal
// charges (STRIPE_PRO_PRICE_ID) — not a separate recruiter-only price.
const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ onClose, onSubscribe, reason = 'trialEnded' }) => {
  const { currentUser, fbUser, refreshUser } = useFirebase();
  const [step, setStep] = useState<Step>('review');
  const [stripeRef, setStripeRef] = useState<{ stripe: any; card: any } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleStripeReady = useCallback((elements: { stripe: any; card: any }) => {
    setStripeRef(elements);
  }, []);

  async function handleSubscribe() {
    if (!stripeRef || !currentUser || !fbUser) return;
    setStep('processing');

    try {
      const { paymentMethod, error: pmError } = await stripeRef.stripe.createPaymentMethod({
        type: 'card',
        card: stripeRef.card,
        billing_details: {
          name: currentUser.name,
          email: fbUser.email,
        },
      });
      if (pmError) throw new Error(pmError.message);

      // Requires a verified ID token (launch-readiness review:
      // api/create-subscription.ts used to accept any caller and never tied
      // the Stripe customer to a real account).
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: currentUser.name,
          email: fbUser.email,
          paymentMethodId: paymentMethod.id,
          tier: 'pro',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Subscription failed');

      await setStripeCustomerId(fbUser.uid, data.customerId);
      await updateUserInFirestore(fbUser.uid, {
        subscriptionTier: 'pro',
        subscriptionStatus: 'trialing',
        subscriptionId: data.subscriptionId,
        subscriptionPriceId: data.subscriptionPriceId,
        trialEndsAt: data.trialEnd ? new Date(data.trialEnd * 1000).toISOString() : null,
      } as any);

      refreshUser({
        ...currentUser,
        stripeCustomerId: data.customerId,
        subscriptionTier: 'pro',
        subscriptionStatus: 'trialing',
        subscriptionId: data.subscriptionId,
      } as any);

      onSubscribe();
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Something went wrong');
      setStep('review');
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center backdrop-blur-sm">
      <div
        className="bg-slate-800/90 backdrop-blur-xl border border-slate-700 rounded-xl shadow-xl w-full max-w-md text-center p-8"
        onClick={e => e.stopPropagation()}
      >
        <LogoIcon className="h-10 w-auto text-cyan-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-100">
          {reason === 'setupPayment' ? 'Add a payment method' : 'Your Trial Has Ended'}
        </h2>
        <p className="text-slate-300 mt-2">
          {reason === 'setupPayment'
            ? "You're all set with your trial — add a payment method now so there's no interruption when it ends."
            : 'Continue accessing the powerful AI-driven Recruiter Console and find the perfect candidates.'}
        </p>
        <div className="my-6 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
            <p className="text-slate-200 font-semibold">BeWatu Recruiter Pro</p>
            <p className="text-4xl font-bold text-cyan-400 mt-1">$20<span className="text-lg font-normal text-slate-400">/month</span></p>
        </div>
        <ul className="text-left space-y-2 text-slate-300 text-sm">
          <li className="flex items-center"><span className="text-cyan-400 mr-2">✓</span> Smart, context-aware candidate search</li>
          <li className="flex items-center"><span className="text-cyan-400 mr-2">✓</span> Transparent AI matching scores</li>
          <li className="flex items-center"><span className="text-cyan-400 mr-2">✓</span> Advanced filtering by intent & values</li>
        </ul>

        <div className="my-6 text-left">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Payment details
          </p>
          <PaymentForm onReady={handleStripeReady} disabled={step === 'processing'} />
        </div>

        {errorMessage && (
          <p className="text-red-600 text-sm mb-4">{errorMessage}</p>
        )}

        <button
          onClick={handleSubscribe}
          disabled={step === 'processing' || !stripeRef}
          className="w-full mt-2 bg-cyan-500 text-slate-900 font-semibold py-2.5 rounded-lg hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {step === 'processing' ? 'Processing…' : reason === 'setupPayment' ? 'Add payment method' : 'Subscribe Now'}
        </button>
        <button
          onClick={onClose}
          disabled={step === 'processing'}
          className="mt-3 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          Maybe later
        </button>
        <p className="mt-4 text-xs text-slate-500">Secured by Stripe. Cancel anytime.</p>
      </div>
    </div>
  );
};

export default SubscriptionModal;
