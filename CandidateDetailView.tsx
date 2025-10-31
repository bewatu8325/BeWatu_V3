import React from 'react';
import { CandidateSearchResult } from '../../types';
import { VerifiedIcon } from '../../constants';

interface CandidateDetailViewProps {
  candidateResult: CandidateSearchResult;
  onBack: () => void;
  isBlindMode: boolean;
}

const StatCard: React.FC<{ title: string; score: number }> = ({ title, score }) => {
    const color = score > 75 ? 'text-green-400' : score > 50 ? 'text-yellow-400' : 'text-orange-400';
    return (
        <div className="bg-slate-700/50 p-4 rounded-lg text-center border border-slate-600">
            <p className="text-sm text-slate-400">{title}</p>
            <p className={`text-3xl font-bold ${color}`}>{score}%</p>
        </div>
    );
};

const CandidateDetailView: React.FC<CandidateDetailViewProps> = ({ candidateResult, onBack, isBlindMode }) => {
  const { user, aiAnalysis } = candidateResult;

  return (
    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
      <button onClick={onBack} className="text-sm font-semibold text-cyan-400 mb-4">&larr; Back to Search Results</button>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Profile Info */}
        <div className="lg:col-span-4 space-y-6">
          <div className="text-center">
             <img src={isBlindMode ? `https://i.pravatar.cc/150?u=${user.id}` : user.avatarUrl} alt="Candidate" className={`w-32 h-32 rounded-full object-cover border-4 border-slate-600 mx-auto ${isBlindMode ? 'filter grayscale' : ''}`} />
             <div className="flex items-center justify-center space-x-2 mt-4">
                <h2 className="text-2xl font-bold text-slate-100">{isBlindMode ? `Candidate #${user.id}` : user.name}</h2>
                {!isBlindMode && user.isVerified && <VerifiedIcon className="w-6 h-6 text-cyan-400" title="Verified Work Email" />}
             </div>
             <p className="text-slate-300">{user.headline}</p>
          </div>
          <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600 space-y-2">
            <p><strong className="text-slate-400">Availability:</strong> {user.availability}</p>
            <p><strong className="text-slate-400">Values:</strong> {user.values.join(', ')}</p>
            <p><strong className="text-slate-400">Reputation:</strong> <span className="text-green-400 font-semibold">{user.reputation}</span></p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-200 mb-2">Integrations</h3>
            <div className="space-y-2">
              {user.thirdPartyIntegrations.map(integration => (
                <a href={integration.url} target="_blank" rel="noopener noreferrer" key={integration.platform} className="flex items-center p-2 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors">
                  <span className="text-cyan-400 font-bold">{integration.platform}</span>
                </a>
              ))}
            </div>
          </div>
          <div className="space-y-2">
              <button className="w-full bg-cyan-500 text-slate-900 font-semibold py-2 rounded-lg hover:bg-cyan-400 transition-colors">Start AI Screening Chat</button>
              <button className="w-full bg-slate-600 text-slate-200 font-semibold py-2 rounded-lg hover:bg-slate-500 transition-colors">Schedule Interview (Calendly)</button>
          </div>
        </div>

        {/* Right Column: AI Analysis & Portfolio */}
        <div className="lg:col-span-8 space-y-6">
            <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-2">AI Predictive Scores</h3>
                <div className="grid grid-cols-3 gap-4">
                    <StatCard title="Role Fit" score={aiAnalysis.predictiveScores.roleFit} />
                    <StatCard title="Culture Fit" score={aiAnalysis.predictiveScores.cultureFit} />
                    <StatCard title="Mutual Success" score={aiAnalysis.predictiveScores.mutualSuccessPotential} />
                </div>
            </div>

            <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600">
                <h3 className="font-semibold text-slate-200 mb-2">AI Summary</h3>
                <p className="text-slate-300 mb-4">{aiAnalysis.matchReasoning}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <h4 className="font-bold text-green-400 mb-1">Strengths</h4>
                        <ul className="list-disc list-inside space-y-1 text-slate-300">
                            {aiAnalysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-bold text-orange-400 mb-1">Potential Red Flags</h4>
                        <ul className="list-disc list-inside space-y-1 text-slate-300">
                            {aiAnalysis.potentialRedFlags.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                </div>
            </div>
             
             <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-2">Live Portfolio</h3>
                <div className="space-y-4">
                    {user.portfolio.map(project => (
                        <div key={project.id} className="bg-slate-700/50 p-4 rounded-lg border border-slate-600">
                            <h4 className="font-bold text-slate-100">{project.title}</h4>
                            <p className="text-sm text-slate-300 mt-1">{project.description}</p>
                            <p className="text-xs text-slate-400 mt-2"><strong className="font-semibold">Outcome:</strong> {project.outcome}</p>
                            <p className="text-xs text-cyan-300 mt-1"><strong className="font-semibold">AI Summary:</strong> {project.aiGeneratedSummary}</p>
                        </div>
                    ))}
                </div>
            </div>
            
            <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-2">Peer-Verified Achievements</h3>
                <div className="space-y-3">
                    {user.verifiedAchievements.map(ach => (
                        <div key={ach.id} className="bg-slate-700/50 p-3 rounded-lg border border-slate-600">
                            <p className="text-slate-200">"{ach.achievement}"</p>
                            <p className="text-xs text-slate-400 text-right mt-1">&mdash; {ach.verifierName}, {ach.verifierTitle} @ {ach.verifierCompany}</p>
                        </div>
                    ))}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default CandidateDetailView;
