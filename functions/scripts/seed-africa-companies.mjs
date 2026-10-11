/**
 * scripts/seed-africa-companies.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds the real `companies` collection (lib/firestoreService.ts's
 * fetchCompanies/fetchCompanyById, types.ts's Company interface) with a
 * curated, verified list of notable African companies -- sourced via web
 * research (name/domain/industry/country cross-checked against recent
 * coverage, not guessed), not from a bulk API (none of the three evaluated
 * sources -- Fylings, VC4Africa, StartupList Africa -- currently offer
 * self-serve bulk discovery; Fylings in particular is lookup/verification
 * only, see its OpenAPI spec).
 *
 * Writes source: 'africa-seed' (types.ts's Company.source union), distinct
 * from the existing 'cosentiment' seed (global public companies) and 'user'
 * (self-submitted). Every seeded company starts unclaimed/unverified --
 * exactly the state the existing claim flow (claimCompany in
 * firestoreService.ts) and admin verification flow (adminVerifyCompany)
 * already expect a newly-discovered company to be in.
 *
 * Auth: standard Application Default Credentials -- either run
 * `gcloud auth application-default login` once, or point
 * GOOGLE_APPLICATION_CREDENTIALS at a service account key. Admin SDK
 * writes bypass firestore.rules by design (same as any Admin SDK script),
 * so this intentionally does NOT go through the client-side
 * createCompanyWithAdmin() path; it's a one-time data seed, not a user
 * action.
 *
 * Usage (run from functions/, so it resolves firebase-admin from
 * functions/node_modules -- this script writes to the root `companies`
 * collection, not anything functions-specific; it just lives here to reuse
 * the dependency):
 *   gcloud auth application-default login     # one-time, if not already done
 *   node scripts/seed-africa-companies.mjs --project bewatu-dev            # dry run
 *   node scripts/seed-africa-companies.mjs --project bewatu-dev --write    # write
 *   node scripts/seed-africa-companies.mjs --project bewatu-2d04e --write  # production
 * ─────────────────────────────────────────────────────────────────────────────
 */

import admin from "firebase-admin";

const args = process.argv.slice(2);
const WRITE_MODE = args.includes("--write");
const projectIdx = args.indexOf("--project");
const PROJECT_ID = projectIdx >= 0 ? args[projectIdx + 1] : null;
if (!PROJECT_ID) {
  console.error("Usage: node scripts/seed-africa-companies.mjs --project <bewatu-dev|bewatu-2d04e> [--write]");
  process.exit(1);
}

