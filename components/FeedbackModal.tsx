/**
 * components/FeedbackModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Share feedback" — a direct line from a member to the BeWatu team. Opened
 * from the Header's user menu. Posts to api/submit-feedback.ts, which saves it
 * and emails the team. This is what backs the Founding Members promise of "a
 * voice in shaping the platform".
 *
 * Rendered through a portal: the Header uses backdrop-blur, which makes it the
 * containing block for fixed descendants, so a modal rendered inside it would
 * be pinned to the header instead of the viewport.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFirebase } from '../contexts/FirebaseContext';

const GREEN     = 'var(--bw-green)';
const GREEN_MID = 'var(--bw-green-mid)';
const BORDER    = '#e7e5e4';
const MAX_LEN   = 2000;

const CATEGORIES = [
  { id: 'idea',    label: 'An idea' },
  { id: 'problem', label: 'A problem' },
  { id: 'other',   label: 'Something else' },
] as const;
type CategoryId = typeof CATEGORIES[number]['id'];

interface FeedbackModalProps {
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose }) => {
  const { fbUser, currentUser } = useFirebase() as any;
  const [category, setCategory] = useState<CategoryId>('idea');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const canSend = message.trim().length >= 3 && status !== 'sending';

  const handleSend = async () => {
    if (!canSend || !fbUser) return;
    setStatus('sending');
    setError('');
    try {
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ message: message.trim(), category }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not send your feedback.');
      setStatus('sent');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(28,25,23,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Share feedback"
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
          <h2 className="text-lg font-bold text-white">Share feedback</h2>
          <p className="mt-1 text-sm text-white/80">
            {currentUser?.foundingMember
              ? "You're a Founding Member, so what you tell us shapes what we build next."
              : 'Tell the team what would make BeWatu better.'}
          </p>
        </div>

        <div className="px-6 py-5">
          {status === 'sent' ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bw-green-light)]">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p className="text-sm font-bold text-stone-900 mb-1">Thank you. It reached the team.</p>
              <p className="text-xs text-stone-600 mb-5">We read everything, and may reply to your account email.</p>
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl font-bold text-white text-sm hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Type of feedback">
                {CATEGORIES.map(c => {
                  const active = category === c.id;
                  return (
                    <button key={c.id} type="button" role="radio" aria-checked={active}
                      onClick={() => setCategory(c.id)}
                      disabled={status === 'sending'}
                      className="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
                      style={active
                        ? { backgroundColor: GREEN, borderColor: GREEN, color: 'white' }
                        : { backgroundColor: 'white', borderColor: BORDER, color: '#57534e' }}>
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <label htmlFor="feedback-message" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-600">
                What's on your mind?
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={status === 'sending'}
                rows={5}
                maxLength={MAX_LEN}
                placeholder="What are you trying to do, and what got in the way or could be better?"
                className="w-full resize-none px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--bw-green)]/20"
                style={{ borderColor: BORDER }}
              />
              <p className="mt-1 text-right text-[11px] text-stone-500">{message.length}/{MAX_LEN}</p>
              {error && <p role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-full mt-3 py-2.5 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                {status === 'sending' ? 'Sending…' : 'Send feedback'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FeedbackModal;
