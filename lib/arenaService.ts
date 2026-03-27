/**
 * lib/arenaService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All Firestore reads & writes for the Branded Arena system.
 * Drop this file into bewatu.com/lib/ alongside firestoreService.ts
 *
 * Collections:
 *   arena_industries        — one doc per industry (seeded)
 *   industry_verifications  — one doc per company-industry pair
 *   arena_challenges        — challenge posts (extends existing challenges)
 *   verificationRequests    — existing collection, new type added
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  arrayUnion,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IndustrySlug =
  | "payments"
  | "banking"
  | "insurance"
  | "healthcare"
  | "industrial"
  | "retail"
  | "regtech"
  | "techdata";

export type VerificationStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "expired";

export type ChallengeTier = "standard" | "featured" | "exclusive";

export type PrizeType = "cash" | "equity" | "job_offer" | "credits";

export interface ArenaIndustry {
  id: IndustrySlug;
  name: string;
  tagline: string;
  description: string;
  requiresRegulatory: boolean;
  regulatoryExamples: string[];
  sampleCompanies: string[];
  vanitySubdomain: string;
  color: string;
  icon: string;
  sortOrder: number;
  sponsorCompanyId: string | null;
  sponsorCompanyName: string | null;
  sponsorLogoUrl: string | null;
  sponsorshipExpiresAt: string | null;
  activeChallengeCount: number;
  totalPrizePool: number;
  totalChallengesEver: number;
  isActive: boolean;
}

export interface IndustryVerification {
  id: string;
  companyId: string;
  companyName: string;
  industry: IndustrySlug;
  status: VerificationStatus;
  documentUrl: string;
  regulatoryLicenceNo: string | null;
  regulatoryBody: string | null;
  isRegulated: boolean;
  approvedAt: string | null;
  expiresAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: string;
}

export interface ArenaChallenge {
  id: string;
  arenaIndustry: IndustrySlug;
  companyId: string;
  companyName: string;
  companyLogoUrl: string;
  isVerifiedPoster: boolean;
  isRegulatedPoster: boolean;
  title: string;
  description: string;
  fullDescription: string;
  requirements: string[];
  skills: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  tier: ChallengeTier;
  prizeAmount: number;
  prizeType: PrizeType;
  prizeDescription: string;
  prizeEscrowed: boolean;
  stripePaymentIntentId: string | null;
  verificationStatus: "pending_ops" | "live" | "suspended" | "expired";
  submissionsAnonymised: boolean;
  shortlistedUids: string[];
  submissionCount: number;
  viewCount: number;
  deadline: string;
  liveDate: string | null;
  closedAt: string | null;
  createdAt: string;
  recruiterId: string;
}

// Tier pricing in USD cents (for Stripe)
export const CHALLENGE_TIER_PRICES: Record<ChallengeTier, number> = {
  standard:  50000,   // $500
  featured:  150000,  // $1,500
  exclusive: 350000,  // $3,500
};

export const CHALLENGE_TIER_LABELS: Record<ChallengeTier, string> = {
  standard:  "Standard — $500",
  featured:  "Featured — $1,500",
  exclusive: "Exclusive — $3,500",
};

export const INDUSTRY_VERIFICATION_FEE_CENTS = 25000; // $250
export const SUBMISSION_REVEAL_FEE_CENTS = 5000;       // $50
export const FREE_REVEAL_COUNT = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toData<T>(snap: QueryDocumentSnapshot<DocumentData>): T {
  return { id: snap.id, ...snap.data() } as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// ARENA INDUSTRIES
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch all active industries, sorted by sortOrder */
export async function getArenaIndustries(): Promise<ArenaIndustry[]> {
  const snap = await getDocs(
    query(
      collection(db, "arena_industries"),
      where("isActive", "==", true),
      orderBy("sortOrder", "asc")
    )
  );
  return snap.docs.map((d) => toData<ArenaIndustry>(d));
}

/** Fetch a single industry by slug */
export async function getArenaIndustry(slug: IndustrySlug): Promise<ArenaIndustry | null> {
  const snap = await getDoc(doc(db, "arena_industries", slug));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ArenaIndustry;
}

