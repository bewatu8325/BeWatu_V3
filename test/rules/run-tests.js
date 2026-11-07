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
    await db.doc("ops_staff/support1").set({ role: "support_agent", isActive: true });
    await db.doc("users/padmin").set({ isPlatformAdmin: true, displayName: "Platform Admin" });
    await db.doc("compliance_exports/BW-1").set({ bundleId: "BW-1", status: "delivered" });
    await db.doc("ops_reveal_rate_limits/reveal_support1").set({ count: 1 });
    await db.doc("platform_feedback/fb1").set({ uid: "author1", message: "hi", category: "idea" });
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

  console.log("\n== ops PII controls: private/contact is owner-ONLY (staff go through api/ops/user-data.ts) ==");
  const support1ctx = testEnv.authenticatedContext("support1").firestore();
  const padminCtx   = testEnv.authenticatedContext("padmin").firestore();
  await check("users/private/contact: an ops support_agent CANNOT read it", support1ctx.doc("users/victim/private/contact").get(), "DENY");
  await check("users/private/contact: a trust_agent CANNOT read it", ops1.doc("users/victim/private/contact").get(), "DENY");
  await check("users/private/contact: a platform admin CANNOT read it directly", padminCtx.doc("users/victim/private/contact").get(), "DENY");
  await check("users/private/contact: ops staff CANNOT overwrite it", support1ctx.doc("users/victim/private/contact").set({ email: "hacked@x.com" }), "DENY");
  await check("users/private/contact: a platform admin CANNOT overwrite it", padminCtx.doc("users/victim/private/contact").update({ stripeCustomerId: "cus_x" }), "DENY");
  await check("users/private: no other doc under private/ is staff-readable either", support1ctx.doc("users/victim/private/anything").get(), "DENY");

  console.log("\n== platform_feedback inbox: support roles may triage only ==");
  await check("platform_feedback: a support_agent CAN set status/handledBy", support1ctx.doc("platform_feedback/fb1").update({ status: "triaged", handledBy: "support1" }), "ALLOW");
  await check("platform_feedback: ...but CANNOT edit the member's message", support1ctx.doc("platform_feedback/fb1").update({ message: "edited" }), "DENY");
  await check("platform_feedback: ...or reassign it to another member", support1ctx.doc("platform_feedback/fb1").update({ uid: "someone-else" }), "DENY");
  await check("platform_feedback: a trust_agent CANNOT triage it", ops1.doc("platform_feedback/fb1").update({ status: "closed" }), "DENY");
  await check("platform_feedback: a stranger CANNOT triage it", atk.doc("platform_feedback/fb1").update({ status: "closed" }), "DENY");
  await check("platform_feedback: nobody can delete one", support1ctx.doc("platform_feedback/fb1").delete(), "DENY");

  console.log("\n== compliance_exports / ops_reveal_rate_limits: server-side only ==");
  await check("compliance_exports: a platform admin CANNOT read the record from the client", padminCtx.doc("compliance_exports/BW-1").get(), "DENY");
  await check("compliance_exports: ops staff CANNOT write one", support1ctx.doc("compliance_exports/BW-2").set({ status: "delivered" }), "DENY");
  await check("ops_reveal_rate_limits: ops staff CANNOT reset their own counter", support1ctx.doc("ops_reveal_rate_limits/reveal_support1").set({ count: 0 }), "DENY");

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

  console.log("\n== ReportModal -> api/submit-report: tickets/fraud cases are server-only for normal users ==");
  // Payloads mirror what ReportModal used to addDoc straight from the client.
  const reportTicket = { subject: "User report: spam", category: "safety", priority: "medium", userId: "atk", userName: "Attacker", userEmail: "a@x.com", body: "x", status: "open", assignedTo: null, assignedName: null, slaBreached: false, slaDeadline: new Date(), notes: [], createdByOps: false, linkedReportId: "r1", createdAt: new Date(), updatedAt: new Date(), resolvedAt: null };
  await check("support_tickets: a normal signed-in user CANNOT create a ticket directly", atk.collection("support_tickets").add(reportTicket), "DENY");
  await check("support_tickets: a normal user CANNOT create one even with ops-looking fields", atk.collection("support_tickets").add({ ...reportTicket, priority: "critical", status: "resolved", assignedTo: "ops1", createdByOps: true }), "DENY");
  await check("support_tickets: a normal user CANNOT read tickets", atk.collection("support_tickets").get(), "DENY");
  await check("support_tickets: ops staff CAN still create a ticket", ops1.collection("support_tickets").add({ ...reportTicket, createdByOps: true }), "ALLOW");
  await check("fraud_cases: a normal signed-in user CANNOT create a fraud case directly", atk.collection("fraud_cases").add({ userId: "atk", type: "account_compromised", severity: "high", status: "open", riskScore: 60 }), "DENY");
  await check("report_rate_limits: a normal user CANNOT read or write the rate-limit counters", atk.doc("report_rate_limits/atk").set({ count: 0 }), "DENY");
  await check("report_rate_limits: ops staff CANNOT touch them either (Admin SDK only)", ops1.doc("report_rate_limits/atk").get(), "DENY");
  await check("content_reports: the client-side half of a user report still works", atk.collection("content_reports").add({ contentType: "profile", contentId: "victim", reportedBy: "atk", reportedByName: "Attacker", reason: "spam", status: "pending", severity: "medium", source: "user_report" }), "ALLOW");

  console.log("\n== platform_feedback: written by api/submit-feedback.ts only, read by support ops ==");
  const support1 = testEnv.authenticatedContext("support1").firestore();
  await check("platform_feedback: a stranger CANNOT read it", atk.doc("platform_feedback/fb1").get(), "DENY");
  await check("platform_feedback: even the author CANNOT read it back directly", testEnv.authenticatedContext("author1").firestore().doc("platform_feedback/fb1").get(), "DENY");
  await check("platform_feedback: a trust_agent (not a support role) CANNOT read it", ops1.doc("platform_feedback/fb1").get(), "DENY");
  await check("platform_feedback: a support_agent CAN read it", support1.doc("platform_feedback/fb1").get(), "ALLOW");
  await check("platform_feedback: a signed-in user CANNOT write one directly", atk.collection("platform_feedback").add({ uid: "atk", message: "spam", category: "idea" }), "DENY");
  await check("platform_feedback: ops staff CANNOT write one directly either", support1.collection("platform_feedback").add({ uid: "x", message: "y", category: "idea" }), "DENY");
  await check("feedback_rate_limits: no client can read or write the counters", atk.doc("feedback_rate_limits/atk").set({ sendCount: 0 }), "DENY");

  console.log("\n== posts: the article card (linkPreview) is validated, and its cache is server-only ==");
  const me = testEnv.authenticatedContext("me").firestore();
  const goodCard = { url: "https://www.example.com/news/story?id=3", title: "A headline", hostname: "example.com", description: "Short.", image: "https://cdn.example.com/a.jpg", siteName: "Example News" };
  const post = (extra) => ({ content: "my thoughts", authorUid: "me", ...extra });
  await check("a post with a valid article card can be created", me.collection("posts").add(post({ linkPreview: goodCard })), "ALLOW");
  await check("a card with only the required fields is fine (text-only card)", me.collection("posts").add(post({ linkPreview: { url: "http://example.com/a", title: "T", hostname: "example.com" } })), "ALLOW");
  await check("a post with no card is unchanged", me.collection("posts").add(post({})), "ALLOW");
  await check("a post with no commentary, just a card, is allowed", me.collection("posts").add(post({ content: "", linkPreview: goodCard })), "ALLOW");
  await check("a card whose link is javascript: is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, url: "javascript:alert(1)" } })), "DENY");
  await check("a card whose link is data: is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, url: "data:text/html,<script>1</script>" } })), "DENY");
  await check("a card whose link has whitespace in it is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, url: "https://a.com/ b" } })), "DENY");
  await check("an http image is rejected (https only)", me.collection("posts").add(post({ linkPreview: { ...goodCard, image: "http://cdn.example.com/a.jpg" } })), "DENY");
  await check("a javascript: image is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, image: "javascript:alert(1)" } })), "DENY");
  await check("a card with an extra field is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, body: "the whole article" } })), "DENY");
  await check("a card missing its title is rejected", me.collection("posts").add(post({ linkPreview: { url: goodCard.url, hostname: "example.com" } })), "DENY");
  await check("a card with an empty title is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, title: "" } })), "DENY");
  await check("a 301-character title is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, title: "x".repeat(301) } })), "DENY");
  await check("a 300-character title is accepted", me.collection("posts").add(post({ linkPreview: { ...goodCard, title: "x".repeat(300) } })), "ALLOW");
  await check("a 301-character description is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, description: "x".repeat(301) } })), "DENY");
  await check("a number as the title is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, title: 5 } })), "DENY");
  await check("a card that is a string, not a map, is rejected", me.collection("posts").add(post({ linkPreview: "https://a.com" })), "DENY");
  await check("a card set to null is rejected", me.collection("posts").add(post({ linkPreview: null })), "DENY");
  await check("a 2,100-character link is rejected", me.collection("posts").add(post({ linkPreview: { ...goodCard, url: "https://a.com/" + "x".repeat(2100) } })), "DENY");
  await check("a card cannot be attached to someone else's post (authorUid spoof still denied)", me.collection("posts").add({ content: "x", authorUid: "someone", linkPreview: goodCard }), "DENY");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("posts/p-mine").set({ content: "hi", authorUid: "me" }); });
  await check("the author can add a valid card to their own post", me.doc("posts/p-mine").update({ linkPreview: goodCard }), "ALLOW");
  await check("the author can NOT swap in an invalid card later", me.doc("posts/p-mine").update({ linkPreview: { ...goodCard, url: "javascript:alert(1)" } }), "DENY");
  await check("the author can still edit the text of a post that has a valid card", me.doc("posts/p-mine").update({ content: "edited" }), "ALLOW");
  await check("someone else cannot add a card to the post", atk.doc("posts/p-mine").update({ linkPreview: goodCard }), "DENY");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("posts/p-edit").set({ content: "original", authorUid: "me", appreciations: { helpful: 0 } }); await ctx.firestore().doc("posts/p-del-other").set({ content: "x", authorUid: "someone" }); await ctx.firestore().doc("posts/p-del-mine").set({ content: "x", authorUid: "me" }); });
  await check("edit post: the author can change the text and stamp the edit time", me.doc("posts/p-edit").update({ content: "edited text", editedAt: new Date(), updatedAt: new Date() }), "ALLOW");
  await check("edit post: someone else cannot change the text", atk.doc("posts/p-edit").update({ content: "hijacked", editedAt: new Date() }), "DENY");
  await check("delete post: someone else cannot delete it", atk.doc("posts/p-del-other").delete(), "DENY");
  await check("delete post: the author cannot delete someone else's post", me.doc("posts/p-del-other").delete(), "DENY");
  await check("delete post: the author can delete their own post", me.doc("posts/p-del-mine").delete(), "ALLOW");
  await check("delete post: a signed-out visitor cannot delete", testEnv.unauthenticatedContext().firestore().doc("posts/p-edit").delete(), "DENY");
  console.log("\n== companies: ownership is granted by the server, not the browser ==");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("companies/unclaimed1").set({ name: "Unclaimed Co", domain: "unclaimed.example.com", followerCount: 3 }); });
  await check("a member cannot make themselves administrator of an unclaimed company from a browser", me.doc("companies/unclaimed1").update({ adminUid: "me", claimed: true }), "DENY");
  await check("a member cannot bump a company's follower count from a browser", me.doc("companies/unclaimed1").update({ followerCount: 4 }), "DENY");
  await check("company_claim_events: no client can read or write the audit trail", me.collection("company_claim_events").add({ companyId: "x", uid: "me", outcome: "granted" }), "DENY");
  await check("company_claim_rate_limits: no client can reset their own counter", me.doc("company_claim_rate_limits/me").set({ count: 0 }), "DENY");
  await check("link_previews (cache): no client can read it", me.doc("link_previews/abc").get(), "DENY");
  await check("link_previews (cache): no client can write it (no poisoning a shared preview)", me.doc("link_previews/abc").set({ preview: goodCard }), "DENY");
  await check("link_previews (cache): ops staff cannot write it either", ops1.doc("link_previews/abc").set({ preview: goodCard }), "DENY");
  await check("link_preview_rate_limits: no client can reset their own counter", me.doc("link_preview_rate_limits/me").set({ count: 0 }), "DENY");

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
