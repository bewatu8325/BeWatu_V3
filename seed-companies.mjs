/**
 * seed-companies.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time script to seed BeWatu Firestore with companies from CoSentiment.
 *
 * Usage:
 *   node seed-companies.mjs
 *
 * Requirements:
 *   - Run from the root of BeWatu_V3
 *   - Firebase service account key at ./service-account.json
 *     (Download from Firebase Console → Project Settings → Service Accounts)
 *   - Set COSENTIMENT_API_KEY env var or edit the key below
 *
 * What it does:
 *   1. Fetches company list from CoSentiment API
 *   2. Writes each company to Firestore `companies` collection
 *   3. Skips companies that already exist (matched by domain)
 *   4. Marks all seeded companies as claimed: false, source: 'cosentiment'
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────
const COSENTIMENT_API   = 'https://www.cosentiment.com/api/bewatu';
const COSENTIMENT_KEY   = process.env.COSENTIMENT_API_KEY ?? 'bewatu-bridge-2026';
const SERVICE_ACCOUNT   = './service-account.json';
const DRY_RUN           = process.argv.includes('--dry-run'); // pass --dry-run to preview

// ── Init Firebase Admin ───────────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Fetch companies from CoSentiment ─────────────────────────────────────────
async function fetchCoSentimentCompanies() {
  const res = await fetch(`${COSENTIMENT_API}/companies`, {
    headers: {
      'Content-Type': 'application/json',
      'x-bewatu-api-key': COSENTIMENT_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`CoSentiment API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // Expected: { companies: [{ name, domain, website, ticker, sector, logoUrl }] }
  return data.companies ?? [];
}

// ── Derive domain from website ────────────────────────────────────────────────
function extractDomain(website) {
  if (!website) return '';
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 BeWatu Company Seeder');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log('');

  // 1. Fetch from CoSentiment
  console.log('📡 Fetching companies from CoSentiment...');
  let companies;
  try {
    companies = await fetchCoSentimentCompanies();
    console.log(`   Found ${companies.length} companies\n`);
  } catch (err) {
    console.error('❌ Failed to fetch from CoSentiment:', err.message);
    process.exit(1);
  }

  // 2. Get existing companies from Firestore (to avoid duplicates)
  console.log('🔍 Checking existing Firestore companies...');
  const existingSnap = await db.collection('companies').get();
  const existingDomains = new Set(
    existingSnap.docs.map(d => d.data().domain).filter(Boolean)
  );
  console.log(`   ${existingDomains.size} companies already in Firestore\n`);

  // 3. Seed new companies
  let added = 0;
  let skipped = 0;
  let errors = 0;

  const batch = db.batch();
  let batchCount = 0;

  for (const company of companies) {
    const domain = company.domain ?? extractDomain(company.website);

    if (!domain) {
      console.log(`⚠️  Skipping ${company.name} — no domain`);
      skipped++;
      continue;
    }

    if (existingDomains.has(domain)) {
      console.log(`⏭️  Skipping ${company.name} (${domain}) — already exists`);
      skipped++;
      continue;
    }

    const website = company.website
      ? (company.website.startsWith('http') ? company.website : `https://${company.website}`)
      : `https://${domain}`;

    const doc = {
      name:               company.name ?? domain,
      description:        company.description ?? '',
      industry:           company.sector ?? company.industry ?? '',
      logoUrl:            company.logoUrl ?? '',
      website,
      domain,
      ticker:             company.ticker ?? '',
      source:             'cosentiment',
      claimed:            false,
      verified:           false,
      adminUid:           null,
      verifiedRecruiters: [],
      verificationStatus: 'unverified',
      numericId:          Date.now() + added,
      createdAt:          new Date().toISOString(),
      updatedAt:          new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`✅ Would add: ${company.name} (${domain})`);
    } else {
      const ref = db.collection('companies').doc();
      batch.set(ref, doc);
      batchCount++;
      console.log(`✅ Adding: ${company.name} (${domain})`);
    }

    added++;
    existingDomains.add(domain);

    // Firestore batch limit is 500
    if (batchCount === 499) {
      await batch.commit();
      console.log('   Committed batch of 499');
      batchCount = 0;
    }
  }

  // Commit remaining
  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  console.log('');
  console.log('─────────────────────────────────');
  console.log(`✅ Added:   ${added}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors:  ${errors}`);
  console.log('─────────────────────────────────');
  if (DRY_RUN) console.log('DRY RUN complete — no data was written');
  else console.log('Seeding complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
