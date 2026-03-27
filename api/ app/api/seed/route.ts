import { NextRequest, NextResponse } from "next/server";

const SEED_SECRET = process.env.SEED_SECRET ?? "";

export async function POST(req: NextRequest) {
  // Protect with a secret so only you can run it
  const { secret } = await req.json();
  if (secret !== SEED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

  if (!getApps().length) {
    initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }

  const db = getFirestore();

  // ── Arena industries ──────────────────────────────────────────────
  const industries = [
    { id: "payments",   name: "Payments Arena",            color: "#6366f1", icon: "CreditCard", sortOrder: 1, tagline: "Building the rails of global commerce",        activeChallengeCount: 2, totalPrizePool: 12000, totalChallengesEver: 6, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
    { id: "banking",    name: "Banking Arena",              color: "#0ea5e9", icon: "Building2",  sortOrder: 2, tagline: "Reimagining how the world banks",               activeChallengeCount: 1, totalPrizePool: 5000,  totalChallengesEver: 3, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
    { id: "insurance",  name: "Insurance Arena",            color: "#8b5cf6", icon: "Shield",     sortOrder: 3, tagline: "Protecting what matters, differently",          activeChallengeCount: 1, totalPrizePool: 3500,  totalChallengesEver: 2, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
    { id: "healthcare", name: "Healthcare Arena",           color: "#10b981", icon: "Heart",      sortOrder: 4, tagline: "Technology that improves lives",                activeChallengeCount: 1, totalPrizePool: 5000,  totalChallengesEver: 2, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
    { id: "lending",    name: "Lending & Credit Arena",    color: "#f59e0b", icon: "TrendingUp", sortOrder: 5, tagline: "Unlocking capital for everyone",                 activeChallengeCount: 0, totalPrizePool: 0,     totalChallengesEver: 1, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
    { id: "wealth",     name: "Wealth & Investment Arena", color: "#f97316", icon: "BarChart3",  sortOrder: 6, tagline: "Making markets work for everyone",              activeChallengeCount: 0, totalPrizePool: 0,     totalChallengesEver: 0, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
    { id: "regtech",    name: "RegTech & Compliance Arena",color: "#ec4899", icon: "FileCheck",  sortOrder: 7, tagline: "Compliance that doesn't slow you down",         activeChallengeCount: 1, totalPrizePool: 2000,  totalChallengesEver: 2, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
    { id: "proptech",   name: "PropTech Arena",             color: "#14b8a6", icon: "Home",       sortOrder: 8, tagline: "Reinventing the built environment",             activeChallengeCount: 0, totalPrizePool: 0,     totalChallengesEver: 0, isActive: true, sponsorCompanyId: null, sponsorCompanyName: null, sponsorLogoUrl: null, sponsorshipExpiresAt: null },
  ];

  for (const ind of industries) {
    await db.collection("arena_industries").doc(ind.id).set(
      { ...ind, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  // ── Users ─────────────────────────────────────────────────────────
  const users = [
    { id: "seed_user_001", name: "Amara Osei",       email: "amara@testbewatu.com",       avatar: "https://i.pravatar.cc/150?img=47", title: "Fintech Founder & ex-Stripe",         role: "founder",   xp: 4200, level: 7, streak: 23, badges: ["first_idea","team_builder","first_startup","arena_winner"], ideaTractionScore: 78, collaborationScore: 65, teamFormationScore: 82, arenaPerformanceScore: 71, factoryUnlocked: true,  subscriptionTier: "factory"  },
    { id: "seed_user_002", name: "Kwame Asante",     email: "kwame@testbewatu.com",       avatar: "https://i.pravatar.cc/150?img=12", title: "ML Engineer",                         role: "solver",    xp: 2800, level: 6, streak: 14, badges: ["first_solution","shortlisted","streak_7"],               ideaTractionScore: 45, collaborationScore: 72, teamFormationScore: 38, arenaPerformanceScore: 58, factoryUnlocked: true,  subscriptionTier: "factory"  },
    { id: "seed_user_003", name: "Sofia Mendez",     email: "sofia@testbewatu.com",       avatar: "https://i.pravatar.cc/150?img=23", title: "Product Designer",                    role: "solver",    xp: 1650, level: 5, streak:  8, badges: ["first_idea","idea_validated"],                           ideaTractionScore: 62, collaborationScore: 55, teamFormationScore: 29, arenaPerformanceScore: 30, factoryUnlocked: true,  subscriptionTier: "factory"  },
    { id: "seed_user_004", name: "James Thornton",   email: "james@thorntonventures.com", avatar: "https://i.pravatar.cc/150?img=33", title: "Partner, Thornton Ventures",          role: "investor",  xp:  900, level: 3, streak:  5, badges: ["verified_pro","connector"],                              ideaTractionScore:  0, collaborationScore:  0, teamFormationScore:  0, arenaPerformanceScore:  0, factoryUnlocked: true,  subscriptionTier: "investor" },
    { id: "seed_user_005", name: "Priya Nair",       email: "priya@testbewatu.com",       avatar: "https://i.pravatar.cc/150?img=45", title: "Backend Engineer & Technical Founder",role: "founder",   xp: 3100, level: 6, streak: 31, badges: ["first_startup","team_builder","streak_30"],              ideaTractionScore: 71, collaborationScore: 84, teamFormationScore: 76, arenaPerformanceScore: 65, factoryUnlocked: true,  subscriptionTier: "factory"  },
    { id: "seed_user_006", name: "Marcus Webb",      email: "marcus@testbewatu.com",      avatar: "https://i.pravatar.cc/150?img=53", title: "RegTech Specialist",                  role: "solver",    xp: 1200, level: 4, streak:  3, badges: ["first_solution"],                                        ideaTractionScore: 35, collaborationScore: 48, teamFormationScore: 22, arenaPerformanceScore: 44, factoryUnlocked: false, subscriptionTier: "free"     },
    { id: "seed_user_007", name: "Aisha Kamara",     email: "aisha@testbewatu.com",       avatar: "https://i.pravatar.cc/150?img=29", title: "Healthcare Tech Founder",             role: "founder",   xp: 2200, level: 5, streak: 12, badges: ["first_idea","first_startup","idea_validated"],           ideaTractionScore: 68, collaborationScore: 71, teamFormationScore: 59, arenaPerformanceScore: 42, factoryUnlocked: true,  subscriptionTier: "factory"  },
    { id: "seed_user_008", name: "Chen Wei",         email: "chen@testbewatu.com",        avatar: "https://i.pravatar.cc/150?img=68", title: "Blockchain Developer",                role: "solver",    xp: 1900, level: 5, streak: 19, badges: ["first_solution","arena_winner"],                          ideaTractionScore: 52, collaborationScore: 61, teamFormationScore: 44, arenaPerformanceScore: 77, factoryUnlocked: true,  subscriptionTier: "factory"  },
    { id: "seed_user_009", name: "Fatima Al-Hassan", email: "fatima@crescentcapital.com", avatar: "https://i.pravatar.cc/150?img=36", title: "Managing Partner, Crescent Capital",  role: "investor",  xp:  600, level: 2, streak:  2, badges: ["verified_pro"],                                          ideaTractionScore:  0, collaborationScore:  0, teamFormationScore:  0, arenaPerformanceScore:  0, factoryUnlocked: true,  subscriptionTier: "investor" },
    { id: "seed_user_010", name: "Liam O'Brien",     email: "liam@testbewatu.com",        avatar: "https://i.pravatar.cc/150?img=11", title: "Growth Hacker & ex-Revolut",          role: "solver",    xp:  880, level: 3, streak:  6, badges: ["first_idea"],                                            ideaTractionScore: 40, collaborationScore: 33, teamFormationScore: 18, arenaPerformanceScore: 22, factoryUnlocked: false, subscriptionTier: "free"     },
  ];

  for (const u of users) {
    const { id, ...data } = u;
    await db.collection("users").doc(id).set(
      { ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await db.collection("factory_users").doc(id).set(
      { uid: id, name: data.name, email: data.email, avatar: data.avatar, role: data.role, factoryUnlocked: data.factoryUnlocked, subscriptionTier: data.subscriptionTier, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await db.collection("reputation_profiles").doc(id).set(
      { uid: id, xp: data.xp, level: data.level, streak: data.streak, badges: data.badges, history: [], lastCheckinDate: new Date().toISOString().slice(0, 10), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await db.collection("leaderboard").doc(id).set(
      { userId: id, name: data.name, avatar: data.avatar, title: data.title, xp: data.xp, level: data.level, streak: data.streak, badges: data.badges.length, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  // ── Arena challenges ──────────────────────────────────────────────
  const now = Date.now();
  const challenges = [
    { arenaIndustry: "payments",   companyName: "Stripe",             companyId: "stripe_seed",          isVerifiedPoster: true,  isRegulatedPoster: true,  title: "Build a real-time card fraud detection model with <50ms latency",                        description: "Design a fraud detection system for card transactions that operates in under 50ms without sacrificing accuracy.",       difficulty: "expert",       tier: "featured",   prizeAmount: 5000, prizeType: "cash", submissionCount: 14, viewCount: 342, deadline: new Date(now + 18*86400000).toISOString(), shortlistedUids: ["seed_user_002"] },
    { arenaIndustry: "payments",   companyName: "Adyen",              companyId: "adyen_seed",           isVerifiedPoster: true,  isRegulatedPoster: true,  title: "Cross-border payment reconciliation engine for multi-currency merchants",              description: "Build an automated reconciliation system that handles multi-currency settlements across 40+ countries.",                difficulty: "advanced",     tier: "standard",   prizeAmount: 3000, prizeType: "cash", submissionCount:  7, viewCount: 188, deadline: new Date(now + 25*86400000).toISOString(), shortlistedUids: [] },
    { arenaIndustry: "banking",    companyName: "Monzo",              companyId: "monzo_seed",           isVerifiedPoster: true,  isRegulatedPoster: true,  title: "Predictive overdraft prevention — nudge users before they go negative",              description: "Build a system that predicts overdraft risk 48–72 hours in advance and surfaces personalised interventions.",           difficulty: "intermediate", tier: "standard",   prizeAmount: 5000, prizeType: "cash", submissionCount: 21, viewCount: 511, deadline: new Date(now + 12*86400000).toISOString(), shortlistedUids: ["seed_user_008"] },
    { arenaIndustry: "insurance",  companyName: "Lemonade",           companyId: "lemonade_seed",        isVerifiedPoster: true,  isRegulatedPoster: false, title: "AI claims adjuster — from FNOL to payout decision in under 3 minutes",              description: "Design an AI system that handles First Notice Of Loss to payout decision for home insurance claims.",                  difficulty: "advanced",     tier: "exclusive",  prizeAmount: 3500, prizeType: "cash", submissionCount:  9, viewCount: 276, deadline: new Date(now + 30*86400000).toISOString(), shortlistedUids: [] },
    { arenaIndustry: "healthcare", companyName: "Babylon Health",     companyId: "babylon_seed",         isVerifiedPoster: true,  isRegulatedPoster: false, title: "Low-bandwidth teleconsultation for rural clinics with intermittent connectivity",    description: "Build a teleconsultation system that works reliably on 2G connections and offline for rural health workers.",           difficulty: "advanced",     tier: "featured",   prizeAmount: 5000, prizeType: "cash", submissionCount:  6, viewCount: 194, deadline: new Date(now + 21*86400000).toISOString(), shortlistedUids: [] },
    { arenaIndustry: "regtech",    companyName: "ComplyAdvantage",    companyId: "comply_seed",          isVerifiedPoster: true,  isRegulatedPoster: false, title: "Sanctions screening with <1% false positives for non-Latin script names",           description: "Build a name matching system for sanctions screening that handles Arabic, Chinese, and Cyrillic scripts.",             difficulty: "expert",       tier: "standard",   prizeAmount: 2000, prizeType: "cash", submissionCount:  4, viewCount: 133, deadline: new Date(now + 35*86400000).toISOString(), shortlistedUids: [] },
  ];

  for (const c of challenges) {
    await db.collection("arena_challenges").add({
      ...c, verificationStatus: "live", submissionsAnonymised: true, companyLogoUrl: null,
      prizeDescription: `$${c.prizeAmount} cash`, prizeEscrowed: false,
      stripePaymentIntentId: "pi_seed", skills: [], requirements: [],
      liveDate: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // ── Startups ──────────────────────────────────────────────────────
  const startups = [
    { name: "FraudShield",  tagline: "Real-time fraud prevention for emerging market payment networks", stage: "pre-seed", createdBy: "seed_user_001", founders: [{ id: "seed_user_001", name: "Amara Osei",   avatar: "https://i.pravatar.cc/150?img=47", role: "CEO" }, { id: "seed_user_002", name: "Kwame Asante", avatar: "https://i.pravatar.cc/150?img=12", role: "CTO" }], funding: 0,      verificationStatus: "approved", metrics: { users: 12,   revenue: 0,     growth: 0,  teamSize: 3 }, fundingRounds: [] },
    { name: "MediSync",     tagline: "Offline-first medical records for 1B people with no reliable internet",           stage: "pre-seed", createdBy: "seed_user_007", founders: [{ id: "seed_user_007", name: "Aisha Kamara",  avatar: "https://i.pravatar.cc/150?img=29", role: "CEO" }, { id: "seed_user_005", name: "Priya Nair",    avatar: "https://i.pravatar.cc/150?img=45", role: "CTO" }], funding: 150000, verificationStatus: "approved", metrics: { users: 340,  revenue: 0,     growth: 42, teamSize: 2 }, fundingRounds: [{ investorName: "Crescent Capital", amount: 150000, equity: 8, instrument: "safe", stage: "pre-seed", closedAt: new Date(now - 60*86400000).toISOString() }] },
    { name: "RemitChain",   tagline: "Stablecoin payroll for global remote teams — zero FX fees",                       stage: "seed",     createdBy: "seed_user_008", founders: [{ id: "seed_user_008", name: "Chen Wei",      avatar: "https://i.pravatar.cc/150?img=68", role: "CEO" }],                                                                                                                  funding: 750000, verificationStatus: "approved", metrics: { users: 1200, revenue: 18000, growth: 28, teamSize: 4 }, fundingRounds: [{ investorName: "Thornton Ventures",  amount: 750000, equity: 12, instrument: "safe", stage: "seed",     closedAt: new Date(now - 30*86400000).toISOString() }] },
  ];

  const startupIds: string[] = [];
  for (const s of startups) {
    const ref = await db.collection("factory_startups").add({
      ...s, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    startupIds.push(ref.id);
  }

  // ── Funding offers ────────────────────────────────────────────────
  await db.collection("funding_offers").add({
    startupId: startupIds[0], startupName: "FraudShield",
    founderUids: ["seed_user_001","seed_user_002"],
    investorUid: "seed_user_004", investorName: "James Thornton", investorFirm: "Thornton Ventures", investorAvatar: "https://i.pravatar.cc/150?img=33",
    amount: 250000, equity: 8, instrument: "safe", valuation: 3125000,
    conditions: "Board observer seat. Pro-rata rights on next round.",
    message: "Love what you're building. Fraud prevention is a massive market and your GNN approach is genuinely novel.",
    status: "pending", expiresAt: new Date(now + 14*86400000).toISOString(),
    history: [{ action: "offer_made", by: "seed_user_004", byName: "James Thornton", amount: 250000, equity: 8, ts: new Date(now - 2*86400000).toISOString() }],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("funding_offers").add({
    startupId: startupIds[0], startupName: "FraudShield",
    founderUids: ["seed_user_001","seed_user_002"],
    investorUid: "seed_user_009", investorName: "Fatima Al-Hassan", investorFirm: "Crescent Capital", investorAvatar: "https://i.pravatar.cc/150?img=36",
    amount: 200000, equity: 7, instrument: "safe", valuation: 2857142,
    conditions: null,
    message: "We've been looking for a fraud detection play for our Africa fintech portfolio.",
    status: "pending", expiresAt: new Date(now + 7*86400000).toISOString(),
    history: [{ action: "offer_made", by: "seed_user_009", byName: "Fatima Al-Hassan", amount: 200000, equity: 7, ts: new Date(now - 1*86400000).toISOString() }],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });

  // ── Demo sessions ─────────────────────────────────────────────────
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const tomorrow = new Date(now + 86400000);
  const yesterday = new Date(now - 86400000);

  await db.collection("demo_sessions").add({
    startupId: startupIds[0], startupName: "FraudShield",
    founderUids: ["seed_user_001","seed_user_002"],
    investorUid: "seed_user_004", investorName: "James Thornton", investorFirm: "Thornton Ventures",
    slotDate: fmt(tomorrow), slotTime: "10:00", duration: 30,
    roomUrl: "https://meet.jit.si/bewatu-fraudshield-demo-001",
    note: "Keen to understand the GNN architecture and latency benchmarks.",
    status: "confirmed", outcome: null, reminderSent: false,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("demo_sessions").add({
    startupId: startupIds[1], startupName: "MediSync",
    founderUids: ["seed_user_007","seed_user_005"],
    investorUid: "seed_user_009", investorName: "Fatima Al-Hassan", investorFirm: "Crescent Capital",
    slotDate: fmt(yesterday), slotTime: "14:00", duration: 45,
    roomUrl: "https://meet.jit.si/bewatu-medisync-demo-001",
    note: "Interested in the offline sync mechanism and the Kenya pilot.",
    status: "confirmed", outcome: null, reminderSent: true,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });

  // ── Demo availability ─────────────────────────────────────────────
  const in3 = new Date(now + 3*86400000);
  const in5 = new Date(now + 5*86400000);

  await db.collection("demo_availability").doc("seed_user_001").set({
    uid: "seed_user_001",
    slots: [
      { id: "slot_001", date: fmt(tomorrow), time: "10:00", duration: 30, booked: false },
      { id: "slot_002", date: fmt(tomorrow), time: "14:00", duration: 45, booked: false },
      { id: "slot_003", date: fmt(in3),      time: "09:30", duration: 30, booked: false },
      { id: "slot_004", date: fmt(in5),      time: "11:00", duration: 60, booked: false },
    ],
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    seeded: {
      industries: industries.length,
      users: users.length,
      challenges: challenges.length,
      startups: startups.length,
      offers: 2,
      demoSessions: 2,
    },
  });
}
