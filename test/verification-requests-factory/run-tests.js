// Launch-readiness review, cross-repo Factory audit: bewatu-factory's two
// writers into this app's verificationRequests collection
// (components/investor/InvestorOnboarding.tsx's investor_application, and
// lib/firebase/pipeline-service.ts's nominateForFactory()) were both
// writing a uid/nominatorUid field that firestore.rules' create rule never
// checks -- it only accepts recruiterUid or requestedBy. Neither Factory
// write is a recruiter, so both were unconditionally permission-denied,
// silently swallowed by a bare try/catch on the caller's side. Fixed on
// the Factory side by adding requestedBy; this guards the contract here,
// on the side that owns it, so it can't silently break again.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { collection, addDoc, serverTimestamp } = require("firebase/firestore");

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

  const investor = testEnv.authenticatedContext("investor-uid").firestore();
  const member   = testEnv.authenticatedContext("member-uid").firestore();

  await check("investor_application WITH requestedBy (the real Factory write, fixed): create succeeds", async () => {
    await assertSucceeds(addDoc(collection(investor, "verificationRequests"), {
      type: "investor_application", uid: "investor-uid", requestedBy: "investor-uid",
      email: "i@example.com", name: "Investor", firm: "Acme Capital", investorType: "angel",
      status: "pending", submittedAt: serverTimestamp(),
    }));
  });

  await check("investor_application WITHOUT requestedBy (the old broken Factory write): create still fails", async () => {
    await assertFails(addDoc(collection(investor, "verificationRequests"), {
      type: "investor_application", uid: "investor-uid",
      email: "i@example.com", name: "Investor", firm: "Acme Capital", investorType: "angel",
      status: "pending", submittedAt: serverTimestamp(),
    }));
  });

  await check("factory_nomination WITH requestedBy (the real Factory write, fixed): create succeeds", async () => {
    await assertSucceeds(addDoc(collection(member, "verificationRequests"), {
      type: "factory_nomination", targetUid: "target-uid", targetName: "Target",
      nominatorUid: "member-uid", nominatorName: "Member", requestedBy: "member-uid",
      reason: "great engineer", status: "pending", submittedAt: serverTimestamp(),
    }));
  });

  await check("factory_nomination WITHOUT requestedBy (the old broken Factory write): create still fails", async () => {
    await assertFails(addDoc(collection(member, "verificationRequests"), {
      type: "factory_nomination", targetUid: "target-uid", targetName: "Target",
      nominatorUid: "member-uid", nominatorName: "Member",
      reason: "great engineer", status: "pending", submittedAt: serverTimestamp(),
    }));
  });

  await check("investor_applications: own application with status 'pending' can be created", async () => {
    await assertSucceeds(addDoc(collection(investor, "investor_applications"), {
      uid: "investor-uid", firm: "Acme Capital", status: "pending", submittedAt: serverTimestamp(),
    }));
  });

  await check("investor_applications: a pre-approved application can't be self-filed", async () => {
    await assertFails(addDoc(collection(investor, "investor_applications"), {
      uid: "investor-uid", firm: "Acme Capital", status: "approved", submittedAt: serverTimestamp(),
    }));
  });

  await check("investor_applications: can't file an application for someone else's uid", async () => {
    await assertFails(addDoc(collection(investor, "investor_applications"), {
      uid: "someone-else", firm: "Acme Capital", status: "pending", submittedAt: serverTimestamp(),
    }));
  });

  const { Timestamp } = require("firebase/firestore");
  const { setDoc, doc, getDoc } = require("firebase/firestore");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adb = ctx.firestore();
    await setDoc(doc(adb, "investor_application_cooldowns", "cooling-uid"), {
      until: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000), applicationId: "a1",
    });
    await setDoc(doc(adb, "investor_application_cooldowns", "expired-uid"), {
      until: Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000), applicationId: "a2",
    });
  });
  const cooling = testEnv.authenticatedContext("cooling-uid").firestore();
  const expired = testEnv.authenticatedContext("expired-uid").firestore();
  const app = (uid) => ({ uid, firm: "Acme", status: "pending", submittedAt: serverTimestamp() });

  await check("cooldown: applicant inside their 14-day cooldown can't re-apply", async () => {
    await assertFails(addDoc(collection(cooling, "investor_applications"), app("cooling-uid")));
  });
  await check("cooldown: applicant whose cooldown has ended can re-apply", async () => {
    await assertSucceeds(addDoc(collection(expired, "investor_applications"), app("expired-uid")));
  });
  await check("cooldown: applicant can read their own cooldown doc", async () => {
    await assertSucceeds(getDoc(doc(cooling, "investor_application_cooldowns", "cooling-uid")));
  });
  await check("cooldown: applicant can't clear their own cooldown", async () => {
    await assertFails(setDoc(doc(cooling, "investor_application_cooldowns", "cooling-uid"), { until: Timestamp.fromMillis(0) }));
  });
  await check("cooldown: applicant can't read someone else's cooldown", async () => {
    await assertFails(getDoc(doc(investor, "investor_application_cooldowns", "cooling-uid")));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
