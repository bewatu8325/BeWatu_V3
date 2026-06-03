import React, { useMemo, useState, useRef } from 'react';
import { User, ConnectionRequest, Circle, View, Experience } from '../types';
import { PlayIcon, CameraIcon, VerifiedIcon, SparklesIcon, ShieldCheckIcon, CoinsIcon, CirclesIcon, BotIcon, UsersIcon } from '../constants';
import SkillDNA from './profile/SkillDNA';
import ExperienceSection from './ExperienceSection';
import ReputationPanel from './profile/ReputationPanel';
import { useTranslation } from '../hooks/useTranslation';
import { useFirebase } from '../contexts/FirebaseContext';
import ProfileReelsStrip from './ProfileReelsStrip';
import { uploadAvatar } from '../lib/storageService';
import { updateUserInFirestore } from '../lib/firebaseAuth';

interface ProfilePageProps {
  user: User;
  isCurrentUser: boolean;
  connectionRequests: ConnectionRequest[];
  circles: Circle[];
  onGenerateSkills: () => void;
  onRecordVideo: () => void;
  onUploadVideo?: (file: File) => void;
  onPlayVideo: (url: string) => void;
  onNavigate: (view: View) => void;
  onSelectCircle: (circleId: number) => void;
  onChangePassword: () => void;
  onOpenSecurity: () => void;
  onReportUser?: (firestoreId: string, name: string) => void;
}

const proficiencyWidth = {
  'Beginner': 'w-1/4',
  'Intermediate': 'w-2/4',
  'Proficient': 'w-3/4',
  'Expert': 'w-4/4',
};

