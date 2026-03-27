/**
 * components/ArenaDiscovery.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The top-level arena landing page — shows all 8 industry arenas as cards.
 * Clicking an arena opens ArenaIndustryView (industry-scoped challenge feed).
 *
 * Add to App.tsx:
 *   case View.Arenas:
 *     content = <ArenaDiscovery onSelectIndustry={(slug) => { setActiveArenaIndustry(slug); setCurrentView(View.ArenaIndustry); }} />;
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from "react";
import {
  CreditCard, Building2, Shield, Heart, TrendingUp,
  BarChart3, FileCheck, Home, Trophy, Users, Zap,
  ChevronRight, Star, Lock, BadgeCheck,
} from "lucide-react";
import {
  getArenaIndustries,
  type ArenaIndustry,
  type IndustrySlug,
} from "../../lib/arenaService";

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ size?: number; color?: string }>> = {
  CreditCard: ({ size = 20, color }) => <CreditCard size={size} color={color} />,
  Building2:  ({ size = 20, color }) => <Building2  size={size} color={color} />,
  Shield:     ({ size = 20, color }) => <Shield     size={size} color={color} />,
  Heart:      ({ size = 20, color }) => <Heart      size={size} color={color} />,
  TrendingUp: ({ size = 20, color }) => <TrendingUp size={size} color={color} />,
  BarChart3:  ({ size = 20, color }) => <BarChart3  size={size} color={color} />,
  FileCheck:  ({ size = 20, color }) => <FileCheck  size={size} color={color} />,
  Home:       ({ size = 20, color }) => <Home       size={size} color={color} />,
};

// ─── Industry card ─────────────────────────────────────────────────────────

function IndustryCard({
  industry,
  onClick,
}: {
  industry: ArenaIndustry;
  onClick: () => void;
}) {
  const IconComp = ICON_MAP[industry.icon] ?? ICON_MAP.CreditCard;
  const isSponsored = !!industry.sponsorCompanyId;
  const prizePool = industry.totalPrizePool;

  function formatPrize(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  }

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left rounded-2xl border border-stone-200 bg-white hover:border-stone-300 hover:shadow-md transition-all duration-200 overflow-hidden"
      style={{ padding: 0 }}
    >
      {/* Sponsor stripe */}
      {isSponsored && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: industry.color }}
        />
      )}

      <div style={{ padding: "20px 20px 16px" }}>
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 44,
              height: 44,
              background: industry.color + "18",
            }}
          >
            <IconComp size={20} color={industry.color} />
          </div>
          <ChevronRight
            size={16}
            className="text-stone-300 group-hover:text-stone-500 group-hover:translate-x-0.5 transition-all mt-1"
          />
        </div>

        {/* Name + tagline */}
        <h3 className="font-semibold text-stone-900 text-base mb-1 group-hover:text-stone-700 transition-colors">
          {industry.name}
        </h3>
        <p className="text-stone-500 text-xs leading-relaxed mb-4">
          {industry.tagline}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Trophy size={12} className="text-stone-400" />
            <span className="text-xs font-medium text-stone-700">
              {industry.activeChallengeCount} live
            </span>
          </div>
          {prizePool > 0 && (
            <div className="flex items-center gap-1.5">
              <Zap size={12} className="text-stone-400" />
              <span className="text-xs font-medium text-stone-700">
                {formatPrize(prizePool)} in prizes
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Sponsor footer */}
      {isSponsored ? (
        <div
          className="border-t border-stone-100 px-5 py-2.5 flex items-center gap-2"
          style={{ background: industry.color + "08" }}
        >
          {industry.sponsorLogoUrl ? (
            <img
              src={industry.sponsorLogoUrl}
              alt={industry.sponsorCompanyName ?? ""}
              className="h-4 object-contain opacity-70"
            />
          ) : (
            <Star size={11} style={{ color: industry.color }} />
          )}
          <span className="text-xs" style={{ color: industry.color + "cc" }}>
            Presented by {industry.sponsorCompanyName}
          </span>
        </div>
      ) : (
        <div className="border-t border-stone-100 px-5 py-2.5 flex items-center gap-2">
          <span className="text-xs text-stone-400 italic">Sponsorship available</span>
        </div>
      )}
    </button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.FC<{size?: number}> }) {
  return (
    <div className="bg-stone-50 rounded-xl border border-stone-200 px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} />
        <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-stone-900">{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ArenaDiscoveryProps {
  onSelectIndustry: (slug: IndustrySlug) => void;
  onPostChallenge?: () => void;
  currentUserCompany?: { id: string; verifiedIndustries?: string[] } | null;
}

export default function ArenaDiscovery({
  onSelectIndustry,
  onPostChallenge,
  currentUserCompany,
}: ArenaDiscoveryProps) {
  const [industries, setIndustries] = useState<ArenaIndustry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getArenaIndustries()
      .then(setIndustries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalLive    = industries.reduce((s, i) => s + i.activeChallengeCount, 0);
  const totalPrize   = industries.reduce((s, i) => s + i.totalPrizePool, 0);
  const sponsored    = industries.filter((i) => i.sponsorCompanyId).length;

  function formatPrize(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-stone-100 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={22} className="text-stone-800" />
            <h1 className="text-2xl font-bold text-stone-900">BeWatu Arenas</h1>
          </div>
          <p className="text-stone-500 text-sm max-w-lg">
            Industry-sponsored challenge arenas. Verified companies post real problems
            with real prizes. Solve them to build your reputation.
          </p>
        </div>
        {onPostChallenge && currentUserCompany && (
          <button
            onClick={onPostChallenge}
            className="flex items-center gap-2 rounded-xl bg-stone-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-800 transition-colors"
          >
            <Zap size={14} />
            Post a Challenge
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Live challenges" value={totalLive}        icon={Trophy}    />
        <StatCard label="Total prizes"    value={formatPrize(totalPrize)} icon={Zap} />
        <StatCard label="Industries"      value={industries.length} icon={BarChart3} />
        <StatCard label="Sponsored arenas" value={`${sponsored} / ${industries.length}`} icon={Star} />
      </div>

      {/* How it works strip */}
      <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5 mb-8">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">How arenas work</p>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 flex-shrink-0 mt-0.5">1</div>
            <div>
              <p className="font-medium text-stone-800 mb-0.5">Browse challenges</p>
              <p className="text-stone-500 text-xs leading-relaxed">Pick an industry arena. Find real problems posted by verified companies with confirmed prizes.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 flex-shrink-0 mt-0.5">2</div>
            <div>
              <p className="font-medium text-stone-800 mb-0.5">Submit your solution</p>
              <p className="text-stone-500 text-xs leading-relaxed">Your identity is hidden until shortlisted. Companies judge work on merit, not your CV.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 flex-shrink-0 mt-0.5">3</div>
            <div>
              <p className="font-medium text-stone-800 mb-0.5">Win prizes & reputation</p>
              <p className="text-stone-500 text-xs leading-relaxed">Winners receive cash prizes and earn arena performance scores that unlock Factory access.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Industry grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {industries.map((industry) => (
          <IndustryCard
            key={industry.id}
            industry={industry}
            onClick={() => onSelectIndustry(industry.id as IndustrySlug)}
          />
        ))}
      </div>

      {/* Company CTA */}
      <div className="mt-10 rounded-2xl border border-stone-200 bg-gradient-to-r from-stone-50 to-white p-6 flex items-center justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck size={16} className="text-stone-600" />
            <p className="font-semibold text-stone-900">Post challenges in your industry</p>
          </div>
          <p className="text-stone-500 text-sm">
            Verified companies can post challenges starting at $500. Get solutions from top talent across our network.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs text-stone-500 flex items-center gap-1.5">
            <Lock size={11} />
            Industry verification required
          </div>
          {onPostChallenge && (
            <button
              onClick={onPostChallenge}
              className="rounded-xl border border-stone-300 bg-white text-stone-800 px-4 py-2 text-sm font-semibold hover:bg-stone-50 transition-colors"
            >
              Learn about posting
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
