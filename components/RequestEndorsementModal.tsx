/**
 * components/RequestEndorsementModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner-only modal on the Skills Tile (components/ProfilePage.tsx): asks a
 * colleague by email to endorse one or more skills in a single request.
 * Calls api/send-endorsement-request.ts, which emails them a link to
 * /endorse/:token (components/EndorseRequestPage.tsx) — no BeWatu account
 * required on their end. First concrete slice of the "every action pulls in
 * someone new" invite-loop pattern.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';

const GREEN     = 'var(--bw-green)';
const GREEN_MID = 'var(--bw-green-mid)';
const BORDER    = '#e7e5e4';

interface RequestEndorsementModalProps {
  // The skill whose icon was clicked to open this modal — pre-checked, but
  // the colleague can be asked to endorse any subset of the owner's skills
  // in this same request, one email instead of one per skill.
  initialSkill: string;
  allSkills: string[];
  onClose: () => void;
}

function formatSkillList(skills: string[]): string {
  if (skills.length === 1) return skills[0];
  if (skills.length === 2) return `${skills[0]} and ${skills[1]}`;
  return `${skills.slice(0, -1).join(', ')}, and ${skills[skills.length - 1]}`;
}

const RequestEndorsementModal: React.FC<RequestEndorsementModalProps> = ({ initialSkill, allSkills, onClose }) => {
  const { fbUser } = useFirebase();
  const [email, setEmail] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set([initialSkill]));
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const skillNames = Array.from(selectedSkills);

  const toggleSkill = (name: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSend = async () => {
    if (!emailValid || !fbUser || skillNames.length === 0) return;
    setStatus('sending');
    setError('');
    try {
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/send-endorsement-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ skillNames, colleagueEmail: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send the request.');
      setStatus('sent');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(28,25,23,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Request an endorsement"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <div className="relative px-6 pt-6 pb-5" style={{ background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_MID} 100%)` }}>
          <button onClick={onClose} aria-label="Close"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-2 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-lg font-bold">Request endorsement</h2>
          </div>
          <p className="mt-1 text-sm text-white/80">
            Ask a colleague to vouch for your skills — they don't need a BeWatu account.
          </p>
        </div>

        <div className="px-6 py-5">
          {status === 'sent' ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bw-green-light)]">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p className="text-sm font-bold text-stone-900 mb-1">Request sent to {email}</p>
              <p className="text-xs text-stone-600 mb-5">You'll get a notification as soon as they respond.</p>
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl font-bold text-white text-sm hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                Done
              </button>
            </div>
          ) : (
            <>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-600">
                Skills to request ({skillNames.length} selected)
              </label>
              <div className="max-h-40 overflow-y-auto rounded-xl border mb-4" style={{ borderColor: BORDER }}>
                {allSkills.length === 0 ? (
                  <p className="px-3.5 py-2.5 text-sm text-stone-600">Add a skill to your profile first.</p>
                ) : (
                  allSkills.map(name => (
                    <label key={name} className="flex items-center gap-2.5 px-3.5 py-2 text-sm cursor-pointer hover:bg-stone-50 border-b last:border-b-0" style={{ borderColor: BORDER }}>
                      <input
                        type="checkbox"
                        checked={selectedSkills.has(name)}
                        onChange={() => toggleSkill(name)}
                        disabled={status === 'sending'}
                        className="h-4 w-4 rounded border-stone-300 text-green-700 focus:ring-green-700"
                      />
                      <span className="text-stone-800">{name}</span>
                    </label>
                  ))
                )}
              </div>

              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-600">Colleague's email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={status === 'sending'}
                placeholder="colleague@company.com"
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--bw-green)]/20"
                style={{ borderColor: BORDER }}
              />
              {skillNames.length > 0 && (
                <p className="text-xs text-stone-600 mt-2">
                  They'll be asked to vouch for your {formatSkillList(skillNames)} {skillNames.length === 1 ? 'skill' : 'skills'}.
                </p>
              )}
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
              <button
                onClick={handleSend}
                disabled={!emailValid || skillNames.length === 0 || status === 'sending'}
                className="w-full mt-4 py-2.5 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                {status === 'sending' ? 'Sending…' : 'Send request'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestEndorsementModal;
