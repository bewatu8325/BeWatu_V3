/**
 * components/ProveView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Prove" page — a reel-based skill showcase.
 * Users upload 30–90s video reels with a written pitch, skill tags,
 * and industry tags. Others can browse, react, and get matched.
 *
 * Features:
 *   - Upload reel with pitch + skill/industry tags
 *   - Browse feed of reels (filterable by skill/industry)
 *   - React to reels (spark, connect, message)
 *   - Opportunity matching based on reel tags
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, Upload, X, Plus, Zap, MessageSquare,
  UserPlus, Briefcase, Filter, Search, CheckCircle2,
  Video, ChevronRight, Star, Clock, Tag, Building2,
  Flame, Eye, Heart, MoreHorizontal, Sparkles,
} from 'lucide-react';
import {
  collection, addDoc, query, orderBy, onSnapshot,
  updateDoc, doc, arrayUnion, arrayRemove, serverTimestamp,
  where, limit,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';

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
  currentUid,
  compact = false,
}: {
  reel:       Reel;
  onSpark:    (id: string) => void;
  onConnect:  (uid: string) => void;
  onMessage:  (uid: string) => void;
  currentUid: string;
  compact?:   boolean;
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
      <div className="relative bg-stone-900 aspect-video cursor-pointer" onClick={toggle}>
        <video
          ref={videoRef}
          src={reel.videoUrl}
          className="w-full h-full object-cover"
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
            <p className="text-xs text-stone-500 truncate">{reel.authorTitle}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-stone-400">
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
              <span className="text-xs text-stone-400">+{reel.skills.length - 4}</span>
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
            {hasSparked ? 'Sparked' : 'Spark'} {reel.sparks?.length > 0 && <span className="text-stone-400 font-normal">{reel.sparks.length}</span>}
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
  onClose,
  onUploaded,
}: {
  currentUser: any;
  onClose:     () => void;
  onUploaded:  () => void;
}) {
  const [step, setStep]             = useState<'pick' | 'details' | 'uploading' | 'done'>('pick');
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
    setStep('uploading');
    setError(null);

    try {
      // Upload video to Firebase Storage
      const path = `reels/${currentUser._firestoreUid ?? currentUser.id}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file);

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
        authorUid:    currentUser._firestoreUid ?? String(currentUser.id),
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
              <p className="text-xs text-stone-500">30–90 seconds · showcase your skills</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
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
                <p className="text-xs text-stone-400">MP4, MOV, WebM · max 200MB · 10–90 seconds</p>
              </div>
              <input ref={inputRef} type="file" accept="video/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
            </div>
          )}

          {/* Step: details */}
          {step === 'details' && (
            <div className="space-y-5">
              {/* Preview */}
              {videoPreview && (
                <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-video">
                  <video src={videoPreview} className="w-full h-full object-cover" controls />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                    {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}s
                  </div>
                </div>
              )}

              {/* Pitch */}
              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-widest">
                  Written pitch <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={pitch}
                  onChange={e => setPitch(e.target.value)}
                  placeholder="What can you do? What problem do you solve? What makes you different?"
                  rows={3}
                  maxLength={280}
                  className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-400 resize-none"
                />
                <p className="text-xs text-stone-400 mt-1 text-right">{pitch.length}/280</p>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-widest">
                  Skill tags <span className="text-red-400">*</span>
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
                      className="text-xs bg-stone-50 text-stone-500 border border-stone-200 rounded-full px-2.5 py-0.5 hover:bg-stone-100 transition-colors">
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Industries */}
              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-widest">
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
                          : 'bg-stone-50 text-stone-500 border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {industries.includes(ind) && <span className="mr-0.5">✓</span>}
                      {ind}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                onClick={handleUpload}
                disabled={!pitch.trim() || skills.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={14} /> Upload reel
              </button>
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
              <p className="text-xs text-stone-400">{progress}%</p>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-stone-900 mb-1">Reel uploaded!</p>
              <p className="text-xs text-stone-500">Your reel is now live on the Prove feed.</p>
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
        <Briefcase size={14} className="text-stone-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-stone-900 truncate">{job.title}</p>
        <p className="text-xs text-stone-500 truncate">{job.company}</p>
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
}

export default function ProveView({
  currentUser,
  onViewProfile,
  onStartMessage,
  onConnect,
  allJobs = [],
}: ProveViewProps) {
  const [reels, setReels]         = useState<Reel[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch]       = useState('');
  const [filterSkill, setFilterSkill] = useState<string | null>(null);
  const [filterIndustry, setFilterIndustry] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'matches'>('all');

  const currentUid = currentUser?._firestoreUid ?? String(currentUser?.id ?? '');

  useEffect(() => {
    const q = query(
      collection(db, 'reels'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, snap => {
      setReels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reel)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSpark = async (reelId: string) => {
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;
    const hasSparked = reel.sparks?.includes(currentUid);
    await updateDoc(doc(db, 'reels', reelId), {
      sparks: hasSparked ? arrayRemove(currentUid) : arrayUnion(currentUid),
    });
  };

  // Match reels against user's skills from their profile
  const userSkills = (currentUser?.skills ?? []).map((s: any) =>
    typeof s === 'string' ? s.toLowerCase() : s.name?.toLowerCase()
  );

  const filtered = reels.filter(r => {
    if (activeTab === 'mine')    return r.authorUid === currentUid;
    if (activeTab === 'matches') {
      return r.skills?.some(s => userSkills.includes(s.toLowerCase())) && r.authorUid !== currentUid;
    }
    if (filterSkill)    return r.skills?.some(s => s.toLowerCase().includes(filterSkill.toLowerCase()));
    if (filterIndustry) return r.industries?.includes(filterIndustry);
    if (search) {
      const q = search.toLowerCase();
      return r.authorName?.toLowerCase().includes(q) ||
             r.pitch?.toLowerCase().includes(q) ||
             r.skills?.some(s => s.toLowerCase().includes(q));
    }
    return true;
  });

  // Jobs that match reel skills in user's reels
  const mySkills = reels
    .filter(r => r.authorUid === currentUid)
    .flatMap(r => r.skills ?? [])
    .map(s => s.toLowerCase());

  const matchedJobs = allJobs
    .map(job => {
      const jobSkills = (job.requiredSkills ?? job.skills ?? []).map((s: string) => s.toLowerCase());
      const overlap   = mySkills.filter(s => jobSkills.includes(s));
      return { ...job, matchScore: Math.round((overlap.length / Math.max(jobSkills.length, 1)) * 100) };
    })
    .filter(j => j.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 mb-1">Prove</h1>
          <p className="text-stone-500 text-sm">
            Show what you can do. Upload a 30–90s reel and let your skills speak.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Video size={14} /> Upload reel
        </button>
      </div>

      <div className="flex gap-6">
        {/* Main column */}
        <div className="flex-1 min-w-0">

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-5 bg-stone-100 rounded-xl p-1">
            {([
              { id: 'all',     label: 'All reels' },
              { id: 'matches', label: 'Matches for me' },
              { id: 'mine',    label: 'My reels' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search + filters */}
          {activeTab === 'all' && (
            <div className="flex gap-2 mb-5 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setFilterSkill(null); setFilterIndustry(null); }}
                  placeholder="Search reels, skills, people..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 bg-white"
                />
              </div>
              <select
                value={filterSkill ?? ''}
                onChange={e => { setFilterSkill(e.target.value || null); setSearch(''); }}
                className="text-xs border border-stone-200 rounded-xl px-3 py-2 bg-white text-stone-600 focus:outline-none"
              >
                <option value="">All skills</option>
                {SKILL_SUGGESTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterIndustry ?? ''}
                onChange={e => { setFilterIndustry(e.target.value || null); setSearch(''); }}
                className="text-xs border border-stone-200 rounded-xl px-3 py-2 bg-white text-stone-600 focus:outline-none"
              >
                <option value="">All industries</option>
                {INDUSTRY_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          )}

          {/* Reel grid */}
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-stone-100 animate-pulse aspect-[4/5]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-stone-200 rounded-2xl">
              <Video size={28} className="text-stone-200 mx-auto mb-3" />
              <p className="text-stone-500 text-sm mb-1">
                {activeTab === 'mine'
                  ? "You haven't uploaded a reel yet."
                  : activeTab === 'matches'
                  ? "No matching reels found. Update your profile skills."
                  : "No reels match your search."}
              </p>
              {activeTab === 'mine' && (
                <button onClick={() => setShowUpload(true)}
                  className="mt-3 text-xs font-semibold text-emerald-600 hover:text-emerald-500 transition-colors">
                  Upload your first reel →
                </button>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {filtered.map(reel => (
                <ReelPlayer
                  key={reel.id}
                  reel={reel}
                  onSpark={handleSpark}
                  onConnect={(uid) => {
                    const user = undefined; // connect by uid
                    onConnect(0);
                  }}
                  onMessage={(uid) => onStartMessage(0)}
                  currentUid={currentUid}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar — opportunity matches */}
        <div className="hidden lg:block w-72 flex-shrink-0">
          <div className="sticky top-24 space-y-4">

            {/* My reel stats */}
            {reels.filter(r => r.authorUid === currentUid).length > 0 && (
              <div className="bg-white border border-stone-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">Your reels</p>
                {reels.filter(r => r.authorUid === currentUid).map(r => (
                  <div key={r.id} className="flex items-center gap-2 mb-2 last:mb-0">
                    <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center flex-shrink-0">
                      <Play size={10} className="text-white" fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-stone-700 truncate">{r.pitch?.slice(0, 40)}...</p>
                      <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                        <span className="flex items-center gap-0.5"><Zap size={9} />{r.sparks?.length ?? 0}</span>
                        <span className="flex items-center gap-0.5"><Eye size={9} />{r.views ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Matched opportunities */}
            {matchedJobs.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Sparkles size={13} className="text-emerald-600" />
                  <p className="text-xs font-semibold text-stone-700">Matched opportunities</p>
                </div>
                <div className="space-y-2">
                  {matchedJobs.map(job => (
                    <OpportunityMatch key={job.id} job={job} onView={() => {}} />
                  ))}
                </div>
                <p className="text-xs text-stone-400 mt-3 text-center">
                  Based on skills in your reels
                </p>
              </div>
            )}

            {/* Tips */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
                <Star size={12} className="text-emerald-600" /> Tips for a great reel
              </p>
              {[
                'Show your work, not just your face',
                'Mention a specific problem you solved',
                'Keep it under 60s — shorter is sharper',
                'Tag skills you want to be hired for',
              ].map(tip => (
                <div key={tip} className="flex items-start gap-1.5 mb-1.5 last:mb-0">
                  <ChevronRight size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadReelModal
          currentUser={currentUser}
          onClose={() => setShowUpload(false)}
          onUploaded={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
