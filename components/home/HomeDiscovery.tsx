/**
 * components/home/HomeDiscovery.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The recommendation cards that sit inside the Home feed: an Arena challenge (or a quiet prompt to explore Arenas), a few pods
 * to join, and open opportunities. Loaded only when they come near the screen (see HomePage). Each is built from real records
 * only, can be closed (and then stays away for a week, see lib/homeFeed.ts), and appears once per feed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState } from 'react';
import { Briefcase, ChevronRight, Trophy, Users, X } from 'lucide-react';
import { Circle, Company, Job, User, View } from '../../types';
import type { DiscoveryKind } from '../../lib/homeFeed';
import { suggestJobs } from '../../lib/homeFeed';
import { suggestPods, suggestPeople } from '../../lib/feedSuggestions';
import { loadChallenges, loadIndustries } from '../../lib/arenaClient';
import { deadlineText, isOpen, prizeText, relevantFor, type ChallengeLite } from '../../lib/arenaDiscovery';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

const Shell: React.FC<{ label: string; onDismiss: () => void; tone?: 'green' | 'plain'; children: React.ReactNode }> = ({ label, onDismiss, tone = 'plain', children }) => (
  <aside aria-label={label} className={`relative rounded-2xl ${tone === 'green' ? '' : 'border bg-white'} p-4 pr-12`} style={tone === 'green' ? { backgroundColor: GREEN_LT } : { borderColor: '#e7e5e4' }}>
    <button type="button" onClick={onDismiss} aria-label={`Hide: ${label}`} title="Hide for a week"
      className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-stone-600 hover:bg-black/5 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
    {children}
  </aside>
);

const LinkRow: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 rounded-md" style={{ color: GREEN, ['--tw-ring-color' as any]: GREEN }}>{children}</button>
);

// Arenas load once per visit and are shared by anything that asks.
let arenaLoad: Promise<{ challenges: ChallengeLite[]; names: Map<string, string> }> | null = null;
const loadArena = () => (arenaLoad ??= Promise.all([loadChallenges(), loadIndustries().catch(() => [])])
  .then(([challenges, industries]) => ({ challenges, names: new Map<string, string>(industries.map(i => [String(i.id), i.name] as [string, string])) }))
  .catch(e => { arenaLoad = null; throw e; }));

const ArenaCard: React.FC<{ me: User; onNavigate: (v: View) => void; onDismiss: () => void }> = ({ me, onNavigate, onDismiss }) => {
  const [state, setState] = useState<{ challenges: ChallengeLite[]; names: Map<string, string> } | 'failed' | null>(null);
  useEffect(() => { let live = true; loadArena().then(r => { if (live) setState(r); }).catch(() => { if (live) setState('failed'); }); return () => { live = false; }; }, []);
  const ready = state && state !== 'failed' ? state : null;
  const pick = ready ? relevantFor(ready.challenges, { industryNames: me.industry ? [me.industry] : [], skills: (me.skills ?? []).map(s => s.name) }, slug => ready.names.get(slug) ?? slug)[0] : undefined;
  const open = ready ? ready.challenges.filter(c => isOpen(c)).length : 0;
  const c = pick?.challenge;

  return (
    <Shell label={c ? 'An Arena challenge for you' : 'Explore Arenas'} onDismiss={onDismiss} tone="green">
      <div className="flex items-center gap-2" style={{ color: GREEN }}>
        <Trophy className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        <h3 className="text-[17px] font-semibold">{c ? 'An Arena challenge for you' : 'Explore Arenas'}</h3>
      </div>
      {c ? (
        <>
          <p className="mt-2 text-[15px] font-semibold text-stone-900">{c.title}</p>
          <p className="mt-0.5 text-sm text-stone-700">
            {[c.companyName, ready!.names.get(c.arenaIndustry), deadlineText(c), prizeText(c)].filter(Boolean).join(' · ')}
          </p>
          {pick!.reasons[0] && <p className="mt-1 text-xs text-stone-600">{pick!.reasons[0]}</p>}
          <LinkRow onClick={() => window.dispatchEvent(new CustomEvent('bewatu:open-challenge', { detail: { id: c.id } }))}>View challenge <ChevronRight className="h-4 w-4" aria-hidden="true" /></LinkRow>
        </>
      ) : (
        <>
          <p className="mt-1 text-[15px] text-stone-700">
            {open > 0 ? `${open} open industry challenge${open === 1 ? '' : 's'} to put your expertise to work.` : 'Discover industry challenges and opportunities to put your expertise to work.'}
          </p>
          <LinkRow onClick={() => onNavigate(View.Arenas)}>Explore Arenas <ChevronRight className="h-4 w-4" aria-hidden="true" /></LinkRow>
        </>
      )}
    </Shell>
  );
};

const CommunityCard: React.FC<{ me: User; circles: Circle[]; users: User[]; connectedIds: Set<number>; onSelectCircle: (id: number) => void; onViewProfile: (id: number) => void; onNavigate: (v: View) => void; onDismiss: () => void }> = ({ me, circles, users, connectedIds, onSelectCircle, onViewProfile, onNavigate, onDismiss }) => {
  const pods = suggestPods(circles, me, 2);
  const people = pods.length ? [] : suggestPeople(users, me, connectedIds, 2);
  return (
    <Shell label="Find your professional community" onDismiss={onDismiss}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><Users className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold text-stone-900">Find your professional community</h3>
          <p className="text-sm text-stone-600">Connect with people who share your interests.</p>
        </div>
      </div>
      <ul className="mt-2">
        {pods.map(c => (
          <li key={'c' + c.id}><button type="button" onClick={() => onSelectCircle(c.id)} className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl px-1 text-left hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-stone-900">{c.name}</span><span className="block text-xs text-stone-600">{c.members.length} member{c.members.length === 1 ? '' : 's'}</span></span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
          </button></li>
        ))}
        {people.map(u => (
          <li key={'u' + u.id}><button type="button" onClick={() => onViewProfile(u.id)} className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl px-1 text-left hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-stone-900">{u.name}</span><span className="block truncate text-xs text-stone-600">{u.headline || u.industry}</span></span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
          </button></li>
        ))}
      </ul>
      <LinkRow onClick={() => onNavigate(pods.length ? View.Circles : View.People)}>{pods.length ? 'See all pods' : 'See more people'} <ChevronRight className="h-4 w-4" aria-hidden="true" /></LinkRow>
    </Shell>
  );
};

const OpportunitiesCard: React.FC<{ me: User; jobs: Job[]; companies: Company[]; onNavigate: (v: View) => void; onDismiss: () => void }> = ({ me, jobs, companies, onNavigate, onDismiss }) => {
  const picks = suggestJobs(jobs, me, 2);
  return (
    <Shell label="Opportunities" onDismiss={onDismiss}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><Briefcase className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold text-stone-900">Open opportunities</h3>
          <ul className="mt-1 space-y-0.5">
            {picks.map(j => <li key={j.id} className="truncate text-sm text-stone-700"><span className="font-semibold text-stone-900">{j.title}</span>{companies.find(c => c.id === j.companyId)?.name ? ` · ${companies.find(c => c.id === j.companyId)!.name}` : ''}</li>)}
          </ul>
        </div>
      </div>
      <LinkRow onClick={() => onNavigate(View.Jobs)}>Browse opportunities <ChevronRight className="h-4 w-4" aria-hidden="true" /></LinkRow>
    </Shell>
  );
};

export interface DiscoveryProps {
  kind: DiscoveryKind; me: User; circles: Circle[]; users: User[]; jobs: Job[]; companies: Company[]; connectedIds: Set<number>;
  onNavigate: (v: View) => void; onSelectCircle: (id: number) => void; onViewProfile: (id: number) => void; onDismiss: (k: DiscoveryKind) => void;
}

const DiscoveryCard: React.FC<DiscoveryProps> = (p) => {
  const dismiss = () => p.onDismiss(p.kind);
  if (p.kind === 'arena') return <ArenaCard me={p.me} onNavigate={p.onNavigate} onDismiss={dismiss} />;
  if (p.kind === 'community') return <CommunityCard me={p.me} circles={p.circles} users={p.users} connectedIds={p.connectedIds} onSelectCircle={p.onSelectCircle} onViewProfile={p.onViewProfile} onNavigate={p.onNavigate} onDismiss={dismiss} />;
  return <OpportunitiesCard me={p.me} jobs={p.jobs} companies={p.companies} onNavigate={p.onNavigate} onDismiss={dismiss} />;
};

export default DiscoveryCard;
