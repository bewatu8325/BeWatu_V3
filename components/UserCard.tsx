import React, { useState } from 'react';
import { User } from '../types';
import { ThumbUpIcon, MessageSquareIcon, SparklesIcon, ShieldCheckIcon, VerifiedIcon } from '../constants';

const G = '#1a4a3a';
const GLT = '#e8f4f0';

interface UserCardProps {
  user: User;
  onEndorseSkill: (userId: number, skillName: string) => void;
  onStartMessage: (userId: number) => void;
  onAnalyzeSynergy: (user: User) => void;
  onViewProfile: (userId: number) => void;
  onConnect?: (userId: number) => Promise<void>;
  isConnected?: boolean;
  isPending?: boolean;
}

const UserCard: React.FC<UserCardProps> = ({
  user,
  onEndorseSkill,
  onStartMessage,
  onAnalyzeSynergy,
  onViewProfile,
  onConnect,
  isConnected = false,
  isPending = false,
}) => {
  const topSkill = user.skills?.[0];
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onConnect || isConnected || isPending || connecting) return;
    try {
      setConnecting(true);
      await onConnect(user.id);
    } finally {
      setConnecting(false);
    }
  };

  const connectLabel = connecting ? 'Sending…' : isConnected ? 'Connected' : isPending ? 'Pending' : 'Connect';

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-stone-200 text-center hover:shadow-md hover:border-stone-300 transition-all duration-200 flex flex-col">
      <button
        onClick={() => onViewProfile(user.id)}
        className="p-6 flex flex-col flex-grow items-center w-full hover:bg-stone-50 transition-colors"
      >
        <img
          src={user.avatarUrl}
          alt={user.name}
          className="rounded-full border-4 border-stone-100 object-cover h-20 w-20 mb-3 shadow-sm"
        />
        <div className="flex items-center justify-center gap-1.5">
          <h3 className="font-bold text-stone-900 text-sm">{user.name}</h3>
          {user.isVerified && (
            <VerifiedIcon className="w-4 h-4 flex-shrink-0" style={{ color: G }} title="Verified Work Email" />
          )}
        </div>
        <div className="flex items-center justify-center gap-1 mt-1" title="Reputation Score" style={{ color: G }}>
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          <span className="text-xs font-bold">{user.reputation}</span>
        </div>
        <p className="text-xs text-stone-400 mt-1.5 h-8 overflow-hidden text-center leading-snug">{user.headline}</p>
        {topSkill && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-stone-500">
            <button
              onClick={e => { e.stopPropagation(); onEndorseSkill(user.id, topSkill.name); }}
              title={`Endorse for ${topSkill.name}`}
              className="p-1 rounded-full hover:bg-stone-100 transition-colors"
            >
              <ThumbUpIcon className="w-4 h-4" style={{ color: G }} />
            </button>
            <span>Top skill: <b className="font-semibold text-stone-700">{topSkill.name}</b> ({topSkill.endorsements})</span>
          </div>
        )}
      </button>

      <div className="px-4 pb-4 flex gap-2">
        {/* Connect button */}
        <button
          onClick={handleConnect}
          disabled={connecting || isConnected || isPending}
          className="flex-1 py-1.5 rounded-full text-xs font-black transition-colors disabled:cursor-default"
          style={
            isConnected
              ? { background: GLT, color: G }
              : isPending
              ? { background: '#f5f5f4', color: '#78716c', border: '1px solid #e7e5e4' }
              : { background: G, color: 'white' }
          }
        >
          {connectLabel}
        </button>

        {/* Message */}
        <button
          onClick={() => onStartMessage(user.id)}
          title={`Message ${user.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition-colors"
        >
          <MessageSquareIcon className="w-4 h-4" />
        </button>

        {/* Synergy */}
        <button
          onClick={() => onAnalyzeSynergy(user)}
          title={`Analyze Synergy with ${user.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors"
          style={{ color: G }}
        >
          <SparklesIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default UserCard;
