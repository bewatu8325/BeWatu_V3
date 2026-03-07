import React, { useState } from 'react';
import { User } from '../../types';
import { useTranslation } from '../hooks/useTranslation';

interface CandidateCardProps {
  candidate: User;
  onClick: () => void;
}

const ExpandedPipelineView: React.FC<{ user: User }> = ({ user }) => {
  const { t } = useTranslation();
  const topSkills = user.skills.slice(0, 3).map(s => s.name).join(', ');

  return (
    <div className="bg-stone-50/70 p-4 rounded-b-lg border border-stone-200 border-t-0 -mt-1 animate-fade-in-up">
      <p className="text-sm text-stone-700 mb-3 line-clamp-3">{user.bio}</p>
      <div className="text-xs space-y-1">
        <p><strong className="text-stone-500 font-semibold">{t('topSkills')}:</strong> <span className="text-[#1a6b52]">{topSkills || 'N/A'}</span></p>
        <p><strong className="text-stone-500 font-semibold">{t('availability')}:</strong> {user.availability}</p>
        <p><strong className="text-stone-500 font-semibold">{t('values')}:</strong> {user.values.join(', ')}</p>
      </div>
    </div>
  );
};

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onClick }) => (
  <button onClick={onClick} className="w-full text-left p-3 bg-white rounded-md border border-stone-200 cursor-pointer hover:bg-stone-100/50 transition-colors">
    <div className="flex items-center space-x-2">
      <img src={candidate.avatarUrl} alt={candidate.name} className="w-8 h-8 rounded-full object-cover" />
      <div>
        <p className="text-sm font-semibold text-stone-800">{candidate.name}</p>
        <p className="text-xs text-stone-500 truncate">{candidate.headline}</p>
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
  <div className="flex-shrink-0 w-72 bg-white rounded-lg border border-stone-200">
    <h3 className="p-3 text-md font-semibold text-stone-900 border-b border-stone-200 flex justify-between items-center">
      {title}
      <span className="text-sm font-normal text-stone-500 bg-stone-100 px-2 rounded-full">{candidates.length}</span>
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
        <h1 className="text-2xl font-bold text-stone-900">{t('talentPipelines')}</h1>
        <p className="text-stone-500 text-sm mt-1">{t('talentPipelinesDesc')}</p>
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
