
import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { HomeIcon, UsersIcon, BriefcaseIcon, ChatBubbleIcon, BellIcon, ChevronDownIcon, SearchIcon, ConnectSphereLogo } from './IconComponents';

const Navbar: React.FC = () => {
  const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
    `flex flex-col items-center px-2 text-gray-600 hover:text-black transition-colors duration-200 ${isActive ? 'text-black border-b-2 border-black' : ''}`;

  return (
    <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center space-x-2">
            <Link to="/" className="flex items-center">
              <ConnectSphereLogo className="h-9 w-9" />
            </Link>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="text"
                placeholder="Search"
                className="bg-blue-50/20 w-72 rounded-md py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
              />
            </div>
          </div>
          
          <nav className="flex items-center space-x-6">
            <NavLink to="/" className={navLinkClass}>
              <HomeIcon />
              <span className="text-xs hidden sm:block">Home</span>
            </NavLink>
            <NavLink to="/connections" className={navLinkClass}>
              <UsersIcon />
              <span className="text-xs hidden sm:block">My Network</span>
            </NavLink>
            <NavLink to="/jobs" className={navLinkClass}>
              <BriefcaseIcon />
              <span className="text-xs hidden sm:block">Jobs</span>
            </NavLink>
            <a href="#" className="flex flex-col items-center px-2 text-gray-600 hover:text-black">
              <ChatBubbleIcon />
              <span className="text-xs hidden sm:block">Messaging</span>
            </a>
            <a href="#" className="flex flex-col items-center px-2 text-gray-600 hover:text-black">
              <BellIcon />
              <span className="text-xs hidden sm:block">Notifications</span>
            </a>
            
            <div className="h-10 border-l border-gray-300"></div>

            <div className="relative">
              <button className="flex flex-col items-center text-gray-600 hover:text-black focus:outline-none">
                <img src="https://picsum.photos/seed/user1/24/24" alt="User" className="rounded-full" />
                <div className="flex items-center">
                    <span className="text-xs hidden sm:block">Me</span>
                    <ChevronDownIcon className="h-3 w-3 hidden sm:block" />
                </div>
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
