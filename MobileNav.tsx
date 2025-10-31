import React from 'react';
import ReactDOM from 'react-dom';
import { View, User } from '../types';
import { HomeIcon, UsersIcon, BriefcaseIcon, MessageSquareIcon, CirclesIcon, BotIcon, LogoutIcon, GlobeIcon } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../hooks/useTranslation';

interface MobileNavProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  currentUser: User;
  onLogout: () => void;
  onSwitchProfile: () => void;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItemProps {
  label: string;
  view: View;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon, isActive, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs transition-colors duration-200 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}>
    {icon}
    <span className="mt-1">{label}</span>
  </button>
);

const MobileNavDrawer: React.FC<MobileNavProps> = ({ isOpen, onClose, currentUser, onLogout, onSwitchProfile, setCurrentView }) => {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  const handleProfileClick = () => {
    setCurrentView(View.Profile);
    onClose();
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <>
      <div 
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      ></div>
      <div className={`fixed top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-700 shadow-xl z-50 transform transition-transform ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center space-x-3 mb-6">
            <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-12 h-12 rounded-full object-cover border-2 border-slate-600" />
            <div>
              <p className="font-bold text-slate-100">{currentUser.name}</p>
              <p className="text-sm text-slate-400">{currentUser.headline}</p>
            </div>
          </div>

          <nav className="flex-grow space-y-2">
            <button onClick={handleProfileClick} className="w-full text-left p-3 rounded-md hover:bg-slate-800 text-slate-300 font-semibold">{t('viewProfile')}</button>
            <button onClick={() => { setCurrentView(View.AIChat); onClose(); }} className="w-full text-left p-3 rounded-md hover:bg-slate-800 text-slate-300 font-semibold">{t('aiChat')}</button>
            {currentUser.isRecruiter && (
              <button onClick={() => { onSwitchProfile(); onClose(); }} className="w-full text-left p-3 rounded-md hover:bg-slate-800 text-slate-300 font-semibold">{t('switchToRecruiter')}</button>
            )}
          </nav>

          <div className="mt-auto space-y-4">
             <div className="flex items-center space-x-2">
                <GlobeIcon className="w-5 h-5 text-slate-400"/>
                <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'es')} className="bg-slate-800 border border-slate-700 text-slate-300 rounded-md p-1.5 text-sm w-full">
                    <option value="en">English</option>
                    <option value="es">Español</option>
                </select>
            </div>
            <button onClick={onLogout} className="w-full flex items-center justify-center p-3 rounded-md bg-slate-800 hover:bg-slate-700 text-red-400 font-semibold">
              <LogoutIcon className="w-5 h-5 mr-2" />
              {t('logout')}
            </button>
          </div>
        </div>
      </div>
    </>,
    modalRoot
  );
};

const MobileNav: React.FC<MobileNavProps> = (props) => {
  const { currentView, setCurrentView } = props;
  const { t } = useTranslation();

  return (
    <>
      <MobileNavDrawer {...props} />
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md border-t border-slate-700 z-30 flex justify-around">
        <NavItem label={t('home')} view={View.Feed} icon={<HomeIcon className="w-6 h-6" />} isActive={currentView === View.Feed} onClick={() => setCurrentView(View.Feed)} />
        <NavItem label={t('people')} view={View.People} icon={<UsersIcon className="w-6 h-6" />} isActive={currentView === View.People} onClick={() => setCurrentView(View.People)} />
        <NavItem label={t('jobs')} view={View.Jobs} icon={<BriefcaseIcon className="w-6 h-6" />} isActive={currentView === View.Jobs} onClick={() => setCurrentView(View.Jobs)} />
        <NavItem label={t('circles')} view={View.Circles} icon={<CirclesIcon className="w-6 h-6" />} isActive={currentView === View.Circles} onClick={() => setCurrentView(View.Circles)} />
        <NavItem label={t('messages')} view={View.Messaging} icon={<MessageSquareIcon className="w-6 h-6" />} isActive={currentView === View.Messaging} onClick={() => setCurrentView(View.Messaging)} />
      </nav>
    </>
  );
};

export default MobileNav;
