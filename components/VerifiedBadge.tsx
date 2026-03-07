/**
 * components/VerifiedBadge.tsx
 *
 * Visual verification indicators for BeWatu's company + recruiter system.
 * Four exports:
 *   VerifiedBadge          — compact inline badge with tooltip
 *   VerifiedBadgeFull      — large badge for profile headers
 *   UnverifiedWarningBanner — persistent warning for company owners
 *   PostingRestrictionNotice — explains why a specific action is blocked
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck, Shield, Clock, XCircle, AlertTriangle,
  ChevronRight, Info, Lock, ExternalLink,
} from 'lucide-react';
import {
  getVerificationDisplay,
  getRestrictions,
  type CompanyVerificationStatus,
} from '../lib/verification';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

// ─── Icon resolver ────────────────────────────────────────────────────────────

function StatusIcon({
  status,
  size = 'sm',
}: {
  status: CompanyVerificationStatus;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const px = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' }[size];
  const display = getVerificationDisplay(status);

  if (status === 'verified') return <ShieldCheck className={px} />;
  if (status === 'pending')  return <Clock className={px} />;
  if (status === 'rejected') return <XCircle className={px} />;
  return <Shield className={px} />;
}

// ─── VerifiedBadge ────────────────────────────────────────────────────────────
/**
 * Compact inline badge — shows status label with icon and optional tooltip.
 * Use inside names, job cards, company tiles.
 */
interface VerifiedBadgeProps {
  status: CompanyVerificationStatus;
  showTooltip?: boolean;
  compact?: boolean; // Icon only, no label
}

export function VerifiedBadge({
  status,
  showTooltip = true,
  compact = false,
}: VerifiedBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const display = getVerificationDisplay(status);

  function showTip() {
    timerRef.current = setTimeout(() => setTooltipVisible(true), 400);
  }
  function hideTip() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltipVisible(false);
  }
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Only show badge for non-unverified statuses by default — unverified is absence of trust
  if (status === 'unverified') return null;

  return (
    <span
      className="relative inline-flex items-center gap-1 rounded-full text-xs font-bold cursor-default select-none px-2 py-0.5"
      style={{
        background: display.bg,
        color: display.color,
        border: `1px solid ${display.border}`,
      }}
      onMouseEnter={showTooltip ? showTip : undefined}
      onMouseLeave={showTooltip ? hideTip : undefined}
      onFocus={showTooltip ? showTip : undefined}
      onBlur={showTooltip ? hideTip : undefined}
      tabIndex={showTooltip ? 0 : undefined}
    >
      <StatusIcon status={status} size="xs" />
      {!compact && <span>{display.badgeLabel}</span>}

      {/* Tooltip */}
      {showTooltip && tooltipVisible && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 rounded-xl px-3 py-2 text-xs font-medium text-white shadow-xl whitespace-nowrap pointer-events-none"
          style={{ background: '#1c1917', maxWidth: '220px', whiteSpace: 'normal' }}
        >
          {display.tooltipText}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: '#1c1917' }}
          />
        </span>
      )}
    </span>
  );
}

// ─── VerifiedBadgeFull ────────────────────────────────────────────────────────
/**
 * Large badge with background for company profile headers, cards, modals.
 * Shows icon + label + descriptive subtitle.
 */
interface VerifiedBadgeFullProps {
  status: CompanyVerificationStatus;
  companyName?: string;
  showDescription?: boolean;
}

