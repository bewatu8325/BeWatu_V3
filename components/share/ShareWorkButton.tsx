/**
 * components/share/ShareWorkButton.tsx
 * The way into "Share my work" from anywhere (your profile, Prove, the profile sharing menu). It only asks; ShareWorkHost, mounted
 * once, opens the one editor. It is separate from inviting someone to BeWatu: this puts your work in front of people who need no account.
 */
import React from 'react';
import { ShareWorkIcon } from '../icons/NavIcons';
import { requestIntent } from '../../lib/uiIntent';

const GREEN = 'var(--bw-green)';
interface Props { label?: string; variant?: 'outline' | 'filled' | 'text' | 'row'; className?: string; onBefore?: () => void }

export const ShareWorkButton: React.FC<Props> = ({ label = 'Share my work', variant = 'outline', className = '', onBefore }) => {
  const open = () => { onBefore?.(); requestIntent('share-work'); };
  const ring = { ['--tw-ring-color' as any]: GREEN };
  if (variant === 'row') return (
    <button type="button" onClick={open} className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border bg-white px-3 py-2 text-left hover:bg-stone-50 focus:outline-none focus-visible:ring-2 ${className}`} style={{ ...ring, borderColor: '#e7e5e4' }}>
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--bw-green-light)', color: GREEN }}><ShareWorkIcon className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block text-sm font-semibold text-stone-900">{label}</span><span className="block text-xs text-stone-600">A page for recruiters and employers. No sign-up needed to view it.</span></span>
    </button>
  );
  const look = variant === 'filled' ? { backgroundColor: GREEN, color: '#fff', border: '1px solid ' + GREEN } : variant === 'text' ? { color: GREEN } : { color: GREEN, border: '1px solid ' + GREEN, backgroundColor: '#fff' };
  return (
    <button type="button" onClick={open} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus:outline-none focus-visible:ring-2 ${className}`} style={{ ...ring, ...look }}>
      <ShareWorkIcon className="h-4 w-4" />{label}
    </button>
  );
};

export default ShareWorkButton;
