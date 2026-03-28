import React, { useState } from 'react';
import {
  Home, Users2, User, Briefcase, MessageSquare,
  Hexagon, Zap, Sword, CreditCard, Building2, MoreHorizontal, X,
  Factory, Trophy, GitMerge,
} from 'lucide-react';
import { View } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';

const GREEN = '#1a4a3a';

// Primary nav — always visible
const PRIMARY_NAV = [
  { view: View.Feed,        label: 'Home',     icon: Home          },
  { view: View.Connections, label: 'Circles',  icon: Users2        },
  { view: View.Jobs,        label: 'Jobs',     icon: Briefcase     },
  { view: View.Messaging,   label: 'Messages', icon: MessageSquare },
];

// Secondary nav — shown in "More" drawer
const MORE_NAV = [
  { view: View.Circles,          label: 'Pods',      icon: Hexagon    },
  { view: View.Prove,            label: 'Prove',     icon: Sword      },
  { view: View.Arenas as any,    label: 'Arenas',    icon: Trophy     },
  { view: View.AIChat as any,    label: 'Lens',      icon: Zap        },
  { view: View.Companies,        label: 'Companies', icon: Building2  },
  { view: View.Pricing,          label: 'Pricing',   icon: CreditCard },
  { view: View.Factory,          label: 'Factory',   icon: Factory    },
  { view: View.Bridge,           label: 'Bridge',    icon: GitMerge   },
];

interface MobileNavProps {
  currentView: View;
  onNavigate: (view: View) => void;
  pendingConnectionCount?: number;
}

export function MobileNav({ currentView, onNavigate, pendingConnectionCount = 0 }: MobileNavProps) {
  const { currentUser } = useFirebase();
  const [showMore, setShowMore] = useState(false);

  function navigate(view: View) {
    onNavigate(view);
    setShowMore(false);
  }

  const isMoreActive = MORE_NAV.some(n => n.view === currentView);

  return (
    <>
      {/* More drawer overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl p-4 pb-6"
            style={{ borderTop: '1px solid #e7e5e4' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-stone-800 text-sm">More</p>
              <button onClick={() => setShowMore(false)} className="p-1 text-stone-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MORE_NAV.map(({ view, label, icon: Icon }) => {
                const active = currentView === view;
                return (
                  <button
                    key={view}
                    onClick={() => navigate(view)}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors"
                    style={{ background: active ? '#e8f4f0' : '#f5f5f4', color: active ? GREEN : '#78716c' }}
                  >
                    <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.8} />
                    <span className="text-[11px] font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e7e5e4',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1.5">
          {PRIMARY_NAV.map(({ view, label, icon: Icon }) => {
            const active = currentView === view;
            const badge = view === View.Connections && pendingConnectionCount > 0 ? pendingConnectionCount : 0;
            return (
              <button
                key={view}
                onClick={() => navigate(view)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-0.5 rounded-lg transition-all"
                style={{ color: active ? GREEN : '#a8a29e', minWidth: 0 }}
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

          {/* More button */}
          <button
            onClick={() => setShowMore(m => !m)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-0.5 rounded-lg transition-all"
            style={{ color: isMoreActive || showMore ? GREEN : '#a8a29e', minWidth: 0 }}
          >
            <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={isMoreActive || showMore ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium leading-none mt-0.5">More</span>
          </button>

          {/* Profile */}
          <button
            onClick={() => navigate(View.Profile)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-0.5 rounded-lg transition-all"
            style={{ color: currentView === View.Profile ? GREEN : '#a8a29e', minWidth: 0 }}
          >
            <span className="flex items-center justify-center">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt=""
                  className="rounded-full object-cover"
                  style={{
                    width: 22, height: 22,
                    outline: currentView === View.Profile ? `2.5px solid ${GREEN}` : '2px solid #e7e5e4',
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
    </>
  );
}

export default MobileNav;
