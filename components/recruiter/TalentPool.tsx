import React, { useState, useEffect } from 'react';
import {
  Bookmark, Search, Tag, Plus, X, Loader2,
  User, Star, MapPin, Briefcase, Trash2, ExternalLink, Clock,
} from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  fetchTalentPool,
  addToTalentPool,
  removeFromTalentPool,
  updateTalentPoolEntry,
} from '../../lib/firestoreService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TalentPoolEntry {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userHeadline?: string;
  userLocation?: string;
  userSkills?: string[];
  tags: string[];
  notes: string;
  rating: 1 | 2 | 3 | 4 | 5;
  savedAt: any;
  forRoles?: string[]; // job titles they might fit
  availability?: string;
  contactedAt?: string;
}

// ─── Tag badge ────────────────────────────────────────────────────────────────

const TAG_COLORS = [
  'bg-[#e8f4f0] border-[#1a4a3a]/20 text-[#1a6b52]',
  'bg-purple-500/10 border-purple-500/20 text-purple-400',
  'bg-amber-500/10 border-amber-500/20 text-amber-400',
  'bg-green-500/10 border-green-500/20 text-green-400',
  'bg-pink-500/10 border-pink-500/20 text-pink-400',
];

function tagColor(tag: string) {
  const hash = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange?: (v: 1|2|3|4|5) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          onClick={onChange ? () => onChange(n as 1|2|3|4|5) : undefined}
          className={`${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
        >
          <Star className={`h-3.5 w-3.5 ${n <= value ? 'text-amber-400 fill-amber-400' : 'text-stone-400'}`} />
        </button>
      ))}
    </div>
  );
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

function PoolCard({
  entry,
  onRemove,
  onUpdate,
  onViewProfile,
}: {
  entry: TalentPoolEntry;
  onRemove: () => void;
  onUpdate: (updates: Partial<TalentPoolEntry>) => Promise<void>;
  onViewProfile?: (userId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(updates: Partial<TalentPoolEntry>) {
    setSaving(true);
    try { await onUpdate(updates); }
    finally { setSaving(false); }
  }

  async function addTag() {
    const t = newTag.trim();
    if (!t || entry.tags.includes(t)) { setNewTag(''); return; }
    await save({ tags: [...(entry.tags ?? []), t] });
    entry.tags = [...(entry.tags ?? []), t]; // optimistic
    setNewTag('');
  }

  async function removeTag(tag: string) {
    await save({ tags: (entry.tags ?? []).filter(t => t !== tag) });
    entry.tags = (entry.tags ?? []).filter(t => t !== tag);
  }

  const savedDate = entry.savedAt?.toDate?.()?.toLocaleDateString() ?? 'Recently';

  return (
    <div className={`rounded-xl border bg-white transition-all ${expanded ? 'border-[#1a4a3a]/30' : 'border-stone-200 hover:border-stone-200'}`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {entry.userAvatar ? (
          <img src={entry.userAvatar} alt="" className="h-10 w-10 rounded-full object-cover border border-stone-200 shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-stone-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900 truncate">{entry.userName}</p>
          <p className="text-xs text-stone-500 truncate">{entry.userHeadline}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <StarRating value={entry.rating} />
          <span className="text-[10px] text-stone-500">Saved {savedDate}</span>
        </div>
      </div>

      {/* Tags preview */}
      {entry.tags && entry.tags.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {entry.tags.map(tag => (
            <span key={tag} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tagColor(tag)}`}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-stone-200 p-4 space-y-3">
          {/* Skills */}
          {entry.userSkills && entry.userSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.userSkills.slice(0, 8).map(s => (
                <span key={s} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">{s}</span>
              ))}
            </div>
          )}

          {/* Meta */}
          <div className="flex flex-wrap gap-3 text-xs text-stone-500">
            {entry.userLocation && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.userLocation}</span>
            )}
            {entry.availability && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{entry.availability}</span>
            )}
            {entry.forRoles && entry.forRoles.length > 0 && (
              <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />Good for: {entry.forRoles.join(', ')}</span>
            )}
          </div>

          {/* Rating editor */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500">Rating:</span>
            <StarRating value={entry.rating} onChange={r => save({ rating: r })} />
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-stone-500">Private Notes</span>
              {!editingNotes && (
                <button onClick={() => setEditingNotes(true)} className="text-xs text-[#1a6b52] hover:text-[#1a6b52]">Edit</button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-1.5">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border bg-white  px-3 py-2 text-xs text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={async () => { await save({ notes }); setEditingNotes(false); }}
                    disabled={saving}
                    className="rounded-lg bg-[#1a4a3a] px-3 py-1 text-xs font-medium text-white hover:bg-[#1a4a3a] disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setNotes(entry.notes); setEditingNotes(false); }}
                    className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-700">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-stone-700 italic">{notes || 'No notes yet.'}</p>
            )}
          </div>

          {/* Tag editor */}
          <div>
            <span className="text-xs font-medium text-stone-500 block mb-1.5">Tags</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(entry.tags ?? []).map(tag => (
                <span key={tag} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tagColor(tag)}`}>
                  {tag}
                  <button onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add tag (e.g. 'React', 'Future hire')..."
                className="flex-1 rounded-lg border bg-white  px-2.5 py-1.5 text-xs text-stone-800 placeholder:text-stone-500 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}
              />
              <button onClick={addTag} disabled={!newTag.trim()}
                className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs text-stone-800 hover:bg-stone-200 disabled:opacity-40 transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {onViewProfile && (
              <button onClick={() => onViewProfile(entry.userId)}
                className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors">
                <ExternalLink className="h-3 w-3" />View Profile
              </button>
            )}
            <div className="flex-1" />
            <button onClick={onRemove}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="h-3 w-3" />Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TalentPoolProps {
  onViewProfile?: (userId: number) => void;
}

export function TalentPool({ onViewProfile }: TalentPoolProps) {
  const { fbUser } = useFirebase();
  const [entries, setEntries] = useState<TalentPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  useEffect(() => {
    if (!fbUser) return;
    fetchTalentPool(fbUser.uid)
      .then(d => setEntries(d as TalentPoolEntry[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fbUser]);

  async function handleRemove(entryId: string) {
    if (!fbUser || !window.confirm('Remove from talent pool?')) return;
    await removeFromTalentPool(fbUser.uid, entryId);
    setEntries(prev => prev.filter(e => e.id !== entryId));
  }

  async function handleUpdate(entryId: string, updates: Partial<TalentPoolEntry>) {
    if (!fbUser) return;
    await updateTalentPoolEntry(fbUser.uid, entryId, updates);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, ...updates } : e));
  }

  // All unique tags across pool
  const allTags = Array.from(new Set(entries.flatMap(e => e.tags ?? [])));

  const filtered = entries.filter(e => {
    const matchesSearch = !search ||
      e.userName.toLowerCase().includes(search.toLowerCase()) ||
      e.userHeadline?.toLowerCase().includes(search.toLowerCase()) ||
      (e.userSkills ?? []).some(s => s.toLowerCase().includes(search.toLowerCase()));
    const matchesTag = !tagFilter || (e.tags ?? []).includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-900">
          <Bookmark className="h-5 w-5 text-[#1a6b52]" />Talent Pool
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Candidates who weren't right for this role — but worth keeping for future ones.
        </p>
      </div>

      {/* Search & filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, headline, skill..."
            className="w-full rounded-lg border bg-white  pl-8 pr-3 py-2 text-xs text-stone-800 placeholder:text-stone-500 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}
          />
        </div>
        {allTags.length > 0 && (
          <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}
            className="rounded-lg border bg-white  px-3 py-2 text-xs text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}>
            <option value="">All tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-stone-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 py-16 text-center">
          <Bookmark className="h-10 w-10 text-stone-400" />
          <p className="mt-3 text-sm text-stone-500">
            {entries.length === 0
              ? 'Your talent pool is empty.'
              : 'No candidates match your search.'}
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Save candidates from the Applicant Inbox or Pipeline to build your pool.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-stone-500">{filtered.length} of {entries.length} candidates</p>
          {filtered
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
            .map(entry => (
              <PoolCard
                key={entry.id}
                entry={entry}
                onRemove={() => handleRemove(entry.id)}
                onUpdate={(updates) => handleUpdate(entry.id, updates)}
                onViewProfile={onViewProfile ? (uid) => onViewProfile(Number(uid)) : undefined}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default TalentPool;
