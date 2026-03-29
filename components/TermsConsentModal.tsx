/**
 * components/TermsConsentModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Blocking overlay shown when a user hasn't agreed to the current terms.
 * Shown on:
 *   1. New registration (first time)
 *   2. Existing user whose agreedToTermsVersion < TERMS_VERSION
 *
 * Stores agreedToTermsAt + agreedToTermsVersion on the user's Firestore doc.
 * User cannot proceed until they agree.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { Shield, FileText, Users, AlertTriangle, ExternalLink, Check } from 'lucide-react';

export const TERMS_VERSION = '1.0';

interface TermsConsentModalProps {
  userName:    string;
  isNewUser?:  boolean;
  onAgree:     () => Promise<void>;
}

const GREEN = '#1a4a3a';

const SUMMARY_POINTS = [
  {
    icon: <Users size={16} />,
    title: 'Community standards',
    body:  'BeWatu is a professional platform. You agree to interact respectfully, not impersonate others, and not post harmful, fraudulent, or misleading content.',
  },
  {
    icon: <Shield size={16} />,
    title: 'Your data',
    body:  'We collect only what we need to operate the platform. We don\'t sell your data. You can request deletion at any time by contacting support@bewatu.com.',
  },
  {
    icon: <FileText size={16} />,
    title: 'Content you post',
    body:  'You own your content. By posting, you grant BeWatu a limited licence to display it on the platform. You\'re responsible for ensuring you have rights to anything you share.',
  },
  {
    icon: <AlertTriangle size={16} />,
    title: 'No guarantees',
    body:  'BeWatu is a platform for connection and opportunity. We don\'t guarantee employment, investment outcomes, or business results. Any decisions made are your own.',
  },
];

export default function TermsConsentModal({
  userName,
  isNewUser = false,
  onAgree,
}: TermsConsentModalProps) {
  const [agreed,   setAgreed]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function handleAgree() {
    if (!agreed || saving) return;
    setSaving(true);
    try {
      await onAgree();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-7 pt-7 pb-5" style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #2d7a5e 100%)` }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white/60 uppercase tracking-widest">Bewatu LLC</p>
              <p className="text-sm font-bold text-white">Terms & Privacy — v{TERMS_VERSION}</p>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white">
            {isNewUser
              ? `Welcome to BeWatu, ${userName.split(' ')[0]}.`
              : `We've updated our terms, ${userName.split(' ')[0]}.`}
          </h2>
          <p className="text-sm text-white/70 mt-1">
            {isNewUser
              ? 'Before you get started, please review and agree to our terms.'
              : 'Please review the updates before continuing.'}
          </p>
        </div>

        {/* Content */}
        <div className="px-7 py-5 max-h-[50vh] overflow-y-auto">
          <p className="text-xs text-stone-500 mb-4">
            Here's a plain-English summary of what you're agreeing to. Full documents linked below.
          </p>

          <div className="space-y-2">
            {SUMMARY_POINTS.map((point, i) => (
              <button key={i} onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full text-left rounded-2xl border border-stone-100 hover:border-stone-200 transition-all overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-shrink-0 text-stone-400">{point.icon}</div>
                  <p className="text-sm font-semibold text-stone-800 flex-1">{point.title}</p>
                  <div className={`text-stone-400 transition-transform ${expanded === i ? 'rotate-180' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
                {expanded === i && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-stone-500 leading-relaxed">{point.body}</p>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Full docs links */}
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              { label: 'Terms of Service',    href: '/terms' },
              { label: 'Privacy Policy',      href: '/privacy' },
              { label: 'Community Guidelines', href: '/community' },
            ].map(link => (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold hover:underline"
                style={{ color: GREEN }}>
                {link.label} <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 pb-7 pt-4 border-t border-stone-100">
          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer mb-5 select-none">
            <div onClick={() => setAgreed(a => !a)}
              className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
              style={{
                borderColor:     agreed ? GREEN : '#d6d3d1',
                backgroundColor: agreed ? GREEN : 'white',
              }}>
              {agreed && <Check size={12} className="text-white" strokeWidth={3} />}
            </div>
            <span className="text-sm text-stone-600 leading-relaxed">
              I have read and agree to BeWatu's{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer"
                className="font-semibold hover:underline" style={{ color: GREEN }}>
                Terms of Service
              </a>
              ,{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer"
                className="font-semibold hover:underline" style={{ color: GREEN }}>
                Privacy Policy
              </a>
              , and{' '}
              <a href="/community" target="_blank" rel="noopener noreferrer"
                className="font-semibold hover:underline" style={{ color: GREEN }}>
                Community Guidelines
              </a>
              . I am at least 18 years old.
            </span>
          </label>

          <button onClick={handleAgree} disabled={!agreed || saving}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: GREEN }}>
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving…
              </>
            ) : (
              <>
                <Check size={15} />
                I agree — continue to BeWatu
              </>
            )}
          </button>

          <p className="text-[10px] text-stone-400 text-center mt-3 leading-relaxed">
            Bewatu LLC · US · support@bewatu.com · v{TERMS_VERSION} · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
