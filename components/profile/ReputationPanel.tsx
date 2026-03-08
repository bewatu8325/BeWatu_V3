/**
 * components/profile/ReputationPanel.tsx
 *
 * Sprint 1 — Trust Infrastructure profile UI.
 *
 * Replaces the flat "Reputation: 847" stat tile on ProfilePage.
 * Shows the user's domain trust breakdown, tier badges, and evidence count.
 *
 * Usage in ProfilePage.tsx:
 *   import ReputationPanel from './profile/ReputationPanel';
 *   <ReputationPanel uid={user._firestoreUid ?? String(user.id)} isOwn={isCurrentUser} />
 *
 * Drop this in components/profile/ReputationPanel.tsx
 */

import React, { useEffect, useState } from 'react';
import {
  subscribeToReputationProfile,
  getIncomingTrustEdges,
  computeLocalReputationProfile,
} from '../../lib/firestoreService';
import type { ReputationProfile, TrustDomain } from '../../types';

// ─── Design tokens (match BeWatu theme) ───────────────────────────────────────
const G   = '#1a4a3a';
const GM  = '#1a6b52';
const GLT = '#e8f4f0';
const BORDER = '#e7e5e4';

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER_CONFIG = {
  emerging:    { label: 'Emerging',    bg: '#f0fdf4', color: '#16a34a', bar: '#86efac' },
  established: { label: 'Established', bg: '#eff6ff', color: '#2563eb', bar: '#93c5fd' },
  authority:   { label: 'Authority',   bg: GLT,       color: G,         bar: GM       },
};

// ─── Domain colour palette ────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  Frontend:   '#6366f1',
  Backend:    '#0ea5e9',
  Data:       '#f59e0b',
  Design:     '#ec4899',
  DevOps:     '#14b8a6',
  Product:    '#8b5cf6',
  'AI/ML':    '#f97316',
  Leadership: G,
  Other:      '#94a3b8',
};

function domainColor(name: string): string {
  return DOMAIN_COLORS[name] ?? DOMAIN_COLORS.Other;
}

// ─── Trajectory icon ──────────────────────────────────────────────────────────
function TrajectoryIcon({ t }: { t: 'rising' | 'stable' | 'declining' }) {
  if (t === 'rising')    return <span style={{ color: '#16a34a', fontSize: 13 }}>↑ Rising</span>;
  if (t === 'declining') return <span style={{ color: '#dc2626', fontSize: 13 }}>↓ Declining</span>;
  return <span style={{ color: '#78716c', fontSize: 13 }}>→ Stable</span>;
}

