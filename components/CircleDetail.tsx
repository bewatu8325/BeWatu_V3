import React, { useMemo, useState } from 'react';
import { Circle, Post, User, AppreciationType, Article } from '../types';
import CreatePost from './CreatePost';
import PostCard from './PostCard';
import { CirclesIcon, UsersIcon, ShieldCheckIcon, VerifiedIcon } from '../constants';

const ArticleCard: React.FC<{ article: Article, author?: User, onViewProfile: (userId: number) => void }> = ({ article, author, onViewProfile }) => (
    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
        <h2 className="text-xl font-bold text-cyan-400 mb-2">{article.title}</h2>
        <div className="flex items-center space-x-2 mb-4 text-xs text-slate-400">
            {author ? (
              <button onClick={() => onViewProfile(author.id)} className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                <img src={author.avatarUrl} alt={author.name} className="w-6 h-6 rounded-full"/>
                <span>{author.name}</span>
                {author.isVerified && <VerifiedIcon className="w-4 h-4 text-cyan-400" title="Verified Work Email" />}
              </button>
            ) : (<span>Unknown Author</span>)}
            <span>&bull;</span>
            <span>{article.timestamp}</span>
        </div>
        <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-wrap leading-relaxed">
            {article.content}
        </div>
    </div>
);

const AddMember: React.FC<{ allUsers: User[]; circleMembers: number[]; onAdd: (userId: number) => void }> = ({ allUsers, circleMembers, onAdd }) => {
    const [userName, setUserName] = useState('');
    const [feedback, setFeedback] = useState('');

    const handleAdd = () => {
        const userToAdd = allUsers.find(u => u.name.toLowerCase() === userName.toLowerCase().trim());
        if (!userToAdd) {
            setFeedback(`User "${userName}" not found.`);
            return;
        }
        if (circleMembers.includes(userToAdd.id)) {
            setFeedback(`${userName} is already a member.`);
            return;
        }
        onAdd(userToAdd.id);
        setFeedback(`${userToAdd.name} has been added.`);
        setUserName('');
        setTimeout(() => setFeedback(''), 3000);
    };

    return (
        <div className="mt-4 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
            <h4 className="text-sm font-semibold text-slate-300 mb-2">Add Member</h4>
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter user's full name"
                    className="flex-grow p-1.5 bg-slate-800 text-slate-200 border border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button onClick={handleAdd} className="bg-cyan-600 text-white font-semibold px-3 py-1 rounded-md text-sm hover:bg-cyan-500 transition-colors">Add</button>
            </div>
            {feedback && <p className="text-xs text-cyan-300 mt-2">{feedback}</p>}
        </div>
    );
};


interface CircleDetailProps {
  circle: Circle;
  allPosts: Post[];
  allArticles: Article[];
  allUsers: User[];
  currentUser: User;
  addPost: (content: string, circleId?: number) => void;
  findAuthor: (authorId: number) => User | undefined;
  onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
  onAddMember: (circleId: number, userId: number) => void;
  onRemoveMember: (circleId: number, userId: number) => void;
  onViewProfile: (userId: number) => void;
}

