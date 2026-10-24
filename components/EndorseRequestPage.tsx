/**
 * components/EndorseRequestPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders at /endorse/:token — no auth required.
 *
 * The anonymous half of the endorsement-request invite loop: a BeWatu member
 * asks a colleague (possibly not a member) to endorse a skill
 * (api/send-endorsement-request.ts emails this link). The colleague leaves
 * the endorsement here without creating an account — lowest friction for the
 * actual ask — then sees a "join BeWatu" prompt as the real conversion
 * moment, same pattern PublicSharePage.tsx's Shell already uses.
 *
 * States: loading | form | submitting | success | error (invalid/expired/done)
 *
 * Mounted by App.tsx when window.location.pathname matches /endorse/:token.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import { LogoIcon } from '../constants';

const BG        = '#f0ede6';
const BORDER    = '#e8e4dc';
const GREEN     = 'var(--bw-green)';
const GREEN_LT  = 'var(--bw-green-light)';
const GREEN_MID = 'var(--bw-green-mid)';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ backgroundColor: BG }}>
      <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: BG, borderColor: BORDER }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="/" aria-label="BeWatu home">
            <LogoIcon className="h-8 w-auto sm:h-9" style={{ color: GREEN }} />
          </a>
          <button onClick={() => { window.location.href = '/?signup=1'; }}
            className="rounded-full px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity sm:px-5"
            style={{ backgroundColor: GREEN }}>
            Sign up free
          </button>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm" style={{ borderColor: BORDER }}>
      <div className="h-1.5 w-full" style={{ backgroundColor: GREEN }} />
      <div className="px-6 py-8 sm:px-8">{children}</div>
    </div>
  );
}

type State =
  | { status: 'loading' }
  | { status: 'form'; requesterName: string; skillName: string }
  | { status: 'submitting'; requesterName: string; skillName: string }
  | { status: 'success'; requesterName: string }
  | { status: 'error'; message: string };

interface Props {
  token: string;
}

const EndorseRequestPage: React.FC<Props> = ({ token }) => {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    fetch(`/api/submit-endorsement?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) { setState({ status: 'error', message: data.error ?? 'This link is not valid.' }); return; }
        setState({ status: 'form', requesterName: data.requesterName, skillName: data.skillName });
      })
      .catch(() => setState({ status: 'error', message: 'Something went wrong loading this request.' }));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.status !== 'form' || !name.trim()) return;
    setState({ status: 'submitting', requesterName: state.requesterName, skillName: state.skillName });
    try {
      const res = await fetch('/api/submit-endorsement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setState({ status: 'error', message: data.error ?? 'Something went wrong. Please try again.' }); return; }
      setState({ status: 'success', requesterName: (state as any).requesterName });
    } catch {
      setState({ status: 'error', message: 'Something went wrong. Please try again.' });
    }
  };

  if (state.status === 'loading') {
    return (
      <Shell>
        <Card>
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-stone-100 rounded-lg w-3/4" />
            <div className="h-3 bg-stone-100 rounded-lg w-full" />
            <div className="h-3 bg-stone-100 rounded-lg w-5/6" />
          </div>
        </Card>
      </Shell>
    );
  }

  if (state.status === 'error') {
    return (
      <Shell>
        <Card>
          <h1 className="text-lg font-extrabold text-stone-900 mb-2">This link isn't available</h1>
          <p className="text-sm text-stone-600">{state.message}</p>
        </Card>
      </Shell>
    );
  }

  if (state.status === 'success') {
    return (
      <Shell>
        <Card>
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: GREEN_LT }}>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h1 className="text-lg font-extrabold text-stone-900 mb-1.5">Endorsement sent</h1>
            <p className="text-sm text-stone-600 mb-6">{state.requesterName} will see your endorsement on their BeWatu profile.</p>
            <div className="rounded-2xl p-5 text-left" style={{ backgroundColor: GREEN_LT }}>
              <p className="text-sm font-bold text-stone-900 mb-1.5">Have your own skills worth showing off?</p>
              <p className="text-xs text-stone-600 mb-4 leading-relaxed">
                BeWatu is where professionals build verified capability records and get endorsed by people who've actually worked with them.
              </p>
              <a href="/?signup=1"
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                Join free
              </a>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  // form | submitting
  return (
    <Shell>
      <Card>
        <h1 className="text-lg font-extrabold text-stone-900 mb-1.5">
          {state.requesterName} wants your endorsement
        </h1>
        <p className="text-sm text-stone-600 mb-6">
          Vouch for their <strong>{state.skillName}</strong> skill. No account needed — this takes a minute.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-stone-600 uppercase tracking-widest mb-1.5 block">Your name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              disabled={state.status === 'submitting'}
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: BORDER }} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-600 uppercase tracking-widest mb-1.5 block">Note (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500}
              disabled={state.status === 'submitting'}
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 resize-none"
              style={{ borderColor: BORDER }} placeholder={`What makes them great at ${state.skillName}?`} />
          </div>
          <button type="submit" disabled={state.status === 'submitting' || !name.trim()}
            className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            {state.status === 'submitting' ? 'Submitting…' : 'Leave endorsement'}
          </button>
        </form>
      </Card>
    </Shell>
  );
};

export default EndorseRequestPage;
