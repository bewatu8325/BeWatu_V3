/**
 * components/bridge/BridgeForYou.tsx
 * The top of Bridge: one featured Talk, what was published lately, Talks from people you follow, a few chosen for what you care
 * about (each with the reason), and topics to explore. Only real, published Talks appear; with none, the page says so warmly and
 * shows what a member can do. Nothing here is ranked by how many people watched.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FeaturedTalk, TalkCard } from './TalkCard';
import { IntroEmpty } from './TalksLibrary';
import { CATEGORIES, categoryLabel, reasonFor, sortTalks, type RankContext, type Talk } from '../../lib/bridgeTalks';
import { fetchBySpeakerIds, fetchPublished } from '../../lib/bridgeTalksService';
import { trackTalkDiscovered } from '../../lib/analytics/track';

const GREEN = 'var(--bw-green)';
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

interface Props {
  uid: string; canContribute: boolean; interests: string[]; followedIds: number[]; refreshKey: number;
  onOpen: (id: string) => void; onSeeAll: (category?: string) => void; onShare: () => void; onRequest: () => void; onSuggest: () => void; onExplorePerspectives: () => void;
}

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section aria-label={title} className="mt-9">
    <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="font-serif text-[22px] font-semibold text-stone-900">{title}</h2>{action}</div>
    {children}
  </section>
);

export const BridgeForYou: React.FC<Props> = ({ uid, canContribute, interests, followedIds, refreshKey, onOpen, onSeeAll, onShare, onRequest, onSuggest, onExplorePerspectives }) => {
  const [talks, setTalks] = useState<Talk[] | null>(null);
  const [fromFollowed, setFromFollowed] = useState<Talk[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [p, f] = await Promise.all([fetchPublished({ size: 24 }), followedIds.length ? fetchBySpeakerIds(followedIds, 6).catch(() => []) : Promise.resolve([])]);
      setTalks(p.items); setFromFollowed(f);
    } catch { setError(true); }
  }, [followedIds]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const ctx: RankContext = useMemo(() => ({ followedUids: new Set((talks ?? []).concat(fromFollowed).filter(t => t.speakerId != null && followedIds.includes(t.speakerId)).map(t => t.speakerUid)), interests }), [talks, fromFollowed, followedIds, interests]);
  const layout = useMemo(() => {
    const all = talks ?? [];
    const ranked = sortTalks(all.slice(0, 12), 'relevant', ctx);
    const featured = ranked[0] ?? null;
    const rest = all.filter(t => t.id !== featured?.id);
    const recent = rest.slice(0, 4);
    const shown = new Set([featured?.id, ...recent.map(t => t.id)]);
    const followed = fromFollowed.filter(t => !shown.has(t.id)).slice(0, 4);
    followed.forEach(t => shown.add(t.id));
    const picks = sortTalks(rest.filter(t => !shown.has(t.id)), 'relevant', ctx).filter(t => reasonFor(t, ctx)).slice(0, 4);
    const topics = CATEGORIES.filter(c => all.some(t => t.category === c.id));
    return { featured, recent, followed, picks, topics };
  }, [talks, fromFollowed, ctx]);

  const seen = useCallback((id: string) => { const t = (talks ?? []).find(x => x.id === id); if (t) trackTalkDiscovered(uid, id, t.category, t.speakerUid); }, [talks, uid]);

  if (error) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center"><p className="font-semibold text-red-900">We could not load Talks.</p><button type="button" onClick={load} className={'mt-3 min-h-[44px] rounded-full bg-white px-5 text-sm font-semibold text-red-900 ring-1 ring-red-300 ' + FOCUS}>Try again</button></div>;
  if (talks === null) return <div aria-busy="true" role="status"><span className="sr-only">Loading Talks</span><div className="h-80 animate-pulse rounded-3xl bg-stone-100" /><div className="mt-8 grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="h-64 animate-pulse rounded-2xl bg-stone-100" />)}</div></div>;
  if (!layout.featured) return <IntroEmpty canContribute={canContribute} onShare={onShare} onRequest={onRequest} onSuggest={onSuggest} onExplore={onExplorePerspectives} />;

  const seeAll = <button type="button" onClick={() => onSeeAll()} className={'min-h-[40px] text-sm font-semibold ' + FOCUS} style={{ color: GREEN }}>See all Talks <span aria-hidden="true">→</span></button>;
  const grid = (list: Talk[], reasons?: boolean) => <ul className="grid gap-3 sm:grid-cols-2">{list.map(t => <li key={t.id}><TalkCard talk={t} onOpen={onOpen} reason={reasons ? reasonFor(t, ctx) : null} onSeen={seen} /></li>)}</ul>;

  return (
    <div>
      <FeaturedTalk talk={layout.featured} onOpen={onOpen} onSeen={seen} />
      {layout.recent.length > 0 && <Section title="Recently published" action={seeAll}>{grid(layout.recent)}</Section>}
      {layout.followed.length > 0 && <Section title="From people you follow">{grid(layout.followed)}</Section>}
      {layout.picks.length > 0 && <Section title="Chosen for you">{grid(layout.picks, true)}</Section>}
      {layout.topics.length > 0 && (
        <Section title="Explore by topic">
          <div className="flex flex-wrap gap-2">{layout.topics.map(c => <button key={c.id} type="button" onClick={() => onSeeAll(c.id)} className={'min-h-[44px] rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 ' + FOCUS} style={{ ['--tw-ring-color' as any]: GREEN }}>{categoryLabel(c.id)}</button>)}</div>
        </Section>
      )}
    </div>
  );
};

export default BridgeForYou;
