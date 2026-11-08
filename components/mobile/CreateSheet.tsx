/**
 * components/mobile/CreateSheet.tsx
 * What the Create tab opens: the things a member can start from anywhere. Each one takes them to the place that
 * already does it (the composer on Home, the Start-a-pod dialog, Showcase) with the right control opened for them.
 */
import React from 'react';
import { PenLine } from 'lucide-react';
import { View } from '../../types';
import { PodsIcon, ShowcaseIcon } from '../IconComponents';
import { requestIntent } from '../../lib/uiIntent';
import BottomSheet from './BottomSheet';

interface Props { open: boolean; onClose: () => void; onNavigate: (v: View) => void }

export const CreateSheet: React.FC<Props> = ({ open, onClose, onNavigate }) => {
  const go = (view: View, intent?: 'focus-composer' | 'create-pod') => {
    onClose();
    if (intent) requestIntent(intent);
    onNavigate(view);
    if (intent === 'focus-composer') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const rows = [
    { icon: <PenLine className="h-5 w-5" aria-hidden="true" />, label: 'Write a post', hint: 'Share a thought, a link or a lesson', run: () => go(View.Feed, 'focus-composer') },
    { icon: <PodsIcon className="h-5 w-5" />, label: 'Start a pod', hint: 'Bring people together around a goal', run: () => go(View.Circles, 'create-pod') },
    { icon: <ShowcaseIcon className="h-5 w-5" />, label: 'Add to Showcase', hint: 'Prove a skill with real work', run: () => go(View.Prove) },
  ];
  return (
    <BottomSheet open={open} onClose={onClose} title="Create">
      <ul className="space-y-1">
        {rows.map(r => (
          <li key={r.label}>
            <button type="button" onClick={r.run}
              className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2"
              style={{ ['--tw-ring-color' as any]: 'var(--bw-green)' }}>
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--bw-green-light)', color: 'var(--bw-green)' }}>{r.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-stone-900">{r.label}</span>
                <span className="block text-xs text-stone-600">{r.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
};

export default CreateSheet;
