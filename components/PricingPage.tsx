/**
 * components/PricingPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full pricing page showing all BeWatu tiers with upgrade CTAs.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { Check, Zap, Star, Factory, TrendingUp } from 'lucide-react';
import { TIERS, SubscriptionTier, hasAccess } from '../lib/subscription';
import { useFirebase } from '../contexts/FirebaseContext';

interface PricingPageProps {
  onUpgrade: (tier: SubscriptionTier) => void;
  onClose?:  () => void;
}

const TIER_ICONS = {
  free:     <Star className="h-6 w-6" />,
  pro:      <Zap className="h-6 w-6" />,
  factory:  <Factory className="h-6 w-6" />,
  investor: <TrendingUp className="h-6 w-6" />,
};

const TIER_COLORS = {
  free:     { bg: 'bg-stone-50',   border: 'border-stone-200',  btn: 'bg-stone-800 hover:bg-stone-700',       icon: 'text-stone-500'  },
  pro:      { bg: 'bg-blue-50',    border: 'border-blue-200',   btn: 'bg-blue-600 hover:bg-blue-500',          icon: 'text-blue-500'   },
  factory:  { bg: 'bg-emerald-50', border: 'border-emerald-300',btn: 'bg-emerald-600 hover:bg-emerald-500',    icon: 'text-emerald-600'},
  investor: { bg: 'bg-amber-50',   border: 'border-amber-200',  btn: 'bg-amber-600 hover:bg-amber-500',        icon: 'text-amber-500'  },
};

export default function PricingPage({ onUpgrade, onClose }: PricingPageProps) {
  const { currentUser } = useFirebase();
  const [annual, setAnnual] = useState(false);

  const userTier = (currentUser?.subscriptionTier ?? 'free') as SubscriptionTier;

  const tiers: SubscriptionTier[] = ['free', 'pro', 'factory', 'investor'];

  return (
    <div className="min-h-screen bg-white py-16 px-4">
      {onClose && (
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600">
          ✕
        </button>
      )}

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-4xl font-bold text-stone-900 mb-4">
          Build your future on BeWatu
        </h1>
        <p className="text-lg text-stone-500 mb-8">
          Start free. Upgrade when you're ready to level up.
        </p>

        {/* Annual toggle */}
        <div className="inline-flex items-center gap-3 bg-stone-100 rounded-full px-4 py-2">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${!annual ? 'bg-white shadow text-stone-900' : 'text-stone-500'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${annual ? 'bg-white shadow text-stone-900' : 'text-stone-500'}`}
          >
            Annual
            <span className="ml-1.5 text-xs text-emerald-600 font-semibold">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Pricing cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {tiers.map((tierId) => {
          const tier    = TIERS[tierId];
          const colors  = TIER_COLORS[tierId];
          const price   = annual ? tier.priceAnnual : tier.price;
          const isCurrent = userTier === tierId;
          const isPopular = tierId === 'factory';

          return (
            <div
              key={tierId}
              className={`relative rounded-2xl border-2 p-6 flex flex-col ${colors.bg} ${colors.border} ${isPopular ? 'shadow-xl scale-105' : 'shadow-sm'}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </div>
              )}

              {/* Icon + name */}
              <div className={`${colors.icon} mb-3`}>
                {TIER_ICONS[tierId]}
              </div>
              <h2 className="text-xl font-bold text-stone-900 mb-1">{tier.label}</h2>

              {/* Price */}
              <div className="mb-6">
                {tier.price === 0 ? (
                  <span className="text-3xl font-bold text-stone-900">Free</span>
                ) : (
                  <div>
                    <span className="text-3xl font-bold text-stone-900">
                      ${annual ? Math.round(price / 12) : price}
                    </span>
                    <span className="text-stone-500 text-sm">/month</span>
                    {annual && (
                      <p className="text-xs text-stone-400 mt-0.5">
                        ${price}/year
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1 mb-6">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-stone-700">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <div className="text-center py-2.5 text-sm font-medium text-stone-500 border border-stone-200 rounded-xl">
                  Current plan
                </div>
              ) : tier.price === 0 ? (
                <div className="text-center py-2.5 text-sm font-medium text-stone-400">
                  Always free
                </div>
              ) : (
                <button
                  onClick={() => onUpgrade(tierId)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${colors.btn}`}
                >
                  {tierId === 'factory'
                    ? 'Unlock Factory'
                    : tierId === 'investor'
                    ? 'Join as Investor'
                    : `Upgrade to ${tier.label}`}
                  {tier.price > 0 && (
                    <span className="ml-1 opacity-75 text-xs">
                      — {tierId === 'pro' ? '30' : '14'}-day free trial
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Enterprise CTA */}
      <div className="max-w-2xl mx-auto mt-12 text-center p-8 bg-stone-900 rounded-2xl text-white">
        <h3 className="text-xl font-bold mb-2">Enterprise</h3>
        <p className="text-stone-400 mb-4 text-sm">
          Arena sponsorship, talent scouting, startup pipeline, API access, and dedicated support.
          Custom contracts and invoicing available.
        </p>
        <a
          href="mailto:enterprise@bewatu.com"
          className="inline-block bg-white text-stone-900 px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-stone-100 transition-colors"
        >
          Contact us
        </a>
      </div>
    </div>
  );
}
