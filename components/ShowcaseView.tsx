import React, { useState, Suspense } from 'react';
import { Trophy, Sword } from 'lucide-react';
import ProveView from './ProveView';
import type { User, Job, Company } from '../types';

const ArenaDiscovery = React.lazy(() => import('./arenas/ArenaDiscovery').then(m => ({ default: m.ArenaDiscovery })));

type Tab = 'prove' | 'arenas';

interface ShowcaseViewProps {
  currentUser: User | null;
  onViewProfile: (userId: string) => void;
  onStartMessage: (userId: string) => void;
  onConnect: (userId: string) => void;
  allJobs: Job[];
  socialGraphUids: Set<string>;
  onSelectArenaIndustry: (slug: string) => void;
  currentUserCompany?: Company | null;
}

export function ShowcaseView({
  currentUser,
  onViewProfile,
  onStartMessage,
  onConnect,
  allJobs,
  socialGraphUids,
  onSelectArenaIndustry,
  currentUserCompany,
}: ShowcaseViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('prove');

  const GREEN = '#1a4a3a';

  return (
    <div className="flex flex-col h-full">
      {/* Tab Navigation */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-1 py-2">
            <button
              onClick={() => setActiveTab('prove')}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all"
              style={{
                background: activeTab === 'prove' ? '#e8f4f0' : 'transparent',
                color: activeTab === 'prove' ? GREEN : '#78716c',
              }}
            >
              <Trophy className="w-4 h-4" />
              <span>Prove</span>
            </button>
            <button
              onClick={() => setActiveTab('arenas')}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all"
              style={{
                background: activeTab === 'arenas' ? '#e8f4f0' : 'transparent',
                color: activeTab === 'arenas' ? GREEN : '#78716c',
              }}
            >
              <Sword className="w-4 h-4" />
              <span>Arenas</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'prove' ? (
          <ProveView
            currentUser={currentUser}
            onViewProfile={onViewProfile}
            onStartMessage={onStartMessage}
            onConnect={onConnect}
            allJobs={allJobs}
            socialGraphUids={socialGraphUids}
          />
        ) : (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-stone-300 border-t-stone-600 rounded-full" /></div>}>
            <ArenaDiscovery
              onSelectIndustry={onSelectArenaIndustry}
              onPostChallenge={() => {}}
              currentUserCompany={currentUserCompany}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
