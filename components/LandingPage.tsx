import React from 'react';
import { LogoIcon } from '../constants';
import Footer from './Footer';

interface LandingPageProps {
  onNavigateToRegister:  () => void;
  onNavigateToLogin:     () => void;
  onNavigateToAbout:     () => void;
  onNavigateToConnect:   () => void;
  onNavigateToTerms?:     () => void;
  onNavigateToPrivacy?:   () => void;
  onNavigateToCommunity?: () => void;
}

const BG       = '#f0ede6';
const GREEN    = 'var(--bw-green)';
const GREENMID = 'var(--bw-green-mid)';
const GREENLT  = 'var(--bw-green-light)';
const BORDER   = '#e7e5e4';

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
const IconTrophy = ({ color = '#d97706' }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
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
const IconBuilding = ({ color = GREEN }: { color?: string }) => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/>
    <path d="M9 7h1M14 7h1M9 11h1M14 11h1"/>
  </svg>
);

// ─── Sub-components ───────────────────────────────────────────────────────────

const Step: React.FC<{ num: string; title: string; body: string; icon: React.ReactNode }> = ({ num, title, body, icon }) => (
  <div className="flex items-start gap-4">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>{num}</div>
    <div>
      <div className="flex items-center gap-2">
        {icon}
        <p className="font-bold text-stone-900">{title}</p>
      </div>
      <p className="mt-1 text-sm text-stone-600">{body}</p>
    </div>
  </div>
);

