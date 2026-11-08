/**
 * components/OrganizationsToDiscover.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Organizations to discover" (formerly "Companies to follow") in the Home sidebar.
 *
 * Following one of these:
 *   1. the button turns into "✓ Following" at once and "Following <name>" is announced and shown (optimistic; the follow is
 *      saved on the member's account by api/companies.ts, which is transactional and never stores a duplicate)
 *   2. after a short confirmation the row eases away, the ones below move up, and the list refills from the next suggestion
 *   3. an Undo is offered for a few seconds
 *   4. if the save fails the row stays, the button is "Follow" again, and the error says so with a Retry
 * Suggestions are the directory's own "For You" list (real organizations, never ones you follow). What you follow is shared with
 * every other list through lib/orgFollow.ts, so following here also removes the organization from the end of the feed, and
 * following there removes it here. Clicks are ignored while a request for that organization is pending.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Undo2 } from 'lucide-react';
import { queryCompanies, type CompanyItem } from '../lib/companiesService';
import { useOrgFollows } from '../lib/orgFollowInstance';
import { usable, refill, restoreAt, needsMore } from '../lib/orgToDiscover';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const SIZE = 4;                 // how many are shown
const CONFIRM_MS = 1400;        // how long "Following" is shown before the row leaves
const COLLAPSE_MS = 280;
const UNDO_MS = 7000;
const MAX_PAGES = 5;            // never read the whole directory just to fill four rows
const ring = { ['--tw-ring-color' as any]: GREEN } as React.CSSProperties;

const QUERY = { view: 'for_you', q: '', industry: '', category: '', organizationType: '', country: '', filters: {}, sort: 'relevance' } as const;
const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type Phase = { kind: 'saved' } | { kind: 'leaving' } | { kind: 'error'; message: string };

interface Props {
  uid?: string;
  /** What the member's account already says they follow (so nothing followed is ever suggested). */
  accountFollows?: string[];
  onViewCompany?: (companyId: number | string) => void;
  /** Opens the Organizations discovery page. */
  onExplore: () => void;
}