/** Real-time subscription to all industries */
export function subscribeToArenaIndustries(
  callback: (industries: ArenaIndustry[]) => void
) {
  const q = query(
    collection(db, "arena_industries"),
    where("isActive", "==", true),
    orderBy("sortOrder", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toData<ArenaIndustry>(d)));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INDUSTRY VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Submit an industry verification request.
 * Uploads the document to Storage then writes to verificationRequests.
 */
export async function submitIndustryVerification({
  companyId,
  companyName,
  companyFirestoreId,
  industry,
  documentFile,
  regulatoryLicenceNo,
  regulatoryBody,
  recruiterUid,
  recruiterEmail,
}: {
  companyId: string;
  companyName: string;
  companyFirestoreId: string;
  industry: IndustrySlug;
  documentFile: File;
  regulatoryLicenceNo?: string;
  regulatoryBody?: string;
  recruiterUid: string;
  recruiterEmail: string;
}): Promise<string> {
  // 1. Upload document to Storage
  const storageRef = ref(
    storage,
    `industry-verifications/${companyFirestoreId}/${industry}/${Date.now()}-${documentFile.name}`
  );
  await uploadBytes(storageRef, documentFile);
  const documentUrl = await getDownloadURL(storageRef);

  // 2. Write to verificationRequests (ops picks this up in their queue)
  const requestRef = await addDoc(collection(db, "verificationRequests"), {
    type:               "industry_verification",
    companyId:          companyFirestoreId,
    companyName,
    industry,
    documentUrl,
    regulatoryLicenceNo: regulatoryLicenceNo || null,
    regulatoryBody:      regulatoryBody || null,
    recruiterUid,
    recruiterEmail,
    status:             "pending",
    submittedAt:        serverTimestamp(),
    updatedAt:          serverTimestamp(),
    reviewedBy:         null,
    reviewNote:         null,
  });

  // 3. Also write a pending record to industry_verifications for quick lookup
  await addDoc(collection(db, "industry_verifications"), {
    companyId:           companyFirestoreId,
    companyName,
    industry,
    status:              "pending",
    documentUrl,
    regulatoryLicenceNo: regulatoryLicenceNo || null,
    regulatoryBody:      regulatoryBody || null,
    isRegulated:         false,
    approvedAt:          null,
    expiresAt:           null,
    reviewedBy:          null,
    reviewNote:          null,
    verificationRequestId: requestRef.id,
    submittedAt:         serverTimestamp(),
  });

  return requestRef.id;
}

/** Get all verifications for a company */
export async function getCompanyIndustryVerifications(
  companyId: string
): Promise<IndustryVerification[]> {
  const snap = await getDocs(
    query(
      collection(db, "industry_verifications"),
      where("companyId", "==", companyId)
    )
  );
  return snap.docs.map((d) => toData<IndustryVerification>(d));
}

/** Check if a company is verified for a specific industry */
export async function isCompanyVerifiedForIndustry(
  companyId: string,
  industry: IndustrySlug
): Promise<{ verified: boolean; regulated: boolean; expiresAt: string | null }> {
  const snap = await getDocs(
    query(
      collection(db, "industry_verifications"),
      where("companyId", "==", companyId),
      where("industry", "==", industry),
      where("status", "==", "approved")
    )
  );

  if (snap.empty) return { verified: false, regulated: false, expiresAt: null };

  const rec = snap.docs[0].data();
  const expiresAt = rec.expiresAt?.toDate?.()?.toISOString() ?? null;

  // Check not expired
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return { verified: false, regulated: false, expiresAt };
  }

  return {
    verified:   true,
    regulated:  rec.isRegulated ?? false,
    expiresAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ARENA CHALLENGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an arena challenge after Stripe payment is confirmed.
 * Called from the challenge creation flow once paymentIntentId is returned.
 */
export async function createArenaChallenge(data: {
  arenaIndustry: IndustrySlug;
  companyId: string;
  companyName: string;
  companyLogoUrl: string;
  isVerifiedPoster: boolean;
  isRegulatedPoster: boolean;
  title: string;
  description: string;
  fullDescription: string;
  requirements: string[];
  skills: string[];
  difficulty: ArenaChallenge["difficulty"];
  tier: ChallengeTier;
  prizeAmount: number;
  prizeType: PrizeType;
  prizeDescription: string;
  prizeEscrowed: boolean;
  stripePaymentIntentId: string;
  deadline: string;
  recruiterId: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, "arena_challenges"), {
    ...data,
    verificationStatus:    "pending_ops",
    submissionsAnonymised: true,
    shortlistedUids:       [],
    submissionCount:       0,
    viewCount:             0,
    liveDate:              null,
    closedAt:              null,
    createdAt:             serverTimestamp(),
    updatedAt:             serverTimestamp(),
  });

  // Increment the industry counter (will be updated to "live" count by ops on approval)
  await updateDoc(doc(db, "arena_industries", data.arenaIndustry), {
    totalChallengesEver: increment(1),
    totalPrizePool:      increment(data.prizeAmount),
    updatedAt:           serverTimestamp(),
  });

  return ref.id;
}

/** Get all live challenges for an industry */
export async function getArenaChalllengesByIndustry(
  industry: IndustrySlug,
  maxResults = 50
): Promise<ArenaChallenge[]> {
  const snap = await getDocs(
    query(
      collection(db, "arena_challenges"),
      where("arenaIndustry", "==", industry),
      where("verificationStatus", "==", "live"),
      orderBy("createdAt", "desc"),
      limit(maxResults)
    )
  );
  return snap.docs.map((d) => toData<ArenaChallenge>(d));
}

/** Get all live challenges across all industries (for discovery) */
export async function getAllArenaChallenges(maxResults = 100): Promise<ArenaChallenge[]> {
  const snap = await getDocs(
    query(
      collection(db, "arena_challenges"),
      where("verificationStatus", "==", "live"),
      orderBy("createdAt", "desc"),
      limit(maxResults)
    )
  );
  return snap.docs.map((d) => toData<ArenaChallenge>(d));
}

/** Get a single arena challenge */
export async function getArenaChallenge(challengeId: string): Promise<ArenaChallenge | null> {
  const snap = await getDoc(doc(db, "arena_challenges", challengeId));
  if (!snap.exists()) return null;

  // Increment view count
  updateDoc(snap.ref, { viewCount: increment(1) }).catch(() => {});

  return { id: snap.id, ...snap.data() } as ArenaChallenge;
}

/** Get all challenges posted by a company (any status) */
export async function getCompanyArenaChallenges(
  companyId: string
): Promise<ArenaChallenge[]> {
  const snap = await getDocs(
    query(
      collection(db, "arena_challenges"),
      where("companyId", "==", companyId),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => toData<ArenaChallenge>(d));
}

/** Real-time subscription to challenges in an industry */
export function subscribeToIndustryChallenges(
  industry: IndustrySlug,
  callback: (challenges: ArenaChallenge[]) => void
) {
  const q = query(
    collection(db, "arena_challenges"),
    where("arenaIndustry", "==", industry),
    where("verificationStatus", "==", "live"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toData<ArenaChallenge>(d)));
  });
}

