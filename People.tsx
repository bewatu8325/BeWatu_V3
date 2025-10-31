import React from 'react';
import { User } from '../types';
import UserCard from './UserCard';

interface PeopleProps {
  users: User[];
  onEndorseSkill: (userId: number, skillName:string) => void;
  onStartMessage: (userId: number) => void;
  onAnalyzeSynergy: (user: User) => void;
  onViewProfile: (userId: number) => void;
}

const People: React.FC<PeopleProps> = ({ users, onEndorseSkill, onStartMessage, onAnalyzeSynergy, onViewProfile }) => {
  return (
     <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-100">People you may know</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {users.map(user => (
                <UserCard key={user.id} user={user} onEndorseSkill={onEndorseSkill} onStartMessage={onStartMessage} onAnalyzeSynergy={onAnalyzeSynergy} onViewProfile={onViewProfile} />
            ))}
        </div>
    </div>
  );
};

export default People;
