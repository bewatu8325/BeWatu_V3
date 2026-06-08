import React from 'react';
import { LogoIcon } from '../constants';

const BG    = '#f0ede6';
const GREEN = '#1a4a3a';

interface ProfileUnavailablePageProps {
  /** The handle/username the visitor tried to open, e.g. "jdoe" (without the @). */
  handle?: string;
  /** True when the account exists but the profile is private. */
  isPrivate?: boolean;
  onSignUp: () => void;
  onLearnMore: () => void;
}

const IconPerson = () => (
  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M5.5 21a7.5 7.5 0 0 1 13 0" />
  </svg>
);

const IconUserPlus = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </svg>
);

const ProfileUnavailablePage: React.FC<ProfileUnavailablePageProps> = ({
  handle = 'this profile',
  isPrivate = false,
  onSignUp,
  onLearnMore,
}) => {
  const displayHandle = handle.startsWith('@') ? handle : `@${handle}`;
  const heading = isPrivate
    ? `${displayHandle}'s profile is private`
    : `${displayHandle} isn't on BeWatu yet`;
  const description = isPrivate
    ? 'This member keeps their profile private. Join BeWatu to connect and build your own verified professional presence.'
    : "This profile link doesn't match an active BeWatu account. Join to build your own verified professional presence.";

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ backgroundColor: BG }}>
      {/* NAV — matches the BeWatu landing header */}
      <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: BG, borderColor: '#e8e4dc' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <LogoIcon className="h-8 w-auto sm:h-9" style={{ color: GREEN }} />
          <button
            onClick={onSignUp}
            className="rounded-full px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity sm:px-5"
            style={{ backgroundColor: GREEN }}
          >
            Sign up free
          </button>
        </div>
      </header>

      {/* CARD */}
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:px-6">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl border bg-white shadow-sm"
          style={{ borderColor: '#e8e4dc' }}
        >
          {/* Green brand accent bar */}
          <div className="h-1.5 w-full" style={{ backgroundColor: GREEN }} />

          <div className="px-6 pt-10 pb-8 text-center sm:px-12 sm:pt-12">
            {/* Icon badge */}
            <div
              className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${GREEN}14` }}
            >
              <IconPerson />
            </div>

            <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 text-balance sm:text-3xl">
              {heading}
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-stone-500 leading-relaxed text-pretty">
              {description}
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={onSignUp}
                className="flex w-full items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-white hover:opacity-90 transition-opacity sm:w-auto"
                style={{ backgroundColor: GREEN }}
              >
                <IconUserPlus /> Join BeWatu free
              </button>
              <button
                onClick={onLearnMore}
                className="w-full rounded-full border bg-white px-7 py-3.5 text-base font-semibold text-stone-700 hover:bg-stone-50 transition-colors sm:w-auto"
                style={{ borderColor: '#d6d3cd' }}
              >
                Learn more
              </button>
            </div>
          </div>

          {/* Footer brand blurb */}
          <div
            className="border-t px-6 py-6 text-center sm:px-12"
            style={{ borderColor: '#e8e4dc', backgroundColor: '#faf9f6' }}
          >
            <p className="mx-auto max-w-lg text-sm text-stone-500 leading-relaxed text-pretty">
              BeWatu is a professional network where your capabilities speak louder than your Resume.
              Verified skills, live challenges, and real communities — built for the skills economy.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProfileUnavailablePage;