// ── Company list ──────────────────────────────────────────────────────────────
// Each entry verified via web search against recent (2026) coverage before
// inclusion -- real company, real primary domain, real country/industry.
// Deliberately excludes companies with recent reported financial distress
// or unclear operating status (e.g. 54gene) rather than guess.
const COMPANIES = [
  // Nigeria -- Fintech/Payments
  { name: "Flutterwave",       domain: "flutterwave.com",        industry: "Fintech",        country: "Nigeria" },
  { name: "Paystack",          domain: "paystack.com",           industry: "Fintech",        country: "Nigeria" },
  { name: "Interswitch",       domain: "interswitchgroup.com",   industry: "Fintech",        country: "Nigeria" },
  { name: "OPay",              domain: "opayweb.com",            industry: "Fintech",        country: "Nigeria" },
  { name: "PalmPay",           domain: "palmpay.com",            industry: "Fintech",        country: "Nigeria" },
  { name: "Kuda",              domain: "kuda.com",               industry: "Fintech",        country: "Nigeria" },
  { name: "Moniepoint",        domain: "moniepoint.com",         industry: "Fintech",        country: "Nigeria" },
  { name: "LemFi",             domain: "lemfi.com",              industry: "Fintech",        country: "Nigeria" },
  // Nigeria -- Logistics / Mobility / Other
  { name: "Kobo360",           domain: "kobo360.com",            industry: "Logistics",      country: "Nigeria" },
  { name: "Moove",             domain: "moove.io",               industry: "Mobility",       country: "Nigeria" },
  { name: "Andela",            domain: "andela.com",             industry: "Tech Talent",    country: "Nigeria" },
  { name: "Helium Health",     domain: "heliumhealth.com",       industry: "Healthtech",     country: "Nigeria" },
  // Pan-African / multi-HQ
  { name: "Jumia",             domain: "jumia.com",              industry: "E-Commerce",     country: "Nigeria" },
  { name: "Wave",              domain: "wave.com",               industry: "Fintech",        country: "Senegal" },
  { name: "Chipper Cash",      domain: "chippercash.com",        industry: "Fintech",        country: "Ghana" },
  { name: "Carry1st",          domain: "carry1st.com",           industry: "Gaming",         country: "South Africa" },
  { name: "Spiro",             domain: "spiro.co",               industry: "Mobility",       country: "Benin" },
  { name: "Cassava Technologies", domain: "cassavatechnologies.com", industry: "Tech Infrastructure", country: "Zimbabwe" },
  // Kenya
  { name: "M-KOPA",            domain: "m-kopa.com",             industry: "Fintech",        country: "Kenya" },
  { name: "Tala",              domain: "tala.co",                industry: "Fintech",        country: "Kenya" },
  { name: "Twiga Foods",       domain: "twiga.com",              industry: "Agritech",       country: "Kenya" },
  { name: "Copia Global",      domain: "copia.co.ke",            industry: "E-Commerce",     country: "Kenya" },
  { name: "Apollo Agriculture",domain: "apolloagriculture.com",  industry: "Agritech",       country: "Kenya" },
  { name: "Safaricom",         domain: "safaricom.co.ke",        industry: "Telecom",        country: "Kenya" },
  { name: "Sun King",          domain: "sunking.com",            industry: "Clean Energy",   country: "Kenya" },
  { name: "Chpter",            domain: "chpter.co",              industry: "Fintech",        country: "Kenya" },
  { name: "Amini",             domain: "amini.ai",               industry: "Climate Tech",   country: "Kenya" },
  // South Africa
  { name: "TymeBank",          domain: "tymebank.co.za",         industry: "Fintech",        country: "South Africa" },
  { name: "Yoco",              domain: "yoco.com",               industry: "Fintech",        country: "South Africa" },
  { name: "Stitch",            domain: "stitch.money",           industry: "Fintech",        country: "South Africa" },
  { name: "Mukuru",            domain: "mukuru.com",             industry: "Fintech",        country: "South Africa" },
  { name: "JUMO",              domain: "jumo.world",             industry: "Fintech",        country: "South Africa" },
  { name: "Naspers",           domain: "naspers.com",            industry: "Media/Tech Investment", country: "South Africa" },
  { name: "MTN Group",         domain: "mtn.com",                industry: "Telecom",        country: "South Africa" },
  { name: "Sand Technologies", domain: "sandtech.com",           industry: "AI/Data",        country: "South Africa" },
  // Egypt
  { name: "MNT-Halan",         domain: "halan.com",              industry: "Fintech",        country: "Egypt" },
  { name: "Fawry",             domain: "fawry.com",              industry: "Fintech",        country: "Egypt" },
  { name: "valU",              domain: "valu.com.eg",            industry: "Fintech",        country: "Egypt" },
  // Ghana
  { name: "mPharma",           domain: "mpharma.com",            industry: "Healthtech",     country: "Ghana" },
  // Uganda
  { name: "SafeBoda",          domain: "safeboda.com",           industry: "Mobility",       country: "Uganda" },
  // Ethiopia
  { name: "Kubik",             domain: "kubikx.com",             industry: "Construction Tech", country: "Ethiopia" },
  { name: "Gebeya",            domain: "gebeya.com",              industry: "Tech Talent",    country: "Ethiopia" },
  // Morocco
  { name: "Yakeey",            domain: "yakeey.com",             industry: "Proptech",       country: "Morocco" },

  // ── Listed/established companies (names sourced from African Business's
  // "Africa's Top 250 Companies 2026" ranking as a discovery list only --
  // every entry below was independently verified for its real domain,
  // country and industry here, not copied from that ranking's own data
  // (rank, market cap, sector taxonomy, net income/revenue figures are
  // deliberately excluded). Entries from that list where a real domain
  // couldn't be confidently verified (mostly smaller regional banks and
  // subsidiaries) were skipped rather than guessed. ──────────────────────
  { name: "AngloGold Ashanti",       domain: "anglogoldashanti.com",     industry: "Mining",              country: "South Africa" },
  { name: "Gold Fields",             domain: "goldfields.com",           industry: "Mining",              country: "South Africa" },
  { name: "Standard Bank Group",     domain: "standardbank.com",         industry: "Banking",             country: "South Africa" },
  { name: "FirstRand",               domain: "firstrand.co.za",          industry: "Banking",             country: "South Africa" },
  { name: "Capitec Bank",            domain: "capitecbank.co.za",        industry: "Banking",             country: "South Africa" },
  { name: "Impala Platinum",         domain: "implats.co.za",            industry: "Mining",              country: "South Africa" },
  { name: "Absa Group",              domain: "absa.africa",              industry: "Banking",             country: "South Africa" },
  { name: "Sanlam",                  domain: "sanlam.com",               industry: "Insurance",           country: "South Africa" },
  { name: "Discovery",               domain: "discovery.co.za",          industry: "Insurance",           country: "South Africa" },
  { name: "Shoprite Holdings",       domain: "shopriteholdings.co.za",   industry: "Retail",              country: "South Africa" },
  { name: "Harmony Gold Mining",     domain: "harmony.co.za",            industry: "Mining",              country: "South Africa" },
  { name: "Maroc Telecom",           domain: "iam.ma",                   industry: "Telecom",             country: "Morocco" },
  { name: "Sasol",                   domain: "sasol.com",                industry: "Chemicals/Energy",    country: "South Africa" },
  { name: "Sibanye-Stillwater",      domain: "sibanyestillwater.com",    industry: "Mining",              country: "South Africa" },
  { name: "Attijariwafa Bank",       domain: "attijariwafabank.com",     industry: "Banking",             country: "Morocco" },
  { name: "Nedbank Group",           domain: "nedbank.co.za",            industry: "Banking",             country: "South Africa" },
  { name: "Nigerian Breweries",      domain: "nbplc.com",                industry: "Beverages",           country: "Nigeria" },
  { name: "Commercial International Bank Egypt", domain: "cibeg.com",    industry: "Banking",             country: "Egypt" },
  { name: "Pepkor Holdings",         domain: "pepkor.co.za",             industry: "Retail",              country: "South Africa" },
  { name: "Exxaro Resources",        domain: "exxaro.com",               industry: "Mining",              country: "South Africa" },
  { name: "Clicks Group",            domain: "clicksgroup.co.za",        industry: "Retail/Pharmacy",     country: "South Africa" },
  { name: "Old Mutual",              domain: "oldmutual.com",            industry: "Insurance",           country: "South Africa" },
  { name: "Aspen Pharmacare",        domain: "aspenpharma.com",          industry: "Pharmaceuticals",     country: "South Africa" },
  { name: "Guaranty Trust Holding Company", domain: "gtcoplc.com",       industry: "Banking",             country: "Nigeria" },
  { name: "Tiger Brands",            domain: "tigerbrands.com",          industry: "Food",                country: "South Africa" },
  { name: "Woolworths Holdings",     domain: "woolworthsholdings.co.za", industry: "Retail",              country: "South Africa" },
  { name: "Zenith Bank",             domain: "zenithbank.com",           industry: "Banking",             country: "Nigeria" },
  { name: "Momentum Group",          domain: "momentum.co.za",           industry: "Insurance",           country: "South Africa" },
  { name: "Santam",                  domain: "santam.co.za",             industry: "Insurance",           country: "South Africa" },
  { name: "Telecom Egypt",           domain: "te.eg",                    industry: "Telecom",             country: "Egypt" },
  { name: "Mr Price Group",          domain: "mrpricegroup.com",         industry: "Retail",              country: "South Africa" },
  { name: "MCB Group",               domain: "mcbgroup.com",             industry: "Banking",             country: "Mauritius" },
  { name: "Investec",                domain: "investec.com",             industry: "Banking/Finance",     country: "South Africa" },
  { name: "Equity Group Holdings",   domain: "equitygroupholdings.com",  industry: "Banking",             country: "Kenya" },
  { name: "Dis-Chem Pharmacies",     domain: "dischem.co.za",            industry: "Retail/Pharmacy",     country: "South Africa" },
  { name: "KCB Group",               domain: "kcbgroup.com",             industry: "Banking",             country: "Kenya" },
  { name: "Access Holdings",         domain: "accessbankplc.com",        industry: "Banking",             country: "Nigeria" },
  { name: "Life Healthcare Group",   domain: "lifehealthcare.co.za",     industry: "Healthcare",          country: "South Africa" },
  { name: "Pick n Pay Stores",       domain: "pnp.co.za",                industry: "Retail",              country: "South Africa" },
  { name: "Johannesburg Stock Exchange", domain: "jse.co.za",            industry: "Financial Markets",   country: "South Africa" },
  { name: "United Bank for Africa",  domain: "ubagroup.com",             industry: "Banking",             country: "Nigeria" },
  { name: "Stanbic IBTC",            domain: "stanbicibtcbank.com",      industry: "Banking",             country: "Nigeria" },
  { name: "East African Breweries",  domain: "eabl.com",                 industry: "Beverages",           country: "Kenya" },
  { name: "Fidelity Bank Nigeria",   domain: "fidelitybank.ng",          industry: "Banking",             country: "Nigeria" },
  { name: "Co-operative Bank of Kenya", domain: "co-opbank.co.ke",       industry: "Banking",             country: "Kenya" },
  { name: "NCBA Group",              domain: "ncbagroup.com",            industry: "Banking",             country: "Kenya" },
  { name: "Absa Bank Kenya",         domain: "absabank.co.ke",           industry: "Banking",             country: "Kenya" },
  { name: "Sun International",       domain: "suninternational.com",     industry: "Hospitality/Gaming",  country: "South Africa" },
  { name: "SPAR Group",              domain: "spar.co.za",               industry: "Retail/Wholesale",    country: "South Africa" },
  { name: "Reunert",                 domain: "reunert.com",              industry: "Electronics",         country: "South Africa" },
  { name: "AECI",                    domain: "aeciworld.com",            industry: "Chemicals",           country: "South Africa" },
  { name: "PPC",                     domain: "ppc.africa",               industry: "Construction Materials", country: "South Africa" },
  { name: "Oando",                   domain: "oandoplc.com",             industry: "Oil & Gas",           country: "Nigeria" },
  { name: "The Foschini Group",      domain: "tfglimited.co.za",         industry: "Retail",              country: "South Africa" },
  { name: "Bidvest Group",           domain: "bidvest.com",              industry: "Conglomerate",        country: "South Africa" },
  { name: "El Sewedy Electric",      domain: "elsewedyelectric.com",     industry: "Electrical Products", country: "Egypt" },
];

