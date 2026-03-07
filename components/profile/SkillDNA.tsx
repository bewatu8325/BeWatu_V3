import React, { useState, useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  Hexagon, Shield, ShieldCheck, Star, Award,
  Lock, ExternalLink, Share2, Eye, X, Check, Plus, Loader2,
} from 'lucide-react';
import { endorseSkill } from '../../lib/firestoreService';
import type { User } from '../../types';

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  claimed:     '#94a3b8',
  noticed:     '#a78bfa',
  proven:      '#fbbf24',
  verified:    '#34d399',
  mastery:     '#f59e0b',
  gridStroke:  '#e7e5e4',
  radarStroke: '#1a4a3a',
  radarFill:   'rgba(26,74,58,0.12)',
};

const TRUST_LEVELS = [
  { level: 1, name: 'Claimed',  requirement: 'Self-added',                                        color: COLORS.claimed,  icon: Lock       },
  { level: 2, name: 'Noticed',  requirement: '2+ peer endorsements',                              color: COLORS.noticed,  icon: Shield     },
  { level: 3, name: 'Proven',   requirement: 'Linked project with outcome',                       color: COLORS.proven,   icon: Star       },
  { level: 4, name: 'Verified', requirement: 'Employer or credential confirmed',                  color: COLORS.verified, icon: ShieldCheck},
  { level: 5, name: 'Mastery',  requirement: '10+ endorsements + project proof + employer confirm',color: COLORS.mastery,  icon: Award      },
];

const SKILL_CLUSTERS: Record<string, string[]> = {
  'Frontend':   ['React','TypeScript','JavaScript','Next.js','Vue','Angular','HTML','CSS','Tailwind','Vite','Svelte'],
  'Backend':    ['Node.js','Python','Go','Java','Rust','C#','Express','Django','FastAPI','Spring'],
  'Data':       ['SQL','PostgreSQL','MongoDB','Redis','Firestore','DynamoDB','GraphQL','Prisma'],
  'Design':     ['Figma','UI/UX','Design Systems','Prototyping','Accessibility','Motion Design'],
  'DevOps':     ['Docker','Kubernetes','AWS','GCP','Azure','CI/CD','Terraform','Linux'],
  'Product':    ['Product Management','Agile','Scrum','Strategy','Analytics','User Research'],
  'AI/ML':      ['Machine Learning','Deep Learning','NLP','Computer Vision','TensorFlow','PyTorch'],
  'Leadership': ['Team Lead','Mentoring','Communication','Public Speaking','Management'],
};

