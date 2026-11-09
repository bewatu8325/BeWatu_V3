/**
 * components/PricingPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Plans & pricing: the four plans side by side, a monthly / annual switch, and the Enterprise contact. What each plan lists comes
 * from lib/subscription.ts (TIERS), the same list the upgrade dialog shows, so the two cannot disagree.
 *
 * Factory and Investor stay disabled, with the reason, while a new account is still inside its first week of activity
 * (lib/engagementGate.ts). docs/pricing-tier-audit.md records which listed features are built today.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState } from 'react';
import { Check, ArrowRight, Building2, X } from 'lucide-react';
import { TIERS, SubscriptionTier } from '../lib/subscription';
import { APPLY_SUPPORT, TRIAL_DISCLOSURE } from '../lib/investorMembership';
import { auth } from '../lib/firebase';
import { trackInvestorApplyClicked, trackInvestorPricingViewed } from '../lib/analytics/track';
import { useFirebase } from '../contexts/FirebaseContext';
import { isEngagementGated, ENGAGEMENT_GATE_TOOLTIP } from '../lib/engagementGate';

interface PricingPageProps {
  onUpgrade: (tier: SubscriptionTier) => void;
  onClose?:  () => void;
  /** Investor is not bought here: this starts the application. */
  onApplyInvestor?: () => void;
}

const GREEN = 'var(--bw-green)';
const TIER_ORDER: SubscriptionTier[] = ['free', 'pro', 'factory', 'investor'];
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/** The whole dollars a month a plan costs when billed monthly or annually. */
export function monthlyPrice(price: number, priceAnnual: number, annual: boolean): number {
  return annual ? Math.round(priceAnnual / 12) : price;
}

