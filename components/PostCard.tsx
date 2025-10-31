import React from 'react';
import { Post, User, AppreciationType } from '../types';
import { CommentIcon, ShareIcon, HelpfulIcon, ThoughtProvokingIcon, CollaborationReadyIcon } from '../constants';

interface PostCardProps {
  post: Post;
  author: User;
  onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
  onViewProfile: (userId: number) => void;
}

const ActionButton: React.FC<{icon: React.ReactNode, label: string | number, onClick?: () => void, className?: string}> = ({ icon, label, onClick, className }) => (
    <button onClick={onClick} className={`flex items-center space-x-2 text-slate-400 hover:bg-slate-700/50 rounded-md px-3 py-2 transition-colors w-full justify-center ${className}`}>
        {icon}
        <span className="text-sm font-semibold">{label}</span>
    </button>
);


const PostCard: React.FC<PostCardProps> = ({ post, author, onAppreciatePost, onViewProfile }) => {
  return (
    <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
      <button onClick={() => onViewProfile(author.id)} className="flex items-center space-x-3 mb-4 text-left hover:opacity-80 transition-opacity">
        <img src={author.avatarUrl} alt={author.name} className="w-12 h-12 rounded-full object-cover" />
        <div>
          <p className="font-bold text-slate-200">{author.name}</p>
          <p className="text-xs text-slate-400">{author.headline}</p>
          <p className="text-xs text-slate-500">{post.timestamp}</p>
        </div>
      </button>
      <p className="text-slate-300 mb-4 whitespace-pre-wrap">{post.content}</p>
      <div className="flex justify-between items-center text-sm text-slate-500 mb-2">
          <div className="flex items-center space-x-4">
             {post.appreciations.helpful > 0 && <span className="flex items-center">🔥 {post.appreciations.helpful}</span>}
             {post.appreciations.thoughtProvoking > 0 && <span className="flex items-center">🧠 {post.appreciations.thoughtProvoking}</span>}
             {post.appreciations.collaborationReady > 0 && <span className="flex items-center">🤝 {post.appreciations.collaborationReady}</span>}
          </div>
          {post.comments > 0 && <span>{post.comments} Comments</span>}
      </div>
      <div className="border-t border-slate-700 pt-1 flex justify-around space-x-1">
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