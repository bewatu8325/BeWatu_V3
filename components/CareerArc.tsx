/**
 * components/CareerArc.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a user's career arc — 3–5 defining inflection points that shaped
 * their professional journey. Replaces the generic job title list.
 *
 * Each inflection point has:
 *   - A moment type (pivot, breakthrough, setback, leap, foundation)
 *   - A title / what happened
 *   - A short reflection (what they learned)
 *   - Approximate year
 *   - Optional: skills gained
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

export type MomentType = 'foundation' | 'pivot' | 'breakthrough' | 'setback' | 'leap';

const MOMENT_CONFIG: Record<MomentType, {
  label:  string;
  emoji:  string;
  color:  string;
  bg:     string;
  border: string;
  description: string;
}> = {
  foundation:   { label: 'Foundation',   emoji: '🌱', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7', description: 'Where it all started' },
  pivot:        { label: 'Pivot',        emoji: '↗️', color: '#1e3a8a', bg: '#dbeafe', border: '#93c5fd', description: 'A major direction change' },
  breakthrough: { label: 'Breakthrough', emoji: '⚡', color: '#92400e', bg: '#fef3c7', border: '#fcd34d', description: 'A defining win or unlock' },
  setback:      { label: 'Setback',      emoji: '🪨', color: '#7c2d12', bg: '#ffedd5', border: '#fdba74', description: 'A hard lesson learned' },
  leap:         { label: 'Leap',         emoji: '🚀', color: '#4c1d95', bg: '#ede9fe', border: '#c4b5fd', description: 'A bold bet that paid off' },
};

export interface CareerInflection {
  id:         string;
  type:       MomentType;
  title:      string;       // "Left my first job to freelance"
  reflection: string;       // What they learned / why it mattered
  year:       number;
  skills?:    string[];
}

// ── Single inflection point ───────────────────────────────────────────────────

const InflectionPoint: React.FC<{
  point:    CareerInflection;
  index:    number;
  isLast:   boolean;
  isOwn:    boolean;
  onDelete?: (id: string) => void;
}> = ({ point, index, isLast, isOwn, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = MOMENT_CONFIG[point.type];

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-5 top-10 bottom-0 w-px" style={{ backgroundColor: '#e7e5e4' }} />
      )}

      {/* Moment icon */}
      <div className="flex-shrink-0 z-10">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-base shadow-sm"
          style={{ backgroundColor: cfg.bg, border: `2px solid ${cfg.border}` }}>
          {cfg.emoji}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-6">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold rounded-full px-2 py-0.5"
              style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
              {cfg.label}
            </span>
            <span className="text-xs text-stone-400">{point.year}</span>
          </div>
          {isOwn && onDelete && (
            <button onClick={() => onDelete(point.id)}
              className="text-stone-300 hover:text-red-400 transition-colors flex-shrink-0">
              <X size={13} />
            </button>
          )}
        </div>

        <p className="font-semibold text-stone-900 text-sm leading-snug mb-1">{point.title}</p>

        {/* Reflection — expandable if long */}
        {point.reflection && (
          <>
            <p className="text-xs text-stone-500 leading-relaxed"
              style={{ display: expanded || point.reflection.length < 120 ? 'block' : '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
              {point.reflection}
            </p>
            {point.reflection.length >= 120 && (
              <button onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-0.5 text-[11px] font-semibold mt-1 transition-colors"
                style={{ color: GREEN }}>
                {expanded ? <><ChevronUp size={11} /> Less</> : <><ChevronDown size={11} /> Read more</>}
              </button>
            )}
          </>
        )}

        {/* Skills gained */}
        {point.skills && point.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {point.skills.map(s => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Add inflection form ────────────────────────────────────────────────────────

const AddInflectionForm: React.FC<{
  onAdd:    (point: Omit<CareerInflection, 'id'>) => void;
  onCancel: () => void;
}> = ({ onAdd, onCancel }) => {
  const [type,       setType]       = useState<MomentType>('breakthrough');
  const [title,      setTitle]      = useState('');
  const [reflection, setReflection] = useState('');
  const [year,       setYear]       = useState(new Date().getFullYear());
  const [skillInput, setSkillInput] = useState('');
  const [skills,     setSkills]     = useState<string[]>([]);

  const addSkill = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault();
      if (!skills.includes(skillInput.trim())) setSkills(s => [...s, skillInput.trim()]);
      setSkillInput('');
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({ type, title: title.trim(), reflection: reflection.trim(), year, skills });
  };

  return (
    <div className="border rounded-2xl p-4 space-y-3 mt-3" style={{ borderColor: '#e7e5e4', backgroundColor: '#fafaf9' }}>
      {/* Moment type */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">
          Type of moment
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MOMENT_CONFIG) as MomentType[]).map(t => {
            const cfg = MOMENT_CONFIG[t];
            return (
              <button key={t} onClick={() => setType(t)}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 border transition-all"
                style={type === t
                  ? { backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }
                  : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }
                }>
                <span>{cfg.emoji}</span> {cfg.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-400 mt-1.5">{MOMENT_CONFIG[type].description}</p>
      </div>

      {/* Year + title */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Year</label>
          <input type="number" min="1960" max={new Date().getFullYear()} value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="w-full px-3 py-2 rounded-xl border text-sm text-stone-900 focus:outline-none"
            style={{ borderColor: '#e7e5e4' }} />
        </div>
        <div className="col-span-3">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">What happened</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border text-sm text-stone-900 focus:outline-none"
            style={{ borderColor: '#e7e5e4' }}
            placeholder={MOMENT_CONFIG[type].description} />
        </div>
      </div>

      {/* Reflection */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
          What you learned / why it mattered
        </label>
        <textarea value={reflection} onChange={e => setReflection(e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-xl border text-sm text-stone-900 focus:outline-none resize-none placeholder:text-stone-400"
          style={{ borderColor: '#e7e5e4' }}
          placeholder="The honest reflection — this is what makes your arc worth reading" />
      </div>

      {/* Skills */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
          Skills gained (press Enter)
        </label>
        <input value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={addSkill}
          className="w-full px-3 py-2 rounded-xl border text-sm text-stone-900 focus:outline-none"
          style={{ borderColor: '#e7e5e4' }} placeholder="e.g. Fundraising, Cold outreach" />
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {skills.map(s => (
              <span key={s} className="flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
                {s}
                <button onClick={() => setSkills(ss => ss.filter(x => x !== s))}
                  className="text-stone-300 hover:text-red-400 ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2 text-sm text-stone-600 border rounded-xl hover:bg-stone-50 font-semibold"
          style={{ borderColor: '#e7e5e4' }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={!title.trim()}
          className="flex-1 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: GREEN }}>
          Add to arc
        </button>
      </div>
    </div>
  );
};

// ── Main CareerArc component ──────────────────────────────────────────────────

interface CareerArcProps {
  inflections: CareerInflection[];
  isOwn:       boolean;
  onAdd?:      (point: Omit<CareerInflection, 'id'>) => void;
  onDelete?:   (id: string) => void;
}

export const CareerArc: React.FC<CareerArcProps> = ({
  inflections, isOwn, onAdd, onDelete,
}) => {
  const [showForm, setShowForm] = useState(false);

  const sorted = [...inflections].sort((a, b) => a.year - b.year);
  const canAdd = isOwn && sorted.length < 5;

  const handleAdd = (point: Omit<CareerInflection, 'id'>) => {
    onAdd?.({ ...point, id: `${Date.now()}` } as any);
    setShowForm(false);
  };

  if (sorted.length === 0 && !isOwn) return null;

  return (
    <div className="bg-white rounded-2xl border p-5 shadow-sm" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-stone-900 text-sm">Career Arc</h3>
          <p className="text-xs text-stone-400 mt-0.5">
            {sorted.length === 0
              ? 'The moments that shaped your professional journey'
              : `${sorted.length} defining moment${sorted.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {canAdd && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80"
            style={{ backgroundColor: GREEN_LT, color: GREEN, borderColor: '#c7e8d8' }}>
            <Plus size={12} /> Add moment
          </button>
        )}
      </div>

      {/* Empty state */}
      {sorted.length === 0 && !showForm && (
        <div className="text-center py-6 border-2 border-dashed rounded-xl" style={{ borderColor: '#e7e5e4' }}>
          <p className="text-2xl mb-2">🗺️</p>
          <p className="text-sm font-semibold text-stone-600 mb-1">Your career arc is empty</p>
          <p className="text-xs text-stone-400 max-w-xs mx-auto mb-4">
            Add 3–5 moments that genuinely shaped your path. Pivots, breakthroughs, setbacks, leaps.
            This is what makes your profile worth reading.
          </p>
          <button onClick={() => setShowForm(true)}
            className="text-xs font-bold px-4 py-2 rounded-xl text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            Add your first moment
          </button>
        </div>
      )}

      {/* Timeline */}
      {sorted.length > 0 && (
        <div className="mt-2">
          {sorted.map((point, i) => (
            <InflectionPoint
              key={point.id}
              point={point}
              index={i}
              isLast={i === sorted.length - 1}
              isOwn={isOwn}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <AddInflectionForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />
      )}

      {/* Max reached */}
      {isOwn && sorted.length >= 5 && (
        <p className="text-xs text-stone-400 text-center mt-2">
          5 moments maximum — edit existing ones to refine your arc
        </p>
      )}
    </div>
  );
};

export default CareerArc;
