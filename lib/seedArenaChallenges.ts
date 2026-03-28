/**
 * scripts/seedArenaChallenges.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds 2 arena challenges per active industry.
 * Run once from the browser console when logged in as admin:
 *
 *   import { seedArenaChallenges } from './scripts/seedArenaChallenges';
 *   await seedArenaChallenges(fbUser.uid, fbUser.email);
 *
 * Or call from a one-time admin panel button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, addDoc, getDocs, query, where,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

interface ChallengeSeed {
  industryId:   string;
  industryName: string;
  title:        string;
  brief:        string;
  deliverable:  string;
  skills:       string[];
  prize:        string;
  daysOpen:     number;
  difficulty:   'entry' | 'mid' | 'senior';
}

const CHALLENGE_SEEDS: ChallengeSeed[] = [

  // ── Technology ───────────────────────────────────────────────────────────────
  {
    industryId:   'technology',
    industryName: 'Technology',
    title:        'Redesign the onboarding flow for a B2B SaaS product',
    brief:        'A mid-sized project management SaaS is losing 60% of trial users in the first 7 days. Redesign their onboarding experience to improve activation. You have access to anonymised drop-off data and user interview transcripts.',
    deliverable:  'A Figma prototype or written UX proposal (max 8 slides) covering: identified drop-off causes, proposed onboarding flow, and one key metric you would track.',
    skills:       ['UX Design', 'Product Thinking', 'User Research'],
    prize:        '$2,500 + interview with product team',
    daysOpen:     21,
    difficulty:   'mid',
  },
  {
    industryId:   'technology',
    industryName: 'Technology',
    title:        'Build a lightweight API rate limiter in under 100 lines',
    brief:        'Our platform currently has no rate limiting on public endpoints. Design and implement a token bucket rate limiter that can handle 10,000 req/min per user without a database dependency.',
    deliverable:  'Working code (any language) with tests, a brief explanation of your approach, and benchmark results.',
    skills:       ['Backend Engineering', 'System Design', 'Performance'],
    prize:        '$1,500 + code review session with senior engineer',
    daysOpen:     14,
    difficulty:   'senior',
  },

  // ── Finance ──────────────────────────────────────────────────────────────────
  {
    industryId:   'finance',
    industryName: 'Finance',
    title:        'Model the unit economics of a fintech lending product',
    brief:        'A consumer lending startup is preparing for Series A. Build a unit economics model that shows CAC, LTV, payback period, and cohort default rates under three scenarios (optimistic, base, stress).',
    deliverable:  'Excel or Google Sheets model with a 1-page written summary of key assumptions and risks.',
    skills:       ['Financial Modelling', 'Credit Analysis', 'Startup Finance'],
    prize:        '$3,000 + potential freelance engagement',
    daysOpen:     21,
    difficulty:   'senior',
  },
  {
    industryId:   'finance',
    industryName: 'Finance',
    title:        'Write a plain-English explainer on the 2026 Fed rate environment',
    brief:        'Our clients are non-finance professionals who own investment portfolios. Write a clear, jargon-free explainer (800–1200 words) on what the current Fed rate environment means for their bond and equity holdings.',
    deliverable:  'Written article, publishable quality, with 2-3 charts or diagrams.',
    skills:       ['Financial Writing', 'Macro Economics', 'Client Communication'],
    prize:        '$800 + byline on company newsletter (12k subscribers)',
    daysOpen:     10,
    difficulty:   'entry',
  },

  // ── Healthcare ───────────────────────────────────────────────────────────────
  {
    industryId:   'healthcare',
    industryName: 'Healthcare',
    title:        'Design a patient re-engagement flow for missed appointments',
    brief:        'A group of GP practices has a 23% missed appointment rate. Design a re-engagement flow using SMS, email, and app notifications that reduces no-shows while remaining empathetic to patients who may be avoiding care.',
    deliverable:  'Flow diagram + copy for each touchpoint + rationale for timing decisions.',
    skills:       ['Healthcare UX', 'Behavioural Design', 'Patient Communication'],
    prize:        '$2,000 + pilot opportunity with the practice group',
    daysOpen:     18,
    difficulty:   'mid',
  },
  {
    industryId:   'healthcare',
    industryName: 'Healthcare',
    title:        'Analyse NHS A&E wait time data and surface 3 actionable insights',
    brief:        'Using publicly available NHS A&E performance data (2023–2025), identify the 3 most actionable insights that a hospital operations team could act on within 90 days.',
    deliverable:  'Data analysis (any tool) + written brief of findings + visualisations.',
    skills:       ['Data Analysis', 'Healthcare Operations', 'Visualisation'],
    prize:        '$1,200 + presentation to ops leadership',
    daysOpen:     14,
    difficulty:   'mid',
  },

  // ── Media ────────────────────────────────────────────────────────────────────
  {
    industryId:   'media',
    industryName: 'Media',
    title:        'Pitch a documentary concept for a streaming platform',
    brief:        'A mid-tier streaming platform is commissioning short-form documentary content (20–40 mins) targeting 25–40 year olds. Pitch one documentary concept with a clear angle, potential subjects, and why it travels internationally.',
    deliverable:  'Written pitch document (max 4 pages): logline, synopsis, audience, comparable titles, and why now.',
    skills:       ['Storytelling', 'Content Strategy', 'Documentary Development'],
    prize:        '$1,500 + development meeting with commissioning editor',
    daysOpen:     21,
    difficulty:   'mid',
  },
  {
    industryId:   'media',
    industryName: 'Media',
    title:        'Write a viral-format LinkedIn post series on generational work differences',
    brief:        'Create a 5-post LinkedIn series exploring real tensions and common ground between Gen Z and Boomer professionals in the workplace. Each post should be under 300 words, provoke genuine discussion, and avoid clichés.',
    deliverable:  '5 complete LinkedIn posts, ready to publish, with a brief note on the strategic angle for each.',
    skills:       ['Copywriting', 'Social Media', 'Brand Voice'],
    prize:        '$600 + distribution to 50k+ LinkedIn following',
    daysOpen:     7,
    difficulty:   'entry',
  },

  // ── Energy ───────────────────────────────────────────────────────────────────
  {
    industryId:   'energy',
    industryName: 'Energy',
    title:        'Model a residential solar + battery ROI for three UK household types',
    brief:        'Build a clear ROI model for residential solar + battery storage for three household profiles: single occupant flat, 3-bed family home, and rural property. Factor in current tariffs, export rates, and available grants.',
    deliverable:  'Spreadsheet model + 2-page summary suitable for a non-technical homeowner.',
    skills:       ['Energy Modelling', 'Financial Analysis', 'Sustainability'],
    prize:        '$1,800 + feature in company content',
    daysOpen:     18,
    difficulty:   'mid',
  },
  {
    industryId:   'energy',
    industryName: 'Energy',
    title:        'Propose a community energy scheme for a 500-home estate',
    brief:        'A housing association wants to implement a community energy scheme across a 500-home mixed-tenure estate. Propose the most viable model (solar, heat pumps, or grid flexibility) with rough costings and a governance structure.',
    deliverable:  'Written proposal (max 6 pages) covering technology choice, cost model, governance, and implementation phasing.',
    skills:       ['Energy Policy', 'Project Management', 'Community Engagement'],
    prize:        '$2,500 + potential project involvement',
    daysOpen:     28,
    difficulty:   'senior',
  },

  // ── Retail ───────────────────────────────────────────────────────────────────
  {
    industryId:   'retail',
    industryName: 'Retail',
    title:        'Diagnose and fix a failing e-commerce product page',
    brief:        'A DTC skincare brand has a hero product with 8,000 monthly visitors but a 0.9% conversion rate (industry average is 3.2%). You have access to heatmaps, session recordings, and customer reviews. Find the problem and propose the fix.',
    deliverable:  'Written diagnosis (root causes) + redesign proposal with wireframes or annotated screenshots.',
    skills:       ['CRO', 'E-commerce', 'UX', 'Copywriting'],
    prize:        '$2,000 + implementation budget if selected',
    daysOpen:     14,
    difficulty:   'mid',
  },
  {
    industryId:   'retail',
    industryName: 'Retail',
    title:        'Build a markdown optimisation strategy for end-of-season clearance',
    brief:        'A fashion retailer is sitting on £2.3M of end-of-season stock with 8 weeks before storage costs exceed margin. Build a markdown strategy that maximises revenue recovery while protecting brand positioning.',
    deliverable:  'Strategy document with pricing tiers, timing recommendations, channel priorities, and projected recovery scenarios.',
    skills:       ['Retail Strategy', 'Pricing', 'Inventory Management'],
    prize:        '$2,200 + ongoing consultancy conversation',
    daysOpen:     10,
    difficulty:   'senior',
  },
];

// ── Sponsor data for each industry ──────────────────────────────────────────

const SPONSOR_DATA: Record<string, {
  name: string;
  tagline: string;
  about: string;
  logoUrl: string;
  website: string;
  bannerColor: string;
}> = {
  technology:  {
    name:        'Meridian Labs',
    tagline:     'Where builders become founders',
    about:       'Meridian Labs is an early-stage venture studio backing exceptional technical founders across Europe. We invest $250k–$2M at pre-seed and bring operational support from day one.',
    logoUrl:     '',
    website:     'https://meridian.io',
    bannerColor: '#1a4a3a',
  },
  finance:     {
    name:        'Apex Capital Partners',
    tagline:     'Backing the next generation of financial talent',
    about:       'Apex Capital Partners is a $4.2B alternative asset manager with a dedicated emerging talent programme. Top Arena performers are invited to our annual Analyst Day.',
    logoUrl:     '',
    website:     'https://apexcp.com',
    bannerColor: '#1e3a5f',
  },
  healthcare:  {
    name:        'Vantage Health Ventures',
    tagline:     'Improving outcomes through better talent',
    about:       'Vantage backs health-tech and health-services companies across the UK and EU. We partner with the BeWatu Arena to find operators who understand both the clinical and commercial sides of healthcare.',
    logoUrl:     '',
    website:     'https://vantagehealth.co',
    bannerColor: '#065f46',
  },
  media:       {
    name:        'Signal & Noise Studio',
    tagline:     'Stories that move people',
    about:       'Signal & Noise is an independent content studio producing documentary, branded, and editorial content for global platforms. We hire directly from the BeWatu Arena.',
    logoUrl:     '',
    website:     'https://signalandnoise.co',
    bannerColor: '#4c1d95',
  },
  energy:      {
    name:        'Solara Infrastructure',
    tagline:     'Building the clean energy economy',
    about:       'Solara develops and finances renewable energy infrastructure across the UK and continental Europe. We\'re actively hiring across finance, engineering, and policy roles.',
    logoUrl:     '',
    website:     'https://solara.energy',
    bannerColor: '#92400e',
  },
  retail:      {
    name:        'Foundry Commerce Group',
    tagline:     'The operating partner for DTC brands',
    about:       'Foundry acquires and scales direct-to-consumer brands across beauty, wellness, and lifestyle. Arena winners get direct access to our brand portfolio for project work and full-time roles.',
    logoUrl:     '',
    website:     'https://foundrycommerce.co',
    bannerColor: '#881337',
  },
};

// ── Main seed function ────────────────────────────────────────────────────────

export async function seedArenaChallenges(
  adminUid:   string,
  adminEmail: string
): Promise<void> {
  console.log('🌱 Seeding arena challenges...');

  // Fetch active industries
  const industriesSnap = await getDocs(
    query(collection(db, 'arena_industries'), where('isActive', '==', true))
  );

  if (industriesSnap.empty) {
    console.warn('⚠️  No active arena industries found. Run seedArenaIndustries first.');
    return;
  }

  let challengesCreated = 0;
  let sponsorsUpdated   = 0;

  for (const industryDoc of industriesSnap.docs) {
    const industry     = industryDoc.data();
    const industryKey  = industry.slug ?? industry.name?.toLowerCase().replace(/\s+/g, '');
    const industryChallenges = CHALLENGE_SEEDS.filter(
      c => c.industryId === industryKey || c.industryName === industry.name
    );

    if (industryChallenges.length === 0) {
      console.log(`  ⏭  No seed challenges for industry: ${industry.name}`);
      continue;
    }

    // Check how many challenges already exist for this industry
    const existingSnap = await getDocs(
      query(
        collection(db, 'arena_challenges'),
        where('arenaIndustryId', '==', industryDoc.id),
        where('verificationStatus', '==', 'live')
      )
    );

    if (existingSnap.size >= 2) {
      console.log(`  ✓  ${industry.name} already has ${existingSnap.size} live challenges — skipping`);
      continue;
    }

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 21);

    for (const seed of industryChallenges) {
      const challengeDeadline = new Date();
      challengeDeadline.setDate(challengeDeadline.getDate() + seed.daysOpen);

      await addDoc(collection(db, 'arena_challenges'), {
        // Identity
        title:              seed.title,
        brief:              seed.brief,
        deliverable:        seed.deliverable,
        skills:             seed.skills,
        prize:              seed.prize,
        difficulty:         seed.difficulty,

        // Arena linkage
        arenaIndustryId:    industryDoc.id,
        arenaIndustry:      industry.name,
        arenaSlug:          industryKey,

        // Poster (platform-created)
        recruiterId:        adminUid,
        recruiterEmail:     adminEmail,
        companyId:          null,
        isVerifiedPoster:   true,
        isRegulatedPoster:  false,

        // Status
        verificationStatus: 'live',
        liveDate:           serverTimestamp(),
        deadline:           Timestamp.fromDate(challengeDeadline),
        closedAt:           null,

        // Engagement
        viewCount:          0,
        submissionCount:    0,
        shortlistedUids:    [],
        winnerId:           null,

        // Stripe (platform challenges are free)
        stripePaymentIntentId: null,
        stripeSessionId:       null,

        createdAt:          serverTimestamp(),
        updatedAt:          serverTimestamp(),
      });

      challengesCreated++;
      console.log(`  ✅ Created: "${seed.title}" (${industry.name})`);
    }
  }

  console.log(`\n✅ Done — ${challengesCreated} challenges created`);
}
