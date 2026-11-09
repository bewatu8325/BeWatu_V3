/**
 * components/investor/InvestorApplication.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Investor application, in three short steps: who you are, what you invest in, and the declarations before you submit.
 * Applying is free and nothing here asks for payment. Only what the review needs is collected: no identity documents, no
 * financial statements. The draft is saved to the member's account as they go (and when they leave a step), so they can stop and
 * come back from any device.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, ShieldCheck } from 'lucide-react';
import {
  DECLARATION_TEXT, GEOGRAPHIES, KINDS, LIMITS, SECTORS, STAGES, STEPS, allProblems, emptyForm, firstProblem, stepProblems, toForm,
  type ApplicationForm, type Declarations, type Step,
} from '../../lib/investorMembership';
import { investorApi } from '../../lib/investorMembershipService';

const GREEN = 'var(--bw-green)';
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const input = 'block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-[15px] text-stone-900 placeholder:text-stone-500 ' + FOCUS;

interface Props {
  initial: Partial<ApplicationForm> | null; emailVerified: boolean;
  onStarted: () => void; onSubmitted: () => void; onCancel: () => void;
}

const Field: React.FC<{ id: string; label: string; hint?: string; error?: string; optional?: boolean; children: React.ReactNode }> = ({ id, label, hint, error, optional, children }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-stone-900">{label}{optional && <span className="ml-1.5 font-normal text-stone-500">Optional</span>}</label>
    {children}
    {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-stone-600">{hint}</p>}
    {error && <p id={id + '-err'} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{error}</p>}
  </div>
);

const Chips: React.FC<{ legend: string; items: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; error?: string }> = ({ legend, items, value, onChange, error }) => (
  <fieldset>
    <legend className="mb-2 text-sm font-semibold text-stone-900">{legend}</legend>
    <div className="flex flex-wrap gap-2">
      {items.map(i => { const on = value.includes(i.id); return (
        <button key={i.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== i.id) : [...value, i.id])}
          className={'min-h-[44px] rounded-full border px-4 text-sm font-semibold transition-colors ' + FOCUS} style={{ borderColor: on ? GREEN : '#d6d3d1', backgroundColor: on ? 'var(--bw-green-light)' : '#fff', color: on ? GREEN : '#44403c', ...ring }}>{on && <Check className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />}{i.label}</button>
      ); })}
    </div>
    {error && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{error}</p>}
  </fieldset>
);

export const InvestorApplication: React.FC<Props> = ({ initial, emailVerified, onStarted, onSubmitted, onCancel }) => {
  const [form, setForm] = useState<ApplicationForm>(() => toForm(initial as any));
  const [step, setStep] = useState<Step>(0);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = useRef(false);
  const started = useRef(!!initial);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const set = <K extends keyof ApplicationForm>(k: K, v: ApplicationForm[K]) => {
    setForm(f => ({ ...f, [k]: v })); dirty.current = true;
    if (!started.current) { started.current = true; onStarted(); }
  };
  const setDecl = (k: keyof Declarations, v: boolean) => { setForm(f => ({ ...f, declarations: { ...f.declarations, [k]: v } })); dirty.current = true; };
  const errs = useMemo(() => (show ? stepProblems(form, step) : {}), [form, step, show]);

  const save = useCallback(async (f: ApplicationForm) => {
    setSaved('saving');
    try { await investorApi({ action: 'save_draft', form: f }); dirty.current = false; setSaved('saved'); }
    catch { setSaved('error'); }
  }, []);
  // Saved a moment after the last change, and whenever a step is left.
  useEffect(() => { if (!dirty.current) return; clearTimeout(timer.current); timer.current = setTimeout(() => save(form), 1500); return () => clearTimeout(timer.current); }, [form, save]);

  const go = (to: Step) => { clearTimeout(timer.current); if (dirty.current) save(form); setStep(to); setShow(false); window.scrollTo({ top: 0 }); };
  const next = () => { const p = stepProblems(form, step); if (firstProblem(p)) { setShow(true); return; } go((step + 1) as Step); };
  const submit = async () => {
    const p = allProblems(form);
    if (firstProblem(p)) { setShow(true); const bad = firstProblem(stepProblems(form, 0)) ? 0 : firstProblem(stepProblems(form, 1)) ? 1 : 2; if (bad !== step) setStep(bad as Step); return; }
    setBusy(true); setError('');
    try { clearTimeout(timer.current); await investorApi({ action: 'submit', form }); onSubmitted(); }
    catch (e: any) { setError(e.message); setBusy(false); }
  };

  const primary = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-7 text-sm font-bold text-white disabled:opacity-60 ' + FOCUS;
  const secondary = 'inline-flex min-h-[48px] items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60 ' + FOCUS;

  return (
    <section aria-label="Investor application">
      <ol className="mb-6 flex items-center gap-2 text-[13px]" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
            <span className={'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ' + (i <= step ? 'text-white' : 'bg-stone-200 text-stone-600')} style={i <= step ? { backgroundColor: GREEN } : undefined}>{i < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}</span>
            <span className={(i === step ? 'font-semibold text-stone-900' : 'hidden text-stone-600 sm:inline')}>{s}</span>
            {i < STEPS.length - 1 && <span className="hidden h-px w-5 bg-stone-300 sm:block" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
        {step === 0 && (
          <div className="space-y-5">
            <div><h2 className="font-serif text-[1.6rem] font-semibold text-stone-900">Investor profile</h2><p className="mt-1 text-[15px] text-stone-600">A few lines so a reviewer knows who is applying.</p></div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-stone-900">How do you invest?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {KINDS.map(k => (
                  <label key={k.id} className={'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ' + (form.kind === k.id ? 'bg-emerald-50' : 'bg-white')} style={{ borderColor: form.kind === k.id ? GREEN : '#d6d3d1' }}>
                    <input type="radio" name="kind" checked={form.kind === k.id} onChange={() => set('kind', k.id)} className="mt-1 h-4 w-4" />
                    <span><span className="block text-sm font-semibold text-stone-900">{k.label}</span><span className="block text-xs text-stone-600">{k.hint}</span></span>
                  </label>
                ))}
              </div>
              {errs.kind && <p role="alert" className="mt-1.5 text-sm text-red-700">{errs.kind}</p>}
            </fieldset>
            {form.kind === 'organization' && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="i-org" label="Organization" error={errs.organization}><input id="i-org" className={input} style={ring} value={form.organization} maxLength={LIMITS.organization.max + 20} onChange={e => set('organization', e.target.value)} autoComplete="organization" /></Field>
                <Field id="i-role" label="Your role there" error={errs.role}><input id="i-role" className={input} style={ring} value={form.role} maxLength={LIMITS.role.max + 10} onChange={e => set('role', e.target.value)} autoComplete="organization-title" /></Field>
              </div>
            )}
            <Field id="i-bg" label="Professional background" hint={`${form.background.length}/${LIMITS.background.max}`} error={errs.background}>
              <textarea id="i-bg" rows={4} className={input} style={ring} value={form.background} maxLength={LIMITS.background.max + 50} onChange={e => set('background', e.target.value)} placeholder="Your career so far, in a few sentences." />
            </Field>
            <Field id="i-exp" label="Relevant experience" hint={`${form.experience.length}/${LIMITS.experience.max}. Investments made, boards, operating experience.`} error={errs.experience}>
              <textarea id="i-exp" rows={3} className={input} style={ring} value={form.experience} maxLength={LIMITS.experience.max + 50} onChange={e => set('experience', e.target.value)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="i-li" label="LinkedIn" optional hint="Helps a reviewer check what you wrote." error={errs.linkedin}><input id="i-li" type="url" inputMode="url" className={input} style={ring} value={form.linkedin} onChange={e => set('linkedin', e.target.value)} placeholder="https://www.linkedin.com/in/…" /></Field>
              <Field id="i-web" label="Website" optional error={errs.website}><input id="i-web" type="url" inputMode="url" className={input} style={ring} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://" /></Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div><h2 className="font-serif text-[1.6rem] font-semibold text-stone-900">Investment interests</h2><p className="mt-1 text-[15px] text-stone-600">What you look at, so what you see in BeWatu is relevant to you.</p></div>
            <Chips legend="Preferred sectors" items={SECTORS.map(s => ({ id: s, label: s }))} value={form.sectors} onChange={v => set('sectors', v)} error={errs.sectors} />
            <Chips legend="Investment stage" items={STAGES} value={form.stages} onChange={v => set('stages', v)} error={errs.stages} />
            <Chips legend="Geographic interests" items={GEOGRAPHIES.map(g => ({ id: g, label: g }))} value={form.geographies} onChange={v => set('geographies', v)} error={errs.geographies} />
            <Field id="i-pref" label="Investment preferences" optional hint={`${form.preferences.length}/${LIMITS.preferences.max}. Typical cheque size, what you look for, what you avoid.`} error={errs.preferences}>
              <textarea id="i-pref" rows={3} className={input} style={ring} value={form.preferences} maxLength={LIMITS.preferences.max + 50} onChange={e => set('preferences', e.target.value)} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div><h2 className="font-serif text-[1.6rem] font-semibold text-stone-900">Eligibility and submission</h2><p className="mt-1 text-[15px] text-stone-600">Read these, confirm them, and send your application. It is free.</p></div>

            <div className="rounded-xl bg-stone-50 p-4 text-sm leading-relaxed text-stone-700">
              <p className="flex items-center gap-2 font-semibold text-stone-900"><ShieldCheck className="h-4 w-4" style={{ color: GREEN }} aria-hidden="true" />How we verify</p>
              <p className="mt-1.5">A reviewer checks what you wrote against the links you gave. We do not ask for identity documents or financial statements. If we ever need more, we will ask you here, and say why.</p>
              <p className="mt-2">Your email address: {emailVerified ? <span className="font-semibold" style={{ color: GREEN }}>verified</span> : <span className="font-semibold text-amber-800">not verified yet</span>}. {emailVerified ? '' : 'You can verify it from Settings. It is not required to apply.'}</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold text-stone-900">Declarations</legend>
              {(Object.keys(DECLARATION_TEXT) as (keyof Declarations)[]).map(k => (
                <div key={k}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3.5">
                    <input type="checkbox" checked={form.declarations[k]} onChange={e => setDecl(k, e.target.checked)} className="mt-1 h-4 w-4 flex-shrink-0" aria-describedby={errs[k] ? `d-${k}` : undefined} />
                    <span className="text-sm leading-relaxed text-stone-800">{DECLARATION_TEXT[k]}</span>
                  </label>
                  {errs[k] && <p id={`d-${k}`} role="alert" className="mt-1 text-sm text-red-700">{errs[k]}</p>}
                </div>
              ))}
            </fieldset>

            <details className="rounded-xl border border-stone-200 p-4 text-sm text-stone-700">
              <summary className={'cursor-pointer font-semibold text-stone-900 ' + FOCUS} style={ring}>Review your answers</summary>
              <dl className="mt-3 space-y-2">
                <div><dt className="font-semibold">Investor</dt><dd>{KINDS.find(k => k.id === form.kind)?.label}{form.kind === 'organization' ? `: ${form.role}, ${form.organization}` : ''}</dd></div>
                <div><dt className="font-semibold">Interests</dt><dd>{[...form.sectors, ...form.stages, ...form.geographies].join(', ') || 'None chosen'}</dd></div>
              </dl>
            </details>
          </div>
        )}

        {error && <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{error}</div>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={step === 0 ? onCancel : () => go((step - 1) as Step)} className={secondary} style={ring} disabled={busy}>{step === 0 ? 'Cancel' : 'Back'}</button>
        <div className="flex items-center gap-4">
          <span className="text-xs text-stone-600" role="status" aria-live="polite">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Draft saved' : saved === 'error' ? 'Could not save. We will try again.' : ''}</span>
          {step < 2
            ? <button type="button" onClick={next} className={primary} style={{ backgroundColor: GREEN, ...ring }}>Continue</button>
            : <button type="button" onClick={submit} disabled={busy} className={primary} style={{ backgroundColor: GREEN, ...ring }}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Submit application</button>}
        </div>
      </div>
    </section>
  );
};

export default InvestorApplication;