/**
 * Reveal a solver's identity after Stripe payment.
 * Writes the uid to shortlistedUids on the challenge.
 */
export async function revealSolverIdentity(
  challengeId: string,
  solverUid: string,
  stripePaymentIntentId: string
): Promise<void> {
  await updateDoc(doc(db, "arena_challenges", challengeId), {
    shortlistedUids:          arrayUnion(solverUid),
    [`revealPayments.${solverUid}`]: stripePaymentIntentId,
    updatedAt:                serverTimestamp(),
  });
}

/**
 * Check if a company can post a challenge in an industry.
 * Returns a detailed result explaining any blockers.
 */
export async function checkChallengePostingEligibility(
  companyId: string,
  industry: IndustrySlug,
  recruiterEmailDomain: string,
  companyDomain: string
): Promise<{
  eligible: boolean;
  reason: string | null;
  verificationStatus: VerificationStatus | "not_submitted";
  isRegulated: boolean;
}> {
  // 1. Email domain check
  if (recruiterEmailDomain.toLowerCase() !== companyDomain.toLowerCase()) {
    return {
      eligible: false,
      reason: `Your email domain (@${recruiterEmailDomain}) must match your company domain (@${companyDomain}).`,
      verificationStatus: "not_submitted",
      isRegulated: false,
    };
  }

  // 2. Industry verification check
  const { verified, regulated, expiresAt } = await isCompanyVerifiedForIndustry(
    companyId,
    industry
  );

  if (!verified) {
    // Check if there's a pending request
    const pendingSnap = await getDocs(
      query(
        collection(db, "industry_verifications"),
        where("companyId", "==", companyId),
        where("industry", "==", industry),
        where("status", "in", ["pending", "in_review"])
      )
    );

    if (!pendingSnap.empty) {
      return {
        eligible: false,
        reason: "Your industry verification is under review. You will be notified once approved.",
        verificationStatus: "pending",
        isRegulated: false,
      };
    }

    // Check if expired
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return {
        eligible: false,
        reason: "Your industry verification has expired. Please renew to continue posting challenges.",
        verificationStatus: "expired",
        isRegulated: regulated,
      };
    }

    return {
      eligible: false,
      reason: `You need to complete industry verification for the ${industry} arena before posting challenges.`,
      verificationStatus: "not_submitted",
      isRegulated: false,
    };
  }

  return {
    eligible:           true,
    reason:             null,
    verificationStatus: "approved",
    isRegulated:        regulated,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OPS FUNCTIONS (called from ops.bewatu.com)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ops: Approve an industry verification.
 * Writes to the verification record AND the company doc.
 */
export async function approveIndustryVerification(
  verificationId: string,
  companyId: string,
  industry: IndustrySlug,
  isRegulated: boolean,
  reviewNote: string,
  reviewerUid: string,
  reviewerName: string
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  // Update the verification record
  await updateDoc(doc(db, "industry_verifications", verificationId), {
    status:      "approved",
    isRegulated,
    approvedAt:  serverTimestamp(),
    expiresAt:   expiresAt.toISOString(),
    reviewedBy:  reviewerUid,
    reviewerName,
    reviewNote,
    updatedAt:   serverTimestamp(),
  });

  // Update the company record
  await updateDoc(doc(db, "companies", companyId), {
    verifiedIndustries: arrayUnion(industry),
    ...(isRegulated ? { regulatedIndustries: arrayUnion(industry) } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Ops: Reject an industry verification.
 */
export async function rejectIndustryVerification(
  verificationId: string,
  reviewNote: string,
  reviewerUid: string,
  reviewerName: string
): Promise<void> {
  await updateDoc(doc(db, "industry_verifications", verificationId), {
    status:      "rejected",
    reviewedBy:  reviewerUid,
    reviewerName,
    reviewNote,
    updatedAt:   serverTimestamp(),
  });
}

/**
 * Ops: Approve a challenge (go live).
 */
export async function approveArenaChallenge(
  challengeId: string,
  industry: IndustrySlug
): Promise<void> {
  await updateDoc(doc(db, "arena_challenges", challengeId), {
    verificationStatus: "live",
    liveDate:           serverTimestamp(),
    updatedAt:          serverTimestamp(),
  });

  await updateDoc(doc(db, "arena_industries", industry), {
    activeChallengeCount: increment(1),
    updatedAt:            serverTimestamp(),
  });
}

/**
 * Ops: Suspend a live challenge.
 */
export async function suspendArenaChallenge(
  challengeId: string,
  industry: IndustrySlug,
  reason: string
): Promise<void> {
  await updateDoc(doc(db, "arena_challenges", challengeId), {
    verificationStatus: "suspended",
    suspensionReason:   reason,
    updatedAt:          serverTimestamp(),
  });

  await updateDoc(doc(db, "arena_industries", industry), {
    activeChallengeCount: increment(-1),
    updatedAt:            serverTimestamp(),
  });
}

/**
 * Ops: Assign arena sponsor (naming rights).
 */
export async function assignArenaSponsor(
  industry: IndustrySlug,
  sponsorCompanyId: string,
  sponsorCompanyName: string,
  sponsorLogoUrl: string,
  expiresAt: string
): Promise<void> {
  await updateDoc(doc(db, "arena_industries", industry), {
    sponsorCompanyId,
    sponsorCompanyName,
    sponsorLogoUrl,
    sponsorshipExpiresAt: expiresAt,
    updatedAt:            serverTimestamp(),
  });

  await updateDoc(doc(db, "companies", sponsorCompanyId), {
    isArenaSponsors: arrayUnion(industry),
    updatedAt:       serverTimestamp(),
  });
}

/**
 * Ops: Remove arena sponsor.
 */
export async function removeArenaSponsor(industry: IndustrySlug): Promise<void> {
  await updateDoc(doc(db, "arena_industries", industry), {
    sponsorCompanyId:     null,
    sponsorCompanyName:   null,
    sponsorLogoUrl:       null,
    sponsorshipExpiresAt: null,
    updatedAt:            serverTimestamp(),
  });
}
