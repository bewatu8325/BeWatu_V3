// src/components/recruiter/RecruiterAnalyticsDashboard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Replaces DEIDashboard.tsx — calls /api/recruiter-analytics (serverless)
// instead of querying Firestore directly from the client.
// Analytics aggregations bypass client rules entirely.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, Cell,
} from 'recharts';
import { TrendingUp, Users, Briefcase, Clock, RefreshCw, AlertCircle } from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface AnalyticsData {
  funnel: { stage: string; count: number }[];
  summary: {
    totalApplications: number;
    activeJobs: number;
    appsPerJob: number;
    avgDaysToHire: number | null;
    totalHired: number;
    interviewsScheduled: number;
  };
  topJobs: { title: string; count: number }[];
  weeklyApplications: { week: string; count: number }[];
  dei: { note: string; totalApplications: number };
  generatedAt: string;
}

const FUNNEL_COLORS = ['#1a4a3a', '#2d6e56', '#4a9272', '#6db89a', '#a8d8c0'];

export default function RecruiterAnalyticsDashboard() {
  const { fbUser } = useFirebase();
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function fetchAnalytics() {
    if (!fbUser) return;
    setLoading(true);
    setError('');
    try {
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/recruiter-analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to load analytics');
      }
      setData(await res.json());
    } catch (err: any) {
      setError(err.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAnalytics(); }, [fbUser]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw size={24} className="animate-spin text-stone-400" />
        <p className="text-sm text-stone-500">Loading analytics…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
        <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Failed to load analytics</p>
          <p className="text-xs text-red-600 mt-0.5">{error}</p>
          <button onClick={fetchAnalytics}
            className="mt-2 text-xs font-bold underline text-red-600">
            Try again
          </button>
        </div>
      </div>
    </div>
  );

  if (!data) return null;

  const { funnel, summary, topJobs, weeklyApplications } = data;

  const StatCard = ({ icon: Icon, label, value, sub }: {
    icon: React.ComponentType<any>; label: string; value: string | number; sub?: string;
  }) => (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-black text-stone-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: GREEN_LT }}>
          <Icon size={18} style={{ color: GREEN }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 px-4 py-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-stone-900">Recruiting Analytics</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Updated {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <button onClick={fetchAnalytics}
          className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors"
          style={{ color: GREEN }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Users} label="Total applicants" value={summary.totalApplications} />
        <StatCard icon={Briefcase} label="Active jobs" value={summary.activeJobs} sub={`${summary.appsPerJob} apps / job`} />
        <StatCard icon={TrendingUp} label="Hired" value={summary.totalHired} />
        <StatCard icon={Clock} label="Avg. days to hire" value={summary.avgDaysToHire ?? '—'} sub={summary.avgDaysToHire ? 'days' : 'No hires yet'} />
      </div>

      {/* Pipeline funnel */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <h2 className="font-bold text-stone-900 mb-4 text-sm">Hiring pipeline</h2>
        <div className="space-y-2.5">
          {funnel.map(({ stage, count }, i) => {
            const max = funnel[0]?.count || 1;
            const pct = max > 0 ? Math.round((count / max) * 100) : 0;
            return (
              <div key={stage} className="flex items-center gap-3">
                <div className="w-20 text-xs font-semibold text-stone-500 text-right flex-shrink-0">{stage}</div>
                <div className="flex-1 h-7 rounded-lg overflow-hidden bg-stone-100">
                  <div
                    className="h-full rounded-lg transition-all duration-500 flex items-center pl-2"
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: FUNNEL_COLORS[i] ?? GREEN }}>
                    {count > 0 && <span className="text-[11px] font-black text-white">{count}</span>}
                  </div>
                </div>
                <div className="w-10 text-xs text-stone-400 flex-shrink-0">{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly applications chart */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <h2 className="font-bold text-stone-900 mb-4 text-sm">Applications (last 8 weeks)</h2>
        {weeklyApplications.every(w => w.count === 0) ? (
          <div className="text-center py-8 text-stone-400">
            <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No applications yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyApplications} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#a8a29e' }} />
              <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
                labelStyle={{ fontWeight: 700 }}
              />
              <Bar dataKey="count" fill={GREEN} radius={[4, 4, 0, 0]} name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top jobs */}
      {topJobs.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h2 className="font-bold text-stone-900 mb-4 text-sm">Most applied roles</h2>
          <div className="space-y-2.5">
            {topJobs.map(({ title, count }) => {
              const max = topJobs[0]?.count || 1;
              return (
                <div key={title} className="flex items-center gap-3">
                  <div className="flex-1 text-sm text-stone-700 font-medium truncate">{title}</div>
                  <div className="w-32 h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, backgroundColor: GREEN }} />
                  </div>
                  <div className="w-8 text-xs text-stone-400 text-right flex-shrink-0">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DEI note */}
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-1">DEI Insights</p>
        <p className="text-sm text-stone-600 leading-relaxed">{data.dei.note}</p>
      </div>

    </div>
  );
}
