import React from 'react';
import { Home, Users, Hexagon, PlusSquare, User } from 'lucide-react';
import { View } from '../types'; // adjust path if needed
import { useFirebase } from '../contexts/FirebaseContext';

// ─── Mobile bottom nav ────────────────────────────────────────────────────────

const MOBILE_ITEMS = [
  { view: View.Feed,    label: 'Home',    icon: Home    },
  { view: View.People,  label: 'Circles', icon: Users   }, // People renamed to Circles
  { view: View.Circles, label: 'Pods',    icon: Hexagon }, // Circles renamed to Pods
  { view: View.AIChat,  label: 'Create',  icon: PlusSquare }, // or whatever view makes sense
];

interface MobileNavProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

export function MobileNav({ currentView, onNavigate }: MobileNavProps) {
  const { currentUser } = useFirebase();

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-sm md:hidden">
      <div className="flex items-center justify-around py-2">
        {MOBILE_ITEMS.map(({ view, label, icon: Icon }) => {
          const active = currentView === view;
          return (
            <button
              key={view}
              onClick={() => onNavigate(view)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${active ? 'text-cyan-400' : 'text-slate-400'}`}
            >
              <Icon className="h-5 w-5" />
              <span className="sr-only sm:not-sr-only">{label}</span>
            </button>
          );
        })}

        {/* Profile tab */}
        <button
          onClick={() => onNavigate(View.Profile)}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${currentView === View.Profile ? 'text-cyan-400' : 'text-slate-400'}`}
        >
          {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <User className="h-5 w-5" />
          )}
          <span className="sr-only sm:not-sr-only">Profile</span>
        </button>
      </div>
    </nav>
  );
}

export default MobileNav;
