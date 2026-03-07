import React from 'react';
import { LogoIcon, SparklesIcon, VerifiedIcon, CirclesIcon } from '../constants';
import Footer from './Footer';

interface LandingPageProps {
  onNavigateToRegister: () => void;
  onNavigateToLogin: () => void;
  onNavigateToAbout: () => void;
  onNavigateToConnect: () => void;
}

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-2xl p-6 text-center backdrop-blur-sm hover:-translate-y-2 transition-all duration-300 border" style={{ backgroundColor:"rgba(255,255,255,0.07)", borderColor:"rgba(255,255,255,0.12)" }}>
    <div className="flex justify-center items-center mb-4 text-teal-300">
      {icon}
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
    <p className="text-white/60 text-sm">{children}</p>
  </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ onNavigateToRegister, onNavigateToLogin, onNavigateToAbout, onNavigateToConnect }) => {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor:"#0f2d23" }}>
      <header className="absolute top-0 left-0 right-0 p-4 sm:p-6 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <LogoIcon className="h-8 sm:h-10 w-auto text-white" />
          <div className="flex items-center space-x-4 sm:space-x-6">
            <button onClick={onNavigateToAbout} className="text-sm sm:text-base font-semibold text-white/70 hover:text-white transition-colors">
              About Us
            </button>
            <button onClick={onNavigateToLogin} className="text-sm sm:text-base font-semibold text-white/70 hover:text-white transition-colors">
              Sign In
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex-grow flex items-center justify-center relative pt-28 sm:pt-32 pb-12 sm:pb-20">
        {/* Animated background shapes - adjusted for mobile */}
        <div className="absolute top-1/4 left-[-15%] w-32 h-32 sm:left-[-5%] sm:w-48 sm:h-48 md:left-1/4 md:w-72 md:h-72 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-full filter blur-3xl opacity-40 md:opacity-50 animate-[float_10s_ease-in-out_infinite]"></div>
        <div className="absolute bottom-1/4 right-[-15%] w-40 h-40 sm:right-[-5%] sm:w-64 sm:h-64 md:right-1/4 md:w-96 md:h-96 bg-gradient-to-tl from-teal-500/10 to-emerald-500/10 rounded-full filter blur-3xl opacity-40 md:opacity-50 animate-[float_12s_ease-in-out_infinite_reverse]"></div>

        <div className="container mx-auto px-4 text-center z-10">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight tracking-tight animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 to-teal-200">
              Own your story. Shape your future.
            </span>
          </h1>
          <p className="mt-6 max-w-3xl mx-auto text-base sm:text-lg md:text-xl text-white/70 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            Connect and unlock new opportunities—one real connection at a time. BeWatu is the AI-powered professional network where your work speaks for itself.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
            <button
              onClick={onNavigateToRegister}
              className="w-full sm:w-auto font-bold py-3 px-8 rounded-full text-lg hover:scale-105 transition-transform text-stone-900" style={{ backgroundColor:"#5eead4" }}
              style={{ animation: 'pulse-glow 3s infinite' }}
            >
              Join the Network
            </button>
            <button onClick={onNavigateToLogin} className="font-semibold text-white/60 hover:text-white transition-colors py-3 px-8">
              Already have an account?
            </button>
          </div>
        </div>
      </main>

      <section className="py-12 sm:py-20 z-10">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
              <FeatureCard icon={<SparklesIcon className="w-8 h-8" />} title="Your Career Co-Pilot">
                Let our AI help you build a standout profile, analyze job matches, and suggest meaningful conversation starters.
              </FeatureCard>
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '1s' }}>
              <FeatureCard icon={<VerifiedIcon className="w-8 h-8" />} title="Show, Don't Just Tell">
                Move beyond resumes with a verified skills graph and a portfolio that showcases your real-world impact and achievements.
              </FeatureCard>
            </div>
             <div className="animate-fade-in-up" style={{ animationDelay: '1.2s' }}>
              <FeatureCard icon={<CirclesIcon className="w-8 h-8" />} title="Build Your Circle">
                Join niche micro-communities to connect with peers, share knowledge, and collaborate on what truly matters to you.
              </FeatureCard>
            </div>
          </div>
        </div>
      </section>

      <Footer onNavigateToConnect={onNavigateToConnect} />
    </div>
  );
};

export default LandingPage;
