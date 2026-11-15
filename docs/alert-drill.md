# Alert drill

Proves, on demand and without a real outage, that BeWatu will tell a person when something is wrong. Run it after changing anything about alerts, and about once a quarter.

## What it proves
1. The uptime monitor's alert email reaches **support@bewatu.com** (or whatever `UPTIME_ALERT_EMAIL` is).
2. `GET https://www.bewatu.com/api/health` goes **503** and names the failing check, and `alertChannelOk` becomes `true`.
3. The outside watchdog (GitHub Actions in `bewatu-security`) turns **red** and opens a `production-down` issue.
4. When the drill ends, a **recovery** email arrives, health returns to 200, and the watchdog closes the issue.

## How
1. In Vercel, add the environment variable `UPTIME_DRILL_UNTIL` to the BeWatu_V3 project, set to an ISO time about **35 minutes from now**, for example `2026-11-15T02:10:00Z` (UTC). Then **Redeploy** so it takes effect.
2. Watch for, in this order (times from the redeploy going live):
   - within about 5 minutes: an email `🔴 BeWatu health check failing: DRILL (planned test, not a real failure)`; `/api/health` returns 503;
   - within about 15 to 20 minutes: the **Production watchdog** run turns red and an issue "Production is unhealthy (watchdog)" opens;
   - after the time you set passes: an email `✅ … recovered: DRILL …`, `/api/health` back to 200, and the watchdog closes the issue on its next run.
3. Remove `UPTIME_DRILL_UNTIL` from Vercel afterwards (tidy only: it already does nothing once the time has passed).

## Safety
- The drill adds **one synthetic failure**, clearly named, and touches nothing real. Members are not affected.
- It **ends by itself**. A time that is already past, unreadable, or more than 2 hours away is ignored, so a typo cannot leave it running.
- If an email does not arrive, that is the finding: check `RESEND_API_KEY`, the Resend dashboard, and the spam folder. `/api/health` will say `alert emails are not being delivered` if the send failed.
