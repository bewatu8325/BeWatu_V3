/**
 * components/invite/InvitePage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The page at /invite/:token. It is a personal note from one professional to another, not a product page: who invited you, what
 * they wrote, one thing to do. Signed out or in.
 *
 * What pressing "Accept invitation" does is decided by the server, never by this page:
 *   - an emailed invitation names one person, so accepting connects the two of you;
 *   - a personal link can be opened by many, so accepting sends the inviter a request to approve (the page says so first);
 *   - nothing is shown as done until the server has answered that it is done.
 * Signed out, "Accept" remembers that the person chose to accept (for a day) and takes them through sign-up or sign-in; the app then
 * finishes it (InviteResume) without a second tap. Opening the link alone never accepts anything.
 *
 * Who is shown (name, photo, headline) follows the inviter's own privacy: only when their profile is public. The personal note is
 * the inviter's to share with the person they sent it to, and appears only here, never in link previews.
 *
 * Mounted outside the Firebase provider like /be and /endorse. Also rendered over the signed-in app right after sign-up or sign-in
 * (`embedded`), so there is no jump between the two.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { LogoIcon } from '../../constants';
import {
  acceptInvitation, acceptLabel, acceptNote, checkInvitation, clearPending, deviceStore, fetchPreview, fineprint, firstName, headline,
  reportStarted, savePending, signInLabel, stateScreen, successScreen, valueLine,
  type AcceptResult, type CheckResult, type CheckState, type Preview, type Screen,
} from '../../lib/invitations';

const BG = '#f0ede6', GREEN = 'var(--bw-green)', GREEN_LT = 'var(--bw-green-light)';
const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const ring = { ['--tw-ring-color' as any]: GREEN };

const initials = (n: string) => n.split(/\s+/).map(x => x[0]).join('').toUpperCase().slice(0, 2) || 'BW';
const ERROR_STATES = new Set(['expired', 'revoked', 'used', 'unavailable', 'own', 'invalid']);

export interface InvitePageEmbedded {
  /** The person already pressed Accept before signing up or in: finish it now, without asking again. */
  autoAccept: boolean;
  onExplore: () => void;
  /** "Not now": leave without accepting (the invitation is forgotten on this device; the link or email still works). */
  onDismiss: () => void;
  onViewProfile: (who: { numericId: number | null; username: string | null }) => void;
}

