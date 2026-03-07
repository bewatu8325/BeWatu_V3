import React from 'react';
import Footer from './Footer';

interface LandingPageProps {
  onNavigateToRegister: () => void;
  onNavigateToLogin: () => void;
  onNavigateToAbout: () => void;
  onNavigateToConnect: () => void;
}

const BG    = '#f0ede6';
const GREEN = '#1a4a3a';
const GREENMID = '#1a6b52';

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconArrow = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-7-7 7 7-7 7"/>
  </svg>
);
const IconBrain = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.24z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.24z"/>
  </svg>
);
const IconMsg = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconSparkles = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275z"/>
  </svg>
);
const IconSearch = ({ color = '#d97706' }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const IconShield = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconGlobe = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IconCheck = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

// ─── Sub-components ───────────────────────────────────────────────────────────
const AvatarStack = () => (
  <div className="flex items-center gap-2">
    <div className="flex -space-x-2">
      {['A','B','C','D','E'].map((l, i) => (
        <div key={l} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
          style={{ backgroundColor: GREEN, zIndex: 5 - i }}>
          {l}
        </div>
      ))}
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-stone-600"
        style={{ backgroundColor: '#e8e4dc', zIndex: 0 }}>
        +2k
      </div>
    </div>
  </div>
);

const FeatureCard: React.FC<{
  iconBg: string; icon: React.ReactNode; title: string; body: string;
  badge: string; badgeIcon: React.ReactNode;
}> = ({ iconBg, icon, title, body, badge, badgeIcon }) => (
  <div className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow" style={{ borderColor: '#e8e4dc' }}>
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg }}>{icon}</div>
    <h3 className="mb-2 text-lg font-bold text-stone-900">{title}</h3>
    <p className="flex-1 text-sm text-stone-500 leading-relaxed">{body}</p>
    <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold" style={{ color: GREENMID }}>
      {badgeIcon}{badge}
    </div>
  </div>
);

const AICard: React.FC<{ iconBg: string; icon: React.ReactNode; title: string; body: string }> = ({ iconBg, icon, title, body }) => (
  <div className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e8e4dc' }}>
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg }}>{icon}</div>
    <h3 className="mb-1 font-bold text-stone-900">{title}</h3>
    <p className="text-sm text-stone-500 leading-relaxed">{body}</p>
  </div>
);

