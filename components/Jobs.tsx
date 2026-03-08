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
  onReportJob?: (jobId: string, jobTitle: string) => void;
}

const Jobs: React.FC<JobsProps> = ({ jobs, companies, onViewCompany, onAnalyzeMatch, onApplyForJob, appliedJobIds, onReportJob }) => {
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
  
  const inputStyles = "w-full p-2 bg-white text-stone-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400";

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border shadow-sm" style={{ borderColor:"#e7e5e4" }}>
        <h1 className="text-2xl font-bold text-stone-900 mb-4">Find Your Next Opportunity</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
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
            <button onClick={loadFilters} className="bg-stone-100 text-stone-700 font-semibold px-4 py-2 rounded-xl hover:bg-stone-200 border border-stone-200 transition-colors">Load Saved</button>
            <button onClick={saveFilters} className="text-white font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition" style={{ backgroundColor:"#1a4a3a" }}>Save Filters</button>
            <button onClick={clearFilters} className="bg-stone-200 text-stone-600 font-semibold px-4 py-2 rounded-xl hover:bg-stone-300 transition-colors">Clear Filters</button>
        </div>
      </div>
      <div className="space-y-4">
        {filteredJobs.length > 0 ? (
            filteredJobs.map((job) => job.company ? <JobCard key={job.id} job={job} company={job.company} onViewCompany={onViewCompany} onAnalyzeMatch={onAnalyzeMatch} onApplyForJob={onApplyForJob} appliedJobIds={appliedJobIds} onReportJob={onReportJob} /> : null)
        ) : (
            <div className="text-center py-10 bg-stone-50 rounded-2xl border" style={{ borderColor:"#e7e5e4" }}>
                <p className="text-stone-400">No jobs found matching your criteria.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Jobs;