export const InvitePage: React.FC<{ token: string; embedded?: InvitePageEmbedded }> = ({ token, embedded }) => {
  const [p, setP] = useState<Preview | null>(null);
  const [auth, setAuth] = useState<'unknown' | 'out' | 'in'>(embedded ? 'in' : 'unknown');
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [phase, setPhase] = useState<'view' | 'accepting' | 'done'>('view');
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [forced, setForced] = useState<CheckState | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const authKnown = useRef<Promise<boolean>>(Promise.resolve(false));
  const autoRan = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A private page: no search engines, no referrer to anything it loads.
  useEffect(() => {
    const prev = document.title; document.title = "You're invited to BeWatu";
    const tags = [['robots', 'noindex, nofollow, noarchive'], ['referrer', 'no-referrer']].map(([name, content]) => { const m = document.createElement('meta'); m.name = name; m.content = content; document.head.appendChild(m); return m; });
    return () => { document.title = prev; tags.forEach(m => m.remove()); };
  }, []);

  useEffect(() => { let live = true; setP(null); fetchPreview(token, !!embedded).then(r => { if (live) setP(r); }); return () => { live = false; }; }, [token, attempt]);

  // Is this browser signed in? (Resolves once, so a tap never races the answer.)
  useEffect(() => {
    if (embedded) return;
    let off = () => {}; let settle: (v: boolean) => void = () => {};
    authKnown.current = new Promise<boolean>(r => { settle = r; setTimeout(() => r(false), 2500); });
    import('../../lib/firebase').then(({ auth: a }) => { off = a.onAuthStateChanged(u => { setAuth(u ? 'in' : 'out'); settle(!!u); }); }).catch(() => { setAuth('out'); settle(false); });
    return () => off();
  }, [embedded]);

  // Signed in: where does THIS person stand (already accepted, already connected, their own...)?
  useEffect(() => {
    if (auth !== 'in' || !p) return;
    let live = true;
    checkInvitation(token).then(r => { if (live) setCheck(r); }).catch(() => {});
    return () => { live = false; };
  }, [auth, p, token]);

  const first = firstName(p?.inviter?.name);
  const purpose = p?.purpose ?? 'connect';

  const accept = useCallback(async () => {
    if (!p || p.state !== 'ok') return;
    const signedIn = embedded ? true : await authKnown.current;
    if (purpose !== 'connect') {
      // A Pod or Arena invitation keeps its own step (asking to join, opening the challenge); the app offers it once they are in.
      savePending(deviceStore(), token); reportStarted(token);
      window.location.href = signedIn ? '/' : '/register'; return;
    }
    if (!signedIn) {
      savePending(deviceStore(), token, Date.now(), true);          // "I chose to accept", good for a day
      reportStarted(token, { intent: 'accept', path: 'register' });
      window.location.href = '/register'; return;
    }
    reportStarted(token, { intent: 'accept', path: null });
    setPhase('accepting'); setError('');
    try {
      const r = await acceptInvitation(token);
      clearPending(deviceStore());
      setResult(r); setPhase('done');
    } catch (e: any) {
      setPhase('view');
      if (e?.state && ERROR_STATES.has(e.state)) { clearPending(deviceStore()); setForced(e.state); }
      else if (e?.status === 401) { setAuth('out'); setError('Please sign in again to accept.'); }
      else setError(e?.status && e.status < 500 && e.message ? e.message : "That didn't go through. Please try again.");
    }
  }, [p, purpose, token, embedded]);

  const signIn = () => {
    savePending(deviceStore(), token, Date.now(), purpose === 'connect');   // the button says "Sign in to accept"
    if (purpose === 'connect') reportStarted(token, { intent: 'accept', path: 'login' }); else reportStarted(token);
    window.location.href = '/login';
  };

  // They pressed Accept before signing up or in: complete it as soon as we know it can be done.
  useEffect(() => {
    if (!embedded?.autoAccept || autoRan.current || p?.state !== 'ok' || !check || check.state !== 'ok') return;
    autoRan.current = true; accept();
  }, [embedded?.autoAccept, p, check, accept]);

  const profile = (r: { numericId: number | null; username: string | null } | null | undefined) => {
    if (embedded) { if (r) embedded.onViewProfile(r); else embedded.onExplore(); return; }
    window.location.href = r?.username ? `/be/${encodeURIComponent(r.username)}` : '/';
  };
  const onward = (to: NonNullable<Screen['action']>['to'], who?: { numericId: number | null; username: string | null } | null) => {
    if (to === 'retry') { setAttempt(a => a + 1); return; }
    if (to === 'join') { window.location.href = '/register'; return; }
    if (to === 'profile') { profile(who ?? result?.inviter ?? check?.inviter); return; }
    if (embedded) embedded.onExplore(); else window.location.href = '/';
  };

  // Which screen? A result from the server beats everything; then what this person's own account says; then the invitation itself.
  const screen: Screen | null = phase === 'done' && result?.connection ? successScreen(result.connection, firstName(result.inviter?.name) || first)
    : phase === 'done' ? null
    : forced ? stateScreen(forced, first, auth === 'in')
    : auth === 'in' && check && check.state !== 'ok' ? stateScreen(check.state, firstName(check.inviter?.name) || first, true)
    : p && p.state !== 'ok' ? stateScreen(p.state, first, auth === 'in', p.error)
    : null;
  const done = phase === 'done';
  const usable = p?.state === 'ok';
  const screenKey = screen ? screen.title : 'invitation';
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [screenKey]);

  const connected = result?.connection === 'connected' || result?.connection === 'already_connected';
  const label = done ? (connected ? 'Connected' : 'Accepted') : screen ? 'Your invitation' : 'A personal invitation';

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: BG }}>
      <header className="px-5 pb-2 sm:px-8" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <a href="/" aria-label="BeWatu home" className="inline-block rounded focus:outline-none focus-visible:ring-2" style={ring}><LogoIcon className="h-7 w-auto" style={{ color: GREEN }} /></a>
      </header>

      <main className="flex-1 px-5 pt-4 sm:px-8 sm:pt-12" style={{ paddingBottom: 'max(3rem, calc(env(safe-area-inset-bottom) + 2rem))' }}>
        <div className="mx-auto w-full max-w-md">
          {!p && (
            <div className="animate-pulse" role="status" aria-label="Opening your invitation">
              <div className="mb-4 h-3 w-32 rounded bg-stone-300/60" /><div className="mb-2 h-8 w-4/5 rounded bg-stone-300/60" /><div className="mb-6 h-8 w-3/5 rounded bg-stone-300/60" />
              <div className="mb-6 flex items-center gap-3"><div className="h-12 w-12 rounded-full bg-stone-300/60" /><div className="h-4 w-40 rounded bg-stone-300/60" /></div>
              <div className="h-14 w-full rounded-xl bg-stone-300/60" />
            </div>
          )}

          {p && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: GREEN }}>{label}</p>

              {/* a state, or the confirmation */}
              {(screen || done) && (
                <section aria-live="polite" className="mt-3">
                  {done && !screen && <ConfirmedFallback hRef={headingRef} onHome={() => onward('home')} />}
                  {screen && (
                    <>
                      {done && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: GREEN_LT, color: GREEN }} aria-hidden="true"><CheckCircle2 className="h-7 w-7" /></div>}
                      <h1 ref={headingRef} tabIndex={-1} className="text-balance text-[28px] font-extrabold leading-[1.12] tracking-tight text-stone-900 outline-none sm:text-[32px]">{screen.title}</h1>
                      <p className="mt-3 text-[16px] leading-relaxed text-stone-700">{screen.body}</p>
                      <div className="mt-7 space-y-1">
                        {screen.action && <button type="button" onClick={() => onward(screen.action!.to)} className="min-h-[52px] w-full rounded-xl text-[16px] font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ backgroundColor: GREEN, ...ring }}>{screen.action.label}</button>}
                        {screen.secondary && <button type="button" onClick={() => onward(screen.secondary!.to)} className="min-h-[48px] w-full rounded-xl border-2 text-[15px] font-semibold focus:outline-none focus-visible:ring-2" style={{ borderColor: GREEN, color: GREEN, ...ring }}>{screen.secondary.label}</button>}
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* the invitation itself */}
              {!screen && !done && usable && (
                <>
                  <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-balance text-[28px] font-extrabold leading-[1.12] tracking-tight text-stone-900 outline-none sm:text-[32px]">{headline(purpose, first)}</h1>

                  <div className="mt-5 flex items-center gap-3">
                    {p.inviter?.avatarUrl
                      ? <img src={p.inviter.avatarUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                      : <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ backgroundColor: GREEN }} aria-hidden="true">{p.inviter?.name ? initials(p.inviter.name) : 'BW'}</div>}
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-bold text-stone-900">{p.inviter?.name ?? 'A BeWatu member'}</p>
                      {p.inviter?.headline && <p className="truncate text-[14px] text-stone-600">{p.inviter.headline}</p>}
                    </div>
                  </div>

                  {p.message && <p className="mt-5 whitespace-pre-wrap text-[19px] leading-[1.55] text-stone-800" style={{ fontFamily: SERIF }}><span aria-hidden="true">“</span>{p.message}<span aria-hidden="true">”</span></p>}

                  <p className="mt-5 text-[15px] leading-relaxed text-stone-700">{valueLine(purpose, first)}</p>

                  {p.target && (
                    <p className="mt-3 text-[14px] text-stone-700"><span className="font-semibold">{p.target.kind === 'challenge' ? 'Arena challenge' : p.target.private ? 'Private Pod' : 'Pod'}:</span> {p.target.name ?? 'Details are shared once you are a member.'}</p>
                  )}

                  <div className="mt-7">
                    <button type="button" onClick={accept} disabled={phase === 'accepting'} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-[16px] font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-70" style={{ backgroundColor: GREEN, ...ring }}>
                      {phase === 'accepting' && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                      {phase === 'accepting' ? (embedded?.autoAccept ? `Connecting you with ${first || 'them'}…` : 'Accepting…') : acceptLabel(purpose, auth === 'in')}
                    </button>
                    <p className="mt-2 text-center text-[13px] leading-snug text-stone-700">{acceptNote(purpose, p.mode, first, p.action)}</p>
                    {error && <p role="alert" className="mt-3 text-center text-[14px] font-medium text-red-800">{error}</p>}
                    {embedded && phase !== 'accepting' && (
                      <button type="button" onClick={embedded.onDismiss} className="mt-2 min-h-[44px] w-full rounded-xl text-[15px] font-semibold text-stone-700 focus:outline-none focus-visible:ring-2" style={ring}>Not now</button>
                    )}
                    {auth === 'out' && !embedded && (
                      <button type="button" onClick={signIn} className="mt-2 min-h-[44px] w-full rounded-xl text-[15px] font-semibold underline decoration-1 underline-offset-4 focus:outline-none focus-visible:ring-2" style={{ color: GREEN, ...ring }}>{signInLabel(purpose)}</button>
                    )}
                  </div>

                  <p className="mt-5 text-center text-[12px] leading-relaxed text-stone-600">{fineprint(purpose, first, p.expiresAt)}</p>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

/** Only if the server confirmed an acceptance without saying what it did (it always does; this keeps the page honest if it ever does not). */
const ConfirmedFallback: React.FC<{ hRef: React.RefObject<HTMLHeadingElement>; onHome: () => void }> = ({ hRef, onHome }) => (
  <>
    <h1 ref={hRef} tabIndex={-1} className="text-[28px] font-extrabold leading-[1.12] tracking-tight text-stone-900 outline-none">You're in.</h1>
    <p className="mt-3 text-[16px] leading-relaxed text-stone-700">Your invitation has been accepted.</p>
    <button type="button" onClick={onHome} className="mt-7 min-h-[52px] w-full rounded-xl text-[16px] font-bold text-white" style={{ backgroundColor: GREEN }}>Explore BeWatu</button>
  </>
);

export default InvitePage;
