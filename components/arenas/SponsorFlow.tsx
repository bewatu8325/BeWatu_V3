/**
 * components/arenas/SponsorFlow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Sponsor the <Arena>": a guided flow instead of a dead end.
 *
 *   no organization you manage  ->  why one is needed, and two ways to get one (create, or claim an existing one). The Arena is
 *                                   remembered (lib/sponsorIntent.ts) so the flow picks up where it left off.
 *   organization under review   ->  its status and what happens next (verification, or a claim BeWatu is reviewing)
 *   organization not eligible   ->  why, and the way forward
 *   one verified organization   ->  review (Arena, organization, benefits, terms) then the request form
 *   several                     ->  choose which organization is sponsoring first
 *   request already in          ->  its status (never a second request)
 *   Arena not open              ->  said first, before anyone is asked to set anything up
 *
 * Everything about permissions is decided by the server (api/arena-sponsorship.ts `eligibility`, and re-checked on `request`);
 * this component only explains and routes. Nothing here makes an organization a sponsor: a request is a request, and sponsorship is
 * not active until BeWatu approves it and any applicable commercial requirements are met.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, CheckCircle2, Circle, ArrowRight, Loader2, Clock, AlertTriangle, ChevronLeft, Building2 } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { fetchSponsorEligibility, type SponsorEligibility, type SponsorOrg } from '../../lib/arenaSponsorshipService';
import { saveIntent, clearIntent } from '../../lib/sponsorIntent';
import BottomSheet from '../mobile/BottomSheet';
import SponsorshipManager from './SponsorshipManager';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const ring = { ['--tw-ring-color' as any]: GREEN } as React.CSSProperties;
const SUPPORT = 'support@bewatu.com';
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

type Step = 'pick' | 'review' | 'form' | 'status';

const Primary: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', ...p }) => (
  <button type="button" {...p} className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 ${className}`} style={{ backgroundColor: GREEN, ...ring }}>{children}</button>
);
const Secondary: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', ...p }) => (
  <button type="button" {...p} className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 text-base font-semibold text-stone-900 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 disabled:opacity-60 ${className}`} style={ring}>{children}</button>
);

const OrgLogo: React.FC<{ org: SponsorOrg; size?: number }> = ({ org, size = 40 }) => org.logoUrl
  ? <img src={org.logoUrl} alt="" className="flex-shrink-0 rounded-xl border border-stone-200 object-cover" style={{ width: size, height: size }} />
  : <span className="flex flex-shrink-0 items-center justify-center rounded-xl text-sm font-black text-white" style={{ width: size, height: size, background: GREEN }}>{org.name[0] ?? 'O'}</span>;

const Badge: React.FC<{ state: SponsorOrg['state'] }> = ({ state }) => {
  const t = state === 'eligible' ? { l: 'Verified', bg: GREEN_LT, fg: '#14513f' } : state === 'pending_verification' ? { l: 'Verification pending', bg: '#fef3c7', fg: '#92400e' } : { l: 'Not eligible yet', bg: '#fee2e2', fg: '#991b1b' };
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: t.bg, color: t.fg }}>{t.l}</span>;
};

interface Props { arenaId: string; arenaName: string; onClose: () => void }

export default function SponsorFlow({ arenaId, arenaName, onClose }: Props) {
  const uid = auth.currentUser?.uid;
  const [data, setData] = useState<SponsorEligibility | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>('pick');
  const [chosen, setChosen] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(() => {
    setData(null); setError('');
    fetchSponsorEligibility(arenaId).then(d => {
      setData(d);
      const eligible = d.organizations.filter(o => o.state === 'eligible');
      const withRequest = eligible.find(o => o.existing);
      if (withRequest) { setChosen(withRequest.id); setStep('status'); }
      else if (eligible.length === 1) { setChosen(eligible[0].id); setStep('review'); }
      else setStep('pick');
    }).catch(e => setError(e?.message ?? 'We could not check your organizations just now.'));
  }, [arenaId]);
  useEffect(() => { load(); }, [load]);

  const name = data?.arena.name || arenaName;
  const title = `Sponsor the ${name}`;
  const org = data?.organizations.find(o => o.id === chosen) ?? null;
  const eligible = useMemo(() => data?.organizations.filter(o => o.state === 'eligible') ?? [], [data]);
  const others = useMemo(() => data?.organizations.filter(o => o.state !== 'eligible') ?? [], [data]);

  // Remember the Arena, then hand over to the existing organization screens. The flow resumes from the saved pointer.
  const setup = (kind: 'create' | 'claim') => {
    if (uid) saveIntent(window.localStorage, uid, arenaId, name, kind);
    onClose();
    window.dispatchEvent(new CustomEvent('bewatu:sponsor-setup', { detail: { kind, arenaId } }));
  };

  const Intro = (
    <div className="mb-4">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><Trophy size={26} aria-hidden="true" /></span>
      <h3 className="mt-4 text-2xl font-bold leading-tight text-stone-900">{title}</h3>
      <p className="mt-2 text-base leading-relaxed text-stone-600">Put your organization at the center of industry innovation. Connect with professionals, support real-world challenges, and showcase your brand.</p>
    </div>
  );

  let body: React.ReactNode;
  if (error) {
    body = (<div role="alert" className="space-y-3">{Intro}<p className="flex items-start gap-2 text-sm text-red-800"><AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />{error}</p><Primary onClick={load}>Try again</Primary></div>);
  } else if (!data) {
    body = (<div className="flex items-center justify-center gap-2 py-12 text-sm text-stone-600" role="status"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Checking your organizations…</div>);
  } else if (!data.arena.open) {
    body = (<div className="space-y-3">{Intro}<div className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-700"><p className="font-semibold text-stone-900">This Arena is not open for sponsorship right now.</p><p className="mt-1">You do not need to set anything up yet. Other Arenas may be open, and you can come back to this one later.</p></div><Secondary onClick={onClose}>Back to Arenas</Secondary></div>);
  } else if (step === 'form' && org && uid) {
    body = (
      <div>
        <button type="button" onClick={() => setStep('review')} className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-stone-700 hover:underline"><ChevronLeft size={16} aria-hidden="true" /> Back</button>
        <SponsorshipManager companyId={org.id} companyName={org.name} uid={uid} initialArenaId={arenaId} onChanged={() => { setSubmitted(true); if (uid) clearIntent(window.localStorage, uid); }} />
        {submitted && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Your request is in and shows below as under review. {org.name} is not shown as a sponsor until BeWatu approves it.</p>}
      </div>
    );
  } else if (step === 'status' && org && uid) {
    body = (
      <div className="space-y-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: '#b6ddd2', backgroundColor: GREEN_LT }}>
          <p className="flex items-center gap-2 text-sm font-bold" style={{ color: '#14513f' }}><Clock size={16} aria-hidden="true" /> {org.existing === 'approved' ? `${org.name} sponsors this Arena` : `${org.name} has a request under review`}</p>
          <p className="mt-1 text-sm text-stone-700">{org.existing === 'approved' ? 'Your sponsorship is approved. You can update your branding below.' : 'BeWatu reviews every request and sets the dates. Your organization is not shown as a sponsor until it is approved. You can edit or withdraw the request below.'}</p>
        </div>
        <SponsorshipManager companyId={org.id} companyName={org.name} uid={uid} />
      </div>
    );
  } else if (step === 'review' && org) {
    body = (
      <div>
        {Intro}
        <h4 className="text-sm font-bold text-stone-900">Sponsoring as</h4>
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-stone-200 p-3"><OrgLogo org={org} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-stone-900">{org.name}</p><Badge state="eligible" /></div>
          {eligible.length > 1 && <button type="button" onClick={() => { setChosen(null); setStep('pick'); }} className="min-h-[44px] flex-shrink-0 px-2 text-sm font-semibold hover:underline" style={{ color: GREEN }}>Change</button>}</div>
        <h4 className="mt-5 text-sm font-bold text-stone-900">What sponsoring gives you</h4>
        <ul className="mt-2 space-y-2 text-sm text-stone-700">
          {['Your logo, name and brand colour on the Arena\'s card in the directory', 'A "Presented by" header on the Arena page with your tagline and links', 'A live preview of both before you submit anything'].map(b => (
            <li key={b} className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" />{b}</li>
          ))}
        </ul>
        <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-sm leading-relaxed text-stone-700">
          <p className="font-semibold text-stone-900">How it works</p>
          <p className="mt-1">You send a request. BeWatu reviews it and sets the dates. Sponsorship is not active until BeWatu approves it and any applicable commercial requirements are met, and you can withdraw a request at any time before then.</p>
          {data.arena.sponsoredUntil && <p className="mt-2">This Arena currently has a sponsor{data.arena.sponsorName ? ` (${data.arena.sponsorName})` : ''} until {fmt(data.arena.sponsoredUntil)}. You can still send a request; BeWatu decides the dates.</p>}
        </div>
        <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-stone-800">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-stone-300" />
          <span>I am authorized to represent <strong>{org.name}</strong> and agree to the sponsorship terms above.</span>
        </label>
        <div className="mt-4"><Primary disabled={!agreed} onClick={() => setStep('form')}>Continue to request <ArrowRight size={18} aria-hidden="true" /></Primary></div>
      </div>
    );
  } else if (data.organizations.length === 0 || (eligible.length === 0 && others.length === 0)) {
    // Nothing yet: why an organization is needed, and two ways to get one.
    body = (
      <div>
        {Intro}
        {data.pendingClaims.length > 0 && (
          <div className="mb-4 rounded-2xl border p-4 text-sm" style={{ borderColor: '#fcd34d', backgroundColor: '#fffbeb' }} role="status">
            <p className="flex items-center gap-2 font-bold text-amber-900"><Clock size={16} aria-hidden="true" /> Your claim is being reviewed</p>
            <p className="mt-1 text-amber-900">BeWatu is reviewing your claim{data.pendingClaims[0].name ? ` for ${data.pendingClaims[0].name}` : ''}. Once it is approved and the organization is verified, you can continue here. We have kept your place.</p>
          </div>
        )}
        <ol className="space-y-3">
          <li className="flex items-start gap-3"><CheckCircle2 size={22} className="mt-0.5 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" /><div><p className="text-base font-medium text-stone-900">First, connect your organization</p><p className="mt-1 text-sm text-stone-600">To sponsor an Arena, you'll need an organization profile you manage.</p></div></li>
          <li className="flex items-start gap-3"><Circle size={22} className="mt-0.5 flex-shrink-0 text-stone-400" aria-hidden="true" /><p className="text-base font-medium text-stone-900">Then, complete your sponsorship request</p></li>
        </ol>
        <div className="mt-5 space-y-3">
          <Primary onClick={() => setup('create')}>Create an organization <ArrowRight size={18} aria-hidden="true" /></Primary>
          <Secondary onClick={() => setup('claim')}>Claim an existing organization</Secondary>
        </div>
        <p className="mt-4 text-center text-sm text-stone-600">
          Already an administrator?{' '}<button type="button" onClick={load} className="min-h-[44px] font-semibold underline">Check again</button>{' '}or{' '}<a className="font-semibold underline" href={`mailto:${SUPPORT}`}>contact support</a>.
        </p>
      </div>
    );
  } else {
    // Several organizations, or some that cannot ask yet: choose, and say where the others stand.
    body = (
      <div>
        {Intro}
        {eligible.length > 0 && (
          <>
            <h4 className="text-sm font-bold text-stone-900">{eligible.length > 1 ? 'Which organization is sponsoring?' : 'Sponsoring as'}</h4>
            <ul className="mt-2 space-y-2" role="radiogroup" aria-label="Organization">
              {eligible.map(o => (
                <li key={o.id}>
                  <button type="button" role="radio" aria-checked={chosen === o.id} onClick={() => { setChosen(o.id); setAgreed(false); setStep(o.existing ? 'status' : 'review'); }}
                    className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border-2 p-3 text-left hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={{ borderColor: chosen === o.id ? GREEN : '#e7e5e4', ...ring }}>
                    <OrgLogo org={o} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-stone-900">{o.name}</span><span className="mt-0.5 block"><Badge state="eligible" />{o.existing && <span className="ml-2 text-xs text-stone-600">Request {o.existing === 'approved' ? 'approved' : 'under review'}</span>}</span></span>
                    <ArrowRight size={16} className="flex-shrink-0 text-stone-400" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {others.length > 0 && (
          <div className={eligible.length ? 'mt-5' : ''}>
            <h4 className="text-sm font-bold text-stone-900">{eligible.length ? 'Not ready to sponsor yet' : 'Where your organization stands'}</h4>
            <ul className="mt-2 space-y-2">
              {others.map(o => (
                <li key={o.id} className="rounded-2xl border border-stone-200 p-3">
                  <div className="flex items-center gap-3"><OrgLogo org={o} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-stone-900">{o.name}</p><Badge state={o.state} /></div></div>
                  <p className="mt-2 text-sm text-stone-700">{o.reason}</p>
                  <p className="mt-1 text-sm text-stone-600">{o.next}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 space-y-3">
          {eligible.length === 0 && <Secondary onClick={() => setup('claim')}><Building2 size={18} aria-hidden="true" /> Claim another organization</Secondary>}
          <Secondary onClick={onClose}>Close</Secondary>
        </div>
        <p className="mt-3 text-center text-sm text-stone-600">Questions? <a className="font-semibold underline" href={`mailto:${SUPPORT}`}>Contact support</a>.</p>
      </div>
    );
  }

  return <BottomSheet open onClose={onClose} title={step === 'form' || step === 'status' ? title : 'Sponsor an Arena'} allWidths size={step === 'form' || step === 'status' ? 'xl' : 'md'}>{body}</BottomSheet>;
}
