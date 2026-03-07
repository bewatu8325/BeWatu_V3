import React, { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import SparksTray from './components/sparks/SparksTray';
import ProveView from './components/ProveView';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';
import { AppData, Post, User, Job, View, Message, Company, AppreciationType, Circle, Notification } from './types';
import { analyzeSynergy, analyzeJobMatch, generateSkillsGraph } from './services/geminiService';
import { LoadingIcon } from './constants';
import { LanguageProvider } from './contexts/LanguageContext';
import { FirebaseProvider, useFirebase } from './contexts/FirebaseContext';

// ── Firebase auth ─────────────────────────────────────────────────────────────
import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  logout,
  forgotPassword,
  changePassword,
  updateUserInFirestore,
  setStripeCustomerId,
} from './lib/firebaseAuth';

// ── Firestore services (single import block) ──────────────────────────────────
import {
  createPost as fbCreatePost,
  fetchPosts,
  appreciatePost as fbAppreciatePost,
  sendMessage as fbSendMessage,
  fetchAllMessagesForUser,
  subscribeToMessages,
  sendConnectionRequest as fbSendConnectionRequest,
  respondToConnectionRequest as fbRespondToConnection,
  fetchConnectionRequests,
  fetchFollowRequests,
  sendFollowRequest as fbSendFollowRequest,
  respondToFollowRequest as fbRespondToFollowRequest,
  subscribeToNotifications,
  markNotificationsRead as fbMarkNotificationsRead,
  createJob as fbCreateJob,
  fetchJobs,
  updateJob as fbUpdateJob,
  deleteJob as fbDeleteJob,
  applyToJob as fbApplyToJob,
  fetchCircles,
  createCircle,
  fetchUsers,
  getOrCreateCompanyForRecruiter,
  applyToJobWithProfile,
} from './lib/firestoreService';

