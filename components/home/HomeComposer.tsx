/**
 * components/home/HomeComposer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The compact "share something" bar at the top of Home. It is only the doorway: tapping it opens the existing post editor
 * (components/CreatePost.tsx: standard posts with article links, Perspective Posts, Wisdom Threads) in a sheet, so nothing is
 * rebuilt and the header's Create button reaches the very same editor (both go through the 'focus-composer' request in
 * lib/uiIntent.ts, which can carry the mode to open in).
 *
 * The Reel chip goes to the existing Prove upload. Photos are not part of a post today, so there is no photo chip.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { BookOpen, Users, Video } from 'lucide-react';
import type { LinkPreview, User } from '../../types';
import CreatePost, { type PostMode } from '../CreatePost';
import BottomSheet from '../mobile/BottomSheet';
import { requestIntent, useIntent } from '../../lib/uiIntent';

const GREEN = 'var(--bw-green)';

interface Props {
  currentUser: User;
  addPost: (content: string, circleId?: number, linkPreview?: LinkPreview) => void;
  onPerspective?: (question: string, context: string, seeking: any[]) => Promise<void>;
  onWisdomThread?: (data: any) => Promise<void>;
  /** Goes to the reel uploader (the same flow as Create > Upload a Prove Reel). */
  onUploadReel: () => void;
}

const TITLES: Record<PostMode, string> = { standard: 'Post an update', perspective: 'Perspective Post', wisdom: 'Wisdom Thread' };

export const HomeComposer: React.FC<Props> = ({ currentUser, addPost, onPerspective, onWisdomThread, onUploadReel }) => {
  const [open, setOpen] = useState<PostMode | null>(null);
  useIntent('focus-composer', (p) => {
    const m = p?.composeMode ?? 'standard';
    setOpen(m === 'perspective' && !onPerspective ? 'standard' : m === 'wisdom' && !onWisdomThread ? 'standard' : m);
  });
  const close = () => setOpen(null);
  const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const chip = 'inline-flex min-h-[44px] items-center';
  const pill = 'inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-[13px] font-semibold text-stone-800';

  return (
    <section aria-label="Share with your network" className="border-b border-stone-200 pb-3">
      <div className="flex items-center gap-3">
        {currentUser.avatarUrl
          ? <img src={currentUser.avatarUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
          : <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>{initials}</span>}
        <button type="button" onClick={() => requestIntent('focus-composer')} aria-haspopup="dialog"
          className="min-h-[44px] min-w-0 flex-1 truncate rounded-full border border-stone-200 bg-white px-4 text-left text-[15px] text-stone-600 hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2"
          style={{ ['--tw-ring-color' as any]: GREEN }}>
          Share an idea, insight, or update...
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1 pl-[52px]">
        <button type="button" onClick={onUploadReel} className={chip + ' focus:outline-none focus-visible:ring-2 rounded-full'} style={{ ['--tw-ring-color' as any]: GREEN }}>
          <span className={pill}><Video className="h-3.5 w-3.5" aria-hidden="true" />Reel</span>
        </button>
        {onWisdomThread && (
          <button type="button" onClick={() => requestIntent('focus-composer', { composeMode: 'wisdom' })} className={chip + ' focus:outline-none focus-visible:ring-2 rounded-full'} style={{ ['--tw-ring-color' as any]: GREEN }}>
            <span className={pill}><BookOpen className="h-3.5 w-3.5" aria-hidden="true" />Wisdom</span>
          </button>
        )}
        {onPerspective && (
          <button type="button" onClick={() => requestIntent('focus-composer', { composeMode: 'perspective' })} className={chip + ' focus:outline-none focus-visible:ring-2 rounded-full'} style={{ ['--tw-ring-color' as any]: GREEN }}>
            <span className={pill}><Users className="h-3.5 w-3.5" aria-hidden="true" />Perspective</span>
          </button>
        )}
      </div>

      <BottomSheet open={open !== null} onClose={close} title={open ? TITLES[open] : ''} allWidths>
        {open && (
          <CreatePost
            key={open}
            currentUser={currentUser}
            addPost={(content, circleId, preview) => { addPost(content, circleId, preview); }}
            onPerspective={onPerspective && (async (q, c, s) => { await onPerspective(q, c, s); close(); })}
            onWisdomThread={onWisdomThread && (async (d) => { await onWisdomThread(d); close(); })}
            initialMode={open}
            autoFocus
            draftKey="home"
            onDone={close}
          />
        )}
      </BottomSheet>
    </section>
  );
};

export default HomeComposer;
