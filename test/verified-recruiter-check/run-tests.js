// P1 fix: "No verified-recruiter check on jobs/opportunities create" — any
// signed-in user could post a job/opportunity by just setting recruiterId to
// their own uid, with no check they're actually a recruiter.
//
// Investigating it surfaced a separate, severe, pre-existing bug: jobs'
// create/update/delete checked `recruiterId == request.auth.uid`, but
// Job.recruiterId is the app-level NUMERIC id, not the caller's uid — the
// real write site (createJob) stamps the actual uid onto a different field,
// recruiterUid. A number can never equal a string in Firestore rules, so
// posting a job was completely broken before this fix, independent of the
// recruiter-check gap. This suite proves both: the real write shape now
// succeeds for an actual recruiter, and is denied for a non-recruiter.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } = require("firebase/firestore");

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

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("users/recruiter-uid").set({ id: 42, isPublic: true, isRecruiter: true });
    await db.doc("users/plain-uid").set({ id: 43, isPublic: true, isRecruiter: false });
  });

  const recruiter = testEnv.authenticatedContext("recruiter-uid").firestore();
  const plainUser  = testEnv.authenticatedContext("plain-uid").firestore();

  console.log("\n== jobs: the real write shape (recruiterUid, not recruiterId==uid) ==");

  let jobRef;
  await check("real createJob() shape succeeds for an actual recruiter", async () => {
    jobRef = await addDoc(collection(recruiter, "jobs"), {
      title: "Engineer", recruiterId: 42, numericId: Date.now(),
      recruiterUid: "recruiter-uid", applicants: [], createdAt: serverTimestamp(),
    });
  });

  await check("a non-recruiter CANNOT post a job even with the correct recruiterUid", async () => {
    await assertFails(addDoc(collection(plainUser, "jobs"), {
      title: "Fake Job", recruiterId: 43, numericId: Date.now(),
      recruiterUid: "plain-uid", applicants: [], createdAt: serverTimestamp(),
    }));
  });

  await check("a recruiter CANNOT post a job claiming someone else's recruiterUid", async () => {
    await assertFails(addDoc(collection(recruiter, "jobs"), {
      title: "Spoofed", recruiterId: 42, numericId: Date.now(),
      recruiterUid: "someone-else-uid", applicants: [], createdAt: serverTimestamp(),
    }));
  });

  await check("the real job owner CAN update it (recruiterUid-based ownership)", async () => {
    await assertSucceeds(updateDoc(jobRef, { title: "Senior Engineer" }));
  });

  await check("the real job owner CAN delete it", async () => {
    await assertSucceeds(deleteDoc(jobRef));
  });

  console.log("\n== opportunities: recruiter gate ==");

  await check("real createOpportunity() shape succeeds for an actual recruiter", async () => {
    await assertSucceeds(addDoc(collection(recruiter, "opportunities"), {
      title: "Contract role", recruiterId: "recruiter-uid", recruiterName: "Recruiter",
      summary: "s", fullDescription: "d", location: "Remote", type: "Contract",
      experienceLevel: "Mid-level", primaryDomain: "Backend",
    }));
  });

  await check("a non-recruiter CANNOT post an opportunity", async () => {
    await assertFails(addDoc(collection(plainUser, "opportunities"), {
      title: "Fake role", recruiterId: "plain-uid", recruiterName: "Plain",
      summary: "s", fullDescription: "d", location: "Remote", type: "Contract",
      experienceLevel: "Mid-level", primaryDomain: "Backend",
    }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
