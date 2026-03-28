import React from 'react';
import { LogoIcon } from '../constants';
import Footer from './Footer';

const GREEN    = '#1a4a3a';
const GREENMID = '#1a6b52';
const BG       = '#f0ede6';

const AboutPage: React.FC<{
  onNavigateBack:      () => void;
  onNavigateToConnect: () => void;
}> = ({ onNavigateBack, onNavigateToConnect }) => (
  <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: BG }}>

    {/* Nav */}
    <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: BG, borderColor: '#e8e4dc' }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button onClick={onNavigateBack} className="flex items-center shrink-0">
          <LogoIcon className="h-9 w-auto" style={{ color: GREEN }} />
        </button>
        <button
          onClick={onNavigateBack}
          className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors"
        >
          ← Back
        </button>
      </div>
    </header>

    <main className="flex-grow">

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-12 text-center">
        <span className="inline-block text-xs font-bold rounded-full px-3 py-1 mb-6"
          style={{ backgroundColor: `${GREEN}12`, color: GREEN, border: `1px solid ${GREEN}25` }}>
          Our story
        </span>
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-stone-900 mb-6">
          We're rebuilding what it means<br />
          <span style={{ color: GREEN }}>to connect professionally.</span>
        </h1>
        <p className="text-lg text-stone-500 leading-relaxed max-w-2xl mx-auto">
          Professional networking today is noisy, transactional, and built for algorithms — not people.
          We believe it's time for something different. Something human. Something fair.
        </p>
      </section>

      {/* Mission */}
      <section className="border-y py-16" style={{ borderColor: '#e8e4dc' }}>
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-extrabold text-stone-900 mb-4">Our mission</h2>
          <p className="text-lg text-stone-500 leading-relaxed mb-6">
            To democratise opportunity by creating a professional network where every person —
            regardless of background, geography, or title — can connect, collaborate, and grow
            on equal footing.
          </p>
          <p className="text-lg font-semibold leading-relaxed" style={{ color: GREEN }}>
            We're turning the professional graph into a human ecosystem — transparent, inclusive,
            and shaped by the people who use it.
          </p>
        </div>
      </section>

      {/* The generational angle */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-stone-900 mb-3">Why we exist</h2>
            <p className="text-stone-500 max-w-xl mx-auto">
              Talent is universal. But access isn't. And the gap between generations of professionals
              is one of the most underused sources of value in the world.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                title: 'Hard-won wisdom, quietly held',
                body:  'Experienced professionals carry decades of pattern recognition, failure stories, and real-world knowledge. Too often it stays locked inside organisations — never reaching the people who need it most.',
              },
              {
                title: 'Energy without a map',
                body:  'Emerging professionals have ambition, fresh thinking, and digital instincts. What they often lack is context — someone who\'s been where they\'re going and will tell them the truth about what they found.',
              },
              {
                title: 'Two generations, one platform',
                body:  'BeWatu creates the conditions for both to see each other clearly. Not through mentorship programmes or structured schemes — through real conversations, shared challenges, and authentic connection.',
              },
              {
                title: 'Demonstrate, don\'t claim',
                body:  'Prove your capability through work — arena challenges, reels, and ideas — rather than a list of job titles. The platform reads what you\'ve built, not just what you\'ve written about yourself.',
              },
            ].map(({ title, body }) => (
              <div key={title}
                className="bg-white rounded-2xl border p-6 shadow-sm"
                style={{ borderColor: '#e8e4dc' }}>
                <h3 className="font-bold text-stone-900 mb-2">{title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="border-t py-16" style={{ borderColor: '#e8e4dc', backgroundColor: '#e8f4f0' }}>
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-extrabold text-stone-900 mb-10">What we believe</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              { n: '01', title: 'Your data belongs to you', body: 'No hidden algorithms deciding who sees you. No profiles sold to advertisers. Your professional identity is yours.' },
              { n: '02', title: 'Real work over job titles', body: 'What you\'ve built matters more than where you\'ve worked. Portfolios replace résumés. Actions speak louder than claims.' },
              { n: '03', title: 'Connection through purpose', body: 'The best professional relationships are built on complementarity and shared intent — not proximity or privilege.' },
            ].map(({ n, title, body }) => (
              <div key={n} className="bg-white rounded-2xl border p-5" style={{ borderColor: '#c7e8d8' }}>
                <p className="text-xs font-bold mb-2" style={{ color: GREENMID }}>{n}</p>
                <p className="font-bold text-stone-900 text-sm mb-1.5">{title}</p>
                <p className="text-xs text-stone-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="text-2xl font-extrabold text-stone-900 mb-3">Want to talk to us?</h2>
          <p className="text-stone-500 text-sm mb-6">
            We're a small team building something we genuinely believe in. If you want to partner,
            invest, or just tell us what you think — we'd love to hear from you.
          </p>
          <button
            onClick={onNavigateToConnect}
            className="rounded-full px-7 py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}
          >
            Connect with us →
          </button>
        </div>
      </section>

    </main>

    <Footer onNavigateToConnect={onNavigateToConnect} />
  </div>
);

export default AboutPage;
