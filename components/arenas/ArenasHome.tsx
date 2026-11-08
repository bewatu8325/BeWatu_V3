/**
 * components/arenas/ArenasHome.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Arenas, as a destination of its own: why industry challenges are worth doing, the open ones (real records only),
 * search and filters, challenges relevant to this member, and every industry's Arena with its sponsor.
 *
 * Honesty rules:
 *   - A challenge, sponsor, prize, deadline or count appears only because a real record says so. A challenge without a prize
 *     shows no prize. A count of zero is never the headline: an industry with nothing open says so in words.
 *   - "For you" needs a real overlap (an industry you follow or work in, a skill you list); with none, it is not shown.
 *   - Following an industry and being notified are separate choices. The alert is sent when a challenge in a followed
 *     industry goes live (functions/src/arenaAlerts.ts), and only to members who switched it on.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, SlidersHorizontal, Trophy, Clock, ChevronRight, Bell, Check, Loader2, Plus, Users } from 'lucide-react';
import { getArenaIndustries, type ArenaIndustry } from '../../lib/arenaService';
import {
  filterChallenges, pickFeatured, relevantFor, skillOptions, prizeText, deadlineText, statusOf, anyFilter, NO_FILTERS,
  type ChallengeFilters, type ChallengeLite,
} from '../../lib/arenaDiscovery';
import { loadChallenges, getArenaInterests, followArenaIndustry, setArenaInterests, type ArenaInterests } from '../../lib/arenaClient';
import { ICON_MAP } from './ArenaDiscovery';
import { SponsoredCardHeader, useActiveSponsorships } from './SponsorBrand';
import BecomeSponsorModal from './BecomeSponsorModal';
import BottomSheet from '../mobile/BottomSheet';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const STORAGE_KEY = 'beWatuArenasState';
const ring = { ['--tw-ring-color' as any]: GREEN } as React.CSSProperties;

interface Props {
  currentUser: any;
  /** The member may post an Arena challenge (a recruiter whose organization is verified for an industry). */
  canPost: boolean;
  onSelectIndustry: (slug: string) => void;
  onOpenChallenge: (challengeId: string) => void;
  onStartPod: (c: ChallengeLite) => void;
  onPostChallenge: () => void;
}

function readSaved(): ChallengeFilters {
  try { const raw = sessionStorage.getItem(STORAGE_KEY); if (!raw) return NO_FILTERS; const s = JSON.parse(raw); return { ...NO_FILTERS, q: String(s.q ?? '').slice(0, 80), industry: String(s.industry ?? ''), skill: String(s.skill ?? ''), status: s.status === 'open' || s.status === 'closing_soon' ? s.status : '', prizeOnly: s.prizeOnly === true }; } catch { return NO_FILTERS; }
}

