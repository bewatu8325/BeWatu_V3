# Security Center

The Security tab in the operations console (`ops.bewatu.com` → Security). It gives one view of platform security:
- posture and score;
- vulnerabilities;
- threats and incidents;
- remediation;
- security controls;
- recovery readiness;
- the security agent;
- the audit log.

It sits on the security pipeline that already existed and fills its gaps. It is not a second engine.

## 1. What existed, and what was missing (assessment, 2026-11-26)

| Area | Already in place | Gap closed by the Security Center |
|---|---|---|
| Detection: code | Semgrep on every push to main and weekly, in all three repos (`security.yml`), feeding `api/security/finding.ts`. | CWE/OWASP are now taken from Semgrep's own rule metadata. Scans can be started from the console. Each scan's freshness is recorded. |
| Detection: dependencies | npm/pnpm audit in all three repos. | Fixed packages were **never closed**: a completed audit of main now reports its full result set to `scan-complete.ts`. GHSA/CVE/CWE ids are recorded. |
| Detection: runtime | `runtime-anomaly.ts`, 4 thresholds, findings only. | Adds a heartbeat (so "quiet" can be told from "not connected"). Adds threat events with hashed client ids, plus unauthorized-access, flood, scraping and rate-limit (blocked) detection. Critical signals auto-open incidents. |
| Availability and integrity | Uptime monitor every 5 min (`api/cron/healthcheck.ts`). Outside watchdog (`bewatu-security`). Deletion tripwire and ops-staff change alerts. | Deletions and privilege changes become threat events. A large deletion opens an incident. The posture job is watched like the other crons. |
| Lifecycle | Findings, approval requests, AI-drafted pull requests (`approve.ts`), merge tracking (`verify.ts`), verify after a clean scan cycle (`security-sweep.ts`), closure by scan (`scan-complete.ts`). | Validation, prioritization, owners, deadlines, time-limited risk acceptance, and closing 7 days after verification. A recurring finding is now reopened, not duplicated. A false positive is no longer re-created by every scan. A declined fix no longer silently "accepts the risk". |
| Governance | Platform admins approve; Firestore rules deny client writes. | Server-enforced roles per action. A fresh sign-in for sensitive actions. An autonomy policy and an emergency suspension switch (in Firestore and in the environment). A hash-chained audit log. The broken "False positive" button (rules blocked it) now works through the server. |
| Recovery | PITR and daily backups (checked by hand on 2026-11-15). A rollback workflow (dry run by default). | Backup, PITR and delete-protection telemetry. Rollback rehearsals read from Actions. Recorded drills, which give a measured recovery time. |

`bewatu-security` stays the out-of-band repository: scanner rule packs, playbooks, the outside watchdog. Its watchdog runs are read live and shown as a sensor. Its custom Semgrep rules (`sensors/semgrep-rules/`) are **not yet** run by the product scans, which use `--config=auto`. That is a known follow-up.

## 2. Architecture

```
 sensors (GitHub Actions, Vercel cron, log drain)            ops console (SecurityCenter.jsx)
   security.yml ──► finding.ts ──► security_findings              │  GET snapshot / POST action (ID token)
                ──► scan-complete.ts (brake) ──► _ops_internal/scan_state
   runtime log drain ──► runtime-anomaly.ts ──► security_events, security_incidents, runtime_sensor
   healthcheck (5 min) ──► uptime_state, collection_counts, security_events
   security-sweep (daily) ──► verify / close / reopen / nudge / agent pass
   center.ts?cron=posture (daily) ──► recovery_state, certificates, security_metrics, notifications
                                                              ▼
                       api/security/center.ts  ── reads everything above + GitHub (Actions runs, PR checks)
                                               ── writes: triage, incidents, policy, drills, security_audit
   approve.ts ◄── a person (fresh sign-in) or the agent (service token, policy + daily cap) ──► GitHub PR / issue
```

Every route stays self-contained (api routes cannot import each other). Shared logic is copied between marked blocks, and tests enforce that the copies are identical:
- `<alert-sender>`;
- `<cors>`;
- `<redact>`;
- `<autonomy-policy>`.

## 3. Data (Firestore)

All the collections below are readable by security staff (`isSecurityStaff()`) and **writable only by the server** (`allow write: if false`).

