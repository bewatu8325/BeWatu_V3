/**
 * components/invite/InviteNotice.tsx
 * A line at the top of the sign-up and sign-in forms when the person arrived from an invitation, so the context is visibly kept.
 * Reads only the remembered token and asks the server what to say; shows nothing if there is none or it is no longer usable.
 */
import React, { useEffect, useState } from 'react';
import { InviteIcon } from '../icons/NavIcons';
import { deviceStore, fetchPreview, loadPending, purposeLabel, type Preview } from '../../lib/invitations';

export const InviteNotice: React.FC = () => {
  const [p, setP] = useState<Preview | null>(null);
  useEffect(() => {
    const t = loadPending(deviceStore());
    if (!t) return;
    let live = true;
    fetchPreview(t).then(r => { if (live && r.state === 'ok') setP(r); });
    return () => { live = false; };
  }, []);
  if (!p) return null;
  const who = p.inviter?.name ?? 'A BeWatu member';
  return (
    <div role="note" className="mb-5 flex items-start gap-3 rounded-xl p-3" style={{ backgroundColor: 'var(--bw-green-light)' }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--bw-green)' }}><InviteIcon className="h-5 w-5" /></span>
      <p className="text-sm text-stone-800"><strong className="font-semibold">{who}</strong> invited you · {purposeLabel(p.purpose ?? 'connect')}{p.target?.name ? `: ${p.target.name}` : ''}. Finish here and you'll go straight to it.</p>
    </div>
  );
};

export default InviteNotice;
