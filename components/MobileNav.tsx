import React, { useState } from 'react';
import {
  Home, Users2, User, Briefcase, MessageSquare,
  Trophy, Building2, MoreHorizontal, X, GitMerge, Hexagon, Sword,
} from 'lucide-react';
import { View } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';

const GREEN = '#1a4a3a';

// Primary nav — always visible in bottom bar (5 items max for comfortable tapping)
const PRIMARY_NAV = [
  { view: View.Feed,        label: 'Home',      icon: Home          },
  { view: View.Connections, label: 'Community', icon: Users2        },
  { view: View.Jobs,        label: 'Jobs',      icon: Briefcase     },
  { view: View.Messaging,   label: 'Messages',  icon: MessageSquare },
];

// Secondary nav — shown in "More" drawer
// Grouped logically for easy scanning
const MORE_NAV = [
  { view: View.Prove,            label: 'Showcase',  icon: Trophy,    description: 'Prove your skills' },
  { view: View.Circles,          label: 'Pods',      icon: Hexagon,   description: 'Team collaboration' },
  { view: View.Arenas as any,    label: 'Arenas',    icon: Sword,     description: 'Live competitions' },
  { view: View.Companies,        label: 'Companies', icon: Building2, description: 'Explore employers' },
  { view: View.Bridge,           label: 'Bridge',    icon: GitMerge,  description: 'Cross-platform' },
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
      {/* More drawer overlay — slides up from bottom */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-3xl px-4 pt-3 pb-6 animate-in slide-in-from-bottom duration-200"
            style={{ 
              borderTop: '1px solid #e7e5e4',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.12)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle indicator */}
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-stone-300" />
            </div>
            
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-1">
              <p className="font-bold text-stone-900 text-base">More</p>
              <button 
                onClick={() => setShowMore(false)} 
                className="p-2 -mr-2 text-stone-400 hover:text-stone-600 active:bg-stone-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Navigation items — list style for better scannability */}
            <div className="space-y-1">
              {MORE_NAV.map(({ view, label, icon: Icon, description }) => {
                const active = currentView === view;
                return (
                  <button
                    key={view}
                    onClick={() => navigate(view)}
                    className="flex items-center gap-4 w-full py-3.5 px-4 rounded-2xl transition-all active:scale-[0.98]"
                    style={{ 
                      background: active ? '#e8f4f0' : 'transparent',
                      color: active ? GREEN : '#44403c',
                    }}
                  >
                    <div 
                      className="flex items-center justify-center w-10 h-10 rounded-xl"
                      style={{ 
                        backgroundColor: active ? GREEN : '#f5f5f4',
                      }}
                    >
                      <Icon 
                        className="w-5 h-5" 
                        strokeWidth={active ? 2.5 : 2}
                        style={{ color: active ? 'white' : '#78716c' }}
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-semibold block">{label}</span>
                      <span className="text-xs text-stone-500">{description}</span>
                    </div>
                    {active && (
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: GREEN }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar — clean, spacious design */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e7e5e4',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch justify-around px-2 pt-2 pb-2">
          {PRIMARY_NAV.map(({ view, label, icon: Icon }) => {
            const active = currentView === view;
            const badge = view === View.Connections && pendingConnectionCount > 0 ? pendingConnectionCount : 0;
            return (
              <button
                key={view}
                onClick={() => navigate(view)}
                className="flex flex-col items-center justify-center gap-1 flex-1 py-1.5 rounded-xl transition-all active:scale-95 active:bg-stone-50"
                style={{ 
                  color: active ? GREEN : '#a8a29e', 
                  minWidth: 0,
                  minHeight: '52px', // Minimum 44px touch target + padding
                }}
              >
                <span className="relative flex items-center justify-center">
                  <Icon 
                    className="h-6 w-6" 
                    strokeWidth={active ? 2.5 : 1.8} 
                  />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1.5 shadow-sm">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span 
                  className="text-[11px] font-medium leading-none"
                  style={{ fontWeight: active ? 600 : 500 }}
                >
                  {label}
                </span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(m => !m)}
            className="flex flex-col items-center justify-center gap-1 flex-1 py-1.5 rounded-xl transition-all active:scale-95 active:bg-stone-50"
            style={{ 
              color: isMoreActive || showMore ? GREEN : '#a8a29e', 
              minWidth: 0,
              minHeight: '52px',
            }}
          >
            <span className="relative flex items-center justify-center">
              <MoreHorizontal 
                className="h-6 w-6" 
                strokeWidth={isMoreActive || showMore ? 2.5 : 1.8} 
              />
              {isMoreActive && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: GREEN }} />
              )}
            </span>
            <span 
              className="text-[11px] font-medium leading-none"
              style={{ fontWeight: isMoreActive || showMore ? 600 : 500 }}
            >
              More
            </span>
          </button>

          {/* Profile */}
          <button
            onClick={() => navigate(View.Profile)}
            className="flex flex-col items-center justify-center gap-1 flex-1 py-1.5 rounded-xl transition-all active:scale-95 active:bg-stone-50"
            style={{ 
              color: currentView === View.Profile ? GREEN : '#a8a29e', 
              minWidth: 0,
              minHeight: '52px',
            }}
          >
            <span className="flex items-center justify-center">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt=""
                  className="rounded-full object-cover"
                  style={{
                    width: 26, 
                    height: 26,
                    outline: currentView === View.Profile 
                      ? `2.5px solid ${GREEN}` 
                      : '2px solid #e7e5e4',
                    outlineOffset: 1,
                  }}
                />
              ) : (
                <User 
                  className="h-6 w-6" 
                  strokeWidth={currentView === View.Profile ? 2.5 : 1.8} 
                />
              )}
            </span>
            <span 
              className="text-[11px] font-medium leading-none"
              style={{ fontWeight: currentView === View.Profile ? 600 : 500 }}
            >
              Profile
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

export default MobileNav;
