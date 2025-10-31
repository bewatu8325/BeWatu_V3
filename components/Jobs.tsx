import React, { useState, useMemo } from 'react';
import { Job, Company } from '../types';
import JobCard from './JobCard';

interface JobsProps {
  jobs: Job[];
  companies: Company[];
  onViewCompany: (companyId: number) => void;
  onAnalyzeMatch: (job: Job, company: Company) => void;
  onApplyForJob: (job: Job) => void;
  appliedJobIds: number[];
}

const Jobs: React.FC<JobsProps> = ({ jobs, companies, onViewCompany, onAnalyzeMatch, onApplyForJob, appliedJobIds }) => {
  const [filters, setFilters] = useState({
      keyword: '',
      location: '',
      company: '',
      industry: '',
      experienceLevel: ''
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };
  
  const saveFilters = () => {
      localStorage.setItem('jobFilters', JSON.stringify(filters));
      alert('Filters saved!');
  };

  const loadFilters = () => {
    const savedFilters = localStorage.getItem('jobFilters');
    if (savedFilters) {
        setFilters(JSON.parse(savedFilters));
        alert('Saved filters loaded!');
    } else {
        alert('No saved filters found.');
    }
  };

  const clearFilters = () => {
    const clearedFilters = { keyword: '', location: '', company: '', industry: '', experienceLevel: '' };
    setFilters(clearedFilters);
    localStorage.removeItem('jobFilters');
  };

  const industries = useMemo(() => [...new Set(companies.map(c => c.industry))], [companies]);

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
            (filters.experienceLevel ? job.experienceLevel === filters.experienceLevel : true)
    });
  }, [jobs, companies, filters]);
  
  const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400";

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
        <h1 className="text-2xl font-bold text-slate-100 mb-4">Find Your Next Opportunity</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <input type="text" name="keyword" placeholder="Keyword (title, skill)" value={filters.keyword} onChange={handleFilterChange} className={inputStyles} />
          <input type="text" name="location" placeholder="Location" value={filters.location} onChange={handleFilterChange} className={inputStyles} />
          <input type="text" name="company" placeholder="Company" value={filters.company} onChange={handleFilterChange} className={inputStyles} />
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
            <button onClick={loadFilters} className="bg-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-lg hover:bg-slate-600 border border-slate-600 transition-colors">Load Saved</button>
            <button onClick={saveFilters} className="bg-cyan-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-cyan-400 transition-colors">Save Filters</button>
            <button onClick={clearFilters} className="bg-slate-600 text-slate-300 font-semibold px-4 py-2 rounded-lg hover:bg-slate-500 transition-colors">Clear Filters</button>
        </div>
      </div>
      <div className="space-y-4">
        {filteredJobs.length > 0 ? (
            filteredJobs.map((job) => job.company ? <JobCard key={job.id} job={job} company={job.company} onViewCompany={onViewCompany} onAnalyzeMatch={onAnalyzeMatch} onApplyForJob={onApplyForJob} appliedJobIds={appliedJobIds} /> : null)
        ) : (
            <div className="text-center py-10 bg-slate-800/50 rounded-xl border border-slate-700">
                <p className="text-slate-400">No jobs found matching your criteria.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Jobs;