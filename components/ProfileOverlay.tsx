/**
 * components/ProfileOverlay.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-contained full-screen overlay for viewing another user's profile.
 *
 * Root cause of the original bug:
 *   data.users only holds the top-50 isPublic:true users fetched at login.
 *   The old code did data.users.find(u => u.id === userId) and immediately
 *   showed "User not found" for anyone outside that set. This component
 *   falls back to a direct Firestore query by numericId when the cache misses.
 *
 * Previously the "public" render path delegated to a prop called
 * PublicProfilePageComponent — but that prop was being passed the
 * /be/:username sharing page (PublicSharePage) which expects a completely
 * different interface, causing it to always render "profile not found".
 * This component is now fully self-contained and renders profiles inline.
 *
 * Privacy rules:
 *   public  → full profile: avatar, name, headline, bio, skills + all actions
 *   private → avatar + name only + "This user's profile is private"
 *              + ONLY "Request to Connect" (no message, no follow)
 *   missing → brief not-found message
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

function initials(name: string) {
  return (name ?? '').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─────────────────────────────────────────────────────────────────────────────
// Back button — shared
// ─────────────────────────────────────────────────────────────────────────────

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack}
      className="flex items-center gap-1.5 text-sm font-semibold mb-5 hover:opacity-70 transition-opacity"
      style={{ color: GREEN }}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
      </svg>
      Back
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-xl mx-auto pt-8 px-4">
      <BackBtn onBack={onBack} />
      <div className="bg-white rounded-2xl border p-6 animate-pulse" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-20 h-20 rounded-2xl bg-stone-100 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-stone-100 rounded-lg w-36" />
            <div className="h-3 bg-stone-100 rounded-lg w-52" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-stone-100 rounded-lg w-full" />
          <div className="h-3 bg-stone-100 rounded-lg w-3/4" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Private profile view
// ─────────────────────────────────────────────────────────────────────────────

function PrivateProfileView({ user, onBack, onConnect, alreadyConnected }: {
  user: ResolvedUser;
  onBack: () => void;
  onConnect: () => void;
  alreadyConnected: boolean;
}) {
  return (
    <div className="max-w-xl mx-auto pt-8 px-4">
      <BackBtn onBack={onBack} />
      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        {/* Green header strip */}
        <div className="h-20 w-full" style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #1a6b52 100%)` }} />
        <div className="px-6 pb-7">
          {/* Avatar */}
          <div className="-mt-10 mb-4">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name}
                className="w-20 h-20 rounded-2xl border-4 border-white object-cover shadow-md" />
            ) : (
              <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: '#0d9488' }}>
                {initials(user.name)}
              </div>
            )}
          </div>
          <h1 className="text-lg font-bold text-stone-900">{user.name}</h1>
          {user.headline && <p className="text-sm text-stone-500 mt-0.5">{user.headline}</p>}

          {/* Privacy notice */}
          <div className="mt-4 flex items-start gap-3 rounded-xl p-3" style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4' }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <p className="text-sm text-stone-600 leading-relaxed">This user's profile is private.</p>
          </div>

          {/* Only allowed action */}
          <div className="mt-5">
            {alreadyConnected ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl"
                style={{ backgroundColor: GREEN_LT, color: GREEN }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                Connected
              </span>
            ) : (
              <button onClick={onConnect}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                </svg>
                Request to Connect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public profile view (self-contained — no external component dependency)
// ─────────────────────────────────────────────────────────────────────────────

function PublicProfileView({ user, isConnected, isFollowing, onBack, onConnect, onFollow, onMessage }: {
  user: ResolvedUser;
  isConnected: boolean;
  isFollowing: boolean;
  onBack: () => void;
  onConnect: () => void;
  onFollow: () => void;
  onMessage: () => void;
}) {
  const skills: string[] = [
    ...(user.verifiedSkills ?? []).map((s: any) => (typeof s === 'string' ? s : s?.name ?? '')),
    ...(user.skills ?? []).map((s: any) => (typeof s === 'string' ? s : s?.name ?? '')),
  ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 12); // unique, max 12

  return (
    <div className="max-w-xl mx-auto pt-8 px-4 pb-10">
      <BackBtn onBack={onBack} />
      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        {/* Gradient header */}
        <div className="h-24 w-full" style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #1a6b52 50%, #0d9488 100%)` }} />
        <div className="px-6 pb-7">
          {/* Avatar */}
          <div className="flex items-end justify-between -mt-10 mb-3">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name}
                className="w-20 h-20 rounded-2xl border-4 border-white object-cover shadow-md flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                style={{ backgroundColor: '#0d9488' }}>
                {initials(user.name)}
              </div>
            )}
          </div>

          {/* Name + headline */}
          <h1 className="text-xl font-bold text-stone-900">{user.name}</h1>
          {user.headline && <p className="text-sm text-stone-600 mt-0.5">{user.headline}</p>}
          {user.industry && <p className="text-xs text-stone-400 mt-0.5">{user.industry}</p>}

          {/* Availability */}
          {user.availability && user.availability !== 'Not specified' && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border"
              style={{ backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              {user.availability}
            </span>
          )}

          {/* Bio */}
          {user.bio && (
            <p className="mt-3 text-sm text-stone-600 leading-relaxed">{user.bio}</p>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                {(user.verifiedSkills ?? []).length > 0 ? 'Verified Skills' : 'Skills'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map(s => (
                  <span key={s} className="text-xs font-medium rounded-full px-2.5 py-1"
                    style={{ backgroundColor: GREEN_LT, color: GREEN }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex flex-wrap gap-2.5 border-t pt-4" style={{ borderColor: '#f0efee' }}>
            {!isConnected ? (
              <button onClick={onConnect}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                </svg>
                Connect
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl"
                style={{ backgroundColor: GREEN_LT, color: GREEN }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                Connected
              </span>
            )}
            {isConnected && (
              <button onClick={onMessage}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold border hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#e7e5e4', color: '#374151' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                Message
              </button>
            )}
            <button onClick={onFollow}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold border hover:bg-stone-50 transition-colors"
              style={{ borderColor: '#e7e5e4', color: isFollowing ? GREEN : '#374151' }}>
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

type Status = 'loading' | 'found-public' | 'found-private' | 'not-found';

interface ResolvedUser {
  id: number;
  name: string;
  headline?: string;
  bio?: string;
  avatarUrl?: string;
  industry?: string;
  availability?: string;
  skills?: any[];
  verifiedSkills?: any[];
  isPublic: boolean;
  [key: string]: any;
}

export interface ProfileOverlayProps {
  userId: number;
  cachedUsers: any[];
  currentUserId: number;
  connectionRequests: any[];
  followedUserIds: Set<number>;
  onBack: () => void;
  onConnect: (numericId: number) => void;
  onFollow: (numericId: number) => void;
  onMessage: (numericId: number) => void;
  onPlayVideo: (url: string) => void;
  onViewCompany: (companyId: any) => void;
}

const ProfileOverlay: React.FC<ProfileOverlayProps> = ({
  userId, cachedUsers, currentUserId, connectionRequests,
  followedUserIds, onBack, onConnect, onFollow, onMessage,
}) => {
  const [status,  setStatus]  = useState<Status>('loading');
  const [profile, setProfile] = useState<ResolvedUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setProfile(null);

    async function resolve() {
      // Fast path: already in the top-50 cache
      const cached = cachedUsers.find((u: any) => Number(u.id) === userId);
      if (cached) {
        if (!cancelled) {
          setProfile(cached);
          setStatus((cached as any).isPublic === false ? 'found-private' : 'found-public');
        }
        return;
      }

      // Slow path: query Firestore by numericId
      // The Firestore rule allows any authenticated user to read any user doc,
      // so this works for both public and private profiles.
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('numericId', '==', userId), limit(1))
        );
        if (cancelled) return;
        if (snap.empty) { setStatus('not-found'); return; }

        const d    = snap.docs[0];
        const data = d.data();
        const user: ResolvedUser = {
          ...data,
          id:             typeof data.numericId === 'number' ? data.numericId : Number(data.numericId) || userId,
          name:           data.displayName ?? '',
          headline:       data.headline    ?? '',
          bio:            data.bio         ?? '',
          avatarUrl:      data.photoURL    ?? '',
          industry:       data.industry    ?? '',
          availability:   data.availability ?? '',
          skills:         data.skills      ?? [],
          verifiedSkills: data.verifiedSkills ?? null,
          isPublic:       data.isPublic    ?? false,
          _firestoreUid:  d.id,
        };
        setProfile(user);
        setStatus(user.isPublic === false ? 'found-private' : 'found-public');
      } catch (err) {
        console.error('[ProfileOverlay] Firestore fetch failed:', err);
        if (!cancelled) setStatus('not-found');
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [userId]);

  const isConn = connectionRequests.some((r: any) =>
    r.status === 'accepted' &&
    ((r.fromUserId === currentUserId && r.toUserId === userId) ||
     (r.toUserId   === currentUserId && r.fromUserId === userId))
  );

  if (status === 'loading') return <LoadingSkeleton onBack={onBack} />;

  if (status === 'not-found') return (
    <div className="max-w-xl mx-auto pt-8 px-4">
      <BackBtn onBack={onBack} />
      <p className="text-stone-500 text-sm">This profile could not be found.</p>
    </div>
  );

  if (status === 'found-private' && profile) return (
    <PrivateProfileView
      user={profile}
      onBack={onBack}
      onConnect={() => onConnect(profile.id)}
      alreadyConnected={isConn}
    />
  );

  if (status === 'found-public' && profile) return (
    <PublicProfileView
      user={profile}
      isConnected={isConn}
      isFollowing={followedUserIds.has(userId)}
      onBack={onBack}
      onConnect={() => onConnect(profile.id)}
      onFollow={() => onFollow(profile.id)}
      onMessage={() => onMessage(profile.id)}
    />
  );

  return null;
};

export default ProfileOverlay;