export default function OrganizationsToDiscover({ uid, accountFollows, onViewCompany, onExplore }: Props) {
  const { followed, pending, follow, unfollow } = useOrgFollows(uid, accountFollows);
  const [visible, setVisible] = useState<CompanyItem[]>([]);
  const [queue, setQueue] = useState<CompanyItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<Record<string, Phase>>({});
  const [toast, setToast] = useState<{ item: CompanyItem; index: number; error?: string; busy?: boolean } | null>(null);
  const [announce, setAnnounce] = useState('');
  const fetching = useRef(false);
  const pages = useRef(0);
  const seen = useRef(new Set<string>());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const focusIndex = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  // Ids that are being confirmed right now stay on screen even though they are already "followed".
  const keep = useMemo(() => new Set(Object.keys(rows)), [rows]);
  const followedForList = useMemo(() => new Set([...followed].filter(id => !keep.has(id))), [followed, keep]);

  const fetchMore = useCallback(async () => {
    if (fetching.current || pages.current >= MAX_PAGES) return;
    fetching.current = true;
    try {
      const page = await queryCompanies(QUERY as any, pages.current === 0 ? null : cursor, { force: pages.current === 0 });
      pages.current++;
      const fresh = usable(page.items, followed, seen.current);
      fresh.forEach(s => seen.current.add(s.id));
      setQueue(q => [...q, ...fresh]);
      setCursor(page.nextCursor); setHasMore(!!page.nextCursor && pages.current < MAX_PAGES);
      setLoadError(false);
    } catch { setLoadError(true); setHasMore(false); }
    finally { fetching.current = false; setLoaded(true); }
  }, [cursor, followed]);

  useEffect(() => { if (uid) void fetchMore(); /* first page */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Keep the list full and clean: drop anything followed elsewhere, then refill from the queue, and fetch more when it runs low.
  useEffect(() => {
    const r = refill(visible, queue, followedForList, SIZE);
    if (r.visible.length !== visible.length || r.queue.length !== queue.length || r.visible.some((s, i) => s.id !== visible[i]?.id)) { setVisible(r.visible); setQueue(r.queue); }
    else if (loaded && needsMore(r.visible.length, r.queue.length, SIZE, hasMore) && !fetching.current) void fetchMore();
  }, [visible, queue, followedForList, loaded, hasMore, fetchMore]);

  // After a row leaves, keep keyboard focus in the list.
  useEffect(() => {
    if (focusIndex.current == null) return;
    const idx = Math.min(focusIndex.current, visible.length - 1); focusIndex.current = null;
    const target = idx >= 0 ? buttons.current[visible[idx]?.id] : null;
    (target ?? headingRef.current)?.focus();
  }, [visible]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const setPhase = (id: string, p: Phase | null) => setRows(r => { const n = { ...r }; if (p) n[id] = p; else delete n[id]; return n; });

  const onFollow = async (item: CompanyItem) => {
    if (pending.has(item.id) || rows[item.id]?.kind === 'saved' || rows[item.id]?.kind === 'leaving') return;   // one request at a time
    setPhase(item.id, { kind: 'saved' });                                                                      // "Following" now
    setAnnounce(`Following ${item.name}`);
    const res = await follow(item.id);
    if ('reason' in res) {
      if (res.reason === 'busy') return;
      setPhase(item.id, { kind: 'error', message: res.message ?? 'Please try again.' });
      setAnnounce(`Could not follow ${item.name}. ${res.message ?? 'Please try again.'}`);
      return;
    }
    setTimeout(() => {
      const index = visible.findIndex(s => s.id === item.id);
      setPhase(item.id, { kind: 'leaving' });
      setTimeout(() => {
        focusIndex.current = index >= 0 ? index : 0;
        setVisible(v => v.filter(s => s.id !== item.id));
        setPhase(item.id, null);
        setToast({ item, index: Math.max(index, 0) });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), UNDO_MS);
      }, reduceMotion() ? 0 : COLLAPSE_MS);
    }, reduceMotion() ? 600 : CONFIRM_MS);
  };

  const onUndo = async () => {
    if (!toast || toast.busy) return;
    const { item, index } = toast;
    setToast({ ...toast, busy: true, error: undefined });
    const res = await unfollow(item.id);
    if ('reason' in res) { setToast({ item, index, error: res.message ?? 'Could not undo. Try again.' }); return; }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const r = restoreAt(visible, queue, item, index, SIZE);
    setVisible(r.visible); setQueue(r.queue); setToast(null);
    setAnnounce(`Unfollowed ${item.name}`);
  };

  if (!uid) return null;
  const empty = loaded && visible.length === 0 && !hasMore && !loadError && Object.keys(rows).length === 0;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: '#e7e5e4' }} aria-labelledby="orgs-to-discover">
      <h3 id="orgs-to-discover" ref={headingRef} tabIndex={-1} className="mb-1 border-b pb-2 text-md font-bold text-stone-800 focus:outline-none" style={{ borderColor: '#e7e5e4' }}>
        Organizations to discover
      </h3>
      <p className="mb-3 text-xs text-stone-600">Follow to see their skill challenges in your Prove feed</p>
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {!loaded ? (
        <div className="space-y-3" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-stone-100" />)}</div>
      ) : loadError && visible.length === 0 ? (
        <div role="alert" className="text-sm text-stone-700">
          Could not load suggestions.{' '}
          <button type="button" onClick={() => { pages.current = 0; setCursor(null); setHasMore(true); setLoadError(false); void fetchMore(); }} className="min-h-[44px] font-semibold underline" style={{ color: GREEN }}>Try again</button>
        </div>
      ) : empty ? (
        <div className="py-2 text-center">
          <p className="text-sm font-semibold text-stone-900">You're all caught up!</p>
          <p className="mt-1 text-xs text-stone-600">Explore more organizations to discover companies worth following.</p>
          <button type="button" onClick={onExplore} className="mt-3 min-h-[44px] rounded-xl px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...ring }}>Explore organizations</button>
        </div>
      ) : (
        <ul>
          {visible.map(c => {
            const phase = rows[c.id];
            const leaving = phase?.kind === 'leaving';
            const confirmed = phase?.kind === 'saved' || leaving;
            return (
              <li key={c.id} className="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none"
                style={{ gridTemplateRows: leaving ? '0fr' : '1fr', opacity: leaving ? 0 : 1 }}>
                <div className="overflow-hidden">
                  <div className="py-1.5">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => onViewCompany?.(c.id)} aria-label={`View ${c.name}`} className="shrink-0 focus:outline-none focus-visible:ring-2 rounded-xl" style={ring}>
                        {c.logoUrl
                          ? <img src={c.logoUrl} alt="" className="h-10 w-10 rounded-xl border object-cover" style={{ borderColor: '#e7e5e4' }} />
                          : <span className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white" style={{ background: GREEN }}>{c.name?.[0] ?? 'O'}</span>}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => onViewCompany?.(c.id)} className="block w-full truncate text-left text-sm font-semibold text-stone-900 hover:underline focus:outline-none focus-visible:ring-2 rounded" style={ring}>{c.name}</button>
                        <p className="truncate text-xs text-stone-600">{c.organizationType !== 'business' ? c.typeLabel : c.industry || 'Organization'}</p>
                      </div>
                      <button type="button" ref={el => { buttons.current[c.id] = el; }}
                        onClick={() => onFollow(c)} disabled={confirmed || pending.has(c.id)} aria-disabled={confirmed || pending.has(c.id)}
                        aria-label={confirmed ? `Following ${c.name}` : `Follow ${c.name}`}
                        className="inline-flex min-h-[44px] min-w-[84px] shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
                        style={confirmed ? { backgroundColor: GREEN_LT, borderColor: GREEN, color: GREEN, ...ring } : { borderColor: GREEN, color: GREEN, ...ring }}>
                        {confirmed ? <><Check size={14} aria-hidden="true" /> Following</> : 'Follow'}
                      </button>
                    </div>
                    {confirmed && <p className="mt-0.5 pl-[3.25rem] text-xs font-medium" style={{ color: GREEN }}>Following {c.name}</p>}
                    {phase?.kind === 'error' && (
                      <p role="alert" className="mt-0.5 pl-[3.25rem] text-xs text-red-700">
                        Could not follow {c.name}. {phase.message}{' '}
                        <button type="button" onClick={() => { setPhase(c.id, null); void onFollow(c); }} className="min-h-[44px] font-semibold underline">Retry</button>
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toast && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-700">
          <span>{toast.error ? toast.error : <>You followed <strong>{toast.item.name}</strong>.</>}</span>
          <button type="button" onClick={onUndo} disabled={toast.busy} className="inline-flex min-h-[44px] items-center gap-1 font-semibold underline disabled:opacity-60" style={{ color: GREEN }}>
            {toast.busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Undo2 size={13} aria-hidden="true" />} {toast.error ? 'Try again' : 'Undo'}
          </button>
        </div>
      )}
    </section>
  );
}
