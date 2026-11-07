/**
 * components/CompaniesPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Discover companies, the way you'd explore a professional network: 12 at a time,
 * with For You / Following / All views, search with suggestions, a few popular
 * industry chips plus "More filters", three sorts, and "Load more".
 *
 * Everything is fetched from api/companies.ts one page at a time; the browser
 * never holds the whole directory. Search, filters, sort and paging are one query
 * on the server, so the count and the pages always agree. Your choices (view,
 * search, filters, sort) and the list you had loaded survive leaving the page and
 * coming back.
 *
 * Claiming a company lives on the company's profile, not on these cards.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal, Building2, AlertTriangle, Loader2, Users, Sparkles } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  queryCompanies, suggestCompanies, setFollowing, appendUnique, queryKey,
  type CompaniesQuery, type CompaniesPage as PageData, type CompanyItem, type CompaniesView, type CompaniesSort,
} from '../lib/companiesService';
import CompanyCard, { CompanyCardSkeleton } from './companies/CompanyCard';

const GREEN = 'var(--bw-green)';
const POPULAR_CHIPS = 6;
const STORAGE_KEY = 'beWatuCompaniesState';
const SNAPSHOT_MS = 5 * 60_000;

interface CompaniesPageProps {
  onViewCompany: (companyId: number | string) => void;
  /** Opens the member's own profile, where industry and goals are set (used by the For You hint). */
  onEditProfile?: () => void;
}

interface UiState { view: CompaniesView; q: string; industry: string; hiring: boolean; challenges: boolean; sponsor: boolean; sort: CompaniesSort }

const VIEW_LABEL: Record<CompaniesView, string> = { for_you: 'For You', following: 'Following', all: 'All Companies' };
const SORT_LABEL: Record<CompaniesSort, string> = { relevance: 'Relevance', recent: 'Recent activity', alpha: 'A–Z' };

// ── remembered between visits ────────────────────────────────────────────────
function readSaved(): Partial<UiState> | null {
  try { const raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSaved(s: UiState) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage may be unavailable */ } }

/** The list as it was when the member left, so coming back is instant and in the same place. */
let snapshot: { key: string; page: PageData; items: CompanyItem[]; nextCursor: string | null; scrollY: number; at: number } | null = null;

