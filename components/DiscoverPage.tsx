/**
 * components/DiscoverPage.tsx
 * Discover: the way in to everything you can find on BeWatu that is not your own network or a challenge. It holds
 * the destinations that used to sit in the top bar and the More drawer (people, opportunities, organizations, pods, Bridge,
 * Factory) so each is still one tap away, grouped by what you are trying to do. No counts or recommendations are shown here:
 * those live on the pages themselves, where they can be real.
 */
import React, { useState } from 'react';
import { Search, ChevronRight, Lock } from 'lucide-react';
import { View } from '../types';
import { BriefcaseIcon, CompaniesIcon, PodsIcon, BridgeIcon, FactoryIcon, UsersIcon } from './IconComponents';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const ring = { ['--tw-ring-color' as any]: GREEN } as React.CSSProperties;

interface Props {
  onNavigate: (view: View) => void;
  /** Called with the typed text when someone searches for people. */
  onSearchPeople: (query: string) => void;
  /** Factory is gated for new accounts (see lib/engagementGate.ts). */
  factoryGated?: boolean;
}

interface Item { view: View; title: string; text: string; Icon: React.FC<{ className?: string }>; gated?: boolean }

export default function DiscoverPage({ onNavigate, onSearchPeople, factoryGated }: Props) {
  const [q, setQ] = useState('');
  const groups: { title: string; items: Item[] }[] = [
    { title: 'Find people and teams', items: [
      { view: View.People, title: 'People', text: 'Search professionals by name, skill or industry.', Icon: UsersIcon },
      { view: View.Circles, title: 'Pods', text: 'Teams working on goals, projects and challenges.', Icon: PodsIcon },
      { view: View.Bridge, title: 'Bridge', text: 'Connect across generations and experience levels.', Icon: BridgeIcon },
    ] },
    { title: 'Find work and organizations', items: [
      { view: View.Jobs, title: 'Opportunities', text: 'Roles from organizations on BeWatu.', Icon: BriefcaseIcon },
      { view: View.Companies, title: 'Organizations', text: 'Companies, universities and hospitals worth following.', Icon: CompaniesIcon },
    ] },
    { title: 'Build and fund', items: [
      { view: View.Factory, title: 'Factory', text: 'Take what you have built toward a startup.', Icon: FactoryIcon, gated: factoryGated },
    ] },
  ];
  return (
    <div className="mx-auto max-w-4xl px-1 py-4 sm:py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Discover</h1>
        <p className="mt-1 text-sm text-stone-600 sm:text-base">Find people, teams, organizations and opportunities.</p>
      </header>
      <form role="search" onSubmit={e => { e.preventDefault(); if (q.trim()) onSearchPeople(q.trim()); }} className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
        <input type="search" aria-label="Search people" placeholder="Search people" value={q} onChange={e => setQ(e.target.value)}
          className="min-h-[44px] w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-base focus:outline-none focus-visible:ring-2 sm:text-sm" style={ring} />
      </form>
      <div className="space-y-6">
        {groups.map(g => (
          <section key={g.title} aria-label={g.title}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">{g.title}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.items.map(it => (
                <li key={it.title}>
                  <button type="button" onClick={() => onNavigate(it.view)} disabled={it.gated}
                    title={it.gated ? 'Unlocks after a week of activity on BeWatu' : undefined}
                    className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-60 disabled:hover:shadow-sm focus:outline-none focus-visible:ring-2" style={ring}>
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><it.Icon className="h-6 w-6" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-stone-900">{it.title}</span>
                      <span className="block text-xs leading-snug text-stone-600">{it.gated ? 'Unlocks after a week of activity on BeWatu.' : it.text}</span>
                    </span>
                    {it.gated ? <Lock size={16} className="flex-shrink-0 text-stone-400" aria-hidden="true" /> : <ChevronRight size={16} className="flex-shrink-0 text-stone-400" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
