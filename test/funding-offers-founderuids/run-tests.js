// Launch-readiness review, cross-repo Factory audit: bewatu-factory's
// QuickOfferModal (components/investor/InvestorDashboard.tsx) wrote a flat
// founderUid field to funding_offers, and FounderDashboard.tsx's OfferInbox
// queried that same flat field -- but firestore.rules only ever checks
// founderUids (an array, via hasAny()). Every founder's Offer Inbox was
// permission-denied outright, and the accept/decline update would have
// failed the same way. Fixed on the Factory side (founderUids: [uid] on
// write, array-contains on the read query); this guards the contract here.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  collection, doc, addDoc, updateDoc, getDocs, query, where, serverTimestamp,
} = require("firebase/firestore");

const RULES_PATH = path.join(__dirname, "..", "..", "firestore.rules");

let pass = 0, fail = 0;
async function check(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`✅ ${label}`);
  } catch (e) {
    fail++;
    console.log(`❌ ${label}  -- ${e.message.split("\n")[0]}`);
  }
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: "demo-bewatu",
    firestore: {
      rules: fs.readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // isFactoryInvestor() requires a factory_investors/{uid} doc to exist.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("factory_investors/investor-uid").set({ uid: "investor-uid" });
  });

  const investor = testEnv.authenticatedContext("investor-uid").firestore();
  const founder   = testEnv.authenticatedContext("founder-uid").firestore();
  const stranger  = testEnv.authenticatedContext("stranger-uid").firestore();

  let offerId;
  await check("create WITH founderUids array (the real, fixed Factory write): succeeds", async () => {
    const ref = await addDoc(collection(investor, "funding_offers"), {
      investorUid: "investor-uid", founderUids: ["founder-uid"],
      startupId: "s1", startupName: "Startup", amount: 500000, equity: 5,
      terms: "", message: "", status: "pending", createdAt: serverTimestamp(),
    });
    offerId = ref.id;
  });

  // create's own rule only checks investorUid/status -- it never looks at
  // founderUids at all, so a doc with the old broken flat founderUid (and
  // no founderUids) is NOT rejected at write time. The real bug was
  // entirely on the read/update side, verified below: with no founderUids
  // array on the doc, a founder's array-contains query returns it as
  // simply not matching (no error, just absent from their results), and
  // the accept/decline update's founderUids.hasAny() check has nothing to
  // match either, so it's denied.
  let brokenOfferId;
  await check("create WITH the old broken flat founderUid field: create rule doesn't care, succeeds", async () => {
    const ref = await addDoc(collection(investor, "funding_offers"), {
      investorUid: "investor-uid", founderUid: "founder-uid",
      startupId: "s1", startupName: "Startup", amount: 500000, equity: 5,
      terms: "", message: "", status: "pending", createdAt: serverTimestamp(),
    });
    brokenOfferId = ref.id;
  });

  await check("founder CAN read the real (fixed) offer via founderUids array-contains query", async () => {
    const snap = await getDocs(query(collection(founder, "funding_offers"), where("founderUids", "array-contains", "founder-uid")));
    if (snap.empty) throw new Error("expected the seeded offer to be readable, got none");
    if (snap.docs.some(d => d.id === brokenOfferId)) throw new Error("the old broken doc (no founderUids) should not appear in this query at all");
  });

  await check("founder CANNOT accept the old broken offer (no founderUids field for hasAny to match)", async () => {
    await assertFails(updateDoc(doc(founder, "funding_offers", brokenOfferId), {
      status: "accepted",
    }));
  });

  await check("a stranger's founderUids array-contains query returns nothing (not a permission error, just correctly empty)", async () => {
    const snap = await getDocs(query(collection(stranger, "funding_offers"), where("founderUids", "array-contains", "stranger-uid")));
    if (!snap.empty) throw new Error("expected no results for a stranger");
  });

  await check("founder CAN accept the offer (update via founderUids.hasAny)", async () => {
    await assertSucceeds(updateDoc(doc(founder, "funding_offers", offerId), {
      status: "accepted",
    }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
