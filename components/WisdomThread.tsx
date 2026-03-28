/**
 * components/WisdomThread.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Long-form structured posts for sharing hard-won career lessons.
 * Template enforces: the lesson, the context, what they'd do differently,
 * and who this is most relevant for.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { BookOpen, Heart, Bookmark, Share2, ChevronDown, ChevronUp } from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';
const AMBER    = '#d97706';
const AMBER_LT = '#fef3c7';

export interface WisdomThreadData {
  id:            string;
  authorId:      number;
  authorName:    string;
  authorAvatar?: string;
  authorYearsXp: number;     // years of experience
  authorRole:    string;     // e.g. "Senior Engineer at Google"

  headline:      string;     // "The lesson in one sentence"
  theLesson:     string;     // full lesson content
  theContext:    string;     // how they learned it
  doingItAgain:  string;     // what they'd do differently
  whoNeedsThis:  string;     // who this is most relevant for

  tags:          string[];
  saves:         number;
  hearts:        number;
  createdAt:     Date;
  _firestoreId?: string;
}

// ── Wisdom thread card ────────────────────────────────────────────────────────

export const WisdomThreadCard: React.FC<{
  thread:       WisdomThreadData;
  onHeart:      (id: string) => void;
  onSave:       (id: string) => void;
  onViewProfile:(userId: number) => void;
}> = ({ thread, onHeart, onSave, onViewProfile }) => {
  const [expanded, setExpanded] = useState(false);
  const [hearted, setHearted]   = useState(false);
  const [saved, setSaved]       = useState(false);

  const xpLabel = thread.authorYearsXp >= 20 ? '20+ yrs'
    : thread.authorYearsXp >= 10 ? `${thread.authorYearsXp} yrs`
    : `${thread.authorYearsXp} yrs`;

  const initials = thread.authorName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e7e5e4' }}>

      {/* Amber wisdom header stripe */}
      <div className="px-5 py-2.5 flex items-center gap-2 border-b"
        style={{ backgroundColor: AMBER_LT, borderColor: '#fde68a' }}>
        <BookOpen size={12} style={{ color: AMBER }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: AMBER }}>
          Wisdom Thread
        </span>
        <span className="ml-auto text-xs font-semibold" style={{ color: AMBER }}>
          {xpLabel} experience
        </span>
      </div>

      <div className="p-5">
        {/* Author */}
        <div className="flex items-start gap-3 mb-4">
          <button onClick={() => onViewProfile(thread.authorId)} className="flex-shrink-0">
            {thread.authorAvatar ? (
              <img src={thread.authorAvatar} alt={thread.authorName}
                className="w-10 h-10 rounded-full object-cover ring-2"
                style={{ '--tw-ring-color': GREEN_LT } as React.CSSProperties}
              />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: GREEN }}>
                {initials}
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={() => onViewProfile(thread.authorId)}
              className="font-semibold text-stone-900 text-sm hover:underline text-left block">
              {thread.authorName}
            </button>
            <p className="text-xs text-stone-400 truncate">{thread.authorRole}</p>
          </div>
        </div>

        {/* Headline */}
        <p className="font-bold text-stone-900 text-base leading-snug mb-4 border-l-4 pl-3"
          style={{ borderColor: AMBER }}>
          "{thread.headline}"
        </p>

        {/* The lesson — always visible */}
        <div className="mb-3">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">The lesson</p>
          <p className="text-sm text-stone-700 leading-relaxed">
            {expanded ? thread.theLesson : thread.theLesson.slice(0, 160) + (thread.theLesson.length > 160 ? '…' : '')}
          </p>
        </div>

        {/* Expanded sections */}
        {expanded && (
          <div className="space-y-4 border-t pt-4 mt-2" style={{ borderColor: '#f3f4f6' }}>
            {thread.theContext && (
              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">How I learned it</p>
                <p className="text-sm text-stone-600 leading-relaxed">{thread.theContext}</p>
              </div>
            )}
            {thread.doingItAgain && (
              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">What I'd do differently</p>
                <p className="text-sm text-stone-600 leading-relaxed">{thread.doingItAgain}</p>
              </div>
            )}
            {thread.whoNeedsThis && (
              <div className="rounded-xl p-3" style={{ backgroundColor: GREEN_LT }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: GREEN }}>Most relevant for</p>
                <p className="text-sm leading-relaxed" style={{ color: GREEN }}>{thread.whoNeedsThis}</p>
              </div>
            )}
            {thread.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {thread.tags.map(tag => (
                  <span key={tag} className="text-xs px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Expand toggle */}
        <button onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs font-semibold mt-3 transition-colors"
          style={{ color: GREEN }}>
          {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Read full thread</>}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: '#f3f4f6' }}>
          <button
            onClick={() => { setHearted(h => !h); onHeart(thread.id); }}
            className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: hearted ? '#dc2626' : '#9ca3af' }}
          >
            <Heart size={14} fill={hearted ? '#dc2626' : 'none'} />
            {thread.hearts + (hearted ? 1 : 0)}
          </button>
          <button
            onClick={() => { setSaved(s => !s); onSave(thread.id); }}
            className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: saved ? GREEN : '#9ca3af' }}
          >
            <Bookmark size={14} fill={saved ? GREEN : 'none'} />
            {saved ? 'Saved' : 'Save'}
          </button>
          <button className="flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-stone-600 transition-colors ml-auto">
            <Share2 size={13} />
            Share
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Create wisdom thread form ─────────────────────────────────────────────────

