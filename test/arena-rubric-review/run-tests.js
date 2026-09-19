// Schema decision 3 (launch-readiness review): Arena submissions carry a
// structured rubric + mandatory feedback (components/ArenaChallengeDetail.tsx's
// handleReview()) and an internal-only integrity subcollection.
//
// Also a real, previously-unknown bug found while building this: the old
// `update` rule on arena_challenges/{id}/submissions/{id} only let the
// AUTHOR update the doc, but the only real write this collection ever gets
// (handleScore/handleReview) is the challenge's recruiter -- so recruiter
// scoring has been silently permission-denied since this feature shipped.
// This suite covers both the fix and the new schema.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc, setDoc, updateDoc, getDoc, serverTimestamp,
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

const validReview = (reviewerUid) => ({
  reviewerUid,
  rubricScores: { correctness: 8, approach: 7, communication: 9 },
  overallScore: 8,
  feedback: "Solid approach, clear explanation of tradeoffs.",
  reviewedAt: new Date().toISOString(),
});

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
    await db.doc("arena_challenges/c1/submissions/s1").set({
      authorUid: "author-uid",
      challengeRecruiterId: "recruiter-uid",
      content: "my solution",
      status: "shortlisted",
      isShortlisted: true,
    });
    await db.doc("users/admin-uid").set({ isPlatformAdmin: true });
  });

  const recruiter = testEnv.authenticatedContext("recruiter-uid").firestore();
  const author    = testEnv.authenticatedContext("author-uid").firestore();
  const stranger  = testEnv.authenticatedContext("stranger-uid").firestore();
  const admin     = testEnv.authenticatedContext("admin-uid").firestore();

  const subRef = (ctx) => doc(ctx, "arena_challenges/c1/submissions/s1");

  await check("recruiter CAN set score (the real bug this fixes)", async () => {
    await assertSucceeds(updateDoc(subRef(recruiter), { score: 8 }));
  });

  await check("author CANNOT set score", async () => {
    await assertFails(updateDoc(subRef(author), { score: 10 }));
  });

  await check("recruiter CAN write a complete, valid review", async () => {
    await assertSucceeds(updateDoc(subRef(recruiter), { review: validReview("recruiter-uid") }));
  });

  await check("recruiter CANNOT write a review with empty feedback", async () => {
    const bad = { ...validReview("recruiter-uid"), feedback: "" };
    await assertFails(updateDoc(subRef(recruiter), { review: bad }));
  });

  await check("recruiter CANNOT write a review with a spoofed reviewerUid", async () => {
    const bad = validReview("someone-else-uid");
    await assertFails(updateDoc(subRef(recruiter), { review: bad }));
  });

  await check("recruiter CANNOT write a review missing a rubric field", async () => {
    const bad = validReview("recruiter-uid");
    delete bad.rubricScores.communication;
    await assertFails(updateDoc(subRef(recruiter), { review: bad }));
  });

  await check("author CANNOT write a review at all", async () => {
    await assertFails(updateDoc(subRef(author), { review: validReview("author-uid") }));
  });

  await check("recruiter CANNOT smuggle a content change in via score/review update", async () => {
    await assertFails(updateDoc(subRef(recruiter), { score: 9, content: "tampered" }));
  });

  // ── integrity subcollection ──────────────────────────────────────────────
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("arena_challenges/c1/submissions/s1/integrity/data").set({
      similarityScore: 0.12,
      aiDetectionScore: 0.83,
      originalityChecked: true,
      flaggedForReview: false,
    });
  });

  await check("author CANNOT read integrity (their own submission's anti-cheating data)", async () => {
    await assertFails(getDoc(doc(author, "arena_challenges/c1/submissions/s1/integrity/data")));
  });

  await check("recruiter CANNOT read integrity (internal signal, not for the hiring company)", async () => {
    await assertFails(getDoc(doc(recruiter, "arena_challenges/c1/submissions/s1/integrity/data")));
  });

  await check("stranger CANNOT read integrity", async () => {
    await assertFails(getDoc(doc(stranger, "arena_challenges/c1/submissions/s1/integrity/data")));
  });

  await check("platform admin CAN read integrity", async () => {
    await assertSucceeds(getDoc(doc(admin, "arena_challenges/c1/submissions/s1/integrity/data")));
  });

  await check("no client, not even an admin, can write integrity (Admin-SDK-only)", async () => {
    await assertFails(setDoc(doc(admin, "arena_challenges/c1/submissions/s1/integrity/data"), {
      similarityScore: 0.99, aiDetectionScore: 0.99, originalityChecked: true, flaggedForReview: true,
    }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
