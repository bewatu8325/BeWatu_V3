/**
 * components/bridge/TalkReviewView.tsx
 * The reviewers' desk for Bridge Talks, inside the platform admin panel: what is waiting (watch it, then publish, ask for changes or
 * decline), what is live (take it down, archive it), who has asked to share Talks, who may, and speakers members suggested. Every
 * decision goes through api/bridge-talks.ts, which checks that the person really is a reviewer and that the move is allowed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import TalkPlayer from './TalkPlayer';
import { Speaker, Thumb } from './TalkCard';
import { STATUS_LABEL, ago, categoryLabel, formatDuration, type Talk } from '../../lib/bridgeTalks';
import { fetchAdminTalks, fetchReview, talksApi, type ReviewNote } from '../../lib/bridgeTalksService';

type Tab = 'waiting' | 'live' | 'requests' | 'contributors' | 'suggestions';
const TABS: { id: Tab; label: string }[] = [{ id: 'waiting', label: 'Waiting' }, { id: 'live', label: 'Live' }, { id: 'requests', label: 'Access requests' }, { id: 'contributors', label: 'Contributors' }, { id: 'suggestions', label: 'Suggestions' }];

const btn = 'min-h-[40px] rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2';
const primary = 'min-h-[40px] rounded-lg bg-emerald-800 px-3.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50 focus:outline-none focus-visible:ring-2';

const Detail: React.FC<{ talk: Talk; onDone: () => void }> = ({ talk, onDone }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<ReviewNote | null>(null);
  useEffect(() => { fetchReview(talk.id).then(setReview); }, [talk.id]);
  const go = async (to: string, needsNote?: boolean) => {
    if (needsNote && note.trim().length < 5) { setError('Write a short reason for the speaker first.'); return; }
    setBusy(to); setError('');
    try { await talksApi({ action: 'transition', id: talk.id, to, note: note.trim() || undefined }); onDone(); } catch (e: any) { setError(e.message); setBusy(''); }
  };
  const waiting = talk.status === 'submitted' || talk.status === 'under_review';
  return (
    <div className="mt-3 space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
      <div className="max-w-2xl"><TalkPlayer talkId={'review-' + talk.id} src={talk.videoUrl} poster={talk.thumbnailUrl} captionsVtt={talk.captionsVtt} title={talk.title} durationHint={talk.durationSec} preview /></div>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-stone-900">Summary</dt><dd className="mt-0.5 whitespace-pre-wrap text-stone-700">{talk.summary}</dd></div>
        <div><dt className="font-semibold text-stone-900">Speaking from</dt><dd className="mt-0.5 whitespace-pre-wrap text-stone-700">{talk.experience}</dd></div>
        <div><dt className="font-semibold text-stone-900">Takeaways</dt><dd className="mt-0.5 text-stone-700">{talk.keyTakeaways.length ? talk.keyTakeaways.map((k, i) => <span key={i} className="block">· {k}</span>) : 'None'}</dd></div>
        <div><dt className="font-semibold text-stone-900">Discussion question</dt><dd className="mt-0.5 text-stone-700">{talk.discussionPrompt || 'None'}</dd></div>
        <div><dt className="font-semibold text-stone-900">Who can watch</dt><dd className="mt-0.5 text-stone-700">{talk.visibility === 'public' ? `Anyone with the link${talk.publicConsent ? ' (speaker agreed to public viewing)' : ' (no consent recorded)'}` : 'BeWatu members'}</dd></div>
        <div><dt className="font-semibold text-stone-900">Extras</dt><dd className="mt-0.5 text-stone-700">{[talk.captionsVtt ? 'Captions' : '', talk.transcript ? 'Transcript' : '', talk.thumbnailUrl ? 'Thumbnail' : ''].filter(Boolean).join(', ') || 'None'}</dd></div>
      </dl>
      {review && review.history.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-semibold text-stone-800">History</summary>
          <ul className="mt-2 space-y-1 text-stone-700">{review.history.slice().reverse().map((h, i) => <li key={i}>{new Date(h.atMs).toLocaleString()} · {h.action}{h.note ? `: ${h.note}` : ''}</li>)}</ul>
        </details>
      )}
      <div>
        <label htmlFor={'note-' + talk.id} className="mb-1 block text-sm font-semibold text-stone-900">Note to the speaker <span className="font-normal text-stone-500">Needed to ask for changes, decline or take down</span></label>
        <textarea id={'note-' + talk.id} rows={2} maxLength={500} value={note} onChange={e => { setNote(e.target.value); setError(''); }} className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2" />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {talk.status === 'submitted' && <button type="button" disabled={!!busy} onClick={() => go('under_review')} className={btn}>Start review</button>}
        {waiting && <button type="button" disabled={!!busy} onClick={() => go('published')} className={primary}>{busy === 'published' ? 'Publishing…' : 'Publish'}</button>}
        {waiting && <button type="button" disabled={!!busy} onClick={() => go('draft', true)} className={btn}>Ask for changes</button>}
        {waiting && <button type="button" disabled={!!busy} onClick={() => go('rejected', true)} className={btn + ' !text-red-700'}>Decline</button>}
        {talk.status === 'published' && <button type="button" disabled={!!busy} onClick={() => go('unpublished', true)} className={btn}>Take down</button>}
        {talk.status === 'unpublished' && <button type="button" disabled={!!busy} onClick={() => go('published')} className={primary}>Put back live</button>}
        {(talk.status === 'published' || talk.status === 'unpublished' || waiting) && <button type="button" disabled={!!busy} onClick={() => { if (window.confirm('Archive this Talk? It cannot be brought back.')) go('archived'); }} className={btn}>Archive</button>}
        {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-stone-500" aria-label="Working" />}
      </div>
    </div>
  );
};

export const TalkReviewView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('waiting');
  const [talks, setTalks] = useState<Talk[] | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(''); setTalks(null); setRows(null); setOpen(null);
    try {
      if (tab === 'waiting' || tab === 'live') setTalks(await fetchAdminTalks(tab === 'live' ? 'published' : 'waiting'));
      else if (tab === 'requests') setRows((await talksApi({ action: 'admin_list', kind: 'requests' })).items);
      else if (tab === 'suggestions') setRows((await talksApi({ action: 'admin_list', kind: 'suggestions' })).items);
      else { const s = await getDocs(query(collection(db, 'users'), where('bridgeContributor', '==', true), limit(100))); setRows(s.docs.map(d => ({ id: d.id, name: d.data().displayName ?? 'Member', headline: d.data().headline ?? '' }))); }
    } catch (e: any) { setError(e?.message ?? 'We could not load this list.'); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setError('');
    try { await talksApi(body); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-stone-900">Bridge Talks</h2>
      <p className="mt-0.5 text-sm text-stone-600">Watch each Talk before it goes live. A speaker is told what you decide.</p>
      <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)} className={'min-h-[44px] flex-shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-semibold ' + (tab === t.id ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-stone-600 hover:text-stone-800')}>{t.label}</button>)}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="mt-4">
        {!error && talks === null && rows === null && <div className="h-24 animate-pulse rounded-xl bg-stone-100" role="status" aria-label="Loading" />}

        {talks && talks.length === 0 && <p className="rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-600">{tab === 'waiting' ? 'Nothing is waiting for review.' : 'No Talks are live.'}</p>}
        {talks && talks.length > 0 && (
          <ul className="space-y-3">
            {talks.map(t => (
              <li key={t.id} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <div className="w-28 flex-shrink-0 sm:w-40"><Thumb talk={t} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-stone-600">{STATUS_LABEL[t.status]} · {ago(t.updatedAt)} · {categoryLabel(t.category)} · {formatDuration(t.durationSec)}</p>
                    <h3 className="mt-0.5 font-semibold text-stone-900">{t.title}</h3>
                    <div className="mt-1.5"><Speaker talk={t} /></div>
                  </div>
                  <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} className={btn}>{open === t.id ? 'Close' : 'Review'}</button>
                </div>
                {open === t.id && <Detail talk={t} onDone={load} />}
              </li>
            ))}
          </ul>
        )}

        {rows && rows.length === 0 && <p className="rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-600">{tab === 'requests' ? 'No requests waiting.' : tab === 'suggestions' ? 'No new suggestions.' : 'Nobody has been given access yet.'}</p>}
        {rows && rows.length > 0 && tab === 'requests' && (
          <ul className="space-y-3">{rows.map(r => (
            <li key={r.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="font-semibold text-stone-900">{r.name}</p>{r.headline && <p className="text-sm text-stone-600">{r.headline}</p>}
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-800">{r.expertise}</p>
              {r.topics?.length > 0 && <p className="mt-1 text-xs text-stone-600">Topics: {r.topics.map(categoryLabel).join(', ')}</p>}
              <input aria-label={`Reason, if declining ${r.name}`} placeholder="A kind reason, needed to decline" value={note[r.id] ?? ''} onChange={e => setNote(n => ({ ...n, [r.id]: e.target.value }))} className="mt-3 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2" />
              <div className="mt-2 flex gap-2"><button type="button" disabled={!!busy} className={primary} onClick={() => act(r.id, { action: 'resolve_request', uid: r.id, decision: 'approve' })}>Approve</button><button type="button" disabled={!!busy} className={btn} onClick={() => act(r.id, { action: 'resolve_request', uid: r.id, decision: 'decline', note: note[r.id] ?? '' })}>Decline</button></div>
            </li>))}</ul>
        )}
        {rows && rows.length > 0 && tab === 'contributors' && (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">{rows.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="min-w-0"><span className="block truncate font-semibold text-stone-900">{r.name}</span><span className="block truncate text-sm text-stone-600">{r.headline}</span></span>
              <button type="button" disabled={!!busy} className={btn} onClick={() => { if (window.confirm(`Withdraw ${r.name}'s access to share Talks? Their published Talks stay as they are.`)) act(r.id, { action: 'revoke_contributor', uid: r.id }); }}>Withdraw access</button></li>))}</ul>
        )}
        {rows && rows.length > 0 && tab === 'suggestions' && (
          <ul className="space-y-3">{rows.map(r => (
            <li key={r.id} className="rounded-xl border border-stone-200 bg-white p-4"><p className="font-semibold text-stone-900">{r.name}{r.topic ? <span className="ml-2 text-xs font-normal text-stone-600">{categoryLabel(r.topic)}</span> : null}</p><p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{r.why}</p>
              <button type="button" disabled={!!busy} className={btn + ' mt-3'} onClick={() => act(r.id, { action: 'resolve_suggestion', id: r.id })}>Mark as seen</button></li>))}</ul>
        )}
      </div>
    </div>
  );
};

export default TalkReviewView;
