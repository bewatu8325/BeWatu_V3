/**
 * components/share/ShareMyWork.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Share my work": choose what to show, preview it exactly as it will look, then share it. Three steps: Customize → Preview → Share.
 * On a wide screen the preview sits beside the choices and updates as you go; on a phone it is its own step.
 *
 * The preview is the real page: the server draws it from your own records (api/portfolio.ts), and it is shown here in a sandboxed
 * frame, so what you approve is what people get. The page needs no sign-in. An unlisted link can be opened by anyone who has it, and
 * this screen says so wherever a link is made.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Loader2, Mail, Plus, Share2, X } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';
import { ShareWorkIcon } from '../icons/NavIcons';
import {
  EXPIRIES, SECTION_HINT, SECTION_KEYS, SECTION_LABEL, defaultConfig, describeShare, describeViews, mailtoFor, move, moveSection, portfolio, printUrl, problem, toggleSection, togglePick,
  type ContactMode, type ItemSection, type SectionKey, type ShareConfig, type ShareView, type Sources,
} from '../../lib/portfolio';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const RING = { ['--tw-ring-color' as any]: GREEN };
const STEPS = ['Customize', 'Preview', 'Share'] as const;
type Step = 0 | 1 | 2;

const useWide = () => {
  const q = typeof window !== 'undefined' ? window.matchMedia('(min-width: 900px)') : null;
  const [wide, setWide] = useState(!!q?.matches);
  useEffect(() => { if (!q) return; const f = () => setWide(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, [q]);
  return wide;
};

interface PickItem { id: string; title: string; sub?: string }
const iconBtn = 'flex h-11 w-11 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 disabled:opacity-30';

/** The chosen items in the order they will appear (move or remove each), then the rest to add. */
const PickList: React.FC<{ noun: string; items: PickItem[]; picked: string[]; onChange: (ids: string[]) => void; max?: number }> = ({ noun, items, picked, onChange, max = 12 }) => {
  const byId = new Map(items.map(i => [i.id, i]));
  const chosen = picked.map(id => byId.get(id)).filter(Boolean) as PickItem[];
  const rest = items.filter(i => !picked.includes(i.id));
  const full = picked.length >= max;
  return (
    <div className="mt-3 space-y-3">
      {chosen.length > 0 && (
        <ol className="space-y-1.5" aria-label={`Chosen ${noun}, in the order shown`}>
          {chosen.map((it, i) => (
            <li key={it.id} className="flex items-center gap-1 rounded-xl border bg-white pl-3" style={{ borderColor: '#d6e8e1' }}>
              <span className="min-w-0 flex-1 py-1.5"><span className="block truncate text-sm font-medium text-stone-900">{it.title}</span>{it.sub && <span className="block truncate text-xs text-stone-600">{it.sub}</span>}</span>
              <button type="button" className={iconBtn} style={RING} disabled={i === 0} onClick={() => onChange(move(picked, i, -1))} aria-label={`Move ${it.title} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className={iconBtn} style={RING} disabled={i === chosen.length - 1} onClick={() => onChange(move(picked, i, 1))} aria-label={`Move ${it.title} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className={iconBtn} style={RING} onClick={() => onChange(togglePick(picked, it.id, false))} aria-label={`Remove ${it.title}`}><X className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ol>
      )}
      {rest.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-600">{full ? `You can show up to ${max}` : `Add ${noun}`}</p>
          <ul className="space-y-1">
            {rest.map(it => (
              <li key={it.id} className="flex items-center gap-1 rounded-xl pl-3 hover:bg-stone-50">
                <span className="min-w-0 flex-1 py-1.5"><span className="block truncate text-sm text-stone-800">{it.title}</span>{it.sub && <span className="block truncate text-xs text-stone-600">{it.sub}</span>}</span>
                <button type="button" disabled={full} onClick={() => onChange(togglePick(picked, it.id, true, max))} className="flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:opacity-40" style={{ color: GREEN, ...RING }} aria-label={`Add ${it.title}`}><Plus className="h-4 w-4" aria-hidden="true" />Add</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length === 0 && <p className="text-sm text-stone-600">You don't have any {noun} to share yet.</p>}
    </div>
  );
};

interface Props { open: boolean; onClose: () => void; myName: string }

export const ShareMyWork: React.FC<Props> = ({ open, onClose, myName }) => {
  const wide = useWide();
  const [tab, setTab] = useState<'build' | 'links'>('build');
  const [step, setStep] = useState<Step>(0);
  const [src, setSrc] = useState<Sources | null>(null);
  const [srcError, setSrcError] = useState('');
  const [cfg, setCfg] = useState<ShareConfig | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<ShareView | null>(null);
  const [preview, setPreview] = useState<{ html: string } | { error: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [shares, setShares] = useState<ShareView[] | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';
  const reqId = useRef(0);

  const load = useCallback(async () => {
    setSrcError('');
    try {
      const s = await portfolio<Sources>({ action: 'sources' });
      setSrc(s);
      setCfg(c => c ?? { ...defaultConfig(s), label: '' });
    } catch (e: any) { setSrcError(e.message); }
  }, []);
  const loadShares = useCallback(async () => { try { setShares((await portfolio<{ shares: ShareView[] }>({ action: 'list' })).shares); } catch (e: any) { setNote({ ok: false, text: e.message }); } }, []);

  useEffect(() => { if (!open) return; setTab('build'); setStep(0); setDone(null); setError(''); setNote(null); setEditingId(null); setCfg(null); setPreview(null); void load(); void loadShares(); }, [open, load, loadShares]);

  const issue = cfg ? problem(cfg, src) : null;
  const showPreview = open && tab === 'build' && !!cfg && !!src && !done && (step === 1 || (wide && step === 0));
  useEffect(() => {
    if (!showPreview || !cfg || issue) { if (issue) setPreview(null); return; }
    const mine = ++reqId.current;
    setPreviewBusy(true);
    const t = setTimeout(async () => {
      try { const r = await portfolio<{ html: string }>({ action: 'preview', config: cfg }); if (mine === reqId.current) setPreview({ html: r.html }); }
      catch (e: any) { if (mine === reqId.current) setPreview({ error: e.message }); }
      finally { if (mine === reqId.current) setPreviewBusy(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [showPreview, cfg, issue]);

  const set = (patch: Partial<ShareConfig>) => setCfg(c => (c ? { ...c, ...patch } : c));
  const setPick = (k: ItemSection, ids: string[]) => setCfg(c => (c ? { ...c, selection: { ...c.selection, [k]: ids } } : c));
  const ordered: SectionKey[] = cfg ? [...cfg.sections.filter(s => s !== 'summary'), ...SECTION_KEYS.filter(k => k !== 'summary' && !cfg.sections.includes(k))] : [];

  const items = useMemo(() => src && ({
    skills: src.skills.map(s => ({ id: s.name, title: s.name, sub: `${src.levels[s.level]?.label ?? ''}${s.level === 'confirmed' ? ` · ${s.endorsers}` : ''}` })),
    projects: src.projects.map(p => ({ id: p.id, title: p.title, sub: p.summary })),
    arena: src.arena.map(a => ({ id: a.id, title: a.title, sub: `${a.outcome === 'winner' ? 'Selected as a winner' : a.outcome === 'shortlisted' ? 'Shortlisted' : 'Submitted'} · ${src.levels[a.level]?.label ?? ''}` })),
    reels: src.reels.map(r => ({ id: r.id, title: r.caption || 'Untitled reel', sub: r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : undefined })),
    achievements: src.achievements.map(a => ({ id: a.id, title: a.text, sub: `Confirmed by ${a.verifier}` })),
  } as Record<ItemSection, PickItem[]>), [src]);

  const next = () => {
    if (issue) { setError(issue); return; }
    setError(''); setStep(s => (Math.min(2, s + 1) as Step));
  };
  const save = async () => {
    if (!cfg || issue) { setError(issue ?? ''); return; }
    setSaving(true); setError('');
    try {
      const r = await portfolio<{ share: ShareView }>({ action: 'save', config: cfg, ...(editingId ? { id: editingId } : {}) });
      setDone(r.share); void loadShares();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const copy = async (s: ShareView) => {
    if (!s.url) return;
    try { await navigator.clipboard.writeText(s.url); setCopied(s.id); setNote({ ok: true, text: 'Link copied.' }); setTimeout(() => setCopied(null), 2200); }
    catch { setNote({ ok: false, text: 'Your browser would not copy it. Select the link and copy it.' }); }
  };
  const nativeShare = async (s: ShareView) => {
    if (!s.url) return;
    try { await (navigator as any).share({ title: `${myName}: selected work`, url: s.url }); } catch (e: any) { if (e?.name !== 'AbortError') setNote({ ok: false, text: 'Sharing didn\'t work here. Copy the link instead.' }); }
  };
  const act = async (action: 'revoke' | 'delete', s: ShareView) => {
    setNote(null);
    try { await portfolio({ action, id: s.id }); setNote({ ok: true, text: action === 'revoke' ? 'Switched off. The link no longer opens.' : 'Deleted.' }); await loadShares(); }
    catch (e: any) { setNote({ ok: false, text: e.message }); }
  };
  const edit = (s: ShareView) => { setCfg(s.config); setEditingId(s.id); setDone(null); setStep(0); setTab('build'); setError(''); };

  const title = 'Share my work';
  const footer = tab === 'build' && cfg && !done ? (
    <div className="flex items-center gap-2">
      {step > 0 && <button type="button" onClick={() => setStep(s => (s - 1) as Step)} className="min-h-[48px] rounded-xl border px-5 text-sm font-semibold text-stone-800 focus:outline-none focus-visible:ring-2" style={{ borderColor: '#d6d3d1', ...RING }}>Back</button>}
      {step < 2
        ? <button type="button" onClick={next} disabled={!!issue} className="min-h-[48px] flex-1 rounded-xl px-5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 disabled:opacity-50" style={{ backgroundColor: GREEN, ...RING }}>{step === 0 ? 'Preview' : 'Continue to share'}</button>
        : <button type="button" onClick={save} disabled={saving || !!issue} className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 disabled:opacity-50" style={{ backgroundColor: GREEN, ...RING }}>{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{editingId ? 'Save changes' : cfg.kind === 'public' ? 'Publish my portfolio' : 'Create link'}</button>}
    </div>
  ) : done ? <button type="button" onClick={onClose} className="min-h-[48px] w-full rounded-xl px-5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...RING }}>Done</button> : undefined;

  // allow-same-origin WITHOUT allow-scripts: the page's stylesheet loads, while nothing in the frame can run, open windows or submit.
  const previewPane = (
    <div className="rounded-2xl border bg-stone-100 p-2" style={{ borderColor: '#e7e5e4' }}>
      {issue ? <p className="p-6 text-center text-sm text-stone-600">{issue}</p>
        : preview && 'html' in preview ? <iframe title="Preview of what people will see" sandbox="allow-same-origin" srcDoc={preview.html} className={`h-[60vh] w-full rounded-xl bg-white ${previewBusy ? 'opacity-60' : ''}`} />
        : preview && 'error' in preview ? <p role="alert" className="p-6 text-center text-sm text-red-700">{preview.error}</p>
        : <p className="flex items-center justify-center gap-2 p-10 text-sm text-stone-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Preparing your preview...</p>}
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={title} allWidths size="xl" footer={footer}>
      <div role="tablist" aria-label="Share my work" className="mb-4 flex rounded-xl bg-stone-100 p-1">
        {([['build', 'Create'], ['links', `Your links${shares?.length ? ` (${shares.length})` : ''}`]] as ['build' | 'links', string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`sw-tab-${id}`} aria-selected={tab === id} aria-controls={`sw-panel-${id}`} onClick={() => setTab(id)}
            className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 ${tab === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`} style={RING}>{label}</button>
        ))}
      </div>
      {note && <p role={note.ok ? 'status' : 'alert'} className="mb-3 text-sm font-medium" style={{ color: note.ok ? '#166534' : '#b91c1c' }}>{note.text}</p>}

      {tab === 'links' ? (
        <div role="tabpanel" id="sw-panel-links" aria-labelledby="sw-tab-links">
          {!shares ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading...</p>
            : shares.length === 0 ? <p className="py-8 text-center text-sm text-stone-600">You haven't shared anything yet. Choose what to show in the first tab.</p>
            : (
              <ul className="divide-y divide-stone-100">
                {shares.map(s => (
                  <li key={s.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-900">{s.label}</p><p className="text-xs text-stone-600">{s.kind === 'public' ? 'Public portfolio' : 'Unlisted link'} · {describeShare(s)}</p><p className="text-xs text-stone-600">{describeViews(s.views)}{s.contactCount ? ` · ${s.contactCount} ${s.contactCount === 1 ? 'message' : 'messages'}` : ''}</p>{s.updatePolicy === 'snapshot' && <p className="text-xs text-stone-600">Kept as published{s.snapshotAt ? ' ' + new Date(s.snapshotAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</p>}</div>
                      <span className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={s.status === 'ok' ? { backgroundColor: GREEN_LT, color: GREEN } : { backgroundColor: '#f5f5f4', color: '#57534e' }}>{s.status === 'ok' ? 'Open' : s.status === 'revoked' ? 'Off' : 'Expired'}</span>
                    </div>
                    <div className="-ml-2 mt-1 flex flex-wrap items-center">
                      {s.status !== 'revoked' && <button type="button" onClick={() => edit(s)} className="min-h-[44px] rounded-lg px-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: GREEN, ...RING }}>Edit</button>}
                      {s.url && s.status === 'ok' && <button type="button" onClick={() => copy(s)} className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: GREEN, ...RING }}>{copied === s.id ? <><Check className="h-4 w-4" aria-hidden="true" />Copied</> : <><Copy className="h-4 w-4" aria-hidden="true" />Copy link</>}</button>}
                      {s.status !== 'revoked' && <button type="button" onClick={() => act('revoke', s)} className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-stone-600 hover:text-red-700 focus:outline-none focus-visible:ring-2" style={RING}>Switch off</button>}
                      {s.status === 'revoked' && <button type="button" onClick={() => act('delete', s)} className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-stone-600 hover:text-red-700 focus:outline-none focus-visible:ring-2" style={RING}>Delete</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : srcError ? (
        <div role="alert" className="py-8 text-center text-sm text-red-700">{srcError} <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button></div>
      ) : !src || !cfg || !items ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-stone-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Getting your work together...</p>
      ) : done ? (
        <div role="tabpanel" id="sw-panel-build" aria-labelledby="sw-tab-build" className="space-y-4">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><Check className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-base font-bold text-stone-900" role="status">{editingId ? 'Saved. The same link now shows your changes.' : done.kind === 'public' ? 'Your public portfolio is live.' : 'Your link is ready.'}</p>
              <p className="mt-0.5 text-sm text-stone-700">{done.kind === 'public' ? 'It sits on your BeWatu address and search engines may list it. You can switch it off any time.' : 'Anyone who has this link can open it, with no sign-in. It isn\'t private to one person, so share it only with people who should see it.'}</p></div></div>
          <div className="break-all rounded-xl bg-stone-50 px-3 py-3 text-[13px] text-stone-800">{done.url}</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => copy(done)} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2" style={{ borderColor: GREEN, color: GREEN, ...RING }}>{copied === done.id ? <><Check className="h-4 w-4" aria-hidden="true" />Copied</> : <><Copy className="h-4 w-4" aria-hidden="true" />Copy link</>}</button>
            {canShare && <button type="button" onClick={() => nativeShare(done)} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...RING }}><Share2 className="h-4 w-4" aria-hidden="true" />Share...</button>}
            {done.url && <a href={mailtoFor({ url: done.url, name: myName, label: done.label, kind: done.kind })} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2" style={{ borderColor: '#d6d3d1', color: '#292524', ...RING }}><Mail className="h-4 w-4" aria-hidden="true" />Email it</a>}
            {done.url && <a href={printUrl(done.url)} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2" style={{ borderColor: '#d6d3d1', color: '#292524', ...RING }}><ExternalLink className="h-4 w-4" aria-hidden="true" />Save as PDF</a>}
          </div>
          <p className="text-xs text-stone-600">"Save as PDF" opens your page ready to print; choose "Save as PDF" in the print window.</p>
        </div>
      ) : (
        <div role="tabpanel" id="sw-panel-build" aria-labelledby="sw-tab-build">
          <ol className="mb-4 flex items-center gap-2 text-xs font-semibold" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={step === i ? 'step' : undefined} className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={step === i ? { backgroundColor: GREEN, color: '#fff' } : i < step ? { backgroundColor: GREEN_LT, color: GREEN } : { backgroundColor: '#f5f5f4', color: '#57534e' }}>{i < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}</span>
                <span className={step === i ? 'text-stone-900' : 'text-stone-600'}>{s}</span>{i < 2 && <span aria-hidden="true" className="mx-1 h-px w-5 bg-stone-300" />}
              </li>
            ))}
          </ol>
          {error && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{error}</p>}

          <div className={step === 0 && wide ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6' : ''}>
            {step === 0 && (
              <div className="space-y-4">
                <p className="rounded-xl p-3 text-sm text-stone-800" style={{ backgroundColor: GREEN_LT }}>Each thing is shown with what it is: self-reported, submitted work, confirmed, reviewed or verified. Uploading something never makes it verified.</p>

                <section className="rounded-2xl border p-3" style={{ borderColor: '#e7e5e4' }}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 rounded accent-[var(--bw-green)]" checked={cfg.sections.includes('summary')} onChange={e => set({ sections: e.target.checked ? ['summary', ...cfg.sections.filter(s => s !== 'summary')] : cfg.sections.filter(s => s !== 'summary') })} />
                    <span><span className="block text-sm font-semibold text-stone-900">{SECTION_LABEL.summary}</span><span className="block text-xs text-stone-600">{SECTION_HINT.summary}</span></span>
                  </label>
                  {cfg.sections.includes('summary') && (
                    <div className="mt-2"><label htmlFor="sw-intro" className="sr-only">Your short introduction</label>
                      <textarea id="sw-intro" rows={4} maxLength={600} value={cfg.intro} onChange={e => set({ intro: e.target.value })} placeholder="Two or three sentences on what you do and what you are looking for."
                        className="w-full resize-none rounded-xl border bg-white p-3 text-[15px] leading-relaxed text-stone-900 focus:outline-none focus-visible:ring-2" style={{ borderColor: '#d6d3d1', ...RING }} />
                      <p className="text-right text-xs text-stone-600">{cfg.intro.length}/600</p></div>
                  )}
                </section>

                {ordered.map(k => {
                  const on = cfg.sections.includes(k);
                  const idx = (cfg.sections.filter(s => s !== 'summary') as SectionKey[]).indexOf(k);
                  const activeCount = cfg.sections.filter(s => s !== 'summary').length;
                  return (
                    <section key={k} className="rounded-2xl border p-3" style={{ borderColor: on ? '#cfe3dc' : '#e7e5e4' }}>
                      <div className="flex items-center gap-1">
                        <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
                          <input type="checkbox" className="h-5 w-5 rounded accent-[var(--bw-green)]" checked={on} onChange={e => set({ sections: toggleSection(cfg.sections, k, e.target.checked) })} />
                          <span><span className="block text-sm font-semibold text-stone-900">{SECTION_LABEL[k]}</span><span className="block text-xs text-stone-600">{SECTION_HINT[k]}</span></span>
                        </label>
                        {on && <>
                          <button type="button" className={iconBtn} style={RING} disabled={idx <= 0} onClick={() => set({ sections: moveSection(cfg.sections, k, -1) })} aria-label={`Move ${SECTION_LABEL[k]} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                          <button type="button" className={iconBtn} style={RING} disabled={idx >= activeCount - 1} onClick={() => set({ sections: moveSection(cfg.sections, k, 1) })} aria-label={`Move ${SECTION_LABEL[k]} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                        </>}
                      </div>
                      {on && <PickList noun={k === 'arena' ? 'contributions' : k === 'achievements' ? 'achievements' : k} items={items[k as ItemSection]} picked={cfg.selection[k as ItemSection]} onChange={ids => setPick(k as ItemSection, ids)} max={k === 'skills' ? 24 : 12} />}
                    </section>
                  );
                })}

                <section className="rounded-2xl border p-3" style={{ borderColor: '#e7e5e4' }}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 rounded accent-[var(--bw-green)]" checked={cfg.resume} disabled={!src.resume} onChange={e => set({ resume: e.target.checked })} />
                    <span><span className="block text-sm font-semibold text-stone-900">Downloadable résumé</span><span className="block text-xs text-stone-600">{src.resume ? 'Anyone with the link can download the file on your profile' : 'Upload a résumé on your profile to offer it'}</span></span>
                  </label>
                </section>

                <fieldset className="rounded-2xl border p-3" style={{ borderColor: '#e7e5e4' }}>
                  <legend className="px-1 text-sm font-semibold text-stone-900">How can people reach you?</legend>
                  {([['none', 'No contact option', 'People can only look'], ['form', 'A protected contact form', 'Messages reach your inbox; your address stays hidden'], ['email', 'Show my email address', 'Shown only when someone asks for it, to keep it from scrapers']] as [ContactMode, string, string][]).map(([m, label, hint]) => (
                    <label key={m} className="flex min-h-[48px] cursor-pointer items-start gap-3 py-1.5">
                      <input type="radio" name="sw-contact" className="mt-1 h-5 w-5 accent-[var(--bw-green)]" checked={cfg.contact.mode === m} onChange={() => set({ contact: m === 'email' ? { mode: m, email: cfg.contact.email ?? src.email ?? '' } : { mode: m } })} />
                      <span><span className="block text-sm font-medium text-stone-900">{label}</span><span className="block text-xs text-stone-600">{hint}</span></span>
                    </label>
                  ))}
                  {cfg.contact.mode === 'email' && (
                    <div className="mt-1"><label htmlFor="sw-email" className="mb-1 block text-xs font-semibold text-stone-700">Email people will see</label>
                      <input id="sw-email" type="email" autoComplete="email" value={cfg.contact.email ?? ''} onChange={e => set({ contact: { mode: 'email', email: e.target.value } })} className="min-h-[44px] w-full rounded-xl border bg-white px-3 text-[15px] focus:outline-none focus-visible:ring-2" style={{ borderColor: '#d6d3d1', ...RING }} /></div>
                  )}
                </fieldset>
              </div>
            )}

            {step === 0 && wide && <div className="sticky top-0 self-start"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">Live preview</p>{previewPane}</div>}
            {step === 1 && <div><p className="mb-2 text-sm text-stone-700">This is what people will see. The contact form and résumé buttons are switched off here.</p>{previewPane}</div>}

            {step === 2 && (
              <div className="space-y-5">
                <div><label htmlFor="sw-label" className="mb-1 block text-sm font-semibold text-stone-900">Who is it for? <span className="font-normal text-stone-600">(only you see this)</span></label>
                  <input id="sw-label" value={cfg.label} maxLength={60} onChange={e => set({ label: e.target.value })} placeholder="For example: Acme recruiting" className="min-h-[44px] w-full rounded-xl border bg-white px-3 text-[15px] focus:outline-none focus-visible:ring-2" style={{ borderColor: '#d6d3d1', ...RING }} />
                  <p className="mt-1 text-xs text-stone-600">Make a separate link for each audience and switch each off on its own.</p></div>

                <fieldset>
                  <legend className="mb-1 text-sm font-semibold text-stone-900">Where should it live?</legend>
                  <label className="flex min-h-[48px] cursor-pointer items-start gap-3 py-1.5"><input type="radio" name="sw-kind" className="mt-1 h-5 w-5 accent-[var(--bw-green)]" checked={cfg.kind === 'unlisted'} disabled={!!editingId && cfg.kind !== 'unlisted'} onChange={() => set({ kind: 'unlisted' })} /><span><span className="block text-sm font-medium text-stone-900">An unlisted link</span><span className="block text-xs text-stone-600">Anyone who has the link can open it, with no sign-in. Search engines are told to ignore it. It is not private to one person.</span></span></label>
                  <label className="flex min-h-[48px] cursor-pointer items-start gap-3 py-1.5"><input type="radio" name="sw-kind" className="mt-1 h-5 w-5 accent-[var(--bw-green)]" checked={cfg.kind === 'public'} disabled={(!!editingId && cfg.kind !== 'public') || !src.profile.username || !src.profile.isPublic} onChange={() => set({ kind: 'public' })} /><span><span className="block text-sm font-medium text-stone-900">A public portfolio</span><span className="block text-xs text-stone-600">{src.profile.username && src.profile.isPublic ? `On your BeWatu address, bewatu.com/be/${src.profile.username}/work. Search engines may list it.` : 'Needs a public profile and a profile address.'}</span></span></label>
                </fieldset>

                {cfg.kind === 'unlisted' && (
                  <div><label htmlFor="sw-expiry" className="mb-1 block text-sm font-semibold text-stone-900">The link stops working after</label>
                    <select id="sw-expiry" value={cfg.expiry} onChange={e => set({ expiry: e.target.value as any })} className="min-h-[44px] w-full rounded-xl border bg-white px-3 text-[15px] focus:outline-none focus-visible:ring-2" style={{ borderColor: '#d6d3d1', ...RING }}>{EXPIRIES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
                )}

                <fieldset>
                  <legend className="mb-1 text-sm font-semibold text-stone-900">When you change your profile</legend>
                  <label className="flex min-h-[48px] cursor-pointer items-start gap-3 py-1.5"><input type="radio" name="sw-policy" className="mt-1 h-5 w-5 accent-[var(--bw-green)]" checked={cfg.updatePolicy === 'live'} onChange={() => set({ updatePolicy: 'live' })} /><span><span className="block text-sm font-medium text-stone-900">Show my latest</span><span className="block text-xs text-stone-600">The page follows edits to the things you chose. Anything you remove disappears from it.</span></span></label>
                  <label className="flex min-h-[48px] cursor-pointer items-start gap-3 py-1.5"><input type="radio" name="sw-policy" className="mt-1 h-5 w-5 accent-[var(--bw-green)]" checked={cfg.updatePolicy === 'snapshot'} onChange={() => set({ updatePolicy: 'snapshot' })} /><span><span className="block text-sm font-medium text-stone-900">Keep it as published</span><span className="block text-xs text-stone-600">The page stays as it is now until you save it again. Your résumé and contact option always use your latest choices.</span></span></label>
                </fieldset>
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
};

export default ShareMyWork;
