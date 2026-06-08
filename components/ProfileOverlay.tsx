/**
 * components/ProfileOverlay.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the full-screen overlay when a user clicks a profile in Circles or
 * Connections. Replaces the broken inline `data.users.find()` logic that
 * showed "User not found" for anyone outside the top-50 cached users.
 *
 * Fix for root cause:
 *   data.users only holds the top-50 isPublic:true users fetched at login.
 *   Any user outside that set — including connected users, pod members, and
 *   ALL private-profile users — caused an immediate "User not found" because
 *   the find() returned undefined. This component falls back to a direct
 *   Firestore query by numericId when the cache miss occurs.
 *
 * Privacy enforcement (as specified):
 *   - Public profile  → full PublicProfilePage with all actions
 *   - Private profile → name + avatar + "This profile is private" text
 *                        + "Request to Connect" only, no other actions
 *   - Truly not found → brief message (should be rare)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import {
  collection, getDocs, query, where, limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

function initials(name: string) {
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';
}

// ── Private profile view ──────────────────────────────────────────────────────

function PrivateProfileView({
  user,
  onBack,
  onConnect,
  alreadyConnected,
}: {
  user: { name: string; avatarUrl?: string; headline?: string };
  onBack: () => void;
  onConnect: () => void;
  alreadyConnected: boolean;
}) {
  return (
    <div className="max-w-lg mx-auto pt-10 px-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-semibold mb-6 hover:opacity-70 transition-opacity"
        style={{ color: GREEN }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: '#e7e5e4' }}>
        {/* Gradient header */}
        <div className="h-24 w-full" style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #1a6b52 100%)` }} />

        <div className="px-6 pb-8">
          {/* Avatar */}
          <div className="flex items-end gap-4 -mt-10 mb-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-20 h-20 rounded-2xl border-4 border-white object-cover shadow-md flex-shrink-0"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                style={{ backgroundColor: '#0d9488' }}
              >
                {initials(user.name)}
              </div>
            )}
          </div>

          <h1 className="text-xl font-bold text-stone-900">{user.name}</h1>
          {user.headline && <p className="text-sm text-stone-500 mt-0.5">{user.headline}</p>}

          {/* Privacy notice */}
          <div
            className="mt-4 flex items-start gap-3 rounded-xl p-3.5"
            style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4' }}
          >
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: '#78716c' }}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-sm text-stone-600 leading-relaxed">
              This user's profile is private. Only their name and picture are visible.
            </p>
          </div>

          {/* Single allowed action */}
          <div className="mt-6">
            {alreadyConnected ? (
              <p
                className="text-sm font-semibold rounded-xl px-5 py-2.5 inline-block"
                style={{ backgroundColor: GREEN_LT, color: GREEN }}
              >
                ✓ You're connected
              </p>
            ) : (
              <button
                onClick={onConnect}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
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

// ── Loading skeleton ──────────────────────────────────────────────────────────

function ProfileSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-lg mx-auto pt-10 px-4">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold mb-6 hover:opacity-70" style={{ color: GREEN }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <div className="bg-white rounded-2xl border p-6 animate-pulse" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-20 h-20 rounded-2xl bg-stone-100 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-stone-100 rounded-lg w-40" />
            <div className="h-3 bg-stone-100 rounded-lg w-60" />
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

// ── Main export ───────────────────────────────────────────────────────────────

type Status = 'loading' | 'found-public' | 'found-private' | 'not-found';

interface ResolvedUser {
  id: number;
  name: string;
  headline?: string;
  bio?: string;
  avatarUrl?: string;
  industry?: string;
  skills?: any[];
  verifiedSkills?: any[];
  availability?: string;
  isPublic: boolean;
  _firestoreUid?: string;
  [key: string]: any;
}

interface ProfileOverlayProps {
  /** Numeric id (numericId from Firestore) of the profile to show. */
  userId: number;
  /** Users already in App state — checked first as a fast-path cache. */
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
  /** The existing in-app PublicProfilePage (accepts user, isConnected, etc.) */
  PublicProfilePageComponent: React.ComponentType<any>;
}

const ProfileOverlay: React.FC<ProfileOverlayProps> = ({
  userId,
  cachedUsers,
  currentUserId,
  connectionRequests,
  followedUserIds,
  onBack,
  onConnect,
  onFollow,
  onMessage,
  onPlayVideo,
  onViewCompany,
  PublicProfilePageComponent,
}) => {
  const [status, setStatus]   = useState<Status>('loading');
  const [profile, setProfile] = useState<ResolvedUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setStatus('loading');
      setProfile(null);

      // 1. Fast path: already in the cached top-50
      const cached = cachedUsers.find((u: any) => u.id === userId);
      if (cached) {
        if (!cancelled) {
          setProfile(cached);
          setStatus((cached as any).isPublic === false ? 'found-private' : 'found-public');
        }
        return;
      }

      // 2. Slow path: fetch from Firestore by numericId.
      //    The Firestore rule allows any authenticated user to read any user doc,
      //    so this works regardless of the target's isPublic setting.
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users'),
            where('numericId', '==', userId),
            limit(1)
          )
        );
        if (cancelled) return;

        if (snap.empty) {
          setStatus('not-found');
          return;
        }

        const d    = snap.docs[0];
        const data = d.data();
        const user: ResolvedUser = {
          id:             data.numericId ?? userId,
          name:           data.displayName ?? '',
          headline:       data.headline    ?? '',
          bio:            data.bio         ?? '',
          avatarUrl:      data.photoURL    ?? '',
          industry:       data.industry    ?? '',
          skills:         data.skills      ?? [],
          verifiedSkills: data.verifiedSkills ?? null,
          availability:   data.availability ?? '',
          isPublic:       data.isPublic    ?? false,
          _firestoreUid:  d.id,
          // Pass through all remaining fields the PublicProfilePage might need
          ...data,
          // Ensure id is numeric (Firestore may return it as number already)
          id: typeof data.numericId === 'number' ? data.numericId : Number(data.numericId) || userId,
        };

        setProfile(user);
        setStatus(user.isPublic === false ? 'found-private' : 'found-public');
      } catch (err) {
        console.error('[ProfileOverlay] fetch failed:', err);
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

  if (status === 'loading') return <ProfileSkeleton onBack={onBack} />;

  if (status === 'not-found') {
    return (
      <div className="max-w-lg mx-auto pt-10 px-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold mb-6 hover:opacity-70" style={{ color: GREEN }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <p className="text-stone-500 text-sm">This profile could not be found.</p>
      </div>
    );
  }

  if (status === 'found-private' && profile) {
    return (
      <PrivateProfileView
        user={profile}
        onBack={onBack}
        onConnect={() => onConnect(profile.id)}
        alreadyConnected={isConn}
      />
    );
  }

  // Public profile — use the existing in-app PublicProfilePage component
  if (profile) {
    return (
      <PublicProfilePageComponent
        user={profile}
        isConnected={isConn}
        isFollowing={followedUserIds.has(userId)}
        onBack={onBack}
        onConnect={(uid: number) => onConnect(uid)}
        onFollow={onFollow}
        onViewCompany={onViewCompany}
        onMessage={(uid: number) => onMessage(uid)}
        onPlayVideo={onPlayVideo}
      />
    );
  }

  return null;
};

export default ProfileOverlay;
