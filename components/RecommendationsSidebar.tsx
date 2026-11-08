import React, { useState, useEffect } from 'react';
import { Job, User, Company } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';
import OrganizationsToDiscover from './OrganizationsToDiscover';

interface RecommendationsSidebarProps {
  jobs: Job[];
  users: User[];
  companies: Company[];
  onViewProfile: (userId: number) => void;
  onViewCompany?: (companyId: number | string) => void;
  onFollow?: (userId: number) => void;
  /** Opens the Organizations discovery page. */
  onExploreOrganizations?: () => void;
}

const GREEN    = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

const RecommendationsSidebar: React.FC<RecommendationsSidebarProps> = ({
  jobs, users, companies, onViewProfile, onViewCompany, onFollow, onExploreOrganizations,
}) => {
  const { currentUser, fbUser } = useFirebase();
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
              <p className="font-semibold text-sm hover:underline cursor-pointer" style={{ color: GREEN }}>
                {job.title}
              </p>
              <p className="text-xs text-stone-600">{getCompanyName(job.companyId)}</p>
              <p className="text-xs text-stone-600">{job.location}</p>
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
              <button onClick={() => onViewProfile(user.id)} className="shrink-0">
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-10 h-10 rounded-full object-cover hover:ring-2 transition-all"
                  style={{ '--tw-ring-color': GREEN } as React.CSSProperties}
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1a4a3a&color=fff`;
                  }}
                />
              </button>
              <div className="flex-1 min-w-0">
                <button onClick={() => onViewProfile(user.id)} className="font-semibold text-sm text-stone-900 hover:underline text-left truncate block w-full">
                  {user.name}
                </button>
                <p className="text-xs text-stone-600 truncate">{user.headline}</p>
              </div>
              <button
                onClick={() => handleFollow(user.id)}
                disabled={!!followState[user.id]}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors border"
                style={
                  followState[user.id] === 'pending'
                    ? { backgroundColor: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }
                    : followState[user.id] === 'following'
                    ? { backgroundColor: GREEN_LT, borderColor: GREEN, color: GREEN }
                    : { borderColor: GREEN, color: GREEN }
                }
              >
                {followState[user.id] === 'pending' ? 'Requested' : followState[user.id] === 'following' ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Organizations to discover: follows are saved on the account and shared with every other list (lib/orgFollow.ts) */}
      <OrganizationsToDiscover
        uid={fbUser?.uid}
        accountFollows={(currentUser as any)?.followingCompanies}
        onViewCompany={onViewCompany}
        onExplore={() => onExploreOrganizations?.()}
      />
    </div>
  );
};

export default RecommendationsSidebar;
