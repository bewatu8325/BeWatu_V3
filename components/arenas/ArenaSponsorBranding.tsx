"use client";

/**
 * components/arenas/ArenaSponsorBranding.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full sponsor experience for branded industry arenas.
 * Three components:
 *
 *   <ArenaSponsorHero />       — full-width banner at top of industry page
 *   <SponsorChallengeBadge />  — compact logo badge on each challenge card
 *   <SponsorSpotlight />       — "About the sponsor" section below challenge feed
 *
 * All driven by the arena_industries doc's sponsor fields.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { ExternalLink, Building2, Users, Star, ChevronRight, BadgeCheck } from "lucide-react";
import type { ArenaIndustry } from "@/lib/arenaService";

// ─── Types ────────────────────────────────────────────────────────────────────

// Extended sponsor fields stored on arena_industries doc
export interface SponsorBrandingFields {
  sponsorCompanyId:       string;
  sponsorCompanyName:     string;
  sponsorLogoUrl:         string | null;
  sponsorBannerUrl:       string | null;   // wide banner image
  sponsorBrandColor:      string | null;   // hex, e.g. "#6772E5" for Stripe
  sponsorTagline:         string | null;   // short sponsor message
  sponsorAbout:           string | null;   // 2-3 sentence company description
  sponsorWebsiteUrl:      string | null;
  sponsorCareersUrl:      string | null;
  sponsorEmployeeCount:   string | null;   // "1,000–5,000"
  sponsorHeadquarters:    string | null;   // "San Francisco, CA"
  sponsorshipExpiresAt:   string | null;
}

// ─── 1. Sponsor hero banner ───────────────────────────────────────────────────

interface ArenaSponsorHeroProps {
  industry: ArenaIndustry & Partial<SponsorBrandingFields>;
}

export function ArenaSponsorHero({ industry }: ArenaSponsorHeroProps) {
  if (!industry.sponsorCompanyId) return null;

  const brandColor  = industry.sponsorBrandColor ?? "#1a6b3c";
  const hasBanner   = !!industry.sponsorBannerUrl;
  const hasLogo     = !!industry.sponsorLogoUrl;

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden mb-6"
      style={{ minHeight: hasBanner ? 180 : 110 }}
    >
      {/* Background — banner image OR brand colour gradient */}
      {hasBanner ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${industry.sponsorBannerUrl})` }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: brandColor }}
        />
      )}

      {/* Overlay for readability */}
      <div
        className="absolute inset-0"
        style={{
          background: hasBanner
            ? `linear-gradient(135deg, ${brandColor}e6 0%, ${brandColor}99 50%, transparent 100%)`
            : "rgba(0,0,0,0.15)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 p-6 flex items-end justify-between h-full" style={{ minHeight: hasBanner ? 180 : 110 }}>
        <div className="flex items-center gap-4">
          {/* Sponsor logo */}
          {hasLogo ? (
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-lg flex-shrink-0 p-2">
              <img
                src={industry.sponsorLogoUrl!}
                alt={industry.sponsorCompanyName}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border border-white/30">
              <Building2 size={24} className="text-white" />
            </div>
          )}

          <div>
            {/* Presented by label */}
            <div className="flex items-center gap-1.5 mb-1">
              <Star size={11} className="text-white/70" />
              <span className="text-[10px] font-semibold text-white/70 uppercase tracking-widest">
                Presented by
              </span>
            </div>
            <p className="text-xl font-bold text-white">{industry.sponsorCompanyName}</p>
            {industry.sponsorTagline && (
              <p className="text-sm text-white/80 mt-0.5">{industry.sponsorTagline}</p>
            )}
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {industry.sponsorCareersUrl && (
            <a
              href={industry.sponsorCareersUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold bg-white text-stone-900 rounded-xl px-3.5 py-2 hover:bg-stone-50 transition-colors"
            >
              <Users size={12} />
              We're hiring
              <ExternalLink size={10} />
            </a>
          )}
          {industry.sponsorWebsiteUrl && (
            <a
              href={industry.sponsorWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-xl px-3.5 py-2 hover:bg-white/30 transition-colors"
            >
              Visit site
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>

      {/* Naming rights label — bottom right */}
      <div className="absolute top-3 right-3 z-10">
        <span className="text-[9px] font-semibold text-white/60 bg-black/20 rounded-full px-2 py-0.5">
          Naming rights partner
        </span>
      </div>
    </div>
  );
}

// ─── 2. Sponsor badge on challenge cards ──────────────────────────────────────

interface SponsorChallengeBadgeProps {
  industry: ArenaIndustry & Partial<SponsorBrandingFields>;
  compact?: boolean;
}

export function SponsorChallengeBadge({ industry, compact = false }: SponsorChallengeBadgeProps) {
  if (!industry.sponsorCompanyId) return null;

  const brandColor = industry.sponsorBrandColor ?? "#1a6b3c";

  if (compact) {
    // Tiny version for challenge cards
    return (
      <div
        className="flex items-center gap-1 rounded-full px-2 py-0.5"
        style={{ background: brandColor + "15", border: `1px solid ${brandColor}30` }}
      >
        {industry.sponsorLogoUrl ? (
          <img
            src={industry.sponsorLogoUrl}
            alt={industry.sponsorCompanyName}
            className="h-3 w-auto object-contain"
          />
        ) : (
          <Star size={9} style={{ color: brandColor }} />
        )}
        <span className="text-[9px] font-semibold" style={{ color: brandColor }}>
          {industry.sponsorCompanyName} arena
        </span>
      </div>
    );
  }

  // Full version for arena header
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: brandColor + "10", border: `1px solid ${brandColor}25` }}
    >
      {industry.sponsorLogoUrl ? (
        <img
          src={industry.sponsorLogoUrl}
          alt={industry.sponsorCompanyName}
          className="h-5 w-auto object-contain"
        />
      ) : (
        <Star size={13} style={{ color: brandColor }} />
      )}
      <span className="text-xs font-semibold" style={{ color: brandColor }}>
        Presented by {industry.sponsorCompanyName}
      </span>
      <BadgeCheck size={13} style={{ color: brandColor }} />
    </div>
  );
}

// ─── 3. Sponsor spotlight section ────────────────────────────────────────────

interface SponsorSpotlightProps {
  industry: ArenaIndustry & Partial<SponsorBrandingFields>;
}

export function SponsorSpotlight({ industry }: SponsorSpotlightProps) {
  if (!industry.sponsorCompanyId || !industry.sponsorAbout) return null;

  const [expanded, setExpanded] = useState(false);
  const brandColor = industry.sponsorBrandColor ?? "#1a6b3c";

  return (
    <div
      className="rounded-2xl overflow-hidden mt-8"
      style={{ border: `1px solid ${brandColor}25` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer"
        style={{ background: brandColor + "08" }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          {industry.sponsorLogoUrl ? (
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm p-1.5">
              <img
                src={industry.sponsorLogoUrl}
                alt={industry.sponsorCompanyName}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: brandColor + "20" }}
            >
              <Building2 size={16} style={{ color: brandColor }} />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-stone-900">
              About {industry.sponsorCompanyName}
            </p>
            <p className="text-xs text-stone-500">Arena naming rights sponsor</p>
          </div>
        </div>
        <ChevronRight
          size={16}
          className="text-stone-400 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="p-5 border-t" style={{ borderColor: brandColor + "20" }}>
          {/* About text */}
          <p className="text-sm text-stone-600 leading-relaxed mb-4">
            {industry.sponsorAbout}
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {industry.sponsorHeadquarters && (
              <div className="bg-stone-50 rounded-xl p-3 text-center">
                <p className="text-xs font-semibold text-stone-900">{industry.sponsorHeadquarters}</p>
                <p className="text-[10px] text-stone-500 mt-0.5">Headquarters</p>
              </div>
            )}
            {industry.sponsorEmployeeCount && (
              <div className="bg-stone-50 rounded-xl p-3 text-center">
                <p className="text-xs font-semibold text-stone-900">{industry.sponsorEmployeeCount}</p>
                <p className="text-[10px] text-stone-500 mt-0.5">Employees</p>
              </div>
            )}
            <div className="bg-stone-50 rounded-xl p-3 text-center">
              <p className="text-xs font-semibold text-stone-900">
                {industry.totalChallengesEver ?? 0}
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">Challenges posted</p>
            </div>
          </div>

          {/* CTA links */}
          <div className="flex items-center gap-2 flex-wrap">
            {industry.sponsorWebsiteUrl && (
              <a
                href={industry.sponsorWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3.5 py-2 border transition-colors"
                style={{
                  borderColor: brandColor + "40",
                  color: brandColor,
                  background: brandColor + "08",
                }}
              >
                Visit {industry.sponsorCompanyName}
                <ExternalLink size={10} />
              </a>
            )}
            {industry.sponsorCareersUrl && (
              <a
                href={industry.sponsorCareersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold bg-stone-100 text-stone-700 rounded-xl px-3.5 py-2 border border-stone-200 hover:bg-stone-200 transition-colors"
              >
                <Users size={11} />
                Open roles
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 4. Ops: Sponsor branding form ────────────────────────────────────────────
// Add this to ArenaSponsorManagement in ops-arena-modules.jsx
// It extends the existing "Assign sponsor" modal with branding fields.

export const SPONSOR_BRANDING_FIELDS = [
  { field: "sponsorBannerUrl",     label: "Banner image URL",     placeholder: "https://cdn.company.com/bewatu-banner.jpg", hint: "1200×400px recommended. Used as the hero image on the arena page." },
  { field: "sponsorBrandColor",    label: "Brand colour (hex)",   placeholder: "#6772E5", hint: "Primary brand colour. Used for accents and the hero background if no banner." },
  { field: "sponsorTagline",       label: "Sponsor tagline",      placeholder: "Building financial infrastructure for the internet", hint: "Short message shown under the company name in the hero." },
  { field: "sponsorAbout",         label: "About the company",    placeholder: "2–3 sentences about your company and what you do.", hint: "Shown in the expandable sponsor spotlight section." },
  { field: "sponsorWebsiteUrl",    label: "Website URL",          placeholder: "https://stripe.com", hint: "Links from the 'Visit site' button." },
  { field: "sponsorCareersUrl",    label: "Careers page URL",     placeholder: "https://stripe.com/jobs", hint: "Links from the 'We're hiring' button. Leave blank to hide the button." },
  { field: "sponsorHeadquarters",  label: "Headquarters",         placeholder: "San Francisco, CA", hint: "Shown in the sponsor spotlight stats row." },
  { field: "sponsorEmployeeCount", label: "Employee count",       placeholder: "1,000–5,000", hint: "Approximate range shown in spotlight." },
] as const;
