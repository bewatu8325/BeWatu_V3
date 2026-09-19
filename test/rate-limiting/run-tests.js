// P1 fix (launch-readiness review): rate-limiting/auth sweep completion.
// Six new server-only Firestore collections were added:
//   - verify_reel_rate_limits, cosentiment_rate_limits — per-uid rate
//     limits for api/verify-reel.ts and api/cosentiment-teaser.ts, both of
//     which had NO authentication at all before this fix.
//   - cosentiment_cache — api/cosentiment-teaser.ts's teaser-score cache.
//     Previously had no rule at all here, which meant the endpoint's old
//     plain-REST-with-API-key Firestore access (no Admin SDK) was actually
//     being evaluated against v2's default-deny and failing with
//     PERMISSION_DENIED on every call, silently swallowed by the
//     endpoint's own catch blocks — the cache never worked. The endpoint
//     now uses Admin SDK (bypasses rules, and is what actually fixes the
//     cache); this rule is defense-in-depth, not what makes it work.
//   - claude_rate_limits, gemini_rate_limits, skills_trajectory_rate_limits
//     — per-uid rate limits added to the three paid-AI-proxy endpoints,
//     which were already authenticated but had no cap on a legitimate
//     signed-in user looping the call to burn budget.
// All six are server-side-only via Admin SDK (which bypasses rules
// entirely) — these would already default-deny with no rule at all, but
// explicit for the same reason every other server-only collection in this
// file is: so it's not mistaken for an oversight later.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");

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

  const attacker = testEnv.authenticatedContext("attacker-uid").firestore();

  const collections = [
    "verify_reel_rate_limits",
    "cosentiment_rate_limits",
    "cosentiment_cache",
    "ai_rate_limits",
    "skills_trajectory_rate_limits",
    "_ops_internal",
  ];

  for (const coll of collections) {
    console.log(`\n== ${coll} (server-only state, Admin SDK only) ==`);
    await check(`${coll}: no client can read`, async () => {
      await assertFails(getDoc(doc(attacker, coll, "some-doc")));
    });
    await check(`${coll}: no client can write`, async () => {
      await assertFails(setDoc(doc(attacker, coll, "some-doc"), { sendCount: 1 }));
    });
  }

  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
