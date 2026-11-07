import React, { useState } from 'react';
import { Post, User, AppreciationType } from '../types';
import { LinkPreviewCard, LinkifiedText } from './LinkPreviewCard';
import { PostActionsMenu, PostEditBox, DeleteConfirm, AuthorAvatar } from './PostActions';
import { CommentIcon, ShareIcon, HelpfulIcon, ThoughtProvokingIcon, CollaborationReadyIcon } from '../constants';

interface PostCardProps {
  post: Post;
  author: User;
  onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
  onViewProfile: (userId: number) => void;
  onReportContent?: (contentId: string, preview: string) => void;
  /** Own posts get Edit / Delete in the menu; others get Report. */
  isOwnPost?: boolean;
  onEditPost?: (post: Post, content: string) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
}

const ActionButton: React.FC<{icon: React.ReactNode, label: string, onClick?: () => void, className?: string}> = ({ icon, label, onClick, className }) => (
    <button 
      onClick={onClick} 
      className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 transition-colors justify-center min-h-[44px] min-w-0 flex-shrink-0 hover:bg-[var(--bw-green-light)] focus:outline-none focus-visible:ring-2 ${className}`}
      style={{ color: 'var(--bw-green)', ['--tw-ring-color' as any]: 'var(--bw-green)' }}
    >
        {icon}
        <span className="text-[11px] sm:text-[13px] leading-none sm:leading-normal font-semibold whitespace-nowrap">{label}</span>
    </button>
);


const PostCard: React.FC<PostCardProps> = ({ post, author, onAppreciatePost, onViewProfile, onReportContent, isOwnPost, onEditPost, onDeletePost }) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  // The author's own copy of the name/photo travels with the post, so the card
  // still has something to show when the profile lookup has no photo.
  const avatar = author.avatarUrl || (post as any).avatarUrl || null;

  return (
    <div className="bg-white p-5 rounded-2xl border shadow-sm" style={{ borderColor: "#e7e5e4" }}>
      <div className="flex items-start justify-between mb-4">
        <button onClick={() => onViewProfile(author.id)} className="flex items-center space-x-3 text-left hover:opacity-80 transition-opacity min-w-0 flex-1">
          <AuthorAvatar name={author.name} src={avatar} size={48} />
          <div className="min-w-0">
            <p className="font-bold text-stone-900">{author.name}</p>
            <p className="text-xs text-stone-600">{author.headline}</p>
            <p className="text-xs text-stone-600">{post.timestamp}{post.edited ? ' · Edited' : ''}</p>
          </div>
        </button>

        <PostActionsMenu
          isOwn={!!isOwnPost}
          onEdit={onEditPost ? () => setMode('edit') : undefined}
          onDelete={onDeletePost ? () => setMode('delete') : undefined}
          onReport={onReportContent ? () => onReportContent(String((post as any)._firestoreId ?? post.id), post.content?.slice(0, 80) ?? '') : undefined}
        />
      </div>
      {mode === 'delete' && onDeletePost && (
        <DeleteConfirm onCancel={() => setMode('view')} onConfirm={() => onDeletePost(post)} />
      )}
      {mode === 'edit' && onEditPost && (
        <PostEditBox
          initial={post.content ?? ''}
          allowEmpty={!!post.linkPreview}
          onCancel={() => setMode('view')}
          onSave={async (content) => { await onEditPost(post, content); setMode('view'); }}
        />
      )}
      {mode !== 'edit' && post.content && <LinkifiedText text={post.content} className={`text-stone-700 whitespace-pre-wrap ${post.linkPreview ? 'mb-3' : 'mb-4'}`} />}
      {post.linkPreview && <div className="mb-4"><LinkPreviewCard preview={post.linkPreview} /></div>}
      <div className="flex justify-between items-center text-sm text-stone-600 mb-2">
          <div className="flex items-center space-x-4">
             {post.appreciations.helpful > 0 && <span className="flex items-center">🔥 {post.appreciations.helpful}</span>}
             {post.appreciations.thoughtProvoking > 0 && <span className="flex items-center">🧠 {post.appreciations.thoughtProvoking}</span>}
             {post.appreciations.collaborationReady > 0 && <span className="flex items-center">🤝 {post.appreciations.collaborationReady}</span>}
          </div>
          {post.comments > 0 && <span>{post.comments} Comments</span>}
      </div>
      <div className="border-t pt-2 -mx-1 sm:mx-0" style={{ borderColor: "#e7e5e4" }}>
        <div className="flex justify-between sm:justify-around overflow-x-auto scrollbar-hide px-1 sm:px-0 gap-0.5 sm:gap-1">
          <ActionButton icon={<HelpfulIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0"/>} className="" label="Like" onClick={() => onAppreciatePost(post.id, 'helpful')}/>
          <ActionButton icon={<ThoughtProvokingIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0"/>} className="" label="Insightful" onClick={() => onAppreciatePost(post.id, 'thoughtProvoking')}/>
          <ActionButton icon={<CollaborationReadyIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0"/>} className="" label="Collab" onClick={() => onAppreciatePost(post.id, 'collaborationReady')}/>
          <ActionButton icon={<CommentIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0"/>} className="" label="Comment"/>
          <ActionButton icon={<ShareIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0"/>} className="" label="Share"/>
        </div>
      </div>
    </div>
  );
};

export default PostCard;
