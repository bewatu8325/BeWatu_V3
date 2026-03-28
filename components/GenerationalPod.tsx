/**
 * components/GenerationalPod.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A special pod type that requires a mix of career stages.
 * Min/max slots per experience tier enforce cross-generational membership.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { Users, Zap, Lock, CheckCircle, ArrowRight } from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

export type CareerStage = 'emerging' | 'growing' | 'established' | 'veteran';

const STAGE_LABELS: Record<CareerStage, { label: string; years: string; colour: string; bg: string }> = {
  emerging:    { label: 'Emerging',    years: '0–3 yrs',   colour: '#7c3aed', bg: '#ede9fe' },
  growing:     { label: 'Growing',     years: '4–10 yrs',  colour: '#0891b2', bg: '#cffafe' },
  established: { label: 'Established', years: '11–20 yrs', colour: '#d97706', bg: '#fef3c7' },
  veteran:     { label: 'Veteran',     years: '20+ yrs',   colour: '#1a4a3a', bg: '#d1fae5' },
};

export interface GenerationalPodMember {
  userId:      number;
  name:        string;
  avatarUrl?:  string;
  stage:       CareerStage;
  role:        string;
  joinedAt:    Date;
}

export interface GenerationalPodData {
  id:          string;
  name:        string;
  purpose:     string;
  topic:       string;
  capacity:    number;           // total max members
  slots:       Record<CareerStage, { min: number; max: number }>;
  members:     GenerationalPodMember[];
  isPrivate:   boolean;
  createdBy:   number;
  createdAt:   Date;
  _firestoreId?: string;
}

function getMembersByStage(members: GenerationalPodMember[]) {
  return {
    emerging:    members.filter(m => m.stage === 'emerging'),
    growing:     members.filter(m => m.stage === 'growing'),
    established: members.filter(m => m.stage === 'established'),
    veteran:     members.filter(m => m.stage === 'veteran'),
  };
}

function getHealthScore(pod: GenerationalPodData) {
  const byStage = getMembersByStage(pod.members);
  const stages = Object.keys(STAGE_LABELS) as CareerStage[];
  const filled = stages.filter(s => byStage[s].length >= pod.slots[s].min);
  return Math.round((filled.length / stages.length) * 100);
}

// ── Pod card ──────────────────────────────────────────────────────────────────

export const GenerationalPodCard: React.FC<{
  pod:          GenerationalPodData;
  currentStage: CareerStage;
  onJoin:       (podId: string, stage: CareerStage) => Promise<void>;
  onClick:      (podId: string) => void;
  isMember:     boolean;
}> = ({ pod, currentStage, onJoin, onClick, isMember }) => {
  const [joining, setJoining] = useState(false);
  const byStage = getMembersByStage(pod.members);
  const health  = getHealthScore(pod);
  const mySlot  = pod.slots[currentStage];
  const myCount = byStage[currentStage].length;
  const canJoin = !isMember && myCount < mySlot.max && pod.members.length < pod.capacity;
  const stageInfo = STAGE_LABELS[currentStage];

  const handleJoin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setJoining(true);
    await onJoin(pod.id, currentStage);
    setJoining(false);
  };

  return (
    <div
      onClick={() => onClick(pod.id)}
      className="bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
      style={{ borderColor: '#e7e5e4' }}
    >
      {/* Header */}
      <div className="px-5 py-3 border-b flex items-center justify-between"
        style={{ backgroundColor: GREEN_LT, borderColor: '#c7e8d8' }}>
        <div className="flex items-center gap-2">
          <Zap size={13} style={{ color: GREEN }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: GREEN }}>
            Generational Pod
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {pod.isPrivate && <Lock size={11} className="text-stone-400" />}
          {isMember && <CheckCircle size={13} style={{ color: GREEN }} />}
        </div>
      </div>

      <div className="p-5">
        {/* Name + purpose */}
        <h3 className="font-bold text-stone-900 text-base mb-1">{pod.name}</h3>
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">{pod.topic}</p>
        <p className="text-sm text-stone-600 leading-relaxed mb-4">{pod.purpose}</p>

        {/* Generation mix bars */}
        <div className="space-y-2 mb-4">
          {(Object.keys(STAGE_LABELS) as CareerStage[]).map(stage => {
            const info    = STAGE_LABELS[stage];
            const count   = byStage[stage].length;
            const max     = pod.slots[stage].max;
            const min     = pod.slots[stage].min;
            const pct     = max > 0 ? Math.round((count / max) * 100) : 0;
            const metMin  = count >= min;
            return (
              <div key={stage}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: info.colour }}>{info.label}</span>
                    <span className="text-[10px] text-stone-400">{info.years}</span>
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: metMin ? info.colour : '#9ca3af' }}>
                    {count}/{max} {metMin ? '✓' : `need ${min}`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: info.bg }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: info.colour }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Health score */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-stone-400">Generational balance</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: health >= 75 ? '#d1fae5' : health >= 50 ? '#fef3c7' : '#fee2e2',
              color: health >= 75 ? GREEN : health >= 50 ? '#d97706' : '#dc2626',
            }}>
            {health}%
          </span>
        </div>

        {/* Members total */}
        <div className="flex items-center justify-between text-xs text-stone-400 mb-4">
          <div className="flex items-center gap-1.5">
            <Users size={12} />
            <span>{pod.members.length} / {pod.capacity} members</span>
          </div>
          <span>{pod.capacity - pod.members.length} spots left</span>
        </div>

        {/* CTA */}
        {isMember ? (
          <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: GREEN_LT, color: GREEN }}>
            <CheckCircle size={14} /> Member · Open pod <ArrowRight size={13} />
          </div>
        ) : canJoin ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            <span className="text-[10px] px-2 py-0.5 rounded-full mr-1"
              style={{ backgroundColor: stageInfo.bg, color: stageInfo.colour }}>
              {stageInfo.label}
            </span>
            {joining ? 'Joining…' : 'Join as ' + stageInfo.label}
          </button>
        ) : (
          <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center text-stone-400 border border-dashed"
            style={{ borderColor: '#e7e5e4' }}>
            {myCount >= mySlot.max ? `${stageInfo.label} slots full` : 'Pod is full'}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Create generational pod form ──────────────────────────────────────────────

export const CreateGenerationalPod: React.FC<{
  onSubmit: (data: Omit<GenerationalPodData, 'id' | 'members' | 'createdBy' | 'createdAt'>) => Promise<void>;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => {
  const [name,     setName]     = useState('');
  const [topic,    setTopic]    = useState('');
  const [purpose,  setPurpose]  = useState('');
  const [capacity, setCapacity] = useState(12);
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slots, setSlots] = useState<Record<CareerStage, { min: number; max: number }>>({
    emerging:    { min: 1, max: 3 },
    growing:     { min: 1, max: 3 },
    established: { min: 1, max: 3 },
    veteran:     { min: 1, max: 3 },
  });

  const updateSlot = (stage: CareerStage, field: 'min' | 'max', val: number) => {
    setSlots(s => ({ ...s, [stage]: { ...s[stage], [field]: val } }));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !purpose.trim()) return;
    setSubmitting(true);
    await onSubmit({ name: name.trim(), topic: topic.trim(), purpose: purpose.trim(), capacity, slots, isPrivate });
    setSubmitting(false);
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: '#f3f4f6' }}>
        <Zap size={14} style={{ color: GREEN }} />
        <h3 className="font-bold text-stone-900 text-sm">Create a generational pod</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Pod name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
            style={{ borderColor: '#e7e5e4' }} placeholder="e.g. Cross-gen Product Thinkers" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Topic / domain</label>
          <input value={topic} onChange={e => setTopic(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
            style={{ borderColor: '#e7e5e4' }} placeholder="e.g. Product strategy, Leadership, Fintech" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Purpose</label>
          <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none resize-none"
            style={{ borderColor: '#e7e5e4' }}
            placeholder="What will this pod do together? Why does generational mix matter here?" />
        </div>
      </div>

      {/* Slot configuration */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3 block">
          Member slots per stage
        </label>
        <div className="space-y-2">
          {(Object.keys(STAGE_LABELS) as CareerStage[]).map(stage => {
            const info = STAGE_LABELS[stage];
            return (
              <div key={stage} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: info.bg }}>
                <div className="flex-1">
                  <span className="text-xs font-bold" style={{ color: info.colour }}>{info.label}</span>
                  <span className="text-[10px] text-stone-400 ml-1.5">{info.years}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <span>Min</span>
                  <input type="number" min="0" max="10" value={slots[stage].min}
                    onChange={e => updateSlot(stage, 'min', parseInt(e.target.value) || 0)}
                    className="w-12 text-center px-1 py-1 rounded-lg border bg-white text-stone-800 focus:outline-none"
                    style={{ borderColor: '#e7e5e4' }} />
                  <span>Max</span>
                  <input type="number" min="1" max="20" value={slots[stage].max}
                    onChange={e => updateSlot(stage, 'max', parseInt(e.target.value) || 1)}
                    className="w-12 text-center px-1 py-1 rounded-lg border bg-white text-stone-800 focus:outline-none"
                    style={{ borderColor: '#e7e5e4' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input type="checkbox" id="private" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)}
          className="rounded" />
        <label htmlFor="private" className="text-sm text-stone-600">Private pod (invite only)</label>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 text-sm text-stone-600 border rounded-xl hover:bg-stone-50 font-semibold"
          style={{ borderColor: '#e7e5e4' }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={submitting || !name.trim() || !purpose.trim()}
          className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: GREEN }}>
          {submitting ? 'Creating…' : 'Create pod'}
        </button>
      </div>
    </div>
  );
};

export default GenerationalPodCard;
