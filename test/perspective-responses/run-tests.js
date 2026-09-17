// P1 fix (launch-readiness review): perspective_posts.responses used to be
// an array field on the post doc, written via arrayUnion() — the rule could
// only verify the array grew by exactly one element (no tampering, no
// bulk-inject), because Firestore's rules language can't extract "the
// newly added element" from a list diff to check its authorUid. Any authed
// non-owner could still overwrite the whole array with an element claiming
// someone else's identity.
//
// Real fix: a responses subcollection, same pattern as posts/{id}/comments —
// ownership is now enforced per-document, exactly like everywhere else in
// this file. This suite exercises the real rules, not a reimplementation.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { collection, doc, addDoc, updateDoc, getDoc, serverTimestamp } = require("firebase/firestore");

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
    await db.doc("perspective_posts/p1").set({
      question: "How do you approach career pivots?",
      context: "", seekingFrom: ["Any generation"],
      authorUid: "author-uid",
      authorId: 1, authorName: "Author",
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.doc("perspective_posts/p1/responses/r1").set({
      authorUid: "responder-uid", authorId: 2, authorName: "Responder",
      authorGen: "Millennials (1981–1996)", content: "Real answer",
      createdAt: new Date(), helpful: 0,
    });
  });

  const author    = testEnv.authenticatedContext("author-uid").firestore();
  const responder = testEnv.authenticatedContext("responder-uid").firestore();
  const attacker   = testEnv.authenticatedContext("attacker-uid").firestore();

  console.log("\n== perspective_posts/{id}/responses: create ==");

  await check("real addPerspectiveResponse() shape (own authorUid) succeeds", async () => {
    await assertSucceeds(addDoc(collection(attacker, "perspective_posts", "p1", "responses"), {
      authorUid: "attacker-uid", authorId: 3, authorName: "Attacker",
      authorGen: "Gen Z (1997–2012)", content: "My real perspective",
      createdAt: serverTimestamp(), helpful: 0,
    }));
  });

  await check("spoofing someone else's authorUid on create is denied", async () => {
    await assertFails(addDoc(collection(attacker, "perspective_posts", "p1", "responses"), {
      authorUid: "victim-uid", authorId: 4, authorName: "Attacker",
      authorGen: "Gen Z (1997–2012)", content: "Impersonated",
      createdAt: serverTimestamp(), helpful: 0,
    }));
  });

  console.log("\n== perspective_posts/{id}/responses: update/delete (per-document ownership) ==");

  await check("the response's real author CAN edit their own response", async () => {
    await assertSucceeds(updateDoc(doc(responder, "perspective_posts", "p1", "responses", "r1"), {
      content: "Edited answer",
    }));
  });

  await check("a stranger CANNOT edit someone else's response", async () => {
    await assertFails(updateDoc(doc(attacker, "perspective_posts", "p1", "responses", "r1"), {
      content: "Tampered",
    }));
  });

  await check("a stranger CANNOT delete someone else's response", async () => {
    const { deleteDoc } = require("firebase/firestore");
    await assertFails(deleteDoc(doc(attacker, "perspective_posts", "p1", "responses", "r1")));
  });

  await check("the old array-tampering path is gone: writing a fake array to the parent post is denied", async () => {
    // Confirms the parent doc's own update rule no longer has a
    // responses-array escape hatch at all for a non-owner.
    await assertFails(updateDoc(doc(attacker, "perspective_posts", "p1"), {
      responses: [{ id: "fake", authorUid: "attacker-uid", content: "Injected", helpful: 999 }],
    }));
  });

  console.log("\n== perspective_posts/{id}: parent doc update stays owner-only ==");

  await check("the post's real author CAN edit their own question/context", async () => {
    await assertSucceeds(updateDoc(doc(author, "perspective_posts", "p1"), {
      question: "Edited question", updatedAt: serverTimestamp(),
    }));
  });

  await check("a stranger CANNOT edit someone else's post", async () => {
    await assertFails(updateDoc(doc(attacker, "perspective_posts", "p1"), {
      question: "Hijacked",
    }));
  });

  console.log("\n== perspective_posts/{id}/helpful_votes: any authed user can vote once ==");

  await check("any authed user CAN mark a response helpful", async () => {
    await assertSucceeds(addDoc(collection(attacker, "perspective_posts", "p1", "helpful_votes"), {
      responseId: "r1", createdAt: serverTimestamp(),
    }));
  });

  await check("no client can update a helpful_votes entry after the fact", async () => {
    // Read the doc we just wrote via the seeded doc convention isn't
    // available here without the id, so just confirm the rule shape:
    // update/delete are hard-denied regardless of ownership.
    await assertFails(updateDoc(doc(attacker, "perspective_posts", "p1", "helpful_votes", "some-vote-id"), {
      responseId: "tampered",
    }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
