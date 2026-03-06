import React, { useState, useEffect, useRef } from 'react';
import { getActiveSparks, toggleSparkReaction, createSpark, type SparkFormat } from '../lib/firestoreService';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  Plus, X, ChevronLeft, ChevronRight,
  Flame, Lightbulb, Target, Handshake, MapPin,
  Heart, Zap, Users,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SparkGroup {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  sparks: any[];
}

type ReactionType = 'relate' | 'inspire' | 'collab';

// ─── Format config ────────────────────────────────────────────────────────────

const FORMAT_CONFIG = {
  win:          { icon: Flame,     label: 'Win',          hint: 'Share a recent accomplishment with a stat',      gradient: 'from-amber-500/20 to-amber-500/5',   accent: 'text-amber-400',  border: 'border-amber-500/30' },
  insight:      { icon: Lightbulb, label: 'Insight',      hint: 'One sentence that changed how you think',        gradient: 'from-teal-500/20 to-teal-500/5',     accent: 'text-teal-400',   border: 'border-teal-500/30' },
  goal:         { icon: Target,    label: 'Goal',         hint: 'What you are working toward this week',          gradient: 'from-purple-500/20 to-purple-500/5', accent: 'text-purple-400', border: 'border-purple-500/30' },
  'looking-for':{ icon: Handshake, label: 'Looking for',  hint: 'Collaborators, feedback, or opportunities',      gradient: 'from-cyan-500/20 to-cyan-500/5',     accent: 'text-cyan-400',   border: 'border-cyan-500/30' },
  status:       { icon: MapPin,    label: 'Status',       hint: 'Available / Busy / Open to work',               gradient: 'from-rose-500/20 to-rose-500/5',     accent: 'text-rose-400',   border: 'border-rose-500/30' },
};

