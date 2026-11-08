/**
 * lib/arenaDiscovery.ts
 * The logic behind the Arenas landing page, kept free of the UI so it can be tested. Everything here works on real
 * challenge records only: nothing is estimated, padded or invented, and a number is shown only if the record has it.
 */
export interface ChallengeLite {
  id: string; title: string; description?: string; arenaIndustry: string; companyName?: string;
  skills?: string[]; difficulty?: string; tier?: string; prizeAmount?: number; prizeType?: string;
  deadline: string; verificationStatus?: string; createdAt?: string; liveDate?: string | null;
}

export type ChallengeStatus = 'open' | 'closing_soon' | 'closed';
export const CLOSING_SOON_MS = 7 * 86_400_000;

const ms = (iso: unknown) => { const t = typeof iso === 'string' ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };

export function statusOf(c: Pick<ChallengeLite, 'deadline' | 'verificationStatus'>, now: number = Date.now()): ChallengeStatus {
  const d = ms(c.deadline);
  if (c.verificationStatus && c.verificationStatus !== 'live') return 'closed';
  if (d == null || d <= now) return 'closed';
  return d - now <= CLOSING_SOON_MS ? 'closing_soon' : 'open';
}
/** Open for entries right now (live and not past its deadline). */
export const isOpen = (c: ChallengeLite, now: number = Date.now()) => statusOf(c, now) !== 'closed';

export interface ChallengeFilters { q: string; industry: string; skill: string; status: '' | 'open' | 'closing_soon'; prizeOnly: boolean }
export const NO_FILTERS: ChallengeFilters = { q: '', industry: '', skill: '', status: '', prizeOnly: false };
export const anyFilter = (f: ChallengeFilters) => !!(f.q.trim() || f.industry || f.skill || f.status || f.prizeOnly);

const norm = (v: unknown) => (typeof v === 'string' ? v : '').toLowerCase().trim();

/** Open challenges that match every chosen filter, nearest deadline first. */
export function filterChallenges(list: ChallengeLite[], f: ChallengeFilters, now: number = Date.now()): ChallengeLite[] {
  const q = norm(f.q);
  return list
    .filter(c => isOpen(c, now))
    .filter(c => !f.industry || c.arenaIndustry === f.industry)
    .filter(c => !f.skill || (c.skills ?? []).some(s => norm(s) === norm(f.skill)))
    .filter(c => !f.status || statusOf(c, now) === f.status)
    .filter(c => !f.prizeOnly || (c.prizeAmount ?? 0) > 0)
    .filter(c => !q || [c.title, c.companyName, c.description, ...(c.skills ?? [])].some(t => norm(t).includes(q)))
    .sort((a, b) => (ms(a.deadline) ?? 0) - (ms(b.deadline) ?? 0) || a.id.localeCompare(b.id));
}

const TIER_RANK: Record<string, number> = { exclusive: 2, featured: 1 };

/** The one to feature: a real, open challenge. Paid-for placement (exclusive, featured) first, then the soonest deadline. null when nothing is open. */
export function pickFeatured(list: ChallengeLite[], now: number = Date.now()): ChallengeLite | null {
  const open = list.filter(c => isOpen(c, now));
  if (!open.length) return null;
  return [...open].sort((a, b) =>
    (TIER_RANK[b.tier ?? ''] ?? 0) - (TIER_RANK[a.tier ?? ''] ?? 0) || (ms(a.deadline) ?? 0) - (ms(b.deadline) ?? 0) || a.id.localeCompare(b.id))[0];
}

export interface Interests { industryNames?: string[]; skills?: string[]; followedIndustries?: string[] }

/**
 * Open challenges that overlap what the member has told us: Arena industries they follow, their profile industry (matched to an
 * Arena industry by name), and skills they list. A challenge needs at least one real overlap; with none, nothing is "for you".
 */
export function relevantFor(list: ChallengeLite[], interests: Interests, industryNameOf: (slug: string) => string, now: number = Date.now()): { challenge: ChallengeLite; reasons: string[] }[] {
  const follows = new Set(interests.followedIndustries ?? []);
  const myIndustries = (interests.industryNames ?? []).map(norm).filter(Boolean);
  const mySkills = new Set((interests.skills ?? []).map(norm).filter(Boolean));
  const out: { challenge: ChallengeLite; reasons: string[]; score: number }[] = [];
  for (const c of list) {
    if (!isOpen(c, now)) continue;
    const reasons: string[] = []; let score = 0;
    if (follows.has(c.arenaIndustry)) { reasons.push('You follow ' + industryNameOf(c.arenaIndustry)); score += 3; }
    const name = norm(industryNameOf(c.arenaIndustry));
    if (name && myIndustries.some(i => i === name || name.includes(i) || i.includes(name))) { reasons.push('Matches your industry: ' + industryNameOf(c.arenaIndustry)); score += 2; }
    const shared = (c.skills ?? []).filter(s => mySkills.has(norm(s)));
    if (shared.length) { reasons.push('Uses your skills: ' + shared.slice(0, 2).join(', ')); score += Math.min(shared.length, 3); }
    if (score > 0) out.push({ challenge: c, reasons: reasons.slice(0, 2), score });
  }
  return out.sort((a, b) => b.score - a.score || (ms(a.challenge.deadline) ?? 0) - (ms(b.challenge.deadline) ?? 0)).map(({ challenge, reasons }) => ({ challenge, reasons }));
}

/** The skills that appear on open challenges, most common first (for the skills filter). */
export function skillOptions(list: ChallengeLite[], now: number = Date.now()): string[] {
  const n = new Map<string, { label: string; count: number }>();
  for (const c of list) if (isOpen(c, now)) for (const s of c.skills ?? []) { const k = norm(s); if (!k) continue; const e = n.get(k) ?? { label: s, count: 0 }; e.count++; n.set(k, e); }
  return [...n.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).map(e => e.label);
}

/** "$5K" style text, or null when the challenge has no prize recorded (a zero is never shown as a prize). */
export function prizeText(c: Pick<ChallengeLite, 'prizeAmount' | 'prizeType'>): string | null {
  const n = c.prizeAmount ?? 0;
  if (n <= 0) return null;
  const money = n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
    : n >= 1_000 ? '$' + (n / 1_000).toFixed(n % 1_000 ? 1 : 0).replace(/\.0$/, '') + 'K'
    : '$' + n;
  if (!c.prizeType || c.prizeType === 'cash') return money;
  if (c.prizeType === 'credits') return money + ' in credits';
  return c.prizeType === 'equity' ? 'Equity prize' : c.prizeType === 'job_offer' ? 'Job offer' : 'Prize';
}

/** "3 days left", "Closes today", or null when closed. */
export function deadlineText(c: Pick<ChallengeLite, 'deadline' | 'verificationStatus'>, now: number = Date.now()): string | null {
  if (statusOf(c, now) === 'closed') return null;
  const d = ms(c.deadline)!;
  const days = Math.ceil((d - now) / 86_400_000);
  if (days <= 1) return 'Closes today';
  if (days <= 30) return days + ' days left';
  return 'Closes ' + new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
