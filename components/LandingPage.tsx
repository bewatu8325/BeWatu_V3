import React from 'react';
import { LogoIcon } from '../constants';
import Footer from './Footer';

interface LandingPageProps {
  onNavigateToRegister:  () => void;
  onNavigateToLogin:     () => void;
  onNavigateToAbout:     () => void;
  onNavigateToConnect:   () => void;
}

const BG       = '#f0ede6';
const GREEN    = '#1a4a3a';
const GREENMID = '#1a6b52';

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconArrow = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-7-7 7 7-7 7"/>
  </svg>
);
const IconUsers = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconSword = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/>
    <line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/>
  </svg>
);
const IconTrophy = ({ color = '#d97706' }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
  </svg>
);
const IconSparkles = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275z"/>
  </svg>
);
const IconBridge = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12 Q6 6 12 12 Q18 6 22 12"/>
    <line x1="2" y1="12" x2="2" y2="18"/>
    <line x1="22" y1="12" x2="22" y2="18"/>
    <line x1="12" y1="12" x2="12" y2="18"/>
    <line x1="2" y1="18" x2="22" y2="18"/>
  </svg>
);
const IconShield = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconCheck = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const IconBrain = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.24z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.24z"/>
  </svg>
);

// ─── Sub-components ───────────────────────────────────────────────────────────

const AvatarStack = () => (
  <div className="flex items-center gap-3">
    <div className="flex -space-x-2">
      {['E','M','J','P','A'].map((l, i) => (
        <div key={l}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
          style={{ backgroundColor: GREEN, zIndex: 5 - i }}>
          {l}
        </div>
      ))}
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-stone-600"
        style={{ backgroundColor: '#e8e4dc', zIndex: 0 }}>
        +2k
      </div>
    </div>
    <p className="text-sm text-stone-500">Join a growing community across every career stage</p>
  </div>
);

const PillarCard: React.FC<{
  iconBg: string;
  icon:   React.ReactNode;
  title:  string;
  body:   string;
  tag:    string;
}> = ({ iconBg, icon, title, body, tag }) => (
  <div className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow" style={{ borderColor: '#e8e4dc' }}>
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg }}>{icon}</div>
    <h3 className="mb-2 text-lg font-bold text-stone-900">{title}</h3>
    <p className="flex-1 text-sm text-stone-500 leading-relaxed">{body}</p>
    <span className="mt-4 inline-block text-xs font-semibold rounded-full px-3 py-1"
      style={{ backgroundColor: `${GREEN}15`, color: GREEN }}>
      {tag}
    </span>
  </div>
);

