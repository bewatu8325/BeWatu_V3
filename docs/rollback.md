# Rolling back production

Use this when a deploy has broken something members rely on and the fastest safe fix is to go back to the previous build.

## Decide first
- **Is it the app?** The post-deploy smoke test opens an issue (`deploy-smoke-failed`) and `/api/health` goes 503 when something is wrong. If the site itself is up and only one feature is wrong, a fast forward-fix may be better than a rollback.
- **Did the bad change include a Firestore rules or index change?** Those are deployed separately (`firebase deploy`). A rollback does **not** undo them. Decide about them on their own.
- **Did it change data?** A rollback never touches data. If a bad deploy wrote bad data, that needs its own fix.

## Steps (GitHub, no laptop needed)
1. Repo **Actions** tab, **Roll back production**, **Run workflow**.
2. **First run it as a dry run** (leave "execute" unticked). Read the summary: it names the build production serves now and the build it would roll back to (commit, message, age). Check that against the Vercel dashboard.
3. Run it again with **execute** ticked and `ROLLBACK` typed in **confirm**. Optionally name a different target (a Vercel deployment id, url or commit sha).
4. It promotes the target to production, then probes the live site with retries. **If the probes fail it exits red and says so: do not assume it worked.** Either way an issue is opened so there is a record.
5. Then revert or fix the bad commit on `main` so the next deploy does not bring it back.

## Guard rails
- Only a **READY production** build younger than **30 days**, and not the one already serving, is accepted.
- Executing needs the exact text `ROLLBACK`.
- It needs the `VERCEL_TOKEN` repository secret to be able to promote deployments on the project.

## Not yet proven live
The tool has been tested against a fake Vercel API only. **Run the dry run once now, while nothing is wrong,** to prove the token can read the project and the plan matches the dashboard. The first real promotion should be done by someone watching.

## Manual fallback
Vercel dashboard, the project, **Deployments**, a previous green production deployment, **Promote to Production**.
