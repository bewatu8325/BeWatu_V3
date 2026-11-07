/**
 * components/ArenaIndustryView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The challenge feed for a single industry arena.
 * Shows: sponsor branding, active challenges, filters, CTA to post.
 *
 * Add to App.tsx View enum:
 *   ArenaIndustry = 'ARENA_INDUSTRY'
 *
 * Case in renderModule:
 *   case View.ArenaIndustry:
 *     content = <ArenaIndustryView industry={activeArenaIndustry} onSelectChallenge={...} onBack={...} />;
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, Trophy, Zap, Shield, BadgeCheck, Star,
  Clock, Users, ChevronRight, Filter, Search, Building2,
  Lock, TrendingUp, FileCheck, ArrowUpRight,
} from "lucide-react";
import {
  getArenaIndustry,
  subscribeToIndustryChallenges,
  type ArenaIndustry,
  type ArenaChallenge,
  type IndustrySlug,
  type ChallengeTier,
} from "../../lib/arenaService";
import { SponsoredArenaHero, useActiveSponsorships } from "./SponsorBrand";
import { fetchSponsorshipBanner } from "../../lib/arenaSponsorshipService";
import { safeHttpsUrl } from "../../lib/arenaSponsorship";
import BecomeSponsorModal from "./BecomeSponsorModal";

// ─── Challenge card ───────────────────────────────────────────────────────────

const deadlineOf = (c: ArenaChallenge): number => {
  const raw = (c.deadline as any);
  return raw?.seconds ? raw.seconds * 1000 : new Date(c.deadline).getTime();
};
/** A challenge is completed once its deadline has passed or it has been closed. */
const isCompleted = (c: ArenaChallenge, now: number) => !!c.closedAt || (Number.isFinite(deadlineOf(c)) && deadlineOf(c) < now);

