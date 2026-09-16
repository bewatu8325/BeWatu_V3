# Algolia search setup

Fixes the People directory and Jobs board search, which used to filter
client-side over whatever was already loaded in memory (the 50 most-recent
public users, the 200 most-recent active jobs) — so search never actually
searched the real dataset, just whatever recent slice happened to be cached.

Everything the code needs is already written and typechecked
(`api/algolia-search-key.ts`, `lib/algoliaSearch.ts`,
`lib/firestoreService.ts`'s `fetchUsersByUids`, and the People/Jobs UI
wiring). What's left is account setup — steps 1–4 below — which only the
Algolia/Firebase account holder can do.

## 1. Create the Algolia account and two indices

1. Sign up at [algolia.com](https://www.algolia.com) (the free tier covers
   this comfortably at BeWatu's current scale — 10k search requests + 1M
   records/month).
2. Note the **Application ID** from the dashboard.
3. Under **Settings → API Keys**, create a new key:
   - **ACL**: `search` only. Never use the Admin API Key here — this key
     becomes `ALGOLIA_SEARCH_API_KEY` below, and `api/algolia-search-key.ts`
     generates short-lived secured keys *from* it, so its own ACL ceiling is
     what actually bounds what a leaked secured key could ever do.
4. You don't need to manually create the `bewatu_users` / `bewatu_jobs`
   indices — the extension in step 2 creates them on first sync.

## 2. Install the Firestore → Algolia sync extension (once per Firestore project)

Run for **both** `bewatu-dev` and (once verified) production:

```bash
firebase ext:install algolia/firestore-algolia-search --project bewatu-dev
```

Configure it **twice** — once per collection, since each install syncs one
collection to one index:

**Install 1 — users:**
- Collection path: `users`
- Algolia Index Name: `bewatu_users`
- Algolia App ID / Admin API Key: from step 1 (the Admin key, not the
  search-only one — the extension needs write access to push records)
- Indexable Fields (Fields Parameter): `displayName,headline,bio,industry,skills,availability,isRecruiter,numericId,photoURL`
  — deliberately excludes everything already split into
  `users/{uid}/private/contact` (email/phone/location/stripeCustomerId), so
  no PII the P0 2 fix moved out of the main doc ever reaches Algolia.

**Install 2 — jobs:**
- Collection path: `jobs`
- Algolia Index Name: `bewatu_jobs`
- Indexable Fields: `title,description,location,type,experienceLevel,status,recruiterId,recruiterUid,liveDate,expiryDate,salaryMin,salaryMax,salaryCurrency,salaryPeriod,isDirectEmployer,companyId`

## 3. Backfill existing documents

The extension only syncs *future* writes by default. Existing users/jobs
need a one-time backfill — the extension's own install output prints the
exact command, in the form:

```bash
firebase ext:info algolia/firestore-algolia-search --project bewatu-dev
# then, per the extension's own printed instructions (varies by version):
# firebase functions:call <backfill-function-name> --project bewatu-dev
```

Verify the backfill worked by checking each index's record count in the
Algolia dashboard against Firestore's real `users`/`jobs` collection sizes.

## 4. Set the Vercel env vars

Both apply to `bewatu-dev` first, then production once verified:

| Env var | Value |
|---|---|
| `ALGOLIA_APP_ID` | Application ID from step 1 |
| `ALGOLIA_SEARCH_API_KEY` | The **search-only** key from step 1 (not Admin) |

`FIREBASE_PROJECT_ID` is already set (used by `api/create-subscription.ts`
and others) — no change needed there.

## 5. Verify before relying on it

1. Register/log in as a test user, search People for someone you know
   exists but who's *not* in the 50 most-recently-created users (the exact
   case this fix targets) — confirm they show up.
2. Search Jobs with a keyword/location that only matches a job outside the
   200 most-recent (same idea).
3. Confirm a request to `/api/algolia-search-key` with no `Authorization`
   header returns `401`, not a key.

## Known follow-up, not done in this pass

Jobs' **industry** filter still runs client-side after the fact (joined
against the already-loaded `companies` list) — industry lives on the
`Company` doc, not on the job itself, so it isn't in the index. A complete
fix needs a transform function on the jobs sync extension that denormalizes
`company.industry` onto the indexed job record at write time.
