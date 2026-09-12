// P0 11 verification: joinOpenCircle() and removeMemberFromCircle() replaced
// two handlers (handleAddMemberToCircle / handleRemoveMemberFromCircle in
// App.tsx) that were setData(...)-only — no Firestore write at all. Joining
// an open pod via the "Join" button, and an admin removing a member, both
// looked like they worked (optimistic local state) but silently reverted on
// reload since nothing was ever persisted. This exercises the real writes
// against the real enforced rules on the Firestore Emulator.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, updateDoc, serverTimestamp } = require("firebase/firestore");

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

// Mirrors joinOpenCircle()/removeMemberFromCircle() in lib/firestoreService.ts
// exactly (single collection, since this test seeds only `pods`), so this
// proves both the query/write shape and the rule that authorizes it.
async function joinOpenCircle(clientDb, podId, userNumericId) {
  const ref = doc(clientDb, "pods", podId);
  const snap = await getDoc(ref);
  const members = snap.data().members ?? [];
  if (members.includes(userNumericId)) return;
  await updateDoc(ref, { members: [...members, userNumericId], updatedAt: serverTimestamp() });
}
async function removeMemberFromCircle(clientDb, podId, memberNumericId) {
  const ref = doc(clientDb, "pods", podId);
  const snap = await getDoc(ref);
  const members = snap.data().members ?? [];
  await updateDoc(ref, { members: members.filter((m) => m !== memberNumericId), updatedAt: serverTimestamp() });
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
    await db.doc("pods/p1").set({
      adminUid: "admin-uid",
      adminId: 1,
      creatorUid: "admin-uid",
      members: [1], // just the admin so far
      pendingMembers: [],
      pendingInvites: [],
      visibility: "open",
    });
  });

  const rando = testEnv.authenticatedContext("rando").firestore();
  const admin  = testEnv.authenticatedContext("admin-uid").firestore();

  console.log("\n== P0 11: joinOpenCircle / removeMemberFromCircle actually persist ==");

  await check("joinOpenCircle: any authed user CAN add themselves to an open pod's members", async () => {
    await assertSucceeds(joinOpenCircle(rando, "p1", 42));
  });

  await check("joinOpenCircle: the write actually stuck (readable back)", async () => {
    const snap = await getDoc(doc(rando, "pods", "p1"));
    const members = snap.data().members;
    if (!members.includes(42)) throw new Error(`expected 42 in members, got ${JSON.stringify(members)}`);
  });

  await check("joinOpenCircle: joining twice is a no-op, not a duplicate", async () => {
    await joinOpenCircle(rando, "p1", 42);
    const snap = await getDoc(doc(rando, "pods", "p1"));
    const count = snap.data().members.filter((m) => m === 42).length;
    if (count !== 1) throw new Error(`expected exactly one 42, got ${count}`);
  });

  await check("removeMemberFromCircle: (admin action) actually removes the member", async () => {
    await assertSucceeds(removeMemberFromCircle(admin, "p1", 42));
    const snap = await getDoc(doc(admin, "pods", "p1"));
    if (snap.data().members.includes(42)) throw new Error("42 is still a member after removal");
  });

  await check("removeMemberFromCircle: the removed member is gone even read back by a stranger", async () => {
    const snap = await getDoc(doc(rando, "pods", "p1"));
    if (snap.data().members.includes(42)) throw new Error("42 still present on re-read");
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
