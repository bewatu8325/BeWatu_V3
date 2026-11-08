/**
 * components/mobile/ExploreStrip.tsx
 * The discovery row at the top of Home on phones: Opportunities (jobs), Showcase, Pods, Organizations, Bridge.
 * It replaces the old "More" drawer so these stay one tap from where people start. Hidden from md up, where the
 * header navigation already lists them.
 */
import React from 'react';
import { View } from '../../types';
import { EXPLORE_ITEMS } from './AccountSheet';

export const ExploreStrip: React.FC<{ onNavigate: (v: View) => void }> = ({ onNavigate }) => (
  <nav aria-label="Explore" className="-mx-3 md:hidden">
    <ul className="flex gap-2 overflow-x-auto px-3 pb-0.5 scrollbar-hide">
      {EXPLORE_ITEMS.map(({ view, label, Icon }) => (
        <li key={view} className="flex-shrink-0">
          <button type="button" onClick={() => onNavigate(view)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border bg-white px-3.5 text-[13px] font-semibold text-stone-800 shadow-sm active:bg-stone-50 focus:outline-none focus-visible:ring-2"
            style={{ borderColor: '#e7e5e4', ['--tw-ring-color' as any]: 'var(--bw-green)' }}>
            <span style={{ color: 'var(--bw-green)' }}><Icon className="h-[18px] w-[18px]" /></span>
            {label}
          </button>
        </li>
      ))}
    </ul>
  </nav>
);

export default ExploreStrip;
