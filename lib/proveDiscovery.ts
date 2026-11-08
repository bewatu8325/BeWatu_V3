/**
 * lib/proveDiscovery.ts
 * The logic behind the Prove gallery: which tab a member starts on, what each tab shows, search and filters, sorting, and the
 * skills/industries offered in the filter. Works on real reel records only.
 */
export interface ReelLite {
  id: string; authorUid: string; authorName?: string; authorTitle?: string; pitch?: string;
  skills?: string[]; industries?: string[]; createdAtMs?: number; sparks?: string[];
}
export type ProveTab = 'discover' | 'following' | 'mine';
export type ProveSort = 'match' | 'newest';

/** How many reels from people you follow make that tab worth starting on. Below this, Discover is the better first page. */
export const MEANINGFUL_FOLLOWING = 3;

export interface ProveContext { uid: string; following: Set<string> | undefined; mySkills: string[]; myIndustry: string }

export const followingReels = (all: ReelLite[], ctx: ProveContext) => all.filter(r => r.authorUid !== ctx.uid && !!ctx.following?.has(r.authorUid));

/** The tab to open on when the member has not chosen one: Following only when there is enough in it. */
export function defaultTab(all: ReelLite[], ctx: ProveContext): ProveTab {
  return followingReels(all, ctx).length >= MEANINGFUL_FOLLOWING ? 'following' : 'discover';
}

const norm = (v: unknown) => (typeof v === 'string' ? v : '').toLowerCase().trim();

/** Overlap with what the member says they do: each shared skill counts 1, a matching industry 2. */
export function matchScore(r: ReelLite, ctx: Pick<ProveContext, 'mySkills' | 'myIndustry'>): number {
  const mine = new Set(ctx.mySkills.map(norm));
  const skill = (r.skills ?? []).filter(s => mine.has(norm(s))).length;
  const ind = ctx.myIndustry && (r.industries ?? []).some(i => norm(i) === norm(ctx.myIndustry)) ? 2 : 0;
  return skill + ind;
}

export interface ProveFilters { q: string; skill: string; industry: string }
export const NO_PROVE_FILTERS: ProveFilters = { q: '', skill: '', industry: '' };
export const anyProveFilter = (f: ProveFilters) => !!(f.q.trim() || f.skill || f.industry);

export function applyFilters(list: ReelLite[], f: ProveFilters): ReelLite[] {
  const q = norm(f.q);
  return list
    .filter(r => !f.skill || (r.skills ?? []).some(s => norm(s) === norm(f.skill)))
    .filter(r => !f.industry || (r.industries ?? []).some(i => norm(i) === norm(f.industry)))
    .filter(r => !q || [r.authorName, r.authorTitle, r.pitch, ...(r.skills ?? []), ...(r.industries ?? [])].some(t => norm(t).includes(q)));
}

/** The reels a tab shows, filtered and ordered. Discover never includes your own reels (they are in My Reels). */
export function reelsFor(tab: ProveTab, all: ReelLite[], mine: ReelLite[], ctx: ProveContext, f: ProveFilters, sort: ProveSort): ReelLite[] {
  const byNewest = (a: ReelLite, b: ReelLite) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0) || a.id.localeCompare(b.id);
  if (tab === 'mine') return [...mine].sort(byNewest);
  const base = tab === 'following' ? followingReels(all, ctx) : all.filter(r => r.authorUid !== ctx.uid);
  const out = applyFilters(base, f);
  if (tab === 'following' || sort === 'newest') return out.sort(byNewest);
  return out.sort((a, b) => matchScore(b, ctx) - matchScore(a, ctx) || byNewest(a, b));
}

/** The values to offer in a filter: those that really occur, most common first. */
export function optionsFrom(list: ReelLite[], pick: (r: ReelLite) => string[] | undefined, max = 40): string[] {
  const n = new Map<string, { label: string; count: number }>();
  for (const r of list) for (const v of pick(r) ?? []) { const k = norm(v); if (!k) continue; const e = n.get(k) ?? { label: v, count: 0 }; e.count++; n.set(k, e); }
  return [...n.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, max).map(e => e.label);
}
