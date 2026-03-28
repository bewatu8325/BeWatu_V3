import React, { useState, useRef, useEffect } from 'react';
import { Post, User, AppreciationType } from '../types';
import { CommentIcon, ShareIcon, HelpfulIcon, ThoughtProvokingIcon, CollaborationReadyIcon } from '../constants';

interface PostCardProps {
  post: Post;
  author: User;
  onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
  onViewProfile: (userId: number) => void;
  onReportContent?: (contentId: string, preview: string) => void;
  isOwnPost?: boolean;
}

// Detects URLs in text and renders them as tappable links
function ContentWithLinks({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <p className="text-stone-700 mb-3 leading-relaxed"
      style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className="text-emerald-700 underline underline-offset-2 break-all"
            onClick={e => e.stopPropagation()}>
            {part}
          </a>
        ) : part
      )}
    </p>
  );
}

// Reaction button — 44px min height for mobile tap targets
const ReactionBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  count?: number;
  hoverColor: string;
  onClick?: () => void;
}> = ({ icon, label, count, hoverColor, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg transition-all active:scale-95 text-stone-400 ${hoverColor}`}
    style={{ minHeight: '44px', paddingTop: 8, paddingBottom: 8 }}
  >
    <span className="flex-shrink-0">{icon}</span>
    <span className="text-xs font-semibold hidden xs:block sm:block leading-none">{label}</span>
    {count != null && count > 0 && (
      <span className="text-[10px] font-bold text-stone-300 leading-none">{count}</span>
    )}
  </button>
);

const PostCard: React.FC<PostCardProps> = ({
  post, author, onAppreciatePost, onViewProfile, onReportContent, isOwnPost,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const totalReactions =
    (post.appreciations.helpful || 0) +
    (post.appreciations.thoughtProvoking || 0) +
    (post.appreciations.collaborationReady || 0);

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden min-w-0"
      style={{ borderColor: '#e7e5e4' }}>

      <div className="p-4 sm:p-5">
        {/* Author row */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <button
            onClick={() => onViewProfile(author.id)}
            className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity min-w-0 flex-1"
          >
            {author.avatarUrl ? (
              <img src={author.avatarUrl} alt={author.name}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: '#1a4a3a' }}>
                {author.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-stone-900 text-sm sm:text-base truncate">{author.name}</p>
              <p className="text-xs text-stone-500 truncate">{author.headline}</p>
              <p className="text-xs text-stone-400">{post.timestamp}</p>
            </div>
          </button>

          {/* ··· menu */}
          {!isOwnPost && onReportContent && (
            <div ref={menuRef} className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-50 min-w-[160px] overflow-hidden"
                  style={{ borderColor: '#e7e5e4' }}>
                  <button
                    onClick={() => { setMenuOpen(false); onReportContent(String(post.id), post.content?.slice(0, 80) ?? ''); }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    🚩 Report post
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Post content — URL-safe */}
        <ContentWithLinks text={post.content ?? ''} />

        {/* Reaction counts */}
        {totalReactions > 0 && (
          <div className="flex items-center gap-3 text-xs text-stone-400 mb-1">
            {post.appreciations.helpful > 0 && (
              <span className="flex items-center gap-1">🔥 {post.appreciations.helpful}</span>
            )}
            {post.appreciations.thoughtProvoking > 0 && (
              <span className="flex items-center gap-1">🧠 {post.appreciations.thoughtProvoking}</span>
            )}
            {post.appreciations.collaborationReady > 0 && (
              <span className="flex items-center gap-1">🤝 {post.appreciations.collaborationReady}</span>
            )}
            {post.comments > 0 && (
              <span className="ml-auto">{post.comments} comment{post.comments !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>

      {/* Reaction row — full width, 44px tap targets */}
      <div className="flex border-t" style={{ borderColor: '#f3f4f6' }}>
        <ReactionBtn
          icon={<HelpfulIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
          label="Fire"
          count={post.appreciations.helpful}
          hoverColor="hover:text-orange-400 hover:bg-orange-50"
          onClick={() => onAppreciatePost(post.id, 'helpful')}
        />
        <div className="w-px bg-stone-100" />
        <ReactionBtn
          icon={<ThoughtProvokingIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
          label="Big Brain"
          count={post.appreciations.thoughtProvoking}
          hoverColor="hover:text-purple-400 hover:bg-purple-50"
          onClick={() => onAppreciatePost(post.id, 'thoughtProvoking')}
        />
        <div className="w-px bg-stone-100" />
        <ReactionBtn
          icon={<CollaborationReadyIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
          label="Team Up"
          count={post.appreciations.collaborationReady}
          hoverColor="hover:text-emerald-500 hover:bg-emerald-50"
          onClick={() => onAppreciatePost(post.id, 'collaborationReady')}
        />
        <div className="w-px bg-stone-100" />
        <ReactionBtn
          icon={<CommentIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
          label="Comment"
          hoverColor="hover:text-blue-400 hover:bg-blue-50"
        />
      </div>
    </div>
  );
};

export default PostCard;
