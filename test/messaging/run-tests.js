// P0 11 verification: subscribeToMessageThreads replaced fetchAllMessagesForUser
// (old: unbounded N+1 — one query for threads, then a sequential unbounded
// query per thread for its full history). The new function does exactly one
// bounded query over the thread docs themselves and derives a synthetic
// preview "message" per thread from fields sendMessage() already writes
// (lastMessage/lastMessageAt/lastSenderUid/participantNumericIds).
//
// This test exercises the REAL query against the REAL enforced rules on the
// Firestore Emulator (the same array-contains query fetchAllMessagesForUser
// always used, so no new rule surface is introduced), then applies the exact
// transform subscribeToMessageThreads uses and asserts the resulting preview
// is correct in both message directions.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { collection, doc, query, where, getDoc, getDocs } = require("firebase/firestore");

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

// Mirrors subscribeToMessageThreads' transform in lib/firestoreService.ts
// exactly, so this test proves the transform's logic, not just the query.
function toPreview(threadDocId, data, uid, numericId) {
  const participantNumericIds = data.participantNumericIds ?? [];
  const partnerNumericId = participantNumericIds.find((id) => id !== numericId) ?? numericId;
  const lastSenderIsMe = data.lastSenderUid === uid;
  return {
    senderId: lastSenderIsMe ? numericId : partnerNumericId,
    receiverId: lastSenderIsMe ? partnerNumericId : numericId,
    text: data.lastMessage ?? "",
    _firestoreId: threadDocId,
    _isPreview: true,
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

  // Seed exactly what sendMessage() writes for two threads: alice<->bob
  // (bob sent last) and alice<->carol (alice sent last).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("messages/alice_bob").set({
      participants: ["alice", "bob"],
      participantNumericIds: [1, 2], // [alice=1, bob=2]
      lastMessage: "hey!",
      lastMessageAt: new Date(),
      lastSenderUid: "bob",
    });
    await db.doc("messages/alice_carol").set({
      participants: ["alice", "carol"],
      participantNumericIds: [1, 3], // [alice=1, carol=3]
      lastMessage: "how's it going",
      lastMessageAt: new Date(),
      lastSenderUid: "alice",
    });
    // A thread alice is NOT part of — must never come back for her query.
    await db.doc("messages/bob_carol").set({
      participants: ["bob", "carol"],
      participantNumericIds: [2, 3],
      lastMessage: "unrelated",
      lastMessageAt: new Date(),
      lastSenderUid: "bob",
    });
  });

  const alice = testEnv.authenticatedContext("alice").firestore();
  const ALICE_NUMERIC_ID = 1;

  console.log("\n== P0 11: subscribeToMessageThreads (bounded, live thread previews) ==");

  await check("query returns exactly alice's 2 threads, not bob/carol's", async () => {
    const snap = await assertSucceeds(
      getDocs(query(collection(alice, "messages"), where("participants", "array-contains", "alice")))
    );
    if (snap.docs.length !== 2) throw new Error(`expected 2 threads, got ${snap.docs.length}`);
    const ids = snap.docs.map(d => d.id).sort();
    if (ids.join(",") !== "alice_bob,alice_carol") throw new Error(`unexpected thread ids: ${ids}`);
  });

  await check("preview direction is correct when the OTHER user sent last (bob->alice)", async () => {
    const snap = await getDocs(query(collection(alice, "messages"), where("participants", "array-contains", "alice")));
    const threadDoc = snap.docs.find(d => d.id === "alice_bob");
    const preview = toPreview(threadDoc.id, threadDoc.data(), "alice", ALICE_NUMERIC_ID);
    if (preview.senderId !== 2 || preview.receiverId !== 1) {
      throw new Error(`expected senderId=2 (bob) receiverId=1 (alice), got ${JSON.stringify(preview)}`);
    }
  });

  await check("preview direction is correct when I (alice) sent last", async () => {
    const snap = await getDocs(query(collection(alice, "messages"), where("participants", "array-contains", "alice")));
    const threadDoc = snap.docs.find(d => d.id === "alice_carol");
    const preview = toPreview(threadDoc.id, threadDoc.data(), "alice", ALICE_NUMERIC_ID);
    if (preview.senderId !== 1 || preview.receiverId !== 3) {
      throw new Error(`expected senderId=1 (alice) receiverId=3 (carol), got ${JSON.stringify(preview)}`);
    }
  });

  await check("a stranger (not a participant) is denied reading alice's thread doc directly", async () => {
    const eve = testEnv.authenticatedContext("eve").firestore();
    await assertFails(getDoc(doc(eve, "messages", "alice_bob")));
  });

  await check("a stranger's own array-contains query legitimately comes back empty (no leak)", async () => {
    const eve = testEnv.authenticatedContext("eve").firestore();
    const snap = await assertSucceeds(
      getDocs(query(collection(eve, "messages"), where("participants", "array-contains", "eve")))
    );
    if (snap.docs.length !== 0) throw new Error(`expected 0 threads for eve, got ${snap.docs.length}`);
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
