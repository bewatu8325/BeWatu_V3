/**
 * components/bridge/ShareTalkFlow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Share a Bridge Talk" in three steps: Upload, Describe, Preview & submit. Opened as a sheet (a full-height sheet on a phone, a
 * wide dialog on a laptop) by requestIntent('share-talk'), or to continue a draft.
 *
 * The browser checks the file before uploading (type, size, that it can be played, how long it is), shows real progress, and lets
 * the speaker cancel and retry. A draft is saved on the server as soon as there is a video, and again at each step, so nothing is
 * lost by closing the sheet. Submitting sends it to a BeWatu reviewer; it is not published by the speaker.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';
import TalkPlayer from './TalkPlayer';
import { Speaker } from './TalkCard';
import { UploadIcon } from '../icons/BridgeIcons';
import {
  CATEGORIES, LIMITS, categoryLabel, emptyDraft, fileProblem, firstProblem, formatDuration, lengthNote, problems, type Draft, type Talk,
} from '../../lib/bridgeTalks';
import { readVideoMeta, talksApi, uploadAsset, type Upload } from '../../lib/bridgeTalksService';
import { captureVideoThumbnail } from '../../lib/storageService';

const GREEN = 'var(--bw-green)';
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const input = 'block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-[15px] text-stone-900 placeholder:text-stone-500 ' + FOCUS;

type Step = 0 | 1 | 2;
const STEPS = ['Upload', 'Describe', 'Preview & submit'];

interface Props {
  open: boolean; onClose: () => void; uid: string;
  speaker: { name: string; headline?: string | null; avatarUrl?: string | null };
  /** Continue this draft instead of starting a new Talk. */
  talk?: Talk | null;
  /** Called after anything is saved or submitted, so lists can refresh. */
  onChanged: (id: string, status: 'draft' | 'submitted') => void;
}

const fromTalk = (t: Talk): Draft => ({
  title: t.title, summary: t.summary, experience: t.experience, category: t.category, keyTakeaways: t.keyTakeaways, discussionPrompt: t.discussionPrompt,
  transcript: t.transcript, captionsVtt: t.captionsVtt, visibility: t.visibility, publicConsent: t.publicConsent, videoUrl: t.videoUrl, thumbnailUrl: t.thumbnailUrl, durationSec: t.durationSec,
});

const Field: React.FC<{ id: string; label: string; hint?: string; error?: string; optional?: boolean; children: React.ReactNode }> = ({ id, label, hint, error, optional, children }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-stone-900">{label}{optional && <span className="ml-1.5 font-normal text-stone-500">Optional</span>}</label>
    {children}
    {hint && !error && <p id={id + '-hint'} className="mt-1.5 text-xs leading-relaxed text-stone-600">{hint}</p>}
    {error && <p id={id + '-err'} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{error}</p>}
  </div>
);

