/**
 * components/PublicProfilePage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders at /be/:username — no auth required.
 *
 * Three states:
 *   loading   — fetching from Firestore
 *   public    — full profile (name, headline, skills, bio, verified badge)
 *   private   — branded gate (profile exists but isPublic: false)
 *   not-found — no user with that username
 *
 * Mounted by App.tsx when window.location.pathname matches /be/:username.
 * Unauthenticated visitors see the public profile or gate + signup CTA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import { fetchPublicProfileByUsername } from '../lib/firebaseAuth';

const GREEN     = '#1a4a3a';
const GREEN_LT  = '#e8f4f0';
const GREEN_MID = '#1a6b52';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'BW';
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f5f4' }}>
      {/* Minimal nav */}
      <nav className="bg-white border-b" style={{ borderColor: '#e7e5e4' }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="font-bold text-base tracking-tight" style={{ color: GREEN }}>BeWatu</a>
          <a href="/" className="rounded-xl px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}>
            Sign up free
          </a>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-4 py-10">
        {children}
      </main>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <Shell>
      <div className="bg-white rounded-2xl border p-6 animate-pulse" style={{ borderColor: '#e7e5e4' }}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-stone-100 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-stone-100 rounded-lg w-40" />
            <div className="h-3 bg-stone-100 rounded-lg w-56" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-stone-100 rounded-lg w-full" />
          <div className="h-3 bg-stone-100 rounded-lg w-4/5" />
        </div>
      </div>
    </Shell>
  );
}

// ── Not-found / private gate ──────────────────────────────────────────────────

function GatePage({ mode, username }: { mode: 'private' | 'not-found'; username: string }) {
  return (
    <Shell>
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
        {/* Decorative top strip */}
        <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${GREEN} 0%, ${GREEN_MID} 100%)` }} />

        <div className="px-8 py-12 text-center">
          {/* Icon */}
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: GREEN_LT }}>
            {mode === 'private' ? (
              <svg className="w-7 h-7" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            ) : (
              <svg className="w-7 h-7" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            )}
          </div>

          <h1 className="text-xl font-bold text-stone-900 mb-2">
            {mode === 'private'
              ? `@${username} keeps their profile private`
              : `@${username} isn't on BeWatu yet`}
          </h1>
          <p className="text-stone-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            {mode === 'private'
              ? 'This person has chosen to keep their profile private. Sign up to connect with professionals who share your goals.'
              : 'This profile link doesn\'t match an active BeWatu account. Join to build your own verified professional presence.'}
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/?signup=1"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: GREEN }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
              </svg>
              Join BeWatu free
            </a>
            <a href="/"
              className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold border transition hover:bg-stone-50"
              style={{ borderColor: '#e7e5e4', color: '#374151' }}>
              Learn more
            </a>
          </div>
        </div>

        {/* Footer — what BeWatu is */}
        <div className="px-8 py-6 border-t" style={{ borderColor: '#f0efee', backgroundColor: '#fafaf9' }}>
          <p className="text-xs text-stone-500 text-center leading-relaxed">
            BeWatu is a professional network where your capabilities speak louder than your CV.
            Verified skills, live challenges, and real communities — built for the skills economy.
          </p>
        </div>
      </div>
    </Shell>
  );
}

// ── Public profile card ───────────────────────────────────────────────────────