function ChallengeCard({
  challenge,
  sponsorCompanyId,
  completed,
  onClick,
}: {
  challenge:  ArenaChallenge;
  /** The Arena's active sponsor, if any: its own challenges are labelled. Other companies keep their own name. */
  sponsorCompanyId: string | null;
  completed?: boolean;
  onClick:    () => void;
}) {
  // Defensive defaults — handles both seeded data and full challenge docs
  const tier        = (challenge.tier ?? 'standard') as ChallengeTier;
  const companyName = challenge.companyName ?? 'BeWatu';
  const description = challenge.description ?? (challenge as any).brief ?? '';
  const prizeAmount = challenge.prizeAmount ?? 0;
  const prizeLabel  = (challenge as any).prize ?? (prizeAmount > 0 ? `$${prizeAmount >= 1000 ? (prizeAmount/1000).toFixed(0)+'K' : prizeAmount}` : 'Prize TBC');

  const deadlineRaw = (challenge.deadline as any);
  const deadlineMs  = deadlineRaw?.seconds
    ? deadlineRaw.seconds * 1000
    : new Date(challenge.deadline).getTime();
  const daysLeft    = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 86400000));

  const tierStyle: Record<ChallengeTier, { bg: string; text: string; label: string }> = {
    standard:  { bg: "#f1f5f9", text: "#475569", label: "Standard"  },
    featured:  { bg: "#fef3c7", text: "#92400e", label: "Featured"  },
    exclusive: { bg: "#ede9fe", text: "#6d28d9", label: "Exclusive" },
  };
  const tierCfg = tierStyle[tier] ?? tierStyle.standard;

  function formatPrize(n: number) {
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n}`;
  }

  return (
    <button
      onClick={onClick}
      className={"group w-full text-left bg-white border border-stone-200 rounded-2xl hover:border-stone-300 hover:shadow-sm transition-all duration-200 overflow-hidden" + (completed ? " opacity-80" : "")}
    >
      {/* Featured/Exclusive banner */}
      {tier !== "standard" && (
        <div
          className="px-4 py-1.5 flex items-center gap-1.5"
          style={{ background: tierCfg.bg }}
        >
          <Star size={11} style={{ color: tierCfg.text }} />
          <span className="text-xs font-semibold" style={{ color: tierCfg.text }}>
            {tierCfg.label}
          </span>
        </div>
      )}

      <div className="p-5">
        {/* Company row */}
        <div className="flex items-center gap-2.5 mb-3">
          {challenge.companyLogoUrl ? (
            <img
              src={challenge.companyLogoUrl}
              alt={companyName}
              className="h-7 w-7 rounded-lg object-contain border border-stone-100"
            />
          ) : (
            <div className="h-7 w-7 rounded-lg bg-stone-100 flex items-center justify-center">
              <Building2 size={14} className="text-stone-600" />
            </div>
          )}
          <span className="text-xs font-medium text-stone-600">{companyName}</span>
          {challenge.isVerifiedPoster && (
            <BadgeCheck size={13} className="text-blue-500" />
          )}
          {challenge.isRegulatedPoster && (
            <Shield size={13} className="text-emerald-500" />
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Clock size={11} className="text-stone-600" />
              <span className={`text-xs font-medium ${!completed && daysLeft <= 3 ? "text-red-600" : "text-stone-600"}`}>
                {completed ? "Closed" : daysLeft + "d left"}
              </span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-stone-900 text-sm mb-1.5 line-clamp-2 group-hover:text-stone-700 transition-colors">
          {challenge.title}
        </h3>
        <p className="text-stone-600 text-xs leading-relaxed mb-4 line-clamp-2">
          {description}
        </p>

        {/* Skills */}
        {(challenge.skills ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(challenge.skills ?? []).slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="text-xs bg-stone-100 text-stone-600 rounded-full px-2.5 py-0.5"
              >
                {skill}
              </span>
            ))}
            {challenge.skills.length > 3 && (
              <span className="text-xs text-stone-600">+{challenge.skills.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Trophy size={12} className="text-amber-500" />
              <span className="text-sm font-bold text-stone-900">
                {prizeAmount > 0 ? formatPrize(prizeAmount) : prizeLabel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Users size={11} className="text-stone-600" />
              <span className="text-xs text-stone-600">{challenge.submissionCount ?? 0}</span>
            </div>
            {sponsorCompanyId && challenge.companyId === sponsorCompanyId && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">Sponsor challenge</span>
            )}
          </div>
          <ChevronRight
            size={14}
            className="text-stone-300 group-hover:text-stone-600 group-hover:translate-x-0.5 transition-all"
          />
        </div>
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ArenaIndustryViewProps {
  industry: IndustrySlug;
  onBack: () => void;
  onSelectChallenge: (challengeId: string) => void;
  onPostChallenge?: () => void;
  /** Opens a company's BeWatu profile (used by the sponsor introduction). */
  onViewCompany?: (companyId: string) => void;
  currentUserCompany?: { verifiedIndustries?: string[] } | null;
}

export default function ArenaIndustryView({
  industry,
  onBack,
  onSelectChallenge,
  onPostChallenge,
  onViewCompany,
  currentUserCompany,
}: ArenaIndustryViewProps) {
  const [arenaData, setArenaData] = useState<ArenaIndustry | null>(null);
  const [challenges, setChallenges] = useState<ArenaChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<ChallengeTier | "all">("all");
  const [sortBy, setSortBy] = useState<"recent" | "prize" | "deadline">("recent");
  const [banner, setBanner] = useState<string | null>(null);
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const { forArena, now, loading: sponsorsLoading } = useActiveSponsorships();
  // The sponsor is whoever has an approved sponsorship covering today. Nothing else counts.
  const sponsor = forArena(industry);

  const isVerified = currentUserCompany?.verifiedIndustries?.includes(industry);

  useEffect(() => {
    setLoading(true);
    getArenaIndustry(industry).then(setArenaData).catch(console.error);

    const unsub = subscribeToIndustryChallenges(industry, (data) => {
      setChallenges(data);
      setLoading(false);
    });
    return unsub;
  }, [industry]);

  useEffect(() => {
    setBanner(null);
    if (!sponsor?.branding.hasBanner) return;
    let cancelled = false;
    fetchSponsorshipBanner(sponsor.id).then(b => { if (!cancelled) setBanner(b); });
    return () => { cancelled = true; };
  }, [sponsor?.id, sponsor?.branding.hasBanner]);

  const filtered = useMemo(() => {
    let result = [...challenges];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.title ?? '').toLowerCase().includes(q) ||
          (c.description ?? (c as any).brief ?? '').toLowerCase().includes(q) ||
          (c.companyName ?? '').toLowerCase().includes(q) ||
          (c.skills ?? []).some((s) => s.toLowerCase().includes(q))
      );
    }
    if (tierFilter !== "all") result = result.filter((c) => (c.tier ?? 'standard') === tierFilter);
    switch (sortBy) {
      case "prize":    result.sort((a, b) => (b.prizeAmount ?? 0) - (a.prizeAmount ?? 0)); break;
      case "deadline": result.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()); break;
      default:         result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    // Featured + Exclusive float to top
    return [
      ...result.filter((c) => (c.tier ?? 'standard') === "exclusive"),
      ...result.filter((c) => (c.tier ?? 'standard') === "featured"),
      ...result.filter((c) => (c.tier ?? 'standard') === "standard"),
    ];
  }, [challenges, search, tierFilter, sortBy]);

  const activeList    = filtered.filter(c => !isCompleted(c, now));
  const completedList = filtered.filter(c => isCompleted(c, now));
  const activeCount   = challenges.filter(c => !isCompleted(c, now)).length;
  const totalPrize    = challenges.filter(c => !isCompleted(c, now)).reduce((s, c) => s + (c.prizeAmount ?? 0), 0);

  if (!arenaData && !loading) {
    return (
      <div className="p-8 text-center text-stone-600">
        Arena not found.
        <button onClick={onBack} className="ml-2 underline">Go back</button>
      </div>
    );
  }

  const color = arenaData?.color ?? "var(--bw-green)";

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Back nav */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-stone-600 hover:text-stone-800 text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={15} />
        All Arenas
      </button>

      {/* Arena header: sponsored -> the sponsor's branded hero; otherwise BeWatu's default branding. */}
      {(() => {
        const stats = (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5">
              <Zap size={13} style={{ color }} />
              <span className="font-semibold text-stone-800">{activeCount} active challenge{activeCount === 1 ? "" : "s"}</span>
            </div>
            {totalPrize > 0 && (
              <div className="flex items-center gap-1.5">
                <Trophy size={13} className="text-amber-500" />
                <span className="font-semibold text-stone-800">${totalPrize.toLocaleString()} in prizes</span>
              </div>
            )}
            {arenaData?.requiresRegulatory && (
              <div className="flex items-center gap-1.5">
                <Shield size={13} className="text-emerald-600" />
                <span className="text-xs text-stone-600">Regulated companies</span>
              </div>
            )}
          </div>
        );
        const actions = (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href="#arena-challenges" className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: "var(--bw-green)" }}>
              <Trophy size={14} /> Browse challenges
            </a>
            {onPostChallenge && (
              <button onClick={onPostChallenge} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50">
                <Zap size={13} /> Post a challenge
              </button>
            )}
          </div>
        );
        if (sponsorsLoading) {
          // Not yet known whether this Arena is sponsored: hold a neutral placeholder instead of flashing the wrong state.
          return <div className="h-48 animate-pulse rounded-2xl bg-stone-100" aria-hidden="true" />;
        }
        if (sponsor) {
          return (
            <SponsoredArenaHero sponsorship={sponsor} banner={banner}>
              <div className="flex items-start gap-3">
                <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: color + "18" }}>
                  <Trophy size={20} style={{ color }} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-stone-900">{arenaData?.name ?? "Loading..."}</h1>
                  <p className="mt-1 max-w-2xl text-sm text-stone-600">{arenaData?.description}</p>
                </div>
              </div>
              <div className="mt-4">{stats}</div>
              {actions}
            </SponsoredArenaHero>
          );
        }
        return (
          <div className="relative mb-0 overflow-hidden rounded-2xl p-6" style={{ background: color + "12", border: "1px solid " + color + "30" }}>
            <div className="flex items-start gap-4">
              <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 52, height: 52, background: color + "20" }}>
                <Trophy size={24} style={{ color }} />
              </div>
              <div className="min-w-0">
                <h1 className="mb-1 text-2xl font-bold text-stone-900">{arenaData?.name ?? "Loading..."}</h1>
                <p className="mb-4 max-w-xl text-sm text-stone-600">{arenaData?.description}</p>
                {stats}
                {actions}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: color + "30" }}>
              <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-stone-700">Sponsorship available</span>
              <button type="button" onClick={() => setShowSponsorModal(true)} className="text-sm font-semibold hover:underline" style={{ color: "var(--bw-green)" }}>
                Become a sponsor →
              </button>
            </div>
          </div>
        );
      })()}

      {/* About the sponsor: introduction and a link to its BeWatu profile */}
      {sponsor && (sponsor.branding.description || sponsor.branding.links.length > 0 || onViewCompany) && (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-label={"About " + sponsor.companyName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">About the sponsor</p>
          <h2 className="mt-1 text-lg font-semibold text-stone-900">{sponsor.companyName}</h2>
          {sponsor.branding.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-stone-700">{sponsor.branding.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            {onViewCompany && sponsor.companyId && (
              <button type="button" onClick={() => onViewCompany(sponsor.companyId)} className="inline-flex items-center gap-1 text-sm font-semibold hover:underline" style={{ color: "var(--bw-green)" }}>
                View {sponsor.companyName} on BeWatu →
              </button>
            )}
            {[...(sponsor.branding.website ? [{ label: "Website", url: sponsor.branding.website }] : []), ...sponsor.branding.links]
              .map(l => ({ label: l.label, url: safeHttpsUrl(l.url) }))
              .filter((l): l is { label: string; url: string } => !!l.url)
              .map(l => (
                <a key={l.url + l.label} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-medium text-stone-700 underline-offset-2 hover:underline">
                  {l.label} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              ))}
          </div>
        </section>
      )}

      <div className="mb-6" />

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search challenges, companies, or skills…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-stone-200 rounded-xl bg-white focus:outline-none focus:border-stone-400"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-stone-600" />
          {(["all", "standard", "featured", "exclusive"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors capitalize ${
                tierFilter === t
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
              }`}
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white text-stone-600 focus:outline-none"
          >
            <option value="recent">Most recent</option>
            <option value="prize">Highest prize</option>
            <option value="deadline">Closing soon</option>
          </select>
        </div>
      </div>

      {/* Challenge grid */}
      <div id="arena-challenges" className="scroll-mt-4" />
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Trophy size={32} className="text-stone-200 mx-auto mb-3" />
          <p className="text-stone-600 text-sm">
            {challenges.length === 0
              ? "No challenges posted yet in this arena."
              : "No challenges match your filters."}
          </p>
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-stone-800">Active challenges ({activeList.length})</h2>
          {activeList.length === 0 ? (
            <p className="mb-8 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-600">No active challenges right now.</p>
          ) : (
            <div className="mb-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeList.map((challenge) => (
                <ChallengeCard key={challenge.id} challenge={challenge} sponsorCompanyId={sponsor?.companyId ?? null} onClick={() => onSelectChallenge(challenge.id)} />
              ))}
            </div>
          )}
          {completedList.length > 0 && (
            <>
              <h2 className="mb-3 text-sm font-semibold text-stone-800">Completed challenges ({completedList.length})</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedList.map((challenge) => (
                  <ChallengeCard key={challenge.id} challenge={challenge} sponsorCompanyId={sponsor?.companyId ?? null} completed onClick={() => onSelectChallenge(challenge.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Post challenge CTA */}
      <div className="mt-8 rounded-2xl border border-stone-200 p-5 flex items-center justify-between gap-4 flex-wrap bg-stone-50">
        <div>
          <p className="font-semibold text-stone-800 text-sm mb-1">
            Post a challenge in this arena
          </p>
          <p className="text-stone-600 text-xs">
            {isVerified
              ? `Your company is verified for the ${arenaData?.name ?? "this"} arena. Challenges start at $500.`
              : `Requires industry verification for ${arenaData?.name ?? "this arena"}. Verification takes 1–2 business days.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isVerified && (
            <div className="flex items-center gap-1.5 text-xs text-stone-600">
              <Lock size={11} />
              Verify your company first
            </div>
          )}
          {onPostChallenge && (
            <button
              onClick={onPostChallenge}
              className="flex items-center gap-2 rounded-xl bg-stone-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-800 transition-colors"
            >
              {isVerified ? (
                <><Zap size={13} /> Post a Challenge</>
              ) : (
                <><FileCheck size={13} /> Start Verification</>
              )}
            </button>
          )}
        </div>
      </div>
      {showSponsorModal && (
        <BecomeSponsorModal arenaId={industry} arenaName={arenaData?.name ?? "this Arena"} onClose={() => setShowSponsorModal(false)} />
      )}
    </div>
  );
}
