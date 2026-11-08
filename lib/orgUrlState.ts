/**
 * lib/orgUrlState.ts
 * What the Organizations page remembers in its address, so a filtered list can be shared, bookmarked, reloaded and
 * come back with the browser's Back button: /organizations?view=all&category=medical,hospitals&country=kenya&sort=alpha
 *
 * Only choices that differ from the plain list are written. Anything read back is checked first: unknown categories,
 * types, sorts and views are dropped, text is length-limited, so a hand-edited or stale link can never put the page in a
 * state it could not reach itself.
 */
import { ORGANIZATION_TYPES, categoryParam, parseCategoryParam, type OrganizationType } from './organizations';

export type OrgView = 'for_you' | 'following' | 'all';
export type OrgSort = 'relevance' | 'recent' | 'followers' | 'alpha';

export interface OrgFilterState {
  view: OrgView;
  q: string;
  industry: string;
  /** Comma-separated category keys in canonical order ('' = every category). */
  category: string;
  orgType: OrganizationType | '';
  country: string;
  hiring: boolean;
  challenges: boolean;
  sponsor: boolean;
  sort: OrgSort;
}

const VIEWS: OrgView[] = ['for_you', 'following', 'all'];
const SORTS: OrgSort[] = ['relevance', 'recent', 'followers', 'alpha'];
const text = (v: string | null, max: number) => (v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

/** The query string (with the leading "?", or "" when nothing differs) for a page state. */
export function toSearch(s: OrgFilterState): string {
  const p = new URLSearchParams();
  p.set('view', s.view);
  if (s.q.trim()) p.set('q', text(s.q, 80));
  const cat = categoryParam(parseCategoryParam(s.category));
  if (cat) p.set('category', cat);
  if (s.orgType) p.set('type', s.orgType);
  if (s.industry) p.set('industry', text(s.industry, 60));
  if (s.country) p.set('country', text(s.country, 60));
  if (s.hiring) p.set('hiring', '1');
  if (s.challenges) p.set('challenges', '1');
  if (s.sponsor) p.set('sponsor', '1');
  if (s.sort !== 'relevance') p.set('sort', s.sort);
  return `?${p.toString()}`;
}

/** The parts of the page state a query string states. Missing or invalid parts are simply absent. */
export function fromSearch(search: string): Partial<OrgFilterState> {
  const p = new URLSearchParams(search);
  const out: Partial<OrgFilterState> = {};
  const view = p.get('view') as OrgView | null;
  if (view && VIEWS.includes(view)) out.view = view;
  const q = text(p.get('q'), 80); if (q) out.q = q;
  const cat = categoryParam(parseCategoryParam(p.get('category'))); if (cat) out.category = cat;
  const type = p.get('type') as OrganizationType | null; if (type && (ORGANIZATION_TYPES as string[]).includes(type)) out.orgType = type;
  const industry = text(p.get('industry'), 60).toLowerCase(); if (industry) out.industry = industry;
  const country = text(p.get('country'), 60).toLowerCase(); if (country) out.country = country;
  if (p.get('hiring') === '1') out.hiring = true;
  if (p.get('challenges') === '1') out.challenges = true;
  if (p.get('sponsor') === '1') out.sponsor = true;
  const sort = p.get('sort') as OrgSort | null; if (sort && SORTS.includes(sort)) out.sort = sort;
  return out;
}

/** Is this address one of the directory's own (so the page may rewrite its query)? */
export const isDirectoryPath = (pathname: string) => /^\/(organizations|companies)\/?$/.test(pathname);
