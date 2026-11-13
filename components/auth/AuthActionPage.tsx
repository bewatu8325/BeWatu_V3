/**
 * components/auth/AuthActionPage.tsx
 * Where the links in BeWatu's account emails land: /auth/action?mode=verifyEmail|resetPassword&oobCode=...
 * (the emails come from api/auth-email.ts). Firebase used to host this page on its own domain; it is BeWatu's now.
 *
 * Rendered outside the signed-in app (App.tsx), because the person opening a reset link is by definition not signed in.
 * The one-time code is read once and then removed from the address bar, so it is not left in history or copied along with the page.
 */
import React, { useEffect, useRef, useState } from 'react';
import { applyActionCode, verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { LogoIcon } from '../../constants';

type View =
  | { s: 'working'; what: string }
  | { s: 'verified' }
  | { s: 'reset'; email: string }
  | { s: 'reset-done' }
  | { s: 'problem'; message: string };

export const MIN_PASSWORD = 6;   // the same minimum as sign-up

/** What went wrong, in words that say what to do next. */
export function actionProblem(e: any): string {
  switch (e?.code) {
    case 'auth/expired-action-code': return 'This link has expired. Ask for a new one and open it soon after it arrives.';
    case 'auth/invalid-action-code': return 'This link is not valid, or it has already been used. Ask for a new one.';
    case 'auth/user-disabled': return 'This account has been disabled. Contact support@bewatu.com.';
    case 'auth/weak-password': return `Choose a longer password (at least ${MIN_PASSWORD} characters).`;
    case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
    default: return 'Something went wrong. Please try again.';
  }
}

const GREEN = 'var(--bw-green)';

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: '#f5f5f4' }}>
    <a href="/" aria-label="BeWatu home" className="mb-8 hover:opacity-80 transition-opacity"><LogoIcon className="h-10 w-auto" style={{ color: GREEN }} /></a>
    <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">{children}</div>
    <p className="mt-6 text-xs text-stone-600">Need help? <a className="font-semibold underline" href="mailto:support@bewatu.com">support@bewatu.com</a></p>
  </div>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...p }) => (
  <button {...p} className="w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: GREEN }}>{children}</button>
);

const AuthActionPage: React.FC = () => {
  const [view, setView] = useState<View>({ s: 'working', what: 'Checking your link…' });
  const code = useRef<string>('');
  const started = useRef(false);   // a one-time code can be redeemed once; React may run effects twice in development
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (started.current) return; started.current = true;
    const q = new URLSearchParams(window.location.search);
    const mode = q.get('mode'), oob = q.get('oobCode') ?? '';
    window.history.replaceState(null, '', '/auth/action');
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex'; document.head.appendChild(robots);
    if (!oob || (mode !== 'verifyEmail' && mode !== 'resetPassword')) { setView({ s: 'problem', message: 'This link is incomplete. Open it again from your email, or ask for a new one.' }); return; }
    code.current = oob;
    (async () => {
      try {
        if (mode === 'verifyEmail') {
          setView({ s: 'working', what: 'Confirming your email…' });
          await applyActionCode(auth, oob);
          try { await auth.currentUser?.reload(); } catch { /* signed out here: the account page will read the new state when they sign in */ }
          setView({ s: 'verified' });
        } else {
          const email = await verifyPasswordResetCode(auth, oob);
          setView({ s: 'reset', email });
        }
      } catch (e) { setView({ s: 'problem', message: actionProblem(e) }); }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < MIN_PASSWORD) { setFormError(`Use at least ${MIN_PASSWORD} characters.`); return; }
    if (pw !== pw2) { setFormError('The two passwords do not match.'); return; }
    setFormError(''); setBusy(true);
    try { await confirmPasswordReset(auth, code.current, pw); setView({ s: 'reset-done' }); }
    catch (err) { setFormError(actionProblem(err)); }
    finally { setBusy(false); }
  }

  if (view.s === 'working') return <Card><p role="status" className="text-center text-sm text-stone-600">{view.what}</p></Card>;

  if (view.s === 'verified') return (
    <Card>
      <h1 className="text-2xl font-bold text-stone-900 mb-2">Email confirmed</h1>
      <p className="text-sm text-stone-600 leading-relaxed mb-6">Thanks. Your email address is verified, so you can now recover your account if you ever lose your password.</p>
      <Button onClick={() => window.location.assign('/')}>Continue to BeWatu</Button>
    </Card>
  );

  if (view.s === 'reset-done') return (
    <Card>
      <h1 className="text-2xl font-bold text-stone-900 mb-2">Password updated</h1>
      <p className="text-sm text-stone-600 leading-relaxed mb-6">Your password has been changed. Sign in with the new one.</p>
      <Button onClick={() => window.location.assign('/login')}>Sign in</Button>
    </Card>
  );

  if (view.s === 'reset') return (
    <Card>
      <h1 className="text-2xl font-bold text-stone-900 mb-1">Choose a new password</h1>
      <p className="text-sm text-stone-600 mb-5">For <strong className="text-stone-700 break-all">{view.email}</strong></p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="np" className="block text-xs font-semibold text-stone-700 mb-1">New password</label>
          <input id="np" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }} />
        </div>
        <div>
          <label htmlFor="np2" className="block text-xs font-semibold text-stone-700 mb-1">Confirm new password</label>
          <input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }} />
        </div>
        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</Button>
      </form>
    </Card>
  );

  return (
    <Card>
      <h1 className="text-2xl font-bold text-stone-900 mb-2">We could not open that link</h1>
      <p role="alert" className="text-sm text-stone-600 leading-relaxed mb-6">{view.message}</p>
      <div className="space-y-3">
        <Button onClick={() => window.location.assign('/login')}>Go to sign in</Button>
        <p className="text-center text-xs text-stone-600">Reset links: use “Forgot password” on the sign-in page. Verification links: open Settings, then Security.</p>
      </div>
    </Card>
  );
};

export default AuthActionPage;
