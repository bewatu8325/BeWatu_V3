import React, { useRef, useState, useMemo } from 'react';
import { User, ConnectionRequest, Circle, View } from '../types';
import { PlayIcon, CameraIcon, VerifiedIcon, SparklesIcon, CirclesIcon, UsersIcon } from '../constants';

interface ProfileSidebarProps {
  user: User;
  connectionRequests: ConnectionRequest[];
  circles: Circle[];
  onGenerateSkills: () => void;
  onRecordVideo: () => void;
  onPlayVideo: (url: string) => void;
  onNavigate: (view: View) => void;
  onSelectCircle: (circleId: number) => void;
}

const proficiencyWidth = {
  'Beginner': 'w-1/4',
  'Intermediate': 'w-2/4',
  'Proficient': 'w-3/4',
  'Expert': 'w-4/4',
};

const getCircleColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 50%, 40%)`;
};

// ─── Vibe Clip tile ───────────────────────────────────────────────────────────
const VibeClipTile: React.FC<{
  user: User;
  onRecordVideo: () => void;
  onPlayVideo: (url: string) => void;
  onNavigate: (view: View) => void;
}> = ({ user, onRecordVideo, onPlayVideo, onNavigate }) => {
  const hasVideo = !!user.microIntroductionUrl;

  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Always open modal on tap for full audio experience
  const handleTap = () => {
    if (!hasVideo) return;
    onPlayVideo(user.microIntroductionUrl!);
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl shadow-md cursor-pointer select-none"
      style={{ aspectRatio: '9/14', backgroundColor: '#1a4a3a' }}
      onClick={handleTap}
    >
      {hasVideo ? (
        <>
          {/* Thumbnail — static image preview, no inline video playback */}
          {user.microIntroductionThumbnail ? (
            <img
              src={user.microIntroductionThumbnail}
              alt={user.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(160deg, #4db89a 0%, #1a6b52 45%, #1a4a3a 100%)',
              }}
            />
          )}

          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-stone-900/25">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/40">
              <PlayIcon className="w-7 h-7 text-white ml-1" />
            </div>
          </div>

          {/* Gradient overlay at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-2/5 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
          />

          {/* Name / headline overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pr-5 pointer-events-none">
            <p className="font-bold text-white text-lg leading-tight truncate">{user.name}</p>
            <p className="text-white/80 text-sm mt-0.5 truncate">{user.headline}</p>
            {(user as any).location && (
              <p className="text-white/60 text-xs mt-0.5 flex items-center gap-1 truncate">
                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                {(user as any).location}
              </p>
            )}
          </div>

          {/* Update clip button */}
          <button
            onClick={e => { e.stopPropagation(); onRecordVideo(); }}
            className="absolute top-3 right-3 pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm border border-white/30 hover:bg-white/20 transition-colors"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <CameraIcon className="w-3.5 h-3.5" />
            Update Vibe Clip
          </button>
        </>
      ) : (
        <>
          {/* Gradient bg */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(160deg, #4db89a 0%, #1a6b52 45%, #1a4a3a 100%)',
            }}
          />

          {/* Avatar circle */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-black text-white shadow-lg ring-4 ring-white/20"
              style={{ backgroundColor: '#1a4a3a' }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-24 w-24 rounded-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : initials}
            </div>

            {/* CTA button */}
            <button
              onClick={e => { e.stopPropagation(); onRecordVideo(); }}
              className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-lg hover:bg-stone-50 transition-all animate-pulse"
              style={{ color: '#1a4a3a', animationDuration: '2.5s' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 10 4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.91L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              Add Intro Video
            </button>
            <p className="text-white/80 text-xs font-medium">Tap to record your 30s vibe</p>
          </div>

          {/* Name / headline always visible at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 p-4"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
          >
            <p className="font-bold text-white text-lg leading-tight truncate">{user.name}</p>
            <p className="text-white/75 text-sm truncate">{user.headline}</p>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main sidebar ─────────────────────────────────────────────────────────────
const ProfileSidebar: React.FC<ProfileSidebarProps> = ({
  user, connectionRequests, circles,
  onGenerateSkills, onRecordVideo, onPlayVideo, onNavigate, onSelectCircle,
}) => {
  const connectionCount = useMemo(() =>
    connectionRequests.filter(
      cr => (cr.fromUserId === user.id || cr.toUserId === user.id) && cr.status === 'accepted'
    ).length,
  [user.id, connectionRequests]);

  const userCircles = useMemo(() =>
    circles.filter(c => c.members.includes(user.id)),
  [user.id, circles]);

  return (
    <div className="space-y-6">

      {/* ── Vibe Clip tile ── */}
      <VibeClipTile
        user={user}
        onRecordVideo={onRecordVideo}
        onPlayVideo={onPlayVideo}
        onNavigate={onNavigate}
      />

      {/* ── Profile strength ── */}
      {(() => {
        const checks = [
          { label: 'Profile photo',       done: !!user.avatarUrl },
          { label: 'Headline',            done: !!user.headline },
          { label: 'About section',       done: !!user.bio },
          { label: 'Industry',            done: !!user.industry },
          { label: 'Skills (3+)',         done: (user.skills?.length ?? 0) >= 3 },
          { label: 'Goals',               done: (user.professionalGoals?.length ?? 0) > 0 },
          { label: 'Intro video',         done: !!user.microIntroductionUrl },
          { label: 'Verified skills',     done: !!(user.verifiedSkills?.length) },
        ];
        const score   = Math.round((checks.filter(c => c.done).length / checks.length) * 100);
        const missing = checks.filter(c => !c.done).map(c => c.label);
        const color   = score >= 80 ? '#1a6b52' : score >= 50 ? '#d97706' : '#dc2626';
        const label   = score >= 80 ? 'Strong' : score >= 50 ? 'Good' : 'Getting started';
        return (
          <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor: '#e7e5e4' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-stone-700">Profile strength</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${color}15`, color }}>
                {label}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden mb-3">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${score}%`, backgroundColor: color }} />
            </div>
            <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
              <span>{score}% complete</span>
              <button onClick={() => onNavigate(View.Connections)}
                className="flex items-center gap-1 font-semibold transition-colors hover:opacity-80"
                style={{ color: '#1a4a3a' }}>
                <UsersIcon className="w-3.5 h-3.5" />
                {connectionCount} circle{connectionCount !== 1 ? 's' : ''}
              </button>
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-stone-400 leading-relaxed">
                Add: {missing.slice(0, 2).join(' · ')}
                {missing.length > 2 && ` +${missing.length - 2} more`}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Lens — Career Intelligence ── */}
      <button
        onClick={() => onNavigate(View.AIChat)}
        className="w-full font-semibold px-4 py-2.5 rounded-xl transition text-sm flex items-center justify-center border hover:opacity-90 shadow-sm"
        style={{ backgroundColor: '#e8f4f0', color: '#1a4a3a', borderColor: '#1a6b52' }}
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          <path d="M11 8v6M8 11h6"/>
        </svg>
        Lens — Career Intelligence
      </button>

      {/* ── Skills ── */}
      <div className="bg-white rounded-2xl border p-6 shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        {user.verifiedSkills && user.verifiedSkills.length > 0 ? (
          <div>
            <h3 className="font-semibold text-stone-800 text-md mb-3 text-center flex items-center justify-center">
              <VerifiedIcon className="w-5 h-5 mr-2" style={{ color: '#1a4a3a' }} />
              Verified Skills
            </h3>
            <div className="space-y-3">
              {user.verifiedSkills.slice(0, 3).map(skill => (
                <div key={skill.name} className="group relative">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-medium text-stone-700">{skill.name}</p>
                    <p className="text-xs text-stone-400">{skill.proficiency}</p>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${proficiencyWidth[skill.proficiency]}`} style={{ backgroundColor: '#1a4a3a' }} />
                  </div>
                  <div className="absolute left-0 bottom-6 w-full p-2 text-xs bg-white border rounded-lg text-stone-700 shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <span className="font-bold">Evidence:</span> {skill.evidence}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="font-semibold text-stone-800 text-md mb-2">Top Skills</h3>
            <div className="flex flex-wrap gap-2 justify-center">
              {user.skills?.slice(0, 3).map(skill => (
                <div key={skill.name} className="flex items-center text-sm rounded-full px-3 py-1 font-medium border"
                  style={{ backgroundColor: '#e8f4f0', color: '#1a4a3a', borderColor: '#1a6b52' }}>
                  {skill.name}
                  <span className="ml-1.5 font-semibold" style={{ color: '#1a4a3a' }}>{skill.endorsements}</span>
                </div>
              ))}
            </div>
            <button onClick={onGenerateSkills}
              className="mt-4 w-full font-semibold px-4 py-2 rounded-xl text-sm flex items-center justify-center border transition hover:opacity-80"
              style={{ backgroundColor: '#e8f4f0', color: '#1a4a3a', borderColor: '#1a6b52' }}>
              <SparklesIcon className="w-4 h-4 mr-2" />
              Generate Verified Skills
            </button>
          </div>
        )}
      </div>

      {/* ── Circles ── */}
      {userCircles.length > 0 && (
        <div className="bg-white rounded-2xl border p-6 shadow-sm" style={{ borderColor: '#e7e5e4' }}>
          <h3 className="font-semibold text-stone-800 text-md mb-4 flex items-center justify-center">
            <CirclesIcon className="w-5 h-5 mr-2 text-stone-500" />
            My Circles
          </h3>
          <div className="flex flex-wrap gap-3 justify-center">
            {userCircles.slice(0, 5).map(circle => (
              <button key={circle.id} onClick={() => onSelectCircle(circle.id)} title={circle.name}
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-md text-white transition-transform hover:scale-110 focus:outline-none"
                style={{ backgroundColor: getCircleColor(circle.name) }}>
                {circle.name.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSidebar;
