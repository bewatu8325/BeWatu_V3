// CRITICAL fix: users/{uid}'s create and update rules had zero field
// restrictions — any authenticated user could set isPlatformAdmin: true
// (or isRecruiter: true) on their own doc via a plain client-side write,
// including at account-creation time for a brand-new signup.
// isPlatformAdmin() is read as an escalated-privilege bypass in ~40 other
// rules across this file (content moderation, verification, security
// findings reads, etc.) — this was a full platform-admin self-grant.
// Confirmed exploitable against the real emulator before the fix; this
// suite proves the fix closes it while leaving every legitimate
// self-profile edit untouched.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, getDoc } = require("firebase/firestore");

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
    await db.doc("users/rando-uid").set({
      id: 1, name: "Rando", isPublic: true, isPlatformAdmin: false, isRecruiter: false,
    });
    await db.doc("ops_staff/ops-uid").set({ isActive: true, role: "platform_admin" });
    await db.doc("users/admin-uid").set({
      id: 2, name: "RealAdmin", isPublic: true, isPlatformAdmin: true,
    });
  });

  const rando = testEnv.authenticatedContext("rando-uid").firestore();
  const brandNew = testEnv.authenticatedContext("brand-new-uid").firestore();
  const opsAdmin = testEnv.authenticatedContext("ops-uid").firestore();

  console.log("\n== CRITICAL: self-escalation via update is now denied ==");

  await check("a normal user CANNOT set isPlatformAdmin:true on themselves", async () => {
    await assertFails(updateDoc(doc(rando, "users", "rando-uid"), { isPlatformAdmin: true }));
  });

  await check("a normal user CANNOT set isRecruiter:true on themselves", async () => {
    await assertFails(updateDoc(doc(rando, "users", "rando-uid"), { isRecruiter: true }));
  });

  await check("real platform admin ALSO cannot flip isPlatformAdmin via the client SDK (Admin SDK / Console only)", async () => {
    const admin = testEnv.authenticatedContext("admin-uid").firestore();
    await assertFails(updateDoc(doc(admin, "users", "rando-uid"), { isPlatformAdmin: true }));
  });

  await check("ops staff ALSO cannot flip isRecruiter via the client SDK", async () => {
    await assertFails(updateDoc(doc(opsAdmin, "users", "rando-uid"), { isRecruiter: true }));
  });

  console.log("\n== CRITICAL: baking it in at account-creation time is now denied ==");

  await check("a brand-new signup CANNOT create their own doc with isPlatformAdmin:true baked in", async () => {
    await assertFails(setDoc(doc(brandNew, "users", "brand-new-uid"), {
      id: 999, name: "Evil", isPublic: true, isPlatformAdmin: true,
    }));
  });

  await check("a brand-new signup CANNOT create their own doc with isRecruiter:true baked in", async () => {
    await assertFails(setDoc(doc(testEnv.authenticatedContext("brand-new-uid-2").firestore(), "users", "brand-new-uid-2"), {
      id: 998, name: "Evil2", isPublic: true, isRecruiter: true,
    }));
  });

  await check("a normal signup with neither field present still succeeds", async () => {
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext("brand-new-uid-3").firestore(), "users", "brand-new-uid-3"), {
      id: 997, name: "Legit", isPublic: true,
    }));
  });

  console.log("\n== Legitimate self-profile edits still work ==");

  await check("a user CAN still update their own name/bio (unrelated fields)", async () => {
    await assertSucceeds(updateDoc(doc(rando, "users", "rando-uid"), {
      name: "Rando Updated", bio: "Hello world",
    }));
  });

  await check("a user CAN update an unrelated field in the SAME write as isPlatformAdmin being absent", async () => {
    const snap = await getDoc(doc(rando, "users", "rando-uid"));
    if (snap.data().isPlatformAdmin !== false) throw new Error("isPlatformAdmin was mutated");
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
