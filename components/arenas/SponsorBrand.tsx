/**
 * components/arenas/SponsorBrand.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The sponsor's look, used by the Arena directory, the Arena page, the company
 * manager's live preview and the admin queue, so they can never drift apart.
 *
 *   SponsorLogoTile        logo on a white tile (or initials), scales to fit
 *   SponsoredCardHeader    the coloured header of a sponsored directory card
 *   SponsoredArenaHero     the Arena page hero: optional banner strip, coloured
 *                          sponsor band, then a white body for the Arena itself
 *   useActiveSponsorships  approved sponsorships, kept current as time passes
 *
 * Every colour goes through brandTheme(), so text on the sponsor's colour is
 * readable whatever colour the company picks. The banner sits ABOVE the coloured
 * band, never behind text, and is height-capped, so it cannot dominate the page.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { brandTheme, activeSponsorship, type SponsorshipRecord } from '../../lib/arenaSponsorship';
import { fetchApprovedSponsorships } from '../../lib/arenaSponsorshipService';

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

export const SponsorLogoTile: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 44 }) => (
  <div
    className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white"
    style={{ width: size, height: size, padding: Math.round(size * 0.14) }}
  >
    {logo
      ? <img src={logo} alt={name ? `${name} logo` : ''} className="max-h-full max-w-full object-contain" />
      : <span className="font-bold text-stone-700" style={{ fontSize: Math.round(size * 0.34) }} aria-hidden="true">{initialsOf(name)}</span>}
  </div>
);

const pillStyle = (fg: string): React.CSSProperties => ({
  backgroundColor: fg === '#ffffff' ? 'rgba(255,255,255,0.16)' : 'rgba(20,32,27,0.10)',
  color: fg,
});

export const SponsoredCardHeader: React.FC<{ sponsorship: SponsorshipRecord }> = ({ sponsorship: s }) => {
  const t = brandTheme(s.branding.primaryColor);
  return (
    <div className="px-5 pb-4 pt-4" style={{ backgroundColor: t.bg, color: t.fg }}>
      <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide" style={pillStyle(t.fg)}>
        Sponsored Arena
      </span>
      <div className="mt-3 flex min-w-0 items-center gap-3">
        <SponsorLogoTile logo={s.branding.logo} name={s.companyName} size={44} />
        <div className="min-w-0">
          <p className="text-[11px]" style={{ color: t.fgMuted }}>Presented by</p>
          <p className="line-clamp-2 break-words text-base font-semibold leading-snug">{s.companyName}</p>
        </div>
      </div>
    </div>
  );
};

interface HeroProps {
  sponsorship: SponsorshipRecord;
  banner?: string | null;
  /** The Arena's own name, description and actions, rendered on the white body. */
  children: React.ReactNode;
}

export const SponsoredArenaHero: React.FC<HeroProps> = ({ sponsorship: s, banner, children }) => {
  const t = brandTheme(s.branding.primaryColor);
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" aria-label={`Sponsored Arena, presented by ${s.companyName}`}>
      {banner && (
        <img src={banner} alt="" loading="lazy" decoding="async" className="block w-full object-cover" style={{ aspectRatio: '4 / 1', maxHeight: 176 }} />
      )}
      <div className="px-5 py-5 sm:px-7" style={{ backgroundColor: t.bg, color: t.fg }}>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold tracking-wide" style={pillStyle(t.fg)}>Sponsored Arena</span>
          {s.branding.website && (
            <a href={s.branding.website} target="_blank" rel="noopener noreferrer nofollow"
               className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2"
               style={{ color: t.fgMuted, ['--tw-ring-color' as any]: t.fg }}
               aria-label={`${s.companyName} website (opens in a new tab)`}>
              Website <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-4">
          <SponsorLogoTile logo={s.branding.logo} name={s.companyName} size={64} />
          <div className="min-w-0">
            <p className="text-xs" style={{ color: t.fgMuted }}>Presented by</p>
            <p className="truncate text-xl font-semibold leading-tight sm:text-2xl">{s.companyName}</p>
            {s.branding.tagline && <p className="mt-0.5 line-clamp-2 text-sm" style={{ color: t.fgMuted }}>{s.branding.tagline}</p>}
          </div>
        </div>
      </div>
      <div className="px-5 py-5 sm:px-7">{children}</div>
    </section>
  );
};

/** A re-render once a minute, so a sponsorship that ends while the page is open stops showing. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

/** Approved sponsorships plus a helper that answers "who sponsors this Arena right now?". */
export function useActiveSponsorships() {
  const [list, setList] = useState<SponsorshipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const now = useNow();
  useEffect(() => {
    let cancelled = false;
    fetchApprovedSponsorships()
      .then(l => { if (!cancelled) setList(l); })
      .catch(() => { if (!cancelled) setList([]); })     // no data -> no sponsor shown, never a guess
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const forArena = useMemo(() => (arenaId: string) => activeSponsorship(list, arenaId, now), [list, now]);
  return { loading, forArena, list, now };
}
