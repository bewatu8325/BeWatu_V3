/**
 * components/invite/InvitePage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders at /invite/:token, signed out or in. It explains who invited you (by name only if their profile is public), to what,
 * and what happens next, then offers to create an account or sign in. It does nothing on your behalf: nothing is joined or
 * requested until you are in and choose to.
 *
 * The token is remembered on this device (lib/invitations.ts) before the sign-up or sign-in screen, so the invitation survives
 * the detour and the app picks it up on arrival (InviteResume). Mounted outside the Firebase provider like /be and /endorse.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState } from 'react';
import { LogoIcon } from '../../constants';
import { InviteIcon } from '../icons/NavIcons';
import { PURPOSES, deviceStore, fetchPreview, purposeLabel, reportStarted, savePending, type Preview } from '../../lib/invitations';

const BG = '#f0ede6', BORDER = '#e8e4dc', GREEN = 'var(--bw-green)', GREEN_LT = 'var(--bw-green-light)';

const initials = (n: string) => n.split(/\s+/).map(x => x[0]).join('').toUpperCase().slice(0, 2) || 'BW';

const WHAT: Record<string, string> = {
  connect: 'to connect on BeWatu',
  community: 'to join a community on BeWatu',
  pod: 'to join a Pod on BeWatu',
  arena: 'to explore an Arena challenge on BeWatu',
};
const NEXT: Record<string, string> = {
  connect: 'You can send them a connection request. They decide whether to accept.',
  request_to_join: 'You can ask to join. The Pod\'s admin decides, so nothing happens without their say.',
  view_challenge: 'You can read the challenge and decide whether to take part.',
  explore: 'You can look around and decide what is for you.',
};

export const InvitePage: React.FC<{ token: string }> = ({ token }) => {
  const [p, setP] = useState<Preview | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => { let live = true; fetchPreview(token).then(r => { if (live) setP(r); }); return () => { live = false; }; }, [token]);
  // If this browser is already signed in, say so and skip the sign-up screens.
  useEffect(() => {
    let off = () => {};
    import('../../lib/firebase').then(({ auth }) => { off = auth.onAuthStateChanged(u => setSignedIn(!!u)); }).catch(() => {});
    return () => off();
  }, []);

  const go = (path: string) => {
    if (p?.state === 'ok') { savePending(deviceStore(), token); reportStarted(token); }
    window.location.href = path;
  };
  const who = p?.inviter?.name ?? null;
  const usable = p?.state === 'ok';

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: BG }}>
      <header className="border-b" style={{ borderColor: BORDER }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="/" aria-label="BeWatu home"><LogoIcon className="h-8 w-auto" style={{ color: GREEN }} /></a>
        </div>
      </header>

      <main className="flex flex-1 justify-center px-4 py-8 sm:px-6" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <div className="w-full max-w-md">
          {!p && (
            <div className="animate-pulse rounded-3xl border bg-white p-6" style={{ borderColor: BORDER }} role="status" aria-label="Loading your invitation">
              <div className="mb-4 h-14 w-14 rounded-2xl bg-stone-100" /><div className="mb-3 h-5 w-3/4 rounded bg-stone-100" /><div className="h-4 w-1/2 rounded bg-stone-100" />
            </div>
          )}

          {p && (
            <div className="overflow-hidden rounded-3xl border bg-white shadow-sm" style={{ borderColor: BORDER }}>
              <div className="h-1.5 w-full" style={{ backgroundColor: GREEN }} />
              <div className="p-6">
                {usable ? (
                  <>
                    <div className="mb-4 flex items-center gap-3">
                      {p.inviter?.avatarUrl
                        ? <img src={p.inviter.avatarUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                        : <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: GREEN }} aria-hidden="true">{who ? initials(who) : <InviteIcon className="h-6 w-6" />}</div>}
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-stone-900">{who ?? 'A BeWatu member'}</p>
                        {p.inviter?.headline && <p className="truncate text-sm text-stone-600">{p.inviter.headline}</p>}
                      </div>
                    </div>
                    <h1 className="text-balance text-[22px] font-extrabold leading-tight tracking-tight text-stone-900">
                      {who ? `${who.split(/\s+/)[0]} invited you` : 'You\'ve been invited'} {WHAT[p.purpose ?? 'connect']}
                    </h1>
                    <p className="mt-1 text-sm text-stone-600">Good connections make great things possible.</p>

                    {p.message && <blockquote className="mt-4 whitespace-pre-wrap rounded-2xl bg-stone-50 p-4 text-[15px] leading-relaxed text-stone-800">{p.message}</blockquote>}

                    {p.target && (
                      <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: BORDER }}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{p.target.kind === 'challenge' ? 'Arena challenge' : p.target.private ? 'Private Pod' : 'Pod'}</p>
                        <p className="mt-0.5 text-[15px] font-semibold text-stone-900">{p.target.name ?? 'A private Pod'}</p>
                        {p.target.private && <p className="mt-0.5 text-xs text-stone-600">Its details are shared once you're a member.</p>}
                      </div>
                    )}

                    <p className="mt-4 text-sm text-stone-700">{NEXT[p.action ?? 'explore']}</p>

                    <div className="mt-5 space-y-2.5">
                      {signedIn ? (
                        <button type="button" onClick={() => go('/')} className="min-h-[52px] w-full rounded-xl text-[15px] font-bold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ['--tw-ring-color' as any]: GREEN }}>Continue on BeWatu</button>
                      ) : (
                        <>
                          <button type="button" onClick={() => go('/register')} className="min-h-[52px] w-full rounded-xl text-[15px] font-bold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ['--tw-ring-color' as any]: GREEN }}>Create my free account</button>
                          <button type="button" onClick={() => go('/login')} className="min-h-[48px] w-full rounded-xl border text-[15px] font-semibold focus:outline-none focus-visible:ring-2" style={{ borderColor: GREEN, color: GREEN, ['--tw-ring-color' as any]: GREEN }}>I already have an account</button>
                        </>
                      )}
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-stone-600">Signing up never shares your details with {who ? who.split(/\s+/)[0] : 'them'}. Your invitation is kept while you sign up and is waiting for you when you're in.</p>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><InviteIcon className="h-6 w-6" /></div>
                    <h1 className="text-xl font-extrabold text-stone-900">
                      {p.state === 'expired' ? 'This invitation has expired' : p.state === 'revoked' ? 'This invitation was withdrawn' : p.state === 'used' ? 'This invitation has been used' : p.state === 'busy' ? 'We couldn\'t open this just now' : 'This invitation link isn\'t valid'}
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-stone-700">
                      {p.state === 'busy' ? (p.error ?? 'Please try again in a moment.') : 'You can still join BeWatu, or ask the person who invited you to send a new link.'}
                    </p>
                    <div className="mt-5 space-y-2.5">
                      {p.state === 'busy'
                        ? <button type="button" onClick={() => window.location.reload()} className="min-h-[48px] w-full rounded-xl text-[15px] font-bold text-white" style={{ backgroundColor: GREEN }}>Try again</button>
                        : <button type="button" onClick={() => { window.location.href = signedIn ? '/' : '/register'; }} className="min-h-[48px] w-full rounded-xl text-[15px] font-bold text-white" style={{ backgroundColor: GREEN }}>{signedIn ? 'Go to BeWatu' : 'Join BeWatu'}</button>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {p?.state === 'ok' && <p className="mt-4 text-center text-xs text-stone-600">{purposeLabel(p.purpose ?? 'connect')} · This invitation expires {p.expiresAt ? new Date(p.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : 'soon'}</p>}
        </div>
      </main>
    </div>
  );
};

export default InvitePage;
