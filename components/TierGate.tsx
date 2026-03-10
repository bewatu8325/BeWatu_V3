/**
 * components/TierGate.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrap any component with <TierGate requiredTier="pro"> to show an upgrade
 * prompt instead of the content if the user doesn't have access.
 *
 * Usage:
 *   <TierGate requiredTier="pro" onUpgrade={openUpgradeModal}>
 *     <ExpertMarketplace />
 *   </TierGate>
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from 'react';
import { Lock, ChevronRight } from 'lucide-react';
import { SubscriptionTier, hasAccess, getUpgradeMessage, TIERS } from '../lib/subscription';
import { useFirebase } from '../contexts/FirebaseContext';

interface TierGateProps {
  requiredTier: SubscriptionTier;
  onUpgrade:    (tier: SubscriptionTier) => void;
  children:     React.ReactNode;
  /** Optional: show a compact inline lock instead of a full block */
  compact?:     boolean;
}

export default function TierGate({ requiredTier, onUpgrade, children, compact }: TierGateProps) {
  const { currentUser } = useFirebase();
  const userTier = ((currentUser as any)?.subscriptionTier ?? 'free') as SubscriptionTier;

  // User has access — render children normally
  if (hasAccess(userTier, requiredTier)) {
    return <>{children}</>;
  }

  const tierConfig = TIERS[requiredTier];
  const message    = getUpgradeMessage(requiredTier);

  // Compact version — inline lock badge
  if (compact) {
    return (
      <button
        onClick={() => onUpgrade(requiredTier)}
        className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors"
      >
        <Lock className="h-3 w-3" />
        {tierConfig.label} feature
      </button>
    );
  }

  // Full block version
  return (
    <div className="rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
        <Lock className="h-6 w-6 text-stone-400" />
      </div>
      <h3 className="font-semibold text-stone-900 mb-2">
        {tierConfig.label} feature
      </h3>
      <p className="text-stone-500 text-sm mb-6 max-w-sm mx-auto">
        {message}
      </p>
      <button
        onClick={() => onUpgrade(requiredTier)}
        className="inline-flex items-center gap-2 bg-stone-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-stone-700 transition-colors"
      >
        Upgrade to {tierConfig.label}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
