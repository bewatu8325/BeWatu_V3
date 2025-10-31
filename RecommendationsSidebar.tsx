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
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
        <h3 className="font-bold text-md text-slate-200 mb-3 border-b border-slate-700 pb-2">Recommended Jobs</h3>
        <div className="space-y-4">
          {jobs.map(job => (
            <div key={job.id}>
              <p className="font-semibold text-sm text-cyan-400 hover:underline cursor-pointer">{job.title}</p>
              <p className="text-xs text-slate-300">{getCompanyName(job.companyId)}</p>
              <p className="text-xs text-slate-500">{job.location}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
        <h3 className="font-bold text-md text-slate-200 mb-3 border-b border-slate-700 pb-2">Who to follow</h3>
        <div className="space-y-4">
          {users.map(user => (
            <div key={user.id} className="flex items-center space-x-3">
               <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover"/>
               <div>
                  <p className="font-semibold text-sm text-slate-200">{user.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user.headline}</p>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsSidebar;