/**
 * components/icons/BridgeIcons.tsx
 * Line icons for Bridge Talks: the same 24px grid, 1.75 stroke and round caps as the navigation set (components/icons/NavIcons.tsx).
 */
import React from 'react';

type P = { className?: string; style?: React.CSSProperties };
const base = (p: P) => ({
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const, focusable: false as const,
  className: p.className, style: p.style,
});

/** A ring with a triangle: the play mark on a Talk. */
export const TalkPlayIcon: React.FC<P> = p => (<svg {...base(p)}><circle cx="12" cy="12" r="8.6" /><path d="M10.2 8.9v6.2l5.2-3.1z" /></svg>);
/** A speech bubble with a play triangle: "Share a Bridge Talk". */
export const TalkIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H12l-4.2 3.6V16H5.5A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5z" /><path d="M10.6 8.6v4.2l3.4-2.1z" /></svg>);
export const PlayIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M8 5.6v12.8L18.6 12z" /></svg>);
export const PauseIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M8.6 5.6v12.8M15.4 5.6v12.8" /></svg>);
export const VolumeIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M4.5 9.8h3L12 6v12l-4.5-3.8h-3z" /><path d="M15.4 9.4a3.8 3.8 0 0 1 0 5.2M17.6 7.2a7 7 0 0 1 0 9.6" /></svg>);
export const MutedIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M4.5 9.8h3L12 6v12l-4.5-3.8h-3z" /><path d="m15.6 9.6 4.4 4.8M20 9.6l-4.4 4.8" /></svg>);
export const CaptionsIcon: React.FC<P> = p => (<svg {...base(p)}><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="M10 10.6a2 2 0 1 0 0 2.8M16 10.6a2 2 0 1 0 0 2.8" /></svg>);
export const FullscreenIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" /></svg>);
export const ExitFullscreenIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M9 5v4H5M19 9h-4V5M15 19v-4h4M5 15h4v4" /></svg>);
export const SpeedIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M4.6 16.4a8 8 0 1 1 14.8 0" /><path d="m12 13 3.4-3.6" /></svg>);
export const AppreciateIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M12 19.6s-6.6-3.9-6.6-8.9A3.7 3.7 0 0 1 12 8.4a3.7 3.7 0 0 1 6.6 2.3c0 5-6.6 8.9-6.6 8.9z" /></svg>);
export const SaveIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M7 4.6h10a1 1 0 0 1 1 1v14l-6-3.8-6 3.8v-14a1 1 0 0 1 1-1z" /></svg>);
export const SendIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M20 4.4 10.4 13.6M20 4.4l-6 15.2-3.6-6zM20 4.4 4.4 10l6 3.6" /></svg>);
export const SpeakerIcon: React.FC<P> = p => (<svg {...base(p)}><rect x="9" y="3.8" width="6" height="10" rx="3" /><path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0M12 17.6v2.6M9 20.2h6" /></svg>);
export const UploadIcon: React.FC<P> = p => (<svg {...base(p)}><path d="M12 15.4V5M8.2 8.6 12 4.8l3.8 3.8" /><path d="M5 14.6v3.2a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-3.2" /></svg>);