export const ShareTalkFlow: React.FC<Props> = ({ open, onClose, uid, speaker, talk, onChanged }) => {
  const [step, setStep] = useState<Step>(0);
  const [d, setD] = useState<Draft>(emptyDraft());
  const [id, setId] = useState<string | null>(null);
  const [session] = useState(() => Math.random().toString(36).slice(2, 10));
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'uploading' | 'done' | 'error'>('idle');
  const [fileError, setFileError] = useState('');
  const [thumbs, setThumbs] = useState<{ blob: Blob; url: string }[]>([]);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'submit' | 'delete'>('');
  const [serverError, setServerError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState<'draft' | 'submitted' | null>(null);
  const up = useRef<Upload | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Each opening starts clean, or from the draft being continued.
  useEffect(() => {
    if (!open) return;
    up.current?.cancel();
    setStep(talk ? 1 : 0); setD(talk ? fromTalk(talk) : emptyDraft()); setId(talk?.id ?? null); setFile(null); setPct(0); setPhase(talk?.videoUrl ? 'done' : 'idle');
    setFileError(''); setThumbs([]); setPick(null); setServerError(''); setShowErrors(false); setDirty(false); setDone(null); setBusy('');
  }, [open, talk]);
  useEffect(() => () => { thumbs.forEach(t => URL.revokeObjectURL(t.url)); }, [thumbs]);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD(p => ({ ...p, [k]: v })); setDirty(true); };
  const errs = useMemo(() => problems(d, step === 2 || showErrors), [d, step, showErrors]);
  const note = lengthNote(d.durationSec);

  // ── step 1: the file ──
  const chooseFile = useCallback(async (f: File | null | undefined) => {
    if (!f) return;
    setFileError('');
    const bad = fileProblem(f, 'video'); if (bad) { setFileError(bad); return; }
    setFile(f); setPhase('checking'); setPct(0);
    let meta: { durationSec: number };
    try { meta = await readVideoMeta(f); }
    catch { setPhase('error'); setFileError('Your browser cannot play this file, so viewers may not be able to either. Export it as an MP4 (H.264 video, AAC audio) and choose it again.'); return; }
    if (meta.durationSec < LIMITS.minSec || meta.durationSec > LIMITS.maxSec) { setPhase('error'); setFileError(`This video is ${formatDuration(meta.durationSec)}. A Talk is between ${formatDuration(LIMITS.minSec)} and ${formatDuration(LIMITS.maxSec)}.`); return; }
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(URL.createObjectURL(f));
    setPhase('uploading');
    // a few stills to choose a thumbnail from, while the upload runs
    setThumbBusy(true);
    Promise.all([0.1, 0.4, 0.7].map(p => captureVideoThumbnail(f, Math.max(1, meta.durationSec * p)))).then(bs => {
      setThumbs(bs.filter((b): b is Blob => !!b).map(blob => ({ blob, url: URL.createObjectURL(blob) })));
    }).finally(() => setThumbBusy(false));
    const u = uploadAsset(uid, session, f, 'video', setPct); up.current = u;
    try {
      const url = await u.promise;
      setD(p => ({ ...p, videoUrl: url, durationSec: meta.durationSec })); setDirty(true); setPhase('done'); setPct(100);
    } catch (e: any) {
      setPhase('error'); setFileError(e?.code === 'storage/canceled' ? 'Upload cancelled.' : e?.code === 'storage/unauthorized' ? 'You are not able to upload here. Contact BeWatu if this keeps happening.' : 'The upload stopped. Check your connection and try again; nothing was lost.');
    }
  }, [uid, session, localUrl]);

  const cancelUpload = () => { up.current?.cancel(); setPhase('idle'); setFile(null); setPct(0); };
  const pickThumb = async (blob: Blob | File) => {
    setThumbBusy(true); setFileError('');
    try { const url = await uploadAsset(uid, session, blob, 'thumb', () => {}).promise; set('thumbnailUrl', url); }
    catch { setFileError('The thumbnail did not upload. Try again.'); }
    finally { setThumbBusy(false); }
  };
  const ownThumb = (f: File | undefined) => { if (!f) return; setPick(null); const bad = fileProblem(f, 'image'); if (bad) { setFileError(bad); return; } pickThumb(f); };
  const readCaptions = async (f: File | undefined) => {
    if (!f) return; const text = (await f.text()).replace(/\r\n?/g, '\n');
    if (!/^﻿?WEBVTT/.test(text)) { setFileError('Captions must be a WebVTT (.vtt) file. Most editing tools can export one.'); return; }
    if (text.length > LIMITS.captions) { setFileError('That captions file is too large.'); return; }
    setFileError(''); set('captionsVtt', text);
  };

  // ── saving ──
  const save = async (): Promise<string | null> => {
    setServerError('');
    try {
      const r = await talksApi<{ id: string }>({ action: 'save', ...(id ? { id } : {}), ...d });
      setId(r.id); setDirty(false); onChanged(r.id, 'draft'); return r.id;
    } catch (e: any) { setServerError(e.message); return null; }
  };
  const next = async () => {
    if (step === 0) { if (phase !== 'done') return; setBusy('save'); const ok = await save(); setBusy(''); if (ok) setStep(1); return; }
    if (step === 1) {
      setShowErrors(true);
      const blocking = problems(d, true); if (firstProblem(blocking)) return;
      setBusy('save'); const ok = await save(); setBusy(''); if (ok) { setStep(2); setShowErrors(false); }
    }
  };
  const saveDraftAndClose = async () => { setBusy('save'); const ok = await save(); setBusy(''); if (ok) { setDone('draft'); } };
  const submit = async () => {
    setBusy('submit'); setServerError('');
    try {
      const saved = dirty || !id ? await save() : id; if (!saved) { setBusy(''); return; }
      await talksApi({ action: 'transition', id: saved, to: 'submitted' });
      onChanged(saved, 'submitted'); setDone('submitted');
    } catch (e: any) { setServerError(e.message); }
    finally { setBusy(''); }
  };
  const discard = async () => {
    if (!id) { onClose(); return; }
    if (!window.confirm('Delete this draft? The video and everything you wrote will be removed.')) return;
    setBusy('delete');
    try { await talksApi({ action: 'delete', id }); onChanged(id, 'draft'); onClose(); } catch (e: any) { setServerError(e.message); } finally { setBusy(''); }
  };
  const close = () => {
    if (phase === 'uploading' && !window.confirm('Your video is still uploading. Close and cancel the upload?')) return;
    if (dirty && !done && !window.confirm('You have changes that are not saved. Close without saving?')) return;
    up.current?.cancel(); onClose();
  };

  // ── pieces ──
  const stepper = (
    <ol className="mb-5 flex items-center gap-2 text-[13px]" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
          <span className={'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ' + (i < step ? 'text-white' : i === step ? 'text-white' : 'bg-stone-200 text-stone-600')} style={i <= step ? { backgroundColor: GREEN } : undefined}>{i < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}</span>
          <span className={i === step ? 'font-semibold text-stone-900' : 'text-stone-600'}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-5 bg-stone-300 sm:block" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );

  const primary = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-50 ' + FOCUS;
  const secondary = 'inline-flex min-h-[48px] items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 ' + FOCUS;

  const footer = done ? (
    <div className="flex justify-end"><button type="button" onClick={onClose} className={primary} style={{ backgroundColor: GREEN, ...ring }}>Done</button></div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
      <button type="button" onClick={step === 0 ? close : () => setStep((step - 1) as Step)} disabled={!!busy} className={secondary + (step === 2 ? ' hidden sm:inline-flex' : '')} style={ring}>{step === 0 ? 'Cancel' : 'Back'}</button>
      <div className="flex flex-wrap items-center gap-2">
        {step > 0 && <button type="button" onClick={saveDraftAndClose} disabled={!!busy || phase !== 'done'} className={secondary} style={ring}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>}
        {step < 2
          ? <button type="button" onClick={next} disabled={!!busy || (step === 0 && phase !== 'done')} className={primary} style={{ backgroundColor: GREEN, ...ring }}>{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Continue</button>
          : <button type="button" onClick={submit} disabled={!!busy || !!firstProblem(problems(d, true))} className={primary} style={{ backgroundColor: GREEN, ...ring }}>{busy === 'submit' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Submit for review</button>}
      </div>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={close} title="Share a Bridge Talk" allWidths size="xl" footer={footer}>
      {done ? (
        <div className="px-1 py-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bw-green-light)', color: GREEN }}><Check className="h-7 w-7" aria-hidden="true" /></span>
          <h2 className="mt-4 font-serif text-2xl font-semibold text-stone-900">{done === 'submitted' ? 'Your Talk is with a reviewer' : 'Draft saved'}</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-stone-600">
            {done === 'submitted' ? 'A BeWatu reviewer will watch it. We will let you know here as soon as it is live, or if we would like a change. Nothing is visible to members until then.' : 'It is saved to Your Talks. Only you can see it. Come back whenever you are ready.'}
          </p>
        </div>
      ) : (
        <div className="pb-2">
          {stepper}
          {serverError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{serverError}</div>}

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900">Upload your Talk</h2>
                <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-stone-600">One clear lesson, told in your own words. Most Talks run 8 to 15 minutes. MP4, MOV or WebM, up to {LIMITS.maxVideoBytes / 1048576} MB.</p>
              </div>
              {phase === 'idle' || phase === 'error' ? (
                <div>
                  <input ref={picker} type="file" accept={LIMITS.videoTypes.join(',')} className="sr-only" id="talk-file" onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
                  <label htmlFor="talk-file" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }}
                    className="flex min-h-[170px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 text-center transition-colors hover:border-stone-400 hover:bg-white focus-within:ring-2" style={ring}>
                    <UploadIcon className="h-8 w-8" style={{ color: GREEN }} />
                    <span className="text-[15px] font-semibold text-stone-900">Choose a video</span>
                    <span className="text-sm text-stone-600">or drop it here</span>
                  </label>
                </div>
              ) : (
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-900">{file?.name ?? 'Your video'}</p><p className="text-xs text-stone-600">{phase === 'checking' ? 'Checking the file…' : phase === 'uploading' ? `Uploading · ${pct}%` : `Uploaded · ${formatDuration(d.durationSec)}`}</p></div>
                    {phase === 'uploading' && <button type="button" onClick={cancelUpload} className={'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-stone-300 px-3.5 text-sm font-semibold ' + FOCUS} style={ring}><X className="h-4 w-4" aria-hidden="true" />Cancel</button>}
                    {phase === 'done' && <button type="button" onClick={() => { setPhase('idle'); setFile(null); set('videoUrl', ''); set('thumbnailUrl', null); }} className={'min-h-[40px] rounded-full border border-stone-300 px-3.5 text-sm font-semibold ' + FOCUS} style={ring}>Replace</button>}
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="h-full rounded-full transition-[width] motion-reduce:transition-none" style={{ width: pct + '%', backgroundColor: GREEN }} /></div>
                  {phase === 'checking' && <p className="mt-3 flex items-center gap-2 text-sm text-stone-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />One moment</p>}
                </div>
              )}
              {fileError && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{fileError}</p>}
              {note && phase === 'done' && <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700" role="note">{note}</p>}

              {(thumbs.length > 0 || phase === 'done') && (
                <fieldset>
                  <legend className="text-sm font-semibold text-stone-900">Thumbnail</legend>
                  <p className="mt-1 text-xs text-stone-600">Pick a still from your video, or upload your own. If you skip this, a plain green card is used.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {thumbs.map((t, i) => (
                      <button key={t.url} type="button" onClick={() => { setPick(i); pickThumb(t.blob); }} disabled={thumbBusy} aria-pressed={pick === i && !!d.thumbnailUrl} aria-label={`Use still ${i + 1} as the thumbnail`} className={'relative aspect-video overflow-hidden rounded-lg border-2 ' + FOCUS} style={{ borderColor: pick === i && d.thumbnailUrl ? GREEN : '#e7e5e4', ...ring }}>
                        <img src={t.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    <label className={'flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 text-center text-xs font-semibold text-stone-700 focus-within:ring-2 ' + (thumbBusy ? 'opacity-60' : '')} style={ring}>
                      <input type="file" accept={LIMITS.imageTypes.join(',')} className="sr-only" onChange={e => { ownThumb(e.target.files?.[0]); e.target.value = ''; }} disabled={thumbBusy} />
                      {thumbBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UploadIcon className="h-5 w-5" />}Upload your own
                    </label>
                  </div>
                  {d.thumbnailUrl && <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: GREEN }}><Check className="h-4 w-4" aria-hidden="true" />Thumbnail chosen <button type="button" onClick={() => { setPick(null); set('thumbnailUrl', null); }} className="ml-1 text-xs font-semibold text-stone-600 underline">Remove</button></p>}
                </fieldset>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div><h2 className="font-serif text-xl font-semibold text-stone-900">Tell members what to expect</h2><p className="mt-1 text-[15px] text-stone-600">Be specific. A clear lesson is easier to find, and easier to discuss.</p></div>
              <Field id="t-title" label="Title" hint={`${d.title.length}/${LIMITS.title}. One lesson, in plain words.`} error={errs.title}>
                <input id="t-title" className={input} style={ring} value={d.title} maxLength={LIMITS.title + 20} onChange={e => set('title', e.target.value)} placeholder="What 30 years of leadership taught me about people" aria-invalid={!!errs.title} aria-describedby={errs.title ? 't-title-err' : 't-title-hint'} />
              </Field>
              <Field id="t-summary" label="Short summary" hint={`${d.summary.length}/${LIMITS.summary}. What will someone take away?`} error={errs.summary}>
                <textarea id="t-summary" rows={4} className={input} style={ring} value={d.summary} maxLength={LIMITS.summary + 40} onChange={e => set('summary', e.target.value)} aria-invalid={!!errs.summary} aria-describedby={errs.summary ? 't-summary-err' : 't-summary-hint'} />
              </Field>
              <Field id="t-category" label="Topic" error={errs.category}>
                <select id="t-category" className={input} style={ring} value={d.category} onChange={e => set('category', e.target.value)} aria-invalid={!!errs.category}>
                  <option value="">Choose a topic</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field id="t-exp" label="The experience you are speaking from" hint={`${d.experience.length}/${LIMITS.experience}. Roles, years, results: whatever gives members a reason to trust what you say.`} error={errs.experience}>
                <textarea id="t-exp" rows={3} className={input} style={ring} value={d.experience} maxLength={LIMITS.experience + 40} onChange={e => set('experience', e.target.value)} aria-invalid={!!errs.experience} aria-describedby={errs.experience ? 't-exp-err' : 't-exp-hint'} />
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-stone-900">Key takeaways <span className="ml-1.5 font-normal text-stone-500">Optional, up to {LIMITS.takeaways}</span></legend>
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <input key={i} aria-label={`Takeaway ${i + 1}`} className={input} style={ring} value={d.keyTakeaways[i] ?? ''} maxLength={LIMITS.takeaway + 10} placeholder={i === 0 ? 'Listen before you decide' : ''}
                      onChange={e => { const a = [0, 1, 2].map(j => (j === i ? e.target.value : d.keyTakeaways[j] ?? '')); while (a.length && !a[a.length - 1]) a.pop(); set('keyTakeaways', a); }} />
                  ))}
                </div>
                {errs.keyTakeaways && <p role="alert" className="mt-1.5 text-sm text-red-700">{errs.keyTakeaways}</p>}
              </fieldset>
              <Field id="t-q" label="A question for the discussion" optional hint="Shown above the conversation. A good one invites people to share their own experience." error={errs.discussionPrompt}>
                <input id="t-q" className={input} style={ring} value={d.discussionPrompt} maxLength={LIMITS.question + 20} onChange={e => set('discussionPrompt', e.target.value)} placeholder="What did your best manager do differently?" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="t-cap" label="Captions" optional hint="A WebVTT (.vtt) file. Captions make your Talk watchable without sound." error={errs.captionsVtt}>
                  <div className="flex items-center gap-2">
                    <input id="t-cap" type="file" accept=".vtt,text/vtt" className={input + ' file:mr-3 file:rounded-full file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold'} style={ring} onChange={e => { readCaptions(e.target.files?.[0]); e.target.value = ''; }} />
                  </div>
                  {d.captionsVtt && <p className="mt-1.5 flex items-center gap-2 text-sm" style={{ color: GREEN }}><Check className="h-4 w-4" aria-hidden="true" />Captions added <button type="button" onClick={() => set('captionsVtt', '')} className="text-xs font-semibold text-stone-600 underline">Remove</button></p>}
                </Field>
                <Field id="t-tr" label="Transcript" optional hint="Plain text, shown under the video." error={errs.transcript}>
                  <textarea id="t-tr" rows={3} className={input} style={ring} value={d.transcript} maxLength={LIMITS.transcript} onChange={e => set('transcript', e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div><h2 className="font-serif text-xl font-semibold text-stone-900">Preview, then submit</h2><p className="mt-1 text-[15px] text-stone-600">This is how members will see it. A BeWatu reviewer watches every Talk before it goes live.</p></div>
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-3">
                <TalkPlayer talkId={'preview-' + session} src={d.videoUrl} poster={d.thumbnailUrl ?? undefined} captionsVtt={d.captionsVtt} title={d.title} durationHint={d.durationSec} preview />
                <div className="px-1 pb-2 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: GREEN }}>{categoryLabel(d.category)} · {formatDuration(d.durationSec)}</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold leading-tight text-stone-900">{d.title}</h3>
                  <div className="mt-3"><Speaker talk={{ speakerName: speaker.name, speakerHeadline: speaker.headline ?? '', speakerAvatar: speaker.avatarUrl ?? null }} size="md" /></div>
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">{d.summary}</p>
                  {d.keyTakeaways.length > 0 && <ul className="mt-3 space-y-1.5">{d.keyTakeaways.map((k, i) => <li key={i} className="flex gap-2 text-[15px] text-stone-800"><Check className="mt-1 h-4 w-4 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" />{k}</li>)}</ul>}
                  {d.discussionPrompt && <p className="mt-4 rounded-lg px-3 py-2 text-sm text-stone-800" style={{ backgroundColor: 'var(--bw-green-light)' }}><span className="font-semibold">Discussion question: </span>{d.discussionPrompt}</p>}
                </div>
              </div>
              <button type="button" onClick={() => setStep(1)} className={'text-sm font-semibold underline ' + FOCUS} style={{ color: GREEN, ...ring }}>Edit the details</button>

              <fieldset className="rounded-2xl border border-stone-200 bg-white p-4">
                <legend className="px-1 text-sm font-semibold text-stone-900">Who can watch</legend>
                <div className="mt-1 space-y-3">
                  <label className="flex cursor-pointer items-start gap-3"><input type="radio" name="vis" checked={d.visibility === 'members'} onChange={() => { set('visibility', 'members'); set('publicConsent', false); }} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-semibold text-stone-900">BeWatu members</span><span className="block text-sm text-stone-600">Members sign in to watch and join the conversation. Recommended.</span></span></label>
                  <label className="flex cursor-pointer items-start gap-3"><input type="radio" name="vis" checked={d.visibility === 'public'} onChange={() => set('visibility', 'public')} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-semibold text-stone-900">Anyone with the link</span><span className="block text-sm text-stone-600">Your Talk gets a public page that can be watched without an account, and can be found by search engines. The conversation stays with members.</span></span></label>
                  {d.visibility === 'public' && (
                    <label className="ml-7 flex cursor-pointer items-start gap-3 rounded-xl bg-stone-50 p-3"><input type="checkbox" checked={d.publicConsent} onChange={e => set('publicConsent', e.target.checked)} className="mt-1 h-4 w-4" aria-describedby="consent-err" /><span className="text-sm leading-relaxed text-stone-800">I agree that my name, photo, headline, this video and its summary can be shown publicly, on the web and in link previews.</span></label>
                  )}
                  {errs.publicConsent && <p id="consent-err" role="alert" className="ml-7 text-sm text-red-700">{errs.publicConsent}</p>}
                </div>
              </fieldset>
              {id && <button type="button" onClick={discard} disabled={!!busy} className="text-sm font-semibold text-red-700 underline disabled:opacity-50">Delete this draft</button>}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
};

export default ShareTalkFlow;
