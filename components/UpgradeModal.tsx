/**
 * components/UpgradeModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal that handles the full upgrade flow:
 * 1. Shows tier summary + price
 * 2. Collects card details via Stripe Elements
 * 3. Calls /api/create-subscription
 * 4. Updates Firestore via setStripeCustomerId
 * 5. Shows success state
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useCallback } from 'react';
import { X, Check, Loader2, Shield } from 'lucide-react';
import { TIERS, SubscriptionTier } from '../lib/subscription';
import { setStripeCustomerId } from '../lib/firebaseAuth';
import { useFirebase } from '../contexts/FirebaseContext';
import PaymentForm from './PaymentForm';

interface UpgradeModalProps {
  tier:     SubscriptionTier;
  onClose:  () => void;
  onSuccess: (tier: SubscriptionTier) => void;
}

type Step = 'review' | 'payment' | 'processing' | 'success' | 'error';

export default function UpgradeModal({ tier, onClose, onSuccess }: UpgradeModalProps) {
  const { currentUser, fbUser, refreshUser } = useFirebase();
  const [step,         setStep]         = useState<Step>('review');
  const [stripeRef,    setStripeRef]    = useState<{ stripe: any; card: any } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const config = TIERS[tier];

  const handleStripeReady = useCallback((elements: { stripe: any; card: any }) => {
    setStripeRef(elements);
  }, []);

  async function handleSubmit() {
    if (!stripeRef || !currentUser || !fbUser) return;

    setStep('processing');

    try {
      // 1. Create payment method from card element
      const { paymentMethod, error: pmError } = await stripeRef.stripe.createPaymentMethod({
        type: 'card',
        card: stripeRef.card,
        billing_details: {
          name:  currentUser.name,
          email: fbUser.email,
        },
      });

      if (pmError) throw new Error(pmError.message);

      // 2. Create subscription via API
      const res = await fetch('/api/create-subscription', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            currentUser.name,
          email:           fbUser.email,
          paymentMethodId: paymentMethod.id,
          tier,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Subscription failed');

      // 3. Save Stripe customer ID to Firestore
      await setStripeCustomerId(fbUser.uid, data.customerId);

      // 4. Update local user context
      refreshUser({
        ...currentUser,
        stripeCustomerId:  data.customerId,
        subscriptionTier:  tier,
        subscriptionStatus:'trialing',
        subscriptionId:    data.subscriptionId,
      } as any);

      setStep('success');
      setTimeout(() => onSuccess(tier), 2000);

    } catch (err: any) {
      setErrorMessage(err.message ?? 'Something went wrong');
      setStep('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Success state */}
        {step === 'success' && (
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-stone-900 mb-2">
              {tier === 'factory' ? '🏭 Factory Unlocked!' : `Welcome to ${config.label}!`}
            </h2>
            <p className="text-stone-500 text-sm">
              Your {config.label} plan is now active.
              {tier === 'factory' && ' Your startup workspace is ready.'}
            </p>
          </div>
        )}

        {/* Error state */}
        {step === 'error' && (
          <div className="p-8 text-center">
            <p className="text-red-500 font-medium mb-4">{errorMessage}</p>
            <button
              onClick={() => setStep('payment')}
              className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* Review + Payment */}
        {(step === 'review' || step === 'payment' || step === 'processing') && (
          <div className="p-6">
            {/* Header */}
            <h2 className="text-xl font-bold text-stone-900 mb-1">
              {tier === 'factory' ? 'Unlock Factory' : `Upgrade to ${config.label}`}
            </h2>
            <p className="text-stone-500 text-sm mb-6">
              ${config.price}/month — {tier === 'pro' ? '30' : '14'}-day free trial, cancel anytime
            </p>

            {/* Feature summary */}
            <div className="bg-stone-50 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
                What you get
              </p>
              <ul className="space-y-2">
                {config.features.slice(0, 5).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-stone-700">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
                {config.features.length > 5 && (
                  <li className="text-xs text-stone-400">
                    + {config.features.length - 5} more features
                  </li>
                )}
              </ul>
            </div>

            {/* Payment form */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
                Payment details
              </p>
              <PaymentForm onReady={handleStripeReady} disabled={step === 'processing'} />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={step === 'processing' || !stripeRef}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {step === 'processing' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                `Start free trial — $${config.price}/mo after`
              )}
            </button>

            {/* Trust badge */}
            <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-stone-400">
              <Shield className="h-3.5 w-3.5" />
              Secured by Stripe. Cancel anytime.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
