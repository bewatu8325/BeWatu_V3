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
import PricingPage from './components/PricingPage';
import FactoryUnlockBanner from './components/FactoryUnlockBanner';
import UpgradeModal from './components/UpgradeModal';
import { SubscriptionTier } from './lib/subscription';

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
  cancelConnectionRequest as fbCancelConnectionRequest,
  refreshConnectionRequest as fbRefreshConnectionRequest,
  subscribeToNotifications,
  markNotificationsRead as fbMarkNotificationsRead,
  createJob as fbCreateJob,
  fetchJobs,
  updateJob as fbUpdateJob,
  deleteJob as fbDeleteJob,
  applyToJob as fbApplyToJob,
  fetchCircles,
  createCircle,
  leaveCircle,
  fetchUsers,
  getOrCreateCompanyForRecruiter,
  applyToJobWithProfile,
  fetchCompanyById,
} from './lib/firestoreService';
import { recordTermsAgreement } from './lib/firestoreService';
import TermsConsentModal, { TERMS_VERSION } from './components/TermsConsentModal';

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
const CareerIntelligence = lazy(() => import('./components/CareerIntelligence'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const SecurityPrivacyPage = lazy(() => import('./components/SecurityPrivacyPage'));
const PublicProfilePage = lazy(() => import('./components/PublicProfilePage'));
const AboutPage = lazy(() => import('./components/AboutPage'));
const ConnectPage = lazy(() => import('./components/ConnectPage'));
const LoginPage = lazy(() => import('./components/auth/LoginPage'));
const ReportModal = lazy(() => import('./components/ReportModal'));
const RegistrationPage = lazy(() => import('./components/auth/RegistrationPage'));
const ForgotPasswordPage = lazy(() => import('./components/auth/ForgotPasswordPage'));
const RecruiterConsole = lazy(() => import('./components/recruiter/RecruiterConsole'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const Footer = lazy(() => import('./components/Footer'));
const SuccessBanner = lazy(() => import('./components/SuccessBanner'));
const ArenaDiscovery = lazy(() => import('./components/arenas/ArenaDiscovery'));
const ArenaIndustryView = lazy(() => import('./components/arenas/ArenaIndustryView'));
const RecruiterUpgradeBanner = lazy(() => import('./components/recruiter/RecruiterUpgradeBanner'));
const GenerationalFeed = lazy(() => import('./components/GenerationalFeed'));
const CompaniesPage = lazy(() => import('./components/CompaniesPage'));

type AuthState = 'landing' | 'login' | 'register' | 'forgot_password' | 'authenticated' | 'about' | 'connect';
type ActiveProfile = 'user' | 'recruiter' | 'admin';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
const MainApp: React.FC = () => {
  const { currentUser, fbUser, authLoading, refreshUser } = useFirebase();

  const [authState, setAuthState] = useState<AuthState>('landing');
  const [activeProfile, setActiveProfile] = useState<ActiveProfile>('user');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [showTermsWall, setShowTermsWall] = useState(false);
  const [currentView, setCurrentView] = useState<View>(() => {
    // Restore last view from sessionStorage on refresh
    const saved = sessionStorage.getItem('beWatuView');
    return (saved && Object.values(View).includes(saved as View))
      ? saved as View
      : View.Feed;
  });
  const [activeArenaIndustry, setActiveArenaIndustry] = useState<string | null>(
    () => sessionStorage.getItem('beWatuArenaIndustry') ?? null
  );
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChatUserId, setActiveChatUserId] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState<SubscriptionTier | null>(null);
  const [showPricing, setShowPricing] = useState(false);

  const [coPilotModalOpen, setCoPilotModalOpen] = useState(false);
  const [coPilotModalTitle, setCoPilotModalTitle] = useState('');
  const [coPilotModalContent, setCoPilotModalContent] = useState<string | null>(null);
  const [isCoPilotLoading, setIsCoPilotLoading] = useState(false);

  const [isSkillsGraphModalOpen, setIsSkillsGraphModalOpen] = useState(false);
  const [isVideoRecorderModalOpen, setIsVideoRecorderModalOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  // ── Report modal ───────────────────────────────────────────────────────────
  const [reportModalOpen,   setReportModalOpen]   = useState(false);
  const [reportModalTarget, setReportModalTarget] = useState<import('./components/ReportModal').ReportTarget | undefined>(undefined);
  const [reportModalType,   setReportModalType]   = useState<import('./components/ReportModal').ReportType | undefined>(undefined);

  const openReport = (target?: import('./components/ReportModal').ReportTarget, defaultType?: import('./components/ReportModal').ReportType) => {
    setReportModalTarget(target);
    setReportModalType(defaultType);
    setReportModalOpen(true);
  };

  const [activeCircleId, setActiveCircleId] = useState<number | null>(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [showSecurityPage, setShowSecurityPage] = useState(false);
  const [showConnectPage, setShowConnectPage] = useState(false);
  const [showAboutPage, setShowAboutPage]   = useState(false);
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
      loadAppData(currentUser);
    }
  }, [authLoading, currentUser, authState, data, loading]);

  // ── Terms wall check — fires when user data is loaded ────────────────────
  useEffect(() => {
    if (authState !== 'authenticated' || !currentUser || !data) return;
    const agreedVersion = (currentUser as any).agreedToTermsVersion;
    if (!agreedVersion || agreedVersion !== TERMS_VERSION) {
      setShowTermsWall(true);
    }
  }, [authState, currentUser?.id, !!data]);

  // ── Load app data ─────────────────────────────────────────────────────────
  const loadAppData = useCallback(async (user: User) => {
    setData(null); // Always clear previous user's data first
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

      const currentUid = fbUser?.uid ?? '';
      const otherUsers = firestoreUsers.filter(u =>
        u.id !== user.id && (u as any)._firestoreUid !== currentUid
      );

      const company = await getOrCreateCompanyForRecruiter(
        fbUser?.uid ?? '',
        user.name,
        user.headline
      ).catch(() => ({
        id: 1, _firestoreId: '', name: user.headline || user.name,
        description: '', industry: '', logoUrl: '', website: ''
      }));

      // Normalize circle members — Firestore stores Firebase UIDs but components
      // check membership using numeric user IDs. Map UIDs → numeric IDs.
      const uidToNumericId: Record<string, number> = {};
      uidToNumericId[fbUser?.uid ?? ''] = user.id;
      firestoreUsers.forEach(u => {
        if ((u as any)._firestoreUid) uidToNumericId[(u as any)._firestoreUid] = u.id;
      });

      const normalizedCircles = firestoreCircles.map(circle => ({
        ...circle,
        members: (circle.members ?? []).map((m: any) => {
          if (typeof m === 'number') return m;
          if (typeof m === 'string') return uidToNumericId[m] ?? m;
          return m;
        }),
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
        circles: normalizedCircles,
        articles: [],
      });
    } catch (err) {
      console.error(err);
      setError('Could not load application data.');
    } finally {
      setLoading(false);
    }
  }, [fbUser]);

  // ── Platform admin check ─────────────────────────────────────────────────
  useEffect(() => {
    if (!fbUser) { setIsPlatformAdmin(false); return; }
    import('./lib/firestoreService').then(({ isPlatformAdmin: checkAdmin }) => {
      checkAdmin(fbUser.uid).then(setIsPlatformAdmin).catch(() => {});
    });
  }, [fbUser?.uid]);

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
      const userToLoad = currentUser ?? {
        id: Date.now(), name, headline: '', bio: '', avatarUrl: '',
        industry: '', professionalGoals: [], reputation: 0, credits: 100,
        isRecruiter, isVerified: false, portfolio: [], verifiedAchievements: [],
        thirdPartyIntegrations: [], workStyle: { collaboration: 'Thrives in pairs', communication: 'Prefers asynchronous', workPace: 'Fast-paced and iterative' },
        values: [], availability: 'Exploring opportunities' as const,
        skills: [], verifiedSkills: null, microIntroductionUrl: null,
      };
      await loadAppData(userToLoad);
      // Always show terms wall for new registrations
      setShowTermsWall(true);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    // Reset all state before changing auth state to prevent stale data leaking
    setData(null);
    setCurrentView(View.Feed);
    setActiveProfile('user');
    setProfileUserId(null);
    setActiveChatUserId(null);
    setActiveCircleId(null);
    setActiveArenaIndustry(null);
    setFollowedUserIds(new Set());
    setAppliedJobIds([]);
    setSelectedCompany(null);
    setPublicProfileUserId(null);
    setShowSecurityPage(false);
    setShowConnectPage(false);
    setShowAboutPage(false);
    sessionStorage.removeItem('beWatuData');
    sessionStorage.removeItem('beWatuView');
    sessionStorage.removeItem('beWatuArenaIndustry');
    setAuthState('landing');
  };

  const handleTermsAgree = async () => {
    if (!fbUser) return;
    await recordTermsAgreement(fbUser.uid, TERMS_VERSION);
    setShowTermsWall(false);
  };

  const handleSwitchProfile = () => setActiveProfile(p => p === 'user' ? 'recruiter' : 'user');
  const handleEnterAdminPanel = () => setActiveProfile('admin');

  const handleChangePassword = async (currentPassword: string, newPassword: string) => changePassword(currentPassword, newPassword);
  const handleForgotPassword = async (email: string) => { await forgotPassword(email); };

  // ── Data mutation handlers ────────────────────────────────────────────────

  const addPost = async (content: string, circleId?: number) => {
    if (!data || !currentUser || !fbUser) return;
    const newPost = await fbCreatePost(content, currentUser, fbUser.uid, circleId);
    setData({ ...data, posts: [newPost, ...data.posts] });
  };

  const handlePerspectivePost = async (question: string, context: string, seeking: any[]) => {
    if (!fbUser || !currentUser) return;
    const { createPerspectivePost } = await import('./lib/generationalFeatures');
    await createPerspectivePost(question, context, seeking, {
      uid: fbUser.uid, numericId: currentUser.id,
      name: currentUser.name, avatarUrl: currentUser.avatarUrl,
    });
  };

  const handleWisdomThread = async (threadData: any) => {
    if (!fbUser || !currentUser) return;
    const { createWisdomThread } = await import('./lib/generationalFeatures');
    await createWisdomThread({
      ...threadData,
      authorId:     currentUser.id,
      authorName:   currentUser.name,
      authorAvatar: currentUser.avatarUrl,
    }, fbUser.uid);
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
    if (!data || !fbUser) return;

    // Find by numeric id
    const req = (data.connectionRequests as any[]).find(cr => cr.id === requestId)
      ?? (data.connectionRequests as any[]).find(cr => cr._firestoreId === String(requestId));

    if (!req) {
      console.warn('handleConnectionRequest: request not found for id', requestId);
      return;
    }

    // Update local state immediately for snappy UI
    setData(d => {
      if (!d) return null;
      return {
        ...d,
        connectionRequests: d.connectionRequests
          .filter(cr => cr.id !== req.id && (cr as any)._firestoreId !== req._firestoreId)
          .concat(status === 'accepted' ? [{ ...req, status: 'accepted' }] : []),
        notifications: d.notifications.filter(n => n.relatedId !== requestId),
      };
    });

    // Write to Firestore — local state already updated so user sees instant response
    if (req._firestoreId) {
      try {
        await fbRespondToConnection(
          req._firestoreId,
          status,
          req.senderUid ?? fbUser.uid,
          req.receiverUid ?? fbUser.uid
        );
      } catch (err) {
        console.error('respondToConnection failed:', err);
        // Revert local state if write failed
        setData(d => {
          if (!d) return null;
          return {
            ...d,
            connectionRequests: [...d.connectionRequests, { ...req, status: 'pending' }],
          };
        });
      }
    }
  };

  const handleSendConnection = async (receiverId: number) => {
    if (!currentUser || !fbUser || !data) return;

    // Guard: don't send if a request already exists in any direction
    const alreadyExists = (data.connectionRequests as any[]).some(cr =>
      (cr.fromUserId === currentUser.id && cr.toUserId === receiverId) ||
      (cr.fromUserId === receiverId && cr.toUserId === currentUser.id)
    );
    if (alreadyExists) return;

    const receiver = data.users.find(u => u.id === receiverId) as any;
    const newRequest = await fbSendConnectionRequest(
      fbUser.uid,
      currentUser.id,
      receiver?._firestoreUid ?? String(receiverId),
      receiverId
    );
    setData(d => d ? { ...d, connectionRequests: [...d.connectionRequests, newRequest] } : null);
  };

  const handleCancelConnection = async (requestId: number) => {
    if (!data) return;
    const req = (data.connectionRequests as any[]).find(r => r.id === requestId);
    if (req?._firestoreId) await fbCancelConnectionRequest(req._firestoreId);
    setData(d => d ? {
      ...d,
      connectionRequests: d.connectionRequests.filter(r => r.id !== requestId),
    } : null);
  };

  const handleRefreshConnection = async (requestId: number) => {
    if (!data) return;
    const req = (data.connectionRequests as any[]).find(r => r.id === requestId);
    if (req?._firestoreId) await fbRefreshConnectionRequest(req._firestoreId);
    setData(d => d ? {
      ...d,
      connectionRequests: d.connectionRequests.map(r =>
        r.id === requestId ? { ...r, createdAt: new Date() } : r
      ),
    } : null);
  };

  const handleViewCompany = async (companyId: number | string) => {
    if (!data) return;
    // First try local data (fast path)
    const local = data.companies.find(c =>
      c.id === companyId ||
      (c as any)._firestoreId === companyId ||
      String(c.id) === String(companyId)
    );
    if (local) { setSelectedCompany(local); return; }
    // Not in local state — fetch from Firestore by firestoreId string
    if (typeof companyId === 'string') {
      const fetched = await fetchCompanyById(companyId);
      if (fetched) {
        // Add to local companies so the modal has consistent data
        setData(d => d ? { ...d, companies: [...d.companies, fetched] } : null);
        setSelectedCompany(fetched);
      }
    } else {
      // Numeric ID not found locally — try as string firestoreId
      const fetched = await fetchCompanyById(String(companyId));
      if (fetched) setSelectedCompany(fetched);
    }
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

    // Call Claude proxy instead of broken Gemini endpoint
    const prompt = `Analyse this professional's background and return a JSON array of verified skills.
Each skill: { "name": string, "level": "beginner"|"intermediate"|"advanced"|"expert", "endorsements": 0, "source": "platform"|"resume"|"endorsement" }
Return ONLY valid JSON — no markdown, no explanation.

Background:
${resume || 'No resume provided'}

Digital presence:
${digitalFootprint || 'Not provided'}

References/testimonials:
${references || 'Not provided'}`;

    let verifiedSkills: any[] = [];
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: 'You are a professional skills analyser. Return only valid JSON arrays. No markdown. No explanation.',
          prompt,
          maxTokens: 800,
        }),
      });
      if (res.ok) {
        const { text } = await res.json();
        const clean = text.replace(/```json|```/g, '').trim();
        verifiedSkills = JSON.parse(clean);
      }
    } catch (err) {
      console.error('Skills generation error:', err);
      // Fall back to deriving from existing profile skills
      verifiedSkills = (currentUser.skills ?? []).map((s: any) => ({
        name:        typeof s === 'string' ? s : s.name,
        level:       'intermediate',
        endorsements: 0,
        source:      'platform',
      }));
    }

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

  const handleCreateCircle = async (name: string, description: string, extra?: Partial<Circle>) => {
    if (!currentUser || !fbUser) return;
    const newCircle = await createCircle({
      name, description,
      members: [currentUser.id],
      adminId: currentUser.id,
      ...extra,
    }, fbUser.uid);
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

  const handleLeaveCircle = async (circleId: number) => {
    if (!data || !currentUser || !fbUser) return;
    // Optimistic update
    setData(d => d ? {
      ...d,
      circles: d.circles.map(c => c.id === circleId
        ? { ...c, members: c.members.filter(id => id !== currentUser.id) }
        : c)
    } : null);
    // Persist to Firestore
    const circle = data.circles.find(c => c.id === circleId) as any;
    if (circle?._firestoreId) {
      try {
        await leaveCircle(circle._firestoreId, currentUser.id);
      } catch (err) {
        console.error('leaveCircle failed:', err);
        // Revert on failure
        setData(d => d ? {
          ...d,
          circles: d.circles.map(c => c.id === circleId
            ? { ...c, members: [...c.members, currentUser.id] }
            : c)
        } : null);
      }
    }
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
    sessionStorage.setItem('beWatuView', view);
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

  const handleNavigateToConnect = () => {
    if (authState === 'authenticated') setShowConnectPage(true);
    else setAuthState('connect');
  };
  const handleNavigateToLanding = () => setAuthState('landing');

  // ── Render ────────────────────────────────────────────────────────────────

  const FullPageLoader = () => (
    <div className="flex items-center justify-center h-screen" style={{ background: '#f5f5f4' }}>
      <LoadingIcon className="w-12 h-12 animate-spin" style={{ color: '#1a4a3a' }} />
    </div>
  );

  if (authLoading) return <FullPageLoader />;

  const renderContent = () => {
    if (loading) return (
      <div className="flex flex-col items-center justify-center h-screen">
        <LoadingIcon className="w-16 h-16 animate-spin" style={{ color: '#1a4a3a' }} />
        <p className="mt-4 text-lg text-stone-500 font-medium">Loading BeWatu...</p>
      </div>
    );

    if (error || !data || !currentUser) return (
      <div className="flex items-center justify-center h-screen bg-red-50 text-red-700">
        <div className="text-center p-8 border border-red-200 rounded-2xl bg-white shadow-lg">
          <h2 className="text-2xl font-bold mb-2">An Error Occurred</h2>
          <p>{error || 'Could not load application data.'}</p>
          <button onClick={() => loadAppData(currentUser!)} className="mt-4 px-4 py-2 rounded-xl text-white font-semibold" style={{ backgroundColor: '#1a4a3a' }}>Retry</button>
        </div>
      </div>
    );

    // Guard: if data belongs to a different user (mid-login transition), show loader
    if (data && currentUser && !data.users.some(u => u.id === currentUser.id)) return <FullPageLoader />;

    if (activeProfile === 'admin') {
      return (
        <Suspense fallback={<FullPageLoader />}>
          <AdminPanel onExit={() => setActiveProfile('user')} />
        </Suspense>
      );
    }

    if (activeProfile === 'recruiter') {
      return <RecruiterConsole onLogout={handleLogout} isTrialActive={isTrialActive} setTrialActive={setIsTrialActive} onSwitchProfile={handleSwitchProfile} talentPipeline={talentPipeline} allJobs={data.jobs} allCompanies={data.companies} currentUser={currentUser} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onToggleJobStatus={handleToggleJobStatus} />;
    }

    let content: React.ReactNode;
    switch (currentView) {
      case View.Feed:
        content = (
          <div className="space-y-4">
            <FactoryUnlockBanner onUnlock={() => setShowUpgradeModal('factory')} />
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
              onPerspective={handlePerspectivePost}
              onWisdomThread={handleWisdomThread}
              onAppreciatePost={handleAppreciatePost}
              onViewProfile={handleViewProfile}
              onViewCompany={handleViewCompany}
            />
          </div>
        );
        break;

      case View.People:
        content = (
          <People
            users={data.users
              .filter(u => u.id !== currentUser.id)
              .filter(u => !peopleSearch || 
                u.name.toLowerCase().includes(peopleSearch.toLowerCase()) ||
                u.headline?.toLowerCase().includes(peopleSearch.toLowerCase()) ||
                u.industry?.toLowerCase().includes(peopleSearch.toLowerCase())
              )}
            onEndorseSkill={endorseSkill}
            onStartMessage={startMessage}
            onAnalyzeSynergy={handleAnalyzeSynergy}
            onViewProfile={handleViewProfile}
            onConnect={handleSendConnection}
            connectionRequests={data.connectionRequests}
            currentUserId={currentUser.id}
            searchQuery={peopleSearch}
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
            onCancel={handleCancelConnection}
            onRefresh={handleRefreshConnection}
          />
        );
        break;

      case View.Jobs:
        content = (
          <div className="space-y-4">
            {!currentUser.isRecruiter && (
              <Suspense fallback={<div />}>
                <RecruiterUpgradeBanner
                  currentUser={currentUser}
                  fbUserUid={fbUser!.uid}
                  onSuccess={() => {
                    // Reload user data to pick up isRecruiter: true
                    loadAppData(currentUser);
                  }}
                />
              </Suspense>
            )}
            <Jobs
              jobs={data.jobs}
              companies={data.companies}
              onViewCompany={handleViewCompany}
              onAnalyzeMatch={handleAnalyzeJobMatch}
              onApplyForJob={handleApplyForJob}
              appliedJobIds={appliedJobIds}
              onReportJob={(id, title) => openReport({ content: { type: 'job_listing', id, preview: title } }, 'content')}
            />
          </div>
        );
        break;

      case View.Messaging:
        content = <Messaging users={data.users} messages={data.messages} currentUser={currentUser} onSendMessage={sendMessage} initialActiveUserId={activeChatUserId} />;
        break;

      case View.AIChat:
        content = (
          <CareerIntelligence
            currentUser={currentUser}
            allUsers={data.users}
            onNavigate={handleSetView}
          />
        );
        break;

      case View.Profile: {
        const userToShow = profileUserId ? data.users.find(u => u.id === profileUserId) : currentUser;
        content = userToShow
          ? <ProfilePage user={userToShow} isCurrentUser={userToShow.id === currentUser.id} connectionRequests={data.connectionRequests} circles={data.circles} onGenerateSkills={() => setIsSkillsGraphModalOpen(true)} onRecordVideo={() => setIsVideoRecorderModalOpen(true)} onPlayVideo={url => setPlayingVideoUrl(url)} onNavigate={handleSetView} onSelectCircle={handleSelectCircle} onChangePassword={handleChangePassword} onOpenSecurity={() => setShowSecurityPage(true)} onReportUser={(fid, name) => openReport({ user: { firestoreId: fid, name } }, 'user')} />
          : <div>User not found.</div>;
        break;
      }

      case View.Prove: {
        // Build social graph UIDs — connections + circle/pod members
        const connectedUids = new Set<string>();
        data.connectionRequests
          .filter(r => r.status === 'accepted')
          .forEach(r => {
            if (r.senderUid && r.senderUid !== fbUser?.uid) connectedUids.add(r.senderUid);
            if (r.receiverUid && r.receiverUid !== fbUser?.uid) connectedUids.add(r.receiverUid);
          });
        // Add circle/pod member Firestore UIDs
        data.circles
          .filter(c => currentUser && c.members.includes(currentUser.id))
          .forEach(c => {
            data.users
              .filter(u => c.members.includes(u.id) && u.id !== currentUser?.id)
              .forEach(u => { if ((u as any)._firestoreUid) connectedUids.add((u as any)._firestoreUid); });
          });

        content = (
          <ProveView
            currentUser={currentUser}
            onViewProfile={handleViewProfile}
            onStartMessage={startMessage}
            onConnect={handleSendConnection}
            allJobs={data.jobs}
            socialGraphUids={connectedUids}
          />
        );
        break;
      }

      case View.Arenas as any:
        content = (
          <Suspense fallback={<div />}>
            <ArenaDiscovery
              onSelectIndustry={(slug: string) => {
                setActiveArenaIndustry(slug);
                sessionStorage.setItem('beWatuArenaIndustry', slug);
                setCurrentView('ARENA_INDUSTRY' as any);
                sessionStorage.setItem('beWatuView', 'ARENA_INDUSTRY');
              }}
              onPostChallenge={() => {}}
              currentUserCompany={selectedCompany}
            />
          </Suspense>
        );
        break;

      case 'ARENA_INDUSTRY' as any:
        content = activeArenaIndustry ? (
          <Suspense fallback={<div />}>
            <ArenaIndustryView
              industry={activeArenaIndustry as any}
              onBack={() => setCurrentView(View.Arenas as any)}
              onSelectChallenge={(id: string) => {}}
              onPostChallenge={() => {}}
              currentUserCompany={selectedCompany}
            />
          </Suspense>
        ) : null;
        break;

      case View.Circles: {
        if (activeCircleId) {
          const circle = data.circles.find(c => c.id === activeCircleId);
          content = circle
            ? <CircleDetail circle={circle} allPosts={data.posts} allArticles={data.articles} allUsers={data.users} currentUser={currentUser} addPost={addPost} findAuthor={id => data.users.find(u => u.id === id)} onAppreciatePost={handleAppreciatePost} onAddMember={handleAddMemberToCircle} onRemoveMember={handleRemoveMemberFromCircle} onViewProfile={handleViewProfile} />
            : <div>Circle not found</div>;
        } else {
          content = <Circles
            circles={data.circles}
            onSelectCircle={handleSelectCircle}
            onCreateCircle={handleCreateCircle}
            onJoinCircle={async (circleId) => {
              if (!fbUser || !currentUser) return;
              handleAddMemberToCircle(circleId, currentUser.id);
            }}
            onApplyToCircle={async (circleId) => {
              if (!data || !currentUser) return;
              setData(d => d ? {
                ...d,
                circles: d.circles.map(c => c.id === circleId
                  ? { ...c, pendingMembers: [...(c.pendingMembers ?? []), currentUser.id] }
                  : c)
              } : null);
            }}
            onLeaveCircle={handleLeaveCircle}
            currentUserId={currentUser.id}
            currentUserFirestoreUid={fbUser?.uid}
          />;
        }
        break;
      }

      case View.Pricing:
        content = (
          <PricingPage
            onUpgrade={(tier) => setShowUpgradeModal(tier as SubscriptionTier)}
            onClose={() => setCurrentView(View.Feed)}
          />
        );
        break;

      case View.Factory:
        content = (
          <div className="p-8 text-center text-stone-500">
            Factory workspace coming soon.
          </div>
        );
        break;
        case View.Bridge:
  content = (
    <GenerationalFeed
      currentUser={currentUser}
      fbUserUid={fbUser.uid}
      onViewProfile={setPublicProfileUserId}
      onSelectCircle={(circleId) => {
        handleSelectCircle(circleId);
        handleSetView(View.Circles);
      }}
    />
  );
  break;

      case View.Companies:
        content = (
          <Suspense fallback={<div />}>
            <CompaniesPage onViewCompany={handleViewCompany} />
          </Suspense>
        );
        break;

      default:
        content = null;
    }

    return (
      <>
        {/* Security & Privacy overlay */}
        {showSecurityPage && currentUser && (
          <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: '#f5f5f4' }}>
            <div className="min-h-screen">
              <Header currentView={currentView} onNavigate={handleSetView} onLogout={handleLogout} onSwitchToRecruiter={handleSwitchProfile} onEnterAdminPanel={isPlatformAdmin ? handleEnterAdminPanel : undefined} notificationCount={data?.notifications?.filter(n => !(n as any).isRead).length ?? 0} pendingConnectionCount={0} />
              <main className="w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 pb-10 overflow-x-hidden">
                <Suspense fallback={<div />}>
                  <SecurityPrivacyPage user={currentUser} onBack={() => setShowSecurityPage(false)} onChangePassword={() => handleChangePassword('' as any, '' as any)} />
                </Suspense>
              </main>
            </div>
          </div>
        )}

        {/* Connect with us overlay */}
        {showConnectPage && (
          <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ backgroundColor: '#f0ede6' }}>
            <Suspense fallback={<div />}>
              <ConnectPage onNavigateBack={() => setShowConnectPage(false)} />
            </Suspense>
          </div>
        )}

        {/* Our story overlay */}
        {showAboutPage && (
          <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ backgroundColor: '#f0ede6' }}>
            <Suspense fallback={<div />}>
              <AboutPage
                onNavigateBack={() => setShowAboutPage(false)}
                onNavigateToConnect={() => { setShowAboutPage(false); setShowConnectPage(true); }}
              />
            </Suspense>
          </div>
        )}

        {/* Public profile overlay */}
        {publicProfileUserId && data && (
          <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: '#f5f5f4' }}>
            <div className="min-h-screen">
              <Header currentView={currentView} onNavigate={v => { setPublicProfileUserId(null); handleSetView(v); }} onLogout={handleLogout} onSwitchToRecruiter={handleSwitchProfile} onEnterAdminPanel={isPlatformAdmin ? handleEnterAdminPanel : undefined} notificationCount={data?.notifications?.filter(n => !(n as any).isRead).length ?? 0} pendingConnectionCount={data.connectionRequests.filter(r => r.toUserId === currentUser!.id && r.status === 'pending').length} />
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
            onSearch={(q) => {
              setPeopleSearch(q);
              handleSetView(View.People);
            }}
          />
          <main className="flex-grow w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 pb-24 sm:pb-10 overflow-x-hidden">{content}</main>
          {successBanner && <SuccessBanner message={successBanner} onClose={() => setSuccessBanner(null)} />}
          <Footer onNavigateToConnect={handleNavigateToConnect} onNavigateToAbout={() => setShowAboutPage(true)} onReportConcern={() => openReport(undefined, undefined)} />
          {selectedCompany && <CompanyProfileModal company={selectedCompany} allJobs={data.jobs} onClose={() => setSelectedCompany(null)} />}
          {coPilotModalOpen && <CoPilotModal title={coPilotModalTitle} isLoading={isCoPilotLoading} content={coPilotModalContent} onClose={() => { setCoPilotModalOpen(false); setCoPilotModalContent(null); }} />}
          {isSkillsGraphModalOpen && <SkillsGraphModal currentUser={currentUser} onSubmit={handleGenerateSkillsGraph} onClose={() => setIsSkillsGraphModalOpen(false)} />}
          {isVideoRecorderModalOpen && <VideoRecorderModal onSave={handleSaveMicroIntroduction} onClose={() => setIsVideoRecorderModalOpen(false)} />}
          {playingVideoUrl && <VideoPlayerModal videoUrl={playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} />}
          {reportModalOpen && fbUser && currentUser && (
            <ReportModal
              isOpen={reportModalOpen}
              onClose={() => setReportModalOpen(false)}
              reporter={{ firestoreUid: fbUser.uid, name: currentUser.name, email: fbUser.email ?? '' }}
              target={reportModalTarget}
              defaultType={reportModalType}
            />
          )}
          {/* Upgrade Modal */}
          {showUpgradeModal && (
            <UpgradeModal
              tier={showUpgradeModal}
              onClose={() => setShowUpgradeModal(null)}
              onSuccess={(tier) => {
                setShowUpgradeModal(null);
                if (tier === 'factory') setCurrentView(View.Factory);
              }}
            />
          )}
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
      {showTermsWall && currentUser && fbUser && (
        <TermsConsentModal
          userName={currentUser.name}
          isNewUser={!(currentUser as any).agreedToTermsVersion}
          onAgree={handleTermsAgree}
        />
      )}
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
