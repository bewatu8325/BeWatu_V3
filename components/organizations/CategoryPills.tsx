/**
 * components/organizations/CategoryPills.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The pill row on the Organizations page. It shows three different things, never mixed up:
 *
 *   SUGGESTED  nothing is selected: "All" (selected) then shortcuts (Finance, Healthcare, Technology, Education for a
 *              new member; a returning member's own interests first). Pressing one SELECTS it.
 *   SELECTED   one or more categories are chosen: "All" (a reset), then each chosen category as a removable pill
 *              (OR between them), any other active filters as removable pills, and "+ Add". The shortcuts are gone.
 *   SAVED      lives in the member's account, not here; see the defaults bar.
 *
 * Pills never shrink or wrap their label. The row scrolls sideways with smooth touch scrolling and a soft fade on the
 * edge that has more; "More" is a separate button beside the scroller, never on top of it. A pill shows its count only
 * when the count is above zero.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, SlidersHorizontal, X } from 'lucide-react';
import { BROAD_LABEL, type BroadKey } from '../../lib/organizations';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

export interface ActiveFilter { id: string; label: string; clear: () => void }

interface Props {
  selected: BroadKey[];
  suggested: BroadKey[];
  counts: Partial<Record<BroadKey, number>>;
  others: ActiveFilter[];
  moreBadge: number;
  onSelect: (k: BroadKey) => void;
  onRemove: (k: BroadKey) => void;
  onReset: () => void;
  onOpenMore: () => void;
}

const base = 'relative inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2';
const ring = { ['--tw-ring-color' as any]: GREEN } as React.CSSProperties;
const idle: React.CSSProperties = { ...ring, backgroundColor: '#fff', borderColor: '#d6d3d1', color: '#44403c' };
const on: React.CSSProperties = { ...ring, backgroundColor: GREEN, borderColor: GREEN, color: '#fff' };

export const CategoryPills: React.FC<Props> = ({ selected, suggested, counts, others, moreBadge, onSelect, onRemove, onReset, onOpenMore }) => {
  const scroller = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = scroller.current; if (!el) return;
    setFade({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = scroller.current; if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el); Array.from(el.children).forEach(c => ro?.observe(c));
    return () => ro?.disconnect();
  }, [measure, selected.length, suggested.length, others.length]);

  const noCategory = selected.length === 0;
  const count = (k: BroadKey, onState: boolean) => {
    const n = counts[k];
    return n && n > 0 ? <span className={onState ? 'text-white/80' : 'text-stone-500'}>{n.toLocaleString()}</span> : null;
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <ul ref={scroller} onScroll={measure} aria-label="Categories" className="flex items-center gap-2 overflow-x-auto scroll-smooth py-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          <li className="flex-shrink-0">
            <button type="button" aria-pressed={noCategory} onClick={onReset} className={base} style={noCategory ? on : idle}>All</button>
          </li>

          {/* chosen categories, each removable */}
          {selected.map(k => (
            <li key={k} className="flex-shrink-0">
              <button type="button" onClick={() => onRemove(k)} aria-pressed aria-label={`Remove category: ${BROAD_LABEL[k]}`} className={base} style={on}>
                {BROAD_LABEL[k]} {count(k, true)} <X size={14} aria-hidden="true" className="flex-shrink-0" />
              </button>
            </li>
          ))}

          {/* any other active filter (country, type, hiring...), each removable */}
          {others.map(f => (
            <li key={f.id} className="flex-shrink-0">
              <button type="button" onClick={f.clear} aria-label={`Remove filter: ${f.label}`} className={base}
                style={{ ...ring, backgroundColor: GREEN_LT, borderColor: GREEN, color: GREEN }}>
                {f.label} <X size={14} aria-hidden="true" className="flex-shrink-0" />
              </button>
            </li>
          ))}

          {noCategory ? suggested.map(k => (
            <li key={k} className="flex-shrink-0">
              <button type="button" aria-pressed={false} onClick={() => onSelect(k)} className={`${base} hover:bg-stone-50`} style={idle}>
                {BROAD_LABEL[k]} {count(k, false)}
              </button>
            </li>
          )) : (
            <li className="flex-shrink-0">
              <button type="button" onClick={onOpenMore} aria-haspopup="dialog" className={`${base} hover:bg-stone-50`} style={{ ...idle, borderStyle: 'dashed' }}>
                <Plus size={14} aria-hidden="true" /> Add
              </button>
            </li>
          )}
          <li aria-hidden="true" className="w-4 flex-shrink-0" />
        </ul>
        {/* a soft fade where there is more to scroll to */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-6 transition-opacity" style={{ opacity: fade.left ? 1 : 0, background: 'linear-gradient(to right, var(--org-page-bg, #f5f5f4), transparent)' }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity" style={{ opacity: fade.right ? 1 : 0, background: 'linear-gradient(to left, var(--org-page-bg, #f5f5f4), transparent)' }} />
      </div>

      <button type="button" onClick={onOpenMore} aria-haspopup="dialog" className={`${base} hover:bg-stone-50`} style={{ ...idle, color: '#292524' }}>
        <SlidersHorizontal size={16} aria-hidden="true" /> More
        {moreBadge > 0 && <span className="rounded-full px-1.5 text-xs font-bold text-white" style={{ backgroundColor: GREEN }}><span className="sr-only">{moreBadge} active: </span>{moreBadge}</span>}
      </button>
    </div>
  );
};

export default CategoryPills;
