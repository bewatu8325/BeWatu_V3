/**
 * components/bridge/TalkCard.tsx
 * One Talk in a list: thumbnail, title, who is speaking and their role, length, topic and a short description. And the larger
 * card that leads Bridge. Neither shows how many people watched; nothing here ranks a Talk by attention.
 */
import React, { useEffect, useRef } from 'react';
import { TalkPlayIcon, SaveIcon } from '../icons/BridgeIcons';
import { categoryLabel, formatDuration, type Talk } from '../../lib/bridgeTalks';

const GREEN = 'var(--bw-green)';

export const Speaker: React.FC<{ talk: Pick<Talk, 'speakerName' | 'speakerHeadline' | 'speakerAvatar'>; size?: 'sm' | 'md'; dark?: boolean }> = ({ talk, size = 'sm', dark }) => {
  const px = size === 'md' ? 'h-11 w-11 text-sm' : 'h-8 w-8 text-[11px]';
  const initials = talk.speakerName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {talk.speakerAvatar
        ? <img src={talk.speakerAvatar} alt="" className={'flex-shrink-0 rounded-full object-cover ' + px} loading="lazy" />
        : <span className={'flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white ' + px} style={{ backgroundColor: dark ? 'rgba(255,255,255,.2)' : GREEN }} aria-hidden="true">{initials}</span>}
      <span className="min-w-0 leading-tight">
        <span className={'block truncate font-semibold ' + (size === 'md' ? 'text-[15px] ' : 'text-[13px] ') + (dark ? 'text-white' : 'text-stone-900')}>{talk.speakerName}</span>
        {talk.speakerHeadline && <span className={'block truncate ' + (size === 'md' ? 'text-sm ' : 'text-xs ') + (dark ? 'text-white/70' : 'text-stone-600')}>{talk.speakerHeadline}</span>}
      </span>
    </div>
  );
};

/** The picture a Talk shows before it plays: the speaker's thumbnail, or a calm green field with the play mark. */
export const Thumb: React.FC<{ talk: Pick<Talk, 'thumbnailUrl' | 'title'>; className?: string; big?: boolean }> = ({ talk, className = '', big }) => (
  <div className={'relative aspect-video w-full overflow-hidden rounded-xl bg-[#2f5a4b] ' + className}>
    {talk.thumbnailUrl && <img src={talk.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
    <span className="absolute inset-0 flex items-center justify-center">
      <span className={'flex items-center justify-center rounded-full bg-white shadow-md ' + (big ? 'h-16 w-16' : 'h-11 w-11')} style={{ color: GREEN }}><TalkPlayIcon className={big ? 'h-9 w-9' : 'h-6 w-6'} /></span>
    </span>
  </div>
);

/** Calls `onSeen` once when the card first scrolls into view (a Talk "discovered"), and never again for the same Talk this session. */
const seen = new Set<string>();
function useSeen(id: string, onSeen?: (id: string) => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !onSeen || seen.has(id) || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => { if (es[0]?.isIntersecting) { seen.add(id); onSeen(id); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(el); return () => io.disconnect();
  }, [id, onSeen]);
  return ref;
}

interface CardProps { talk: Talk; onOpen: (id: string) => void; saved?: boolean; reason?: string | null; onSeen?: (id: string) => void }
export const TalkCard: React.FC<CardProps> = ({ talk, onOpen, saved, reason, onSeen }) => {
  const ref = useSeen(talk.id, onSeen) as React.RefObject<HTMLElement>;
  return (
    <article ref={ref} className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-2.5 transition-shadow focus-within:shadow-md hover:shadow-md">
      <button type="button" onClick={() => onOpen(talk.id)} className="rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ ['--tw-ring-color' as any]: GREEN }} aria-label={`${talk.title}, a Talk by ${talk.speakerName}, ${formatDuration(talk.durationSec)}`}>
        <div className="relative">
          <Thumb talk={talk} />
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{formatDuration(talk.durationSec)}</span>
          {saved && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold" style={{ color: GREEN }}><SaveIcon className="h-3.5 w-3.5" />Saved</span>}
        </div>
        <div className="px-1.5 pb-1 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: GREEN }}>{categoryLabel(talk.category)}</p>
          <h3 className="mt-1 line-clamp-2 font-serif text-[17px] font-semibold leading-snug text-stone-900 group-hover:underline">{talk.title}</h3>
          {talk.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-stone-600">{talk.summary}</p>}
        </div>
      </button>
      <div className="mt-auto px-1.5 pb-1.5 pt-2.5">
        <Speaker talk={talk} />
        {reason && <p className="mt-2 text-xs text-stone-600">{reason}</p>}
      </div>
    </article>
  );
};

/** The Talk that leads Bridge. Only ever a real, published Talk. */
export const FeaturedTalk: React.FC<{ talk: Talk; onOpen: (id: string) => void; onSeen?: (id: string) => void }> = ({ talk, onOpen, onSeen }) => {
  const ref = useSeen('f:' + talk.id, onSeen ? () => onSeen(talk.id) : undefined) as React.RefObject<HTMLElement>;
  return (
    <section ref={ref} aria-label="Featured Talk" className="overflow-hidden rounded-3xl p-3 text-white sm:p-4" style={{ backgroundColor: GREEN }}>
      <button type="button" onClick={() => onOpen(talk.id)} className="block w-full rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2" style={{ ['--tw-ring-offset-color' as any]: GREEN }} aria-label={`Watch ${talk.title}`}>
        <div className="relative">
          <Thumb talk={talk} big className="!rounded-2xl" />
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums">{formatDuration(talk.durationSec)}</span>
        </div>
        <div className="px-1 pb-1 pt-4 sm:px-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">Featured Bridge Talk · {categoryLabel(talk.category)}</p>
          <h2 className="mt-1.5 font-serif text-[22px] font-semibold leading-tight sm:text-[28px]">{talk.title}</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Speaker talk={talk} size="md" dark />
            <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-5 text-sm font-bold" style={{ color: GREEN }}>Watch Talk <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </button>
    </section>
  );
};
