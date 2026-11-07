/**
 * components/arenas/SponsorshipManager.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * For a company's administrator: ask to sponsor an Arena, see where each request
 * stands, and manage the logo, banner, colour, description and links while a
 * sponsorship is under review or running. A live preview shows exactly how the
 * Arena card and the Arena page will look (same components as the real screens).
 *
 * Asking is not becoming: nothing here makes the company a sponsor. BeWatu approves
 * and sets the dates (api/arena-sponsorship.ts); until then the company is not shown.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, X, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getArenaIndustries, type ArenaIndustry } from '../../lib/arenaService';
import {
  brandTheme, sponsorshipPhase, PHASE_LABEL, LIMITS, HEX_RE, DEFAULT_BRAND,
  type SponsorshipRecord, type SponsorLink,
} from '../../lib/arenaSponsorship';
import {
  fetchMySponsorships, fetchSponsorshipBanner, sponsorshipApi, prepareSponsorImage, SponsorshipError,
} from '../../lib/arenaSponsorshipService';
import { SponsoredCardHeader, SponsoredArenaHero } from './SponsorBrand';

const GREEN = 'var(--bw-green)';
const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

interface Props {
  companyId: string;
  companyName: string;
  uid: string;
  /** Opens the request form for this Arena straight away (from "Become a sponsor"). */
  initialArenaId?: string;
  onChanged?: () => void;
}

interface FormState {
  arenaId: string;
  primaryColor: string;
  tagline: string;
  description: string;
  website: string;
  links: SponsorLink[];
  logo: string | null;
  banner: string | null | undefined;   // undefined = leave as is, null = remove
}

const blankForm = (arenaId: string): FormState => ({ arenaId, primaryColor: DEFAULT_BRAND, tagline: '', description: '', website: '', links: [], logo: null, banner: undefined });

const PHASE_STYLE: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#e8f4f0', fg: '#14513f' }, scheduled: { bg: '#e0ecff', fg: '#1d4ed8' }, pending: { bg: '#fef3c7', fg: '#92400e' },
  expired: { bg: '#f1f5f9', fg: '#475569' }, rejected: { bg: '#fee2e2', fg: '#991b1b' }, revoked: { bg: '#fee2e2', fg: '#991b1b' }, withdrawn: { bg: '#f1f5f9', fg: '#475569' },
};

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-stone-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-600">{hint}</p>}
    </div>
  );
}
const inputCls = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus-visible:ring-2';

