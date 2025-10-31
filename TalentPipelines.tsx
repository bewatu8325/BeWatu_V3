import React, { useState } from 'react';
import { User } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

interface CandidateCardProps {
  candidate: User;
  onClick: () => void;
}

const ExpandedPipelineView: React.FC<{ user: User }> = ({ user }) => {
  const { t } = useTranslation();
  const topSkills = user.skills.slice(0, 3).map(s => s.name).join(', ');

  return (
    <div className="bg-slate-900/70 p-4 rounded-b-lg border border-slate-700 border-t-0 -mt-1 animate-fade-in-up">
      <p className="text-sm text-slate-300 mb-3 line-clamp-3">{user.bio}</p>
      <div className="text-xs space-y-1">
        <p><strong className="text-slate-400 font-semibold">{t('topSkills')}:</strong> <span className="text-cyan-300">{topSkills || 'N/A'}</span></p>
        <p><strong className="text-slate-400 font-semibold">{t('availability')}:</strong> {user.availability}</p>
        <p><strong className="text-slate-400 font-semibold">{t('values')}:</strong> {user.values.join(', ')}</p>
      </div>
    </div>
  );
};

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onClick }) => (
  <button onClick={onClick} className="w-full text-left p-3 bg-slate-800 rounded-md border border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors">
    <div className="flex items-center space-x-2">
      <img src={candidate.avatarUrl} alt={candidate.name} className="w-8 h-8 rounded-full object-cover" />
      <div>
        <p className="text-sm font-semibold text-slate-200">{candidate.name}</p>
        <p className="text-xs text-slate-400 truncate">{candidate.headline}</p>
      </div>
    </div>
  </button>
);

interface PipelineColumnProps {
  title: string;
  candidates: User[];
  expandedCandidateId: number | null;
  onToggleExpand: (id: number) => void;
}

const PipelineColumn: React.FC<PipelineColumnProps> = ({ title, candidates, expandedCandidateId, onToggleExpand }) => (
  <div className="flex-shrink-0 w-72 bg-slate-800/50 rounded-lg border border-slate-700">
    <h3 className="p-3 text-md font-semibold text-slate-100 border-b border-slate-700 flex justify-between items-center">
      {title}
      <span className="text-sm font-normal text-slate-400 bg-slate-700 px-2 rounded-full">{candidates.length}</span>
    </h3>
    <div className="p-2 space-y-2 h-[calc(100vh-20rem)] overflow-y-auto">
      {candidates.map(candidate => (
        <div key={candidate.id}>
          <CandidateCard 
            candidate={candidate}
            onClick={() => onToggleExpand(candidate.id)}
          />
          {expandedCandidateId === candidate.id && <ExpandedPipelineView user={candidate} />}
        </div>
      ))}
    </div>
  </div>
);

interface TalentPipelinesProps {
  pipelineData: { [key: string]: User[] };
}

const TalentPipelines: React.FC<TalentPipelinesProps> = ({ pipelineData }) => {
  const { t } = useTranslation();
  const [expandedCandidateId, setExpandedCandidateId] = useState<number | null>(null);

  const handleToggleExpand = (id: number) => {
    setExpandedCandidateId(prevId => (prevId === id ? null : id));
  };

  const columns = ['New Applicants', 'Sourced', 'Screening', 'Interview', 'Offer', 'Hired'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('talentPipelines')}</h1>
        <p className="text-slate-400 text-sm mt-1">{t('talentPipelinesDesc')}</p>
      </div>
      <div className="flex space-x-4 overflow-x-auto pb-4">
        {columns.map(columnTitle => (
          <PipelineColumn 
            key={columnTitle}
            title={columnTitle} 
            candidates={pipelineData[columnTitle] || []} 
            expandedCandidateId={expandedCandidateId}
            onToggleExpand={handleToggleExpand}
          />
        ))}
      </div>
    </div>
  );
};

export default TalentPipelines;