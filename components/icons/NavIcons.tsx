/**
 * components/icons/NavIcons.tsx
 * BeWatu's bottom-navigation icons: one 24px grid, one 1.75 stroke, round caps and joins, so the five
 * destinations read as a set. Active state is carried by colour and the tab's indicator, never by changing
 * the stroke (which makes icons visibly jump between sizes).
 */
import React from 'react';

type P = { className?: string; style?: React.CSSProperties };
const base = (p: P) => ({
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const, focusable: false as const,
  className: p.className, style: p.style,
});

export const NavHomeIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M4 10.6 12 4.2l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5H15V15H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" /></svg>
);
export const NavCommunityIcon: React.FC<P> = p => (
  <svg {...base(p)}><circle cx="9" cy="8.2" r="3.1" /><path d="M3.4 19.4c.5-3.2 2.7-5 5.6-5s5.1 1.8 5.6 5" /><path d="M15.6 5.4a3.1 3.1 0 0 1 0 5.6M17.4 14.5c2 .6 3.1 2.2 3.4 4.9" /></svg>
);
export const NavCreateIcon: React.FC<P> = p => (
  <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="5" /><path d="M12 8.4v7.2M8.4 12h7.2" /></svg>
);
export const NavMessagesIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.4L6.6 19.6V16H6a2 2 0 0 1-2-2z" /><path d="M8.4 9.2h7.2M8.4 12.2h4.4" /></svg>
);
export const NavYouIcon: React.FC<P> = p => (
  <svg {...base(p)}><circle cx="12" cy="8.4" r="3.4" /><path d="M5 20.2c.6-3.8 3.3-6 7-6s6.4 2.2 7 6" /></svg>
);

/** A trophy: Arenas, where members put their expertise to work on real challenges. The same mark as the Arena cards and the Explore Arenas prompt. */
export const NavArenasIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M8 4.2h8v5.1a4 4 0 0 1-8 0z" /><path d="M8 6.2H5.6a1 1 0 0 0-1 1c0 2.1 1.4 3.6 3.6 3.9M16 6.2h2.4a1 1 0 0 1 1 1c0 2.1-1.4 3.6-3.6 3.9" /><path d="M12 13.3v3.4M9 19.8h6M9.8 16.7h4.4" /></svg>
);
/** A play mark inside a frame: Prove, the professional video showcase. */
export const NavProveIcon: React.FC<P> = p => (
  <svg {...base(p)}><rect x="3.5" y="5" width="17" height="14" rx="3.5" /><path d="m10.4 9.4 4.4 2.6-4.4 2.6z" /></svg>
);
/** A compass: Discover. */
export const NavDiscoverIcon: React.FC<P> = p => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.6" /><path d="m15.6 8.4-2 5.2-5.2 2 2-5.2z" /></svg>
);
/** A plus in a rounded square, smaller: the Create action in the header. */
export const NavPlusIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M12 5.5v13M5.5 12h13" /></svg>
);
/** A framed page with an arrow leaving it: "Share my work". Same grid and stroke as the rest of the set. */
export const ShareWorkIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M13.5 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.5" /><path d="M8.6 15.4h4.2M8.6 12.2h2.6" /><path d="M14.2 9.8 19.5 4.5M15.6 4.5h3.9v3.9" /></svg>
);

/** A person with a small plus: "Invite your people". Same grid and stroke as the rest of the set. */
export const InviteIcon: React.FC<P> = p => (
  <svg {...base(p)}><circle cx="9.4" cy="8.4" r="3.2" /><path d="M3.6 19.6c.5-3.3 2.7-5.2 5.8-5.2 1.3 0 2.4.3 3.3.9" /><path d="M17.6 11.6v6.4M14.4 14.8h6.4" /></svg>
);