function PublicProfileCard({ profile, firestoreUid, onSignUp }: {
  profile: Record<string, any>;
  firestoreUid: string;
  onSignUp: () => void;
}) {
  const name     = profile.displayName ?? '';
  const headline = profile.headline ?? '';
  const bio      = profile.bio ?? '';
  const avatar   = profile.photoURL ?? '';
  const industry = profile.industry ?? '';
  const skills: any[]        = profile.skills ?? [];
  const verifiedSkills: any[] = profile.verifiedSkills ?? [];
  const availability = profile.availability ?? '';

  return (
    <Shell>
      <div className="space-y-4">
        {/* Main card */}
        <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: '#e7e5e4' }}>
          {/* Gradient header strip */}
          <div className="h-24 w-full relative"
            style={{ background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_MID} 50%, #0d9488 100%)` }}>
            {/* Avatar — overlaps strip */}
            <div className="absolute -bottom-9 left-6">
              {avatar ? (
                <img src={avatar} alt={name}
                  className="w-20 h-20 rounded-2xl border-4 border-white object-cover shadow-md" />
              ) : (
                <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-xl font-bold text-white"
                  style={{ backgroundColor: '#0d9488' }}>
                  {initials(name)}
                </div>
              )}
            </div>
          </div>

          <div className="pt-12 pb-6 px-6">
            {/* Name + headline */}
            <div className="mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-stone-900">{name}</h1>
                {verifiedSkills.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: GREEN_LT, color: GREEN_MID }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                    </svg>
                    Verified skills
                  </span>
                )}
              </div>
              {headline && <p className="text-sm text-stone-600 mt-0.5">{headline}</p>}
              {industry && <p className="text-xs text-stone-400 mt-0.5">{industry}</p>}
            </div>

            {/* Availability pill */}
            {availability && availability !== 'Not specified' && (
              <div className="mt-3 mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border"
                  style={{ backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  {availability}
                </span>
              </div>
            )}

            {/* Bio */}
            {bio && (
              <p className="text-sm text-stone-600 leading-relaxed mt-3 mb-4">{bio}</p>
            )}

            {/* Verified skills */}
            {verifiedSkills.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Verified Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {verifiedSkills.slice(0, 8).map((s: any) => (
                    <span key={s.name} className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1"
                      style={{ backgroundColor: GREEN_LT, color: GREEN_MID }}>
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                      {s.name}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-stone-400 mt-1.5">
                  Verified skills indicate evidence has been reviewed by BeWatu — not a substitute for due diligence.
                </p>
              </div>
            )}

            {/* Self-reported skills (if no verified) */}
            {verifiedSkills.length === 0 && skills.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {skills.slice(0, 8).map((s: any) => (
                    <span key={typeof s === 'string' ? s : s.name}
                      className="text-xs font-medium rounded-full px-2.5 py-1 bg-stone-100 text-stone-600">
                      {typeof s === 'string' ? s : s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="pt-4 border-t flex flex-col sm:flex-row gap-2.5 items-start sm:items-center justify-between"
              style={{ borderColor: '#f0efee' }}>
              <p className="text-xs text-stone-400">View {name.split(' ')[0]}'s full profile and connect on BeWatu</p>
              <button onClick={onSignUp}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
                style={{ backgroundColor: GREEN }}>
                Connect on BeWatu
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* "Join BeWatu" pitch card */}
        <div className="rounded-2xl border p-5" style={{ borderColor: '#e7e5e4', backgroundColor: '#fff' }}>
          <p className="text-sm font-semibold text-stone-800 mb-1">Want a profile like this?</p>
          <p className="text-xs text-stone-500 leading-relaxed mb-3">
            BeWatu is where professionals build verified capability records, take live challenges from real companies, and connect through intentional communities.
          </p>
          <a href="/?signup=1"
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}>
            Join free
          </a>
        </div>
      </div>
    </Shell>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type State =
  | { status: 'loading' }
  | { status: 'public'; profile: Record<string, any>; firestoreUid: string }
  | { status: 'private' }
  | { status: 'not-found' };

interface Props {
  username: string;
  onSignUp: () => void; // navigate to signup (App.tsx handles this)
}

const PublicProfilePage: React.FC<Props> = ({ username, onSignUp }) => {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    fetchPublicProfileByUsername(username).then(result => {
      if (!result.found) {
        setState({ status: 'not-found' });
      } else if (!result.isPublic) {
        setState({ status: 'private' });
      } else {
        setState({ status: 'public', profile: result.profile, firestoreUid: result.firestoreUid });
      }
    });
  }, [username]);

  if (state.status === 'loading')    return <LoadingSkeleton />;
  if (state.status === 'private')    return <GatePage mode="private"   username={username} />;
  if (state.status === 'not-found')  return <GatePage mode="not-found" username={username} />;

  return (
    <PublicProfileCard
      profile={state.profile}
      firestoreUid={state.firestoreUid}
      onSignUp={onSignUp}
    />
  );
};

export default PublicProfilePage;
