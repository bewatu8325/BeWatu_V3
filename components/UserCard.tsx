import React from 'react';
import { User } from '../types';
import { ThumbUpIcon, MessageSquareIcon, SparklesIcon, ShieldCheckIcon, VerifiedIcon } from '../constants';

interface UserCardProps {
  user: User;
  onEndorseSkill: (userId: number, skillName: string) => void;
  onStartMessage: (userId: number) => void;
  onAnalyzeSynergy: (user: User) => void;
  onViewProfile: (userId: number) => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onEndorseSkill, onStartMessage, onAnalyzeSynergy, onViewProfile }) => {
  const topSkill = user.skills?.[0];

  return (
    <div className="bg-slate-800/50 rounded-xl overflow-hidden border border-slate-700 text-center hover:shadow-xl hover:shadow-cyan-500/10 hover:border-cyan-500/50 transition-all duration-300 flex flex-col transform hover:-translate-y-1">
        <button onClick={() => onViewProfile(user.id)} className="p-6 flex flex-col flex-grow items-center text-left w-full hover:bg-slate-800/40 transition-colors">
            <img
                src={user.avatarUrl}
                alt={user.name}
                className="rounded-full border-4 border-slate-700 object-cover h-20 w-20 mb-2 shadow-lg"
            />
            <div className="flex items-center justify-center space-x-2">
              <h3 className="font-bold text-md text-slate-200 text-center">{user.name}</h3>
              {user.isVerified && <VerifiedIcon className="w-4 h-4 text-cyan-400" title="Verified Work Email" />}
            </div>
            <div className="flex items-center justify-center space-x-2 my-1 text-green-400" title="Reputation Score">
                <ShieldCheckIcon className="w-4 h-4"/>
                <span className="text-xs font-bold">{user.reputation}</span>
            </div>
            <p className="text-xs text-slate-400 h-8 overflow-hidden text-center">{user.headline}</p>
            
            {topSkill && (
                <div className="my-3 text-xs text-slate-400 flex items-center justify-center space-x-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onEndorseSkill(user.id, topSkill.name); }} 
                        title={`Endorse for ${topSkill.name}`} 
                        className="p-1 rounded-full hover:bg-slate-700 transition-colors"
                    >
                        <ThumbUpIcon className="w-4 h-4 text-cyan-400" />
                    </button>
                    <span>Top skill: <b className="font-semibold text-slate-300">{topSkill.name}</b> ({topSkill.endorsements})</span>
                </div>
            )}
        </button>
        <div className="p-4 pt-0 flex space-x-2 w-full">
            <button className="flex-grow bg-cyan-500 text-slate-900 font-semibold px-4 py-1.5 rounded-full hover:bg-cyan-400 transition-colors">
                Connect
            </button>
             <button onClick={() => onStartMessage(user.id)} title={`Message ${user.name}`} className="p-2 bg-slate-700 text-cyan-400 border border-slate-600 rounded-full hover:bg-slate-600 transition-colors">
                <MessageSquareIcon className="w-5 h-5" />
            </button>
            <button onClick={() => onAnalyzeSynergy(user)} title={`Analyze Synergy with ${user.name}`} className="p-2 bg-slate-700 text-cyan-400 border border-slate-600 rounded-full hover:bg-slate-600 transition-colors">
                <SparklesIcon className="w-5 h-5" />
            </button>
        </div>
    </div>
  );
};

export default UserCard;
