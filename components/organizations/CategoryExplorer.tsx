/**
 * components/organizations/CategoryExplorer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Explore by category": four popular choices as icon tiles (Universities, Healthcare, Manufacturing, Finance), and a
 * visible "See all" that opens a sheet with every category. Picking one updates the list at once.
 *
 * Labels are never truncated: tiles are two to a row on a phone (four from 640px) and a label may wrap, rows in the sheet
 * wrap too. Everything tappable is at least 44px high. The sheet is a bottom sheet on phones (above the safe area) and a
 * centred dialog on wide screens.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { CATEGORIES, POPULAR_GROUPS, categoryParam, parseCategoryParam, type CategoryKey } from '../../lib/organizations';
import { CATEGORY_ICON_COMPONENT, HealthcareIcon, OtherOrgIcon } from '../icons/CategoryIcons';
import BottomSheet from '../mobile/BottomSheet';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

interface Props {
  /** The selected categories as the comma-separated param ('' = none). */
  selected: string;
  counts: { key: CategoryKey; count: number }[];
  onSelect: (param: string) => void;
}

const GROUP_ICON: Record<string, React.FC<{ className?: string }>> = {
  universities: CATEGORY_ICON_COMPONENT.colleges, healthcare: HealthcareIcon, manufacturing: CATEGORY_ICON_COMPONENT.manufacturing, finance: CATEGORY_ICON_COMPONENT.finance,
};

export const CategoryExplorer: React.FC<Props> = ({ selected, counts, onSelect }) => {
  const [open, setOpen] = useState(false);
  const canon = categoryParam(parseCategoryParam(selected));
  const countOf = (keys: CategoryKey[]) => {
    if (counts.length === 0) return undefined;
    return keys.reduce((n, k) => n + (counts.find(c => c.key === k)?.count ?? 0), 0);
  };
  const choose = (param: string) => { onSelect(param === canon ? '' : param); setOpen(false); };
  const ring = { ['--tw-ring-color' as any]: GREEN } as React.CSSProperties;

  // Rows for the "all categories" sheet. Healthcare is one choice that covers two categories, shown with both beneath it.
  const sheetRows: { id: string; label: string; param: string; Icon: React.FC<{ className?: string }>; count?: number; nested?: boolean }[] = [
    { id: 'universities', label: 'Universities', param: 'colleges', Icon: CATEGORY_ICON_COMPONENT.colleges, count: countOf(['colleges']) },
    { id: 'healthcare', label: 'Healthcare (all)', param: categoryParam(['medical', 'hospitals']), Icon: HealthcareIcon, count: countOf(['medical', 'hospitals']) },
    { id: 'medical', label: CATEGORIES.find(c => c.key === 'medical')!.label, param: 'medical', Icon: CATEGORY_ICON_COMPONENT.medical, count: countOf(['medical']), nested: true },
    { id: 'hospitals', label: CATEGORIES.find(c => c.key === 'hospitals')!.label, param: 'hospitals', Icon: CATEGORY_ICON_COMPONENT.hospitals, count: countOf(['hospitals']), nested: true },
    { id: 'manufacturing', label: 'Manufacturing', param: 'manufacturing', Icon: CATEGORY_ICON_COMPONENT.manufacturing, count: countOf(['manufacturing']) },
    { id: 'finance', label: 'Finance', param: 'finance', Icon: CATEGORY_ICON_COMPONENT.finance, count: countOf(['finance']) },
    { id: 'other', label: 'Other organizations', param: 'other', Icon: OtherOrgIcon, count: countOf(['other']) },
  ];

  return (
    <section aria-labelledby="explore-by-category" className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="explore-by-category" className="text-base font-bold text-stone-900">Explore by category</h2>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
          className="-mr-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-lg px-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: GREEN, ...ring }}>
          See all <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {POPULAR_GROUPS.map(g => {
          const param = categoryParam(g.keys);
          const on = canon === param;
          const Icon = GROUP_ICON[g.id];
          const n = countOf(g.keys);
          return (
            <li key={g.id}>
              <button type="button" aria-pressed={on} onClick={() => choose(param)}
                className="relative flex min-h-[96px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 bg-white px-2 py-3 text-center shadow-sm transition-colors active:bg-stone-50 focus:outline-none focus-visible:ring-2"
                style={{ borderColor: on ? GREEN : '#e7e5e4', backgroundColor: on ? GREEN_LT : undefined, ...ring }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: on ? GREEN : GREEN_LT, color: on ? '#fff' : GREEN }}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-sm font-semibold leading-tight text-stone-900">{g.label}</span>
                {n !== undefined && <span className="text-xs text-stone-600">{n.toLocaleString()} {n === 1 ? 'organization' : 'organizations'}</span>}
                {on && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: GREEN }}><Check size={13} aria-hidden="true" /><span className="sr-only">Selected</span></span>}
              </button>
            </li>
          );
        })}
      </ul>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="All categories" allWidths>
        <ul className="-mx-1">
          <li>
            <button type="button" onClick={() => { onSelect(''); setOpen(false); }} aria-pressed={canon === ''}
              className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2" style={ring}>
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"><OtherOrgIcon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-stone-900">All organizations</span>
              {canon === '' && <Check size={18} style={{ color: GREEN }} aria-label="Selected" />}
            </button>
          </li>
          {sheetRows.map(r => {
            const on = canon === r.param;
            return (
              <li key={r.id} className={r.nested ? 'ml-6 border-l border-stone-200 pl-1' : ''}>
                <button type="button" onClick={() => choose(r.param)} aria-pressed={on}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2" style={ring}>
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: on ? GREEN : GREEN_LT, color: on ? '#fff' : GREEN }}><r.Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-stone-900">{r.label}</span>
                  {r.count !== undefined && <span className="flex-shrink-0 text-xs text-stone-600">{r.count.toLocaleString()}</span>}
                  {on && <Check size={18} className="flex-shrink-0" style={{ color: GREEN }} aria-label="Selected" />}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </section>
  );
};

export default CategoryExplorer;
