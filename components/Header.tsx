import React, { useState, useRef, useEffect } from 'react';
import {
  Home, Users, Hexagon, Briefcase, MessageSquare,
  Bell, LogOut, User, ChevronDown, Settings, Sword, Search,
} from 'lucide-react';
import { LogoIcon } from '../constants';
import { useFirebase } from '../contexts/FirebaseContext';
import { View } from '../types'; // adjust path if needed

// ─── Nav items matching your View enum ───────────────────────────────────────

const NAV_ITEMS = [
  { view: View.Feed,      label: 'Home',         icon: Home          },
  { view: View.People,    label: 'Circles',      icon: Users         }, // People renamed to Circles
  { view: View.Circles,   label: 'Pods',         icon: Hexagon       }, // Circles renamed to Pods
  { view: View.Prove,     label: 'Prove',        icon: Sword         }, // New
  { view: View.Jobs,      label: 'Opportunities',icon: Briefcase     },
  { view: View.Messaging, label: 'Messages',     icon: MessageSquare },
];

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  onSwitchToRecruiter?: () => void;
  notificationCount?: number;
}

export function Header({ currentView, onNavigate, onLogout, onSwitchToRecruiter, notificationCount = 0 }: HeaderProps) {
  const { currentUser } = useFirebase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'BW';

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    // TODO: wire to search view when ready
  }

  return (
    <header className="fixed top-0 right-0 left-0 z-50 border-b bg-white/95 backdrop-blur-sm" style={{ borderColor: "#e7e5e4" }}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <button onClick={() => onNavigate(View.Feed)} className="flex items-center shrink-0">
          <LogoIcon className="h-10 w-auto" style={{ color: "#1a4a3a" }} />
        </button>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative hidden flex-1 max-w-md md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            placeholder="Search people, posts, jobs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-full border bg-stone-100 pl-9 pr-4 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2" style={{ borderColor: "#e7e5e4", "--tw-ring-color": "#1a4a3a" } as any}
          />
        </form>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ view, label, icon: Icon }) => {
            const active = currentView === view;
            return (
              <button
                key={view}
                onClick={() => onNavigate(view)}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? "font-semibold" : "text-stone-500 hover:text-stone-800"}`} style={active ? { color: "#1a4a3a" } : {}}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* Notifications */}
        <button
          onClick={() => onNavigate(View.Notifications ?? View.Feed)}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* Profile menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-full hover:bg-stone-100 p-1 pr-2 transition-colors"
          >
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: "#1a4a3a" }}>
                {initials}
              </div>
            )}
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white p-1.5 shadow-xl shadow-black/10" style={{ borderColor: "#e7e5e4" }}>
              <div className="px-3 py-2">
                <p className="text-sm font-semibold text-stone-900">{currentUser?.name ?? 'User'}</p>
                <p className="text-xs text-stone-500 truncate">{currentUser?.headline ?? 'BeWatu member'}</p>
              </div>
              <div className="my-1 h-px bg-stone-100" />
              <button onClick={() => { onNavigate(View.Profile); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                <User className="h-4 w-4" />View profile
              </button>
              {onSwitchToRecruiter && (
                <button onClick={() => { onSwitchToRecruiter(); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-green-50 transition-colors" style={{ color: "#1a4a3a" }}>
                  <Briefcase className="h-4 w-4" />Switch to Recruiter
                </button>
              )}
              <button onClick={() => { onNavigate(View.Settings ?? View.Profile); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                <Settings className="h-4 w-4" />Settings
              </button>
              <div className="my-1 h-px bg-stone-100" />
              <button onClick={() => { setMenuOpen(false); onLogout(); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 transition-colors">
                <LogOut className="h-4 w-4" />Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
