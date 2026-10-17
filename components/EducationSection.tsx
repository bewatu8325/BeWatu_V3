import React, { useState } from 'react';
import { Education } from '../types';

const GREEN     = 'var(--bw-green)';
const GREEN_MID = 'var(--bw-green-mid)';

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconGraduationCap = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
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

// ─── Empty Education template ──────────────────────────────────────────────────
const emptyEdu = (): Education => ({
  id: Date.now().toString(),
  institution: '',
  degree: '',
  field: '',
  startDate: '',
  endDate: '',
  description: '',
});

// ─── Inline form ──────────────────────────────────────────────────────────────
const EducationForm: React.FC<{
  initial: Education;
  onSave: (e: Education) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState<Education>({ ...initial });

  const set = (key: keyof Education, val: string) => setForm(f => ({ ...f, [key]: val }));

  const inputCls = "w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-[var(--bw-green)]/30";
  const borderStyle = { borderColor: '#e7e5e4' };

  return (
    <div className="rounded-xl border bg-stone-50 p-4 space-y-4" style={borderStyle}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs font-semibold text-stone-600 mb-1 block">Institution</label>
          <input className={inputCls} style={borderStyle} placeholder="e.g. State University"
            value={form.institution} onChange={e => set('institution', e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs font-semibold text-stone-600 mb-1 block">Degree</label>
          <input className={inputCls} style={borderStyle} placeholder="e.g. B.S."
            value={form.degree} onChange={e => set('degree', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-stone-600 mb-1 block">Field of study</label>
          <input className={inputCls} style={borderStyle} placeholder="e.g. Computer Science"
            value={form.field} onChange={e => set('field', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-600 mb-1 block">Start</label>
          <input className={inputCls} style={borderStyle} placeholder="2018"
            value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-600 mb-1 block">End</label>
          <input className={inputCls} style={borderStyle} placeholder="2022"
            value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-stone-600 mb-1 block">
          Notes <span className="text-stone-600 font-normal">(optional — honors, activities, thesis)</span>
        </label>
        <input className={inputCls} style={borderStyle} placeholder="e.g. Graduated with honors"
          value={form.description ?? ''} onChange={e => set('description', e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
          style={{ borderColor: '#e7e5e4' }}>
          <IconX /> Cancel
        </button>
        <button onClick={() => onSave(form)}
          disabled={!form.institution.trim() || !form.degree.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: GREEN }}>
          <IconCheck /> Save
        </button>
      </div>
    </div>
  );
};

// ─── Education card (read mode) ────────────────────────────────────────────────
const EducationCard: React.FC<{
  edu: Education;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ edu, isOwn, onEdit, onDelete }) => {
  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white"
        style={{ borderColor: GREEN }}>
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GREEN }} />
      </div>

      <div className="pb-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-stone-900 text-base leading-tight break-words">{edu.institution}</h4>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-sm font-semibold break-words" style={{ color: GREEN_MID }}>
                {edu.degree}{edu.field ? `, ${edu.field}` : ''}
              </span>
              {(edu.startDate || edu.endDate) && (
                <>
                  <span className="text-stone-300 text-xs">·</span>
                  <span className="text-xs text-stone-600">{edu.startDate}{edu.startDate && edu.endDate ? ' — ' : ''}{edu.endDate}</span>
                </>
              )}
            </div>
            {edu.description && (
              <p className="mt-2 text-sm text-stone-600 leading-relaxed">{edu.description}</p>
            )}
          </div>
          {isOwn && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100 transition-colors" title="Edit">
                <IconEdit />
              </button>
              <button onClick={onDelete} className="rounded-lg p-1.5 text-stone-600 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                <IconTrash />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
interface EducationSectionProps {
  education: Education[];
  isOwn: boolean;
  onSave: (education: Education[]) => void;
}

const EducationSection: React.FC<EducationSectionProps> = ({ education, isOwn, onSave }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleSave = (edu: Education) => {
    if (editingId === '__new__') {
      onSave([...education, edu]);
    } else {
      onSave(education.map(e => e.id === edu.id ? edu : e));
    }
    setEditingId(null);
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    onSave(education.filter(e => e.id !== id));
  };

  const startAdd = () => {
    setEditingId('__new__');
    setAdding(true);
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: GREEN }}>
            <IconGraduationCap />
          </div>
          <div>
            <h3 className="font-bold text-stone-900">Education</h3>
            <p className="text-xs text-stone-600">Degrees, certifications, and training</p>
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

      {adding && editingId === '__new__' && (
        <div className="mb-4">
          <EducationForm
            initial={emptyEdu()}
            onSave={handleSave}
            onCancel={() => { setAdding(false); setEditingId(null); }}
          />
        </div>
      )}

      {education.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
            <svg className="w-6 h-6 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
            </svg>
          </div>
          <p className="font-medium text-stone-600 text-sm">No education added yet</p>
          <p className="text-xs text-stone-600 mt-1">Add your degrees, certifications, or training</p>
          {isOwn && (
            <button onClick={startAdd}
              className="mt-4 flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: GREEN }}>
              <IconPlus /> Add education
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {education.length > 1 && (
            <div className="absolute left-2 top-3 bottom-6 w-px" style={{ backgroundColor: '#e7e5e4' }} />
          )}
          {education.map(edu => (
            editingId === edu.id ? (
              <div key={edu.id} className="mb-4">
                <EducationForm
                  initial={edu}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <EducationCard
                key={edu.id}
                edu={edu}
                isOwn={isOwn}
                onEdit={() => setEditingId(edu.id)}
                onDelete={() => handleDelete(edu.id)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default EducationSection;
