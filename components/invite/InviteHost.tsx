/**
 * components/invite/InviteHost.tsx
 * Mounted once in the signed-in app. Opens the shared invitation sheet when anything asks (requestIntent('invite', ...)),
 * with the purpose and destination that were asked for.
 */
import React, { Suspense, lazy, useState } from 'react';
import { useIntent } from '../../lib/uiIntent';
import type { InviteContext } from '../../lib/invitations';
import type { PodOption } from './InviteSheet';

const InviteSheet = lazy(() => import('./InviteSheet'));

export const InviteHost: React.FC<{ myName: string; pods: PodOption[] }> = ({ myName, pods }) => {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<InviteContext>({ purpose: 'connect' });
  const [mounted, setMounted] = useState(false);
  useIntent('invite', p => { setCtx(p?.invite ?? { purpose: 'connect' }); setMounted(true); setOpen(true); });
  if (!mounted) return null;
  return <Suspense fallback={null}><InviteSheet open={open} onClose={() => setOpen(false)} context={ctx} myName={myName} pods={pods} /></Suspense>;
};

export default InviteHost;
