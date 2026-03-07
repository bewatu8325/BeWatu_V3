import React from 'react';
import { LogoIcon } from '../constants';
import Footer from './Footer';

interface AuthLayoutProps {
  title: string;
  children: React.ReactNode;
  onNavigateToConnect?: () => void;
  onNavigateToLanding: () => void;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, children, onNavigateToConnect, onNavigateToLanding }) => {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5f5f4' }}>
      <main className="flex-grow flex items-center justify-center p-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <button onClick={onNavigateToLanding} className="transition-opacity hover:opacity-80" title="Back to home">
              <LogoIcon className="h-10 w-auto" style={{ color: '#1a4a3a' }} />
            </button>
          </div>

          {/* Card */}
          <div className="rounded-2xl border p-8 shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#e7e5e4' }}>
            <h2 className="text-2xl font-bold text-center mb-6" style={{ color: '#1c1917' }}>{title}</h2>
            {children}
          </div>
        </div>
      </main>
      <Footer onNavigateToConnect={onNavigateToConnect} />
    </div>
  );
};

export default AuthLayout;
