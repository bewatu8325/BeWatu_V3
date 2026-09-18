import React from 'react';
import { User } from '../types';
import UserCard from './UserCard';

interface PeopleProps {
  users: User[];
  onEndorseSkill: (userId: number, skillName: string) => void;
  onStartMessage: (userId: number) => void;
  onAnalyzeSynergy: (user: User) => void;
  onViewProfile: (userId: number) => void;
  onConnect?: (userId: number) => Promise<void>;
  connectionRequests?: any[];
  currentUserId?: number;
  /** True while a real-time search request is in flight (see App.tsx). */
  isSearching?: boolean;
}

const People: React.FC<PeopleProps> = ({ users, onEndorseSkill, onStartMessage, onAnalyzeSynergy, onViewProfile, onConnect, connectionRequests = [], currentUserId, isSearching = false }) => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-900">People you may know</h1>
      {isSearching && <p className="text-sm text-stone-600">Searching&hellip;</p>}
      {!isSearching && users.length === 0 && (
        <p className="text-sm text-stone-600">No one matched your search.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map(user => {
          const request = connectionRequests.find(cr =>
            (cr.fromUserId === currentUserId && cr.toUserId === user.id) ||
            (cr.fromUserId === user.id && cr.toUserId === currentUserId)
          );
          return (
            <UserCard
              key={user.id}
              user={user}
              onEndorseSkill={onEndorseSkill}
              onStartMessage={onStartMessage}
              onAnalyzeSynergy={onAnalyzeSynergy}
              onViewProfile={onViewProfile}
              onConnect={onConnect}
              isConnected={request?.status === 'accepted'}
              isPending={request?.status === 'pending'}
            />
          );
        })}
      </div>
    </div>
  );
};

export default People;
