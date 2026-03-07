import React, { useMemo, useState, useRef } from 'react';
import { User, ConnectionRequest, Circle, View } from '../types';
import { PlayIcon, CameraIcon, VerifiedIcon, SparklesIcon, ShieldCheckIcon, CoinsIcon, CirclesIcon, BotIcon, UsersIcon } from '../constants';
import SkillDNA from './profile/SkillDNA';
import { useTranslation } from '../hooks/useTranslation';
import { useFirebase } from '../contexts/FirebaseContext';
import { uploadAvatar } from '../lib/storageService';
import { updateUserInFirestore } from '../lib/firebaseAuth';

interface ProfilePageProps {
  user: User;
  isCurrentUser: boolean;
  connectionRequests: ConnectionRequest[];
  circles: Circle[];
  onGenerateSkills: () => void;
  onRecordVideo: () => void;
  onPlayVideo: (url: string) => void;
  onNavigate: (view: View) => void;
  onSelectCircle: (circleId: number) => void;
  onChangePassword: () => void;
}

const proficiencyWidth = {
  'Beginner': 'w-1/4',
  'Intermediate': 'w-2/4',
  'Proficient': 'w-3/4',
  'Expert': 'w-4/4',
};

const StatItem: React.FC<{ icon: React.ReactNode; label: string; value: string | number; valueClassName: string }> = ({ icon, label, value, valueClassName }) => (
    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 text-center">
        <div className="flex justify-center items-center mb-1 text-slate-400">{icon}</div>
        <p className={`text-xl font-bold ${valueClassName}`}>{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
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

const ProfilePage: React.FC<ProfilePageProps> = ({ user, isCurrentUser, connectionRequests, circles, onGenerateSkills, onRecordVideo, onPlayVideo, onNavigate, onSelectCircle, onChangePassword }) => {
  const { t } = useTranslation();
  const { fbUser } = useFirebase();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarError, setAvatarError] = useState('');
  const [localAvatarUrl, setLocalAvatarUrl] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const connectionCount = useMemo(() => {
    return connectionRequests.filter(
        cr => (cr.fromUserId === user.id || cr.toUserId === user.id) && cr.status === 'accepted'
    ).length;
  }, [user.id, connectionRequests]);
  
  const userCircles = useMemo(() => {
    return circles.filter(circle => circle.members.includes(user.id));
  }, [user.id, circles]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fbUser) return;
    setAvatarError('');
    setAvatarUploading(true);
    setAvatarUploadProgress(0);
    try {
      const url = await uploadAvatar(fbUser.uid, file, (pct) => setAvatarUploadProgress(pct));
      setLocalAvatarUrl(url);
      await updateUserInFirestore(fbUser.uid, { photoURL: url, avatarUrl: url });
    } catch (err: any) {
      setAvatarError(err.message ?? 'Upload failed');
    } finally {
      setAvatarUploading(false);
      // Reset input so same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handlePasswordChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError(t('passwordsDoNotMatch'));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters long.");
      return;
    }
    setPasswordError('');
    if (onChangePassword) {
      onChangePassword();
    }
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        {/* Profile Info Tile */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center">
          {/* Avatar with upload */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            {/* Hidden file input */}
            {isCurrentUser && (
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            )}

            {/* Avatar image */}
            <div
              className={`relative h-24 w-24 rounded-full ${isCurrentUser ? 'cursor-pointer group' : ''}`}
              onClick={() => isCurrentUser && !avatarUploading && avatarInputRef.current?.click()}
              title={isCurrentUser ? 'Click to change photo' : undefined}
            >
              <img
                src={localAvatarUrl || user.avatarUrl}
                alt={user.name}
                className="rounded-full border-4 border-slate-700 object-cover h-24 w-24 shadow-lg shadow-cyan-500/10 transition-opacity"
                style={{ opacity: avatarUploading ? 0.5 : 1 }}
                onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0e7490&color=fff&size=96`; }}
              />

              {/* Hover overlay for current user */}
              {isCurrentUser && !avatarUploading && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CameraIcon className="w-7 h-7 text-white" />
                </div>
              )}

              {/* Upload progress spinner */}
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center bg-black/60">
                  <svg className="h-7 w-7 animate-spin text-cyan-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-[10px] text-white mt-1">{avatarUploadProgress}%</span>
                </div>
              )}
            </div>

            {/* Micro-intro / camera button (only when NOT showing upload overlay) */}
            {!avatarUploading && (
              user.microIntroductionUrl ? (
                <button
                  onClick={() => onPlayVideo(user.microIntroductionUrl!)}
                  className="absolute bottom-0 right-0 bg-cyan-500 p-1.5 rounded-full border-2 border-slate-800 hover:bg-cyan-400 transition-colors"
                  title={t('playMicroIntro')}
                >
                  <PlayIcon className="w-4 h-4 text-slate-900" />
                </button>
              ) : isCurrentUser ? (
                <button
                  onClick={e => { e.stopPropagation(); onRecordVideo(); }}
                  className="absolute bottom-0 right-0 bg-slate-700 p-1.5 rounded-full border-2 border-slate-800 hover:bg-slate-600 transition-colors"
                  title={t('recordMicroIntro')}
                >
                  <CameraIcon className="w-4 h-4 text-slate-300" />
                </button>
              ) : null
            )}
          </div>

          {/* Upload hint & error */}
          {isCurrentUser && (
            <div className="mb-2 -mt-2">
              {avatarError ? (
                <p className="text-xs text-red-400 text-center">{avatarError}</p>
              ) : (
                <p className="text-xs text-slate-500 text-center">Click photo to change</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-center space-x-2">
            <h2 className="font-bold text-xl text-slate-100">{user.name}</h2>
            {user.isVerified && <VerifiedIcon className="w-5 h-5 text-cyan-400" title="Verified Work Email" />}
          </div>
          <p className="text-sm text-slate-400 mt-1">{user.headline}</p>
          <p className="text-slate-300 text-sm mt-4">{user.bio}</p>
          {isCurrentUser && (
            <button 
                onClick={() => onNavigate(View.AIChat)}
                className="mt-4 w-full bg-cyan-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-cyan-400 transition-colors text-sm flex items-center justify-center"
            >
                <BotIcon className="w-5 h-5 mr-2" />
                {t('aiChat')} with Be
            </button>
          )}
        </div>

        {/* Stats Tile */}
         <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <div className="grid grid-cols-3 gap-2">
                   <StatItem icon={<ShieldCheckIcon className="w-5 h-5" />} label={t('reputation')} value={user.reputation} valueClassName="text-green-400" />
                   <StatItem icon={<CoinsIcon className="w-5 h-5" />} label="Credits" value={user.credits} valueClassName="text-yellow-400" />
                   <StatItem icon={<UsersIcon className="w-5 h-5" />} label="Connections" value={connectionCount} valueClassName="text-cyan-400" />
              </div>
         </div>
      </div>

      <div className="lg:col-span-8 space-y-6">
        {/* Skills Tile */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              {user.verifiedSkills && user.verifiedSkills.length > 0 ? (
                  <div>
                      <h3 className="font-semibold text-slate-200 text-md mb-3 text-center flex items-center justify-center">
                          <VerifiedIcon className="w-5 h-5 mr-2 text-cyan-400" />
                          {t('verifiedSkills')}
                      </h3>
                      <div className="space-y-3">
                          {user.verifiedSkills.map(skill => (
                              <div key={skill.name} className="group relative">
                                  <div className="flex justify-between items-center mb-1">
                                      <p className="text-sm font-medium text-slate-300">{skill.name}</p>
                                      <p className="text-xs text-slate-400">{skill.proficiency}</p>
                                  </div>
                                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                                      <div className={`bg-cyan-500 h-1.5 rounded-full ${proficiencyWidth[skill.proficiency]}`}></div>
                                  </div>
                                  <div className="absolute left-0 bottom-6 w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                      <span className="font-bold">{t('evidence')}</span> {skill.evidence}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              ) : (
                  <div className="text-center">
                      <h3 className="font-semibold text-slate-200 text-md mb-2">{t('topSkills')}</h3>
                      <div className="flex flex-wrap gap-2 justify-center">
                          {user.skills?.map(skill => (
                              <div key={skill.name} className="flex items-center text-sm bg-cyan-900/50 text-cyan-300 rounded-full px-3 py-1 font-medium border border-cyan-500/20">
                                  {skill.name}
                                  <span className="ml-1.5 text-cyan-200 font-semibold">{skill.endorsements}</span>
                              </div>
                          ))}
                      </div>
                      {isCurrentUser && (
                        <button onClick={onGenerateSkills} className="mt-4 w-full bg-cyan-500/10 text-cyan-300 font-semibold px-4 py-2 rounded-lg hover:bg-cyan-500/20 transition-colors text-sm flex items-center justify-center border border-cyan-500/20">
                            <SparklesIcon className="w-4 h-4 mr-2" />
                            {t('generateVerifiedSkills')}
                        </button>
                      )}
                  </div>
              )}
          </div>
        <SkillDNA
          user={user}
          profileUid={(user as any)._firestoreUid ?? String(user.id)}
          isOwn={isCurrentUser}
          currentUserUid={fbUser?.uid}
          onEndorsed={() => {}}
        />
        
        {/* Circles Tile */}
        {userCircles.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h3 className="font-semibold text-slate-200 text-md mb-4 flex items-center justify-center">
                  <CirclesIcon className="w-5 h-5 mr-2 text-purple-400"/>
                  {t('myCircles')}
              </h3>
              <div className="flex flex-wrap gap-3 justify-center">
                  {userCircles.map(circle => (
                      <button 
                          key={circle.id} 
                          onClick={() => onSelectCircle(circle.id)}
                          title={circle.name}
                          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-purple-500"
                          style={{ backgroundColor: getCircleColor(circle.name) }}
                      >
                          {circle.name.charAt(0).toUpperCase()}
                      </button>
                  ))}
              </div>
          </div>
        )}

        {/* Security Settings */}
        {isCurrentUser && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                <h3 className="font-semibold text-slate-200 text-md mb-4">{t('securitySettings')}</h3>
                <form onSubmit={handlePasswordChangeSubmit} className="space-y-4 max-w-sm">
                    <div>
                        <label className="text-sm text-slate-400 font-medium mb-1 block">{t('newPassword')}</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md" placeholder="••••••••"/>
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 font-medium mb-1 block">{t('confirmNewPassword')}</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md" placeholder="••••••••"/>
                    </div>
                    {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
                    <div className="flex justify-end">
                        <button type="submit" className="bg-cyan-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-cyan-500 transition-colors">
                            {t('changePassword')}
                        </button>
                    </div>
                </form>
            </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
