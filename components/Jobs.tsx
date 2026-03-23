import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Job, Company } from '../types';
import JobCard from './JobCard';
import { fetchCompanies } from '../lib/firestoreService';

interface JobsProps {
  jobs: Job[];
  companies: Company[];
  onViewCompany: (companyId: number) => void;
  onAnalyzeMatch: (job: Job, company: Company) => void;
  onApplyForJob: (job: Job) => void;
  appliedJobIds: number[];
  onReportJob?: (jobId: string, jobTitle: string) => void;
}

// ─── Company autocomplete input ───────────────────────────────────────────────
function CompanyAutocomplete({
  value,
  onChange,
  allCompanies,
}: {
  value: string;
  onChange: (val: string) => void;
  allCompanies: (Company & { domain?: string })[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!value.trim() || value.length < 2) return [];
    return allCompanies
      .filter(c => c.name.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 8);
  }, [value, allCompanies]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="Company"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full p-2 bg-white text-stone-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(company => (
            <button
              key={company._firestoreId ?? company.id}
              onClick={() => { onChange(company.name); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left"
            >
              {/* Logo or initial */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden"
                style={{ backgroundColor: '#1a4a3a' }}
              >
                {company.logoUrl
                  ? <img src={company.logoUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : company.name[0]
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-800 truncate">{company.name}</p>
                {company.industry && <p className="text-xs text-stone-400 truncate">{company.industry}</p>}
              </div>
              {(company as any).ticker && (
                <span className="text-xs text-stone-400 font-mono shrink-0">{(company as any).ticker}</span>
              )}
            </button>
          ))}
          {/* Allow free text if no exact match */}
          {!suggestions.some(c => c.name.toLowerCase() === value.toLowerCase()) && value.trim() && (
            <button
              onClick={() => setOpen(false)}
              className="w-full px-3 py-2 text-xs text-stone-400 hover:bg-stone-50 text-left border-t border-stone-100"
            >
              Search for "{value}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Jobs component ──────────────────────────────────────────────────────
const Jobs: React.FC<JobsProps> = ({ jobs, companies, onViewCompany, onAnalyzeMatch, onApplyForJob, appliedJobIds, onReportJob }) => {
  const [filters, setFilters] = useState({
    keyword: '',
    location: '',
    company: '',
    industry: '',
    experienceLevel: '',
  });

  // All companies from Firestore for autocomplete (includes seeded ones)
  const [allCompanies, setAllCompanies] = useState<Company[]>(companies);

  useEffect(() => {
    fetchCompanies(false).then(setAllCompanies).catch(() => {});
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const saveFilters = () => {
    localStorage.setItem('jobFilters', JSON.stringify(filters));
    alert('Filters saved!');
  };

  const loadFilters = () => {
    const saved = localStorage.getItem('jobFilters');
    if (saved) { setFilters(JSON.parse(saved)); alert('Saved filters loaded!'); }
    else alert('No saved filters found.');
  };

  const clearFilters = () => {
    setFilters({ keyword: '', location: '', company: '', industry: '', experienceLevel: '' });
    localStorage.removeItem('jobFilters');
  };

  const industries = useMemo(() => [...new Set(allCompanies.map(c => c.industry).filter(Boolean))], [allCompanies]);

  const filteredJobs = useMemo(() => {
    const jobsWithCompanyData = jobs.map(job => {
      const company = companies.find(c => c.id === job.companyId);
      return { ...job, company };
    });
    const now = new Date();
    return jobsWithCompanyData.filter(job => {
      const liveDate = new Date(job.liveDate);
      const expiryDate = new Date(job.expiryDate);
      return job.company &&
        job.status === 'Active' &&
        now >= liveDate &&
        now < expiryDate &&
        (filters.keyword ? (job.title.toLowerCase().includes(filters.keyword.toLowerCase()) || job.description.toLowerCase().includes(filters.keyword.toLowerCase())) : true) &&
        (filters.location ? job.location.toLowerCase().includes(filters.location.toLowerCase()) : true) &&
        (filters.company ? job.company.name.toLowerCase().includes(filters.company.toLowerCase()) : true) &&
        (filters.industry ? job.company.industry === filters.industry : true) &&
        (filters.experienceLevel ? job.experienceLevel === filters.experienceLevel : true);
    });
  }, [jobs, companies, filters]);

  const inputStyles = 'w-full p-2 bg-white text-stone-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400';

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        <h1 className="text-2xl font-bold text-stone-900 mb-4">Find Your Next Opportunity</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
          <input type="text" name="keyword" placeholder="Keyword (title, skill)" value={filters.keyword} onChange={handleFilterChange} className={inputStyles} />
          <input type="text" name="location" placeholder="Location" value={filters.location} onChange={handleFilterChange} className={inputStyles} />
          {/* Company autocomplete */}
          <CompanyAutocomplete
            value={filters.company}
            onChange={val => setFilters(f => ({ ...f, company: val }))}
            allCompanies={allCompanies as any}
          />
          <select name="industry" value={filters.industry} onChange={handleFilterChange} className={inputStyles}>
            <option value="">All Industries</option>
            {industries.map(industry => <option key={industry} value={industry}>{industry}</option>)}
          </select>
          <select name="experienceLevel" value={filters.experienceLevel} onChange={handleFilterChange} className={inputStyles}>
            <option value="">All Experience Levels</option>
            <option value="Entry-level">Entry-level</option>
            <option value="Mid-level">Mid-level</option>
            <option value="Senior-level">Senior-level</option>
          </select>
        </div>
        <div className="flex justify-end space-x-2">
          <button onClick={loadFilters} className="bg-stone-100 text-stone-700 font-semibold px-4 py-2 rounded-xl hover:bg-stone-200 border border-stone-200 transition-colors">Load Saved</button>
          <button onClick={saveFilters} className="text-white font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition" style={{ backgroundColor: '#1a4a3a' }}>Save Filters</button>
          <button onClick={clearFilters} className="bg-stone-200 text-stone-600 font-semibold px-4 py-2 rounded-xl hover:bg-stone-300 transition-colors">Clear Filters</button>
        </div>
      </div>
      <div className="space-y-4">
        {filteredJobs.length > 0 ? (
          filteredJobs.map(job => job.company
            ? <JobCard key={job.id} job={job} company={job.company} onViewCompany={onViewCompany} onAnalyzeMatch={onAnalyzeMatch} onApplyForJob={onApplyForJob} appliedJobIds={appliedJobIds} onReportJob={onReportJob} />
            : null)
        ) : (
          <div className="text-center py-10 bg-stone-50 rounded-2xl border" style={{ borderColor: '#e7e5e4' }}>
            <p className="text-stone-400">No jobs found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Jobs;
