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
}

const People: React.FC<PeopleProps> = ({ users, onEndorseSkill, onStartMessage, onAnalyzeSynergy, onViewProfile, onConnect, connectionRequests = [], currentUserId }) => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">People you may know</h1>
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
