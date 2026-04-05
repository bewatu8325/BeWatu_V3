import React, { useMemo, useState } from 'react';
import IdeaNetwork from './IdeaNetwork';
import PeerLearning from './PeerLearning';
import { Circle, Post, User, AppreciationType, Article } from '../types';
import CreatePost from './CreatePost';
import PostCard from './PostCard';
import { CirclesIcon, UsersIcon, ShieldCheckIcon, VerifiedIcon } from '../constants';

const ArticleCard: React.FC<{ article: Article, author?: User, onViewProfile: (userId: number) => void }> = ({ article, author, onViewProfile }) => (
    <div className="bg-white p-6 rounded-2xl border shadow-sm" style={{ borderColor:"#e7e5e4" }}>
        <h2 className="text-xl font-bold mb-2" style={{ color:"#1a4a3a" }}>{article.title}</h2>
        <div className="flex items-center space-x-2 mb-4 text-xs text-stone-400">
            {author ? (
              <button onClick={() => onViewProfile(author.id)} className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                <img src={author.avatarUrl} alt={author.name} className="w-6 h-6 rounded-full"/>
                <span>{author.name}</span>
                {author.isVerified && <VerifiedIcon className="w-4 h-4" style={{ color:"#1a4a3a" }} title="Verified Work Email" />}
              </button>
            ) : (<span>Unknown Author</span>)}
            <span>&bull;</span>
            <span>{article.timestamp}</span>
        </div>
        <div className="prose prose-sm max-w-none text-stone-700 whitespace-pre-wrap leading-relaxed">
            {article.content}
        </div>
    </div>
);

