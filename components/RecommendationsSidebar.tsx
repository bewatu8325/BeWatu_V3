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
  const [followState, setFollowState] = useState<Record<number, 'pending' | 'following'>>({});

  const getCompanyName = (companyId: number) =>
    companies.find(c => c.id === companyId)?.name || 'Unknown Company';

  const handleFollow = (userId: number) => {
    setFollowState(prev => ({ ...prev, [userId]: 'pending' }));
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
                disabled={!!followState[user.id]}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors border"
                style={
                  followState[user.id] === 'pending'
                    ? { backgroundColor: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }
                    : followState[user.id] === 'following'
                    ? { backgroundColor: '#e8f4f0', borderColor: '#1a4a3a', color: '#1a4a3a' }
                    : { borderColor: '#1a4a3a', color: '#1a4a3a' }
                }
              >
                {followState[user.id] === 'pending' ? 'Requested' : followState[user.id] === 'following' ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsSidebar;