export const CreateWisdomThread: React.FC<{
  onSubmit: (data: Omit<WisdomThreadData, 'id' | 'authorId' | 'authorName' | 'authorAvatar' | 'saves' | 'hearts' | 'createdAt'>) => Promise<void>;
  onCancel: () => void;
  authorYearsXp?: number;
  authorRole?: string;
}> = ({ onSubmit, onCancel, authorYearsXp = 0, authorRole = '' }) => {
  const [headline,     setHeadline]     = useState('');
  const [theLesson,    setTheLesson]    = useState('');
  const [theContext,   setTheContext]   = useState('');
  const [doingItAgain, setDoingItAgain] = useState('');
  const [whoNeedsThis, setWhoNeedsThis] = useState('');
  const [tagInput,     setTagInput]     = useState('');
  const [tags,         setTags]         = useState<string[]>([]);
  const [yearsXp,      setYearsXp]      = useState(String(authorYearsXp || ''));
  const [role,         setRole]         = useState(authorRole);
  const [submitting,   setSubmitting]   = useState(false);

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags(t => [...t, tagInput.trim().toLowerCase()]);
      }
      setTagInput('');
    }
  };

  const handleSubmit = async () => {
    if (!headline.trim() || !theLesson.trim()) return;
    setSubmitting(true);
    await onSubmit({
      headline:      headline.trim(),
      theLesson:     theLesson.trim(),
      theContext:    theContext.trim(),
      doingItAgain:  doingItAgain.trim(),
      whoNeedsThis:  whoNeedsThis.trim(),
      tags,
      authorYearsXp: parseInt(yearsXp) || 0,
      authorRole:    role.trim(),
    });
    setSubmitting(false);
  };

  const Field: React.FC<{
    label: string; hint?: string; required?: boolean;
    value: string; onChange: (v: string) => void; rows?: number;
  }> = ({ label, hint, required, value, onChange, rows = 3 }) => (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">{label}</label>
        {required && <span className="text-xs text-red-400">required</span>}
        {hint && <span className="text-xs text-stone-400 normal-case">{hint}</span>}
      </div>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        className="w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none placeholder:text-stone-400 resize-none"
        style={{ borderColor: '#e7e5e4' }} />
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: '#f3f4f6' }}>
        <BookOpen size={15} style={{ color: AMBER }} />
        <h3 className="font-bold text-stone-900 text-sm">Share a wisdom thread</h3>
        <span className="ml-auto text-xs text-stone-400">Hard-won lessons from your career</span>
      </div>

      {/* Years XP + role */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
            Years of experience
          </label>
          <input type="number" min="0" max="60" value={yearsXp} onChange={e => setYearsXp(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none"
            style={{ borderColor: '#e7e5e4' }} placeholder="e.g. 15" />
        </div>
        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
            Your current role
          </label>
          <input type="text" value={role} onChange={e => setRole(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none"
            style={{ borderColor: '#e7e5e4' }} placeholder="e.g. VP Engineering" />
        </div>
      </div>

      {/* Headline */}
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">The lesson in one sentence</label>
          <span className="text-xs text-red-400">required</span>
        </div>
        <input type="text" value={headline} onChange={e => setHeadline(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none"
          style={{ borderColor: '#e7e5e4', borderLeft: `3px solid ${AMBER}` }}
          placeholder="e.g. Negotiating your first salary sets the baseline for your entire career" />
      </div>

      <Field label="The full lesson" required value={theLesson} onChange={setTheLesson} rows={4}
        hint="— what do you know now that you didn't then?" />
      <Field label="How you learned it" value={theContext} onChange={setTheContext} rows={3}
        hint="— the story behind the lesson" />
      <Field label="What you'd do differently" value={doingItAgain} onChange={setDoingItAgain} rows={2} />
      <Field label="Who needs to hear this most" value={whoNeedsThis} onChange={setWhoNeedsThis} rows={2}
        hint="— e.g. 'Anyone in their first 5 years of tech'" />

      {/* Tags */}
      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
          Tags (press Enter to add)
        </label>
        <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={addTag}
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none"
          style={{ borderColor: '#e7e5e4' }}
          placeholder="e.g. salary, negotiation, early-career" />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
                #{t}
                <button onClick={() => setTags(ts => ts.filter(x => x !== t))} className="text-stone-400 hover:text-red-400 ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 text-sm text-stone-600 border rounded-xl hover:bg-stone-50 transition-colors font-semibold"
          style={{ borderColor: '#e7e5e4' }}>
          Cancel
        </button>
        <button onClick={handleSubmit}
          disabled={submitting || !headline.trim() || !theLesson.trim()}
          className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          {submitting ? 'Posting…' : 'Share thread'}
        </button>
      </div>
    </div>
  );
};

export default WisdomThreadCard;
