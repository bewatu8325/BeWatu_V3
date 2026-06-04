/**
 * components/PodPostCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Post card designed specifically for the pod wall.
 * Includes:
 *  - Inline comment thread (real-time via subscribeToComments)
 *  - Appreciation reactions with live counts
 *  - Comment composer
 *  - Author avatar, name, headline, timestamp
 *
 * Kept separate from the global PostCard to avoid breaking the main feed.
 * At scale: comments load lazily — only when user expands a post.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, ThumbsUp, Lightbulb, Users, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { addComment, subscribeToComments, notifyPostAuthor, PostComment } from '../lib/firestoreService';
import { trackCommentMade, trackReactionGiven } from '../lib/analytics/track';
import type { Post, User, AppreciationType } from '../types';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

// ── Reaction config ───────────────────────────────────────────────────────────

const REACTIONS: { type: AppreciationType; label: string; icon: React.ReactNode; color: string }[] = [
  {
    type:  'helpful',
    label: 'Helpful',
    icon:  <ThumbsUp size={13} />,
    color: '#2563eb',
  },
  {
    type:  'thoughtProvoking',
    label: 'Thought-provoking',
    icon:  <Lightbulb size={13} />,
    color: '#d97706',
  },
  {
    type:  'collaborationReady',
    label: 'Let\'s collaborate',
    icon:  <Users size={13} />,
    color: GREEN,
  },
];

// ── Time ago helper ───────────────────────────────────────────────────────────

function timeAgo(ts: any): string {
  if (!ts) return '';
  const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date(ts));
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Comment item ─────────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: PostComment }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      {comment.authorAvatar ? (
        <img
          src={comment.authorAvatar}
          alt={comment.authorName}
          className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
        />
      ) : (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
          style={{ backgroundColor: GREEN }}
        >
          {comment.authorName?.[0] ?? '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="bg-stone-50 rounded-2xl rounded-tl-sm px-3 py-2">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-stone-900">{comment.authorName}</span>
            {comment.authorHeadline && (
              <span className="text-xs text-stone-400 truncate max-w-[140px]">{comment.authorHeadline}</span>
            )}
          </div>
          <p className="text-sm text-stone-700 mt-0.5 leading-relaxed">{comment.content}</p>
        </div>
        <span className="text-xs text-stone-400 ml-2 mt-0.5 block">{timeAgo(comment.createdAt)}</span>
      </div>
    </div>
  );
}

// ── Main PodPostCard ──────────────────────────────────────────────────────────

interface PodPostCardProps {
  post:            Post & { _firestoreId?: string; authorName?: string; authorHeadline?: string; avatarUrl?: string; createdAt?: any; authorUid?: string };
  author?:         User & { _firestoreUid?: string };
  currentUser:     User;
  circleFirestoreId?: string;
  onAppreciatePost: (postId: number, type: AppreciationType) => void;
  onViewProfile:   (userId: number) => void;
}

const PodPostCard: React.FC<PodPostCardProps> = ({
  post, author, currentUser, circleFirestoreId, onAppreciatePost, onViewProfile,
}) => {
  const { fbUser } = useFirebase() as any;

  // Comment state
  const [showComments,  setShowComments]  = useState(false);
  const [comments,      setComments]      = useState<PostComment[]>([]);
  const [commentText,   setCommentText]   = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [commentCount,  setCommentCount]  = useState(post.comments ?? 0);
  const unsubRef = useRef<(() => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reaction state — optimistic local counts
  const [reactions, setReactions] = useState({
    helpful:            post.appreciations?.helpful ?? 0,
    thoughtProvoking:   post.appreciations?.thoughtProvoking ?? 0,
    collaborationReady: post.appreciations?.collaborationReady ?? 0,
  });
  const [reacted, setReacted] = useState<Record<string, boolean>>({});

  // Subscribe to comments when expanded
  useEffect(() => {
    if (!showComments || !post._firestoreId) return;
    unsubRef.current = subscribeToComments(post._firestoreId, updated => {
      setComments(updated);
      setCommentCount(updated.length);
    });
    return () => { unsubRef.current?.(); };
  }, [showComments, post._firestoreId]);

  // Auto-focus textarea when expanding
  useEffect(() => {
    if (showComments) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [showComments]);

  const handleReaction = (type: AppreciationType) => {
    if (reacted[type]) return; // one reaction per type per session
    setReacted(r => ({ ...r, [type]: true }));
    setReactions(r => ({ ...r, [type]: r[type] + 1 }));
    onAppreciatePost(post.id, type);
    if (fbUser) trackReactionGiven(fbUser.uid, 'pod', post._firestoreId ?? String(post.id));
  };

  const handleComment = async () => {
    if (!commentText.trim() || !fbUser || !post._firestoreId) return;
    setSubmitting(true);
    try {
      await addComment(
        post._firestoreId,
        {
          uid:       fbUser.uid,
          numericId: currentUser.id,
          name:      currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          headline:  currentUser.headline,
        },
        commentText.trim()
      );
      trackCommentMade(fbUser.uid, 'pod', post._firestoreId ?? String(post.id));
      setCommentText('');
      setCommentCount(c => c + 1);
      // Notify post author (fire and forget)
      const postAuthorUid = (post as any).authorUid ?? (author as any)?._firestoreUid;
      if (postAuthorUid) {
        notifyPostAuthor(post._firestoreId!, currentUser.name, postAuthorUid, fbUser.uid, circleFirestoreId).catch(() => {});
      }
    } catch (e) {
      console.error('Comment failed:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleComment();
    }
  };

  // Prefer denormalized fields baked into the post; fall back to the live
  // author lookup only as a freshness enhancement. This means the feed renders
  // correctly for ALL authors, not just the top-50 held in data.users.
  const displayName   = (post as any).authorName    ?? author?.name     ?? 'Unknown';
  const displayAvatar = (post as any).avatarUrl     ?? author?.avatarUrl ?? null;
  const displayHl     = (post as any).authorHeadline ?? author?.headline ?? null;
  const displayId     = post.authorId ?? author?.id;

  const totalReactions = reactions.helpful + reactions.thoughtProvoking + reactions.collaborationReady;

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
      {/* Post header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <button onClick={() => onViewProfile(displayId)} className="flex-shrink-0">
          {displayAvatar ? (
            <img src={displayAvatar} alt={displayName} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: GREEN }}>
              {displayName[0]}
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              onClick={() => onViewProfile(displayId)}
              className="text-sm font-bold text-stone-900 hover:underline truncate">
              {displayName}
            </button>
            {displayHl && (
              <span className="text-xs text-stone-400 truncate">{displayHl}</span>
            )}
          </div>
          <p className="text-xs text-stone-400">{timeAgo((post as any).createdAt)}</p>
        </div>
      </div>

      {/* Post content */}
      <div className="px-4 pb-3">
        <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Reaction counts (if any) */}
      {totalReactions > 0 && (
        <div className="px-4 pb-2 flex items-center gap-3">
          {REACTIONS.map(r => reactions[r.type] > 0 && (
            <span key={r.type} className="flex items-center gap-1 text-xs text-stone-400">
              <span style={{ color: r.color }}>{r.icon}</span>
              {reactions[r.type]}
            </span>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="mx-4 border-t" style={{ borderColor: '#f5f5f4' }} />

      {/* Action bar — -mx-1 wrapper lets buttons use full card width */}
      <div className="-mx-1">
        <div className="flex items-center px-1.5 py-1 gap-0.5 overflow-x-auto scrollbar-hide">
          {REACTIONS.map(r => (
            <button
              key={r.type}
              onClick={() => handleReaction(r.type)}
              className="flex items-center gap-1 px-2 py-2 rounded-xl text-[11px] font-medium transition-all hover:bg-stone-50 flex-1 justify-center flex-shrink-0"
              style={{
                color: reacted[r.type] ? r.color : '#9ca3af',
                backgroundColor: reacted[r.type] ? r.color + '10' : 'transparent',
              }}
              title={r.label}
            >
              <span style={{ color: reacted[r.type] ? r.color : '#9ca3af' }}>{r.icon}</span>
              <span className="hidden sm:inline whitespace-nowrap">{r.label}</span>
            </button>
          ))}
          <button
            onClick={() => setShowComments(s => !s)}
            className="flex items-center gap-1 px-2 py-2 rounded-xl text-[11px] font-medium transition-all hover:bg-stone-50 flex-1 justify-center flex-shrink-0"
            style={{ color: showComments ? GREEN : '#9ca3af' }}
          >
            <MessageCircle size={13} />
            <span className="whitespace-nowrap">{commentCount > 0 ? commentCount : ''} {commentCount === 1 ? 'Comment' : 'Comment'}</span>
            {commentCount > 0 && (showComments ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
          </button>
        </div>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#f5f5f4' }}>
          {/* Existing comments */}
          {comments.length > 0 && (
            <div className="mt-2 space-y-0 divide-y" style={{ borderColor: 'transparent' }}>
              {comments.map(c => <CommentItem key={c.id} comment={c} />)}
            </div>
          )}

          {/* Comment composer */}
          <div className="flex items-start gap-2.5 mt-3">
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1" />
            ) : (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1"
                style={{ backgroundColor: GREEN }}>
                {currentUser.name[0]}
              </div>
            )}
            <div className="flex-1 flex items-end gap-2 bg-stone-50 rounded-2xl rounded-tl-sm px-3 py-2 border" style={{ borderColor: '#e7e5e4' }}>
              <textarea
                ref={textareaRef}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write a comment… (Enter to post)"
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none"
                style={{ minHeight: 20, maxHeight: 120 }}
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || submitting}
                className="flex-shrink-0 p-1 rounded-lg disabled:opacity-30 transition-opacity"
                style={{ color: GREEN }}
              >
                {submitting
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Send size={15} />
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PodPostCard;
