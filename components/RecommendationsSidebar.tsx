import React, { useState, useEffect } from 'react';
import { Job, User, Company } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';
import { followCompany, unfollowCompany, getSuggestedCompanies } from '../lib/firestoreService';

interface RecommendationsSidebarProps {
  jobs: Job[];
  users: User[];
  companies: Company[];
  onViewProfile: (userId: number) => void;
  onViewCompany?: (companyId: number) => void;
  onFollow?: (userId: number) => void;
}

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

const RecommendationsSidebar: React.FC<RecommendationsSidebarProps> = ({
  jobs, users, companies, onViewProfile, onViewCompany, onFollow,
}) => {
  const { currentUser, fbUser } = useFirebase();
  const [followState, setFollowState] = useState<Record<number, 'pending' | 'following'>>({});
  const [suggestedCompanies, setSuggestedCompanies] = useState<any[]>([]);
  const [companyFollowState, setCompanyFollowState] = useState<Record<string, 'loading' | 'following'>>({});

  // Pre-populate following state from user's profile
  useEffect(() => {
    const following: string[] = (currentUser as any)?.followingCompanies ?? [];
    const init: Record<string, 'loading' | 'following'> = {};
    following.forEach(id => { init[id] = 'following'; });
    setCompanyFollowState(init);
  }, [currentUser]);

  useEffect(() => {
    getSuggestedCompanies(4).then(setSuggestedCompanies).catch(() => {});
  }, []);

  const getCompanyName = (companyId: number) =>
    companies.find(c => c.id === companyId)?.name || 'Unknown Company';

  const handleFollow = (userId: number) => {
    setFollowState(prev => ({ ...prev, [userId]: 'pending' }));
    onFollow?.(userId);
  };

  const handleFollowCompany = async (company: any) => {
    if (!fbUser || !company.id) return;
    const alreadyFollowing = companyFollowState[company.id] === 'following';
    setCompanyFollowState(p => ({ ...p, [company.id]: 'loading' }));
    try {
      if (alreadyFollowing) {
        await unfollowCompany(fbUser.uid, company.id);
        setCompanyFollowState(p => { const n = { ...p }; delete n[company.id]; return n; });
      } else {
        await followCompany(fbUser.uid, company.id);
        setCompanyFollowState(p => ({ ...p, [company.id]: 'following' }));
      }
    } catch {
      setCompanyFollowState(p => { const n = { ...p }; delete n[company.id]; return n; });
    }
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
                <p className="text-xs text-stone-500 truncate">{user.headline}</p>
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

      {/* Companies to Follow */}
      {suggestedCompanies.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border shadow-sm" style={{ borderColor: '#e7e5e4' }}>
          <h3 className="font-bold text-md text-stone-800 mb-1 border-b pb-2" style={{ borderColor: '#e7e5e4' }}>
            Companies to follow
          </h3>
          <p className="text-xs text-stone-400 mb-3">Follow to see their skill challenges in your Prove feed</p>
          <div className="space-y-3">
            {suggestedCompanies.map(company => {
              const state = companyFollowState[company.id];
              const following = state === 'following';
              const loading = state === 'loading';
              return (
                <div key={company.id} className="flex items-center gap-3">
                  {/* Logo / initial */}
                  <button
                    onClick={() => onViewCompany?.(company.numericId ?? company.id)}
                    className="shrink-0"
                  >
                    {company.logoUrl ? (
                      <img src={company.logoUrl} alt={company.name} className="w-10 h-10 rounded-xl object-cover border" style={{ borderColor: '#e7e5e4' }} />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black" style={{ background: GREEN }}>
                        {company.name?.[0] ?? 'C'}
                      </div>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <button onClick={() => onViewCompany?.(company.numericId ?? company.id)} className="font-semibold text-sm text-stone-900 hover:underline text-left truncate block w-full">
                      {company.name}
                    </button>
                    <p className="text-xs text-stone-500 truncate">{company.industry}</p>
                  </div>

                  <button
                    onClick={() => handleFollowCompany(company)}
                    disabled={loading}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors border disabled:opacity-50"
                    style={following
                      ? { backgroundColor: GREEN_LT, borderColor: GREEN, color: GREEN }
                      : { borderColor: GREEN, color: GREEN }}
                  >
                    {loading ? '…' : following ? 'Following' : 'Follow'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecommendationsSidebar;
