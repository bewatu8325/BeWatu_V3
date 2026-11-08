/**
 * components/invite/InviteResume.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs in the signed-in app. If this device remembers an invitation (the person opened a link, then signed up or signed in), the
 * server is asked to record the arrival, and a short welcome offers the one step the invitation was for: send a connection
 * request, ask to join a Pod, or open the challenge. Nothing is done for them. A private Pod only ever gets a REQUEST, which its
 * admin approves; a connection is a request the other person accepts.
 *
 * The step itself is performed by the app (the same handlers as everywhere else) and reported back here, so "completed" is
 * checked by the server against the real records.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useRef, useState } from 'react';
import BottomSheet from '../mobile/BottomSheet';
import { InviteIcon } from '../icons/NavIcons';
import { Loader2 } from 'lucide-react';
import { clearPending, deviceStore, invite, loadPending, type AcceptResult } from '../../lib/invitations';

const GREEN = 'var(--bw-green)';

export interface InviteSteps {
  /** Send the connection request (resolves when done). */
  connect: (inviter: NonNullable<AcceptResult['inviter']>) => Promise<void>;
  /** Ask to join a Pod (resolves when the request is made). */
  requestJoin: (podId: string) => Promise<void>;
  /** Move to the invited place without doing anything there. */
  open: (r: AcceptResult) => void;
}

export const InviteResume: React.FC<{ ready: boolean; steps: InviteSteps }> = ({ ready, steps }) => {
  const [res, setRes] = useState<AcceptResult | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [actionError, setActionError] = useState('');
  const token = useRef<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    const t = loadPending(deviceStore());
    if (!t) return;
    ran.current = true; token.current = t;
    invite<AcceptResult>({ action: 'accept', token: t })
      .then(r => { clearPending(deviceStore()); setRes(r); setOpen(true); })
      .catch((e: any) => {
        // A network problem keeps the invitation for next time; anything the server refused is final.
        if (!e.status || e.status === 429 || e.status >= 500) { ran.current = false; return; }
        clearPending(deviceStore()); setError(e.message); setOpen(true);
      });
  }, [ready]);

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
