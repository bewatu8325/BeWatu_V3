/**
 * components/recruiter/RecruiterUpgradeBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown at the top of the Jobs tab for users who are not yet recruiters.
 * Compact banner with a "Post a role" CTA that opens RecruiterUpgradeModal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { Briefcase, ArrowRight, X } from 'lucide-react';
import { RecruiterUpgradeModal } from './RecruiterUpgradeModal';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface RecruiterUpgradeBannerProps {
  currentUser:  { id: number; name: string; email?: string };
  fbUserUid:    string;
  onSuccess:    () => void;   // called when upgrade completes — should refresh user
}

export const RecruiterUpgradeBanner: React.FC<RecruiterUpgradeBannerProps> = ({
  currentUser, fbUserUid, onSuccess,
}) => {
  const [showModal,    setShowModal]    = useState(false);
  const [dismissed,   setDismissed]    = useState(false);

  if (dismissed) return null;

  return (
    <>
      <div className="rounded-2xl border px-4 py-3.5 flex items-center gap-3 shadow-sm"
        style={{ backgroundColor: GREEN_LT, borderColor: '#c7e8d8' }}>

        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: GREEN }}>
          <Briefcase size={15} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-stone-900 text-sm">Hiring someone?</p>
          <p className="text-xs text-stone-500 mt-0.5">
            Post roles and reach verified talent. First 3 listings free.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl text-white hover:opacity-90 transition-opacity flex-shrink-0"
          style={{ backgroundColor: GREEN }}>
          Post a role <ArrowRight size={12} />
        </button>

        <button
          onClick={() => setDismissed(true)}
          className="text-stone-400 hover:text-stone-600 transition-colors flex-shrink-0">
          <X size={14} />
        </button>
      </div>

      {showModal && (
        <RecruiterUpgradeModal
          currentUser={currentUser}
          fbUserUid={fbUserUid}
          onSuccess={() => {
            setShowModal(false);
            onSuccess();
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

export default RecruiterUpgradeBanner;
