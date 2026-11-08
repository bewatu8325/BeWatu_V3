/**
 * components/CompaniesPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Discover organizations (companies, colleges and universities, hospitals and health systems, and more): 12 at a
 * time, with For You / Following / All views, search with suggestions, category pills, a "More" sheet for every category
 * and the advanced filters, and "Load more".
 *
 * Three things stay distinct:
 *   suggested   shortcuts in the pill row (Finance, Healthcare, Technology, Education for a new member). Pressing one selects it.
 *   selected    what is filtering the list right now. Temporary: lives in the address and this tab, never overwrites the saved defaults.
 *   saved       the member's own default categories, stored in their account and restored on any device. Changed only by
 *               "Save as my defaults".
 * When the page opens, the address decides first (a shared or bookmarked link), then what this tab already had, then the
 * member's saved defaults, then no category at all (everything).
 *
 * Everything is fetched from api/companies.ts one page at a time; the browser never holds the whole directory.
 * Claiming an organization lives on its profile, not on these cards.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X, Building2, AlertTriangle, Loader2, Users, Sparkles, Check } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  queryCompanies, suggestCompanies, setFollowing, appendUnique, queryKey, getOrgPrefs, saveOrgPrefs,
  type CompaniesQuery, type CompaniesPage as PageData, type CompanyItem, type CompaniesView, type CompaniesSort,
} from '../lib/companiesService';
import CompanyCard, { CompanyCardSkeleton } from './companies/CompanyCard';
import { parseCategoryParam, categoryParam, BROAD_LABEL, DEFAULT_PILLS, type BroadKey, type OrganizationType } from '../lib/organizations';
import { fromSearch, toSearch, isDirectoryPath } from '../lib/orgUrlState';
import CategoryPills, { type ActiveFilter } from './organizations/CategoryPills';
import MoreFiltersSheet from './organizations/MoreFiltersSheet';

const GREEN = 'var(--bw-green)';
const STORAGE_KEY = 'beWatuCompaniesState';
const SNAPSHOT_MS = 5 * 60_000;

interface CompaniesPageProps {
  onViewCompany: (companyId: number | string) => void;
  /** Opens the member's own profile, where industry and goals are set (used by the For You hint). */
  onEditProfile?: () => void;
}

interface UiState {
  view: CompaniesView; q: string; industry: string; category: string; orgType: OrganizationType | ''; country: string;
  hiring: boolean; challenges: boolean; sponsor: boolean; sort: CompaniesSort;
}

const VIEW_LABEL: Record<CompaniesView, string> = { for_you: 'For You', following: 'Following', all: 'All' };
const SORT_LABEL: Record<CompaniesSort, string> = { relevance: 'Relevance', recent: 'Recent activity', followers: 'Most followed', alpha: 'A–Z' };
// ── remembered between visits ────────────────────────────────────────────────
function readSaved(): Partial<UiState> | null {
  try { const raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSaved(s: UiState) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage may be unavailable */ } }

/** The list as it was when the member left, so coming back is instant and in the same place. */
let snapshot: { key: string; page: PageData; items: CompanyItem[]; nextCursor: string | null; scrollY: number; at: number } | null = null;

