/**
 * components/ProfileReelsStrip.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Horizontal scrollable strip of a user's reels for the profile page.
 * Gen Z style — swipeable 9:16 cards, tap to play full screen.
 * Shows reel count + "View All" link to Prove page.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useRef } from 'react';
import { Play, Heart, Eye, Plus, ChevronLeft, ChevronRight, X, Volume2, VolumeX, Zap } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { getReelVibesByUser, toggleReelLike, incrementReelView, type ReelVibe } from '../lib/firestoreService';
import { View } from '../types';

const GREEN = '#1a4a3a';

// ─── Full screen player ───────────────────────────────────────────────────────
function ReelPlayerModal({
  reels,
  startIndex,
  currentUid,
  onClose,
}: {
  reels: ReelVibe[];
  startIndex: number;
  currentUid?: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reel = reels[index];

  useEffect(() => {
    if (!reel) return;
    setLiked(currentUid ? reel.likedByUids.includes(currentUid) : false);
    setLikeCount(reel.likedByUids.length);
    setPlaying(false);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  }, [index, reel?.id]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = false;
      v.play().then(() => { setPlaying(true); setMuted(false); incrementReelView(reel.id).catch(() => {}); }).catch(() => {});
    } else { v.pause(); setPlaying(false); }
  }

  function handleLike() {
    if (!currentUid) return;
    setLiked(l => !l);
    setLikeCount(c => liked ? c - 1 : c + 1);
    toggleReelLike(reel.id, currentUid).catch(() => {});
  }

  if (!reel) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <div
        className="relative bg-black"
        style={{ width: '100%', maxWidth: 420, height: '100dvh' }}
        onClick={e => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          key={reel.id}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl}
          className="w-full h-full object-cover"
          loop playsInline muted={muted}
          onEnded={() => setPlaying(false)}
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%)' }} />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="flex gap-1">
            {reels.map((_, i) => (
              <div key={i} className="h-0.5 rounded-full transition-all" style={{ width: i === index ? 20 : 6, background: i === index ? 'white' : 'rgba(255,255,255,0.4)' }} />
            ))}
          </div>
          <button onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) { v.muted = !muted; setMuted(m => !m); }}} className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Play/pause */}
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center z-10">
          {!playing && (
            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/30">
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            </div>
          )}
        </button>

        {/* Prev/Next */}
        {index > 0 && (
          <button onClick={(e) => { e.stopPropagation(); setIndex(i => i - 1); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white z-10">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {index < reels.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); setIndex(i => i + 1); }} className="absolute right-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white z-10">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Bottom info */}
        <div className="absolute bottom-24 left-0 right-12 p-5 z-10">
          <p className="text-white text-sm leading-snug mb-2">{reel.caption}</p>
          <span className="text-xs text-white/80 font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <Zap className="w-3 h-3 text-amber-300" />{reel.skill}
          </span>
        </div>

        {/* Right actions */}
        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
          <button onClick={(e) => { e.stopPropagation(); handleLike(); }} className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: liked ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.4)' }}>
              <Heart className={`w-5 h-5 ${liked ? 'text-red-400 fill-red-400' : 'text-white'}`} />
            </div>
            <span className="text-white text-xs font-bold">{likeCount}</span>
          </button>
          <div className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
              <Eye className="w-5 h-5 text-white/80" />
            </div>
            <span className="text-white text-xs font-bold">{reel.viewCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Reels Strip ──────────────────────────────────────────────────────
interface ProfileReelsStripProps {
  fbUid: string;
  isCurrentUser: boolean;
  onNavigate: (view: View) => void;
}

export default function ProfileReelsStrip({ fbUid, isCurrentUser, onNavigate }: ProfileReelsStripProps) {
  const { fbUser } = useFirebase();
  const [reels, setReels] = useState<ReelVibe[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<number | null>(null);

  useEffect(() => {
    if (!fbUid) return;
    getReelVibesByUser(fbUid)
      .then(setReels)
      .catch(() => setReels([]))
      .finally(() => setLoading(false));
  }, [fbUid]);

  if (loading) return (
    <div className="bg-white/50 rounded-xl border border-stone-200 p-4 animate-pulse">
      <div className="h-4 bg-stone-200 rounded w-32 mb-3" />
      <div className="flex gap-3">
        {[1,2,3].map(i => <div key={i} className="w-24 h-40 bg-stone-200 rounded-xl flex-shrink-0" />)}
      </div>
    </div>
  );

  if (reels.length === 0 && !isCurrentUser) return null;

  return (
    <>
      <div className="bg-white/50 rounded-xl border border-stone-200 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-stone-800 text-sm">Reel Vibes</span>
            <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full font-medium">
              {reels.length}
            </span>
          </div>
          <button
            onClick={() => onNavigate(View.Prove)}
            className="text-xs font-semibold hover:underline"
            style={{ color: GREEN }}
          >
            View All →
          </button>
        </div>

        {reels.length === 0 ? (
          /* Empty state for own profile */
          <button
            onClick={() => onNavigate(View.Prove)}
            className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-stone-200 hover:border-stone-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#e8f4f0' }}>
              <Plus className="w-5 h-5" style={{ color: GREEN }} />
            </div>
            <p className="text-sm font-semibold text-stone-600">Share your first Reel Vibe</p>
            <p className="text-xs text-stone-400">30-second skill showcase</p>
          </button>
        ) : (
          /* Horizontal scroll strip */
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {reels.map((reel, i) => (
              <button
                key={reel.id}
                onClick={() => setActiveModal(i)}
                className="relative flex-shrink-0 rounded-xl overflow-hidden bg-black group"
                style={{ width: 96, height: 160 }}
              >
                {reel.thumbnailUrl ? (
                  <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: GREEN }}>
                    <Play className="w-6 h-6 text-white/60" />
                  </div>
                )}
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Play className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity fill-white" />
                </div>
                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-1.5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
                  <p className="text-white text-[9px] font-bold truncate">{reel.skill}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-white/60 text-[9px] flex items-center gap-0.5">
                      <Heart className="w-2 h-2" />{reel.likedByUids.length}
                    </span>
                    <span className="text-white/60 text-[9px] flex items-center gap-0.5">
                      <Eye className="w-2 h-2" />{reel.viewCount}
                    </span>
                  </div>
                </div>
              </button>
            ))}

            {/* Add more button for own profile */}
            {isCurrentUser && (
              <button
                onClick={() => onNavigate(View.Prove)}
                className="flex-shrink-0 rounded-xl border-2 border-dashed border-stone-200 hover:border-stone-300 transition-colors flex flex-col items-center justify-center gap-1"
                style={{ width: 96, height: 160 }}
              >
                <Plus className="w-5 h-5 text-stone-400" />
                <span className="text-[10px] text-stone-400 font-medium">Add</span>
              </button>
            )}
          </div>
        )}
      </div>

      {activeModal !== null && (
        <ReelPlayerModal
          reels={reels}
          startIndex={activeModal}
          currentUid={fbUser?.uid}
          onClose={() => setActiveModal(null)}
        />
      )}
    </>
  );
}
