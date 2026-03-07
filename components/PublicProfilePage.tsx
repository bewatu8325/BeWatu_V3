import React, { useState } from 'react';
import { User, Experience } from '../types';
import ExperienceSection from './ExperienceSection';

const GREEN = '#1a4a3a';
const GREEN_MID = '#1a6b52';
const GREEN_LT = '#e8f4f0';

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconArrowLeft = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);
const IconVerified = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: GREEN_MID }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
  </svg>
);
const IconMapPin = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconPlay = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
);
const IconUserPlus = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
  </svg>
);
const IconUserCheck = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>
  </svg>
);
const IconBell = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IconHexagon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
  </svg>
);
const IconShield = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

// ── Vibe clip tile ─────────────────────────────────────────────────────────────
const VibeClipTile: React.FC<{ user: User; onPlay: (url: string) => void }> = ({ user, onPlay }) => {
  const hasVideo = !!user.microIntroductionUrl;
  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-lg cursor-pointer select-none flex-shrink-0"
      style={{ aspectRatio: '9/14', width: 140, backgroundColor: GREEN }}
      onClick={() => hasVideo && onPlay(user.microIntroductionUrl!)}
    >
      {/* Background: thumbnail > avatar > initials */}
      {user.microIntroductionThumbnail ? (
        <img src={user.microIntroductionThumbnail} alt={user.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white text-3xl font-black">
          {user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
        </div>
      )}
      {/* gradient overlay */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)' }} />
      {/* play button */}
      {hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30 transition-colors">
            <IconPlay />
          </div>
        </div>
      )}
      {/* name / headline */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="font-bold text-white text-sm leading-tight truncate">{user.name}</p>
        <p className="text-white/70 text-xs leading-tight truncate mt-0.5">{user.headline}</p>
      </div>
      {/* vibe label */}
      {hasVideo && (
        <div className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white bg-black/40 backdrop-blur-sm">
          Vibe Clip
        </div>
      )}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
interface PublicProfilePageProps {
  user: User;
  isConnected: boolean;
  isFollowing: boolean;
  onBack: () => void;
  onConnect: (userId: number) => void;
  onFollow: (userId: number) => void;
  onMessage: (userId: number) => void;
  onPlayVideo: (url: string) => void;
}

const PublicProfilePage: React.FC<PublicProfilePageProps> = ({
  user, isConnected, isFollowing, onBack, onConnect, onFollow, onMessage, onPlayVideo,
}) => {
  const [connectionSent, setConnectionSent] = useState(isConnected);
  const [followState, setFollowState] = useState<'none' | 'pending' | 'following'>(isFollowing ? 'following' : 'none');

  const privacy = { allowConnectionRequests: true, allowFollow: true, ...user.privacySettings };

  const handleConnect = () => { setConnectionSent(true); onConnect(user.id); };
  const handleFollow = () => { setFollowState('pending'); onFollow(user.id); };

  const topSkills = user.verifiedSkills?.slice(0, 8) ?? user.skills?.slice(0, 8) ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10">
      {/* Back */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: GREEN }}>
          <IconArrowLeft /> Back
        </button>
      </div>

      {/* Hero card */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
        {/* Cover strip */}
        <div className="h-20 sm:h-28" style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #2d7a5e 100%)` }} />

        <div className="px-5 pb-5">
          <div className="flex items-end gap-4 -mt-12 sm:-mt-14 mb-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-white object-cover shadow-lg"
                onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1a4a3a&color=fff&size=96`; }}
              />
              {user.isVerified && (
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow">
                  <IconVerified />
                </div>
              )}
            </div>

            {/* Vibe clip on the right */}
            <div className="flex-1" />
            <VibeClipTile user={user} onPlay={onPlayVideo} />
          </div>

          {/* Name + headline */}
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-stone-900">{user.name}</h1>
              {user.isVerified && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: GREEN_LT, color: GREEN }}>Verified</span>}
            </div>
            <p className="text-stone-500 text-sm mt-0.5">{user.headline}</p>
            {(user as any).location && (
              <p className="flex items-center gap-1 text-xs text-stone-400 mt-1">
                <IconMapPin />{(user as any).location}
              </p>
            )}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-2">
            {privacy.allowConnectionRequests && (
              <button
                onClick={handleConnect}
                disabled={connectionSent}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-all disabled:opacity-70"
                style={{ backgroundColor: connectionSent ? '#78716c' : GREEN }}
              >
                {connectionSent ? <><IconUserCheck /> Connected</> : <><IconUserPlus /> Connect</>}
              </button>
            )}
            {privacy.allowFollow && (
              <button
                onClick={handleFollow}
                disabled={followState !== 'none'}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all border"
                style={followState === 'none'
                  ? { backgroundColor: 'white', borderColor: '#e7e5e4', color: '#1c1917' }
                  : followState === 'pending'
                  ? { backgroundColor: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }
                  : { backgroundColor: GREEN_LT, borderColor: GREEN, color: GREEN }
                }
              >
                <IconBell />
                {followState === 'none' ? 'Follow' : followState === 'pending' ? 'Request sent' : 'Following'}
              </button>
            )}
            <button
              onClick={() => onMessage(user.id)}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border transition-all hover:bg-stone-50"
              style={{ borderColor: '#e7e5e4', color: '#1c1917' }}
            >
              Message
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      {user.bio && (
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
          <h2 className="font-bold text-stone-900 mb-2">About</h2>
          <p className="text-sm text-stone-600 leading-relaxed">{user.bio}</p>
        </div>
      )}

      {/* Skills */}
      {topSkills.length > 0 && (
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
          <div className="flex items-center gap-2 mb-3">
            <IconHexagon />
            <h2 className="font-bold text-stone-900">Top Skills</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {topSkills.map((s: any) => {
              const name = typeof s === 'string' ? s : s.name;
              const endorsements = typeof s === 'object' ? s.endorsements ?? 0 : 0;
              return (
                <span
                  key={name}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border"
                  style={{ backgroundColor: GREEN_LT, borderColor: `${GREEN}22`, color: GREEN }}
                >
                  <IconShield />
                  {name}
                  {endorsements > 0 && <span className="opacity-60 font-normal">·{endorsements}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Experience */}
      {(user.experiences ?? []).length > 0 && (
        <ExperienceSection
          experiences={user.experiences ?? []}
          isOwn={false}
          onSave={() => {}}
        />
      )}

      {/* Values */}
      {user.values && user.values.length > 0 && (
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
          <h2 className="font-bold text-stone-900 mb-3">Values</h2>
          <div className="flex flex-wrap gap-2">
            {user.values.map(v => (
              <span key={v} className="rounded-full px-3 py-1 text-xs font-medium bg-stone-100 text-stone-700">{v}</span>
            ))}
          </div>
        </div>
      )}

      {/* Availability */}
      {user.availability && (
        <div className="bg-white rounded-2xl border p-5 flex items-center gap-3" style={{ borderColor: '#e7e5e4' }}>
          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: user.availability === 'Immediate' ? '#22c55e' : '#f59e0b' }} />
          <div>
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">Availability</p>
            <p className="font-semibold text-stone-900 text-sm">{user.availability}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicProfilePage;