const CircleDetail: React.FC<CircleDetailProps> = ({
  circle,
  allPosts,
  allArticles,
  allUsers,
  currentUser,
  addPost,
  findAuthor,
  onAppreciatePost,
  onAddMember,
  onRemoveMember,
  onViewProfile
}) => {
  const [activeTab, setActiveTab] = useState<'discussion' | 'articles'>('discussion');

  const circlePosts = useMemo(
    () => allPosts.filter(post => post.circleId === circle.id).sort((a, b) => b.id - a.id),
    [allPosts, circle.id]
  );
  
  const circleMembers = useMemo(
    () => allUsers.filter(user => circle.members.includes(user.id)),
    [allUsers, circle.members]
  );

  const circleArticles = useMemo(
      () => allArticles.filter(article => article.circleId === circle.id).sort((a,b) => b.id - a.id),
      [allArticles, circle.id]
  );

  const isCurrentUserAdmin = currentUser.id === circle.adminId;
  const adminUser = useMemo(() => allUsers.find(u => u.id === circle.adminId), [allUsers, circle.adminId]);


  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
        <div className="flex items-start space-x-4 mb-4">
            <div className="p-3 bg-purple-900/50 rounded-lg border border-purple-500/30">
                <CirclesIcon className="w-8 h-8 text-purple-400"/>
            </div>
            <div>
                <h1 className="text-3xl font-bold text-slate-100">{circle.name}</h1>
                <p className="text-slate-400">{circle.description}</p>
            </div>
        </div>
        <div className="flex items-center space-x-4 text-slate-400 text-sm">
            <div className="flex items-center space-x-2">
                <UsersIcon className="w-5 h-5"/>
                <span>{circle.members.length} members</span>
            </div>
            {adminUser && (
                <>
                 <span className="text-slate-600">|</span>
                 <div className="flex items-center space-x-2">
                    <ShieldCheckIcon className="w-5 h-5 text-green-500" />
                    <span>Admin: {adminUser.name}</span>
                 </div>
                </>
            )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-8 space-y-6">
            <div className="border-b border-slate-700">
                <nav className="flex space-x-4">
                    <button onClick={() => setActiveTab('discussion')} className={`px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'discussion' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}>Discussion</button>
                    <button onClick={() => setActiveTab('articles')} className={`px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'articles' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}>Articles ({circleArticles.length})</button>
                </nav>
            </div>
            
            {activeTab === 'discussion' && (
                <>
                    <CreatePost addPost={addPost} currentUser={currentUser} circleId={circle.id} />
                    {circlePosts.length > 0 ? (
                        <div className="space-y-4">
                        {circlePosts.map(post => {
                            const author = findAuthor(post.authorId);
                            return author ? (
                                <PostCard key={post.id} post={post} author={author} onAppreciatePost={onAppreciatePost} onViewProfile={onViewProfile} />
                            ) : null;
                        })}
                        </div>
                    ) : (
                         <div className="text-center py-10 bg-slate-800/50 rounded-xl border border-slate-700">
                            <p className="text-slate-400">No posts in this circle yet. Be the first to share something!</p>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'articles' && (
                 <div className="space-y-4">
                    {circleArticles.length > 0 ? (
                        circleArticles.map(article => (
                            <ArticleCard key={article.id} article={article} author={findAuthor(article.authorId)} onViewProfile={onViewProfile} />
                        ))
                    ) : (
                         <div className="text-center py-10 bg-slate-800/50 rounded-xl border border-slate-700">
                            <p className="text-slate-400">No articles have been published in this circle yet.</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="col-span-12 md:col-span-4 space-y-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                <h3 className="font-semibold text-slate-200 mb-3">Members ({circleMembers.length})</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {circleMembers.map(member => (
                        <div key={member.id} className="flex justify-between items-center">
                            <button onClick={() => onViewProfile(member.id)} className="flex items-center space-x-3 w-full text-left p-2 rounded-md hover:bg-slate-700/50 transition-colors">
                                <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover"/>
                                <div>
                                    <div className="flex items-center space-x-1.5">
                                      <p className="font-semibold text-slate-200 text-sm">{member.name}</p>
                                      {member.isVerified && <VerifiedIcon className="w-3 h-3 text-cyan-400" title="Verified Work Email" />}
                                    </div>
                                    <p className="text-xs text-slate-400">{member.headline}</p>
                                </div>
                            </button>
                            {isCurrentUserAdmin && currentUser.id !== member.id && (
                                <button onClick={() => onRemoveMember(circle.id, member.id)} className="text-xs text-red-400 hover:underline px-2">Remove</button>
                            )}
                        </div>
                    ))}
                </div>
                {isCurrentUserAdmin && <AddMember allUsers={allUsers} circleMembers={circle.members} onAdd={(userId) => onAddMember(circle.id, userId)} />}
            </div>
        </div>
      </div>
    </div>
  );
};

export default CircleDetail;