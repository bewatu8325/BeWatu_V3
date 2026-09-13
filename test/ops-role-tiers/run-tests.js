// P1 fix: "Ops role tiers not enforced" — support_tickets was a blanket
// `if isOpsStaff()` for write, and audit_log's create didn't bind actorUid.
// bewatu-ops's own ROLES definition (src/App.jsx) documents `auditor` as
// "Read-only access to all modules and audit log. No write permissions"
// and never grants `cyber_agent` the tickets domain at all — but nothing at
// the data layer enforced either. This exercises the real roles and the
// real writeAuditEntry()/createTicket() shapes against the enforced rules.
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
    await db.doc("ops_staff/auditor-uid").set({ isActive: true, role: "auditor" });
    await db.doc("ops_staff/cyber-uid").set({ isActive: true, role: "cyber_agent" });
    await db.doc("ops_staff/support-uid").set({ isActive: true, role: "support_agent" });
    await db.doc("ops_staff/admin-uid").set({ isActive: true, role: "platform_admin" });
    await db.doc("support_tickets/ticket1").set({ subject: "Help", status: "open" });
  });

  const auditor = testEnv.authenticatedContext("auditor-uid").firestore();
  const cyber   = testEnv.authenticatedContext("cyber-uid").firestore();
  const support = testEnv.authenticatedContext("support-uid").firestore();
  const admin   = testEnv.authenticatedContext("admin-uid").firestore();

  console.log("\n== support_tickets: auditor and cyber_agent are read-only ==");

  await check("auditor CANNOT create a support ticket (real createTicket() shape)", async () => {
    await assertFails(addDoc(collection(auditor, "support_tickets"), {
      subject: "Fake", status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  await check("cyber_agent CANNOT create a support ticket (not even granted the tickets domain)", async () => {
    await assertFails(addDoc(collection(cyber, "support_tickets"), {
      subject: "Fake", status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  await check("auditor CANNOT update an existing ticket", async () => {
    await assertFails(updateDoc(doc(auditor, "support_tickets", "ticket1"), { status: "closed" }));
  });

  await check("a real support agent CAN still create and update tickets", async () => {
    const ref = await addDoc(collection(support, "support_tickets"), {
      subject: "Real ticket", status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(updateDoc(ref, { status: "resolved" }));
  });

  await check("even a support agent CANNOT delete a ticket (platform_admin only)", async () => {
    await assertFails(deleteDoc(doc(support, "support_tickets", "ticket1")));
  });

  await check("platform_admin CAN delete a ticket", async () => {
    await assertSucceeds(deleteDoc(doc(admin, "support_tickets", "ticket1")));
  });

  await check("auditor CAN still read tickets (read-only, not no-access)", async () => {
    const { getDocs } = require("firebase/firestore");
    await assertSucceeds(getDocs(collection(auditor, "support_tickets")));
  });

  console.log("\n== audit_log: actorUid must match the real caller ==");

  await check("real writeAuditEntry() shape (actorUid == caller) succeeds", async () => {
    await assertSucceeds(addDoc(collection(support, "audit_log"), {
      action: "ticket.resolve", actorUid: "support-uid", actorEmail: "s@bewatu.com",
      actorRole: "support_agent", targetId: "ticket1", targetType: "support_ticket",
      before: null, after: { status: "resolved" }, reason: "", ip: "unknown",
      requiresApproval: false, approved: false, ts: serverTimestamp(),
    }));
  });

  await check("misattributing an entry to a different staffer's actorUid is denied", async () => {
    await assertFails(addDoc(collection(support, "audit_log"), {
      action: "user.suspend", actorUid: "admin-uid", actorEmail: "a@bewatu.com",
      actorRole: "platform_admin", targetId: "user1", targetType: "user",
      before: null, after: null, reason: "framed", ip: "unknown",
      requiresApproval: true, approved: false, ts: serverTimestamp(),
    }));
  });

  await check("even auditor CAN still read the audit log (read-only, not no-access)", async () => {
    const { getDocs } = require("firebase/firestore");
    await assertSucceeds(getDocs(collection(auditor, "audit_log")));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
