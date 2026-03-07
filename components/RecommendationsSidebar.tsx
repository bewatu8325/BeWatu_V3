import React, { useState } from 'react';
import { Job, User, Company } from '../types';

interface RecommendationsSidebarProps {
  jobs: Job[];
  users: User[];
  companies: Company[];
  onViewProfile: (userId: number) => void;
  onFollow?: (userId: number) => void;
}

const RecommendationsSidebar: React.FC<RecommendationsSidebarProps> = ({
  jobs, users, companies, onViewProfile, onFollow,
}) => {
  const [followed, setFollowed] = useState<Set<number>>(new Set());

  const getCompanyName = (companyId: number) =>
    companies.find(c => c.id === companyId)?.name || 'Unknown Company';

  const handleFollow = (userId: number) => {
    setFollowed(prev => new Set(prev).add(userId));
    onFollow?.(userId);
  };

  return (
    <div className="space-y-6">
      {/* Recommended Jobs */}
      <div className="bg-white p-4 rounded-2xl border shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        <h3 className="font-bold text-md text-stone-800 mb-3 border-b pb-2" style={{ borderColor: '#e7e5e4' }}>
          Recommended Jobs
        </h3>
        <div className="space-y-4">
          {jobs.map(job => (
            <div key={job.id}>
              <p className="font-semibold text-sm hover:underline cursor-pointer" style={{ color: '#1a4a3a' }}>
                {job.title}
              </p>
              <p className="text-xs text-stone-600">{getCompanyName(job.companyId)}</p>
              <p className="text-xs text-stone-400">{job.location}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Who to Follow */}
      <div className="bg-white p-4 rounded-2xl border shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        <h3 className="font-bold text-md text-stone-800 mb-3 border-b pb-2" style={{ borderColor: '#e7e5e4' }}>
          Who to follow
        </h3>
        <div className="space-y-4">
          {users.map(user => (
            <div key={user.id} className="flex items-center gap-3">
              {/* Clickable avatar */}
              <button onClick={() => onViewProfile(user.id)} className="shrink-0">
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-10 h-10 rounded-full object-cover hover:ring-2 transition-all"
                  style={{ '--tw-ring-color': '#1a4a3a' } as React.CSSProperties}
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1a4a3a&color=fff`;
                  }}
                />
              </button>

              {/* Clickable name + headline */}
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onViewProfile(user.id)}
                  className="font-semibold text-sm text-stone-900 hover:underline text-left truncate block w-full"
                >
                  {user.name}
                </button>
                <p className="text-xs text-stone-500 truncate">{user.headline}</p>
              </div>

              {/* Follow button */}
              <button
                onClick={() => handleFollow(user.id)}
                disabled={followed.has(user.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  followed.has(user.id)
                    ? 'bg-stone-100 text-stone-400 cursor-default'
                    : 'border hover:bg-[#e8f4f0]'
                }`}
                style={followed.has(user.id) ? {} : { borderColor: '#1a4a3a', color: '#1a4a3a' }}
              >
                {followed.has(user.id) ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsSidebar;
