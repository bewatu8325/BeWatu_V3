import React, { useState, useRef } from 'react';
import { Experience } from '../types';

const GREEN     = '#1a4a3a';
const GREEN_MID = '#1a6b52';
const GREEN_LT  = '#e8f4f0';

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconBriefcase = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M12 12h.01"/>
  </svg>
);
const IconPlus = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5v14"/>
  </svg>
);
const IconEdit = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>
  </svg>
);
const IconTrash = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconCheck = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const IconX = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const IconArrowUp = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 15-6-6-6 6"/>
  </svg>
);

// ─── Empty Experience template ────────────────────────────────────────────────
const emptyExp = (): Experience => ({
  id: Date.now().toString(),
  role: '',
  company: '',
  startDate: '',
  endDate: '',
  outcomes: [''],
  metrics: '',
  skills: [],
});

// ─── Inline form ──────────────────────────────────────────────────────────────
const ExperienceForm: React.FC<{
  initial: Experience;
  onSave: (e: Experience) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState<Experience>({ ...initial, outcomes: [...(initial.outcomes ?? ['']), ] });
  const [skillInput, setSkillInput] = useState('');

  const set = (key: keyof Experience, val: any) => setForm(f => ({ ...f, [key]: val }));

  const updateOutcome = (i: number, val: string) => {
    const next = [...form.outcomes];
    next[i] = val;
    setForm(f => ({ ...f, outcomes: next }));
  };
  const addOutcome = () => setForm(f => ({ ...f, outcomes: [...f.outcomes, ''] }));
  const removeOutcome = (i: number) => setForm(f => ({ ...f, outcomes: f.outcomes.filter((_, j) => j !== i) }));

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills?.includes(s)) {
      setForm(f => ({ ...f, skills: [...(f.skills ?? []), s] }));
      setSkillInput('');
    }
  };

  const inputCls = "w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1a4a3a]/30";
  const borderStyle = { borderColor: '#e7e5e4' };

  return (
    <div className="rounded-xl border bg-stone-50 p-4 space-y-4" style={borderStyle}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs font-semibold text-stone-500 mb-1 block">Role / Title</label>
          <input className={inputCls} style={borderStyle} placeholder="e.g. Senior Product Designer"
            value={form.role} onChange={e => set('role', e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs font-semibold text-stone-500 mb-1 block">Company</label>
          <input className={inputCls} style={borderStyle} placeholder="e.g. Acme Corp"
            value={form.company} onChange={e => set('company', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500 mb-1 block">Start</label>
          <input className={inputCls} style={borderStyle} placeholder="Jan 2022"
            value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500 mb-1 block">End</label>
          <input className={inputCls} style={borderStyle} placeholder="Present"
            value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>
      </div>

      {/* Outcomes */}
      <div>
        <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
          Impact & Outcomes <span className="text-stone-400 font-normal">(focus on what changed, not what you did)</span>
        </label>
        <div className="space-y-2">
          {form.outcomes.map((o, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="mt-2 text-stone-300 text-sm">↗</span>
              <input className={`${inputCls} flex-1`} style={borderStyle}
                placeholder='e.g. "Reduced load time by 60%, improving retention 18%"'
                value={o} onChange={e => updateOutcome(i, e.target.value)} />
              {form.outcomes.length > 1 && (
                <button onClick={() => removeOutcome(i)} className="mt-2 text-stone-300 hover:text-red-400 transition-colors">
                  <IconX />
                </button>
              )}
            </div>
          ))}
        </div>
        <button onClick={addOutcome}
          className="mt-2 flex items-center gap-1 text-xs font-medium hover:opacity-80 transition-opacity"
          style={{ color: GREEN_MID }}>
          <IconPlus /> Add outcome
        </button>
      </div>

      {/* Key metric */}
      <div>
        <label className="text-xs font-semibold text-stone-500 mb-1 block">
          Key Metric <span className="text-stone-400 font-normal">(optional — the headline number)</span>
        </label>
        <input className={inputCls} style={borderStyle} placeholder='e.g. "↑ 40% conversion · $2M ARR · 0→1 product"'
          value={form.metrics ?? ''} onChange={e => set('metrics', e.target.value)} />
      </div>

      {/* Skills */}
      <div>
        <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Skills used</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.skills?.map(s => (
            <span key={s} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: GREEN_LT, color: GREEN }}>
              {s}
              <button onClick={() => setForm(f => ({ ...f, skills: f.skills?.filter(x => x !== s) }))}
                className="opacity-50 hover:opacity-100"><IconX /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} style={borderStyle} placeholder="Add a skill…"
            value={skillInput} onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())} />
          <button onClick={addSkill}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>Add</button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
          style={{ borderColor: '#e7e5e4' }}>
          <IconX /> Cancel
        </button>
        <button onClick={() => onSave(form)}
          disabled={!form.role.trim() || !form.company.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: GREEN }}>
          <IconCheck /> Save
        </button>
      </div>
    </div>
  );
};

