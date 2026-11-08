/**
 * components/organizations/MoreFiltersSheet.tsx
 * "More": every category (with the subcategories each one covers), plus the advanced filters. It edits the same filter
 * state the pills do, so the two can never disagree. A bottom sheet on phones, a centred dialog on wide screens.
 */
import React, { useId } from 'react';
import { Check } from 'lucide-react';
import { BROAD_CATEGORIES, type BroadKey } from '../../lib/organizations';
import BottomSheet from '../mobile/BottomSheet';

const GREEN = 'var(--bw-green)';
type Opt = { k: string; l: string };

interface Props {
  open: boolean; onClose: () => void;
  selected: BroadKey[]; counts: Partial<Record<BroadKey, number>>; onToggle: (k: BroadKey) => void;
  orgType: string; industry: string; country: string;
  types: Opt[]; industries: Opt[]; countries: Opt[];
  onType: (v: string) => void; onIndustry: (v: string) => void; onCountry: (v: string) => void;
  hiring: boolean; challenges: boolean; sponsor: boolean; onActivity: (k: 'hiring' | 'challenges' | 'sponsor', v: boolean) => void;
  defaults: React.ReactNode;
  onClear: () => void; total: number; loading: boolean;
}

export const MoreFiltersSheet: React.FC<Props> = (p) => {
  const id = useId();
  const select = (key: string, label: string, value: string, onChange: (v: string) => void, any: string, opts: Opt[]) => (
    <div>
      <label className="block text-sm font-semibold text-stone-800" htmlFor={`${id}-${key}`}>{label}</label>
      <select id={`${id}-${key}`} value={value} onChange={e => onChange(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base sm:text-sm">
        <option value="">{any}</option>
        {value && !opts.some(o => o.k === value) && <option value={value}>{value} (0)</option>}
        {opts.map(o => <option key={o.k} value={o.k}>{o.l}</option>)}
      </select>
    </div>
  );
  return (
    <BottomSheet open={p.open} onClose={p.onClose} title="More filters" allWidths
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={p.onClear} className="min-h-[44px] whitespace-nowrap px-2 text-sm font-semibold text-stone-600 hover:underline">Clear filters</button>
          <button type="button" onClick={p.onClose} className="min-h-[44px] whitespace-nowrap rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>
            {p.loading ? 'Show results' : `Show ${p.total.toLocaleString()} ${p.total === 1 ? 'result' : 'results'}`}
          </button>
        </div>
      }>
      <div className="space-y-5 pt-1">
        <fieldset>
          <legend className="text-sm font-semibold text-stone-800">Categories <span className="font-normal text-stone-500">· pick any; results match any of them</span></legend>
          <ul className="-mx-1 mt-1">
            {BROAD_CATEGORIES.map(c => {
              const on = p.selected.includes(c.key); const n = p.counts[c.key];
              return (
                <li key={c.key}>
                  <label className="flex min-h-[52px] cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-stone-50 active:bg-stone-100">
                    <input type="checkbox" checked={on} onChange={() => p.onToggle(c.key)} className="peer sr-only" />
                    <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 peer-focus-visible:ring-2" style={{ borderColor: on ? GREEN : '#a8a29e', backgroundColor: on ? GREEN : '#fff', ['--tw-ring-color' as any]: GREEN }}>{on && <Check size={13} color="#fff" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug text-stone-900">{c.label}{n && n > 0 ? <span className="ml-2 font-normal text-stone-500">{n.toLocaleString()}</span> : null}</span>
                      {c.subcategories.length > 0 && <span className="block text-xs leading-snug text-stone-600">{c.subcategories.join(', ')}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {select('type', 'Organization type', p.orgType, p.onType, 'Any type', p.types)}
        {select('industry', 'Industry', p.industry, p.onIndustry, 'All industries', p.industries)}
        {select('country', 'Country', p.country, p.onCountry, 'Anywhere', p.countries)}

        <fieldset>
          <legend className="text-sm font-semibold text-stone-800">Activity</legend>
          <div className="mt-1">
            {([['hiring', 'Hiring now', p.hiring], ['challenges', 'Has live challenges', p.challenges], ['sponsor', 'Sponsors an Arena', p.sponsor]] as const).map(([k, label, v]) => (
              <label key={k} className="flex min-h-[44px] items-center gap-3 text-sm text-stone-800">
                <input type="checkbox" checked={v} onChange={e => p.onActivity(k, e.target.checked)} className="h-5 w-5 rounded border-stone-300" /> {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="rounded-2xl bg-stone-50 p-3">{p.defaults}</div>
      </div>
    </BottomSheet>
  );
};

export default MoreFiltersSheet;