const Step: React.FC<{ num: string; title: string; body: string }> = ({ num, title, body }) => (
  <div className="flex items-start gap-4">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>{num}</div>
    <div>
      <p className="font-bold text-stone-900">{title}</p>
      <p className="mt-1 text-sm text-stone-500">{body}</p>
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateToRegister, onNavigateToLogin, onNavigateToAbout, onNavigateToConnect,
}) => (
  <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: BG }}>

    {/* NAV */}
    <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: BG, borderColor: '#e8e4dc' }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white" style={{ backgroundColor: GREEN }}>B</div>
          <span className="text-lg font-bold text-stone-900">BeWatu</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onNavigateToLogin} className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors">Sign In</button>
          <button onClick={onNavigateToRegister} className="rounded-full px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: GREEN }}>
            Get Started
          </button>
        </div>
      </div>
    </header>

    {/* HERO */}
    <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-16 text-center">
      <div className="mb-6 flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium"
        style={{ borderColor: `${GREEN}40`, backgroundColor: `${GREEN}10`, color: GREEN }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GREEN }} />
        Now with AI-powered matching
      </div>
      <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-6xl md:text-7xl">
        Own your story.{' '}
        <span style={{ color: GREEN }}>Shape your<br />future.</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-stone-500 leading-relaxed">
        Connect and unlock new opportunities — one real connection at a time. BeWatu is the AI-powered professional network where your work speaks for itself.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button onClick={onNavigateToRegister}
          className="flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          Join the Network <IconArrow />
        </button>
        <button onClick={onNavigateToLogin}
          className="rounded-full border bg-white px-7 py-3.5 text-base font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
          style={{ borderColor: '#d6d3cd' }}>
          Already have an account?
        </button>
      </div>
      <div className="mt-8"><AvatarStack /></div>
    </section>

    {/* FEATURE CARDS */}
    <section className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <FeatureCard iconBg="#d1fae5" icon={<IconSparkles />} title="Your Career Co-Pilot"
          body="Let our AI help you build a standout profile, analyze job matches, and suggest meaningful conversation starters."
          badge="AI-Powered" badgeIcon={<IconSparkles />} />
        <FeatureCard iconBg="#d1fae5" icon={<IconCheck />} title="Show, Don't Just Tell"
          body="Move beyond resumes with a verified skills graph and a portfolio that showcases your real-world impact and achievements."
          badge="Verified Skills" badgeIcon={<IconShield />} />
        <FeatureCard iconBg="#d1fae5" icon={<IconGlobe />} title="Build Your Circle and Pod"
          body="Join niche micro-communities to connect with peers, share knowledge, and collaborate on what truly matters to you."
          badge="Community-First" badgeIcon={<IconGlobe />} />
      </div>
    </section>

    {/* HOW IT WORKS */}
    <section className="border-y py-16" style={{ borderColor: '#e8e4dc' }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <Step num="01" title="Create your profile" body="Showcase your skills, projects, and achievements in minutes" />
          <Step num="02" title="Get AI-matched" body="Our AI finds opportunities and connections tailored to you" />
          <Step num="03" title="Grow your network" body="Build meaningful relationships that advance your career" />
        </div>
      </div>
    </section>

    {/* WHY BEWATU */}
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="text-3xl font-extrabold text-stone-900 sm:text-4xl">Why professionals choose BeWatu</h2>
        <p className="mt-3 text-stone-500">Built for the modern professional who values authentic connections over vanity metrics</p>
      </div>
    </section>

    {/* AI FEATURES */}
    <section className="pb-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
            <IconSearch color="#d97706" /> AI-Powered Features
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-stone-900">Intelligence that works for you</h2>
          <p className="mt-3 text-stone-500">Our AI features help you connect smarter, not harder — saving you hours every week.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <AICard iconBg="#d1fae5" icon={<IconBrain />}     title="Fit Analysis"     body="AI scores how well you match each opportunity" />
          <AICard iconBg="#fef3c7" icon={<IconMsg />}       title="Tone Check"       body="Perfect your messages before you send" />
          <AICard iconBg="#d1fae5" icon={<IconSparkles />}  title="Synergy Analysis" body="Discover collaboration potential" />
          <AICard iconBg="#fef3c7" icon={<IconSearch />}    title="Smart Search"     body="Find the right people and roles instantly" />
        </div>
      </div>
    </section>

    {/* QUOTE */}
    <section className="pb-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: `${GREEN}12`, color: GREEN, border: `1px solid ${GREEN}30` }}>
            Why BeWatu?
          </span>
        </div>
        <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 text-center shadow-sm" style={{ borderColor: '#e8e4dc' }}>
          <p className="text-xl font-semibold leading-relaxed text-stone-800 sm:text-2xl">
            "We built BeWatu because we believe your career should be defined by what you create, not just who you know. Every feature is designed to let your work speak for itself."
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>BW</div>
            <div className="text-left">
              <p className="font-bold text-stone-900">BeWatu Team</p>
              <p className="text-sm text-stone-500">Building the future of professional networking</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-20" style={{ backgroundColor: '#d8f0e8' }}>
      <div className="mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-4xl font-extrabold text-stone-900">Ready to own your story?</h2>
        <p className="mt-3 text-stone-600">Join thousands of professionals building meaningful connections on BeWatu.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
          <button onClick={onNavigateToRegister}
            className="flex items-center gap-2 rounded-full px-8 py-4 text-base font-bold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            Get Started Free <IconArrow />
          </button>
          <p className="text-sm text-stone-500">No credit card required</p>
        </div>
      </div>
    </section>

    <Footer onNavigateToConnect={onNavigateToConnect} />
  </div>
);

export default LandingPage;