const FORMATS = Object.entries(FORMAT_CONFIG).map(([value, cfg]) => ({ value: value as SparkFormat, ...cfg }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'BW';
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return 'expired';
}

// ─── Spark Viewer ─────────────────────────────────────────────────────────────

interface SparkViewerProps {
  groups: SparkGroup[];
  initialGroupIndex: number;
  onClose: () => void;
  onReacted: () => void;
  uid: string;
}

function SparkViewer({ groups, initialGroupIndex, onClose, onReacted, uid }: SparkViewerProps) {
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [sparkIdx, setSparkIdx] = useState(0);

  const group = groups[groupIdx];
  const spark = group?.sparks[sparkIdx];
  const format = spark ? FORMAT_CONFIG[(spark.format as SparkFormat) ?? 'win'] : FORMAT_CONFIG.win;
  const FormatIcon = format.icon;

  const goNext = () => {
    if (sparkIdx < group.sparks.length - 1) { setSparkIdx(i => i + 1); }
    else if (groupIdx < groups.length - 1) { setGroupIdx(i => i + 1); setSparkIdx(0); }
    else { onClose(); }
  };

  const goPrev = () => {
    if (sparkIdx > 0) { setSparkIdx(i => i - 1); }
    else if (groupIdx > 0) { setGroupIdx(i => i - 1); setSparkIdx(groups[groupIdx - 1].sparks.length - 1); }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  useEffect(() => {
    const timer = setTimeout(goNext, 8000);
    return () => clearTimeout(timer);
  }, [sparkIdx, groupIdx]);

  async function handleReaction(type: ReactionType) {
    if (!uid || !spark) return;
    await toggleSparkReaction(spark.id, uid, type);
    onReacted();
  }

  if (!spark) return null;

  const reactions = spark.reactions ?? { relate: [], inspire: [], collab: [] };
  const relateActive = reactions.relate?.includes(uid);
  const inspireActive = reactions.inspire?.includes(uid);
  const collabActive = reactions.collab?.includes(uid);
  const timeAgo = spark.createdAt?.toDate ? formatTimeAgo(spark.createdAt.toDate()) : '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} className="absolute -top-12 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* Prev */}
        {(sparkIdx > 0 || groupIdx > 0) && (
          <button onClick={goPrev} className="absolute left-0 top-1/2 -translate-x-12 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Next */}
        <button onClick={goNext} className="absolute right-0 top-1/2 translate-x-12 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Card */}
        <div className={`rounded-2xl border ${format.border} bg-slate-900 overflow-hidden shadow-2xl`}>
          {/* Progress bars */}
          <div className="flex gap-1 p-3 pb-0">
            {group.sparks.map((_, i) => (
              <div key={i} className="h-0.5 flex-1 rounded-full bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full bg-cyan-500 transition-all duration-300 ${i < sparkIdx ? 'w-full' : i === sparkIdx ? 'w-full animate-pulse' : 'w-0'}`} />
              </div>
            ))}
          </div>

          {/* Author */}
          <div className="flex items-center gap-3 p-4 pb-2">
            {group.authorAvatar ? (
              <img src={group.authorAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">
                {initials(group.authorName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">{group.authorName}</p>
              <p className="text-[11px] text-slate-400">{timeAgo}</p>
            </div>
            <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-gradient-to-r ${format.gradient} ${format.accent}`}>
              <FormatIcon className="h-3.5 w-3.5" />
              <span>{format.label}</span>
            </div>
          </div>

          {/* Content */}
          <div className={`min-h-[200px] flex flex-col items-center justify-center p-6 bg-gradient-to-b ${format.gradient}`}>
            {spark.stat && <p className={`text-3xl font-bold ${format.accent} mb-2`}>{spark.stat}</p>}
            <p className="text-lg font-medium text-slate-100 text-center leading-relaxed">{spark.content}</p>
          </div>

          {/* Reactions */}
          <div className="flex items-center justify-center gap-2 p-4 border-t border-slate-700/50">
            {[
              { type: 'relate' as ReactionType, icon: Heart, label: 'Relate', active: relateActive, count: reactions.relate?.length, color: 'text-rose-400 bg-rose-400/15' },
              { type: 'inspire' as ReactionType, icon: Zap,   label: 'Inspire', active: inspireActive, count: reactions.inspire?.length, color: 'text-amber-400 bg-amber-400/15' },
              { type: 'collab' as ReactionType, icon: Users,  label: 'Collab', active: collabActive, count: reactions.collab?.length, color: 'text-cyan-400 bg-cyan-400/15' },
            ].map(({ type, icon: Icon, label, active, count, color }) => (
              <button
                key={type}
                onClick={() => handleReaction(type)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all ${active ? color : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {count > 0 && <span>{count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Spark Dialog ──────────────────────────────────────────────────────

interface CreateSparkDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  authorId: string;
  authorName: string;
  authorAvatar: string;
}

function CreateSparkDialog({ open, onClose, onCreated, authorId, authorName, authorAvatar }: CreateSparkDialogProps) {
  const [format, setFormat] = useState<SparkFormat>('win');
  const [content, setContent] = useState('');
  const [stat, setStat] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const maxLength = 200;

  const selectedFormat = FORMAT_CONFIG[format];

  async function handleCreate() {
    if (!content.trim()) return;
    setError('');
    setCreating(true);
    try {
      await createSpark({ authorId, authorName, authorAvatar, format, content: content.trim(), stat: stat.trim() || undefined });
      setContent(''); setStat(''); setFormat('win');
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create Spark');
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Create a Spark</h2>
            <p className="text-xs text-slate-400">Disappears in 48 hours</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-800 transition-colors">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {error && <div className="rounded-lg bg-red-900/20 border border-red-500/30 px-3 py-2 text-sm text-red-400">{error}</div>}

          {/* Format picker */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">Format</label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setFormat(value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border ${format === value ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-slate-600 text-slate-400 hover:bg-slate-800'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{selectedFormat.hint}</p>
          </div>

          {/* Stat (win only) */}
          {format === 'win' && (
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Key stat (optional)</label>
              <input
                type="text"
                value={stat}
                onChange={e => setStat(e.target.value)}
                placeholder='e.g. "10k users" or "3x faster"'
                maxLength={50}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}

          {/* Content */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Your Spark</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, maxLength))}
              placeholder={
                format === 'win' ? 'What did you ship or achieve?' :
                format === 'insight' ? 'What changed your thinking?' :
                format === 'goal' ? 'What are you focused on?' :
                format === 'looking-for' ? 'What do you need help with?' :
                'What is your current availability?'
              }
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <p className="mt-1 text-right text-[10px] text-slate-500">{content.length}/{maxLength}</p>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !content.trim()}
            className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Sharing...' : 'Share Spark'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sparks Tray (main export) ────────────────────────────────────────────────

export function SparksTray() {
  const { currentUser, fbUser } = useFirebase();
  const [groups, setGroups] = useState<SparkGroup[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  async function loadSparks() {
    try {
      const sparks = await getActiveSparks();
      const map = new Map<string, SparkGroup>();
      for (const s of sparks) {
        const key = s.authorId as string;
        if (!map.has(key)) {
          map.set(key, { authorId: key, authorName: s.authorName ?? '', authorAvatar: s.authorAvatar ?? '', sparks: [] });
        }
        map.get(key)!.sparks.push(s);
      }
      const arr = Array.from(map.values());
      const myIdx = arr.findIndex(g => g.authorId === fbUser?.uid);
      if (myIdx > 0) { const [mine] = arr.splice(myIdx, 1); arr.unshift(mine); }
      setGroups(arr);
    } catch { setGroups([]); }
  }

  useEffect(() => { loadSparks(); }, [fbUser?.uid]);

  function openGroup(index: number) { setActiveGroupIndex(index); setViewerOpen(true); }

  if (!currentUser || !fbUser) return null;

  return (
    <>
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sparks</h2>
          <span className="text-[10px] text-slate-500">48h micro-moments</span>
        </div>
        <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {/* Create button */}
          <button onClick={() => setCreateOpen(true)} className="flex flex-col items-center gap-1 shrink-0">
            <div className="relative">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover border-2 border-slate-600" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-slate-300 border-2 border-slate-600">
                  {initials(currentUser.name)}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white">
                <Plus className="h-3 w-3" />
              </div>
            </div>
            <span className="max-w-[60px] truncate text-[10px] text-slate-400">Your Spark</span>
          </button>

          {/* Spark groups */}
          {groups.map((group, i) => {
            const hasUnviewed = group.sparks.some(s =>
              !s.reactions?.relate?.includes(fbUser.uid) &&
              !s.reactions?.inspire?.includes(fbUser.uid) &&
              !s.reactions?.collab?.includes(fbUser.uid)
            );
            return (
              <button key={group.authorId} onClick={() => openGroup(i)} className="flex flex-col items-center gap-1 shrink-0">
                <div className={`rounded-full p-[2.5px] ${hasUnviewed ? 'bg-gradient-to-br from-cyan-500 to-amber-500' : 'bg-slate-600'}`}>
                  {group.authorAvatar ? (
                    <img src={group.authorAvatar} alt="" className="h-12 w-12 rounded-full object-cover border-2 border-slate-900" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300 border-2 border-slate-900">
                      {initials(group.authorName)}
                    </div>
                  )}
                </div>
                <span className="max-w-[60px] truncate text-[10px] text-slate-400">
                  {group.authorId === fbUser.uid ? 'You' : group.authorName.split(' ')[0]}
                </span>
              </button>
            );
          })}

          {groups.length === 0 && (
            <p className="text-xs text-slate-500 py-2 px-1">No active Sparks yet. Be the first!</p>
          )}
        </div>
      </div>

      {viewerOpen && groups[activeGroupIndex] && (
        <SparkViewer
          groups={groups}
          initialGroupIndex={activeGroupIndex}
          onClose={() => setViewerOpen(false)}
          onReacted={loadSparks}
          uid={fbUser.uid}
        />
      )}

      <CreateSparkDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadSparks}
        authorId={fbUser.uid}
        authorName={currentUser.name}
        authorAvatar={currentUser.avatarUrl}
      />
    </>
  );
}

export default SparksTray;
