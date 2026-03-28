/**
 * lib/seedArenaChallenges.ts
 * Run once via admin seed panel to populate arena challenges.
 * Matches your actual arena slugs: payments, banking, education,
 * environment, healthcare, industrial, insurance, regtech, retail, techdata
 */

import {
  collection, addDoc, getDocs, query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

interface Seed {
  slug:        string;
  title:       string;
  brief:       string;
  deliverable: string;
  skills:      string[];
  prize:       string;
  days:        number;
  difficulty:  'entry' | 'mid' | 'senior';
}

const SEEDS: Seed[] = [
  // payments
  { slug: 'payments', title: 'Redesign the checkout abandonment flow for a fintech app', brief: 'A consumer payments app loses 58% of users at checkout. Analyse drop-off points and redesign the flow to improve conversion.', deliverable: 'UX proposal (max 8 slides): root causes, redesigned flow, one north-star metric.', skills: ['UX Design', 'Product Thinking', 'Payments'], prize: '$2,500 + interview with product team', days: 21, difficulty: 'mid' },
  { slug: 'payments', title: 'Build a fraud detection heuristic for card-not-present transactions', brief: 'Design a rule-based fraud scoring system for e-commerce card-not-present transactions that reduces false positives without increasing chargeback rates.', deliverable: 'Written design doc + pseudo-code or working prototype with test cases.', skills: ['Risk Engineering', 'Payments', 'Data Science'], prize: '$3,000 + code review with engineering team', days: 18, difficulty: 'senior' },

  // banking
  { slug: 'banking', title: 'Model the unit economics of a neobank current account', brief: 'A digital bank preparing for Series B needs a unit economics model showing CAC, LTV, and payback period under three scenarios.', deliverable: 'Excel or Google Sheets model + 1-page written summary.', skills: ['Financial Modelling', 'Banking', 'Startup Finance'], prize: '$3,000 + potential freelance engagement', days: 21, difficulty: 'senior' },
  { slug: 'banking', title: 'Write a plain-English guide to open banking for SME owners', brief: 'Create a clear, jargon-free guide (800–1,200 words) explaining what open banking means for small business owners.', deliverable: 'Written article, publishable quality, with 2–3 diagrams.', skills: ['Financial Writing', 'Open Banking', 'SME Finance'], prize: '$800 + byline on company newsletter', days: 10, difficulty: 'entry' },

  // education
  { slug: 'education', title: 'Design a student re-engagement flow for an online learning platform', brief: 'An edtech platform has a 34% course completion rate. Design a re-engagement flow that increases completions without feeling intrusive.', deliverable: 'Flow diagram + copy for each touchpoint + rationale for timing decisions.', skills: ['EdTech UX', 'Behavioural Design', 'Learning Science'], prize: '$2,000 + pilot opportunity', days: 18, difficulty: 'mid' },
  { slug: 'education', title: 'Pitch a micro-credential framework for vocational skills', brief: 'Design a stackable micro-credential framework for vocational skills in the UK that bridges the gap between employer needs and current qualifications.', deliverable: 'Written proposal (max 5 pages): framework design, sector rationale, employer adoption strategy.', skills: ['Education Policy', 'Curriculum Design', 'Workforce Development'], prize: '$1,800 + presentation to advisory board', days: 21, difficulty: 'senior' },

  // environment
  { slug: 'environment', title: 'Model the carbon payback period for a community solar installation', brief: 'Calculate the carbon payback period for a 500kW community solar installation in the UK, accounting for manufacturing emissions and grid carbon intensity.', deliverable: 'Spreadsheet model + 2-page summary suitable for a non-technical audience.', skills: ['Carbon Accounting', 'Energy Modelling', 'Sustainability'], prize: '$1,800 + feature in company content', days: 18, difficulty: 'mid' },
  { slug: 'environment', title: 'Propose a circular economy model for fast fashion returns', brief: 'UK fashion retailers process 300M+ returns annually. Propose a circular economy model that makes reverse logistics profitable while reducing waste.', deliverable: 'Written proposal (max 6 pages): business model, logistics design, financial viability, pilot plan.', skills: ['Circular Economy', 'Supply Chain', 'Sustainability Strategy'], prize: '$2,500 + potential project involvement', days: 28, difficulty: 'senior' },

  // healthcare
  { slug: 'healthcare', title: 'Design a patient re-engagement flow for missed appointments', brief: 'A group of GP practices has a 23% missed appointment rate. Design a re-engagement flow using SMS, email, and app notifications.', deliverable: 'Flow diagram + copy for each touchpoint + rationale.', skills: ['Healthcare UX', 'Behavioural Design', 'Patient Communication'], prize: '$2,000 + pilot opportunity', days: 18, difficulty: 'mid' },
  { slug: 'healthcare', title: 'Analyse NHS A&E wait time data and surface 3 actionable insights', brief: 'Using publicly available NHS A&E performance data (2023–2025), identify the 3 most actionable insights a hospital ops team could act on within 90 days.', deliverable: 'Data analysis + written brief of findings + visualisations.', skills: ['Data Analysis', 'Healthcare Operations', 'Visualisation'], prize: '$1,200 + presentation to ops leadership', days: 14, difficulty: 'mid' },

  // industrial
  { slug: 'industrial', title: 'Design a predictive maintenance model for conveyor belt systems', brief: 'A manufacturer loses £800K annually to unplanned conveyor downtime. Design a sensor-based predictive maintenance model.', deliverable: 'Technical design doc: sensor selection, data pipeline, model approach, estimated ROI.', skills: ['Industrial IoT', 'Predictive Maintenance', 'Engineering'], prize: '$3,500 + potential pilot engagement', days: 21, difficulty: 'senior' },
  { slug: 'industrial', title: 'Propose an energy efficiency audit framework for a mid-sized factory', brief: 'Design a practical energy efficiency audit framework for a mid-sized UK manufacturing facility that can be completed in 2 days.', deliverable: 'Audit framework document + checklist + example findings template.', skills: ['Energy Management', 'Manufacturing', 'Sustainability'], prize: '$1,500 + use in client engagements', days: 14, difficulty: 'mid' },

  // insurance
  { slug: 'insurance', title: 'Design a parametric insurance product for UK small businesses', brief: 'Traditional business interruption insurance failed many SMEs during COVID. Design a parametric insurance product that pays out automatically based on objective triggers.', deliverable: 'Product brief (max 6 pages): trigger design, pricing rationale, distribution strategy, regulatory considerations.', skills: ['Insurance Product Design', 'Risk Modelling', 'InsurTech'], prize: '$3,000 + development meeting with product team', days: 21, difficulty: 'senior' },
  { slug: 'insurance', title: 'Write a plain-English explainer on cyber insurance for SMEs', brief: 'Cyber insurance is the fastest-growing category but least understood by SME owners. Write a clear guide (800–1,200 words) explaining what it covers and how to choose a policy.', deliverable: 'Written article, publishable quality, with a comparison table of coverage types.', skills: ['Insurance Writing', 'Cyber Risk', 'SME Finance'], prize: '$800 + byline on company platform', days: 10, difficulty: 'entry' },

  // regtech
  { slug: 'regtech', title: 'Design a KYC onboarding flow that reduces drop-off by 30%', brief: 'A UK fintech KYC onboarding has 67% drop-off. Redesign the flow to meet FCA requirements while dramatically improving UX.', deliverable: 'UX proposal: root causes, redesigned flow, compliance mapping, success metrics.', skills: ['RegTech UX', 'KYC/AML', 'Compliance Design'], prize: '$2,500 + interview with product team', days: 18, difficulty: 'mid' },
  { slug: 'regtech', title: 'Map the regulatory reporting obligations for a UK payment institution', brief: 'Create a comprehensive regulatory reporting map for a UK-authorised payment institution covering FCA, PRA, and HMRC obligations.', deliverable: 'Structured report or spreadsheet with all obligations mapped + 1-page executive summary.', skills: ['Regulatory Compliance', 'Payments Regulation', 'Policy'], prize: '$2,000 + use as internal reference material', days: 14, difficulty: 'senior' },

  // retail
  { slug: 'retail', title: 'Diagnose and fix a failing e-commerce product page', brief: 'A DTC skincare brand has 8,000 monthly visitors but 0.9% conversion (industry average 3.2%). Find the problem and fix it.', deliverable: 'Written diagnosis + redesign proposal with wireframes or annotated screenshots.', skills: ['CRO', 'E-commerce', 'UX', 'Copywriting'], prize: '$2,000 + implementation budget if selected', days: 14, difficulty: 'mid' },
  { slug: 'retail', title: 'Build a markdown optimisation strategy for end-of-season clearance', brief: 'A fashion retailer has £2.3M of end-of-season stock with 8 weeks before storage costs exceed margin.', deliverable: 'Strategy document: pricing tiers, timing, channel priorities, projected recovery scenarios.', skills: ['Retail Strategy', 'Pricing', 'Inventory Management'], prize: '$2,200 + ongoing consultancy conversation', days: 10, difficulty: 'senior' },

  // techdata
  { slug: 'techdata', title: 'Design a data quality framework for a B2B SaaS data pipeline', brief: 'A B2B SaaS company is losing enterprise clients due to data quality issues. Design a framework covering detection, alerting, remediation, and governance.', deliverable: 'Technical design doc: framework architecture, tooling recommendations, SLA definitions, implementation roadmap.', skills: ['Data Engineering', 'Data Quality', 'Analytics'], prize: '$3,000 + potential implementation engagement', days: 21, difficulty: 'senior' },
  { slug: 'techdata', title: 'Write a plain-English guide to data residency for UK startups', brief: 'Post-Brexit data residency requirements confuse most UK startup founders. Write a clear, practical guide (1,000–1,500 words).', deliverable: 'Written guide, publishable quality, with a decision tree for common scenarios.', skills: ['Data Governance', 'GDPR', 'Technical Writing'], prize: '$900 + byline on company platform', days: 10, difficulty: 'entry' },
];

export async function seedArenaChallenges(
  adminUid:   string,
  adminEmail: string
): Promise<void> {
  console.log('🌱 Seeding arena challenges…');
  console.log('Admin UID:', adminUid);

  // Fetch ALL active industries — log what we find
  const industriesSnap = await getDocs(
    query(collection(db, 'arena_industries'), where('isActive', '==', true))
  );

  console.log(`Found ${industriesSnap.size} active industries`);

  if (industriesSnap.empty) {
    console.warn('⚠️  No active arena industries found.');
    return;
  }

  // Log all industry slugs/ids so we can see what we're matching against
  industriesSnap.docs.forEach(d => {
    const data = d.data();
    console.log(`  Industry: id=${d.id} name=${data.name} slug=${data.slug} isActive=${data.isActive}`);
  });

  let created = 0;

  for (const industryDoc of industriesSnap.docs) {
    const industry = industryDoc.data();

    // Try multiple ways to match slug
    const id   = industryDoc.id.toLowerCase();
    const slug = (industry.slug ?? '').toLowerCase();
    const name = (industry.name ?? '').toLowerCase().replace(/\s+/g, '');

    const seeds = SEEDS.filter(s =>
      s.slug === id ||
      s.slug === slug ||
      s.slug === name ||
      id.includes(s.slug) ||
      slug.includes(s.slug)
    );

    console.log(`  ${industry.name ?? id}: matched ${seeds.length} seeds`);

    if (seeds.length === 0) continue;

    // Check existing
    const existingSnap = await getDocs(
      query(collection(db, 'arena_challenges'), where('arenaIndustryId', '==', industryDoc.id))
    );

    if (existingSnap.size >= 2) {
      console.log(`  ✓ Already has ${existingSnap.size} challenges — skipping`);
      continue;
    }

    for (const seed of seeds) {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + seed.days);

      try {
        const ref = await addDoc(collection(db, 'arena_challenges'), {
          title:              seed.title,
          brief:              seed.brief,
          deliverable:        seed.deliverable,
          skills:             seed.skills,
          prize:              seed.prize,
          difficulty:         seed.difficulty,
          arenaIndustryId:    industryDoc.id,
          arenaIndustry:      industry.name ?? industryDoc.id,
          arenaSlug:          id,
          recruiterId:        adminUid,
          recruiterEmail:     adminEmail,
          isVerifiedPoster:   true,
          verificationStatus: 'live',
          liveDate:           serverTimestamp(),
          deadline:           Timestamp.fromDate(deadline),
          viewCount:          0,
          submissionCount:    0,
          shortlistedUids:    [],
          winnerId:           null,
          createdAt:          serverTimestamp(),
          updatedAt:          serverTimestamp(),
        });
        created++;
        console.log(`  ✅ Created: ${ref.id} — "${seed.title}"`);
      } catch (err: any) {
        console.error(`  ❌ Failed to create "${seed.title}":`, err.message);
      }
    }
  }

  console.log(`\n✅ Done — ${created} challenges created`);
}