const toQuery = (s: UiState, q: string): CompaniesQuery => ({
  view: s.view, q, industry: s.industry, category: s.category, organizationType: s.orgType, country: s.country, filters: { hiring: s.hiring, challenges: s.challenges, sponsor: s.sponsor }, sort: s.sort,
});

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function CompaniesPage({ onViewCompany, onEditProfile }: CompaniesPageProps) {
  const { currentUser, fbUser } = useFirebase();
  const hasPrefs = !!((currentUser as any)?.industry || ((currentUser as any)?.professionalGoals?.length ?? 0) > 0);

  // The address wins (a shared or reloaded link), then what this tab remembered, then the member's saved defaults (below), then everything.
  const fromUrl = useMemo(() => (typeof window !== 'undefined' && isDirectoryPath(window.location.pathname) ? fromSearch(window.location.search) : {}), []);
  const [ui, setUi] = useState<UiState>(() => {
    const s = { ...(readSaved() ?? {}), ...fromUrl } as Partial<UiState>;
    return {
      view: (['for_you', 'following', 'all'] as const).includes(s?.view as any) ? s!.view! : hasPrefs ? 'for_you' : 'all',
      q: typeof s?.q === 'string' ? s.q : '', industry: typeof s?.industry === 'string' ? s.industry : '',
      category: categoryParam(parseCategoryParam(s?.category)), orgType: typeof s?.orgType === 'string' ? s.orgType as OrganizationType : '', country: typeof s?.country === 'string' ? s.country : '',
      hiring: !!s?.hiring, challenges: !!s?.challenges, sponsor: !!s?.sponsor,
      sort: (['relevance', 'recent', 'followers', 'alpha'] as const).includes(s?.sort as any) ? s!.sort! : 'relevance',
    };
  });
  // The profile can finish loading after this page opens. If the member has never picked a view
  // (nothing remembered, nothing clicked), start them on For You once we know they have interests.
  const hadSavedView = useRef(!!readSaved()?.view || !!fromUrl.view);
  // Saved defaults are loaded from the account. They are applied only when neither the address nor this tab already has a category choice.
  const needsSaved = useMemo(() => fromUrl.category === undefined && typeof readSaved()?.category !== 'string', [fromUrl]);
  const [saved, setSaved] = useState<BroadKey[]>([]);
  const [prefsReady, setPrefsReady] = useState(!needsSaved);
  const touchedCategory = useRef(false);
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
    if (k === 'category') touchedCategory.current = true;
    setUi(p => ({ ...p, [k]: v }));
  }, []);

  useEffect(() => {
    let live = true;
    getOrgPrefs()
      .then(cats => { if (!live) return; setSaved(cats); if (needsSaved && !touchedCategory.current && cats.length) setUi(u => ({ ...u, category: categoryParam(cats) })); })
      .catch(() => { /* no saved defaults available: show everything */ })
      .finally(() => { if (live) setPrefsReady(true); });
    const t = setTimeout(() => { if (live) setPrefsReady(true); }, 3000);   // never hold the page up for it
    return () => { live = false; clearTimeout(t); };
  }, [needsSaved]);

  // keep the typed text and the committed query in step, and remember the choices
  useEffect(() => { setUi(p => (p.q === debouncedQ ? p : { ...p, q: debouncedQ })); }, [debouncedQ]);
  useEffect(() => { writeSaved(ui); }, [ui]);
  // Keep the address in step with the choices, without adding history entries. The app adds this page's own entry just after
  // the page mounts, so wait a tick: the query belongs on that entry, not on the page you came from. Each entry keeps its own
  // address, so Back to the directory restores the same filters.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const st: any = window.history.state;
        if (st?.bwView && st.bwView !== 'COMPANIES') return;      // not this page's entry
        window.history.replaceState(window.history.state, '', `/organizations${toSearch(ui)}`);
      } catch { /* not allowed here */ }
    }, 0);
    return () => clearTimeout(t);
  }, [ui]);

  // ── first page for the current query ──
  const loadFirst = useCallback(async (force = false) => {
    if (!prefsReady) return;
    const id = ++reqId.current;
    setLoading(true); setError(null); setMoreError(null);
    try {
      const data = await queryCompanies(query, null, { force });
      if (id !== reqId.current) return;           // a newer search has started
      setPage(data); setItems(appendUnique([], data.items)); setNextCursor(data.nextCursor);
    } catch (e: any) {
      if (id !== reqId.current || e?.name === 'AbortError') return;
      setError(e?.message ?? 'Could not load organizations.');
    } finally { if (id === reqId.current) setLoading(false); }
  }, [query, prefsReady]);

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
  const [sugg, setSugg] = useState<{ companies: { id: string; name: string; industry: string; typeLabel?: string }[]; industries: string[] }>({ companies: [], industries: [] });
  const [activeIdx, setActiveIdx] = useState(-1);
  const suggText = useDebounced(qInput, 200);
  useEffect(() => {
    let live = true;
    if (!focused || suggText.trim().length < 2) { setSugg({ companies: [], industries: [] }); return; }
    suggestCompanies(suggText).then(r => { if (live) { setSugg(r); setActiveIdx(-1); } }).catch(() => { if (live) setSugg({ companies: [], industries: [] }); });
    return () => { live = false; };
  }, [suggText, focused]);
  const options = [
    ...sugg.companies.map(c => ({ type: 'company' as const, label: c.name, hint: c.typeLabel && c.typeLabel !== 'Business' ? c.typeLabel : c.industry, value: c.name })),
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

  // ── filters: one shared state (`ui`) drives the pills, the More sheet, the address and the query ──
  const facets = page?.facets ?? [];
  const types = page?.types ?? [];
  const countries = page?.countries ?? [];
  const selected = parseCategoryParam(ui.category);
  const counts: Partial<Record<BroadKey, number>> = Object.fromEntries((page?.categories ?? []).map(c => [c.key, c.count]));
  // Suggested shortcuts: the member's own interests / followed organizations when there are any, else the standard four.
  const suggested: BroadKey[] = (page?.meta.suggested?.length ? page.meta.suggested : DEFAULT_PILLS).filter(k => k !== 'other');
  const typeLabel = ui.orgType ? (types.find(t => t.key === ui.orgType)?.label ?? ui.orgType.replace(/_/g, ' ')) : '';
  // Until the facets arrive (a shared link), show the key tidied up rather than raw lower case.
  const tidy = (v: string) => v.replace(/\b\w/g, c => c.toUpperCase());
  const industryLabel = ui.industry ? (facets.find(f => f.key === ui.industry)?.label ?? tidy(ui.industry)) : '';
  const countryLabel = ui.country ? (countries.find(c => c.key === ui.country)?.label ?? tidy(ui.country)) : '';
  const others: ActiveFilter[] = [
    ...(ui.orgType ? [{ id: 'type', label: typeLabel, clear: () => set('orgType', '') }] : []),
    ...(ui.industry ? [{ id: 'industry', label: industryLabel, clear: () => set('industry', '') }] : []),
    ...(ui.country ? [{ id: 'country', label: countryLabel, clear: () => set('country', '') }] : []),
    ...(ui.hiring ? [{ id: 'hiring', label: 'Hiring now', clear: () => set('hiring', false) }] : []),
    ...(ui.challenges ? [{ id: 'challenges', label: 'Has live challenges', clear: () => set('challenges', false) }] : []),
    ...(ui.sponsor ? [{ id: 'sponsor', label: 'Sponsors an Arena', clear: () => set('sponsor', false) }] : []),
  ];
  const anyFilter = selected.length > 0 || others.length > 0 || !!qInput.trim();
  const [moreOpen, setMoreOpen] = useState(false);
  const toggleCategory = (k: BroadKey) => set('category', categoryParam(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k]));
  // "Clear filters" resets what is temporary. The saved defaults are not touched.
  const clearFilters = () => setUi(p => ({ ...p, industry: '', category: '', orgType: '', country: '', hiring: false, challenges: false, sponsor: false }));
  const clearAll = () => { setQInput(''); setUi(p => ({ ...p, q: '', industry: '', category: '', orgType: '', country: '', hiring: false, challenges: false, sponsor: false })); touchedCategory.current = true; };

  // ── saved defaults ──
  const sameSet = (a: BroadKey[], b: BroadKey[]) => categoryParam(a) === categoryParam(b);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsMsg, setDefaultsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const atDefaults = saved.length > 0 && sameSet(selected, saved);
  const saveDefaults = async () => {
    setSavingDefaults(true); setDefaultsMsg(null);
    try {
      const cats = await saveOrgPrefs(selected);
      setSaved(cats);
      setDefaultsMsg({ ok: true, text: cats.length ? 'Saved. These categories will be your starting point on any device.' : 'Your saved defaults are cleared.' });
    } catch (e: any) { setDefaultsMsg({ ok: false, text: e?.message ?? 'Could not save. Try again.' }); }
    finally { setSavingDefaults(false); }
  };
  const resetToDefaults = () => { set('category', categoryParam(saved)); setDefaultsMsg(null); };
  const linkBtn = 'inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:underline focus:outline-none focus-visible:ring-2 disabled:opacity-60';
  const defaultsControls = (
    <div>
      <p className="text-sm font-semibold text-stone-800">Your defaults</p>
      <p className="mt-0.5 text-xs text-stone-600">
        {saved.length ? `Saved: ${saved.map(k => BROAD_LABEL[k]).join(', ')}. You start here on every visit.` : 'Nothing saved. Pick categories, then save them to start here every time.'}
      </p>
      <div className="-mx-2 mt-1 flex flex-wrap items-center">
        <button type="button" onClick={saveDefaults} disabled={savingDefaults || (selected.length === 0 ? saved.length === 0 : atDefaults)} className={linkBtn} style={{ color: GREEN, ['--tw-ring-color' as any]: GREEN }}>
          {savingDefaults && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{selected.length === 0 && saved.length > 0 ? 'Clear my saved defaults' : 'Save as my defaults'}
        </button>
        <button type="button" onClick={resetToDefaults} disabled={saved.length === 0 || atDefaults} className={`${linkBtn} text-stone-700`} style={{ ['--tw-ring-color' as any]: GREEN }}>Reset to my defaults</button>
        <button type="button" onClick={clearFilters} disabled={selected.length === 0 && others.length === 0} className={`${linkBtn} text-stone-700`} style={{ ['--tw-ring-color' as any]: GREEN }}>Clear filters</button>
      </div>
      <p role="status" aria-live="polite" className={`min-h-[1rem] text-xs ${defaultsMsg?.ok === false ? 'text-red-700' : 'text-emerald-700'}`}>{defaultsMsg?.text ?? ''}</p>
    </div>
  );

  const total = page?.total ?? 0;
  const forYou = page?.meta.forYou;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Organizations</h1>
        <p className="mt-1 text-sm text-stone-600 sm:text-base">Companies, universities and hospitals worth following. See who is hiring and what they are building.</p>
      </header>

      {/* Views */}
      <div role="tablist" aria-label="Organization views" className="mb-4 inline-flex rounded-xl bg-stone-100 p-1">
        {(Object.keys(VIEW_LABEL) as CompaniesView[]).map(v => (
          <button key={v} role="tab" aria-selected={ui.view === v} onClick={() => set('view', v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 sm:px-4 ${ui.view === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
            style={{ ['--tw-ring-color' as any]: GREEN }}>
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
        <input
          type="text" role="combobox" aria-expanded={showSugg} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
          aria-label="Search organizations" placeholder="Search organizations"
          value={qInput} onChange={e => setQInput(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} onKeyDown={onSearchKey}
          className="min-h-[44px] w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-11 text-base focus:outline-none focus-visible:ring-2 sm:text-sm"
          style={{ ['--tw-ring-color' as any]: GREEN }}
        />
        {qInput && (
          <button type="button" aria-label="Clear search" onClick={() => setQInput('')} className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"><X size={16} /></button>
        )}
        {showSugg && (
          <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
            {options.map((o, i) => (
              <li key={o.type + o.value} id={`${listId}-${i}`} role="option" aria-selected={i === activeIdx}
                onMouseDown={e => { e.preventDefault(); choose(o); }}
                className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-sm ${i === activeIdx ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                <span className="text-stone-900">{o.label}</span>
                <span className="flex-shrink-0 text-xs text-stone-500">{o.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Category pills: suggested shortcuts, or your selection; "More" holds every category and the advanced filters */}
      <div className="mb-1" style={{ ['--org-page-bg' as any]: '#f5f5f4' }}>
        <CategoryPills
          selected={selected} suggested={suggested} counts={counts} others={others} moreBadge={others.length + (selected.length > 0 ? 1 : 0)}
          onSelect={k => toggleCategory(k)} onRemove={k => toggleCategory(k)} onReset={() => set('category', '')} onOpenMore={() => setMoreOpen(true)}
        />
      </div>

      {/* Defaults: only offered when it would change something */}
      {(selected.length > 0 || saved.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-1 text-sm" role="group" aria-label="Your default categories">
          {atDefaults && <span className="inline-flex min-h-[44px] items-center gap-1 px-1 text-xs font-semibold text-stone-600"><Check size={14} style={{ color: GREEN }} aria-hidden="true" /> Your defaults</span>}
          {!atDefaults && selected.length > 0 && (
            <button type="button" onClick={saveDefaults} disabled={savingDefaults} className={linkBtn} style={{ color: GREEN, ['--tw-ring-color' as any]: GREEN }}>
              {savingDefaults && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Save as my defaults
            </button>
          )}
          {!atDefaults && saved.length > 0 && <button type="button" onClick={resetToDefaults} className={`${linkBtn} text-stone-700`} style={{ ['--tw-ring-color' as any]: GREEN }}>Reset to my defaults</button>}
          {(selected.length > 0 || others.length > 0) && <button type="button" onClick={clearFilters} className={`${linkBtn} text-stone-700`} style={{ ['--tw-ring-color' as any]: GREEN }}>Clear filters</button>}
          <span role="status" aria-live="polite" className={`text-xs ${defaultsMsg?.ok === false ? 'text-red-700' : 'text-emerald-700'}`}>{defaultsMsg?.text ?? ''}</span>
        </div>
      )}

      <MoreFiltersSheet
        open={moreOpen} onClose={() => setMoreOpen(false)}
        selected={selected} counts={counts} onToggle={toggleCategory}
        orgType={ui.orgType} industry={ui.industry} country={ui.country}
        types={types.map(t => ({ k: t.key, l: `${t.label} (${t.count.toLocaleString()})` }))}
        industries={facets.map(f => ({ k: f.key, l: `${f.label} (${f.count.toLocaleString()})` }))}
        countries={countries.map(c => ({ k: c.key, l: `${c.label} (${c.count.toLocaleString()})` }))}
        onType={v => set('orgType', v as OrganizationType | '')} onIndustry={v => set('industry', v)} onCountry={v => set('country', v)}
        hiring={ui.hiring} challenges={ui.challenges} sponsor={ui.sponsor} onActivity={(k, v) => set(k, v)}
        defaults={defaultsControls} onClear={clearFilters} total={page?.total ?? 0} loading={loading}
      />

      {/* For You hint: only when the list is the general fallback */}
      {ui.view === 'for_you' && forYou && forYou.fallback && !loading && items.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          <Sparkles size={16} className="mt-0.5 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" />
          <p>
            {forYou.hasPreferences
              ? 'Nothing matches your profile yet, so these are organizations with open roles and live challenges.'
              : 'Showing organizations with open roles and live challenges. Add your industry and goals to your profile to get recommendations that fit you.'}
            {onEditProfile && !forYou.hasPreferences && <> <button type="button" onClick={onEditProfile} className="font-semibold underline" style={{ color: GREEN }}>Update your profile</button></>}
          </p>
        </div>
      )}

      {/* Count and sort */}
      <div className="mb-3 mt-2 flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-stone-600" aria-live="polite">
          {loading ? 'Loading organizations…' : error ? '' : `${total.toLocaleString()} ${total === 1 ? 'organization' : 'organizations'}${selected.length ? ` in ${selected.map(k => BROAD_LABEL[k]).join(' or ')}` : ''}${debouncedQ.trim() ? ` matching “${debouncedQ.trim()}”` : ''}`}
        </p>
        <label className="flex flex-shrink-0 items-center gap-2 text-sm text-stone-600">
          <span className="sr-only min-[420px]:not-sr-only">Sort</span>
          <select aria-label="Sort organizations" value={ui.sort} onChange={e => set('sort', e.target.value as CompaniesSort)}
            className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
            {(Object.keys(SORT_LABEL) as CompaniesSort[]).map(k => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </label>
      </div>

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
        <EmptyResults view={ui.view} anyFilter={anyFilter} query={debouncedQ.trim()} onClear={clearAll} onBrowse={() => set('view', 'all')}
          broaden={[
            ...(debouncedQ.trim() ? [{ label: 'Clear search', run: () => setQInput('') }] : []),
            ...selected.map(k => ({ label: `Remove ${BROAD_LABEL[k]}`, run: () => toggleCategory(k) })),
            ...others.map(f => ({ label: `Remove ${f.label}`, run: f.clear })),
          ].slice(0, 4)} />
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
                {loadingMore && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Load more organizations
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

function EmptyResults({ view, anyFilter, query, onClear, onBrowse, broaden }: { view: CompaniesView; anyFilter: boolean; query: string; onClear: () => void; onBrowse: () => void; broaden: { label: string; run: () => void }[] }) {
  let title = 'No organizations found', body = 'Try a different search.', action: React.ReactNode = null;
  if (anyFilter) {
    title = query ? `No organizations match “${query}”` : 'No organizations match these filters';
    body = 'Try a shorter search, or broaden it:';
    action = (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {broaden.map(b => <button key={b.label} type="button" onClick={b.run} className="min-h-[44px] rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50">{b.label}</button>)}
        <button type="button" onClick={onClear} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Show all organizations</button>
      </div>
    );
  } else if (view === 'following') {
    title = 'You are not following any organizations yet';
    body = 'Follow organizations to see them here, and to hear about their roles and challenges.';
    action = <button type="button" onClick={onBrowse} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Browse all organizations</button>;
  } else if (view === 'for_you') {
    title = 'Nothing to recommend yet'; body = 'Browse all organizations to find some to follow.';
    action = <button type="button" onClick={onBrowse} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Browse all organizations</button>;
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
