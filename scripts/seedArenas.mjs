/**
 * scripts/seedArenas.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Run locally with: node scripts/seedArenas.mjs
 * Requires: serviceAccountKey.json in project root
 * ─────────────────────────────────────────────────────────────────────────────
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const SEEDS = [
  { slug: 'payments',    title: 'Redesign the checkout abandonment flow for a fintech app',             difficulty: 'mid',    days: 21, prize: '$2,500', skills: ['UX Design', 'Product Thinking', 'Payments'],              brief: 'A consumer payments app loses 58% of users at checkout. Analyse drop-off points and redesign the flow.',                                                            deliverable: 'UX proposal (max 8 slides): root causes, redesigned flow, one north-star metric.' },
  { slug: 'payments',    title: 'Build a fraud detection heuristic for card-not-present transactions',  difficulty: 'senior', days: 18, prize: '$3,000', skills: ['Risk Engineering', 'Payments', 'Data Science'],            brief: 'Design a rule-based fraud scoring system that reduces false positives without increasing chargeback rates.',                                                          deliverable: 'Written design doc + pseudo-code or working prototype with test cases.' },
  { slug: 'banking',     title: 'Model the unit economics of a neobank current account',                difficulty: 'senior', days: 21, prize: '$3,000', skills: ['Financial Modelling', 'Banking', 'Startup Finance'],       brief: 'A digital bank preparing for Series B needs a unit economics model showing CAC, LTV, and payback period.',                                                             deliverable: 'Excel or Google Sheets model + 1-page written summary.' },
  { slug: 'banking',     title: 'Write a plain-English guide to open banking for SME owners',           difficulty: 'entry',  days: 10, prize: '$800',   skills: ['Financial Writing', 'Open Banking', 'SME Finance'],        brief: 'Create a clear, jargon-free guide explaining what open banking means for small business owners.',                                                                    deliverable: 'Written article, publishable quality, with 2–3 diagrams.' },
  { slug: 'education',   title: 'Design a student re-engagement flow for an online learning platform',  difficulty: 'mid',    days: 18, prize: '$2,000', skills: ['EdTech UX', 'Behavioural Design', 'Learning Science'],     brief: 'An edtech platform has a 34% course completion rate. Design a re-engagement flow that increases completions.',                                                         deliverable: 'Flow diagram + copy for each touchpoint + rationale for timing decisions.' },
  { slug: 'education',   title: 'Pitch a micro-credential framework for vocational skills',             difficulty: 'senior', days: 21, prize: '$1,800', skills: ['Education Policy', 'Curriculum Design', 'Workforce'],      brief: 'Design a stackable micro-credential framework for vocational skills in the UK.',                                                                                       deliverable: 'Written proposal (max 5 pages): framework design, sector rationale, employer adoption strategy.' },
  { slug: 'environment', title: 'Model the carbon payback period for a community solar installation',   difficulty: 'mid',    days: 18, prize: '$1,800', skills: ['Carbon Accounting', 'Energy Modelling', 'Sustainability'],  brief: 'Calculate the carbon payback period for a 500kW community solar installation in the UK.',                                                                             deliverable: 'Spreadsheet model + 2-page summary for a non-technical audience.' },
  { slug: 'environment', title: 'Propose a circular economy model for fast fashion returns',            difficulty: 'senior', days: 28, prize: '$2,500', skills: ['Circular Economy', 'Supply Chain', 'Sustainability'],      brief: 'UK fashion retailers process 300M+ returns annually. Propose a model that makes reverse logistics profitable.',                                                        deliverable: 'Written proposal (max 6 pages): business model, logistics, financial viability, pilot plan.' },
  { slug: 'healthcare',  title: 'Design a patient re-engagement flow for missed appointments',          difficulty: 'mid',    days: 18, prize: '$2,000', skills: ['Healthcare UX', 'Behavioural Design', 'Patient Comms'],    brief: 'A group of GP practices has a 23% missed appointment rate. Design a re-engagement flow using SMS, email, and notifications.',                                           deliverable: 'Flow diagram + copy for each touchpoint + rationale.' },
  { slug: 'healthcare',  title: 'Analyse NHS A&E wait time data and surface 3 actionable insights',     difficulty: 'mid',    days: 14, prize: '$1,200', skills: ['Data Analysis', 'Healthcare Operations', 'Visualisation'],  brief: 'Using publicly available NHS A&E data (2023–2025), identify 3 actionable insights a hospital ops team could act on within 90 days.',                                  deliverable: 'Data analysis + written brief of findings + visualisations.' },
  { slug: 'industrial',  title: 'Design a predictive maintenance model for conveyor belt systems',      difficulty: 'senior', days: 21, prize: '$3,500', skills: ['Industrial IoT', 'Predictive Maintenance', 'Engineering'],  brief: 'A manufacturer loses £800K annually to unplanned conveyor downtime. Design a sensor-based predictive maintenance model.',                                             deliverable: 'Technical design doc: sensor selection, data pipeline, model approach, estimated ROI.' },
  { slug: 'industrial',  title: 'Propose an energy efficiency audit framework for a mid-sized factory', difficulty: 'mid',    days: 14, prize: '$1,500', skills: ['Energy Management', 'Manufacturing', 'Sustainability'],    brief: 'Design a practical energy efficiency audit framework for a mid-sized UK manufacturing facility completable in 2 days.',                                               deliverable: 'Audit framework document + checklist + example findings template.' },
  { slug: 'insurance',   title: 'Design a parametric insurance product for UK small businesses',        difficulty: 'senior', days: 21, prize: '$3,000', skills: ['Insurance Product Design', 'Risk Modelling', 'InsurTech'],  brief: 'Design a parametric insurance product that pays out automatically based on objective triggers relevant to UK SMEs.',                                                 deliverable: 'Product brief (max 6 pages): trigger design, pricing rationale, distribution, regulatory considerations.' },
  { slug: 'insurance',   title: 'Write a plain-English explainer on cyber insurance for SMEs',          difficulty: 'entry',  days: 10, prize: '$800',   skills: ['Insurance Writing', 'Cyber Risk', 'SME Finance'],          brief: 'Write a clear guide (800–1,200 words) explaining what cyber insurance covers and how to choose a policy.',                                                             deliverable: 'Written article, publishable quality, with a comparison table of coverage types.' },
  { slug: 'regtech',     title: 'Design a KYC onboarding flow that reduces drop-off by 30%',            difficulty: 'mid',    days: 18, prize: '$2,500', skills: ['RegTech UX', 'KYC/AML', 'Compliance Design'],              brief: 'A UK fintech KYC onboarding has 67% drop-off. Redesign the flow to meet FCA requirements while improving UX.',                                                          deliverable: 'UX proposal: root causes, redesigned flow, compliance mapping, success metrics.' },
  { slug: 'regtech',     title: 'Map the regulatory reporting obligations for a UK payment institution', difficulty: 'senior', days: 14, prize: '$2,000', skills: ['Regulatory Compliance', 'Payments Regulation', 'Policy'],  brief: 'Create a comprehensive regulatory reporting map for a UK-authorised payment institution covering FCA, PRA, and HMRC.',                                               deliverable: 'Structured report or spreadsheet + 1-page executive summary.' },
  { slug: 'retail',      title: 'Diagnose and fix a failing e-commerce product page',                   difficulty: 'mid',    days: 14, prize: '$2,000', skills: ['CRO', 'E-commerce', 'UX', 'Copywriting'],                  brief: 'A DTC skincare brand has 8,000 monthly visitors but 0.9% conversion (industry average 3.2%). Find the problem and fix it.',                                             deliverable: 'Written diagnosis + redesign proposal with wireframes or annotated screenshots.' },
  { slug: 'retail',      title: 'Build a markdown optimisation strategy for end-of-season clearance',   difficulty: 'senior', days: 10, prize: '$2,200', skills: ['Retail Strategy', 'Pricing', 'Inventory Management'],      brief: 'A fashion retailer has £2.3M of end-of-season stock with 8 weeks before storage costs exceed margin.',                                                                deliverable: 'Strategy document: pricing tiers, timing, channel priorities, projected recovery scenarios.' },
  { slug: 'techdata',    title: 'Design a data quality framework for a B2B SaaS data pipeline',         difficulty: 'senior', days: 21, prize: '$3,000', skills: ['Data Engineering', 'Data Quality', 'Analytics'],           brief: 'A B2B SaaS company is losing enterprise clients due to data quality issues in its analytics pipeline.',                                                               deliverable: 'Technical design doc: architecture, tooling recommendations, SLA definitions, roadmap.' },
  { slug: 'techdata',    title: 'Write a plain-English guide to data residency for UK startups',         difficulty: 'entry',  days: 10, prize: '$900',   skills: ['Data Governance', 'GDPR', 'Technical Writing'],            brief: 'Post-Brexit data residency requirements confuse most UK startup founders. Write a clear, practical guide (1,000–1,500 words).',                                        deliverable: 'Written guide with a decision tree for common scenarios.' },
];

async function seed() {
  console.log('🌱 Seeding arena challenges via Admin SDK…\n');

  const industriesSnap = await db.collection('arena_industries').get();
  console.log(`Found ${industriesSnap.size} industries\n`);

  let created = 0;

  for (const industryDoc of industriesSnap.docs) {
    const industry = industryDoc.data();
    const id       = industryDoc.id.toLowerCase();
    const name     = industry.name ?? id;

    const seeds = SEEDS.filter(s => s.slug === id);

    if (seeds.length === 0) {
      console.log(`⏭  No seeds for: ${id}`);
      continue;
    }

    // Check existing
    const existing = await db.collection('arena_challenges')
      .where('arenaIndustryId', '==', industryDoc.id)
      .get();

    if (existing.size >= 2) {
      console.log(`✓  ${name} already has ${existing.size} challenges — skipping`);
      continue;
    }

    for (const seed of seeds) {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + seed.days);

      await db.collection('arena_challenges').add({
        // Core
        title:                 seed.title,
        description:           seed.brief,
        fullDescription:       seed.deliverable,
        brief:                 seed.brief,
        deliverable:           seed.deliverable,
        requirements:          [],
        skills:                seed.skills,
        // Prize
        prize:                 seed.prize,
        prizeAmount:           parseInt(seed.prize.replace(/[^0-9]/g, '')) || 1000,
        prizeType:             'cash',
        prizeDescription:      seed.prize,
        prizeEscrowed:         false,
        stripePaymentIntentId: null,
        // Classification
        difficulty:            seed.difficulty === 'entry' ? 'beginner' : seed.difficulty === 'mid' ? 'intermediate' : 'advanced',
        tier:                  'standard',
        // Company
        companyId:             'bewatu',
        companyName:           'BeWatu',
        companyLogoUrl:        '',
        // Arena
        arenaIndustryId:       industryDoc.id,
        arenaIndustry:         id,
        arenaSlug:             id,
        // Poster
        recruiterId:           'admin',
        recruiterEmail:        'admin@bewatu.com',
        isVerifiedPoster:      true,
        isRegulatedPoster:     false,
        // Status
        verificationStatus:    'live',
        submissionsAnonymised: true,
        liveDate:              admin.firestore.Timestamp.now(),
        deadline:              admin.firestore.Timestamp.fromDate(deadline),
        closedAt:              null,
        // Engagement
        viewCount:             0,
        submissionCount:       0,
        shortlistedUids:       [],
        winnerId:              null,
        createdAt:             admin.firestore.Timestamp.now(),
        updatedAt:             admin.firestore.Timestamp.now(),
      });

      created++;
      console.log(`  ✅ ${name}: "${seed.title}"`);
    }
  }

  console.log(`\n🎉 Done — ${created} challenges created`);
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