const AICard: React.FC<{
  iconBg: string; icon: React.ReactNode; title: string; body: string;
}> = ({ iconBg, icon, title, body }) => (
  <div className="flex flex-col rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e8e4dc' }}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg }}>{icon}</div>
    <h3 className="mb-1 font-bold text-stone-900 text-sm">{title}</h3>
    <p className="text-xs text-stone-500 leading-relaxed">{body}</p>
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

const GenerationCard: React.FC<{
  label: string; labelColor: string; labelBg: string;
  quote: string; name: string; role: string;
}> = ({ label, labelColor, labelBg, quote, name, role }) => (
  <div className="rounded-2xl border bg-white p-6 shadow-sm flex flex-col gap-4" style={{ borderColor: '#e8e4dc' }}>
    <span className="inline-block text-xs font-bold rounded-full px-3 py-1 w-fit"
      style={{ backgroundColor: labelBg, color: labelColor }}>
      {label}
    </span>
    <p className="text-sm text-stone-700 leading-relaxed italic">"{quote}"</p>
    <div>
      <p className="text-sm font-bold text-stone-900">{name}</p>
      <p className="text-xs text-stone-500">{role}</p>
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
        <LogoIcon className="h-9 w-auto" style={{ color: GREEN }} />
        <div className="flex items-center gap-4">
          <button onClick={onNavigateToLogin}
            className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors">
            Sign In
          </button>
          <button onClick={onNavigateToRegister}
            className="rounded-full px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            Get Started
          </button>
        </div>
      </div>
    </header>

    {/* HERO */}
    <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-12 pb-14 text-center">
      <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold mb-6"
        style={{ backgroundColor: `${GREEN}12`, color: GREEN, border: `1px solid ${GREEN}25` }}>
        Where experience meets ambition
      </span>
      <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-6xl">
        The network built for<br />
        <span style={{ color: GREEN }}>authentic careers.</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-stone-500 leading-relaxed">
        BeWatu bridges generations of professionals — connecting decades of hard-won wisdom with the energy of people just starting to build. Demonstrate your capability, not just your credentials.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button onClick={onNavigateToRegister}
          className="flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          Join the community <IconArrow />
        </button>
        <button onClick={onNavigateToLogin}
          className="rounded-full border bg-white px-7 py-3.5 text-base font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
          style={{ borderColor: '#d6d3cd' }}>
          Sign in
        </button>
      </div>
      <div className="mt-10"><AvatarStack /></div>
    </section>

    {/* GENERATIONAL BRIDGE — the core differentiator */}
    <section className="border-y py-16" style={{ borderColor: '#e8e4dc' }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold mb-4"
            style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
            The generational bridge
          </span>
          <h2 className="text-3xl font-extrabold text-stone-900">Two generations, one community</h2>
          <p className="mt-3 text-stone-500 max-w-xl mx-auto">
            The professionals who built the world we work in, and the ones building what comes next.
            BeWatu creates the conditions for both to see each other clearly.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <GenerationCard
            label="30+ years of experience"
            labelColor="#1a4a3a"
            labelBg="#d1fae5"
            quote="I've made every mistake in the book. The most valuable thing I can do now is help the next generation not repeat them."
            name="Senior Professional"
            role="30 years in financial services"
          />
          <GenerationCard
            label="Building the future"
            labelColor="#7c3aed"
            labelBg="#ede9fe"
            quote="I don't want followers. I want people who've been where I'm going and will tell me the truth about what they found."
            name="Emerging Professional"
            role="3 years building in fintech"
          />
        </div>
        <div className="mt-8 text-center">
          <p className="text-sm text-stone-500 max-w-lg mx-auto">
            BeWatu is structured so neither generation has to perform for the other.
            Wisdom threads, perspective posts, and mentored pods create
            authentic exchange — not content for likes.
          </p>
        </div>
      </div>
    </section>

    {/* THREE PILLARS */}
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-stone-900">Built different, on purpose</h2>
          <p className="mt-3 text-stone-500">Three things we do that no other professional network does</p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <PillarCard
            iconBg="#fef3c7"
            icon={<IconSword color="#d97706" />}
            title="Prove, don't claim"
            body="Upload a 60-second reel showing what you can do. Tag it with your skills. Let your work speak before your title does."
            tag="Prove →"
          />
          <PillarCard
            iconBg="#d1fae5"
            icon={<IconTrophy />}
            title="Win real challenges"
            body="Industry arenas post real problems from real companies. Solve them. Get shortlisted. Get hired or funded — based on what you actually built."
            tag="Arenas →"
          />
          <PillarCard
            iconBg="#ede9fe"
            icon={<IconUsers color="#7c3aed" />}
            title="Circles, not connections"
            body="Your professional circle is small and intentional. Our recommendation engine finds complementary professionals — not just people like you."
            tag="Circles →"
          />
        </div>
      </div>
    </section>

    {/* HOW IT WORKS */}
    <section className="border-y py-16" style={{ borderColor: '#e8e4dc' }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <Step num="01" title="Build in public"
            body="Post ideas, submit arena solutions, upload reels. The platform reads your activity and builds your verified profile automatically." />
          <Step num="02" title="Get found by fit, not fame"
            body="Our recommendation engine matches you on complementarity — what you bring that others don't — not just what you have in common." />
          <Step num="03" title="Connect across generations"
            body="Join pods that mix experience levels intentionally. Have conversations that don't happen anywhere else." />
        </div>
      </div>
    </section>

    {/* AI — reframed as infrastructure not product */}
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold mb-4"
            style={{ backgroundColor: '#d1fae5', color: GREEN, border: `1px solid ${GREEN}30` }}>
            <IconSparkles color={GREEN} /> Intelligence that stays in the background
          </span>
          <h2 className="text-3xl font-extrabold text-stone-900">AI that works quietly</h2>
          <p className="mt-3 text-stone-500 max-w-xl mx-auto">
            We use AI to make the platform smarter — not to replace human judgement.
            It surfaces opportunities, finds patterns you'd miss, and gets out of the way.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <AICard iconBg="#d1fae5" icon={<IconBrain />}
            title="Career Intelligence"
            body="Weekly insights about your profile strength, skill gaps, and the right connections — without a chatbot in the way." />
          <AICard iconBg="#fef3c7" icon={<IconSparkles color="#d97706" />}
            title="Skill verification"
            body="Your skills are derived from what you've built on the platform — arena submissions, reels, ideas — not what you've written on a CV." />
          <AICard iconBg="#d1fae5" icon={<IconUsers />}
            title="Complementary matching"
            body="Recommendations that find people who fill your gaps, not just people who look like you. Different industries score higher than identical ones." />
          <AICard iconBg="#fef3c7" icon={<IconTrophy color="#d97706" />}
            title="Opportunity fit"
            body="Arena challenges are matched to your skills. You only see the ones where you have a real chance — not every open posting." />
        </div>
      </div>
    </section>

    {/* WHAT WE ARE NOT */}
    <section className="py-14" style={{ backgroundColor: '#e8f4f0' }}>
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl font-extrabold text-stone-900 mb-3">What BeWatu is not</h2>
        <p className="text-stone-600 text-sm leading-relaxed mb-8">
          We made deliberate choices about what not to build. We think that matters.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          {[
            { not: 'Not a content farm', is: 'No engagement-optimised feed. Posts are chronological. No algorithm deciding who gets seen.' },
            { not: 'Not a vanity counter', is: 'No follower counts on profiles. No viral metrics. Connection quality over connection volume.' },
            { not: 'Not a job application machine', is: 'Opportunities surface through warm circles and arena performance — not cold applications.' },
          ].map(({ not, is }) => (
            <div key={not} className="bg-white rounded-2xl p-5 border" style={{ borderColor: '#c7e8d8' }}>
              <p className="text-xs font-bold text-red-500 mb-1.5">{not}</p>
              <p className="text-xs text-stone-600 leading-relaxed">{is}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-20">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-4xl font-extrabold text-stone-900">
          Ready to build something real?
        </h2>
        <p className="mt-3 text-stone-600">
          Join professionals at every career stage who chose depth over noise.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
          <button onClick={onNavigateToRegister}
            className="flex items-center gap-2 rounded-full px-8 py-4 text-base font-bold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            Join BeWatu free <IconArrow />
          </button>
          <button onClick={onNavigateToAbout}
            className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors underline underline-offset-4">
            Our story →
          </button>
        </div>
        <p className="mt-4 text-xs text-stone-400">No credit card required · No follower counts · No algorithm</p>
      </div>
    </section>

    <Footer onNavigateToConnect={onNavigateToConnect} />
  </div>
);

export default LandingPage;