| Collection | Written by | Contents |
|---|---|---|
| `security_findings` | finding.ts, center.ts, sweep, scan-complete | Existing fields plus: `owner {uid,email}`, `validatedAt/By`, `priority` (manual), `acceptedUntil` (ms), `reopenCount`, `reopenedAt`, `closedAt`, `cweIds`, `cveIds`, `owasp`, `proposalRejectedAt`. |
| `security_incidents` | center.ts, runtime-anomaly.ts, healthcheck.ts | `title, summary, severity, status (open, investigating, contained, resolved), affected[], eventIds[], openedAt, openedBy, firstSignalAt, containment[], timeline[], resolvedAt, resolution, key` (dedupe for automatic ones). |
| `security_events` | runtime-anomaly.ts, healthcheck.ts | `type, severity, summary, source, payload` (hashed client ids only), `blocked, incidentId, timestamp`. |
| `security_policy/autonomy` | center.ts (admin, fresh sign-in) | `mode` (observe, propose, auto_low_risk), `maxAgentPrsPerDay` (0–5), `lowRiskRules` (from a fixed catalog), `maxAutoSeverity`, `suspended`, `suspendedReason/By/At`, `updatedBy/At`. |
| `security_policy/notifications` | center.ts (admin) | `coverage, backup, certificates, sla` (booleans). |
| `security_audit`, `security_audit_meta/head` | center.ts | `seq, at, actorUid, actorEmail, role, action, target, details, prevHash, hash`. The hash is sha256 of the entry and the previous hash. |
| `security_metrics/{yyyy-mm-dd}` | posture job | Daily score, coverage, caps, domain scores, open counts, incidents, sensor freshness. |
| `security_drills` | center.ts (admin) | `kind` (restore, rollback, alert), `outcome, performedAt, durationMinutes, notes, recordedBy`. |
| `_ops_internal/*` | server only | `scan_state` (per scanner and repo: `lastCompleteAt, present, closed, refused, pendingClose`), `runtime_sensor`, `recovery_state`, `posture_state`, `agent_counters`, `cron_security_posture`. |

## 4. API

`api/security/center.ts`. Every request needs a Firebase ID token for an active ops staff member whose role is in the view list.

| Request | Who | Notes |
|---|---|---|
| `GET /api/security/center` | platform_admin, cyber_agent, auditor | The snapshot. GitHub reads are cached for 60 s per instance. |
| `GET /api/security/center?finding=<id>` | same | One finding, with its approvals and its pipeline and console history. |
| `POST {action:"assign"\|"validate"\|"prioritize"\|"false_positive"\|"reopen"\|"incident_open"\|"incident_update"\|"scan_trigger"}` | platform_admin, cyber_agent | Triage. |
| `POST {action:"notifications_set"\|"drill_record"}` | platform_admin | Governance. |
| `POST {action:"accept_risk"\|"policy_set"\|"automation_suspend"\|"automation_resume"\|"brake_confirm"}` | platform_admin, **signed in within 10 min** | Sensitive governance. The server answers `401 step_up_required` and the console asks for the password again. |
| `GET ?cron=posture` | `Bearer CRON_SECRET` | Vercel cron, daily at 08:45 UTC. |

`api/security/approve.ts`:
- **A person:** a platform admin, signed in within 10 min, to approve.
- **The agent:** `Bearer BEWATU_SECURITY_TOKEN` with `agent: true`. It may only approve, only under `auto_low_risk`, only for listed rules at or below the severity limit, and only within the daily cap, which is counted in a transaction.

Suspension (Firestore or `SECURITY_AUTOMATION_DISABLED=1`) refuses every approval with 423. Declining always stays possible.

## 5. Lifecycle

| Stage | Means | Set by |
|---|---|---|
| Detected | A sensor reported it once. | finding.ts |
| Validated | Seen again by a later independent scan, an exact advisory match, or confirmed by a person. | automatic, or **Validate** |
| Prioritized | P1–P4 from severity, exposure and deadline. A person's choice wins. | automatic, or **Set priority** |
| Remediation proposed | A fix plan awaits an admin's go-ahead, or an issue awaits a person. | finding.ts |
| Testing | The agent opened a pull request; CI is running. | approve.ts |
| Approval | CI passed; a person must merge. Nothing merges automatically. | GitHub |
| Deployment | Merged, so deployed by Vercel; waiting for a clean scan cycle. | verify.ts, sweep |
| Verified | Not reported for 8 days after the merge, or gone from a completed scan of main. | sweep, scan-complete |
| Closed | Fixed and quiet for 7 more days, a false positive, or risk accepted (with an end date). | sweep, or a person |

A closed finding that comes back is **reopened**: `reopenCount` goes up, an alert is sent, and the history stays in one place. An accepted risk reopens itself when its time runs out.

Fix deadlines (from detection): critical 48 h, high 7 days, medium 30 days, low 90 days.

## 6. Score

Each domain scores 0–100 from its controls:
- **Points:** active 1, degraded ½, missing 0.
- **Unknown controls:** left out, and they lower the coverage.

