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
    <button onClick={onClick} className={`flex items-center space-x-2 text-stone-400 hover:bg-stone-50 rounded-lg px-3 py-2 transition-colors w-full justify-center ${className}`}>
        {icon}
        <span className="text-sm font-semibold">{label}</span>
    </button>
);


const PostCard: React.FC<PostCardProps> = ({ post, author, onAppreciatePost, onViewProfile }) => {
  return (
    <div className="bg-white p-5 rounded-2xl border shadow-sm" style={{ borderColor: "#e7e5e4" }}>
      <button onClick={() => onViewProfile(author.id)} className="flex items-center space-x-3 mb-4 text-left hover:opacity-80 transition-opacity">
        <img src={author.avatarUrl} alt={author.name} className="w-12 h-12 rounded-full object-cover" />
        <div>
          <p className="font-bold text-stone-900">{author.name}</p>
          <p className="text-xs text-stone-500">{author.headline}</p>
          <p className="text-xs text-stone-400">{post.timestamp}</p>
        </div>
      </button>
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
