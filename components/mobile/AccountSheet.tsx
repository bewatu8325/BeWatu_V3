/**
 * components/mobile/AccountSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The You menu on phones (opened from the You tab and the header avatar).
 *
 *   Explore              Opportunities, Showcase, Pods, Organizations, Bridge
 *   Your Experience      Profile, Settings & Preferences, Notifications
 *   Tools & plans        Lens, Pricing, Factory, recruiter and admin switches (when they apply)
 *   Support              Help & Support, Report a Concern, Send Feedback
 *   About BeWatu         Our Story, Privacy & Legal (Terms, Privacy Policy, Community Guidelines), Connect With Us
 *
 * These are the links the full-width footer used to carry on phones; every destination is unchanged. The bottom
 * of the menu shows the copyright and the app version in one compact line.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import {
  User, Settings, Bell, LifeBuoy, Flag, MessageSquare, BookOpen, Shield, Link2, ChevronRight, ChevronDown,
  Zap, CreditCard, Briefcase, LogOut, Loader2, Mail,
} from 'lucide-react';
import { Factory } from 'lucide-react';
import { View } from '../../types';
import { useFirebase } from '../../contexts/FirebaseContext';
import { BriefcaseIcon, ShowcaseIcon, PodsIcon, CompaniesIcon, BridgeIcon } from '../IconComponents';
import { versionLabel } from '../../lib/appVersion';
import { ENGAGEMENT_GATE_TOOLTIP } from '../../lib/engagementGate';
import FeedbackModal from '../FeedbackModal';
import BottomSheet from './BottomSheet';

const GREEN = 'var(--bw-green)';
const SUPPORT_EMAIL = 'support@bewatu.com';

export interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onReportConcern: () => void;
  onOpenAbout: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  onOpenCommunity: () => void;
  onOpenConnect: () => void;
  notificationCount?: number;
  onSwitchToRecruiter?: () => void;
  onEnterAdminPanel?: () => void;
  onGoToFactory?: () => Promise<void> | void;
  factoryGated?: boolean;
}

export const EXPLORE_ITEMS: { view: View; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { view: View.Jobs, label: 'Opportunities', Icon: BriefcaseIcon },
  { view: View.Prove, label: 'Showcase', Icon: ShowcaseIcon },
  { view: View.Circles, label: 'Pods', Icon: PodsIcon },
  { view: View.Companies, label: 'Organizations', Icon: CompaniesIcon },
  { view: View.Bridge, label: 'Bridge', Icon: BridgeIcon },
];

const Row: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; href?: string; trailing?: React.ReactNode; tone?: 'default' | 'green' | 'danger'; disabled?: boolean; title?: string; expanded?: boolean }> =
  ({ icon, label, onClick, href, trailing, tone = 'default', disabled, title, expanded }) => {
    const color = tone === 'green' ? GREEN : tone === 'danger' ? '#b91c1c' : '#292524';
    const cls = 'flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2 disabled:opacity-50';
    const style = { color, ['--tw-ring-color' as any]: GREEN };
    const inner = (
      <>
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-stone-500" style={tone === 'default' ? undefined : { color }}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing}
        {onClick && expanded === undefined && !trailing && <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />}
        {expanded !== undefined && <ChevronDown className={`h-4 w-4 flex-shrink-0 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />}
      </>
    );
    return href
      ? <a href={href} className={cls} style={style}>{inner}</a>
      : <button type="button" onClick={onClick} disabled={disabled} title={title} aria-expanded={expanded} className={cls} style={style}>{inner}</button>;
  };

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section aria-label={title} className="py-1.5">
    <h3 className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-stone-500">{title}</h3>
    <div>{children}</div>
  </section>
);

export const AccountSheet: React.FC<AccountSheetProps> = (p) => {
  const { currentUser } = useFirebase();
  const [legalOpen, setLegalOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [factoryBusy, setFactoryBusy] = useState(false);

  // Close first so what opens is not trapped behind the sheet; the sheet is the only thing that closes itself.
  const act = (fn: () => void) => () => { p.onClose(); fn(); };
  const go = (view: View) => act(() => p.onNavigate(view));
  const openNotifications = act(() => window.dispatchEvent(new CustomEvent('bewatu:open-notifications')));

  const initials = (currentUser?.name ?? 'BeWatu').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <BottomSheet open={p.open} onClose={p.onClose} title="You">
        {/* who you are */}
        <button type="button" onClick={go(View.Profile)}
          className="mb-1 flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-left active:bg-stone-100 focus:outline-none focus-visible:ring-2"
          style={{ ['--tw-ring-color' as any]: GREEN }}>
          {currentUser?.avatarUrl
            ? <img src={currentUser.avatarUrl} alt="" className="h-11 w-11 flex-shrink-0 rounded-full object-cover" />
            : <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>{initials}</span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-stone-900">{currentUser?.name ?? 'Your profile'}</span>
            <span className="block truncate text-xs text-stone-600">{currentUser?.headline || 'View your profile'}</span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </button>

        <Group title="Explore">
          <div className="grid grid-cols-3 gap-1 px-1">
            {EXPLORE_ITEMS.map(({ view, label, Icon }) => (
              <button key={view} type="button" onClick={go(view)} aria-label={label}
                className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-stone-700 hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2"
                style={{ ['--tw-ring-color' as any]: GREEN }}>
                <Icon className="h-6 w-6" />
                <span className="max-w-full truncate text-xs font-medium leading-none">{label}</span>
              </button>
            ))}
          </div>
        </Group>

        <Group title="Your Experience">
          <Row icon={<User className="h-5 w-5" />} label="Profile" onClick={go(View.Profile)} />
          <Row icon={<Settings className="h-5 w-5" />} label="Settings & Preferences" onClick={act(p.onOpenSettings)} />
          <Row icon={<Bell className="h-5 w-5" />} label="Notifications" onClick={openNotifications}
            trailing={(p.notificationCount ?? 0) > 0
              ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${p.notificationCount} unread`}>{(p.notificationCount ?? 0) > 9 ? '9+' : p.notificationCount}</span>
              : <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />} />
        </Group>

        {(p.onSwitchToRecruiter || p.onEnterAdminPanel || p.onGoToFactory) && (
          <Group title="Tools & Plans">
            {p.onSwitchToRecruiter && <Row tone="green" icon={<Briefcase className="h-5 w-5" />} label="Switch to Recruiter" onClick={act(p.onSwitchToRecruiter)} />}
            {p.onEnterAdminPanel && <Row icon={<Shield className="h-5 w-5" />} label="Platform Admin" onClick={act(p.onEnterAdminPanel)} />}
            {p.onGoToFactory && (
              <Row tone="green" icon={factoryBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Factory className="h-5 w-5" />} label={factoryBusy ? 'Launching…' : 'Go to Factory'}
                disabled={factoryBusy || p.factoryGated} title={p.factoryGated ? ENGAGEMENT_GATE_TOOLTIP : undefined}
                onClick={async () => { setFactoryBusy(true); try { await p.onGoToFactory!(); } finally { setFactoryBusy(false); } }} />
            )}
            <Row icon={<Zap className="h-5 w-5" />} label="Lens" onClick={go(View.AIChat)} />
            <Row icon={<CreditCard className="h-5 w-5" />} label="Pricing" onClick={go(View.Pricing)} />
          </Group>
        )}
        {!(p.onSwitchToRecruiter || p.onEnterAdminPanel || p.onGoToFactory) && (
          <Group title="Tools & Plans">
            <Row icon={<Zap className="h-5 w-5" />} label="Lens" onClick={go(View.AIChat)} />
            <Row icon={<CreditCard className="h-5 w-5" />} label="Pricing" onClick={go(View.Pricing)} />
          </Group>
        )}

        <Group title="Support">
          <Row icon={<LifeBuoy className="h-5 w-5" />} label="Help & Support" href={`mailto:${SUPPORT_EMAIL}`} trailing={<Mail className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />} />
          <Row icon={<Flag className="h-5 w-5" />} label="Report a Concern" onClick={act(p.onReportConcern)} />
          <Row icon={<MessageSquare className="h-5 w-5" />} label="Send Feedback" onClick={() => { p.onClose(); setFeedbackOpen(true); }} />
        </Group>

        <Group title="About BeWatu">
          <Row icon={<BookOpen className="h-5 w-5" />} label="Our Story" onClick={act(p.onOpenAbout)} />
          <Row icon={<Shield className="h-5 w-5" />} label="Privacy & Legal" onClick={() => setLegalOpen(o => !o)} expanded={legalOpen} />
          {legalOpen && (
            <div className="ml-8 border-l border-stone-200 pl-1" role="group" aria-label="Privacy and legal">
              <Row icon={<span className="h-1.5 w-1.5 rounded-full bg-stone-400" />} label="Terms of Service" onClick={act(p.onOpenTerms)} />
              <Row icon={<span className="h-1.5 w-1.5 rounded-full bg-stone-400" />} label="Privacy Policy" onClick={act(p.onOpenPrivacy)} />
              <Row icon={<span className="h-1.5 w-1.5 rounded-full bg-stone-400" />} label="Community Guidelines" onClick={act(p.onOpenCommunity)} />
            </div>
          )}
          <Row icon={<Link2 className="h-5 w-5" />} label="Connect With Us" onClick={act(p.onOpenConnect)} />
        </Group>

        <div className="mt-1 border-t border-stone-100 pt-1">
          <Row tone="danger" icon={<LogOut className="h-5 w-5" />} label="Sign out" onClick={act(p.onLogout)} />
        </div>
        <p className="px-3 pb-1 pt-3 text-center text-[11px] text-stone-500">&copy; {new Date().getFullYear()} Bewatu LLC · {versionLabel()}</p>
      </BottomSheet>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
};

export default AccountSheet;
