import React from 'react';
import { Home, Users, Users2, Hexagon, User } from 'lucide-react';
import { View } from '../types'; // adjust path if needed
import { useFirebase } from '../contexts/FirebaseContext';

// ─── Mobile bottom nav ────────────────────────────────────────────────────────

const MOBILE_ITEMS = [
  { view: View.Feed,    label: 'Home',    icon: Home    },
  { view: View.People,  label: 'Circles', icon: Users   }, // People renamed to Circles
  { view: View.Connections, label: 'Circles', icon: Users2 },
];

interface MobileNavProps {
  currentView: View;
  onNavigate: (view: View) => void;
  pendingConnectionCount?: number;
}

export function MobileNav({ currentView, onNavigate, pendingConnectionCount = 0 }: MobileNavProps) {
  const { currentUser } = useFirebase();

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 border-t bg-white/95 backdrop-blur-sm md:hidden pb-safe" style={{ borderColor: "#e7e5e4" }}>
      <div className="flex items-center justify-around py-2">
        {MOBILE_ITEMS.map(({ view, label, icon: Icon }) => {
          const active = currentView === view;
          const badge = view === View.Connections && pendingConnectionCount > 0 ? pendingConnectionCount : 0;
          return (
            <button
              key={view}
              onClick={() => onNavigate(view)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${active ? "" : "text-stone-400"}`} style={active ? { color: "#1a4a3a" } : {}}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="sr-only sm:not-sr-only">{label}</span>
            </button>
          );
        })}

        {/* Profile tab */}
        <button
          onClick={() => onNavigate(View.Profile)}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${currentView === View.Profile ? "" : "text-stone-400"}`} style={currentView === View.Profile ? { color: "#1a4a3a" } : {}}
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
