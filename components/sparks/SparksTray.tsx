import React, { useState, useEffect, useRef } from 'react';
import { getActiveSparks, toggleSparkReaction, createSpark, type SparkFormat } from '../../lib/firestoreService';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  Plus, X, ChevronLeft, ChevronRight,
  Flame, Lightbulb, Flag, Link, MapPin,
  Heart, Zap, Users,
} from 'lucide-react';

interface SparkGroup {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  sparks: any[];
}

type ReactionType = 'relate' | 'inspire' | 'collab';

const FORMAT_CONFIG = {
  win:          { icon: Flame,     label: 'Win',         hint: 'Share a recent accomplishment with a stat',  gradient: 'from-amber-500/20 to-amber-500/5',   accent: 'text-amber-400',  border: 'border-amber-500/30' },
  insight:      { icon: Lightbulb, label: 'Insight',     hint: 'One sentence that changed how you think',    gradient: 'from-teal-500/20 to-teal-500/5',     accent: 'text-teal-400',   border: 'border-teal-500/30' },
  goal:         { icon: Flag,      label: 'Goal',        hint: 'What you are working toward this week',      gradient: 'from-purple-500/20 to-purple-500/5', accent: 'text-purple-400', border: 'border-purple-500/30' },
  'looking-for':{ icon: Link,      label: 'Looking for', hint: 'Collaborators, feedback, or opportunities',  gradient: 'from-cyan-500/20 to-cyan-500/5',     accent: 'text-[#1a4a3a]',  border: 'border-[#1a4a3a]/500/30' },
  status:       { icon: MapPin,    label: 'Status',      hint: 'Available / Busy / Open to work',            gradient: 'from-rose-500/20 to-rose-500/5',     accent: 'text-rose-400',   border: 'border-rose-500/30' },
};

const FORMATS = Object.entries(FORMAT_CONFIG).map(([value, cfg]) => ({ value: value as SparkFormat, ...cfg }));

// ─── Flame badge ──────────────────────────────────────────────────────────────
// Small 18×18 circle pinned to the top-right of each avatar.
// Active (unseen spark): amber border + amber flame.
// Inactive (all seen):   stone border + stone flame.