async function main() {
  console.log(`🌍 BeWatu Africa Company Seeder`);
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Mode: ${WRITE_MODE ? "✍️  WRITE" : "👀 DRY RUN — pass --write to actually seed"}`);
  console.log(`   Companies: ${COMPANIES.length}\n`);

  const app = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  const db = admin.firestore(app);

  let inserted = 0, skipped = 0, errors = 0;
  {
    for (const company of COMPANIES) {
      const website = `https://${company.domain}`;
      if (!WRITE_MODE) {
        console.log(`📋 Would add: ${company.name} (${company.domain}) — ${company.industry}, ${company.country}`);
        inserted++;
        continue;
      }
      try {
        const existing = await db.collection("companies").where("domain", "==", company.domain).limit(1).get();
        if (!existing.empty) {
          console.log(`⏭️  Skip (exists): ${company.name}`);
          skipped++;
          continue;
        }
        await db.collection("companies").add({
          name: company.name,
          description: "",
          industry: company.industry,
          country: company.country,
          logoUrl: "",
          website,
          domain: company.domain,
          ticker: "",
          source: "africa-seed",
          claimed: false,
          verified: false,
          adminUid: "",
          verifiedRecruiters: [],
          verificationStatus: "unverified",
          verifiedIndustries: [],
          regulatedIndustries: [],
          numericId: Date.now() + Math.floor(Math.random() * 1000),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.log(`✅ ${company.name} (${company.domain})`);
        inserted++;
      } catch (err) {
        console.error(`❌ ${company.name}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log("\n─────────────────────────────────");
  console.log(`✅ ${WRITE_MODE ? "Inserted" : "Would insert"}: ${inserted}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  if (!WRITE_MODE) console.log("\nRun with --write to seed for real");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
