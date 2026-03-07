import React, { useState, useEffect, useCallback } from 'react';
import { AppData, CandidateSearchResult, User, Job, Company } from '../../types';
import { generateProfessionalNetworkData, searchCandidates } from '../../services/geminiService';
import { LogoIcon, SearchIcon, LoadingIcon, LogoutIcon } from '../../constants';
import { useFirebase } from '../../contexts/FirebaseContext';
import SubscriptionModal from './SubscriptionModal';
import CandidateDetailView from './CandidateDetailView';
import DEIDashboard from '../DEIDashboard';
import { TalentPipeline, DEFAULT_PIPELINE_STAGES, PipelineCandidate } from './TalentPipeline';
import {
  getPipelineCandidates,
  movePipelineCandidate,
  addPipelineNote,
  schedulePipelineInterview,
  rejectPipelineCandidate,
} from '../../lib/firestoreService';
import InterviewScheduler from './InterviewScheduler';
import OutreachTemplates from './OutreachTemplates';
import PipelineAnalytics from './PipelineAnalytics';
import TalentPool from './TalentPool';
import CultureFitScore from './CultureFitScore';
import Footer from '../Footer';
import ManageJobsView from '../ManageJobsView';
import ApplicantInbox from './ApplicantInbox';
import ExpandedCandidateView from '../ExpandedCandidateView';

interface RecruiterConsoleProps {
  onLogout: () => void;
  isTrialActive: boolean;
  setTrialActive: (isActive: boolean) => void;
  onSwitchProfile: () => void;
  talentPipeline: { [key: string]: User[] };
  allJobs: Job[];
  allCompanies: Company[];
  currentUser: User;
  onAddJob: (jobData: Omit<Job, 'id'>) => void;
  onUpdateJob: (job: Job) => void;
  onDeleteJob: (jobId: number) => void;
  onToggleJobStatus: (jobId: number, currentStatus: 'Active' | 'Suspended') => void;
  onViewProfile?: (userId: number) => void;
}

type RecruiterView = 'dashboard' | 'inbox' | 'pipelines' | 'interviews' | 'templates' | 'culture_fit' | 'pipeline_analytics' | 'talent_pool' | 'analytics' | 'manage_jobs';

