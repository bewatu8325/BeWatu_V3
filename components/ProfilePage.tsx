import React, { useMemo, useState, useRef, useEffect } from 'react';
import { User, ConnectionRequest, Circle, View, Experience, Education, AVAILABILITY_OPTIONS, OPEN_TO_OPTIONS, BUILDER_TYPE_OPTIONS, ThirdPartyIntegration } from '../types';
import { PlayIcon, CameraIcon, VerifiedIcon, SparklesIcon, ShieldCheckIcon, CoinsIcon, BotIcon, UsersIcon, ShareIcon } from '../constants';
import SkillDNA from './profile/SkillDNA';
import ExperienceSection from './ExperienceSection';
import EducationSection from './EducationSection';
import ReputationPanel from './profile/ReputationPanel';
import AIWorkflowShowcase from './profile/AIWorkflowShowcase';
import SkillsTrajectory from './profile/SkillsTrajectory';
import LearningLog from './profile/LearningLog';
import { useTranslation } from '../hooks/useTranslation';
import { useFirebase } from '../contexts/FirebaseContext';
import ProfileReelsStrip from './ProfileReelsStrip';
import ShareProfileModal from './ShareProfileModal';
import { uploadAvatar } from '../lib/storageService';
import { updateUserInFirestore } from '../lib/firebaseAuth';
import { getFollowingCompanies, getMyArenaSubmissions, ArenaSubmissionRecord, getFactoryProjects, FactoryProjectRecord, FACTORY_PROJECT_STATUS_LABEL } from '../lib/firestoreService';
import SkillResume from './profile/SkillResume';

interface ProfilePageProps {
  user: User;
  isCurrentUser: boolean;
  connectionRequests: ConnectionRequest[];
  circles: Circle[];
  onGenerateSkills: () => void;
  /** Open the Import from LinkedIn modal */
  onImportLinkedIn?: () => void;
  /** Open the Import from Resume modal — only meaningful once a resume is uploaded */
  onImportResume?: () => void;
  onRecordVideo: () => void;
  onPlayVideo: (url: string) => void;
  onNavigate: (view: View) => void;
  onSelectCircle: (circleId: number) => void;
  onOpenSecurity: () => void;
  onReportUser?: (firestoreId: string, name: string) => void;
  /** Saves profile fields AND syncs App.tsx data.users/currentUser immediately.
   *  Use for all profile edits — prevents stale-data revert without reload. */
  onSaveProfile?: (updates: Record<string, any>) => Promise<void>;
  onUploadVideo?: (file: File) => void;
  /** Add a single skill name to the user's skills list */
  onAddSkill?: (skillName: string) => void;
  /** Remove a skill by name from the user's skills list */
  onRemoveSkill?: (skillName: string) => void;
  /** Open a company profile modal by firestoreId */
  onViewCompany?: (companyId: string) => void;
}

const proficiencyWidth = {
  'Beginner': 'w-1/4',
  'Intermediate': 'w-2/4',
  'Proficient': 'w-3/4',
  'Expert': 'w-4/4',
};

const ARENA_STATUS: Record<ArenaSubmissionRecord['status'], { label: string; bg: string; color: string }> = {
  submitted:   { label: 'Submitted',    bg: '#f5f5f4',               color: '#57534e' },
  shortlisted: { label: 'Shortlisted',  bg: '#fef3c7',               color: '#92400e' },
  winner:      { label: 'Won',          bg: 'var(--bw-green-light)', color: 'var(--bw-green-mid)' },
  rejected:    { label: 'Not selected', bg: '#f5f5f4',               color: '#78716c' },
};

const LINK_PLATFORMS: ThirdPartyIntegration['platform'][] = ['GitHub', 'Figma', 'Dribbble', 'Kaggle', 'Notion'];

