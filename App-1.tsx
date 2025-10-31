import React, { useState, useCallback, Suspense, lazy } from 'react';
import { AppData, Post, User, Job, View, Message, Company, AppreciationType, Circle, Notification } from './types';
import { generateProfessionalNetworkData, analyzeSynergy, analyzeJobMatch, generateSkillsGraph } from './services/geminiService';
import { LoadingIcon } from './constants';
import { LanguageProvider } from './contexts/LanguageContext';
import MobileNav from './components/MobileNav';

// Lazy-loaded components for performance optimization
const Header = lazy(() => import('./components/Header'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const HomePage = lazy(() => import('./components/HomePage'));
const People = lazy(() => import('./components/People'));
const Jobs = lazy(() => import('./components/Jobs'));
const Messaging = lazy(() => import('./components/Messaging'));
const CompanyProfileModal = lazy(() => import('./components/CompanyProfileModal'));
const CoPilotModal = lazy(() => import('./components/CoPilotModal'));
// FIX: Changed lazy import to correctly handle module exports. The original import was failing to find a 'default' property.
const SkillsGraphModal = lazy(() => import('./components/SkillsGraphModal').then(module => ({ default: module.SkillsGraphModal })));
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
const TwoFactorAuthPage = lazy(() => import('./components/auth/TwoFactorAuthPage'));
const RecruiterConsole = lazy(() => import('./components/recruiter/RecruiterConsole'));
const Footer = lazy(() => import('./components/Footer'));
const SuccessBanner = lazy(() => import('./components/SuccessBanner'));

type AuthState = 'landing' | 'login' | 'register' | 'forgot_password' | 'pending_2fa' | 'authenticated' | 'about' | 'connect';
type ActiveProfile = 'user' | 'recruiter';

const freeEmailProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];

const MainApp: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('landing');
  const [activeProfile, setActiveProfile] = useState<ActiveProfile>('user');
  
  const [currentView, setCurrentView] = useState<View>(View.Feed);
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChatUserId, setActiveChatUserId] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Co-pilot Modal State
  const [coPilotModalOpen, setCoPilotModalOpen] = useState(false);
  const [coPilotModalTitle, setCoPilotModalTitle] = useState('');
  const [coPilotModalContent, setCoPilotModalContent] = useState<string | null>(null);
  const [isCoPilotLoading, setIsCoPilotLoading] = useState(false);
  
  // New Feature Modals State
  const [isSkillsGraphModalOpen, setIsSkillsGraphModalOpen] = useState(false);
  const [isVideoRecorderModalOpen, setIsVideoRecorderModalOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  // Circles State
  const [activeCircleId, setActiveCircleId] = useState<number | null>(null);

  // Profile Page State
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  // Job Application State
  const [appliedJobIds, setAppliedJobIds] = useState<number[]>([]);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [talentPipeline, setTalentPipeline] = useState<{ [key: string]: User[] }>({
    'New Applicants': [], 'Sourced': [], 'Screening': [], 'Interview': [], 'Offer': [], 'Hired': [],
  });

  // Recruiter Trial State
  const [isTrialActive, setIsTrialActive] = useState<boolean>(() => {
    const trialEndDate = localStorage.getItem('recruiterTrialEndDate');
    if (trialEndDate) return new Date().getTime() < new Date(trialEndDate).getTime();
    return true; 
  });
  
  // Mobile Nav State
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Security State
  const [isNewDeviceLogin, setIsNewDeviceLogin] = useState(false);

  const fetchData = useCallback(async (loggedInUser: User, initialNotification: Notification | null = null) => {
    const cachedData = sessionStorage.getItem('beWatuData');
    if (cachedData) {
      try {
        const parsedData = JSON.parse(cachedData);
        if (initialNotification) {
            parsedData.notifications.unshift(initialNotification);
        }
        setData(parsedData);
        const userIndex = parsedData.users.findIndex((u: User) => u.id === loggedInUser.id);
        if (userIndex > 0) {
          const users = [...parsedData.users];
          const user = users.splice(userIndex, 1)[0];
          users.unshift(user);
          setData({ ...parsedData, users });
        } else if (userIndex === -1) {
           setData({ ...parsedData, users: [loggedInUser, ...parsedData.users] });
        }
        setCurrentUser(loggedInUser);
        setLoading(false);
        return;
      } catch (e) {
        sessionStorage.removeItem('beWatuData');
      }
    }

    try {
      setLoading(true);
      setError(null);
      const generatedData = await generateProfessionalNetworkData();
      if (initialNotification) {
          generatedData.notifications.unshift(initialNotification);
      }
      const finalData = { ...generatedData, users: [loggedInUser, ...generatedData.users.filter(u => u.id !== loggedInUser.id)] };
      setData(finalData);
      setCurrentUser(loggedInUser);
      sessionStorage.setItem('beWatuData', JSON.stringify(finalData));
      setTalentPipeline(prev => {
          if (prev['Sourced'].length === 0 && finalData.users.length > 5) {
              return { ...prev, 'Sourced': finalData.users.slice(1, 3), 'Screening': finalData.users.slice(3, 5), 'Interview': finalData.users.slice(5, 6), };
          }
          return prev;
      });
    } catch (err) {
      setError('Failed to generate data. Please check your API key and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLoginSuccess = (email: string, isRecruiterLogin: boolean) => {
    // Simulate finding or creating a user
    const loggedInUser: User = {
        id: 1, name: email.split('@')[0], headline: "Software Engineer at BeWatu", bio: "Passionate about building the future of professional networking.", avatarUrl: "https://picsum.photos/seed/1/100", industry: "Technology", professionalGoals: ["Lead a development team", "Contribute to open source"], reputation: 150, credits: 500, isRecruiter: true, isVerified: !freeEmailProviders.some(domain => email.endsWith(domain)), portfolio: [], verifiedAchievements: [], thirdPartyIntegrations: [], workStyle: { collaboration: 'Thrives in pairs', communication: 'Prefers asynchronous', workPace: 'Fast-paced and iterative' }, values: ["Continuous Learning"], availability: 'Exploring opportunities', skills: [{name: 'React', endorsements: 10}], verifiedSkills: null, microIntroductionUrl: null
    };
    setCurrentUser(loggedInUser);
    setActiveProfile(isRecruiterLogin ? 'recruiter' : 'user');
    
    // Risk-based MFA check
    const lastLoginContext = localStorage.getItem('lastLoginContext');
    const currentContext = JSON.stringify({ deviceId: 'simulated-device-1', ip: 'simulated-ip-1' }); // In a real app, this would be dynamic and more robust

    if (lastLoginContext === currentContext) {
      // If context is the same, bypass 2FA
      setIsNewDeviceLogin(false);
      handle2FASuccess();
    } else {
      // If new context, trigger 2FA
      setIsNewDeviceLogin(true);
      setAuthState('pending_2fa');
    }
  };

  const handleRegisterSuccess = (name: string, email: string, isRecruiter: boolean, stripeCustomerId?: string) => {
    const emailDomain = email.split('@')[1];
    const isVerified = !freeEmailProviders.includes(emailDomain);
    
    const newUser: User = {
        id: Date.now(), name, headline: "Eager to make an impact!", bio: "", avatarUrl: `https://picsum.photos/seed/${name}/100`, industry: "", professionalGoals: [], reputation: 0, credits: 0, isRecruiter, isVerified, ...(stripeCustomerId && { stripeCustomerId }), portfolio: [], verifiedAchievements: [], thirdPartyIntegrations: [], workStyle: { collaboration: 'Excels in large teams', communication: 'Prefers real-time meetings', workPace: 'Steady and methodical' }, values: [], availability: 'Immediate', skills: [], verifiedSkills: null, microIntroductionUrl: null
    };
    setCurrentUser(newUser);
    setActiveProfile('user');
    setAuthState('pending_2fa');
  }

  const handle2FASuccess = () => {
    // On successful 2FA (or bypass), save the current context as trusted
    const currentContext = JSON.stringify({ deviceId: 'simulated-device-1', ip: 'simulated-ip-1' });
    localStorage.setItem('lastLoginContext', currentContext);
    
    setAuthState('authenticated');
    if (currentUser) {
        if(currentUser.isRecruiter && activeProfile === 'recruiter') {
            const trialEndDate = localStorage.getItem('recruiterTrialEndDate');
            if (!trialEndDate) {
              const endDate = new Date();
              endDate.setDate(endDate.getDate() + 30);
              localStorage.setItem('recruiterTrialEndDate', endDate.toISOString());
            }
        }
        const initialNotification = isNewDeviceLogin ? {
            id: Date.now(),
            userId: currentUser.id,
            type: 'SECURITY_ALERT' as const,
            text: "A new login to your account was detected from an unrecognized device.",
            read: false,
            timestamp: 'Just now',
        } : null;
        fetchData(currentUser, initialNotification);
        setIsNewDeviceLogin(false);
    }
  };

  const handleLogout = () => {
    setAuthState('landing');
    setData(null);
    setCurrentUser(null);
    sessionStorage.removeItem('beWatuData');
    // We don't remove lastLoginContext to simulate device recognition
    setCurrentView(View.Feed);
  };
  
  const handleSwitchProfile = () => {
      setActiveProfile(prev => prev === 'user' ? 'recruiter' : 'user');
      setCurrentView(View.Feed);
  }
  
  const handleChangePassword = () => {
    if (!data || !currentUser) return;
    const newNotification: Notification = {
        id: Date.now(),
        userId: currentUser.id,
        type: 'SECURITY_ALERT',
        text: "Your password was successfully changed.",
        read: false,
        timestamp: 'Just now',
    };
    setData({ ...data, notifications: [newNotification, ...data.notifications] });
    setSuccessBanner("Password changed successfully!");
  };

  const addPost = (content: string, circleId?: number) => {
    if (!data || !currentUser) return;
    const newPost: Post = { id: Date.now(), authorId: currentUser.id, content, appreciations: { helpful: 0, thoughtProvoking: 0, collaborationReady: 0 }, comments: 0, shares: 0, timestamp: 'Just now', ...(circleId && { circleId }), };
    setData({ ...data, posts: [newPost, ...data.posts] });
  };
  
  const handleAppreciatePost = (postId: number, appreciationType: AppreciationType) => {
    if (!data) return;
    let authorId: number | null = null;
    const updatedPosts = data.posts.map(post => {
      if (post.id === postId) {
        authorId = post.authorId;
        const newAppreciations = { ...post.appreciations, [appreciationType]: post.appreciations[appreciationType] + 1 };
        return { ...post, appreciations: newAppreciations };
      }
      return post;
    });
    let updatedUsers = data.users;
    if (authorId) {
      updatedUsers = data.users.map(user => {
        if (user.id === authorId) {
          let reputationGain = 0, creditGain = 0;
          switch(appreciationType) {
            case 'helpful': reputationGain = 1; creditGain = 5; break;
            case 'thoughtProvoking': reputationGain = 3; creditGain = 10; break;
            case 'collaborationReady': reputationGain = 2; creditGain = 7; break;
          }
          return { ...user, reputation: user.reputation + reputationGain, credits: user.credits + creditGain };
        }
        return user;
      })
    }
    setData({ ...data, posts: updatedPosts, users: updatedUsers });
  };

  const endorseSkill = (userId: number, skillName: string) => { if (!data) return; setData({ ...data, users: data.users.map(u => u.id === userId ? { ...u, skills: u.skills.map(s => s.name === skillName ? { ...s, endorsements: s.endorsements + 1 } : s) } : u) }); };
  const sendMessage = (receiverId: number, text: string) => { if (!data || !currentUser) return; setData({ ...data, messages: [...data.messages, { id: Date.now(), senderId: currentUser.id, receiverId, text, timestamp: 'Just now', isRead: false }] }); };
  const startMessage = (userId: number) => { setActiveChatUserId(userId); setCurrentView(View.Messaging); };
  const handleMarkNotificationsRead = () => { if (!data) return; setData({ ...data, notifications: data.notifications.map(n => ({ ...n, read: true })) }); };
  const handleConnectionRequest = (requestId: number, status: 'accepted' | 'declined') => { if (!data) return; setData({ ...data, connectionRequests: data.connectionRequests.map(cr => cr.id === requestId ? { ...cr, status } : cr), notifications: data.notifications.filter(n => n.relatedId !== requestId) }); };
  const handleViewCompany = (companyId: number) => { if (data) setSelectedCompany(data.companies.find(c => c.id === companyId) || null); };
  const handleCloseCompanyModal = () => setSelectedCompany(null);
  const handleCloseCoPilotModal = () => { setCoPilotModalOpen(false); setCoPilotModalContent(null); };

  const handleAnalyzeSynergy = async (otherUser: User) => {
      if (!currentUser) return;
      setCoPilotModalTitle(`Synergy Analysis: You & ${otherUser.name}`);
      setCoPilotModalOpen(true); setIsCoPilotLoading(true);
      try { setCoPilotModalContent(await analyzeSynergy(currentUser, otherUser)); } 
      catch (err) { setCoPilotModalContent('There was an error analyzing synergy.'); } 
      finally { setIsCoPilotLoading(false); }
  };
  
  const handleAnalyzeJobMatch = async (job: Job, company: Company) => {
      if (!currentUser) return;
      setCoPilotModalTitle(`Job Match Analysis: ${job.title}`);
      setCoPilotModalOpen(true); setIsCoPilotLoading(true);
      try { setCoPilotModalContent(await analyzeJobMatch(currentUser, job, company.name)); } 
      catch (err) { setCoPilotModalContent('There was an error analyzing the job match.'); } 
      finally { setIsCoPilotLoading(false); }
  };

  const handleGenerateSkillsGraph = async (resume: string, digitalFootprint: string, references: string) => {
    if (!data || !currentUser) return;
    const updatedUser = { ...currentUser, verifiedSkills: await generateSkillsGraph(resume, digitalFootprint, references) };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    setCurrentUser(updatedUser);
    setIsSkillsGraphModalOpen(false);
  };

  const handleSaveMicroIntroduction = (videoUrl: string) => {
    if (!data || !currentUser) return;
    const updatedUser = { ...currentUser, microIntroductionUrl: videoUrl };
    setData({ ...data, users: data.users.map(u => u.id === currentUser.id ? updatedUser : u) });
    setCurrentUser(updatedUser);
    setIsVideoRecorderModalOpen(false);
  };
  
  const handleApplyForJob = (job: Job) => {
    if (!currentUser || appliedJobIds.includes(job.id)) return;
    setAppliedJobIds(prev => [...prev, job.id]);
    setTalentPipeline(prev => {
        const existing = prev['New Applicants'] || [];
        if (existing.some(app => app.id === currentUser.id)) return prev;
        return { ...prev, 'New Applicants': [...existing, currentUser] };
    });
    setSuccessBanner(`Successfully applied for ${job.title}!`);
  };

  const handleViewProfile = (userId: number) => { setProfileUserId(userId); setCurrentView(View.Profile); }
  const handleSetView = (view: View) => {
    setCurrentView(view);
    if(view === View.Profile && currentUser) setProfileUserId(currentUser.id);
    else if (view !== View.Profile) setProfileUserId(null);
    if(view !== View.Circles) setActiveCircleId(null);
    setIsMobileNavOpen(false);
  }
  const handleSelectCircle = (circleId: number) => { setCurrentView(View.Circles); setActiveCircleId(circleId); }
  const handleAddMemberToCircle = (circleId: number, userId: number) => { if (!data) return; setData({ ...data, circles: data.circles.map(c => c.id === circleId && !c.members.includes(userId) ? { ...c, members: [...c.members, userId] } : c) }); };
  const handleRemoveMemberFromCircle = (circleId: number, userId: number) => { if (!data) return; setData({ ...data, circles: data.circles.map(c => c.id === circleId && c.adminId !== userId ? { ...c, members: c.members.filter(id => id !== userId) } : c) }); };

  const handleAddJob = (newJobData: Omit<Job, 'id'>) => { if (!data) return; setData(d => d ? { ...d, jobs: [{ id: Date.now(), ...newJobData }, ...d.jobs] } : null); };
  const handleUpdateJob = (updatedJob: Job) => { if (!data) return; setData(d => d ? { ...d, jobs: d.jobs.map(j => j.id === updatedJob.id ? updatedJob : j) } : null); };
  const handleDeleteJob = (jobId: number) => { if (!data) return; setData(d => d ? { ...d, jobs: d.jobs.filter(j => j.id !== jobId) } : null); };
  const handleToggleJobStatus = (jobId: number, currentStatus: 'Active' | 'Suspended') => { if (!data) return; setData(d => d ? { ...d, jobs: d.jobs.map(j => j.id === jobId ? { ...j, status: currentStatus === 'Active' ? 'Suspended' : 'Active' } : j) } : null); };

  const handleNavigateToConnect = () => setAuthState('connect');
  const handleNavigateToLanding = () => setAuthState('landing');

  const renderContent = () => {
    if (loading) return <div className="flex flex-col items-center justify-center h-screen"><LoadingIcon className="w-16 h-16 animate-spin text-cyan-400" /><p className="mt-4 text-lg text-slate-300">Generating professional network...</p></div>;
    if (error || !data || !currentUser) return <div className="flex items-center justify-center h-screen bg-red-900/20 text-red-300"><div className="text-center p-8 border border-red-500/30 rounded-lg bg-slate-900 shadow-lg"><h2 className="text-2xl font-bold mb-2">An Error Occurred</h2><p>{error || 'Could not load application data.'}</p></div></div>;

    if (activeProfile === 'recruiter') {
        return <RecruiterConsole onLogout={handleLogout} isTrialActive={isTrialActive} setTrialActive={setIsTrialActive} onSwitchProfile={handleSwitchProfile} talentPipeline={talentPipeline} allJobs={data.jobs} allCompanies={data.companies} currentUser={currentUser} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onToggleJobStatus={handleToggleJobStatus} />;
    }

    let content;
    switch (currentView) {
      case View.Feed: content = <HomePage data={data} currentUser={currentUser} onGenerateSkills={() => setIsSkillsGraphModalOpen(true)} onRecordVideo={() => setIsVideoRecorderModalOpen(true)} onPlayVideo={(url) => setPlayingVideoUrl(url)} onNavigate={handleSetView} onSelectCircle={handleSelectCircle} addPost={addPost} onAppreciatePost={handleAppreciatePost} onViewProfile={handleViewProfile} />; break;
      case View.People: content = <People users={data.users.filter(u => u.id !== currentUser.id)} onEndorseSkill={endorseSkill} onStartMessage={startMessage} onAnalyzeSynergy={handleAnalyzeSynergy} onViewProfile={handleViewProfile} />; break;
      case View.Jobs: content = <Jobs jobs={data.jobs} companies={data.companies} onViewCompany={handleViewCompany} onAnalyzeMatch={handleAnalyzeJobMatch} onApplyForJob={handleApplyForJob} appliedJobIds={appliedJobIds} />; break;
      case View.Messaging: content = <Messaging users={data.users} messages={data.messages} currentUser={currentUser} onSendMessage={sendMessage} initialActiveUserId={activeChatUserId} />; break;
      case View.AIChat: content = <AIChat currentUser={currentUser} />; break;
      case View.Profile:
        const userToShow = profileUserId ? data.users.find(u => u.id === profileUserId) : currentUser;
        content = userToShow ? <ProfilePage user={userToShow} isCurrentUser={userToShow.id === currentUser.id} connectionRequests={data.connectionRequests} circles={data.circles} onGenerateSkills={() => setIsSkillsGraphModalOpen(true)} onRecordVideo={() => setIsVideoRecorderModalOpen(true)} onPlayVideo={(url) => setPlayingVideoUrl(url)} onNavigate={handleSetView} onSelectCircle={handleSelectCircle} onChangePassword={handleChangePassword} /> : <div>User not found.</div>;
        break;
      case View.Circles:
        if (activeCircleId) {
          const circle = data.circles.find(c => c.id === activeCircleId);
          content = circle ? <CircleDetail circle={circle} allPosts={data.posts} allArticles={data.articles} allUsers={data.users} currentUser={currentUser} addPost={addPost} findAuthor={(id) => data.users.find(u=>u.id === id)} onAppreciatePost={handleAppreciatePost} onAddMember={handleAddMemberToCircle} onRemoveMember={handleRemoveMemberFromCircle} onViewProfile={handleViewProfile} /> : <div>Circle not found</div>;
        } else content = <Circles circles={data.circles} onSelectCircle={handleSelectCircle} />;
        break;
      default: content = null;
    }

    return (
      <div className="min-h-screen flex flex-col pb-16 sm:pb-0">
        <Header currentUser={currentUser} currentView={currentView} setCurrentView={handleSetView} notifications={data.notifications.filter(n => n.userId === currentUser.id)} connectionRequests={data.connectionRequests} users={data.users} onMarkAsRead={handleMarkNotificationsRead} onAcceptConnection={(id) => handleConnectionRequest(id, 'accepted')} onDeclineConnection={(id) => handleConnectionRequest(id, 'declined')} onLogout={handleLogout} onSwitchProfile={handleSwitchProfile} activeProfile={activeProfile} onToggleMobileNav={() => setIsMobileNavOpen(p => !p)} />
        <main className="flex-grow container mx-auto px-4 sm:px-6 py-4 sm:py-8">{content}</main>
        {successBanner && <SuccessBanner message={successBanner} onClose={() => setSuccessBanner(null)} />}
        <Footer onNavigateToConnect={handleNavigateToConnect} />
        {selectedCompany && (<CompanyProfileModal company={selectedCompany} allJobs={data.jobs} onClose={handleCloseCompanyModal} />)}
        {coPilotModalOpen && (<CoPilotModal title={coPilotModalTitle} isLoading={isCoPilotLoading} content={coPilotModalContent} onClose={handleCloseCoPilotModal} />)}
        {isSkillsGraphModalOpen && (<SkillsGraphModal onSubmit={handleGenerateSkillsGraph} onClose={() => setIsSkillsGraphModalOpen(false)} />)}
        {isVideoRecorderModalOpen && (<VideoRecorderModal onSave={handleSaveMicroIntroduction} onClose={() => setIsVideoRecorderModalOpen(false)} />)}
        {playingVideoUrl && (<VideoPlayerModal videoUrl={playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} />)}
        <MobileNav 
          currentView={currentView} 
          setCurrentView={handleSetView} 
          currentUser={currentUser} 
          onLogout={handleLogout} 
          onSwitchProfile={handleSwitchProfile}
          isOpen={isMobileNavOpen}
          onClose={() => setIsMobileNavOpen(false)}
        />
      </div>
    )
  };

  const FullPageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-950">
        <LoadingIcon className="w-12 h-12 animate-spin text-cyan-400" />
    </div>
  );

  return (
    <Suspense fallback={<FullPageLoader />}>
      {authState === 'authenticated' ? renderContent() :
       (authState === 'connect' ? <ConnectPage onNavigateBack={() => setAuthState('landing')} /> :
        (authState === 'about' ? <AboutPage onNavigateBack={() => setAuthState('landing')} onNavigateToConnect={handleNavigateToConnect} /> :
        (authState === 'landing' ? <LandingPage onNavigateToRegister={() => setAuthState('register')} onNavigateToLogin={() => setAuthState('login')} onNavigateToAbout={() => setAuthState('about')} onNavigateToConnect={handleNavigateToConnect} /> :
        (authState === 'login' ? <LoginPage onLoginSuccess={handleLoginSuccess} onNavigateToRegister={() => setAuthState('register')} onNavigateToForgotPassword={() => setAuthState('forgot_password')} onNavigateToConnect={handleNavigateToConnect} onNavigateToLanding={handleNavigateToLanding} /> :
        (authState === 'register' ? <RegistrationPage onRegisterSuccess={handleRegisterSuccess} onNavigateToLogin={() => setAuthState('login')} onNavigateToConnect={handleNavigateToConnect} onNavigateToLanding={handleNavigateToLanding} /> :
        (authState === 'forgot_password' ? <ForgotPasswordPage onResetRequest={() => setAuthState('login')} onNavigateToLogin={() => setAuthState('login')} onNavigateToConnect={handleNavigateToConnect} onNavigateToLanding={handleNavigateToLanding} /> :
        (authState === 'pending_2fa' ? <TwoFactorAuthPage onVerifySuccess={handle2FASuccess} onCancel={handleLogout} onNavigateToConnect={handleNavigateToConnect} onNavigateToLanding={handleNavigateToLanding} /> :
        <LandingPage onNavigateToRegister={() => setAuthState('register')} onNavigateToLogin={() => setAuthState('login')} onNavigateToAbout={() => setAuthState('about')} onNavigateToConnect={handleNavigateToConnect} />
      )))))))}
    </Suspense>
  )
};

const App: React.FC = () => (
  <LanguageProvider>
    <MainApp />
  </LanguageProvider>
);

export default App;