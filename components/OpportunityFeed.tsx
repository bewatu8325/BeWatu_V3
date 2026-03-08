/**
 * components/OpportunityFeed.tsx
 *
 * Sprint 4 — Opportunity Marketplace
 *
 * Replaces the basic Jobs view for candidates. Shows:
 *   - Personalized match score (from daily Cloud Function)
 *   - Trust-gated lock/unlock UI
 *   - Teaser cards for locked opportunities
 *   - Full description on unlock
 *   - Apply button → Firestore write
 *
 * Also exports OpportunityPostForm for the RecruiterConsole.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Opportunity, OpportunityMatch, ReputationProfile, User } from '../types';
import {
  getOpportunityFeed,
  getUserMatches,
  applyToOpportunity,
  checkOpportunityUnlock,
  getReputationProfile,
} from '../lib/firestoreService';

// ─── Design tokens ────────────────────────────────────────────────────────────
const G    = '#1a4a3a';
const GM   = '#1a6b52';
const GLT  = '#e8f4f0';
const BDR  = '#e7e5e4';
const TXT  = '#1c1917';
const MUT  = '#78716c';
const W    = '#ffffff';

// ─── Domain colours ───────────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  Frontend: '#6366f1', Backend: '#0ea5e9', Data: '#f59e0b', Design: '#ec4899',
  DevOps: '#14b8a6', Product: '#8b5cf6', 'AI/ML': '#f97316', Leadership: G, Other: '#94a3b8',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Loader = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    style={{ animation: 'spin 1s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const LockIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const StarIcon = ({ filled = false, size = 14 }: { filled?: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

// ─── Match score ring ─────────────────────────────────────────────────────────
const MatchRing: React.FC<{ score: number; size?: number }> = ({ score, size = 44 }) => {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 70 ? G : score >= 40 ? '#f59e0b' : '#e5e7eb';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f5f5f4" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: TXT }}>
        {score}
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITY CARD
// ─────────────────────────────────────────────────────────────────────────────
interface OpportunityCardProps {
  opp: Opportunity;
  match?: OpportunityMatch;
  profile: ReputationProfile | null;
  currentUid: string;
  onApply: (id: string) => void;
  applied: boolean;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opp, match, profile, currentUid, onApply, applied,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isUnlocked = checkOpportunityUnlock(opp, profile);
  const domColor = DOMAIN_COLORS[opp.primaryDomain] ?? MUT;

  const visibilityLabel = {
    public:       null,
    trust_gated:  'Trust Gated',
    arena_winner: 'Arena Winner',
    invite_only:  'Invite Only',
  }[opp.visibility];

  return (
    <div style={{
      background: W, border: `1px solid ${BDR}`, borderRadius: 16, overflow: 'hidden',
      opacity: opp.visibility === 'invite_only' && !isUnlocked ? 0.6 : 1,
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Top strip — locked state */}
      {!isUnlocked && opp.visibility !== 'public' && (
        <div style={{ padding: '7px 16px', background: '#fafaf9', borderBottom: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LockIcon size={12} />
          <span style={{ fontSize: 11, fontWeight: 700, color: MUT }}>
            {visibilityLabel} — build trust in {opp.trustRequirements.map(r => r.domain).join(', ')} to unlock
          </span>
        </div>
      )}

      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* Company logo */}
          <div style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${BDR}`, background: '#f9f9f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            {opp.companyLogoUrl
              ? <img src={opp.companyLogoUrl} alt={opp.companyName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 16, fontWeight: 800, color: MUT }}>{opp.companyName[0]}</span>
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: isUnlocked ? TXT : MUT }}>
                  {isUnlocked ? opp.title : '████████████████'}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: MUT }}>{opp.companyName} · {opp.location}</p>
              </div>
              {match && <MatchRing score={match.score} />}
            </div>

            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 99, background: '#f5f5f4', color: domColor }}>
                {opp.primaryDomain}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f5f5f4', color: MUT }}>
                {opp.type}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f5f5f4', color: MUT }}>
                {opp.experienceLevel}
              </span>
              {opp.salaryRange && isUnlocked && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: GLT, color: G }}>
                  {opp.salaryRange}
                </span>
              )}
              {visibilityLabel && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: isUnlocked ? GLT : '#f5f5f4', color: isUnlocked ? G : MUT, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {!isUnlocked && <LockIcon size={9} />} {visibilityLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Summary / teaser */}
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#44403c', lineHeight: 1.65, filter: isUnlocked ? 'none' : 'blur(4px)', userSelect: isUnlocked ? 'auto' : 'none' }}>
          {opp.summary}
        </p>

        {/* Match reasons */}
        {match && match.reasons.length > 0 && isUnlocked && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: GLT, borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {match.reasons.map((r, i) => (
              <span key={i} style={{ fontSize: 11, color: G, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <StarIcon filled size={10} /> {r}
              </span>
            ))}
          </div>
        )}

        {/* Expanded full description */}
        {expanded && isUnlocked && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BDR}` }}>
            <p style={{ margin: 0, fontSize: 13, color: '#44403c', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
              {opp.fullDescription}
            </p>
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BDR}` }}>
          <span style={{ fontSize: 11, color: MUT, flex: 1 }}>
            {opp.applicationCount} applicant{opp.applicationCount !== 1 ? 's' : ''} · {timeAgo(opp.createdAt)}
          </span>
          {isUnlocked && (
            <button onClick={() => setExpanded(v => !v)} style={{ padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: `1px solid ${BDR}`, background: W, color: MUT, cursor: 'pointer' }}>
              {expanded ? 'Less' : 'More'}
            </button>
          )}
          {isUnlocked ? (
            <button
              onClick={() => !applied && onApply(opp.id!)}
              disabled={applied}
              style={{ padding: '7px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: applied ? '#f5f5f4' : G, color: applied ? MUT : W, border: 'none', cursor: applied ? 'default' : 'pointer' }}
            >
              {applied ? '✓ Applied' : 'Apply'}
            </button>
          ) : (
            <button disabled style={{ padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#f5f5f4', color: MUT, border: 'none', cursor: 'default', display: 'flex', alignItems: 'center', gap: 5 }}>
              <LockIcon size={11} /> Locked
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: OPPORTUNITY FEED
// ─────────────────────────────────────────────────────────────────────────────

export interface OpportunityFeedProps {
  currentUser: User;
}

const OpportunityFeed: React.FC<OpportunityFeedProps> = ({ currentUser }) => {
  const [opps,     setOpps]     = useState<Opportunity[]>([]);
  const [matches,  setMatches]  = useState<OpportunityMatch[]>([]);
  const [profile,  setProfile]  = useState<ReputationProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [applied,  setApplied]  = useState<Set<string>>(new Set());
  const [filter,   setFilter]   = useState<'all' | 'matched' | 'unlocked'>('all');
  const [domain,   setDomain]   = useState<string>('all');

  const uid = (currentUser as any)._firestoreUid ?? String(currentUser.id);

  useEffect(() => {
    Promise.all([
      getOpportunityFeed(uid, 40),
      getUserMatches(uid),
      getReputationProfile(uid),
    ]).then(([o, m, p]) => {
      setOpps(o);
      setMatches(m);
      setProfile(p);
      setLoading(false);
    });
  }, [uid]);

  const handleApply = useCallback(async (oppId: string) => {
    setApplied(prev => new Set([...prev, oppId]));
    await applyToOpportunity(oppId, uid);
  }, [uid]);

  const matchMap = Object.fromEntries(matches.map(m => [m.opportunityId, m]));

  // Domain list from loaded opps
  const domains = ['all', ...Array.from(new Set(opps.map(o => o.primaryDomain)))];

  const displayed = opps.filter(o => {
    if (domain !== 'all' && o.primaryDomain !== domain) return false;
    if (filter === 'matched' && !matchMap[o.id!]) return false;
    if (filter === 'unlocked' && !checkOpportunityUnlock(o, profile)) return false;
    return true;
  }).sort((a, b) => {
    // Sort: matched first, then by date
    const sa = matchMap[a.id!]?.score ?? 0;
    const sb = matchMap[b.id!]?.score ?? 0;
    return sb - sa || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const unlockedCount = opps.filter(o => checkOpportunityUnlock(o, profile)).length;
  const matchedCount  = opps.filter(o => matchMap[o.id!]).length;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TXT }}>Opportunities</h2>
        <p style={{ margin: 0, fontSize: 13, color: MUT }}>
          Personalized to your trust profile — build reputation to unlock more
        </p>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: opps.length },
            { label: 'Matched', value: matchedCount, color: G },
            { label: 'Unlocked', value: unlockedCount, color: GM },
          ].map(s => (
            <div key={s.label} style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${BDR}`, background: W, textAlign: 'center', minWidth: 80 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: s.color ?? TXT }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: 11, color: MUT }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['all', 'matched', 'unlocked'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: filter === f ? G : '#fafaf9', color: filter === f ? W : MUT,
            border: `1.5px solid ${filter === f ? G : BDR}`, transition: 'all 0.12s',
          }}>
            {f === 'all' ? 'All' : f === 'matched' ? '⭐ Matched' : '🔓 Unlocked'}
          </button>
        ))}
        <div style={{ width: 1, background: BDR, margin: '0 4px' }} />
        {domains.map(d => (
          <button key={d} onClick={() => setDomain(d)} style={{
            padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: domain === d ? '#f0f9ff' : 'transparent',
            color: domain === d ? (DOMAIN_COLORS[d] ?? G) : MUT,
            border: `1.5px solid ${domain === d ? (DOMAIN_COLORS[d] ?? G) : BDR}`,
          }}>
            {d === 'all' ? 'All domains' : d}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: W, border: `1px solid ${BDR}`, borderRadius: 16, padding: 20 }}>
              <div style={{ height: 14, width: '50%', background: '#f5f5f4', borderRadius: 6, marginBottom: 10 }} />
              <div style={{ height: 10, width: '80%', background: '#f5f5f4', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: W, border: `1px solid ${BDR}`, borderRadius: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: TXT, margin: '0 0 6px' }}>No opportunities match these filters</p>
          <p style={{ fontSize: 13, color: MUT, margin: 0 }}>Try clearing filters, or build trust in more domains to unlock more</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayed.map(opp => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              match={matchMap[opp.id!]}
              profile={profile}
              currentUid={uid}
              onApply={handleApply}
              applied={applied.has(opp.id!)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default OpportunityFeed;


// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITY POST FORM — drop into RecruiterConsole
// ─────────────────────────────────────────────────────────────────────────────

export interface OpportunityPostFormProps {
  currentUser: User;
  companyName: string;
  companyLogoUrl?: string;
  onCreated: () => void;
}

export const OpportunityPostForm: React.FC<OpportunityPostFormProps> = ({
  currentUser, companyName, companyLogoUrl, onCreated,
}) => {
  const [title,       setTitle]       = useState('');
  const [summary,     setSummary]     = useState('');
  const [fullDesc,    setFullDesc]    = useState('');
  const [location,    setLocation]    = useState('');
  const [type,        setType]        = useState<Opportunity['type']>('Full-time');
  const [level,       setLevel]       = useState<Opportunity['experienceLevel']>('Mid-level');
  const [salary,      setSalary]      = useState('');
  const [domain,      setDomain]      = useState('Product');
  const [visibility,  setVisibility]  = useState<Opportunity['visibility']>('public');
  const [minScore,    setMinScore]    = useState(200);
  const [minDomain,   setMinDomain]   = useState('');
  const [expiryDays,  setExpiryDays]  = useState(30);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  const uid = (currentUser as any)._firestoreUid ?? String(currentUser.id);
  const DOMAINS = ['Frontend','Backend','Data','Design','DevOps','Product','AI/ML','Leadership','Other'];

  const handleCreate = async () => {
    if (!title.trim() || summary.trim().length < 20) {
      setError('Add a title and at least 20 characters of summary.'); return;
    }
    setSaving(true); setError('');
    try {
      const { createOpportunity } = await import('../lib/firestoreService');
      const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString();
      await createOpportunity({
        title: title.trim(),
        companyName, companyLogoUrl,
        recruiterId: uid,
        recruiterName: currentUser.name,
        summary: summary.trim(),
        fullDescription: fullDesc.trim() || summary.trim(),
        location: location.trim() || 'Remote',
        type, experienceLevel: level,
        salaryRange: salary.trim() || undefined,
        primaryDomain: domain,
        visibility,
        trustRequirements: visibility === 'trust_gated' && minDomain
          ? [{ domain: minDomain, minTrustScore: minScore }]
          : [],
        isActive: true,
        expiresAt,
      });
      onCreated();
    } catch (e: any) {
      setError(e.message ?? 'Failed to post opportunity.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 600, padding: 24, background: W, borderRadius: 16, border: `1px solid ${BDR}` }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: TXT }}>Post Opportunity</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Role title"
          style={{ padding: '9px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: TXT, outline: 'none', fontFamily: 'inherit' }} />

        <textarea value={summary} onChange={e => setSummary(e.target.value)}
          placeholder="Short teaser (shown even to locked users)"
          rows={2}
          style={{ padding: '9px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, color: TXT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none' }} />

        <textarea value={fullDesc} onChange={e => setFullDesc(e.target.value)}
          placeholder="Full description (shown after unlock)"
          rows={5}
          style={{ padding: '9px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, color: TXT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none' }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location"
            style={{ flex: 1, padding: '8px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, color: TXT, outline: 'none', fontFamily: 'inherit' }} />
          <input value={salary} onChange={e => setSalary(e.target.value)} placeholder="Salary range"
            style={{ flex: 1, padding: '8px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, color: TXT, outline: 'none', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['Full-time','Contract','Internship','Remote'] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{ padding:'5px 12px',borderRadius:99,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${type===t?G:BDR}`,background:type===t?GLT:'transparent',color:type===t?G:MUT }}>{t}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['Entry-level','Mid-level','Senior-level'] as const).map(l => (
            <button key={l} onClick={() => setLevel(l)} style={{ padding:'5px 12px',borderRadius:99,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${level===l?G:BDR}`,background:level===l?GLT:'transparent',color:level===l?G:MUT }}>{l}</button>
          ))}
        </div>

        {/* Domain */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setDomain(d)} style={{ padding:'4px 10px',borderRadius:99,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${domain===d?(DOMAIN_COLORS[d]??G):BDR}`,background:domain===d?'#f0f9ff':'transparent',color:domain===d?(DOMAIN_COLORS[d]??G):MUT }}>{d}</button>
          ))}
        </div>

        {/* Visibility */}
        <div>
          <p style={{ fontSize:11,fontWeight:700,color:MUT,textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 6px' }}>Visibility</p>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {(['public','trust_gated','arena_winner','invite_only'] as const).map(v => (
              <button key={v} onClick={() => setVisibility(v)} style={{ padding:'5px 12px',borderRadius:99,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${visibility===v?G:BDR}`,background:visibility===v?GLT:'transparent',color:visibility===v?G:MUT }}>
                {v === 'public' ? 'Public' : v === 'trust_gated' ? 'Trust Gated' : v === 'arena_winner' ? 'Arena Winner' : 'Invite Only'}
              </button>
            ))}
          </div>
        </div>

        {/* Trust gate config */}
        {visibility === 'trust_gated' && (
          <div style={{ padding:14,background:'#f9f9f8',borderRadius:10,border:`1px solid ${BDR}` }}>
            <p style={{ fontSize:12,fontWeight:700,color:TXT,margin:'0 0 10px' }}>Trust Requirement</p>
            <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
              <select value={minDomain} onChange={e => setMinDomain(e.target.value)}
                style={{ padding:'6px 10px',border:`1px solid ${BDR}`,borderRadius:8,fontSize:12,color:TXT,background:W,outline:'none' }}>
                <option value="">Domain</option>
                {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={minScore} onChange={e => setMinScore(Number(e.target.value))}
                style={{ padding:'6px 10px',border:`1px solid ${BDR}`,borderRadius:8,fontSize:12,color:TXT,background:W,outline:'none' }}>
                {[100,200,300,400,500].map(s => <option key={s} value={s}>Score ≥ {s}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Expiry */}
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <span style={{ fontSize:12,color:MUT }}>Expires in</span>
          <select value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))}
            style={{ padding:'6px 10px',border:`1px solid ${BDR}`,borderRadius:8,fontSize:12,color:TXT,background:W,outline:'none' }}>
            {[7,14,30,60,90].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>

        {error && <p style={{ fontSize:12,color:'#dc2626' }}>{error}</p>}

        <button onClick={handleCreate} disabled={saving} style={{ padding:'10px 24px',borderRadius:12,fontSize:14,fontWeight:700,background:saving?'#a8a29e':G,color:W,border:'none',cursor:saving?'default':'pointer',display:'flex',alignItems:'center',gap:6,alignSelf:'flex-end' }}>
          {saving && <Loader />}
          {saving ? 'Posting…' : 'Post Opportunity'}
        </button>
      </div>
    </div>
  );
};
