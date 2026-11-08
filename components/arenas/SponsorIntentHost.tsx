/**
 * components/arenas/SponsorIntentHost.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Picks the sponsorship flow back up after the detour through creating or claiming an organization.
 *
 * When someone starts "Sponsor this Arena" without an organization, SponsorFlow remembers the Arena (lib/sponsorIntent.ts) and
 * sends them to the existing screens. This lives in the app shell and, whenever they are back (page load, returning to the tab,
 * an organization claim being granted), asks the server what they may do now and:
 *   - an organization is verified and has no request yet: reopens the flow, once, so they carry straight on
 *   - an organization or claim is still being reviewed: shows a quiet note saying so (no action possible yet)
 *   - nothing set up yet: shows a note with the way back into setup
 *   - a request is already in, or the Arena closed: forgets the pointer (so it can never create a second request)
 * A note can always be dismissed, which also forgets the pointer. Every decision comes from the server; the pointer only says which Arena.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { loadIntent, clearIntent, resumeAction, type SponsorIntent, type ResumeAction } from '../../lib/sponsorIntent';
import { fetchSponsorEligibility } from '../../lib/arenaSponsorshipService';
import SponsorFlow from './SponsorFlow';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const CHECK_EVERY_MS = 30_000;

interface Props {
  uid?: string;
  isRecruiter?: boolean;
  /** Takes the member to the existing "create" or "claim" screens. */
  onSetup: (kind: 'create' | 'claim') => void;
}

export default function SponsorIntentHost({ uid, isRecruiter, onSetup }: Props) {
  const [intent, setIntent] = useState<SponsorIntent | null>(null);
  const [state, setState] = useState<ResumeAction | null>(null);
  const [flow, setFlow] = useState(false);
  const autoOpened = useRef<number | null>(null);
  const lastCheck = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async (force = false) => {
    if (!uid || busy.current) return;
    const found = loadIntent(window.localStorage, uid);
    setIntent(found);
    if (!found) { setState(null); return; }
    if (!force && Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    busy.current = true; lastCheck.current = Date.now();
    try {
      const e = await fetchSponsorEligibility(found.arenaId);
      const action = resumeAction(e);
      if (action === 'done' || action === 'arena_closed') { clearIntent(window.localStorage, uid); setIntent(null); setState(null); return; }
      setState(action);
      if (action === 'open_flow' && autoOpened.current !== found.savedAt) { autoOpened.current = found.savedAt; setFlow(true); }   // once per start
    } catch { /* offline or signed out: try again on the next return */ }
    finally { busy.current = false; }
  }, [uid]);

  useEffect(() => { void check(true); }, [check]);
  useEffect(() => {
    const again = () => { void check(); };
    const force = () => { void check(true); };
    const setup = (e: Event) => { const kind = (e as CustomEvent).detail?.kind; if (kind === 'create' || kind === 'claim') { setIntent(uid ? loadIntent(window.localStorage, uid) : null); onSetup(kind); } };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    window.addEventListener('bewatu:org-authorized', force);
    window.addEventListener('bewatu:sponsor-setup', setup);
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); window.removeEventListener('bewatu:org-authorized', force); window.removeEventListener('bewatu:sponsor-setup', setup); };
  }, [check, onSetup, uid]);

  if (!uid) return null;
  const dismiss = () => { clearIntent(window.localStorage, uid); setIntent(null); setState(null); setFlow(false); };

  const note: { text: string; action?: { label: string; run: () => void } } | null = !intent || flow ? null
    : state === 'wait_for_verification' ? { text: `Your sponsorship of the ${intent.arenaName || 'Arena'} will continue once your organization is verified. We have kept your place.` }
    : state === 'finish_setup' ? (intent.via === 'create' && !isRecruiter
        ? { text: `Organization pages are created through a recruiter account. Once you have one and your organization is verified, you can continue sponsoring the ${intent.arenaName || 'Arena'}.`, action: { label: 'Open Opportunities', run: () => onSetup('create') } }
        : { text: `Finish setting up your organization to sponsor the ${intent.arenaName || 'Arena'}.`, action: { label: intent.via === 'claim' ? 'Find your organization' : 'Continue setup', run: () => onSetup(intent.via === 'claim' ? 'claim' : 'create') } })
    : state === 'open_flow' ? { text: `Your organization is ready. Continue sponsoring the ${intent.arenaName || 'Arena'}.`, action: { label: 'Continue', run: () => setFlow(true) } }
    : null;

  return (
    <>
      {note && (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: '#b6ddd2', backgroundColor: GREEN_LT }}>
          <Trophy size={16} style={{ color: GREEN }} className="flex-shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-stone-800">{note.text}</p>
          {note.action && <button type="button" onClick={note.action.run} className="min-h-[44px] rounded-xl px-4 font-semibold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ['--tw-ring-color' as any]: GREEN }}>{note.action.label}</button>}
          <button type="button" onClick={dismiss} aria-label="Stop sponsoring this Arena" title="Not now" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-stone-600 hover:bg-white/60"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      {flow && intent && <SponsorFlow arenaId={intent.arenaId} arenaName={intent.arenaName} onClose={() => { setFlow(false); void check(true); }} />}
    </>
  );
}
