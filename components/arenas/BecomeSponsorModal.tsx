/**
 * components/arenas/BecomeSponsorModal.tsx
 * "Become a sponsor" from the Arena directory, the Arenas page or an Arena page. The guided flow lives in SponsorFlow; this keeps
 * the entry point the three places already use.
 */
import React from 'react';
import SponsorFlow from './SponsorFlow';

export default function BecomeSponsorModal({ arenaId, arenaName, onClose }: { arenaId: string; arenaName: string; onClose: () => void }) {
  return <SponsorFlow arenaId={arenaId} arenaName={arenaName} onClose={onClose} />;
}