const SAMPLE_ROLES: Record<string, string[]> = {
  'Frontend Engineer':    ['React','TypeScript','CSS','HTML','Next.js','Tailwind','Testing'],
  'Full Stack Developer': ['React','Node.js','TypeScript','SQL','Docker','GraphQL'],
  'Product Manager':      ['Product Management','Analytics','User Research','Agile','Strategy'],
  'Data Scientist':       ['Python','Machine Learning','SQL','Statistics','TensorFlow'],
  'DevOps Engineer':      ['Docker','Kubernetes','AWS','CI/CD','Terraform','Linux'],
  'UI/UX Designer':       ['Figma','UI/UX','Prototyping','User Research','Design Systems'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCluster(skill: string) {
  for (const [cluster, skills] of Object.entries(SKILL_CLUSTERS)) {
    if (skills.some(s => s.toLowerCase() === skill.toLowerCase())) return cluster;
  }
  return 'Other';
}

function getTrustLevel(endorsementCount: number, hasProof: boolean): number {
  if (endorsementCount >= 10 && hasProof) return 5;
  if (endorsementCount >= 5) return 4;
  if (hasProof) return 3;
  if (endorsementCount >= 2) return 2;
  return 1;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SkillDNAProps {
  /** The user whose skills we're showing */
  user: User;
  /** Firestore uid of the profile user */
  profileUid: string;
  /** Is the viewer the owner of this profile? */
  isOwn: boolean;
  /** Firestore uid of the current logged-in user (for endorsements) */
  currentUserUid?: string;
  /** Called after endorsements change so parent can re-fetch */
  onEndorsed?: () => void;
}

interface SkillNode {
  name: string;
  endorsementCount: number;
  endorsedBy: string[];
  trustLevel: number;
  trustInfo: typeof TRUST_LEVELS[number];
  cluster: string;
  hasProof: boolean;
  proofLinks: any[];
  hasConsensus: boolean;
  score: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SkillDNA({ user, profileUid, isOwn, currentUserUid, onEndorsed }: SkillDNAProps) {
  const [selectedSkill, setSelectedSkill] = useState<SkillNode | null>(null);
  const [endorsing, setEndorsing] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [showGapOverlay, setShowGapOverlay] = useState(false);
  const [targetRole, setTargetRole] = useState('');

  const skills: string[] = user.skills?.map((s: any) => typeof s === 'string' ? s : s.name) ?? [];
  const endorsements: any[] = (user as any).endorsements ?? [];
  const portfolio: any[] = user.portfolio ?? [];

  const skillNodes: SkillNode[] = useMemo(() => {
    return skills.map(skillName => {
      const endorsement = endorsements.find((e: any) => e.skillName === skillName);
      const endorsedBy: string[] = endorsement?.endorsedBy ?? [];
      const count = endorsedBy.length;
      const proofLinks = portfolio.filter((p: any) =>
        p.tags?.some((t: string) => t.toLowerCase() === skillName.toLowerCase()) ||
        p.title?.toLowerCase().includes(skillName.toLowerCase())
      );
      const hasProof = proofLinks.length > 0;
      const trustLevel = getTrustLevel(count, hasProof);
      const trustInfo = TRUST_LEVELS[trustLevel - 1];
      const hasConsensus = count >= 3;
      const score = Math.min(trustLevel * 20 + Math.min(count * 3, 20) + (hasProof ? 10 : 0), 100);
      return { name: skillName, endorsementCount: count, endorsedBy, trustLevel, trustInfo, cluster: getCluster(skillName), hasProof, proofLinks, hasConsensus, score };
    });
  }, [skills, endorsements, portfolio]);

  const clusters = useMemo(() => {
    const map: Record<string, SkillNode[]> = {};
    skillNodes.forEach(n => { if (!map[n.cluster]) map[n.cluster] = []; map[n.cluster].push(n); });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [skillNodes]);

  const radarData = useMemo(() =>
    [...skillNodes].sort((a, b) => b.score - a.score).slice(0, 8).map(n => ({
      skill: n.name.length > 12 ? n.name.slice(0, 10) + '…' : n.name,
      fullName: n.name, score: n.score, trustLevel: n.trustLevel,
    })), [skillNodes]);

  const topSkills = useMemo(() => [...skillNodes].sort((a, b) => b.score - a.score).slice(0, 6), [skillNodes]);

  const gapAnalysis = useMemo(() => {
    if (!targetRole || !SAMPLE_ROLES[targetRole]) return null;
    const needed = SAMPLE_ROLES[targetRole];
    const have = skills.map(s => s.toLowerCase());
    return needed.map(s => ({ name: s, has: have.includes(s.toLowerCase()), node: skillNodes.find(n => n.name.toLowerCase() === s.toLowerCase()) }));
  }, [targetRole, skills, skillNodes]);

  async function handleEndorse(skillName: string) {
    if (!currentUserUid || isOwn || endorsing) return;
    setEndorsing(true);
    try {
      await endorseSkill(profileUid, skillName, currentUserUid);
      onEndorsed?.();
    } finally {
      setEndorsing(false);
    }
  }

  if (skills.length === 0 && !isOwn) return null;
  if (skills.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Hexagon className="h-4 w-4 text-[#1a6b52]" />Skill DNA
        </h2>
        <p className="mt-3 text-xs text-stone-500">Add skills to your profile to see your Skill DNA graph.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 bg-stone-50 rounded-t-xl">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Hexagon className="h-4 w-4 text-[#1a6b52]" />
          Skill DNA
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">Living Proof-of-Work</span>
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowGapOverlay(!showGapOverlay)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${showGapOverlay ? 'bg-[#1a4a3a] text-white' : 'text-stone-500 hover:bg-stone-100'}`}>
            <Eye className="inline h-3 w-3 mr-1" />Gap
          </button>
          <button onClick={() => setShowShareCard(true)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 transition-colors">
            <Share2 className="inline h-3 w-3 mr-1" />Share
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Radar chart */}
        {radarData.length >= 3 && (
          <div className="mx-auto mb-6 h-64 w-full max-w-md">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke={COLORS.gridStroke} strokeOpacity={0.15} />
                <PolarAngleAxis dataKey="skill" tick={{ fill: '#78716c', fontSize: 11, fontWeight: 500 }} tickLine={false} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Skill Score" dataKey="score" stroke={COLORS.radarStroke} fill={COLORS.radarFill} strokeWidth={2}
                  dot={{ r: 4, fill: COLORS.radarStroke, stroke: '#fff', strokeWidth: 1.5 }}
                  animationDuration={800} animationEasing="ease-out" />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  const level = TRUST_LEVELS[d.trustLevel - 1];
                  return (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold text-stone-900">{d.fullName}</p>
                      <p className="mt-0.5 text-stone-500">Score: {d.score} | Trust: {level.name}</p>
                    </div>
                  );
                }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Trust legend */}
        <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
          {TRUST_LEVELS.map(t => {
            const Icon = t.icon;
            return (
              <div key={t.level} className="flex items-center gap-1.5 text-[11px] text-stone-500">
                <Icon className="h-3 w-3" style={{ color: t.color }} />
                <span>{t.name}</span>
              </div>
            );
          })}
        </div>

        {/* Hex grid */}
        <div className="flex flex-col gap-4">
          {clusters.map(([clusterName, nodes]) => (
            <div key={clusterName}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{clusterName}</p>
              <div className="flex flex-wrap gap-2">
                {nodes.map(node => {
                  const isActive = selectedSkill?.name === node.name;
                  return (
                    <button key={node.name} onClick={() => setSelectedSkill(isActive ? null : node)} className="group relative">
                      <div className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 ${isActive ? 'ring-2 ring-[#1a4a3a] scale-105' : 'hover:scale-105'}
                        ${node.trustLevel === 1 ? 'border-2 border-dashed border-stone-300 bg-transparent text-stone-400' : ''}
                        ${node.trustLevel === 2 ? 'bg-violet-500/15 text-stone-800 border border-violet-400/30' : ''}
                        ${node.trustLevel === 3 ? 'bg-amber-500/15 text-stone-800 border border-amber-400/30' : ''}
                        ${node.trustLevel >= 4 ? 'bg-emerald-500/15 text-stone-800 border border-emerald-400/40' : ''}
                        ${node.hasConsensus ? 'shadow-md' : ''}`}>
                        {node.trustLevel >= 3 && (
                          <div className="absolute inset-0 rounded-lg opacity-20 blur-sm" style={{ backgroundColor: node.trustInfo.color }} />
                        )}
                        <span className="relative z-10">{node.name}</span>
                        {node.hasConsensus && (
                          <span className="relative z-10 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                            style={{ backgroundColor: COLORS.mastery, color: '#1e1b1b' }} title="Consensus">C</span>
                        )}
                        {node.endorsementCount > 0 && (
                          <span className="relative z-10 text-[10px] font-semibold text-stone-500">({node.endorsementCount})</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Skill detail */}
        {selectedSkill && (
          <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: selectedSkill.trustInfo.color + '30' }}>
                  {(() => { const Icon = selectedSkill.trustInfo.icon; return <Icon className="h-4 w-4" style={{ color: selectedSkill.trustInfo.color }} />; })()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">{selectedSkill.name}</p>
                  <p className="text-[11px] text-stone-500">Trust Level {selectedSkill.trustLevel}: {selectedSkill.trustInfo.name}</p>
                </div>
              </div>
              <button onClick={() => setSelectedSkill(null)} className="rounded p-1 text-stone-500 hover:bg-stone-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Trust bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[11px] text-stone-500 mb-1">
                <span>Trust Progress</span><span>{selectedSkill.score}/100</span>
              </div>
              <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${selectedSkill.score}%`, backgroundColor: selectedSkill.trustInfo.color }} />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4 text-[11px] text-stone-500">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" />{selectedSkill.endorsementCount} endorsements</span>
              <span className="flex items-center gap-1"><Star className="h-3 w-3" />{selectedSkill.proofLinks.length} receipts</span>
              {selectedSkill.hasConsensus && (
                <span className="flex items-center gap-1 font-semibold" style={{ color: COLORS.mastery }}>
                  <Award className="h-3 w-3" />Consensus
                </span>
              )}
            </div>

            {selectedSkill.proofLinks.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Receipts</p>
                <div className="flex flex-col gap-1.5">
                  {selectedSkill.proofLinks.map((p: any) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-800 hover:bg-[#e8f4f0] transition-colors">
                      <ExternalLink className="h-3 w-3 text-[#1a6b52]" />
                      <span className="font-medium">{p.title}</span>
                      {p.tags?.length > 0 && <span className="ml-auto text-[10px] text-stone-400">{p.tags.join(', ')}</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!isOwn && currentUserUid && (
              <button onClick={() => handleEndorse(selectedSkill.name)}
                disabled={endorsing || selectedSkill.endorsedBy.includes(currentUserUid)}
                className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${selectedSkill.endorsedBy.includes(currentUserUid) ? 'bg-[#e8f4f0] text-[#1a6b52]' : 'bg-[#1a4a3a] text-white hover:bg-[#163d30]'} disabled:opacity-60`}>
                {endorsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                  selectedSkill.endorsedBy.includes(currentUserUid) ? <><Check className="h-3.5 w-3.5" />Endorsed</> :
                    <><Plus className="h-3.5 w-3.5" />Endorse {selectedSkill.name}</>}
              </button>
            )}
          </div>
        )}

        {/* Gap overlay */}
        {showGapOverlay && (
          <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-stone-800">Skill Gap Analysis</p>
              <button onClick={() => setShowGapOverlay(false)} className="rounded p-1 text-stone-500 hover:bg-stone-100"><X className="h-3.5 w-3.5" /></button>
            </div>
            <select value={targetRole} onChange={e => setTargetRole(e.target.value)}
              className="mb-3 h-9 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 text-sm text-stone-800 focus:border-[#1a4a3a] focus:outline-none">
              <option value="">Select a target role...</option>
              {Object.keys(SAMPLE_ROLES).map(role => <option key={role} value={role}>{role}</option>)}
            </select>
            {gapAnalysis && (
              <div className="flex flex-wrap gap-2">
                {gapAnalysis.map(g => (
                  <div key={g.name} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${g.has ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-400/30' : 'border-2 border-dashed border-stone-300 text-stone-400'}`}>
                    {g.has ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-50" />}
                    {g.name}
                    {g.has && g.node && <span className="text-[10px] opacity-70">L{g.node.trustLevel}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share card modal */}
      {showShareCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm">
            <div className="relative overflow-hidden rounded-2xl border-2 border-[#1a4a3a]/20 bg-gradient-to-br from-stone-50 via-white to-[#e8f4f0] p-6 shadow-2xl">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-[#1a4a3a]/5 to-transparent opacity-60" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-12 w-12 rounded-full border-2 border-cyan-500/30 object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-cyan-500/30 bg-[#1a4a3a] text-sm font-bold text-white">
                      {user.name?.slice(0, 2).toUpperCase() ?? 'BW'}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-stone-900">{user.name}</p>
                    <p className="text-[11px] text-stone-500">{user.headline}</p>
                  </div>
                </div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#1a6b52]">Top Skills</p>
                <div className="grid grid-cols-2 gap-2">
                  {topSkills.map(node => (
                    <div key={node.name} className="flex items-center gap-2 rounded-lg px-3 py-2 border-l-4"
                      style={{ backgroundColor: node.trustInfo.color + '18', borderLeftColor: node.trustInfo.color }}>
                      <div>
                        <p className="text-xs font-semibold text-stone-900">{node.name}</p>
                        <p className="text-[10px] text-stone-500">{node.trustInfo.name} | {node.endorsementCount} endorsement{node.endorsementCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[10px] font-medium text-stone-500">BeWatu Skill DNA</p>
                  <p className="text-[10px] text-stone-500">bewatu.com</p>
                </div>
              </div>
            </div>
            <button onClick={() => setShowShareCard(false)}
              className="mt-3 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-stone-800 border border-stone-200 hover:bg-stone-100 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillDNA;
