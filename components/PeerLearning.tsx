/**
 * PeerLearning.tsx — Pod Peer Learning Tab
 * 
 * Architecture:
 *  - LearnFeed       → list of LearnRequests for this circle
 *  - LearnRequestCard → single request with lesson count, spark, complete
 *  - LessonPlayer    → full-screen card-swipe experience (Duolingo-style)
 *  - AddLessonSheet  → bottom sheet to add a micro-lesson in 4 formats
 *  - NewRequestSheet → bottom sheet to post a learn request
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, LearnRequest, MicroLesson, LessonFormat } from '../types';
import {
  createLearnRequest,
  fetchLearnRequests,
  completeLearnRequest,
  sparkLearnRequest,
  createMicroLesson,
  fetchMicroLessons,
  sparkMicroLesson,
} from '../lib/firestoreService';

const GREEN      = '#1a4a3a';
const GREEN_MID  = '#1a6b52';
const GREEN_LT   = '#e8f4f0';
const AMBER      = '#f59e0b';
const AMBER_LT   = '#fef3c7';

// ── Icon set (inline SVGs — no import needed) ─────────────────────────────────
const Ic = {
  Zap:      () => <svg viewBox="0 0 24 24" fill="currentColor"  className="w-full h-full"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  ZapOff:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><path d="M20 6 9 17l-5-5"/></svg>,
  Plus:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="M12 5v14M5 12h14"/></svg>,
  X:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  ChevR:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="m9 18 6-6-6-6"/></svg>,
  ChevL:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="m15 18-6-6 6-6"/></svg>,
  Text:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="M4 6h16M4 12h10M4 18h14"/></svg>,
  Video:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  Link:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  List:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="M9 12h6M9 6h6M9 18h6M4 12h.01M4 6h.01M4 18h.01"/></svg>,
  Play:     () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Star:     () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Book:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  Bulb:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>,
  Trophy:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-full h-full"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>,
};

// ── Format config ─────────────────────────────────────────────────────────────
const FORMAT_META: Record<LessonFormat, { label: string; color: string; bg: string; border: string; Icon: React.FC }> = {
  text:      { label: 'Text Tip',   color: '#1a4a3a', bg: GREEN_LT,   border: '#b6ddd2', Icon: Ic.Text },
  video:     { label: 'Video Clip', color: '#7c3aed', bg: '#f3f0ff',  border: '#c4b5fd', Icon: Ic.Video },
  link:      { label: 'Resource',   color: '#0369a1', bg: '#e0f2fe',  border: '#7dd3fc', Icon: Ic.Link },
  checklist: { label: 'Checklist',  color: '#b45309', bg: AMBER_LT,   border: '#fde68a', Icon: Ic.List },
};

// ── Small helpers ─────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

function Avatar({ user, size = 36 }: { user: User; size?: number }) {
  const [err, setErr] = useState(false);
  return (
    <img
      src={err ? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1a4a3a&color=fff&size=${size}` : user.avatarUrl}
      alt={user.name}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  );
}

// ── Spark button ──────────────────────────────────────────────────────────────
function SparkBtn({ count, sparked, onSpark }: { count: number; sparked: boolean; onSpark: () => void }) {
  const [anim, setAnim] = useState(false);
  const handle = () => {
    if (sparked) return;
    setAnim(true);
    setTimeout(() => setAnim(false), 400);
    onSpark();
  };
  return (
    <button
      onClick={handle}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-all select-none"
      style={{
        backgroundColor: sparked ? AMBER_LT : '#f5f5f4',
        color: sparked ? AMBER : '#78716c',
        border: `1.5px solid ${sparked ? AMBER : '#e7e5e4'}`,
        transform: anim ? 'scale(1.25)' : 'scale(1)',
        transition: 'transform 0.15s cubic-bezier(.34,1.56,.64,1), background 0.15s',
      }}
    >
      <span style={{ width: 13, height: 13, display: 'inline-block' }}>
        {sparked ? <Ic.Zap /> : <Ic.ZapOff />}
      </span>
      {count}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LESSON CARD (inside the swipe player)
// ─────────────────────────────────────────────────────────────────────────────
function LessonCard({
  lesson, author, currentUserId, onSpark, localSteps, onToggleStep,
}: {
  lesson: MicroLesson;
  author: User | undefined;
  currentUserId: number;
  onSpark: () => void;
  localSteps: number[];
  onToggleStep: (i: number) => void;
}) {
  const meta = FORMAT_META[lesson.format];
  const sparked = lesson.sparkedByIds.includes(currentUserId);

  return (
    <div
      className="flex flex-col h-full rounded-3xl overflow-hidden shadow-xl"
      style={{ background: '#fff', border: `2px solid ${meta.border}` }}
    >
      {/* Header strip */}
      <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0" style={{ background: meta.bg, borderBottom: `1.5px solid ${meta.border}` }}>
        <span className="flex-shrink-0" style={{ width: 18, height: 18, color: meta.color }}><meta.Icon /></span>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: meta.color }}>{meta.label}</span>
        <div className="flex-1" />
        <SparkBtn count={lesson.sparkedByIds.length} sparked={sparked} onSpark={onSpark} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {/* Text tip */}
        {lesson.format === 'text' && lesson.body && (
          <p className="text-stone-800 text-base leading-relaxed whitespace-pre-wrap">{lesson.body}</p>
        )}

        {/* Video clip */}
        {lesson.format === 'video' && (
          <div className="space-y-3">
            <div
              className="relative w-full rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer group"
              style={{ aspectRatio: '16/9', background: '#1c1917' }}
              onClick={() => lesson.videoUrl && window.open(lesson.videoUrl, '_blank')}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white/20 backdrop-blur group-hover:bg-white/30 transition-colors border border-white/30" style={{ color: 'white' }}>
                  <span style={{ width: 22, height: 22, marginLeft: 2 }}><Ic.Play /></span>
                </div>
              </div>
              {lesson.videoDurationSec && (
                <span className="absolute bottom-2 right-2 text-xs font-bold text-white bg-black/50 rounded px-1.5 py-0.5">
                  {Math.floor(lesson.videoDurationSec / 60)}:{String(lesson.videoDurationSec % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            {lesson.body && <p className="text-stone-700 text-sm leading-relaxed">{lesson.body}</p>}
          </div>
        )}

        {/* Resource link */}
        {lesson.format === 'link' && (
          <div className="space-y-3">
            <a
              href={lesson.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-4 rounded-2xl border hover:shadow-md transition-shadow"
              style={{ borderColor: meta.border, background: meta.bg }}
            >
              <span style={{ width: 22, height: 22, color: meta.color, flexShrink: 0, marginTop: 2 }}><meta.Icon /></span>
              <div className="min-w-0">
                <p className="font-bold text-sm text-stone-900 leading-snug">{lesson.linkTitle || lesson.linkUrl}</p>
                {lesson.linkDescription && <p className="text-xs text-stone-500 mt-1 leading-relaxed">{lesson.linkDescription}</p>}
                <p className="text-xs mt-1.5 truncate" style={{ color: meta.color }}>{lesson.linkUrl}</p>
              </div>
            </a>
            {lesson.body && <p className="text-stone-700 text-sm leading-relaxed">{lesson.body}</p>}
          </div>
        )}

        {/* Checklist */}
        {lesson.format === 'checklist' && lesson.steps && (
          <div className="space-y-2.5">
            {lesson.body && <p className="text-stone-700 text-sm mb-3 leading-relaxed">{lesson.body}</p>}
            {lesson.steps.map((step, i) => {
              const done = localSteps.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => onToggleStep(i)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: done ? meta.border : '#e7e5e4',
                    background: done ? meta.bg : 'white',
                  }}
                >
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all"
                    style={{
                      borderColor: done ? meta.color : '#d6d3d1',
                      background: done ? meta.color : 'white',
                      color: 'white',
                    }}
                  >
                    {done && <span style={{ width: 11, height: 11 }}><Ic.Check /></span>}
                  </div>
                  <p className={`text-sm leading-snug ${done ? 'line-through text-stone-400' : 'text-stone-800'}`}>{step}</p>
                </button>
              );
            })}
            <p className="text-xs text-stone-400 text-right pt-1">
              {localSteps.length}/{lesson.steps.length} steps done
            </p>
          </div>
        )}
      </div>

      {/* Author footer */}
      <div className="flex items-center gap-2.5 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: '#f5f5f4' }}>
        {author && <Avatar user={author} size={28} />}
        <div>
          <p className="text-xs font-semibold text-stone-800">{author?.name ?? 'Someone'}</p>
          <p className="text-xs text-stone-400">{timeAgo(lesson.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LESSON PLAYER (full-screen card swiper)
// ─────────────────────────────────────────────────────────────────────────────
function LessonPlayer({
  request, lessons, allUsers, currentUser,
  onClose, onSpark, onComplete, onAddLesson,
}: {
  request: LearnRequest;
  lessons: MicroLesson[];
  allUsers: User[];
  currentUser: User;
  onClose: () => void;
  onSpark: (lessonId: string) => void;
  onComplete: () => void;
  onAddLesson: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [localSparked, setLocalSparked] = useState<Set<string>>(new Set());
  const [localSteps, setLocalSteps] = useState<Record<string, number[]>>({});
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = lessons.length;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;

  const go = (dir: 1 | -1) => setIdx(i => Math.max(0, Math.min(total - 1, i + dir)));

  // Touch/mouse drag
  const onDragStart = (x: number) => setDragStart(x);
  const onDragMove  = (x: number) => dragStart !== null && setDragDelta(x - dragStart);
  const onDragEnd   = () => {
    if (Math.abs(dragDelta) > 60) go(dragDelta < 0 ? 1 : -1);
    setDragStart(null);
    setDragDelta(0);
  };

  const handleSpark = (lesson: MicroLesson) => {
    if (localSparked.has(lesson.id) || lesson.sparkedByIds.includes(currentUser.id)) return;
    setLocalSparked(s => new Set(s).add(lesson.id));
    // optimistic UI: mutate local copy
    lesson.sparkedByIds = [...lesson.sparkedByIds, currentUser.id];
    onSpark(lesson.id);
  };

  const handleToggleStep = (lessonId: string, stepIdx: number) => {
    setLocalSteps(prev => {
      const existing = prev[lessonId] ?? [];
      const updated = existing.includes(stepIdx)
        ? existing.filter(i => i !== stepIdx)
        : [...existing, stepIdx];
      return { ...prev, [lessonId]: updated };
    });
  };

  const curLesson = lessons[idx];
  const author = curLesson ? allUsers.find(u => u.id === curLesson.authorId) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#f5f5f4' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: '#e7e5e4' }}>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-stone-100 transition-colors" style={{ width: 36, height: 36 }}>
          <span style={{ width: 20, height: 20, display: 'block', color: '#78716c' }}><Ic.X /></span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-stone-900 text-sm truncate">{request.skill}</p>
          <p className="text-xs text-stone-400">{total} lesson{total !== 1 ? 's' : ''}</p>
        </div>
        {request.status === 'open' && currentUser.id === request.authorId && (
          <button
            onClick={onComplete}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
            style={{ background: GREEN }}
          >
            <span style={{ width: 14, height: 14 }}><Ic.Trophy /></span>
            Got it!
          </button>
        )}
      </div>

      {/* Progress dots */}
      {total > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-3 flex-shrink-0">
          {lessons.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className="rounded-full transition-all"
              style={{
                width: i === idx ? 24 : 8,
                height: 8,
                background: i === idx ? GREEN : (i < idx ? GREEN_LT : '#e7e5e4'),
              }}
            />
          ))}
        </div>
      )}

      {/* Card area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden px-4 pb-2 select-none"
        onMouseDown={e => onDragStart(e.clientX)}
        onMouseMove={e => dragStart !== null && onDragMove(e.clientX)}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={e => onDragStart(e.touches[0].clientX)}
        onTouchMove={e => onDragMove(e.touches[0].clientX)}
        onTouchEnd={onDragEnd}
      >
        {total === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GREEN_LT }}>
              <span style={{ width: 32, height: 32, color: GREEN }}><Ic.Bulb /></span>
            </div>
            <p className="font-bold text-stone-900 text-lg">No lessons yet</p>
            <p className="text-stone-500 text-sm max-w-xs">Be the first to share a micro-lesson with the pod!</p>
            <button
              onClick={onAddLesson}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
              style={{ background: GREEN }}
            >
              <span style={{ width: 16, height: 16 }}><Ic.Plus /></span>
              Add a lesson
            </button>
          </div>
        ) : (
          <div
            className="h-full transition-transform"
            style={{ transform: `translateX(${dragDelta * 0.4}px)` }}
          >
            {curLesson && (
              <LessonCard
                lesson={curLesson}
                author={author}
                currentUserId={currentUser.id}
                onSpark={() => handleSpark(curLesson)}
                localSteps={localSteps[curLesson.id] ?? []}
                onToggleStep={i => handleToggleStep(curLesson.id, i)}
              />
            )}
          </div>
        )}
      </div>

      {/* Nav row */}
      {total > 0 && (
        <div className="flex items-center justify-between px-4 pb-4 pt-1 flex-shrink-0">
          <button
            onClick={() => go(-1)}
            disabled={!hasPrev}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold border transition-all disabled:opacity-30"
            style={{ borderColor: '#e7e5e4', color: '#1c1917', background: 'white' }}
          >
            <span style={{ width: 16, height: 16 }}><Ic.ChevL /></span> Prev
          </button>

          <button
            onClick={onAddLesson}
            className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold text-white hover:opacity-90"
            style={{ background: GREEN }}
          >
            <span style={{ width: 14, height: 14 }}><Ic.Plus /></span>
            Add lesson
          </button>

          <button
            onClick={() => go(1)}
            disabled={!hasNext}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold border transition-all disabled:opacity-30"
            style={{ borderColor: '#e7e5e4', color: '#1c1917', background: 'white' }}
          >
            Next <span style={{ width: 16, height: 16 }}><Ic.ChevR /></span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD LESSON SHEET
// ─────────────────────────────────────────────────────────────────────────────
function AddLessonSheet({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: Partial<MicroLesson>) => Promise<void>;
}) {
  const [format, setFormat] = useState<LessonFormat>('text');
  const [body, setBody] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDesc, setLinkDesc] = useState('');
  const [steps, setSteps] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);

  const addStep = () => setSteps(s => [...s, '']);
  const updateStep = (i: number, v: string) => setSteps(s => s.map((x, j) => j === i ? v : x));
  const removeStep = (i: number) => setSteps(s => s.filter((_, j) => j !== i));

  const canSubmit = () => {
    if (format === 'text') return body.trim().length > 0;
    if (format === 'video') return videoUrl.trim().length > 0;
    if (format === 'link') return linkUrl.trim().length > 0;
    if (format === 'checklist') return steps.some(s => s.trim().length > 0);
    return false;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setBusy(true);
    try {
      const data: Partial<MicroLesson> = { format, body: body || undefined };
      if (format === 'video') {
        data.videoUrl = videoUrl;
        data.videoDurationSec = videoDuration ? parseInt(videoDuration) : undefined;
      }
      if (format === 'link') {
        data.linkUrl = linkUrl;
        data.linkTitle = linkTitle || linkUrl;
        data.linkDescription = linkDesc || undefined;
      }
      if (format === 'checklist') {
        data.steps = steps.filter(s => s.trim().length > 0);
      }
      await onSubmit(data);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-800 focus:outline-none focus:ring-2 placeholder:text-stone-400";
  const inputFocus = { '--tw-ring-color': GREEN } as any;

  return (
    <div className="fixed inset-0 z-60 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>
        <div className="px-5 pb-6 space-y-4">
          <h2 className="font-black text-stone-900 text-lg">Add a micro-lesson</h2>

          {/* Format picker */}
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(FORMAT_META) as [LessonFormat, typeof FORMAT_META['text']][]).map(([f, meta]) => {
              const active = f === format;
              return (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all"
                  style={{
                    borderColor: active ? meta.color : '#e7e5e4',
                    background: active ? meta.bg : 'white',
                  }}
                >
                  <span style={{ width: 20, height: 20, color: active ? meta.color : '#78716c' }}><meta.Icon /></span>
                  <span className="text-xs font-bold" style={{ color: active ? meta.color : '#78716c' }}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* Format-specific fields */}
          {format === 'text' && (
            <textarea
              className={inputCls}
              style={inputFocus}
              rows={5}
              placeholder="Share your tip, insight or technique..."
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          )}

          {format === 'video' && (
            <div className="space-y-3">
              <input className={inputCls} style={inputFocus} placeholder="Video URL (YouTube, Loom, etc.)" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
              <input className={inputCls} style={inputFocus} placeholder="Duration in seconds (optional)" type="number" value={videoDuration} onChange={e => setVideoDuration(e.target.value)} />
              <textarea className={inputCls} style={inputFocus} rows={3} placeholder="Optional context or summary..." value={body} onChange={e => setBody(e.target.value)} />
            </div>
          )}

          {format === 'link' && (
            <div className="space-y-3">
              <input className={inputCls} style={inputFocus} placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
              <input className={inputCls} style={inputFocus} placeholder="Title (optional)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} />
              <textarea className={inputCls} style={inputFocus} rows={2} placeholder="Why is this helpful?" value={linkDesc} onChange={e => setLinkDesc(e.target.value)} />
            </div>
          )}

          {format === 'checklist' && (
            <div className="space-y-3">
              <textarea className={inputCls} style={inputFocus} rows={2} placeholder="Intro text (optional)" value={body} onChange={e => setBody(e.target.value)} />
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-400 w-5 text-center">{i + 1}</span>
                    <input
                      className={`${inputCls} flex-1`}
                      style={inputFocus}
                      placeholder={`Step ${i + 1}`}
                      value={step}
                      onChange={e => updateStep(i, e.target.value)}
                    />
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(i)} className="p-1 text-stone-300 hover:text-red-400">
                        <span style={{ width: 14, height: 14, display: 'block' }}><Ic.X /></span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addStep} className="text-xs font-semibold flex items-center gap-1" style={{ color: GREEN }}>
                <span style={{ width: 14, height: 14 }}><Ic.Plus /></span> Add step
              </button>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit() || busy}
            className="w-full py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ background: GREEN }}
          >
            {busy ? 'Publishing…' : 'Publish lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW REQUEST SHEET
// ─────────────────────────────────────────────────────────────────────────────
function NewRequestSheet({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (skill: string, context: string) => Promise<void>;
}) {
  const [skill, setSkill] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!skill.trim()) return;
    setBusy(true);
    try { await onSubmit(skill.trim(), context.trim()); onClose(); }
    finally { setBusy(false); }
  };

  const inputCls = "w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-800 focus:outline-none focus:ring-2 placeholder:text-stone-400";

  return (
    <div className="fixed inset-0 z-60 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-t-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-stone-200" /></div>
        <div className="px-5 pb-8 space-y-4">
          <div>
            <h2 className="font-black text-stone-900 text-lg">Post a Learn Request</h2>
            <p className="text-stone-500 text-sm mt-0.5">Ask pod members to teach you something</p>
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">What do you want to learn?</label>
            <input
              className={inputCls}
              placeholder="e.g. How do I give better design feedback?"
              value={skill}
              onChange={e => setSkill(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Context / goals <span className="font-normal normal-case">(optional)</span></label>
            <textarea
              className={inputCls}
              rows={3}
              placeholder="Share why you want to learn this or what you've already tried..."
              value={context}
              onChange={e => setContext(e.target.value)}
            />
          </div>
          <button
            onClick={handle}
            disabled={!skill.trim() || busy}
            className="w-full py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ background: GREEN }}
          >
            {busy ? 'Posting…' : 'Post request'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEARN REQUEST CARD (in the feed)
// ─────────────────────────────────────────────────────────────────────────────
function LearnRequestCard({
  req, author, currentUser, onOpen, onSpark,
}: {
  req: LearnRequest;
  author: User | undefined;
  currentUser: User;
  onOpen: () => void;
  onSpark: () => void;
}) {
  const sparked = req.sparkedByIds.includes(currentUser.id);
  const done = req.status === 'complete';

  return (
    <div
      className="bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderColor: done ? '#b6ddd2' : '#e7e5e4' }}
    >
      {done && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold" style={{ background: GREEN_LT, color: GREEN }}>
          <span style={{ width: 14, height: 14 }}><Ic.Trophy /></span>
          Learned! · {req.lessonCount} lesson{req.lessonCount !== 1 ? 's' : ''} helped
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {author && <Avatar user={author} size={38} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-stone-900 text-sm">{author?.name ?? 'Someone'}</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: GREEN_LT, color: GREEN }}>
                Wants to learn
              </span>
              {!done && <span className="text-xs text-stone-400">{timeAgo(req.createdAt)}</span>}
            </div>
            <p className="font-black text-stone-900 text-base mt-1 leading-snug">{req.skill}</p>
            {req.context && (
              <p className="text-stone-500 text-sm mt-1 leading-relaxed line-clamp-2">{req.context}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: '#f5f5f4' }}>
          <SparkBtn count={req.sparkedByIds.length} sparked={sparked} onSpark={onSpark} />

          <button
            onClick={onOpen}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all hover:shadow-sm"
            style={{ borderColor: '#e7e5e4', color: '#1c1917', background: 'white' }}
          >
            <span style={{ width: 14, height: 14, color: GREEN }}><Ic.Book /></span>
            {req.lessonCount === 0 ? 'Be first to teach' : `${req.lessonCount} lesson${req.lessonCount !== 1 ? 's' : ''}`}
            <span style={{ width: 14, height: 14, color: '#78716c' }}><Ic.ChevR /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface PeerLearningProps {
  circleId: number;
  allUsers: User[];
  currentUser: User;
}

type PlayerState = { request: LearnRequest; lessons: MicroLesson[] } | null;

const PeerLearning: React.FC<PeerLearningProps> = ({ circleId, allUsers, currentUser }) => {
  const [requests, setRequests]   = useState<LearnRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showNewReq, setShowNewReq] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>(null);
  const [addLessonCtx, setAddLessonCtx] = useState<LearnRequest | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'complete'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reqs = await fetchLearnRequests(circleId);
      setRequests(reqs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  useEffect(() => { load(); }, [load]);

  const handleNewRequest = async (skill: string, context: string) => {
    const req = await createLearnRequest({ circleId, authorId: currentUser.id, skill, context: context || undefined });
    setRequests(r => [req, ...r]);
  };

  const handleOpenPlayer = async (req: LearnRequest) => {
    const lessons = await fetchMicroLessons(req.id);
    setPlayerState({ request: req, lessons });
  };

  const handleAddLesson = (req: LearnRequest) => {
    setAddLessonCtx(req);
    if (playerState) setPlayerState(null); // close player to show sheet
  };

  const handleSubmitLesson = async (data: Partial<MicroLesson>) => {
    if (!addLessonCtx) return;
    const lesson = await createMicroLesson({
      requestId: addLessonCtx.id,
      circleId,
      authorId: currentUser.id,
      format: data.format!,
      body: data.body,
      videoUrl: data.videoUrl,
      videoDurationSec: data.videoDurationSec,
      linkUrl: data.linkUrl,
      linkTitle: data.linkTitle,
      linkDescription: data.linkDescription,
      steps: data.steps,
    });
    setRequests(r => r.map(rr => rr.id === addLessonCtx.id ? { ...rr, lessonCount: rr.lessonCount + 1 } : rr));
    if (playerState?.request.id === addLessonCtx.id) {
      setPlayerState(ps => ps ? { ...ps, lessons: [...ps.lessons, lesson] } : null);
    }
    setAddLessonCtx(null);
  };

  const handleSparkRequest = async (req: LearnRequest) => {
    if (req.sparkedByIds.includes(currentUser.id)) return;
    await sparkLearnRequest(req.id, currentUser.id);
    setRequests(r => r.map(rr => rr.id === req.id ? { ...rr, sparkedByIds: [...rr.sparkedByIds, currentUser.id] } : rr));
  };

  const handleSparkLesson = async (lessonId: string) => {
    await sparkMicroLesson(lessonId, currentUser.id);
  };

  const handleComplete = async () => {
    if (!playerState) return;
    await completeLearnRequest(playerState.request.id);
    setRequests(r => r.map(rr => rr.id === playerState.request.id ? { ...rr, status: 'complete' } : rr));
    setPlayerState(ps => ps ? { ...ps, request: { ...ps.request, status: 'complete' } } : null);
  };

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const openCount = requests.filter(r => r.status === 'open').length;
  const doneCount = requests.filter(r => r.status === 'complete').length;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ width: 22, height: 22, color: GREEN }}><Ic.Bulb /></span>
            <h2 className="font-black text-stone-900 text-lg">Peer Learning</h2>
          </div>
          <button
            onClick={() => setShowNewReq(true)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            style={{ background: GREEN }}
          >
            <span style={{ width: 16, height: 16 }}><Ic.Plus /></span>
            Ask to learn
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Open requests', value: openCount, color: GREEN, bg: GREEN_LT },
            { label: 'Completed', value: doneCount, color: '#b45309', bg: AMBER_LT },
            { label: 'Total lessons', value: requests.reduce((s, r) => s + r.lessonCount, 0), color: '#0369a1', bg: '#e0f2fe' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl border p-3 text-center" style={{ borderColor: stat.bg, background: stat.bg }}>
              <p className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs font-medium text-stone-500 leading-tight mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 rounded-2xl bg-stone-100">
          {(['all', 'open', 'complete'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex-1 py-1.5 rounded-xl text-xs font-bold capitalize transition-all"
              style={{
                background: filter === f ? 'white' : 'transparent',
                color: filter === f ? '#1c1917' : '#78716c',
                boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {f === 'complete' ? 'Completed' : f === 'open' ? 'Open' : 'All'}
            </button>
          ))}
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: GREEN, borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center gap-3 bg-white rounded-2xl border" style={{ borderColor: '#e7e5e4' }}>
            <span style={{ width: 40, height: 40, color: '#d6d3d1' }}><Ic.Bulb /></span>
            <p className="font-bold text-stone-600">No {filter !== 'all' ? filter : ''} learn requests yet</p>
            <p className="text-stone-400 text-sm max-w-xs">Pod members can ask each other to share bite-sized lessons on any skill.</p>
            <button
              onClick={() => setShowNewReq(true)}
              className="mt-1 text-sm font-bold hover:opacity-70"
              style={{ color: GREEN }}
            >
              Post the first request →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(req => (
              <LearnRequestCard
                key={req.id}
                req={req}
                author={allUsers.find(u => u.id === req.authorId)}
                currentUser={currentUser}
                onOpen={() => handleOpenPlayer(req)}
                onSpark={() => handleSparkRequest(req)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lesson Player overlay */}
      {playerState && (
        <LessonPlayer
          request={playerState.request}
          lessons={playerState.lessons}
          allUsers={allUsers}
          currentUser={currentUser}
          onClose={() => setPlayerState(null)}
          onSpark={handleSparkLesson}
          onComplete={handleComplete}
          onAddLesson={() => { setAddLessonCtx(playerState.request); setPlayerState(null); }}
        />
      )}

      {/* Add Lesson Sheet */}
      {addLessonCtx && (
        <AddLessonSheet
          onClose={() => setAddLessonCtx(null)}
          onSubmit={handleSubmitLesson}
        />
      )}

      {/* New Request Sheet */}
      {showNewReq && (
        <NewRequestSheet
          onClose={() => setShowNewReq(false)}
          onSubmit={handleNewRequest}
        />
      )}
    </>
  );
};

export default PeerLearning;
