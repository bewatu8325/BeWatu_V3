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

const ActionButton: React.FC<{icon: React.ReactNode, label: string | number, onClick?: () => void, className?: string}> = ({ icon, label, onClick, className }) => (
    <button onClick={onClick} className={`flex items-center space-x-2 text-stone-400 hover:bg-stone-50 rounded-lg px-3 py-2 transition-colors w-full justify-center ${className}`}>
        {icon}
        <span className="text-sm font-semibold">{label}</span>
    </button>
);


const PostCard: React.FC<PostCardProps> = ({ post, author, onAppreciatePost, onViewProfile, onReportContent, isOwnPost }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="bg-white p-5 rounded-2xl border shadow-sm" style={{ borderColor: "#e7e5e4" }}>
      <div className="flex items-start justify-between mb-4">
        <button onClick={() => onViewProfile(author.id)} className="flex items-center space-x-3 text-left hover:opacity-80 transition-opacity min-w-0 flex-1">
          <img src={author.avatarUrl} alt={author.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-stone-900">{author.name}</p>
            <p className="text-xs text-stone-500">{author.headline}</p>
            <p className="text-xs text-stone-400">{post.timestamp}</p>
          </div>
        </button>

        {/* ··· menu */}
        {!isOwnPost && onReportContent && (
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
              title="More options"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5"  r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
              </svg>
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
                <button
                  onClick={() => { setMenuOpen(false); onReportContent(String(post.id), post.content?.slice(0, 80) ?? ''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444', fontWeight: 600, fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span>🚩</span> Report post
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-stone-700 mb-4 whitespace-pre-wrap">{post.content}</p>
      <div className="flex justify-between items-center text-sm text-stone-400 mb-2">
          <div className="flex items-center space-x-4">
             {post.appreciations.helpful > 0 && <span className="flex items-center">🔥 {post.appreciations.helpful}</span>}
             {post.appreciations.thoughtProvoking > 0 && <span className="flex items-center">🧠 {post.appreciations.thoughtProvoking}</span>}
             {post.appreciations.collaborationReady > 0 && <span className="flex items-center">🤝 {post.appreciations.collaborationReady}</span>}
          </div>
          {post.comments > 0 && <span>{post.comments} Comments</span>}
      </div>
      <div className="border-t pt-1 flex justify-around space-x-1" style={{ borderColor: "#e7e5e4" }}>
        <ActionButton icon={<HelpfulIcon className="w-5 h-5"/>} className="hover:text-orange-400" label="Fire" onClick={() => onAppreciatePost(post.id, 'helpful')}/>
        <ActionButton icon={<ThoughtProvokingIcon className="w-5 h-5"/>} className="hover:text-purple-400" label="Big Brain" onClick={() => onAppreciatePost(post.id, 'thoughtProvoking')}/>
        <ActionButton icon={<CollaborationReadyIcon className="w-5 h-5"/>} className="hover:text-green-400" label="Team Up" onClick={() => onAppreciatePost(post.id, 'collaborationReady')}/>
        <ActionButton icon={<CommentIcon className="w-5 h-5"/>} label="Comment"/>
        <ActionButton icon={<ShareIcon className="w-5 h-5"/>} label="Share"/>
      </div>
    </div>
  );
};

export default PostCard;
