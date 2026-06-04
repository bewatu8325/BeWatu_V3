/**
 * components/AIVerificationBadge.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a verdict badge on a video and provides an appeal modal.
 *
 * States:
 *   pending       → subtle "Verifying…" pill (no alarm)
 *   real          → nothing shown (a "real" video needs no badge)
 *   ai_generated  → amber "AI Generated" badge — user can tap to appeal
 *   uncertain     → nothing shown to user (ops reviews manually)
 *   appealed      → amber "Under review" badge (appeal submitted, awaiting ops)
 *   overturned    → nothing shown (ops cleared the flag)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type VerifStatus =
  | 'pending'
  | 'real'
  | 'ai_generated'
  | 'uncertain'
  | 'appealed'
  | 'overturned';

interface AiVerification {
  status:     VerifStatus;
  verdict?:   string;
  confidence?: string;
  appeal?: {
    submittedAt: any;
    statement:   string;
    status:      'pending' | 'upheld' | 'rejected';
    response?:   string;
  };
}

interface AIVerificationBadgeProps {
  reelId:          string;       // Firestore reelVibes doc ID
  verification:    AiVerification | null | undefined;
  isOwner:         boolean;      // only the author can appeal
  /** Optional: also update users/{uid}.microIntroVerification.appeal */
  authorUid?:      string;
  isMicroIntro?:   boolean;
}

const GREEN = '#1a4a3a';
const AMBER = '#d97706';

// ─── Appeal modal ─────────────────────────────────────────────────────────────

function AppealModal({
  reelId,
  authorUid,
  isMicroIntro,
  onClose,
  onSubmitted,
}: {
  reelId: string;
  authorUid?: string;
  isMicroIntro?: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [statement, setStatement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const maxLen = 300;

  async function handleSubmit() {
    if (!statement.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const appeal = {
        submittedAt: serverTimestamp(),
        statement:   statement.trim(),
        status:      'pending',
        response:    null,
      };

      await updateDoc(doc(db, 'reelVibes', reelId), {
        'aiVerification.status': 'appealed',
        'aiVerification.appeal': appeal,
      });

      // If this is a profile Vibe Clip, mirror appeal to user doc too
      if (isMicroIntro && authorUid) {
        await updateDoc(doc(db, 'users', authorUid), {
          'microIntroVerification.status': 'appealed',
          'microIntroVerification.appeal': appeal,
        });
      }

      onSubmitted();
    } catch (err: any) {
      setError('Failed to submit appeal. Please try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        style={{ border: '1px solid #e7e5e4' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: '#e7e5e4' }}>
          <h2 className="font-bold text-stone-900 text-base">Appeal AI detection</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Tell us why you believe your video is real. The BeWatu team will review it within 5 business days.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Context */}
          <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#fef3c7' }}>
            <p className="font-semibold text-amber-800 mb-1">Why was my video flagged?</p>
            <p className="text-amber-700 text-xs leading-relaxed">
              Our automated system detected signals that may indicate AI-generated content. This can
              sometimes produce false positives — especially with certain lighting, backgrounds, or
              video compression. Your appeal will be reviewed by a human.
            </p>
          </div>

          {/* Statement */}
          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">
              Your statement
            </label>
            <textarea
              value={statement}
              onChange={e => setStatement(e.target.value.slice(0, maxLen))}
              placeholder="Explain briefly — e.g. 'This is a genuine recording I made on my phone on [date]. The lighting in my office can sometimes look unusual.'"
              rows={4}
              className="w-full resize-none rounded-xl border bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2"
              style={{ borderColor: '#e7e5e4' }}
            />
            <p className="text-right text-[10px] text-stone-400 mt-1">{statement.length}/{maxLen}</p>
          </div>

          {error && (
            <p className="text-sm text-red-500 rounded-lg bg-red-50 px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
              style={{ borderColor: '#e7e5e4' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !statement.trim()}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
              style={{ backgroundColor: GREEN }}
            >
              {submitting ? 'Submitting…' : 'Submit appeal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main badge component ─────────────────────────────────────────────────────

export const AIVerificationBadge: React.FC<AIVerificationBadgeProps> = ({
  reelId, verification, isOwner, authorUid, isMicroIntro,
}) => {
  const [showModal,    setShowModal]    = useState(false);
  const [appealed,     setAppealed]     = useState(false);

  const status = verification?.status;

  // Nothing to show for these states
  if (!status || status === 'real' || status === 'uncertain' || status === 'overturned') return null;

  // Subtle pending indicator
  if (status === 'pending') {
    return (
      <div className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', color: 'white' }}>
        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Verifying
      </div>
    );
  }

  const isAppealed = status === 'appealed' || appealed;

  return (
    <>
      <button
        onClick={() => isOwner && !isAppealed ? setShowModal(true) : undefined}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity"
        style={{
          backgroundColor: isAppealed ? 'rgba(0,0,0,0.45)' : '#d97706',
          color:            'white',
          cursor:           isOwner && !isAppealed ? 'pointer' : 'default',
        }}
        title={isOwner && !isAppealed ? 'Tap to appeal this decision' : undefined}
      >
        {/* Wand icon */}
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>
        </svg>
        {isAppealed ? 'Under review' : 'AI Generated'}
        {isOwner && !isAppealed && (
          <span style={{ opacity: 0.8 }}>· Appeal</span>
        )}
      </button>

      {showModal && (
        <AppealModal
          reelId={reelId}
          authorUid={authorUid}
          isMicroIntro={isMicroIntro}
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setShowModal(false); setAppealed(true); }}
        />
      )}
    </>
  );
};

export default AIVerificationBadge;