export default function PricingPage({ onUpgrade, onClose, onApplyInvestor }: PricingPageProps) {
  const { currentUser } = useFirebase();
  const [annual, setAnnual] = useState(false);

  const userTier = (currentUser?.subscriptionTier ?? 'free') as SubscriptionTier;
  const gated = !!currentUser && isEngagementGated(currentUser);
  useEffect(() => { const uid = auth.currentUser?.uid; if (uid) trackInvestorPricingViewed(uid); }, []);

  return (
    <div className="relative min-h-screen px-4 pb-20 pt-12 sm:pt-16" style={{ backgroundColor: '#fdfcfa' }}>
      {onClose && (
        <button onClick={onClose} aria-label="Close pricing" className={'absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 ' + FOCUS} style={ring}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* Header */}
      <header className="mx-auto max-w-3xl text-center">
        <p className="flex items-center justify-center gap-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-stone-600">
          <span className="h-px w-12 bg-stone-400/70" aria-hidden="true" />Plans &amp; pricing<span className="h-px w-12 bg-stone-400/70" aria-hidden="true" />
        </p>
        <h1 className="mt-5 text-balance font-serif text-[2.4rem] font-semibold leading-[1.08] tracking-tight text-stone-900 sm:text-[3.4rem]">Build your future on BeWatu</h1>
        <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-stone-600">Connect, create, and unlock opportunities at every stage of your journey.</p>

        <div role="group" aria-label="Billing period" className="mt-8 inline-flex rounded-full border border-stone-300 bg-white p-1">
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}
            className={'min-h-[44px] rounded-full px-6 text-sm font-semibold transition-colors ' + FOCUS + (!annual ? ' text-white' : ' text-stone-700 hover:text-stone-900')}
            style={{ backgroundColor: !annual ? GREEN : undefined, ...ring }}>Monthly</button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}
            className={'min-h-[44px] rounded-full px-6 text-sm font-semibold transition-colors ' + FOCUS + (annual ? ' text-white' : ' text-stone-700 hover:text-stone-900')}
            style={{ backgroundColor: annual ? GREEN : undefined, ...ring }}>
            Annual <span className={'ml-1.5 ' + (annual ? 'text-white/90' : 'text-emerald-800')}>Save 17%</span>
          </button>
        </div>
      </header>

      {/* Plans */}
      <ul className="mx-auto mt-12 grid max-w-[1180px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {TIER_ORDER.map(tierId => {
          const tier = TIERS[tierId];
          const featured = tierId === 'factory';
          const isCurrent = userTier === tierId;
          const isInvestor = tierId === 'investor';
          // Investor is applied for, never bought: the new-account week does not delay an application, only Factory.
          const isGatedTier = gated && tierId === 'factory';
          const perMonth = monthlyPrice(tier.price, tier.priceAnnual, annual);
          const cta = tierId === 'factory' ? 'Unlock Factory' : isInvestor ? 'Apply for Investor Access' : `Upgrade to ${tier.label}`;
          const apply = () => { const uid = auth.currentUser?.uid; if (uid) trackInvestorApplyClicked(uid, 'pricing'); (onApplyInvestor ?? (() => onUpgrade(tierId)))(); };
          const priceBlock = tier.price === 0
            ? <p className="font-sans text-[2rem] font-semibold leading-none tracking-tight">Free</p>
            : (
              <div>
                <p className="leading-none"><span className="text-[2rem] font-semibold tracking-tight tabular-nums">${perMonth}</span><span className={'ml-1.5 text-[15px] ' + (featured ? 'text-white/80' : 'text-stone-600')}>/ month</span></p>
                {annual && <p className={'mt-1.5 text-xs ' + (featured ? 'text-white/75' : 'text-stone-600')}>${tier.priceAnnual} billed yearly</p>}
              </div>
            );
          return (
            <li key={tierId} className="flex">
              <section aria-labelledby={`plan-${tierId}`} className={'flex w-full flex-col overflow-hidden rounded-[22px] border bg-white ' + (featured ? 'border-2 shadow-[0_8px_30px_rgba(26,74,58,0.14)]' : 'border-stone-200')} style={featured ? { borderColor: GREEN, backgroundColor: '#f2f8f5' } : undefined}>
                <div className={featured ? 'px-6 pb-6 pt-5 text-white' : 'px-6 pb-0 pt-6'} style={featured ? { backgroundColor: GREEN } : undefined}>
                  {featured && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">Most popular</p>}
                  <h2 id={`plan-${tierId}`} className={'font-serif text-[1.6rem] font-semibold leading-tight ' + (featured ? 'mt-1' : 'text-stone-900')}>{tier.label}</h2>
                  <p className={'mt-1 min-h-[2.9rem] text-[14px] leading-snug ' + (featured ? 'text-white/85' : 'text-stone-600')}>{tier.tagline}</p>
                  {isInvestor && <p className="mt-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-900">Approval required</p>}
                  <div className={'mt-3 ' + (featured ? '' : 'border-b border-stone-200 pb-6 text-stone-900')}>{priceBlock}</div>
                </div>

                <ul className="flex-1 space-y-2.5 px-6 pb-6 pt-5 text-[14px] text-stone-800">
                  {tier.features.map(f => (
                    <li key={f} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: GREEN }} strokeWidth={2.2} aria-hidden="true" /><span>{f}</span></li>
                  ))}
                </ul>

                <div className="px-6 pb-6">
                  {isCurrent ? (
                    <p className="flex min-h-[48px] items-center justify-center rounded-xl border border-stone-300 bg-white text-sm font-medium text-stone-600" aria-label={`${tier.label} is your current plan`}>Current plan</p>
                  ) : tier.price === 0 ? (
                    <p className="flex min-h-[48px] items-center justify-center text-sm font-medium text-stone-600">Always free</p>
                  ) : (
                    <button type="button" onClick={isInvestor ? apply : () => onUpgrade(tierId)} disabled={isGatedTier} title={isGatedTier ? ENGAGEMENT_GATE_TOOLTIP : undefined} aria-describedby={isGatedTier ? `gate-${tierId}` : undefined}
                      className={'min-h-[48px] w-full rounded-xl border-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' + FOCUS + (featured ? ' text-white hover:opacity-95' : ' bg-white hover:bg-emerald-50')}
                      style={{ borderColor: GREEN, backgroundColor: featured ? GREEN : undefined, color: featured ? undefined : GREEN, ...ring }}>
                      {cta}
                    </button>
                  )}
                  {isInvestor && !isCurrent && <p className="mt-3 text-center text-xs leading-relaxed text-stone-600">{APPLY_SUPPORT} <span className="block pt-1.5">{TRIAL_DISCLOSURE}</span></p>}
                  {isGatedTier && !isCurrent && <p id={`gate-${tierId}`} className="mt-2 text-center text-xs text-stone-600">{ENGAGEMENT_GATE_TOOLTIP}</p>}
                </div>
              </section>
            </li>
          );
        })}
      </ul>

      {/* Enterprise */}
      <section aria-labelledby="plan-enterprise" className="mx-auto mt-14 max-w-3xl text-center">
        <div className="flex items-center gap-5">
          <span className="h-px flex-1 bg-stone-300" aria-hidden="true" />
          <h2 id="plan-enterprise" className="flex items-center gap-2.5 font-serif text-[1.5rem] font-semibold text-stone-900"><Building2 className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />Enterprise</h2>
          <span className="h-px flex-1 bg-stone-300" aria-hidden="true" />
        </div>
        <p className="mt-3 text-[15px] text-stone-600">Arena sponsorship, talent scouting, startup pipeline, API access, and dedicated support.</p>
        <a href="mailto:enterprise@bewatu.com" className={'mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[16px] font-semibold ' + FOCUS} style={{ color: GREEN, ...ring }}>Contact us<ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
      </section>
    </div>
  );
}
