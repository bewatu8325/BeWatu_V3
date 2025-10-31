import React from 'react';

interface FooterProps {
  onNavigateToConnect?: () => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigateToConnect }) => {
  return (
    <footer className="bg-slate-900/50 border-t border-slate-700/50 mt-12">
      <div className="container mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-center items-center space-x-6 text-sm">
          <a href="#" className="text-slate-400 hover:text-cyan-400 transition-colors">User Agreement</a>
          <span className="text-slate-600">|</span>
           {onNavigateToConnect && (
            <>
              <button onClick={onNavigateToConnect} className="text-slate-400 hover:text-cyan-400 transition-colors">Connect with us</button>
              <span className="text-slate-600">|</span>
            </>
          )}
          <a href="#" className="text-slate-400 hover:text-cyan-400 transition-colors">Community Rules & Standards</a>
          <span className="text-slate-600">|</span>
           <p className="text-slate-500">&copy; {new Date().getFullYear()} BeWatu</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;