import React, { useMemo } from 'react';
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

const StatItem: React.FC<{ icon: React.ReactNode; label: string; value: string | number; valueClassName: string; valueStyle?: React.CSSProperties }> = ({ icon, label, value, valueClassName, valueStyle }) => (
    <div className="bg-stone-50 p-3 rounded-xl border text-center" style={{ borderColor: "#e7e5e4" }}>
        <div className="flex justify-center items-center mb-1 text-stone-400">{icon}</div>
        <p className={`text-xl font-bold ${valueClassName}`} style={valueStyle}>{value}</p>
        <p className="text-xs text-stone-500">{label}</p>
    </div>
);

const getCircleColor = (circleName: string) => {
    let hash = 0;
    for (let i = 0; i < circleName.length; i++) {
        hash = circleName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = `hsl(${hash % 360}, 50%, 40%)`;
    return color;
};

const ProfileSidebar: React.FC<ProfileSidebarProps> = ({ user, connectionRequests, circles, onGenerateSkills, onRecordVideo, onPlayVideo, onNavigate, onSelectCircle }) => {
  const connectionCount = useMemo(() => {
    return connectionRequests.filter(
        cr => (cr.fromUserId === user.id || cr.toUserId === user.id) && cr.status === 'accepted'
    ).length;
  }, [user.id, connectionRequests]);
  
  const userCircles = useMemo(() => {
    return circles.filter(circle => circle.members.includes(user.id));
  }, [user.id, circles]);

  return (
    <div className="space-y-6">
      {/* Profile Info Tile */}
      <div className="bg-white rounded-2xl border p-6 text-center shadow-sm" style={{ borderColor: "#e7e5e4" }}>
        <button onClick={() => onNavigate(View.Profile)} className="block text-center group w-full" title="View Full Profile">
          <div className="relative w-24 h-24 mx-auto mb-4">
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="rounded-full border-4 object-cover h-24 w-24 shadow-sm transition-all group-hover:ring-4" style={{ borderColor: "#e7e5e4" }}
              />
              {user.microIntroductionUrl ? (
                  <div 
                      onClick={(e) => {e.stopPropagation(); onPlayVideo(user.microIntroductionUrl!)}}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Play Micro-Introduction"
                  >
                      <PlayIcon className="w-10 h-10 text-white group-hover:scale-110 transition-transform" />
                  </div>
              ) : (
                   <button 
                      onClick={(e) => { e.stopPropagation(); onRecordVideo()}}
                      className="absolute bottom-0 right-0 p-1.5 rounded-full border-2 border-white hover:opacity-80 transition-colors" style={{ backgroundColor: "#1a4a3a" }}
                      title="Record a micro-introduction"
                  >
                      <CameraIcon className="w-4 h-4 text-white" />
                  </button>
              )}
          </div>
          <div className="flex items-center justify-center space-x-2">
             <h2 className="font-bold text-xl text-stone-900 group-hover:underline transition-colors">{user.name}</h2>
             {user.isVerified && <VerifiedIcon className="w-5 h-5" style={{ color: "#1a4a3a" }} title="Verified Work Email" />}
          </div>
        </button>
        <p className="text-sm text-stone-500 mt-1">{user.headline}</p>
        <button 
            onClick={() => onNavigate(View.AIChat)}
            className="mt-4 w-full font-semibold px-4 py-2 rounded-xl transition text-sm flex items-center justify-center text-white hover:opacity-90" style={{ backgroundColor: "#1a4a3a" }}
        >
            <BotIcon className="w-5 h-5 mr-2" />
            Chat with Be
        </button>
      </div>

      {/* Stats Tile */}
       <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor: "#e7e5e4" }}>
            <div className="grid grid-cols-3 gap-2">
                 <StatItem icon={<ShieldCheckIcon className="w-5 h-5" />} label="Reputation" value={user.reputation} valueClassName="text-emerald-600" />
                 <StatItem icon={<CoinsIcon className="w-5 h-5" />} label="Credits" value={user.credits} valueClassName="text-amber-500" />
                 <StatItem icon={<UsersIcon className="w-5 h-5" />} label="Connections" value={connectionCount} valueClassName="font-bold" valueStyle={{ color: "#1a4a3a" }} />
            </div>
       </div>

      {/* Skills Tile */}
      <div className="bg-white rounded-2xl border p-6 shadow-sm" style={{ borderColor: "#e7e5e4" }}>
            {user.verifiedSkills && user.verifiedSkills.length > 0 ? (
                <div>
                    <h3 className="font-semibold text-stone-800 text-md mb-3 text-center flex items-center justify-center">
                        <VerifiedIcon className="w-5 h-5 mr-2" style={{ color: "#1a4a3a" }} />
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
                                    <div className={`h-1.5 rounded-full ${proficiencyWidth[skill.proficiency]}`} style={{ backgroundColor: "#1a4a3a" }}></div>
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
                            <div key={skill.name} className="flex items-center text-sm rounded-full px-3 py-1 font-medium border" style={{ backgroundColor: "#e8f4f0", color: "#1a4a3a", borderColor: "#1a6b52" }}>
                                {skill.name}
                                <span className="ml-1.5 font-semibold" style={{ color: "#1a4a3a" }}>{skill.endorsements}</span>
                            </div>
                        ))}
                    </div>
                      <button onClick={onGenerateSkills} className="mt-4 w-full font-semibold px-4 py-2 rounded-xl text-sm flex items-center justify-center border transition hover:opacity-80" style={{ backgroundColor: "#e8f4f0", color: "#1a4a3a", borderColor: "#1a6b52" }}>
                          <SparklesIcon className="w-4 h-4 mr-2" />
                          Generate Verified Skills
                      </button>
                </div>
            )}
        </div>
      
      {/* Circles Tile */}
      {userCircles.length > 0 && (
        <div className="bg-white rounded-2xl border p-6 shadow-sm" style={{ borderColor: "#e7e5e4" }}>
            <h3 className="font-semibold text-stone-800 text-md mb-4 flex items-center justify-center">
                <CirclesIcon className="w-5 h-5 mr-2 text-stone-500"/>
                My Circles
            </h3>
            <div className="flex flex-wrap gap-3 justify-center">
                {userCircles.slice(0, 5).map(circle => (
                    <button 
                        key={circle.id} 
                        onClick={() => onSelectCircle(circle.id)}
                        title={circle.name}
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-md text-white transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-purple-500"
                        style={{ backgroundColor: getCircleColor(circle.name) }}
                    >
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