// ── Lazy-loaded components ────────────────────────────────────────────────────
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const HomePage = lazy(() => import('./components/HomePage'));
const People = lazy(() => import('./components/People'));
const Jobs = lazy(() => import('./components/Jobs'));
const Messaging = lazy(() => import('./components/Messaging'));
const CompanyProfileModal = lazy(() => import('./components/CompanyProfileModal'));
const CoPilotModal = lazy(() => import('./components/CoPilotModal'));
const SkillsGraphModal = lazy(() => import('./components/SkillsGraphModal'));
const ConnectionsView = lazy(() => import('./components/ConnectionsView'));
const VideoRecorderModal = lazy(() => import('./components/VideoRecorderModal'));
const VideoPlayerModal = lazy(() => import('./components/VideoPlayerModal'));
const Circles = lazy(() => import('./components/Circles'));
const CircleDetail = lazy(() => import('./components/CircleDetail'));
const AIChat = lazy(() => import('./components/AIChat'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const SecurityPrivacyPage = lazy(() => import('./components/SecurityPrivacyPage'));
const PublicProfilePage = lazy(() => import('./components/PublicProfilePage'));
const AboutPage = lazy(() => import('./components/AboutPage'));
const ConnectPage = lazy(() => import('./components/ConnectPage'));
const LoginPage = lazy(() => import('./components/auth/LoginPage'));
const RegistrationPage = lazy(() => import('./components/auth/RegistrationPage'));
const ForgotPasswordPage = lazy(() => import('./components/auth/ForgotPasswordPage'));
const RecruiterConsole = lazy(() => import('./components/recruiter/RecruiterConsole'));
const Footer = lazy(() => import('./components/Footer'));
const SuccessBanner = lazy(() => import('./components/SuccessBanner'));

type AuthState = 'landing' | 'login' | 'register' | 'forgot_password' | 'authenticated' | 'about' | 'connect';
type ActiveProfile = 'user' | 'recruiter';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
const MainApp: React.FC = () => {
  const { currentUser, fbUser, authLoading, refreshUser } = useFirebase();

  const [authState, setAuthState] = useState<AuthState>('landing');
  const [activeProfile, setActiveProfile] = useState<ActiveProfile>('user');
  const [currentView, setCurrentView] = useState<View>(View.Feed);
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChatUserId, setActiveChatUserId] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const [coPilotModalOpen, setCoPilotModalOpen] = useState(false);
  const [coPilotModalTitle, setCoPilotModalTitle] = useState('');
  const [coPilotModalContent, setCoPilotModalContent] = useState<string | null>(null);
  const [isCoPilotLoading, setIsCoPilotLoading] = useState(false);

  const [isSkillsGraphModalOpen, setIsSkillsGraphModalOpen] = useState(false);
  const [isVideoRecorderModalOpen, setIsVideoRecorderModalOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  const [activeCircleId, setActiveCircleId] = useState<number | null>(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [showSecurityPage, setShowSecurityPage] = useState(false);
  const [publicProfileUserId, setPublicProfileUserId] = useState<number | null>(null);
  const [followedUserIds, setFollowedUserIds] = useState<Set<number>>(new Set());

  const [appliedJobIds, setAppliedJobIds] = useState<number[]>([]);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [talentPipeline, setTalentPipeline] = useState<{ [key: string]: User[] }>({
    'New Applicants': [], 'Sourced': [], 'Screening': [], 'Interview': [], 'Offer': [], 'Hired': [],
  });
  const [isTrialActive, setIsTrialActive] = useState<boolean>(() => {
    const end = localStorage.getItem('recruiterTrialEndDate');
    return end ? new Date().getTime() < new Date(end).getTime() : true;
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // ── Auto-restore session ──────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (currentUser && authState !== 'authenticated') {
      setAuthState('authenticated');
      loadAppData(currentUser);
    } else if (currentUser && authState === 'authenticated' && !data && !loading) {
      // Data can be null right after registration if the context user arrived late
      loadAppData(currentUser);
    }
  }, [authLoading, currentUser, authState, data, loading]);

  // ── Load app data ─────────────────────────────────────────────────────────
  const loadAppData = useCallback(async (user: User) => {
    setLoading(true);
    setError(null);
    try {
      const [firestorePosts, firestoreJobs, firestoreCircles, firestoreMessages, firestoreConnections, firestoreFollowRequests, firestoreUsers] =
        await Promise.all([
          fetchPosts(50).catch(() => ({ posts: [], lastDoc: null })),
          fetchJobs().catch(() => []),
          fetchCircles().catch(() => []),
          fetchAllMessagesForUser(fbUser?.uid ?? '', user.id).catch(() => []),
          fetchConnectionRequests(fbUser?.uid ?? '').catch(() => []),
          fetchFollowRequests(fbUser?.uid ?? '').catch(() => []),
          fetchUsers().catch(() => []),
        ]);

      const otherUsers = firestoreUsers.filter(u => u.id !== user.id);

      // Fetch company BEFORE setData — await inside setData() passes a Promise, not the resolved value
      const company = await getOrCreateCompanyForRecruiter(
        fbUser?.uid ?? '',
        user.name,
        user.headline
      ).catch(() => ({
        id: 1, _firestoreId: '', name: user.headline || user.name,
        description: '', industry: '', logoUrl: '', website: ''
      }));

      setData({
        users: [user, ...otherUsers],
        posts: firestorePosts.posts,
        jobs: firestoreJobs,
        companies: [company],
        messages: firestoreMessages,
        notifications: [],
        connectionRequests: firestoreConnections,
        followRequests: firestoreFollowRequests,
        circles: firestoreCircles,
        articles: [],
      });
    } catch (err) {
      console.error(err);
      setError('Could not load application data.');
    } finally {
      setLoading(false);
    }
  }, [fbUser]);

  // ── Auth handlers ─────────────────────────────────────────────────────────

  const handleLoginSuccess = async (email: string, isRecruiterLogin: boolean) => {
    setActiveProfile(isRecruiterLogin ? 'recruiter' : 'user');
  };

  const handleFirebaseLogin = async (email: string, password: string, isRecruiterLogin: boolean) => {
    try {
      setLoading(true);
      setError(null);
      const user = await loginWithEmail(email, password);
      setActiveProfile(isRecruiterLogin ? 'recruiter' : 'user');
      setAuthState('authenticated');
      if (isRecruiterLogin) {
        const end = localStorage.getItem('recruiterTrialEndDate');
        if (!end) {
          const d = new Date(); d.setDate(d.getDate() + 30);
          localStorage.setItem('recruiterTrialEndDate', d.toISOString());
        }
      }
      await loadAppData(user);
    } catch (err: any) {
      setError(err.message ?? 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (isRecruiterLogin = false) => {
    try {
      setLoading(true);
      const user = await loginWithGoogle(isRecruiterLogin);
      setActiveProfile(isRecruiterLogin ? 'recruiter' : 'user');
      setAuthState('authenticated');
      await loadAppData(user);
    } catch (err: any) {
      setError(err.message ?? 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSuccess = async (name: string, email: string, isRecruiter: boolean, stripeCustomerId?: string) => {
    try {
      setLoading(true);
      if (stripeCustomerId && fbUser) await setStripeCustomerId(fbUser.uid, stripeCustomerId);
      setActiveProfile(isRecruiter ? 'recruiter' : 'user');
      setAuthState('authenticated');
      // currentUser from context may not have refreshed yet after registration.
      // Prefer the freshly-registered user from context; fall back to a minimal user obj.
      const userToLoad = currentUser ?? {
        id: Date.now(), name, headline: '', bio: '', avatarUrl: '',
        industry: '', professionalGoals: [], reputation: 0, credits: 100,
        isRecruiter, isVerified: false, portfolio: [], verifiedAchievements: [],
        thirdPartyIntegrations: [], workStyle: { collaboration: 'Thrives in pairs', communication: 'Prefers asynchronous', workPace: 'Fast-paced and iterative' },
        values: [], availability: 'Exploring opportunities' as const,
        skills: [], verifiedSkills: null, microIntroductionUrl: null,
      };
      await loadAppData(userToLoad);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setAuthState('landing');
    setData(null);
    setCurrentView(View.Feed);
    sessionStorage.removeItem('beWatuData');
  };

  const handleSwitchProfile = () => setActiveProfile(p => p === 'user' ? 'recruiter' : 'user');
  const handleChangePassword = async (currentPassword: string, newPassword: string) => changePassword(currentPassword, newPassword);
  const handleForgotPassword = async (email: string) => { await forgotPassword(email); setAuthState('login'); };

  // ── Data mutation handlers ────────────────────────────────────────────────

  const addPost = async (content: string, circleId?: number) => {
    if (!data || !currentUser || !fbUser) return;
    const newPost = await fbCreatePost(content, currentUser, fbUser.uid, circleId);
    setData({ ...data, posts: [newPost, ...data.posts] });
  };

  const handleAppreciatePost = async (postId: number, appreciationType: AppreciationType) => {
    if (!data || !fbUser) return;
    const post = data.posts.find(p => p.id === postId) as (Post & { _firestoreId?: string }) | undefined;
    if (!post) return;
    const reputationMap: Record<AppreciationType, number> = { helpful: 1, thoughtProvoking: 3, collaborationReady: 2 };
    const creditMap: Record<AppreciationType, number> = { helpful: 5, thoughtProvoking: 10, collaborationReady: 7 };
    setData({
      ...data,
      posts: data.posts.map(p =>
        p.id === postId ? { ...p, appreciations: { ...p.appreciations, [appreciationType]: p.appreciations[appreciationType] + 1 } } : p
      ),
      users: data.users.map(u =>
        u.id === post.authorId ? { ...u, reputation: u.reputation + reputationMap[appreciationType], credits: u.credits + creditMap[appreciationType] } : u
      ),
    });
    if (post._firestoreId) await fbAppreciatePost(post._firestoreId, appreciationType, fbUser.uid);
  };

  const endorseSkill = (userId: number, skillName: string) => {
    if (!data) return;
    setData({ ...data, users: data.users.map(u => u.id === userId ? { ...u, skills: u.skills.map(s => s.name === skillName ? { ...s, endorsements: s.endorsements + 1 } : s) } : u) });
  };

  const sendMessage = async (receiverId: number, text: string) => {
    if (!data || !currentUser || !fbUser) return;
    const newMsg: Message = { id: Date.now(), senderId: currentUser.id, receiverId, text, timestamp: 'Just now', isRead: false };
    setData({ ...data, messages: [...data.messages, newMsg] });
  };

  const startMessage = (userId: number) => { setActiveChatUserId(userId); setCurrentView(View.Messaging); };

  const handleMarkNotificationsRead = async () => {
    if (!data || !fbUser) return;
    const ids = (data.notifications as any[]).filter(n => !n.read && n._firestoreId).map(n => n._firestoreId);
    if (ids.length) await fbMarkNotificationsRead(fbUser.uid, ids);
    setData({ ...data, notifications: data.notifications.map(n => ({ ...n, read: true })) });
  };

  const handleConnectionRequest = async (requestId: number, status: 'accepted' | 'declined') => {
    if (!data) return;
    const req = (data.connectionRequests as any[]).find(cr => cr.id === requestId);
    if (req?._firestoreId && fbUser) await fbRespondToConnection(req._firestoreId, status, req.senderUid ?? fbUser.uid, fbUser.uid);
    setData({
      ...data,
      connectionRequests: data.connectionRequests.map(cr => cr.id === requestId ? { ...cr, status } : cr),
      notifications: data.notifications.filter(n => n.relatedId !== requestId),
    });
  };

  const handleSendConnection = async (receiverId: number) => {
    if (!currentUser || !fbUser) return;
    const receiver = data?.users.find(u => u.id === receiverId) as any;
    const newRequest = await fbSendConnectionRequest(fbUser.uid, currentUser.id, receiver?._firestoreUid ?? String(receiverId), receiverId);
    setData(d => d ? { ...d, connectionRequests: [...d.connectionRequests, newRequest] } : null);
  };

  const handleViewCompany = (companyId: number) => {
    if (data) setSelectedCompany(data.companies.find(c => c.id === companyId) || null);
  };

  const handleAnalyzeSynergy = async (otherUser: User) => {
    if (!currentUser) return;
    setCoPilotModalTitle(`Synergy Analysis: You & ${otherUser.name}`);
    setCoPilotModalOpen(true); setIsCoPilotLoading(true);
    try { setCoPilotModalContent(await analyzeSynergy(currentUser, otherUser)); }
    catch { setCoPilotModalContent('There was an error analyzing synergy.'); }
    finally { setIsCoPilotLoading(false); }
  };

  const handleAnalyzeJobMatch = async (job: Job, company: Company) => {
    if (!currentUser) return;
    setCoPilotModalTitle(`Job Match Analysis: ${job.title}`);
    setCoPilotModalOpen(true); setIsCoPilotLoading(true);
    try { setCoPilotModalContent(await analyzeJobMatch(currentUser, job, company.name)); }
    catch { setCoPilotModalContent('There was an error analyzing the job match.'); }
    finally { setIsCoPilotLoading(false); }
  };

  const handleGenerateSkillsGraph = async (resume: string, digitalFootprint: string, references: string) => {
    if (!data || !currentUser || !fbUser) return;
    const verifiedSkills = await generateSkillsGraph(resume, digitalFootprint, references);
    const updatedUser = { ...currentUser, verifiedSkills };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    refreshUser(updatedUser);
    await updateUserInFirestore(fbUser.uid, { verifiedSkills });
    setIsSkillsGraphModalOpen(false);
  };

  const handleSaveMicroIntroduction = async (videoUrl: string) => {
    if (!data || !currentUser || !fbUser) return;
    const updatedUser = { ...currentUser, microIntroductionUrl: videoUrl };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    refreshUser(updatedUser);
    await updateUserInFirestore(fbUser.uid, { microIntroductionUrl: videoUrl });
    setIsVideoRecorderModalOpen(false);
  };

  const handleApplyForJob = async (job: Job) => {
    if (!currentUser || appliedJobIds.includes(job.id) || !fbUser) return;
    setAppliedJobIds(prev => [...prev, job.id]);
    setTalentPipeline(prev => {
      if ((prev['New Applicants'] || []).some(a => a.id === currentUser.id)) return prev;
      return { ...prev, 'New Applicants': [...(prev['New Applicants'] || []), currentUser] };
    });
    setSuccessBanner(`Successfully applied for ${job.title}!`);
    const firestoreJob = (data?.jobs as any[])?.find(j => j.id === job.id);
    if (firestoreJob?._firestoreId) await applyToJobWithProfile(firestoreJob._firestoreId, job.id, fbUser.uid);
  };

  const handleAddJob = async (newJobData: Omit<Job, 'id'>) => {
    if (!data || !fbUser) return;
    const job = await fbCreateJob(newJobData, fbUser.uid);
    setData(d => d ? { ...d, jobs: [job, ...d.jobs] } : null);
  };

  const handleUpdateJob = async (updatedJob: Job) => {
    if (!data) return;
    const fj = (data.jobs as any[]).find(j => j.id === updatedJob.id);
    if (fj?._firestoreId) await fbUpdateJob(fj._firestoreId, updatedJob);
    setData(d => d ? { ...d, jobs: d.jobs.map(j => j.id === updatedJob.id ? updatedJob : j) } : null);
  };

  const handleDeleteJob = async (jobId: number) => {
    if (!data) return;
    const fj = (data.jobs as any[]).find(j => j.id === jobId);
    if (fj?._firestoreId) await fbDeleteJob(fj._firestoreId);
    setData(d => d ? { ...d, jobs: d.jobs.filter(j => j.id !== jobId) } : null);
  };

  const handleToggleJobStatus = (jobId: number, currentStatus: 'Active' | 'Suspended') => {
    if (!data) return;
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    const fj = (data.jobs as any[]).find(j => j.id === jobId);
    if (fj?._firestoreId) fbUpdateJob(fj._firestoreId, { status: newStatus });
    setData(d => d ? { ...d, jobs: d.jobs.map(j => j.id === jobId ? { ...j, status: newStatus } : j) } : null);
  };

  const handleCreateCircle = async (name: string, description: string) => {
    if (!currentUser || !fbUser) return;
    const newCircle = await createCircle({ name, description, members: [currentUser.id], adminId: currentUser.id }, fbUser.uid);
    setData(d => d ? { ...d, circles: [newCircle, ...d.circles] } : null);
  };

  const handleAddMemberToCircle = (circleId: number, userId: number) => {
    if (!data) return;
    setData({ ...data, circles: data.circles.map(c => c.id === circleId && !c.members.includes(userId) ? { ...c, members: [...c.members, userId] } : c) });
  };

  const handleRemoveMemberFromCircle = (circleId: number, userId: number) => {
    if (!data) return;
    setData({ ...data, circles: data.circles.map(c => c.id === circleId && c.adminId !== userId ? { ...c, members: c.members.filter(id => id !== userId) } : c) });
  };

  const handleViewProfile = (userId: number) => {
    if (currentUser && userId !== currentUser.id) {
      setPublicProfileUserId(userId);
    } else {
      setProfileUserId(userId);
      setCurrentView(View.Profile);
    }
  };
  const handleSetView = (view: View) => {
    setCurrentView(view);
    if (view === View.Profile && currentUser) setProfileUserId(currentUser.id);
    else if (view !== View.Profile) setProfileUserId(null);
    if (view !== View.Circles) setActiveCircleId(null);
    setIsMobileNavOpen(false);
  };
  const handleSelectCircle = (circleId: number) => { setCurrentView(View.Circles); setActiveCircleId(circleId); };

  const handleFollowUser = async (userId: number) => {
    if (!currentUser || !fbUser || !data) return;
    setFollowedUserIds(prev => new Set(prev).add(userId));
    const receiver = data.users.find(u => u.id === userId) as any;
    const receiverUid = receiver?._firestoreUid ?? String(userId);
    const privacy = receiver?.privacySettings;
    // If receiver allows follow without approval, mark accepted immediately
    if (!privacy || privacy.allowFollow !== false) {
      const req = await fbSendFollowRequest(fbUser.uid, currentUser.id, receiverUid, userId);
      setData(d => d ? { ...d, followRequests: [...(d.followRequests ?? []), req] } : null);
    }
  };

  const handleFollowRequest = async (requestId: number, status: 'accepted' | 'declined') => {
    if (!data || !fbUser) return;
    const req = (data.followRequests ?? []).find(r => r.id === requestId) as any;
    if (req?._firestoreId) {
      const sender = data.users.find(u => u.id === req.fromUserId) as any;
      await fbRespondToFollowRequest(req._firestoreId, status, fbUser.uid, sender?._firestoreUid ?? String(req.fromUserId), req.fromUserId);
    }
    setData(d => d ? {
      ...d,
      followRequests: (d.followRequests ?? []).map(r => r.id === requestId ? { ...r, status } : r),
    } : null);
  };
  const handleNavigateToConnect = () => setAuthState('connect');
  const handleNavigateToLanding = () => setAuthState('landing');

  // ── Render ────────────────────────────────────────────────────────────────

  const FullPageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <LoadingIcon className="w-12 h-12 animate-spin text-cyan-400" />
    </div>
  );

  if (authLoading) return <FullPageLoader />;

  const renderContent = () => {
    if (loading) return (
      <div className="flex flex-col items-center justify-center h-screen">
        <LoadingIcon className="w-16 h-16 animate-spin text-cyan-400" />
        <p className="mt-4 text-lg text-slate-300">Loading BeWatu...</p>
      </div>
    );

    if (error || !data || !currentUser) return (
      <div className="flex items-center justify-center h-screen bg-red-900/20 text-red-300">
        <div className="text-center p-8 border border-red-500/30 rounded-lg bg-slate-900 shadow-lg">
          <h2 className="text-2xl font-bold mb-2">An Error Occurred</h2>
          <p>{error || 'Could not load application data.'}</p>
          <button onClick={() => loadAppData(currentUser!)} className="mt-4 px-4 py-2 bg-cyan-600 rounded-lg text-white">Retry</button>
        </div>
      </div>
    );

    if (activeProfile === 'recruiter') {
      return <RecruiterConsole onLogout={handleLogout} isTrialActive={isTrialActive} setTrialActive={setIsTrialActive} onSwitchProfile={handleSwitchProfile} talentPipeline={talentPipeline} allJobs={data.jobs} allCompanies={data.companies} currentUser={currentUser} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onToggleJobStatus={handleToggleJobStatus} />;
    }

    let content: React.ReactNode;
    switch (currentView) {
      case View.Feed:
        content = (
          <div className="space-y-4">
            <SparksTray />
            <HomePage
              data={data}
              currentUser={currentUser}
              onGenerateSkills={() => setIsSkillsGraphModalOpen(true)}
              onRecordVideo={() => setIsVideoRecorderModalOpen(true)}
              onPlayVideo={(url) => setPlayingVideoUrl(url)}
              onNavigate={handleSetView}
              onSelectCircle={handleSelectCircle}
              addPost={addPost}
              onAppreciatePost={handleAppreciatePost}
              onViewProfile={handleViewProfile}
            />
          </div>
        );
        break;

      case View.People:
        content = (
          <People
            users={data.users.filter(u => u.id !== currentUser.id)}
            onEndorseSkill={endorseSkill}
            onStartMessage={startMessage}
            onAnalyzeSynergy={handleAnalyzeSynergy}
            onViewProfile={handleViewProfile}
            onConnect={handleSendConnection}
            connectionRequests={data.connectionRequests}
            currentUserId={currentUser.id}
          />
        );
        break;

      case View.Connections:
        content = (
          <ConnectionsView
            currentUser={currentUser}
            allUsers={data.users}
            connectionRequests={data.connectionRequests}
            followRequests={data.followRequests ?? []}
            onAccept={(id) => handleConnectionRequest(id, 'accepted')}
            onDecline={(id) => handleConnectionRequest(id, 'declined')}
            onAcceptFollow={(id) => handleFollowRequest(id, 'accepted')}
            onDeclineFollow={(id) => handleFollowRequest(id, 'declined')}
            onViewProfile={handleViewProfile}
            onConnect={handleSendConnection}
          />
        );
        break;

      case View.Jobs:
        content = <Jobs jobs={data.jobs} companies={data.companies} onViewCompany={handleViewCompany} onAnalyzeMatch={handleAnalyzeJobMatch} onApplyForJob={handleApplyForJob} appliedJobIds={appliedJobIds} />;
        break;

      case View.Messaging:
        content = <Messaging users={data.users} messages={data.messages} currentUser={currentUser} onSendMessage={sendMessage} initialActiveUserId={activeChatUserId} />;
        break;

      case View.AIChat:
        content = <AIChat currentUser={currentUser} />;
        break;

      case View.Profile: {
        const userToShow = profileUserId ? data.users.find(u => u.id === profileUserId) : currentUser;
        content = userToShow
          ? <ProfilePage user={userToShow} isCurrentUser={userToShow.id === currentUser.id} connectionRequests={data.connectionRequests} circles={data.circles} onGenerateSkills={() => setIsSkillsGraphModalOpen(true)} onRecordVideo={() => setIsVideoRecorderModalOpen(true)} onPlayVideo={url => setPlayingVideoUrl(url)} onNavigate={handleSetView} onSelectCircle={handleSelectCircle} onChangePassword={handleChangePassword} onOpenSecurity={() => setShowSecurityPage(true)} />
          : <div>User not found.</div>;
        break;
      }

      case View.Prove:
        content = <ProveView onViewProfile={handleViewProfile} />;
        break;

      case View.Circles: {
        if (activeCircleId) {
          const circle = data.circles.find(c => c.id === activeCircleId);
          content = circle
            ? <CircleDetail circle={circle} allPosts={data.posts} allArticles={data.articles} allUsers={data.users} currentUser={currentUser} addPost={addPost} findAuthor={id => data.users.find(u => u.id === id)} onAppreciatePost={handleAppreciatePost} onAddMember={handleAddMemberToCircle} onRemoveMember={handleRemoveMemberFromCircle} onViewProfile={handleViewProfile} />
            : <div>Circle not found</div>;
        } else {
          content = <Circles circles={data.circles} onSelectCircle={handleSelectCircle} onCreateCircle={handleCreateCircle} currentUserId={currentUser.id} />;
        }
        break;
      }

      default:
        content = null;
    }

    return (
      <>
      {/* Security & Privacy overlay */}
      {showSecurityPage && currentUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: '#f5f5f4' }}>
          <div className="min-h-screen">
            <Header currentView={currentView} onNavigate={handleSetView} onLogout={handleLogout} onSwitchToRecruiter={handleSwitchProfile} notificationCount={data?.notifications?.filter(n => !(n as any).isRead).length ?? 0} pendingConnectionCount={0} />
            <main className="w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 pb-10 overflow-x-hidden">
              <Suspense fallback={<div />}>
                <SecurityPrivacyPage user={currentUser} onBack={() => setShowSecurityPage(false)} onChangePassword={() => handleChangePassword('' as any, '' as any)} />
              </Suspense>
            </main>
          </div>
        </div>
      )}

      {/* Public profile overlay */}
      {publicProfileUserId && data && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: '#f5f5f4' }}>
          <div className="min-h-screen">
            <Header currentView={currentView} onNavigate={v => { setPublicProfileUserId(null); handleSetView(v); }} onLogout={handleLogout} onSwitchToRecruiter={handleSwitchProfile} notificationCount={data?.notifications?.filter(n => !(n as any).isRead).length ?? 0} pendingConnectionCount={data.connectionRequests.filter(r => r.toUserId === currentUser!.id && r.status === 'pending').length} />
            <main className="w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 pb-24 sm:pb-10 overflow-x-hidden">
              <Suspense fallback={<div />}>
                {(() => {
                  const pubUser = data.users.find(u => u.id === publicProfileUserId);
                  if (!pubUser) return <p className="text-stone-500 p-8">User not found.</p>;
                  const isConn = data.connectionRequests.some(r =>
                    r.status === 'accepted' && ((r.fromUserId === currentUser!.id && r.toUserId === publicProfileUserId) || (r.toUserId === currentUser!.id && r.fromUserId === publicProfileUserId))
                  );
                  return (
                    <PublicProfilePage
                      user={pubUser}
                      isConnected={isConn}
                      isFollowing={followedUserIds.has(publicProfileUserId)}
                      onBack={() => setPublicProfileUserId(null)}
                      onConnect={(uid) => { fbSendConnectionRequest(currentUser!.id, uid); }}
                      onFollow={handleFollowUser}
                      onViewCompany={handleViewCompany}
                      onMessage={(uid) => { setPublicProfileUserId(null); startMessage(uid); }}
                      onPlayVideo={url => setPlayingVideoUrl(url)}
                    />
                  );
                })()}
              </Suspense>
            </main>
            <MobileNav currentView={currentView} onNavigate={v => { setPublicProfileUserId(null); handleSetView(v); }} />
          </div>
        </div>
      )}

      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f5f5f4" }}>
        <Header
          currentView={currentView}
          onNavigate={handleSetView}
          onLogout={handleLogout}
          onSwitchToRecruiter={handleSwitchProfile}
          notificationCount={data.notifications.filter(n => !(n as any).isRead).length}
          pendingConnectionCount={data.connectionRequests.filter(r => r.toUserId === currentUser.id && r.status === 'pending').length}
        />
        <main className="flex-grow w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 pb-24 sm:pb-10 overflow-x-hidden">{content}</main>
        {successBanner && <SuccessBanner message={successBanner} onClose={() => setSuccessBanner(null)} />}
        <Footer onNavigateToConnect={handleNavigateToConnect} />
        {selectedCompany && <CompanyProfileModal company={selectedCompany} allJobs={data.jobs} onClose={() => setSelectedCompany(null)} />}
        {coPilotModalOpen && <CoPilotModal title={coPilotModalTitle} isLoading={isCoPilotLoading} content={coPilotModalContent} onClose={() => { setCoPilotModalOpen(false); setCoPilotModalContent(null); }} />}
        {isSkillsGraphModalOpen && <SkillsGraphModal onSubmit={handleGenerateSkillsGraph} onClose={() => setIsSkillsGraphModalOpen(false)} />}
        {isVideoRecorderModalOpen && <VideoRecorderModal onSave={handleSaveMicroIntroduction} onClose={() => setIsVideoRecorderModalOpen(false)} />}
        {playingVideoUrl && <VideoPlayerModal videoUrl={playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} />}
        <MobileNav currentView={currentView} onNavigate={handleSetView} pendingConnectionCount={data.connectionRequests.filter(r => r.toUserId === currentUser.id && r.status === 'pending').length} />
      </div>
      </>
    );
  };

  const renderAuthFlow = () => {
    switch (authState) {
      case 'connect': return <ConnectPage onNavigateBack={() => setAuthState('landing')} />;
      case 'about': return <AboutPage onNavigateBack={() => setAuthState('landing')} onNavigateToConnect={handleNavigateToConnect} />;
      case 'login':
        return (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onFirebaseLogin={handleFirebaseLogin}
            onGoogleLogin={handleGoogleLogin}
            onNavigateToRegister={() => setAuthState('register')}
            onNavigateToForgotPassword={() => setAuthState('forgot_password')}
            onNavigateToConnect={handleNavigateToConnect}
            onNavigateToLanding={handleNavigateToLanding}
          />
        );
      case 'register':
        return (
          <RegistrationPage
            onRegisterSuccess={handleRegisterSuccess}
            onNavigateToLogin={() => setAuthState('login')}
            onNavigateToConnect={handleNavigateToConnect}
            onNavigateToLanding={handleNavigateToLanding}
          />
        );
      case 'forgot_password':
        return (
          <ForgotPasswordPage
            onResetRequest={handleForgotPassword}
            onNavigateToLogin={() => setAuthState('login')}
            onNavigateToConnect={handleNavigateToConnect}
            onNavigateToLanding={handleNavigateToLanding}
          />
        );
      case 'landing':
      default:
        return <LandingPage onNavigateToRegister={() => setAuthState('register')} onNavigateToLogin={() => setAuthState('login')} onNavigateToAbout={() => setAuthState('about')} onNavigateToConnect={handleNavigateToConnect} />;
    }
  };

  return (
    <Suspense fallback={<FullPageLoader />}>
      {authState === 'authenticated' ? renderContent() : renderAuthFlow()}
    </Suspense>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
const App: React.FC = () => (
  <FirebaseProvider>
    <LanguageProvider>
      <MainApp />
    </LanguageProvider>
  </FirebaseProvider>
);

export default App;
