/**
 * components/investor/InvestorPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One page for the whole Investor membership journey, which shows what is true for this member right now:
 *   no application  → what it is and how it works, then the application (free);
 *   an application  → where it stands, what a reviewer said, how to answer or withdraw;
 *   approved        → "You're approved", with the price, the trial and how to cancel, and a separate, explicit activation;
 *   a membership    → its state (trial, active, ending, payment problem, ended) and billing management.
 * Nothing here charges anyone: payment happens on Stripe's own page, and only after the member confirms here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import InvestorApplication from './InvestorApplication';
import {
  APPLY_SUPPORT, ENTITLEMENT_COPY, PRICE, STATUS_HINT, STATUS_LABEL, TRIAL_DISCLOSURE, canActivate, fmtDate, isOpen, timeline, KINDS, LIMITS, type AppStatus,
} from '../../lib/investorMembership';
import { fetchInvestorState, investorApi, type InvestorState } from '../../lib/investorMembershipService';
import { trackInvestorApplicationStarted } from '../../lib/analytics/track';

const GREEN = 'var(--bw-green)';
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const primary = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-7 text-sm font-bold text-white disabled:opacity-60 ' + FOCUS;
const secondary = 'inline-flex min-h-[48px] items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60 ' + FOCUS;

interface Props { uid: string; onBack: () => void; onOpenInvestorTools?: () => void }

const Card: React.FC<{ children: React.ReactNode; tone?: 'plain' | 'green' }> = ({ children, tone = 'plain' }) => (
  <div className="rounded-2xl border p-5 sm:p-7" style={tone === 'green' ? { backgroundColor: '#f2f8f5', borderColor: '#cfe3d9' } : { backgroundColor: '#fff', borderColor: '#e7e5e4' }}>{children}</div>
);
const Pill: React.FC<{ status: AppStatus }> = ({ status }) => {
  const tone = status === 'approved' ? 'bg-emerald-100 text-emerald-900' : status === 'declined' ? 'bg-stone-200 text-stone-800' : status === 'needs_info' ? 'bg-amber-100 text-amber-900' : status === 'withdrawn' ? 'bg-stone-100 text-stone-600' : 'bg-stone-100 text-stone-800';
  return <span className={'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ' + tone}>{STATUS_LABEL[status]}</span>;
};

const HowItWorks: React.FC = () => (
  <ol className="mt-5 grid gap-3 sm:grid-cols-3">
    {[['Apply free', 'Tell us who you are and what you invest in. It takes a few minutes and you can save and come back.'], ['Get approved', 'A BeWatu reviewer looks at your application and writes to you with the decision.'], ['Choose when to activate', 'If you are approved, your membership starts only when you confirm it. Nothing is charged before then.']].map(([t, d], i) => (
      <li key={t} className="rounded-xl bg-stone-50 p-4"><p className="flex items-center gap-2 text-sm font-bold text-stone-900"><span className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-white" style={{ backgroundColor: GREEN }}>{i + 1}</span>{t}</p><p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{d}</p></li>
    ))}
  </ol>
);

const Timeline: React.FC<{ status: AppStatus }> = ({ status }) => (
  <ol className="flex items-start gap-1 sm:gap-2" aria-label="Where your application is">
    {timeline(status).map((s, i, a) => (
      <li key={s.id} className="flex flex-1 flex-col items-center text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
        <div className="flex w-full items-center">
          <span className={'h-px flex-1 ' + (i === 0 ? 'bg-transparent' : 'bg-stone-300')} aria-hidden="true" />
          <span className={'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ' + (s.state === 'todo' ? 'bg-stone-200 text-stone-600' : 'text-white')} style={s.state === 'todo' ? undefined : { backgroundColor: s.state === 'ended' ? '#78716c' : GREEN }}>{s.state === 'done' ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}</span>
          <span className={'h-px flex-1 ' + (i === a.length - 1 ? 'bg-transparent' : 'bg-stone-300')} aria-hidden="true" />
        </div>
        <span className={'mt-2 px-0.5 text-[11px] leading-tight sm:text-xs ' + (s.state === 'current' ? 'font-bold text-stone-900' : 'text-stone-600')}>{s.label}</span>
      </li>
    ))}
  </ol>
);

export const InvestorPage: React.FC<Props> = ({ uid, onBack, onOpenInvestorTools }) => {
  const [st, setSt] = useState<InvestorState | null>(null);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState('');
  const [answer, setAnswer] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [actionError, setActionError] = useState('');
  const poll = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => { setError(''); try { const s = await fetchInvestorState(); setSt(s); return s; } catch (e: any) { setError(e.message); return null; } }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); load(); }, [load]);

  // Coming back from Stripe: the subscription arrives by webhook a moment after the page does, so wait for it (briefly) instead of showing stale news.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('checkout') !== 'success') return;
    setWaiting(true); let n = 0;
    poll.current = setInterval(async () => {
      n++; const s = await load();
      if ((s && s.entitlement.entitled) || n >= 15) { clearInterval(poll.current); setWaiting(false); window.history.replaceState(null, '', window.location.pathname); }
    }, 2000);
    return () => clearInterval(poll.current);
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setActionError(''); try { await fn(); } catch (e: any) { setActionError(e.message); } finally { setBusy(''); } };
  const activate = () => run('activate', async () => { const r = await investorApi<{ url: string }>({ action: 'activate', confirm: true, terms: true }); window.location.href = r.url; });
  const portal = () => run('portal', async () => { const r = await investorApi<{ url: string }>({ action: 'portal' }); window.location.href = r.url; });
  const withdraw = () => { if (!window.confirm('Withdraw your application? You can apply again later.')) return; run('withdraw', async () => { await investorApi({ action: 'withdraw' }); await load(); }); };
  const sendAnswer = () => run('answer', async () => { await investorApi({ action: 'provide_info', message: answer }); setAnswer(''); await load(); });

  const header = (
    <header className="mb-6">
      <button type="button" onClick={onBack} className={'-ml-2 mb-3 inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100 ' + FOCUS} style={ring}>← Back</button>
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-stone-600">Investor membership</p>
      <h1 className="mt-1 font-serif text-[2rem] font-semibold leading-tight text-stone-900 sm:text-[2.4rem]">Investor access</h1>
    </header>
  );

  if (error && !st) return <div className="mx-auto max-w-2xl px-4 py-8">{header}<div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{error} <button type="button" onClick={load} className="font-semibold underline">Try again</button></div></div>;
  if (!st) return <div className="mx-auto max-w-2xl px-4 py-8" aria-busy="true">{header}<div className="h-56 animate-pulse rounded-2xl bg-stone-100" role="status"><span className="sr-only">Loading</span></div></div>;

  const app = st.application, e = st.entitlement, m = st.membership;
  const copy = ENTITLEMENT_COPY[e.state];
  const approved = st.approval.status === 'approved', revoked = st.approval.status === 'revoked';
  const waitingBanner = waiting && <div role="status" className="mb-5 flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Finishing your activation. This takes a moment.</div>;
  const errorBox = actionError && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{actionError}</p>;

  // ── a membership exists (or approval was withdrawn) ──
  if (approved || revoked) {
    const live = e.entitled, canStart = canActivate(e, m);
    const trialLeft = !m.trialUsed;
    return (
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">{header}{waitingBanner}
        <Card tone={live || canStart ? 'green' : 'plain'}>
          <h2 className="font-serif text-[1.7rem] font-semibold leading-tight text-stone-900">{copy.title}</h2>
          <p className="mt-2 text-[16px] leading-relaxed text-stone-700">{copy.body}</p>

          {e.state === 'trial' && <p className="mt-3 text-sm text-stone-700">Your trial ends on <strong>{fmtDate(m.trialEnd)}</strong>. After that it is {`$${PRICE.monthly}`}/month unless you cancel first.</p>}
          {e.state === 'active' && <p className="mt-3 text-sm text-stone-700">Renews on <strong>{fmtDate(m.currentPeriodEnd)}</strong> at {`$${PRICE.monthly}`}/month.</p>}
          {e.state === 'ending' && <p className="mt-3 text-sm text-stone-700">Access until <strong>{fmtDate(e.until)}</strong>. You will not be charged again.</p>}
          {e.state === 'payment_grace' && <p className="mt-3 text-sm text-stone-700">Access continues until <strong>{fmtDate(e.until)}</strong> while we retry.</p>}

          {canStart && (
            <div className="mt-6 space-y-5">
              <dl className="grid gap-4 rounded-xl bg-white p-4 text-sm sm:grid-cols-3">
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-stone-600">Plan</dt><dd className="mt-1 font-serif text-2xl font-semibold text-stone-900">${PRICE.monthly}<span className="text-sm font-sans font-normal text-stone-600"> / month</span></dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-stone-600">Billed</dt><dd className="mt-1 text-stone-800">Monthly, by card, through Stripe</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-stone-600">Trial</dt><dd className="mt-1 text-stone-800">{trialLeft ? `${PRICE.trialDays} days, starting when you confirm` : 'Already used. Billing starts when you confirm.'}</dd></div>
              </dl>
              <div className="text-sm leading-relaxed text-stone-700">
                <p className="font-semibold text-stone-900">Before you confirm</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5">
                  <li>Nothing has been charged. {trialLeft ? `Your card is not charged during the ${PRICE.trialDays}-day trial.` : 'Your card is charged when you confirm.'}</li>
                  <li>{trialLeft ? `After the trial it renews at $${PRICE.monthly} a month` : `It renews at $${PRICE.monthly} a month`} until you cancel. You will get receipts by email.</li>
                  <li>Cancel any time from your billing page. You keep access to the end of the period you have paid for.</li>
                  <li>Membership is not a check that you are accredited, and it does not make you eligible for any particular investment.</li>
                </ul>
                <p className="mt-4 font-semibold text-stone-900">What opens up</p>
                <p className="mt-1">The Investor tools in Factory: deal flow, a watchlist, startup scores, funding offers and demo requests. We only show real startups; nothing is made up.</p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-300 bg-white p-3.5">
                <input type="checkbox" checked={confirm} onChange={ev => setConfirm(ev.target.checked)} className="mt-1 h-4 w-4 flex-shrink-0" />
                <span className="text-sm leading-relaxed text-stone-800">I understand the price, {trialLeft ? 'the trial, ' : ''}the renewal and how to cancel, and I want to {trialLeft ? 'start my trial' : 'activate my membership'} now.</span>
              </label>
              <button type="button" onClick={activate} disabled={!confirm || busy === 'activate'} className={primary} style={{ backgroundColor: GREEN, ...ring }}>{busy === 'activate' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{trialLeft ? 'Activate membership and start trial' : 'Activate membership'}</button>
              <p className="text-xs text-stone-600">You will confirm your card on Stripe's secure page.</p>
            </div>
          )}

          {(live || e.state === 'payment_failed') && (
            <div className="mt-6 flex flex-wrap gap-3">
              {live && onOpenInvestorTools && <button type="button" onClick={onOpenInvestorTools} className={primary} style={{ backgroundColor: GREEN, ...ring }}>Open Investor tools</button>}
              {m.hasCustomer && <button type="button" onClick={portal} disabled={busy === 'portal'} className={secondary} style={ring}>{busy === 'portal' ? 'Opening…' : e.state === 'payment_grace' || e.state === 'payment_failed' ? 'Update payment method' : 'Manage billing'}</button>}
            </div>
          )}
          {e.state === 'ended' && m.hasCustomer && <div className="mt-4"><button type="button" onClick={portal} disabled={busy === 'portal'} className={secondary} style={ring}>View invoices and receipts</button></div>}
          {live && <p className="mt-4 text-xs text-stone-600">Manage billing opens Stripe, where you can change your card, cancel, and download invoices and receipts.</p>}
          {errorBox}
        </Card>
      </div>
    );
  }

  // ── an application exists ──
  if (app && !applying) {
    const open = isOpen(app.status);
    const again = app.status === 'declined' || app.status === 'withdrawn';
    const cool = st.cooldownUntil;
    {
      return (
        <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">{header}
          <Card>
            <div className="flex flex-wrap items-center gap-3"><h2 className="font-serif text-[1.6rem] font-semibold text-stone-900">Your application</h2><Pill status={app.status} /></div>
            <p className="mt-2 text-[15px] leading-relaxed text-stone-700">{STATUS_HINT[app.status]}</p>
            <div className="mt-6"><Timeline status={app.status} /></div>

            {app.applicantMessage && (app.status === 'needs_info' || app.status === 'declined') && (
              <blockquote className="mt-6 rounded-xl border-l-4 bg-stone-50 px-4 py-3 text-[15px] leading-relaxed text-stone-800" style={{ borderColor: GREEN }}><p className="text-xs font-semibold uppercase tracking-wider text-stone-600">From the reviewer</p><p className="mt-1 whitespace-pre-wrap">{app.applicantMessage}</p></blockquote>
            )}
            {app.status === 'needs_info' && (
              <div className="mt-5">
                <label htmlFor="inv-answer" className="mb-1.5 block text-sm font-semibold text-stone-900">Your answer</label>
                <textarea id="inv-answer" rows={4} maxLength={LIMITS.message.max} value={answer} onChange={ev => setAnswer(ev.target.value)} className="block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-[15px] focus:outline-none focus-visible:ring-2" style={ring} />
                <button type="button" onClick={sendAnswer} disabled={answer.trim().length < LIMITS.message.min || busy === 'answer'} className={primary + ' mt-3'} style={{ backgroundColor: GREEN, ...ring }}>{busy === 'answer' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Send to the reviewer</button>
              </div>
            )}
            {app.additionalInfo.length > 0 && <p className="mt-4 text-xs text-stone-600">You have sent {app.additionalInfo.length} {app.additionalInfo.length === 1 ? 'answer' : 'answers'} so far.</p>}

            <p className="mt-5 text-sm text-stone-600">While you wait, everything else in BeWatu works as usual. Applying is free, and nothing is charged.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {open && <button type="button" onClick={withdraw} disabled={busy === 'withdraw'} className={secondary} style={ring}>Withdraw application</button>}
              {again && (!cool
                ? <button type="button" onClick={() => setApplying(true)} className={primary} style={{ backgroundColor: GREEN, ...ring }}>Apply again</button>
                : <p className="text-sm text-stone-700">You can apply again from <strong>{fmtDate(cool)}</strong>.</p>)}
            </div>
            {errorBox}
            <details className="mt-6 rounded-xl border border-stone-200 p-4 text-sm text-stone-700">
              <summary className={'cursor-pointer font-semibold text-stone-900 ' + FOCUS} style={ring}>What you submitted</summary>
              <dl className="mt-3 space-y-2">
                <div><dt className="font-semibold">Investor</dt><dd>{KINDS.find(k => k.id === app.form.kind)?.label}{app.form.organization ? `: ${app.form.role}, ${app.form.organization}` : ''}</dd></div>
                <div><dt className="font-semibold">Background</dt><dd className="whitespace-pre-wrap">{app.form.background}</dd></div>
                <div><dt className="font-semibold">Interests</dt><dd>{[...app.form.sectors, ...app.form.stages, ...app.form.geographies].join(', ')}</dd></div>
              </dl>
            </details>
          </Card>
        </div>
      );
    }
  }

  // ── no application yet (or applying again) ──
  return (
    <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">{header}
      {!applying ? (
        <Card>
          <h2 className="font-serif text-[1.6rem] font-semibold leading-tight text-stone-900">Apply for Investor access</h2>
          <p className="mt-2 text-[16px] leading-relaxed text-stone-700">Investor membership is ${PRICE.monthly} a month and needs approval before you get access. Applying costs nothing.</p>
          <p className="mt-2 text-sm text-stone-600">{TRIAL_DISCLOSURE}</p>
          <HowItWorks />
          <p className="mt-5 text-sm text-stone-600">{APPLY_SUPPORT}</p>
          <div className="mt-5"><button type="button" onClick={() => setApplying(true)} className={primary} style={{ backgroundColor: GREEN, ...ring }}>{st.draft ? 'Continue your application' : 'Start application'}</button></div>
          {st.draft && <p className="mt-2 text-xs text-stone-600">Your draft was saved{st.draft.updatedAt ? ` on ${fmtDate(st.draft.updatedAt)}` : ''}.</p>}
        </Card>
      ) : (
        <InvestorApplication initial={st.draft?.form ?? null} emailVerified={st.emailVerified} onStarted={() => trackInvestorApplicationStarted(uid)} onCancel={() => setApplying(false)} onSubmitted={async () => { setApplying(false); await load(); }} />
      )}
    </div>
  );
};

export default InvestorPage;
