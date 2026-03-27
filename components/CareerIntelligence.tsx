"use client";
/**
 * components/CareerIntelligence.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the broken "Be" chatbot with a background intelligence panel.
 * Shows AI-generated insights derived from the user's actual platform data:
 *   - Profile strength score + what to fix
 *   - Who to connect with this week (from recommendation engine)
 *   - Which arenas match their skills
 *   - Career arc prompt (generational bridge feature)
 *
 * No chat interface. AI works quietly in the background and surfaces
 * actionable cards the user can act on immediately.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { User } from '../types';
import {
  Sparkles, TrendingUp, Users, Trophy, Zap,
  ChevronRight, RefreshCw, CheckCircle2, AlertCircle,
  BookOpen, Target, Star,
} from 'lucide-react';

interface CareerIntelligenceProps {
  currentUser: User;
  allUsers?: User[];
  onNavigate?: (view: any) => void;
}

// ─── Profile strength scorer ──────────────────────────────────────────────────

function getProfileStrength(user: User): {
  score:   number;
  label:   string;
  color:   string;
  missing: string[];
  strong:  string[];
} {
  const checks = [
    { field: 'avatarUrl',           label: 'Profile photo',        weight: 15 },
    { field: 'headline',            label: 'Professional headline', weight: 15 },
    { field: 'bio',                 label: 'About section',         weight: 10 },
    { field: 'industry',            label: 'Industry',              weight: 10 },
    { field: 'skills',              label: 'Skills (3+)',           weight: 20 },
    { field: 'professionalGoals',   label: 'Professional goals',    weight: 10 },
    { field: 'availability',        label: 'Availability status',   weight: 10 },
    { field: 'verifiedSkills',      label: 'Verified skills',       weight: 10 },
  ];

  let score = 0;
  const missing: string[] = [];
  const strong:  string[] = [];

  for (const check of checks) {
    const val = (user as any)[check.field];
    const hasVal = Array.isArray(val) ? val.length >= (check.field === 'skills' ? 3 : 1) : !!val;
    if (hasVal) {
      score += check.weight;
      strong.push(check.label);
    } else {
      missing.push(check.label);
    }
  }

  const label =
    score >= 80 ? 'Strong'       :
    score >= 60 ? 'Good'         :
    score >= 40 ? 'Getting there':
    'Just started';

  const color =
    score >= 80 ? '#1a6b52' :
    score >= 60 ? '#d97706' :
    '#dc2626';

  return { score, label, color, missing, strong };
}

// ─── Arena match scorer ───────────────────────────────────────────────────────

const ARENA_SKILL_MAP: Record<string, string[]> = {
  'Payments Arena':             ['payments', 'stripe', 'fintech', 'fraud', 'checkout', 'go', 'python', 'kafka'],
  'Banking Arena':              ['banking', 'fintech', 'ml', 'machine learning', 'python', 'data', 'api'],
  'Insurance Arena':            ['insurance', 'computer vision', 'nlp', 'python', 'ai', 'claims'],
  'Healthcare Arena':           ['healthcare', 'react native', 'webrtc', 'pwa', 'offline', 'mobile'],
  'RegTech & Compliance Arena': ['nlp', 'aml', 'kyc', 'python', 'compliance', 'regtech', 'sanctions'],
  'Lending & Credit Arena':     ['credit', 'ml', 'python', 'data science', 'fintech', 'risk'],
  'Wealth & Investment Arena':  ['investing', 'fintech', 'data', 'python', 'esg', 'portfolio'],
  'PropTech Arena':             ['react', 'typescript', 'node', 'api', 'proptech', 'real estate'],
};

function getArenaMatches(user: User): { arena: string; matchCount: number; matchedSkills: string[] }[] {
  const userSkills = ((user.skills ?? []) as any[])
    .map((s: any) => (typeof s === 'string' ? s : s.name ?? '').toLowerCase());

  return Object.entries(ARENA_SKILL_MAP)
    .map(([arena, skills]) => {
      const matched = skills.filter(s => userSkills.some(us => us.includes(s) || s.includes(us)));
      return { arena, matchCount: matched.length, matchedSkills: matched };
    })
    .filter(x => x.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 3);
}

// ─── Insight card ─────────────────────────────────────────────────────────────

function InsightCard({
  icon, iconBg, title, children, action, onAction,
}: {
  icon:     React.ReactNode;
  iconBg:   string;
  title:    string;
  children: React.ReactNode;
  action?:  string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
      style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}>
          {icon}
        </div>
        <p className="font-semibold text-stone-900 text-sm pt-1.5">{title}</p>
      </div>
      <div className="text-sm text-stone-600 leading-relaxed mb-3">{children}</div>
      {action && onAction && (
        <button onClick={onAction}
          className="flex items-center gap-1 text-xs font-semibold transition-colors"
          style={{ color: '#1a4a3a' }}>
          {action} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const CareerIntelligence: React.FC<CareerIntelligenceProps> = ({
  currentUser,
  allUsers = [],
  onNavigate,
}) => {
  const [refreshKey, setRefreshKey]     = useState(0);
  const [aiInsight, setAiInsight]       = useState<string | null>(null);
  const [aiLoading, setAiLoading]       = useState(false);

  const profile      = getProfileStrength(currentUser);
  const arenaMatches = getArenaMatches(currentUser);

  // Weekly connection tip — rotates each week
  const weekNum  = Math.floor(Date.now() / (7 * 86400000));
  const tipIndex = weekNum % 5;
  const weeklyTips = [
    "Reach out to one person outside your industry this week. The best ideas come from unexpected places.",
    "Update your availability status — people can only connect with what they can see.",
    "Comment on two posts from people you don't know. Visibility precedes connection.",
    "Add a professional goal to your profile. Shared goals are the strongest signal for authentic connections.",
    "Post something you learned this week. Teaching is the fastest way to find your real peers.",
  ];

  // Fetch a personalised AI nudge via the platform's Gemini endpoint
  useEffect(() => {
    if (!currentUser?.name) return;
    setAiLoading(true);

    const prompt = `You are a concise career intelligence system for BeWatu, a professional network.
Given this user's profile data, give ONE specific, actionable insight in 2 sentences max.
Be direct, warm, and specific — not generic.

User: ${currentUser.name}
Headline: ${currentUser.headline || 'Not set'}
Industry: ${currentUser.industry || 'Not set'}
Skills: ${((currentUser.skills ?? []) as any[]).map((s: any) => typeof s === 'string' ? s : s.name).slice(0, 5).join(', ') || 'Not set'}
Availability: ${currentUser.availability || 'Not set'}
Profile strength: ${profile.score}/100
Missing from profile: ${profile.missing.slice(0, 2).join(', ') || 'nothing'}

Give a single actionable career nudge. No lists. No headers. Just 2 sentences.`;

    fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        contents: { history: [], systemInstruction: '', generationConfig: { candidateCount: 1 } },
        isChat: true,
        userMessage: prompt,
      }),
    })
      .then(r => r.json())
      .then(d => setAiInsight(d.text ?? null))
      .catch(() => setAiInsight(null))
      .finally(() => setAiLoading(false));
  }, [currentUser?.name, refreshKey]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Career Intelligence</h1>
          <p className="text-sm text-stone-500 mt-1">
            Insights derived from your activity on BeWatu — updated as you build.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800 border border-stone-200 rounded-xl px-3 py-2 hover:bg-stone-50 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* AI nudge */}
      <div className="rounded-2xl p-5 border" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={15} className="text-emerald-600" />
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-widest">This week's insight</p>
        </div>
        {aiLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse delay-100" />
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse delay-200" />
          </div>
        ) : (
          <p className="text-sm text-emerald-900 leading-relaxed">
            {aiInsight ?? "Add more skills to your profile so we can give you a personalised insight."}
          </p>
        )}
      </div>

      {/* Profile strength */}
      <InsightCard
        icon={<Target size={16} style={{ color: profile.color }} />}
        iconBg={profile.score >= 80 ? '#d1fae5' : profile.score >= 60 ? '#fef3c7' : '#fee2e2'}
        title={`Profile strength: ${profile.label} (${profile.score}/100)`}
        action={profile.missing.length > 0 ? 'Go to profile' : undefined}
        onAction={() => onNavigate?.('Profile' as any)}
      >
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${profile.score}%`, backgroundColor: profile.color }}
          />
        </div>
        {profile.missing.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-stone-500 mb-1.5">Add these to strengthen your profile:</p>
            {profile.missing.slice(0, 3).map(m => (
              <div key={m} className="flex items-center gap-2">
                <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
                <span className="text-xs text-stone-600">{m}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span className="text-xs text-stone-600">Your profile is complete — great work.</span>
          </div>
        )}
      </InsightCard>

      {/* Arena matches */}
      {arenaMatches.length > 0 && (
        <InsightCard
          icon={<Trophy size={16} className="text-amber-600" />}
          iconBg="#fef3c7"
          title="Arenas matched to your skills"
          action="Browse arenas"
          onAction={() => onNavigate?.('ARENAS' as any)}
        >
          <div className="space-y-2.5 mt-1">
            {arenaMatches.map(({ arena, matchCount, matchedSkills }) => (
              <div key={arena} className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-stone-800">{arena}</p>
                  <p className="text-[11px] text-stone-500">{matchedSkills.slice(0, 3).join(', ')}</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
                  {matchCount} skill{matchCount !== 1 ? 's' : ''} match
                </span>
              </div>
            ))}
          </div>
        </InsightCard>
      )}

      {/* Weekly tip */}
      <InsightCard
        icon={<BookOpen size={16} className="text-stone-600" />}
        iconBg="#f5f5f4"
        title="This week's connection tip"
      >
        {weeklyTips[tipIndex]}
      </InsightCard>

      {/* Network health */}
      <InsightCard
        icon={<Users size={16} style={{ color: '#1a4a3a' }} />}
        iconBg="#d1fae5"
        title="Network health"
        action="Find connections"
        onAction={() => onNavigate?.('Connections' as any)}
      >
        <div className="grid grid-cols-3 gap-3 mt-1">
          {[
            { label: 'Reputation', value: currentUser.reputation ?? 0 },
            { label: 'Credits',    value: currentUser.credits    ?? 0 },
            { label: 'Level',      value: (currentUser as any).level ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center bg-stone-50 rounded-xl p-2.5">
              <p className="text-lg font-bold text-stone-900">{value}</p>
              <p className="text-[10px] text-stone-500">{label}</p>
            </div>
          ))}
        </div>
      </InsightCard>

      {/* Generational bridge prompt */}
      <div className="rounded-2xl border-2 p-5" style={{ borderColor: '#1a4a3a', backgroundColor: '#f0fdf4' }}>
        <div className="flex items-center gap-2 mb-2">
          <Star size={14} className="text-emerald-700" />
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-widest">
            Generational bridge
          </p>
        </div>
        <p className="text-sm text-stone-800 font-semibold mb-1">
          What's one thing you know now that you wish you'd known earlier?
        </p>
        <p className="text-xs text-stone-600 mb-3 leading-relaxed">
          Share a Wisdom Thread — a hard-won lesson for the next generation. Or ask a question
          that only someone with decades of experience can answer.
        </p>
        <button
          onClick={() => onNavigate?.(View?.Feed as any)}
          className="text-xs font-semibold flex items-center gap-1 transition-colors"
          style={{ color: '#1a4a3a' }}
        >
          Write a Wisdom Thread <ChevronRight size={12} />
        </button>
      </div>

    </div>
  );
};

export default CareerIntelligence;
