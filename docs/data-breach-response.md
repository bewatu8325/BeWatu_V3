# Data breach response — 72-hour process

Internal incident-response runbook for BeWatu staff. Written as part of the
launch-readiness review, alongside verifying the backup/restore path this
depends on (see the "confirm scheduled exports" note it replaces).

The 72-hour clock below matches GDPR Article 33's notification deadline —
the strictest applicable standard, and the right default even before a
legal review confirms BeWatu's exact jurisdictional exposure. Nothing here
is a substitute for that legal review; it's the operational side, so the
first 72 hours aren't spent figuring out who does what.

## What counts as a reportable breach

Any of these, confirmed or reasonably suspected:

- Unauthorized read or write access to `users/{uid}/private/contact`
  (email, phone, location) or `factory_investors`/`factory_users` PII, by
  anyone other than the owner, `isOpsStaff()`, or a scoped service account.
- Unauthorized access to Stripe customer data (`stripeCustomerId`,
  subscription records) — see `lib/accountService.ts`'s own comment on why
  this field is kept separate and retained for 7 years.
- A leaked credential with real access — a live API key, a Firebase service
  account key, a Stripe secret key. (A leak with *no* real access — e.g. a
  confirmed non-secret like the `.gitleaksignore` entries — is not this
  process; see that file's own comments for how those get triaged instead.)
- Any `security_findings` entry, `content_reports` pattern, or ops-portal
  observation showing PII actually left the system, not just that a gap
  existed.

A confirmed rules gap with no evidence of exploitation (the kind this
review found several of) is a P0 bug fix, not a breach. Don't invoke this
process for those — track them as findings instead, same as the rest of
this review's own backlog.

## Hour 0–1: contain and confirm

1. **Don't discuss over public channels.** Move to a private, existing
   channel with only the people who need to be there.
2. **Confirm it's real** before anything else moves. For a suspected
   credential leak: rotate first, confirm second — the cost of rotating a
   key that turns out to be fine is a redeploy; the cost of *not* rotating
   one that's real is the whole rest of this document.
3. **Stop the bleeding**, narrowly:
   - Compromised credential → rotate it (Secret Manager `versions add`,
     redeploy, revoke the old version — see this review's own Algolia
     secret-rotation writeup for the exact pattern).
   - Compromised Firestore rule → deploy the fix to `bewatu-2d04e`
     immediately; this is the one case where a rules deploy to production
     doesn't wait for the usual review cycle.
   - Compromised ops account → `ops_staff/{uid}.isActive = false`
     immediately (same field `approveDataRequest`'s auth check already
     reads), then rotate that person's Firebase Auth credentials.
4. **Snapshot the evidence before you fix anything you don't have to fix
   immediately** — `gcloud logging read` for the relevant window, the
   specific Firestore documents touched, the `audit_log` entries around
   the incident. You cannot always reconstruct this after containment.

## Hour 1–24: scope it

5. **Identify exactly which users are affected.** Query for the specific
   documents/fields actually exposed — don't estimate. If the exposure was
   a Firestore rule gap, the emulator test suite's own fixtures
   (`test/rules/run-tests.js` and friends) are a fast way to enumerate
   which collections/fields a given rule actually covered.
6. **Determine what was actually exposed** — read access vs. write access
   vs. exfiltration. A rules gap that allowed reading `private/contact`
   is different from one that allowed writing `isPlatformAdmin`; scope
   each separately if both are in play.
7. **If a restore may be needed**, don't wait until hour 60 to find out
   whether it works. Production (`bewatu-2d04e`) has a daily Firestore
   backup schedule (`dailyRecurrence`, 30-day retention, confirmed via
   `gcloud firestore backups schedules list`) — restoring one is exactly
   the drill already run and verified during this review: restore the
   relevant backup into a **new, isolated database** in the same project
   (`gcloud firestore databases restore --destination-database=<temp-name>
   --source-backup=<backup>`), never directly into `(default)`. Diff
   against live data there before touching anything real. Delete the
   temporary database the moment you're done with it — it holds a full
   copy of real user PII for as long as it exists.

## Hour 24–72: notify

8. **Who gets told, in this order:** affected users first (or
   simultaneously with regulators if the exposure is severe enough that
   waiting isn't defensible), then any required regulator under the
   applicable law for where affected users are located, then a public
   note if the scope is large enough that silence would itself be
   misleading.
9. **What the user notification says, minimum:** what happened, what data
   was involved (be specific — "your email and phone number," not "some
   information"), what BeWatu has already done, what the user should do
   (rotate a password, watch for phishing, nothing), and a real contact
   for questions. Route through `api/ops/send-data-ready-email.ts`'s own
   pattern (Resend, `noreply@bewatu.com`) if email is the channel, or the
   equivalent for an in-app notification.
10. **Write the incident record before memory fades** — timeline, root
    cause, who was notified and when, what changed as a direct result.
    This is also exactly what a regulator asks for first if they follow
    up.

## After

11. **The fix that caused the breach not to be possible again** ships as
    its own reviewed PR, same discipline as every other fix in this
    review — branch, CI green, merge. An incident is not an excuse to skip
    the process that would have caught it in the first place.
12. **Update this document** if the incident revealed a gap in it. A
    runbook that never changes after a real incident wasn't read closely
    enough during one.

## What this depends on, and its current state

- **Backups**: real, confirmed. Daily schedule, 30-day retention, 30/30
  consecutive snapshots present with no gaps as of this review. Restore
  path itself verified with a real drill (restored the latest snapshot
  into an isolated database, confirmed real user records came back
  intact, deleted the temporary database).
- **Audit trail**: real. `writeAuditEntry()` covers every sensitive ops
  action (approvals, PII exports, role changes) — see bewatu-ops's own
  `ROLES`/`PERMISSIONS` definitions for what's covered.
- **Public breach-notification commitment**: **not yet written.** The
  live Privacy Policy (`components/legal/PrivacyPolicy.tsx`) commits to
  notifying users of policy *changes*, but makes no explicit commitment
  about *breach* notification or a timeframe. That's a legal-copy
  decision this document doesn't make unilaterally — flagged separately,
  not fixed here.
