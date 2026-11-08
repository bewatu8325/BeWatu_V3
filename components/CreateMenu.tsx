/**
 * components/CreateMenu.tsx
 * The Create action's menu. It is opened from the Create button in the header (so it never covers the page or the
 * bottom navigation) and offers what this member may create, with the action that fits the current page first.
 * What is shown comes from lib/createActions.ts; the page that does the creating is chosen by App.
 */
import React from 'react';
import { PenLine, Video, Lightbulb, Trophy, BookOpen, Flame } from 'lucide-react';
import { createActions, type CreateActionId } from '../lib/createActions';
import { PodsIcon } from './IconComponents';
import BottomSheet from './mobile/BottomSheet';
import { InviteIcon } from './icons/NavIcons';
import { TalkIcon } from './icons/BridgeIcons';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

const ICON: Record<CreateActionId, React.ReactNode> = {
  post: <PenLine className="h-5 w-5" aria-hidden="true" />,
  wisdom: <BookOpen className="h-5 w-5" aria-hidden="true" />,
  reel: <Video className="h-5 w-5" aria-hidden="true" />,
  spark: <Flame className="h-5 w-5" aria-hidden="true" />,
  pod: <PodsIcon className="h-5 w-5" />,
  project: <Lightbulb className="h-5 w-5" aria-hidden="true" />,
  invite: <InviteIcon className="h-5 w-5" />,
  talk: <TalkIcon className="h-5 w-5" />,
  challenge: <Trophy className="h-5 w-5" aria-hidden="true" />,
};

interface Props { open: boolean; onClose: () => void; view: string; canPostChallenge: boolean; onChoose: (id: CreateActionId) => void }

export const CreateMenu: React.FC<Props> = ({ open, onClose, view, canPostChallenge, onChoose }) => {
  const actions = createActions({ view, canPostChallenge });
  return (
    <BottomSheet open={open} onClose={onClose} title="Create" allWidths>
      <ul className="space-y-1" role="menu" aria-label="Create">
        {actions.map(a => (
          <li key={a.id} role="none">
            <button type="button" role="menuitem" onClick={() => { onClose(); onChoose(a.id); }}
              className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}>{ICON[a.id]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-stone-900">{a.label}{a.suggested && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: GREEN_LT, color: GREEN }}>Suggested here</span>}</span>
                <span className="block text-xs text-stone-600">{a.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
};

export default CreateMenu;
