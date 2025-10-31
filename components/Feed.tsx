import React, { useMemo } from 'react';
import { Post, User, AppreciationType } from '../types';
import PostCard from './PostCard';

interface FeedProps {
  posts: Post[];
  findAuthor: (authorId: number) => User | undefined;
  onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
  onViewProfile: (userId: number) => void;
}

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


const Feed: React.FC<FeedProps> = ({ posts, findAuthor, onAppreciatePost, onViewProfile }) => {
  const sortedPosts = useMemo(() => {
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

  return (
    <div className="space-y-6">
      {sortedPosts.map(post => {
        const author = findAuthor(post.authorId);
        return author ? <PostCard key={post.id} post={post} author={author} onAppreciatePost={onAppreciatePost} onViewProfile={onViewProfile} /> : null;
      })}
    </div>
  );
};

export default Feed;