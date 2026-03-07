import React from 'react';
import { Home, Users2, User, Briefcase, MessageSquare } from 'lucide-react';
import { View } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';

const NAV_ITEMS = [
  { view: View.Feed,        label: 'Home',     icon: Home          },
  { view: View.Connections, label: 'Circles',  icon: Users2        },
  { view: View.Jobs,        label: 'Jobs',     icon: Briefcase     },
  { view: View.Messaging,   label: 'Messages', icon: MessageSquare },
];

interface MobileNavProps {
  currentView: View;
  onNavigate: (view: View) => void;
  pendingConnectionCount?: number;
}

export function MobileNav({ currentView, onNavigate, pendingConnectionCount = 0 }: MobileNavProps) {
  const { currentUser } = useFirebase();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e7e5e4',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1.5">
        {NAV_ITEMS.map(({ view, label, icon: Icon }) => {
          const active = currentView === view;
          const badge = view === View.Connections && pendingConnectionCount > 0 ? pendingConnectionCount : 0;
          return (
            <button
              key={view}
              onClick={() => onNavigate(view)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-0.5 rounded-lg transition-all"
              style={{ color: active ? '#1a4a3a' : '#a8a29e', minWidth: 0 }}
            >
              <span className="relative flex items-center justify-center">
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 1.8} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none mt-0.5">{label}</span>
            </button>
          );
        })}
        {/* Profile */}
        <button
          onClick={() => onNavigate(View.Profile)}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 py-0.5 rounded-lg transition-all"
          style={{ color: currentView === View.Profile ? '#1a4a3a' : '#a8a29e', minWidth: 0 }}
        >
          <span className="flex items-center justify-center">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt=""
                className="rounded-full object-cover"
                style={{
                  width: 22, height: 22,
                  outline: currentView === View.Profile ? '2.5px solid #1a4a3a' : '2px solid #e7e5e4',
                  outlineOffset: 1,
                }}
              />
            ) : (
              <User className="h-[22px] w-[22px]" strokeWidth={currentView === View.Profile ? 2.5 : 1.8} />
            )}
          </span>
          <span className="text-[10px] font-medium leading-none mt-0.5">Profile</span>
        </button>
      </div>
    </nav>
  );
}

export default MobileNav;
