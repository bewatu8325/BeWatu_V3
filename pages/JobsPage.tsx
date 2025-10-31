import React, { useState, useCallback } from 'react';
// FIX: Import Company type and change generateJobPostings to a named import
import type { Job, Company } from '../types';
import { generateJobPostings } from '../services/geminiService';
import { BriefcaseIcon } from '../components/IconComponents';

// FIX: Added mock company data to resolve errors where components expected a company name.
const mockCompanies: Omit<Company, 'description' | 'logoUrl' | 'website'>[] = [
    { id: 1, name: 'Tech Solutions Inc.', industry: 'Technology' },
    { id: 2, name: 'Creative Designs', industry: 'Design' },
    { id: 3, name: 'Data Systems LLC', industry: 'Data' },
];

// FIX: Rewrote initialJobs to conform to the `Job` type definition.
// This fixes errors related to `id` being a string and missing/incorrect properties.
const initialJobs: Job[] = [
    { id: 101, title: 'Senior Frontend Developer', companyId: 1, location: 'San Francisco, CA', description: 'Join our innovative team to build next-generation web applications using React and TypeScript.', type: 'Full-time', experienceLevel: 'Senior-level', status: 'Active', recruiterId: 2, liveDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), expiryDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 102, title: 'UX/UI Designer', companyId: 2, location: 'New York, NY', description: 'We are looking for a talented designer to create amazing user experiences. Proficiency in Figma and Adobe XD is a must.', type: 'Full-time', experienceLevel: 'Mid-level', status: 'Active', recruiterId: 2, liveDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), expiryDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 103, title: 'Backend Engineer (Node.js)', companyId: 3, location: 'Austin, TX (Remote)', description: 'Work on scalable microservices and APIs that power our data platform. Experience with AWS is a plus.', type: 'Remote', experienceLevel: 'Senior-level', status: 'Active', recruiterId: 3, liveDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), expiryDate: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000).toISOString() },
];

// Helper to format date
const timeAgo = (date: string): string => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
};

const JobCard: React.FC<{ job: Job, onSelect: () => void, isSelected: boolean, companyName: string }> = ({ job, onSelect, isSelected, companyName }) => (
    <div 
        className={`p-4 border-l-4 cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-gray-100 border-blue-600' : 'bg-white border-transparent'}`}
        onClick={onSelect}
    >
        <h3 className="font-semibold text-gray-800">{job.title}</h3>
        {/* FIX: Use companyName prop instead of non-existent job.company */}
        <p className="text-sm text-gray-700">{companyName}</p>
        <p className="text-sm text-gray-500">{job.location}</p>
        {/* FIX: Use liveDate to calculate relative time instead of non-existent job.postedDate */}
        <p className="text-xs text-gray-400 mt-2">{timeAgo(job.liveDate)}</p>
    </div>
);

const JobDetails: React.FC<{ job: Job | null, companyName: string | undefined }> = ({ job, companyName }) => {
    if (!job) {
        return <div className="p-6 text-center text-gray-500">Select a job to see details</div>;
    }

    return (
        <div className="p-6 h-full overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800">{job.title}</h2>
            {/* FIX: Use companyName prop instead of non-existent job.company */}
            <p className="text-lg text-gray-700 font-medium">{companyName} • {job.location}</p>
            {/* FIX: Use liveDate to calculate relative time instead of non-existent job.postedDate */}
            <p className="text-sm text-gray-500 mt-1">{job.type} • Posted {timeAgo(job.liveDate)}</p>
            <button className="mt-4 bg-blue-600 text-white font-bold py-2 px-6 rounded-full hover:bg-blue-700 transition-colors">
                Apply
            </button>
            <div className="border-t my-6"></div>
            <h3 className="text-lg font-semibold mb-2">Job Description</h3>
            <p className="text-gray-700 whitespace-pre-line text-sm">{job.description}</p>
        </div>
    );
};

const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [selectedJob, setSelectedJob] = useState<Job | null>(initialJobs[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('Frontend Engineer');
  const [location, setLocation] = useState('San Francisco');

  const handleGenerateJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const newJobs = await generateJobPostings(searchTerm, location);
      if (newJobs.length > 0) {
        setJobs(newJobs);
        setSelectedJob(newJobs[0]);
      } else {
        // Keep existing jobs if AI returns none, but show a message.
        setError('Could not generate new job listings. Showing existing jobs.');
      }
    } catch (e) {
      setError('An error occurred while fetching jobs.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, location]);

  const selectedJobCompanyName = mockCompanies.find(c => c.id === selectedJob?.companyId)?.name;

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b">
        <div className="flex flex-wrap items-end gap-4">
            <div className="flex-grow">
                <label htmlFor="search-term" className="text-sm font-medium text-gray-700">Job Title / Keyword</label>
                <input 
                    id="search-term"
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="e.g., Software Engineer" 
                    className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
             <div className="flex-grow">
                <label htmlFor="location" className="text-sm font-medium text-gray-700">Location</label>
                <input 
                    id="location"
                    type="text" 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., New York City" 
                    className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <button 
                onClick={handleGenerateJobs}
                disabled={isLoading}
                className="bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center"
            >
                {isLoading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : <BriefcaseIcon className="h-5 w-5 mr-2" />}
                {isLoading ? 'Generating...' : 'Find New Jobs with AI'}
            </button>
        </div>
        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3" style={{height: 'calc(100vh - 250px)'}}>
        <div className="md:col-span-1 border-r overflow-y-auto">
          {jobs.map(job => {
            const company = mockCompanies.find(c => c.id === job.companyId);
            return (
                <JobCard 
                    key={job.id} 
                    job={job} 
                    onSelect={() => setSelectedJob(job)} 
                    isSelected={selectedJob?.id === job.id}
                    companyName={company ? company.name : 'Unknown Company'}
                />
            );
          })}
        </div>
        <div className="md:col-span-2 hidden md:block">
            <JobDetails job={selectedJob} companyName={selectedJobCompanyName} />
        </div>
      </div>
    </div>
  );
};

export default JobsPage;