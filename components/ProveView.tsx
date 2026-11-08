/**
 * components/ProveView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Prove" page: a professional video showcase, independent of Arenas.
 * Members upload 30–90s reels with a written pitch, skill tags and industry tags.
 * Others browse a gallery (Discover, Following, My Reels), watch, spark, connect and message.
 * A reel can be linked to an Arena challenge its author has submitted to (components/prove/ArenaLink.tsx).
 *
 * Features:
 *   - Upload reel with pitch + skill/industry tags
 *   - Browse feed of reels (filterable by skill/industry)
 *   - React to reels (spark, connect, message)
 *   - Opportunity matching based on reel tags
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, Upload, X, Plus, Zap, MessageSquare,
  UserPlus, Briefcase, Filter, Search, CheckCircle2,
  Video, ChevronRight, Star, Clock, Tag, Building2,
  Flame, Eye, Heart, MoreHorizontal, Sparkles, Trash2, Trophy, ChevronDown,
} from 'lucide-react';
import {
  collection, addDoc, query, orderBy, onSnapshot,
  updateDoc, doc, deleteDoc, arrayUnion, arrayRemove, serverTimestamp,
  where, limit,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { compressVideo } from '../lib/compressVideo';
import { useFirebase } from '../contexts/FirebaseContext';
import { useIntent } from '../lib/uiIntent';
import { refreshReelLink, unlinkReel, type ArenaLink } from '../lib/arenaClient';
import {
  defaultTab, reelsFor, optionsFrom, followingReels, anyProveFilter, NO_PROVE_FILTERS,
  type ProveTab, type ProveSort, type ProveFilters, type ProveContext, type ReelLite,
} from '../lib/proveDiscovery';
import { ArenaLinkNote, ArenaLinkModal } from './prove/ArenaLink';
import BottomSheet from './mobile/BottomSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reel {
  id:           string;
  authorUid:    string;
  authorName:   string;
  authorAvatar: string;
  authorTitle:  string;
  videoUrl:     string;
  thumbnailUrl: string | null;
  pitch:        string;
  skills:       string[];
  industries:   string[];
  duration:     number;
  sparks:       string[];
  views:        number;
  createdAt:    any;
  /** Written only by api/reel-arena-link.ts, after it has checked the author submitted to that challenge. */
  arenaLink?:   ArenaLink;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILL_SUGGESTIONS = [
  'Product Management', 'Machine Learning', 'React', 'Python', 'Go',
  'Fintech', 'UX Design', 'Data Engineering', 'Growth', 'Fundraising',
  'Sales', 'DevOps', 'Blockchain', 'Healthcare Tech', 'B2B SaaS',
  'TypeScript', 'System Design', 'Marketing', 'Operations', 'Finance',
];

const INDUSTRY_OPTIONS = [
  'Payments', 'Banking', 'Insurance', 'Healthcare', 'Lending',
  'Wealth & Investment', 'RegTech', 'PropTech', 'SaaS', 'Web3',
  'AI/ML', 'Climate Tech', 'EdTech', 'Logistics', 'E-commerce',
];

// ─── Video player ─────────────────────────────────────────────────────────────

function ReelPlayer({
  reel,
  onSpark,
  onConnect,
  onMessage,
  onDelete,
  currentUid,
  compact = false,
  onOpenChallenge,
}: {
  reel:       Reel;
  onSpark:    (id: string) => void;
  onConnect:  (uid: string) => void;
  onMessage:  (uid: string) => void;
  onDelete?:  (reel: Reel) => void;
  currentUid: string;
  compact?:   boolean;
  onOpenChallenge?: (challengeId: string) => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const hasSparked = reel.sparks?.includes(currentUid);

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else         { videoRef.current.play();  setPlaying(true);  }
  };

  return (
    <div className={`bg-white border border-stone-200 rounded-2xl overflow-hidden ${compact ? '' : 'shadow-sm hover:shadow-md transition-shadow'}`}>
      {/* Video */}
      <div className="relative bg-stone-900 aspect-[9/16] cursor-pointer" onClick={toggle}>
        <video
          ref={videoRef}
          src={reel.videoUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={() => {
            if (!videoRef.current) return;
            setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
          }}
          onEnded={() => setPlaying(false)}
          playsInline
        />
        {/* Play overlay */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play size={20} className="text-stone-900 ml-0.5" fill="currentColor" />
            </div>
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
          <Clock size={10} />
          {Math.floor(reel.duration / 60)}:{String(Math.floor(reel.duration % 60)).padStart(2, '0')}
        </div>
        {/* Delete — own reels only */}
        {reel.authorUid === currentUid && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(reel); }}
            aria-label="Delete reel"
            title="Delete reel"
            className="absolute top-3 left-3 w-7 h-7 rounded-full bg-black/60 hover:bg-red-600/80 flex items-center justify-center text-white transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
        {/* Progress bar */}
        {playing && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        {/* Author row */}
        <div className="flex items-center gap-2.5 mb-3">
          {reel.authorAvatar ? (
            <img src={reel.authorAvatar} alt={reel.authorName} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
              {reel.authorName?.slice(0, 1)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900 truncate">{reel.authorName}</p>
            <p className="text-xs text-stone-600 truncate">{reel.authorTitle}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-stone-600">
            <Eye size={11} />
            {reel.views ?? 0}
          </div>
        </div>

        {/* Pitch */}
        <p className="text-sm text-stone-700 mb-3 leading-relaxed line-clamp-2">{reel.pitch}</p>

        {/* Skill tags */}
        {reel.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {reel.skills.slice(0, 4).map(skill => (
              <span key={skill} className="text-xs bg-stone-100 text-stone-600 rounded-full px-2.5 py-0.5">
                {skill}
              </span>
            ))}
            {reel.skills.length > 4 && (
              <span className="text-xs text-stone-600">+{reel.skills.length - 4}</span>
            )}
          </div>
        )}

        {/* Industry tags */}
        {reel.industries?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {reel.industries.slice(0, 2).map(ind => (
              <span key={ind} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                <Building2 size={9} />
                {ind}
              </span>
            ))}
          </div>
        )}

        {reel.arenaLink && <div className="mb-4"><ArenaLinkNote link={reel.arenaLink} onOpenChallenge={onOpenChallenge} /></div>}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-stone-100">
          <button
            onClick={() => onSpark(reel.id)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
              hasSparked
                ? 'bg-amber-100 text-amber-700'
                : 'bg-stone-100 text-stone-600 hover:bg-amber-50 hover:text-amber-600'
            }`}
          >
            <Zap size={12} fill={hasSparked ? 'currentColor' : 'none'} />
            {hasSparked ? 'Sparked' : 'Spark'} {reel.sparks?.length > 0 && <span className="text-stone-600 font-normal">{reel.sparks.length}</span>}
          </button>

          {reel.authorUid !== currentUid && (
            <>
              <button
                onClick={() => onConnect(reel.authorUid)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all"
              >
                <UserPlus size={12} /> Connect
              </button>
              <button
                onClick={() => onMessage(reel.authorUid)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all"
              >
                <MessageSquare size={12} /> Message
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadReelModal({
  currentUser,
  fbUid,
  onClose,
  onUploaded,
}: {
  currentUser: any;
  fbUid:       string;
  onClose:     () => void;
  onUploaded:  () => void;
}) {
  const [step, setStep]             = useState<'pick' | 'details' | 'compressing' | 'uploading' | 'done'>('pick');
  const [file, setFile]             = useState<File | null>(null);
  const [videoPreview, setPreview]  = useState<string | null>(null);
  const [duration, setDuration]     = useState(0);
  const [pitch, setPitch]           = useState('');
  const [skills, setSkills]         = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [progress, setProgress]     = useState(0);
  const [error, setError]           = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (!f.type.startsWith('video/')) { setError('Please upload a video file.'); return; }
    if (f.size > 200 * 1024 * 1024) { setError('Video must be under 200MB.'); return; }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    // Get duration
    const v = document.createElement('video');
    v.src = url;
    v.onloadedmetadata = () => {
      if (v.duration < 10) { setError('Video must be at least 10 seconds long.'); setFile(null); return; }
      if (v.duration > 90) { setError('Video must be 90 seconds or shorter.'); setFile(null); return; }
      setDuration(Math.round(v.duration));
      setError(null);
      setStep('details');
    };
  }

  function addSkill(s: string) {
    const trimmed = s.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 8) {
      setSkills(prev => [...prev, trimmed]);
    }
    setSkillInput('');
  }

  async function handleUpload() {
    if (!file || !pitch.trim() || skills.length === 0) {
      setError('Add a pitch and at least one skill tag.');
      return;
    }
    setStep('compressing');
    setError(null);

    try {
      // Compress video client-side to fit reel box (max 720p, 1.5Mbps)
      const compressed = await compressVideo(file, {
        maxWidth:    720,
        maxHeight:   1280,
        videoBitrate: 1_500_000,
        audioBitrate: 128_000,
      });

      setStep('uploading');

      // Use Firebase Auth UID for storage path
      const uid = fbUid;
      const ext  = compressed instanceof File ? file.name.split('.').pop() : 'webm';
      const path = `reels/${uid}/${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, compressed);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve
        );
      });

      const videoUrl = await getDownloadURL(uploadTask.snapshot.ref);

      // Save to Firestore
      await addDoc(collection(db, 'reels'), {
        authorUid:    fbUid,
        authorName:   currentUser.name,
        authorAvatar: currentUser.avatarUrl ?? null,
        authorTitle:  currentUser.headline ?? currentUser.title ?? '',
        videoUrl,
        thumbnailUrl: null,
        pitch:        pitch.trim(),
        skills,
        industries,
        duration,
        sparks:    [],
        views:     0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setStep('done');
      setTimeout(() => { onUploaded(); onClose(); }, 1500);
    } catch (err: any) {
      setError(err.message ?? 'Upload failed. Please try again.');
      setStep('details');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Video size={15} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-900">Upload your reel</p>
              <p className="text-xs text-stone-600">30–90 seconds · showcase your skills</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-600 hover:text-stone-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">

          {/* Step: pick file */}
          {step === 'pick' && (
            <div>
              <div
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-stone-200 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all"
              >
                <Upload size={28} className="text-stone-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-stone-700 mb-1">Click to upload your reel</p>
                <p className="text-xs text-stone-600">MP4, MOV, WebM · max 200MB · 10–90 seconds</p>
              </div>
              <input ref={inputRef} type="file" accept="video/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}
              {/* Guidance lives where it is useful: while making the reel, and only if you want it */}
              <details className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                <summary className="flex min-h-[32px] cursor-pointer list-none items-center gap-2 text-sm font-semibold text-stone-800">
                  <Star size={14} style={{ color: 'var(--bw-green)' }} aria-hidden="true" /> Tips for a great reel
                  <ChevronDown size={14} className="ml-auto text-stone-500" aria-hidden="true" />
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {['Show your work, not just your face', 'Mention a specific problem you solved', 'Keep it under 60s: shorter is sharper', 'Tag the skills you want to be known for'].map(tip => (
                    <li key={tip} className="flex items-start gap-1.5 text-sm text-stone-700"><ChevronRight size={13} className="mt-1 flex-shrink-0 text-stone-400" aria-hidden="true" />{tip}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {/* Step: details */}
          {step === 'details' && (
            <div className="space-y-5">
              {/* Preview */}
              {videoPreview && (
                <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-[9/16]">
                  <video src={videoPreview} className="w-full h-full object-contain" controls />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                    {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}s
                  </div>
                </div>
              )}

              {/* Pitch */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-widest">
                  Written pitch <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={pitch}
                  onChange={e => setPitch(e.target.value)}
                  placeholder="What can you do? What problem do you solve? What makes you different?"
                  rows={3}
                  maxLength={280}
                  className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-600 focus:outline-none focus:border-stone-400 resize-none"
                />
                <p className="text-xs text-stone-600 mt-1 text-right">{pitch.length}/280</p>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-widest">
                  Skill tags <span className="text-red-600">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {skills.map(s => (
                    <span key={s} className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 rounded-full px-2.5 py-1">
                      {s}
                      <button onClick={() => setSkills(prev => prev.filter(x => x !== s))}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(skillInput); } }}
                    placeholder="Type a skill and press Enter"
                    className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
                  />
                  <button onClick={() => addSkill(skillInput)}
                    className="bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl px-3 py-2 text-sm font-semibold transition-colors">
                    Add
                  </button>
                </div>
                {/* Suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SKILL_SUGGESTIONS.filter(s => !skills.includes(s)).slice(0, 8).map(s => (
                    <button key={s} onClick={() => addSkill(s)}
                      className="text-xs bg-stone-50 text-stone-600 border border-stone-200 rounded-full px-2.5 py-0.5 hover:bg-stone-100 transition-colors">
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Industries */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-widest">
                  Industries (optional)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {INDUSTRY_OPTIONS.map(ind => (
                    <button
                      key={ind}
                      onClick={() => setIndustries(prev =>
                        prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind]
                      )}
                      className={`text-xs rounded-full px-2.5 py-1 border transition-all ${
                        industries.includes(ind)
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {industries.includes(ind) && <span className="mr-0.5">✓</span>}
                      {ind}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                onClick={handleUpload}
                disabled={!pitch.trim() || skills.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={14} /> Upload reel
              </button>
            </div>
          )}

          {/* Step: compressing */}
          {step === 'compressing' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <Video size={24} className="text-stone-600 animate-pulse" />
              </div>
              <p className="text-sm font-semibold text-stone-900 mb-1">Optimising your reel...</p>
              <p className="text-xs text-stone-600">Resizing to fit the reel player. This takes a few seconds.</p>
            </div>
          )}

          {/* Step: uploading */}
          {step === 'uploading' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <Upload size={24} className="text-emerald-600 animate-bounce" />
              </div>
              <p className="text-sm font-semibold text-stone-900 mb-2">Uploading your reel...</p>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden mx-8 mb-2">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-stone-600">{progress}%</p>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-stone-900 mb-1">Reel uploaded!</p>
              <p className="text-xs text-stone-600">Your reel is now live on the Prove feed.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Opportunity match card ───────────────────────────────────────────────────

function OpportunityMatch({ job, onView }: { job: any; onView: () => void }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-3 hover:border-stone-300 transition-colors cursor-pointer" onClick={onView}>
      <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
        <Briefcase size={14} className="text-stone-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-stone-900 truncate">{job.title}</p>
        <p className="text-xs text-stone-600 truncate">{job.company}</p>
      </div>
      <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 flex-shrink-0">
        <Sparkles size={11} />
        {job.matchScore}%
      </div>
    </div>
  );
}

// ─── Main ProveView ───────────────────────────────────────────────────────────

interface ProveViewProps {
  currentUser:    any;
  onViewProfile:  (id: number) => void;
  onStartMessage: (id: number) => void;
  onConnect:      (id: number) => void;
  allJobs?:       any[];
  socialGraphUids?: Set<string>;
  /** Opens an Arena challenge's page (from a reel's challenge link). */
  onOpenChallenge?: (challengeId: string) => void;
  /** Goes to the Arenas landing page. */
  onExploreArenas?: () => void;
}

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const ring = { ['--tw-ring-color' as any]: GREEN } as React.CSSProperties;
const STORAGE_KEY = 'beWatuProveState';
const TAB_LABEL: Record<ProveTab, string> = { discover: 'Discover', following: 'Following', mine: 'My Reels' };

const toLite = (r: Reel): ReelLite => ({ id: r.id, authorUid: r.authorUid, authorName: r.authorName, authorTitle: r.authorTitle, pitch: r.pitch, skills: r.skills, industries: r.industries, createdAtMs: r.createdAt?.toMillis?.() ?? 0, sparks: r.sparks });

/** One reel in the gallery: a real preview (the uploaded thumbnail, or the video's own first frame), who, what, and the skills. */
function ReelCard({ reel, onOpen, children }: { reel: Reel; onOpen: () => void; children?: React.ReactNode }) {
  const mins = Math.floor((reel.duration ?? 0) / 60); const secs = String(Math.floor((reel.duration ?? 0) % 60)).padStart(2, '0');
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" aria-label={`Reel by ${reel.authorName}`}>
      <button type="button" onClick={onOpen} aria-label={`Play reel by ${reel.authorName}: ${reel.pitch ?? ''}`.slice(0, 160)}
        className="group relative block aspect-[3/4] w-full overflow-hidden bg-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset" style={ring}>
        {reel.thumbnailUrl
          ? <img src={reel.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <video src={`${reel.videoUrl}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" className="h-full w-full object-cover" />}
        <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg"><Play size={20} className="ml-0.5 text-stone-900" fill="currentColor" aria-hidden="true" /></span>
        </span>
        {(reel.duration ?? 0) > 0 && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{mins}:{secs}</span>}
        {reel.arenaLink && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold" style={{ color: GREEN }}><Trophy size={11} aria-hidden="true" /> Arena</span>}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          {reel.authorAvatar
            ? <img src={reel.authorAvatar} alt="" loading="lazy" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
            : <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: GREEN }}>{(reel.authorName ?? '?').slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-stone-900 line-clamp-1">{reel.authorName}</p>
            {reel.authorTitle && <p className="text-xs leading-tight text-stone-600 line-clamp-1">{reel.authorTitle}</p>}
          </div>
        </div>
        {reel.pitch && <p className="text-sm leading-snug text-stone-700 line-clamp-2">{reel.pitch}</p>}
        {(reel.skills?.length ?? 0) > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Skills">
            {reel.skills.slice(0, 2).map(s => <li key={s} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{s}</li>)}
            {reel.skills.length > 2 && <li className="px-1 py-0.5 text-xs text-stone-500">+{reel.skills.length - 2}</li>}
          </ul>
        )}
        {children}
      </div>
    </article>
  );
}

export default function ProveView({
  currentUser,
  onViewProfile,
  onStartMessage,
  onConnect,
  allJobs = [],
  socialGraphUids,
  onOpenChallenge,
  onExploreArenas,
}: ProveViewProps) {
  const { fbUser } = useFirebase();
  const [reels, setReels]         = useState<Reel[]>([]);
  const [myReels, setMyReels]     = useState<Reel[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filters, setFilters]     = useState<ProveFilters>(NO_PROVE_FILTERS);
  const [sort, setSort]           = useState<ProveSort>('match');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [playing, setPlaying]     = useState<Reel | null>(null);
  const [linking, setLinking]     = useState<Reel | null>(null);
  const [busyLink, setBusyLink]   = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [undoToast, setUndoToast] = useState<{ reel: Reel } | null>(null);
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const currentUid = fbUser?.uid ?? String(currentUser?.id ?? '');
  // "Upload a Reel" from the Create menu lands here with the uploader open.
  useIntent('upload-reel', () => setShowUpload(true));

  // The tab: the address (?tab=), else what this tab of the browser last had, else Discover, or Following once it holds enough.
  const initialTab = useMemo<ProveTab | null>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('tab');
      if (window.location.pathname === '/prove' && (fromUrl === 'discover' || fromUrl === 'following' || fromUrl === 'mine')) return fromUrl;
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved && (saved.tab === 'discover' || saved.tab === 'following' || saved.tab === 'mine')) return saved.tab;
    } catch { /* storage may be unavailable */ }
    return null;
  }, []);
  const [chosenTab, setChosenTab] = useState<ProveTab | null>(initialTab);
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
      if (s?.filters) setFilters({ ...NO_PROVE_FILTERS, q: String(s.filters.q ?? '').slice(0, 80), skill: String(s.filters.skill ?? ''), industry: String(s.filters.industry ?? '') });
      if (s?.sort === 'newest') setSort('newest');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { return () => { deleteTimers.current.forEach(t => clearTimeout(t)); }; }, []);
  const visibleMyReels = myReels.filter(r => !pendingDeleteIds.has(r.id));

  useEffect(() => {
    // Recent-across-everyone, capped at 50: fine for a gallery, but NOT a source of truth for "my reels" (see the query below).
    const q = query(collection(db, 'reels'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, snap => { setReels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reel))); setLoading(false); });
  }, []);
  useEffect(() => {
    if (!currentUid) return;
    // Scoped to this user so "My Reels" always shows everything you've posted, however old.
    const q = query(collection(db, 'reels'), where('authorUid', '==', currentUid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setMyReels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reel))));
  }, [currentUid]);

  const userSkills: string[] = (currentUser?.skills ?? []).map((s: any) => (typeof s === 'string' ? s : s?.name)).filter(Boolean);
  const pctx: ProveContext = { uid: currentUid, following: socialGraphUids, mySkills: userSkills, myIndustry: String(currentUser?.industry ?? '') };
  const liteAll = useMemo(() => reels.map(toLite), [reels]);
  const tab: ProveTab = chosenTab ?? defaultTab(liteAll, pctx);
  const byId = useMemo(() => new Map([...reels, ...visibleMyReels].map(r => [r.id, r] as const)), [reels, visibleMyReels]);

  const shown = useMemo(() => reelsFor(tab, liteAll, visibleMyReels.map(toLite), pctx, filters, sort).map(l => byId.get(l.id)!).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, liteAll, visibleMyReels, filters, sort, byId, socialGraphUids, currentUid, userSkills.join('|')]);
  const skillOpts = useMemo(() => optionsFrom(liteAll, r => r.skills), [liteAll]);
  const industryOpts = useMemo(() => optionsFrom(liteAll, r => r.industries), [liteAll]);
  const followingCount = followingReels(liteAll, pctx).length;
  const filtering = anyProveFilter(filters);

  const choose = (t: ProveTab) => {
    setChosenTab(t);
    try { window.history.replaceState(window.history.state, '', `/prove?tab=${t}`); } catch { /* ignore */ }
  };
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tab: chosenTab, filters, sort })); } catch { /* ignore */ } }, [chosenTab, filters, sort]);

  const handleSpark = async (reelId: string) => {
    const reel = byId.get(reelId); if (!reel) return;
    const hasSparked = reel.sparks?.includes(currentUid);
    await updateDoc(doc(db, 'reels', reelId), { sparks: hasSparked ? arrayRemove(currentUid) : arrayUnion(currentUid) });
  };

  // Real delete doesn't happen until the undo window passes: deleting the Storage video can't be cleanly reversed.
  const commitDeleteReel = async (reel: Reel) => {
    await deleteDoc(doc(db, 'reels', reel.id));
    await deleteObject(ref(storage, reel.videoUrl)).catch(() => {});
    if (reel.thumbnailUrl) await deleteObject(ref(storage, reel.thumbnailUrl)).catch(() => {});
    deleteTimers.current.delete(reel.id);
    setPendingDeleteIds(prev => { const next = new Set(prev); next.delete(reel.id); return next; });
    setUndoToast(current => (current?.reel.id === reel.id ? null : current));
  };
  const handleDeleteReel = (reel: Reel) => {
    if (reel.authorUid !== currentUid) return;
    setPlaying(null);
    setPendingDeleteIds(prev => new Set(prev).add(reel.id));
    setUndoToast({ reel });
    deleteTimers.current.set(reel.id, setTimeout(() => commitDeleteReel(reel), 5000));
  };
  const handleUndoDelete = (reelId: string) => {
    const timer = deleteTimers.current.get(reelId);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(reelId);
    setPendingDeleteIds(prev => { const next = new Set(prev); next.delete(reelId); return next; });
    setUndoToast(current => (current?.reel.id === reelId ? null : current));
  };

  const refreshLink = async (reel: Reel) => { setBusyLink(reel.id); try { await refreshReelLink(reel.id); } catch { /* the note keeps its last known status and date */ } finally { setBusyLink(null); } };
  const removeLink = async (reel: Reel) => { setBusyLink(reel.id); try { await unlinkReel(reel.id); } catch { /* still linked */ } finally { setBusyLink(null); } };

  // Jobs that match reel skills in the member's reels
  const mySkills = visibleMyReels.flatMap(r => r.skills ?? []).map(s => s.toLowerCase());
  const matchedJobs = allJobs
    .map(job => {
      const jobSkills = (job.requiredSkills ?? job.skills ?? []).map((s: string) => s.toLowerCase());
      const overlap   = mySkills.filter(s => jobSkills.includes(s));
      return { ...job, matchScore: Math.round((overlap.length / Math.max(jobSkills.length, 1)) * 100) };
    })
    .filter(j => j.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);

  const filterCount = (filters.skill ? 1 : 0) + (filters.industry ? 1 : 0);

  return (
    <div className="mx-auto max-w-6xl px-1 py-4 sm:py-6">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Prove</h1>
          <p className="mt-1 text-sm text-stone-600 sm:text-base">Let your work speak for you. Short videos from professionals showing a skill, a project or a problem they solved.</p>
        </div>
        <button type="button" onClick={() => setShowUpload(true)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2" style={{ backgroundColor: GREEN, ...ring }}>
          <Video size={15} aria-hidden="true" /> Upload a reel
        </button>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Reels" className="mb-4 inline-flex rounded-xl bg-stone-100 p-1">
        {(['discover', 'following', 'mine'] as ProveTab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => choose(t)}
            className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 sm:px-5 ${tab === t ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`} style={ring}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Search, filters, sort */}
      {tab !== 'mine' && (
        <div className="mb-4 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
            <input type="text" aria-label="Search reels, skills and professionals" placeholder="Search reels" value={filters.q}
              onChange={e => setFilters(f => ({ ...f, q: e.target.value.slice(0, 80) }))}
              className="min-h-[44px] w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-10 text-base focus:outline-none focus-visible:ring-2 sm:text-sm" style={ring} />
            {filters.q && <button type="button" aria-label="Clear search" onClick={() => setFilters(f => ({ ...f, q: '' }))} className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"><X size={16} /></button>}
          </div>
          <button type="button" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={ring}>
            <Filter size={15} aria-hidden="true" /> Filter
            {filterCount > 0 && <span className="rounded-full px-1.5 text-xs font-bold text-white" style={{ backgroundColor: GREEN }}><span className="sr-only">{filterCount} active: </span>{filterCount}</span>}
          </button>
        </div>
      )}
      {tab !== 'mine' && (filters.skill || filters.industry) && (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
          {filters.skill && <button type="button" onClick={() => setFilters(f => ({ ...f, skill: '' }))} aria-label={`Remove filter: ${filters.skill}`} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white" style={{ backgroundColor: GREEN }}>{filters.skill}<X size={14} aria-hidden="true" /></button>}
          {filters.industry && <button type="button" onClick={() => setFilters(f => ({ ...f, industry: '' }))} aria-label={`Remove filter: ${filters.industry}`} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white" style={{ backgroundColor: GREEN }}>{filters.industry}<X size={14} aria-hidden="true" /></button>}
        </div>
      )}
      {tab === 'discover' && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-stone-600">{sort === 'match' ? 'Ordered by how closely their skills and industry match yours, not by popularity.' : 'Newest first.'}</p>
          <label className="flex flex-shrink-0 items-center gap-2 text-sm text-stone-600">
            <span className="sr-only">Sort</span>
            <select aria-label="Sort reels" value={sort} onChange={e => setSort(e.target.value as ProveSort)} className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus-visible:ring-2" style={ring}>
              <option value="match">Best match</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </div>
      )}

      {/* Gallery */}
      {loading && tab !== 'mine' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-stone-100" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: GREEN_LT, color: GREEN }}><Video size={22} aria-hidden="true" /></span>
          {tab === 'mine' ? (
            <>
              <h2 className="text-base font-semibold text-stone-900">Your work deserves to be seen</h2>
              <p className="max-w-md text-sm text-stone-600">Share a short video showing a skill, a project you contributed to, or a problem you solved.</p>
              <button type="button" onClick={() => setShowUpload(true)} className="min-h-[44px] rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Upload your first reel</button>
            </>
          ) : filtering ? (
            <>
              <h2 className="text-base font-semibold text-stone-900">No reels match</h2>
              <p className="max-w-md text-sm text-stone-600">Try fewer filters or a shorter search.</p>
              <button type="button" onClick={() => setFilters(NO_PROVE_FILTERS)} className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50">Clear search and filters</button>
            </>
          ) : tab === 'following' ? (
            <>
              <h2 className="text-base font-semibold text-stone-900">No reels from your network yet</h2>
              <p className="max-w-md text-sm text-stone-600">Reels from your connections and the people in your pods appear here. Browse everyone's reels to find people worth following.</p>
              <button type="button" onClick={() => choose('discover')} className="min-h-[44px] rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Discover reels</button>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-stone-900">No reels to discover yet</h2>
              <p className="max-w-md text-sm text-stone-600">When other members share reels they will appear here. You can be the first to show your work.</p>
              <button type="button" onClick={() => setShowUpload(true)} className="min-h-[44px] rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Upload a reel</button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {shown.map(reel => (
            <ReelCard key={reel.id} reel={reel} onOpen={() => setPlaying(reel)}>
              {tab === 'mine' && (
                <div className="mt-1 space-y-2 border-t border-stone-100 pt-2">
                  {reel.arenaLink ? (
                    <>
                      <ArenaLinkNote link={reel.arenaLink} onOpenChallenge={onOpenChallenge} compact />
                      <div className="flex flex-wrap gap-x-3">
                        <button type="button" disabled={busyLink === reel.id} onClick={() => refreshLink(reel)} className="min-h-[36px] text-xs font-semibold hover:underline disabled:opacity-60" style={{ color: GREEN }}>Update status</button>
                        <button type="button" disabled={busyLink === reel.id} onClick={() => removeLink(reel)} className="min-h-[36px] text-xs font-semibold text-stone-600 hover:underline disabled:opacity-60">Unlink</button>
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={() => setLinking(reel)} className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold hover:underline" style={{ color: GREEN }}><Trophy size={13} aria-hidden="true" /> Link to an Arena challenge</button>
                  )}
                </div>
              )}
            </ReelCard>
          ))}
        </div>
      )}

      {tab === 'mine' && matchedJobs.length > 0 && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4" aria-label="Matched opportunities">
          <div className="mb-3 flex items-center gap-1.5"><Sparkles size={14} style={{ color: GREEN }} aria-hidden="true" /><h2 className="text-sm font-semibold text-stone-800">Opportunities that match skills in your reels</h2></div>
          <div className="space-y-2">{matchedJobs.map(job => <OpportunityMatch key={job.id} job={job} onView={() => {}} />)}</div>
        </section>
      )}

      {/* Arenas, as the next step rather than a tab */}
      {onExploreArenas && (
        <aside className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900">Want something real to show?</p>
            <p className="text-sm text-stone-600">Take on a challenge in an Arena, then link a reel to it so people can see the work behind it.</p>
          </div>
          <button type="button" onClick={onExploreArenas} className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2" style={ring}>Explore Arenas</button>
        </aside>
      )}

      {/* Filters */}
      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter reels" allWidths
        footer={<div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setFilters(f => ({ ...f, skill: '', industry: '' }))} className="min-h-[44px] whitespace-nowrap px-2 text-sm font-semibold text-stone-600 hover:underline">Clear filters</button>
          <button type="button" onClick={() => setFiltersOpen(false)} className="min-h-[44px] whitespace-nowrap rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>Show {shown.length} {shown.length === 1 ? 'reel' : 'reels'}</button>
        </div>}>
        <div className="space-y-4 pt-1">
          {([['skill', 'Skill', filters.skill, 'Any skill', skillOpts], ['industry', 'Industry', filters.industry, 'Any industry', industryOpts]] as const).map(([key, label, value, any, opts]) => (
            <div key={key}>
              <label className="block text-sm font-semibold text-stone-800" htmlFor={'prove-f-' + key}>{label}</label>
              <select id={'prove-f-' + key} value={value} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base sm:text-sm">
                <option value="">{any}</option>
                {value && !opts.includes(value) && <option value={value}>{value}</option>}
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {skillOpts.length === 0 && industryOpts.length === 0 && <p className="text-sm text-stone-600">Skills and industries will appear here once reels have been shared.</p>}
        </div>
      </BottomSheet>

      {/* Watch a reel */}
      {playing && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Reel by ${playing.authorName}`} onClick={() => setPlaying(null)}>
          <div className="relative my-auto w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setPlaying(null)} aria-label="Close reel" className="absolute -top-1 right-0 z-10 flex h-11 w-11 -translate-y-full items-center justify-center rounded-full text-white hover:bg-white/10 sm:translate-y-0 sm:-right-12"><X size={22} /></button>
            <ReelPlayer reel={(byId.get(playing.id) ?? playing)} onSpark={handleSpark} onConnect={() => onConnect(0)} onMessage={() => onStartMessage(0)} onDelete={handleDeleteReel} currentUid={currentUid} onOpenChallenge={onOpenChallenge} />
          </div>
        </div>
      )}

      {linking && (
        <ArenaLinkModal open reelId={linking.id} reelSkills={linking.skills ?? []} onClose={() => setLinking(null)} onLinked={() => { /* the reel updates through the live query */ }} onExploreArenas={() => onExploreArenas?.()} />
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadReelModal currentUser={currentUser} fbUid={fbUser?.uid ?? ''} onClose={() => setShowUpload(false)} onUploaded={() => { setShowUpload(false); choose('mine'); }} />
      )}

      {/* Delete undo toast -- the reel is only actually deleted once this times out; Undo means the delete never happens. */}
      {undoToast && (
        <div className="fixed bottom-24 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg md:bottom-6" role="status">
          <span>Reel deleted</span>
          <button onClick={() => handleUndoDelete(undoToast.reel.id)} className="min-h-[44px] px-1 font-semibold text-emerald-400 hover:text-emerald-300">Undo</button>
        </div>
      )}
    </div>
  );
}
