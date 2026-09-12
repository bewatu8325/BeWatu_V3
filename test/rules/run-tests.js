const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");

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
    await db.doc("content_reports/r1").set({ reporterUid: "someone", reason: "x" });
    await db.doc("users/victim").set({ isPublic: false, email: "victim@x.com" });
  });

  const atk = testEnv.authenticatedContext("atk").firestore();
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

  console.log("\n== Still-open findings (should remain vulnerable — not fixed in this draft) ==");
  await check("users: any authed user can still read a private profile (KNOWN, unfixed)", atk.doc("users/victim").get(), "ALLOW");
  await check("content_reports: any authed user can still read all reports (KNOWN, unfixed)", atk.doc("content_reports/r1").get(), "ALLOW");
  await check("circles/challenges: still open pending postedByUid app fix (KNOWN, flagged)", atk.collection("circles/c1/challenges").add({ postedBy: "Some Name" }), "ALLOW");

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
