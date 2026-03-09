import React, { useState } from 'react';
import { View, User, Notification, ConnectionRequest } from '../types';
import { LogoIcon, HomeIcon, UsersIcon, BriefcaseIcon, MessageSquareIcon, CirclesIcon } from '../constants';
import NotificationsDropdown from './NotificationsDropdown';
import { useTranslation } from '../hooks/useTranslation';
import { redirectToFactory } from '../lib/handoff';

interface TopNavProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  currentUser: User;
  onLogout: () => void;
  onSwitchProfile: () => void;
  notifications: Notification[];
  connectionRequests: ConnectionRequest[];
  users: User[];
  onAcceptConnection: (requestId: string) => void;
  onDeclineConnection: (requestId: string) => void;
}

interface NavItemProps {
  label: string;
  view: View;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon, isActive, onClick }) => (
  <button onClick={onClick} className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-colors duration-200 text-sm ${isActive ? 'bg-slate-700 text-cyan-400 font-semibold' : 'text-slate-400 hover:bg-slate-700/50'}`}>
    {icon}
    <span>{label}</span>
  </button>
);

const TopNav: React.FC<TopNavProps> = (props) => {
  const { currentView, setCurrentView, currentUser, onLogout, onSwitchProfile } = props;
  const { t } = useTranslation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [factoryLoading, setFactoryLoading] = useState(false);
  
  const unreadCount = props.notifications.filter(n => !n.read).length;
  async function handleGoToFactory() {
  setFactoryLoading(true);
  try {
    await redirectToFactory("/");
  } catch (err) {
    console.error("Handoff failed:", err);
    setFactoryLoading(false);
  }
}

  return (
    <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700 sticky top-0 z-20">
      <div className="container mx-auto px-4 sm:px-6 flex justify-between items-center h-16">
        <div className="flex items-center space-x-6">
          <LogoIcon className="h-8 w-auto text-cyan-400" />
          <nav className="hidden sm:flex items-center space-x-2">
            <NavItem label={t('home')} view={View.Feed} icon={<HomeIcon className="w-5 h-5"/>} isActive={currentView === View.Feed} onClick={() => setCurrentView(View.Feed)} />
            <NavItem label={t('people')} view={View.People} icon={<UsersIcon className="w-5 h-5"/>} isActive={currentView === View.People} onClick={() => setCurrentView(View.People)} />
            <NavItem label={t('opportunities')} view={View.Opportunities} icon={<BriefcaseIcon className="w-5 h-5"/>} isActive={currentView === View.Opportunities} onClick={() => setCurrentView(View.Opportunities)} />
            <NavItem label={t('circles')} view={View.Circles} icon={<CirclesIcon className="w-5 h-5"/>} isActive={currentView === View.Circles} onClick={() => setCurrentView(View.Circles)} />
            <NavItem label={t('messages')} view={View.Messaging} icon={<MessageSquareIcon className="w-5 h-5"/>} isActive={currentView === View.Messaging} onClick={() => setCurrentView(View.Messaging)} />
          </nav>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
           <div className="relative">
            <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="relative p-2 rounded-full hover:bg-slate-700/50 text-slate-400 hover:text-slate-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {unreadCount > 0 && <span className="absolute top-1 right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
            </button>
            {isNotificationsOpen && <NotificationsDropdown notifications={props.notifications} connectionRequests={props.connectionRequests} users={props.users} onAcceptConnection={props.onAcceptConnection} onDeclineConnection={props.onDeclineConnection} />}
          </div>
          
          <div className="relative">
            <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="flex items-center space-x-2 p-1 rounded-full hover:bg-slate-700/50">
              <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-9 h-9 rounded-full object-cover" />
            </button>
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-xl shadow-lg border border-slate-700">
                <div className="p-2">
                  <button onClick={() => { setCurrentView(View.Profile); setIsProfileOpen(false); }} className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-700 text-slate-200">{t('viewProfile')}</button>
                  <button onClick={() => { setCurrentView(View.Settings); setIsProfileOpen(false); }} className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-700 text-slate-200">Settings</button>
                  {currentUser.isRecruiter && <button onClick={() => { onSwitchProfile(); setIsProfileOpen(false); }} className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-700 text-slate-200">{t('switchToRecruiter')}</button>}
                  <button
  onClick={() => { handleGoToFactory(); setIsProfileOpen(false); }}
  disabled={factoryLoading}
  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-700 text-cyan-400"
>
  {factoryLoading ? "Launching…" : "Go to Factory →"}
</button>
                  <div className="border-t border-slate-700 my-1"></div>
                  <button onClick={onLogout} className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-700 text-red-400">{t('logout')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNav;