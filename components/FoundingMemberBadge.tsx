/**
 * components/FoundingMemberBadge.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Small pill shown on the profiles of Founding Members: people who joined
 * during the beta. The flag (users/{uid}.foundingMember) is written once at
 * signup and frozen from client updates, so the badge can't be self-granted.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from 'react';

const FoundingMemberBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    style={{ backgroundColor: 'var(--bw-green-light)', color: 'var(--bw-green-mid)', border: '1px solid rgba(26,107,82,0.2)' }}
    title="Joined BeWatu during the founding beta"
  >
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
    Founding Member
  </span>
);

export default FoundingMemberBadge;
