import React from 'react';

interface FooterProps {
  onNavigateToConnect?:   () => void;
  onNavigateToAbout?:     () => void;
  onReportConcern?:       () => void;
  onNavigateToTerms?:     () => void;
  onNavigateToPrivacy?:   () => void;
  onNavigateToCommunity?: () => void;
}

const Footer: React.FC<FooterProps> = ({
  onNavigateToConnect,
  onNavigateToAbout,
  onReportConcern,
  onNavigateToTerms,
  onNavigateToPrivacy,
  onNavigateToCommunity,
}) => {
  return (
    <footer className="border-t mt-12" style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff' }}>
      <div className="container mx-auto px-4 sm:px-6 py-5">
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm">

          {onNavigateToTerms ? (
            <button onClick={onNavigateToTerms}
              className="text-stone-400 hover:text-stone-700 transition-colors">
              Terms of Service
            </button>
          ) : (
            <span className="text-stone-400">Terms of Service</span>
          )}

          {onNavigateToPrivacy ? (
            <button onClick={onNavigateToPrivacy}
              className="text-stone-400 hover:text-stone-700 transition-colors">
              Privacy Policy
            </button>
          ) : (
            <span className="text-stone-400">Privacy Policy</span>
          )}

          {onNavigateToCommunity ? (
            <button onClick={onNavigateToCommunity}
              className="text-stone-400 hover:text-stone-700 transition-colors">
              Community Guidelines
            </button>
          ) : (
            <span className="text-stone-400">Community Guidelines</span>
          )}

          {onNavigateToAbout && (
            <button onClick={onNavigateToAbout}
              className="text-stone-400 hover:text-stone-700 transition-colors">
              Our story
            </button>
          )}

          {onNavigateToConnect && (
            <button onClick={onNavigateToConnect}
              className="text-stone-400 hover:text-stone-700 transition-colors">
              Connect with us
            </button>
          )}

          {onReportConcern && (
            <button
              onClick={onReportConcern}
              className="text-stone-400 hover:text-stone-700 transition-colors"
            >
              Report a concern
            </button>
          )}

          <p className="text-stone-400">&copy; {new Date().getFullYear()} Bewatu LLC</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
