import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, User, Notification, ConnectionRequest } from '../types';
import { HomeIcon, UsersIcon, BriefcaseIcon, SearchIcon, LogoIcon, MessageSquareIcon, BellIcon, CirclesIcon, BotIcon, LogoutIcon, MenuIcon } from '../constants';
import NotificationsDropdown from './NotificationsDropdown';

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  currentUser: User;
  notifications: Notification[];
  connectionRequests: ConnectionRequest[];
  users: User[];
  onMarkAsRead: () => void;
  onAcceptConnection: (requestId: number) => void;
  onDeclineConnection: (requestId: number) => void;
  onLogout: () => void;
  onSwitchProfile: () => void;
  activeProfile: 'user' | 'recruiter';
  onToggleMobileNav: () => void;
}

interface NavItemProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon, isActive, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center px-2 sm:px-3 py-2 text-xs sm:text-sm transition-colors duration-200 group ${isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-cyan-400'}`}>
    {icon}
    <span className="hidden sm:block font-medium">{label}</span>
  </button>
);


const Header: React.FC<HeaderProps> = (props) => {
  const { currentView, setCurrentView, currentUser, notifications, onLogout, onSwitchProfile, activeProfile, onToggleMobileNav } = props;
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  
  const handleNotificationsToggle = () => {
    setIsNotificationsOpen(prev => !prev);
    if (!isNotificationsOpen && unreadCount > 0) {
        props.onMarkAsRead();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleProfileClick = () => {
     setCurrentView(View.Profile);
  };

  return (
    <header className="bg-slate-900/70 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <button onClick={handleProfileClick} className="flex items-center text-cyan-400" title="Go to Profile">
               <LogoIcon className="h-8 w-auto" />
            </button>
            <div className="relative hidden sm:block">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <SearchIcon className="h-5 w-5 text-gray-500" />
              </span>
              <input type="text" placeholder="Search" className="bg-slate-800 text-slate-200 rounded-full py-2 pl-10 pr-4 w-64 focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-500"/>
            </div>
          </div>

          <nav className="flex items-center space-x-1 sm:space-x-2">
             <div className="hidden sm:flex items-center space-x-1 sm:space-x-2">
                <NavItem label="Home" icon={<HomeIcon className="w-6 h-6" />} isActive={currentView === View.Feed} onClick={() => setCurrentView(View.Feed)} />
                <NavItem label="People" icon={<UsersIcon className="w-6 h-6" />} isActive={currentView === View.People} onClick={() => setCurrentView(View.People)} />
                <NavItem label="Circles" icon={<CirclesIcon className="w-6 h-6" />} isActive={currentView === View.Circles} onClick={() => setCurrentView(View.Circles)} />
                <NavItem label="Jobs" icon={<BriefcaseIcon className="w-6 h-6" />} isActive={currentView === View.Jobs} onClick={() => setCurrentView(View.Jobs)} />
                <NavItem label="AI Chat" icon={<BotIcon className="w-6 h-6" />} isActive={currentView === View.AIChat} onClick={() => setCurrentView(View.AIChat)} />
                <NavItem label="Messaging" icon={<MessageSquareIcon className="w-6 h-6" />} isActive={currentView === View.Messaging} onClick={() => setCurrentView(View.Messaging)} />
             </div>
             
             <div className="relative" ref={notificationsRef}>
                <button onClick={handleNotificationsToggle} className="text-slate-400 hover:text-cyan-400 p-2 rounded-full focus:outline-none transition-colors">
                    <BellIcon className="w-6 h-6"/>
                    {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 block h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center ring-2 ring-slate-900">
                            {unreadCount}
                        </span>
                    )}
                </button>
                {isNotificationsOpen && <NotificationsDropdown {...props} />}
             </div>

            <div className="border-l border-slate-700 pl-2 sm:pl-4 flex items-center space-x-2">
                {currentUser.isRecruiter && (
                    <button 
                        onClick={onSwitchProfile} 
                        title={activeProfile === 'user' ? "Switch to Recruiter Profile" : "Switch to Personal Profile"}
                        className="text-xs font-semibold bg-slate-700 text-cyan-300 px-3 py-1.5 rounded-full hover:bg-slate-600 transition-colors"
                    >
                        {activeProfile === 'user' ? 'Recruiter' : 'Personal'}
                    </button>
                )}
               <button onClick={handleProfileClick} className="rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500">
                  <img src={currentUser.avatarUrl} alt={currentUser.name} className={`w-9 h-9 rounded-full object-cover transition-all ${currentView === View.Profile ? 'ring-2 ring-cyan-400' : ''}`} />
               </button>
               <button onClick={onLogout} title="Logout" className="text-slate-400 hover:text-cyan-400 p-2 rounded-full focus:outline-none transition-colors hidden sm:flex">
                  <LogoutIcon className="w-6 h-6" />
               </button>
               <button onClick={onToggleMobileNav} title="Open menu" className="sm:hidden text-slate-400 hover:text-cyan-400 p-2 rounded-full focus:outline-none transition-colors">
                  <MenuIcon className="w-6 h-6" />
               </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;