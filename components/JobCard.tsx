import React from 'react';
import { Job, Company } from '../types';
import { SparklesIcon } from '../constants';

interface JobCardProps {
  job: Job;
  company: Company;
  onViewCompany: (companyId: number) => void;
  onAnalyzeMatch: (job: Job, company: Company) => void;
  onApplyForJob: (job: Job) => void;
  appliedJobIds: number[];
}

const JobCard: React.FC<JobCardProps> = ({ job, company, onViewCompany, onAnalyzeMatch, onApplyForJob, appliedJobIds }) => {
  const hasApplied = appliedJobIds.includes(job.id);

  return (
    <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-lg text-cyan-400">{job.title}</h3>
          <button onClick={() => onViewCompany(company.id)} className="text-md text-slate-200 hover:text-cyan-400 hover:underline text-left">
            {company.name}
          </button>
          <p className="text-sm text-slate-400">{job.location} ({job.type})</p>
        </div>
        <div className="flex items-center space-x-2">
            <button 
                onClick={() => onAnalyzeMatch(job, company)}
                title="Analyze Job Match"
                className="bg-slate-700 text-cyan-400 font-semibold p-2 rounded-full border border-cyan-500/50 hover:bg-cyan-900/50 transition-colors text-sm"
            >
                <SparklesIcon className="w-5 h-5"/>
            </button>
            <button 
              onClick={() => !hasApplied && onApplyForJob(job)}
              disabled={hasApplied}
              className={`font-semibold px-4 py-1.5 rounded-full transition-colors text-sm whitespace-nowrap ${
                hasApplied
                    ? 'bg-green-600 text-white cursor-not-allowed'
                    : 'bg-cyan-500 text-slate-900 hover:bg-cyan-400'
              }`}
            >
              {hasApplied ? 'Applied ✓' : 'Apply Now'}
            </button>
        </div>
      </div>
      <p className="text-sm text-slate-300 mt-3">{job.description}</p>
    </div>
  );
};

export default JobCard;