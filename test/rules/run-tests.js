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
    await db.doc("users/inv1").set({ displayName: "Inv One", investorEntitled: true });
    await db.doc("factory_investors/inv2").set({ user: { id: "inv2" }, firm: "Lapsed" });
    await db.doc("users/inv2").set({ displayName: "Inv Two", investorEntitled: false });
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
  await check("funding_offers: an entitled investor (approved and subscribed) CAN create an offer",   inv1.collection("funding_offers").add({ investorUid: "inv1", founderUids: ["f1"], status: "pending" }), "ALLOW");
  await check("funding_offers: an investor with a profile but no active entitlement CANNOT (approval alone is not access)", testEnv.authenticatedContext("inv2").firestore().collection("funding_offers").add({ investorUid: "inv2", founderUids: ["f1"], status: "pending" }), "DENY");
  await check("demo_sessions: nor can they book a demo", testEnv.authenticatedContext("inv2").firestore().collection("demo_sessions").add({ investorUid: "inv2", founderUids: ["f1"], status: "pending" }), "DENY");

  console.log("\n== Decision 4: reviewed investor onboarding (this pass) ==");
  await check("factory_investors: client create is now always denied, even self", inv1.doc("factory_investors/inv9").set({ user: { id: "inv1" } }), "DENY");
  await check("factory_investors: client create is denied even spoofing another uid", atk.doc("factory_investors/inv10").set({ user: { id: "victim" } }), "DENY");
  await check("investor_applications: the old direct-create path is retired (applications go through the server, which keeps approval and payment apart)", inv1.collection("investor_applications").add({ uid: "inv1", status: "pending" }), "DENY");
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
  await check("directory_snapshot: no client can read or write the server's condensed directory", me.collection("directory_snapshot").doc("meta").get(), "DENY");
  await check("directory_snapshot: no client can write it either", me.collection("directory_snapshot").doc("meta").set({ gen: "x" }), "DENY");
  await check("company_claim_events: no client can read or write the audit trail", me.collection("company_claim_events").add({ companyId: "x", uid: "me", outcome: "granted" }), "DENY");
  await check("company_claim_rate_limits: no client can reset their own counter", me.doc("company_claim_rate_limits/me").set({ count: 0 }), "DENY");
  console.log("\n== reels: the Arena link is written only by api/reel-arena-link.ts ==");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("reels/rl-mine").set({ authorUid: "me", pitch: "p", sparks: [], views: 0 }); });
  await check("a member can still upload a reel (no Arena link)", me.doc("reels/rl-new").set({ authorUid: "me", pitch: "p", skills: ["SQL"], sparks: [], views: 0 }), "ALLOW");
  await check("a member cannot create a reel that already claims an Arena link", me.doc("reels/rl-forged").set({ authorUid: "me", pitch: "p", arenaLink: { challengeId: "c1", outcome: "winner" } }), "DENY");
  await check("a member cannot add an Arena link (or a winner outcome) to their own reel", me.doc("reels/rl-mine").update({ arenaLink: { challengeId: "c1", outcome: "winner" } }), "DENY");
  await check("a member can still edit their reel's other fields", me.doc("reels/rl-mine").update({ pitch: "new pitch" }), "ALLOW");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("reels/rl-linked").set({ authorUid: "me", pitch: "p", sparks: [], arenaLink: { challengeId: "c1", outcome: "submitted" } }); });
  await check("a member cannot edit or remove the server-written Arena link", me.doc("reels/rl-linked").update({ arenaLink: { challengeId: "c1", outcome: "winner" } }), "DENY");
  await check("a member cannot delete just the Arena link field", me.doc("reels/rl-linked").update({ arenaLink: require("firebase/firestore").deleteField() }), "DENY");
  await check("someone else still cannot add an Arena link to a reel", atk.doc("reels/rl-mine").update({ arenaLink: { challengeId: "c1" } }), "DENY");
  console.log("\n== arena sponsorships: written only by api/arena-sponsorship.ts ==");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await d.doc("arena_sponsorships/s-ok").set({ status: "approved", companyAdminUid: "sponsorAdmin", arenaId: "payments", branding: { primaryColor: "#1a4a3a" } });
    await d.doc("arena_sponsorships/s-pending").set({ status: "pending_review", companyAdminUid: "sponsorAdmin", arenaId: "insurance" });
    await d.doc("arena_sponsorships/s-revoked").set({ status: "revoked", companyAdminUid: "sponsorAdmin", arenaId: "banking" });
    await d.doc("arena_sponsorship_assets/s-ok").set({ banner: "data:image/png;base64,AAAA" });
    await d.doc("arena_sponsorship_assets/s-pending").set({ banner: "data:image/png;base64,AAAA" });
  });
  const sAdmin = testEnv.authenticatedContext("sponsorAdmin").firestore();
  const padmin = testEnv.authenticatedContext("padmin").firestore();
  await check("any signed-in member can read an approved sponsorship", me.doc("arena_sponsorships/s-ok").get(), "ALLOW");
  await check("members can list the approved sponsorships (the directory query)", me.collection("arena_sponsorships").where("status", "==", "approved").get(), "ALLOW");
  await check("a signed-out visitor cannot read sponsorships", testEnv.unauthenticatedContext().firestore().doc("arena_sponsorships/s-ok").get(), "DENY");
  await check("members cannot read someone else's pending request", me.doc("arena_sponsorships/s-pending").get(), "DENY");
  await check("members cannot read a revoked sponsorship", me.doc("arena_sponsorships/s-revoked").get(), "DENY");
  await check("members cannot list every sponsorship (only the approved ones)", me.collection("arena_sponsorships").get(), "DENY");
  await check("the company's own administrator can read its pending request", sAdmin.doc("arena_sponsorships/s-pending").get(), "ALLOW");
  await check("the company's administrator can read its revoked one", sAdmin.doc("arena_sponsorships/s-revoked").get(), "ALLOW");
  await check("the company's administrator can list their own sponsorships", sAdmin.collection("arena_sponsorships").where("companyAdminUid", "==", "sponsorAdmin").get(), "ALLOW");
  await check("a platform admin can read all of them", padmin.collection("arena_sponsorships").get(), "ALLOW");
  await check("nobody can create a sponsorship from a browser (a member)", me.collection("arena_sponsorships").add({ status: "approved", companyAdminUid: "me", arenaId: "payments" }), "DENY");
  await check("the company administrator cannot approve their own request", sAdmin.doc("arena_sponsorships/s-pending").update({ status: "approved" }), "DENY");
  await check("the company administrator cannot edit their sponsorship's dates", sAdmin.doc("arena_sponsorships/s-ok").update({ endDate: new Date("2099-01-01") }), "DENY");
  await check("a platform admin cannot write one from a browser either (it goes through the route)", padmin.doc("arena_sponsorships/s-pending").update({ status: "approved" }), "DENY");
  await check("nobody can delete a sponsorship record (history is kept)", sAdmin.doc("arena_sponsorships/s-ok").delete(), "DENY");
  await check("a banner of an approved sponsorship is readable by members", me.doc("arena_sponsorship_assets/s-ok").get(), "ALLOW");
  await check("a banner of a pending sponsorship is not readable by members", me.doc("arena_sponsorship_assets/s-pending").get(), "DENY");
  await check("...but is readable by the company's administrator", sAdmin.doc("arena_sponsorship_assets/s-pending").get(), "ALLOW");
  await check("nobody can write a banner from a browser", sAdmin.doc("arena_sponsorship_assets/s-ok").set({ banner: "data:image/png;base64,BBBB" }), "DENY");
  await check("arena_sponsorship_rate_limits: no client can read or write the counters", me.doc("arena_sponsorship_rate_limits/me").set({ count: 0 }), "DENY");

  console.log("\n== staff messaging: only the server writes; members can read the banner ==");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("site_announcements/a1").set({ title: "Notice", body: "Hello", active: true, severity: "info", audience: "all" }); await ctx.firestore().doc("comms_campaigns/c1").set({ title: "Secret draft", createdBy: { uid: "x" } }); });
  await check("a signed-in member can read a site announcement", me.doc("site_announcements/a1").get(), "ALLOW");
  await check("members can list the active announcements (the banner query)", me.collection("site_announcements").where("active", "==", true).get(), "ALLOW");
  await check("a signed-out visitor cannot read announcements", testEnv.unauthenticatedContext().firestore().doc("site_announcements/a1").get(), "DENY");
  await check("a member cannot publish an announcement", me.collection("site_announcements").add({ title: "Fake", body: "Send us your password", active: true, severity: "critical", audience: "all" }), "DENY");
  await check("a member cannot edit or end an announcement", me.doc("site_announcements/a1").update({ active: false }), "DENY");
  await check("even a platform admin's browser cannot write an announcement (it goes through the server)", padmin.doc("site_announcements/a2").set({ title: "x", active: true }), "DENY");
  await check("comms_campaigns: no member can read or write campaigns", me.doc("comms_campaigns/c1").get(), "DENY");
  await check("comms_campaigns: ops staff browsers cannot read them either (the server returns masked history)", ops1.doc("comms_campaigns/c1").get(), "DENY");
  await check("a member cannot write a notification of type 'announcement' to someone else", me.collection("users/victim/notifications").add({ type: "announcement", message: "Click here", isRead: false, createdAt: new Date() }), "DENY");
  console.log("\n== shared portfolios: shares and their counters are server-only ==");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("portfolio_shares/s1").set({ ownerUid: "me", status: "active" }); });
  await check("portfolio_shares: not even the owner's browser can read a share (the server lists them)", me.doc("portfolio_shares/s1").get(), "DENY");
  await check("portfolio_shares: a member cannot write one (so cannot widen what is shared or skip its expiry)", me.doc("portfolio_shares/s2").set({ ownerUid: "me", status: "active" }), "DENY");
  await check("portfolio_shares: a member cannot switch their own share back on from a browser", me.doc("portfolio_shares/s1").update({ status: "active", expiresAt: null }), "DENY");
  await check("portfolio_shares: a signed-out visitor cannot read one", testEnv.unauthenticatedContext().firestore().doc("portfolio_shares/s1").get(), "DENY");
  await check("portfolio_rate_limits: no client can read or write the counters", me.doc("portfolio_rate_limits/k").set({ count: 0 }), "DENY");
  console.log("\n== invitations: the records, addresses and counters are server-only ==");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("invitations/inv1").set({ inviterUid: "me", recipientEmail: "sam@work.test", status: "pending" }); await ctx.firestore().doc("email_suppressions/h1").set({ at: 1 }); });
  for (const c of ["invitations/inv1", "invitation_joins/j1", "invitation_events/e1", "invitation_metrics/2026-01-01", "invitation_rate_limits/k1", "email_suppressions/h1"]) {
    await check("invitations: a member cannot read " + c.split("/")[0] + " (not even their own)", me.doc(c).get(), "DENY");
    await check("invitations: a member cannot write " + c.split("/")[0], me.doc(c).set({ x: 1 }), "DENY");
  }
  await check("invitations: a member cannot flip their own invitation to joined", me.doc("invitations/inv1").update({ status: "joined" }), "DENY");
  await check("invitations: a signed-out visitor cannot read one", testEnv.unauthenticatedContext().firestore().doc("invitations/inv1").get(), "DENY");
  await check("invitations: ops staff browsers cannot read the invitee addresses either", ops1.doc("invitations/inv1").get(), "DENY");
  await check("link_previews (cache): no client can read it", me.doc("link_previews/abc").get(), "DENY");
  await check("link_previews (cache): no client can write it (no poisoning a shared preview)", me.doc("link_previews/abc").set({ preview: goodCard }), "DENY");
  await check("link_previews (cache): ops staff cannot write it either", ops1.doc("link_previews/abc").set({ preview: goodCard }), "DENY");
  await check("link_preview_rate_limits: no client can reset their own counter", me.doc("link_preview_rate_limits/me").set({ count: 0 }), "DENY");

  console.log("\n== Bridge Talks: only published Talks are visible; the lifecycle is server-only; one like and one comment layer a member can write ==");
  const talkMe = testEnv.authenticatedContext("tme").firestore();
  const talkSpeaker = testEnv.authenticatedContext("tspk").firestore();
  const talkAdmin = padminCtx;
  const talkOut = testEnv.unauthenticatedContext().firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const q = ctx.firestore();
    await q.doc("bridge_talks/live").set({ speakerUid: "tspk", status: "published", title: "Live", likedByUids: [], videoUrl: "https://v" });
    await q.doc("bridge_talks/draft").set({ speakerUid: "tspk", status: "draft", title: "Draft", likedByUids: [], videoUrl: "https://v" });
    await q.doc("bridge_talks/waiting").set({ speakerUid: "tspk", status: "submitted", title: "Waiting", likedByUids: [] });
    await q.doc("bridge_talks/live/comments/c1").set({ authorUid: "tspk", content: "hello", depth: 0, parentId: null });
    await q.doc("bridge_talks/draft/comments/c9").set({ authorUid: "tspk", content: "old", depth: 0, parentId: null });
    await q.doc("bridge_talk_reviews/draft").set({ speakerUid: "tspk", note: "Fix the audio", history: [] });
  });
  await check("bridge_talks: a signed-out visitor cannot read even a published Talk", talkOut.doc("bridge_talks/live").get(), "DENY");
  await check("bridge_talks: a member can read a published Talk", talkMe.doc("bridge_talks/live").get(), "ALLOW");
  await check("bridge_talks: a member cannot read someone's draft", talkMe.doc("bridge_talks/draft").get(), "DENY");
  await check("bridge_talks: a member cannot read a Talk waiting for review", talkMe.doc("bridge_talks/waiting").get(), "DENY");
  await check("bridge_talks: the speaker can read their own draft", talkSpeaker.doc("bridge_talks/draft").get(), "ALLOW");
  await check("bridge_talks: a reviewer can read a Talk waiting for review", talkAdmin.doc("bridge_talks/waiting").get(), "ALLOW");
  await check("bridge_talks: a member can list published Talks", talkMe.collection("bridge_talks").where("status", "==", "published").get(), "ALLOW");
  await check("bridge_talks: a member cannot list every Talk (that would include drafts)", talkMe.collection("bridge_talks").get(), "DENY");
  await check("bridge_talks: the speaker can list their own, whatever the status", talkSpeaker.collection("bridge_talks").where("speakerUid", "==", "tspk").get(), "ALLOW");
  await check("bridge_talks: a reviewer can list what is waiting", talkAdmin.collection("bridge_talks").where("status", "==", "submitted").get(), "ALLOW");
  await check("bridge_talks: a member cannot create a Talk", talkMe.doc("bridge_talks/new").set({ speakerUid: "tme", status: "published", title: "Mine" }), "DENY");
  await check("bridge_talks: not even the speaker can create one from a browser", talkSpeaker.doc("bridge_talks/new").set({ speakerUid: "tspk", status: "published" }), "DENY");
  await check("bridge_talks: the speaker cannot publish their own draft", talkSpeaker.doc("bridge_talks/draft").update({ status: "published" }), "DENY");
  await check("bridge_talks: the speaker cannot edit a published Talk in place", talkSpeaker.doc("bridge_talks/live").update({ title: "Changed after review" }), "DENY");
  await check("bridge_talks: not even a reviewer's browser writes a Talk (the server does)", talkAdmin.doc("bridge_talks/waiting").update({ status: "published" }), "DENY");
  await check("bridge_talks: nobody can delete a Talk from a browser", talkSpeaker.doc("bridge_talks/draft").delete(), "DENY");
  await check("bridge_talks: a member can like a published Talk (adding their own uid)", talkMe.doc("bridge_talks/live").update({ likedByUids: ["tme"] }), "ALLOW");
  await check("bridge_talks: a member cannot like as someone else", talkMe.doc("bridge_talks/live").update({ likedByUids: ["tme", "someone-else"] }), "DENY");
  await check("bridge_talks: a member cannot remove someone else's like, or wipe them all", talkSpeaker.doc("bridge_talks/live").update({ likedByUids: [] }), "DENY");
  await check("bridge_talks: a like cannot ride along with another change", talkMe.doc("bridge_talks/waiting").update({ likedByUids: ["tme"], status: "published" }), "DENY");
  await check("bridge_talks: nobody can like a Talk that is not published", talkMe.doc("bridge_talks/draft").update({ likedByUids: ["tme"] }), "DENY");

  await check("comments: a member can read comments on a published Talk", talkMe.doc("bridge_talks/live/comments/c1").get(), "ALLOW");
  await check("comments: nobody sees comments on a Talk that is not published", talkMe.doc("bridge_talks/draft/comments/c9").get(), "DENY");
  await check("comments: a signed-out visitor sees no comments", talkOut.doc("bridge_talks/live/comments/c1").get(), "DENY");
  const cm = (o = {}) => ({ likedByUids: [], authorUid: "tme", authorName: "Me", authorAvatar: null, authorHeadline: "", content: "A question", parentId: null, replyToUid: null, replyToName: null, depth: 0, createdAt: new Date(), updatedAt: new Date(), edited: false, ...o });
  await check("comments: a member can comment on a published Talk", talkMe.doc("bridge_talks/live/comments/m1").set(cm()), "ALLOW");
  await check("comments: a member can reply (one level)", talkMe.doc("bridge_talks/live/comments/m2").set(cm({ parentId: "c1", depth: 1 })), "ALLOW");
  await check("comments: a reply cannot go deeper than one level", talkMe.doc("bridge_talks/live/comments/m3").set(cm({ parentId: "m2", depth: 2 })), "DENY");
  await check("comments: a top-level comment cannot name a parent", talkMe.doc("bridge_talks/live/comments/m4").set(cm({ parentId: "c1", depth: 0 })), "DENY");
  await check("comments: nobody can comment on a Talk that is not published", talkMe.doc("bridge_talks/draft/comments/m5").set(cm()), "DENY");
  await check("comments: a member cannot comment as someone else", talkMe.doc("bridge_talks/live/comments/m6").set(cm({ authorUid: "tspk" })), "DENY");
  await check("comments: nobody can label themselves the speaker", talkMe.doc("bridge_talks/live/comments/m7").set(cm({ isSpeaker: true })), "DENY");
  await check("comments: an empty comment is refused", talkMe.doc("bridge_talks/live/comments/m8").set(cm({ content: "" })), "DENY");
  await check("comments: an over-long comment is refused", talkMe.doc("bridge_talks/live/comments/m9").set(cm({ content: "x".repeat(2001) })), "DENY");
  await check("comments: the author can edit the text of their own comment", talkMe.doc("bridge_talks/live/comments/m1").update({ content: "A better question", updatedAt: new Date(), edited: true }), "ALLOW");
  await check("comments: the author cannot move their comment to another author or thread", talkMe.doc("bridge_talks/live/comments/m1").update({ authorUid: "tspk" }), "DENY");
  await check("comments: any member can appreciate a comment (their own uid only)", talkSpeaker.doc("bridge_talks/live/comments/c1").update({ likedByUids: ["tspk"] }), "ALLOW");
  await check("comments: nobody can appreciate as someone else", talkMe.doc("bridge_talks/live/comments/c1").update({ likedByUids: ["tspk", "nobody"] }), "DENY");
  await check("comments: nobody can appreciate a comment on a Talk that is not published", talkMe.doc("bridge_talks/draft/comments/c9").update({ likedByUids: ["tme"] }), "DENY");
  await check("comments: an appreciation cannot ride along with a change to the text", talkMe.doc("bridge_talks/live/comments/c1").update({ likedByUids: ["tspk", "tme"], content: "rewritten" }), "DENY");
  await check("comments: another member cannot edit it", talkSpeaker.doc("bridge_talks/live/comments/m1").update({ content: "changed", updatedAt: new Date(), edited: true }), "DENY");
  await check("comments: the speaker cannot delete a member's comment", talkSpeaker.doc("bridge_talks/live/comments/m1").delete(), "DENY");
  await check("comments: the author can delete their own", talkMe.doc("bridge_talks/live/comments/m2").delete(), "ALLOW");
  await check("comments: a reviewer can remove any comment", talkAdmin.doc("bridge_talks/live/comments/m1").delete(), "ALLOW");

  await check("bridge_talk_reviews: the speaker can read the reviewer's note on their Talk", talkSpeaker.doc("bridge_talk_reviews/draft").get(), "ALLOW");
  await check("bridge_talk_reviews: another member cannot", talkMe.doc("bridge_talk_reviews/draft").get(), "DENY");
  await check("bridge_talk_reviews: a reviewer can", talkAdmin.doc("bridge_talk_reviews/draft").get(), "ALLOW");
  await check("bridge_talk_reviews: the speaker cannot rewrite the note", talkSpeaker.doc("bridge_talk_reviews/draft").update({ note: "All good" }), "DENY");
  for (const c of ["bridge_contributor_requests/tme", "bridge_talk_suggestions/s1", "bridge_rate_limits/k"]) {
    await check("bridge: a member cannot read " + c.split("/")[0], talkMe.doc(c).get(), "DENY");
    await check("bridge: a member cannot write " + c.split("/")[0], talkMe.doc(c).set({ x: 1 }), "DENY");
  }
  await check("users: a member cannot make themselves a Bridge contributor", talkMe.doc("users/tme").set({ displayName: "Me", bridgeContributor: true, engagementGateApplies: true }), "DENY");
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("users/tme").set({ displayName: "Me" }); });
  await check("users: nor by updating their own profile", talkMe.doc("users/tme").update({ bridgeContributor: true }), "DENY");
  await check("users: they can still update the rest of their own profile", talkMe.doc("users/tme").update({ headline: "Designer" }), "ALLOW");
  await check("savedTalks: a member can save a Talk to their own list", talkMe.doc("users/tme/savedTalks/live").set({ talkId: "live", savedAt: new Date() }), "ALLOW");
  await check("savedTalks: and read and remove it", talkMe.doc("users/tme/savedTalks/live").get(), "ALLOW");
  await check("savedTalks: nobody else can read someone's saved list", talkSpeaker.doc("users/tme/savedTalks/live").get(), "DENY");
  await check("savedTalks: nobody can write into someone else's list", talkSpeaker.doc("users/tme/savedTalks/other").set({ talkId: "other", savedAt: new Date() }), "DENY");
  await check("savedTalks: nothing but the Talk id and the time may be stored", talkMe.doc("users/tme/savedTalks/x").set({ talkId: "x", savedAt: new Date(), note: "extra" }), "DENY");
  await check("savedTalks: the id must match the document", talkMe.doc("users/tme/savedTalks/x").set({ talkId: "y", savedAt: new Date() }), "DENY");
  await check("savedTalks: a signed-out visitor cannot read one", talkOut.doc("users/tme/savedTalks/live").get(), "DENY");

  console.log("\n== Investor membership: approval, subscription and entitlement are server-only ==");
  const invMe = testEnv.authenticatedContext("invme").firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("users/invme").set({ displayName: "Me" }); await ctx.firestore().doc("investor_memberships/invme").set({ status: "active", stripeCustomerId: "cus_x" }); await ctx.firestore().doc("investor_membership_applications/a1").set({ uid: "invme", status: "approved", internalNote: "private" }); });
  await check("users: a member cannot mark themselves approved as an investor", invMe.doc("users/invme").update({ investorApproval: { status: "approved" } }), "DENY");
  await check("users: nor entitled", invMe.doc("users/invme").update({ investorEntitled: true }), "DENY");
  await check("users: nor set an entitlement state", invMe.doc("users/invme").update({ investorEntitlementState: "active" }), "DENY");
  await check("users: they cannot create their own account already entitled", testEnv.authenticatedContext("newbie").firestore().doc("users/newbie").set({ displayName: "N", engagementGateApplies: true, investorEntitled: true }), "DENY");
  await check("users: nor already approved", testEnv.authenticatedContext("newbie2").firestore().doc("users/newbie2").set({ displayName: "N", engagementGateApplies: true, investorApproval: { status: "approved" } }), "DENY");
  await check("users: they can still update the rest of their profile", invMe.doc("users/invme").update({ headline: "Angel investor" }), "ALLOW");
  for (const c of ["investor_membership_applications/a1", "investor_application_drafts/invme", "investor_memberships/invme", "investor_cooldowns/invme", "investor_events/e1", "investor_metrics/d1", "investor_rate_limits/k", "stripe_events/evt_1"]) {
    await check("investor: a member cannot read " + c.split("/")[0] + " (the status page comes from the server)", invMe.doc(c).get(), "DENY");
    await check("investor: a member cannot write " + c.split("/")[0], invMe.doc(c).set({ x: 1 }), "DENY");
  }
  await check("investor: not even ops staff browsers read an applicant's notes or billing ids", ops1.doc("investor_membership_applications/a1").get(), "DENY");
  await check("investor: a member cannot flip their own application to approved", invMe.doc("investor_membership_applications/a1").update({ status: "approved" }), "DENY");

  console.log("\n== Plans: a member cannot write their own plan; only Stripe and the server do ==");
  const planMe = testEnv.authenticatedContext("planme").firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc("users/planme").set({ displayName: "Plan Me", subscriptionTier: "free" }); await ctx.firestore().doc("users/planpro").set({ displayName: "Pro", subscriptionTier: "pro", subscriptionStatus: "active", subscriptionId: "sub_1" }); });
  for (const [k, v] of [["subscriptionTier", "factory"], ["subscriptionTier", "investor"], ["subscriptionStatus", "active"], ["subscriptionId", "sub_x"], ["subscriptionPriceId", "price_x"], ["trialEndsAt", "2030-01-01"], ["currentPeriodEnd", "2030-01-01"], ["trialEndingSoon", true], ["factoryUnlocked", true], ["factoryUnlockedAt", "2030-01-01"], ["factoryUnlockReason", "I said so"]]) {
    await check("users: a member cannot set their own " + k, planMe.doc("users/planme").update({ [k]: v }), "DENY");
  }
  await check("users: nor several plan fields at once alongside a normal change", planMe.doc("users/planme").update({ headline: "Hi", subscriptionTier: "factory", factoryUnlocked: true }), "DENY");
  await check("users: a paid member cannot downgrade-and-upgrade their own record either", testEnv.authenticatedContext("planpro").firestore().doc("users/planpro").update({ subscriptionTier: "factory" }), "DENY");
  await check("users: they can still change everything else about their profile", planMe.doc("users/planme").update({ headline: "Designer", bio: "Hello" }), "ALLOW");
  await check("users: and leave their plan fields alone in a full-profile save", testEnv.authenticatedContext("planpro").firestore().doc("users/planpro").update({ headline: "Pro designer", subscriptionTier: "pro", subscriptionId: "sub_1" }), "ALLOW");
  for (const [k, v] of [["subscriptionTier", "pro"], ["factoryUnlocked", true], ["subscriptionId", "sub_x"], ["trialEndsAt", "2030-01-01"], ["subscriptionStatus", "trialing"]]) {
    await check("users: an account cannot be created with " + k + " already " + JSON.stringify(v), testEnv.authenticatedContext("plan-new-" + k).firestore().doc("users/plan-new-" + k).set({ displayName: "N", engagementGateApplies: true, [k]: v }), "DENY");
  }
  await check("users: a new account on the Free plan is fine", testEnv.authenticatedContext("plan-ok").firestore().doc("users/plan-ok").set({ displayName: "N", engagementGateApplies: true, subscriptionTier: "free" }), "ALLOW");
  await check("users: BeWatu's platform admin can correct someone's plan", padminCtx.doc("users/planme").update({ subscriptionTier: "pro" }), "ALLOW");
  await check("users: so can ops staff", ops1.doc("users/planme").update({ subscriptionTier: "free" }), "ALLOW");

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
