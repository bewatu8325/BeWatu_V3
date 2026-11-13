/**
 * components/invite/InviteResume.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs in the signed-in app. If this device remembers an invitation (the person opened a link, then signed up or signed in):
 *   - A CONNECT invitation continues on the invitation page itself, over the app (components/invite/InvitePage.tsx). If the person
 *     pressed "Accept invitation" before signing up or in (and did so within a day), it is finished now without a second tap and
 *     the page says "You're connected" only once the server has said so. If they did not, they are shown the invitation and choose.
 *     Nothing is ever accepted just because they arrived.
 *   - A Pod, community or Arena invitation keeps its short welcome: the server records the arrival and the sheet offers the one step
 *     (ask to join, open the challenge). A private Pod only ever gets a REQUEST, which its admin approves.
 *
 * Those steps are performed by the app (the same handlers as everywhere else) and reported back here, so "completed" is checked
 * by the server against the real records.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import BottomSheet from '../mobile/BottomSheet';
import { InviteIcon } from '../icons/NavIcons';
import { Loader2 } from 'lucide-react';
import { clearPending, deviceStore, fetchPreview, invite, loadPendingIntent, type AcceptResult } from '../../lib/invitations';

const InvitePage = lazy(() => import('./InvitePage'));

const GREEN = 'var(--bw-green)';

export interface InviteSteps {
  /** Send the connection request (resolves when done). */
  connect: (inviter: NonNullable<AcceptResult['inviter']>) => Promise<void>;
  /** Ask to join a Pod (resolves when the request is made). */
  requestJoin: (podId: string) => Promise<void>;
  /** Move to the invited place without doing anything there. */
  open: (r: OpenTarget) => void;
  /** Reload the member's data (so a connection the server just made shows up). */
  refresh?: () => Promise<void> | void;
}
export interface OpenTarget { destination: { type: string; id: string | null }; inviter: { numericId: number | null } | null }

export const InviteResume: React.FC<{ ready: boolean; steps: InviteSteps }> = ({ ready, steps }) => {
  const [res, setRes] = useState<AcceptResult | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [actionError, setActionError] = useState('');
  const [page, setPage] = useState<{ token: string; autoAccept: boolean } | null>(null);
  const token = useRef<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    const pending = loadPendingIntent(deviceStore());
    if (!pending) return;
    ran.current = true; token.current = pending.token;
    const t = pending.token;
    // A quiet look first: it tells us which kind of invitation this is without counting a second view.
    fetchPreview(t, true).then(pv => {
      if (pv.state === 'busy') { ran.current = false; return; }                // no connection: keep it for next time
      if (pv.state !== 'ok' || pv.purpose === 'connect') { setPage({ token: t, autoAccept: pending.accepted }); return; }
      invite<AcceptResult>({ action: 'accept', token: t })
        .then(r => { clearPending(deviceStore()); setRes(r); setOpen(true); })
        .catch((e: any) => {
          // A network problem keeps the invitation for next time; anything the server refused is final.
          if (!e.status || e.status === 429 || e.status >= 500) { ran.current = false; return; }
          clearPending(deviceStore()); setError(e.message); setOpen(true);
        });
    });
  }, [ready]);

  const finishPage = async () => { clearPending(deviceStore()); setPage(null); try { await steps.refresh?.(); } catch { /* the page already told them what happened */ } };

  const close = () => setOpen(false);
  const run = async () => {
    if (!res) return;
    setBusy(true); setActionError('');
    try {
      if (res.action === 'connect' && res.inviter) { await steps.connect(res.inviter); setDone(`Connection request sent to ${res.inviter.name}. They'll hear from you.`); }
      else if (res.action === 'request_to_join' && res.target) { await steps.requestJoin(res.target.id); setDone('Request sent. The Pod\'s admin will take a look.'); }
      else { steps.open(res); close(); return; }
      if (token.current) invite({ action: 'complete', token: token.current }).catch(() => {});
    } catch (e: any) { setActionError(e?.message ?? 'That didn\'t go through. Please try again.'); }
    finally { setBusy(false); }
  };

  if (page) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto" style={{ backgroundColor: '#f0ede6' }} role="dialog" aria-modal="true" aria-label="Your BeWatu invitation">
        <Suspense fallback={null}>
          <InvitePage token={page.token} embedded={{
            autoAccept: page.autoAccept,
            onExplore: finishPage,
            onDismiss: finishPage,
            onViewProfile: who => { finishPage().then(() => steps.open({ destination: { type: 'profile', id: null }, inviter: { numericId: who.numericId } })); },
          }} />
        </Suspense>
      </div>
    );
  }
  if (!res && !error) return null;
  const inviter = res?.inviter?.name || 'Your inviter';
  const label = !res ? '' : res.action === 'connect' ? `Connect with ${inviter}` : res.action === 'request_to_join' ? `Request to join${res.target?.name ? ' ' + res.target.name : ''}` : res.action === 'view_challenge' ? 'View the challenge' : 'Take a look around';

  return (
    <BottomSheet open={open} onClose={close} title={error ? 'About your invitation' : res!.existingMember ? 'Welcome back' : 'Welcome to BeWatu'} allWidths>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--bw-green-light)', color: GREEN }}><InviteIcon className="h-5 w-5" /></span>
        <div className="min-w-0">
          {error ? (
            <p className="text-[15px] text-stone-800" role="alert">{error} You're all set up on BeWatu, though, so you can carry on from here.</p>
          ) : done ? (
            <p className="text-[15px] font-medium text-stone-900" role="status">{done}</p>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-stone-900">{inviter} invited you{res!.target?.name ? ` to ${res!.target.name}` : ''}.</p>
              <p className="mt-1 text-sm text-stone-700">
                {res!.action === 'connect' ? 'Send a connection request if you\'d like to connect. They\'ll decide whether to accept.'
                  : res!.action === 'request_to_join' ? 'You can ask to join. The Pod\'s admin approves requests, so nothing happens without their say.'
                  : res!.action === 'view_challenge' ? 'Have a look and decide whether it\'s for you.' : 'Have a look around and see what\'s for you.'}
              </p>
              {actionError && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{actionError}</p>}
            </>
          )}
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {!error && !done && (
          <button type="button" onClick={run} disabled={busy} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white focus:outline-none focus-visible:ring-2 disabled:opacity-60" style={{ backgroundColor: GREEN, ['--tw-ring-color' as any]: GREEN }}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{label}
          </button>
        )}
        <button type="button" onClick={close} className="min-h-[48px] w-full rounded-xl text-sm font-semibold text-stone-700 hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>{done || error ? 'Done' : 'Not now'}</button>
      </div>
    </BottomSheet>
  );
};

export default InviteResume;