const toQuery = (s: UiState, q: string): CompaniesQuery => ({
  view: s.view, q, industry: s.industry, filters: { hiring: s.hiring, challenges: s.challenges, sponsor: s.sponsor }, sort: s.sort,
});

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function CompaniesPage({ onViewCompany, onEditProfile }: CompaniesPageProps) {
  const { currentUser, fbUser } = useFirebase();
  const hasPrefs = !!((currentUser as any)?.industry || ((currentUser as any)?.professionalGoals?.length ?? 0) > 0);

  const [ui, setUi] = useState<UiState>(() => {
    const s = readSaved();
    return {
      view: (['for_you', 'following', 'all'] as const).includes(s?.view as any) ? s!.view! : hasPrefs ? 'for_you' : 'all',
      q: typeof s?.q === 'string' ? s.q : '', industry: typeof s?.industry === 'string' ? s.industry : '',
      hiring: !!s?.hiring, challenges: !!s?.challenges, sponsor: !!s?.sponsor,
      sort: (['relevance', 'recent', 'alpha'] as const).includes(s?.sort as any) ? s!.sort! : 'relevance',
    };
  });
  // The profile can finish loading after this page opens. If the member has never picked a view
  // (nothing remembered, nothing clicked), start them on For You once we know they have interests.
  const hadSavedView = useRef(!!readSaved()?.view);
  const pickedView = useRef(false);
  useEffect(() => {
    if (hasPrefs && !hadSavedView.current && !pickedView.current) setUi(p => (p.view === 'all' ? { ...p, view: 'for_you' } : p));
  }, [hasPrefs]);
  const [qInput, setQInput] = useState(ui.q);
  const debouncedQ = useDebounced(qInput, 300);
  const query = useMemo(() => toQuery(ui, debouncedQ), [ui, debouncedQ]);
  const key = useMemo(() => queryKey(query, null), [query]);

  const [items, setItems] = useState<CompanyItem[]>([]);
  const [page, setPage] = useState<PageData | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const reqId = useRef(0);
  const restored = useRef(false);

  const set = useCallback(<K extends keyof UiState>(k: K, v: UiState[K]) => {
    if (k === 'view') pickedView.current = true;
    setUi(p => ({ ...p, [k]: v }));
  }, []);

  // keep the typed text and the committed query in step, and remember the choices
  useEffect(() => { setUi(p => (p.q === debouncedQ ? p : { ...p, q: debouncedQ })); }, [debouncedQ]);
  useEffect(() => { writeSaved(ui); }, [ui]);

  // ── first page for the current query ──
  const loadFirst = useCallback(async (force = false) => {
    const id = ++reqId.current;
    setLoading(true); setError(null); setMoreError(null);
    try {
      const data = await queryCompanies(query, null, { force });
      if (id !== reqId.current) return;           // a newer search has started
      setPage(data); setItems(appendUnique([], data.items)); setNextCursor(data.nextCursor);
    } catch (e: any) {
      if (id !== reqId.current || e?.name === 'AbortError') return;
      setError(e?.message ?? 'Could not load companies.');
    } finally { if (id === reqId.current) setLoading(false); }
  }, [query]);

  useEffect(() => {
    if (!restored.current && snapshot && snapshot.key === key && Date.now() - snapshot.at < SNAPSHOT_MS) {
      restored.current = true;
      setPage(snapshot.page); setItems(snapshot.items); setNextCursor(snapshot.nextCursor); setLoading(false);
      requestAnimationFrame(() => window.scrollTo(0, snapshot!.scrollY));
      return;
    }
    restored.current = true;
    loadFirst();
  }, [key, loadFirst]);

  // remember the list (and where you were in it) for the way back
  const latest = useRef({ key, page, items, nextCursor });
  latest.current = { key, page, items, nextCursor };
  useEffect(() => () => {
    const l = latest.current;
    snapshot = l.page ? { key: l.key, page: l.page, items: l.items, nextCursor: l.nextCursor, scrollY: window.scrollY, at: Date.now() } : null;
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const id = reqId.current;
    setLoadingMore(true); setMoreError(null);
    try {
      const data = await queryCompanies(query, nextCursor);
      if (id !== reqId.current) return;
      setItems(prev => appendUnique(prev, data.items)); setNextCursor(data.nextCursor);
    } catch (e: any) { setMoreError(e?.message ?? 'Could not load more.'); }
    finally { setLoadingMore(false); }
  };

  // ── follow / unfollow, with the card updating at once ──
  const toggleFollow = async (c: CompanyItem) => {
    const next = !c.following;
    const patch = (following: boolean, followerCount: number) =>
      setItems(prev => prev.map(x => (x.id === c.id ? { ...x, following, followerCount } : x)));
    patch(next, Math.max(0, c.followerCount + (next ? 1 : -1)));
    try {
      const r = await setFollowing(c.id, next);
      patch(r.following, r.followerCount);
      if (ui.view === 'following' && !r.following) {            // it no longer belongs in this view
        setItems(prev => prev.filter(x => x.id !== c.id));
        setPage(p => (p ? { ...p, total: Math.max(0, p.total - 1) } : p));
      }
    } catch (e) { patch(c.following, c.followerCount); throw e; }
  };

  // ── search suggestions ──
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [sugg, setSugg] = useState<{ companies: { id: string; name: string; industry: string }[]; industries: string[] }>({ companies: [], industries: [] });
  const [activeIdx, setActiveIdx] = useState(-1);
  const suggText = useDebounced(qInput, 200);
  useEffect(() => {
    let live = true;
    if (!focused || suggText.trim().length < 2) { setSugg({ companies: [], industries: [] }); return; }
    suggestCompanies(suggText).then(r => { if (live) { setSugg(r); setActiveIdx(-1); } }).catch(() => { if (live) setSugg({ companies: [], industries: [] }); });
    return () => { live = false; };
  }, [suggText, focused]);
  const options = [
    ...sugg.companies.map(c => ({ type: 'company' as const, label: c.name, hint: c.industry, value: c.name })),
    ...sugg.industries.map(i => ({ type: 'industry' as const, label: i, hint: 'Industry', value: i })),
  ];
  const showSugg = focused && options.length > 0;
  const choose = (o: typeof options[number]) => {
    if (o.type === 'company') { setQInput(o.value); }
    else { setQInput(''); set('industry', o.value.toLowerCase()); }
    setFocused(false); setActiveIdx(-1);
  };
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && options.length) { e.preventDefault(); setActiveIdx(i => (i + 1) % options.length); }
    else if (e.key === 'ArrowUp' && options.length) { e.preventDefault(); setActiveIdx(i => (i <= 0 ? options.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && showSugg && activeIdx >= 0) { e.preventDefault(); choose(options[activeIdx]); }
    else if (e.key === 'Escape') { setFocused(false); setActiveIdx(-1); }
  };

  // ── filters ──
  const facets = page?.facets ?? [];
  const chips = facets.slice(0, POPULAR_CHIPS);
  const selectedFacet = facets.find(f => f.key === ui.industry);
  const extraChip = ui.industry && !chips.some(c => c.key === ui.industry) ? (selectedFacet ?? { key: ui.industry, label: ui.industry, count: 0 }) : null;
  const moreCount = (ui.hiring ? 1 : 0) + (ui.challenges ? 1 : 0) + (ui.sponsor ? 1 : 0) + (ui.industry && !chips.some(c => c.key === ui.industry) ? 1 : 0);
  const anyFilter = !!ui.industry || ui.hiring || ui.challenges || ui.sponsor || !!qInput.trim();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const down = (e: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [moreOpen]);
  const clearAll = () => { setQInput(''); setUi(p => ({ ...p, q: '', industry: '', hiring: false, challenges: false, sponsor: false })); };

  const total = page?.total ?? 0;
  const forYou = page?.meta.forYou;
  const chipCls = (on: boolean) => `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 ${on ? 'text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`;
  const chipStyle = (on: boolean): React.CSSProperties => ({ ['--tw-ring-color' as any]: GREEN, ...(on ? { backgroundColor: GREEN, borderColor: GREEN } : {}) });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Companies</h1>
        <p className="mt-1 text-sm text-stone-600 sm:text-base">Find companies worth following, see who is hiring and what they are building.</p>
      </header>

      {/* Views */}
      <div role="tablist" aria-label="Company views" className="mb-4 inline-flex rounded-xl bg-stone-100 p-1">
        {(Object.keys(VIEW_LABEL) as CompaniesView[]).map(v => (
          <button key={v} role="tab" aria-selected={ui.view === v} onClick={() => set('view', v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 sm:px-4 ${ui.view === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
            style={{ ['--tw-ring-color' as any]: GREEN }}>
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {/* Search + sort */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <input
            type="text" role="combobox" aria-expanded={showSugg} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
            aria-label="Search companies" placeholder="Search by name, industry or ticker"
            value={qInput} onChange={e => setQInput(e.target.value)}
            onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} onKeyDown={onSearchKey}
            className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-10 text-sm focus:outline-none focus-visible:ring-2"
            style={{ ['--tw-ring-color' as any]: GREEN }}
          />
          {qInput && (
            <button type="button" aria-label="Clear search" onClick={() => setQInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X size={15} /></button>
          )}
          {showSugg && (
            <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
              {options.map((o, i) => (
                <li key={o.type + o.value} id={`${listId}-${i}`} role="option" aria-selected={i === activeIdx}
                  onMouseDown={e => { e.preventDefault(); choose(o); }}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-sm ${i === activeIdx ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                  <span className="truncate text-stone-900">{o.label}</span>
                  <span className="flex-shrink-0 text-xs text-stone-500">{o.hint}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select aria-label="Sort companies" value={ui.sort} onChange={e => set('sort', e.target.value as CompaniesSort)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
            {(Object.keys(SORT_LABEL) as CompaniesSort[]).map(s => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      {/* Industry chips + more filters */}
      <div className="mb-4 flex items-center gap-2">
        <div className="-mx-1 flex w-0 min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="Industries">
          <button type="button" aria-pressed={!ui.industry} onClick={() => set('industry', '')} className={chipCls(!ui.industry)} style={chipStyle(!ui.industry)}>All industries</button>
          {chips.map(f => (
            <button key={f.key} type="button" aria-pressed={ui.industry === f.key} onClick={() => set('industry', ui.industry === f.key ? '' : f.key)} className={chipCls(ui.industry === f.key)} style={chipStyle(ui.industry === f.key)}>
              {f.label} <span className={ui.industry === f.key ? 'text-white/80' : 'text-stone-500'}>{f.count}</span>
            </button>
          ))}
          {extraChip && (
            <button type="button" aria-pressed onClick={() => set('industry', '')} className={`${chipCls(true)} inline-flex items-center gap-1`} style={chipStyle(true)}>
              {extraChip.label} <X size={13} aria-label="Remove industry filter" />
            </button>
          )}
        </div>
        <div className="relative flex-shrink-0" ref={moreRef}>
          <button type="button" aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen(o => !o)}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
            <SlidersHorizontal size={14} aria-hidden="true" /> More filters
            {moreCount > 0 && <span className="rounded-full px-1.5 text-xs font-bold text-white" style={{ backgroundColor: GREEN }}>{moreCount}</span>}
          </button>
          {moreOpen && (
            <div role="dialog" aria-label="More filters" className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl">
              <label className="block text-xs font-semibold text-stone-700" htmlFor={`${listId}-ind`}>Industry</label>
              <select id={`${listId}-ind`} value={ui.industry} onChange={e => set('industry', e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm">
                <option value="">All industries</option>
                {facets.map(f => <option key={f.key} value={f.key}>{f.label} ({f.count})</option>)}
              </select>
              <fieldset className="mt-4 space-y-2">
                <legend className="text-xs font-semibold text-stone-700">Activity</legend>
                {([['hiring', 'Hiring now'], ['challenges', 'Has live challenges'], ['sponsor', 'Sponsors an Arena']] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-stone-800">
                    <input type="checkbox" checked={ui[k]} onChange={e => set(k, e.target.checked)} className="h-4 w-4 rounded border-stone-300" /> {label}
                  </label>
                ))}
              </fieldset>
              <div className="mt-4 flex justify-between">
                <button type="button" onClick={clearAll} className="text-sm font-semibold text-stone-600 hover:underline">Clear all</button>
                <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* For You hint: only when the list is the general fallback */}
      {ui.view === 'for_you' && forYou && forYou.fallback && !loading && items.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          <Sparkles size={16} className="mt-0.5 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" />
          <p>
            {forYou.hasPreferences
              ? 'Nothing matches your profile yet, so these are companies with open roles and live challenges.'
              : 'Showing companies with open roles and live challenges. Add your industry and goals to your profile to get recommendations that fit you.'}
            {onEditProfile && !forYou.hasPreferences && <> <button type="button" onClick={onEditProfile} className="font-semibold underline" style={{ color: GREEN }}>Update your profile</button></>}
          </p>
        </div>
      )}

      {/* Count */}
      <p className="mb-3 text-sm text-stone-600" aria-live="polite">
        {loading ? 'Loading companies…' : error ? '' : `${total.toLocaleString()} ${total === 1 ? 'company' : 'companies'}${debouncedQ.trim() ? ` matching “${debouncedQ.trim()}”` : ''}`}
      </p>

      {/* Results */}
      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <AlertTriangle className="text-red-600" size={24} aria-hidden="true" />
          <p className="max-w-md text-sm text-red-800">{error}</p>
          <button type="button" onClick={() => loadFirst(true)} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Try again</button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 12 }).map((_, i) => <CompanyCardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyResults view={ui.view} anyFilter={anyFilter} query={debouncedQ.trim()} onClear={clearAll} onBrowse={() => set('view', 'all')} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(c => (
              <CompanyCard key={c.id} company={c} canFollow={!!fbUser} onView={() => onViewCompany(c.id)} onToggleFollow={() => toggleFollow(c)} />
            ))}
          </div>
          <div className="mt-6 flex flex-col items-center gap-2">
            {nextCursor ? (
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 disabled:opacity-60" style={{ ['--tw-ring-color' as any]: GREEN }}>
                {loadingMore && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Load more companies
              </button>
            ) : (
              <p className="text-sm text-stone-500">{items.length === total ? `That's all ${total.toLocaleString()}.` : ''}</p>
            )}
            {nextCursor && <p className="text-xs text-stone-500">Showing {items.length.toLocaleString()} of {total.toLocaleString()}</p>}
            {moreError && <p role="alert" className="text-sm text-red-700">{moreError} <button type="button" onClick={loadMore} className="font-semibold underline">Retry</button></p>}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyResults({ view, anyFilter, query, onClear, onBrowse }: { view: CompaniesView; anyFilter: boolean; query: string; onClear: () => void; onBrowse: () => void }) {
  let title = 'No companies found', body = 'Try a different search.', action: React.ReactNode = null;
  if (anyFilter) {
    title = query ? `No companies match “${query}”` : 'No companies match these filters';
    body = 'Try a shorter search, or remove a filter.';
    action = <button type="button" onClick={onClear} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50">Clear search and filters</button>;
  } else if (view === 'following') {
    title = 'You are not following any companies yet';
    body = 'Follow companies to see them here, and to hear about their roles and challenges.';
    action = <button type="button" onClick={onBrowse} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Browse all companies</button>;
  } else if (view === 'for_you') {
    title = 'Nothing to recommend yet'; body = 'Browse all companies to find some to follow.';
    action = <button type="button" onClick={onBrowse} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Browse all companies</button>;
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 px-6 py-14 text-center">
      {view === 'following' && !anyFilter ? <Users size={26} className="text-stone-400" aria-hidden="true" /> : <Building2 size={26} className="text-stone-400" aria-hidden="true" />}
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <p className="max-w-sm text-sm text-stone-600">{body}</p>
      {action}
    </div>
  );
}
