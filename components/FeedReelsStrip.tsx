/**
 * components/FeedReelsStrip.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Instagram Stories-style horizontal reels strip for the home feed.
 * Shows circular thumbnails of reels from connections + circles.
 * Tap to open full-screen player, swipe left/right between reels.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Play, Heart, MessageCircle, ChevronLeft, ChevronRight, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { getReelVibes, toggleReelLike, incrementReelView, type ReelVibe } from '../lib/firestoreService';

const GREEN = '#1a4a3a';

// ─── Full screen reel player ──────────────────────────────────────────────────
function ReelPlayerModal({
  reels,
  startIndex,
  currentUid,
  onClose,
  onViewProfile,
}: {
  reels: ReelVibe[];
  startIndex: number;
  currentUid?: string;
  onClose: () => void;
  onViewProfile?: (id: number) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [viewed, setViewed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const reel = reels[index];

  useEffect(() => {
    if (!reel) return;
    setLiked(currentUid ? reel.likedByUids.includes(currentUid) : false);
    setLikeCount(reel.likedByUids.length);
    setViewed(false);
    setPlaying(false);
    // Stop previous video
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [index, reel?.id]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = false;
      v.play().then(() => {
        setPlaying(true);
        setMuted(false);
        if (!viewed) {
          setViewed(true);
          incrementReelView(reel.id).catch(() => {});
        }
      }).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function handleLike() {
    if (!currentUid) return;
    setLiked(l => !l);
    setLikeCount(c => liked ? c - 1 : c + 1);
    toggleReelLike(reel.id, currentUid).catch(() => {});
  }

  function prev() { if (index > 0) setIndex(i => i - 1); }
  function next() { if (index < reels.length - 1) setIndex(i => i + 1); }

  if (!reel) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <div
        className="relative bg-black flex items-center justify-center"
        style={{ width: '100%', maxWidth: 420, height: '100dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Video */}
        <video
          ref={videoRef}
          key={reel.id}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl}
          className="w-full h-full object-cover"
          loop
          playsInline
          muted={muted}
          onEnded={() => setPlaying(false)}
        />

        {/* Gradient */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%)' }} />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            {/* Progress dots */}
            <div className="flex gap-1">
              {reels.map((_, i) => (
                <div key={i} className="h-0.5 rounded-full transition-all" style={{ width: i === index ? 20 : 6, background: i === index ? 'white' : 'rgba(255,255,255,0.4)' }} />
              ))}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) { v.muted = !muted; setMuted(m => !m); }}}
            className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Center play/pause */}
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center z-10">
          {!playing && (
            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/30">
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            </div>
          )}
        </button>

        {/* Left/right nav */}
        {index > 0 && (
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white z-10">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {index < reels.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white z-10">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-12 p-5 z-10">
          <button onClick={() => onViewProfile?.(reel.authorId)} className="flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden flex-shrink-0" style={{ background: GREEN }}>
              {reel.authorAvatar
                ? <img src={reel.authorAvatar} alt="" className="w-full h-full object-cover" />
                : <span className="w-full h-full flex items-center justify-center text-white font-bold text-sm">{reel.authorName[0]}</span>
              }
            </div>
            <div>
              <p className="font-bold text-white text-sm">{reel.authorName}</p>
              <p className="text-white/60 text-xs">{reel.authorHeadline}</p>
            </div>
          </button>
          <p className="text-white text-sm leading-snug mb-2">{reel.caption}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-white/80 font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
              ⚡ {reel.skill}
            </span>
            {reel.tags?.slice(0, 2).map(t => (
              <span key={t} className="text-xs text-white/60 px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>#{t}</span>
            ))}
          </div>
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
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-white text-xs font-bold">0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reels Strip ──────────────────────────────────────────────────────────────
interface FeedReelsStripProps {
  currentUser: { id: number; name: string; avatarUrl: string; headline: string };
  networkIds: Set<number>;
  onAddReel?: () => void;
  onViewProfile?: (id: number) => void;
}

export default function FeedReelsStrip({ currentUser, networkIds, onAddReel, onViewProfile }: FeedReelsStripProps) {
  const { fbUser } = useFirebase();
  const [reels, setReels] = useState<ReelVibe[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<number | null>(null);

  useEffect(() => {
    getReelVibes(30)
      .then(all => {
        // Filter to network (connections + circles) + own reels
        const filtered = all.filter(r => networkIds.has(r.authorId));
        setReels(filtered);
      })
      .catch(() => setReels([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-stone-200 animate-pulse" />
            <div className="w-12 h-2 bg-stone-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // Group reels by author — show one bubble per author
  const authorMap = new Map<number, ReelVibe>();
  reels.forEach(r => { if (!authorMap.has(r.authorId)) authorMap.set(r.authorId, r); });
  const uniqueReels = Array.from(authorMap.values());

  if (uniqueReels.length === 0 && !onAddReel) return null;

  return (
    <>
      <div className="bg-white rounded-2xl border shadow-sm p-3" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>

          {/* Add your reel bubble */}
          {onAddReel && (
            <button onClick={onAddReel} className="flex flex-col items-center gap-1.5 flex-shrink-0 group">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-stone-300 group-hover:border-stone-400 transition-colors flex items-center justify-center bg-stone-50">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover opacity-60" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-400 font-bold text-lg">
                    {currentUser.name[0]}
                  </div>
                )}
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white" style={{ background: GREEN }}>
                  <Plus className="w-3 h-3 text-white" />
                </div>
              </div>
              <span className="text-[10px] text-stone-500 font-medium w-16 text-center truncate">Your Reel</span>
            </button>
          )}

          {/* Reel bubbles */}
          {uniqueReels.map((reel, i) => {
            const allReelsByAuthor = reels.filter(r => r.authorId === reel.authorId);
            const globalIndex = reels.indexOf(reel);
            return (
              <button
                key={reel.id}
                onClick={() => setActiveModal(globalIndex)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
              >
                <div
                  className="w-16 h-16 rounded-full overflow-hidden border-2 border-transparent p-0.5"
                  style={{ background: 'linear-gradient(135deg, #1a4a3a, #4db89a)' }}
                >
                  <div className="w-full h-full rounded-full overflow-hidden border-2 border-white">
                    {reel.thumbnailUrl ? (
                      <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : reel.authorAvatar ? (
                      <img src={reel.authorAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm" style={{ background: GREEN }}>
                        {reel.authorName[0]}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-stone-600 font-medium w-16 text-center truncate">
                  {reel.authorId === currentUser.id ? 'You' : reel.authorName.split(' ')[0]}
                </span>
              </button>
            );
          })}

          {uniqueReels.length === 0 && (
            <p className="text-sm text-stone-400 py-2 px-2">No reels from your network yet</p>
          )}
        </div>
      </div>

      {/* Full screen player modal */}
      {activeModal !== null && (
        <ReelPlayerModal
          reels={reels}
          startIndex={activeModal}
          currentUid={fbUser?.uid}
          onClose={() => setActiveModal(null)}
          onViewProfile={onViewProfile}
        />
      )}
    </>
  );
}
