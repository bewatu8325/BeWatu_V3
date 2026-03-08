/**
 * components/ArenaView.tsx
 *
 * Sprint 3 — Arena MVP
 *
 * A single-file Arena experience:
 *   - Lobby: participant list + countdown + join button
 *   - Brief: host presents the problem (read-only 2 min)
 *   - Open: live submission editor + real-time participant presence
 *   - Review: read all submissions, react with fire/think/collab
 *   - Verdict: vote for winner with optional reasoning
 *   - Closed: winner announcement + trust edges summary
 *
 * Also exports ArenaLobbyCard (used in the global Ideas/Arenas discovery feed)
 * and CreateArenaModal (triggered from IdeaNetwork's onArenaLaunch callback).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Arena, ArenaParticipant, ArenaSubmission, ArenaPhase, Idea, User } from '../types';
import {
  createArena,
  joinArena,
  advanceArenaPhase,
  submitToArena,
  reactToArenaSubmission,
  castArenaVote,
  closeArena,
  updateArenaPresence,
  subscribeToArena,
  subscribeToArenaParticipants,
  subscribeToArenaSubmissions,
  getOpenArenas,
  getArenaVotes,
} from '../lib/firestoreService';

// ─── Design tokens ────────────────────────────────────────────────────────────
const G   = '#1a4a3a';
const GM  = '#1a6b52';
const GLT = '#e8f4f0';
const BDR = '#e7e5e4';
const TXT = '#1c1917';
const MUT = '#78716c';
const W   = '#ffffff';

// ─── Domain config (reused from IdeaNetwork) ──────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  Frontend: '#6366f1', Backend: '#0ea5e9', Data: '#f59e0b', Design: '#ec4899',
  DevOps: '#14b8a6', Product: '#8b5cf6', 'AI/ML': '#f97316', Leadership: G, Other: '#94a3b8',
};

// ─── Phase config ─────────────────────────────────────────────────────────────
const PHASE_META: Record<ArenaPhase, { label: string; color: string; bg: string; desc: string }> = {
  lobby:   { label: 'Lobby',    color: MUT,      bg: '#f5f5f4', desc: 'Waiting for participants…'           },
  brief:   { label: 'Brief',    color: '#0369a1', bg: '#e0f2fe', desc: 'Read the brief carefully'            },
  open:    { label: 'Live',     color: '#16a34a', bg: '#f0fdf4', desc: 'Submissions open — build something'  },
  review:  { label: 'Review',   color: '#7c3aed', bg: '#f5f3ff', desc: 'Read and react to submissions'       },
  verdict: { label: 'Verdict',  color: '#b45309', bg: '#fffbeb', desc: 'Vote for the best submission'        },
  closed:  { label: 'Closed',   color: G,         bg: GLT,       desc: 'Arena complete'                      },
};

// ─── Mini icons ───────────────────────────────────────────────────────────────
const FireIcon   = ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-.95.23-1.78.75-2.49 1.32-2.59 2.08-3.61 5.75-2.39 8.9.04.1.08.2.08.33 0 .22-.15.42-.35.5-.23.1-.47.04-.66-.12-.06-.06-.12-.13-.16-.2a7.84 7.84 0 0 1-.64-4.55c-1.13 1.08-1.86 2.5-2.04 4-.02.14-.04.28-.04.42C5.27 16.78 8.26 20 12 20c3.74 0 6.73-3.22 6.73-7.2 0-1.66-.59-3.08-1.07-4.6z"/></svg>;
const ThinkIcon  = ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>;
const CollabIcon = ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const Crown      = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M2 19h20v2H2zM2 7l5 5 5-7 5 7 5-5-2 11H4L2 7z"/></svg>;
const Clock      = ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const Loader     = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useCountdown(targetIso: string, durationMins: number): number {
  const [secsLeft, setSecsLeft] = useState(0);
  useEffect(() => {
    const calc = () => {
      const end = new Date(targetIso).getTime() + durationMins * 60000;
      setSecsLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [targetIso, durationMins]);
  return secsLeft;
}

function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESENCE DOT
// ─────────────────────────────────────────────────────────────────────────────
const PresenceDot = ({ status }: { status: ArenaParticipant['presenceStatus'] }) => {
  const colors = { active: '#16a34a', away: '#f59e0b', disconnected: '#e5e7eb' };
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
      background: colors[status] ?? colors.disconnected,
      flexShrink: 0,
    }} />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION CARD
// ─────────────────────────────────────────────────────────────────────────────
interface SubmissionCardProps {
  sub: ArenaSubmission;
  currentUid: string;
  arenaId: string;
  phase: ArenaPhase;
  isWinner?: boolean;
  onVote?: (uid: string) => void;
  hasVoted?: boolean;
}
const SubmissionCard: React.FC<SubmissionCardProps> = ({
  sub, currentUid, arenaId, phase, isWinner, onVote, hasVoted,
}) => {
  const isOwn = sub.authorUid === currentUid;
  const react = (r: 'fire' | 'think' | 'collab') =>
    !isOwn && phase === 'review' && reactToArenaSubmission(arenaId, sub.id!, currentUid, r);

  return (
    <div style={{
      background: isWinner ? GLT : W,
      border: `1.5px solid ${isWinner ? GM : BDR}`,
      borderRadius: 14, padding: 18, position: 'relative',
    }}>
      {isWinner && (
        <div style={{
          position: 'absolute', top: -10, right: 14,
          display: 'flex', alignItems: 'center', gap: 5,
          background: G, color: W, fontSize: 11, fontWeight: 700,
          padding: '3px 10px', borderRadius: 99,
        }}>
          <Crown size={11} /> Winner
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <img src={sub.authorAvatar || `https://picsum.photos/seed/${sub.authorUid}/32`}
          alt={sub.authorName}
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: TXT }}>{sub.authorName}</span>
          {isOwn && <span style={{ fontSize: 11, color: MUT, marginLeft: 6 }}>you</span>}
        </div>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#44403c', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
        {sub.content}
      </p>
      {/* Reactions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['fire', 'think', 'collab'] as const).map(r => {
          const icons = { fire: <FireIcon />, think: <ThinkIcon />, collab: <CollabIcon /> };
          const labels = { fire: '🔥', think: '💡', collab: '🤝' };
          const count = sub.reactions[r]?.length ?? 0;
          const reacted = sub.reactions[r]?.includes(currentUid);
          return (
            <button key={r} onClick={() => react(r)} disabled={isOwn || phase !== 'review'} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${reacted ? GM : BDR}`,
              background: reacted ? GLT : 'transparent',
              color: reacted ? G : MUT,
              cursor: isOwn || phase !== 'review' ? 'default' : 'pointer',
              opacity: phase !== 'review' ? 0.6 : 1,
            }}>
              {labels[r]} {count}
            </button>
          );
        })}
        {/* Verdict vote button */}
        {phase === 'verdict' && !isOwn && onVote && (
          <button onClick={() => onVote(sub.authorUid)} disabled={hasVoted} style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
            background: hasVoted ? '#f5f5f4' : G, color: hasVoted ? MUT : W,
            border: 'none', cursor: hasVoted ? 'default' : 'pointer',
          }}>
            <Crown size={11} /> Vote
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE ARENA MODAL — triggered from IdeaNetwork onArenaLaunch
// ─────────────────────────────────────────────────────────────────────────────
export interface CreateArenaModalProps {
  currentUser: User;
  sourceIdea?: Idea;
  onCreated: (arenaId: string) => void;
  onClose: () => void;
}