export function VerifiedBadgeFull({
  status,
  companyName,
  showDescription = true,
}: VerifiedBadgeFullProps) {
  const display = getVerificationDisplay(status);
  const restrictions = getRestrictions(status);

  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-4 border"
      style={{ background: display.bg, borderColor: display.border }}
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: display.color + '15', color: display.color }}
      >
        <StatusIcon status={status} size="md" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {companyName && (
            <span className="font-black text-stone-900 text-sm truncate">{companyName}</span>
          )}
          <span
            className="text-xs font-black rounded-full px-2.5 py-0.5"
            style={{ background: display.color, color: 'white' }}
          >
            {display.badgeLabel}
          </span>
        </div>
        {showDescription && (
          <p className="text-xs mt-0.5" style={{ color: display.color }}>
            {restrictions.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── UnverifiedWarningBanner ──────────────────────────────────────────────────
/**
 * Persistent warning strip for company owners/admins who haven't verified.
 * Shows what's blocked + a CTA to start verification.
 */
interface UnverifiedWarningBannerProps {
  status: CompanyVerificationStatus;
  companyName?: string;
  onStartVerification: () => void;
  rejectionReason?: string;
  compact?: boolean;
}

export function UnverifiedWarningBanner({
  status,
  companyName,
  onStartVerification,
  rejectionReason,
  compact = false,
}: UnverifiedWarningBannerProps) {
  const restrictions = getRestrictions(status);
  const display = getVerificationDisplay(status);

  if (status === 'verified') return null;
  if (status === 'suspended') return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 flex items-start gap-3">
      <XCircle className="w-5 h-5 text-stone-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-stone-700 text-sm">Account suspended</p>
        <p className="text-xs text-stone-500 mt-0.5">Contact <a href="mailto:support@bewatu.com" className="underline">support@bewatu.com</a> to resolve.</p>
      </div>
    </div>
  );

  if (status === 'pending') return (
    <div
      className="rounded-2xl border p-4 flex items-start gap-3"
      style={{ background: '#fef3c7', borderColor: '#fde68a' }}
    >
      <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-amber-900 text-sm">Verification under review</p>
        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
          Your request has been submitted. Job listings are in preview mode until approved — they won't appear in the candidate feed yet.
          Most reviews complete within 1–2 business days.
        </p>
      </div>
    </div>
  );

  if (status === 'rejected') return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-bold text-red-800 text-sm">Verification not approved</p>
          {rejectionReason && (
            <p className="text-xs text-red-700 mt-1 leading-relaxed">
              <strong>Reason:</strong> {rejectionReason}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onStartVerification}
        className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
        style={{ background: '#dc2626' }}
      >
        Resubmit verification <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  // status === 'unverified'
  const blockedActions = [
    !restrictions.canPostJobs && 'Post live job listings',
    !restrictions.canContactCandidates && 'Contact candidates directly',
    restrictions.jobVisibility === 'hidden' && 'Appear in candidate job searches',
  ].filter(Boolean) as string[];

  if (compact) {
    return (
      <div
        className="rounded-xl border p-3 flex items-center gap-3"
        style={{ background: '#fef3c7', borderColor: '#fde68a' }}
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <p className="text-xs text-amber-800 flex-1">
          <strong>Unverified</strong> — Job listings are hidden from candidates.{' '}
          <button onClick={onStartVerification} className="underline font-bold">Verify now →</button>
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ background: '#fffbeb', borderColor: '#fde68a' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: '#fef3c7' }}
        >
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="font-black text-amber-900">
            {companyName ? `${companyName} is not verified` : 'Company not verified'}
          </p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            Verify your company to unlock posting and candidate outreach. The process takes less than 2 minutes.
          </p>
        </div>
      </div>

      {blockedActions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-white p-3 space-y-1.5">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Currently blocked</p>
          {blockedActions.map(action => (
            <div key={action} className="flex items-center gap-2 text-xs text-amber-700">
              <Lock className="w-3 h-3 flex-shrink-0" />
              {action}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onStartVerification}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white transition-opacity hover:opacity-90"
        style={{ background: GREEN }}
      >
        Start verification <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── PostingRestrictionNotice ─────────────────────────────────────────────────
/**
 * Contextual notice displayed inline when a user tries to do something
 * blocked by their verification status (e.g. post a job, contact a candidate).
 *
 * action: what they were trying to do
 */
interface PostingRestrictionNoticeProps {
  status: CompanyVerificationStatus;
  action?: 'post_job' | 'contact_candidate' | 'view_profile' | 'generic';
  onGoToVerification: () => void;
  rejectionReason?: string;
}

const ACTION_COPY: Record<string, { title: string; desc: string }> = {
  post_job: {
    title: 'Verification required to post jobs',
    desc: 'Job listings from unverified companies are not shown to candidates. Complete verification in under 2 minutes.',
  },
  contact_candidate: {
    title: 'Verification required to contact candidates',
    desc: 'Direct outreach is reserved for verified companies to protect candidates from unvetted recruiters.',
  },
  view_profile: {
    title: 'Verification required',
    desc: 'Full profile access is available once your company is verified.',
  },
  generic: {
    title: 'Verification required',
    desc: 'This feature requires company verification.',
  },
};

export function PostingRestrictionNotice({
  status,
  action = 'generic',
  onGoToVerification,
  rejectionReason,
}: PostingRestrictionNoticeProps) {
  const copy = ACTION_COPY[action] ?? ACTION_COPY.generic;
  const display = getVerificationDisplay(status);

  const isPending  = status === 'pending';
  const isRejected = status === 'rejected';

  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-4 text-center items-center"
      style={{ background: display.bg, borderColor: display.border }}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: display.color + '15', color: display.color }}
      >
        {isPending ? (
          <Clock className="w-7 h-7" />
        ) : isRejected ? (
          <XCircle className="w-7 h-7" />
        ) : (
          <Lock className="w-7 h-7" />
        )}
      </div>

      <div className="space-y-1">
        <p className="font-black text-stone-900">{copy.title}</p>
        <p className="text-sm text-stone-500 max-w-xs mx-auto leading-relaxed">
          {isPending
            ? 'Your verification is under review. This feature will unlock automatically once approved.'
            : isRejected && rejectionReason
              ? `Verification was rejected: ${rejectionReason}. Please resubmit.`
              : copy.desc}
        </p>
      </div>

      {!isPending && (
        <button
          onClick={onGoToVerification}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-black text-white transition-opacity hover:opacity-90"
          style={{ background: isRejected ? '#dc2626' : GREEN }}
        >
          {isRejected ? 'Resubmit verification' : 'Verify company'}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* What to expect */}
      {!isPending && !isRejected && (
        <div className="flex items-center gap-1.5 text-xs text-stone-400">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Takes under 2 minutes · Work email or document review</span>
        </div>
      )}
    </div>
  );
}
