import React from 'react';

interface FooterProps {
  onNavigateToConnect?: () => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigateToConnect }) => {
  return (
    <footer className="border-t mt-12" style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff' }}>
      <div className="container mx-auto px-4 sm:px-6 py-5">
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm">
          <a href="#" className="text-stone-400 hover:text-stone-700 transition-colors">User Agreement</a>
          {onNavigateToConnect && (
            <button onClick={onNavigateToConnect} className="text-stone-400 hover:text-stone-700 transition-colors">
              Connect with us
            </button>
          )}
          <a href="#" className="text-stone-400 hover:text-stone-700 transition-colors">Community Standards</a>
          <p className="text-stone-400">&copy; {new Date().getFullYear()} BeWatu</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
