// src/components/legal/CommunityGuidelines.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Community Guidelines for bewatu.com
// Effective: March 31, 2026
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

interface CommunityGuidelinesProps {
  onBack?: () => void;
}

const EFFECTIVE_DATE = 'March 31, 2026';
const REPORT_EMAIL = 'trust@bewatu.com';

export default function CommunityGuidelines({ onBack }: CommunityGuidelinesProps) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f5f4' }}>
      {/* Header */}
      <div className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          {onBack && (
            <button onClick={onBack}
              className="text-stone-500 hover:text-stone-900 text-sm font-medium flex items-center gap-1.5 transition-colors">
              ← Back
            </button>
          )}
          <div>
            <h1 className="text-base font-semibold text-stone-900">Community Guidelines</h1>
            <p className="text-xs text-stone-500">Effective {EFFECTIVE_DATE}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-20">

        {/* Intro card */}
        <div className="rounded-2xl p-6 mb-6 border border-[#c7e8d8]" style={{ backgroundColor: '#e8f4f0' }}>
          <p className="text-sm text-[#1a4a3a] leading-relaxed">
            BeWatu is built on the idea that professionals grow faster when they help each other. These guidelines exist to keep this a place where people feel safe sharing ideas, giving honest feedback, and building real careers. We expect everyone to uphold them.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-10 space-y-8 text-stone-700 text-sm leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Be Respectful</h2>
            <p>Treat every person on BeWatu with the respect you would want for yourself. Disagreement is healthy — personal attacks are not. Critique ideas, not people. We have zero tolerance for harassment, bullying, or targeted abuse of any kind.</p>
            <p>This includes:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li>No threats, hate speech, or discriminatory language based on race, gender, religion, nationality, sexual orientation, disability, or any other characteristic</li>
              <li>No doxxing or sharing private information about others without consent</li>
              <li>No coordinated pile-ons or group harassment</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Be Honest</h2>
            <p>The value of BeWatu depends on authenticity. Represent yourself accurately — your experience, your skills, your affiliation. Misleading others about your identity or credentials undermines trust for everyone.</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li>No fake profiles, impersonation, or misrepresentation of credentials</li>
              <li>No fabricated or manipulated content presented as real</li>
              <li>No false claims about your company, role, or qualifications</li>
              <li>Disclose conflicts of interest when relevant</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Keep It Professional</h2>
            <p>BeWatu is a professional community. Content should be relevant to career development, professional networking, skills, industry knowledge, or innovation. This is not a place for personal entertainment content, explicit material, or off-topic spam.</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li>No sexually explicit or graphic content</li>
              <li>No unsolicited promotional messages or mass outreach</li>
              <li>No repetitive or low-quality content designed to game ranking systems</li>
              <li>No content that exists solely to generate engagement without value</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Protect Intellectual Property</h2>
            <p>Respect the work of others. Do not post content you do not have the right to share, and do not misappropriate the ideas or work of other BeWatu members — particularly in the context of BeWatu Factory, where early-stage ideas are shared in good faith.</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li>No posting of copyrighted content without permission</li>
              <li>No claiming credit for others' work or ideas</li>
              <li>No using Factory to extract ideas without contributing</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Recruiters and Employers</h2>
            <p>Recruiters are welcome on BeWatu, but only under specific conditions. You must be an individual employed directly by the hiring company — recruitment agencies are not permitted. Opportunity posts must be genuine, accurate, and for real positions. Ghost postings, bait-and-switch listings, or misleading compensation information will result in removal and account suspension.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">BeWatu Factory Standards</h2>
            <p>Factory is an invite-only space for building startups. The standards here are higher. Members are expected to contribute meaningfully, engage in good faith with other builders, and treat the space as a professional co-working environment rather than a networking event. Investors in Factory have read-only access to deal flow and must not solicit founders outside of the Platform's structured processes.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Enforcement</h2>
            <p>We review reports of guideline violations and take action based on severity and context. Consequences range from content removal to temporary suspension to permanent account termination. Repeated violations or severe offences (such as harassment, hate speech, or fraud) will result in immediate permanent removal.</p>
            <p>We aim to be consistent and fair, but our decisions are final. If you believe a decision was made in error, you may appeal by contacting <a href={`mailto:${REPORT_EMAIL}`} className="text-[#1a4a3a] underline">{REPORT_EMAIL}</a>.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Reporting</h2>
            <p>If you see content or behaviour that violates these guidelines, please report it using the report button on any post, profile, or message. You can also contact our trust and safety team directly at <a href={`mailto:${REPORT_EMAIL}`} className="text-[#1a4a3a] underline">{REPORT_EMAIL}</a>.</p>
            <p>Reports are confidential. We will not disclose who reported a piece of content.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">Updates</h2>
            <p>These guidelines will evolve as BeWatu grows. We will notify the community of significant changes. Your continued use of the Platform after changes take effect constitutes acceptance of the updated guidelines.</p>
          </section>

        </div>
      </div>
    </div>
  );
}
