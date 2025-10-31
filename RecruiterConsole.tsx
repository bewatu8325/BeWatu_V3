import React, { useState, useEffect, useCallback } from 'react';
import { AppData, CandidateSearchResult, User, Job, Company } from '../../types';
import { generateProfessionalNetworkData, searchCandidates } from '../../services/geminiService';
import { LogoIcon, SearchIcon, LoadingIcon, LogoutIcon } from '../../constants';
import SubscriptionModal from './SubscriptionModal';
import CandidateDetailView from './CandidateDetailView';
import DEIDashboard from './DEIDashboard';
import TalentPipelines from './TalentPipelines';
import Footer from '../Footer';
import ManageJobsView from './ManageJobsView';
import ExpandedCandidateView from './ExpandedCandidateView';

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
}

type RecruiterView = 'dashboard' | 'pipelines' | 'analytics' | 'manage_jobs';

const RecruiterConsole: React.FC<RecruiterConsoleProps> = (props) => {
  const { onLogout, isTrialActive, setTrialActive, onSwitchProfile, talentPipeline, allJobs, allCompanies, currentUser, onAddJob, onUpdateJob, onDeleteJob, onToggleJobStatus } = props;
  
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CandidateSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(!isTrialActive);
  const [activeView, setActiveView] = useState<RecruiterView>('dashboard');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSearchResult | null>(null);
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [expandedCandidateId, setExpandedCandidateId] = useState<number | null>(null);

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
      setError("Could not load candidate data.");
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      setSearchResults(results.sort((a,b) => b.aiAnalysis.predictiveScores.mutualSuccessPotential - a.aiAnalysis.predictiveScores.mutualSuccessPotential));
    } catch (err) {
      setError("An error occurred during the search. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleToggleExpand = (userId: number) => {
    setExpandedCandidateId(prevId => (prevId === userId ? null : userId));
  };


  const NavItem: React.FC<{label: string, view: RecruiterView}> = ({ label, view }) => (
    <button 
      onClick={() => { setActiveView(view); setSelectedCandidate(null); }}
      className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors ${activeView === view ? 'bg-slate-700 text-cyan-300' : 'text-slate-400 hover:bg-slate-700/50'}`}
    >
      {label}
    </button>
  );

  const renderContent = () => {
    if (isLoadingUsers) return <div className="flex items-center justify-center h-96"><LoadingIcon className="w-12 h-12 animate-spin text-cyan-400" /></div>;
    
    if (selectedCandidate) {
      return <CandidateDetailView candidateResult={selectedCandidate} onBack={() => setSelectedCandidate(null)} isBlindMode={isBlindMode} />;
    }

    switch(activeView) {
      case 'dashboard':
        return (
          <>
            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
              <div className="flex justify-between items-center mb-4">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-100 mb-1">AI-Powered Search</h1>
                      <p className="text-slate-400 text-sm">Find candidates by intent, not just keywords.</p>
                  </div>
                  <div className="flex items-center space-x-2">
                      <label htmlFor="blind-mode" className="text-sm font-medium text-slate-300">Blind Mode</label>
                      <button onClick={() => setIsBlindMode(!isBlindMode)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBlindMode ? 'bg-cyan-500' : 'bg-slate-600'}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isBlindMode ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                  </div>
              </div>
              <form onSubmit={handleSearch}>
                <div className="flex space-x-2">
                  <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g., “Find data scientists who built fintech models using Python in the last 12 months”"
                    className="w-full p-2.5 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-slate-500"
                  />
                  <button type="submit" disabled={isSearching || !isTrialActive}
                    className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 disabled:text-slate-500 flex items-center justify-center"
                  >
                    {isSearching ? <LoadingIcon className="w-5 h-5 animate-spin"/> : <SearchIcon className="w-5 h-5"/>}
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
                    {searchResults.map((result) => (
                      <div key={result.user.id}>
                        <button onClick={() => handleToggleExpand(result.user.id)}
                          className="w-full bg-slate-800/50 p-5 rounded-xl border border-slate-700 flex flex-col sm:flex-row items-start space-x-4 hover:border-cyan-500/50 transition-colors text-left"
                        >
                          <img src={isBlindMode ? `https://i.pravatar.cc/150?u=${result.user.id}` : result.user.avatarUrl} alt="Candidate" className={`w-20 h-20 rounded-full object-cover border-2 border-slate-600 ${isBlindMode ? 'filter grayscale' : ''}`} />
                          <div className="flex-grow mt-2 sm:mt-0">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <h3 className="font-bold text-lg text-cyan-400">{isBlindMode ? `Candidate #${result.user.id}` : result.user.name}</h3>
                                      <p className="text-sm text-slate-300">{result.user.headline}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0 ml-4">
                                      <p className="text-sm text-slate-400">Mutual Success</p>
                                      <p className="font-bold text-2xl text-green-400">{result.aiAnalysis.predictiveScores.mutualSuccessPotential}%</p>
                                  </div>
                              </div>
                              <div className="mt-3 bg-slate-700/50 p-3 rounded-lg border border-slate-600">
                                <p className="text-xs font-semibold text-cyan-300 mb-1">AI Reasoning:</p>
                                <p className="text-sm text-slate-200 line-clamp-2">{result.aiAnalysis.matchReasoning}</p>
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
                {!isSearching && searchResults.length === 0 && query && <p className="text-center text-slate-400 py-8">No candidates found for your search.</p>}
            </div>
          </>
        );
      case 'pipelines':
        return <TalentPipelines pipelineData={talentPipeline} />;
      case 'analytics':
        return <DEIDashboard />;
      case 'manage_jobs':
        return <ManageJobsView 
          jobs={allJobs.filter(j => j.recruiterId === currentUser.id)}
          companies={allCompanies}
          onAddJob={onAddJob}
          onUpdateJob={onUpdateJob}
          onDeleteJob={onDeleteJob}
          onToggleJobStatus={onToggleJobStatus}
          recruiterId={currentUser.id}
        />;
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col">
      {isSubscriptionModalOpen && <SubscriptionModal onClose={() => setIsSubscriptionModalOpen(false)} onSubscribe={() => { setTrialActive(true); setIsSubscriptionModalOpen(false); }} />}
      
      <header className="bg-slate-800/80 backdrop-blur-md border-b border-slate-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <LogoIcon className="h-8 w-auto text-cyan-400" />
            <span className="text-xl font-bold text-slate-200">Recruiter Console</span>
          </div>
          <div className="flex items-center space-x-4">
            <button 
                onClick={onSwitchProfile} 
                title="Switch to Personal Profile"
                className="text-xs font-semibold bg-slate-700 text-cyan-300 px-3 py-1.5 rounded-full hover:bg-slate-600 transition-colors"
            >
                Switch to Personal
            </button>
            <button onClick={onLogout} title="Logout" className="flex items-center space-x-2 text-slate-400 hover:text-cyan-400 p-2 rounded-lg focus:outline-none transition-colors">
              <LogoutIcon className="w-5 h-5" />
              <span className="text-sm font-semibold">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8 flex-grow">
        <div className="flex items-center justify-between mb-6">
          <nav className="flex items-center space-x-2 p-1 bg-slate-800/50 border border-slate-700 rounded-lg">
            <NavItem label="Dashboard" view="dashboard" />
            <NavItem label="Talent Pipelines" view="pipelines" />
            <NavItem label="Manage Jobs" view="manage_jobs" />
            <NavItem label="Equity Analytics" view="analytics" />
          </nav>
        </div>
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
};

export default RecruiterConsole;