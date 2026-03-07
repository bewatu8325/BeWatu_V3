import React from 'react';
import { Job, User, Company } from '../types';

interface RecommendationsSidebarProps {
  jobs: Job[];
  users: User[];
  companies: Company[];
}

const RecommendationsSidebar: React.FC<RecommendationsSidebarProps> = ({ jobs, users, companies }) => {
  const getCompanyName = (companyId: number) => {
    return companies.find(c => c.id === companyId)?.name || 'Unknown Company';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border shadow-sm" style={{ borderColor: "#e7e5e4" }}>
        <h3 className="font-bold text-md text-stone-800 mb-3 border-b pb-2" style={{ borderColor: "#e7e5e4" }}>Recommended Jobs</h3>
        <div className="space-y-4">
          {jobs.map(job => (
            <div key={job.id}>
              <p className="font-semibold text-sm hover:underline cursor-pointer" style={{ color: "#1a4a3a" }}>{job.title}</p>
              <p className="text-xs text-stone-600">{getCompanyName(job.companyId)}</p>
              <p className="text-xs text-stone-400">{job.location}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white p-4 rounded-2xl border shadow-sm" style={{ borderColor: "#e7e5e4" }}>
        <h3 className="font-bold text-md text-stone-800 mb-3 border-b pb-2" style={{ borderColor: "#e7e5e4" }}>Who to follow</h3>
        <div className="space-y-4">
          {users.map(user => (
            <div key={user.id} className="flex items-center space-x-3">
               <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover"/>
               <div>
                  <p className="font-semibold text-sm text-stone-800">{user.name}</p>
                  <p className="text-xs text-stone-500 truncate">{user.headline}</p>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsSidebar;