// ── one challenge ──
const ChallengeCard: React.FC<{ c: ChallengeLite; industryName: string; reasons?: string[]; onOpen: () => void; onStartPod: () => void }> = ({ c, industryName, reasons, onOpen, onStartPod }) => {
  const prize = prizeText(c); const when = deadlineText(c); const soon = statusOf(c) === 'closing_soon';
  return (
    <article className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5" aria-label={c.title}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-700">{industryName}</span>
        {c.tier === 'featured' || c.tier === 'exclusive' ? <span className="rounded-full px-2.5 py-1 font-semibold" style={{ backgroundColor: GREEN_LT, color: GREEN }}>{c.tier === 'exclusive' ? 'Exclusive' : 'Featured'}</span> : null}
      </div>
      <h3 className="text-base font-semibold leading-snug text-stone-900">{c.title}</h3>
      {c.companyName && <p className="mt-0.5 text-xs text-stone-600">{c.companyName}</p>}
      {c.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600">{c.description}</p>}
      {(c.skills?.length ?? 0) > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
          {c.skills!.slice(0, 4).map(s => <li key={s} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700">{s}</li>)}
          {c.skills!.length > 4 && <li className="px-1 py-1 text-xs text-stone-500">+{c.skills!.length - 4} more</li>}
        </ul>
      )}
      {reasons && reasons.length > 0 && <p className="mt-3 text-xs text-stone-600">{reasons[0]}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-stone-700">
        {prize && <span className="inline-flex items-center gap-1"><Trophy size={13} aria-hidden="true" /> {prize}</span>}
        {when && <span className={`inline-flex items-center gap-1 ${soon ? 'text-amber-700' : ''}`}><Clock size={13} aria-hidden="true" /> {when}</span>}
        {c.difficulty && <span className="capitalize">{c.difficulty}</span>}
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <button type="button" onClick={onOpen} className="min-h-[44px] flex-1 rounded-xl px-3 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...ring }}>View challenge</button>
        <button type="button" onClick={onStartPod} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-300 px-3 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={ring} title="Start a pod to take this challenge on as a team">
          <Users size={15} aria-hidden="true" /> Team up
        </button>
      </div>
    </article>
  );
};

export default function ArenasHome({ currentUser, canPost, onSelectIndustry, onOpenChallenge, onStartPod, onPostChallenge }: Props) {
  const [industries, setIndustries] = useState<ArenaIndustry[]>([]);
  const [challenges, setChallenges] = useState<ChallengeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<ChallengeFilters>(readSaved);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [interests, setInterests] = useState<ArenaInterests>({ industries: [], notify: false });
  const [interestsReady, setInterestsReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [sponsorModal, setSponsorModal] = useState<{ id: string; name: string } | null>(null);
  const { forArena, loading: sponsorsLoading } = useActiveSponsorships();

  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* storage may be unavailable */ } }, [filters]);

  const load = useCallback(() => {
    setLoading(true); setError('');
    Promise.all([getArenaIndustries(), loadChallenges()])
      .then(([inds, chs]) => { setIndustries(inds.filter(i => i.isActive !== false)); setChallenges(chs); })
      .catch(() => setError('Could not load Arenas. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getArenaInterests().then(setInterests).catch(() => { /* following is optional */ }).finally(() => setInterestsReady(true)); }, []);

  const nameOf = useCallback((slug: string) => industries.find(i => i.id === slug)?.name ?? slug, [industries]);
  const now = Date.now();
  const open = useMemo(() => challenges.filter(c => statusOf(c, now) !== 'closed'), [challenges, now]);
  const featured = useMemo(() => pickFeatured(challenges, now), [challenges, now]);
  const shown = useMemo(() => filterChallenges(challenges, filters, now), [challenges, filters, now]);
  const skills = useMemo(() => skillOptions(challenges, now), [challenges, now]);
  const openByIndustry = useMemo(() => { const m = new Map<string, number>(); open.forEach(c => m.set(c.arenaIndustry, (m.get(c.arenaIndustry) ?? 0) + 1)); return m; }, [open]);
  const forYou = useMemo(() => relevantFor(challenges, {
    followedIndustries: interests.industries, industryNames: currentUser?.industry ? [String(currentUser.industry)] : [],
    skills: (currentUser?.skills ?? []).map((s: any) => (typeof s === 'string' ? s : s?.name)).filter(Boolean),
  }, nameOf, now), [challenges, interests.industries, currentUser, nameOf, now]);

  const set = <K extends keyof ChallengeFilters>(k: K, v: ChallengeFilters[K]) => setFilters(f => ({ ...f, [k]: v }));
  const filtering = anyFilter(filters);
  const chips: { id: string; label: string; clear: () => void }[] = [
    ...(filters.industry ? [{ id: 'industry', label: nameOf(filters.industry), clear: () => set('industry', '') }] : []),
    ...(filters.skill ? [{ id: 'skill', label: filters.skill, clear: () => set('skill', '') }] : []),
    ...(filters.status ? [{ id: 'status', label: filters.status === 'open' ? 'Open' : 'Closing soon', clear: () => set('status', '') }] : []),
    ...(filters.prizeOnly ? [{ id: 'prize', label: 'Has a prize', clear: () => set('prizeOnly', false) }] : []),
  ];

  const follows = (slug: string) => interests.industries.includes(slug);
  const toggleFollow = async (slug: string) => {
    setBusy(slug); setNote(null);
    try { setInterests(await followArenaIndustry(slug, !follows(slug))); }
    catch (e: any) { setNote({ ok: false, text: e?.message ?? 'Could not update. Try again.' }); }
    finally { setBusy(null); }
  };
  const toggleNotify = async () => {
    setBusy('notify'); setNote(null);
    try {
      const r = await setArenaInterests(interests.industries, !interests.notify);
      setInterests(r);
      setNote({ ok: true, text: r.notify ? 'We will tell you when a challenge goes live in an industry you follow.' : 'Alerts are off. You still follow the same industries.' });
    } catch (e: any) { setNote({ ok: false, text: e?.message ?? 'Could not update. Try again.' }); }
    finally { setBusy(null); }
  };

  const scrollToIndustries = () => document.getElementById('arena-industries')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-1 py-4" aria-busy="true">
        <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-stone-100" />)}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="mx-auto my-10 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
        <p className="text-sm text-red-800">{error}</p>
        <button type="button" onClick={load} className="min-h-[44px] rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">Try again</button>
      </div>
    );
  }

  const interestsStrip = (
    <section aria-label="Your Arena interests" className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-stone-900">Your Arena interests</h2>
          <p className="mt-0.5 text-xs text-stone-600">{interests.industries.length ? 'Following ' + interests.industries.map(nameOf).join(', ') + '.' : 'Follow industries to see challenges that fit you here.'}</p>
        </div>
        <button type="button" role="switch" aria-checked={interests.notify} disabled={busy === 'notify' || interests.industries.length === 0} onClick={toggleNotify}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 px-3 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2" style={ring}
          title={interests.industries.length === 0 ? 'Follow an industry first' : undefined}>
          {busy === 'notify' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
          Notify me about new challenges
          <span className="ml-1 inline-flex h-5 w-9 items-center rounded-full transition-colors" style={{ backgroundColor: interests.notify ? GREEN : '#d6d3d1' }} aria-hidden="true">
            <span className="h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: `translateX(${interests.notify ? 18 : 2}px)` }} />
          </span>
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-1 min-h-[1rem] text-xs ${note?.ok === false ? 'text-red-700' : 'text-emerald-700'}`}>{note?.text ?? ''}</p>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 py-4 sm:py-6">
      {/* Why Arenas */}
      <header>
        <p className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: GREEN_LT, color: GREEN }}>BeWatu Arenas</p>
        <h1 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">Real problems. Real opportunity.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 sm:text-base">
          Put your expertise to work on challenges from organizations, team up with other professionals, and build evidence of what you can do. Submissions are judged on the work.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={scrollToIndustries} className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={ring}>Explore industries</button>
          {canPost && <button type="button" onClick={onPostChallenge} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...ring }}><Plus size={15} aria-hidden="true" /> Post a challenge</button>}
        </div>
      </header>

      {/* Featured: only a real, open challenge */}
      {featured && !filtering && (
        <section aria-label="Featured challenge" className="rounded-2xl p-5 text-white sm:p-6" style={{ backgroundColor: GREEN }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Featured challenge{featured.companyName ? ' · ' + featured.companyName : ''}</p>
          <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{featured.title}</h2>
          {featured.description && <p className="mt-2 line-clamp-3 max-w-2xl text-sm leading-relaxed text-white/85">{featured.description}</p>}
          {(featured.skills?.length ?? 0) > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{featured.skills!.slice(0, 4).map(s => <li key={s} className="rounded-full bg-white/15 px-2.5 py-1 text-xs">{s}</li>)}</ul>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-white/85">
            <span>{nameOf(featured.arenaIndustry)}</span>
            {prizeText(featured) && <span>{prizeText(featured)}</span>}
            {deadlineText(featured) && <span>{deadlineText(featured)}</span>}
          </div>
          <button type="button" onClick={() => onOpenChallenge(featured.id)} className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold sm:w-auto" style={{ color: GREEN }}>
            Explore challenge <ChevronRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}

      {/* For you: only with a real overlap */}
      {forYou.length > 0 && !filtering && (
        <section aria-label="Challenges for you">
          <h2 className="mb-3 text-lg font-bold text-stone-900">For you</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {forYou.slice(0, 4).map(({ challenge, reasons }) => <ChallengeCard key={challenge.id} c={challenge} reasons={reasons} industryName={nameOf(challenge.arenaIndustry)} onOpen={() => onOpenChallenge(challenge.id)} onStartPod={() => onStartPod(challenge)} />)}
          </div>
        </section>
      )}

      {/* Search + filters, and the open challenges */}
      {open.length > 0 ? (
        <section aria-label="Open challenges">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
              <input type="text" aria-label="Search challenges" placeholder="Search challenges" value={filters.q} onChange={e => set('q', e.target.value.slice(0, 80))}
                className="min-h-[44px] w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-11 text-base focus:outline-none focus-visible:ring-2 sm:text-sm" style={ring} />
              {filters.q && <button type="button" aria-label="Clear search" onClick={() => set('q', '')} className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"><X size={16} /></button>}
            </div>
            <button type="button" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={ring}>
              <SlidersHorizontal size={16} aria-hidden="true" /> Filters
              {chips.length > 0 && <span className="rounded-full px-1.5 text-xs font-bold text-white" style={{ backgroundColor: GREEN }}><span className="sr-only">{chips.length} active: </span>{chips.length}</span>}
            </button>
          </div>
          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
              {chips.map(c => (
                <button key={c.id} type="button" onClick={c.clear} aria-label={'Remove filter: ' + c.label} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...ring }}>{c.label}<X size={14} aria-hidden="true" /></button>
              ))}
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className="min-h-[44px] px-2 text-sm font-semibold text-stone-600 hover:underline">Clear all</button>
            </div>
          )}
          <h2 className="mb-3 text-lg font-bold text-stone-900" aria-live="polite">
            {filtering ? `${shown.length} ${shown.length === 1 ? 'challenge matches' : 'challenges match'}` : 'Open challenges'}
          </h2>
          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-stone-900">No open challenges match</p>
              <p className="mt-1 text-sm text-stone-600">Try fewer filters, or follow the industries you care about to hear when new ones appear.</p>
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className="mt-3 min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {shown.map(c => <ChallengeCard key={c.id} c={c} industryName={nameOf(c.arenaIndustry)} onOpen={() => onOpenChallenge(c.id)} onStartPod={() => onStartPod(c)} />)}
            </div>
          )}
        </section>
      ) : (
        /* Nothing open: say so, and give a real next step */
        <section aria-label="No open challenges" className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-stone-900">No open challenges right now</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-600">
            Challenges are posted by verified organizations, so there will be gaps. Pick the industries you care about below; follow them and, if you like, we will tell you when one goes live.
          </p>
          <button type="button" onClick={scrollToIndustries} className="mt-3 min-h-[44px] rounded-xl px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...ring }}>Explore industries</button>
        </section>
      )}

      {interestsReady && interestsStrip}

      {/* Every industry's Arena */}
      <section id="arena-industries" aria-label="Explore by industry" className="scroll-mt-20">
        <h2 className="mb-3 text-lg font-bold text-stone-900">Explore by industry</h2>
        {industries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 px-6 py-8 text-center text-sm text-stone-600">Industry Arenas are not available yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {industries.map(ind => {
              const Icon = ICON_MAP[ind.icon] ?? ICON_MAP.CreditCard;
              const sponsor = forArena(ind.id); const n = openByIndustry.get(ind.id) ?? 0;
              return (
                <div key={ind.id} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-md">
                  {sponsor && <SponsoredCardHeader sponsorship={sponsor} />}
                  <button type="button" onClick={() => onSelectIndustry(ind.id)} aria-label={ind.name + (sponsor ? ', sponsored by ' + sponsor.companyName : '')}
                    className="block w-full flex-1 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:p-5" style={ring}>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: ind.color + '18' }}><Icon size={20} color={ind.color} /></span>
                    <h3 className="mt-3 text-base font-semibold text-stone-900">{ind.name}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-stone-600">{ind.tagline}</p>
                    <p className="mt-3 text-xs font-medium text-stone-700">{n > 0 ? `${n} open ${n === 1 ? 'challenge' : 'challenges'}` : 'Nothing open yet'}</p>
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-2 sm:px-5">
                    <button type="button" onClick={() => toggleFollow(ind.id)} disabled={busy === ind.id} aria-pressed={follows(ind.id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:opacity-60" style={{ color: GREEN, ...ring }}>
                      {busy === ind.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : follows(ind.id) ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                      {follows(ind.id) ? 'Following' : 'Follow'}
                    </button>
                    {!sponsor && !sponsorsLoading && (
                      <button type="button" onClick={() => setSponsorModal({ id: ind.id, name: ind.name })} className="min-h-[44px] text-xs font-semibold text-stone-600 hover:underline">Sponsor this Arena</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter challenges" allWidths
        footer={<div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setFilters(f => ({ ...NO_FILTERS, q: f.q }))} className="min-h-[44px] whitespace-nowrap px-2 text-sm font-semibold text-stone-600 hover:underline">Clear filters</button>
          <button type="button" onClick={() => setFiltersOpen(false)} className="min-h-[44px] whitespace-nowrap rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Show {shown.length} {shown.length === 1 ? 'challenge' : 'challenges'}</button>
        </div>}>
        <div className="space-y-4 pt-1">
          {([
            ['industry', 'Industry', filters.industry, 'All industries', industries.map(i => ({ k: i.id, l: i.name }))],
            ['skill', 'Skill', filters.skill, 'Any skill', skills.map(s => ({ k: s, l: s }))],
            ['status', 'Status', filters.status, 'Any status', [{ k: 'open', l: 'Open' }, { k: 'closing_soon', l: 'Closing within 7 days' }]],
          ] as const).map(([key, label, value, any, opts]) => (
            <div key={key}>
              <label className="block text-sm font-semibold text-stone-800" htmlFor={'arena-f-' + key}>{label}</label>
              <select id={'arena-f-' + key} value={value} onChange={e => set(key, e.target.value as any)} className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base sm:text-sm">
                <option value="">{any}</option>
                {opts.map(o => <option key={o.k} value={o.k}>{o.l}</option>)}
              </select>
            </div>
          ))}
          <label className="flex min-h-[44px] items-center gap-3 text-sm text-stone-800">
            <input type="checkbox" checked={filters.prizeOnly} onChange={e => set('prizeOnly', e.target.checked)} className="h-5 w-5 rounded border-stone-300" /> Only challenges with a prize
          </label>
        </div>
      </BottomSheet>

      {sponsorModal && <BecomeSponsorModal arenaId={sponsorModal.id} arenaName={sponsorModal.name} onClose={() => setSponsorModal(null)} />}
    </div>
  );
}
