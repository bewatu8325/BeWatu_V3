/**
 * components/profile/LearningLog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 3 — "Persistent build-in-public learning log"
 *
 * Sits between ephemeral Sparks (48h) and full Arena submissions (high effort).
 * A medium-format, PERSISTENT weekly entry: "what I built, what broke, what I'd
 * do differently." Over time it becomes a searchable trail of judgment — the
 * compounding public asset the research recommends.
 *
 * Includes a gentle weekly cadence mechanic (streak) — cadence is the point.
 *
 * Public read (it's a proof surface), owner write. Persistent.
 * Firestore: learningLogs/{id}
 *
 * Matches design language: white rounded-2xl card, #1a4a3a green, stone palette.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import {
  collection, query, where, orderBy, getDocs,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

const GREEN = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

interface LogEntry {
  id: string;
  authorUid: string;
  built: string;
  broke: string;
  next: string;
  createdAt?: any;
  createdMs?: number; // client mirror for streak math
}

interface Props {
  profileUid: string;
  isOwn: boolean;
  authorName?: string;
}

// ── Streak helpers ──────────────────────────────────────────────────────────
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weekIndex(ms: number): number {
  return Math.floor(ms / WEEK_MS);
}

/** Count consecutive weeks (including current or last) with at least one entry. */
function computeStreak(entries: LogEntry[]): number {
  if (entries.length === 0) return 0;
  const weeks = new Set(entries.map(e => weekIndex(e.createdMs ?? e.createdAt?.toDate?.()?.getTime?.() ?? 0)));
  const current = weekIndex(Date.now());
  let streak = 0;
  // Allow the streak to count from this week or last week (grace for not-yet-posted week)
  let cursor = weeks.has(current) ? current : current - 1;
  while (weeks.has(cursor)) { streak++; cursor--; }
  return streak;
}

function postedThisWeek(entries: LogEntry[]): boolean {
  const current = weekIndex(Date.now());
  return entries.some(e => weekIndex(e.createdMs ?? e.createdAt?.toDate?.()?.getTime?.() ?? 0) === current);
}

function timeAgo(ms?: number): string {
  if (!ms) return '';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(ms).toLocaleDateString();
}

const LearningLog: React.FC<Props> = ({ profileUid, isOwn }) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  async function load() {
    try {
      const snap = await getDocs(query(
        collection(db, 'learningLogs'),
        where('authorUid', '==', profileUid),
        orderBy('createdAt', 'desc')
      ));
      setEntries(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, ...data, createdMs: data.createdAt?.toDate?.()?.getTime?.() } as LogEntry;
      }));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [profileUid]);

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, 'learningLogs', id)).catch(() => {});
    setEntries(e => e.filter(x => x.id !== id));
  }

  if (loading) return null;
  if (!isOwn && entries.length === 0) return null;

  const streak = computeStreak(entries);
  const posted = postedThisWeek(entries);

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: GREEN }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-stone-900 text-sm">Learning Log</h3>
            <p className="text-xs text-stone-400">What you built, what broke, what's next</p>
          </div>
        </div>
        {isOwn && (
          <button onClick={() => setComposerOpen(true)}
            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Log
          </button>
        )}
      </div>

      {/* Streak strip (own profile only, once there's at least one entry) */}
      {isOwn && entries.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-4" style={{ backgroundColor: posted ? GREEN_LT : '#fafaf9' }}>
          <span className="text-base">{streak > 0 ? '🔥' : '🌱'}</span>
          <div className="flex-1 min-w-0">
            {streak > 0 ? (
              <p className="text-sm font-semibold" style={{ color: '#1a6b52' }}>
                {streak}-week streak{posted ? '' : ' · log this week to keep it going'}
              </p>
            ) : (
              <p className="text-sm font-medium text-stone-600">Start a weekly habit — small entries compound</p>
            )}
          </div>
          {!posted && (
            <button onClick={() => setComposerOpen(true)} className="text-xs font-bold flex-shrink-0 hover:opacity-80" style={{ color: '#1a6b52' }}>
              Log now →
            </button>
          )}
        </div>
      )}

      {/* Empty state (own only) */}
      {entries.length === 0 ? (
        <button onClick={() => setComposerOpen(true)}
          className="w-full text-left rounded-xl border border-dashed p-4 hover:bg-stone-50 transition-colors" style={{ borderColor: '#d6d3d1' }}>
          <p className="text-sm font-medium text-stone-600">Write your first log entry</p>
          <p className="text-xs text-stone-400 mt-1">A weekly note on what you're building turns your learning curve into a public, searchable asset. Unlike Sparks, these don't expire.</p>
        </button>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <div key={entry.id} className="rounded-xl border p-4" style={{ borderColor: '#e7e5e4' }}>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-medium text-stone-400">{timeAgo(entry.createdMs)}</span>
                {isOwn && (
                  <button onClick={() => handleDelete(entry.id)} className="text-stone-300 hover:text-red-500">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                )}
              </div>
              <LogField label="Built" color="#1a6b52" text={entry.built} />
              {entry.broke && <LogField label="Broke" color="#c2410c" text={entry.broke} />}
              {entry.next && <LogField label="Next time" color="#6d28d9" text={entry.next} />}
            </div>
          ))}
        </div>
      )}

      {composerOpen && (
        <LogComposer
          authorUid={profileUid}
          onClose={() => setComposerOpen(false)}
          onSaved={() => { setComposerOpen(false); setLoading(true); load(); }}
        />
      )}
    </div>
  );
};

function LogField({ label, color, text }: { label: string; color: string; text: string }) {
  return (
    <div className="mb-2 last:mb-0">
      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function LogComposer({ authorUid, onClose, onSaved }: {
  authorUid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [built, setBuilt] = useState('');
  const [broke, setBroke] = useState('');
  const [next, setNext]   = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!built.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'learningLogs'), {
        authorUid,
        built: built.trim(),
        broke: broke.trim(),
        next: next.trim(),
        createdAt: serverTimestamp(),
      });
      onSaved();
    } catch (err) {
      console.error('save log failed', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#e7e5e4' }}>
          <div>
            <h2 className="font-bold text-stone-900">Weekly log</h2>
            <p className="text-xs text-stone-400">Short is fine. Consistency beats length.</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: '#1a6b52' }}>What I built <span className="text-stone-400 font-normal">· required</span></label>
            <textarea value={built} onChange={e => setBuilt(e.target.value)} rows={2} autoFocus
              placeholder="The thing you shipped or made progress on this week"
              className="w-full resize-none rounded-xl border bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: '#c2410c' }}>What broke</label>
            <textarea value={broke} onChange={e => setBroke(e.target.value)} rows={2}
              placeholder="What went wrong, what surprised you, where you got stuck"
              className="w-full resize-none rounded-xl border bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: '#6d28d9' }}>What I'd do differently</label>
            <textarea value={next} onChange={e => setNext(e.target.value)} rows={2}
              placeholder="The judgment you'll carry into next week"
              className="w-full resize-none rounded-xl border bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
          </div>
          <button onClick={handleSave} disabled={saving || !built.trim()}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition" style={{ backgroundColor: GREEN }}>
            {saving ? 'Saving…' : 'Post entry'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LearningLog;
