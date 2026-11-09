import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { SparkCreateHost } from './components/sparks/SparksTray';
import ShareWorkHost from './components/share/ShareWorkHost';
import InviteHost from './components/invite/InviteHost';
import TalkHost from './components/bridge/TalkHost';
import InviteResume from './components/invite/InviteResume';
import { tokenFromPath } from './lib/invitations';
import ProveView from './components/ProveView';
import { Header } from './components/Header';
import { MobileNav, MOBILE_NAV_CLEARANCE } from './components/MobileNav';
import AccountSheet from './components/mobile/AccountSheet';
import CommunityTabs from './components/CommunityTabs';
import SponsorIntentHost from './components/arenas/SponsorIntentHost';
import CreateMenu from './components/CreateMenu';
import { pathFor, parsePath, ARENA_INDUSTRY_VIEW, ARENA_CHALLENGE_VIEW, BRIDGE_TALKS_VIEW, BRIDGE_TALK_VIEW, INVESTOR_VIEW } from './lib/routes';
import InvestorPage from './components/investor/InvestorPage';
import { canPostChallenge, type CreateActionId } from './lib/createActions';
import { requestIntent } from './lib/uiIntent';
import { AppData, Post, User, Job, View, Message, Company, AppreciationType, Circle, Notification, LinkPreview } from './types';
import { analyzeSynergy, analyzeJobMatch, generateSkillsGraph } from './services/claudeService';
import { LoadingIcon } from './constants';
import { PodsIcon, BridgeIcon } from './components/IconComponents';
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
  startRecruiterTrialIfNeeded,
} from './lib/firebaseAuth';
import { auth } from './lib/firebase';

// ── Firestore services (single import block) ──────────────────────────────────
import {
  createPost as fbCreatePost,
  updatePostContent as fbUpdatePostContent,
  deletePost as fbDeletePost,
  fetchPosts,
  appreciatePost as fbAppreciatePost,
  sendMessage as fbSendMessage,
  subscribeToMessageThreads,
  subscribeToMessages,
  sendConnectionRequest as fbSendConnectionRequest,
  respondToConnectionRequest as fbRespondToConnection,
  fetchConnectionRequests,
  fetchFollowRequests,
  sendFollowRequest as fbSendFollowRequest,
  respondToFollowRequest as fbRespondToFollowRequest,
  cancelConnectionRequest as fbCancelConnectionRequest,
  refreshConnectionRequest as fbRefreshConnectionRequest,
  createJob as fbCreateJob,
  fetchJobs,
  updateJob as fbUpdateJob,
  deleteJob as fbDeleteJob,
  applyToJob as fbApplyToJob,
  fetchCircles,
  createCircle,
  leaveCircle,
  fetchUsers,
  fetchUsersByUids,
  fetchCompanyForRecruiter,
  fetchCompanies,
  subscribeToCirclePosts,
  subscribeToUnreadNotifCount,
  lookupFirebaseUidByNumericId,
  fetchArenaChallengeById,
  applyToJobWithProfile,
  fetchCompanyById,
} from './lib/firestoreService';
import { recordTermsAgreement } from './lib/firestoreService';
import TermsConsentModal, { TERMS_VERSION } from './components/TermsConsentModal';

// Minimum-age self-attestation — same versioning convention as TERMS_VERSION,
// so a future policy change (e.g. raising the minimum) can re-prompt
// everyone the same way a Terms update already does.
const AGE_CONFIRM_VERSION = '1.0';
import { goToFactory } from './utils/factoryHandoff';
import { isEngagementGated } from './lib/engagementGate';
import CookieBanner from './components/CookieBanner';
import AccountDeletionModal from './components/AccountDeletionModal';
import DataRequestModal from './components/DataRequestModal';
import {
  trackPodCreated, trackPodJoined, trackChallengeViewed,
  trackCommentMade, trackReactionGiven, trackConnectionMade,
  trackThreadStarted,
} from './lib/analytics/track';
import { computeAndStoreProfile, loadProfile } from './lib/recommendation/profile';
const TermsOfService = lazy(() => import('./components/legal/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./components/legal/PrivacyPolicy'));
const CommunityGuidelines = lazy(() => import('./components/legal/CommunityGuidelines'));

