/**
 * lib/subscription.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier definitions, access checks, and upgrade helpers.
 * Import these anywhere in the app to gate features by subscription tier.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Tier definitions ──────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro' | 'factory' | 'investor';

export type AccessLevel = 1 | 2 | 3 | 4 | 5;

export interface TierConfig {
  id:          SubscriptionTier;
  label:       string;
  price:       number;       // monthly price in USD
  priceAnnual: number;       // annual price in USD
  level:       AccessLevel;
  color:       string;       // tailwind color class
  features:    string[];
}

export const TIERS: Record<SubscriptionTier, TierConfig> = {
  free: {
    id:          'free',
    label:       'Explorer',
    price:       0,
    priceAnnual: 0,
    level:       1,
    color:       'text-stone-500',
    features: [
      'Full network access',
      'Up to 3 circle memberships',
      'Browse ideas & arenas',
      'Basic profile',
      'Follow people & companies',
    ],
  },
  pro: {
    id:          'pro',
    label:       'Pro',
    price:       19,
    priceAnnual: 190,
    level:       3,
    color:       'text-blue-500',
    features: [
      'Everything in Free',
      'Unlimited circle memberships',
      'Expert marketplace access',
      'Advanced people discovery',
      'Arena priority access',
      'Idea analytics',
      'Team formation tools',
      'Cofounder matching',
      'Profile verification badge',
    ],
  },
  factory: {
    id:          'factory',
    label:       'Factory',
    price:       49,
    priceAnnual: 490,
    level:       5,
    color:       'text-emerald-500',
    features: [
      'Everything in Pro',
      'Factory workspace',
      'Idea validation suite',
      'Startup pipeline tools',
      'Incubator program access',
      'Investor discovery',
      'Traction dashboard',
      'Up to 3 team members included',
      'Factory leaderboard visibility',
    ],
  },
  investor: {
    id:          'investor',
    label:       'Investor',
    price:       199,
    priceAnnual: 1990,
    level:       5,
    color:       'text-amber-500',
    features: [
      'Curated deal flow',
      'Startup assessments',
      'Founder direct messaging',
      'Portfolio tracking',
      'Early access to Factory startups',
      'Arena winner notifications',
      'Verified investor badge',
      'Monthly curated report',
    ],
  },
};

// ── Access checks ─────────────────────────────────────────────────────────────

/** Returns true if the user's tier grants access to the required tier */
export function hasAccess(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  // Investor is a parallel track — only investors can access investor features
  if (requiredTier === 'investor') return userTier === 'investor';

  const order: SubscriptionTier[] = ['free', 'pro', 'factory'];
  return order.indexOf(userTier) >= order.indexOf(requiredTier);
}

/** Returns true if the user can access Factory */
export function canAccessFactory(userTier: SubscriptionTier): boolean {
  return userTier === 'factory' || userTier === 'investor';
}

/** Returns true if the user can access the expert marketplace */
export function canAccessExpertMarketplace(userTier: SubscriptionTier): boolean {
  return userTier !== 'free';
}

/** Returns true if the user can form teams */
export function canFormTeams(userTier: SubscriptionTier): boolean {
  return userTier !== 'free';
}

/** Returns the next tier the user should upgrade to */
export function getNextTier(userTier: SubscriptionTier): SubscriptionTier | null {
  const order: SubscriptionTier[] = ['free', 'pro', 'factory'];
  const idx = order.indexOf(userTier);
  if (idx === -1 || idx === order.length - 1) return null;
  return order[idx + 1];
}

/** Returns a human-readable upgrade prompt */
export function getUpgradeMessage(requiredTier: SubscriptionTier): string {
  switch (requiredTier) {
    case 'pro':
      return 'Upgrade to Pro to unlock advanced discovery, expert marketplace, and team tools.';
    case 'factory':
      return 'Unlock Factory to access startup tools, investor discovery, and your startup pipeline.';
    case 'investor':
      return 'Sign up as an Investor to access deal flow, startup assessments, and portfolio tracking.';
    default:
      return 'Upgrade your plan to access this feature.';
  }
}
