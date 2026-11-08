/**
 * components/invite/YourInvitations.tsx
 * The compact "Your invitations" list: what you sent, who joined, and what can still be done (resend, withdraw, copy the link).
 * Addresses arrive already masked from the server. A personal link nobody has shared or opened is not listed: it is not an
 * invitation yet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, RotateCw } from 'lucide-react';
import { invite, purposeLabel, type InvitationView, type InviteStatus } from '../../lib/invitations';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const RING = { ['--tw-ring-color' as any]: GREEN };

const PILL: Record<InviteStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending', bg: '#fef3c7', fg: '#92400e' },
  joined:  { label: 'Joined',  bg: GREEN_LT,  fg: GREEN },
  expired: { label: 'Expired', bg: '#f5f5f4', fg: '#57534e' },
  revoked: { label: 'Revoked', bg: '#fee2e2', fg: '#991b1b' },
};
const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const ago = (ms: number) => `Sent ${when(ms)}`;

interface Listing { invitations: InvitationView[]; summary: { pending: number; joined: number; completed: number }; joinedAlerts: boolean }

export const YourInvitations: React.FC<{ active: boolean }> = ({ active }) => {
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { setData(await invite<Listing>({ action: 'list' })); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { if (active) void load(); }, [active, load]);

  const act = async (id: string, action: 'resend' | 'revoke') => {
    setBusy(id + action); setNote(null); setConfirm(null);
    try {
      await invite({ action, id });
      setNote({ ok: true, text: action === 'resend' ? 'Invitation sent again.' : 'Invitation withdrawn. The link no longer works.' });
      await load();
    } catch (e: any) { setNote({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };
  const copy = async (i: InvitationView) => {
    if (!i.url) return;
    try { await navigator.clipboard.writeText(i.url); setCopiedId(i.id); setTimeout(() => setCopiedId(null), 2000); invite({ action: 'shared', id: i.id, channel: 'copy' }).catch(() => {}); }
    catch { setNote({ ok: false, text: 'Your browser would not copy it. Open the Invite tab to see the link.' }); }
  };
  const setAlerts = async (on: boolean) => {
    setData(d => d && { ...d, joinedAlerts: on });
    try { await invite({ action: 'prefs', joinedAlerts: on }); } catch (e: any) { setNote({ ok: false, text: e.message }); void load(); }
  };

  if (error) return <div role="alert" className="py-6 text-center text-sm text-red-700">{error} <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button></div>;
  if (!data) return <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading your invitations...</div>;

  const rows = data.invitations.filter(i => i.kind === 'email' || i.shares > 0 || i.opens > 0 || i.joinedCount > 0);

  return (
    <div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-600">Nothing yet. When you invite someone, you'll see how it's going here.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-700" aria-live="polite">
            <strong className="font-semibold text-stone-900">{data.summary.joined}</strong> joined · <strong className="font-semibold text-stone-900">{data.summary.pending}</strong> pending
          </p>
          <ul className="divide-y divide-stone-100">
            {rows.map(i => {
              const p = PILL[i.status];
              const title = i.targetName ?? purposeLabel(i.purpose);
              return (
                <li key={i.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900">{i.recipient ?? 'Personal link'}</p>
                      <p className="truncate text-xs text-stone-600">{title}{i.targetName ? ` · ${purposeLabel(i.purpose)}` : ''} · {ago(i.createdAt)}</p>
                      {i.kind === 'link' && i.joinedCount > 0 && <p className="text-xs text-stone-600">{i.joinedCount} {i.joinedCount === 1 ? 'person' : 'people'} joined</p>}
                      {i.deliveryFailed && i.status === 'pending' && <p className="text-xs font-medium text-red-700">The email didn't go through.</p>}
                      {i.status === 'pending' && <p className="text-xs text-stone-600">Expires {when(i.expiresAt)}</p>}
                    </div>
                    <span className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: p.bg, color: p.fg }}>{p.label}</span>
                  </div>
                  {(i.canResend || i.canRevoke || i.url) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 -ml-2">
                      {i.canResend && <button type="button" onClick={() => act(i.id, 'resend')} disabled={!!busy} className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:opacity-50" style={{ color: GREEN, ...RING }}>{busy === i.id + 'resend' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCw className="h-4 w-4" aria-hidden="true" />}Resend</button>}
                      {i.url && <button type="button" onClick={() => copy(i)} className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: GREEN, ...RING }}>{copiedId === i.id ? <><Check className="h-4 w-4" aria-hidden="true" />Copied</> : <><Copy className="h-4 w-4" aria-hidden="true" />Copy link</>}</button>}
                      {i.canRevoke && (confirm === i.id
                        ? <span className="flex items-center gap-1"><button type="button" onClick={() => act(i.id, 'revoke')} disabled={!!busy} className="min-h-[44px] rounded-lg px-2 text-sm font-bold text-red-700 focus:outline-none focus-visible:ring-2" style={RING}>{busy === i.id + 'revoke' ? 'Withdrawing...' : 'Yes, withdraw'}</button><button type="button" onClick={() => setConfirm(null)} className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-stone-600 focus:outline-none focus-visible:ring-2" style={RING}>Keep</button></span>
                        : <button type="button" onClick={() => setConfirm(i.id)} className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-stone-600 hover:text-red-700 focus:outline-none focus-visible:ring-2" style={RING}>Withdraw</button>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {note && <p role={note.ok ? 'status' : 'alert'} className="mt-2 text-sm font-medium" style={{ color: note.ok ? '#166534' : '#b91c1c' }}>{note.text}</p>}
      <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 border-t border-stone-100 pt-3 text-sm text-stone-700">
        <input type="checkbox" checked={data.joinedAlerts} onChange={e => setAlerts(e.target.checked)} className="h-5 w-5 rounded accent-[var(--bw-green)]" />
        Tell me when someone I invited joins
      </label>
    </div>
  );
};

export default YourInvitations;
