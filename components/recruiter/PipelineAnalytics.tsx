import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Clock, Users, Loader2, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import { fetchPipelineAnalytics } from '../../lib/firestoreService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageStats {
  stage: string;
  label: string;
  count: number;
  avgDaysInStage: number;
  dropOffRate: number; // % who left without advancing
}

interface SourceStats {
  source: 'applied' | 'sourced' | 'prove';
  label: string;
  count: number;
  advancedCount: number;
  conversionRate: number;
  color: string;
}

interface AnalyticsData {
  totalApplications: number;
  activeInPipeline: number;
  hired: number;
  rejected: number;
  avgTimeToHire: number; // days
  stageStats: StageStats[];
  sourceStats: SourceStats[];
  recentActivity: { date: string; event: string; candidateName: string }[];
}

// ─── Stage Funnel Bar ─────────────────────────────────────────────────────────

function FunnelBar({ stage, maxCount, isBlind }: { stage: StageStats; maxCount: number; isBlind: boolean }) {
  const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
  const stageColors: Record<string, string> = {
    applied: 'bg-stone-300', screening: 'bg-blue-500', challenge: 'bg-purple-500',
    interview: 'bg-[#1a4a3a]', offer: 'bg-green-500', hired: 'bg-emerald-500',
  };
  const barColor = stageColors[stage.stage] ?? 'bg-stone-300';

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-xs font-medium text-stone-700 text-right">{stage.label}</div>
      <div className="flex-1 h-7 rounded-lg bg-white overflow-hidden relative">
        <div
          className={`h-full rounded-lg transition-all duration-700 ${barColor} opacity-80`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center px-3 text-xs font-bold text-white">
          {stage.count}
        </span>
      </div>
      <div className="w-28 shrink-0 flex gap-2 text-xs">
        <span className="flex items-center gap-0.5 text-stone-500">
          <Clock className="h-3 w-3" />{stage.avgDaysInStage.toFixed(1)}d avg
        </span>
        {stage.dropOffRate > 0 && (
          <span className="text-red-400">-{stage.dropOffRate}%</span>
        )}
      </div>
    </div>
  );
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({ source }: { source: SourceStats }) {
  return (
    <div className="rounded-xl border bg-white  p-4" style={{ borderColor:"#e7e5e4" }}>
      <div className="flex items-center justify-between mb-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${source.color}`}>
          {source.label}
        </span>
        <span className="text-lg font-bold text-stone-900">{source.count}</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-stone-500">Advanced</span>
          <span className="text-stone-800 font-medium">{source.advancedCount}</span>
        </div>
        <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1a4a3a]"
            style={{ width: `${source.conversionRate}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-stone-500">Conversion</span>
          <span className="font-bold text-[#1a6b52]">{source.conversionRate}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-white  p-4" style={{ borderColor:"#e7e5e4" }}>
      <p className="text-xs font-medium text-stone-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-stone-900'}`}>{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PipelineAnalytics() {
  const { fbUser } = useFirebase();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!fbUser) return;
    setLoading(true);
    fetchPipelineAnalytics(fbUser.uid)
      .then(d => setData(d as AnalyticsData))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [fbUser]);

  if (loading) return (
    <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-stone-500" /></div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">{error}</div>
  );

  if (!data || data.totalApplications === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 py-20 text-center">
      <BarChart3 className="h-10 w-10 text-stone-400" />
      <p className="mt-3 text-sm text-stone-500">No pipeline data yet.</p>
      <p className="text-xs text-stone-500 mt-1">Analytics will appear once candidates start applying.</p>
    </div>
  );

  const maxCount = Math.max(...(data.stageStats?.map(s => s.count) ?? [1]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-900">
          <BarChart3 className="h-5 w-5 text-[#1a6b52]" />Pipeline Analytics
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">Time-in-stage, drop-off rates, and source effectiveness.</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Applications" value={data.totalApplications} />
        <StatTile label="Active in Pipeline" value={data.activeInPipeline} accent="text-[#1a6b52]" />
        <StatTile label="Hired" value={data.hired} accent="text-emerald-400" />
        <StatTile label="Avg. Time to Hire" value={`${data.avgTimeToHire}d`} sub="from apply to hired" accent="text-amber-400" />
      </div>

      {/* Funnel */}
      <div className="rounded-xl border bg-white  p-5" style={{ borderColor:"#e7e5e4" }}>
        <h2 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#1a6b52]" />Pipeline Funnel
        </h2>
        <div className="space-y-2.5">
          {(data.stageStats ?? []).map(stage => (
            <FunnelBar key={stage.stage} stage={stage} maxCount={maxCount} isBlind={false} />
          ))}
        </div>
      </div>

      {/* Source effectiveness */}
      {data.sourceStats && data.sourceStats.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-[#1a6b52]" />Source Effectiveness
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.sourceStats.map(s => (
              <SourceCard key={s.source} source={s} />
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {data.recentActivity && data.recentActivity.length > 0 && (
        <div className="rounded-xl border bg-white  p-4" style={{ borderColor:"#e7e5e4" }}>
          <h2 className="text-sm font-bold text-stone-800 mb-3">Recent Activity</h2>
          <div className="space-y-2">
            {data.recentActivity.slice(0, 8).map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-stone-500">{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span className="flex-1 text-stone-700">{a.event}</span>
                <span className="text-stone-500 truncate max-w-[120px]">{a.candidateName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PipelineAnalytics;
