// src/components/legal/PrivacyPolicy.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy for bewatu.com
// Effective: March 31, 2026 | Version 1.0
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

const EFFECTIVE_DATE = 'March 31, 2026';
const PRIVACY_EMAIL = 'privacy@bewatu.com';
const COMPANY = 'Bewatu LLC';

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
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
            <h1 className="text-base font-semibold text-stone-900">Privacy Policy</h1>
            <p className="text-xs text-stone-500">Effective {EFFECTIVE_DATE} · Version 1.0</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-20">
        <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-10 space-y-8 text-stone-700 text-sm leading-relaxed">

          <div className="space-y-2">
            <p>This Privacy Policy describes how {COMPANY} ("BeWatu", "we", "our", or "us") collects, uses, and shares information about you when you use our platform at bewatu.com and factory.bewatu.com (the "Platform").</p>
            <p>We are committed to protecting your privacy. Please read this policy carefully. By using the Platform, you agree to the collection and use of your information as described here.</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">1. Information We Collect</h2>
            <p><strong className="font-medium text-stone-800">Information you provide directly:</strong> When you create an account, you provide us with your name, email address, and profile information including your headline, bio, skills, industry, and professional goals. You may also provide optional information such as your location, portfolio links, and work experience.</p>
            <p><strong className="font-medium text-stone-800">Content you create:</strong> We collect the content you post on the Platform, including posts, sparks, reels, messages, job applications, circle activity, arena submissions, and Factory pipeline contributions.</p>
            <p><strong className="font-medium text-stone-800">Payment information:</strong> If you subscribe to a paid plan, payment is processed by Stripe. We receive confirmation of payment and your subscription status, but we do not store your full card details.</p>
            <p><strong className="font-medium text-stone-800">Usage data:</strong> We collect information about how you use the Platform, including pages visited, features used, and interactions with content. This helps us improve the service.</p>
            <p><strong className="font-medium text-stone-800">Device information:</strong> We collect basic device and browser information including IP address, browser type, and operating system to maintain security and improve performance.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li>Provide, maintain, and improve the Platform</li>
              <li>Match you with relevant opportunities, people, and content based on your skills and industry</li>
              <li>Send you notifications about activity relevant to your account</li>
              <li>Process payments and manage your subscription</li>
              <li>Enforce our Terms of Service and Community Guidelines</li>
              <li>Communicate with you about product updates and important notices</li>
              <li>Detect and prevent fraud, abuse, and security incidents</li>
            </ul>
            <p>We do not sell your personal data. We do not use your content or data to train AI models.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">3. How We Share Your Information</h2>
            <p><strong className="font-medium text-stone-800">With other users:</strong> Your public profile information, posts, and activity are visible to other authenticated users of the Platform in accordance with your privacy settings. In BeWatu Factory, your startup information may be visible to verified investors.</p>
            <p><strong className="font-medium text-stone-800">With service providers:</strong> We share information with third-party providers who help us operate the Platform, including Firebase (Google) for authentication and database services, Stripe for payment processing, and Vercel for hosting. These providers are contractually obligated to protect your data.</p>
            <p><strong className="font-medium text-stone-800">For legal reasons:</strong> We may disclose your information if required by law, legal process, or to protect the rights, property, or safety of BeWatu, our users, or the public.</p>
            <p><strong className="font-medium text-stone-800">Business transfers:</strong> If BeWatu is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you before your information is transferred and becomes subject to a different privacy policy.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">4. Data Retention</h2>
            <p>We retain your personal data for as long as your account is active. If you delete your account, your profile will be anonymised within 30 days and permanently deleted within 12 months. Some data may be retained longer where required by law or for legitimate business purposes such as fraud prevention.</p>
            <p>Content you post (such as posts or comments) may remain visible in anonymised or aggregate form after account deletion.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">5. Cookies and Tracking</h2>
            <p>We use cookies and similar technologies to operate the Platform. These include:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li><strong className="font-medium text-stone-700">Essential cookies:</strong> Required for authentication, security, and basic Platform functionality. These cannot be disabled.</li>
              <li><strong className="font-medium text-stone-700">Analytics cookies:</strong> Help us understand how the Platform is used so we can improve it. These are only set with your consent.</li>
              <li><strong className="font-medium text-stone-700">Payment cookies:</strong> Set by Stripe to process payments securely. Subject to Stripe's cookie policy.</li>
            </ul>
            <p>You can manage your cookie preferences through the cookie banner when you first visit the Platform, or at any time through your browser settings.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">6. Your Rights</h2>
            <p>Depending on where you are located, you may have the following rights regarding your personal data:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-stone-600">
              <li><strong className="font-medium text-stone-700">Access:</strong> Request a copy of the data we hold about you</li>
              <li><strong className="font-medium text-stone-700">Correction:</strong> Request that we correct inaccurate data</li>
              <li><strong className="font-medium text-stone-700">Deletion:</strong> Request deletion of your account and personal data</li>
              <li><strong className="font-medium text-stone-700">Portability:</strong> Receive your data in a machine-readable format</li>
              <li><strong className="font-medium text-stone-700">Objection:</strong> Object to certain processing of your data</li>
              <li><strong className="font-medium text-stone-700">Restriction:</strong> Request that we restrict processing of your data</li>
            </ul>
            <p>To exercise any of these rights, contact us at <a href={`mailto:${PRIVACY_EMAIL}`} className="text-[#1a4a3a] underline">{PRIVACY_EMAIL}</a>. We will respond within 30 days.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">7. Children's Privacy</h2>
            <p>The Platform is not intended for children under the age of 16. We do not knowingly collect personal information from children under 16. If you believe a child under 16 has provided us with personal information, please contact us at {PRIVACY_EMAIL} and we will delete that information promptly.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">8. International Users</h2>
            <p>BeWatu is operated from the United States. If you access the Platform from outside the United States, your information will be transferred to and processed in the United States. By using the Platform, you consent to this transfer. We take appropriate measures to protect your information in accordance with this Privacy Policy.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">9. Security</h2>
            <p>We implement industry-standard security measures to protect your information, including encrypted data transmission (HTTPS), secure authentication via Firebase, and access controls limiting who within our organisation can access user data. However, no system is completely secure, and we cannot guarantee the absolute security of your information.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by email and by requiring your acknowledgement before you continue using the Platform. The date at the top of this page indicates when the policy was last updated.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-stone-900">11. Contact Us</h2>
            <p>If you have questions about this Privacy Policy or our data practices, please contact our privacy team at <a href={`mailto:${PRIVACY_EMAIL}`} className="text-[#1a4a3a] underline">{PRIVACY_EMAIL}</a>.</p>
            <p className="text-stone-500 text-xs">{COMPANY} · United States</p>
          </section>

        </div>
      </div>
    </div>
  );
}
