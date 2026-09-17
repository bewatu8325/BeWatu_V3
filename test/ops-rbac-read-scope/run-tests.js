// P1 fix: "Ops RBAC enforcement depth" — bewatu-ops's own ROLES/PERMISSIONS
// (src/App.jsx) document a real 14-role, domain-scoped access model, and
// the WRITE side of most of these collections already enforced it
// correctly (per-collection role lists, already reviewed in earlier
// passes) — but READ was left as a blanket isOpsStaff() almost everywhere,
// meaning any active ops staffer, regardless of role, could read fraud
// cases, watchlists, security findings, appeals, and more, none of which
// their own documented role grants them. Scoped every read (and, where the
// domain drew a real distinction bewatu-ops's own PERMISSIONS comments
// describe, a couple of writes too — approval_requests specifically) to
// match the same role lists the write side already trusted.
//
// One collection deliberately NOT touched here: data_requests. Its update
// rule (opsRole() != 'auditor', not scoped to the legal domain
// PERMISSIONS.datareqs lists) was a specific, already-tested decision from
// an earlier pass (test/ops-role-tiers) — this fix doesn't relitigate it.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, updateDoc } = require("firebase/firestore");

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
    const staff = {
      "support-uid":       "support_agent",
      "trust-uid":         "trust_agent",
      "trust-mgr-uid":     "trust_manager",
      "finance-uid":       "finance_agent",
      "verif-agent-uid":   "verification_agent",
      "verif-mgr-uid":     "verification_manager",
      "cyber-uid":         "cyber_agent",
      "investigator-uid":  "investigator",
      "auditor-uid":       "auditor",
      "admin-uid":         "platform_admin",
    };
    for (const [uid, role] of Object.entries(staff)) {
      await db.doc(`ops_staff/${uid}`).set({ role, isActive: true });
    }

    await db.doc("support_tickets/t1").set({ subject: "x", status: "open" });
    await db.doc("fraud_cases/fc1").set({ summary: "x" });
    await db.doc("content_reports/cr1").set({ reportedBy: "someone", reason: "x" });
    await db.doc("appeals/ap1").set({ status: "pending" });
    await db.doc("watchlist_fraud/wf1").set({ userId: "u1" });
    await db.doc("watchlist_payment/wp1").set({ userId: "u1" });
    await db.doc("watchlist_legal/wl1").set({ userId: "u1" });
    await db.doc("fraud_list/fl1").set({ reason: "x" });
    await db.doc("investigations/inv1").set({ status: "open" });
    await db.doc("security_findings/sf1").set({ title: "x" });
    await db.doc("remediation_plans/rp1").set({ summary: "x" });
    await db.doc("approval_requests/ar1").set({ status: "pending" });
    await db.doc("asset_graph/ag1").set({ name: "x" });
    await db.doc("security_events/se1").set({ type: "x" });
    await db.doc("reel_verification_queue/rv1").set({ reelId: "r1" });
    await db.doc("verificationRequests/vr1").set({ recruiterUid: "someone-else" });
    await db.doc("recruiter_applications/ra1").set({ uid: "someone-else" });
  });

  const ctx = (uid) => testEnv.authenticatedContext(uid).firestore();
  const support      = ctx("support-uid");
  const trust        = ctx("trust-uid");
  const trustMgr     = ctx("trust-mgr-uid");
  const finance      = ctx("finance-uid");
  const verifAgent   = ctx("verif-agent-uid");
  const verifMgr     = ctx("verif-mgr-uid");
  const cyber        = ctx("cyber-uid");
  const investigator = ctx("investigator-uid");
  const auditor      = ctx("auditor-uid");
  const admin        = ctx("admin-uid");

  console.log("\n== support_tickets: cyber_agent isn't granted this domain at all ==");
  await check("cyber_agent CANNOT read support_tickets", async () => {
    await assertFails(getDoc(doc(cyber, "support_tickets", "t1")));
  });
  await check("support_agent CAN still read support_tickets", async () => {
    await assertSucceeds(getDoc(doc(support, "support_tickets", "t1")));
  });
  await check("auditor CAN still read support_tickets", async () => {
    await assertSucceeds(getDoc(doc(auditor, "support_tickets", "t1")));
  });

  console.log("\n== fraud_cases: trust domain only ==");
  await check("finance_agent CANNOT read fraud_cases", async () => {
    await assertFails(getDoc(doc(finance, "fraud_cases", "fc1")));
  });
  await check("trust_agent CAN read fraud_cases", async () => {
    await assertSucceeds(getDoc(doc(trust, "fraud_cases", "fc1")));
  });
  await check("auditor CAN read fraud_cases", async () => {
    await assertSucceeds(getDoc(doc(auditor, "fraud_cases", "fc1")));
  });

  console.log("\n== content_reports: trust + support only (not finance/verification) ==");
  await check("finance_agent CANNOT read someone else's content_report", async () => {
    await assertFails(getDoc(doc(finance, "content_reports", "cr1")));
  });
  await check("trust_agent CAN read a content_report that isn't theirs", async () => {
    await assertSucceeds(getDoc(doc(trust, "content_reports", "cr1")));
  });

  console.log("\n== appeals: trust + legal + support only (not finance/verification) ==");
  await check("verification_agent CANNOT read appeals", async () => {
    await assertFails(getDoc(doc(verifAgent, "appeals", "ap1")));
  });
  await check("trust_agent CAN read appeals", async () => {
    await assertSucceeds(getDoc(doc(trust, "appeals", "ap1")));
  });
  await check("auditor CAN read appeals", async () => {
    await assertSucceeds(getDoc(doc(auditor, "appeals", "ap1")));
  });

  console.log("\n== watchlists: scoped per-watchlist, not blanket ==");
  await check("verification_agent CANNOT read watchlist_fraud", async () => {
    await assertFails(getDoc(doc(verifAgent, "watchlist_fraud", "wf1")));
  });
  await check("investigator CAN read watchlist_fraud", async () => {
    await assertSucceeds(getDoc(doc(investigator, "watchlist_fraud", "wf1")));
  });
  await check("verification_agent CANNOT read watchlist_payment (finance/trust/legal only)", async () => {
    await assertFails(getDoc(doc(verifAgent, "watchlist_payment", "wp1")));
  });
  await check("finance_agent CAN read watchlist_payment", async () => {
    await assertSucceeds(getDoc(doc(finance, "watchlist_payment", "wp1")));
  });
  await check("finance_agent CANNOT read watchlist_legal (legal-only, no finance_agent)", async () => {
    await assertFails(getDoc(doc(finance, "watchlist_legal", "wl1")));
  });

  console.log("\n== fraud_list: trust/legal/investigator only ==");
  await check("finance_agent CANNOT read fraud_list", async () => {
    await assertFails(getDoc(doc(finance, "fraud_list", "fl1")));
  });
  await check("trust_manager CAN read fraud_list", async () => {
    await assertSucceeds(getDoc(doc(trustMgr, "fraud_list", "fl1")));
  });
  await check("auditor CAN read fraud_list", async () => {
    await assertSucceeds(getDoc(doc(auditor, "fraud_list", "fl1")));
  });

  console.log("\n== investigations: trust/legal/support/investigator only ==");
  await check("verification_agent CANNOT read investigations", async () => {
    await assertFails(getDoc(doc(verifAgent, "investigations", "inv1")));
  });
  await check("investigator CAN read investigations", async () => {
    await assertSucceeds(getDoc(doc(investigator, "investigations", "inv1")));
  });

  console.log("\n== security platform: cyber_agent + admin + auditor only ==");
  await check("finance_agent CANNOT read security_findings", async () => {
    await assertFails(getDoc(doc(finance, "security_findings", "sf1")));
  });
  await check("cyber_agent CAN read security_findings", async () => {
    await assertSucceeds(getDoc(doc(cyber, "security_findings", "sf1")));
  });
  await check("auditor CAN read security_findings", async () => {
    await assertSucceeds(getDoc(doc(auditor, "security_findings", "sf1")));
  });
  await check("finance_agent CANNOT read remediation_plans", async () => {
    await assertFails(getDoc(doc(finance, "remediation_plans", "rp1")));
  });
  await check("finance_agent CANNOT read asset_graph", async () => {
    await assertFails(getDoc(doc(finance, "asset_graph", "ag1")));
  });
  await check("finance_agent CANNOT read security_events", async () => {
    await assertFails(getDoc(doc(finance, "security_events", "se1")));
  });

  console.log("\n== approval_requests: cyber_agent can view, only platform_admin can approve ==");
  await check("cyber_agent CAN read approval_requests (view + triage)", async () => {
    await assertSucceeds(getDoc(doc(cyber, "approval_requests", "ar1")));
  });
  await check("cyber_agent CANNOT approve a remediation (admin-only action)", async () => {
    await assertFails(updateDoc(doc(cyber, "approval_requests", "ar1"), { status: "approved" }));
  });
  await check("platform_admin CAN approve a remediation", async () => {
    await assertSucceeds(updateDoc(doc(admin, "approval_requests", "ar1"), { status: "approved" }));
  });

  console.log("\n== reel_verification_queue: trust + verification domain only ==");
  await check("finance_agent CANNOT read reel_verification_queue", async () => {
    await assertFails(getDoc(doc(finance, "reel_verification_queue", "rv1")));
  });
  await check("trust_agent CAN read reel_verification_queue", async () => {
    await assertSucceeds(getDoc(doc(trust, "reel_verification_queue", "rv1")));
  });
  await check("verification_manager CAN update reel_verification_queue", async () => {
    await assertSucceeds(updateDoc(doc(verifMgr, "reel_verification_queue", "rv1"), { status: "reviewed" }));
  });
  await check("finance_agent CANNOT update reel_verification_queue", async () => {
    await assertFails(updateDoc(doc(finance, "reel_verification_queue", "rv1"), { status: "reviewed" }));
  });

  console.log("\n== verificationRequests: verification domain only (for the ops-access clause) ==");
  await check("support_agent CANNOT read someone else's verificationRequests (not their own, not verification staff)", async () => {
    await assertFails(getDoc(doc(support, "verificationRequests", "vr1")));
  });
  await check("verification_agent CAN read verificationRequests", async () => {
    await assertSucceeds(getDoc(doc(verifAgent, "verificationRequests", "vr1")));
  });
  await check("verification_manager CAN update verificationRequests", async () => {
    await assertSucceeds(updateDoc(doc(verifMgr, "verificationRequests", "vr1"), { status: "approved" }));
  });
  await check("support_agent CANNOT update verificationRequests", async () => {
    await assertFails(updateDoc(doc(support, "verificationRequests", "vr1"), { status: "approved" }));
  });

  console.log("\n== recruiter_applications: trust domain only ==");
  await check("finance_agent CANNOT read someone else's recruiter_applications", async () => {
    await assertFails(getDoc(doc(finance, "recruiter_applications", "ra1")));
  });
  await check("trust_agent CAN read recruiter_applications", async () => {
    await assertSucceeds(getDoc(doc(trust, "recruiter_applications", "ra1")));
  });
  await check("trust_manager CAN update recruiter_applications", async () => {
    await assertSucceeds(updateDoc(doc(trustMgr, "recruiter_applications", "ra1"), { status: "reviewed" }));
  });
  await check("finance_agent CANNOT update recruiter_applications", async () => {
    await assertFails(updateDoc(doc(finance, "recruiter_applications", "ra1"), { status: "reviewed" }));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
