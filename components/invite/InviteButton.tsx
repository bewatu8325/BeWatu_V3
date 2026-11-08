/**
 * components/invite/InviteButton.tsx
 * The way into the invitation sheet from anywhere: it only asks (requestIntent), and InviteHost, mounted once, opens the one
 * shared sheet with this purpose and destination already chosen.
 */
import React from 'react';
import { InviteIcon } from '../icons/NavIcons';
import { requestIntent } from '../../lib/uiIntent';
import type { InviteContext } from '../../lib/invitations';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

interface Props { context: InviteContext; label?: string; variant?: 'text' | 'outline' | 'filled' | 'row'; className?: string }

export const InviteButton: React.FC<Props> = ({ context, label = 'Invite your people', variant = 'outline', className = '' }) => {
  const open = () => requestIntent('invite', { invite: { purpose: context.purpose, targetId: context.targetId ?? null, targetName: context.targetName ?? null } });
  const ring = { ['--tw-ring-color' as any]: GREEN };
  if (variant === 'row') return (
    <button type="button" onClick={open} className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border bg-white px-3 py-2 text-left hover:bg-stone-50 focus:outline-none focus-visible:ring-2 ${className}`} style={{ ...ring, borderColor: '#e7e5e4' }}>
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><InviteIcon className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block text-sm font-semibold text-stone-900">{label}</span><span className="block text-xs text-stone-600">Good connections make great things possible</span></span>
    </button>
  );
  const look = variant === 'filled' ? { backgroundColor: GREEN, color: '#fff', border: '1px solid ' + GREEN } : variant === 'text' ? { color: GREEN } : { color: GREEN, border: '1px solid ' + GREEN, backgroundColor: '#fff' };
  return (
    <button type="button" onClick={open} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus:outline-none focus-visible:ring-2 ${className}`} style={{ ...ring, ...look }}>
      <InviteIcon className="h-4 w-4" />{label}
    </button>
  );
};

export default InviteButton;