const StatItem: React.FC<{ icon: React.ReactNode; label: string; value: string | number; valueClassName: string }> = ({ icon, label, value, valueClassName }) => (
    <div className="bg-stone-50/50 p-3 rounded-lg border border-stone-200 text-center">
        <div className="flex justify-center items-center mb-1 text-stone-600">{icon}</div>
        <p className={`text-xl font-bold ${valueClassName}`}>{value}</p>
        <p className="text-xs text-stone-600">{label}</p>
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

const ProfilePage: React.FC<ProfilePageProps> = ({ user, isCurrentUser, connectionRequests, circles, onGenerateSkills, onImportLinkedIn, onImportResume, onRecordVideo, onPlayVideo, onNavigate, onSelectCircle, onOpenSecurity, onReportUser, onSaveProfile, onUploadVideo, onAddSkill, onRemoveSkill, onViewCompany }) => {
  const { t } = useTranslation();
  const { fbUser } = useFirebase();

  // ── Inline skill adding ──────────────────────────────────────────────────
  const [skillInput, setSkillInput]   = useState('');

  // ── Location (inline-editable, save on blur) ─────────────────────────────
  const [locationInput, setLocationInput] = useState(user.location ?? '');
  const handleLocationBlur = () => {
    const trimmed = locationInput.trim();
    if (trimmed !== (user.location ?? '')) onSaveProfile?.({ location: trimmed });
  };

  // ── Links (third-party integrations — real, pre-existing field with no
  // editor anywhere until now; always saved empty at signup and shown
  // read-only in the recruiter's CandidateDetailView, so it sat permanently
  // blank for every real user) ─────────────────────────────────────────────
  const [newLinkPlatform, setNewLinkPlatform] = useState<ThirdPartyIntegration['platform']>('GitHub');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const links = user.thirdPartyIntegrations ?? [];
  const availableLinkPlatforms = LINK_PLATFORMS.filter(p => !links.some(l => l.platform === p));
  const handleAddLink = () => {
    const trimmed = newLinkUrl.trim();
    if (!trimmed) return;
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const next = [...links, { platform: newLinkPlatform, url, verified: false }];
    onSaveProfile?.({ thirdPartyIntegrations: next });
    setNewLinkUrl('');
  };
  const handleRemoveLink = (platform: ThirdPartyIntegration['platform']) => {
    onSaveProfile?.({ thirdPartyIntegrations: links.filter(l => l.platform !== platform) });
  };

  // ── Share public profile ─────────────────────────────────────────────────
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShareInfo, setShowShareInfo]   = useState(false);

  // ── Followed companies (owner only) ─────────────────────────────────────
  const [followedCompanies, setFollowedCompanies] = useState<any[]>([]);
  useEffect(() => {
    if (!isCurrentUser || !fbUser?.uid) return;
    getFollowingCompanies(fbUser.uid)
      .then(setFollowedCompanies)
      .catch(() => setFollowedCompanies([]));
  }, [isCurrentUser, fbUser?.uid]);

  // ── Arena submissions (owner only) ───────────────────────────────────────
  // arena_challenges/{id}/submissions/{id}'s own read rule only allows the
  // submission's author or that challenge's recruiter to read it — a
  // visitor on someone else's profile can't read their submissions at all,
  // so this section only loads (and only renders) for isCurrentUser.
  const [arenaSubmissions, setArenaSubmissions] = useState<ArenaSubmissionRecord[]>([]);
  const [arenaLoading, setArenaLoading] = useState(true);
  useEffect(() => {
    if (!isCurrentUser || !fbUser?.uid) { setArenaLoading(false); return; }
    getMyArenaSubmissions(fbUser.uid)
      .then(setArenaSubmissions)
      .catch(() => setArenaSubmissions([]))
      .finally(() => setArenaLoading(false));
  }, [isCurrentUser, fbUser?.uid]);

  // ── Factory projects (visible to anyone viewing this profile) ───────────
  // factory_projects is openly readable by any authenticated user, same as
  // Pods, so unlike Arena submissions this loads for the profile being
  // viewed, not just the viewer's own.
  const factoryProfileUid = (user as any)._firestoreUid ?? String(user.id);
  const [factoryProjects, setFactoryProjects] = useState<FactoryProjectRecord[]>([]);
  const [factoryLoading, setFactoryLoading] = useState(true);
  useEffect(() => {
    setFactoryLoading(true);
    getFactoryProjects(factoryProfileUid)
      .then(setFactoryProjects)
      .catch(() => setFactoryProjects([]))
      .finally(() => setFactoryLoading(false));
  }, [factoryProfileUid]);

  // ── Item 4: auto-ensure username + isPublic for public profile URL ───────
  // When an existing user visits their own profile, if they don't yet have a
  // username slug or isPublic has never been set, derive and save both
  // silently. This is a one-time migration — runs at most once per user.
  //
  // P1 fix: needsPublic used to check `u.isPublic !== true`, which is also
  // true when isPublic was deliberately set to false (Security & Privacy ->
  // Profile Visibility -> Private). That made this "one-time" migration
  // fire again on every subsequent visit to your own profile and silently
  // flip isPublic back to true -- undoing the user's own private choice and
  // leaving firestore.rules' unauthenticated-read gate (isPublic == true)
  // open again. Checking specifically for undefined makes this a real
  // one-time migration that never overrides an explicit choice.
  useEffect(() => {
    if (!isCurrentUser || !fbUser?.uid || !onSaveProfile) return;
    const u = user as any;
    const needsUsername = !u.username;
    const needsPublic   = u.isPublic === undefined;
    if (!needsUsername && !needsPublic) return;

    const derived = u.username ?? (user.name
      ? (() => {
          const parts = user.name.trim().split(/\s+/).filter(Boolean);
          return parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1]).toLowerCase().replace(/[^a-z0-9]/g, '')
            : parts[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'user';
        })()
      : '');
    if (!derived) return;

    const patch: Record<string, any> = {};
    if (needsUsername) patch.username = derived;
    if (needsPublic)   patch.isPublic = true;
    onSaveProfile(patch).catch(() => {});
  }, [isCurrentUser, fbUser?.uid, (user as any).username, (user as any).isPublic]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarError, setAvatarError] = useState('');
  const [localAvatarUrl, setLocalAvatarUrl] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [resumeUploadSuccess, setResumeUploadSuccess] = useState(false);
  const [localExperiences, setLocalExperiences] = useState<any[]>((user as any).experiences ?? []);
  // Resync when the parent's user.experiences changes from outside
  // ExperienceSection's own save flow (e.g. the LinkedIn import, which
  // writes experiences via onSaveProfile directly) — without this, the
  // seeded-once-at-mount local copy above goes stale and the section keeps
  // showing the old list even though the real data was saved correctly.
  // Confirmed live: the Firestore write was correct, only this display
  // lagged, until this effect was added.
  useEffect(() => {
    setLocalExperiences((user as any).experiences ?? []);
  }, [(user as any).experiences]);

  const [localEducation, setLocalEducation] = useState<Education[]>((user as any).education ?? []);
  useEffect(() => {
    setLocalEducation((user as any).education ?? []);
  }, [(user as any).education]);

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
      // Bug fix: this used to call updateUserInFirestore directly, which
      // writes Firestore correctly but never syncs App.tsx's local
      // currentUser — the exact same class of staleness already found and
      // fixed elsewhere on this page (experiences, the profile-import
      // race). localAvatarUrl above already masks it for the photo shown
      // on THIS page, but user.avatarUrl everywhere else (e.g. the header)
      // stayed stale until a reload. onSaveProfile is the one path on this
      // page that actually syncs local state, same as every other save
      // here — use it instead, with the same direct-write fallback.
      if (onSaveProfile) {
        await onSaveProfile({ photoURL: url, avatarUrl: url });
      } else {
        await updateUserInFirestore(fbUser.uid, { photoURL: url, avatarUrl: url });
      }
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
    setResumeUploading(true); setResumeError(''); setResumeUploadSuccess(false);
    try {
      const { uploadResume } = await import('../lib/storageService');
      const url = await uploadResume(fbUser.uid, file);
      // Real bug: this used to call updateUserInFirestore directly. The
      // file genuinely uploaded and the Firestore doc genuinely got
      // resumeUrl written, but App.tsx's local currentUser was never
      // synced, so "View uploaded resume" and "Extract profile info from
      // this resume" — both gated on user.resumeUrl — stayed invisible
      // until a manual page reload. Reported directly: upload "did
      // nothing," no success message, no link, profile never updated from
      // the resume, because the one button that starts that step was
      // never visible. onSaveProfile is the path every other save on this
      // page uses specifically to avoid this.
      if (onSaveProfile) {
        await onSaveProfile({ resumeUrl: url });
      } else {
        await updateUserInFirestore(fbUser.uid, { resumeUrl: url } as any);
      }
      setResumeUploadSuccess(true);
      setTimeout(() => setResumeUploadSuccess(false), 5000);
    } catch (err: any) {
      setResumeError(err.message ?? 'Upload failed.');
    } finally { setResumeUploading(false); }
  };

  const handleSaveExperiences = async (experiences: Experience[]) => {
    setLocalExperiences(experiences);
    if (onSaveProfile) {
      await onSaveProfile({ experiences });
    } else if (fbUser) {
      // Fallback: direct write (no local state sync — use onSaveProfile when possible)
      await updateUserInFirestore(fbUser.uid, { experiences } as any);
    }
  };

  const handleSaveEducation = async (education: Education[]) => {
    setLocalEducation(education);
    if (onSaveProfile) {
      await onSaveProfile({ education });
    } else if (fbUser) {
      await updateUserInFirestore(fbUser.uid, { education } as any);
    }
  };

  const profileUid = (user as any)._firestoreUid ?? String(user.id);

  const memberSinceDate: Date | null = (() => {
    const raw = (user as any).createdAt;
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  })();

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
                  <svg className="h-7 w-7 animate-spin text-[var(--bw-green-mid)]" viewBox="0 0 24 24" fill="none">
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
                  className="absolute bottom-0 right-0 bg-[var(--bw-green)] p-1.5 rounded-full border-2 border-stone-200 hover:bg-[var(--bw-green-mid)] transition-colors"
                  title={t('playMicroIntro')}
                >
                  <PlayIcon className="w-4 h-4 text-stone-900" />
                </button>
              ) : isCurrentUser ? (
                <button
                  onClick={e => { e.stopPropagation(); onRecordVideo(); }}
                  className="absolute bottom-0 right-0 bg-stone-100 p-1.5 rounded-full border-2 border-stone-200 hover:bg-stone-200 transition-colors"
                  title={t('recordMicroIntro')}
                >
                  <CameraIcon className="w-4 h-4 text-stone-700" />
                </button>
              ) : null
            )}
          </div>

          {isCurrentUser && (
            <div className="mb-2 -mt-2">
              {avatarError ? (
                <p className="text-xs text-red-600 text-center">{avatarError}</p>
              ) : (
                <p className="text-xs text-stone-600 text-center">Click photo to change</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-center space-x-2">
            <h2 className="font-bold text-xl text-stone-900 break-words">{user.name}</h2>
            {user.isVerified && <VerifiedIcon className="w-5 h-5 text-[var(--bw-green-mid)]" title="Verified Work Email" />}
          </div>

          {/* User type indicator — isRecruiter (existing field) already
              covers Company/Organization accounts; builderType (new) only
              needs to split Professional vs Pre-Founder for everyone else. */}
          <div className="mt-1.5 flex items-center justify-center">
            {(user as any).isRecruiter ? (
              <span className="inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: 'var(--bw-green-light)', color: 'var(--bw-green-mid)' }}>
                Company
              </span>
            ) : isCurrentUser ? (
              <div className="inline-flex rounded-full border p-0.5" style={{ borderColor: '#e7e5e4' }}>
                {BUILDER_TYPE_OPTIONS.map(opt => {
                  const active = (user.builderType ?? 'Professional') === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => onSaveProfile?.({ builderType: opt })}
                      className="text-xs font-semibold rounded-full px-2.5 py-0.5 transition-colors"
                      style={active
                        ? { backgroundColor: 'var(--bw-green)', color: 'white' }
                        : { backgroundColor: 'transparent', color: '#57534e' }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: '#f5f5f4', color: '#57534e' }}>
                {user.builderType ?? 'Professional'}
              </span>
            )}
          </div>

          <p className="text-sm text-stone-600 mt-1 break-words">{user.headline}</p>

          {/* Location — new field, absent from User entirely until now */}
          {isCurrentUser ? (
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-stone-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <input
                type="text"
                value={locationInput}
                onChange={e => setLocationInput(e.target.value)}
                onBlur={handleLocationBlur}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Add your city and country"
                className="text-sm text-center bg-transparent border-b border-dashed text-stone-700 focus:outline-none focus:border-[var(--bw-green)] placeholder:text-stone-600"
                style={{ borderColor: '#d6d3cd' }}
              />
            </div>
          ) : user.location ? (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-stone-600">
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {user.location}
            </p>
          ) : null}

          <p className="text-stone-700 text-sm mt-4 break-words">{user.bio}</p>

          {/* Share public profile — owner only */}
          {isCurrentUser && (user as any).username && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                style={{ backgroundColor: 'var(--bw-green)' }}
                title="Share your public profile"
              >
                <ShareIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
                Share profile
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowShareInfo(v => !v)}
                  onBlur={() => setTimeout(() => setShowShareInfo(false), 150)}
                  aria-label="About sharing your profile"
                  aria-expanded={showShareInfo}
                  className="flex h-8 w-8 items-center justify-center rounded-full border text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  style={{ borderColor: '#e7e5e4' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </button>
                {showShareInfo && (
                  <div
                    className="absolute left-1/2 top-10 z-20 w-60 -translate-x-1/2 rounded-xl border bg-white p-3 text-left shadow-lg"
                    style={{ borderColor: '#e7e5e4' }}
                  >
                    <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t bg-white" style={{ borderColor: '#e7e5e4' }} />
                    <p className="text-xs font-semibold text-stone-800 mb-1">About your public profile</p>
                    <p className="text-xs leading-relaxed text-stone-600">
                      Anyone with your link can view a read-only version of your verified profile — no login required. Manage visibility anytime in Security &amp; Privacy.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {isCurrentUser && onImportLinkedIn && (
            <button
              onClick={onImportLinkedIn}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors hover:bg-stone-100"
              style={{ borderColor: '#e7e5e4', color: '#57534e' }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Import from LinkedIn
            </button>
          )}

          {!isCurrentUser && onReportUser && (
            <button
              onClick={() => onReportUser(user._firestoreUid ?? String(user.id), user.name)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors hover:bg-stone-100"
              style={{ borderColor: '#e7e5e4', color: '#57534e' }}
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
            <StatItem icon={<CoinsIcon className="w-5 h-5" />} label="Credits" value={user.credits} valueClassName="text-yellow-800" />
            <StatItem icon={<UsersIcon className="w-5 h-5" />} label="Connections" value={connectionCount} valueClassName="text-[var(--bw-green-mid)]" />
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
        {/* Skills Tile — with inline add/remove for owner */}
        <div className="bg-white/50 rounded-xl border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-stone-800 text-sm flex items-center gap-1.5">
              {user.verifiedSkills?.length
                ? <><VerifiedIcon className="w-4 h-4 text-[var(--bw-green-mid)]" /> {t('verifiedSkills')}</>
                : t('topSkills')}
            </h3>
            {isCurrentUser && (
              <button
                onClick={onGenerateSkills}
                className="text-xs font-semibold hover:opacity-70 transition-opacity flex items-center gap-1"
                style={{ color: 'var(--bw-green-mid)' }}
                title="Verify skills with AI"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                Verify
              </button>
            )}
          </div>

          {/* Existing skills chips */}
          {user.verifiedSkills?.length ? (
            <div className="space-y-2.5 mb-3">
              {user.verifiedSkills.map((skill: any) => (
                <div key={skill.name} className="group relative">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-medium text-stone-700">{skill.name}</p>
                    <p className="text-xs text-stone-600">{skill.proficiency}</p>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-1.5">
                    <div className={`bg-[var(--bw-green)] h-1.5 rounded-full ${proficiencyWidth[skill.proficiency]}`} />
                  </div>
                  <div className="absolute left-0 bottom-6 w-full p-2 text-xs bg-stone-50 border border-stone-200 rounded-md text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <span className="font-bold">{t('evidence')}</span> {skill.evidence}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(user.skills ?? []).length === 0 && (
                <p className="text-sm text-stone-600">
                  {isCurrentUser ? "No skills yet — add what you're good at so people can find you for it." : 'No skills listed yet.'}
                </p>
              )}
              {(user.skills ?? []).map((skill: any) => {
                const name = typeof skill === 'string' ? skill : skill?.name ?? '';
                if (!name) return null;
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 text-sm bg-[var(--bw-green-light)]/60 text-[var(--bw-green-mid)] rounded-full px-3 py-1 font-medium border border-[var(--bw-green)]/20"
                  >
                    {name}
                    {typeof skill !== 'string' && (skill.endorsements ?? 0) > 0 && (
                      <span className="text-xs font-semibold text-[var(--bw-green-mid)]">{skill.endorsements}</span>
                    )}
                    {isCurrentUser && onRemoveSkill && (
                      <button
                        onClick={() => onRemoveSkill(name)}
                        className="ml-0.5 text-[var(--bw-green-mid)]/50 hover:text-red-600 transition-colors"
                        aria-label={`Remove ${name}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {/* Inline add-skill input — owner only */}
          {isCurrentUser && onAddSkill && (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && skillInput.trim()) {
                    e.preventDefault();
                    onAddSkill(skillInput.trim());
                    setSkillInput('');
                  }
                }}
                placeholder="Add a skill…"
                className="flex-1 min-w-0 text-sm border rounded-xl px-3 py-2 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[var(--bw-green)]/30"
                style={{ borderColor: '#e7e5e4' }}
              />
              <button
                onClick={() => {
                  if (skillInput.trim()) { onAddSkill(skillInput.trim()); setSkillInput(''); }
                }}
                disabled={!skillInput.trim()}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: 'var(--bw-green)' }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Trust Reputation Panel — full domain breakdown */}
        <ReputationPanel uid={profileUid} isOwn={isCurrentUser} />

        {/* Execution Record — replaces the old minimal "Circles Tile" (just
            colored initials) with named, clickable pods, real Factory
            projects pulled cross-app from bewatu-factory (shared Firebase
            project), plus — owner only, see the effect above for why — a
            real list of Arena submissions with outcome. Pods and Factory
            projects stay visible to visitors since neither is
            access-restricted the way submissions are. */}
        <div className="bg-white/50 rounded-xl border border-stone-200 p-5">
          <h3 className="font-semibold text-stone-800 text-sm mb-1">Execution Record</h3>
          <p className="text-xs text-stone-600 mb-4">
            {memberSinceDate && `Member since ${memberSinceDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · `}
            {userCircles.length} pod{userCircles.length !== 1 ? 's' : ''}
            {!factoryLoading && `, ${factoryProjects.length} Factory project${factoryProjects.length !== 1 ? 's' : ''}`}
            {isCurrentUser && !arenaLoading && `, ${arenaSubmissions.length} Arena submission${arenaSubmissions.length !== 1 ? 's' : ''}`}
          </p>

          <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">Pods</p>
          {userCircles.length === 0 ? (
            <p className="text-sm text-stone-600 mb-4">
              {isCurrentUser ? 'No pods yet — join one from Community to start building with others.' : 'No pods yet.'}
            </p>
          ) : (
            <div className="space-y-1 mb-4">
              {userCircles.map(circle => (
                <button
                  key={circle.id}
                  onClick={() => onSelectCircle(circle.id)}
                  className="w-full flex items-center gap-2.5 text-left rounded-lg px-2 py-1.5 hover:bg-stone-100 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                    style={{ backgroundColor: getCircleColor(circle.name) }}>
                    {circle.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-stone-800 truncate">{circle.name}</span>
                  {circle.adminId === user.id && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-600 ml-auto flex-shrink-0">Admin</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">Factory Projects</p>
          {factoryLoading ? (
            <p className="text-sm text-stone-600 mb-4">Loading…</p>
          ) : factoryProjects.length === 0 ? (
            <p className="text-sm text-stone-600 mb-4">
              {isCurrentUser ? 'No Factory projects yet — graduate a team to a project in Factory to show it here.' : 'No Factory projects yet.'}
            </p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {factoryProjects.map(project => (
                <div key={project.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <span className="flex-1 min-w-0 truncate text-sm text-stone-800">{project.name}</span>
                  <span className="text-xs font-semibold rounded-full px-2 py-0.5 flex-shrink-0"
                    style={{ backgroundColor: project.status === 'launched' ? 'var(--bw-green-light)' : '#f5f5f4', color: project.status === 'launched' ? 'var(--bw-green-mid)' : '#57534e' }}>
                    {FACTORY_PROJECT_STATUS_LABEL[project.status]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isCurrentUser && (
            <>
              <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">Arena Submissions</p>
              {arenaLoading ? (
                <p className="text-sm text-stone-600">Loading…</p>
              ) : arenaSubmissions.length === 0 ? (
                <p className="text-sm text-stone-600">No Arena submissions yet — find a challenge that matches your skills.</p>
              ) : (
                <div className="space-y-1.5">
                  {arenaSubmissions.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 min-w-0 truncate text-stone-800">{sub.challengeTitle}</span>
                      <span className="text-xs font-semibold rounded-full px-2 py-0.5 flex-shrink-0"
                        style={{ backgroundColor: ARENA_STATUS[sub.status].bg, color: ARENA_STATUS[sub.status].color }}>
                        {ARENA_STATUS[sub.status].label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Availability & Intent — availability is a real, pre-existing User
            field (scored in CareerIntelligence's profile-strength calc,
            shown to recruiters in TalentPipeline, used in ConnectionsView's
            complementary-matching score) that had no editor anywhere until
            now, so it sat permanently blank for every real user. openTo is
            new, same save pattern as skills below. */}
        <div className="bg-white/50 rounded-xl border border-stone-200 p-5">
          <h3 className="font-semibold text-stone-800 text-sm mb-3">Availability & Intent</h3>

          {isCurrentUser ? (
            <>
              <label className="text-xs font-medium text-stone-600 mb-1 block">Availability</label>
              <select
                value={user.availability}
                onChange={e => onSaveProfile?.({ availability: e.target.value })}
                className="w-full text-sm border rounded-xl px-3 py-2 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[var(--bw-green)]/30 mb-4"
                style={{ borderColor: '#e7e5e4' }}
              >
                {AVAILABILITY_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              <label className="text-xs font-medium text-stone-600 mb-2 block">Open to</label>
              <div className="flex flex-wrap gap-1.5">
                {OPEN_TO_OPTIONS.map(opt => {
                  const active = (user.openTo ?? []).includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const current = user.openTo ?? [];
                        const next = active ? current.filter(o => o !== opt) : [...current, opt];
                        onSaveProfile?.({ openTo: next });
                      }}
                      className="text-sm rounded-full px-3 py-1 font-medium border transition-colors"
                      style={active
                        ? { backgroundColor: 'var(--bw-green-light)', color: 'var(--bw-green-mid)', borderColor: 'var(--bw-green)' }
                        : { backgroundColor: 'transparent', color: '#57534e', borderColor: '#e7e5e4' }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {user.availability && user.availability !== 'Not looking' && (
                <p className="text-sm text-stone-700 mb-2">{user.availability}</p>
              )}
              {(user.openTo ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(user.openTo ?? []).map(opt => (
                    <span key={opt} className="text-sm rounded-full px-3 py-1 font-medium"
                      style={{ backgroundColor: 'var(--bw-green-light)', color: 'var(--bw-green-mid)' }}>
                      {opt}
                    </span>
                  ))}
                </div>
              ) : (!user.availability || user.availability === 'Not looking') && (
                <p className="text-sm text-stone-600">Hasn't shared what they're open to yet.</p>
              )}
            </>
          )}
        </div>

        {/* Links — real work, not a bio. thirdPartyIntegrations is a real,
            pre-existing User field already read by CandidateDetailView but
            with no editor anywhere, so it saved empty at signup and stayed
            blank for every real user. */}
        <div className="bg-white/50 rounded-xl border border-stone-200 p-5">
          <h3 className="font-semibold text-stone-800 text-sm mb-3">Links</h3>

          {links.length === 0 ? (
            <p className="text-sm text-stone-600 mb-3">
              {isCurrentUser ? "No links yet — add your GitHub, portfolio, or other work to show real work." : "Hasn't added any links yet."}
            </p>
          ) : (
            <div className="space-y-1.5 mb-3">
              {links.map(link => (
                <div key={link.platform} className="flex items-center gap-2">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 flex items-center gap-2 text-sm rounded-lg px-2.5 py-1.5 hover:bg-stone-100 transition-colors"
                  >
                    <span className="font-semibold text-stone-800 flex-shrink-0">{link.platform}</span>
                    <span className="text-stone-600 truncate">{link.url.replace(/^https?:\/\//i, '')}</span>
                  </a>
                  {isCurrentUser && (
                    <button
                      onClick={() => handleRemoveLink(link.platform)}
                      aria-label={`Remove ${link.platform} link`}
                      className="flex-shrink-0 text-stone-600 hover:text-red-600 text-xs font-semibold px-2"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isCurrentUser && availableLinkPlatforms.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={newLinkPlatform}
                onChange={e => setNewLinkPlatform(e.target.value as ThirdPartyIntegration['platform'])}
                className="text-sm border rounded-lg px-2 py-1.5 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[var(--bw-green)]/30 flex-shrink-0"
                style={{ borderColor: '#e7e5e4' }}
              >
                {availableLinkPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                type="text"
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddLink(); }}
                placeholder="your-profile-url.com"
                className="flex-1 min-w-0 text-sm border rounded-lg px-3 py-1.5 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[var(--bw-green)]/30"
                style={{ borderColor: '#e7e5e4' }}
              />
              <button
                onClick={handleAddLink}
                disabled={!newLinkUrl.trim()}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                style={{ backgroundColor: 'var(--bw-green)', color: 'white' }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Resume Upload */}
        {isCurrentUser && (
          <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: '#e7e5e4' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: 'var(--bw-green)' }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">Resume</h3>
                  <p className="text-xs text-stone-600">PDF or Word · max 10 MB</p>
                </div>
              </div>
              <button
                onClick={() => resumeInputRef.current?.click()}
                disabled={resumeUploading}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: 'var(--bw-green)' }}>
                {resumeUploading ? (
                  <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Uploading…</>
                ) : (user as any).resumeUrl ? 'Update' : 'Upload'}
              </button>
              <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeChange} />
            </div>
            {resumeUploadSuccess && (
              <p className="mt-2 text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--bw-green-mid)' }}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Resume uploaded — extract your profile info below, or view it anytime.
              </p>
            )}
            {(user as any).resumeUrl && !resumeUploading && (
              <a href={(user as any).resumeUrl} target="_blank" rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#e7e5e4', color: 'var(--bw-green-mid)' }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                View uploaded resume
              </a>
            )}
            {(user as any).resumeUrl && !resumeUploading && onImportResume && (
              <button onClick={onImportResume}
                className="mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-stone-50 transition-colors w-full"
                style={{ borderColor: '#e7e5e4', color: '#57534e' }}>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Extract profile info from this resume
              </button>
            )}
            {resumeError && <p className="mt-2 text-xs text-red-600">{resumeError}</p>}
          </div>
        )}

        {/* Experience */}
        <ExperienceSection
          experiences={localExperiences}
          isOwn={isCurrentUser}
          onSave={handleSaveExperiences}
        />

        {/* Education */}
        <EducationSection
          education={localEducation}
          isOwn={isCurrentUser}
          onSave={handleSaveEducation}
        />

        {/* ── Skill-based resume — owner only, reuses all existing profile data ── */}
        <SkillResume
          user={user as any}
          isOwn={isCurrentUser}
        />

        <SkillDNA
          user={user}
          profileUid={(user as any)._firestoreUid ?? String(user.id)}
          isOwn={isCurrentUser}
          currentUserUid={fbUser?.uid}
          onEndorsed={() => {}}
        />

        {/* ── AI-era proof features ── */}
        {/* FEATURE 2 — Skills Trajectory (owner-only personal guidance) */}
        <SkillsTrajectory
          profileUid={profileUid}
          isOwn={isCurrentUser}
          skills={
            (user.verifiedSkills?.length
              ? user.verifiedSkills.map((s: any) => (typeof s === 'string' ? s : s?.name ?? '')).filter(Boolean)
              : (user.skills ?? []).map((s: any) => (typeof s === 'string' ? s : s?.name ?? '')).filter(Boolean)
            )
          }
          industry={user.industry}
        />
        {/* FEATURE 1 — AI Workflows (public proof surface) */}
        <AIWorkflowShowcase
          profileUid={profileUid}
          isOwn={isCurrentUser}
          currentUserUid={fbUser?.uid}
        />
        {/* FEATURE 3 — Learning Log (public proof surface, persistent) */}
        <LearningLog
          profileUid={profileUid}
          isOwn={isCurrentUser}
          authorName={user.name}
        />

        {/* ── Followed companies (owner only, mobile entry point) ── */}
        {isCurrentUser && followedCompanies.length > 0 && (
          <div className="bg-white/50 rounded-xl border border-stone-200 p-5">
            <h3 className="font-semibold text-stone-800 text-sm mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Companies you follow
            </h3>
            <div className="space-y-2">
              {followedCompanies.map((co: any) => (
                <button
                  key={co.id}
                  onClick={() => onViewCompany?.(co.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-stone-100 transition-colors text-left"
                >
                  {co.logoUrl ? (
                    <img src={co.logoUrl} alt={co.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-stone-200" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
                      style={{ backgroundColor: 'var(--bw-green)' }}>
                      {(co.name ?? 'C')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{co.name}</p>
                    {co.industry && <p className="text-xs text-stone-600 truncate">{co.industry}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Public profile URL (owner only) ── */}
        {isCurrentUser && (user as any).username && (
          <div className="bg-white/50 rounded-xl border border-stone-200 p-5">
            <h3 className="font-semibold text-stone-800 text-sm mb-2 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Your public profile
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-600 truncate flex-1">
                bewatu.com/be/{(user as any).username}
              </span>
              <button
                onClick={() => {
                  const url = `https://www.bewatu.com/be/${(user as any).username}`;
                  navigator.clipboard?.writeText(url).catch(() => {});
                  window.open(url, '_blank', 'noopener');
                }}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-stone-100"
                style={{ borderColor: '#e7e5e4', color: 'var(--bw-green)' }}
              >
                Open
              </button>
            </div>
          </div>
        )}

        {/* ── Email signature icon (owner only) ── */}
        {isCurrentUser && (
          <div className="bg-white/50 rounded-xl border border-stone-200 p-5">
            <div className="flex items-center gap-4">
              <img
                src="/android-chrome-512x512.png"
                alt="BeWatu icon"
                className="w-12 h-12 flex-shrink-0 rounded-lg border border-stone-200 bg-white"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-stone-800 text-sm">Email signature icon</h3>
                <p className="text-xs text-stone-600">A transparent PNG you can drop into your mail signature</p>
              </div>
              <a
                href="/android-chrome-512x512.png"
                download="bewatu-icon.png"
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-stone-100"
                style={{ borderColor: '#e7e5e4', color: 'var(--bw-green)' }}
              >
                Download
              </a>
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
              <div className="flex h-9 w-9 items-center justify-center rounded-xl text-white flex-shrink-0" style={{ backgroundColor: 'var(--bw-green)' }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div className="text-left">
                <p className="font-bold text-stone-900 text-sm">Security & Privacy</p>
                <p className="text-xs text-stone-600">Password, visibility, connection settings</p>
              </div>
            </div>
            <svg className="w-4 h-4 text-stone-600 group-hover:text-stone-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}
      </div>
      {/* Share public profile modal */}
      {showShareModal && (user as any).username && (
        <ShareProfileModal
          username={(user as any).username}
          name={user.name}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
};

export default ProfilePage;
