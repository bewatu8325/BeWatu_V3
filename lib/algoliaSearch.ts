/**
 * lib/algoliaSearch.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side search over the `bewatu_users` and `bewatu_jobs` Algolia
 * indices (synced from Firestore by the official firestore-algolia-search
 * extension — see docs/algolia-search-setup.md for the full setup).
 *
 * Root-cause fix (launch-readiness review): the People directory and Jobs
 * board used to filter client-side over whatever was already loaded in
 * memory (the 50 most-recent public users, the 200 most-recent active
 * jobs) — so search only ever searched a small recent slice, never the
 * real dataset. This queries the real index instead.
 *
 * Auth: never holds a static Algolia key. Every search first gets a
 * short-lived (5 min) secured key from api/algolia-search-key.ts, which
 * requires a real Firebase ID token — matching the existing
 * `isAuth()`-gated read access `users`/`jobs` already have in
 * firestore.rules. The key is cached in memory and refreshed just before
 * it expires.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { liteClient as algoliasearch } from 'algoliasearch/lite';
import { auth } from './firebase';

export const USERS_INDEX = 'bewatu_users';
export const JOBS_INDEX  = 'bewatu_jobs';

let cachedKey: { appId: string; apiKey: string; validUntil: number } | null = null;
let inFlight: Promise<{ appId: string; apiKey: string; validUntil: number }> | null = null;

async function getSecuredKey(): Promise<{ appId: string; apiKey: string; validUntil: number }> {
  const now = Math.floor(Date.now() / 1000);
  // Refresh 30s before real expiry so an in-flight search never gets caught
  // by the key expiring mid-request.
  if (cachedKey && cachedKey.validUntil - 30 > now) return cachedKey;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('Sign in to search.');

    const res = await fetch('/api/algolia-search-key', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Could not start search.');

    cachedKey = data;
    return data;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function getClient() {
  const { appId, apiKey } = await getSecuredKey();
  return algoliasearch(appId, apiKey);
}

/** Searches bewatu_users. Returns the matching Firebase uids (Algolia objectIDs), in ranked order. */
export async function searchUserUids(query: string, hitsPerPage = 20): Promise<string[]> {
  if (!query.trim()) return [];
  const client = await getClient();
  const { results } = await client.search([
    { indexName: USERS_INDEX, params: { query, hitsPerPage, attributesToRetrieve: ['objectID'] } },
  ]);
  const hits = (results[0] as any)?.hits ?? [];
  return hits.map((h: any) => h.objectID as string);
}

/** Full Algolia job hit — jobs have no private-field split, so the index record is the display record. */
export interface JobSearchHit {
  objectID: string;
  title: string;
  companyId: number;
  location: string;
  description: string;
  type: string;
  experienceLevel: string;
  status: string;
  recruiterId: number;
  recruiterUid?: string;
  liveDate: string;
  expiryDate: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  isDirectEmployer?: boolean;
}

/** Searches bewatu_jobs, restricted to Active listings (mirrors fetchJobs()'s own status filter). */
export async function searchJobs(
  query: string,
  filters: { location?: string; industry?: string; experienceLevel?: string } = {},
  hitsPerPage = 50
): Promise<JobSearchHit[]> {
  const client = await getClient();
  const facetClauses = ['status:Active'];
  if (filters.experienceLevel) facetClauses.push(`experienceLevel:${filters.experienceLevel}`);

  const { results } = await client.search([
    {
      indexName: JOBS_INDEX,
      params: {
        query,
        hitsPerPage,
        filters: facetClauses.join(' AND '),
      },
    },
  ]);
  return ((results[0] as any)?.hits ?? []) as JobSearchHit[];
}
