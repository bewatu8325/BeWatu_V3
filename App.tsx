import React, { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import { AppData, Post, User, Job, View, Message, Company, AppreciationType, Circle, Notification } from './types';
import { generateProfessionalNetworkData, analyzeSynergy, analyzeJobMatch, generateSkillsGraph } from './services/geminiService';
import { LoadingIcon } from './constants';
import { LanguageProvider } from './contexts/LanguageContext';
import { FirebaseProvider, useFirebase } from './contexts/FirebaseContext';
import MobileNav from './components/MobileNav';

// ── Firebase services ─────────────────────────────────────────────────────────
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
  subscribeToNotifications,
  markNotificationsRead as fbMarkNotificationsRead,
  createJob as fbCreateJob,
  fetchJobs,
  updateJob as fbUpdateJob,
  deleteJob as fbDeleteJob,
  applyToJob as fbApplyToJob,
  fetchCircles,
} from './lib/firestoreService';

// ── Lazy-loaded components (remain unchanged) ───────────────────────────────────────
const Header = lazy(() => import('./components/Header'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const HomePage = lazy(() => import('./components/HomePage'));
const People = lazy(() => import('./components/People'));
const Jobs = lazy(() => import('./components/Jobs'));
const Messaging = lazy(() => import('./components/Messaging'));
const CompanyProfileModal = lazy(() => import('./components/CompanyProfileModal'));
const CoPilotModal = lazy(() => import('./components/CoPilotModal'));
const SkillsGraphModal = lazy(() => import('./components/SkillsGraphModal').then(m => ({ default: m.SkillsGraphModal })));
const VideoRecorderModal = lazy(() => import('./components/VideoRecorderModal'));
const VideoPlayerModal = lazy(() => import('./components/VideoPlayerModal'));
const Circles = lazy(() => import('./components/Circles'));
const CircleDetail = lazy(() => import('./components/CircleDetail'));
const AIChat = lazy(() => import('./components/AIChat'));
const LandingPage = lazy(() => import('./components/LandingPage'));
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
// MAIN APP (inner — has access to FirebaseContext)
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

  // Co-pilot modal
  const [coPilotModalOpen, setCoPilotModalOpen] = useState(false);
  const [coPilotModalTitle, setCoPilotModalTitle] = useState('');
  const [coPilotModalContent, setCoPilotModalContent] = useState<string | null>(null);
  const [isCoPilotLoading, setIsCoPilotLoading] = useState(false);

  // Feature modals
  const [isSkillsGraphModalOpen, setIsSkillsGraphModalOpen] = useState(false);
  const [isVideoRecorderModalOpen, setIsVideoRecorderModalOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  // Navigation state
  const [activeCircleId, setActiveCircleId] = useState<number | null>(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  // Job / recruiter
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

  // ── Auto-restore session when Firebase auth resolves ─────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (currentUser && authState !== 'authenticated') {
      setAuthState('authenticated');
      loadAppData(currentUser);
    }
  }, [authLoading, currentUser]);

  // ── Load app data (Firestore-first, Gemini fallback for AI content) ───────
  const loadAppData = useCallback(async (user: User) => {
    setLoading(true);
    setError(null);
    try {
      // Try to fetch real data from Firestore in parallel
      const [firestorePosts, firestoreJobs, firestoreCircles, firestoreMessages, firestoreConnections] =
        await Promise.all([
          fetchPosts(50),
          fetchJobs(),
          fetchCircles(),
          fetchAllMessagesForUser(fbUser?.uid ?? '', user.id),
          fetchConnectionRequests(fbUser?.uid ?? ''),
        ]);

      // Use Gemini to seed the users list and AI-generated content (your existing feature)
      const cachedData = sessionStorage.getItem('beWatuData');
      let baseData: AppData;

      if (cachedData) {
        baseData = JSON.parse(cachedData);
      } else {
        baseData = await generateProfessionalNetworkData();
        sessionStorage.setItem('beWatuData', JSON.stringify(baseData));
      }

      // Merge Firestore real data over the AI-generated scaffold
      const mergedData: AppData = {
        ...baseData,
        users: [user, ...baseData.users.filter(u => u.id !== user.id)],
        posts: firestorePosts.posts.length > 0 ? firestorePosts.posts : baseData.posts,
        jobs: firestoreJobs.length > 0 ? firestoreJobs : baseData.jobs,
        circles: firestoreCircles.length > 0 ? firestoreCircles : baseData.circles,
        messages: firestoreMessages.length > 0 ? firestoreMessages : baseData.messages,
        connectionRequests: firestoreConnections.length > 0 ? firestoreConnections : baseData.connectionRequests,
      };

      setData(mergedData);

      // Bootstrap talent pipeline for recruiters
      if (user.isRecruiter && mergedData.users.length > 5) {
        setTalentPipeline(prev =>
          prev['Sourced'].length === 0
            ? { ...prev, 'Sourced': mergedData.users.slice(1, 3), 'Screening': mergedData.users.slice(3, 5), 'Interview': mergedData.users.slice(5, 6) }
            : prev
        );
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load app data. Please check your connection and API key.');
    } finally {
      setLoading(false);
    }
  }, [fbUser]);

  // ── Subscribe to real-time notifications ──────────────────────────────────
  // useEffect(() => {
  //  if (!fbUser || !currentUser) return;
  //  const unsub = subscribeToNotifications(fbUser.uid, currentUser.id, (notifications) => {
  //    setData(prev => prev ? { ...prev, notifications } : prev);
  //  });
 //   return unsub;
//  }, [fbUser, currentUser]);

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH HANDLERS — wired to real Firebase
  // ─────────────────────────────────────────────────────────────────────────

  const handleLoginSuccess = async (email: string, isRecruiterLogin: boolean) => {
    try {
      setLoading(true);
      // Note: LoginPage calls this after form submit.
      // We need the password — see LoginPage integration note below.
      // For now this path is kept for compatibility; real auth happens via
      // handleFirebaseLogin which LoginPage should call directly.
      setActiveProfile(isRecruiterLogin ? 'recruiter' : 'user');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Called directly by LoginPage with real credentials.
   * Replace LoginPage's onLoginSuccess call with onFirebaseLogin.
   */
  const handleFirebaseLogin = async (
    email: string,
    password: string,
    isRecruiterLogin: boolean
  ) => {
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

  const handleRegisterSuccess = async (
    name: string,
    email: string,
    isRecruiter: boolean,
    stripeCustomerId?: string
  ) => {
    try {
      setLoading(true);
      // RegistrationPage already called registerWithEmail — this just handles post-registration setup
      if (stripeCustomerId && fbUser) {
        await setStripeCustomerId(fbUser.uid, stripeCustomerId);
      }
      setActiveProfile(isRecruiter ? 'recruiter' : 'user');
      setAuthState('authenticated');
      if (currentUser) await loadAppData(currentUser);
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

  const handleSwitchProfile = () => {
    setActiveProfile(p => p === 'user' ? 'recruiter' : 'user');
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    await changePassword(currentPassword, newPassword);
  };

  const handleForgotPassword = async (email: string) => {
    await forgotPassword(email);
    setAuthState('login');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DATA MUTATION HANDLERS — now write to Firestore
  // ─────────────────────────────────────────────────────────────────────────

  const addPost = async (content: string, circleId?: number) => {
    if (!data || !currentUser || !fbUser) return;
    const newPost = await fbCreatePost(content, currentUser, fbUser.uid, circleId);
    setData({ ...data, posts: [newPost, ...data.posts] });
  };

  const handleAppreciatePost = async (postId: number, appreciationType: AppreciationType) => {
    if (!data || !fbUser) return;
    const post = data.posts.find(p => p.id === postId) as (Post & { _firestoreId?: string }) | undefined;
    if (!post) return;

    // Optimistic update
    const updatedPosts = data.posts.map(p =>
      p.id === postId
        ? { ...p, appreciations: { ...p.appreciations, [appreciationType]: p.appreciations[appreciationType] + 1 } }
        : p
    );
    const author = data.users.find(u => u.id === post.authorId);
    const reputationMap: Record<AppreciationType, number> = { helpful: 1, thoughtProvoking: 3, collaborationReady: 2 };
    const creditMap: Record<AppreciationType, number> = { helpful: 5, thoughtProvoking: 10, collaborationReady: 7 };
    const updatedUsers = data.users.map(u =>
      u.id === post.authorId
        ? { ...u, reputation: u.reputation + reputationMap[appreciationType], credits: u.credits + creditMap[appreciationType] }
        : u
    );
    setData({ ...data, posts: updatedPosts, users: updatedUsers });

    // Persist to Firestore
    if (post._firestoreId && author) {
      const authorDoc = data.users.find(u => u.id === author.id);
      // We need the author's Firebase UID — stored via a lookup or passed with user data
      // For now, use the firestoreId path
      await fbAppreciatePost(post._firestoreId, appreciationType, fbUser.uid);
    }
  };

  const endorseSkill = (userId: number, skillName: string) => {
    if (!data) return;
    setData({
      ...data,
      users: data.users.map(u =>
        u.id === userId
          ? { ...u, skills: u.skills.map(s => s.name === skillName ? { ...s, endorsements: s.endorsements + 1 } : s) }
          : u
      ),
    });
  };

  const sendMessage = async (receiverId: number, text: string) => {
    if (!data || !currentUser || !fbUser) return;

    // We need the receiver's Firebase UID. For now create a new message optimistically.
    const newMsg: Message = {
      id: Date.now(),
      senderId: currentUser.id,
      receiverId,
      text,
      timestamp: 'Just now',
      isRead: false,
    };
    setData({ ...data, messages: [...data.messages, newMsg] });

    // Persist — receiver UID lookup from data.users (add `uid` field to User in Firestore)
    // This is wired when the receiver logs in and their uid is stored in Firestore.
    // Full real-time messaging is available via subscribeToMessages() in the Messaging component.
  };

  const startMessage = (userId: number) => {
    setActiveChatUserId(userId);
    setCurrentView(View.Messaging);
  };

  const handleMarkNotificationsRead = async () => {
    if (!data || !fbUser) return;
    const firestoreIds = (data.notifications as any[])
      .filter(n => !n.read && n._firestoreId)
      .map(n => n._firestoreId);
    if (firestoreIds.length) await fbMarkNotificationsRead(fbUser.uid, firestoreIds);
    setData({ ...data, notifications: data.notifications.map(n => ({ ...n, read: true })) });
  };

  const handleConnectionRequest = async (requestId: number, status: 'accepted' | 'declined') => {
    if (!data) return;
    const req = (data.connectionRequests as any[]).find(cr => cr.id === requestId);
    if (req?._firestoreId && fbUser) {
      await fbRespondToConnection(req._firestoreId, status, req.senderUid ?? fbUser.uid, fbUser.uid);
    }
    setData({
      ...data,
      connectionRequests: data.connectionRequests.map(cr => cr.id === requestId ? { ...cr, status } : cr),
      notifications: data.notifications.filter(n => n.relatedId !== requestId),
    });
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
    if (firestoreJob?._firestoreId) await fbApplyToJob(firestoreJob._firestoreId, fbUser.uid);
  };

  const handleAddJob = async (newJobData: Omit<Job, 'id'>) => {
    if (!data || !fbUser) return;
    const job = await fbCreateJob(newJobData, fbUser.uid);
    setData(d => d ? { ...d, jobs: [job, ...d.jobs] } : null);
  };

  const handleUpdateJob = async (updatedJob: Job) => {
    if (!data) return;
    const firestoreJob = (data.jobs as any[]).find(j => j.id === updatedJob.id);
    if (firestoreJob?._firestoreId) await fbUpdateJob(firestoreJob._firestoreId, updatedJob);
    setData(d => d ? { ...d, jobs: d.jobs.map(j => j.id === updatedJob.id ? updatedJob : j) } : null);
  };

  const handleDeleteJob = async (jobId: number) => {
    if (!data) return;
    const firestoreJob = (data.jobs as any[]).find(j => j.id === jobId);
    if (firestoreJob?._firestoreId) await fbDeleteJob(firestoreJob._firestoreId);
    setData(d => d ? { ...d, jobs: d.jobs.filter(j => j.id !== jobId) } : null);
  };

  const handleToggleJobStatus = (jobId: number, currentStatus: 'Active' | 'Suspended') => {
    if (!data) return;
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    const firestoreJob = (data.jobs as any[]).find(j => j.id === jobId);
    if (firestoreJob?._firestoreId) fbUpdateJob(firestoreJob._firestoreId, { status: newStatus });
    setData(d => d ? { ...d, jobs: d.jobs.map(j => j.id === jobId ? { ...j, status: newStatus } : j) } : null);
  };

  const handleAddMemberToCircle = (circleId: number, userId: number) => {
    if (!data) return;
    setData({ ...data, circles: data.circles.map(c => c.id === circleId && !c.members.includes(userId) ? { ...c, members: [...c.members, userId] } : c) });
  };
  const handleRemoveMemberFromCircle = (circleId: number, userId: number) => {
    if (!data) return;
    setData({ ...data, circles: data.circles.map(c => c.id === circleId && c.adminId !== userId ? { ...c, members: c.members.filter(id => id !== userId) } : c) });
  };

  const handleViewProfile = (userId: number) => { setProfileUserId(userId); setCurrentView(View.Profile); };
  const handleSetView = (view: View) => {
    setCurrentView(view);
    if (view === View.Profile && currentUser) setProfileUserId(currentUser.id);
    else if (view !== View.Profile) setProfileUserId(null);
    if (view !== View.Circles) setActiveCircleId(null);
    setIsMobileNavOpen(false);
  };
  const handleSelectCircle = (circleId: number) => { setCurrentView(View.Circles); setActiveCircleId(circleId); };
  const handleNavigateToConnect = () => setAuthState('connect');
  const handleNavigateToLanding = () => setAuthState('landing');

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const FullPageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <LoadingIcon className="w-12 h-12 animate-spin text-cyan-400" />
    </div>
  );

  // Show full-page loader while Firebase resolves the session
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
          <button onClick={() => loadAppData(currentUser!)} className="mt-4 px-4 py-2 bg-cyan-600 rounded-lg text-white">
            Retry
          </button>
        </div>
      </div>
    );

    if (activeProfile === 'recruiter') {
      return <RecruiterConsole onLogout={handleLogout} isTrialActive={isTrialActive} setTrialActive={setIsTrialActive} onSwitchProfile={handleSwitchProfile} talentPipeline={talentPipeline} allJobs={data.jobs} allCompanies={data.companies} currentUser={currentUser} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onToggleJobStatus={handleToggleJobStatus} />;
    }

    let content: React.ReactNode;
    switch (currentView) {
      case View.Feed:
        content = <HomePage data={data} currentUser={currentUser} onGenerateSkills={() => setIsSkillsGraphModalOpen(true)} onRecordVideo={() => setIsVideoRecorderModalOpen(true)} onPlayVideo={url => setPlayingVideoUrl(url)} onNavigate={handleSetView} onSelectCircle={handleSelectCircle} addPost={addPost} onAppreciatePost={handleAppreciatePost} onViewProfile={handleViewProfile} />;
        break;
      case View.People:
        content = <People users={data.users.filter(u => u.id !== currentUser.id)} onEndorseSkill={endorseSkill} onStartMessage={startMessage} onAnalyzeSynergy={handleAnalyzeSynergy} onViewProfile={handleViewProfile} />;
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
          ? <ProfilePage user={userToShow} isCurrentUser={userToShow.id === currentUser.id} connectionRequests={data.connectionRequests} circles={data.circles} onGenerateSkills={() => setIsSkillsGraphModalOpen(true)} onRecordVideo={() => setIsVideoRecorderModalOpen(true)} onPlayVideo={url => setPlayingVideoUrl(url)} onNavigate={handleSetView} onSelectCircle={handleSelectCircle} onChangePassword={handleChangePassword} />
          : <div>User not found.</div>;
        break;
      }
      case View.Circles: {
        if (activeCircleId) {
          const circle = data.circles.find(c => c.id === activeCircleId);
          content = circle
            ? <CircleDetail circle={circle} allPosts={data.posts} allArticles={data.articles} allUsers={data.users} currentUser={currentUser} addPost={addPost} findAuthor={id => data.users.find(u => u.id === id)} onAppreciatePost={handleAppreciatePost} onAddMember={handleAddMemberToCircle} onRemoveMember={handleRemoveMemberFromCircle} onViewProfile={handleViewProfile} />
            : <div>Circle not found</div>;
        } else {
          content = <Circles circles={data.circles} onSelectCircle={handleSelectCircle} />;
        }
        break;
      }
      default:
        content = null;
    }

    return (
      <div className="min-h-screen flex flex-col pb-16 sm:pb-0">
        <Header currentUser={currentUser} currentView={currentView} setCurrentView={handleSetView} notifications={data.notifications.filter(n => n.userId === currentUser.id)} connectionRequests={data.connectionRequests} users={data.users} onMarkAsRead={handleMarkNotificationsRead} onAcceptConnection={id => handleConnectionRequest(id, 'accepted')} onDeclineConnection={id => handleConnectionRequest(id, 'declined')} onLogout={handleLogout} onSwitchProfile={handleSwitchProfile} activeProfile={activeProfile} onToggleMobileNav={() => setIsMobileNavOpen(p => !p)} />
        <main className="flex-grow container mx-auto px-4 sm:px-6 py-4 sm:py-8">{content}</main>
        {successBanner && <SuccessBanner message={successBanner} onClose={() => setSuccessBanner(null)} />}
        <Footer onNavigateToConnect={handleNavigateToConnect} />
        {selectedCompany && <CompanyProfileModal company={selectedCompany} allJobs={data.jobs} onClose={() => setSelectedCompany(null)} />}
        {coPilotModalOpen && <CoPilotModal title={coPilotModalTitle} isLoading={isCoPilotLoading} content={coPilotModalContent} onClose={() => { setCoPilotModalOpen(false); setCoPilotModalContent(null); }} />}
        {isSkillsGraphModalOpen && <SkillsGraphModal onSubmit={handleGenerateSkillsGraph} onClose={() => setIsSkillsGraphModalOpen(false)} />}
        {isVideoRecorderModalOpen && <VideoRecorderModal onSave={handleSaveMicroIntroduction} onClose={() => setIsVideoRecorderModalOpen(false)} />}
        {playingVideoUrl && <VideoPlayerModal videoUrl={playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} />}
        <MobileNav currentView={currentView} setCurrentView={handleSetView} currentUser={currentUser} onLogout={handleLogout} onSwitchProfile={handleSwitchProfile} isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
      </div>
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
// ROOT — wraps with Firebase + Language providers
// ─────────────────────────────────────────────────────────────────────────────
const App: React.FC = () => (
  <FirebaseProvider>
    <LanguageProvider>
      <MainApp />
    </LanguageProvider>
  </FirebaseProvider>
);

export default App;
