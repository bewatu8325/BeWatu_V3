/**
 * lib/companiesService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser side of api/companies.ts: the Companies page, search suggestions,
 * a company's real activity, follow / unfollow and "claim this company".
 *
 * Results are cached in memory for a minute (keyed by the exact query) and
 * identical requests already in flight are shared, so going back to a page you
 * just looked at, or two components asking the same thing, cost one request.
 * Writes (follow, claim) clear the cache so the next read is fresh.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { auth } from './firebase';
import type { CategoryKey, OrganizationType, OrganizationLocation } from './organizations';

export type CompaniesView = 'for_you' | 'following' | 'all';
export type CompaniesSort = 'relevance' | 'recent' | 'followers' | 'alpha';

export interface CompanyFilters { hiring?: boolean; challenges?: boolean; sponsor?: boolean }

export interface CompaniesQuery {
  view: CompaniesView;
  q: string;
  industry: string;          // '' = any (lower-cased industry key)
  category: CategoryKey | ''; // '' = every category
  organizationType: OrganizationType | '';
  country: string;           // '' = anywhere (lower-cased country name)
  filters: CompanyFilters;
  sort: CompaniesSort;
}

export interface CompanyItem {
  id: string;
  name: string;
  industry: string;
  description: string;
  logoUrl: string;
  domain: string;
  ticker: string;
  organizationType: OrganizationType;
  category: CategoryKey;
  typeLabel: string;
  subindustries: string[];
  location: OrganizationLocation;
  claimStatus: 'claimed' | 'unclaimed';
  verified: boolean;
  followerCount: number;
  following: boolean;
  openJobs: number;
  liveChallenges: number;
  sponsoredArenas: string[];
  lastActivityMs: number | null;
  reasons?: string[];
}

export interface CompaniesPage {
  items: CompanyItem[];
  total: number;
  nextCursor: string | null;
  facets: { key: string; label: string; count: number }[];
  categories: { key: CategoryKey; label: string; count: number }[];
  types: { key: OrganizationType; label: string; count: number }[];
  countries: { key: string; label: string; count: number }[];
  meta: { view: CompaniesView; sort: CompaniesSort; forYou?: { hasPreferences: boolean; personalisedCount: number; fallback: boolean } };
}

export interface OrganizationInfo {
  id: string; name: string; organizationType: OrganizationType; typeLabel: string; category: CategoryKey;
  industry: string; subindustries: string[]; description: string; website: string; logoUrl: string;
  location: OrganizationLocation;
  /** Category-specific facts, from a named source or the organization itself. Absent = unknown, never zero. */
  profile: Record<string, string | number>;
  claimStatus: 'claimed' | 'unclaimed';
  source: { name: string; url: string } | null;
  parent: { id: string; name: string; typeLabel: string } | null;
  children: { id: string; name: string; typeLabel: string }[];
  childCount: number;
}

export interface CompanyDetail {
  company: { id: string; name: string; industry: string; followerCount: number; verified: boolean };
  organization: OrganizationInfo;
  following: boolean;
  claim: { available: boolean; isAdmin: boolean };
  openRoleCount: number;
  liveChallengeCount: number;
  sponsoredArenas: string[];
  roles: { title: string; location: string; type: string; atMs: number | null }[];
  challenges: { id: string; title: string; arenaName: string; prize: number; deadlineMs: number }[];
  related: { id: string; title: string; arenaName: string; prize: number; deadlineMs: number; companyName: string }[];
  updates: { kind: 'role' | 'challenge' | 'sponsorship'; text: string; atMs: number }[];
}

export class CompaniesError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export async function companiesApi(body: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new CompaniesError('Please sign in again.', 401);
  let res: Response;
  try {
    res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new CompaniesError('Could not reach BeWatu. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CompaniesError(data?.error ?? 'Something went wrong. Please try again.', res.status);
  return data;
}

// ── caching ──────────────────────────────────────────────────────────────────
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

export const clearCompaniesCache = () => { cache.clear(); };

async function cached<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const running = inFlight.get(key);
  if (running && !force) return running as Promise<T>;
  const p = load().then(v => { cache.set(key, { at: Date.now(), value: v }); return v; }).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export const queryKey = (q: CompaniesQuery, cursor: string | null) =>
  JSON.stringify([q.view, q.q.trim().toLowerCase(), q.industry, q.category, q.organizationType, q.country, !!q.filters.hiring, !!q.filters.challenges, !!q.filters.sponsor, q.sort, cursor]);

/** One page of companies (12). Pass the previous page's `nextCursor` to load more. */
export function queryCompanies(q: CompaniesQuery, cursor: string | null = null, opts: { force?: boolean } = {}): Promise<CompaniesPage> {
  return cached(queryKey(q, cursor), () => companiesApi({
    action: 'list', view: q.view, q: q.q.trim(), industry: q.industry, category: q.category, organizationType: q.organizationType, country: q.country, filters: q.filters, sort: q.sort, cursor,
  }), opts.force);
}

export function suggestCompanies(text: string): Promise<{ companies: { id: string; name: string; industry: string; typeLabel?: string }[]; industries: string[] }> {
  return cached(`suggest:${text.trim().toLowerCase()}`, () => companiesApi({ action: 'suggest', q: text.trim() }));
}

export function fetchCompanyDetail(companyId: string, force = false): Promise<CompanyDetail> {
  return cached(`detail:${companyId}`, () => companiesApi({ action: 'detail', companyId }), force);
}

export async function setFollowing(companyId: string, follow: boolean): Promise<{ following: boolean; followerCount: number }> {
  const r = await companiesApi({ action: follow ? 'follow' : 'unfollow', companyId });
  clearCompaniesCache();
  return { following: !!r.following, followerCount: Number(r.followerCount) || 0 };
}

export interface ClaimResult { ok: boolean; status: 'granted' | 'already_admin' | 'manual_review' }

export async function claimCompanyRequest(companyId: string): Promise<ClaimResult> {
  const r = await companiesApi({ action: 'claim', companyId });
  clearCompaniesCache();
  return { ok: !!r.ok, status: r.status };
}

/** Adds items to a list without ever repeating a company that is already there. */
export function appendUnique(existing: CompanyItem[], incoming: CompanyItem[]): CompanyItem[] {
  const seen = new Set(existing.map(c => c.id));
  return [...existing, ...incoming.filter(c => !seen.has(c.id))];
}
