/**
 * types.subscription.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Add these fields to the existing User interface in types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ADD THESE FIELDS TO THE EXISTING User INTERFACE IN types.ts:
//
//   // ── Subscription ──
//   subscriptionTier?:     'free' | 'pro' | 'factory' | 'investor';
//   subscriptionStatus?:   'active' | 'trialing' | 'canceled' | 'paused' | 'past_due';
//   subscriptionId?:       string;
//   subscriptionPriceId?:  string;
//   currentPeriodEnd?:     string;
//   trialEndsAt?:          string;
//   trialEndingSoon?:      boolean;
//
//   // ── Graduation / Factory unlock ──
//   factoryUnlocked?:       boolean;
//   factoryUnlockedAt?:     string;
//   factoryUnlockReason?:   string;
//   ideaTractionScore?:     number;
//   collaborationScore?:    number;
//   teamFormationScore?:    number;
//   arenaPerformanceScore?: number;
//   proSubscriptionDays?:   number;
//
// ALSO ADD TO docToUser() in lib/firebaseAuth.ts:
//
//   subscriptionTier:      data.subscriptionTier     ?? 'free',
//   subscriptionStatus:    data.subscriptionStatus   ?? 'active',
//   subscriptionId:        data.subscriptionId,
//   subscriptionPriceId:   data.subscriptionPriceId,
//   currentPeriodEnd:      data.currentPeriodEnd,
//   trialEndsAt:           data.trialEndsAt,
//   trialEndingSoon:       data.trialEndingSoon       ?? false,
//   factoryUnlocked:       data.factoryUnlocked       ?? false,
//   factoryUnlockedAt:     data.factoryUnlockedAt,
//   factoryUnlockReason:   data.factoryUnlockReason,
//   ideaTractionScore:     data.ideaTractionScore     ?? 0,
//   collaborationScore:    data.collaborationScore    ?? 0,
//   teamFormationScore:    data.teamFormationScore    ?? 0,
//   arenaPerformanceScore: data.arenaPerformanceScore ?? 0,
//   proSubscriptionDays:   data.proSubscriptionDays   ?? 0,

export type SubscriptionStatus = 'active' | 'trialing' | 'canceled' | 'paused' | 'past_due';
export type SubscriptionTier   = 'free' | 'pro' | 'factory' | 'investor';