// ── Lazy-loaded components ────────────────────────────────────────────────────
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const ArenaChallengeDetail = lazy(() => import('./components/ArenaChallengeDetail'));
const HomePage = lazy(() => import('./components/HomePage'));
const People = lazy(() => import('./components/People'));
const Jobs = lazy(() => import('./components/Jobs'));
const Messaging = lazy(() => import('./components/Messaging'));
const CompanyProfileModal = lazy(() => import('./components/CompanyProfileModal'));
const CoPilotModal = lazy(() => import('./components/CoPilotModal'));
const SkillsGraphModal = lazy(() => import('./components/SkillsGraphModal'));
const ImportLinkedInModal = lazy(() => import('./components/ImportLinkedInModal'));
const ImportResumeModal = lazy(() => import('./components/ImportResumeModal'));
const ConnectionsView = lazy(() => import('./components/ConnectionsView'));
const VideoRecorderModal = lazy(() => import('./components/VideoRecorderModal'));
const VideoPlayerModal = lazy(() => import('./components/VideoPlayerModal'));
const Circles = lazy(() => import('./components/Circles'));
const CircleDetail = lazy(() => import('./components/CircleDetail'));
const CareerIntelligence = lazy(() => import('./components/CareerIntelligence'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const SecurityPrivacyPage = lazy(() => import('./components/SecurityPrivacyPage'));
// PublicSharePage: the /be/:username unauthenticated sharing page
const PublicSharePage = lazy(() => import('./components/PublicSharePage'));
// EndorseRequestPage: the /endorse/:token unauthenticated endorsement page
const EndorseRequestPage = lazy(() => import('./components/EndorseRequestPage'));
const InvitePage = lazy(() => import('./components/invite/InvitePage'));
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
const ArenasHome = lazy(() => import('./components/arenas/ArenasHome'));
const DiscoverPage = lazy(() => import('./components/DiscoverPage'));
const PostChallengeFlow = lazy(() => import('./components/arenas/PostChallengeFlow'));
const ArenaIndustryView = lazy(() => import('./components/arenas/ArenaIndustryView'));
const RecruiterUpgradeBanner = lazy(() => import('./components/recruiter/RecruiterUpgradeBanner'));
const GenerationalFeed = lazy(() => import('./components/GenerationalFeed'));
const CompaniesPage = lazy(() => import('./components/CompaniesPage'));
import ProfileOverlay from './components/ProfileOverlay';
import PullToRefresh from './components/PullToRefresh';

type AuthState = 'landing' | 'login' | 'register' | 'forgot_password' | 'authenticated' | 'about' | 'connect';
type ActiveProfile = 'user' | 'recruiter' | 'admin';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
const MainApp: React.FC = () => {
  const { currentUser, fbUser, authLoading, refreshUser } = useFirebase();

  // bewatu-factory (and other external callers) link directly to
  // /login and /register expecting a real page -- this app has no router,
  // so without this those paths 404 at the CDN (see vercel.json rewrites)
  // and, even once rewritten to index.html, would otherwise always land on
  // the landing page instead of the view the link promised.
  const [authState, setAuthState] = useState<AuthState>(() => {
    if (typeof window === 'undefined') return 'landing';
    if (window.location.pathname === '/register') return 'register';
    if (window.location.pathname === '/login') return 'login';
    return 'landing';
  });
  const [activeProfile, setActiveProfile] = useState<ActiveProfile>('user');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [showTermsWall, setShowTermsWall] = useState(false);
  const [showCommunityWall, setShowCommunityWall] = useState(false);
  // Compliance fix (launch-readiness review): there was no age-gate anywhere
  // in the app at all, despite it being documented as a live control — no
  // field on registration, no checkbox, nothing. Gated the same way as
  // Terms/Community (a post-auth "wall", not a registration-form checkbox)
  // specifically because a form checkbox is bypassed entirely by Google
  // sign-in, which upserts an account with zero user interaction beyond the
  // OAuth popup — the exact same bypass class as the trial-clock bug fixed
  // earlier in this review. A wall keyed off the user doc, not the signup
  // path, catches every path uniformly, including future ones.
  const [showAgeWall, setShowAgeWall] = useState(false);
  // An address like /arenas or /arenas/payments opens that destination. Otherwise the last view this tab had is restored on refresh.
  const deepLink = useRef(typeof window !== 'undefined' ? parsePath(window.location.pathname) : null).current;
  const [currentView, setCurrentView] = useState<View>(() => {
    if (deepLink) return deepLink.view as View;
    const saved = sessionStorage.getItem('beWatuView');
    return (saved && Object.values(View).includes(saved as View))
      ? saved as View
      : View.Feed;
  });
  const [activeArenaIndustry, setActiveArenaIndustry] = useState<string | null>(
    () => deepLink?.industry ?? sessionStorage.getItem('beWatuArenaIndustry') ?? null
  );
  // Which challenge's page is open (the address names it); the record itself is loaded into selectedChallenge.
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(() => deepLink?.challengeId ?? null);
  // Which Bridge Talk is open (the address names it).
  const [activeTalkId, setActiveTalkId] = useState<string | null>(() => deepLink?.talkId ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [postChallengeOpen, setPostChallengeOpen] = useState(false);
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChatUserId, setActiveChatUserId] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [peopleSearch, setPeopleSearch] = useState('');
  // Root-cause fix (launch-readiness review): the People directory used to
  // filter client-side over whatever fetchUsers() had already loaded (the
  // 50 most-recent public users) — search only ever searched that slice,
  // never the real user base. null = no active search (fall back to the
  // directory's default list below); [] = a real search that matched
  // nothing.
  const [peopleSearchResults, setPeopleSearchResults] = useState<User[] | null>(null);
  const [isPeopleSearching, setIsPeopleSearching] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState<SubscriptionTier | null>(null);
  const [showPricing, setShowPricing] = useState(false);

  const [coPilotModalOpen, setCoPilotModalOpen] = useState(false);
  const [coPilotModalTitle, setCoPilotModalTitle] = useState('');
  const [coPilotModalContent, setCoPilotModalContent] = useState<string | null>(null);
  const [isCoPilotLoading, setIsCoPilotLoading] = useState(false);

  const [isSkillsGraphModalOpen, setIsSkillsGraphModalOpen] = useState(false);
  const [isImportLinkedInOpen, setIsImportLinkedInOpen] = useState(false);
  const [isImportResumeOpen, setIsImportResumeOpen] = useState(false);
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

  const [activeCircleId,   setActiveCircleId]   = useState<number | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<any | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [lastCircleVisited, setLastCircleVisited] = useState<Record<number, Date>>({});
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [showSecurityPage, setShowSecurityPage] = useState(false);
  const [showConnectPage, setShowConnectPage] = useState(false);
  const [showAboutPage, setShowAboutPage]   = useState(false);
  // The phone's You menu (profile, settings, support, legal); opened from the You tab and the header avatar.
  const [accountOpen, setAccountOpen] = useState(false);
  // Where the next page of the feed starts. Posts load in pages so a long feed never has to be fetched at once.
  const postCursor = useRef<{ last: any; done: boolean }>({ last: null, done: true });
  // bewatu-factory (and other external callers) link directly to
  // /terms, /privacy and /community-guidelines expecting real pages --
  // same deep-link gap as /login and /register (see vercel.json rewrites).
  const [showTermsPage, setShowTermsPage] = useState(
    () => typeof window !== 'undefined' && window.location.pathname === '/terms'
  );
  const [showPrivacyPage, setShowPrivacyPage] = useState(
    () => typeof window !== 'undefined' && window.location.pathname === '/privacy'
  );
  const [showCommunityPage, setShowCommunityPage] = useState(
    () => typeof window !== 'undefined' && window.location.pathname === '/community-guidelines'
  );
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [showDataRequestModal, setShowDataRequestModal] = useState(false);
  const [publicProfileUserId, setPublicProfileUserId] = useState<number | null>(null);
  const [followedUserIds, setFollowedUserIds] = useState<Set<number>>(new Set());

  const [appliedJobIds, setAppliedJobIds] = useState<number[]>([]);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [talentPipeline, setTalentPipeline] = useState<{ [key: string]: User[] }>({
    'New Applicants': [], 'Sourced': [], 'Screening': [], 'Interview': [], 'Offer': [], 'Hired': [],
  });
  // Hardening (launch-readiness review, P1): this used to be a synchronous
  // localStorage read — trivially bypassed by clearing site data, an
  // incognito window, or a different browser, giving a recruiter an
  // unbounded string of fresh 30-day trials. recruiterTrialEndDate now
  // lives on the user's own Firestore doc (see firestore.rules'
  // isFirstTimeTrialDateSet: settable once, never resettable by the
  // recruiter). currentUser isn't available synchronously at mount, so
  // this starts optimistic (true) and the effect below corrects it once
  // the real doc loads — RecruiterConsole's own !isTrialActive checks on
  // search/actions still enforce the real value the moment it's known.
  const [isTrialActive, setIsTrialActive] = useState<boolean>(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Set right after a brand-new recruiter signs up via Google (popup flow
  // only -- see loginWithGoogle's comment for why Safari's redirect path
  // can't wire this the same way). Prompts for payment immediately rather
  // than leaving it until the trial expires, matching what the email/
  // password signup already does by showing PaymentForm up front.
  const [promptRecruiterPaymentSetup, setPromptRecruiterPaymentSetup] = useState(false);

  useEffect(() => {
    if (!currentUser?.isRecruiter) return;
    // Admin-set override (AdminPanel's Recruiters tab) — used to onboard
    // recruited companies without billing friction. Always active, no
    // trial-end check, regardless of recruiterTrialEndDate.
    if (currentUser.recruiterFeeWaived) { setIsTrialActive(true); return; }
    const end = currentUser.recruiterTrialEndDate;
    setIsTrialActive(end ? new Date().getTime() < new Date(end).getTime() : true);
  }, [currentUser?.isRecruiter, currentUser?.recruiterFeeWaived, currentUser?.recruiterTrialEndDate]);

  // ── People directory search (real search, not a client-side filter) ──────
  useEffect(() => {
    if (!peopleSearch.trim()) { setPeopleSearchResults(null); return; }
    let cancelled = false;
    setIsPeopleSearching(true);
    const handle = setTimeout(async () => {
      try {
        // Dynamic import keeps the algoliasearch client out of the main
        // bundle -- only fetched once someone actually types a search.
        const { searchUserUids } = await import('./lib/algoliaSearch');
        const uids = await searchUserUids(peopleSearch);
        const users = await fetchUsersByUids(uids);
        if (!cancelled) setPeopleSearchResults(users);
      } catch (err) {
        console.error('People search failed:', err);
        if (!cancelled) setPeopleSearchResults([]);
      } finally {
        if (!cancelled) setIsPeopleSearching(false);
      }
    }, 300); // debounce — avoid a search + secured-key round trip per keystroke
    return () => { cancelled = true; clearTimeout(handle); };
  }, [peopleSearch]);

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

  // ── Real-time unread notification count + membership sync ────────────────
  useEffect(() => {
    if (!fbUser?.uid || !currentUser) return;
    const unsub = subscribeToUnreadNotifCount(fbUser.uid, setUnreadNotifCount);

    // Also watch for circle_approved / circle_denied so membership state
    // updates immediately without requiring a page reload
    let notifUnsub: (() => void) | null = null;
    import('firebase/firestore').then(({ collection, query, where, onSnapshot, orderBy, limit }) => {
      import('./lib/firebase').then(({ db }) => {
        const q = query(
          collection(db, 'users', fbUser.uid, 'notifications'),
          where('isRead', '==', false),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        notifUnsub = onSnapshot(q, snap => {
          snap.docs.forEach(d => {
            const n = d.data();
            if (n.type === 'circle_approved' && n.circleFirestoreId) {
              // Defer setData to avoid "Cannot update a component while rendering
              // a different component" (React error #306). onSnapshot can fire
              // synchronously during a render cycle; setTimeout pushes it out.
              setTimeout(() => {
                setData(prev => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    circles: prev.circles.map(c => {
                      if ((c as any)._firestoreId !== n.circleFirestoreId) return c;
                      if (c.members.includes(currentUser.id)) return c;
                      return { ...c, members: [...c.members, currentUser.id] };
                    }),
                  };
                });
              }, 0);
            }
          });
        });
      });
    }).catch(() => {});

    return () => { unsub(); notifUnsub?.(); };
  }, [fbUser?.uid, currentUser?.id]);

  // ── Recommendation profile — compute once per session, max once per 24h ──
  useEffect(() => {
    if (!fbUser?.uid || !currentUser) return;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    loadProfile(fbUser.uid).then(existing => {
      const stale = !existing || (Date.now() - (existing.computedAt ?? 0)) > TWENTY_FOUR_HOURS;
      if (stale) {
        // Fire-and-forget — never blocks the UI
        computeAndStoreProfile(fbUser.uid).catch(() => {});
      }
    }).catch(() => {});
  }, [fbUser?.uid, currentUser?.id]);

  // ── Weekly-active stamp (lib/engagementGate.ts) — once per calendar day ──
  // Calendar-day granularity (not onAuthStateChanged/every page load) keeps
  // this to at most one write per user per day.
  useEffect(() => {
    if (!fbUser?.uid || !currentUser) return;
    const today = new Date().toISOString().slice(0, 10);
    if (currentUser.lastActiveAt?.slice(0, 10) === today) return;
    updateUserInFirestore(fbUser.uid, { lastActiveAt: new Date().toISOString() }).catch(() => {});
  }, [fbUser?.uid, currentUser?.id, currentUser?.lastActiveAt]);

  // Uses a session-level flag so it never re-fires once dismissed this session
  useEffect(() => {
    if (authState !== 'authenticated' || !currentUser || !data) return;

    // A wall is already up (e.g. loadAppData re-ran via pull-to-refresh/Retry and
    // data went null -> truthy again). The accept handlers chain into the next
    // wall themselves, so don't stack a second one on top.
    if (showAgeWall || showTermsWall || showCommunityWall) return;

    // Step 0 — check minimum-age confirmation (must come before Terms/Community)
    if (!showAgeWall) {
      const ageSession = sessionStorage.getItem('ageConfirmedThisSession');
      if (ageSession !== AGE_CONFIRM_VERSION) {
        const agreedAge = (currentUser as any).agreedToAgeVersion;
        if (!agreedAge || agreedAge !== AGE_CONFIRM_VERSION) {
          setShowAgeWall(true);
          return;
        }
      }
    }

    // Step 1 — check Terms of Service
    if (!showTermsWall) {
      const sessionAgreed = sessionStorage.getItem('termsAgreedThisSession');
      if (sessionAgreed !== TERMS_VERSION) {
        const agreedVersion = (currentUser as any).agreedToTermsVersion;
        if (!agreedVersion || agreedVersion !== TERMS_VERSION) {
          setShowTermsWall(true);
          return; // Show terms first — community wall shown after terms accepted
        }
      }
    }

    // Step 2 — check Community Guidelines (required to use platform)
    if (!showCommunityWall) {
      const communitySession = sessionStorage.getItem('communityAgreedThisSession');
      if (!communitySession) {
        const agreedCommunity = (currentUser as any).agreedToCommunityVersion;
        if (!agreedCommunity || agreedCommunity !== '1.0') {
          setShowCommunityWall(true);
        }
      }
    }
  // `!!data` is a dependency on purpose: the early return above bails while
  // `data` is still null, and on a page reload auth/currentUser resolve before
  // loadAppData finishes. Without it this effect ran once (data null), returned,
  // and never re-ran, so un-consented users got no prompts. Using the boolean
  // (not `data`) means it re-evaluates when data first loads but not on every
  // data mutation; the session flags and agreed*Version fields still
  // short-circuit users who already agreed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, currentUser?.id, !!data]);

  // ── Load app data ─────────────────────────────────────────────────────────
  const loadAppData = useCallback(async (user: User) => {
    setData(null); // Always clear previous user's data first
    setLoading(true);
    setError(null);
    try {
      const [firestorePosts, firestoreJobs, firestoreCircles, firestoreConnections, firestoreFollowRequests, firestoreUsers, firestoreCompanies] =
        await Promise.all([
          fetchPosts(50).catch(() => ({ posts: [], lastDoc: null })),
          fetchJobs().catch(() => []),
          fetchCircles().catch(() => []),
          fetchConnectionRequests(fbUser?.uid ?? '').catch(() => []),
          fetchFollowRequests(fbUser?.uid ?? '').catch(() => []),
          fetchUsers().catch(() => []),
          fetchCompanies().catch(() => []),
        ]);
      // Messages are no longer fetched here (P0 11: this used to be an
      // unbounded N+1 fetch — every thread, then every message in every
      // thread, sequentially, on every boot). The dedicated live
      // subscribeToMessageThreads effect below populates them instead, as
      // soon as `data` exists, and keeps them live for the whole session.
      const firestoreMessages: Message[] = [];

      postCursor.current = { last: firestorePosts.lastDoc ?? null, done: !firestorePosts.lastDoc || firestorePosts.posts.length < 50 };

      const currentUid = fbUser?.uid ?? '';
      const otherUsers = firestoreUsers.filter(u =>
        u.id !== user.id && (u as any)._firestoreUid !== currentUid
      );

      // ── Connection request hygiene ────────────────────────────────────────
      // 1. Mark pending requests older than 5 days as expired (client-side;
      //    the Firestore doc is left as-is until the sender cancels or refreshes).
      // 2. Remove any "expired" entry where the two users are now connected —
      //    accepted connections must never appear in the expired list.
      const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      // Collect accepted-connection pairs so we can cross-check below
      const acceptedPairs = new Set<string>();
      firestoreConnections
        .filter((r: any) => r.status === 'accepted')
        .forEach((r: any) => {
          acceptedPairs.add(`${r.fromUserId}-${r.toUserId}`);
          acceptedPairs.add(`${r.toUserId}-${r.fromUserId}`);
        });

      const hygieneConnections = firestoreConnections.map((r: any) => {
        if (r.status !== 'pending') return r;
        const createdMs = r.createdAt?.toDate?.()?.getTime?.()
          ?? r.createdAt?.getTime?.()
          ?? (typeof r.createdAt === 'number' ? r.createdAt : null);
        if (createdMs && now - createdMs > FIVE_DAYS_MS) {
          // Only mark expired if neither user is already connected
          const pairKey = `${r.fromUserId}-${r.toUserId}`;
          if (!acceptedPairs.has(pairKey)) {
            return { ...r, status: 'expired' };
          }
        }
        return r;
      });

      const filteredConnections = hygieneConnections.filter((r: any) => {
        // Drop expired requests — they've been pending too long, keep UI clean
        if (r.status === 'expired') return false;
        // Drop pending/expired entries where the pair is already connected
        if (r.status === 'pending') {
          const pairKey = `${r.fromUserId}-${r.toUserId}`;
          if (acceptedPairs.has(pairKey)) return false;
        }
        return true;
      });

      // Only fetch company for approved recruiters — never auto-create.
      // Company creation happens explicitly in Gate 4 of recruiter registration.
      //
      // Real bug found verifying the recruiter-gating fix above: this used
      // to only fall back to the synthesized placeholder on a REJECTED
      // promise (.catch()), but fetchCompanyForRecruiter deliberately
      // *resolves* null when the recruiter has no company yet (the exact
      // "Gate 4 not completed" case this comment already describes) — so
      // `company` ended up as plain null, and `company._firestoreId` two
      // lines down crashed the entire app on load for every recruiter
      // without a company, not just some edge case. The `?? {...}` below
      // catches that resolved-null case the same way .catch() already
      // caught the rejected one.
      const company = (user as any).isRecruiter === true
        ? await fetchCompanyForRecruiter(fbUser?.uid ?? '').catch(() => null) ?? {
            id: 1, _firestoreId: '', name: user.headline || user.name,
            description: '', industry: '', logoUrl: '', website: ''
          }
        : { id: 1, _firestoreId: '', name: '', description: '', industry: '', logoUrl: '', website: '' };

      // The job board and company profiles need the full company directory, not
      // just the current recruiter's own company — without this, Jobs.tsx's
      // `companies.find(c => c.id === job.companyId)` join fails for every job
      // and every user, since `companies` only ever held this one entry.
      // Still fold in the synthesized placeholder for a recruiter who hasn't
      // created a real company doc yet (Gate 4 not completed).
      const mergedCompanies = (user as any).isRecruiter === true && !(company as any)._firestoreId
        ? [...firestoreCompanies, company]
        : firestoreCompanies;

      // Normalize circle members — Firestore stores Firebase UIDs but components
      // check membership using numeric user IDs. Map UIDs → numeric IDs.
      const uidToNumericId: Record<string, number> = {};
      // Always include the current user first — they are filtered out of otherUsers
      // but may appear in pod members arrays
      uidToNumericId[fbUser?.uid ?? ''] = user.id;
      firestoreUsers.forEach(u => {
        if ((u as any)._firestoreUid) uidToNumericId[(u as any)._firestoreUid] = u.id;
      });

      const normalizedCircles = firestoreCircles.map(circle => {
        const mapId = (m: any) => {
          if (typeof m === 'number') return m;
          if (typeof m === 'string') return uidToNumericId[m] ?? m;
          return m;
        };
        return {
          ...circle,
          // Store raw UIDs for Firestore writes
          _memberUids:         (circle.members ?? []).filter((m: any) => typeof m === 'string'),
          _pendingMemberUids:  ((circle as any).pendingMembers ?? []).filter((m: any) => typeof m === 'string'),
          _pendingInviteUids:  ((circle as any).pendingInvites ?? []).filter((m: any) => typeof m === 'string'),
          // Map to numeric IDs for UI membership checks
          members:             (circle.members ?? []).map(mapId),
          pendingMembers:      ((circle as any).pendingMembers ?? []).map(mapId),
          pendingInvites:      ((circle as any).pendingInvites ?? []).map(mapId),
          // Resolve adminId from adminUid if missing
          adminId:             circle.adminId || uidToNumericId[(circle as any).adminUid ?? ''] || 0,
        };
      });

      setData({
        users: [user, ...otherUsers],
        // Exclude circle posts from the main feed — they load per-circle via
        // subscribeToCirclePosts. This prevents circle conversations leaking
        // into the global feed for all users.
        posts: firestorePosts.posts.filter((p: any) => !p.circleId),
        jobs: firestoreJobs,
        companies: mergedCompanies,
        messages: firestoreMessages,
        notifications: [],
        connectionRequests: filteredConnections,
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

  // ── Real-time circle posts subscription ──────────────────────────────────
  // Subscribes only to the active circle's posts — not all posts globally.
  // This scales correctly: each user only listens to one circle at a time.
  // Unsubscribes automatically when they leave the circle.
  useEffect(() => {
    if (!activeCircleId || !fbUser || authState !== 'authenticated') return;

    // Find the Firestore ID for this circle
    const circle = data?.circles?.find(c => c.id === activeCircleId) as any;
    const firestoreCircleId = circle?._firestoreId ?? String(activeCircleId);

    let unsub: (() => void) | null = null;

    unsub = subscribeToCirclePosts(firestoreCircleId, (newPosts: any[]) => {
      setData(d => {
        if (!d) return null;
        const nonCirclePosts = d.posts.filter((p: any) =>
          !p.circleId ||
          (p.circleId !== activeCircleId && p.circleId !== firestoreCircleId)
        );
        return { ...d, posts: [...nonCirclePosts, ...newPosts] };
      });
    });

    return () => { unsub?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircleId, authState]);
  useEffect(() => {
    if (!fbUser) { setIsPlatformAdmin(false); return; }
    import('./lib/firestoreService').then(({ isPlatformAdmin: checkAdmin }) => {
      checkAdmin(fbUser.uid).then(setIsPlatformAdmin).catch(() => {});
    });
  }, [fbUser?.uid]);

  // ── Auth handlers ─────────────────────────────────────────────────────────

  // Bug fix (paywall finding, bug 1 of 2): the 30-day recruiter trial clock
  // used to only ever start inside handleFirebaseLogin — never on
  // registration or Google login. Since isTrialActive's own initializer
  // defaults to "active" when no end-date exists at all, a recruiter who
  // registered or used Google sign-in got a permanent, never-counting-down
  // free trial by accident. Every recruiter auth path below now calls the
  // same Firestore-backed lib/firebaseAuth.ts helper, exactly once (it never
  // overwrites an existing date, and firestore.rules enforces that server-side
  // too). Uses auth.currentUser?.uid rather than the fbUser from context —
  // fbUser is a React closure captured when each handler started, and would
  // still read stale (usually null) here since nothing re-renders this
  // in-flight closure mid-await; auth.currentUser is the live Firebase SDK
  // singleton and is reliably up to date the instant sign-in resolves.
  const startTrialAndRefresh = async (loggedInUser: User) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const trialEnd = await startRecruiterTrialIfNeeded(uid);
    refreshUser({ ...loggedInUser, recruiterTrialEndDate: trialEnd } as any);
  };

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
      if (isRecruiterLogin) await startTrialAndRefresh(user);
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
      const result = await loginWithGoogle(isRecruiterLogin);
      // null is the expected return on Safari -- loginWithGoogle just
      // kicked off a full-page redirect to Google instead of a popup, and
      // the real result arrives later via onAuthChange on the page that
      // loads after the redirect back. Treating it as a failure here was a
      // real bug: it could show "Google sign-in failed" to the user in the
      // moment right before the page actually navigates away.
      if (!result) return;
      const { user, isNewUser } = result;
      setActiveProfile(isRecruiterLogin ? 'recruiter' : 'user');
      setAuthState('authenticated');
      if (isRecruiterLogin) await startTrialAndRefresh(user);
      // New recruiter, signed up just now via Google -- no payment method
      // was ever collected (unlike the email/password path, which shows
      // PaymentForm before the account even exists). Prompt right away
      // instead of waiting for the trial to expire.
      if (isRecruiterLogin && isNewUser) setPromptRecruiterPaymentSetup(true);
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
      // A Stripe customer id is linked by the server when the subscription is created (api/create-subscription.ts), never by the browser.
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
      if (isRecruiter) await startTrialAndRefresh(userToLoad as User);
      await loadAppData(userToLoad);
      // Only show terms wall if user hasn't agreed to current version
      const sessionAgreed = sessionStorage.getItem('termsAgreedThisSession');
      if (sessionAgreed !== TERMS_VERSION) {
        // Will be evaluated by the useEffect once currentUser loads
        // Don't force-show here — let the useEffect handle it
      }
    } finally {
      setLoading(false);
    }
  };

  // Next page of the main feed (30 posts). Returns { done: true } when the server has no more.
  const loadMorePosts = useCallback(async (): Promise<{ done: boolean }> => {
    const c = postCursor.current;
    if (c.done || !c.last) return { done: true };
    const page = await fetchPosts(30, c.last);
    postCursor.current = { last: page.lastDoc ?? c.last, done: !page.lastDoc || page.posts.length < 30 };
    const incoming = page.posts.filter((p: any) => !p.circleId);
    setData(d => {
      if (!d) return d;
      const have = new Set(d.posts.map(p => p.id));
      return { ...d, posts: [...d.posts, ...incoming.filter(p => !have.has(p.id))] };
    });
    return { done: postCursor.current.done };
  }, []);

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
    sessionStorage.removeItem('termsAgreedThisSession');
    sessionStorage.removeItem('communityAgreedThisSession');
    setAuthState('landing');
  };

  const handleAgeAgree = async () => {
    if (!fbUser) return;
    const { updateUserInFirestore } = await import('./lib/firebaseAuth');
    await updateUserInFirestore(fbUser.uid, {
      agreedToAgeVersion: AGE_CONFIRM_VERSION,
      agreedToAgeAt: new Date().toISOString(),
    } as any);
    sessionStorage.setItem('ageConfirmedThisSession', AGE_CONFIRM_VERSION);
    setShowAgeWall(false);
    // Chain into Terms next, same way handleTermsAgree chains into Community —
    // this wall doesn't get its own re-render pass to re-check, so it has to
    // trigger the next one directly.
    const sessionAgreed = sessionStorage.getItem('termsAgreedThisSession');
    if (sessionAgreed !== TERMS_VERSION) {
      const agreedVersion = (currentUser as any)?.agreedToTermsVersion;
      if (!agreedVersion || agreedVersion !== TERMS_VERSION) {
        setShowTermsWall(true);
      }
    }
  };

  // A user who declines the age confirmation is signed out rather than let
  // through — the whole point of the gate is that "I couldn't confirm" must
  // not be a route past it.
  const handleAgeDecline = async () => {
    setShowAgeWall(false);
    await handleLogout();
  };

  const handleTermsAgree = async () => {
    if (!fbUser) return;
    await recordTermsAgreement(fbUser.uid, TERMS_VERSION);
    sessionStorage.setItem('termsAgreedThisSession', TERMS_VERSION);
    setShowTermsWall(false);
    // Check if community guidelines also need agreement
    const communitySession = sessionStorage.getItem('communityAgreedThisSession');
    if (!communitySession) {
      const agreedCommunity = (currentUser as any)?.agreedToCommunityVersion;
      if (!agreedCommunity || agreedCommunity !== '1.0') {
        setShowCommunityWall(true);
      }
    }
  };

  const handleCommunityAgree = async () => {
    if (!fbUser) return;
    // Write to Firestore
    const { updateUserInFirestore } = await import('./lib/firebaseAuth');
    await updateUserInFirestore(fbUser.uid, {
      agreedToCommunityVersion: '1.0',
      agreedToCommunityAt: new Date().toISOString(),
    });
    sessionStorage.setItem('communityAgreedThisSession', '1.0');
    setShowCommunityWall(false);
  };

  const handleSwitchProfile = () => setActiveProfile(p => {
    if (p === 'recruiter') return 'user';
    // Defense in depth alongside the onSwitchToRecruiter={isRecruiter ? ... :
    // undefined} gate on the Header button below — this used to be a bare
    // toggle, so any signed-in user (not just real recruiters) who could
    // trigger it ended up with the full Recruiter Console and no paywall,
    // since isTrialActive's own effect only computes for isRecruiter users
    // and otherwise stays at its default `true` forever.
    return currentUser?.isRecruiter ? 'recruiter' : 'user';
  });

  const handleDeleteAccount = async () => {
    if (!fbUser || !currentUser) return;
    const { softDeleteAccount } = await import('./lib/accountService');
    await softDeleteAccount(fbUser.uid);
    // Sign out and reset state
    await handleLogout();
  };

  const handleExportData = async () => {
    if (!fbUser || !currentUser) return;
    setShowDataRequestModal(true);
  };

  const handleUploadVideo = async (file: File) => {
    if (!fbUser || !currentUser) return;
    try {
      // Upload video to Firebase Storage → get URL → save as microIntroductionUrl
      const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('./lib/firebase');
      const storageRef = ref(storage, `microIntros/${fbUser.uid}/${Date.now()}_${file.name}`);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file);
        task.on('state_changed', undefined, reject, resolve);
      });
      const url = await getDownloadURL(storageRef);
      await handleSaveMicroIntroduction(url);

      // ── AI verification (non-blocking — runs after upload completes) ──────
      // Create a placeholder reelVibes doc for the micro intro so verification
      // has a target document. If no reelId exists, write one now and store it
      // on the user doc so AIVerificationBadge can reference it.
      try {
        const { addDoc, collection, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('./lib/firebase');
        // Write a minimal reelVibes doc representing this micro intro
        const reelRef = await addDoc(collection(db, 'reelVibes'), {
          authorUid:   fbUser.uid,
          authorId:    currentUser.id,
          authorName:  currentUser.name,
          authorAvatar: currentUser.avatarUrl ?? '',
          authorHeadline: currentUser.headline ?? '',
          videoUrl:    url,
          caption:     'Vibe Clip',
          skill:       '',
          tags:        [],
          likedByUids: [],
          commentCount: 0,
          viewCount:   0,
          isMicroIntro: true,
          aiVerification: { status: 'pending', verdict: null, confidence: null, checkedAt: serverTimestamp(), appeal: null },
          createdAt:   serverTimestamp(),
        });
        // Store the reel doc ID on the user so we can retrieve the badge later
        await updateDoc(doc(db, 'users', fbUser.uid), {
          microIntroReelId: reelRef.id,
        });
        // Submit frame for analysis (non-blocking)
        const { submitForVerification } = await import('./lib/videoUtils');
        const verifyToken = await fbUser.getIdToken();
        void submitForVerification({ reelId: reelRef.id, authorUid: fbUser.uid, idToken: verifyToken, file, type: 'microIntro' });
      } catch (verifyErr) {
        console.warn('[handleUploadVideo] verification setup failed (non-blocking):', verifyErr);
      }
    } catch (err) {
      console.error('Video upload failed:', err);
    }
  };
  const handleEnterAdminPanel = () => setActiveProfile('admin');

  const handleChangePassword = async (currentPassword: string, newPassword: string) => changePassword(currentPassword, newPassword);
  const handleForgotPassword = async (email: string) => { await forgotPassword(email); };

  // ── Data mutation handlers ────────────────────────────────────────────────

  const addPost = async (content: string, circleId?: number, linkPreview?: LinkPreview) => {
    if (!data || !currentUser || !fbUser) return;
    let resolvedCircleId: string | number | undefined = circleId;
    if (circleId !== undefined && circleId !== null) {
      const circle = data.circles.find(c => c.id === circleId) as any;
      if (circle?._firestoreId) resolvedCircleId = circle._firestoreId;
    }
    try {
      const newPost = await fbCreatePost(content, currentUser, fbUser.uid, resolvedCircleId as any, linkPreview);
      trackThreadStarted(fbUser.uid, circleId ? 'pod' : 'feed', (newPost as any)._firestoreId ?? String(newPost.id));
      if (resolvedCircleId !== undefined) return;
      setData({ ...data, posts: [newPost, ...data.posts] });
    } catch (err) {
      console.error('[addPost] failed:', err);
    }
  };

  // Author edits / deletes a post from the feed. Both throw on failure so the card can
  // say so; the local list only changes once Firestore has accepted the change.
  const handleEditPost = async (post: Post, content: string) => {
    const fid = (post as any)._firestoreId as string | undefined;
    if (!fid) throw new Error('post has no id');
    await fbUpdatePostContent(fid, content);
    setData(d => d && ({ ...d, posts: d.posts.map(p => p.id === post.id ? { ...p, content, edited: true } : p) }));
  };
  const handleDeletePost = async (post: Post) => {
    const fid = (post as any)._firestoreId as string | undefined;
    if (!fid) throw new Error('post has no id');
    await fbDeletePost(fid);
    setData(d => d && ({ ...d, posts: d.posts.filter(p => p.id !== post.id) }));
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

  // ── Live subscription for the message-thread previews (inbox list) ───────
  // P0 11: replaces the old one-shot, N+1 fetchAllMessagesForUser. This is
  // one bounded, live query for the whole session — new threads and new
  // messages on threads you don't currently have open now appear in the
  // conversation list without a full app reload.
  useEffect(() => {
    if (!fbUser?.uid || !currentUser) return;
    const myNumericId = currentUser.id;

    const unsub = subscribeToMessageThreads(fbUser.uid, myNumericId, (previewMessages) => {
      setData(d => {
        if (!d) return null;
        // Real messages (optimistic sends, or the full history loaded by the
        // active-thread subscription below) never carry _isPreview — keep
        // those untouched and only replace the synthetic preview rows.
        const nonPreview = d.messages.filter(m => !(m as any)._isPreview);
        // The active thread already gets its full, live history from the
        // subscription below — don't let a stale preview row for that same
        // pair sit alongside it.
        const previews = previewMessages.filter(pm => {
          if (activeChatUserId == null) return true;
          const isActivePair =
            (pm.senderId === myNumericId && pm.receiverId === activeChatUserId) ||
            (pm.senderId === activeChatUserId && pm.receiverId === myNumericId);
          return !isActivePair;
        });
        return { ...d, messages: [...nonPreview, ...previews] };
      });
    });

    return () => unsub();
  }, [fbUser?.uid, currentUser?.id, activeChatUserId]);

  // ── Real-time subscription for active message thread ─────────────────────
  useEffect(() => {
    if (!activeChatUserId || !fbUser?.uid || !data) return;

    const otherUser = data.users.find(u => u.id === activeChatUserId) as any;
    const otherUid  = otherUser?._firestoreUid;
    if (!otherUid) return;

    const unsub = subscribeToMessages(fbUser.uid, otherUid, (threadMessages) => {
      setData(d => {
        if (!d) return null;
        // Replace all messages between these two users with the live thread
        const otherMessages = d.messages.filter(m =>
          !(
            (m.senderId === currentUser?.id && m.receiverId === activeChatUserId) ||
            (m.senderId === activeChatUserId && m.receiverId === currentUser?.id)
          )
        );
        return { ...d, messages: [...otherMessages, ...threadMessages] };
      });
    });

    return () => unsub();
  }, [activeChatUserId, fbUser?.uid]);

  const sendMessage = async (receiverId: number, text: string) => {
    if (!data || !currentUser || !fbUser) return;

    const receiver = data.users.find(u => u.id === receiverId) as any;
    const receiverUid = receiver?._firestoreUid;

    // Optimistic update so sender sees message instantly
    const newMsg: Message = {
      id: Date.now(),
      senderId: currentUser.id,
      receiverId,
      text,
      timestamp: 'Just now',
      isRead: false,
    };
    setData(d => d ? { ...d, messages: [...d.messages, newMsg] } : null);

    // Write to Firestore — real-time subscription will replace the optimistic
    // message with the server version (with proper timestamp)
    if (receiverUid) {
      try {
        await fbSendMessage(fbUser.uid, currentUser.id, receiverUid, receiverId, text);
      } catch (err) {
        console.error('sendMessage failed:', err);
        // Revert optimistic update on failure
        setData(d => d ? { ...d, messages: d.messages.filter(m => m.id !== newMsg.id) } : null);
      }
    } else {
      // No account behind this entry, so there is nowhere to deliver it. Don't leave a
      // message on screen that was never sent.
      console.error('sendMessage: recipient has no account id', receiverId);
      setData(d => d ? { ...d, messages: d.messages.filter(m => m.id !== newMsg.id) } : null);
    }
  };

  const startMessage = (userId: number) => { setActiveChatUserId(userId); setCurrentView(View.Messaging); };

  const handleConnectionRequest = async (requestId: number, status: 'accepted' | 'declined') => {
    if (!data || !fbUser) return;

    // Find by numeric id
    const req = (data.connectionRequests as any[]).find(cr => cr.id === requestId)
      ?? (data.connectionRequests as any[]).find(cr => cr._firestoreId === String(requestId));

    if (!req) {
      console.warn('handleConnectionRequest: request not found for id', requestId);
      return;
    }

    // Keep accepted requests in state (My Circles reads them).
    // Remove declined. The Requests tab filters to status==='pending' separately.
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
        if (status === 'accepted') {
          const otherId = req.fromUserId === currentUser?.id ? req.toUserId : req.fromUserId;
          trackConnectionMade(fbUser.uid, String(otherId));
        }
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
    // Fast path — check local state first (covers recruiter's own company)
    const local = data.companies.find(c =>
      (c as any)._firestoreId === companyId ||
      c.id === companyId ||
      String(c.id) === String(companyId)
    );
    if (local) { setSelectedCompany(local); return; }
    // Fetch from Firestore — always use string firestoreId
    try {
      const fetched = await fetchCompanyById(String(companyId));
      if (fetched) {
        // Cache in local state so repeat clicks are instant
        setData(d => d ? { ...d, companies: [...d.companies, fetched] } : null);
        setSelectedCompany(fetched);
      }
    } catch (err) {
      console.error('handleViewCompany failed:', err);
    }
  };

  // Links into the directory: /organizations, /organizations/<id> and the older /companies, /companies/<id>
  // both open the directory (or that profile) once the member is signed in and the app has loaded.
  // ── Addresses and the browser's Back button ───────────────────────────────────────────────────────────────────────
  // Every major destination has an address (lib/routes.ts). A move adds one browser entry that also remembers which view it was,
  // so Back and Forward return to exactly the page you left, including pages that have no address of their own.
  const routerReady = authState === 'authenticated' && !!data;
  const scrollMemory = useRef<Map<string, number>>(new Map());
  const viewKey = (v: string, ind: string | null, ch: string | null, tk: string | null = null) => `${v}|${ind ?? ''}|${ch ?? ''}|${tk ?? ''}`;
  const lastKey = useRef<string>('');
  useEffect(() => {
    if (!routerReady) return;
    const loc = { view: String(currentView), industry: activeArenaIndustry ?? undefined, challengeId: activeChallengeId ?? undefined, talkId: activeTalkId ?? undefined };
    const st: any = window.history.state;
    const same = st?.bwView === loc.view && (st?.industry ?? undefined) === loc.industry && (st?.challengeId ?? undefined) === loc.challengeId && (st?.talkId ?? undefined) === loc.talkId;
    const path = pathFor(loc);
    const state = { bwView: loc.view, industry: loc.industry, challengeId: loc.challengeId, talkId: loc.talkId };
    if (!same) {
      const first = st?.bwView === undefined;                       // the entry we arrived on
      const keep = window.location.pathname === path ? window.location.search : '';   // a page's own query (filters, tabs) is kept
      if (first) window.history.replaceState(state, '', path + keep); else window.history.pushState(state, '', path);
    }
    const key = viewKey(loc.view, activeArenaIndustry, activeChallengeId, activeTalkId);
    if (key !== lastKey.current) {
      lastKey.current = key;
      const y = scrollMemory.current.get(key) ?? 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [routerReady, currentView, activeArenaIndustry, activeChallengeId, activeTalkId]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st: any = e.state?.bwView ? e.state : parsePath(window.location.pathname) && { bwView: parsePath(window.location.pathname)!.view, industry: parsePath(window.location.pathname)!.industry, challengeId: parsePath(window.location.pathname)!.challengeId, talkId: parsePath(window.location.pathname)!.talkId };
      scrollMemory.current.set(lastKey.current, window.scrollY);
      setPublicProfileUserId(null);
      if (st?.bwView) { setActiveArenaIndustry(st.industry ?? null); setActiveChallengeId(st.challengeId ?? null); setActiveTalkId(st.talkId ?? null); setCurrentView(st.bwView as View); sessionStorage.setItem('beWatuView', st.bwView); }
      else { setActiveArenaIndustry(null); setActiveChallengeId(null); setActiveTalkId(null); setCurrentView(View.Feed); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Load the challenge the address (or a notification) names.
  useEffect(() => {
    if (!activeChallengeId || !routerReady) return;
    if (selectedChallenge && (selectedChallenge._firestoreId ?? selectedChallenge.id) === activeChallengeId) return;
    let live = true;
    import('./lib/firestoreService').then(({ fetchArenaChallengeById }) => fetchArenaChallengeById(activeChallengeId))
      .then(c => { if (!live) return; if (c) setSelectedChallenge(c); else { setActiveChallengeId(null); setCurrentView(View.Arenas); } })
      .catch(() => { if (live) { setActiveChallengeId(null); setCurrentView(View.Arenas); } });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChallengeId, routerReady]);
  const openChallenge = (id: string) => { scrollMemory.current.set(lastKey.current, window.scrollY); setActiveChallengeId(id); setCurrentView(ARENA_CHALLENGE_VIEW as any); sessionStorage.setItem('beWatuView', ARENA_CHALLENGE_VIEW); };
  // Bridge Talks: the library, and one Talk. A notification ("View Talk") asks for a Talk by id.
  const openTalks = () => { scrollMemory.current.set(lastKey.current, window.scrollY); setActiveTalkId(null); setCurrentView(BRIDGE_TALKS_VIEW as any); sessionStorage.setItem('beWatuView', BRIDGE_TALKS_VIEW); };
  const openTalk = (id: string) => { scrollMemory.current.set(lastKey.current, window.scrollY); setActiveTalkId(id); setCurrentView(BRIDGE_TALK_VIEW as any); sessionStorage.setItem('beWatuView', BRIDGE_TALK_VIEW); };
  useEffect(() => {
    const open = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)) openTalk(id); };
    const share = () => { handleSetView(View.Feed); requestIntent('focus-composer'); };
    window.addEventListener('bewatu:open-talk', open); window.addEventListener('bewatu:compose-share', share);
    return () => { window.removeEventListener('bewatu:open-talk', open); window.removeEventListener('bewatu:compose-share', share); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Investor membership (apply, status, activate, billing). Pricing and notifications send people here.
  const openInvestor = () => { scrollMemory.current.set(lastKey.current, window.scrollY); setActiveTalkId(null); setCurrentView(INVESTOR_VIEW as any); sessionStorage.setItem('beWatuView', INVESTOR_VIEW); };
  useEffect(() => {
    const open = () => openInvestor();
    window.addEventListener('bewatu:open-investor', open);
    return () => window.removeEventListener('bewatu:open-investor', open);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openArenaIndustry = (slug: string) => { scrollMemory.current.set(lastKey.current, window.scrollY); setActiveChallengeId(null); setActiveArenaIndustry(slug); sessionStorage.setItem('beWatuArenaIndustry', slug); setCurrentView(ARENA_INDUSTRY_VIEW as any); sessionStorage.setItem('beWatuView', ARENA_INDUSTRY_VIEW); };
  // A notification about a challenge ("View challenge") asks for it by id.
  useEffect(() => {
    const open = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (typeof id === 'string' && id) openChallenge(id); };
    window.addEventListener('bewatu:open-challenge', open);
    return () => window.removeEventListener('bewatu:open-challenge', open);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Who may post an Arena challenge: a recruiter whose organization is verified for at least one Arena industry.
  const myCompany: any = (data?.companies ?? []).find(c => !!fbUser && ((c as any).adminUid === fbUser.uid || ((c as any).verifiedRecruiters ?? []).includes(fbUser.uid))) ?? null;
  const canPostArena = canPostChallenge(currentUser as any, myCompany);
  // From "Sponsor this Arena": take the member to the existing screens for getting an organization. A claim is made on the
  // organization's own profile in the directory; creating one is done in the recruiter console (a recruiter account).
  const handleSponsorSetup = (kind: 'create' | 'claim') => {
    if (kind === 'claim') handleSetView(View.Companies);
    else if (currentUser?.isRecruiter) setActiveProfile('recruiter');
    else handleSetView(View.Jobs);
  };
  // Each Create action takes you to the page that does it and opens the right control there.
  const handleCreate = (id: CreateActionId) => {
    // Post an Update and Share Wisdom open the same editor Home's composer opens (components/home/HomeComposer.tsx).
    if (id === 'post' || id === 'wisdom') { handleSetView(View.Feed); requestIntent('focus-composer', id === 'wisdom' ? { composeMode: 'wisdom' } : undefined); }
    else if (id === 'spark') requestIntent('create-spark');
    else if (id === 'reel') { handleSetView(View.Prove); requestIntent('upload-reel'); }
    else if (id === 'pod') { handleSetView(View.Circles); requestIntent('create-pod'); }
    else if (id === 'project') { handleSetView(View.Circles); requestIntent('create-pod', { podType: 'innovation' }); }
    else if (id === 'challenge') setPostChallengeOpen(true);
    else if (id === 'invite') requestIntent('invite', { invite: { purpose: 'connect' } });
    else if (id === 'talk') requestIntent('share-talk');
  };

  // The steps an invitation offers, done with the same handlers as everywhere else (the server only ever records them).
  const inviteSteps = {
    connect: async (inviter: { uid: string; numericId: number | null }) => {
      if (!currentUser || !fbUser || inviter.numericId == null) throw new Error('That didn\'t go through. Please try again.');
      const req = await fbSendConnectionRequest(fbUser.uid, currentUser.id, inviter.uid, inviter.numericId);
      setData(d => d ? { ...d, connectionRequests: d.connectionRequests.some(r => r.id === req.id) ? d.connectionRequests : [...d.connectionRequests, req] } : null);
    },
    requestJoin: async (podId: string) => {
      const circle = data?.circles.find(c => (c as any)._firestoreId === podId);
      if (circle) { await handleApplyToCircle(circle.id); return; }
      if (!currentUser || !fbUser) throw new Error('That didn\'t go through. Please try again.');
      const { requestToJoinCircle } = await import('./lib/firestoreService') as any;
      await requestToJoinCircle(podId, currentUser.id, fbUser.uid);
    },
    open: (r: { destination: { type: string; id: string | null }; inviter: { numericId: number | null } | null }) => {
      const d = r.destination;
      if (d.type === 'profile' && r.inviter?.numericId != null) handleViewProfile(r.inviter.numericId);
      else if (d.type === 'pod' && d.id) { const c = data?.circles.find(x => (x as any)._firestoreId === d.id); if (c) handleSelectCircle(c.id); else handleSetView(View.Circles); }
      else if (d.type === 'pods') handleSetView(View.Circles);
      else if (d.type === 'community') handleSetView(View.Connections);
      else if (d.type === 'challenge' && d.id) window.dispatchEvent(new CustomEvent('bewatu:open-challenge', { detail: { id: d.id } }));
      else if (d.type === 'arenas') handleSetView(View.Arenas);
    },
  };
  // The Pods this member is in, for the invitation sheet's destination list.
  const invitePods = (data?.circles ?? []).filter(c => currentUser && c.members.includes(currentUser.id) && (c as any)._firestoreId)
    .map(c => ({ id: (c as any)._firestoreId as string, name: c.name, podType: c.podType }));

  const orgLinkHandled = useRef(false);
  useEffect(() => {
    if (orgLinkHandled.current || !data || !currentUser) return;
    orgLinkHandled.current = true;
    // The directory itself is an ordinary route now (lib/routes.ts); only a link to ONE organization is handled here.
    const m = window.location.pathname.match(/^\/(?:organizations|companies)\/([^/]+)\/?$/);
    if (!m) return;
    window.history.replaceState(null, '', '/organizations');
    handleSetView(View.Companies);
    try { void handleViewCompany(decodeURIComponent(m[1])); } catch { /* malformed link: stay on the directory */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentUser]);

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

    // Enrich evidence with AI Workflows and Learning Logs
    let workflowContext = '';
    let logContext = '';
    try {
      const { getDocs, collection, query, where, orderBy, limit } = await import('firebase/firestore');
      const { db: fdb } = await import('./lib/firebase');
      const wfSnap = await getDocs(query(collection(fdb, 'aiWorkflows'), where('authorUid', '==', fbUser.uid), limit(5)));
      if (!wfSnap.empty) {
        workflowContext = wfSnap.docs.map(d => {
          const w: any = d.data();
          const steps = (w.steps ?? []).map((s: any) => `  [${s.type}] ${s.content}`).join('\n');
          return `Workflow: ${w.title}\nTask: ${w.task}\nTools: ${(w.tools ?? []).join(', ')}\nSteps:\n${steps}\nOutcome: ${w.outcome}`;
        }).join('\n\n');
      }
      const logSnap = await getDocs(query(collection(fdb, 'learningLogs'), where('authorUid', '==', fbUser.uid), orderBy('createdAt', 'desc'), limit(10)));
      if (!logSnap.empty) {
        logContext = logSnap.docs.map(d => {
          const l: any = d.data();
          return `Built: ${l.built}\nBroke: ${l.broke}\nNext: ${l.next}`;
        }).join('\n---\n');
      }
    } catch { /* non-blocking */ }

    const prompt = `Analyse this professional's background and return a JSON array of verified skills.
Each skill: { "name": string, "level": "beginner"|"intermediate"|"advanced"|"expert", "endorsements": 0, "source": "platform"|"resume"|"endorsement", "evidence": "brief one-sentence rationale citing specific evidence" }
Return ONLY valid JSON — no markdown, no explanation.
IMPORTANT: Only include skills supported by concrete evidence. "Verified" means the user has shown evidence — not a guarantee of proficiency.

Background:
${resume || 'No resume provided'}

Digital presence:
${digitalFootprint || 'Not provided'}

References/testimonials:
${references || 'Not provided'}

${workflowContext ? `AI Workflow Showcase:\n${workflowContext}` : ''}
${logContext ? `Learning Log:\n${logContext}` : ''}`;

    let verifiedSkills: any[] = [];
    try {
      // api/ai requires a Firebase ID token (P1 fix — it was an
      // unauthenticated proxy to a paid API before).
      const idToken = await fbUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
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
      verifiedSkills = (currentUser.skills ?? []).map((s: any) => ({
        name:        typeof s === 'string' ? s : s.name,
        level:       'intermediate',
        endorsements: 0,
        source:      'platform',
        evidence:    'Derived from platform activity',
      }));
    }

    const updatedUser = { ...currentUser, verifiedSkills };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    refreshUser(updatedUser);
    await updateUserInFirestore(fbUser.uid, { verifiedSkills });
    setIsSkillsGraphModalOpen(false);
  };

  // Thin glue for ImportLinkedInModal / ImportResumeModal — the actual
  // ZIP/PDF/DOCX-to-text and AI-call logic lives in lib/profileImport.ts
  // (extractProfileFromText), same split as every other Firebase-auth-
  // needing call in this file. sourceLabel only steers the AI prompt
  // wording to match what is actually being read.
  const handleExtractLinkedInProfile = async (rawText: string) => {
    if (!fbUser) throw new Error('Not signed in');
    const { extractProfileFromText } = await import('./lib/profileImport');
    const idToken = await fbUser.getIdToken();
    return extractProfileFromText(rawText, idToken, 'LinkedIn data');
  };

  const handleExtractResumeProfile = async (rawText: string) => {
    if (!fbUser) throw new Error('Not signed in');
    const { extractProfileFromText } = await import('./lib/profileImport');
    const idToken = await fbUser.getIdToken();
    return extractProfileFromText(rawText, idToken, 'resume');
  };

  // Saves a batch of new skills to user.skills (not userAddedSkills — which was never rendered).
  // Immediate local state update ensures ProfilePage/Sidebar re-render without a page refresh.
  const handleSaveUserSkills = async (newSkillNames: string[]) => {
    if (!data || !currentUser || !fbUser || newSkillNames.length === 0) return;
    const existing: any[] = currentUser.skills ?? [];
    const existingNames = new Set(existing.map((s: any) => (typeof s === 'string' ? s : s.name).toLowerCase()));
    const toAdd = newSkillNames
      .map(n => n.trim()).filter(n => n && !existingNames.has(n.toLowerCase()))
      .map(n => ({ name: n, endorsements: 0 }));
    if (toAdd.length === 0) return;
    const updated = [...existing, ...toAdd];
    const updatedUser = { ...currentUser, skills: updated };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    refreshUser(updatedUser);
    await updateUserInFirestore(fbUser.uid, { skills: updated });
  };

  const handleRemoveUserSkill = async (skillName: string) => {
    if (!data || !currentUser || !fbUser) return;
    const updated = (currentUser.skills ?? []).filter((s: any) =>
      (typeof s === 'string' ? s : s.name).toLowerCase() !== skillName.toLowerCase()
    );
    const updatedUser = { ...currentUser, skills: updated };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    refreshUser(updatedUser);
    await updateUserInFirestore(fbUser.uid, { skills: updated });
  };

  /**
   * Generic profile save — call this from any component that edits the
   * current user's profile (bio, headline, name, experiences, etc.).
   *
   * It writes to Firestore AND immediately syncs both currentUser (via
   * refreshUser) and data.users so the profile re-renders with fresh data
   * without needing a page reload. Errors are surfaced as thrown exceptions
   * so callers can catch and display them — no silent swallowing.
   */
  const handleSaveCurrentUserProfile = async (updates: Record<string, any>) => {
    if (!data || !currentUser || !fbUser) return;
    // Optimistic local update — happens before the network call so the UI
    // feels instant. If the write fails, the caller's catch should revert.
    const userTypeUpdates: Partial<typeof currentUser> = {};
    for (const [key, value] of Object.entries(updates)) {
      // Map Firestore field names back to User type field names for local state
      if (key === 'displayName') (userTypeUpdates as any).name = value;
      else if (key === 'photoURL') (userTypeUpdates as any).avatarUrl = value;
      else (userTypeUpdates as any)[key] = value;
    }
    const updatedUser = { ...currentUser, ...userTypeUpdates };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    refreshUser(updatedUser);
    // Network write — updateUserInFirestore now passes all fields through
    await updateUserInFirestore(fbUser.uid, updates);
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
    if (firestoreJob?._firestoreId) {
      // Bug fix (Recruiter Talent Pipeline): recruiterUid must be written
      // onto the application at creation time, or the recruiter's own
      // pipeline query never finds it — see firestoreService.ts.
      await applyToJobWithProfile(firestoreJob._firestoreId, job.id, fbUser.uid, firestoreJob.recruiterUid);
    }
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
    }, fbUser.uid, currentUser.id);
    setData(d => d ? { ...d, circles: [newCircle, ...d.circles] } : null);
    trackPodCreated(fbUser.uid, (newCircle as any)._firestoreId ?? String(newCircle.id), (extra as any)?.industry);
  };

  // P0 11: these two used to be setData(...)-only — no Firestore write, so
  // joining an open pod or an admin removing a member looked like it worked
  // but silently reverted on reload. Now optimistic-update-then-persist,
  // same pattern as handleLeaveCircle/handleApplyToCircle below.
  const handleAddMemberToCircle = async (circleId: number, userId: number) => {
    if (!data) return;
    const circle = data.circles.find(c => c.id === circleId) as any;
    setData({ ...data, circles: data.circles.map(c => c.id === circleId && !c.members.includes(userId) ? { ...c, members: [...c.members, userId] } : c) });
    if (circle?._firestoreId) {
      try {
        const { joinOpenCircle } = await import('./lib/firestoreService');
        await joinOpenCircle(circle._firestoreId, userId);
      } catch (err) {
        console.error('joinOpenCircle failed:', err);
        setData(d => d ? { ...d, circles: d.circles.map(c => c.id === circleId ? { ...c, members: c.members.filter(id => id !== userId) } : c) } : null);
      }
    }
  };

  // P0 11: accepting a pod invite from the notification bell (Header's
  // NotificationsPanel) writes the membership straight to Firestore, but
  // this session's own `data.circles` (loaded once at boot) has no way to
  // find out — without this, the pod you just joined doesn't appear in your
  // own pods list until a full reload. Mirrors the existing circle_approved
  // patch below.
  const handleCircleInviteAccepted = (circleFirestoreId: string) => {
    if (!currentUser) return;
    setData(d => {
      if (!d) return null;
      return {
        ...d,
        circles: d.circles.map(c => {
          if ((c as any)._firestoreId !== circleFirestoreId) return c;
          if (c.members.includes(currentUser.id)) return c;
          return { ...c, members: [...c.members, currentUser.id] };
        }),
      };
    });
  };

  const handleRemoveMemberFromCircle = async (circleId: number, userId: number) => {
    if (!data) return;
    const circle = data.circles.find(c => c.id === circleId) as any;
    setData({ ...data, circles: data.circles.map(c => c.id === circleId && c.adminId !== userId ? { ...c, members: c.members.filter(id => id !== userId) } : c) });
    if (circle?._firestoreId) {
      try {
        const { removeMemberFromCircle } = await import('./lib/firestoreService');
        await removeMemberFromCircle(circle._firestoreId, userId);
      } catch (err) {
        console.error('removeMemberFromCircle failed:', err);
        setData(d => d ? { ...d, circles: d.circles.map(c => c.id === circleId ? { ...c, members: [...c.members, userId] } : c) } : null);
      }
    }
  };

  const handleInviteMemberToCircle = async (circleId: number, userId: number) => {
    if (!data || !currentUser) return;
    const circle = data.circles.find(c => c.id === circleId) as any;
    if (!circle?._firestoreId) return;
    // Add to pendingInvites array on circle
    setData({ ...data, circles: data.circles.map(c => c.id === circleId
      ? { ...c, pendingInvites: [...((c as any).pendingInvites ?? []), userId] }
      : c) });
    try {
      const { inviteMemberToCircle } = await import('./lib/firestoreService');
      await inviteMemberToCircle(circle._firestoreId, userId);
      // Send notification to invited user
      const invitedUser = data.users.find(u => u.id === userId) as any;
      // _firestoreUid may be missing — look it up from Firestore if needed.
      // Bug fix: `invitedUid` used to be read one line above this `let`
      // declared it (a block-scope temporal-dead-zone violation) — every
      // invite threw a ReferenceError, silently swallowed by the catch
      // below, so this Firestore write never actually ran.
      let invitedUid = invitedUser?._firestoreUid;
      if (!invitedUid) {
        try {
          const { lookupFirebaseUidByNumericId } = await import('./lib/firestoreService');
          invitedUid = await lookupFirebaseUidByNumericId(userId) ?? undefined;
        } catch { /* ignore */ }
      }
      if (invitedUid) {
        const { createPodNotification } = await import('./lib/firestoreService');
        await createPodNotification(invitedUid, {
          type: 'circle_invite',
          message: `${currentUser.name} invited you to join "${circle.name}"`,
          relatedId: circleId,
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorAvatar: currentUser.avatarUrl,
          circleFirestoreId: circle._firestoreId,
        });
      }
    } catch (err) { console.error('inviteMember failed:', err); }
  };

  const handleApproveJoinRequest = async (circleId: number, userId: number) => {
    if (!data || !currentUser) return;
    const circle = data.circles.find(c => c.id === circleId) as any;
    if (!circle?._firestoreId) return;
    // Optimistic state update
    setData({ ...data, circles: data.circles.map(c => c.id === circleId ? {
      ...c,
      members:        [...c.members, userId],
      pendingMembers: ((c as any).pendingMembers ?? []).filter((id: any) => id !== userId),
    } : c) });
    try {
      const { approveJoinRequest, createPodNotification } = await import('./lib/firestoreService') as any;
      // Look up the requester's Firebase UID from their user doc directly
      // — don't rely on data.users which may not contain them
      const { getDoc, doc } = await import('firebase/firestore');
      const { db } = await import('./lib/firebase');
      const { getDocs, query, collection, where, limit } = await import('firebase/firestore');
      const q = query(collection(db, 'users'), where('numericId', '==', userId), limit(1));
      const snap = await getDocs(q);
      const requesterUid  = snap.empty ? null : snap.docs[0].id;
      await approveJoinRequest(circle._firestoreId, userId, requesterUid);
      if (requesterUid) {
        await createPodNotification(requesterUid, {
          type:              'circle_approved',
          message:           `Your request to join "${circle.name}" was approved`,
          relatedId:         circleId,
          circleFirestoreId: circle._firestoreId,
          actorId:           currentUser.id,
          actorName:         currentUser.name,
          actorAvatar:       currentUser.avatarUrl,
        });
      }
    } catch (err) { console.error('approveJoinRequest failed:', err); }
  };

  const handleDeclineJoinRequest = async (circleId: number, userId: number) => {
    if (!data || !currentUser) return;
    const circle = data.circles.find(c => c.id === circleId) as any;
    if (!circle?._firestoreId) return;
    setData({ ...data, circles: data.circles.map(c => c.id === circleId ? {
      ...c,
      pendingMembers: ((c as any).pendingMembers ?? []).filter((id: any) => id !== userId),
    } : c) });
    try {
      const { declineJoinRequest, createPodNotification } = await import('./lib/firestoreService') as any;
      const { getDocs, query, collection, where, limit } = await import('firebase/firestore');
      const { db } = await import('./lib/firebase');
      const q = query(collection(db, 'users'), where('numericId', '==', userId), limit(1));
      const snap = await getDocs(q);
      const requesterUid = snap.empty ? null : snap.docs[0].id;
      await declineJoinRequest(circle._firestoreId, userId, requesterUid);
      if (requesterUid) {
        await createPodNotification(requesterUid, {
          type:    'circle_denied',
          message: `Your request to join "${circle.name}" was not approved`,
          relatedId: circleId,
          actorId:   currentUser.id,
          actorName: currentUser.name,
          actorAvatar: currentUser.avatarUrl,
        });
      }
    } catch (err) { console.error('declineJoinRequest failed:', err); }
  };

  const handleApplyToCircle = async (circleId: number) => {
    if (!data || !currentUser || !fbUser) return;
    const circle = data.circles.find(c => c.id === circleId) as any;
    // Optimistic update
    setData(d => d ? {
      ...d,
      circles: d.circles.map(c => c.id === circleId
        ? { ...c, pendingMembers: [...((c as any).pendingMembers ?? []), currentUser.id] }
        : c)
    } : null);
    if (circle?._firestoreId) {
      try {
        const { requestToJoinCircle, createPodNotification } = await import('./lib/firestoreService') as any;
        await requestToJoinCircle(circle._firestoreId, currentUser.id, fbUser?.uid);
        trackPodJoined(fbUser.uid, circle._firestoreId, (circle as any).industry);
        const adminUid = (circle as any).adminUid ?? (circle as any).creatorUid;
        const adminFirestoreUid = adminUid ?? data.users.find(u =>
          (u as any)._firestoreUid === adminUid || u.id === circle.adminId
        )?._firestoreUid;
        if (adminFirestoreUid) {
          await createPodNotification(adminFirestoreUid, {
            type:              'circle_join_request',
            message:           `${currentUser.name} requested to join "${circle.name}"`,
            relatedId:         circleId,
            actorId:           currentUser.id,
            actorUid:          fbUser?.uid,
            actorName:         currentUser.name,
            actorAvatar:       currentUser.avatarUrl,
            circleFirestoreId: circle._firestoreId,
          });
        }
      } catch (err) { console.error('requestToJoin failed:', err); }
    }
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
        await leaveCircle(circle._firestoreId, currentUser.id, fbUser?.uid);
      } catch (err) {
        console.error('leaveCircle failed:', err);
        // Revert on failure
        setData(d => d ? {
          ...d,
          // Bug fix: this pushed fbUser?.uid (a Firebase UID string) back
          // into the numeric members array on revert — wrong value entirely
          // (and the wrong type, which is what tsc caught). The member
          // being restored is always the numeric currentUser.id.
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
    // Factory is a separate domain — navigate there directly, don't set view
    if (view === View.Factory) {
      // Defense in depth: the Header "Go to Factory" button and the pricing
      // page's "Unlock Factory" button are already disabled while gated,
      // but this is the single real chokepoint everything funnels through.
      if (currentUser && isEngagementGated(currentUser)) return;
      goToFactory(fbUser ?? null);
      return;
    }
    scrollMemory.current.set(lastKey.current, window.scrollY);
    if (view !== (ARENA_CHALLENGE_VIEW as any)) setActiveChallengeId(null);
    if (view !== (BRIDGE_TALK_VIEW as any)) setActiveTalkId(null);
    setCurrentView(view);
    sessionStorage.setItem('beWatuView', view);
    if (view === View.Profile && currentUser) setProfileUserId(currentUser.id);
    else if (view !== View.Profile) setProfileUserId(null);
    if (view !== View.Circles) setActiveCircleId(null);
    setIsMobileNavOpen(false);
  };

  const handleSelectCircle = (circleId: number) => {
    setCurrentView(View.Circles);
    // Record current time as last visited BEFORE switching — so new posts since
    // this moment show up as "new" on the next visit
    setLastCircleVisited(prev => ({ ...prev, [circleId]: new Date() }));
    setActiveCircleId(circleId);
  };

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
      <LoadingIcon className="w-12 h-12 animate-spin" style={{ color: 'var(--bw-green)' }} />
    </div>
  );

  if (authLoading) return <FullPageLoader />;

  const renderContent = () => {
    if (loading) return (
      <div className="flex flex-col items-center justify-center h-screen">
        <LoadingIcon className="w-16 h-16 animate-spin" style={{ color: 'var(--bw-green)' }} />
        <p className="mt-4 text-lg text-stone-600 font-medium">Loading BeWatu...</p>
      </div>
    );

    if (error || !data || !currentUser) return (
      <div className="flex items-center justify-center h-screen bg-red-50 text-red-700">
        <div className="text-center p-8 border border-red-200 rounded-2xl bg-white shadow-lg">
          <h2 className="text-2xl font-bold mb-2">An Error Occurred</h2>
          <p>{error || 'Could not load application data.'}</p>
          <button onClick={() => loadAppData(currentUser!)} className="mt-4 px-4 py-2 rounded-xl text-white font-semibold" style={{ backgroundColor: 'var(--bw-green)' }}>Retry</button>
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
      return <RecruiterConsole onLogout={handleLogout} isTrialActive={isTrialActive} setTrialActive={setIsTrialActive} promptPaymentSetup={promptRecruiterPaymentSetup} onPaymentSetupPromptHandled={() => setPromptRecruiterPaymentSetup(false)} onSwitchProfile={handleSwitchProfile} talentPipeline={talentPipeline} allJobs={data.jobs} allCompanies={data.companies} currentUser={currentUser} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onToggleJobStatus={handleToggleJobStatus} onNavigateToConnect={handleNavigateToConnect} onNavigateToTerms={() => setShowTermsPage(true)} onNavigateToPrivacy={() => setShowPrivacyPage(true)} onNavigateToCommunity={() => setShowCommunityPage(true)} />;
    }

    let content: React.ReactNode;
    switch (currentView) {
      case View.Feed:
        content = (
          <div className="space-y-4">
            <FactoryUnlockBanner onUnlock={() => setShowUpgradeModal('factory')} />
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
              currentUserUid={fbUser?.uid}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              onReportContent={(id, preview) => openReport({ content: { type: 'post', id, preview } }, 'content')}
              onViewCompany={handleViewCompany}
              onLoadMorePosts={loadMorePosts}
              onCreate={handleCreate}
            />
          </div>
        );
        break;

      case View.People:
        content = (
          <People
            // peopleSearchResults is null with no active search (fall back
            // to the loaded directory, same as before) or a real Algolia
            // search result set once the user has typed something — see
            // the People-directory-search effect above.
            users={(peopleSearch.trim() ? (peopleSearchResults ?? []) : data.users)
              .filter(u => u.id !== currentUser.id)}
            isSearching={isPeopleSearching}
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
          <div className="space-y-0">
          <CommunityTabs current="connections" onNavigate={handleSetView} />
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
          </div>
        );
        break;

      case View.Jobs:
        content = (
          <div className="space-y-4">
            {/* recruiterStatus === 'pending_ops' check added alongside the
                admin review queue that now actually processes these
                (AdminPanel's Recruiter applications tab + syncRecruiterApplicationDecision
                in functions/src/index.ts). Previously this only checked
                isRecruiter, which never became true while an application sat
                unprocessed, so an applicant saw "Post a role" and could keep
                opening the whole 4-gate modal again while already pending. */}
            {!currentUser.isRecruiter && currentUser.recruiterStatus !== 'pending_ops' && !isEngagementGated(currentUser) && (
              <Suspense fallback={<div />}>
                <RecruiterUpgradeBanner
                  currentUser={currentUser}
                  fbUserUid={fbUser!.uid}
                  onSuccess={() => {
                    // Reload user data to pick up recruiterStatus: 'pending_ops'
                    // immediately, and isRecruiter: true once an admin approves.
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
          ? <ProfilePage user={userToShow} isCurrentUser={userToShow.id === currentUser.id} connectionRequests={data.connectionRequests} circles={data.circles} onGenerateSkills={() => setIsSkillsGraphModalOpen(true)} onImportLinkedIn={() => setIsImportLinkedInOpen(true)} onImportResume={() => setIsImportResumeOpen(true)} onRecordVideo={() => setIsVideoRecorderModalOpen(true)} onUploadVideo={handleUploadVideo} onPlayVideo={url => setPlayingVideoUrl(url)} onNavigate={handleSetView} onSelectCircle={handleSelectCircle} onOpenSecurity={() => setShowSecurityPage(true)} onReportUser={(fid, name) => openReport({ user: { firestoreId: fid, name } }, 'user')} onSaveProfile={handleSaveCurrentUserProfile} onAddSkill={(name) => handleSaveUserSkills([name])} onRemoveSkill={handleRemoveUserSkill} onViewCompany={handleViewCompany} />
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
            onOpenChallenge={openChallenge}
            onExploreArenas={() => handleSetView(View.Arenas)}
          />
        );
        break;
      }

      case View.Arenas as any:
        content = (
          <Suspense fallback={<div />}>
            <ArenasHome
              currentUser={currentUser}
              canPost={canPostArena}
              onSelectIndustry={openArenaIndustry}
              onOpenChallenge={openChallenge}
              onStartPod={(c) => { requestIntent('create-pod', { podType: 'challenge', challengeId: c.id, challengeTitle: c.title }); handleSetView(View.Circles); }}
              onPostChallenge={() => setPostChallengeOpen(true)}
            />
          </Suspense>
        );
        break;

      case 'ARENA_INDUSTRY' as any:
        content = activeArenaIndustry ? (
          <Suspense fallback={<div />}>
            <ArenaIndustryView
              industry={activeArenaIndustry as any}
              onBack={() => handleSetView(View.Arenas)}
              onSelectChallenge={(id: string) => openChallenge(id)}
              onPostChallenge={canPostArena ? () => setPostChallengeOpen(true) : undefined}
              onViewCompany={handleViewCompany}
              currentUserCompany={selectedCompany}
            />
          </Suspense>
        ) : null;
        break;

      case 'ARENA_CHALLENGE' as any:
        content = selectedChallenge && currentUser && fbUser && (selectedChallenge._firestoreId ?? selectedChallenge.id) === activeChallengeId ? (
          <Suspense fallback={<div />}>
            <ArenaChallengeDetail
              challenge={selectedChallenge}
              currentUser={currentUser}
              fbUser={fbUser}
              allUsers={data?.users ?? []}
              onBack={() => (activeArenaIndustry ? (setActiveChallengeId(null), setCurrentView('ARENA_INDUSTRY' as any)) : handleSetView(View.Arenas))}
              onCreatePod={async (name, description) => {
                const { createCircle } = await import('./lib/firestoreService');
                const pod = await createCircle(
                  { name, description, adminId: currentUser.id, members: [currentUser.id], podType: 'challenge' as any } as any,
                  fbUser.uid,
                  currentUser.id
                );
                return pod;
              }}
            />
          </Suspense>
        ) : <div className="mx-auto max-w-3xl space-y-3 px-1 py-6" aria-busy="true"><div className="h-8 w-2/3 animate-pulse rounded bg-stone-100" /><div className="h-40 animate-pulse rounded-2xl bg-stone-100" /></div>;
        break;

      case View.Circles:
      case (BRIDGE_TALKS_VIEW as any):
      case (BRIDGE_TALK_VIEW as any):
      case (View.Bridge as any): {
        const inBridge = currentView === (View.Bridge as any) || currentView === (BRIDGE_TALKS_VIEW as any) || currentView === (BRIDGE_TALK_VIEW as any);
        const communityTab: 'pods' | 'bridge' = inBridge ? 'bridge' : 'pods';
        // ── Community: tabbed Pods + Bridge ───────────────────────────
        if (activeCircleId) {
          // When inside a pod, show CircleDetail directly (no tab strip)
          const circle = data.circles.find(c => c.id === activeCircleId);
          content = circle
            ? <CircleDetail circle={circle} allPosts={data.posts} allArticles={data.articles} allUsers={data.users} currentUser={currentUser} addPost={addPost} findAuthor={id => data.users.find(u => u.id === id)} onAppreciatePost={handleAppreciatePost} onInviteMember={handleInviteMemberToCircle} onAddMember={handleAddMemberToCircle} onRemoveMember={handleRemoveMemberFromCircle} onApproveJoinRequest={handleApproveJoinRequest} onDeclineJoinRequest={handleDeclineJoinRequest} onLeaveCircle={handleLeaveCircle} onViewProfile={handleViewProfile} onBack={() => setActiveCircleId(null)} onApplyToCircle={handleApplyToCircle} lastVisited={lastCircleVisited[activeCircleId] ?? undefined} />
            : <div>Circle not found</div>;
        } else {
          const GREEN = 'var(--bw-green)';
          content = (
            <div className="space-y-0">
              {currentView !== (BRIDGE_TALK_VIEW as any) && <CommunityTabs current={communityTab} onNavigate={handleSetView} pendingConnections={data.connectionRequests.filter(r => r.toUserId === currentUser.id && r.status === 'pending').length} />}

              {/* ── Tab content ────────────────────────────────────────── */}
              {communityTab === 'pods' ? (
                <Circles
                  circles={data.circles}
                  onSelectCircle={handleSelectCircle}
                  onCreateCircle={handleCreateCircle}
                  onJoinCircle={async (circleId) => {
                    if (!fbUser || !currentUser) return;
                    await handleAddMemberToCircle(circleId, currentUser.id);
                  }}
                  onApplyToCircle={handleApplyToCircle}
                  onLeaveCircle={handleLeaveCircle}
                  currentUserId={currentUser.id}
                  currentUserFirestoreUid={fbUser?.uid}
                />
              ) : (
                <Suspense fallback={<div />}>
                  <GenerationalFeed
                    currentUser={currentUser}
                    fbUserUid={fbUser.uid}
                    onViewProfile={setPublicProfileUserId}
                    onSelectCircle={(circleId) => {
                      handleSelectCircle(circleId);
                    }}
                    talksOpen={currentView === (BRIDGE_TALKS_VIEW as any)}
                    talkId={currentView === (BRIDGE_TALK_VIEW as any) ? activeTalkId : null}
                    onOpenTalks={openTalks}
                    onOpenTalk={openTalk}
                    onLeaveTalks={() => handleSetView(View.Bridge)}
                    isAdmin={isPlatformAdmin}
                    followedIds={(data.followRequests ?? []).filter(r => r.fromUserId === currentUser.id && r.status === 'accepted').map(r => r.toUserId)}
                    followState={(n, _uid) => {
                      if (n == null) return 'none';
                      const r = (data.followRequests ?? []).find(x => x.fromUserId === currentUser.id && x.toUserId === n && x.status !== 'declined');
                      return r ? (r.status === 'accepted' ? 'following' : 'pending') : followedUserIds.has(n) ? 'pending' : 'none';
                    }}
                    onFollow={handleFollowUser}
                    onReport={target => openReport(target, 'content')}
                  />
                </Suspense>
              )}
            </div>
          );
        }
        break;
      }

      case View.Discover:
        content = (
          <Suspense fallback={<div />}>
            <DiscoverPage
              onNavigate={handleSetView}
              onSearchPeople={(q) => { setPeopleSearch(q); handleSetView(View.People); }}
              factoryGated={!!(currentUser && isEngagementGated(currentUser))}
            />
          </Suspense>
        );
        break;

      case (INVESTOR_VIEW as any):
        content = fbUser ? (
          <InvestorPage uid={fbUser.uid} onBack={() => handleSetView(View.Pricing)} onOpenInvestorTools={() => goToFactory(fbUser ?? null)} />
        ) : <div />;
        break;

      case View.Pricing:
        content = (
          <PricingPage
            // Investor is never bought from here: it starts with an application, and payment comes only after approval.
            onUpgrade={(tier) => (tier === 'investor' ? openInvestor() : setShowUpgradeModal(tier as SubscriptionTier))}
            onApplyInvestor={openInvestor}
            onClose={() => setCurrentView(View.Feed)}
          />
        );
        break;

      case View.Factory:
        // goToFactory is triggered via useEffect below when view changes to Factory
        content = (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <LoadingIcon className="w-8 h-8 animate-spin" style={{ color: 'var(--bw-green)' }} />
            <p className="text-sm text-stone-600">Opening Factory...</p>
          </div>
        );
        break;

      case View.Companies:
        content = (
          <Suspense fallback={<div />}>
            <CompaniesPage onViewCompany={handleViewCompany} onEditProfile={() => handleSetView(View.Profile)} />
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
              <Header currentView={currentView} onNavigate={handleSetView} onLogout={handleLogout} onSwitchToRecruiter={currentUser?.isRecruiter ? handleSwitchProfile : undefined} onEnterAdminPanel={isPlatformAdmin ? handleEnterAdminPanel : undefined} notificationCount={unreadNotifCount} pendingConnectionCount={0} onCircleInviteAccepted={handleCircleInviteAccepted} onOpenSettings={() => setShowSecurityPage(true)} onOpenAccountSheet={() => setAccountOpen(true)} onOpenCreate={() => setCreateOpen(true)} />
              <main className="w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 pb-10 overflow-x-hidden">
                <Suspense fallback={<div />}>
                  <SecurityPrivacyPage
                    user={currentUser}
                    onBack={() => setShowSecurityPage(false)}
                    onChangePassword={() => handleChangePassword('' as any, '' as any)}
                    onDeleteAccount={() => setShowDeletionModal(true)}
                    onExportData={handleExportData}
                    circles={data.circles}
                  />
                </Suspense>
              </main>
            </div>
          </div>
        )}

        {/* Create: the menu is permission- and page-aware; the Arena challenge flow opens over whatever page you are on */}
        {currentUser && (
          <>
            <SparkCreateHost />
            <ShareWorkHost myName={currentUser.name} />
            <InviteHost myName={currentUser.name} pods={invitePods} />
            {fbUser && <TalkHost uid={fbUser.uid} speaker={{ name: currentUser.name, headline: currentUser.headline, avatarUrl: currentUser.avatarUrl }} />}
            <InviteResume ready={!!data && !showTermsWall && !showCommunityWall && !showAgeWall} steps={inviteSteps} />
            <CreateMenu open={createOpen} onClose={() => setCreateOpen(false)} view={String(currentView)} canPostChallenge={canPostArena} onChoose={handleCreate} />
          </>
        )}
        {postChallengeOpen && canPostArena && myCompany && fbUser && (
          <Suspense fallback={null}>
            <PostChallengeFlow
              company={{ id: (myCompany as any)._firestoreId ?? String(myCompany.id), name: myCompany.name, logoUrl: myCompany.logoUrl, domain: (myCompany as any).domain, _firestoreId: (myCompany as any)._firestoreId }}
              recruiterUid={fbUser.uid}
              recruiterEmail={fbUser.email ?? ''}
              isRegulated={false}
              onClose={() => setPostChallengeOpen(false)}
            />
          </Suspense>
        )}

        {/* Phone "You" menu: settings, support, about and legal (what the full footer used to carry) */}
        {currentUser && (
          <AccountSheet
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
            onNavigate={v => { setPublicProfileUserId(null); handleSetView(v); }}
            onLogout={handleLogout}
            onOpenSettings={() => setShowSecurityPage(true)}
            onReportConcern={() => openReport(undefined, undefined)}
            onOpenAbout={() => setShowAboutPage(true)}
            onOpenTerms={() => setShowTermsPage(true)}
            onOpenPrivacy={() => setShowPrivacyPage(true)}
            onOpenCommunity={() => setShowCommunityPage(true)}
            onOpenConnect={handleNavigateToConnect}
            notificationCount={unreadNotifCount}
            onSwitchToRecruiter={currentUser.isRecruiter ? handleSwitchProfile : undefined}
            onEnterAdminPanel={isPlatformAdmin ? handleEnterAdminPanel : undefined}
            onGoToFactory={() => goToFactory(fbUser ?? null)}
            factoryGated={isEngagementGated(currentUser)}
          />
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
        {publicProfileUserId && data && currentUser && (
          <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: '#f5f5f4' }}>
            <div className="min-h-screen">
              <Header currentView={currentView} onNavigate={v => { setPublicProfileUserId(null); handleSetView(v); }} onLogout={handleLogout} onSwitchToRecruiter={currentUser?.isRecruiter ? handleSwitchProfile : undefined} onEnterAdminPanel={isPlatformAdmin ? handleEnterAdminPanel : undefined} notificationCount={unreadNotifCount} pendingConnectionCount={data.connectionRequests.filter(r => r.toUserId === currentUser!.id && r.status === 'pending').length} onCircleInviteAccepted={handleCircleInviteAccepted} onOpenSettings={() => setShowSecurityPage(true)} onOpenAccountSheet={() => setAccountOpen(true)} onOpenCreate={() => setCreateOpen(true)} />
              <main className={`w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 ${MOBILE_NAV_CLEARANCE} overflow-x-hidden`}>
                <Suspense fallback={<div />}>
                  <ProfileOverlay
                    userId={publicProfileUserId}
                    cachedUsers={data.users}
                    currentUserId={currentUser.id}
                    connectionRequests={data.connectionRequests}
                    followedUserIds={followedUserIds}
                    onBack={() => setPublicProfileUserId(null)}
                    onConnect={(numericId) => {
                      // Bug fix: this used to call fbSendConnectionRequest with
                      // 2 args (the current user's own numeric id, and the
                      // other numeric id) against a signature that needs 4
                      // (both parties' Firebase UIDs and numeric ids) — every
                      // "Connect" click from a public profile threw at
                      // runtime. Mirrors the working call site in
                      // handleConnect above.
                      if (!fbUser) return;
                      const receiver = data.users.find(u => u.id === numericId) as any;
                      fbSendConnectionRequest(fbUser.uid, currentUser!.id, receiver?._firestoreUid ?? String(numericId), numericId)
                        .then(newRequest => setData(d => d ? { ...d, connectionRequests: [...d.connectionRequests, newRequest] } : null))
                        .catch(err => console.error('sendConnectionRequest failed:', err));
                    }}
                    onFollow={handleFollowUser}
                    onViewCompany={handleViewCompany}
                    onMessage={(uid) => { setPublicProfileUserId(null); startMessage(uid); }}
                    onPlayVideo={url => setPlayingVideoUrl(url)}
                  />
                </Suspense>
              </main>
              <MobileNav currentView={currentView} onNavigate={v => { setPublicProfileUserId(null); handleSetView(v); }} onOpenAccount={() => setAccountOpen(true)} accountOpen={accountOpen} />
            </div>
          </div>
        )}

        <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f5f5f4" }}>
          <Header
            currentView={currentView}
            onNavigate={handleSetView}
            onLogout={handleLogout}
            onSwitchToRecruiter={currentUser?.isRecruiter ? handleSwitchProfile : undefined}
            // Real bug found verifying the recruiter-gating fix above: this
            // is the main app shell's Header — what every signed-in user
            // actually sees on the home feed — and it never wired up
            // onEnterAdminPanel at all, unlike the other two Header render
            // sites (the Security & Privacy overlay, and one other
            // secondary view). A platform admin had no way to reach their
            // own Admin Panel from normal day-to-day app usage.
            onEnterAdminPanel={isPlatformAdmin ? handleEnterAdminPanel : undefined}
            notificationCount={unreadNotifCount}
            pendingConnectionCount={data.connectionRequests.filter(r => r.toUserId === currentUser.id && r.status === 'pending').length}
            onSearch={(q) => {
              setPeopleSearch(q);
              handleSetView(View.People);
            }}
            onOpenSettings={() => setShowSecurityPage(true)} onOpenAccountSheet={() => setAccountOpen(true)} onOpenCreate={() => setCreateOpen(true)}
          />
          <main className={`flex-grow w-full max-w-screen-xl mx-auto px-3 sm:px-6 pt-16 sm:pt-20 ${MOBILE_NAV_CLEARANCE} overflow-x-hidden`}>
            {/* Picks "sponsor this Arena" back up after the member has created or claimed an organization */}
            <SponsorIntentHost uid={fbUser?.uid} isRecruiter={!!currentUser?.isRecruiter} onSetup={handleSponsorSetup} />
            <PullToRefresh onRefresh={async () => { if (currentUser) await loadAppData(currentUser); }}>
              {content}
            </PullToRefresh>
          </main>
          {successBanner && <SuccessBanner message={successBanner} onClose={() => setSuccessBanner(null)} />}
          <Footer
            onNavigateToConnect={handleNavigateToConnect}
            onNavigateToAbout={() => setShowAboutPage(true)}
            onReportConcern={() => openReport(undefined, undefined)}
            onNavigateToTerms={() => setShowTermsPage(true)}
            onNavigateToPrivacy={() => setShowPrivacyPage(true)}
            onNavigateToCommunity={() => setShowCommunityPage(true)}
          />
          {selectedCompany && <CompanyProfileModal key={String((selectedCompany as any)._firestoreId ?? selectedCompany.id)} company={selectedCompany} allJobs={data.jobs} onClose={() => setSelectedCompany(null)} onOpenOrganization={handleViewCompany} />}
          {coPilotModalOpen && <CoPilotModal title={coPilotModalTitle} isLoading={isCoPilotLoading} content={coPilotModalContent} onClose={() => { setCoPilotModalOpen(false); setCoPilotModalContent(null); }} />}
          {isSkillsGraphModalOpen && <SkillsGraphModal currentUser={currentUser} onSubmit={handleGenerateSkillsGraph} onSaveUserSkills={handleSaveUserSkills} onRemoveUserSkill={handleRemoveUserSkill} onClose={() => setIsSkillsGraphModalOpen(false)} />}
          {isImportLinkedInOpen && <ImportLinkedInModal user={currentUser} onExtract={handleExtractLinkedInProfile} onSaveProfile={handleSaveCurrentUserProfile} onClose={() => setIsImportLinkedInOpen(false)} />}
          {isImportResumeOpen && (currentUser as any).resumeUrl && <ImportResumeModal user={currentUser} resumeUrl={(currentUser as any).resumeUrl} onExtract={handleExtractResumeProfile} onSaveProfile={handleSaveCurrentUserProfile} onClose={() => setIsImportResumeOpen(false)} />}
          {/* Real bug fix: fbUid was never passed — VideoRecorderModal builds its
             Storage upload path as `vibe-clips/${fbUid}/...`, so every micro-intro
             recording/upload was writing to a `vibe-clips/undefined/...` path. */}
          {isVideoRecorderModalOpen && fbUser && <VideoRecorderModal onSave={handleSaveMicroIntroduction} onClose={() => setIsVideoRecorderModalOpen(false)} fbUid={fbUser.uid} />}
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
          {showUpgradeModal && showUpgradeModal !== 'investor' && (
            <UpgradeModal
              tier={showUpgradeModal}
              onClose={() => setShowUpgradeModal(null)}
              onSuccess={(tier) => {
                setShowUpgradeModal(null);
                // PricingPage's buttons are already disabled while gated, so
                // this path shouldn't be reachable gated — but don't redirect
                // into Factory off a successful purchase without rechecking.
                if (tier === 'factory' && !(currentUser && isEngagementGated(currentUser))) {
                  goToFactory(fbUser ?? null);
                }
              }}
            />
          )}
          <MobileNav currentView={currentView} onNavigate={handleSetView} pendingConnectionCount={data.connectionRequests.filter(r => r.toUserId === currentUser.id && r.status === 'pending').length} onOpenAccount={() => setAccountOpen(true)} accountOpen={accountOpen} />
        </div>

        {/* ── Legal page overlays ────────────────────────────────────────── */}
        {showTermsPage && (
          <div className="fixed inset-0 z-[70] overflow-y-auto">
            <Suspense fallback={<FullPageLoader />}>
              <TermsOfService onBack={() => setShowTermsPage(false)} />
            </Suspense>
          </div>
        )}
        {showPrivacyPage && (
          <div className="fixed inset-0 z-[70] overflow-y-auto">
            <Suspense fallback={<FullPageLoader />}>
              <PrivacyPolicy onBack={() => setShowPrivacyPage(false)} />
            </Suspense>
          </div>
        )}
        {showCommunityPage && (
          <div className="fixed inset-0 z-[70] overflow-y-auto">
            <Suspense fallback={<FullPageLoader />}>
              <CommunityGuidelines onBack={() => setShowCommunityPage(false)} />
            </Suspense>
          </div>
        )}

        {/* ── Cookie banner ──────────────────────────────────────────────── */}
        <CookieBanner onShowPrivacy={() => setShowPrivacyPage(true)} />
      </>
    );
  };

  const renderAuthFlow = () => {
    switch (authState) {
      case 'connect': return (
        <ConnectPage
          onNavigateBack={() => setAuthState('landing')}
          onNavigateToTerms={() => setShowTermsPage(true)}
          onNavigateToPrivacy={() => setShowPrivacyPage(true)}
          onNavigateToCommunity={() => setShowCommunityPage(true)}
        />
      );
      case 'about': return (
        <AboutPage
          onNavigateBack={() => setAuthState('landing')}
          onNavigateToConnect={handleNavigateToConnect}
          onNavigateToTerms={() => setShowTermsPage(true)}
          onNavigateToPrivacy={() => setShowPrivacyPage(true)}
          onNavigateToCommunity={() => setShowCommunityPage(true)}
        />
      );
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
            authError={error}
            onClearAuthError={() => setError(null)}
          />
        );
      case 'register':
        return (
          <RegistrationPage
            onRegisterSuccess={handleRegisterSuccess}
            onGoogleRegister={handleGoogleLogin}
            onNavigateToLogin={() => setAuthState('login')}
            onNavigateToConnect={handleNavigateToConnect}
            onNavigateToLanding={handleNavigateToLanding}
            onNavigateToTerms={() => setShowTermsPage(true)}
            onNavigateToPrivacy={() => setShowPrivacyPage(true)}
            onNavigateToCommunity={() => setShowCommunityPage(true)}
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
        return (
          <LandingPage
            onNavigateToRegister={() => setAuthState('register')}
            onNavigateToLogin={() => setAuthState('login')}
            onNavigateToAbout={() => setAuthState('about')}
            onNavigateToConnect={handleNavigateToConnect}
            onNavigateToTerms={() => setShowTermsPage(true)}
            onNavigateToPrivacy={() => setShowPrivacyPage(true)}
            onNavigateToCommunity={() => setShowCommunityPage(true)}
          />
        );
    }
  };

  return (
    <Suspense fallback={<FullPageLoader />}>
      {authState === 'authenticated' ? renderContent() : renderAuthFlow()}
      {/* Minimum-age wall — required, blocks app until confirmed. Shown before
          Terms/Community since it's the more fundamental gate. */}
      {showAgeWall && currentUser && fbUser && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md p-6 sm:p-8 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto text-2xl"
                style={{ backgroundColor: 'var(--bw-green-light)' }}>
                🎂
              </div>
              <h2 className="text-lg font-bold text-stone-900">Confirm your age</h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                BeWatu is a professional network intended for people aged 16 and older. Please confirm before continuing.
              </p>
            </div>

            <div className="space-y-2.5">
              <button onClick={handleAgeAgree}
                className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--bw-green)' }}>
                I confirm I am 16 or older
              </button>
              <button onClick={handleAgeDecline}
                className="w-full py-2 text-xs text-stone-600 hover:text-stone-700 transition-colors">
                I'm under 16
              </button>
            </div>
          </div>
        </div>
      )}
      {showTermsWall && currentUser && fbUser && (
        <TermsConsentModal
          userName={currentUser.name}
          isNewUser={!(currentUser as any).agreedToTermsVersion}
          onAgree={handleTermsAgree}
        />
      )}
      {/* Community Guidelines wall — required, blocks app until agreed */}
      {showCommunityWall && !showTermsWall && currentUser && fbUser && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md p-6 sm:p-8 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto text-2xl"
                style={{ backgroundColor: 'var(--bw-green-light)' }}>
                🤝
              </div>
              <h2 className="text-lg font-bold text-stone-900">Community Guidelines</h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                Before you continue, please review and agree to our Community Guidelines. These are required to use BeWatu.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200 p-4 space-y-2.5 text-xs text-stone-600 leading-relaxed max-h-48 overflow-y-auto">
              <p><strong className="text-stone-800">Be Respectful</strong> — No harassment, hate speech, or personal attacks. Critique ideas, not people.</p>
              <p><strong className="text-stone-800">Be Honest</strong> — Represent yourself accurately. No fake profiles, impersonation, or fabricated credentials.</p>
              <p><strong className="text-stone-800">Keep It Professional</strong> — Content should be relevant to careers, skills, and innovation. No spam or explicit material.</p>
              <p><strong className="text-stone-800">Protect IP</strong> — Respect others' work and ideas. No misappropriating content from other members, especially in Factory.</p>
              <p><strong className="text-stone-800">Recruiters</strong> — Direct employees only, no agencies. Postings must be genuine and accurate.</p>
            </div>

            <div className="space-y-2.5">
              <button onClick={handleCommunityAgree}
                className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--bw-green)' }}>
                I agree to the Community Guidelines
              </button>
              <button onClick={() => setShowCommunityPage(true)}
                className="w-full py-2 text-xs text-stone-600 hover:text-stone-700 transition-colors">
                Read full Community Guidelines →
              </button>
            </div>

            <p className="text-[11px] text-stone-600 text-center">
              By continuing, you also agree to our{' '}
              <button onClick={() => setShowTermsPage(true)} className="underline hover:no-underline">Terms</button>
              {' '}and{' '}
              <button onClick={() => setShowPrivacyPage(true)} className="underline hover:no-underline">Privacy Policy</button>.
            </p>
          </div>
        </div>
      )}
      {/* Connect with us overlay — top-level (not nested in renderContent's
          main branch) so it also works from the Recruiter Console and Admin
          Panel, which each return early with their own layout before ever
          reaching renderContent's own JSX. */}
      {showConnectPage && (
        <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ backgroundColor: '#f0ede6' }}>
          <Suspense fallback={<div />}>
            <ConnectPage
              onNavigateBack={() => setShowConnectPage(false)}
              onNavigateToTerms={() => setShowTermsPage(true)}
              onNavigateToPrivacy={() => setShowPrivacyPage(true)}
              onNavigateToCommunity={() => setShowCommunityPage(true)}
            />
          </Suspense>
        </div>
      )}

      {/* Legal pages accessible from landing/auth flow too */}
      {showTermsPage && (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
          <Suspense fallback={<FullPageLoader />}>
            <TermsOfService onBack={() => setShowTermsPage(false)} />
          </Suspense>
        </div>
      )}
      {showPrivacyPage && (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
          <Suspense fallback={<FullPageLoader />}>
            <PrivacyPolicy onBack={() => setShowPrivacyPage(false)} />
          </Suspense>
        </div>
      )}
      {showCommunityPage && (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
          <Suspense fallback={<FullPageLoader />}>
            <CommunityGuidelines onBack={() => setShowCommunityPage(false)} />
          </Suspense>
        </div>
      )}
      <CookieBanner onShowPrivacy={() => setShowPrivacyPage(true)} />
      {showDataRequestModal && currentUser && fbUser && (
        <DataRequestModal
          userName={currentUser.name}
          userEmail={(currentUser as any).email ?? fbUser.email ?? ''}
          userNumericId={currentUser.id}
          onClose={() => setShowDataRequestModal(false)}
        />
      )}
      {showDeletionModal && currentUser && (
        <AccountDeletionModal
          userName={currentUser.name}
          onConfirm={handleDeleteAccount}
          onClose={() => setShowDeletionModal(false)}
        />
      )}
    </Suspense>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

// Detect /be/:username before mounting the full app — public profiles are
// accessible without authentication so we render them outside FirebaseProvider.
const beMatch = window.location.pathname.match(/^\/be\/([a-z0-9_-]+)$/i);
// Same reasoning for /endorse/:token — the colleague leaving an endorsement
// has no BeWatu account, by design (see components/EndorseRequestPage.tsx).
const endorseMatch = window.location.pathname.match(/^\/endorse\/([A-Za-z0-9_-]+)$/);
// And /invite/:token: the invited person has no account yet (components/invite/InvitePage.tsx). The token is remembered
// across sign-up and sign-in and picked up in the app (InviteResume).
const inviteToken = tokenFromPath(window.location.pathname);

const App: React.FC = () => {
  if (beMatch || endorseMatch || inviteToken) {
    const fallback = (
      <div className="min-h-screen" style={{ backgroundColor: '#f5f5f4' }}>
        <nav className="bg-white border-b h-14" style={{ borderColor: '#e7e5e4' }}>
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
            <span className="font-bold" style={{ color: 'var(--bw-green)' }}>BeWatu</span>
          </div>
        </nav>
      </div>
    );
    if (beMatch) {
      const username = beMatch[1].toLowerCase();
      return (
        <Suspense fallback={fallback}>
          <PublicSharePage
            username={username}
            onSignUp={() => { window.location.href = '/?signup=1'; }}
          />
        </Suspense>
      );
    }
    if (inviteToken) {
      return (
        <Suspense fallback={fallback}>
          <InvitePage token={inviteToken} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={fallback}>
        <EndorseRequestPage token={endorseMatch![1]} />
      </Suspense>
    );
  }

  return (
    <FirebaseProvider>
      <LanguageProvider>
        <MainApp />
      </LanguageProvider>
    </FirebaseProvider>
  );
};

export default App;
