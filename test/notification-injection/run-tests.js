// P1 fix: "Notification injection" — users/{uid}/notifications and the
// legacy notifications/{uid}/items were both `allow create: if isAuth()`,
// letting ANY signed-in user write anything into ANY other user's
// notification feed (fake approvals, arbitrary junk type/message values,
// pre-marked-read entries). The sender is legitimately a different user
// than the recipient by design, so this can't be an ownership check —
// fixed instead by requiring the real shape every current write site
// actually produces. This exercises both collections against the real
// enforced rules: the legitimate shape succeeds, a forged one fails.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { collection, doc, addDoc, serverTimestamp } = require("firebase/firestore");

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

  const attacker  = testEnv.authenticatedContext("attacker-uid").firestore();
  const recipient = testEnv.authenticatedContext("recipient-uid").firestore();

  console.log("\n== users/{uid}/notifications: create ==");

  await check("real createPodNotification()/Header.tsx shape (known type) succeeds", async () => {
    await assertSucceeds(addDoc(collection(attacker, "users", "recipient-uid", "notifications"), {
      type: "circle_approved",
      message: "Your request to join \"Test Pod\" was approved",
      relatedId: 1,
      circleFirestoreId: "circle1",
      isRead: false,
      createdAt: serverTimestamp(),
    }));
  });

  await check("an unknown/arbitrary type is denied", async () => {
    await assertFails(addDoc(collection(attacker, "users", "recipient-uid", "notifications"), {
      type: "YOU_HAVE_WON_A_PRIZE",
      message: "Click here",
      isRead: false,
      createdAt: serverTimestamp(),
    }));
  });

  await check("a non-string message is denied", async () => {
    await assertFails(addDoc(collection(attacker, "users", "recipient-uid", "notifications"), {
      type: "post_comment",
      message: { html: "<script>evil()</script>" },
      isRead: false,
      createdAt: serverTimestamp(),
    }));
  });

  await check("pre-marked-read (isRead: true) at creation is denied", async () => {
    await assertFails(addDoc(collection(attacker, "users", "recipient-uid", "notifications"), {
      type: "post_comment",
      message: "hi",
      isRead: true,
      createdAt: serverTimestamp(),
    }));
  });

  await check("a backdated createdAt (not the real server time) is denied", async () => {
    await assertFails(addDoc(collection(attacker, "users", "recipient-uid", "notifications"), {
      type: "post_comment",
      message: "hi",
      isRead: false,
      createdAt: new Date("2020-01-01"),
    }));
  });

  console.log("\n== legacy notifications/{uid}/items: create ==");

  await check("real createNotification() shape (known NotificationType) succeeds", async () => {
    await assertSucceeds(addDoc(collection(attacker, "notifications", "recipient-uid", "items"), {
      type: "FOLLOW_REQUEST",
      message: "You have a new follow request",
      senderName: "Attacker",
      recipientNumericId: 42,
      read: false,
      createdAt: serverTimestamp(),
    }));
  });

  await check("an unknown NotificationType is denied", async () => {
    await assertFails(addDoc(collection(attacker, "notifications", "recipient-uid", "items"), {
      type: "ADMIN_OVERRIDE",
      message: "You are now a platform admin",
      read: false,
      createdAt: serverTimestamp(),
    }));
  });

  await check("pre-marked-read at creation is denied", async () => {
    await assertFails(addDoc(collection(attacker, "notifications", "recipient-uid", "items"), {
      type: "MESSAGE",
      message: "hi",
      read: true,
      createdAt: serverTimestamp(),
    }));
  });

  console.log("\n== legacy notifications/{uid} parent doc: create is closed entirely ==");

  await check("creating the bare parent doc directly is denied (nothing ever uses it)", async () => {
    await assertFails(
      require("firebase/firestore").setDoc(
        doc(attacker, "notifications", "recipient-uid"),
        { userId: "recipient-uid", fake: true }
      )
    );
  });

  console.log("\n== recipient can still read/mark-read their own notifications ==");

  await check("the recipient CAN read their own users/{uid}/notifications", async () => {
    const { getDocs } = require("firebase/firestore");
    await assertSucceeds(getDocs(collection(recipient, "users", "recipient-uid", "notifications")));
  });

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