export const CreateArenaModal: React.FC<CreateArenaModalProps> = ({
  currentUser, sourceIdea, onCreated, onClose,
}) => {
  const [title,    setTitle]    = useState(sourceIdea?.title ?? '');
  const [brief,    setBrief]    = useState(sourceIdea?.body  ?? '');
  const [domain,   setDomain]   = useState(sourceIdea?.domain ?? 'Product');
  const [duration, setDuration] = useState(30);
  const [maxP,     setMaxP]     = useState(8);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const uid    = (currentUser as any)._firestoreUid ?? String(currentUser.id);
  const avatar = (currentUser as any).photoURL ?? currentUser.avatarUrl ?? '';

  const handleCreate = async () => {
    if (!title.trim() || brief.trim().length < 20) {
      setError('Add a title and at least 20 characters of brief.'); return;
    }
    setSaving(true); setError('');
    try {
      const id = await createArena({
        title: title.trim(), brief: brief.trim(),
        hostUid: uid, hostName: currentUser.name, hostAvatar: avatar,
        type: sourceIdea ? 'idea' : 'open',
        domain: String(domain),
        sourceIdeaId: sourceIdea?.id,
        maxParticipants: maxP,
        phaseDurationMinutes: duration,
      });
      onCreated(id);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create arena.');
    } finally { setSaving(false); }
  };

  const DOMAINS = ['Frontend','Backend','Data','Design','DevOps','Product','AI/ML','Leadership','Other'];

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
      onClick={onClose}>
      <div style={{ background:W,borderRadius:20,padding:28,maxWidth:520,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin:'0 0 6px',fontSize:17,fontWeight:700,color:TXT }}>
          {sourceIdea ? 'Launch Arena from Idea' : 'Create Arena'}
        </h3>
        {sourceIdea && <p style={{ margin:'0 0 16px',fontSize:12,color:MUT }}>From: <strong>{sourceIdea.title}</strong></p>}

        {/* Domain */}
        <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:14 }}>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setDomain(d)} style={{
              padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:600,cursor:'pointer',
              border:`1.5px solid ${domain===d ? (DOMAIN_COLORS[d]??G) : BDR}`,
              background: domain===d ? '#f0f9ff' : '#fafaf9',
              color: domain===d ? (DOMAIN_COLORS[d]??G) : MUT,
            }}>{d}</button>
          ))}
        </div>

        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Arena title"
          style={{ width:'100%',boxSizing:'border-box',padding:'9px 12px',border:`1px solid ${BDR}`,borderRadius:10,fontSize:14,fontWeight:600,color:TXT,marginBottom:10,fontFamily:'inherit',outline:'none',background:'#fafaf9' }} />
        <textarea value={brief} onChange={e => setBrief(e.target.value)}
          placeholder="What's the challenge? Give participants enough context to build something real."
          rows={4}
          style={{ width:'100%',boxSizing:'border-box',padding:'9px 12px',border:`1px solid ${BDR}`,borderRadius:10,fontSize:13,color:TXT,resize:'vertical',fontFamily:'inherit',lineHeight:1.6,outline:'none',background:'#fafaf9',marginBottom:14 }} />

        <div style={{ display:'flex',gap:12,marginBottom:16 }}>
          <label style={{ flex:1 }}>
            <span style={{ fontSize:11,fontWeight:700,color:MUT,textTransform:'uppercase',letterSpacing:'0.05em' }}>
              Open phase (min)
            </span>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))}
              style={{ width:'100%',padding:'7px 10px',border:`1px solid ${BDR}`,borderRadius:8,fontSize:13,color:TXT,background:W,marginTop:4,outline:'none' }}>
              {[15,20,30,45,60].map(v => <option key={v} value={v}>{v} min</option>)}
            </select>
          </label>
          <label style={{ flex:1 }}>
            <span style={{ fontSize:11,fontWeight:700,color:MUT,textTransform:'uppercase',letterSpacing:'0.05em' }}>
              Max participants
            </span>
            <select value={maxP} onChange={e => setMaxP(Number(e.target.value))}
              style={{ width:'100%',padding:'7px 10px',border:`1px solid ${BDR}`,borderRadius:8,fontSize:13,color:TXT,background:W,marginTop:4,outline:'none' }}>
              {[4,6,8,12,16].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </div>

        {error && <p style={{ fontSize:12,color:'#dc2626',marginBottom:10 }}>{error}</p>}
        <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
          <button onClick={onClose} style={{ padding:'8px 18px',borderRadius:10,fontSize:13,fontWeight:600,border:`1px solid ${BDR}`,background:W,color:MUT,cursor:'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding:'8px 22px',borderRadius:10,fontSize:13,fontWeight:700,background:saving?'#a8a29e':G,color:W,border:'none',cursor:saving?'default':'pointer',display:'flex',alignItems:'center',gap:6 }}>
            {saving && <Loader />}
            {saving ? 'Creating…' : 'Launch Arena'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ARENA LOBBY CARD — used in discovery feed
// ─────────────────────────────────────────────────────────────────────────────
export interface ArenaLobbyCardProps {
  arena: Arena;
  currentUserUid: string;
  onJoin: (arenaId: string) => void;
  onEnter: (arenaId: string) => void;
}

export const ArenaLobbyCard: React.FC<ArenaLobbyCardProps> = ({ arena, currentUserUid, onJoin, onEnter }) => {
  const phase = PHASE_META[arena.phase] ?? PHASE_META.lobby;
  const isParticipant = arena.participantUids?.includes(currentUserUid);
  const isFull = (arena.participantUids?.length ?? 0) >= (arena.maxParticipants ?? 8);
  const domainColor = DOMAIN_COLORS[arena.domain] ?? MUT;

  return (
    <div style={{ background:W,border:`1px solid ${BDR}`,borderRadius:16,overflow:'hidden' }}>
      {/* Phase strip */}
      <div style={{ padding:'6px 16px',background:phase.bg,display:'flex',alignItems:'center',gap:8 }}>
        <span style={{ width:7,height:7,borderRadius:'50%',background:phase.color,display:'inline-block' }} />
        <span style={{ fontSize:11,fontWeight:700,color:phase.color,textTransform:'uppercase',letterSpacing:'0.06em' }}>{phase.label}</span>
      </div>
      <div style={{ padding:18 }}>
        <div style={{ display:'flex',gap:6,marginBottom:10 }}>
          <span style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',padding:'2px 8px',borderRadius:99,background:'#f5f5f4',color:domainColor }}>
            {arena.domain}
          </span>
        </div>
        <h3 style={{ margin:'0 0 6px',fontSize:15,fontWeight:700,color:TXT }}>{arena.title}</h3>
        <p style={{ margin:'0 0 14px',fontSize:13,color:MUT,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>
          {arena.brief}
        </p>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ display:'flex',alignItems:'center',gap:6 }}>
            <CollabIcon size={13} />
            <span style={{ fontSize:12,color:MUT }}>
              {arena.participantUids?.length ?? 0}/{arena.maxParticipants ?? 8} participants
            </span>
          </div>
          {isParticipant ? (
            <button onClick={() => onEnter(arena.id!)} style={{ padding:'7px 18px',borderRadius:10,fontSize:12,fontWeight:700,background:G,color:W,border:'none',cursor:'pointer' }}>
              Enter →
            </button>
          ) : arena.phase === 'lobby' && !isFull ? (
            <button onClick={() => onJoin(arena.id!)} style={{ padding:'7px 18px',borderRadius:10,fontSize:12,fontWeight:700,background:'transparent',color:G,border:`1.5px solid ${G}`,cursor:'pointer' }}>
              Join
            </button>
          ) : (
            <span style={{ fontSize:11,color:MUT }}>{isFull ? 'Full' : 'In progress'}</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: ARENA VIEW — full live arena experience
// ─────────────────────────────────────────────────────────────────────────────

export interface ArenaViewProps {
  arenaId: string;
  currentUser: User;
  onExit: () => void;
}

const ArenaView: React.FC<ArenaViewProps> = ({ arenaId, currentUser, onExit }) => {
  const [arena,        setArena]        = useState<Arena | null>(null);
  const [participants, setParticipants] = useState<ArenaParticipant[]>([]);
  const [submissions,  setSubmissions]  = useState<ArenaSubmission[]>([]);
  const [submission,   setSubmission]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [myVote,       setMyVote]       = useState<string | null>(null);
  const [voteReason,   setVoteReason]   = useState('');
  const [advancing,    setAdvancing]    = useState(false);
  const [closing,      setClosing]      = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uid    = (currentUser as any)._firestoreUid ?? String(currentUser.id);
  const avatar = (currentUser as any).photoURL ?? currentUser.avatarUrl ?? '';

  const me = participants.find(p => p.uid === uid);
  const isHost = me?.isHost ?? false;

  // ── Subscriptions ────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubArena = subscribeToArena(arenaId, setArena);
    const unsubParts = subscribeToArenaParticipants(arenaId, setParticipants);
    const unsubSubs  = subscribeToArenaSubmissions(arenaId, (subs) => {
      setSubmissions(subs);
      if (subs.some(s => s.authorUid === uid)) setHasSubmitted(true);
    });
    return () => { unsubArena(); unsubParts(); unsubSubs(); };
  }, [arenaId, uid]);

  // ── Presence heartbeat ───────────────────────────────────────────────────────
  useEffect(() => {
    updateArenaPresence(arenaId, uid, 'active');
    heartbeatRef.current = setInterval(() => updateArenaPresence(arenaId, uid, 'active'), 30000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      updateArenaPresence(arenaId, uid, 'disconnected');
    };
  }, [arenaId, uid]);

  // ── Countdown ────────────────────────────────────────────────────────────────
  const secsLeft = useCountdown(
    arena?.phaseStartedAt ?? new Date().toISOString(),
    arena?.phase === 'open' ? (arena?.phaseDurationMinutes ?? 30) : (
      arena?.phase === 'review' ? 10 : arena?.phase === 'verdict' ? 5 : 2
    )
  );

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!submission.trim()) return;
    setSubmitting(true);
    try {
      await submitToArena(arenaId, {
        authorUid: uid, authorName: currentUser.name, authorAvatar: avatar,
        content: submission.trim(), format: 'text',
      });
      setHasSubmitted(true); setSubmission('');
    } finally { setSubmitting(false); }
  };

  const handleVote = async (nominatedUid: string) => {
    setMyVote(nominatedUid);
    await castArenaVote(arenaId, { voterUid: uid, nominatedUid, reasoning: voteReason });
  };

  const handleAdvance = async (toPhase: ArenaPhase) => {
    setAdvancing(true);
    try { await advanceArenaPhase(arenaId, toPhase); }
    finally { setAdvancing(false); }
  };

  const handleClose = async () => {
    // Tally votes
    setClosing(true);
    try {
      const votes = await getArenaVotes(arenaId);
      const tally: Record<string, number> = {};
      for (const v of votes) tally[v.nominatedUid] = (tally[v.nominatedUid] ?? 0) + 1;
      const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? submissions[0]?.authorUid ?? uid;
      await closeArena(arenaId, winner);
    } finally { setClosing(false); }
  };

  if (!arena) return (
    <div style={{ display:'flex',justifyContent:'center',alignItems:'center',padding:80 }}>
      <Loader />
    </div>
  );

  const phase     = PHASE_META[arena.phase];
  const domColor  = DOMAIN_COLORS[arena.domain] ?? MUT;

  return (
    <div style={{ maxWidth:900,margin:'0 auto',padding:'0 16px' }}>

      {/* ── Header ── */}
      <div style={{ background:W,border:`1px solid ${BDR}`,borderRadius:16,padding:'16px 20px',marginBottom:16 }}>
        <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex',gap:8,marginBottom:8,flexWrap:'wrap' }}>
              {/* Phase badge */}
              <span style={{ padding:'3px 12px',borderRadius:99,fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',background:phase.bg,color:phase.color }}>
                {phase.label}
              </span>
              {/* Domain badge */}
              <span style={{ padding:'3px 12px',borderRadius:99,fontSize:11,fontWeight:700,background:'#f5f5f4',color:domColor }}>
                {arena.domain}
              </span>
              {/* Countdown */}
              {arena.phase !== 'lobby' && arena.phase !== 'closed' && (
                <span style={{ display:'flex',alignItems:'center',gap:5,fontSize:12,fontWeight:700,color:secsLeft < 60 ? '#dc2626' : MUT }}>
                  <Clock size={12} /> {fmtSecs(secsLeft)}
                </span>
              )}
            </div>
            <h2 style={{ margin:'0 0 4px',fontSize:20,fontWeight:800,color:TXT }}>{arena.title}</h2>
            <p style={{ margin:0,fontSize:13,color:MUT }}>{phase.desc}</p>
          </div>
          <button onClick={onExit} style={{ padding:'6px 14px',borderRadius:10,fontSize:12,fontWeight:600,border:`1px solid ${BDR}`,background:W,color:MUT,cursor:'pointer',flexShrink:0 }}>
            ← Exit
          </button>
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'1fr 240px',gap:16 }}>
        {/* ── Main column ── */}
        <div style={{ minWidth:0 }}>

          {/* LOBBY */}
          {arena.phase === 'lobby' && (
            <div style={{ background:W,border:`1px solid ${BDR}`,borderRadius:16,padding:24 }}>
              <h3 style={{ margin:'0 0 12px',fontSize:15,fontWeight:700,color:TXT }}>Brief</h3>
              <p style={{ margin:'0 0 24px',fontSize:14,color:'#44403c',lineHeight:1.7 }}>{arena.brief}</p>
              {isHost && (
                <button onClick={() => handleAdvance('brief')} disabled={advancing} style={{ padding:'10px 24px',borderRadius:12,fontSize:14,fontWeight:700,background:G,color:W,border:'none',cursor:advancing?'default':'pointer',display:'flex',alignItems:'center',gap:8 }}>
                  {advancing && <Loader />}
                  Start Arena →
                </button>
              )}
              {!isHost && (
                <p style={{ fontSize:13,color:MUT }}>Waiting for the host to start the arena…</p>
              )}
            </div>
          )}

          {/* BRIEF */}
          {arena.phase === 'brief' && (
            <div style={{ background:W,border:`1px solid ${BDR}`,borderRadius:16,padding:24 }}>
              <h3 style={{ margin:'0 0 6px',fontSize:15,fontWeight:700,color:TXT }}>Read the Brief</h3>
              <p style={{ margin:'0 0 20px',fontSize:12,color:MUT }}>Submissions open in {fmtSecs(secsLeft)}</p>
              <p style={{ fontSize:14,color:'#44403c',lineHeight:1.75 }}>{arena.brief}</p>
              {isHost && (
                <button onClick={() => handleAdvance('open')} disabled={advancing} style={{ marginTop:20,padding:'8px 20px',borderRadius:10,fontSize:13,fontWeight:700,background:G,color:W,border:'none',cursor:'pointer' }}>
                  Open Submissions Early →
                </button>
              )}
            </div>
          )}

          {/* OPEN */}
          {arena.phase === 'open' && (
            <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
              {!hasSubmitted ? (
                <div style={{ background:W,border:`1.5px solid ${GM}`,borderRadius:16,padding:20 }}>
                  <h3 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:G }}>Your Submission</h3>
                  <textarea
                    value={submission}
                    onChange={e => setSubmission(e.target.value)}
                    placeholder="Build your response here. Markdown supported."
                    rows={8}
                    style={{ width:'100%',boxSizing:'border-box',padding:'10px 14px',border:`1px solid ${BDR}`,borderRadius:10,fontSize:13,color:TXT,resize:'vertical',fontFamily:'inherit',lineHeight:1.65,outline:'none',background:'#fafaf9' }}
                  />
                  <div style={{ display:'flex',justifyContent:'flex-end',marginTop:10 }}>
                    <button onClick={handleSubmit} disabled={submitting || !submission.trim()} style={{ padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:700,background:submission.trim()?G:'#e7e5e4',color:submission.trim()?W:MUT,border:'none',cursor:submission.trim()?'pointer':'default',display:'flex',alignItems:'center',gap:6 }}>
                      {submitting && <Loader />}
                      {submitting ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background:GLT,border:`1px solid ${GM}`,borderRadius:14,padding:16,fontSize:13,color:G,fontWeight:600 }}>
                  ✓ Submitted — waiting for review phase ({fmtSecs(secsLeft)} left)
                </div>
              )}
              {/* Live submission count */}
              <p style={{ fontSize:12,color:MUT,textAlign:'center' }}>
                {submissions.length} submission{submissions.length !== 1 ? 's' : ''} so far
              </p>
            </div>
          )}

          {/* REVIEW */}
          {arena.phase === 'review' && (
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <p style={{ fontSize:13,color:MUT,margin:'0 0 4px' }}>
                React to submissions below — your reactions inform the trust score. ({fmtSecs(secsLeft)} left)
              </p>
              {submissions.map(s => (
                <SubmissionCard key={s.id} sub={s} currentUid={uid} arenaId={arenaId} phase="review" />
              ))}
              {isHost && (
                <button onClick={() => handleAdvance('verdict')} disabled={advancing} style={{ marginTop:8,padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:700,background:G,color:W,border:'none',cursor:'pointer',alignSelf:'flex-end' }}>
                  Move to Verdict →
                </button>
              )}
            </div>
          )}

          {/* VERDICT */}
          {arena.phase === 'verdict' && (
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <p style={{ fontSize:13,color:MUT,margin:'0 0 4px' }}>
                Vote for the submission that best addressed the brief. ({fmtSecs(secsLeft)} left)
              </p>
              {submissions.map(s => (
                <SubmissionCard key={s.id} sub={s} currentUid={uid} arenaId={arenaId} phase="verdict"
                  onVote={handleVote} hasVoted={!!myVote} />
              ))}
              {isHost && (
                <button onClick={handleClose} disabled={closing} style={{ marginTop:8,padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:700,background:'#7c3aed',color:W,border:'none',cursor:'pointer',alignSelf:'flex-end',display:'flex',alignItems:'center',gap:6 }}>
                  {closing && <Loader />}
                  Declare Winner & Close →
                </button>
              )}
            </div>
          )}

          {/* CLOSED */}
          {arena.phase === 'closed' && (
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              {/* Winner banner */}
              {arena.winnerUid && (() => {
                const winner = participants.find(p => p.uid === arena.winnerUid);
                return (
                  <div style={{ background:`linear-gradient(135deg, ${G}, ${GM})`,borderRadius:16,padding:24,color:W,textAlign:'center' }}>
                    <Crown size={28} />
                    <p style={{ margin:'10px 0 4px',fontSize:16,fontWeight:800 }}>
                      {winner?.displayName ?? 'Winner'} won this Arena!
                    </p>
                    <p style={{ margin:0,fontSize:13,opacity:0.85 }}>
                      Trust edges have been added to all participants' profiles.
                    </p>
                  </div>
                );
              })()}
              {submissions.map(s => (
                <SubmissionCard key={s.id} sub={s} currentUid={uid} arenaId={arenaId} phase="closed"
                  isWinner={s.authorUid === arena.winnerUid} />
              ))}
            </div>
          )}
        </div>

        {/* ── Sidebar: participants ── */}
        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
          <div style={{ background:W,border:`1px solid ${BDR}`,borderRadius:14,padding:16 }}>
            <h4 style={{ margin:'0 0 12px',fontSize:12,fontWeight:700,color:TXT,textTransform:'uppercase',letterSpacing:'0.05em' }}>
              Participants ({participants.length}/{arena.maxParticipants})
            </h4>
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {participants.map(p => (
                <div key={p.uid} style={{ display:'flex',alignItems:'center',gap:8 }}>
                  <div style={{ position:'relative',flexShrink:0 }}>
                    <img src={p.avatarUrl || `https://picsum.photos/seed/${p.uid}/28`} alt={p.displayName}
                      style={{ width:28,height:28,borderRadius:'50%',objectFit:'cover' }} />
                    <span style={{ position:'absolute',bottom:-1,right:-1 }}>
                      <PresenceDot status={p.presenceStatus} />
                    </span>
                  </div>
                  <span style={{ fontSize:12,fontWeight:600,color:TXT,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                    {p.displayName}
                  </span>
                  {p.isHost && <span style={{ fontSize:9,fontWeight:700,color:G,background:GLT,padding:'1px 6px',borderRadius:99,flexShrink:0 }}>HOST</span>}
                  {p.submissionId && <span style={{ fontSize:9,color:'#16a34a',flexShrink:0 }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArenaView;

// ─────────────────────────────────────────────────────────────────────────────
// ARENAS DISCOVERY PAGE — shows open arenas + create button
// ─────────────────────────────────────────────────────────────────────────────
export interface ArenasPageProps {
  currentUser: User;
  onEnterArena: (arenaId: string) => void;
}

export const ArenasPage: React.FC<ArenasPageProps> = ({ currentUser, onEnterArena }) => {
  const [arenas,       setArenas]       = useState<Arena[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,   setShowCreate]   = useState(false);

  const uid = (currentUser as any)._firestoreUid ?? String(currentUser.id);
  const avatar = (currentUser as any).photoURL ?? currentUser.avatarUrl ?? '';

  useEffect(() => {
    getOpenArenas(24).then(a => { setArenas(a); setLoading(false); });
  }, []);

  const handleJoin = async (arenaId: string) => {
    await joinArena(arenaId, { uid, displayName: currentUser.name, avatarUrl: avatar });
    onEnterArena(arenaId);
  };

  return (
    <div style={{ maxWidth:900,margin:'0 auto' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
        <div>
          <h2 style={{ margin:'0 0 4px',fontSize:22,fontWeight:800,color:TXT }}>Arenas</h2>
          <p style={{ margin:0,fontSize:13,color:MUT }}>Live collaboration events — build, review, and earn trust in real time</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ padding:'9px 20px',borderRadius:12,fontSize:13,fontWeight:700,background:G,color:W,border:'none',cursor:'pointer' }}>
          + Create Arena
        </button>
      </div>

      {loading ? (
        <div style={{ display:'flex',justifyContent:'center',padding:60 }}><Loader /></div>
      ) : arenas.length === 0 ? (
        <div style={{ textAlign:'center',padding:'60px 24px',background:W,border:`1px solid ${BDR}`,borderRadius:16 }}>
          <p style={{ fontSize:15,fontWeight:600,color:TXT,margin:'0 0 6px' }}>No open Arenas right now</p>
          <p style={{ fontSize:13,color:MUT,margin:'0 0 20px' }}>Create one, or spark ideas until one reaches Arena Ready status</p>
          <button onClick={() => setShowCreate(true)} style={{ padding:'9px 20px',borderRadius:12,fontSize:13,fontWeight:700,background:G,color:W,border:'none',cursor:'pointer' }}>
            Create Arena
          </button>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14 }}>
          {arenas.map(a => (
            <ArenaLobbyCard key={a.id} arena={a} currentUserUid={uid}
              onJoin={handleJoin} onEnter={onEnterArena} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateArenaModal
          currentUser={currentUser}
          onCreated={(id) => { setShowCreate(false); onEnterArena(id); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
};