// ─── Experience card (read mode) ──────────────────────────────────────────────
const ExperienceCard: React.FC<{
  exp: Experience;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ exp, isOwn, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="relative pl-6">
      {/* Timeline dot */}
      <div className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white"
        style={{ borderColor: GREEN }}>
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GREEN }} />
      </div>
      {/* Timeline line (visible on non-last items via parent) */}

      <div className="pb-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-stone-900 text-base leading-tight break-words">{exp.role}</h4>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-sm font-semibold break-words" style={{ color: GREEN_MID }}>{exp.company}</span>
              <span className="text-stone-300 text-xs">·</span>
              <span className="text-xs text-stone-400">{exp.startDate} — {exp.endDate || 'Present'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setExpanded(e => !e)}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}>
              <span className={`block transition-transform duration-200 ${expanded ? '' : 'rotate-180'}`}>
                <IconArrowUp />
              </span>
            </button>
            {isOwn && (
              <>
                <button onClick={onEdit} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 transition-colors" title="Edit">
                  <IconEdit />
                </button>
                <button onClick={onDelete} className="rounded-lg p-1.5 text-stone-400 hover:text-red-400 hover:bg-red-50 transition-colors" title="Delete">
                  <IconTrash />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Headline metric */}
        {exp.metrics && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: GREEN_LT, color: GREEN }}>
            <span className="text-base leading-none">↗</span>
            {exp.metrics}
          </div>
        )}

        {/* Outcomes */}
        {expanded && exp.outcomes?.filter(Boolean).length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {exp.outcomes.filter(Boolean).map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-600 leading-relaxed">
                <span className="mt-0.5 shrink-0 text-xs font-bold" style={{ color: GREEN }}>↗</span>
                {o}
              </li>
            ))}
          </ul>
        )}

        {/* Skills */}
        {expanded && exp.skills && exp.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {exp.skills.map(s => (
              <span key={s} className="rounded-full px-2.5 py-0.5 text-xs font-medium border"
                style={{ backgroundColor: '#f5f5f4', borderColor: '#e7e5e4', color: '#57534e' }}>
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
interface ExperienceSectionProps {
  experiences: Experience[];
  isOwn: boolean;
  onSave: (experiences: Experience[]) => void;
}

const ExperienceSection: React.FC<ExperienceSectionProps> = ({ experiences, isOwn, onSave }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleSave = (exp: Experience) => {
    if (editingId === '__new__') {
      onSave([...experiences, exp]);
    } else {
      onSave(experiences.map(e => e.id === exp.id ? exp : e));
    }
    setEditingId(null);
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    onSave(experiences.filter(e => e.id !== id));
  };

  const startAdd = () => {
    setEditingId('__new__');
    setAdding(true);
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: GREEN }}>
            <IconBriefcase />
          </div>
          <div>
            <h3 className="font-bold text-stone-900">Experience & Work History</h3>
            <p className="text-xs text-stone-400">Outcomes over job titles</p>
          </div>
        </div>
        {isOwn && !adding && editingId === null && (
          <button onClick={startAdd}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            <IconPlus /> Add
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && editingId === '__new__' && (
        <div className="mb-4">
          <ExperienceForm
            initial={emptyExp()}
            onSave={handleSave}
            onCancel={() => { setAdding(false); setEditingId(null); }}
          />
        </div>
      )}

      {/* Experience list */}
      {experiences.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
            <svg className="w-6 h-6 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
          </div>
          <p className="font-medium text-stone-600 text-sm">No experience added yet</p>
          <p className="text-xs text-stone-400 mt-1">Add roles and let your impact speak for itself</p>
          {isOwn && (
            <button onClick={startAdd}
              className="mt-4 flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: GREEN }}>
              <IconPlus /> Add first role
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          {experiences.length > 1 && (
            <div className="absolute left-2 top-3 bottom-6 w-px" style={{ backgroundColor: '#e7e5e4' }} />
          )}
          {experiences.map(exp => (
            editingId === exp.id ? (
              <div key={exp.id} className="mb-4">
                <ExperienceForm
                  initial={exp}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <ExperienceCard
                key={exp.id}
                exp={exp}
                isOwn={isOwn}
                onEdit={() => setEditingId(exp.id)}
                onDelete={() => handleDelete(exp.id)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default ExperienceSection;
