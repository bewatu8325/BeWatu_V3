import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Post, User, AppreciationType } from '../types';
import PostCard from './PostCard';
import { EmptyState } from './EmptyState';

interface FeedProps {
  posts: Post[];
  findAuthor: (authorId: number) => User | undefined;
  onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
  onViewProfile: (userId: number) => void;
  /** Who is looking, so the card knows which posts are theirs. */
  currentUserId?: number;
  currentUserUid?: string;
  onEditPost?: (post: Post, content: string) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
  onReportContent?: (contentId: string, preview: string) => void;
  /** Fetches the next page of posts from the server. Resolves { done: true } when there are no more. */
  onLoadMore?: () => Promise<{ done: boolean }>;
  /** What to show once everything has loaded (see FeedEnd). */
  endSlot?: React.ReactNode;
  /** Cards placed inside the feed: each shows once, after that many posts (or at the end of a shorter feed). */
  inserts?: { key: string; after: number; node: React.ReactNode }[];
  /** How many posts to draw first, and a note of how many are drawn: coming back to Home redraws as far as you had read. */
  initialVisible?: number;
  onVisibleChange?: (n: number) => void;
}

const STEP = 10; // posts drawn at a time

/**
 * Parses a relative timestamp string into hours ago.
 * @param timestamp The relative time string (e.g., "2h ago", "1 day ago").
 * @returns The number of hours ago.
 */
const parseTimestamp = (timestamp: string): number => {
    if (timestamp === 'Just now') return 0.01; // Use a small value for recent posts
    const parts = timestamp.split(' ');
    if (parts.length < 2) return 9999;
    
    const value = parseInt(parts[0], 10);
    if (isNaN(value)) return 9999;

    const unit = parts[1].toLowerCase();
    if (unit.startsWith('minute')) return value / 60;
    if (unit.startsWith('hour')) return value;
    if (unit.startsWith('day')) return value * 24;
    
    return 9999; // Fallback for unknown formats
};

/**
 * Calculates a "value" score for a post based on engagement signals.
 * @param post The post object.
 * @returns A numerical score for the post.
 */
const calculatePostScore = (post: Post): number => {
    const appreciationsScore =
      (post.appreciations.helpful * 1.5) +
      (post.appreciations.thoughtProvoking * 2.5) + // "Thought Provoking" is weighted highest
      (post.appreciations.collaborationReady * 2.0);
    const engagementScore = (post.comments * 1.2) + (post.shares * 1.0);
    return appreciationsScore + engagementScore;
};


