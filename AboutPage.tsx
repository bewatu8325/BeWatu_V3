import React from 'react';
import { LogoIcon, SparklesIcon, VerifiedIcon, GlobeIcon, UsersIcon } from '../constants';
import Footer from './Footer';

// A simple header for the public-facing page
const AboutHeader: React.FC<{ onNavigateBack: () => void }> = ({ onNavigateBack }) => (
  <header className="absolute top-0 left-0 right-0 p-6 z-10">
    <div className="container mx-auto flex justify-between items-center">
      <button onClick={onNavigateBack} className="flex items-center text-cyan-400" title="Go to Home">
        <LogoIcon className="h-10 w-auto" />
      </button>
      <button onClick={onNavigateBack} className="font-semibold text-slate-300 hover:text-cyan-400 transition-colors">
        Back to Home
      </button>
    </div>
  </header>
);

const Section: React.FC<{ children: React.ReactNode, delay?: string }> = ({ children, delay = '0s' }) => (
  <section className="mb-16 animate-fade-in-up" style={{ animationDelay: delay }}>
    {children}
  </section>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-3xl md:text-4xl font-bold text-center mb-6">
    <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">
      {children}
    </span>
  </h2>
);

const Separator = () => (
  <div className="text-center my-12 text-3xl font-thin text-slate-600 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
    ⸻
  </div>
);

const HowItWorksCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 backdrop-blur-sm h-full">
    <div className="flex items-center space-x-4 mb-3">
      <div className="text-cyan-400 flex-shrink-0">{icon}</div>
      <h3 className="text-xl font-bold text-slate-100">{title}</h3>
    </div>
    <p className="text-slate-400 text-sm">{children}</p>
  </div>
);


const AboutPage: React.FC<{ onNavigateBack: () => void; onNavigateToConnect: () => void; }> = ({ onNavigateBack, onNavigateToConnect }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-white">
      <AboutHeader onNavigateBack={onNavigateBack} />
      <main className="flex-grow pt-32 pb-20">
        <div className="container mx-auto px-6 max-w-4xl">
          
          <Section delay="0.2s">
            <SectionTitle>About Us</SectionTitle>
            <h3 className="text-center text-2xl text-slate-200 font-semibold mb-4">We’re Rebuilding What It Means to Connect</h3>
            <p className="text-center text-lg text-slate-400 leading-relaxed">
              Professional networking today is noisy, transactional, and built for algorithms — not people.
              <br />We believe it’s time for something different.
              <br />Something human.
              <br />Something fair.
            </p>
            <p className="mt-4 text-center text-lg text-slate-300 font-medium leading-relaxed">
              We’re building a network where opportunity flows freely, data belongs to you, and real work speaks louder than résumés.
            </p>
          </Section>

          <Separator />

          <Section delay="0.4s">
            <SectionTitle>Our Mission</SectionTitle>
            <p className="text-center text-lg text-slate-400 leading-relaxed">
              To democratize opportunity by creating an open, AI-powered professional network where every person — regardless of background, geography, or title — can connect, collaborate, and grow on equal footing.
            </p>
            <p className="mt-4 text-center text-lg text-slate-300 font-medium leading-relaxed">
              We’re turning the professional graph into a human ecosystem — transparent, inclusive, and owned by the community.
            </p>
          </Section>
          
          <Separator />

          <Section delay="0.6s">
            <SectionTitle>Why We Exist</SectionTitle>
            <h3 className="text-center text-2xl text-slate-200 font-semibold mb-4">
              Because talent is universal.<br />But access isn’t.
            </h3>
            <p className="text-center text-lg text-slate-400 leading-relaxed">
              We’re changing that — by empowering individuals to:
            </p>
            <ul className="mt-4 max-w-lg mx-auto space-y-2 text-slate-300 list-disc list-inside text-left">
              <li>Own their profiles and data (no hidden algorithms or paywalls).</li>
              <li>Show their real work, not just job titles.</li>
              <li>Find opportunities that align with their goals and values.</li>
              <li>Connect through purpose, not privilege.</li>
            </ul>
          </Section>
          
          <Separator />

          <Section delay="0.8s">
            <SectionTitle>How It Works</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <HowItWorksCard icon={<VerifiedIcon className="w-8 h-8"/>} title="1. Authentic Profiles, Not Vanity Metrics">
                Show what you’ve built, not just where you’ve been. Portfolios replace résumés, and verified contributions replace endorsements.
              </HowItWorksCard>
              <HowItWorksCard icon={<SparklesIcon className="w-8 h-8"/>} title="2. AI That Works for You">
                Our ethical AI suggests meaningful connections, opportunities, and collaborations — without selling your attention.
              </HowItWorksCard>
              <HowItWorksCard icon={<UsersIcon className="w-8 h-8"/>} title="3. Community-Led, Not Corporate-Owned">
                The network belongs to its members. You shape its rules, values, and future.
              </HowItWorksCard>
              <HowItWorksCard icon={<GlobeIcon className="w-8 h-8"/>} title="4. Open, Global, Inclusive">
                From Lagos to Lisbon, Bangkok to Boston — we’re building a connected world where skill, not status, defines opportunity.
              </HowItWorksCard>
            </div>
          </Section>

        </div>
      </main>
      <Footer onNavigateToConnect={onNavigateToConnect} />
    </div>
  );
};

export default AboutPage;
