/**
 * components/share/ShareWorkHost.tsx
 * Mounted once in the signed-in app. Opens the "Share my work" editor when anything asks (requestIntent('share-work')).
 */
import React, { Suspense, lazy, useState } from 'react';
import { useIntent } from '../../lib/uiIntent';

const ShareMyWork = lazy(() => import('./ShareMyWork'));

export const ShareWorkHost: React.FC<{ myName: string }> = ({ myName }) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useIntent('share-work', () => { setMounted(true); setOpen(true); });
  if (!mounted) return null;
  return <Suspense fallback={null}><ShareMyWork open={open} onClose={() => setOpen(false)} myName={myName} /></Suspense>;
};

export default ShareWorkHost;