const StatItem: React.FC<{ icon: React.ReactNode; label: string; value: string | number; valueClassName: string }> = ({ icon, label, value, valueClassName }) => (
    <div className="bg-stone-50/50 p-3 rounded-lg border border-stone-200 text-center">
        <div className="flex justify-center items-center mb-1 text-stone-500">{icon}</div>
        <p className={`text-xl font-bold ${valueClassName}`}>{value}</p>
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



// ─────────────────────────────────────────────────────────────────────────────
// WorkplaceSection — company with autocomplete + auto-create
// ─────────────────────────────────────────────────────────────────────────────
const WorkplaceSection: React.FC<{
  user: any;
  isCurrentUser: boolean;
  fbUid: string;
}> = ({ user, isCurrentUser, fbUid }) => {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(user.employerName ?? '');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showOnPage, setShowOnPage] = useState(user.showOnCompanyPage ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceRef = React.useRef<any>(null);

  const searchCompanies = async (q: string) => {
    if (!q.trim() || q.length < 2) { setSuggestions([]); return; }
    try {
      const { getDocs, query: fsQuery, collection, where, orderBy, limit, startAt, endAt } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      const snap = await getDocs(fsQuery(
        collection(db, 'companies'),
        orderBy('name'),
        startAt(q),
        endAt(q + '\uf8ff'),
        limit(5)
      ));
      setSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setSuggestions([]); }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCompanies(val), 300);
  };

  const handleSelect = (company: any) => {
    setQuery(company.name);
    setSuggestions([]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { updateUserInFirestore } = await import('../lib/firebaseAuth');
      const trimmed = query.trim();

      // Check if company exists; if not, create a minimal entry
      if (trimmed) {
        const { getDocs, query: fsQuery, collection, where, limit, addDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');
        const snap = await getDocs(fsQuery(collection(db, 'companies'), where('name', '==', trimmed), limit(1)));
        if (snap.empty) {
          // Company not in BeWatu — create minimal entry (unregistered)
          await addDoc(collection(db, 'companies'), {
            name: trimmed,
            claimed: false,
            createdAt: serverTimestamp(),
            createdByUid: fbUid,
            source: 'user_profile',
          });
        }
      }

      await updateUserInFirestore(fbUid, {
        employerName: trimmed || null,
        showOnCompanyPage: showOnPage,
      });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error('workplace save failed:', e); }
    finally { setSaving(false); }
  };

  if (!isCurrentUser && !user.employerName) return null;

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
          <svg className="w-4 h-4" style={{ color: '#1a4a3a' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Workplace
        </h3>
        {isCurrentUser && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs font-semibold px-2 py-0.5 rounded-lg hover:bg-stone-100" style={{ color: '#1a4a3a' }}>
            {user.employerName ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {!editing ? (
        user.employerName ? (
          <div>
            <p className="text-sm font-medium text-stone-800">{user.employerName}</p>
            {isCurrentUser && (
              <p className="text-xs text-stone-400 mt-0.5">{user.showOnCompanyPage ? 'Showing on company page' : 'Not shown on company page'}</p>
            )}
          </div>
        ) : isCurrentUser ? (
          <p className="text-sm text-stone-400">Add your current employer</p>
        ) : null
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <input
              autoFocus
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Search or enter company name"
              className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a4a3a]/30"
              style={{ borderColor: '#e7e5e4' }}
            />
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl border shadow-lg overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
                {suggestions.map(s => (
                  <button key={s.id} onClick={() => handleSelect(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition-colors flex items-center gap-2">
                    {s.logoUrl && <img src={s.logoUrl} alt="" className="w-5 h-5 rounded object-cover" />}
                    <span className="font-medium text-stone-800">{s.name}</span>
                    {s.claimed && <span className="text-xs text-green-600 font-semibold ml-auto">BeWatu member</span>}
                  </button>
                ))}
                {query.trim() && !suggestions.find(s => s.name.toLowerCase() === query.toLowerCase()) && (
                  <button onClick={() => { setSuggestions([]); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition-colors text-stone-500">
                    Add "<strong className="text-stone-800">{query.trim()}</strong>" as new company
                  </button>
                )}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
            <input type="checkbox" checked={showOnPage} onChange={e => setShowOnPage(e.target.checked)}
              className="rounded border-stone-300" />
            Show me on this company's BeWatu page
          </label>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="text-sm font-semibold px-4 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: '#1a4a3a' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setQuery(user.employerName ?? ''); setSuggestions([]); }}
              className="text-sm px-4 py-1.5 rounded-lg border hover:bg-stone-50" style={{ borderColor: '#e7e5e4', color: '#6b7280' }}>
              Cancel
            </button>
          </div>
          {saved && <p className="text-xs text-green-600 font-medium">Saved ✓</p>}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SkillsSection — self-reported skills management
// ─────────────────────────────────────────────────────────────────────────────
const SkillsSection: React.FC<{
  skills: any[];
  userAddedSkills: string[];
  isCurrentUser: boolean;
  fbUid: string;
  onGenerateSkills: () => void;
}> = ({ skills, userAddedSkills, isCurrentUser, fbUid, onGenerateSkills }) => {
  const [newSkill, setNewSkill] = useState('');
  const [adding, setAdding] = useState(false);
  const [localSkills, setLocalSkills] = useState<string[]>(userAddedSkills);

  const handleAdd = async () => {
    const trimmed = newSkill.trim();
    if (!trimmed || localSkills.includes(trimmed)) return;
    const updated = [...localSkills, trimmed];
    setLocalSkills(updated);
    setNewSkill('');
    setAdding(false);
    try {
      const { updateUserInFirestore } = await import('../lib/firebaseAuth');
      await updateUserInFirestore(fbUid, { userAddedSkills: updated });
    } catch { /* silent — local state already updated */ }
  };

  const handleRemove = async (skill: string) => {
    const updated = localSkills.filter(s => s !== skill);
    setLocalSkills(updated);
    try {
      const { updateUserInFirestore } = await import('../lib/firebaseAuth');
      await updateUserInFirestore(fbUid, { userAddedSkills: updated });
    } catch { /* silent */ }
  };

  return (
    <div className="mt-4">
      {/* AI-endorsed skills from platform activity */}
      {skills.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Platform Skills</h4>
          <div className="flex flex-wrap gap-2">
            {skills.map(skill => (
              <div key={skill.name} className="flex items-center text-sm bg-[#e8f4f0]/50 text-[#1a6b52] rounded-full px-3 py-1 font-medium border border-[#1a4a3a]/20">
                {skill.name}
                {skill.endorsements > 0 && <span className="ml-1.5 text-[#1a6b52] font-semibold">{skill.endorsements}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Self-reported / user-added skills */}
      {(localSkills.length > 0 || isCurrentUser) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Self-reported Skills</h4>
            {isCurrentUser && !adding && (
              <button
                onClick={() => setAdding(true)}
                className="text-xs font-semibold px-2 py-0.5 rounded-lg hover:bg-stone-100 transition-colors"
                style={{ color: '#1a4a3a' }}>
                + Add skill
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {localSkills.map(skill => (
              <div key={skill} className="flex items-center gap-1 text-sm bg-stone-100 text-stone-600 rounded-full px-3 py-1 font-medium border border-stone-200">
                {skill}
                {isCurrentUser && (
                  <button onClick={() => handleRemove(skill)} className="ml-1 text-stone-400 hover:text-red-400 transition-colors leading-none">×</button>
                )}
              </div>
            ))}
          </div>
          {adding && (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                value={newSkill}
                onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewSkill(''); } }}
                placeholder="e.g. Product Management"
                className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a4a3a]/30"
                style={{ borderColor: '#e7e5e4' }}
                maxLength={50}
              />
              <button onClick={handleAdd} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: '#1a4a3a' }}>Add</button>
              <button onClick={() => { setAdding(false); setNewSkill(''); }} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-stone-50" style={{ borderColor: '#e7e5e4', color: '#6b7280' }}>Cancel</button>
            </div>
          )}
          {isCurrentUser && localSkills.length === 0 && !adding && (
            <p className="text-xs text-stone-400">Add skills to your profile — they can be endorsed by your connections</p>
          )}
        </div>
      )}

      {/* Generate verified skills via AI */}
      {isCurrentUser && (
        <button onClick={onGenerateSkills} className="mt-4 w-full bg-[#1a4a3a]/10 text-[#1a6b52] font-semibold px-4 py-2 rounded-lg hover:bg-[#1a4a3a]/20 transition-colors text-sm flex items-center justify-center border border-[#1a4a3a]/20">
          <SparklesIcon className="w-4 h-4 mr-2" />
          Generate Verified Skills from Resume
        </button>
      )}
    </div>
  );
};

const ProfilePage: React.FC<ProfilePageProps> = ({ user, isCurrentUser, connectionRequests, circles, onGenerateSkills, onRecordVideo, onUploadVideo, onPlayVideo, onNavigate, onSelectCircle, onChangePassword, onOpenSecurity, onReportUser }) => {
  const { t } = useTranslation();
  const { fbUser } = useFirebase();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showReelPicker, setShowReelPicker] = useState(false);
  const videoUploadRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarError, setAvatarError] = useState('');
  const [localAvatarUrl, setLocalAvatarUrl] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [localExperiences, setLocalExperiences] = useState<any[]>((user as any).experiences ?? []);

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
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleResumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fbUser) return;
    const validTypes = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx)$/i)) {
      setResumeError('Please upload a PDF or Word document.'); return;
    }
    if (file.size > 10 * 1024 * 1024) { setResumeError('File too large (max 10 MB).'); return; }
    setResumeUploading(true); setResumeError('');
    try {
      const { uploadResume } = await import('../lib/storageService');
      const url = await uploadResume(fbUser.uid, file);
      await updateUserInFirestore(fbUser.uid, { resumeUrl: url } as any);
    } catch (err: any) {
      setResumeError(err.message ?? 'Upload failed.');
    } finally { setResumeUploading(false); }
  };

  const handleSaveExperiences = async (experiences: Experience[]) => {
    setLocalExperiences(experiences);
    if (fbUser) await updateUserInFirestore(fbUser.uid, { experiences } as any);
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
    if (onChangePassword) onChangePassword();
    setNewPassword('');
    setConfirmPassword('');
  };

  const profileUid = (user as any)._firestoreUid ?? String(user.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 overflow-x-hidden">
      <div className="lg:col-span-4 space-y-4 min-w-0">
        {/* Profile Info Tile */}
        <div className="bg-white/50 rounded-xl border border-stone-200 p-5 text-center">
          <div className="relative w-24 h-24 mx-auto mb-4">
            {isCurrentUser && (
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            )}

            <div
              className={`relative h-24 w-24 rounded-full ${isCurrentUser ? 'cursor-pointer group' : ''}`}
              onClick={() => isCurrentUser && !avatarUploading && avatarInputRef.current?.click()}
              title={isCurrentUser ? 'Click to change photo' : undefined}
            >
              <img
                src={localAvatarUrl || user.avatarUrl}
                alt={user.name}
                className="rounded-full border-4 border-stone-200 object-cover h-24 w-24 shadow-lg shadow-cyan-500/10 transition-opacity"
                style={{ opacity: avatarUploading ? 0.5 : 1 }}
                onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0e7490&color=fff&size=96`; }}
              />

              {isCurrentUser && !avatarUploading && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CameraIcon className="w-7 h-7 text-white" />
                </div>
              )}

              {avatarUploading && (
                <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center bg-black/60">
                  <svg className="h-7 w-7 animate-spin text-[#1a6b52]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-[10px] text-white mt-1">{avatarUploadProgress}%</span>
                </div>
              )}
            </div>

            {!avatarUploading && (
              user.microIntroductionUrl ? (
                <button
                  onClick={() => onPlayVideo(user.microIntroductionUrl!)}
                  className="absolute bottom-0 right-0 bg-[#1a4a3a] p-1.5 rounded-full border-2 border-stone-200 hover:bg-[#1a6b52] transition-colors"
                  title={t('playMicroIntro')}
                >
                  <PlayIcon className="w-4 h-4 text-stone-900" />
                </button>
              ) : isCurrentUser ? (
                <button
                  onClick={e => { e.stopPropagation(); setShowReelPicker(true); }}
                  className="absolute bottom-0 right-0 bg-stone-100 p-1.5 rounded-full border-2 border-stone-200 hover:bg-stone-200 transition-colors"
                  title="Share your reel vibe"
                >
                  <CameraIcon className="w-4 h-4 text-stone-700" />
                </button>
              ) : null
            )}
          </div>

          {/* ── Reel vibe picker modal ──────────────────────────────── */}
          {showReelPicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs text-center space-y-4">
                <h3 className="text-lg font-bold text-stone-900">Share your reel vibe</h3>
                <p className="text-sm text-stone-500">Record a quick intro or upload an existing video</p>
                <div className="space-y-3">
                  <button
                    onClick={() => { setShowReelPicker(false); onRecordVideo(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 hover:bg-stone-50 transition-colors text-left"
                    style={{ borderColor: '#1a4a3a' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: '#1a4a3a' }}>
                      <CameraIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-stone-900 text-sm">Record now</p>
                      <p className="text-xs text-stone-400">Use your camera to record live</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowReelPicker(false); videoUploadRef.current?.click(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border hover:bg-stone-50 transition-colors text-left"
                    style={{ borderColor: '#e7e5e4' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#e8f4f0' }}>
                      <svg className="w-5 h-5" style={{ color: '#1a4a3a' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-stone-900 text-sm">Upload a video</p>
                      <p className="text-xs text-stone-400">MP4, MOV up to 100 MB</p>
                    </div>
                  </button>
                </div>
                <button
                  onClick={() => setShowReelPicker(false)}
                  className="text-sm text-stone-400 hover:text-stone-600 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
          <input
            ref={videoUploadRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file && onUploadVideo) onUploadVideo(file);
              e.target.value = '';
            }}
          />

          {isCurrentUser && (
            <div className="mb-2 -mt-2">
              {avatarError ? (
                <p className="text-xs text-red-400 text-center">{avatarError}</p>
              ) : (
                <p className="text-xs text-stone-500 text-center">Click photo to change</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-center space-x-2">
            <h2 className="font-bold text-xl text-stone-900 break-words">{user.name}</h2>
            {user.isVerified && <VerifiedIcon className="w-5 h-5 text-[#1a6b52]" title="Verified Work Email" />}
          </div>
          <p className="text-sm text-stone-500 mt-1 break-words">{user.headline}</p>
          <p className="text-stone-700 text-sm mt-4 break-words">{user.bio}</p>

          {!isCurrentUser && onReportUser && (
            <button
              onClick={() => onReportUser(user._firestoreUid ?? String(user.id), user.name)}
              style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: '1px solid #e7e5e4', background: '#f5f5f4', color: '#78716c', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e7e5e4'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f4'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Report this user
            </button>
          )}
        </div>

        {/* Stats Tile — reputation replaced with ReputationPanel compact */}
        <div className="bg-white/50 rounded-xl border border-stone-200 p-4">
          <div className="grid grid-cols-3 gap-2">
            <ReputationPanel uid={profileUid} isOwn={isCurrentUser} compact />
            <StatItem icon={<CoinsIcon className="w-5 h-5" />} label="Credits" value={user.credits} valueClassName="text-yellow-400" />
            <StatItem icon={<UsersIcon className="w-5 h-5" />} label="Connections" value={connectionCount} valueClassName="text-[#1a6b52]" />
          </div>
        </div>
      </div>

      <div className="lg:col-span-8 space-y-4 min-w-0">
        {/* Reels Strip */}
        <ProfileReelsStrip
          fbUid={user._firestoreUid ?? String(user.id)}
          isCurrentUser={isCurrentUser}
          onNavigate={onNavigate}
        />
        {/* Skills Tile */}
        <div className="bg-white/50 rounded-xl border border-stone-200 p-6">

          {/* Verified skills — green check badge on each skill */}
          {user.verifiedSkills && user.verifiedSkills.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-stone-800 text-sm flex items-center gap-1.5">
                  <VerifiedIcon className="w-4 h-4 text-[#1a6b52]" />
                  Verified Skills
                </h3>
                <span className="text-xs text-stone-400">Confirmed via platform activity</span>
              </div>
              <div className="space-y-3">
                {user.verifiedSkills.map((skill: any) => (
                  <div key={skill.name} className="group relative">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-stone-700">{skill.name}</p>
                        <VerifiedIcon className="w-3.5 h-3.5 text-[#1a6b52]" />
                      </div>
                      <p className="text-xs text-stone-500">{skill.proficiency ?? skill.level}</p>
                    </div>
                    <div className="w-full bg-stone-100 rounded-full h-1.5">
                      <div className={`bg-[#1a4a3a] h-1.5 rounded-full ${proficiencyWidth[(skill.proficiency ?? skill.level) as keyof typeof proficiencyWidth] ?? 'w-2/4'}`}></div>
                    </div>
                    {skill.evidence && (
                      <div className="absolute left-0 bottom-6 w-full p-2 text-xs bg-stone-50 border border-stone-200 rounded-md text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <span className="font-bold">{t('evidence')}</span> {skill.evidence}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {((user as any).userAddedSkills?.length > 0 || isCurrentUser) && (
                <hr className="mt-4 border-stone-100" />
              )}
            </div>
          )}

          {/* Self-reported skills + Add button — always shown for current user */}
          <SkillsSection
            skills={user.skills ?? []}
            userAddedSkills={(user as any).userAddedSkills ?? []}
            isCurrentUser={isCurrentUser}
            fbUid={fbUser?.uid ?? ''}
            onGenerateSkills={onGenerateSkills}
          />
        </div>

        {/* Trust Reputation Panel — full domain breakdown */}
        <ReputationPanel uid={profileUid} isOwn={isCurrentUser} />

        {/* Resume Upload */}
        {isCurrentUser && (
          <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: '#e7e5e4' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: '#1a4a3a' }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">Resume</h3>
                  <p className="text-xs text-stone-400">PDF or Word · max 10 MB</p>
                </div>
              </div>
              <button
                onClick={() => resumeInputRef.current?.click()}
                disabled={resumeUploading}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#1a4a3a' }}>
                {resumeUploading ? (
                  <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Uploading…</>
                ) : (user as any).resumeUrl ? 'Update' : 'Upload'}
              </button>
              <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeChange} />
            </div>
            {(user as any).resumeUrl && !resumeUploading && (
              <a href={(user as any).resumeUrl} target="_blank" rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#e7e5e4', color: '#1a6b52' }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                View uploaded resume
              </a>
            )}
            {resumeError && <p className="mt-2 text-xs text-red-500">{resumeError}</p>}
          </div>
        )}

        {/* Experience */}
        {/* Workplace */}
        <WorkplaceSection user={user} isCurrentUser={isCurrentUser} fbUid={fbUser?.uid ?? ''} />

        <ExperienceSection
          experiences={localExperiences}
          isOwn={isCurrentUser}
          onSave={handleSaveExperiences}
        />

        <SkillDNA
          user={user}
          profileUid={(user as any)._firestoreUid ?? String(user.id)}
          isOwn={isCurrentUser}
          currentUserUid={fbUser?.uid}
          onEndorsed={() => {}}
        />
        
        {/* Circles Tile */}
        {userCircles.length > 0 && (
          <div className="bg-white/50 rounded-xl border border-stone-200 p-6">
            <h3 className="font-semibold text-stone-800 text-md mb-4 flex items-center justify-center">
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

        {/* Security & Privacy link */}
        {isCurrentUser && (
          <button
            onClick={onOpenSecurity}
            className="w-full flex items-center justify-between bg-white rounded-2xl border p-4 hover:bg-stone-50 transition-colors group"
            style={{ borderColor: '#e7e5e4' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl text-white flex-shrink-0" style={{ backgroundColor: '#1a4a3a' }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div className="text-left">
                <p className="font-bold text-stone-900 text-sm">Security & Privacy</p>
                <p className="text-xs text-stone-400">Password, visibility, connection settings</p>
              </div>
            </div>
            <svg className="w-4 h-4 text-stone-400 group-hover:text-stone-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
