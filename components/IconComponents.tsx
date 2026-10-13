
import React from 'react';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

export const HomeIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5" />
  </svg>
);

export const UsersIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962c.513-.483 1.074-.92 1.684-1.288M12.75 9a3 3 0 11-6 0 3 3 0 016 0zM6.254 18.375a9.094 9.094 0 01-3.742-.479 3 3 0 014.682-2.72M12.75 18.375a9.094 9.094 0 01-3.742-.479 3 3 0 014.682-2.72M12 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962c.513-.483 1.074-.92 1.684-1.288" />
  </svg>
);

export const BriefcaseIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.075c0 1.313-.964 2.39-2.206 2.515-1.242.125-2.294.9-2.294 2.15v.233c0 .512-.16.99-.444 1.387h-6.212c-.283-.397-.444-.875-.444-1.387v-.233c0-1.25-.964-2.025-2.294-2.15-1.242-.125-2.206-1.202-2.206-2.515v-4.075c0-1.313.964-2.39 2.206-2.515 1.242-.125 2.294-.9 2.294-2.15v-.233c0-.512.16-.99.444-1.387h6.212c.283.397.444.875.444-1.387v.233c0 1.25.964 2.025 2.294 2.15 1.242.125 2.206 1.202 2.206 2.515z" />
  </svg>
);

export const ChatBubbleIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193l-3.722.267c-.597.043-1.15-.141-1.583-.518l-2.486-2.486a2.25 2.25 0 00-3.182 0l-2.486 2.486a1.125 1.125 0 01-1.583.518l-3.722-.267c-1.133-.093-1.98-1.057-1.98-2.193V10.608c0-.97.616-1.813 1.5-2.097m14.25-2.288C15.85 5.964 13.968 5.25 12 5.25c-1.968 0-3.85.714-5.25 1.939m10.5 0a8.25 8.25 0 00-10.5 0" />
    </svg>
);

export const BellIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ className = 'h-5 w-5', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} style={style}>
    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ className = 'h-5 w-5', style }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
);

export const ConnectSphereLogo: React.FC<IconProps> = ({ className = 'h-8 w-8', style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-4-4 1.41-1.41L10 16.17l6.59-6.59L18 11l-8 8z" fill="#0a66c2"/>
    </svg>
);

export const ThumbsUpIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M6.633 10.5l-1.07-1.07a.454.454 0 00-.638 0l-1.07 1.07m.002 0l-1.07 1.07a.455.455 0 000 .639l1.07 1.07m0 0l1.07 1.07a.455.455 0 00.638 0l1.07-1.07" />
  </svg>
);

export const ChatBubbleOvalLeftIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const ArrowPathRoundedSquareIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.667 0l3.181-3.183m-4.991-2.696L7.985 5.989m12.038 0L19.015 9.348M16.023 9.348L7.985 5.989" />
  </svg>
);

export const PaperAirplaneIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

// ── BeWatu feature icons ─────────────────────────────────────────────────
// Custom marks for the platform's own named features, matching the Brand
// Kit's Icons guidelines: 24x24 viewBox, 1.5 stroke, round caps/joins,
// outline only, currentColor (no hardcoded fills except the two small
// glyph dots noted below).

export const ArenaIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <rect x="2" y="6" width="20" height="12" rx="6" />
    <ellipse cx="12" cy="12" rx="5" ry="3.25" />
  </svg>
);

export const FactoryIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V11l4-3v3l4-3v3l4-3v3l4-3v13" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 11V7h2v4" />
    <rect x="10.5" y="16" width="3" height="5" />
  </svg>
);

export const PodsIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <circle cx="12" cy="6.5" r="1.4" />
    <circle cx="7.5" cy="11" r="1.8" />
    <circle cx="16.5" cy="11" r="1.8" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 18.5a3.5 3.5 0 0 1 7 0" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 18.5a3.5 3.5 0 0 1 7 0" />
  </svg>
);

export const BridgeIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h18" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 17v3M20 17v3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 17c0-5 4-9 9-9s9 4 9 9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 17v-4M12 17v-6M16 17v-4" />
  </svg>
);

export const CompaniesIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 21v-4h6v4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h2M14 7h2M8 11h2M14 11h2" />
  </svg>
);

export const ConnectionsIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5l3 3M16.5 7.5l-3 3M7.5 16.5l3-3M16.5 16.5l-3-3" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export const VerificationIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
  </svg>
);

export const ReputationIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <circle cx="12" cy="8" r="5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5.5l1.05 2.13 2.35.34-1.7 1.66.4 2.34L12 10.85l-2.1 1.12.4-2.34-1.7-1.66 2.35-.34L12 5.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5L6 21l6-3 6 3-2.5-8.5" />
  </svg>
);

export const CirclesIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <circle cx="12" cy="8" r="5" />
    <circle cx="8" cy="15" r="5" />
    <circle cx="16" cy="15" r="5" />
  </svg>
);

export const IdeasIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a6 6 0 00-3.5 10.9c.6.44 1 .97 1.1 1.6h4.8c.1-.63.5-1.16 1.1-1.6A6 6 0 0012 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 18h5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21h3" />
  </svg>
);

export const ProblemsIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5a2.5 2.5 0 014.5 1.5c0 1.5-2 1.8-2 3.3" />
    <circle cx="12" cy="17.25" r="0.4" fill="currentColor" stroke="none" />
  </svg>
);

export const SparksIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 4.5C9 6.5 7 10 7 14a5 5 0 1 0 10 0c0-4-2.5-6.5-4.5-9.5z" />
  </svg>
);

export const ShowcaseIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l-4 8h8z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 20l2-6h4l2 6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 20h14" />
  </svg>
);

export const ProblemAreaIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 12V3a9 9 0 019 9z" />
  </svg>
);

export const PipelineIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16l-6 7.5V19l-4 2v-8.5z" />
  </svg>
);

export const IncubatorIcon: React.FC<IconProps> = ({ className = 'h-6 w-6', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} style={style}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 20a7 7 0 0114 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20v-5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15c0-2-2-2-2-4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15c0-2 2-2 2-4" />
  </svg>
);
