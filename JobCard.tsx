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
    <div className="bg-white p-5 rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300" style={{ borderColor:"#e7e5e4" }}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-lg" style={{ color:"#1a4a3a" }}>{job.title}</h3>
          <button onClick={() => onViewCompany(company.id)} className="text-md text-stone-700 hover:underline text-left">
            {company.name}
          </button>
          <p className="text-sm text-stone-500">{job.location} ({job.type})</p>
        </div>
        <div className="flex items-center space-x-2">
            <button 
                onClick={() => onAnalyzeMatch(job, company)}
                title="Analyze Job Match"
                className="font-semibold p-2 rounded-full border hover:bg-stone-50 transition-colors text-sm" style={{ borderColor:"#1a4a3a", color:"#1a4a3a" }}
            >
                <SparklesIcon className="w-5 h-5"/>
            </button>
            <button 
              onClick={() => !hasApplied && onApplyForJob(job)}
              disabled={hasApplied}
              className={`font-semibold px-4 py-1.5 rounded-full transition-colors text-sm whitespace-nowrap ${hasApplied ? 'bg-green-600 text-white cursor-not-allowed' : 'text-white hover:opacity-90'}`} style={!hasApplied ? { backgroundColor:'#1a4a3a' } : {}}
              }`}
            >
              {hasApplied ? 'Applied ✓' : 'Apply Now'}
            </button>
        </div>
      </div>
      <p className="text-sm text-stone-600 mt-3">{job.description}</p>
    </div>
  );
};

export default JobCard;