const RecruiterConsole: React.FC<RecruiterConsoleProps> = (props) => {
  const {
    onLogout, isTrialActive, setTrialActive, onSwitchProfile,
    talentPipeline, allJobs, allCompanies, currentUser,
    onAddJob, onUpdateJob, onDeleteJob, onToggleJobStatus, onViewProfile,
  } = props;

  const { fbUser } = useFirebase();

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CandidateSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(!isTrialActive);
  const [activeView, setActiveView] = useState<RecruiterView>('dashboard');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSearchResult | null>(null);
  const [isBlindMode, setIsBlindMode] = useState(false);                   // ← single declaration
  const [expandedCandidateId, setExpandedCandidateId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);   // ← typed correctly

  // ── Load AI candidate data ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const cachedData = sessionStorage.getItem('beWatuData');
      let data: AppData;
      if (cachedData) {
        data = JSON.parse(cachedData);
      } else {
        data = await generateProfessionalNetworkData();
        sessionStorage.setItem('beWatuData', JSON.stringify(data));
      }
      setAllUsers(data.users);
    } catch (err) {
      setError('Could not load candidate data.');
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Load pipeline candidates from Firestore ───────────────────────────────
  useEffect(() => {
    if (fbUser) {
      getPipelineCandidates(fbUser.uid).then(setCandidates).catch(console.error);
    }
  }, [fbUser]);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !isTrialActive) return;
    setIsSearching(true);
    setSelectedCandidate(null);
    setExpandedCandidateId(null);
    setSearchResults([]);
    setError(null);
    try {
      const results = await searchCandidates(allUsers, query);
      setSearchResults(results.sort((a, b) =>
        b.aiAnalysis.predictiveScores.mutualSuccessPotential - a.aiAnalysis.predictiveScores.mutualSuccessPotential
      ));
    } catch (err) {
      setError('An error occurred during the search. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleExpand = (userId: number) => {
    setExpandedCandidateId(prev => prev === userId ? null : userId);
  };

  // ── Nav helper ────────────────────────────────────────────────────────────
  const NavItem: React.FC<{ label: string; view: RecruiterView }> = ({ label, view }) => (
    <button
      onClick={() => { setActiveView(view); setSelectedCandidate(null); }}
      className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors ${
        activeView === view ? 'bg-stone-100 text-emerald-600' : 'text-stone-500 hover:bg-stone-100'
      }`}
    >
      {label}
    </button>
  );

  // ── Main content renderer ─────────────────────────────────────────────────
  const renderContent = () => {
    if (isLoadingUsers) return (
      <div className="flex items-center justify-center h-96">
        <LoadingIcon className="w-12 h-12 animate-spin text-emerald-700" />
      </div>
    );

    if (selectedCandidate) {
      return (
        <CandidateDetailView
          candidateResult={selectedCandidate}
          onBack={() => setSelectedCandidate(null)}
          isBlindMode={isBlindMode}
        />
      );
    }

    switch (activeView) {
      case 'dashboard':
        return (
          <>
            <div className="bg-white p-6 rounded-xl border border-stone-200">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-stone-900 mb-1">AI-Powered Search</h1>
                  <p className="text-stone-500 text-sm">Find candidates by intent, not just keywords.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <label htmlFor="blind-mode" className="text-sm font-medium text-stone-700">Blind Mode</label>
                  <button
                    onClick={() => setIsBlindMode(b => !b)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isBlindMode ? 'bg-emerald-600' : 'bg-stone-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isBlindMode ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>
              <form onSubmit={handleSearch}>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder='e.g., "Find data scientists who built fintech models using Python in the last 12 months"'
                    className="w-full p-2.5 bg-stone-100 text-stone-800 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !isTrialActive}
                    className="bg-emerald-600 text-white font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition-colors disabled:bg-cyan-800 disabled:text-stone-400 flex items-center justify-center"
                  >
                    {isSearching ? <LoadingIcon className="w-5 h-5 animate-spin" /> : <SearchIcon className="w-5 h-5" />}
                    <span className="ml-2 hidden sm:inline">Search</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-8">
              {isSearching && <div className="text-center py-8"><p>Analyzing candidates...</p></div>}
              {error && <p className="text-center text-red-400 py-8">{error}</p>}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">AI Shortlist</h2>
                  {searchResults.map(result => (
                    <div key={result.user.id}>
                      <button
                        onClick={() => handleToggleExpand(result.user.id)}
                        className="w-full bg-white p-5 rounded-xl border border-stone-200 flex flex-col sm:flex-row items-start space-x-4 hover:border-emerald-600/50 transition-colors text-left"
                      >
                        <img
                          src={isBlindMode ? `https://i.pravatar.cc/150?u=${result.user.id}` : result.user.avatarUrl}
                          alt="Candidate"
                          className={`w-20 h-20 rounded-full object-cover border-2 border-stone-200 ${isBlindMode ? 'filter grayscale' : ''}`}
                        />
                        <div className="flex-grow mt-2 sm:mt-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-bold text-lg text-emerald-700">
                                {isBlindMode ? `Candidate #${result.user.id}` : result.user.name}
                              </h3>
                              <p className="text-sm text-stone-700">{result.user.headline}</p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-4">
                              <p className="text-sm text-stone-500">Mutual Success</p>
                              <p className="font-bold text-2xl text-green-400">
                                {result.aiAnalysis.predictiveScores.mutualSuccessPotential}%
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 bg-stone-100 p-3 rounded-lg border border-stone-200">
                            <p className="text-xs font-semibold text-emerald-600 mb-1">AI Reasoning:</p>
                            <p className="text-sm text-stone-800 line-clamp-2">{result.aiAnalysis.matchReasoning}</p>
                          </div>
                        </div>
                      </button>
                      {expandedCandidateId === result.user.id && (
                        <ExpandedCandidateView
                          candidateResult={result}
                          onViewFullProfile={() => setSelectedCandidate(result)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!isSearching && searchResults.length === 0 && query && (
                <p className="text-center text-stone-500 py-8">No candidates found for your search.</p>
              )}
            </div>
          </>
        );

      case 'pipelines':
        return (
          <TalentPipeline
            stages={DEFAULT_PIPELINE_STAGES}
            candidates={candidates}
            onMoveCandidate={async (id, from, to) => {
              await movePipelineCandidate(id, to);
              setCandidates(c => c.map(x => x.id === id ? { ...x, stage: to } : x));
            }}
            onAddNote={async (id, note) => {
              await addPipelineNote(id, note);
              if (fbUser) setCandidates(await getPipelineCandidates(fbUser.uid));
            }}
            onScheduleInterview={async (id, date) => {
              await schedulePipelineInterview(id, date);
              setCandidates(c => c.map(x => x.id === id ? { ...x, interviewDate: date } : x));
            }}
            onRejectCandidate={async (id, reason) => {
              await rejectPipelineCandidate(id, reason);
              setCandidates(c => c.map(x => x.id === id ? { ...x, status: 'rejected' } : x));
            }}
            onViewProfile={onViewProfile ? (userId) => onViewProfile(Number(userId)) : undefined}
            isBlindMode={isBlindMode}
            onToggleBlindMode={() => setIsBlindMode(b => !b)}
          />
        );

      case 'inbox':
        return <ApplicantInbox onViewProfile={onViewProfile} />;

      case 'interviews':
        return <InterviewScheduler />;

      case 'templates':
        return <OutreachTemplates />;

      case 'culture_fit':
        return <CultureFitScore />;

      case 'pipeline_analytics':
        return <PipelineAnalytics />;

      case 'talent_pool':
        return <TalentPool onViewProfile={onViewProfile} />;

      case 'analytics':
        return <DEIDashboard />;

      case 'manage_jobs':
        return (
          <ManageJobsView
            jobs={allJobs.filter(j => j.recruiterId === currentUser.id)}
            companies={allCompanies}
            onAddJob={onAddJob}
            onUpdateJob={onUpdateJob}
            onDeleteJob={onDeleteJob}
            onToggleJobStatus={onToggleJobStatus}
            recruiterId={currentUser.id}
          />
        );

      default:
        return null;
    }
  };

  // ── Shell ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col">
      {isSubscriptionModalOpen && (
        <SubscriptionModal
          onClose={() => setIsSubscriptionModalOpen(false)}
          onSubscribe={() => { setTrialActive(true); setIsSubscriptionModalOpen(false); }}
        />
      )}

      <header className="backdrop-blur-md border-b sticky top-0 z-10" style={{ backgroundColor:"#1a4a3a", borderColor:"#155237" }}>
        <div className="container mx-auto px-4 sm:px-6 flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <LogoIcon className="h-8 w-auto text-white" />
            <span className="text-xl font-bold text-white">Recruiter Console</span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={onSwitchProfile}
              title="Switch to Personal Profile"
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors border border-white/30 text-white hover:bg-white/10"
            >
              Switch to Personal
            </button>
            <button
              onClick={onLogout}
              title="Logout"
              className="flex items-center space-x-2 text-white/70 hover:text-white p-2 rounded-lg focus:outline-none transition-colors"
            >
              <LogoutIcon className="w-5 h-5" />
              <span className="text-sm font-semibold">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8 flex-grow">
        <div className="flex items-center justify-between mb-6">
          <nav className="flex items-center space-x-2 p-1 bg-white border border-stone-200 rounded-lg">
            <div className="flex items-center gap-1">
              <span className="px-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 hidden sm:block">Find</span>
              <NavItem label="AI Search" view="dashboard" />
              <NavItem label="Inbox" view="inbox" />
            </div>
            <div className="h-5 w-px bg-stone-100 hidden sm:block" />
            <div className="flex items-center gap-1">
              <span className="px-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 hidden sm:block">Manage</span>
              <NavItem label="Pipeline" view="pipelines" />
              <NavItem label="Interviews" view="interviews" />
              <NavItem label="Jobs" view="manage_jobs" />
            </div>
            <div className="h-5 w-px bg-stone-100 hidden sm:block" />
            <div className="flex items-center gap-1">
              <span className="px-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 hidden sm:block">Insights</span>
              <NavItem label="Culture Fit" view="culture_fit" />
              <NavItem label="Analytics" view="pipeline_analytics" />
              <NavItem label="Talent Pool" view="talent_pool" />
              <NavItem label="Templates" view="templates" />
            </div>
          </nav>
        </div>
        {renderContent()}
      </main>

      <Footer />
    </div>
  );
};

export default RecruiterConsole;
