/**
 * components/bridge/MyTalks.tsx
 * "Your Talks": a contributor's drafts and submissions, what stage each is at, any note from a reviewer, and what they can do next
 * (continue, withdraw, take down, archive, delete). The server decides what is allowed; the buttons here only offer what the
 * lifecycle table (lib/bridgeTalks.ts) permits for a speaker.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Thumb } from './TalkCard';
import { STATUS_HINT, STATUS_LABEL, ago, canMove, categoryLabel, formatDuration, type Talk, type TalkStatus } from '../../lib/bridgeTalks';
import { fetchMyTalks, fetchReview, talksApi } from '../../lib/bridgeTalksService';

const GREEN = 'var(--bw-green)';
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const TONE: Record<TalkStatus, string> = {
  draft: 'bg-stone-100 text-stone-700', submitted: 'bg-amber-100 text-amber-900', under_review: 'bg-amber-100 text-amber-900',
  published: 'bg-emerald-100 text-emerald-900', rejected: 'bg-red-100 text-red-800', unpublished: 'bg-stone-200 text-stone-700', archived: 'bg-stone-100 text-stone-500',
};

interface Props { uid: string; refreshKey: number; onOpen: (id: string) => void; onEdit: (t: Talk) => void; onNew: () => void }

export const MyTalks: React.FC<Props> = ({ uid, refreshKey, onOpen, onEdit, onNew }) => {
  const [talks, setTalks] = useState<Talk[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const list = await fetchMyTalks(uid); setTalks(list);
      const need = list.filter(t => t.status === 'draft' || t.status === 'rejected' || t.status === 'unpublished');
      const got = await Promise.all(need.map(async t => [t.id, (await fetchReview(t.id))?.note ?? ''] as const));
      setNotes(Object.fromEntries(got.filter(([, n]) => n)));
    } catch { setError('We could not load your Talks.'); }
  }, [uid]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const move = async (t: Talk, to: TalkStatus, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(t.id); setError('');
    try { await talksApi({ action: 'transition', id: t.id, to }); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };
  const del = async (t: Talk) => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    setBusy(t.id); try { await talksApi({ action: 'delete', id: t.id }); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };

  if (talks === null && !error) return <div className="space-y-3" aria-busy="true" role="status"><span className="sr-only">Loading your Talks</span>{[0, 1].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-100" />)}</div>;
  const btn = 'min-h-[40px] rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 ' + FOCUS;
  return (
    <section aria-label="Your Talks">
      {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error} <button type="button" className="font-semibold underline" onClick={load}>Try again</button></p>}
      {talks && talks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center">
          <h2 className="font-serif text-xl font-semibold text-stone-900">Your first Talk starts here</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-stone-600">Record one lesson, in your own words. You can save a draft and come back to it.</p>
          <button type="button" onClick={onNew} className={'mt-5 min-h-[48px] rounded-full px-6 text-sm font-bold text-white ' + FOCUS} style={{ backgroundColor: GREEN }}>Share a Bridge Talk</button>
        </div>
      )}
      <ul className="space-y-3">
        {(talks ?? []).map(t => (
          <li key={t.id} className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
            <div className="flex gap-3 sm:gap-4">
              <div className="w-28 flex-shrink-0 sm:w-40"><Thumb talk={t} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className={'rounded-full px-2.5 py-0.5 text-xs font-semibold ' + TONE[t.status]}>{STATUS_LABEL[t.status]}</span><span className="text-xs text-stone-500">{ago(t.updatedAt)}</span></div>
                <h3 className="mt-1.5 line-clamp-2 font-serif text-[17px] font-semibold leading-snug text-stone-900">{t.title || 'Untitled Talk'}</h3>
                <p className="mt-0.5 text-sm text-stone-600">{[categoryLabel(t.category), t.durationSec ? formatDuration(t.durationSec) : ''].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-stone-600">{STATUS_HINT[t.status]}</p>
            {notes[t.id] && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-stone-800"><span className="font-semibold">Note from BeWatu: </span>{notes[t.id]}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {t.status === 'draft' && <button type="button" onClick={() => onEdit(t)} className={'min-h-[40px] rounded-full px-4 text-sm font-bold text-white ' + FOCUS} style={{ backgroundColor: GREEN }}>Continue editing</button>}
              <button type="button" onClick={() => onOpen(t.id)} className={btn}>{t.status === 'published' ? 'Open' : 'Preview'}</button>
              {canMove(t.status, 'draft', 'speaker') && t.status !== 'draft' && <button type="button" disabled={busy === t.id} onClick={() => move(t, 'draft', t.status === 'submitted' ? 'Withdraw this Talk from review? You can edit it and submit it again.' : undefined)} className={btn}>{t.status === 'submitted' ? 'Withdraw' : 'Revise'}</button>}
              {canMove(t.status, 'unpublished', 'speaker') && <button type="button" disabled={busy === t.id} onClick={() => move(t, 'unpublished', 'Take this Talk down? Members will no longer see it. A BeWatu reviewer has to approve it again to bring it back.')} className={btn}>Take down</button>}
              {canMove(t.status, 'archived', 'speaker') && <button type="button" disabled={busy === t.id} onClick={() => move(t, 'archived', 'Archive this Talk? It is kept for your records and can\'t be brought back.')} className={btn}>Archive</button>}
              {t.status === 'draft' && <button type="button" disabled={busy === t.id} onClick={() => del(t)} className={btn + ' !text-red-700'}>Delete</button>}
              {busy === t.id && <Loader2 className="h-4 w-4 animate-spin text-stone-500" aria-label="Working" />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default MyTalks;