**Vulnerability exposure** is 100 minus a penalty per open finding: critical 25, high 10, medium 3, low 1. Accepted risks are excluded.

**Weights:**

| Domain | Weight |
|---|---|
| Vulnerability exposure | 30 |
| Detection | 20 |
| Identity | 15 |
| Recovery | 15 |
| Data | 10 |
| Infrastructure | 10 |

With **less than 50 % coverage there is no score** ("Insufficient data").

**Caps** override the result:

| Condition | Score at most |
|---|---|
| An open critical incident | 40 |
| An open high incident | 60 |
| The uptime monitor is silent | 50 |
| A critical finding is past its deadline | 50 |
| Every scan is out of date | 60 |
| Alerts are not being delivered | 60 |

The console shows the weights, every contributing factor, the raw score and the caps.

## 7. Honest numbers

Missing data is never shown as zero:
- **Sensors** are `fresh`, `stale`, `never` (no data yet), `not_configured` (needs setup; the reason is shown) or `unavailable` (could not be read right now).
- **Controls** with no telemetry are `unknown`, which is not the same as `missing`.
- **Time to detect** is only measured where the start of a problem is known (incidents).
- **"Blocked"** counts only signals an enforcement point marked as blocked.

## 8. Autonomy and emergency control

| Mode | The agent may |
|---|---|
| `observe` | Record findings only. No fixes are proposed. |
| `propose` (default) | Propose fixes. A platform admin approves each one, with a fresh sign-in. |
| `auto_low_risk` | Have the daily sweep open pull requests (or issues) for approvals on the admin's low-risk list. The catalog is `unsafe-formatstring`, `missing-integrity`, `github-actions-mutable-action-tag` and `dependabot-missing-cooldown`. Limits: up to `maxAutoSeverity`, and at most `maxAgentPrsPerDay` (0–5). |

The agent never merges or deploys. It never edits CI, Dependabot or other protected paths (those become issues). It cannot change its own policy. Every high-risk change needs a person.

**Suspension** has two independent switches:
1. **Security agent → Emergency control** in the console (platform admin, fresh sign-in). This writes `security_policy/autonomy.suspended`.
2. **`SECURITY_AUTOMATION_DISABLED=1`** in Vercel, then redeploy. This works even if Firestore is unreachable or tampered with.

While suspended, detection, alerts and the console keep working. No fix is generated by anyone.

## 9. Notifications

**Always on** (cannot be muted):
- critical and high findings (finding.ts);
- incidents;
- failed remediation (approve.ts);
- a stopped monitor or cron job (healthcheck);
- suspension and resumption.

**Configurable**, sent by the daily posture job at most once a day per item:
- coverage drops;
- backup or recovery failures;
- expiring certificates and the GitHub token;
- the deadline digest.

## 10. Operating it

Setup and remaining steps:
1. **Deploy the Firestore rules.** Rules are deployed by hand:
   ```
   firebase deploy --only firestore:rules --project bewatu-2d04e
   ```
   Until then the daily drift check reports DRIFT.
2. **Backup telemetry.** Create a service account with **Cloud Datastore Viewer** and add its JSON as `FIREBASE_SERVICE_ACCOUNT_BACKUP_VIEWER` in Vercel. Without it, Recovery says "not configured".
3. **GitHub token** (`GITHUB_TOKEN`). It needs:
   - pull requests, issues and contents on the 3 product repositories (already);
   - **Actions: read** on all four repositories, including bewatu-security, for pipeline checks and the watchdog;
   - **Actions: write** on the three product repositories, for "Run a scan now".

   The console shows the token's expiry date.
4. **Runtime traffic.** Point a Vercel log drain at `https://www.bewatu.com/api/security/runtime-anomaly`, with header `Authorization: Bearer <BEWATU_SECURITY_TOKEN>`. Until then, live-traffic monitoring shows "not configured".
5. **Drills.** Record each restore, rollback and alert drill in Recovery. A restore drill's duration becomes the measured recovery time.

## 11. Tests

- **`test/security-center/run-tests.mjs`** (emulator, 28). Covers:
  - the honest-number rules, the score and caps;
  - the lifecycle, priority, deadlines, OWASP/CWE/CVE mapping and redaction;
  - the hash chain and tamper detection;
  - roles and fresh sign-in;
  - every action;
  - observe/propose/auto modes, both suspension switches and the agent's cap;
  - the scan freshness state and brake confirmation;
  - runtime detections;
  - **the full lifecycle end to end:** detect → validate → prioritize → propose → approve → fix and pull request → test → merge → deploy → verify → close → recur → reopen, against fake GitHub and a fake AI model.
- **Updated suites:** `security-control-plane`, `security-sweep`, `scan-complete`, `healthcheck`.
