// Schema decision 2 (launch-readiness review): computed company metrics.
//
// Two rule changes tested here:
//   1. applications/{id}: respondedAt/decidedAt must equal the real server
//      request time when written -- closes a real gap where a recruiter's
//      own client session could otherwise backdate either field to make
//      their response look faster than it was.
//   2. companies/{id}: responseTimeP50/timeToDecision/metricsUpdatedAt are
//      blocked from every client-writable branch, including the
//      company's own admin and ops/platform_admin -- "written only by
//      Cloud Functions" has to mean nobody's client session can set these.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc, setDoc, updateDoc, serverTimestamp, Timestamp,
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

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("applications/app1").set({
      applicantUid: "applicant-uid",
      recruiterUid: "recruiter-uid",
      companyId: 42,
      status: "applied",
      stage: "New Applicants",
    });
    await db.doc("companies/c1").set({
      numericId: 42,
      adminUid: "admin-uid",
      verifiedRecruiters: [],
    });
  });

  const recruiter = testEnv.authenticatedContext("recruiter-uid").firestore();
  const admin = testEnv.authenticatedContext("admin-uid").firestore();
  const opsStaffUid = "ops-uid";

  // ── applications: respondedAt/decidedAt must be the real server time ──────

  await check("recruiter CAN set respondedAt using serverTimestamp() (the real code path)", async () => {
    await assertSucceeds(updateDoc(doc(recruiter, "applications", "app1"), {
      respondedAt: serverTimestamp(),
    }));
  });

  await check("recruiter CANNOT backdate decidedAt to a client-chosen timestamp", async () => {
    const fakeEarlyTime = Timestamp.fromDate(new Date("2020-01-01"));
    await assertFails(updateDoc(doc(recruiter, "applications", "app1"), {
      decidedAt: fakeEarlyTime,
    }));
  });

  await check("recruiter CAN set decidedAt using serverTimestamp()", async () => {
    await assertSucceeds(updateDoc(doc(recruiter, "applications", "app1"), {
      decidedAt: serverTimestamp(),
    }));
  });

  await check("recruiter CAN still update unrelated fields (e.g. stage) without touching respondedAt/decidedAt", async () => {
    await assertSucceeds(updateDoc(doc(recruiter, "applications", "app1"), {
      stage: "Screening",
    }));
  });

  // ── companies: metrics fields are Cloud-Function-only ──────────────────────

  await check("company admin CAN still update verifiedRecruiters (regression check)", async () => {
    await assertSucceeds(updateDoc(doc(admin, "companies", "c1"), {
      verifiedRecruiters: ["someone"],
    }));
  });

  await check("company admin CANNOT set responseTimeP50 directly", async () => {
    await assertFails(updateDoc(doc(admin, "companies", "c1"), {
      responseTimeP50: 0.5,
    }));
  });

  await check("company admin CANNOT set timeToDecision directly", async () => {
    await assertFails(updateDoc(doc(admin, "companies", "c1"), {
      timeToDecision: 0.5,
    }));
  });

  await check("company admin CANNOT sneak metricsUpdatedAt in alongside a legitimate field", async () => {
    await assertFails(updateDoc(doc(admin, "companies", "c1"), {
      verifiedRecruiters: ["someone-else"],
      metricsUpdatedAt: serverTimestamp(),
    }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
