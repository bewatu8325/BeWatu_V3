/**
 * components/MobileNav.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The phone's bottom navigation: Home, Community, Arenas, Messages, You.
 *
 * It matches the desktop header's destinations (Home, Community, Arenas, Prove, Discover, Messages): Prove and Discover
 * are reached from the Explore row on Home and from the You menu, and Create is a button in the header, so nothing floats
 * over the page or the bar. Nothing was removed: Jobs, Organizations, Bridge, Pods and the rest keep their pages.
 *
 * Every tab is at least 44 CSS px wide and tall (they share the width, 64px tall), the bar sits above the bottom
 * safe area, and the page reserves exactly the bar's height (see `MOBILE_NAV_CLEARANCE`) so content is never hidden behind
 * it. The highlighted tab comes from the same place the desktop header uses (lib/routes.ts navKeyFor), so the two
 * cannot disagree. Hidden from md up.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from 'react';
import { View } from '../types';
import { useFirebase } from '../contexts/FirebaseContext';
import { navKeyFor } from '../lib/routes';
import { NavHomeIcon, NavCommunityIcon, NavArenasIcon, NavMessagesIcon, NavYouIcon } from './icons/NavIcons';

const GREEN = 'var(--bw-green)';

/** Tailwind class for the bottom padding of page content on phones: bar height (64) + hairline + safe area + a little air. */
export const MOBILE_NAV_CLEARANCE = 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10';

interface MobileNavProps {
  currentView: View | string;
  onNavigate: (view: View) => void;
  pendingConnectionCount?: number;
  unreadMessageCount?: number;
  /** Opens the You menu (profile, settings, support, legal). */
  onOpenAccount: () => void;
  accountOpen?: boolean;
}

export function MobileNav({ currentView, onNavigate, pendingConnectionCount = 0, unreadMessageCount = 0, onOpenAccount, accountOpen = false }: MobileNavProps) {
  const { currentUser } = useFirebase();
  const here = navKeyFor(String(currentView));

  const tabs: { key: string; label: string; Icon: React.FC<any>; active: boolean; badge?: number; onPress: () => void; ariaLabel?: string; haspopup?: boolean }[] = [
    { key: 'home', label: 'Home', Icon: NavHomeIcon, active: here === 'home' && !accountOpen, onPress: () => onNavigate(View.Feed) },
    { key: 'community', label: 'Community', Icon: NavCommunityIcon, active: here === 'community' && !accountOpen, badge: pendingConnectionCount, onPress: () => onNavigate(View.Connections),
      ariaLabel: pendingConnectionCount > 0 ? `Community, ${pendingConnectionCount} pending` : 'Community' },
    { key: 'arenas', label: 'Arenas', Icon: NavArenasIcon, active: here === 'arenas' && !accountOpen, onPress: () => onNavigate(View.Arenas) },
    { key: 'messages', label: 'Messages', Icon: NavMessagesIcon, active: here === 'messages' && !accountOpen, badge: unreadMessageCount, onPress: () => onNavigate(View.Messaging),
      ariaLabel: unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : 'Messages' },
    { key: 'you', label: 'You', Icon: NavYouIcon, active: accountOpen || here === 'you', onPress: onOpenAccount, ariaLabel: 'You: profile, settings and support', haspopup: true },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ backgroundColor: '#ffffff', borderTop: '1px solid #e7e5e4', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-xl items-stretch">
        {tabs.map(({ key, label, Icon, active, badge = 0, onPress, ariaLabel, haspopup }) => (
          <li key={key} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onPress}
              aria-label={ariaLabel ?? label}
              aria-current={active && !haspopup ? 'page' : undefined}
              aria-haspopup={haspopup ? 'dialog' : undefined}
              aria-expanded={haspopup ? accountOpen : undefined}
              className="relative flex h-16 min-h-[44px] w-full min-w-[44px] flex-col items-center justify-center gap-1 transition-colors active:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{ color: active ? GREEN : '#57534e', ['--tw-ring-color' as any]: GREEN }}
            >
              {/* active indicator: a bar on the tab's top edge */}
              <span aria-hidden="true" className="absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-b-full transition-opacity" style={{ backgroundColor: GREEN, opacity: active ? 1 : 0 }} />
              <span className="relative flex h-6 w-6 items-center justify-center">
                {key === 'you' && currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" style={{ outline: `2px solid ${active ? 'var(--bw-green)' : '#d6d3d1'}`, outlineOffset: 1 }} />
                ) : (
                  <Icon />
                )}
                {badge > 0 && (
                  <span aria-hidden="true" className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate text-[11px] leading-none" style={{ fontWeight: active ? 700 : 500 }}>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default MobileNav;