// ─── Single domain row ────────────────────────────────────────────────────────
function DomainRow({ domain, maxScore }: { domain: TrustDomain; maxScore: number }) {
  const tier    = TIER_CONFIG[domain.tier];
  const color   = domainColor(domain.name);
  const pct     = maxScore > 0 ? (domain.score / maxScore) * 100 : 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* colour dot */}
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>{domain.name}</span>
          {/* tier pill */}
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '2px 7px', borderRadius: 99, background: tier.bg, color: tier.color,
          }}>
            {tier.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917' }}>{domain.score}</span>
          <span style={{ fontSize: 11, color: '#a8a29e' }}>
            {domain.edgeCount} signal{domain.edgeCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {/* progress bar */}
      <div style={{ width: '100%', height: 6, background: '#f5f5f4', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 99, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ isOwn }: { isOwn: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 16px' }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: GLT,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
      }}>
        <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={G} strokeWidth={2} strokeLinecap="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', margin: '0 0 6px' }}>
        No trust signals yet
      </p>
      <p style={{ fontSize: 12, color: '#78716c', margin: 0, lineHeight: 1.5 }}>
        {isOwn
          ? 'Complete challenges and contribute to pods to start building your reputation graph.'
          : 'This person hasn\'t received trust signals yet.'}
      </p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ padding: '4px 0' }}>
      {[0.75, 0.55, 0.40].map((w, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ width: `${w * 120}px`, height: 13, background: '#f5f5f4', borderRadius: 6 }} />
            <div style={{ width: 40, height: 13, background: '#f5f5f4', borderRadius: 6 }} />
          </div>
          <div style={{ width: '100%', height: 6, background: '#f5f5f4', borderRadius: 99 }}>
            <div style={{ width: `${w * 100}%`, height: '100%', background: '#e7e5e4', borderRadius: 99 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ReputationPanelProps {
  uid: string;
  isOwn: boolean;
  /** Collapse to a single overall-score chip (for use in the top stats row) */
  compact?: boolean;
}

const ReputationPanel: React.FC<ReputationPanelProps> = ({ uid, isOwn, compact = false }) => {
  const [profile, setProfile] = useState<ReputationProfile | null | 'loading'>('loading');

  useEffect(() => {
    if (!uid) { setProfile(null); return; }

    // Subscribe to computed profile from Cloud Function
    const unsub = subscribeToReputationProfile(uid, async (computed) => {
      if (computed) {
        setProfile(computed);
      } else {
        // Cloud Function hasn't run yet — compute locally from raw edges
        try {
          const edges = await getIncomingTrustEdges(uid);
          if (edges.length > 0) {
            setProfile(computeLocalReputationProfile(uid, edges));
          } else {
            setProfile(null);
          }
        } catch {
          setProfile(null);
        }
      }
    });

    return unsub;
  }, [uid]);

  // ── Compact mode: single chip for the stats row ───────────────────────────
  if (compact) {
    if (profile === 'loading') {
      return (
        <div style={{ background: '#f5f5f4', borderRadius: 10, padding: '12px 16px', textAlign: 'center', border: `1px solid ${BORDER}` }}>
          <div style={{ width: 40, height: 20, background: '#e7e5e4', borderRadius: 6, margin: '0 auto 4px' }} />
          <div style={{ width: 60, height: 11, background: '#f5f5f4', borderRadius: 4, margin: '0 auto' }} />
        </div>
      );
    }
    const score = profile ? profile.overallScore : 0;
    const traj  = (profile && profile.trajectory) ?? 'stable';
    return (
      <div style={{
        background: profile ? GLT : '#f5f5f4',
        borderRadius: 10, padding: '10px 12px', textAlign: 'center',
        border: `1px solid ${profile ? '#b6ddd2' : BORDER}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke={G} strokeWidth={2} strokeLinecap="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span style={{ fontSize: 18, fontWeight: 800, color: G }}>{score}</span>
        </div>
        <p style={{ fontSize: 10, color: '#78716c', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Trust Score
        </p>
        {profile && (
          <div style={{ marginTop: 3 }}>
            <TrajectoryIcon t={traj} />
          </div>
        )}
      </div>
    );
  }

  // ── Full panel ─────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`, padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: GLT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={G} strokeWidth={2} strokeLinecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1c1917' }}>Trust Reputation</h3>
            <p style={{ margin: 0, fontSize: 11, color: '#78716c' }}>
              Built from real interactions — not self-reported
            </p>
          </div>
        </div>

        {/* Overall score */}
        {profile && profile !== 'loading' && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: G, lineHeight: 1 }}>
              {profile.overallScore}
            </div>
            <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
              <TrajectoryIcon t={profile.trajectory} />
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      {profile === 'loading' ? (
        <Skeleton />
      ) : !profile || profile.domains.length === 0 ? (
        <EmptyState isOwn={isOwn} />
      ) : (
        <>
          {/* Domain bars */}
          <div style={{ marginBottom: 4 }}>
            {profile.domains.slice(0, 6).map(domain => (
              <DomainRow
                key={domain.name}
                domain={domain}
                maxScore={profile.domains[0]?.score ?? 1}
              />
            ))}
          </div>

          {/* Footer stats */}
          <div style={{
            display: 'flex', gap: 8, paddingTop: 16,
            borderTop: `1px solid ${BORDER}`, marginTop: 8,
          }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px', background: '#f5f5f4', borderRadius: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1c1917' }}>
                {profile.totalEvidenceCount}
              </div>
              <div style={{ fontSize: 10, color: '#78716c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Signals
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px', background: '#f5f5f4', borderRadius: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1c1917' }}>
                {profile.domains.length}
              </div>
              <div style={{ fontSize: 10, color: '#78716c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Domains
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px', background: '#f5f5f4', borderRadius: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1c1917' }}>
                {profile.domains.filter(d => d.tier !== 'emerging').length}
              </div>
              <div style={{ fontSize: 10, color: '#78716c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Verified
              </div>
            </div>
          </div>

          {/* Last computed note */}
          <p style={{ margin: '12px 0 0', fontSize: 10, color: '#a8a29e', textAlign: 'right' }}>
            Updated {new Date(profile.lastComputedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </p>
        </>
      )}
    </div>
  );
};

export default ReputationPanel;
