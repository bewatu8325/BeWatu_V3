const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");

// Reads the repo's real firestore.rules (the same file firebase.json and a
// real deploy use) — not a copy inside test/rules/.
const RULES_PATH = path.join(__dirname, "..", "..", "firestore.rules");

let pass = 0, fail = 0;
async function check(label, promise, expect) {
  // expect: 'ALLOW' | 'DENY'
  try {
    if (expect === "ALLOW") {
      await assertSucceeds(promise);
    } else {
      await assertFails(promise);
    }
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

  // Seed data as admin (bypasses rules) so tests exercise reads/writes against
  // realistic existing documents.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("factory_team_posts/p1").set({ authorUid: "f1", title: "x" });
    await db.doc("factory_incubators/i1").set({ name: "Incubator One" });
    await db.doc("factory_incubators/i1/applications/a1").set({ founderUid: "f1", startupId: "s1" });
    await db.doc("factory_startups/s1").set({ createdBy: "f1", founderUids: ["f1", "f2"], funding: 500 });
    await db.doc("factory_teams/t1").set({ createdBy: "f1", memberUids: ["f1", "f2"], name: "Team" });
    await db.doc("factory_projects/pr1").set({ createdBy: "f1", teamId: "t1" });
    await db.doc("startups/su1").set({ createdBy: "f1" });
    await db.doc("factory_investors/inv1").set({ user: { id: "inv1" }, firm: "Acme" });
    await db.doc("circles/c1").set({ adminId: "owner", members: ["owner"] });
    await db.doc("circles/c1/members/owner").set({ notifyOnPost: true });
    await db.doc("circles/c1/challenges/ch1").set({ question: "q", postedBy: "F1", postedByUid: "f1", responses: [], status: "open" });
    await db.doc("content_reports/r1").set({ reportedBy: "someone", reason: "x" });
    await db.doc("users/victim").set({ isPublic: false, displayName: "Victim" });
    await db.doc("users/victim/private/contact").set({ email: "victim@x.com", phone: "555-1234", location: "SF", stripeCustomerId: "cus_abc" });
    await db.doc("ops_staff/ops1").set({ role: "trust_agent", isActive: true });
  });

  const atk = testEnv.authenticatedContext("atk").firestore();
  const ops1 = testEnv.authenticatedContext("ops1").firestore();
  const f1  = testEnv.authenticatedContext("f1").firestore();
  const f2  = testEnv.authenticatedContext("f2").firestore();
  const inv1 = testEnv.authenticatedContext("inv1").firestore();

  console.log("\n== #5 audit fixes (this session) ==");
  await check("factory_team_posts: author CAN update",              f1.doc("factory_team_posts/p1").update({ title: "y" }), "ALLOW");
  await check("factory_team_posts: non-author CANNOT update",       atk.doc("factory_team_posts/p1").update({ title: "y" }), "DENY");
  await check("factory_team_posts: non-author CANNOT delete",       atk.doc("factory_team_posts/p1").delete(), "DENY");
  await check("factory_team_posts: spoofed authorUid on create denied", atk.doc("factory_team_posts/p9").set({ authorUid: "someoneelse" }), "DENY");

  await check("factory_incubators: random user CANNOT update program", atk.doc("factory_incubators/i1").update({ name: "hacked" }), "DENY");
  await check("factory_incubators: random user CANNOT create program", atk.doc("factory_incubators/i9").set({ name: "fake" }), "DENY");

  await check("incubator application: founder CAN read own",        f1.doc("factory_incubators/i1/applications/a1").get(), "ALLOW");
  await check("incubator application: stranger CANNOT read",        atk.doc("factory_incubators/i1/applications/a1").get(), "DENY");
  await check("incubator application: founder CANNOT self-approve", f1.doc("factory_incubators/i1/applications/a1").update({ status: "approved" }), "DENY");
  await check("incubator application: spoofed founderUid on create denied", atk.doc("factory_incubators/i1/applications/a9").set({ founderUid: "victim" }), "DENY");

  console.log("\n== Decision-4 fixes (previous session) ==");
  await check("factory_startups: founder (in founderUids) CAN update", f2.doc("factory_startups/s1").update({ funding: 900 }), "ALLOW");
  await check("factory_startups: non-founder CANNOT update",       atk.doc("factory_startups/s1").update({ funding: 999999 }), "DENY");
  await check("factory_teams: member (in memberUids) CAN update",  f2.doc("factory_teams/t1").update({ name: "renamed" }), "ALLOW");
  await check("factory_teams: non-member CANNOT update",           atk.doc("factory_teams/t1").update({ name: "hacked" }), "DENY");
  await check("factory_projects: team member CAN update via parent team", f2.doc("factory_projects/pr1").update({ status: "active" }), "ALLOW");
  await check("startups (top-level): non-owner CANNOT update",     atk.doc("startups/su1").update({ x: 1 }), "DENY");
  // factory_investors.create is superseded below — Decision 4 went with
  // reviewed onboarding, so client create is always denied, self or not.
  await check("funding_offers: non-investor CANNOT create an offer", atk.collection("funding_offers").add({ investorUid: "atk", founderUids: ["f1"], status: "pending" }), "DENY");
  await check("funding_offers: real investor CAN create an offer",   inv1.collection("funding_offers").add({ investorUid: "inv1", founderUids: ["f1"], status: "pending" }), "ALLOW");

  console.log("\n== Decision 4: reviewed investor onboarding (this pass) ==");
  await check("factory_investors: client create is now always denied, even self", inv1.doc("factory_investors/inv9").set({ user: { id: "inv1" } }), "DENY");
  await check("factory_investors: client create is denied even spoofing another uid", atk.doc("factory_investors/inv10").set({ user: { id: "victim" } }), "DENY");
  await check("investor_applications: applicant CAN create with the real 'uid' field", inv1.collection("investor_applications").add({ uid: "inv1", status: "pending" }), "ALLOW");
  await check("investor_applications: applicant CAN read their own",   inv1.collection("investor_applications").where("uid", "==", "inv1").get(), "ALLOW");

  console.log("\n== circles fix (this pass, P0 3) ==");
  await check("circles: admin CAN update",                       testEnv.authenticatedContext("owner").firestore().doc("circles/c1").update({ name: "renamed" }), "ALLOW");
  await check("circles: non-admin CANNOT update arbitrary fields", atk.doc("circles/c1").update({ adminId: "atk" }), "DENY");
  await check("circles: non-admin CAN leave (members-only diff)",  atk.doc("circles/c1").update({ members: ["owner"], updatedAt: 1 }), "ALLOW");
  await check("circles/members: self CAN write own prefs",         testEnv.authenticatedContext("owner").firestore().doc("circles/c1/members/owner").update({ notifyOnPost: false }), "ALLOW");
  await check("circles/members: stranger CANNOT write another member's prefs", atk.doc("circles/c1/members/owner").update({ notifyOnPost: false }), "DENY");

  console.log("\n== P0 2 fix: users PII split into users/{uid}/private/contact ==");
  await check("users: the main doc (no PII left) is still readable by any authed user", atk.doc("users/victim").get(), "ALLOW");
  await check("users/private/contact: a stranger CANNOT read someone else's email/phone/location", atk.doc("users/victim/private/contact").get(), "DENY");
  await check("users/private/contact: the owner CAN read their own", testEnv.authenticatedContext("victim").firestore().doc("users/victim/private/contact").get(), "ALLOW");
  await check("users/private/contact: a stranger CANNOT write into someone else's", atk.doc("users/victim/private/contact").set({ email: "hacked@x.com" }), "DENY");
  await check("users/private/contact: the owner CAN update their own", testEnv.authenticatedContext("victim").firestore().doc("users/victim/private/contact").update({ phone: "555-9999" }), "ALLOW");

  console.log("\n== circles/challenges fix (this pass, P0 3): postedByUid ownership ==");
  await check("circles/challenges: create with a spoofed postedByUid is denied", atk.collection("circles/c1/challenges").add({ postedBy: "Some Name", postedByUid: "someone-else" }), "DENY");
  await check("circles/challenges: create with your own postedByUid is allowed", atk.collection("circles/c1/challenges").add({ postedBy: "Attacker", postedByUid: "atk" }), "ALLOW");
  await check("circles/challenges: author CAN update their own question", f1.doc("circles/c1/challenges/ch1").update({ question: "edited" }), "ALLOW");
  await check("circles/challenges: non-author CANNOT update the question", atk.doc("circles/c1/challenges/ch1").update({ question: "hacked" }), "DENY");
  await check("circles/challenges: non-author CAN update responses-only (future feature, scoped now)", atk.doc("circles/c1/challenges/ch1").update({ responses: [{ id: "r1" }] }), "ALLOW");
  await check("circles/challenges: non-author CANNOT delete someone else's challenge", atk.doc("circles/c1/challenges/ch1").delete(), "DENY");
  await check("circles/challenges: author CAN delete their own challenge", f1.doc("circles/c1/challenges/ch1").delete(), "ALLOW");

  console.log("\n== P0 4 fix: content_reports locked to the reporter or ops ==");
  await check("content_reports: a stranger CANNOT read someone else's report", atk.doc("content_reports/r1").get(), "DENY");
  await check("content_reports: the reporter CAN read their own", testEnv.authenticatedContext("someone").firestore().doc("content_reports/r1").get(), "ALLOW");
  await check("content_reports: ops staff CAN read a report that isn't theirs", ops1.doc("content_reports/r1").get(), "ALLOW");
  await check("content_reports: any authed user can still file a new report", atk.collection("content_reports").add({ reportedBy: "atk", reason: "spam" }), "ALLOW");

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
