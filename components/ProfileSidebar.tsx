import React, { useRef, useState, useMemo } from 'react';
import { User, ConnectionRequest, Circle, View } from '../types';
import { PlayIcon, CameraIcon, VerifiedIcon, SparklesIcon, ShieldCheckIcon, CoinsIcon, CirclesIcon, BotIcon, UsersIcon } from '../constants';

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

const StatItem: React.FC<{
  icon: React.ReactNode; label: string; value: string | number;
  valueClassName: string; valueStyle?: React.CSSProperties;
}> = ({ icon, label, value, valueClassName, valueStyle }) => (
  <div className="bg-stone-50 p-3 rounded-xl border text-center" style={{ borderColor: '#e7e5e4' }}>
    <div className="flex justify-center items-center mb-1 text-stone-400">{icon}</div>
    <p className={`text-xl font-bold ${valueClassName}`} style={valueStyle}>{value}</p>
    <p className="text-xs text-stone-500">{label}</p>
  </div>
);

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const hasVideo = !!user.microIntroductionUrl;

  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleTap = () => {
    if (!hasVideo) return;
    if (playing) {
      videoRef.current?.pause();
      setPlaying(false);
    } else {
      videoRef.current?.play();
      setPlaying(true);
    }
  };

  return (
    // 9:14 aspect ratio container
    <div
      className="relative w-full overflow-hidden rounded-2xl shadow-md cursor-pointer select-none"
      style={{ aspectRatio: '9/14', backgroundColor: '#1a4a3a' }}
      onClick={handleTap}
    >
      {hasVideo ? (
        /* ── Video mode ── */
        <>
          <video
            ref={videoRef}
            src={user.microIntroductionUrl!}
            className="absolute inset-0 w-full h-full object-cover"
            loop
            playsInline
            onEnded={() => setPlaying(false)}
          />

          {/* Play/pause overlay — only visible when paused */}
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/40">
                <PlayIcon className="w-7 h-7 text-white ml-1" />
              </div>
            </div>
          )}

          {/* Gradient overlay at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-2/5 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
          />

          {/* Name / headline overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
            <p className="font-bold text-white text-lg leading-tight">{user.name}</p>
            <p className="text-white/80 text-sm mt-0.5">{user.headline}</p>
            {user.location && (
              <p className="text-white/60 text-xs mt-0.5 flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                {user.location}
              </p>
            )}
          </div>

          {/* Update clip button */}
          <button
            onClick={e => { e.stopPropagation(); onRecordVideo(); }}
            className="absolute bottom-4 right-4 pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm border border-white/30 hover:bg-white/20 transition-colors"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          >
            <CameraIcon className="w-3.5 h-3.5" />
            Update Vibe Clip
          </button>
        </>
      ) : (
        /* ── No-video mode ── */
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
              className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-md hover:bg-stone-50 transition-colors"
              style={{ color: '#1a4a3a' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 10 4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.91L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              Add Intro Video
            </button>
            <p className="text-white/60 text-xs">30s max, show your vibe</p>
          </div>

          {/* Name / headline always visible at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 p-4"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
          >
            <p className="font-bold text-white text-lg leading-tight">{user.name}</p>
            <p className="text-white/75 text-sm">{user.headline}</p>
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

      {/* ── Stats ── */}
      <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        <div className="grid grid-cols-3 gap-2">
          <StatItem icon={<ShieldCheckIcon className="w-5 h-5" />} label="Reputation" value={user.reputation} valueClassName="text-emerald-600" />
          <StatItem icon={<CoinsIcon className="w-5 h-5" />} label="Credits" value={user.credits} valueClassName="text-amber-500" />
          <StatItem icon={<UsersIcon className="w-5 h-5" />} label="Connections" value={connectionCount} valueClassName="font-bold" valueStyle={{ color: '#1a4a3a' }} />
        </div>
      </div>

      {/* ── AI chat button ── */}
      <button
        onClick={() => onNavigate(View.AIChat)}
        className="w-full font-semibold px-4 py-2.5 rounded-xl transition text-sm flex items-center justify-center text-white hover:opacity-90 shadow-sm"
        style={{ backgroundColor: '#1a4a3a' }}
      >
        <BotIcon className="w-5 h-5 mr-2" />
        Chat with Be
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
