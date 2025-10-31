import React from 'react';
import { CandidateSearchResult } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

interface ExpandedCandidateViewProps {
  candidateResult: CandidateSearchResult;
  onViewFullProfile: () => void;
}

const ExpandedCandidateView: React.FC<ExpandedCandidateViewProps> = ({ candidateResult, onViewFullProfile }) => {
  const { aiAnalysis } = candidateResult;
  const { t } = useTranslation();

  return (
    <div className="bg-slate-900/70 p-5 rounded-xl border border-slate-700 border-t-0 rounded-t-none -mt-2 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-bold text-green-400 mb-1 text-sm">{t('strengths')}</h4>
          <ul className="list-disc list-inside space-y-1 text-slate-300 text-sm">
            {aiAnalysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div>
          <h4 className="font-bold text-slate-200 mb-1 text-sm">{t('aiSummary')}</h4>
          <p className="text-slate-300 text-sm">{aiAnalysis.matchReasoning}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button 
          onClick={onViewFullProfile}
          className="bg-cyan-500 text-slate-900 font-semibold px-4 py-1.5 rounded-lg hover:bg-cyan-400 transition-colors text-sm"
        >
          {t('viewFullProfile')} &rarr;
        </button>
      </div>
    </div>
  );
};

export default ExpandedCandidateView;