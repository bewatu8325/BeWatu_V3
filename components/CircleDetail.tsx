import React, { useMemo, useState, useCallback } from 'react';
import PeerLearning from './PeerLearning';
import { Circle, Post, User, AppreciationType, Article } from '../types';
import CreatePost from './CreatePost';
import PodPostCard from './PodPostCard';
import { CirclesIcon, UsersIcon, ShieldCheckIcon, VerifiedIcon } from '../constants';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  PodNotificationPrefs,
  PodCatchUp,
  GenerationalInsight,
  PodChallenge,
  PodChallengeCard,
  PostChallengeForm,
  SmartMemberSuggestions,
  ConversationStarter,
  PodHealthNarrative,
  RoleStageBadge,
  type PodChallengeData,
} from './PodFeatures';

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

// Invite member — searchable dropdown, sends invite notification instead of adding directly
const InviteMember: React.FC<{
  allUsers: User[];
  circleMembers: number[];
  pendingInvites: number[];
  circleName: string;
  onInvite: (userId: number) => void;
}> = ({ allUsers, circleMembers, pendingInvites, circleName, onInvite }) => {
  const [query,    setQuery]    = useState('');
  const [feedback, setFeedback] = useState('');
  const [showList, setShowList] = useState(false);

  // Users not yet members and not yet invited — show in search
  const eligible = allUsers.filter(u =>
    !circleMembers.includes(u.id) &&
    !pendingInvites.includes(u.id) &&
    (u.name.toLowerCase().includes(query.toLowerCase()) ||
     (u as any).headline?.toLowerCase().includes(query.toLowerCase())) &&
    query.trim().length > 0
  ).slice(0, 6);

  // Users with pending invites that match search — show with resend option
  const pendingMatching = allUsers.filter(u =>
    pendingInvites.includes(u.id) &&
    !circleMembers.includes(u.id) &&
    query.trim().length > 0 &&
    (u.name.toLowerCase().includes(query.toLowerCase()) ||
     (u as any).headline?.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 3);

  const handleInvite = (user: User, isResend = false) => {
    onInvite(user.id);
    setFeedback(isResend ? `Invite resent to ${user.name}` : `Invite sent to ${user.name}`);
    setQuery('');
    setShowList(false);
    setTimeout(() => setFeedback(''), 3000);
  };

  const showDropdown = showList && query.trim().length > 0 &&
    (eligible.length > 0 || pendingMatching.length > 0);

  return (
    <div className="mt-4 p-3 bg-stone-50 rounded-xl border" style={{ borderColor: '#e7e5e4' }}>
      <h4 className="text-sm font-semibold text-stone-700 mb-1">Invite member</h4>
      <p className="text-xs text-stone-400 mb-2">They'll receive an invite and can choose to accept or decline.</p>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowList(true); }}
          onFocus={() => setShowList(true)}
          onBlur={() => setTimeout(() => setShowList(false), 150)}
          placeholder="Search by name or headline…"
          className="w-full p-2 bg-white text-stone-800 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
          style={{ borderColor: '#e7e5e4' }}
        />
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-20 overflow-hidden"
            style={{ borderColor: '#e7e5e4' }}>
            {eligible.map(u => (
              <button key={u.id} onMouseDown={() => handleInvite(u)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left">
                {(u as any).avatarUrl
                  ? <img src={(u as any).avatarUrl} alt={u.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: '#1a4a3a' }}>{u.name[0]}</div>
                }
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate">{u.name}</p>
                  <p className="text-xs text-stone-400 truncate">{(u as any).headline}</p>
                </div>
                <span className="text-xs font-medium ml-auto px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#e8f4f0', color: '#1a4a3a' }}>Invite</span>
              </button>
            ))}
            {pendingMatching.length > 0 && (
              <>
                {eligible.length > 0 && (
                  <div className="px-3 py-1 border-t" style={{ borderColor: '#f5f5f4' }}>
                    <p className="text-xs text-stone-400">Invite pending</p>
                  </div>
                )}
                {pendingMatching.map(u => (
                  <button key={u.id} onMouseDown={() => handleInvite(u, true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 transition-colors text-left">
                    {(u as any).avatarUrl
                      ? <img src={(u as any).avatarUrl} alt={u.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: '#d97706' }}>{u.name[0]}</div>
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{u.name}</p>
                      <p className="text-xs text-amber-600 truncate">Invite pending — tap to resend</p>
                    </div>
                    <span className="text-xs font-medium ml-auto px-2 py-0.5 rounded-full flex-shrink-0 border"
                      style={{ borderColor: '#fde68a', color: '#d97706', backgroundColor: '#fef3c7' }}>Resend</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {showList && query.trim().length > 0 && !showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-sm z-20 px-3 py-2.5"
            style={{ borderColor: '#e7e5e4' }}>
            <p className="text-xs text-stone-400">No matching users found</p>
          </div>
        )}
      </div>
      {feedback && <p className="text-xs mt-2 font-medium" style={{ color: '#1a4a3a' }}>{feedback}</p>}
    </div>
  );
};

// Join requests panel — shown to admin
const JoinRequests: React.FC<{
  pendingMembers: number[];
  allUsers: User[];
  onApprove: (userId: number) => void;
  onDecline: (userId: number) => void;
}> = ({ pendingMembers, allUsers, onApprove, onDecline }) => {
  if (pendingMembers.length === 0) return null;

  return (
    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
      <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
        <span className="w-4 h-4 rounded-full bg-amber-400 text-white text-xs flex items-center justify-center font-bold">{pendingMembers.length}</span>
        Pending requests
      </h4>
      <div className="space-y-2">
        {pendingMembers.map(uid => {
          const user = allUsers.find(u => u.id === uid);
          if (!user) return null;
          return (
            <div key={uid} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-amber-100">
              {(user as any).avatarUrl
                ? <img src={(user as any).avatarUrl} alt={user.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                : <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: '#1a4a3a' }}>{user.name[0]}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-800 truncate">{user.name}</p>
                <p className="text-xs text-stone-400 truncate">{(user as any).headline}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => onApprove(uid)}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg text-white"
                  style={{ backgroundColor: '#1a4a3a' }}>Accept</button>
                <button onClick={() => onDecline(uid)}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg border hover:bg-stone-50"
                  style={{ borderColor: '#e7e5e4', color: '#6b7280' }}>Decline</button>
              </div>
            </div>
          );
        })}
      </div>
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
  onInviteMember: (circleId: number, userId: number) => void;
  onAddMember: (circleId: number, userId: number) => void;
  onRemoveMember: (circleId: number, userId: number) => void;
  onApproveJoinRequest: (circleId: number, userId: number) => void;
  onDeclineJoinRequest: (circleId: number, userId: number) => void;
  onLeaveCircle?: (circleId: number) => void;
  onViewProfile: (userId: number) => void;
  lastVisited?: Date;
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
  onInviteMember,
  onAddMember,
  onRemoveMember,
  onApproveJoinRequest,
  onDeclineJoinRequest,
  onLeaveCircle,
  onViewProfile,
  lastVisited,
}) => {
  const [activeTab, setActiveTab] = useState<'discussion' | 'challenges' | 'learn' | 'articles'>('discussion');
  const [challenges,       setChallenges]       = useState<PodChallengeData[]>([]);
  const [showChallengeForm, setShowChallengeForm] = useState(false);
  const { fbUser } = useFirebase();

  const pendingInvites  = (circle as any).pendingInvites  ?? [] as number[];
  const pendingMembers  = (circle as any).pendingMembers  ?? [] as number[];
  const isGenerationalPod = !!(circle as any).slots;
  const currentUserStage  = (currentUser as any).careerStage ?? undefined;

  // Map stage from user doc for generational pods
  const getUserStage = (userId: number) => {
    const u = allUsers.find(u => u.id === userId) as any;
    return u?.careerStage ?? undefined;
  };

  // Pod challenge handlers
  const handlePostChallenge = useCallback(async (question: string, context: string, deadline?: Date) => {
    const newChallenge: PodChallengeData = {
      id:        `ch_${Date.now()}`,
      podId:     String(circle.id),
      question,
      context,
      postedBy:  currentUser.name,
      postedAt:  new Date(),
      deadline,
      responses: [],
      status:    'open',
    };
    setChallenges(cs => [newChallenge, ...cs]);
    setShowChallengeForm(false);
    // Persist to Firestore
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      await addDoc(collection(db, 'circles', (circle as any)._firestoreId, 'challenges'), {
        ...newChallenge, postedAt: serverTimestamp(), deadline: deadline ?? null,
      });
    } catch (err) { console.error('Failed to save challenge:', err); }
  }, [circle, currentUser]);

  const handleChallengeResponse = useCallback(async (challengeId: string, responseContent: string) => {
    const newResponse = {
      id:          `r_${Date.now()}`,
      authorId:    currentUser.id,
      authorName:  currentUser.name,
      authorStage: currentUserStage,
      content:     responseContent,
      createdAt:   new Date(),
      upvotes:     0,
    };
    setChallenges(cs => cs.map(c => c.id === challengeId
      ? { ...c, responses: [...c.responses, newResponse] } : c));
  }, [currentUser, currentUserStage]);

  const handleChallengeSynthesise = useCallback(async (challengeId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;
    try {
      const byStage = challenge.responses.reduce((acc, r) => {
        if (!r.authorStage) return acc;
        if (!acc[r.authorStage]) acc[r.authorStage] = [];
        acc[r.authorStage].push(r.content);
        return acc;
      }, {} as Record<string, string[]>);

      const stageBlocks = Object.entries(byStage).map(([stage, msgs]) =>
        `${stage} professionals: ${msgs.join(' | ')}`
      ).join('\n');

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Synthesise these responses to the pod challenge "${challenge.question}".

${stageBlocks}

Write 2-3 sentences highlighting the most interesting agreements or tensions across career stages. Be specific. Do not use bullet points.`,
          maxTokens: 250,
        }),
      });
      const data = await res.json();
      const synthesis = (data.text ?? data.content ?? '').trim();
      setChallenges(cs => cs.map(c => c.id === challengeId
        ? { ...c, synthesis, status: 'synthesised' } : c));
    } catch (err) { console.error('Synthesis failed:', err); }
  }, [challenges]);

  const handleChallengeUpvote = useCallback(async (challengeId: string, responseId: string) => {
    setChallenges(cs => cs.map(c => c.id === challengeId ? {
      ...c,
      responses: c.responses.map(r => r.id === responseId ? { ...r, upvotes: r.upvotes + 1 } : r),
    } : c));
  }, []);
    

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
                    <button onClick={() => setActiveTab('challenges')} className={`px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'challenges' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`} style={activeTab==='challenges'?{color:'#1a4a3a',borderColor:'#1a4a3a'}:{}}>Challenges{challenges.length > 0 ? ` (${challenges.length})` : ''}</button>
                    <button onClick={() => setActiveTab('learn')} className={`flex items-center gap-1.5 px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'learn' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`} style={activeTab==='learn'?{color:'#1a4a3a',borderColor:'#1a4a3a'}:{}}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>
                      Learn
                    </button>
                    <button onClick={() => setActiveTab('articles')} className={`px-3 py-2 font-semibold text-sm transition-colors ${activeTab === 'articles' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`} style={activeTab==='articles'?{color:'#1a4a3a',borderColor:'#1a4a3a'}:{}}>Articles ({circleArticles.length})</button>
                </nav>
            </div>
            
            {activeTab === 'discussion' && (
                <>
                    {/* AI Catch-up — shown when user has been away */}
                    <PodCatchUp
                      podName={circle.name}
                      podTopic={(circle as any).topic}
                      recentPosts={circlePosts.map(p => ({
                        content: p.content,
                        authorName: findAuthor(p.authorId)?.name ?? 'Someone',
                        authorStage: getUserStage(p.authorId),
                        createdAt: (p as any).createdAt,
                      }))}
                      lastVisited={lastVisited}
                    />

                    {/* Conversation starter when pod is quiet */}
                    <ConversationStarter
                      podName={circle.name}
                      podTopic={(circle as any).topic}
                      lastPostDate={
                        circlePosts[0]
                          ? ((circlePosts[0] as any).createdAt?.toDate?.() ?? undefined)
                          : ((circle as any).createdAt?.toDate?.() ?? undefined)
                      }
                      isAdmin={isCurrentUserAdmin}
                      circleId={circle.id}
                      onPost={(content) => addPost(content, circle.id)}
                    />

                    <CreatePost addPost={addPost} currentUser={currentUser} circleId={circle.id} />
                    {/* Generational insight — only for gen pods with enough posts */}
                    {isGenerationalPod && circlePosts.length >= 4 && (
                      <GenerationalInsight
                        podName={circle.name}
                        posts={circlePosts.slice(0, 10).map(p => ({
                          content: p.content,
                          authorName: findAuthor(p.authorId)?.name ?? '',
                          stage: getUserStage(p.authorId),
                        }))}
                      />
                    )}

                    {circlePosts.length > 0 ? (
                        <div className="space-y-4">
                        {circlePosts.map(post => {
                            const author = findAuthor(post.authorId);
                            return author ? (
                                <PodPostCard key={post.id} post={post} author={author} currentUser={currentUser} circleFirestoreId={(circle as any)._firestoreId} onAppreciatePost={onAppreciatePost} onViewProfile={onViewProfile} />
                            ) : null;
                        })}
                        </div>
                    ) : (
                         <div className="text-center py-10 bg-stone-50 rounded-2xl border" style={{ borderColor:"#e7e5e4" }}>
                            <p className="text-stone-400">No posts in this pod yet. Be the first to share something!</p>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'challenges' && (
              <div className="space-y-4">
                {isCurrentUserAdmin && !showChallengeForm && (
                  <button onClick={() => setShowChallengeForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90"
                    style={{ background: '#1a4a3a' }}>
                    + Post a challenge
                  </button>
                )}
                {showChallengeForm && (
                  <PostChallengeForm
                    podId={String(circle.id)}
                    podName={circle.name}
                    onPost={handlePostChallenge}
                    onCancel={() => setShowChallengeForm(false)}
                  />
                )}
                {challenges.length === 0 ? (
                  <div className="text-center py-12 bg-stone-50 rounded-2xl border" style={{ borderColor: '#e7e5e4' }}>
                    <p className="text-stone-400 text-sm">No challenges yet.</p>
                    {isCurrentUserAdmin && <p className="text-xs text-stone-400 mt-1">Post a challenge to spark cross-generational discussion.</p>}
                  </div>
                ) : (
                  challenges.map(ch => (
                    <PodChallengeCard
                      key={ch.id}
                      challenge={ch}
                      currentUser={{ id: currentUser.id, name: currentUser.name, stage: currentUserStage }}
                      isAdmin={isCurrentUserAdmin}
                      onRespond={handleChallengeResponse}
                      onSynthesise={handleChallengeSynthesise}
                      onUpvote={handleChallengeUpvote}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'learn' && (
                <PeerLearning
                  circleId={circle.id}
                  allUsers={allUsers}
                  currentUser={currentUser}
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
                            <p className="text-stone-400">No articles have been published in this pod yet.</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="col-span-12 md:col-span-4 space-y-6">
            {/* Pod health narrative */}
            <PodHealthNarrative
              podName={circle.name}
              memberCount={circle.members.length}
              postCount={circlePosts.length}
              activeMembers={new Set(circlePosts.slice(0, 20).map(p => p.authorId)).size}
            />

            {/* Notification preferences */}
            {fbUser && (
              <div className="flex items-center justify-between bg-white rounded-2xl border px-4 py-3" style={{ borderColor: '#e7e5e4' }}>
                <span className="text-xs font-semibold text-stone-600">Notifications</span>
                <PodNotificationPrefs
                  podId={(circle as any)._firestoreId ?? String(circle.id)}
                  podName={circle.name}
                  userUid={fbUser.uid}
                />
              </div>
            )}

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
                  <JoinRequests
                    pendingMembers={pendingMembers}
                    allUsers={allUsers}
                    onApprove={(uid) => onApproveJoinRequest(circle.id, uid)}
                    onDecline={(uid) => onDeclineJoinRequest(circle.id, uid)}
                  />
                )}
                {isCurrentUserAdmin && (
                  <InviteMember
                    allUsers={allUsers}
                    circleMembers={circle.members}
                    pendingInvites={pendingInvites}
                    circleName={circle.name}
                    onInvite={(uid) => onInviteMember(circle.id, uid)}
                  />
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default CircleDetail;
