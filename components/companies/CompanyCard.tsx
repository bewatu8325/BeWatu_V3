/**
 * components/companies/CompanyCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One company in the directory. Compact and consistent: logo (or initials),
 * name, industry, a two-line description, the REAL signals we have (open roles,
 * live challenges, Arena sponsorship, followers), View profile and Follow.
 *
 * Nothing here is invented: a signal appears only when the server reported it,
 * and "Unclaimed" is never shown on a public card (claiming lives on the profile).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { BadgeCheck, Briefcase, Trophy, Award, Sparkles, Loader2 } from 'lucide-react';
import type { CompanyItem } from '../../lib/companiesService';

const GREEN = 'var(--bw-green)';

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
const tint = (name: string) => `hsl(${(name.charCodeAt(0) * 37 + name.length * 11) % 360}, 38%, 32%)`;

export const CompanyLogo: React.FC<{ name: string; logoUrl: string; size?: number }> = ({ name, logoUrl, size = 44 }) => {
  const [failed, setFailed] = useState(false);
  const show = !!logoUrl && !failed;
  return (
    <div className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-white font-bold"
      style={{ width: size, height: size, backgroundColor: show ? '#fff' : tint(name), border: show ? '1px solid #e7e5e4' : 'none', fontSize: Math.round(size * 0.34) }}>
      {show
        ? <img src={logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain p-1" />
        : <span aria-hidden="true">{initialsOf(name)}</span>}
    </div>
  );
};

const Signal: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
    <span className="flex-shrink-0 text-stone-500" aria-hidden="true">{icon}</span>
    <span className="truncate">{children}</span>
  </span>
);

interface Props {
  company: CompanyItem;
  onView: () => void;
  onToggleFollow: () => Promise<void>;
  canFollow: boolean;
}

const CompanyCard: React.FC<Props> = ({ company: c, onView, onToggleFollow, canFollow }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await onToggleFollow(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update. Try again.'); }
    finally { setBusy(false); }
  };

  const signals: React.ReactNode[] = [];
  if (c.openJobs > 0) signals.push(<Signal key="jobs" icon={<Briefcase size={12} />}>{c.openJobs} open role{c.openJobs === 1 ? '' : 's'}</Signal>);
  if (c.liveChallenges > 0) signals.push(<Signal key="ch" icon={<Trophy size={12} />}>{c.liveChallenges} live challenge{c.liveChallenges === 1 ? '' : 's'}</Signal>);
  if (c.sponsoredArenas.length > 0) signals.push(<Signal key="sp" icon={<Award size={12} />}>Sponsors the {c.sponsoredArenas[0]}{c.sponsoredArenas.length > 1 ? ` +${c.sponsoredArenas.length - 1}` : ''}</Signal>);

  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-md sm:p-5" aria-label={c.name}>
      <div className="flex items-start gap-3">
        <CompanyLogo name={c.name} logoUrl={c.logoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[15px] font-semibold leading-snug text-stone-900">{c.name}</h2>
            {c.verified && <BadgeCheck size={15} className="flex-shrink-0 text-emerald-600" aria-label="Verified company" />}
            {c.ticker && <span className="flex-shrink-0 font-mono text-[11px] text-stone-500">{c.ticker}</span>}
          </div>
          <p className="truncate text-xs text-stone-600">{c.industry || 'Company'}</p>
        </div>
      </div>

      {c.description && <p className="line-clamp-2 text-sm leading-relaxed text-stone-600">{c.description}</p>}

      {(signals.length > 0 || c.followerCount > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {signals}
          {c.followerCount > 0 && <span className="px-1 text-xs text-stone-500">{c.followerCount.toLocaleString()} follower{c.followerCount === 1 ? '' : 's'}</span>}
        </div>
      )}

      {c.reasons && c.reasons.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-stone-600">
          <Sparkles size={12} className="mt-0.5 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" />
          <span>{c.reasons[0]}</span>
        </p>
      )}

      <div className="mt-auto flex gap-2 pt-1">
        <button type="button" onClick={onView}
          className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2"
          style={{ ['--tw-ring-color' as any]: GREEN }}>
          View profile
        </button>
        {canFollow && (
          <button type="button" onClick={toggle} disabled={busy} aria-pressed={c.following}
            aria-label={c.following ? `Unfollow ${c.name}` : `Follow ${c.name}`}
            className="inline-flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:opacity-60"
            style={c.following
              ? { border: `1px solid ${GREEN}`, color: GREEN, backgroundColor: 'transparent', ['--tw-ring-color' as any]: GREEN }
              : { backgroundColor: GREEN, color: '#fff', ['--tw-ring-color' as any]: GREEN }}>
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
            {c.following ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </article>
  );
};

export const CompanyCardSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5" aria-hidden="true">
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 animate-pulse rounded-xl bg-stone-200" />
      <div className="flex-1 space-y-2"><div className="h-3.5 w-2/3 animate-pulse rounded bg-stone-200" /><div className="h-3 w-1/3 animate-pulse rounded bg-stone-100" /></div>
    </div>
    <div className="space-y-2"><div className="h-3 w-full animate-pulse rounded bg-stone-100" /><div className="h-3 w-4/5 animate-pulse rounded bg-stone-100" /></div>
    <div className="h-6 w-1/2 animate-pulse rounded-full bg-stone-100" />
    <div className="flex gap-2 pt-1"><div className="h-9 flex-1 animate-pulse rounded-xl bg-stone-100" /><div className="h-9 w-24 animate-pulse rounded-xl bg-stone-100" /></div>
  </div>
);

export default CompanyCard;
