/**
 * components/bridge/BecomeSpeaker.tsx
 * Bridge Talks are curated: a member can ask to share Talks, or suggest someone they would like to hear from. Both go to BeWatu's
 * reviewers (api/bridge-talks.ts). What counts is what someone knows and can teach, not their age or title, and the form says so.
 */
import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';
import { CATEGORIES } from '../../lib/bridgeTalks';
import { fetchMe, talksApi, type Me } from '../../lib/bridgeTalksService';

const GREEN = 'var(--bw-green)';
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const input = 'block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-[15px] text-stone-900 placeholder:text-stone-500 ' + FOCUS;

interface Props { open: boolean; onClose: () => void; initialTab?: 'ask' | 'suggest' }

export const BecomeSpeaker: React.FC<Props> = ({ open, onClose, initialTab = 'ask' }) => {
  const [tab, setTab] = useState<'ask' | 'suggest'>(initialTab);
  const [me, setMe] = useState<Me | null>(null);
  const [expertise, setExpertise] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [name, setName] = useState(''); const [why, setWhy] = useState(''); const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState<'' | 'ask' | 'suggest'>('');

  useEffect(() => { if (!open) return; setTab(initialTab); setError(''); setSent(''); fetchMe(true).then(setMe).catch(() => setMe(null)); }, [open, initialTab]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (tab === 'ask') { await talksApi({ action: 'request_access', expertise, topics }); await fetchMe(true).then(setMe).catch(() => {}); setSent('ask'); }
      else { await talksApi({ action: 'suggest_speaker', name, why, topic: topic || undefined }); setSent('suggest'); setName(''); setWhy(''); }
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const pending = me?.request?.status === 'pending';
  return (
    <BottomSheet open={open} onClose={onClose} title="Bridge Talks" allWidths>
      <div className="pb-2">
        <div role="tablist" aria-label="What would you like to do" className="mb-5 flex gap-1 rounded-full bg-stone-100 p-1">
          {([['ask', 'Share your own Talk'], ['suggest', 'Suggest a speaker']] as const).map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => { setTab(id); setSent(''); setError(''); }} className={'min-h-[44px] flex-1 rounded-full px-3 text-sm font-semibold ' + FOCUS + (tab === id ? ' bg-white text-stone-900 shadow-sm' : ' text-stone-600')} style={ring}>{label}</button>
          ))}
        </div>

        {sent ? (
          <div className="py-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bw-green-light)', color: GREEN }}><Check className="h-6 w-6" aria-hidden="true" /></span>
            <h2 className="mt-3 font-serif text-xl font-semibold text-stone-900">{sent === 'ask' ? 'Thank you. We have your request.' : 'Thank you for the suggestion'}</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-[15px] leading-relaxed text-stone-600">{sent === 'ask' ? 'A BeWatu reviewer will read it and we will let you know here.' : 'We read every one. If we reach out to them, we will not share who suggested it.'}</p>
            <button type="button" onClick={onClose} className={'mt-5 min-h-[48px] rounded-full px-6 text-sm font-bold text-white ' + FOCUS} style={{ backgroundColor: GREEN, ...ring }}>Done</button>
          </div>
        ) : tab === 'ask' && me?.contributor ? (
          <p className="rounded-xl bg-stone-50 px-4 py-4 text-[15px] text-stone-700">You can already share Talks. Choose Share a Bridge Talk from the Create menu.</p>
        ) : tab === 'ask' && pending ? (
          <p className="rounded-xl bg-amber-50 px-4 py-4 text-[15px] text-stone-800" role="status">Your request is with a reviewer. We will let you know as soon as there is news.</p>
        ) : (
          <form onSubmit={send} className="space-y-4">
            {tab === 'ask' ? (
              <>
                <p className="text-[15px] leading-relaxed text-stone-600">Bridge Talks are short videos where people share what they have learned. We invite contributors so every Talk is worth a member's time. We look at what you know and can teach, not your age or your title.</p>
                {me?.request?.status === 'declined' && <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700" role="status">Last time: {me.request.note || 'we were not able to say yes.'} You are welcome to ask again.</p>}
                <div>
                  <label htmlFor="bs-exp" className="mb-1.5 block text-sm font-semibold text-stone-900">What experience would you speak from?</label>
                  <textarea id="bs-exp" required minLength={20} maxLength={600} rows={4} className={input} style={ring} value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="For example: 25 years in hospital operations. I would talk about running a ward when everything is on fire." />
                  <p className="mt-1 text-xs text-stone-600">{expertise.length}/600</p>
                </div>
                <fieldset><legend className="mb-1.5 text-sm font-semibold text-stone-900">Topics <span className="font-normal text-stone-500">Up to 3</span></legend>
                  <div className="flex flex-wrap gap-2">{CATEGORIES.map(c => { const on = topics.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} disabled={!on && topics.length >= 3} onClick={() => setTopics(t => on ? t.filter(x => x !== c.id) : [...t, c.id])} className={'min-h-[40px] rounded-full border px-3.5 text-sm font-semibold disabled:opacity-40 ' + FOCUS} style={{ borderColor: on ? GREEN : '#d6d3d1', backgroundColor: on ? 'var(--bw-green-light)' : '#fff', color: on ? GREEN : '#44403c', ...ring }}>{c.label}</button>; })}</div>
                </fieldset>
              </>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-stone-600">Know someone whose experience others should hear? Tell us who and what they could teach.</p>
                <div><label htmlFor="bs-name" className="mb-1.5 block text-sm font-semibold text-stone-900">Who?</label><input id="bs-name" required minLength={2} maxLength={80} className={input} style={ring} value={name} onChange={e => setName(e.target.value)} placeholder="Name, and where to find them if you know" /></div>
                <div><label htmlFor="bs-why" className="mb-1.5 block text-sm font-semibold text-stone-900">What could they teach?</label><textarea id="bs-why" required minLength={10} maxLength={500} rows={3} className={input} style={ring} value={why} onChange={e => setWhy(e.target.value)} /><p className="mt-1 text-xs text-stone-600">{why.length}/500</p></div>
                <div><label htmlFor="bs-topic" className="mb-1.5 block text-sm font-semibold text-stone-900">Topic <span className="font-normal text-stone-500">Optional</span></label><select id="bs-topic" className={input} style={ring} value={topic} onChange={e => setTopic(e.target.value)}><option value="">Not sure</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
              </>
            )}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className={'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-white disabled:opacity-60 ' + FOCUS} style={{ backgroundColor: GREEN, ...ring }}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{tab === 'ask' ? 'Send my request' : 'Send suggestion'}</button>
          </form>
        )}
      </div>
    </BottomSheet>
  );
};

export default BecomeSpeaker;