const ForCard: React.FC<{
  primary?: boolean; label: string; pain: string; gives: string; cta: string; onClick: () => void;
}> = ({ primary, label, pain, gives, cta, onClick }) => (
  <div
    className="flex flex-col gap-3 rounded-2xl border p-6"
    style={{ borderColor: BORDER, backgroundColor: primary ? GREENLT : '#ffffff' }}
  >
    {primary && (
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>Start here</span>
    )}
    <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
    <p className="font-semibold text-stone-900 leading-snug">{pain}</p>
    <p className="flex-1 text-sm text-stone-600 leading-relaxed">{gives}</p>
    <button onClick={onClick} className="mt-1 self-start text-sm font-bold hover:opacity-75 transition-opacity" style={{ color: GREEN }}>
      {cta} →
    </button>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const MONO  = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Each line describes something the beta really does, not a roadmap item.
const FOUNDING_BENEFITS = [
  { title: 'Early access to BeWatu',
    body: 'Pods, the Bridge community and Arena challenges, open to you from day one.' },
  { title: 'A voice in shaping the platform',
    body: 'Share ideas and problems from inside the app. They go straight to the team.' },
  { title: 'Communities from day one',
    body: 'Join Pods and the Bridge community, or start a Pod of your own.' },
  { title: 'Opportunities to connect and collaborate',
    body: 'Meet members, build together in Pods, and take on real Arena challenges.' },
  { title: 'A Founding Member badge',
    body: 'Shown on your profile to mark that you joined in the beta. Badges follow BeWatu\u2019s policies and may change if the platform does.' },
];

const PROBLEMS = [
  { label: 'Hidden proof',      text: "Your profile says ten years of experience. It doesn't say what you actually shipped." },
  { label: 'Too much talk',     text: "You want to build something. Everyone around you wants to talk about building something." },
  { label: 'Invisible wins',    text: "You solved a hard problem last month. Nobody outside your team will ever know." },
  { label: 'Ideas need people', text: "A good idea with no team is just a note on your phone." },
];

const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateToRegister, onNavigateToLogin, onNavigateToAbout, onNavigateToConnect,
  onNavigateToTerms, onNavigateToPrivacy, onNavigateToCommunity,
}) => (
  <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: BG }}>

    {/* NAV */}
    <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: BG, borderColor: BORDER }}>
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
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl md:text-6xl">
        Connect with people.<br/>
        Solve real problems.<br/>
        <span style={{ color: GREEN }}>Build what's next.</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-stone-600 leading-relaxed">
        Find your community, put your skills to work, and turn ideas into something real — on your own or together.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button onClick={onNavigateToRegister}
          className="flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          Start Building <IconArrow />
        </button>
        <button onClick={onNavigateToLogin}
          className="rounded-full border bg-white px-7 py-3.5 text-base font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
          style={{ borderColor: '#d6d3cd' }}>
          Sign in
        </button>
      </div>
      <div className="mt-12 w-full max-w-2xl overflow-hidden rounded-2xl border shadow-lg" style={{ borderColor: BORDER }}>
        <img
          src="/landing/pods-preview.webp"
          alt="A real BeWatu Pods page, showing a pod someone created and its idea"
          className="block w-full h-auto"
        />
        <div className="px-4 py-2.5 text-xs font-medium text-stone-600 border-t" style={{ borderColor: BORDER, backgroundColor: '#faf9f6' }}>
          Real product screen — not a mockup
        </div>
      </div>
    </section>

    {/* FOUNDING MEMBERS */}
    <section id="founding-members" style={{ backgroundColor: GREEN }} className="py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-6 md:grid-cols-[1.05fr_1fr] md:gap-16">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] mb-5" style={{ color: GREENLT, fontFamily: MONO }}>
            BeWatu · Founding Members beta
          </p>
          <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight text-balance text-white sm:text-5xl" style={{ fontFamily: SERIF }}>
            Your network starts here.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">
            Join the first generation of BeWatu members. Meet ambitious students and professionals, discover communities, exchange ideas, and collaborate on things that matter.
          </p>
          <button onClick={onNavigateToRegister}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold hover:opacity-90 transition-opacity"
            style={{ color: GREEN }}>
            Become a Founding Member <IconArrow />
          </button>
          <p className="mt-4 text-sm text-white/70">Free to join. For students and professionals aged 16 and up.</p>
        </div>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] mb-2" style={{ color: GREENLT, fontFamily: MONO }}>
            As a Founding Member, you get
          </p>
          <ul className="flex flex-col">
            {FOUNDING_BENEFITS.map(b => (
              <li key={b.title} className="flex gap-4 border-t py-5" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
                <svg className="mt-0.5 h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke={GREENLT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.6" />
                </svg>
                <div>
                  <p className="font-semibold text-white">{b.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>

    {/* THE PROBLEM */}
    <section className="border-y py-16 sm:py-20" style={{ borderColor: BORDER, backgroundColor: '#faf9f6' }}>
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-sm font-medium uppercase tracking-[0.14em] mb-5" style={{ color: GREENMID, fontFamily: MONO }}>
          The problem
        </p>
        <h2 className="text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl xl:text-[2.6rem]"
          style={{ color: '#12241d', fontFamily: SERIF }}>
          Professional networks tell people where you’ve been.{' '}
          <br className="hidden lg:block" />
          They rarely show what you can actually do.
        </h2>
        <ol className="mt-10 grid grid-cols-1 gap-5 sm:mt-14 md:grid-cols-2">
          {PROBLEMS.map((p, i) => (
            <li key={p.label} className="flex gap-5 rounded-2xl border p-6 sm:gap-6 sm:p-8"
              style={{ backgroundColor: '#f5f1e9', borderColor: '#ebe5d8' }}>
              <span aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium"
                style={{ color: GREENMID, borderColor: GREENMID, fontFamily: MONO }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium uppercase tracking-[0.12em] pt-3" style={{ color: GREENMID, fontFamily: MONO }}>
                  {p.label}
                </p>
                <p className="mt-3 text-xl font-medium leading-snug sm:text-2xl" style={{ color: '#12241d', fontFamily: SERIF }}>
                  {p.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* HOW IT WORKS — Connect / Solve / Build */}
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-stone-900">Three moves. All of them real work.</h2>
        </div>
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <Step num="01" icon={<IconBridge />} title="Connect"
            body="Join a Pod or the Bridge community and find people who share your interests and ambitions." />
          <Step num="02" icon={<IconTrophy />} title="Solve"
            body="Join an Arena and prove your skills on a real problem a real company posted." />
          <Step num="03" icon={<IconUsers />} title="Build"
            body="After your first week of activity, take a real idea into Factory, post the roles you need, and build it into something that ships." />
        </div>
      </div>
    </section>

    {/* WHO IT'S FOR */}
    <section className="border-y py-16" style={{ borderColor: BORDER, backgroundColor: '#faf9f6' }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10">
          <h2 className="text-3xl font-extrabold text-stone-900">Built first for builders.</h2>
          <p className="mt-3 text-stone-600 max-w-xl">
            BeWatu starts with the individual professional who wants their work to speak for itself.
            Pre-founders and companies belong here too — the same Pods and Arena serve all three, and Factory opens up once you've been active for a week.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <ForCard
            primary
            label="The Builder"
            pain="You're good at your job, but a resume can't show what you can actually do."
            gives="A skills profile backed by real work that speaks for you when you apply — and a community of people who built it with you."
            cta="Join an Arena"
            onClick={onNavigateToRegister}
          />
          <ForCard
            label="The Pre-Founder"
            pain="You have an idea and no way to find people who'll actually build it with you."
            gives="Find your people in a Pod first. After your first week of activity, take the idea into Factory and build it into something real."
            cta="Start a Project"
            onClick={onNavigateToRegister}
          />
          <ForCard
            label="The Company"
            pain="You need to know if someone can actually do the work before you hire or fund them."
            gives="Real problems, solved by real people, with proof attached."
            cta="Post a Problem"
            onClick={onNavigateToRegister}
          />
        </div>
      </div>
    </section>

    {/* SKILLS OVER METRICS */}
    <section className="py-16" style={{ backgroundColor: GREEN }}>
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: GREENLT }}>Skills over metrics</p>
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl max-w-xl text-balance">Your skills, backed by your work.</h2>
        <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: GREENLT, opacity: 0.8 }}>The old way</p>
            <p className="text-white/90 leading-relaxed">
              Much of the career internet rewards whoever posts the most. Big connection and follower counts, and endorsements from people who've never seen your work, show attention more than ability.
            </p>
            <p className="mt-4 text-white/90 leading-relaxed">
              A resume or job board profile tells someone where you worked. It was never built to show them what you actually built while you were there.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: GREENLT, opacity: 0.8 }}>The BeWatu way</p>
            <p className="text-white font-medium leading-relaxed">
              BeWatu puts your skills first and backs them with the work behind them: the Arena challenges you solve, the Pods you help build and the Factory projects you ship. Have a resume? Import it and BeWatu builds your skills from it.
            </p>
            <p className="mt-4 text-white font-medium leading-relaxed">
              You can still connect with people, but the strongest connections come from working together — so Pods, Arena challenges and Factory projects come first.
            </p>
          </div>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-20">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-4xl font-extrabold text-stone-900">
          Ready to connect, solve, and build?
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
          <button onClick={onNavigateToRegister}
            className="flex items-center gap-2 rounded-full px-8 py-4 text-base font-bold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            Start Building <IconArrow />
          </button>
          <button onClick={onNavigateToAbout}
            className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors underline underline-offset-4">
            Our story →
          </button>
        </div>
        <p className="mt-4 text-xs text-stone-600">Skills first. A real community, built on real work.</p>
      </div>
    </section>

    <Footer
      onNavigateToConnect={onNavigateToConnect}
      onNavigateToTerms={onNavigateToTerms}
      onNavigateToPrivacy={onNavigateToPrivacy}
      onNavigateToCommunity={onNavigateToCommunity}
    />
  </div>
);

export default LandingPage;
