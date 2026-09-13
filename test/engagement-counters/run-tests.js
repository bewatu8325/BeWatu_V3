// P1 fix: "Engagement counters are freely writable" — onlyFields(['reactions'])
// / ['appreciations',...] / ['viewCount'] etc. across posts, sparks, ideas,
// reels, buildLogs, aiPlaybooks, reelVibes, wisdom_threads, arena_challenges,
// and factory_startups let ANY authed non-owner set the field to ANY value in
// one write — not just bump it. This exercises the real write shapes each
// app function actually uses (arrayUnion/arrayRemove self-toggles, or a
// plain +1 increment) against the real enforced rules: the legitimate shape
// must still succeed, and a forged/arbitrary value on the same field must
// now fail.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, updateDoc, arrayUnion, arrayRemove, increment } = require("firebase/firestore");

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
    await db.doc("posts/post1").set({
      authorUid: "author-uid",
      appreciations: { helpful: 0, thoughtProvoking: 0, collaborationReady: 0 },
      comments: 0,
      shares: 0,
    });
    await db.doc("sparks/spark1").set({
      authorUid: "author-uid",
      reactions: { relate: [], inspire: [], collab: [] },
    });
    await db.doc("aiPlaybooks/pb1").set({
      authorUid: "author-uid",
      helpfulByUids: [],
      viewCount: 0,
    });
    await db.doc("buildLogs/log1").set({
      authorUid: "author-uid",
      reactions: { relate: [], inspire: [], collab: [] },
    });
    await db.doc("reelVibes/reel1").set({
      authorUid: "author-uid",
      likedByUids: [],
      commentCount: 0,
      viewCount: 0,
    });
    await db.doc("perspective_posts/pp1").set({
      authorUid: "author-uid",
      responses: [{ id: "r1", authorId: 1, content: "first" }],
    });
    await db.doc("wisdom_threads/wt1").set({
      authorUid: "author-uid",
      hearts: 0,
      saves: 0,
    });
    await db.doc("ideas/idea1").set({
      authorUid: "author-uid",
      sparkCount: 0,
      sparkedByUids: [],
      stage: "seed",
      commentCount: 0,
      forkCount: 0,
    });
    await db.doc("arena_challenges/ch1").set({
      recruiterId: "recruiter-uid",
      verificationStatus: "live",
      viewCount: 0,
    });
    await db.doc("factory_startups/fs1").set({
      createdBy: "creator-uid",
      viewCount: 0,
    });
  });

  const rando = testEnv.authenticatedContext("rando-uid").firestore();

  console.log("\n== posts: appreciations/comments/shares ==");
  await check("real appreciatePost() shape (bump exactly one sub-field by 1) succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "posts", "post1"), {
      "appreciations.helpful": increment(1),
    }));
  });
  await check("setting appreciations.helpful to an arbitrary jump is denied", async () => {
    await assertFails(updateDoc(doc(rando, "posts", "post1"), {
      appreciations: { helpful: 99999, thoughtProvoking: 0, collaborationReady: 0 },
    }));
  });
  await check("bumping comments by exactly 1 succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "posts", "post1"), { comments: increment(1) }));
  });
  await check("setting shares to a negative number is denied", async () => {
    await assertFails(updateDoc(doc(rando, "posts", "post1"), { shares: -5 }));
  });

  console.log("\n== sparks: reactions toggle ==");
  await check("real toggleSparkReaction() add-self shape succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "sparks", "spark1"), {
      "reactions.relate": arrayUnion("rando-uid"),
    }));
  });
  await check("adding someone else's uid is denied", async () => {
    await assertFails(updateDoc(doc(rando, "sparks", "spark1"), {
      "reactions.inspire": arrayUnion("someone-else-uid"),
    }));
  });
  await check("real toggle-off (remove own uid) succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "sparks", "spark1"), {
      "reactions.relate": arrayRemove("rando-uid"),
    }));
  });

  console.log("\n== aiPlaybooks: helpfulByUids toggle + viewCount bump ==");
  await check("real helpful-toggle (add own uid) succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "aiPlaybooks", "pb1"), {
      helpfulByUids: arrayUnion("rando-uid"),
    }));
  });
  await check("setting helpfulByUids to an arbitrary list is denied", async () => {
    await assertFails(updateDoc(doc(rando, "aiPlaybooks", "pb1"), {
      helpfulByUids: ["fake-uid-1", "fake-uid-2"],
    }));
  });
  await check("bumping viewCount by exactly 1 succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "aiPlaybooks", "pb1"), { viewCount: increment(1) }));
  });
  await check("setting viewCount to an arbitrary value is denied", async () => {
    await assertFails(updateDoc(doc(rando, "aiPlaybooks", "pb1"), { viewCount: 50000 }));
  });

  console.log("\n== buildLogs: reactions toggle ==");
  await check("real toggle (add own uid to one sub-array) succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "buildLogs", "log1"), {
      "reactions.collab": arrayUnion("rando-uid"),
    }));
  });
  await check("touching another sub-array alongside a valid toggle is denied", async () => {
    await assertFails(updateDoc(doc(rando, "buildLogs", "log1"), {
      "reactions.relate": arrayUnion("rando-uid"),
      "reactions.inspire": arrayUnion("someone-else-uid"),
    }));
  });

  console.log("\n== reelVibes: likedByUids toggle + commentCount/viewCount bump ==");
  await check("real like-toggle succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "reelVibes", "reel1"), {
      likedByUids: arrayUnion("rando-uid"),
    }));
  });
  await check("bumping commentCount by exactly 1 succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "reelVibes", "reel1"), { commentCount: increment(1) }));
  });
  await check("setting commentCount to an arbitrary value is denied", async () => {
    await assertFails(updateDoc(doc(rando, "reelVibes", "reel1"), { commentCount: 12345 }));
  });

  console.log("\n== perspective_posts: responses append-only ==");
  await check("appending exactly one new response succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "perspective_posts", "pp1"), {
      responses: arrayUnion({ id: "r2", authorId: 42, content: "second" }),
    }));
  });
  await check("replacing the whole array (deleting existing responses) is denied", async () => {
    await assertFails(updateDoc(doc(rando, "perspective_posts", "pp1"), {
      responses: [{ id: "fake", authorId: 999, content: "wiped" }],
    }));
  });
  await check("injecting two fake responses in one write is denied", async () => {
    const snap = await getDoc(doc(rando, "perspective_posts", "pp1"));
    const current = snap.data().responses;
    await assertFails(updateDoc(doc(rando, "perspective_posts", "pp1"), {
      responses: [...current, { id: "fake1", authorId: 1 }, { id: "fake2", authorId: 2 }],
    }));
  });

  console.log("\n== wisdom_threads: hearts/saves bump ==");
  await check("bumping hearts by exactly 1 succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "wisdom_threads", "wt1"), { hearts: increment(1) }));
  });
  await check("setting saves to an arbitrary value is denied", async () => {
    await assertFails(updateDoc(doc(rando, "wisdom_threads", "wt1"), { saves: 777 }));
  });

  console.log("\n== ideas: sparkCount/sparkedByUids toggle + commentCount/forkCount bump ==");
  await check("real sparkIdea() add shape (toggle + count +1) succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "ideas", "idea1"), {
      sparkedByUids: arrayUnion("rando-uid"),
      sparkCount: increment(1),
    }));
  });
  await check("toggling sparkedByUids without moving sparkCount to match is denied", async () => {
    await assertFails(updateDoc(doc(rando, "ideas", "idea1"), {
      sparkedByUids: arrayUnion("second-rando-uid"),
      sparkCount: 999,
    }));
  });
  await check("real un-spark shape (remove self, count -1) succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "ideas", "idea1"), {
      sparkedByUids: arrayRemove("rando-uid"),
      sparkCount: increment(-1),
    }));
  });
  await check("bumping commentCount by exactly 1 succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "ideas", "idea1"), { commentCount: increment(1) }));
  });
  await check("setting forkCount to an arbitrary value is denied", async () => {
    await assertFails(updateDoc(doc(rando, "ideas", "idea1"), { forkCount: 42 }));
  });

  console.log("\n== arena_challenges / factory_startups: viewCount bump ==");
  await check("arena_challenges: bumping viewCount by exactly 1 succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "arena_challenges", "ch1"), { viewCount: increment(1) }));
  });
  await check("arena_challenges: setting viewCount to an arbitrary value is denied", async () => {
    await assertFails(updateDoc(doc(rando, "arena_challenges", "ch1"), { viewCount: 999999 }));
  });
  await check("factory_startups: bumping viewCount by exactly 1 succeeds", async () => {
    await assertSucceeds(updateDoc(doc(rando, "factory_startups", "fs1"), { viewCount: increment(1) }));
  });
  await check("factory_startups: setting viewCount to an arbitrary value is denied", async () => {
    await assertFails(updateDoc(doc(rando, "factory_startups", "fs1"), { viewCount: -1 }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
