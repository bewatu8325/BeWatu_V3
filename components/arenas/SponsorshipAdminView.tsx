/**
 * components/arenas/SponsorshipAdminView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-admin queue for Arena sponsorships (a view inside AdminPanel).
 *
 * Approving is the only thing that can make a company a sponsor: the admin sets
 * the dates and whether the sponsorship is exclusive. The server refuses dates
 * that would overlap another exclusive sponsorship of the same Arena. Revoking
 * stops a sponsorship at once. Branding edits made after approval are flagged
 * here so they can be looked at.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { brandTheme, sponsorshipPhase, PHASE_LABEL, type SponsorshipRecord } from '../../lib/arenaSponsorship';
import { fetchAllSponsorships, fetchSponsorshipBanner, sponsorshipApi } from '../../lib/arenaSponsorshipService';
import { SponsoredCardHeader } from './SponsorBrand';

const GREEN = 'var(--bw-green)';
type Row = SponsorshipRecord & { arenaName?: string; history?: { atMs: number; action: string; note?: string }[] };
type Tab = 'review' | 'changed' | 'running' | 'history';

const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export default function SponsorshipAdminView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await fetchAllSponsorships()); setError(null); }
    catch { setError('Could not load sponsorships.'); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <div className="flex items-center gap-2 p-6 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" /> Loading…</div>;

  const now = Date.now();
  const phase = (r: Row) => sponsorshipPhase(r, now);
  const buckets: Record<Tab, Row[]> = {
    review:  rows.filter(r => phase(r) === 'pending'),
    changed: rows.filter(r => r.status === 'approved' && r.brandingChangedSinceApproval && ['active', 'scheduled'].includes(phase(r))),
    running: rows.filter(r => ['active', 'scheduled'].includes(phase(r))),
    history: rows.filter(r => ['expired', 'rejected', 'revoked', 'withdrawn'].includes(phase(r))),
  };
  const label: Record<Tab, string> = { review: 'Needs review', changed: 'Branding changed', running: 'Running & scheduled', history: 'History' };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Arena sponsorships</h2>
        <p className="text-sm text-stone-600">A company is shown as a sponsor only while an approved sponsorship covers today. Approving sets the dates.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {(Object.keys(label) as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${tab === t ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}>
            {label[t]} ({buckets[t].length})
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {buckets[tab].length === 0
        ? <p className="rounded-xl border border-dashed border-stone-300 p-6 text-sm text-stone-600">Nothing here.</p>
        : <div className="space-y-4">{buckets[tab].map(r => <SponsorshipRow key={r.id} row={r} onChanged={load} />)}</div>}
    </div>
  );
}

function SponsorshipRow({ row: r, onChanged }: { row: Row; onChanged: () => void }) {
  const now = Date.now();
  const phase = sponsorshipPhase(r, now);
  const [mode, setMode] = useState<'approve' | 'reject' | 'revoke' | null>(null);
  const [start, setStart] = useState(dayStr(now));
  const [end, setEnd] = useState(dayStr(now + 365 * 86400000));
  const [exclusive, setExclusive] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const theme = brandTheme(r.branding.primaryColor);

  useEffect(() => { if (r.branding.hasBanner) fetchSponsorshipBanner(r.id).then(setBanner); }, [r.id, r.branding.hasBanner]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try { await sponsorshipApi({ id: r.id, ...body }); setMode(null); setNote(''); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const inputCls = 'rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm';

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="grid gap-0 md:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="border-b border-stone-100 md:border-b-0 md:border-r">
          <SponsoredCardHeader sponsorship={r} />
          {banner && <img src={banner} alt="" className="block w-full object-cover" style={{ aspectRatio: '4 / 1', maxHeight: 96 }} />}
        </div>
        <div className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-stone-900">{r.companyName} <span className="font-normal text-stone-600">→ {r.arenaName ?? r.arenaId}</span></p>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">{PHASE_LABEL[phase]}</span>
          </div>
          <p className="text-stone-600">
            {r.startMs ? `${fmt(r.startMs)} – ${fmt(r.endMs)}` : 'No dates yet'}{r.startMs ? (r.exclusive ? ' · exclusive' : ' · non-exclusive') : ''}
            {' · '}colour {r.branding.primaryColor}{theme.adjusted ? ` (shown as ${theme.bg} for readability)` : ''}
          </p>
          {r.branding.tagline && <p className="text-stone-800">“{r.branding.tagline}”</p>}
          {r.branding.description && <p className="line-clamp-4 text-stone-700">{r.branding.description}</p>}
          {(r.branding.website || r.branding.links.length > 0) && (
            <p className="break-all text-xs text-stone-600">{[r.branding.website, ...r.branding.links.map(l => l.url)].filter(Boolean).join('  ·  ')}</p>
          )}
          {r.brandingChangedSinceApproval && <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle size={13} /> Branding changed since approval</p>}
          {r.note && (phase === 'rejected' || phase === 'revoked') && <p className="text-xs text-stone-600">Reason: {r.note}</p>}
          {r.history && r.history.length > 0 && (
            <details className="text-xs text-stone-600"><summary className="cursor-pointer">History ({r.history.length})</summary>
              <ul className="mt-1 space-y-0.5">{r.history.map((h, i) => <li key={i}>{new Date(h.atMs).toLocaleString()} — {h.action.replace(/_/g, ' ')}{h.note ? `: ${h.note}` : ''}</li>)}</ul>
            </details>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          {mode === 'approve' && (
            <div className="space-y-2 rounded-xl bg-stone-50 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-semibold text-stone-700">Starts<br /><input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputCls} /></label>
                <label className="text-xs font-semibold text-stone-700">Ends<br /><input type="date" value={end} onChange={e => setEnd(e.target.value)} className={inputCls} /></label>
                <label className="flex items-center gap-1.5 pb-1.5 text-sm text-stone-800"><input type="checkbox" checked={exclusive} onChange={e => setExclusive(e.target.checked)} /> Exclusive</label>
              </div>
              <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} className={`${inputCls} w-full`} />
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => run({ action: 'approve', startDate: new Date(start + 'T00:00:00').toISOString(), endDate: new Date(end + 'T23:59:59').toISOString(), exclusive, note })}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: GREEN }}>{busy && <Loader2 size={13} className="animate-spin" />}Approve</button>
                <button disabled={busy} onClick={() => setMode(null)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold">Cancel</button>
              </div>
            </div>
          )}
          {(mode === 'reject' || mode === 'revoke') && (
            <div className="space-y-2 rounded-xl bg-stone-50 p-3">
              <input placeholder="Reason (shown to the company)" value={note} onChange={e => setNote(e.target.value)} className={`${inputCls} w-full`} />
              <div className="flex gap-2">
                <button disabled={busy || note.trim().length < 5} onClick={() => run({ action: mode, note })} className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}{mode === 'reject' ? 'Reject' : 'Revoke now'}</button>
                <button disabled={busy} onClick={() => setMode(null)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold">Cancel</button>
              </div>
            </div>
          )}

          {!mode && (
            <div className="flex flex-wrap gap-2 pt-1">
              {phase === 'pending' && <>
                <button onClick={() => setMode('approve')} className="rounded-lg px-4 py-1.5 text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>Review &amp; approve</button>
                <button onClick={() => setMode('reject')} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">Reject</button>
              </>}
              {(phase === 'active' || phase === 'scheduled') && <>
                {r.brandingChangedSinceApproval && <button disabled={busy} onClick={() => run({ action: 'acknowledge' })} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold hover:bg-stone-50">Mark reviewed</button>}
                <button onClick={() => setMode('revoke')} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">Revoke</button>
              </>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
