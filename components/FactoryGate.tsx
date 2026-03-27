"use client";

/**
 * components/FactoryGate.tsx  (bewatu.com)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown when a user clicks "Go to Factory" but hasn't qualified yet.
 * If they've earned access (score ≥ 60) but haven't subscribed,
 * shows the $49/month paywall with a Stripe Checkout CTA.
 * If they haven't earned access yet, shows their score progress.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import {
  Rocket, Lock, CheckCircle2, ChevronRight, Zap,
  Lightbulb, Users, Trophy, TrendingUp, Star, X,
} from "lucide-react";
import {
  computeGraduationStatus,
  SIGNAL_META,
  GRADUATION_THRESHOLD,
  FACTORY_PRICE_MONTHLY,
  type GraduationStatus,
} from "@/lib/graduation";

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r         = (size / 2) - 6;
  const circ      = 2 * Math.PI * r;
  const filled    = (score / 100) * circ;
  const color     = score >= 60 ? "#1a6b3c" : score >= 40 ? "#f59e0b" : "#e5e7eb";

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={6} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
    </svg>
  );
}

// ─── Signal bar ───────────────────────────────────────────────────────────────

function SignalBar({ label, weight, value, icon: Icon }: {
  label: string; weight: string; value: number; icon: React.ElementType;
}) {
  const color = value >= 60 ? "#1a6b3c" : value >= 40 ? "#f59e0b" : "#d1d5db";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-stone-600">
          <Icon size={12} style={{ color }} />
          <span>{label}</span>
          <span className="text-stone-400">({weight})</span>
        </div>
        <span className="font-semibold" style={{ color }}>{value}/100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Not qualified view ───────────────────────────────────────────────────────

function NotQualifiedView({ status }: { status: GraduationStatus }) {
  const progressPct = Math.round((status.compositeScore / GRADUATION_THRESHOLD) * 100);
  const SIGNAL_ICONS = {
    ideaTractionScore:     Lightbulb,
    collaborationScore:    Users,
    teamFormationScore:    TrendingUp,
    arenaPerformanceScore: Trophy,
  };

  return (
    <div className="space-y-6">
      {/* Score display */}
      <div className="flex items-center gap-5 bg-stone-50 border border-stone-200 rounded-2xl p-5">
        <div className="relative flex-shrink-0">
          <ScoreRing score={status.compositeScore} size={80} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-bold text-stone-900 leading-none">{status.compositeScore}</p>
              <p className="text-[9px] text-stone-500 leading-none mt-0.5">/ 100</p>
            </div>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-stone-900 mb-0.5">
            {status.pointsToGo} points to go
          </p>
          <p className="text-xs text-stone-500 mb-3">
            You need a composite score of {GRADUATION_THRESHOLD} to unlock Factory access.
          </p>
          <div className="h-2 w-full rounded-full bg-stone-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-700"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
          </div>
          <p className="text-[10px] text-stone-400 mt-1">{progressPct}% of the way there</p>
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">Your scores</p>
        {(Object.entries(status.signals) as [keyof typeof SIGNAL_META, number][]).map(([key, val]) => (
          <SignalBar
            key={key}
            label={SIGNAL_META[key].label}
            weight={SIGNAL_META[key].weight}
            value={val}
            icon={SIGNAL_ICONS[key]}
          />
        ))}
      </div>

      {/* Next actions */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-emerald-800 mb-2.5">What to do next</p>
        <div className="space-y-2">
          {status.nextActions.map(action => (
            <div key={action} className="flex items-start gap-2">
              <ChevronRight size={12} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700">{action}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What Factory is */}
      <div className="border border-stone-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-stone-600 mb-2.5">What you unlock at Factory</p>
        {[
          "Problem → Startup pipeline workspace",
          "Team formation and co-founder matching",
          "Incubator program access",
          "Investor discovery and direct messaging",
          "Traction dashboard and milestone tracking",
          "Factory leaderboard visibility",
        ].map(item => (
          <div key={item} className="flex items-center gap-2 py-1.5 border-b border-stone-100 last:border-0">
            <CheckCircle2 size={12} className="text-stone-300 flex-shrink-0" />
            <p className="text-xs text-stone-500">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Qualified — show paywall ─────────────────────────────────────────────────

function QualifiedPaywallView({
  status,
  onSubscribe,
  loading,
}: {
  status:      GraduationStatus;
  onSubscribe: () => void;
  loading:     boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Earned badge */}
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={20} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-900">You've earned Factory access!</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            Score: {status.compositeScore}/100 — above the {GRADUATION_THRESHOLD} threshold
          </p>
        </div>
      </div>

      {/* Pricing card */}
      <div className="border-2 border-emerald-500 rounded-2xl overflow-hidden">
        <div className="bg-emerald-600 px-5 py-3 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Factory</p>
          <span className="text-[10px] font-semibold bg-white/20 text-white rounded-full px-2.5 py-1">
            14-day free trial
          </span>
        </div>
        <div className="p-5">
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-3xl font-bold text-stone-900">${FACTORY_PRICE_MONTHLY}</span>
            <span className="text-sm text-stone-500">/month</span>
          </div>
          <div className="space-y-2 mb-5">
            {[
              "Everything in Pro",
              "Factory workspace — full pipeline tools",
              "Idea validation suite",
              "Startup pipeline (Problem → Startup)",
              "Incubator program access",
              "Investor discovery & direct messaging",
              "Traction dashboard",
              "Up to 3 team members included",
              "Factory leaderboard visibility",
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                <p className="text-sm text-stone-700">{item}</p>
              </div>
            ))}
          </div>
          <button
            onClick={onSubscribe}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl py-3.5 text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? "Redirecting to checkout…" : (
              <><Rocket size={15} /> Unlock Factory — 14-day free trial</>
            )}
          </button>
          <p className="text-center text-xs text-stone-400 mt-2.5">
            Cancel anytime · No commitment · Billed monthly
          </p>
        </div>
      </div>

      {/* Annual option */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-amber-800">Save 17% with annual billing</p>
          <p className="text-xs text-amber-700 mt-0.5">$490/year instead of $588</p>
        </div>
        <button
          onClick={onSubscribe}
          className="text-xs font-semibold text-amber-800 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 transition-colors"
        >
          Annual — $490/yr
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FactoryGateProps {
  user: {
    uid:                   string;
    ideaTractionScore?:    number;
    collaborationScore?:   number;
    teamFormationScore?:   number;
    arenaPerformanceScore?: number;
    factoryUnlocked?:      boolean;
    subscriptionTier?:     string;
  };
  onClose?: () => void;
  inline?:  boolean;
}

export function FactoryGate({ user, onClose, inline = false }: FactoryGateProps) {
  const [loading, setLoading] = useState(false);
  const status = computeGraduationStatus(user);

  // Already has access — navigate directly
  if (status.hasFactoryAccess) {
    window.location.href = "https://factory.bewatu.com";
    return null;
  }

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/subscribe/factory", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ uid: user.uid }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  const content = (
    <div className={inline ? "" : "max-w-md w-full"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Rocket size={15} className="text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-stone-900">BeWatu Factory</p>
            <p className="text-xs text-stone-500">
              {status.hasEarnedAccess ? "Activate your access" : "Earn your spot"}
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {status.hasEarnedAccess ? (
        <QualifiedPaywallView
          status={status}
          onSubscribe={handleSubscribe}
          loading={loading}
        />
      ) : (
        <NotQualifiedView status={status} />
      )}
    </div>
  );

  if (inline) return content;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
