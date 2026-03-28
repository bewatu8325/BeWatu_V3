/**
 * components/arenas/ArenaSponsorBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Sponsor branding for arena industry pages.
 * Shows: sponsor banner, logo, tagline, about section, and CTA link.
 * Data comes from arena_industries/{id}.sponsor field.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Award } from 'lucide-react';

export interface SponsorData {
  name:        string;
  tagline:     string;
  about:       string;
  logoUrl:     string;
  website:     string;
  bannerColor: string;  // hex — the dominant brand colour
  bannerImageUrl?: string; // optional hero image
  isActive:    boolean;
}

interface ArenaSponsorBannerProps {
  sponsor:      SponsorData;
  industryName: string;
}

export const ArenaSponsorBanner: React.FC<ArenaSponsorBannerProps> = ({
  sponsor, industryName,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!sponsor.isActive) return null;

  // Generate a lighter tint from the banner color for text backgrounds
  const initials = sponsor.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: '#e7e5e4' }}>

      {/* ── Hero banner ── */}
      <div className="relative px-5 py-6 flex items-center gap-4"
        style={{
          background: sponsor.bannerImageUrl
            ? `linear-gradient(to right, ${sponsor.bannerColor}ee, ${sponsor.bannerColor}99), url(${sponsor.bannerImageUrl}) center/cover`
            : `linear-gradient(135deg, ${sponsor.bannerColor} 0%, ${sponsor.bannerColor}cc 100%)`,
        }}>

        {/* Sponsored by label */}
        <div className="absolute top-3 right-4 flex items-center gap-1">
          <Award size={10} className="text-white/60" />
          <span className="text-[10px] font-semibold text-white/60 uppercase tracking-widest">
            Sponsored
          </span>
        </div>

        {/* Logo */}
        <div className="flex-shrink-0">
          {sponsor.logoUrl ? (
            <img src={sponsor.logoUrl} alt={sponsor.name}
              className="w-14 h-14 rounded-xl object-contain bg-white/20 p-1.5" />
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-black"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}>
              {initials}
            </div>
          )}
        </div>

        {/* Name + tagline */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-lg leading-tight truncate">
            {sponsor.name}
          </p>
          <p className="text-white/80 text-sm mt-0.5 leading-snug">
            {sponsor.tagline}
          </p>
          <p className="text-white/60 text-xs mt-1">
            Powering the {industryName} Arena
          </p>
        </div>
      </div>

      {/* ── Spotlight section ── */}
      <div className="bg-white px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
            About the sponsor
          </p>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-stone-600 transition-colors"
          >
            {expanded ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
          </button>
        </div>

        <p className="text-sm text-stone-600 leading-relaxed mt-2"
          style={expanded ? {} : {
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          } as React.CSSProperties}>
          {sponsor.about}
        </p>

        {/* Website CTA */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: '#f3f4f6' }}>
          <p className="text-xs text-stone-400">
            Top performers are noticed by {sponsor.name}
          </p>
          {sponsor.website && (
            <a href={sponsor.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ backgroundColor: sponsor.bannerColor, color: 'white' }}>
              Visit <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArenaSponsorBanner;
