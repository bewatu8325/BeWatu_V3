import React, { useState, useRef, useEffect } from 'react';
import { Job, Company } from '../types';
import { SparklesIcon } from '../constants';

interface JobCardProps {
  job: Job;
  company: Company;
  onViewCompany: (companyId: number) => void;
  onAnalyzeMatch: (job: Job, company: Company) => void;
  onApplyForJob: (job: Job) => void;
  appliedJobIds: number[];
  onReportJob?: (jobId: string, jobTitle: string) => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, company, onViewCompany, onAnalyzeMatch, onApplyForJob, appliedJobIds, onReportJob }) => {
  const hasApplied = appliedJobIds.includes(job.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
            {onReportJob && (
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button onClick={() => setMenuOpen(v => !v)} title="More options"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                {menuOpen && (
                  <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
                    <button
                      onClick={() => { setMenuOpen(false); onReportJob(String(job.id), job.title); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444', fontWeight: 600, fontFamily: 'inherit' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span>🚩</span> Report job
                    </button>
                  </div>
                )}
              </div>
            )}
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
              className={`font-semibold px-4 py-1.5 rounded-full transition-colors text-sm whitespace-nowrap ${hasApplied ? 'bg-green-600 text-white cursor-not-allowed' : 'text-white hover:opacity-90'}`}
              style={!hasApplied ? { backgroundColor: '#1a4a3a' } : {}}
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
