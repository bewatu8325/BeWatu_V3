// src/components/CookieBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Cookie consent banner — three tiers, full user choice
// Essential (required) | Analytics (opt-in) | Marketing (opt-in)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';

export const COOKIE_CONSENT_KEY     = 'bewatu_cookie_consent';
export const COOKIE_CONSENT_VERSION = '1';

export interface CookieConsent {
  version:   string;
  essential: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

// ── Helpers (importable by other modules) ─────────────────────────────────────

export function getCookieConsent(): CookieConsent | null {
  try {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    return parsed as CookieConsent;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getCookieConsent()?.analytics === true;
}

export function hasMarketingConsent(): boolean {
  return getCookieConsent()?.marketing === true;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CookieBannerProps {
  onShowPrivacy?:    () => void;
  onConsentChange?:  (consent: CookieConsent) => void;
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        disabled ? 'cursor-not-allowed opacity-60' :
        checked   ? 'bg-[#1a4a3a]' : 'bg-stone-200'
      }`}
      aria-checked={checked}
      role="switch"
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-1'
      }`} />
    </button>
  );
}

export default function CookieBanner({ onShowPrivacy, onConsentChange }: CookieBannerProps) {
  const [visible,    setVisible]    = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [analytics,  setAnalytics]  = useState(false);
  const [marketing,  setMarketing]  = useState(false);

  useEffect(() => {
    const existing = getCookieConsent();
    if (!existing) {
      const t = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(t);
    }
  }, []);

  function save(analyticsValue: boolean, marketingValue: boolean) {
    const consent: CookieConsent = {
      version:   COOKIE_CONSENT_VERSION,
      essential: true,
      analytics: analyticsValue,
      marketing: marketingValue,
      decidedAt: new Date().toISOString(),
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    onConsentChange?.(consent);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-40 bg-black/10 sm:hidden" />

      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-sm">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden">

          {!showDetail ? (
            /* ── Simple view ──────────────────────────────────────────────── */
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5 select-none">🍪</span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-stone-900">Your cookie choices</p>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    We use essential cookies to keep BeWatu running. You choose whether we collect analytics or marketing data.{' '}
                    <button
                      onClick={onShowPrivacy}
                      className="text-[#1a4a3a] underline underline-offset-2 hover:no-underline">
                      Privacy Policy
                    </button>
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => save(true, true)}
                  className="w-full py-2 px-4 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#1a4a3a' }}>
                  Accept all
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => save(false, false)}
                    className="py-2 px-3 rounded-xl text-xs font-medium text-stone-600 border border-stone-200 hover:bg-stone-50 transition-colors">
                    Essential only
                  </button>
                  <button
                    onClick={() => setShowDetail(true)}
                    className="py-2 px-3 rounded-xl text-xs font-medium text-stone-600 border border-stone-200 hover:bg-stone-50 transition-colors">
                    My choices
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Detailed preferences ─────────────────────────────────────── */
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDetail(false)}
                  className="text-stone-400 hover:text-stone-700 text-sm transition-colors">
                  ←
                </button>
                <p className="text-sm font-semibold text-stone-900">Manage cookies</p>
              </div>

              {/* Essential */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-stone-100">
                <div className="space-y-0.5 flex-1">
                  <p className="text-xs font-semibold text-stone-800">Essential</p>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Sign-in, security, and core functionality. Required for BeWatu to work.
                  </p>
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <span className="text-[11px] font-semibold text-[#1a4a3a] bg-[#e8f4f0] px-2 py-0.5 rounded-full whitespace-nowrap">
                    Always on
                  </span>
                </div>
              </div>

              {/* Analytics */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-stone-100">
                <div className="space-y-0.5 flex-1">
                  <p className="text-xs font-semibold text-stone-800">Analytics</p>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Helps us understand how you use BeWatu so we can improve it. No data is sold or shared with advertisers.
                  </p>
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <Toggle checked={analytics} onChange={setAnalytics} />
                </div>
              </div>

              {/* Marketing */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-stone-100">
                <div className="space-y-0.5 flex-1">
                  <p className="text-xs font-semibold text-stone-800">Marketing</p>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Allows us to show you relevant opportunities and platform updates beyond BeWatu. You can opt out at any time.
                  </p>
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <Toggle checked={marketing} onChange={setMarketing} />
                </div>
              </div>

              {/* Payment processing cookies — info only */}
              <div className="flex items-start justify-between gap-4 pb-1">
                <div className="space-y-0.5 flex-1">
                  <p className="text-xs font-semibold text-stone-800">Payment processing</p>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Required for subscription and payment functionality. Governed by our payment processor's privacy policy.
                  </p>
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <span className="text-[11px] font-medium text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                    Required
                  </span>
                </div>
              </div>

              <button
                onClick={() => save(analytics, marketing)}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#1a4a3a' }}>
                Save my choices
              </button>

              <p className="text-[11px] text-stone-400 text-center leading-relaxed">
                You can update these at any time from your profile settings.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