const AddMember: React.FC<{ allUsers: User[]; circleMembers: number[]; onAdd: (userId: number) => void }> = ({ allUsers, circleMembers, onAdd }) => {
    const [query,    setQuery]    = useState('');
    const [feedback, setFeedback] = useState('');
    const [showList, setShowList] = useState(false);

    const eligible = allUsers.filter(u =>
        !circleMembers.includes(u.id) &&
        (u.name.toLowerCase().includes(query.toLowerCase()) ||
         u.headline?.toLowerCase().includes(query.toLowerCase())) &&
        query.trim().length > 0
    ).slice(0, 6);

    const handleAdd = (user: User) => {
        onAdd(user.id);
        setFeedback(`${user.name} added.`);
        setQuery('');
        setShowList(false);
        setTimeout(() => setFeedback(''), 3000);
    };

    return (
        <div className="mt-4 p-3 bg-stone-50 rounded-xl border" style={{ borderColor:'#e7e5e4' }}>
            <h4 className="text-sm font-semibold text-stone-700 mb-2">Add Member</h4>
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setShowList(true); }}
                    onFocus={() => setShowList(true)}
                    onBlur={() => setTimeout(() => setShowList(false), 150)}
                    placeholder="Search by name or headline…"
                    className="w-full p-2 bg-white text-stone-800 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                    style={{ borderColor:'#e7e5e4' }}
                />
                {showList && eligible.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-20 overflow-hidden"
                        style={{ borderColor:'#e7e5e4' }}>
                        {eligible.map(u => (
                            <button key={u.id} onMouseDown={() => handleAdd(u)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left">
                                {u.avatarUrl
                                    ? <img src={u.avatarUrl} alt={u.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                                    : <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor:'#1a4a3a' }}>{u.name[0]}</div>
                                }
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-stone-800 truncate">{u.name}</p>
                                    <p className="text-xs text-stone-400 truncate">{u.headline}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {feedback && <p className="text-xs mt-2 font-medium" style={{ color:'#1a4a3a' }}>{feedback}</p>}
        </div>
    );
};

// Invite link generator for non-admin members
const InviteLink: React.FC<{ circleId: number; circleName: string }> = ({ circleId, circleName }) => {
    const [copied, setCopied] = useState(false);
    const link = `${window.location.origin}?join=${circleId}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="mt-3 p-3 bg-stone-50 rounded-xl border" style={{ borderColor:'#e7e5e4' }}>
            <h4 className="text-sm font-semibold text-stone-700 mb-2">Invite members</h4>
            <button onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border transition-all"
                style={{
                    borderColor: copied ? '#1a4a3a' : '#e7e5e4',
                    color: copied ? '#1a4a3a' : '#6b7280',
                    backgroundColor: copied ? '#e8f4f0' : 'white',
                }}>
                {copied ? '✓ Link copied!' : '🔗 Copy invite link'}
            </button>
            <p className="text-xs text-stone-400 mt-1.5 text-center">
                Share this link to invite people to {circleName}
            </p>
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
  onLeaveCircle?: (circleId: number) => void;
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
  onLeaveCircle,
  onViewProfile
}) => {
  const [activeTab, setActiveTab] = useState<'discussion' | 'learn' | 'articles' | 'ideas'>('discussion');
    

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
      <div className="bg-white p-6 rounded-2xl border shadow-sm" style={{ borderColor:"#e7e5e4" }}>
        <div className="flex items-start space-x-4 mb-4">
            <div className="p-3 rounded-xl border" style={{ backgroundColor:"#e8f4f0", borderColor:"#1a6b52" }}>
                <CirclesIcon className="w-8 h-8" style={{ color:"#1a4a3a" }}/>
            </div>
            <div>
                <h1 className="text-3xl font-bold text-stone-900">{circle.name}</h1>
                <p className="text-stone-500">{circle.description}</p>
            </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-stone-400 text-sm">
            <div className="flex items-center space-x-2">
                <UsersIcon className="w-5 h-5"/>
                <span>{circle.members.length} members</span>
            </div>
            {adminUser && (
                <>
                 <span className="text-stone-300">|</span>
                 <div className="flex items-center space-x-2">
                    <ShieldCheckIcon className="w-5 h-5 text-green-500" />
                    <span>Admin: {adminUser.name}</span>
                 </div>
                </>
            )}
          </div>
          {/* Leave pod — only for non-admin members */}
          {!isCurrentUserAdmin && circle.members.includes(currentUser.id) && onLeaveCircle && (
            <button
              onClick={() => onLeaveCircle(circle.id)}
              className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors font-medium">
              Leave pod
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-8 space-y-6">
            <div className="border-b" style={{ borderColor:"#e7e5e4" }}>
                <nav className="flex space-x-4">
                    <button onClick={() => setActiveTab('discussion')} className={`px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'discussion' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`} style={activeTab==='discussion'?{color:'#1a4a3a',borderColor:'#1a4a3a'}:{}}>Discussion</button>
                    <button onClick={() => setActiveTab('learn')} className={`flex items-center gap-1.5 px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'learn' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`} style={activeTab==='learn'?{color:'#1a4a3a',borderColor:'#1a4a3a'}:{}}>
                        <button onClick={() => setActiveTab('ideas')} className={`flex items-center gap-1.5 px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'ideas' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`} style={activeTab === 'ideas' ? { color:'#1a4a3a', borderColor:'#1a4a3a' } : {}} >
             <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"> <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/> </svg>
             Ideas
            </button>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>
                      Learn
                    </button>
                    <button onClick={() => setActiveTab('articles')} className={`px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'articles' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`} style={activeTab==='articles'?{color:'#1a4a3a',borderColor:'#1a4a3a'}:{}}>Articles ({circleArticles.length})</button>
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
                         <div className="text-center py-10 bg-stone-50 rounded-2xl border" style={{ borderColor:"#e7e5e4" }}>
                            <p className="text-stone-400">No posts in this circle yet. Be the first to share something!</p>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'learn' && (
                <PeerLearning
                  circleId={circle.id}
                  allUsers={allUsers}
                  currentUser={currentUser}
                />
            )}

            {activeTab === 'ideas' && (
                <IdeaNetwork
                    currentUser={currentUser}
                    podId={circle.id}
                    onArenaLaunch={(idea) => console.log('Arena launch:', idea)} // wire to Sprint 3
                />
            )}

            {activeTab === 'articles' && (
                 <div className="space-y-4">
                    {circleArticles.length > 0 ? (
                        circleArticles.map(article => (
                            <ArticleCard key={article.id} article={article} author={findAuthor(article.authorId)} onViewProfile={onViewProfile} />
                        ))
                    ) : (
                         <div className="text-center py-10 bg-stone-50 rounded-2xl border" style={{ borderColor:"#e7e5e4" }}>
                            <p className="text-stone-400">No articles have been published in this circle yet.</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="col-span-12 md:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor:"#e7e5e4" }}>
                <h3 className="font-semibold text-stone-800 mb-3">Members ({circleMembers.length})</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {circleMembers.map(member => (
                        <div key={member.id} className="flex justify-between items-center">
                            <button onClick={() => onViewProfile(member.id)} className="flex items-center space-x-3 w-full text-left p-2 rounded-xl hover:bg-stone-50 transition-colors">
                                <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover"/>
                                <div>
                                    <div className="flex items-center space-x-1.5">
                                      <p className="font-semibold text-stone-800 text-sm">{member.name}</p>
                                      {member.isVerified && <VerifiedIcon className="w-3 h-3" style={{ color:"#1a4a3a" }} title="Verified Work Email" />}
                                    </div>
                                    <p className="text-xs text-stone-500">{member.headline}</p>
                                </div>
                            </button>
                            {isCurrentUserAdmin && currentUser.id !== member.id && (
                                <button onClick={() => onRemoveMember(circle.id, member.id)} className="text-xs text-red-400 hover:underline px-2">Remove</button>
                            )}
                        </div>
                    ))}
                </div>
                {isCurrentUserAdmin && (
                  <AddMember allUsers={allUsers} circleMembers={circle.members} onAdd={(userId) => onAddMember(circle.id, userId)} />
                )}
                {circle.members.includes(currentUser.id) && (
                  <InviteLink circleId={circle.id} circleName={circle.name} />
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default CircleDetail;
