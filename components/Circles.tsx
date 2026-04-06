import React, { useState, useEffect } from 'react';
import { Circle, PodType, PodStage } from '../types';
import {
  Users, Plus, X, ArrowRight, Hexagon, Sparkles,
  Lightbulb, GitMerge, Trophy, Globe,
  ChevronRight, UserPlus, Lock, Clock,
  LogOut, AlertTriangle, Loader2,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface CirclesProps {
  circles:               Circle[];
  onSelectCircle:        (circleId: number) => void;
  onCreateCircle?:       (name: string, description: string, extra?: Partial<Circle>) => Promise<void>;
  onJoinCircle?:         (circleId: number) => Promise<void>;
  onApplyToCircle?:      (circleId: number) => Promise<void>;
  onLeaveCircle?:        (circleId: number) => Promise<void>;
  currentUserId?:        number;
  currentUserFirestoreUid?: string;
}

// ── Pod type config ────────────────────────────────────────────────────────────

const POD_TYPE_CONFIG: Record<PodType, {
  label: string; color: string; bg: string; border: string; description: string; emoji: string;
}> = {
  community:    { label: 'Community',    color: '#1e3a8a', bg: '#dbeafe', border: '#93c5fd', description: 'Bring people together around shared goals, industries, or passions', emoji: '🌐' },
  innovation:   { label: 'Innovation',   color: '#92400e', bg: '#fef3c7', border: '#fcd34d', description: 'Build something together — idea → team → startup',                  emoji: '💡' },
  challenge:    { label: 'Challenge',    color: '#4c1d95', bg: '#ede9fe', border: '#c4b5fd', description: 'Form a pod around an Arena challenge and split the prize',          emoji: '🏆' },
  generational: { label: 'Generational', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7', description: 'Mix experience levels — seniors mentor, juniors bring fresh energy', emoji: '🌱' },
};

const INNOVATION_STAGES: PodStage[] = ['Idea', 'Exploring', 'Building', 'Pitching'];

const STAGE_CONFIG: Record<PodStage, { color: string; bg: string }> = {
  Idea:      { color: '#92400e', bg: '#fef3c7' },
  Exploring: { color: '#1e3a8a', bg: '#dbeafe' },
  Building:  { color: '#065f46', bg: '#d1fae5' },
  Pitching:  { color: '#4c1d95', bg: '#ede9fe' },
};

const POD_PALETTES = [
  { bg: '#fef3c7', border: '#fde68a', text: '#92400e', dot: '#f59e0b' },
  { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46', dot: '#10b981' },
  { bg: '#ede9fe', border: '#ddd6fe', text: '#4c1d95', dot: '#8b5cf6' },
  { bg: '#fce7f3', border: '#fbcfe8', text: '#831843', dot: '#ec4899' },
  { bg: '#dbeafe', border: '#bfdbfe', text: '#1e3a8a', dot: '#3b82f6' },
  { bg: '#ffedd5', border: '#fed7aa', text: '#7c2d12', dot: '#f97316' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#14532d', dot: '#22c55e' },
  { bg: '#fdf4ff', border: '#f5d0fe', text: '#581c87', dot: '#d946ef' },
];

function getPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return POD_PALETTES[Math.abs(hash) % POD_PALETTES.length];
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function MemberRings({ count }: { count: number }) {
  const show    = Math.min(count, 4);
  const colours = ['#1a4a3a', '#7c3aed', '#d97706', '#0891b2', '#be185d'];
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {Array.from({ length: show }).map((_, i) => (
          <div key={i} className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: colours[i % colours.length], zIndex: show - i }}>
            {String.fromCharCode(65 + i)}
          </div>
        ))}
      </div>
      {count > 4 && <span className="ml-2 text-xs text-stone-400">+{count - 4}</span>}
    </div>
  );
}

function PodTypeBadge({ type }: { type: PodType }) {
  const cfg = POD_TYPE_CONFIG[type];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

// ── Pod card ──────────────────────────────────────────────────────────────────

function PodCard({ circle, isMember, isOwner, onSelect, onJoin, onApply, onLeave, currentUserId }: {
  circle: Circle; isMember: boolean; isOwner?: boolean;
  onSelect: () => void; onJoin?: () => void; onApply?: () => void;
  onLeave?: () => void; currentUserId?: number;
}) {
  const [hovered,       setHovered]       = useState(false);
  const [confirmLeave,  setConfirmLeave]  = useState(false);
  const [leaving,       setLeaving]       = useState(false);
  const pal        = getPalette(circle.name);
  const type       = circle.podType ?? 'community';
  const cfg        = POD_TYPE_CONFIG[type];
  const isPending  = currentUserId && (circle.pendingMembers ?? []).includes(currentUserId);
  const visibility = circle.visibility ?? 'open';

  async function handleLeave(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirmLeave) { setConfirmLeave(true); return; }
    setLeaving(true);
    try { await onLeave?.(); } finally { setLeaving(false); setConfirmLeave(false); }
  }

  return (
    <div
      className="rounded-2xl border-2 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer"
      style={{
        backgroundColor: hovered ? pal.bg : '#ffffff',
        borderColor:     hovered ? pal.border : '#e7e5e4',
        transform:       hovered ? 'translateY(-2px)' : 'none',
        boxShadow:       hovered ? '0 8px 24px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
              style={{ backgroundColor: pal.bg, color: pal.text, border: `2px solid ${pal.border}` }}>
              {getInitials(circle.name)}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-stone-900 truncate text-sm">{circle.name}</p>
              <p className="text-[10px] text-stone-400 mt-0.5">{circle.members.length} member{circle.members.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <PodTypeBadge type={type} />
        </div>

        {/* Description */}
        <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">{circle.description}</p>

        {/* Innovation — problem + stage + roles */}
        {type === 'innovation' && circle.problemStatement && (
          <div className="px-3 py-2 rounded-xl text-xs text-stone-600 leading-relaxed italic"
            style={{ backgroundColor: cfg.bg, borderLeft: `3px solid ${cfg.border}` }}>
            "{circle.problemStatement}"
          </div>
        )}
        {type === 'innovation' && circle.stage && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: STAGE_CONFIG[circle.stage].bg, color: STAGE_CONFIG[circle.stage].color }}>
              {circle.stage}
            </span>
            {(circle.rolesNeeded ?? []).length > 0 && (
              <span className="text-[10px] text-stone-400">
                Seeking: {circle.rolesNeeded!.slice(0, 2).join(', ')}{circle.rolesNeeded!.length > 2 ? ` +${circle.rolesNeeded!.length - 2}` : ''}
              </span>
            )}
          </div>
        )}

        {/* Challenge — linked challenge */}
        {type === 'challenge' && circle.challengeTitle && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: cfg.color }}>
            <Trophy size={11} /> {circle.challengeTitle}
          </div>
        )}

        {/* Generational — experience range */}
        {type === 'generational' && (circle.minExperienceYears !== undefined || circle.maxExperienceYears !== undefined) && (
          <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
            <GitMerge size={11} />
            {circle.minExperienceYears !== undefined && circle.maxExperienceYears !== undefined
              ? `${circle.minExperienceYears}–${circle.maxExperienceYears} yrs experience mix`
              : circle.minExperienceYears !== undefined ? `${circle.minExperienceYears}+ yrs`
              : `Up to ${circle.maxExperienceYears} yrs`}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <MemberRings count={circle.members.length} />
          {isMember ? (
            <div className="flex items-center gap-2">
              {!isOwner && onLeave && (
                confirmLeave ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <span className="text-[10px] text-red-500">Leave?</span>
                    <button onClick={handleLeave} disabled={leaving}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                      {leaving ? '…' : 'Yes'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); setConfirmLeave(false); }}
                      className="text-[10px] text-stone-400 hover:text-stone-600">
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={handleLeave}
                    className="flex items-center gap-1 text-[10px] text-stone-300 hover:text-red-400 transition-colors"
                    title="Leave pod">
                    <LogOut size={10} /> Leave
                  </button>
                )
              )}
              <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: pal.text }}>
                Open <ArrowRight size={11} />
              </span>
            </div>
          ) : isPending ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
              <Clock size={10} /> Pending
            </span>
          ) : visibility === 'open' ? (
            <button onClick={e => { e.stopPropagation(); onJoin?.(); }}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: GREEN }}>
              Join
            </button>
          ) : visibility === 'apply' ? (
            <button onClick={e => { e.stopPropagation(); onApply?.(); }}
              className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg border hover:bg-stone-50 transition-colors"
              style={{ borderColor: GREEN, color: GREEN }}>
              <UserPlus size={11} /> Apply
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-stone-400">
              <Lock size={10} /> Invite only
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create pod modal ──────────────────────────────────────────────────────────

function CreatePodModal({ onClose, onCreate, existingChallengePodIds = [] }: {
  onClose: () => void;
  onCreate: (name: string, description: string, extra?: Partial<Circle>) => Promise<void>;
  existingChallengePodIds?: string[]; // challengeIds already used by user's pods
}) {
  const [step, setStep]                 = useState<'type' | 'details'>('type');
  const [selectedType, setSelectedType] = useState<PodType | null>(null);
  const [name, setName]                 = useState('');
  const [description, setDescription]   = useState('');
  const [visibility, setVisibility]     = useState<'invite' | 'apply' | 'open'>('apply');
  const [problemStatement, setProblem]  = useState('');
  const [podStage, setPodStage]         = useState<PodStage>('Idea');
  const [rolesInput, setRolesInput]     = useState('');
  const [rolesNeeded, setRolesNeeded]   = useState<string[]>([]);
  // Challenge picker state
  const [challenges,        setChallenges]        = useState<any[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<any | null>(null);
  const [challengeFilter,   setChallengeFilter]   = useState('');
  const [minExp, setMinExp]             = useState('');
  const [maxExp, setMaxExp]             = useState('');
  const [creating, setCreating]         = useState(false);
  const [error, setError]               = useState('');

  // Fetch live challenges when challenge type is selected
  useEffect(() => {
    if (selectedType !== 'challenge') return;
    setChallengesLoading(true);
    getDocs(
      query(
        collection(db, 'arena_challenges'),
        where('verificationStatus', '==', 'live')
      )
    ).then(snap => {
      setChallenges(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(console.error)
      .finally(() => setChallengesLoading(false));
  }, [selectedType]);

  function addRole(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && rolesInput.trim()) {
      e.preventDefault();
      if (!rolesNeeded.includes(rolesInput.trim())) setRolesNeeded(r => [...r, rolesInput.trim()]);
      setRolesInput('');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) { setError('Please fill in all fields.'); return; }
    if (!selectedType) return;
    if (selectedType === 'challenge') {
      if (!selectedChallenge) { setError('Please select an Arena challenge.'); return; }
      if (existingChallengePodIds.includes(selectedChallenge.id)) {
        setError('You already have a pod for this challenge. You can only create one pod per challenge.');
        return;
      }
    }
    setCreating(true); setError('');
    try {
      await onCreate(name.trim(), description.trim(), {
        podType:    selectedType,
        visibility: selectedType === 'community' ? 'open' : visibility,
        ...(selectedType === 'innovation' && { problemStatement: problemStatement.trim(), stage: podStage, rolesNeeded }),
        ...(selectedType === 'challenge'  && {
          challengeId:    selectedChallenge.id,
          challengeTitle: selectedChallenge.title,
          arenaIndustry:  selectedChallenge.arenaIndustry ?? selectedChallenge.arenaSlug,
        }),
        ...(selectedType === 'generational' && {
          minExperienceYears: minExp ? parseInt(minExp) : undefined,
          maxExperienceYears: maxExp ? parseInt(maxExp) : undefined,
        }),
      });
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create pod.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl border p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ borderColor: '#e7e5e4' }} onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-stone-900">
              {step === 'type' ? 'What kind of pod?' : 'Set it up'}
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {step === 'type' ? 'Choose the type that fits your goal' :
                selectedType ? `${POD_TYPE_CONFIG[selectedType].emoji} ${POD_TYPE_CONFIG[selectedType].label} pod` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-5">
          {['type', 'details'].map(s => (
            <div key={s} className="h-1.5 rounded-full transition-all"
              style={{ width: step === s ? 24 : 8, backgroundColor: step === s ? GREEN : '#e7e5e4' }} />
          ))}
        </div>

        {/* Step 1 — type selection */}
        {step === 'type' && (
          <div className="space-y-2.5">
            {(Object.keys(POD_TYPE_CONFIG) as PodType[]).map(type => {
              const cfg = POD_TYPE_CONFIG[type];
              return (
                <button key={type} onClick={() => { setSelectedType(type); setStep('details'); }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:border-stone-300 hover:bg-stone-50"
                  style={{ borderColor: '#e7e5e4' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: cfg.bg }}>
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-stone-900 text-sm">{cfg.label} Pod</p>
                    <p className="text-xs text-stone-500 mt-0.5">{cfg.description}</p>
                  </div>
                  <ChevronRight size={15} className="text-stone-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2 — details */}
        {step === 'details' && selectedType && (
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 p-2.5 rounded-xl">{error}</p>}

            <div>
              <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Pod name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-stone-400 placeholder:text-stone-400"
                placeholder={
                  selectedType === 'community'  ? 'e.g. Fintech Builders London' :
                  selectedType === 'innovation' ? 'e.g. AI for Healthcare'       :
                  selectedType === 'challenge'  ? 'e.g. Team Apex'               :
                  'e.g. Seniors & Rising Stars'
                } disabled={creating} />
            </div>

            <div>
              <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-stone-400 resize-none placeholder:text-stone-400"
                rows={2} placeholder="Who should join and why?" disabled={creating} />
            </div>

            {selectedType === 'innovation' && (
              <>
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Problem statement</label>
                  <textarea value={problemStatement} onChange={e => setProblem(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-stone-400 resize-none placeholder:text-stone-400"
                    rows={2} placeholder="What specific problem are you solving?" disabled={creating} />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Current stage</label>
                  <div className="flex gap-2">
                    {INNOVATION_STAGES.map(s => (
                      <button key={s} type="button" onClick={() => setPodStage(s)}
                        className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-all"
                        style={podStage === s
                          ? { backgroundColor: STAGE_CONFIG[s].bg, color: STAGE_CONFIG[s].color, borderColor: STAGE_CONFIG[s].color }
                          : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Roles needed (press Enter)</label>
                  <input value={rolesInput} onChange={e => setRolesInput(e.target.value)} onKeyDown={addRole}
                    className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-stone-400 placeholder:text-stone-400"
                    placeholder="e.g. Designer, Backend Dev, Growth" disabled={creating} />
                  {rolesNeeded.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {rolesNeeded.map(r => (
                        <span key={r} className="flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                          {r}
                          <button type="button" onClick={() => setRolesNeeded(rs => rs.filter(x => x !== r))} className="text-stone-400 hover:text-red-400 ml-0.5">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {selectedType === 'challenge' && (
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                  Select an Arena challenge
                </label>
                {challengesLoading ? (
                  <div className="flex items-center gap-2 py-4 text-stone-400 text-sm">
                    <Loader2 size={14} className="animate-spin" /> Loading live challenges…
                  </div>
                ) : challenges.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-stone-200 rounded-xl">
                    <Trophy size={18} className="text-stone-300 mx-auto mb-2" />
                    <p className="text-xs text-stone-400">No live challenges right now</p>
                    <p className="text-[10px] text-stone-300 mt-1">Check back when new arena challenges are posted</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {/* Search filter */}
                    <input
                      value={challengeFilter}
                      onChange={e => setChallengeFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-stone-400 placeholder:text-stone-400 mb-1"
                      placeholder="Search challenges…"
                    />
                    {challenges
                      .filter(c => !challengeFilter || c.title?.toLowerCase().includes(challengeFilter.toLowerCase()) || c.arenaIndustry?.toLowerCase().includes(challengeFilter.toLowerCase()))
                      .map(challenge => {
                        const alreadyUsed = existingChallengePodIds.includes(challenge.id);
                        const isSelected  = selectedChallenge?.id === challenge.id;
                        const daysLeft    = challenge.deadline?.seconds
                          ? Math.max(0, Math.ceil((challenge.deadline.seconds * 1000 - Date.now()) / 86400000))
                          : null;
                        return (
                          <button key={challenge.id} type="button"
                            onClick={() => !alreadyUsed && setSelectedChallenge(challenge)}
                            disabled={alreadyUsed}
                            className="w-full text-left p-3 rounded-xl border-2 transition-all"
                            style={{
                              borderColor:     isSelected ? '#4c1d95' : '#e7e5e4',
                              backgroundColor: isSelected ? '#ede9fe' : alreadyUsed ? '#fafaf9' : 'white',
                              opacity:         alreadyUsed ? 0.5 : 1,
                            }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-stone-900 line-clamp-1">{challenge.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-stone-400">{challenge.arenaIndustry}</span>
                                  {challenge.prize && (
                                    <span className="text-[10px] font-semibold text-emerald-600">{challenge.prize}</span>
                                  )}
                                  {daysLeft !== null && (
                                    <span className={`text-[10px] font-medium ${daysLeft <= 7 ? 'text-red-500' : 'text-stone-400'}`}>
                                      {daysLeft}d left
                                    </span>
                                  )}
                                </div>
                              </div>
                              {alreadyUsed && (
                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0">
                                  Pod exists
                                </span>
                              )}
                              {isSelected && (
                                <div className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-white text-[9px]">✓</span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedType === 'generational' && (
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Experience range (years)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input type="number" value={minExp} onChange={e => setMinExp(e.target.value)} min="0" max="50"
                      className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-stone-400"
                      placeholder="Min (e.g. 0)" disabled={creating} />
                    <p className="text-[10px] text-stone-400 mt-1">Junior end</p>
                  </div>
                  <div>
                    <input type="number" value={maxExp} onChange={e => setMaxExp(e.target.value)} min="0" max="50"
                      className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-stone-400"
                      placeholder="Max (e.g. 20)" disabled={creating} />
                    <p className="text-[10px] text-stone-400 mt-1">Senior end</p>
                  </div>
                </div>
              </div>
            )}

            {selectedType !== 'community' && (
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Who can join?</label>
                <div className="flex gap-2">
                  {([
                    { value: 'open',   label: 'Anyone'        },
                    { value: 'apply',  label: 'Apply to join' },
                    { value: 'invite', label: 'Invite only'   },
                  ] as const).map(({ value, label }) => (
                    <button key={value} type="button" onClick={() => setVisibility(value)}
                      className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-all"
                      style={visibility === value
                        ? { backgroundColor: GREEN_LT, color: GREEN, borderColor: GREEN }
                        : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep('type')}
                className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 text-sm font-semibold"
                disabled={creating}>
                Back
              </button>
              <button type="submit"
                className="flex-1 py-2.5 text-white font-bold rounded-xl hover:opacity-90 text-sm disabled:opacity-50"
                style={{ backgroundColor: GREEN }} disabled={creating}>
                {creating ? 'Creating…' : 'Create pod'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const Circles: React.FC<CirclesProps> = ({
  circles, onSelectCircle, onCreateCircle, onJoinCircle,
  onApplyToCircle, onLeaveCircle, currentUserId, currentUserFirestoreUid,
}) => {
  const [isModalOpen,   setIsModalOpen]   = useState(false);
  const [activeFilter,  setActiveFilter]  = useState<PodType | 'all'>('all');
  const [previewCircle, setPreviewCircle] = useState<any | null>(null);

  // Deduplicate by circle id — Firestore listeners can sometimes return duplicates
  const uniqueCircles = circles.filter((c, i, arr) =>
    arr.findIndex(x => x.id === c.id) === i
  );
  const myPods    = uniqueCircles.filter(c => currentUserId && c.members.includes(currentUserId));
  const otherPods = uniqueCircles.filter(c => !currentUserId || !c.members.includes(currentUserId));
  const filteredOther = activeFilter === 'all' ? otherPods
    : otherPods.filter(c => (c.podType ?? 'community') === activeFilter);

  // Challenge IDs the current user already has a pod for — enforces one-per-challenge
  const existingChallengePodIds = myPods
    .filter(c => c.podType === 'challenge' && c.challengeId)
    .map(c => c.challengeId!);

  const FILTER_TABS: { id: PodType | 'all'; label: string; emoji: string }[] = [
    { id: 'all',          label: 'All',          emoji: '✨' },
    { id: 'community',    label: 'Community',    emoji: '🌐' },
    { id: 'innovation',   label: 'Innovation',   emoji: '💡' },
    { id: 'challenge',    label: 'Challenge',    emoji: '🏆' },
    { id: 'generational', label: 'Generational', emoji: '🌱' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Pods</h1>
          <p className="text-stone-500 mt-1 text-sm max-w-md">
            Small, intentional groups built to create, collaborate, and connect across generations.
          </p>
        </div>
        {onCreateCircle && (
          <button onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-white font-bold rounded-xl text-sm hover:opacity-90 shadow-sm"
            style={{ backgroundColor: GREEN }}>
            <Plus size={15} /> Start a pod
          </button>
        )}
      </div>

      {circles.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-stone-200 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <Hexagon size={28} className="text-stone-300" />
          </div>
          <p className="font-bold text-stone-700 text-lg mb-1">No pods yet</p>
          <p className="text-stone-400 text-sm mb-6 max-w-xs mx-auto">
            Start a Community, Innovation, Challenge, or Generational pod.
          </p>
          {onCreateCircle && (
            <button onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl text-sm hover:opacity-90"
              style={{ backgroundColor: GREEN }}>
              <Plus size={14} /> Create the first pod
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {/* My pods */}
          {myPods.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={14} className="text-amber-500" />
                <h2 className="text-xs font-bold text-stone-500 uppercase tracking-widest">Your pods</h2>
                <span className="text-xs bg-stone-100 text-stone-500 rounded-full px-2 py-0.5">{myPods.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {myPods.map(circle => (
                  <PodCard key={circle.id} circle={circle} isMember
                    isOwner={circle.adminId === currentUserId}
                    currentUserId={currentUserId}
                    onSelect={() => onSelectCircle(circle.id)}
                    onLeave={circle.adminId !== currentUserId ? () => onLeaveCircle?.(circle.id) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Discover */}
          {otherPods.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-stone-400" />
                  <h2 className="text-xs font-bold text-stone-500 uppercase tracking-widest">Discover</h2>
                  <span className="text-xs bg-stone-100 text-stone-500 rounded-full px-2 py-0.5">{filteredOther.length}</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {FILTER_TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveFilter(tab.id)}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap"
                      style={activeFilter === tab.id
                        ? { backgroundColor: GREEN_LT, color: GREEN, borderColor: GREEN }
                        : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {tab.emoji} {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOther.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-stone-200 rounded-2xl">
                  <p className="text-stone-400 text-sm">No {activeFilter} pods yet</p>
                  <button onClick={() => setIsModalOpen(true)} className="mt-3 text-xs font-semibold hover:underline" style={{ color: GREEN }}>
                    Start one →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOther.map(circle => (
                    <PodCard key={circle.id} circle={circle} isMember={false} currentUserId={currentUserId}
                      onSelect={() => setPreviewCircle(circle)}
                      onJoin={() => onJoinCircle?.(circle.id)}
                      onApply={() => onApplyToCircle?.(circle.id)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {isModalOpen && (
        <CreatePodModal
          onClose={() => setIsModalOpen(false)}
          existingChallengePodIds={existingChallengePodIds}
          onCreate={async (n, d, extra) => { await onCreateCircle?.(n, d, extra); }}
        />
      )}

      {/* Pod preview modal for non-members */}
      {previewCircle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setPreviewCircle(null)}>
          <div className="bg-white rounded-3xl border shadow-2xl w-full max-w-md overflow-hidden"
            style={{ borderColor: '#e7e5e4' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg"
                  style={{ backgroundColor: GREEN }}>
                  {previewCircle.name?.[0] ?? '?'}
                </div>
                <div>
                  <h2 className="font-black text-stone-900">{previewCircle.name}</h2>
                  <p className="text-xs text-stone-400">{previewCircle.members?.length ?? 0} members</p>
                </div>
              </div>
              <button onClick={() => setPreviewCircle(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400">
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {previewCircle.description && (
                <p className="text-sm text-stone-700 leading-relaxed">{previewCircle.description}</p>
              )}

              {/* Pod type + visibility */}
              <div className="flex flex-wrap gap-2">
                {previewCircle.podType && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full capitalize"
                    style={{ backgroundColor: GREEN_LT, color: GREEN }}>
                    {previewCircle.podType}
                  </span>
                )}
                {previewCircle.visibility && (
                  <span className="text-xs font-medium px-3 py-1 rounded-full border capitalize"
                    style={{ borderColor: '#e7e5e4', color: '#6b7280' }}>
                    {previewCircle.visibility === 'open' ? '🔓 Open to join' :
                     previewCircle.visibility === 'apply' ? '📋 Apply to join' : '🔒 Invite only'}
                  </span>
                )}
              </div>

              {/* Roles needed */}
              {previewCircle.rolesNeeded?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Looking for</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewCircle.rolesNeeded.map((r: string) => (
                      <span key={r} className="text-xs px-2.5 py-1 rounded-full border"
                        style={{ borderColor: '#e7e5e4', color: '#374151' }}>{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Member count + capacity */}
              <div className="flex items-center justify-between text-sm text-stone-500 py-2 border-t border-b"
                style={{ borderColor: '#f3f4f6' }}>
                <span>{previewCircle.members?.length ?? 0} / {previewCircle.capacity ?? '∞'} members</span>
                {previewCircle.capacity && (
                  <div className="w-32 h-1.5 rounded-full overflow-hidden bg-stone-100">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, ((previewCircle.members?.length ?? 0) / previewCircle.capacity) * 100)}%`,
                      backgroundColor: GREEN,
                    }} />
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="px-5 pb-5">
              {previewCircle.visibility === 'open' || !previewCircle.visibility ? (
                <button
                  onClick={() => { onJoinCircle?.(previewCircle.id); setPreviewCircle(null); }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90"
                  style={{ backgroundColor: GREEN }}>
                  Join pod
                </button>
              ) : previewCircle.visibility === 'apply' ? (
                <div className="space-y-2">
                  <button
                    onClick={() => { onApplyToCircle?.(previewCircle.id); setPreviewCircle(null); }}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90"
                    style={{ backgroundColor: GREEN }}>
                    Apply to join
                  </button>
                  <button
                    onClick={() => { onSelectCircle(previewCircle.id); setPreviewCircle(null); }}
                    className="w-full py-2.5 rounded-xl text-sm font-medium text-stone-600 border hover:bg-stone-50"
                    style={{ borderColor: '#e7e5e4' }}>
                    Preview pod →
                  </button>
                </div>
              ) : (
                <p className="text-center text-xs text-stone-400 py-2">This pod is invite only</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Circles;
