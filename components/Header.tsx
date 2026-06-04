import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Home, Users, Users2, Hexagon, Briefcase, MessageSquare, Building2,
  Bell, LogOut, User, ChevronDown, Settings, Sword, Search, Shield, Zap, CreditCard, Trophy, GitMerge,
  CheckCircle, X, Loader2 as Loader, Users as UsersIcon,
} from 'lucide-react';
import { LogoIcon } from '../constants';
import { useFirebase } from '../contexts/FirebaseContext';
import { View } from '../types';
import { Factory, Loader2 } from 'lucide-react';
import { redirectToFactory } from '../lib/handoff';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

// ── Notification item type ────────────────────────────────────────────────────
interface NotifItem {
  id:          string;
  type:        string;
  message:     string;
  actorName?:  string;
  actorAvatar?: string;
  relatedId?:  number;
  circleFirestoreId?: string;
  isRead:      boolean;
  createdAt?:  any;
}

// ── NotificationsPanel ────────────────────────────────────────────────────────
function NotificationsPanel({
  uid, onClose, onNavigate,
}: { uid: string; onClose: () => void; onNavigate: (v: View) => void }) {
  const [notifs,  setNotifs]  = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!uid) return;
    let unsub: (() => void) | undefined;
    import('firebase/firestore').then(({ collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp }) => {
      import('../lib/firebase').then(({ db }) => {
        const q = query(
          collection(db, 'users', uid, 'notifications'),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        unsub = onSnapshot(q, snap => {
          setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifItem)));
          setLoading(false);
          // Mark all as read
          snap.docs.filter(d => !d.data().isRead).forEach(d => {
            updateDoc(doc(db, 'users', uid, 'notifications', d.id), {
              isRead: true, readAt: serverTimestamp()
            }).catch(() => {});
          });
        });
      });
    });
    return () => unsub?.();
  }, [uid]);

  const handleCircleInvite = useCallback(async (notif: NotifItem, accept: boolean) => {
    if (!notif.circleFirestoreId || !uid) return;
    setActing(a => ({ ...a, [notif.id]: true }));
    try {
      const { getDoc, doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, collection, addDoc }
        = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');

      // Get current user's numeric ID
      const userSnap = await getDoc(doc(db, 'users', uid));
      const numericId = userSnap.data()?.numericId;

      // Try pods first (canonical), fall back to circles (legacy)
      let circleRef = doc(db, 'pods', notif.circleFirestoreId);
      const podSnap = await getDoc(circleRef);
      if (!podSnap.exists()) {
        circleRef = doc(db, 'circles', notif.circleFirestoreId);
      }

      if (accept) {
        await updateDoc(circleRef, {
          members:        arrayUnion(numericId),
          pendingInvites: arrayRemove(numericId),
          updatedAt:      serverTimestamp(),
        });
      } else {
        await updateDoc(circleRef, {
          pendingInvites: arrayRemove(numericId),
          updatedAt:      serverTimestamp(),
        });
      }
      // Mark notification as actioned
      await updateDoc(doc(db, 'users', uid, 'notifications', notif.id), {
        actioned: accept ? 'accepted' : 'declined',
        actionedAt: serverTimestamp(),
      });
      setNotifs(ns => ns.map(n => n.id === notif.id
        ? { ...n, actioned: accept ? 'accepted' : 'declined' } as any : n));
    } catch (e) {
      console.error('Circle invite action failed:', e);
    } finally {
      setActing(a => ({ ...a, [notif.id]: false }));
    }
  }, [uid]);

  // Admin approves or denies a join request directly from the notification bell
  const handleJoinRequest = useCallback(async (notif: NotifItem, accept: boolean) => {
    if (!notif.circleFirestoreId || !uid) return;
    setActing(a => ({ ...a, [notif.id]: true }));
    try {
      const { getDoc, doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, collection, addDoc }
        = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');

      const actorNumericId = (notif as any).actorId;
      // actorUid is stored on the notification at write time — use directly, no query needed
      const requesterUid   = (notif as any).actorUid ?? null;

      // Try pods first (canonical), fall back to circles (legacy)
      let circleRef = doc(db, 'pods', notif.circleFirestoreId);
      const podSnap = await getDoc(circleRef);
      if (!podSnap.exists()) circleRef = doc(db, 'circles', notif.circleFirestoreId);
      const circleSnap = podSnap.exists() ? podSnap : await getDoc(circleRef);
      const circleName = circleSnap.data()?.name ?? 'the pod';

      if (accept) {
        await updateDoc(circleRef, {
          members:        arrayUnion(actorNumericId),
          pendingMembers: arrayRemove(actorNumericId),
          updatedAt:      serverTimestamp(),
        });
      } else {
        await updateDoc(circleRef, {
          pendingMembers: arrayRemove(actorNumericId),
          updatedAt:      serverTimestamp(),
        });
      }

      // Notify the requester
      if (requesterUid) {
        await addDoc(collection(db, 'users', requesterUid, 'notifications'), {
          type:              accept ? 'circle_approved' : 'circle_denied',
          message:           accept
            ? `Your request to join "${circleName}" was approved`
            : `Your request to join "${circleName}" was not approved`,
          relatedId:         notif.relatedId ?? null,
          circleFirestoreId: notif.circleFirestoreId,
          isRead:            false,
          createdAt:         serverTimestamp(),
        });
      }

      // Mark admin's notification as actioned
      await updateDoc(doc(db, 'users', uid, 'notifications', notif.id), {
        actioned: accept ? 'accepted' : 'declined',
        actionedAt: serverTimestamp(),
      });
      setNotifs(ns => ns.map(n => n.id === notif.id
        ? { ...n, actioned: accept ? 'accepted' : 'declined' } as any : n));
    } catch (e) {
      console.error('Join request action failed:', e);
    } finally {
      setActing(a => ({ ...a, [notif.id]: false }));
    }
  }, [uid]);

  function timeAgo(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate?.() ?? new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function notifIcon(type: string) {
    if (type === 'circle_invite' || type === 'circle_approved' || type === 'circle_denied' || type === 'circle_post' || type === 'circle_join_request' || type === 'post_comment') {
      return <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: GREEN_LT }}><UsersIcon size={14} style={{ color: GREEN }} /></div>;
    }
    if (type === 'connection_request') {
      return <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-50"><Users size={14} className="text-blue-500" /></div>;
    }
    return <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-stone-100"><Bell size={14} className="text-stone-400" /></div>;
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border bg-white shadow-2xl shadow-black/10 z-50 overflow-hidden"
      style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#f3f4f6' }}>
        <h3 className="font-bold text-stone-900">Notifications</h3>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader size={18} className="animate-spin text-stone-300" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-10">
            <Bell size={24} className="text-stone-200 mx-auto mb-2" />
            <p className="text-sm text-stone-400">No notifications yet</p>
          </div>
        ) : (
          notifs.map(n => {
            const actioned = (n as any).actioned;
            return (
              <div key={n.id}
                className="px-4 py-3 border-b last:border-0 hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#f9f9f9', backgroundColor: n.isRead ? 'white' : '#f7fcfa' }}>
                <div className="flex items-start gap-3">
                  {n.actorAvatar
                    ? <img src={n.actorAvatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : notifIcon(n.type)
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-800 leading-snug">{n.message}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{timeAgo(n.createdAt)}</p>

                    {/* Circle invite — accept/decline from bell */}
                    {n.type === 'circle_invite' && !actioned && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleCircleInvite(n, true)}
                          disabled={acting[n.id]}
                          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                          style={{ backgroundColor: GREEN }}>
                          {acting[n.id] ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                          Accept
                        </button>
                        <button
                          onClick={() => handleCircleInvite(n, false)}
                          disabled={acting[n.id]}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-stone-50 disabled:opacity-50"
                          style={{ borderColor: '#e7e5e4', color: '#6b7280' }}>
                          Decline
                        </button>
                      </div>
                    )}
                    {n.type === 'circle_invite' && actioned && (
                      <p className="text-xs mt-1 font-medium" style={{ color: actioned === 'accepted' ? GREEN : '#9ca3af' }}>
                        {actioned === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                      </p>
                    )}

                    {/* Join request — admin approves/declines from bell */}
                    {n.type === 'circle_join_request' && !actioned && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleJoinRequest(n, true)}
                          disabled={acting[n.id]}
                          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                          style={{ backgroundColor: GREEN }}>
                          {acting[n.id] ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                          Approve
                        </button>
                        <button
                          onClick={() => handleJoinRequest(n, false)}
                          disabled={acting[n.id]}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-stone-50 disabled:opacity-50"
                          style={{ borderColor: '#e7e5e4', color: '#6b7280' }}>
                          Deny
                        </button>
                      </div>
                    )}
                    {n.type === 'circle_join_request' && actioned && (
                      <p className="text-xs mt-1 font-medium" style={{ color: actioned === 'accepted' ? GREEN : '#9ca3af' }}>
                        {actioned === 'accepted' ? '✓ Approved' : '✗ Denied'}
                      </p>
                    )}

                    {/* Approval/denial status for the applicant */}
                    {n.type === 'circle_approved' && (
                      <p className="text-xs mt-1 font-medium" style={{ color: GREEN }}>✓ You're in</p>
                    )}
                    {n.type === 'circle_denied' && (
                      <p className="text-xs mt-1 font-medium text-stone-400">Request not approved</p>
                    )}
                  </div>
                  {!n.isRead && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: GREEN }} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Simplified navigation: 7 core items (down from 11)
// Community = Circles + Pods, Showcase = Prove + Arenas
// Pricing & Lens moved to profile dropdown
const NAV_ITEMS = [
  { view: View.Feed,          label: 'Home',        icon: Home          },
  { view: View.Connections,   label: 'Community',   icon: Users2        },
  { view: View.Prove,         label: 'Showcase',    icon: Trophy        },
  { view: View.Jobs,          label: 'Jobs',        icon: Briefcase     },
  { view: View.Messaging,     label: 'Messages',    icon: MessageSquare },
  { view: View.Companies,     label: 'Companies',   icon: Building2     },
  { view: View.Bridge as any, label: 'Bridge',      icon: GitMerge      },
];

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  onSwitchToRecruiter?: () => void;
  onEnterAdminPanel?: () => void;
  notificationCount?: number;
  pendingConnectionCount?: number;
  onSearch?: (query: string) => void;
}

export function Header({ currentView, onNavigate, onLogout, onSwitchToRecruiter, onEnterAdminPanel, notificationCount = 0, pendingConnectionCount = 0, onSearch }: HeaderProps) {
  const { currentUser, fbUser } = useFirebase() as any;
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [factoryLoading, setFactoryLoading] = useState(false);
  const menuRef  = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current  && !menuRef.current.contains(e.target as Node))  setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'BW';

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    onSearch?.(searchQuery.trim());
    onNavigate(View.People);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
    // Live search as user types
    if (e.target.value.trim()) {
      onSearch?.(e.target.value.trim());
    }
  }
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
    <header className="fixed top-0 right-0 left-0 z-50 border-b bg-white/95 backdrop-blur-sm" style={{ borderColor: "#e7e5e4" }}>
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center gap-2 sm:gap-4 px-3 sm:px-4">
        {/* Logo */}
        <button onClick={() => onNavigate(View.Feed)} className="flex items-center shrink-0">
          <LogoIcon className="h-8 sm:h-10 w-auto" style={{ color: "#1a4a3a" }} />
        </button>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative hidden flex-1 max-w-md md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            placeholder="Search people..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-9 w-full rounded-full border bg-stone-100 pl-9 pr-4 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:border-stone-400"
            style={{ borderColor: "#e7e5e4" }}
          />
        </form>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ view, label, icon: Icon }) => {
            const active = currentView === view;
            const badge = view === View.Connections && pendingConnectionCount > 0 ? pendingConnectionCount : 0;
            return (
              <button
                key={view}
                onClick={() => onNavigate(view)}
                className={`relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? "font-semibold" : "text-stone-500 hover:text-stone-800"}`}
                style={active ? { color: "#1a4a3a" } : {}}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
          {notifOpen && fbUser && (
            <NotificationsPanel
              uid={fbUser.uid}
              onClose={() => setNotifOpen(false)}
              onNavigate={onNavigate}
            />
          )}
        </div>

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
            <ChevronDown className="hidden h-3.5 w-3.5 text-stone-500 sm:block" />
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
              {onEnterAdminPanel && (
                <button onClick={() => { onEnterAdminPanel(); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-100 transition-colors text-stone-700">
                  <Shield className="h-4 w-4 text-stone-500" />Platform Admin
                </button>
              )}
              <button onClick={() => { onNavigate(View.Settings ?? View.Profile); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                <Settings className="h-4 w-4" />Settings
              </button>
              <div className="my-1 h-px bg-stone-100" />
              <button onClick={() => { onNavigate(View.AIChat as any); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                <Zap className="h-4 w-4" />Lens AI
              </button>
              <button onClick={() => { onNavigate(View.Pricing); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                <CreditCard className="h-4 w-4" />Pricing & Plans
              </button>
              <button
  onClick={() => { handleGoToFactory(); setMenuOpen(false); }}
  disabled={factoryLoading}
  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-green-50 transition-colors"
  style={{ color: "#1a4a3a" }}
>
  {factoryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Factory className="h-4 w-4" />}
  {factoryLoading ? "Launching…" : "Go to Factory →"}
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