export default function SponsorshipManager({ companyId, companyName, uid, initialArenaId, onChanged }: Props) {
  const [records, setRecords] = useState<SponsorshipRecord[]>([]);
  const [arenas, setArenas] = useState<ArenaIndustry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const opened = useRef(false);

  const reload = useCallback(async () => {
    const [mine, list] = await Promise.all([fetchMySponsorships(uid), getArenaIndustries().catch(() => [])]);
    setRecords(mine.filter(r => r.companyId === companyId));
    setArenas(list as ArenaIndustry[]);
    setLoading(false);
  }, [uid, companyId]);

  useEffect(() => { reload().catch(() => setLoading(false)); }, [reload]);
  useEffect(() => {
    if (initialArenaId && !loading && !opened.current) { opened.current = true; setEditing({ id: null, form: blankForm(initialArenaId) }); }
  }, [initialArenaId, loading]);

  const arenaName = (id: string) => arenas.find(a => a.id === id)?.name ?? id;

  const startEdit = async (r: SponsorshipRecord) => {
    const banner = r.branding.hasBanner ? await fetchSponsorshipBanner(r.id) : null;
    setEditing({ id: r.id, form: {
      arenaId: r.arenaId, primaryColor: r.branding.primaryColor, tagline: r.branding.tagline, description: r.branding.description,
      website: r.branding.website ?? '', links: r.branding.links, logo: r.branding.logo, banner: banner ?? (r.branding.hasBanner ? undefined : null),
    } });
    setNotice(null);
  };

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    setBusy(true); setNotice(null);
    const branding = { primaryColor: f.primaryColor, tagline: f.tagline, description: f.description, website: f.website.trim() || null, links: f.links.filter(l => l.label.trim() || l.url.trim()), logo: f.logo };
    try {
      if (editing.id) {
        await sponsorshipApi({ action: 'update_branding', id: editing.id, branding, ...(f.banner !== undefined ? { banner: f.banner } : {}) });
        setNotice({ kind: 'ok', text: 'Saved. The change shows on the Arena right away.' });
      } else {
        await sponsorshipApi({ action: 'request', arenaId: f.arenaId, companyId, branding, ...(f.banner ? { banner: f.banner } : {}) });
        setNotice({ kind: 'ok', text: 'Request sent. BeWatu will review it; your company is not shown as a sponsor until it is approved.' });
      }
      setEditing(null);
      await reload(); onChanged?.();
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally { setBusy(false); }
  };

  const withdraw = async (r: SponsorshipRecord) => {
    const running = sponsorshipPhase(r) === 'active';
    if (!window.confirm(running ? 'End this sponsorship now? Your branding will stop showing on the Arena.' : 'Withdraw this request?')) return;
    setBusy(true); setNotice(null);
    try { await sponsorshipApi({ action: 'withdraw', id: r.id }); await reload(); onChanged?.(); }
    catch (e) { setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" /> Loading sponsorships…</div>;

  const openForArena = new Set(records.filter(r => ['pending', 'active', 'scheduled'].includes(sponsorshipPhase(r))).map(r => r.arenaId));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-stone-900">Arena sponsorship</h3>
        <p className="mt-1 text-sm text-stone-600">
          Sponsor an industry Arena to present it under your brand. BeWatu reviews every request and sets the dates;
          {' '}{companyName} is shown as a sponsor only while an approved sponsorship is running.
        </p>
      </div>

      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          {notice.kind === 'error' ? <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {!editing && (
        <>
          {records.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-600">No sponsorships yet.</p>
          ) : (
            <ul className="space-y-3">
              {records.map(r => {
                const phase = sponsorshipPhase(r);
                const st = PHASE_STYLE[phase];
                const editable = phase === 'pending' || phase === 'active' || phase === 'scheduled';
                return (
                  <li key={r.id} className="rounded-2xl border border-stone-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900">{arenaName(r.arenaId)}</p>
                        <p className="text-xs text-stone-600">
                          {phase === 'pending' ? 'Waiting for BeWatu to review' : `${fmtDate(r.startMs)} – ${fmtDate(r.endMs)}`}
                          {r.exclusive && phase !== 'pending' ? ' · exclusive' : ''}
                        </p>
                      </div>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: st.bg, color: st.fg }}>{PHASE_LABEL[phase]}</span>
                    </div>
                    {(phase === 'rejected' || phase === 'revoked') && r.note && (
                      <p className="border-t border-stone-100 px-4 py-2.5 text-sm text-stone-700"><span className="font-semibold">Reason: </span>{r.note}</p>
                    )}
                    {r.brandingChangedSinceApproval && (phase === 'active' || phase === 'scheduled') && (
                      <p className="border-t border-stone-100 px-4 py-2.5 text-xs text-stone-600">Your latest branding changes are live. BeWatu may review them.</p>
                    )}
                    {editable && (
                      <div className="flex flex-wrap gap-2 border-t border-stone-100 p-3">
                        <button type="button" onClick={() => startEdit(r)} disabled={busy} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50">Edit branding</button>
                        <button type="button" onClick={() => withdraw(r)} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{phase === 'pending' ? 'Withdraw request' : 'End sponsorship'}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={() => { setEditing({ id: null, form: blankForm(arenas.find(a => !openForArena.has(a.id))?.id ?? arenas[0]?.id ?? '') }); setNotice(null); }}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>
            <Plus size={15} /> Request sponsorship
          </button>
        </>
      )}

      {editing && (
        <BrandingEditor
          key={editing.id ?? 'new'}
          isNew={!editing.id}
          form={editing.form}
          setForm={f => setEditing(e => (e ? { ...e, form: typeof f === 'function' ? f(e.form) : f } : e))}
          arenas={arenas}
          lockedArenas={openForArena}
          companyName={companyName}
          arenaName={arenaName(editing.form.arenaId)}
          busy={busy}
          onSave={save}
          onCancel={() => { setEditing(null); setNotice(null); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BrandingEditor({ isNew, form, setForm, arenas, lockedArenas, companyName, arenaName, busy, onSave, onCancel }: {
  isNew: boolean; form: FormState; setForm: (f: FormState | ((p: FormState) => FormState)) => void;
  arenas: ArenaIndustry[]; lockedArenas: Set<string>; companyName: string; arenaName: string; busy: boolean; onSave: () => void; onCancel: () => void;
}) {
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState<'logo' | 'banner' | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(p => ({ ...p, [k]: v }));
  const theme = useMemo(() => brandTheme(form.primaryColor), [form.primaryColor]);
  const colourValid = HEX_RE.test(form.primaryColor);

  const pick = async (kind: 'logo' | 'banner', file: File | undefined) => {
    if (!file) return;
    setImgError(null); setImgBusy(kind);
    try { set(kind, await prepareSponsorImage(file, kind)); }
    catch (e) { setImgError(e instanceof SponsorshipError ? e.message : 'That image could not be used.'); }
    finally { setImgBusy(null); }
  };

  const previewRecord: SponsorshipRecord = useMemo(() => ({
    id: 'preview', arenaId: form.arenaId, companyId: 'preview', companyName, status: 'approved', exclusive: true, startMs: 0, endMs: Number.MAX_SAFE_INTEGER,
    branding: { primaryColor: form.primaryColor, tagline: form.tagline, description: form.description, website: form.website.trim() || null, links: [], logo: form.logo, hasBanner: !!form.banner },
  }), [form, companyName]);

  const canSave = !busy && colourValid && (!isNew || (!!form.arenaId && !lockedArenas.has(form.arenaId)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={e => { e.preventDefault(); if (canSave) onSave(); }} className="space-y-4">
        <h4 className="text-sm font-bold text-stone-900">{isNew ? 'Request sponsorship' : 'Edit branding'}</h4>

        {isNew && (
          <Field label="Arena" htmlFor="sp-arena">
            <select id="sp-arena" value={form.arenaId} onChange={e => set('arenaId', e.target.value)} className={inputCls} style={{ ['--tw-ring-color' as any]: GREEN }}>
              {arenas.map(a => <option key={a.id} value={a.id} disabled={lockedArenas.has(a.id)}>{a.name}{lockedArenas.has(a.id) ? ' (you already have one)' : ''}</option>)}
            </select>
          </Field>
        )}

        <Field label="Brand colour" htmlFor="sp-colour" hint={!colourValid ? 'Use a hex colour like #244038.' : theme.adjusted ? `This colour is too close to the middle for readable text, so it will appear as ${theme.bg}.` : 'Text on this colour is readable.'}>
          <div className="flex items-center gap-2">
            <input type="color" aria-label="Pick brand colour" value={colourValid ? form.primaryColor : DEFAULT_BRAND} onChange={e => set('primaryColor', e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-stone-300 bg-white p-1" />
            <input id="sp-colour" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value.trim())} maxLength={7} className={`${inputCls} max-w-[9rem] font-mono`} style={{ ['--tw-ring-color' as any]: GREEN }} aria-invalid={!colourValid} />
            <span className="h-10 w-10 rounded-lg border border-stone-200" style={{ backgroundColor: theme.bg }} aria-hidden="true" title="How it will appear" />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <ImagePicker label="Logo" hint="Square or wide. PNG, JPEG or WebP. Shown on a white tile." value={form.logo} busy={imgBusy === 'logo'} onPick={f => pick('logo', f)} onClear={() => set('logo', null)} aspect="square" />
          <ImagePicker label="Banner (optional)" hint="Wide image, cropped to 4:1. Shown above your colour band." value={form.banner ?? null} busy={imgBusy === 'banner'} onPick={f => pick('banner', f)} onClear={() => set('banner', null)} aspect="wide" />
        </div>
        {imgError && <p role="alert" className="text-xs text-red-700">{imgError}</p>}

        <Field label="Tagline" htmlFor="sp-tag" hint={`${form.tagline.length}/${LIMITS.tagline}`}>
          <input id="sp-tag" value={form.tagline} maxLength={LIMITS.tagline} onChange={e => set('tagline', e.target.value)} className={inputCls} style={{ ['--tw-ring-color' as any]: GREEN }} />
        </Field>
        <Field label="About your company (shown on the Arena page)" htmlFor="sp-desc" hint={`${form.description.length}/${LIMITS.description}`}>
          <textarea id="sp-desc" rows={4} value={form.description} maxLength={LIMITS.description} onChange={e => set('description', e.target.value)} className={inputCls} style={{ ['--tw-ring-color' as any]: GREEN }} />
        </Field>
        <Field label="Website" htmlFor="sp-web" hint="Secure links only (https://).">
          <input id="sp-web" type="url" inputMode="url" placeholder="https://example.com" value={form.website} onChange={e => set('website', e.target.value)} className={inputCls} style={{ ['--tw-ring-color' as any]: GREEN }} />
        </Field>

        <div>
          <p className="mb-1 text-xs font-semibold text-stone-700">More links (up to {LIMITS.links})</p>
          <div className="space-y-2">
            {form.links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input aria-label={`Link ${i + 1} label`} placeholder="Label" value={l.label} maxLength={LIMITS.linkLabel} onChange={e => set('links', form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={`${inputCls} max-w-[9rem]`} style={{ ['--tw-ring-color' as any]: GREEN }} />
                <input aria-label={`Link ${i + 1} address`} placeholder="https://…" value={l.url} onChange={e => set('links', form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className={inputCls} style={{ ['--tw-ring-color' as any]: GREEN }} />
                <button type="button" aria-label={`Remove link ${i + 1}`} onClick={() => set('links', form.links.filter((_, j) => j !== i))} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100"><X size={16} /></button>
              </div>
            ))}
          </div>
          {form.links.length < LIMITS.links && (
            <button type="button" onClick={() => set('links', [...form.links, { label: '', url: '' }])} className="mt-2 text-sm font-semibold hover:underline" style={{ color: GREEN }}>+ Add a link</button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" disabled={!canSave} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40" style={{ backgroundColor: GREEN }}>
            {busy && <Loader2 size={14} className="animate-spin" />}{isNew ? 'Send request' : 'Save changes'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
        </div>
        {!isNew && <p className="text-xs text-stone-600">Changes to a running sponsorship show right away and may be reviewed by BeWatu.</p>}
      </form>

      <aside aria-label="Preview" className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Preview</p>
        <div>
          <p className="mb-1.5 text-xs text-stone-600">On the Arena directory</p>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <SponsoredCardHeader sponsorship={previewRecord} />
            <div className="px-5 py-4">
              <p className="font-semibold text-stone-900">{arenaName}</p>
              <p className="mt-1 text-xs text-stone-600">Industry challenges, real prizes.</p>
              <p className="mt-3 text-sm font-semibold" style={{ color: GREEN }}>Explore Arena →</p>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-stone-600">On the Arena page</p>
          <SponsoredArenaHero sponsorship={previewRecord} banner={form.banner ?? null}>
            <p className="text-lg font-semibold text-stone-900">{arenaName}</p>
            {form.description && <p className="mt-1 line-clamp-3 text-sm text-stone-600">{form.description}</p>}
          </SponsoredArenaHero>
        </div>
      </aside>
    </div>
  );
}

function ImagePicker({ label, hint, value, busy, onPick, onClear, aspect }: {
  label: string; hint: string; value: string | null; busy: boolean; onPick: (f: File | undefined) => void; onClear: () => void; aspect: 'square' | 'wide';
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-stone-700">{label}</p>
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50 ${aspect === 'square' ? 'h-16 w-16' : 'h-16 w-32'}`}>
          {value ? <img src={value} alt="" className={aspect === 'square' ? 'max-h-full max-w-full object-contain p-1' : 'h-full w-full object-cover'} /> : <span className="text-[11px] text-stone-500">None</span>}
        </div>
        <div className="flex flex-col items-start gap-1">
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}{value ? 'Replace' : 'Upload'}
          </button>
          {value && <button type="button" onClick={onClear} className="text-xs font-semibold text-red-700 hover:underline">Remove</button>}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`${label} file`} onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <p className="mt-1 text-xs text-stone-600">{hint}</p>
    </div>
  );
}
