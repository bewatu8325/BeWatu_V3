// src/components/legal/TermsOfService.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Terms of Service page for bewatu.com
// Effective: March 31, 2026 | Version 1.0
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

interface TermsOfServiceProps {
  onBack?: () => void;
}

const EFFECTIVE_DATE = 'March 31, 2026';
const LEGAL_EMAIL = 'legal@bewatu.com';
const COMPANY = 'Bewatu LLC';

export default function TermsOfService({ onBack }: TermsOfServiceProps) {
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
            <h1 className="text-base font-semibold text-stone-900">Terms of Service</h1>
            <p className="text-xs text-stone-500">Effective {EFFECTIVE_DATE} · Version 1.0</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-20">
        <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-10 space-y-8 text-stone-700 text-sm leading-relaxed">

          <div className="space-y-2">
            <p>Welcome to BeWatu. These Terms of Service ("Terms") govern your access to and use of the BeWatu platform, including bewatu.com, factory.bewatu.com, and any associated mobile applications (collectively, the "Platform"), operated by {COMPANY} ("BeWatu", "we", "our", or "us").</p>
            <p>By creating an account or using the Platform, you agree to these Terms. If you do not agree, please do not use the Platform.</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">1. Eligibility</h2>
            <p>You must be at least 16 years old to use BeWatu. By using the Platform, you represent and warrant that you meet this age requirement and have the legal capacity to enter into these Terms. If you are between 16 and 18, you represent that your parent or guardian has reviewed and agreed to these Terms on your behalf.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">2. Your Account</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us immediately at {LEGAL_EMAIL} if you suspect unauthorised access to your account. We reserve the right to suspend or terminate accounts that violate these Terms.</p>
            <p>You may not create accounts using automated means, maintain multiple accounts for deceptive purposes, or transfer your account to another person.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">3. Your Content</h2>
            <p>You own the content you post on BeWatu. By posting content, you grant BeWatu a limited, non-exclusive, royalty-free, worldwide licence to display, distribute, and promote your content within the Platform for the purpose of operating and improving the service. This licence does not extend to use of your content for AI model training.</p>
            <p>You are solely responsible for the content you post. You must not post content that is unlawful, harmful, misleading, harassing, defamatory, or that infringes the intellectual property rights of others.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">4. BeWatu Factory</h2>
            <p>BeWatu Factory ("Factory") is a separate, invite-only workspace for building startups. Access to Factory requires either a direct invitation from BeWatu operations or a nomination from an existing Factory member. BeWatu reserves the right to grant or revoke Factory access at its sole discretion.</p>
            <p>Content posted in Factory, including ideas, problems, solutions, team applications, and startup information, may be visible to verified investors and other Factory members as part of the platform's intended functionality.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">5. Recruiters and Employers</h2>
            <p>Recruiters must be individual professionals employed directly by the hiring company. Recruitment agencies, staffing firms, and third-party recruiters are not permitted to post on BeWatu. Recruiters must complete a four-step eligibility verification process before posting opportunities. BeWatu reserves the right to remove any posting or recruiter access that does not meet these standards.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">6. Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li>Harass, threaten, or intimidate other users</li>
              <li>Post spam, misleading information, or unsolicited promotional content</li>
              <li>Scrape, crawl, or systematically extract data from the Platform</li>
              <li>Impersonate another person or entity</li>
              <li>Attempt to gain unauthorised access to any part of the Platform</li>
              <li>Use the Platform for any unlawful purpose</li>
              <li>Post content that discriminates on the basis of race, gender, religion, nationality, sexual orientation, disability, or any other protected characteristic</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">7. Intellectual Property</h2>
            <p>The BeWatu name, logo, and platform design are the intellectual property of {COMPANY}. You may not use our branding without prior written permission. Content created by BeWatu, including but not limited to the platform interface, generated insights, and editorial content, remains our exclusive property.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">8. Subscriptions and Payments</h2>
            <p>Some features of BeWatu require a paid subscription. Subscriptions are billed in advance and are non-refundable except as required by applicable law. We use Stripe to process payments — your payment information is handled directly by Stripe and is subject to their terms and privacy policy. BeWatu does not store your full payment card details.</p>
            <p>We may change subscription pricing with 30 days' notice. If you do not agree to a price change, you may cancel your subscription before the change takes effect.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">9. Data Retention and Deletion</h2>
            <p>We retain your personal data for up to one year after account deletion. Upon requesting account deletion, your profile will be anonymised within 30 days and permanently deleted within 12 months. You may request a copy of your data at any time by contacting {LEGAL_EMAIL}.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">10. Disclaimers and Limitation of Liability</h2>
            <p>The Platform is provided "as is" without warranties of any kind. BeWatu does not guarantee the accuracy, completeness, or usefulness of any content on the Platform. To the maximum extent permitted by law, BeWatu shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">11. Termination</h2>
            <p>We may suspend or terminate your access to the Platform at any time, with or without notice, for conduct that we determine violates these Terms or is harmful to other users, us, or third parties. You may delete your account at any time through your profile settings.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">12. Governing Law and Disputes</h2>
            <p>These Terms are governed by the laws of the United States and the Commonwealth of Virginia, without regard to conflict of law provisions. Any disputes arising under these Terms shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, seated in Virginia, except that either party may seek injunctive relief in a court of competent jurisdiction.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">13. Changes to These Terms</h2>
            <p>We may update these Terms from time to time. When we do, we will notify you via email and require you to review and agree to the updated Terms before continuing to use the Platform. Your continued use after agreeing to updated Terms constitutes acceptance of the changes.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">14. Contact</h2>
            <p>If you have questions about these Terms, please contact us at <a href={`mailto:${LEGAL_EMAIL}`} className="text-[#1a4a3a] underline">{LEGAL_EMAIL}</a>.</p>
            <p className="text-stone-500 text-xs">{COMPANY} · United States</p>
          </section>

        </div>
      </div>
    </div>
  );
}
