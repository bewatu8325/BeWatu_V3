/**
 * components/arenas/ArenaSponsorBranding.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Three sponsor branding components used by ArenaIndustryView:
 *
 *   ArenaSponsorHero       — full-width hero banner at top of industry page
 *   SponsorChallengeBadge  — compact badge on challenge cards + header
 *   SponsorSpotlight       — "about the sponsor" section below challenge grid
 *
 * All receive `industry: ArenaIndustry` and read `industry.sponsor` field.
 * If no sponsor is set (industry.sponsor is null/undefined), renders nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { ExternalLink, Award, ChevronDown, ChevronUp, Building2 } from 'lucide-react';
import type { ArenaIndustry } from '../../lib/arenaService';

// ── Helper ────────────────────────────────────────────────────────────────────

function SponsorLogo({
  name, logoUrl, size = 12, color,
}: { name: string; logoUrl?: string; size?: number; color: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  if (logoUrl) return (
    <img src={logoUrl} alt={name}
      className={`w-${size} h-${size} rounded-xl object-contain flex-shrink-0`}
      style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 4 }}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
  return (
    <div className={`w-${size} h-${size} rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0`}
      style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' }}>
      {initials}
    </div>
  );
}

// ── 1. ArenaSponsorHero ───────────────────────────────────────────────────────
// Full-width hero banner shown at the top of the industry page, above the arena header.

export function ArenaSponsorHero({ industry }: { industry: ArenaIndustry }) {
  const sponsor = (industry as any).sponsor;
  if (!sponsor?.isActive) return null;

  const bannerColor = sponsor.bannerColor ?? '#1a4a3a';

  return (
    <div className="rounded-2xl overflow-hidden mb-6 shadow-sm">
      {/* Main banner */}
      <div
        className="relative px-5 py-5 sm:px-7 sm:py-6 flex items-center gap-4"
        style={{
          background: sponsor.bannerImageUrl
            ? `linear-gradient(to right, ${bannerColor}f0, ${bannerColor}b0), url(${sponsor.bannerImageUrl}) center/cover no-repeat`
            : `linear-gradient(135deg, ${bannerColor} 0%, ${bannerColor}cc 60%, ${bannerColor}99 100%)`,
        }}
      >
        {/* Sponsored label */}
        <div className="absolute top-3 right-4 flex items-center gap-1 opacity-70">
          <Award size={10} className="text-white" />
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Sponsored</span>
        </div>

        {/* Logo */}
        <SponsorLogo name={sponsor.name} logoUrl={sponsor.logoUrl} size={14} color={bannerColor} />

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-lg sm:text-xl leading-tight truncate">
            {sponsor.name}
          </p>
          <p className="text-white/80 text-sm mt-0.5 leading-snug line-clamp-2">
            {sponsor.tagline}
          </p>
        </div>

        {/* CTA */}
        {sponsor.website && (
          <a
            href={sponsor.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl transition-opacity hover:opacity-80 hidden sm:flex"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            Visit <ExternalLink size={11} />
          </a>
        )}
      </div>

      {/* Sub-strip: "Powering the X Arena" */}
      <div className="px-5 py-2 flex items-center gap-2"
        style={{ backgroundColor: `${bannerColor}15`, borderTop: `1px solid ${bannerColor}25` }}>
        <Building2 size={12} style={{ color: bannerColor }} />
        <p className="text-xs font-semibold" style={{ color: bannerColor }}>
          {sponsor.name} is powering the {industry.name} Arena — top performers get noticed
        </p>
      </div>
    </div>
  );
}

// ── 2. SponsorChallengeBadge ──────────────────────────────────────────────────
// Compact badge shown on individual challenge cards and in the arena header stats row.

export function SponsorChallengeBadge({
  industry, compact = false,
}: { industry: ArenaIndustry; compact?: boolean }) {
  const sponsor = (industry as any).sponsor;
  if (!sponsor?.isActive) return null;

  const bannerColor = sponsor.bannerColor ?? '#1a4a3a';
  const initials = sponsor.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1"
        style={{ backgroundColor: `${bannerColor}15`, color: bannerColor, border: `1px solid ${bannerColor}30` }}>
        <Award size={10} />
        {sponsor.name}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {sponsor.logoUrl ? (
        <img src={sponsor.logoUrl} alt={sponsor.name}
          className="w-5 h-5 rounded object-contain"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black text-white"
          style={{ backgroundColor: bannerColor }}>
          {initials}
        </div>
      )}
      <span className="text-xs font-semibold text-stone-500">
        Sponsored by {sponsor.name}
      </span>
    </div>
  );
}

// ── 3. SponsorSpotlight ───────────────────────────────────────────────────────
// Full "about the sponsor" section shown below the challenge grid.

export function SponsorSpotlight({ industry }: { industry: ArenaIndustry }) {
  const sponsor = (industry as any).sponsor;
  if (!sponsor?.isActive || !sponsor.about) return null;

  const [expanded, setExpanded] = useState(false);
  const bannerColor = sponsor.bannerColor ?? '#1a4a3a';

  return (
    <div className="mt-8 rounded-2xl border overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center gap-3"
        style={{ backgroundColor: `${bannerColor}0d`, borderBottom: `1px solid ${bannerColor}20` }}>
        <Award size={14} style={{ color: bannerColor }} />
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: bannerColor }}>
            Arena sponsor
          </p>
          <p className="text-sm font-semibold text-stone-900">{sponsor.name}</p>
        </div>
        {sponsor.logoUrl && (
          <img src={sponsor.logoUrl} alt={sponsor.name}
            className="w-10 h-10 rounded-xl object-contain border"
            style={{ borderColor: `${bannerColor}30`, backgroundColor: `${bannerColor}0d`, padding: 4 }}
          />
        )}
      </div>

      {/* Body */}
      <div className="bg-white px-5 py-4">
        <p className="text-sm font-semibold text-stone-800 mb-1.5 italic">"{sponsor.tagline}"</p>
        <p className="text-sm text-stone-600 leading-relaxed"
          style={expanded ? {} : {
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          } as React.CSSProperties}>
          {sponsor.about}
        </p>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs font-semibold mt-2 transition-colors"
          style={{ color: bannerColor }}
        >
          {expanded ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Read more</>}
        </button>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: '#f3f4f6' }}>
          <p className="text-xs text-stone-400 max-w-xs">
            {sponsor.name} reviews top submissions and reaches out directly to standout solvers.
          </p>
          {sponsor.website && (
            <a
              href={sponsor.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-opacity hover:opacity-80 flex-shrink-0 ml-3"
              style={{ backgroundColor: bannerColor, color: 'white' }}
            >
              Learn more <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
