import React from 'react';
import { LogoIcon } from '../../constants';
import Footer from '../Footer';

interface AuthLayoutProps {
  title: string;
  children: React.ReactNode;
  onNavigateToConnect?: () => void;
  onNavigateToLanding: () => void;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, children, onNavigateToConnect, onNavigateToLanding }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex justify-center items-center mb-6">
              <button onClick={onNavigateToLanding} className="transition-opacity hover:opacity-80" title="Back to home">
                <LogoIcon className="h-12 w-auto text-cyan-400" />
              </button>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-center text-slate-100 mb-6">{title}</h2>
            {children}
          </div>
        </div>
      </main>
      <Footer onNavigateToConnect={onNavigateToConnect} />
    </div>
  );
};

export default AuthLayout;