// bewatu-factory's "Request demo" feature: an investor books a demo against
// a founder's real weekly availability, but nothing is confirmed until the
// founder accepts -- specifically so founders can decline demos with no real
// investment potential instead of every request auto-booking. This guards
// the rule change that makes that gate real: create is now pinned to
// status:'pending' (an investor can no longer create an already-confirmed
// session directly), and a new update branch lets a founder move a pending
// session to confirmed (setting roomUrl) or rejected, and nothing else.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  collection, doc, addDoc, updateDoc, serverTimestamp,
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

function baseSession(overrides = {}) {
  return {
    startupId: "s1", startupName: "Startup",
    founderUids: ["founder-uid"],
    investorUid: "investor-uid", investorName: "Investor", investorFirm: null,
    slotDate: "2026-04-01", slotTime: "9:00 AM", duration: 30,
    roomUrl: null, note: null, outcome: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    status: "pending",
    ...overrides,
  };
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
  const founder  = testEnv.authenticatedContext("founder-uid").firestore();
  const stranger = testEnv.authenticatedContext("stranger-uid").firestore();

  await check("investor CAN create a pending session for themselves", async () => {
    await assertSucceeds(addDoc(collection(investor, "demo_sessions"), baseSession()));
  });

  await check("investor CANNOT create a session as already confirmed (skip the approval gate)", async () => {
    await assertFails(addDoc(collection(investor, "demo_sessions"), baseSession({ status: "confirmed" })));
  });

  await check("investor CANNOT create a session on someone else's behalf", async () => {
    await assertFails(addDoc(collection(investor, "demo_sessions"), baseSession({ investorUid: "someone-else" })));
  });

  let pendingId;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const ref = await ctx.firestore().collection("demo_sessions").add(baseSession());
    pendingId = ref.id;
  });

  await check("a stranger CANNOT accept a pending session they're not party to", async () => {
    await assertFails(updateDoc(doc(stranger, "demo_sessions", pendingId), {
      status: "confirmed", roomUrl: "https://meet.jit.si/x", updatedAt: serverTimestamp(),
    }));
  });

  await check("the investor themselves CANNOT accept their own request (only a founder can)", async () => {
    await assertFails(updateDoc(doc(investor, "demo_sessions", pendingId), {
      status: "confirmed", roomUrl: "https://meet.jit.si/x", updatedAt: serverTimestamp(),
    }));
  });

  await check("founder CANNOT jump straight to 'completed' -- only confirmed/rejected are valid from pending", async () => {
    await assertFails(updateDoc(doc(founder, "demo_sessions", pendingId), {
      status: "completed", updatedAt: serverTimestamp(),
    }));
  });

  await check("founder CANNOT accept while also sneaking in an unrelated field change", async () => {
    await assertFails(updateDoc(doc(founder, "demo_sessions", pendingId), {
      status: "confirmed", roomUrl: "https://meet.jit.si/x", investorName: "Someone Else",
      updatedAt: serverTimestamp(),
    }));
  });

  await check("founder CAN accept a pending request (-> confirmed, sets roomUrl)", async () => {
    await assertSucceeds(updateDoc(doc(founder, "demo_sessions", pendingId), {
      status: "confirmed", roomUrl: "https://meet.jit.si/bewatu-s1-1", updatedAt: serverTimestamp(),
    }));
  });

  await check("founder CANNOT accept the same session twice (no longer pending)", async () => {
    await assertFails(updateDoc(doc(founder, "demo_sessions", pendingId), {
      status: "rejected", updatedAt: serverTimestamp(),
    }));
  });

  let secondPendingId;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const ref = await ctx.firestore().collection("demo_sessions").add(baseSession({ slotTime: "10:00 AM" }));
    secondPendingId = ref.id;
  });

  await check("founder CAN decline a pending request (-> rejected)", async () => {
    await assertSucceeds(updateDoc(doc(founder, "demo_sessions", secondPendingId), {
      status: "rejected", updatedAt: serverTimestamp(),
    }));
  });

  await check("investor CAN still record a post-demo outcome on a confirmed session (unrelated existing rule, unaffected)", async () => {
    await assertSucceeds(updateDoc(doc(investor, "demo_sessions", pendingId), {
      outcome: "interested", outcomeRecordedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