const Feed: React.FC<FeedProps> = ({ posts, findAuthor, onAppreciatePost, onViewProfile, currentUserId, currentUserUid, onEditPost, onDeletePost, onReportContent, onLoadMore, endSlot, inserts = [], initialVisible, onVisibleChange }) => {
  const ranked = useMemo(() => {
    // Filter for global posts only (no circleId)
    const globalPosts = posts.filter(post => !post.circleId);

    return [...globalPosts].sort((a, b) => {
        const scoreA = calculatePostScore(a);
        const scoreB = calculatePostScore(b);
        const hoursAgoA = parseTimestamp(a.timestamp);
        const hoursAgoB = parseTimestamp(b.timestamp);

        // A gravity factor for time decay, similar to Hacker News ranking, ensures fresh content still surfaces.
        const gravity = 1.8;
        
        const rankingA = scoreA / Math.pow(hoursAgoA + 2, gravity);
        const rankingB = scoreB / Math.pow(hoursAgoB + 2, gravity);
        
        // A post with a higher ranking should come first
        return rankingB - rankingA;
    });
  }, [posts]);

  // Posts keep the place they were first shown in: loading another page or reacting to a post never makes what you
  // are reading jump. New pages are ranked among themselves and added after; a post you just wrote goes on top.
  const orderRef = useRef<number[]>([]);
  const sortedPosts = useMemo(() => {
    const byId = new Map(ranked.map(p => [p.id, p] as const));
    const known = new Set(orderRef.current);
    const fresh = ranked.filter(p => !known.has(p.id));
    const mine = fresh.filter(p => (currentUserId !== undefined && p.authorId === currentUserId));
    const rest = fresh.filter(p => !mine.includes(p));
    const kept = orderRef.current.filter(id => byId.has(id));
    // First draw: pure ranking. Later: own new posts first, then what was there, then the next page.
    orderRef.current = orderRef.current.length === 0 ? ranked.map(p => p.id) : [...mine.map(p => p.id), ...kept, ...rest.map(p => p.id)];
    return orderRef.current.map(id => byId.get(id)!).filter(Boolean);
  }, [ranked, currentUserId]);

  // ── progressive rendering and fetching ──
  const [visible, setVisible] = useState(Math.max(STEP, initialVisible ?? STEP));
  useEffect(() => { onVisibleChange?.(visible); }, [visible]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(!onLoadMore);
  const [loadError, setLoadError] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  // Pages fetched in a row that added nothing to THIS feed (posts by people outside your network are filtered out).
  // After a few, stop looking rather than read the whole archive.
  const emptyPages = useRef(0);
  useEffect(() => { emptyPages.current = 0; }, [sortedPosts.length]);

  const hasHidden = visible < sortedPosts.length;
  const more = useCallback(async () => {
    if (hasHidden) { setVisible(v => v + STEP); return; }
    if (exhausted || busy.current || !onLoadMore) return;
    busy.current = true; setLoadingMore(true); setLoadError(false);
    try {
      const r = await onLoadMore();
      if (r.done || ++emptyPages.current >= 6) setExhausted(true);
      setVisible(v => v + STEP);
    }
    catch { setLoadError(true); }
    finally { busy.current = false; setLoadingMore(false); }
  }, [hasHidden, exhausted, onLoadMore]);

  // Load when the end of the list comes near the screen, and keep going while it is still near (a short page may
  // not push it away).
  const nearEnd = () => { const r = sentinel.current?.getBoundingClientRect(); return !!r && r.top < window.innerHeight + 600; };
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) more(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more]);
  useEffect(() => { if (!loadError && nearEnd() && (hasHidden || (!exhausted && !loadingMore))) more(); }, [sortedPosts.length, visible, exhausted, loadingMore, loadError, hasHidden, more]);

  const finished = !hasHidden && exhausted;
  const shown = sortedPosts.slice(0, visible);

  // The author's uid is the reliable signal; the numeric id is only a fallback for older posts.
  // (firestore.rules decides who may actually edit or delete: the author, nobody else.)
  const isOwn = (post: Post) => {
    const uid = (post as any).authorUid as string | undefined;
    if (uid && currentUserUid) return uid === currentUserUid;
    return currentUserId !== undefined && post.authorId === currentUserId;
  };

  return (
    <div className="space-y-3 sm:space-y-5">
      {sortedPosts.length === 0 && finished ? (
        <>
          {inserts.map(i => <React.Fragment key={i.key}>{i.node}</React.Fragment>)}
          {endSlot ?? (
            <EmptyState
              compact
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l6 6v10a2 2 0 0 1-2 2z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20v-8H7v8M7 4v4h8"/>
                </svg>
              }
              title="Your feed is empty"
              description="Connect with people to see their posts here, or share something yourself."
            />
          )}
        </>
      ) : (
        <>
          {inserts.filter(i => i.after === 0).map(i => <React.Fragment key={i.key}>{i.node}</React.Fragment>)}
          {shown.map((post, idx) => {
            const author = findAuthor(post.authorId);
            const here = inserts.filter(i => i.after > 0 && i.after === idx + 1);
            return author ? (
              <React.Fragment key={post.id}>
              <div className="min-w-0 w-full overflow-x-clip">
                <PostCard
                  post={post}
                  author={author}
                  onAppreciatePost={onAppreciatePost}
                  onViewProfile={onViewProfile}
                  isOwnPost={isOwn(post)}
                  onEditPost={onEditPost}
                  onDeletePost={onDeletePost}
                  onReportContent={onReportContent}
                />
              </div>
              {here.map(i => <React.Fragment key={i.key}>{i.node}</React.Fragment>)}
              </React.Fragment>
            ) : null;
          })}
          {/* a feed shorter than a card's position: the card goes at the end, before the closing suggestions */}
          {finished && inserts.filter(i => i.after > shown.length).map(i => <React.Fragment key={i.key}>{i.node}</React.Fragment>)}
          <div ref={sentinel} aria-hidden="true" />
          {!finished && (
            <div className="flex min-h-[44px] items-center justify-center" role="status" aria-live="polite">
              {loadError ? (
                <button type="button" onClick={() => { setLoadError(false); more(); }} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50">Could not load more posts. Try again</button>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-stone-500" aria-hidden="true" />
                  <span className="sr-only">Loading more posts</span>
                </>
              )}
            </div>
          )}
          {finished && endSlot}
        </>
      )}
    </div>
  );
};

export default Feed;
