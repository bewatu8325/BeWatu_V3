/**
 * ReelVibe.tsx
 * TikTok-style vertical reel feed for 30-second professional skill showcases.
 * Users upload short videos demonstrating skills, projects, or achievements.
 *
 * Features:
 *  - Vertical scroll feed (snap-scroll)
 *  - Upload with progress bar, caption, skill tag, duration guard
 *  - Like / view count
 *  - Profile attribution
 *  - Filter by skill
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart, Play, Eye, Upload, X, Plus, Loader2, ChevronUp, ChevronDown,
  Volume2, VolumeX, Zap, Tag,
} from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  createReelVibe,
  getReelVibes,
  toggleReelLike,
  incrementReelView,
  deleteReelVibe,
  type ReelVibe,
} from '../lib/firestoreService';
import { uploadReelVibe } from '../lib/storageService';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

// ─── Duration validation ──────────────────────────────────────────────────────
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { resolve(video.duration); URL.revokeObjectURL(video.src); };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

// ─── Upload Sheet ─────────────────────────────────────────────────────────────
function UploadSheet({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const { currentUser, fbUser } = useFirebase();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [caption, setCaption] = useState('');
  const [skill, setSkill] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(f: File) {
    if (!f.type.startsWith('video/')) { setError('Please select a video file.'); return; }
    const dur = await getVideoDuration(f);
    if (dur > 35) { setError(`Video is ${Math.round(dur)}s — please trim it to 30 seconds or less.`); return; }
    setError('');
    setFile(f);
    setDuration(dur);
    setPreview(URL.createObjectURL(f));
  }

  function addTag() {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags(p => [...p, t]);
    setTagInput('');
  }

  async function handleUpload() {
    if (!fbUser || !currentUser || !file || !caption.trim() || !skill.trim()) {
      setError('Please fill in caption and primary skill.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const videoUrl = await uploadReelVibe(fbUser.uid, file, setProgress);
      await createReelVibe({
        authorUid: fbUser.uid,
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatarUrl,
        authorHeadline: currentUser.headline,
        videoUrl,
        caption: caption.trim(),
        skill: skill.trim(),
        tags,
      });
      onUploaded();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-12 h-1 rounded-full bg-stone-200" />
        </div>
        <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: '#e7e5e4' }}>
          <div className="flex-1">
            <h2 className="font-black text-stone-900 text-base">Upload a Reel Vibe</h2>
            <p className="text-xs text-stone-400">30-second skill showcase · mp4, mov, webm</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100"><X className="w-4 h-4 text-stone-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
          )}

          {/* Drop zone / preview */}
          {!file ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors hover:bg-stone-50"
              style={{ borderColor: '#d1d5db' }}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: GREEN_LT }}>
                <Upload className="w-7 h-7" style={{ color: GREEN }} />
              </div>
              <div className="text-center">
                <p className="font-bold text-stone-700">Tap to select your reel</p>
                <p className="text-xs text-stone-400 mt-1">Max 30 seconds · mp4, mov, webm</p>
              </div>
            </button>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
              <video src={preview!} className="w-full h-full object-contain" controls playsInline />
              <div className="absolute top-2 right-2 flex gap-2">
                <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white bg-black/70">
                  {Math.round(duration)}s
                </span>
                <button
                  onClick={() => { setFile(null); setPreview(null); setDuration(0); }}
                  className="rounded-full p-1 bg-black/70 text-white hover:bg-black/90"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {/* Caption */}
          <div>
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Caption</label>
            <textarea
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 resize-none"
              rows={2}
              placeholder="What skill or achievement are you showcasing?"
              maxLength={150}
              value={caption}
              onChange={e => setCaption(e.target.value)}
            />
            <p className="text-[10px] text-stone-300 text-right mt-0.5">{caption.length}/150</p>
          </div>

          {/* Primary skill */}
          <div>
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
              Primary skill <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Zap className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
              <input
                className="w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                placeholder="e.g. React, UX Design, Data Analysis"
                value={skill}
                onChange={e => setSkill(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1.5">Tags</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 pl-8 pr-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                  placeholder="portfolio, frontend, demo…"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTag())}
                />
              </div>
              <button
                onClick={addTag}
                className="px-3 rounded-xl text-white flex-shrink-0"
                style={{ background: GREEN }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: GREEN_LT, color: GREEN }}>
                    #{t}
                    <button onClick={() => setTags(p => p.filter(x => x !== t))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Progress bar */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-stone-500">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: GREEN }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-8 pt-3 border-t flex-shrink-0" style={{ borderColor: '#f5f5f4' }}>
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !caption.trim() || !skill.trim()}
            className="w-full py-3 rounded-2xl font-black text-white text-sm hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
            style={{ background: GREEN }}
          >
            {uploading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              : <><Play className="w-4 h-4 fill-white" /> Post Reel Vibe</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single Reel Card ─────────────────────────────────────────────────────────
function ReelCard({
  reel,
  isActive,
  currentUid,
  onLike,
  onDelete,
  onViewProfile,
}: {
  reel: ReelVibe;
  isActive: boolean;
  currentUid?: string;
  onLike: (id: string) => void;
  onDelete?: (id: string) => void;
  onViewProfile?: (id: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [viewed, setViewed] = useState(false);
  const [localLiked, setLocalLiked] = useState(currentUid ? reel.likedByUids.includes(currentUid) : false);
  const [likeCount, setLikeCount] = useState(reel.likedByUids.length);

  useEffect(() => {
    if (isActive) {
      videoRef.current?.play().catch(() => {});
      if (!viewed) {
        setViewed(true);
        incrementReelView(reel.id).catch(() => {});
      }
    } else {
      videoRef.current?.pause();
    }
  }, [isActive]);

  function handleLike() {
    if (!currentUid) return;
    setLocalLiked(l => !l);
    setLikeCount(c => localLiked ? c - 1 : c + 1);
    onLike(reel.id);
  }

  const isOwner = currentUid === reel.authorUid;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {/* Video */}
      <video
        ref={videoRef}
        src={reel.videoUrl}
        className="w-full h-full object-cover"
        loop
        playsInline
        muted={muted}
        onClick={() => isActive && (videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause())}
        style={{ cursor: 'pointer' }}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)' }}
      />

      {/* Top controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => setMuted(m => !m)}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
        {/* Author */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onViewProfile?.(reel.authorId)}
            className="flex-shrink-0"
          >
            <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden flex items-center justify-center text-sm font-black text-white" style={{ background: GREEN }}>
              {reel.authorAvatar
                ? <img src={reel.authorAvatar} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                : reel.authorName[0]}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={() => onViewProfile?.(reel.authorId)} className="block">
              <p className="font-black text-white text-sm">{reel.authorName}</p>
            </button>
            <p className="text-xs text-white/70 truncate">{reel.authorHeadline}</p>
          </div>
          {isOwner && onDelete && (
            <button
              onClick={() => onDelete(reel.id)}
              className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white/70 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Caption + skill */}
        <div className="space-y-1.5">
          <p className="text-white text-sm leading-snug">{reel.caption}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
              <Zap className="w-3 h-3 text-amber-300" />{reel.skill}
            </span>
            {reel.tags.slice(0, 3).map(t => (
              <span key={t} className="rounded-full px-2 py-0.5 text-xs text-white/70" style={{ background: 'rgba(255,255,255,0.1)' }}>
                #{t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right-side actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        {/* Like */}
        <button
          onClick={handleLike}
          className="flex flex-col items-center gap-1"
          style={{ opacity: currentUid ? 1 : 0.5 }}
        >
          <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform active:scale-90 ${localLiked ? 'scale-110' : ''}`}
            style={{ background: localLiked ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.4)' }}>
            <Heart className={`w-5 h-5 transition-colors ${localLiked ? 'text-red-400 fill-red-400' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-bold">{likeCount}</span>
        </button>

        {/* Views */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
            <Eye className="w-5 h-5 text-white/80" />
          </div>
          <span className="text-white text-xs font-bold">{reel.viewCount}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ReelVibe Feed ───────────────────────────────────────────────────────
interface ReelVibeProps {
  onViewProfile?: (userId: number) => void;
}

export function ReelVibeFeed({ onViewProfile }: ReelVibeProps) {
  const { currentUser, fbUser } = useFirebase();
  const [reels, setReels] = useState<ReelVibe[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadReels() {
    setLoading(true);
    try { setReels(await getReelVibes(30)); }
    catch { setReels([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadReels(); }, []);

  // Snap scroll → update active index
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setActiveIndex(idx);
  }, []);

  function scrollTo(idx: number) {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: idx * el.clientHeight, behavior: 'smooth' });
  }

  async function handleLike(id: string) {
    if (!fbUser) return;
    await toggleReelLike(id, fbUser.uid).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this reel?')) return;
    await deleteReelVibe(id).catch(() => {});
    loadReels();
  }

  const filteredReels = skillFilter
    ? reels.filter(r => r.skill.toLowerCase().includes(skillFilter.toLowerCase()) || r.tags.some(t => t.toLowerCase().includes(skillFilter.toLowerCase())))
    : reels;

  // Extract all unique skills for filter
  const allSkills = [...new Set(reels.map(r => r.skill))].slice(0, 8);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[800px] bg-black rounded-2xl overflow-hidden relative">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-2" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
        <div>
          <h2 className="font-black text-white text-lg tracking-tight">Reel Vibes</h2>
          <p className="text-xs text-white/60">30-second skill showcases</p>
        </div>
        {fbUser && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition-colors"
            style={{ background: GREEN }}
          >
            <Plus className="w-4 h-4" /> Upload
          </button>
        )}
      </div>

      {/* Skill filter pills */}
      {allSkills.length > 0 && (
        <div
          className="absolute top-16 left-0 right-0 z-20 flex gap-1.5 px-4 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none' }}
        >
          <button
            onClick={() => setSkillFilter('')}
            className="rounded-full px-3 py-1 text-xs font-bold flex-shrink-0 transition-all"
            style={{ background: !skillFilter ? 'white' : 'rgba(255,255,255,0.2)', color: !skillFilter ? '#1c1917' : 'white' }}
          >
            All
          </button>
          {allSkills.map(s => (
            <button
              key={s}
              onClick={() => setSkillFilter(skillFilter === s ? '' : s)}
              className="rounded-full px-3 py-1 text-xs font-bold flex-shrink-0 transition-all"
              style={{ background: skillFilter === s ? 'white' : 'rgba(255,255,255,0.2)', color: skillFilter === s ? '#1c1917' : 'white' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-white/50" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredReels.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <Play className="w-8 h-8 text-white/50 fill-white/30" />
          </div>
          <div>
            <p className="font-black text-white text-lg">No reels yet</p>
            <p className="text-white/50 text-sm mt-1">
              {skillFilter ? `No reels for "${skillFilter}"` : 'Be the first to post a 30-second skill showcase'}
            </p>
          </div>
          {fbUser && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 rounded-2xl px-6 py-3 font-bold text-white text-sm"
              style={{ background: GREEN }}
            >
              <Upload className="w-4 h-4" /> Upload your reel
            </button>
          )}
        </div>
      )}

      {/* Vertical snap scroll feed */}
      {!loading && filteredReels.length > 0 && (
        <>
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-scroll snap-y snap-mandatory"
            style={{ scrollbarWidth: 'none' }}
          >
            {filteredReels.map((reel, i) => (
              <div key={reel.id} className="w-full h-full snap-start snap-always flex-shrink-0" style={{ height: '100%' }}>
                <ReelCard
                  reel={reel}
                  isActive={i === activeIndex}
                  currentUid={fbUser?.uid}
                  onLike={handleLike}
                  onDelete={fbUser?.uid === reel.authorUid ? handleDelete : undefined}
                  onViewProfile={onViewProfile}
                />
              </div>
            ))}
          </div>

          {/* Navigation arrows */}
          <div className="absolute right-4 bottom-32 flex flex-col gap-2 z-20">
            <button
              onClick={() => scrollTo(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white disabled:opacity-30 transition-opacity"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollTo(Math.min(filteredReels.length - 1, activeIndex + 1))}
              disabled={activeIndex === filteredReels.length - 1}
              className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white disabled:opacity-30 transition-opacity"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Progress dots */}
          {filteredReels.length <= 10 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-20">
              {filteredReels.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(i)}
                  className="w-1.5 rounded-full transition-all"
                  style={{ height: i === activeIndex ? '20px' : '6px', background: i === activeIndex ? 'white' : 'rgba(255,255,255,0.3)' }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showUpload && (
        <UploadSheet onClose={() => setShowUpload(false)} onUploaded={loadReels} />
      )}
    </div>
  );
}

export default ReelVibeFeed;
