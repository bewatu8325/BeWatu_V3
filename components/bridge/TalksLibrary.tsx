/**
 * components/bridge/TalksLibrary.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Talks tab: search, topic filter, newest or relevant, and the member's own lists (following, saved, yours). It loads a page at a
 * time from the server. Searching and "relevant" ranking work over the most recent sixty published Talks (fetched once per topic),
 * which is the whole library for a long while; moving to a search service is a later step when it is not.
 *
 * It never invents content: with no Talks it says so, warmly, and points to what the member can do.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { TalkCard } from './TalkCard';
import MyTalks from './MyTalks';
import {
  CATEGORIES, matches, reasonFor, sortTalks, type RankContext, type SortMode, type Talk,
} from '../../lib/bridgeTalks';
import { fetchBySpeakerIds, fetchPublished, fetchSavedTalks, type Page } from '../../lib/bridgeTalksService';
import { trackTalkDiscovered } from '../../lib/analytics/track';

const GREEN = 'var(--bw-green)';
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const PAGE = 12;

export type LibraryView = 'all' | 'following' | 'saved' | 'yours';
interface Props {
  uid: string; canContribute: boolean; interests: string[]; followedIds: number[];
  initialView?: LibraryView; refreshKey: number;
  onOpen: (id: string) => void; onEdit: (t: Talk) => void; onShare: () => void; onRequest: () => void; onSuggest: () => void; onExplorePerspectives: () => void;
}

export const IntroEmpty: React.FC<{ canContribute: boolean; onShare: () => void; onRequest: () => void; onSuggest: () => void; onExplore: () => void }> = ({ canContribute, onShare, onRequest, onSuggest, onExplore }) => (
  <div className="rounded-3xl border border-stone-200 bg-white px-6 py-12 text-center sm:py-16">
    <h2 className="mx-auto max-w-md font-serif text-[26px] font-semibold leading-tight text-stone-900 sm:text-3xl">Wisdom worth sharing starts with one voice.</h2>
    <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-stone-600">Bridge Talks are where professionals share the experiences and lessons that shaped their journeys.</p>
    <div className="mt-7 flex flex-wrap justify-center gap-2.5">
      {canContribute
        ? <button type="button" onClick={onShare} className={'min-h-[48px] rounded-full px-6 text-sm font-bold text-white ' + FOCUS} style={{ backgroundColor: GREEN, ...ring }}>Share your first Talk</button>
        : <>
            <button type="button" onClick={onExplore} className={'min-h-[48px] rounded-full px-6 text-sm font-bold text-white ' + FOCUS} style={{ backgroundColor: GREEN, ...ring }}>Explore Perspectives</button>
            <button type="button" onClick={onSuggest} className={'min-h-[48px] rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-800 hover:bg-stone-50 ' + FOCUS} style={ring}>Suggest a Speaker</button>
            <button type="button" onClick={onRequest} className={'min-h-[48px] rounded-full px-5 text-sm font-semibold underline ' + FOCUS} style={{ color: GREEN, ...ring }}>Ask to share a Talk</button>
          </>}
    </div>
  </div>
);

export const TalksLibrary: React.FC<Props> = ({ uid, canContribute, interests, followedIds, initialView = 'all', refreshKey, onOpen, onEdit, onShare, onRequest, onSuggest, onExplorePerspectives }) => {
  const [view, setView] = useState<LibraryView>(initialView);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [q, setQ] = useState(''); const [query, setQuery] = useState('');
  const [items, setItems] = useState<Talk[]>([]);
  const [cursor, setCursor] = useState<Page['cursor']>(null);
  const [more, setMore] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const wide = !!query || sort === 'relevant';        // these two work over a larger set, ranked in the browser
  const load = useCallback(async () => {
    if (view === 'yours') return;
    const my = ++seq.current;
    setState('loading'); setShown(PAGE);
    try {
      let list: Talk[]; let next: Page['cursor'] = null; let hasMore = false;
      if (view === 'following') list = await fetchBySpeakerIds(followedIds, 40);
      else if (view === 'saved') list = await fetchSavedTalks(uid);
      else {
        const p = await fetchPublished({ category: category || undefined, size: wide ? 60 : PAGE });
        list = p.items; next = p.cursor; hasMore = !p.done && !wide;
      }
      if (my !== seq.current) return;
      setItems(list); setCursor(next); setMore(hasMore); setState('ready');
    } catch { if (my === seq.current) setState('error'); }
  }, [view, category, wide, followedIds, uid]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { import('../../lib/bridgeTalksService').then(s => s.fetchSavedIds(uid)).then(setSaved); }, [uid, refreshKey, view]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try { const p = await fetchPublished({ category: category || undefined, cursor, size: PAGE }); setItems(a => [...a, ...p.items]); setCursor(p.cursor); setMore(!p.done); }
    catch { setState('error'); } finally { setLoadingMore(false); }
  };

  const followedUids = useMemo(() => new Set(items.filter(t => t.speakerId != null && followedIds.includes(t.speakerId)).map(t => t.speakerUid)), [items, followedIds]);
  const ctx: RankContext = useMemo(() => ({ followedUids, interests }), [followedUids, interests]);
  const list = useMemo(() => {
    let l = items;
    if (category && view !== 'all') l = l.filter(t => t.category === category);   // all-view filters on the server; the rest narrow what is loaded
    if (query) l = l.filter(t => matches(t, query));
    return sortTalks(l, wide ? sort : 'newest', ctx);
  }, [items, category, view, query, sort, wide, ctx]);

  const discovered = useCallback((id: string) => { const t = items.find(x => x.id === id); if (t) trackTalkDiscovered(uid, id, t.category, t.speakerUid); }, [items, uid]);
  const chip = (on: boolean) => 'min-h-[40px] flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors ' + FOCUS + (on ? ' text-white' : ' bg-white text-stone-700 hover:bg-stone-50');
  const chipStyle = (on: boolean) => ({ backgroundColor: on ? GREEN : undefined, borderColor: on ? GREEN : '#d6d3d1', ...ring });
  const pristine = view === 'all' && !category && !query && state === 'ready' && items.length === 0;

  const views: { id: LibraryView; label: string }[] = [{ id: 'all', label: 'All Talks' }, { id: 'following', label: 'Following' }, { id: 'saved', label: 'Saved' }, ...(canContribute ? [{ id: 'yours' as const, label: 'Your Talks' }] : [])];

  return (
    <div>
      <div role="tablist" aria-label="Talks" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
        {views.map(v => <button key={v.id} role="tab" aria-selected={view === v.id} type="button" onClick={() => setView(v.id)} className={chip(view === v.id)} style={chipStyle(view === v.id)}>{v.label}</button>)}
      </div>

      {view === 'yours' ? <MyTalks uid={uid} refreshKey={refreshKey} onOpen={onOpen} onEdit={onEdit} onNew={onShare} /> : (
        <>
          {!pristine && (
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
                  <label htmlFor="talk-search" className="sr-only">Search Talks by topic, title, speaker or keyword</label>
                  <input id="talk-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by topic, title or speaker" className={'block min-h-[44px] w-full rounded-full border border-stone-300 bg-white py-2.5 pl-10 pr-10 text-[15px] ' + FOCUS} style={ring} />
                  {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className={'absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 ' + FOCUS} style={ring}><X className="h-4 w-4" aria-hidden="true" /></button>}
                </div>
                <label className="flex items-center gap-2 text-sm text-stone-700"><span className="sr-only sm:not-sr-only">Sort</span>
                  <select value={sort} onChange={e => setSort(e.target.value as SortMode)} className={'min-h-[44px] rounded-full border border-stone-300 bg-white px-3.5 text-sm font-semibold ' + FOCUS} style={ring} aria-label="Sort Talks">
                    <option value="newest">Newest</option><option value="relevant">Relevant to you</option>
                  </select>
                </label>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar" role="group" aria-label="Topics">
                <button type="button" aria-pressed={!category} onClick={() => setCategory('')} className={chip(!category)} style={chipStyle(!category)}>All topics</button>
                {CATEGORIES.map(c => <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(category === c.id ? '' : c.id)} className={chip(category === c.id)} style={chipStyle(category === c.id)}>{c.label}</button>)}
              </div>
            </div>
          )}

          <div aria-live="polite" className="sr-only">{state === 'ready' ? `${list.length} Talks` : ''}</div>

          {state === 'loading' && <ul className="grid gap-3 sm:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map(i => <li key={i} className="h-72 animate-pulse rounded-2xl bg-stone-100" />)}</ul>}
          {state === 'error' && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center">
              <p className="font-semibold text-red-900">We could not load Talks.</p><p className="mt-1 text-sm text-red-800">Check your connection and try again.</p>
              <button type="button" onClick={load} className={'mt-4 min-h-[44px] rounded-full bg-white px-5 text-sm font-semibold text-red-900 ring-1 ring-red-300 ' + FOCUS}>Try again</button>
            </div>
          )}
          {pristine && <IntroEmpty canContribute={canContribute} onShare={onShare} onRequest={onRequest} onSuggest={onSuggest} onExplore={onExplorePerspectives} />}
          {state === 'ready' && !pristine && list.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center">
              {view === 'following' ? <><h3 className="font-serif text-xl font-semibold text-stone-900">No Talks from people you follow yet</h3><p className="mx-auto mt-2 max-w-sm text-[15px] text-stone-600">When someone you follow shares a Talk, it will appear here. Follow a speaker from any Talk.</p></>
                : view === 'saved' ? <><h3 className="font-serif text-xl font-semibold text-stone-900">Nothing saved yet</h3><p className="mx-auto mt-2 max-w-sm text-[15px] text-stone-600">Save a Talk to watch it later. It will be here.</p></>
                : <><h3 className="font-serif text-xl font-semibold text-stone-900">No Talks match</h3><p className="mx-auto mt-2 max-w-sm text-[15px] text-stone-600">Try a shorter search, a different topic, or look at everything.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">{query && <button type="button" onClick={() => setQ('')} className={chip(false)} style={chipStyle(false)}>Clear search</button>}{category && <button type="button" onClick={() => setCategory('')} className={chip(false)} style={chipStyle(false)}>All topics</button>}</div></>}
            </div>
          )}
          {state === 'ready' && list.length > 0 && (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.slice(0, wide || view !== 'all' ? shown : undefined).map(t => <li key={t.id}><TalkCard talk={t} onOpen={onOpen} saved={saved.has(t.id)} reason={sort === 'relevant' || view === 'following' ? reasonFor(t, ctx) : null} onSeen={discovered} /></li>)}
              </ul>
              {(wide || view !== 'all') && list.length > shown && <div className="mt-5 text-center"><button type="button" onClick={() => setShown(s => s + PAGE)} className={chip(false) + ' !min-h-[44px] px-6'} style={chipStyle(false)}>Show more</button></div>}
              {!wide && view === 'all' && more && <div className="mt-5 text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className={chip(false) + ' !min-h-[44px] inline-flex items-center gap-2 px-6'} style={chipStyle(false)}>{loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Show more Talks</button></div>}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TalksLibrary;
