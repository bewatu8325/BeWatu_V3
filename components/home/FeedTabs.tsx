/**
 * components/home/FeedTabs.tsx
 * The For You / Following switch. A real tablist (arrow keys move between the tabs; each tab is at least 44px tall) and the
 * choice is remembered for the session by the page that owns it.
 */
import React, { useRef } from 'react';
import type { FeedTab } from '../../lib/homeFeed';

const TABS: { id: FeedTab; label: string }[] = [{ id: 'for_you', label: 'For You' }, { id: 'following', label: 'Following' }];

export const FeedTabs: React.FC<{ value: FeedTab; onChange: (t: FeedTab) => void; panelId: string }> = ({ value, onChange, panelId }) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = TABS.findIndex(t => t.id === value);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    onChange(TABS[next].id); refs.current[TABS[next].id]?.focus();
  };
  return (
    <div role="tablist" aria-label="Feed" onKeyDown={onKey} className="flex items-end gap-5">
      {TABS.map(t => {
        const on = t.id === value;
        return (
          <button key={t.id} ref={el => { refs.current[t.id] = el; }} type="button" role="tab" id={`feed-tab-${t.id}`} aria-selected={on} aria-controls={panelId} tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`relative min-h-[44px] px-0.5 text-[17px] transition-colors focus:outline-none focus-visible:ring-2 rounded-md ${on ? 'font-bold text-stone-900' : 'font-medium text-stone-600 hover:text-stone-800'}`}
            style={{ ['--tw-ring-color' as any]: 'var(--bw-green)' }}>
            {t.label}
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] rounded-full transition-opacity" style={{ backgroundColor: 'var(--bw-green)', opacity: on ? 1 : 0 }} />
          </button>
        );
      })}
    </div>
  );
};

export default FeedTabs;
