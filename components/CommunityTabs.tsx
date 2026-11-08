/**
 * components/CommunityTabs.tsx
 * The strip at the top of the Community destination: Connections, Pods, Bridge. Each is its own page with its own
 * address; the strip is how you move between them without leaving Community.
 */
import React from 'react';
import { View } from '../types';
import { PodsIcon, BridgeIcon, UsersIcon } from './IconComponents';

const GREEN = 'var(--bw-green)';

type Tab = 'connections' | 'pods' | 'bridge';
const TABS: { id: Tab; label: string; view: View; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'connections', label: 'Connections', view: View.Connections, Icon: UsersIcon },
  { id: 'pods', label: 'Pods', view: View.Circles, Icon: PodsIcon },
  { id: 'bridge', label: 'Bridge', view: View.Bridge, Icon: BridgeIcon },
];

// sticky top-0, not a larger offset: the page area is a scroll container (overflow-x-hidden), so an offset like top-14 would push this bar down over the page heading.
export const CommunityTabs: React.FC<{ current: Tab; onNavigate: (view: View) => void; pendingConnections?: number }> = ({ current, onNavigate, pendingConnections = 0 }) => (
  <nav aria-label="Community" className="sticky top-0 z-10 -mx-3 mb-4 border-b border-stone-200 bg-white sm:mx-0 sm:rounded-t-xl">
    <ul className="flex">
      {TABS.map(t => {
        const on = t.id === current;
        return (
          <li key={t.id} className="flex-1 sm:flex-none">
            <button type="button" onClick={() => onNavigate(t.view)} aria-current={on ? 'page' : undefined}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-6"
              style={{ color: on ? GREEN : '#57534e', borderBottom: on ? '2px solid ' + GREEN : '2px solid transparent', marginBottom: -1, ['--tw-ring-color' as any]: GREEN }}>
              <t.Icon className="h-4 w-4" />{t.label}
              {t.id === 'connections' && pendingConnections > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white"><span className="sr-only">{pendingConnections} pending: </span>{pendingConnections > 9 ? '9+' : pendingConnections}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);

export default CommunityTabs;