const FlameBadge: React.FC<{ active?: boolean }> = ({ active = true }) => (
  <div
    className="absolute -top-1 -right-1 z-10 flex items-center justify-center rounded-full bg-white shadow-sm"
    style={{ width: 18, height: 18, border: `1.5px solid ${active ? '#f59e0b' : '#d6d3d1'}` }}
  >
    <svg width="9" height="12" viewBox="0 0 9 12" fill="none">
      {/* Main flame body with secondary left-shoulder tip */}
      <path
        d="M4.5 0.4 C5.3 1.8 7.5 3.2 8 5.5 C8.5 7.8 7.2 9.8 5.8 10.8 C5.2 11.2 4.9 11.4 4.5 11.4 C4.1 11.4 3.8 11.2 3.2 10.8 C1.8 9.8 0.5 7.8 1 5.5 C1.5 3.2 3.7 1.8 4.5 0.4 Z M2.2 3.2 C2.2 4.6 1.2 5.5 0.8 7 C1.8 6 3 5 3.4 3.6 Z"
        fill={active ? '#f59e0b' : '#a8a29e'}
      />
    </svg>
  </div>
);

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

  const group  = groups[groupIdx];
  const spark  = group?.sparks[sparkIdx];
  const format = spark ? FORMAT_CONFIG[(spark.format as SparkFormat) ?? 'win'] : FORMAT_CONFIG.win;
  const FormatIcon = format.icon;

  const goNext = () => {
    if (sparkIdx < group.sparks.length - 1) { setSparkIdx(i => i + 1); }
    else if (groupIdx < groups.length - 1)  { setGroupIdx(i => i + 1); setSparkIdx(0); }
    else { onClose(); }
  };
  const goPrev = () => {
    if (sparkIdx > 0)      { setSparkIdx(i => i - 1); }
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

  const reactions     = spark.reactions ?? { relate: [], inspire: [], collab: [] };
  const relateActive  = reactions.relate?.includes(uid);
  const inspireActive = reactions.inspire?.includes(uid);
  const collabActive  = reactions.collab?.includes(uid);
  const timeAgo       = spark.createdAt?.toDate ? formatTimeAgo(spark.createdAt.toDate()) : '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-12 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-stone-900/60 text-white hover:bg-stone-900/80 transition-colors">
          <X className="h-5 w-5" />
        </button>
        {(sparkIdx > 0 || groupIdx > 0) && (
          <button onClick={goPrev} className="absolute left-0 top-1/2 -translate-x-12 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-stone-900/60 text-white hover:bg-stone-900/80 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <button onClick={goNext} className="absolute right-0 top-1/2 translate-x-12 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-stone-900/60 text-white hover:bg-stone-900/80 transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>

        <div className={`rounded-2xl border ${format.border} bg-stone-900 overflow-hidden shadow-2xl`}>
          <div className="flex gap-1 p-3 pb-0">
            {group.sparks.map((_, i) => (
              <div key={i} className="h-0.5 flex-1 rounded-full bg-stone-700 overflow-hidden">
                <div className={`h-full rounded-full bg-[#1a6b52] transition-all duration-300 ${i < sparkIdx ? 'w-full' : i === sparkIdx ? 'w-full animate-pulse' : 'w-0'}`} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 p-4 pb-2">
            {group.authorAvatar ? (
              <img src={group.authorAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a4a3a] text-xs font-bold text-white">
                {initials(group.authorName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{group.authorName}</p>
              <p className="text-[11px] text-stone-400">{timeAgo}</p>
            </div>
            <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-gradient-to-r ${format.gradient} ${format.accent}`}>
              <FormatIcon className="h-3.5 w-3.5" />
              <span>{format.label}</span>
            </div>
          </div>
          <div className={`min-h-[200px] flex flex-col items-center justify-center p-6 bg-gradient-to-b ${format.gradient}`}>
            {spark.stat && <p className={`text-3xl font-bold ${format.accent} mb-2`}>{spark.stat}</p>}
            <p className="text-lg font-medium text-white text-center leading-relaxed">{spark.content}</p>
          </div>
          <div className="flex items-center justify-center gap-2 p-4 border-t border-stone-700/50">
            {[
              { type: 'relate'  as ReactionType, icon: Heart, label: 'Relate',  active: relateActive,  count: reactions.relate?.length,  color: 'text-rose-400 bg-rose-400/15'  },
              { type: 'inspire' as ReactionType, icon: Zap,   label: 'Inspire', active: inspireActive, count: reactions.inspire?.length, color: 'text-amber-400 bg-amber-400/15' },
              { type: 'collab'  as ReactionType, icon: Users, label: 'Collab',  active: collabActive,  count: reactions.collab?.length,  color: 'text-[#1a4a3a] bg-#1a4a3a/15'  },
            ].map(({ type, icon: Icon, label, active, count, color }) => (
              <button key={type} onClick={() => handleReaction(type)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all ${active ? color : 'text-stone-300 hover:bg-stone-800'}`}>
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
  open: boolean; onClose: () => void; onCreated: () => void;
  authorId: string; authorName: string; authorAvatar: string;
}

function CreateSparkDialog({ open, onClose, onCreated, authorId, authorName, authorAvatar }: CreateSparkDialogProps) {
  const [format, setFormat]     = useState<SparkFormat>('win');
  const [content, setContent]   = useState('');
  const [stat, setStat]         = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');
  const maxLength = 200;
  const selectedFormat = FORMAT_CONFIG[format];

  async function handleCreate() {
    if (!content.trim()) return;
    setError(''); setCreating(true);
    try {
      await createSpark({ authorId, authorName, authorAvatar, format, content: content.trim(), ...(stat.trim() ? { stat: stat.trim() } : {}) });
      setContent(''); setStat(''); setFormat('win');
      onCreated(); onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create Spark');
    } finally { setCreating(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white shadow-2xl" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center justify-between border-b p-4" style={{ borderColor: '#e7e5e4' }}>
          <div>
            <h2 className="text-base font-bold text-stone-900">Share a Spark ⚡</h2>
            <p className="text-xs text-stone-400">Celebrate an achievement or share what you're working on — disappears in 48h</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-stone-100 transition-colors">
            <X className="h-4 w-4 text-stone-400" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div>
            <label className="text-xs font-medium text-stone-500 mb-2 block">Format</label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(({ value, label, icon: Icon }) => (
                <button key={value} onClick={() => setFormat(value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border ${format === value ? 'border-stone-800 text-white' : 'border-stone-200 text-stone-500 hover:bg-stone-50'}`}
                  style={format === value ? { backgroundColor: '#1a4a3a' } : {}}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-stone-400">{selectedFormat.hint}</p>
          </div>
          {format === 'win' && (
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">Key stat (optional)</label>
              <input type="text" value={stat} onChange={e => setStat(e.target.value)}
                placeholder='e.g. "10k users" or "3x faster"' maxLength={50}
                className="w-full rounded-xl border bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                style={{ borderColor: '#e7e5e4' }} />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Your Spark</label>
            <textarea value={content} onChange={e => setContent(e.target.value.slice(0, maxLength))}
              placeholder={
                format === 'win' ? 'What did you ship or achieve?' :
                format === 'insight' ? 'What changed your thinking?' :
                format === 'goal' ? 'What are you focused on?' :
                format === 'looking-for' ? 'What do you need help with?' :
                'What is your current availability?'
              }
              rows={3}
              className="w-full resize-none rounded-xl border bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2"
              style={{ borderColor: '#e7e5e4' }} />
            <p className="mt-1 text-right text-[10px] text-stone-400">{content.length}/{maxLength}</p>
          </div>
          <button onClick={handleCreate} disabled={creating || !content.trim()}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            style={{ backgroundColor: '#1a4a3a' }}>
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
  const [groups,           setGroups]           = useState<SparkGroup[]>([]);
  const [viewerOpen,       setViewerOpen]       = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [createOpen,       setCreateOpen]       = useState(false);

  async function loadSparks() {
    try {
      const sparks = await getActiveSparks();
      const map = new Map<string, SparkGroup>();
      for (const s of sparks) {
        const key = s.authorId as string;
        if (!map.has(key)) map.set(key, { authorId: key, authorName: s.authorName ?? '', authorAvatar: s.authorAvatar ?? '', sparks: [] });
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

  const myHasSpark = groups.some(g => g.authorId === fbUser.uid);

  return (
    <>
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <div className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <h2 className="text-xs font-bold text-stone-700">Sparks</h2>
          </div>
          <span className="text-[10px] text-stone-400">48h</span>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto px-3 pb-3 pt-1"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

          {/* Create spark button */}
          <button onClick={() => setCreateOpen(true)} className="flex flex-col items-center gap-1 shrink-0">
            <div className="relative">
              <div className={`rounded-full p-[2.5px] ${myHasSpark ? 'bg-gradient-to-br from-emerald-500 to-teal-400' : 'bg-stone-200'}`}>
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover border-2 border-white" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-medium text-white border-2 border-white" style={{ backgroundColor: '#1a4a3a' }}>
                    {initials(currentUser.name)}
                  </div>
                )}
              </div>
              <FlameBadge active={myHasSpark} />
              <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a4a3a] text-white shadow-sm" style={{ zIndex: 20 }}>
                <Plus className="h-3 w-3" />
              </div>
            </div>
            <span className="max-w-[56px] truncate text-[10px] text-stone-500">Your Spark</span>
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
                <div className="relative">
                  <div className={`rounded-full p-[2.5px] ${hasUnviewed ? 'bg-gradient-to-br from-emerald-500 to-teal-400' : 'bg-stone-200'}`}>
                    {group.authorAvatar ? (
                      <img src={group.authorAvatar} alt="" className="h-12 w-12 rounded-full object-cover border-2 border-white" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-medium text-white border-2 border-white" style={{ backgroundColor: '#1a4a3a' }}>
                        {initials(group.authorName)}
                      </div>
                    )}
                  </div>
                  <FlameBadge active={hasUnviewed} />
                </div>
                <span className="max-w-[60px] truncate text-[10px] text-stone-500">
                  {group.authorId === fbUser.uid ? 'You' : group.authorName.split(' ')[0]}
                </span>
              </button>
            );
          })}

          {groups.length === 0 && (
            <div className="flex items-center gap-2 py-1">
              <p className="text-xs text-stone-400">No sparks yet — share a win with your network</p>
            </div>
          )}
        </div>
      </div>

      {viewerOpen && groups[activeGroupIndex] && (
        <SparkViewer groups={groups} initialGroupIndex={activeGroupIndex}
          onClose={() => setViewerOpen(false)} onReacted={loadSparks} uid={fbUser.uid} />
      )}

      <CreateSparkDialog open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={loadSparks} authorId={fbUser.uid}
        authorName={currentUser.name} authorAvatar={currentUser.avatarUrl} />
    </>
  );
}

export default SparksTray;
