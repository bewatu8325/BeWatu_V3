/**
 * components/prove/ArenaLink.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The connection between a Prove reel and an Arena challenge.
 *
 *   ArenaLinkNote   shows a reel's link: the challenge, the member's own words about their contribution, the skills they
 *                   name, and, only when the challenge's reviewer recorded it, "Shortlisted" or "Winner".
 *   ArenaLinkModal  lets the owner link a reel to a challenge they have submitted to (the server checks the submission).
 *
 * What this does NOT claim: a reel is not scored, and linking does not verify the reel or the member's skill. The note says
 * "Submitted" when a submission exists, nothing more, and the wording around "outcome" always attributes it to the reviewer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState } from 'react';
import { Trophy, Loader2, X } from 'lucide-react';
import { myArenaChallenges, linkReel, type ArenaLink, type MyChallenge, type Outcome } from '../../lib/arenaClient';
import BottomSheet from '../mobile/BottomSheet';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

export const OUTCOME_TEXT: Record<Outcome, string> = {
  submitted: 'Submitted to this challenge',
  shortlisted: 'Shortlisted by the challenge reviewer',
  winner: 'Named a winner by the challenge reviewer',
};

const checked = (ms: number) => { try { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

export const ArenaLinkNote: React.FC<{ link: ArenaLink; onOpenChallenge?: (id: string) => void; compact?: boolean }> = ({ link, onOpenChallenge, compact }) => (
  <div className="rounded-xl border p-3 text-left" style={{ borderColor: '#b6ddd2', backgroundColor: GREEN_LT }}>
    <p className="flex items-start gap-1.5 text-xs font-semibold" style={{ color: GREEN }}>
      <Trophy size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0">From the Arena challenge{' '}
        {onOpenChallenge ? <button type="button" onClick={() => onOpenChallenge(link.challengeId)} className="font-bold underline underline-offset-2">{link.challengeTitle}</button> : <strong>{link.challengeTitle}</strong>}
      </span>
    </p>
    {!compact && link.contribution && <p className="mt-1.5 text-xs leading-relaxed text-stone-700"><span className="font-semibold">Their contribution, in their words: </span>{link.contribution}</p>}
    {!compact && link.skills.length > 0 && <p className="mt-1 text-xs text-stone-600">Skills they name: {link.skills.join(', ')}</p>}
    <p className="mt-1.5 text-[11px] text-stone-600">
      {OUTCOME_TEXT[link.outcome]}{link.outcome !== 'submitted' ? ' (recorded ' + checked(link.outcomeCheckedAt) + ')' : ''}.
      {' '}The reel itself is not scored.
    </p>
  </div>
);

interface ModalProps {
  open: boolean; onClose: () => void;
  reelId: string; reelSkills: string[];
  onLinked: (l: ArenaLink) => void;
  onExploreArenas: () => void;
}

export const ArenaLinkModal: React.FC<ModalProps> = ({ open, onClose, reelId, reelSkills, onLinked, onExploreArenas }) => {
  const [mine, setMine] = useState<MyChallenge[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [contribution, setContribution] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMine(null); setError(''); setChallengeId(''); setContribution(''); setSkills([]); setUnavailable(false);
    let live = true;
    myArenaChallenges().then(r => { if (live) { setMine(r.challenges); setUnavailable(!!r.unavailable); } })
      .catch(e => { if (live) { setMine([]); setError(e?.message ?? 'Could not load your challenges.'); } });
    return () => { live = false; };
  }, [open]);

  const submit = async () => {
    setBusy(true); setError('');
    try { const r = await linkReel(reelId, challengeId, contribution, skills); onLinked(r.arenaLink); onClose(); }
    catch (e: any) { setError(e?.message ?? 'Could not link the reel. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Link to an Arena challenge" allWidths
      footer={<div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-sm font-semibold text-stone-600 hover:underline">Cancel</button>
        <button type="button" onClick={submit} disabled={!challengeId || busy} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: GREEN }}>
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Link reel
        </button>
      </div>}>
      <p className="mb-3 text-sm leading-relaxed text-stone-600">Show which challenge this reel is about. You can link a reel only to a challenge you have submitted to, and linking does not score or verify the reel.</p>
      {mine === null ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-stone-400" aria-label="Loading your challenges" /></div>
      ) : mine.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-stone-900">{unavailable ? 'Your challenges are not available right now' : 'You have not submitted to a challenge yet'}</p>
          <p className="mt-1 text-sm text-stone-600">{unavailable ? 'Please try again in a little while.' : 'Take on a challenge in an Arena first. Once you have submitted, you can link a reel to it.'}</p>
          {!unavailable && <button type="button" onClick={() => { onClose(); onExploreArenas(); }} className="mt-3 min-h-[44px] rounded-xl px-4 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Explore Arenas</button>}
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-stone-800">Challenge</legend>
            <ul className="mt-1 space-y-1">
              {mine.map(c => (
                <li key={c.challengeId}>
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: challengeId === c.challengeId ? GREEN : '#e7e5e4', backgroundColor: challengeId === c.challengeId ? GREEN_LT : '#fff' }}>
                    <input type="radio" name="arena-challenge" checked={challengeId === c.challengeId} onChange={() => setChallengeId(c.challengeId)} className="h-4 w-4" />
                    <span className="min-w-0 flex-1 font-medium text-stone-900">{c.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div>
            <label htmlFor="arena-contribution" className="block text-sm font-semibold text-stone-800">What did you contribute? <span className="font-normal text-stone-500">(optional, in your words)</span></label>
            <textarea id="arena-contribution" value={contribution} maxLength={280} rows={3} onChange={e => setContribution(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-base sm:text-sm" />
            <p className="text-right text-xs text-stone-500">{contribution.length}/280</p>
          </div>
          {reelSkills.length > 0 && (
            <fieldset>
              <legend className="text-sm font-semibold text-stone-800">Skills you demonstrated <span className="font-normal text-stone-500">(optional)</span></legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {reelSkills.map(s => { const on = skills.includes(s); return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => setSkills(on ? skills.filter(x => x !== s) : [...skills, s].slice(0, 6))}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-full border px-3 text-sm font-medium" style={{ borderColor: on ? GREEN : '#d6d3d1', backgroundColor: on ? GREEN : '#fff', color: on ? '#fff' : '#44403c' }}>
                    {s}{on && <X size={13} aria-hidden="true" />}
                  </button>); })}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </BottomSheet>
  );
};
