/**
 * components/recruiter/RecruiterUpgradeModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Upgrade flow: standard user → recruiter account.
 *
 * Steps:
 *   1. Why upgrade — benefits overview
 *   2. Work details — company email, role, company name
 *   3. Email verification — OTP sent to work email
 *   4. What you're hiring for — function, seniority, type
 *   5. Rules acceptance
 *   6. Success — recruiter access unlocked
 *
 * On success, writes to Firestore:
 *   users/{uid}: { isRecruiter: true, recruiterProfile: {...} }
 *   companies/{domain}: auto-creates company stub if not exists
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { X, Building2, Mail, CheckCircle, ArrowRight, Shield, Briefcase, Users, AlertCircle } from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

type Step = 'benefits' | 'details' | 'verify' | 'hiring' | 'rules' | 'success';

const HIRING_FUNCTIONS = [
  'Engineering', 'Product', 'Design', 'Data & Analytics',
  'Marketing', 'Sales', 'Operations', 'Finance', 'HR / People',
  'Legal', 'Other',
];

const SENIORITY_LEVELS = [
  'Entry level (0–2 yrs)', 'Mid level (3–6 yrs)',
  'Senior (7–12 yrs)', 'Leadership (Director+)', 'Executive (VP+)',
];

const RULES = [
  { icon: '🏢', rule: 'You represent your company directly — no agency recruiting or third-party sourcing.' },
  { icon: '💰', rule: 'All job posts must include a salary range. Hidden salaries will be removed.' },
  { icon: '🚫', rule: 'No cold outreach to users who haven\'t applied. Connections must be mutual.' },
  { icon: '✅', rule: 'Your company profile must be complete before posting roles.' },
  { icon: '📋', rule: 'Maximum 3 active listings on the free tier. Unlimited with the Pro plan.' },
];

interface RecruiterUpgradeModalProps {
  currentUser: { id: number; name: string; email?: string };
  fbUserUid:   string;
  onSuccess:   () => void;
  onClose:     () => void;
}

export const RecruiterUpgradeModal: React.FC<RecruiterUpgradeModalProps> = ({
  currentUser, fbUserUid, onSuccess, onClose,
}) => {
  const [step, setStep]               = useState<Step>('benefits');
  const [workEmail, setWorkEmail]     = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole]               = useState('');
  const [otpSent, setOtpSent]         = useState(false);
  const [otp, setOtp]                 = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [functions, setFunctions]     = useState<string[]>([]);
  const [seniority, setSeniority]     = useState<string[]>([]);
  const [hiringType, setHiringType]   = useState<'permanent' | 'contract' | 'both'>('both');
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const isPersonalEmail = (email: string) => {
    const personal = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'proton', 'aol'];
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    return personal.some(p => domain.includes(p));
  };

  const emailDomain = workEmail.split('@')[1] ?? '';
  const emailValid  = workEmail.includes('@') && !isPersonalEmail(workEmail);

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    // In production: call /api/send-recruiter-otp
    // For now: simulate sending
    await new Promise(r => setTimeout(r, 1000));
    setOtpSent(true);
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    // In production: verify OTP against sent code
    // For now: any 6-digit code passes in dev
    await new Promise(r => setTimeout(r, 800));
    if (otp.length === 6) {
      setOtpVerified(true);
      setStep('hiring');
    } else {
      setError('Invalid code. Please check your email and try again.');
    }
    setLoading(false);
  };

  const handleFinish = async () => {
    setLoading(true);
    setError('');
    try {
      const { updateUserInFirestore } = await import('../../lib/firebaseAuth');
      const { getOrCreateCompanyForRecruiter } = await import('../../lib/firestoreService');

      const recruiterProfile = {
        workEmail,
        companyName,
        companyDomain: emailDomain,
        role,
        hiringFunctions:  functions,
        hiringsSeniority: seniority,
        hiringType,
        verifiedAt:       new Date().toISOString(),
        verificationMethod: 'email_domain',
        activePostCount:  0,
        maxFreePosts:     3,
      };

      await updateUserInFirestore(fbUserUid, {
        isRecruiter:      true,
        recruiterProfile,
        updatedAt:        new Date().toISOString(),
      });

      // Auto-create company stub from domain
      await getOrCreateCompanyForRecruiter(fbUserUid, companyName, role);

      setStep('success');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (arr: string[], set: (v: string[]) => void, item: string) => {
    set(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  };

  // ── Step renders ─────────────────────────────────────────────────────────────

  const steps: Record<Step, React.ReactNode> = {

    benefits: (
      <div className="space-y-5">
        <div className="text-center pb-2">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: GREEN_LT }}>
            <Briefcase size={24} style={{ color: GREEN }} />
          </div>
          <h2 className="text-xl font-extrabold text-stone-900">Post roles on BeWatu</h2>
          <p className="text-stone-500 text-sm mt-1.5 max-w-sm mx-auto">
            Reach verified professionals who demonstrate capability — not just a polished CV.
          </p>
        </div>

        <div className="space-y-3">
          {[
            { icon: <Users size={16} style={{ color: GREEN }} />, title: 'Verified talent pool', body: 'Every candidate has demonstrated their skills through arena challenges, reels, and peer endorsements.' },
            { icon: <Shield size={16} style={{ color: GREEN }} />, title: 'Direct company posting only', body: 'No agencies. No job boards. Direct roles from verified companies — so candidates know exactly who they\'re applying to.' },
            { icon: <Building2 size={16} style={{ color: GREEN }} />, title: '3 free active listings', body: 'Post up to 3 roles for free. Salary ranges required — transparency is part of the deal.' },
          ].map(({ icon, title, body }) => (
            <div key={title} className="flex gap-3 p-3.5 rounded-xl border" style={{ borderColor: '#e7e5e4' }}>
              <div className="mt-0.5 flex-shrink-0">{icon}</div>
              <div>
                <p className="font-semibold text-stone-800 text-sm">{title}</p>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => setStep('details')}
          className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          Get started <ArrowRight size={15} />
        </button>
      </div>
    ),

    details: (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-stone-900">Your work details</h2>
          <p className="text-stone-500 text-sm mt-1">We verify your company via your work email domain.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
            Work email address
          </label>
          <input
            type="email"
            value={workEmail}
            onChange={e => setWorkEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
            style={{ borderColor: emailValid ? GREEN : '#e7e5e4' }}
            placeholder="you@yourcompany.com"
          />
          {workEmail && isPersonalEmail(workEmail) && (
            <p className="flex items-center gap-1.5 text-xs text-red-500 mt-1.5">
              <AlertCircle size={12} /> Personal email addresses aren't accepted. Use your company email.
            </p>
          )}
          {emailValid && (
            <p className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color: GREEN }}>
              <CheckCircle size={12} /> Company domain: <strong>{emailDomain}</strong>
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
            Company name
          </label>
          <input
            type="text"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
            style={{ borderColor: '#e7e5e4' }}
            placeholder="e.g. Acme Corp"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
            Your role
          </label>
          <input
            type="text"
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
            style={{ borderColor: '#e7e5e4' }}
            placeholder="e.g. Head of Talent, Founder, HR Manager"
          />
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
          style={{ backgroundColor: GREEN_LT, color: GREEN }}>
          <Shield size={13} className="mt-0.5 flex-shrink-0" />
          <p>We'll send a verification code to your work email. Your company profile will be created automatically from your domain.</p>
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}

        <button
          onClick={handleSendOtp}
          disabled={!emailValid || !companyName.trim() || !role.trim() || loading}
          className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          {loading ? 'Sending…' : <><Mail size={15} /> Send verification code</>}
        </button>

        {otpSent && !loading && (
          <button onClick={() => setStep('verify')}
            className="w-full py-2 text-sm font-semibold text-center transition-colors"
            style={{ color: GREEN }}>
            I already have a code →
          </button>
        )}
      </div>
    ),

    verify: (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-extrabold text-stone-900">Check your email</h2>
          <p className="text-stone-500 text-sm mt-1">
            We sent a 6-digit code to <strong>{workEmail}</strong>
          </p>
        </div>

        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
            Verification code
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3.5 py-3 rounded-xl border text-center text-2xl font-bold tracking-[0.5em] focus:outline-none"
            style={{ borderColor: otp.length === 6 ? GREEN : '#e7e5e4', letterSpacing: '0.5em' }}
            placeholder="——————"
          />
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}

        <button
          onClick={handleVerifyOtp}
          disabled={otp.length !== 6 || loading}
          className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          {loading ? 'Verifying…' : 'Verify & continue'}
        </button>

        <button
          onClick={() => { setOtpSent(false); handleSendOtp(); }}
          className="w-full py-2 text-xs text-stone-400 hover:text-stone-600 transition-colors">
          Resend code
        </button>
      </div>
    ),

    hiring: (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-extrabold text-stone-900">What are you hiring for?</h2>
          <p className="text-stone-500 text-sm mt-1">Helps us match you with the right talent. You can always change this later.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">Functions</label>
          <div className="flex flex-wrap gap-2">
            {HIRING_FUNCTIONS.map(f => (
              <button key={f} onClick={() => toggleItem(functions, setFunctions, f)}
                className="text-xs font-semibold rounded-full px-3 py-1.5 border transition-all"
                style={functions.includes(f)
                  ? { backgroundColor: GREEN_LT, color: GREEN, borderColor: GREEN }
                  : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }
                }>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">Seniority levels</label>
          <div className="flex flex-wrap gap-2">
            {SENIORITY_LEVELS.map(s => (
              <button key={s} onClick={() => toggleItem(seniority, setSeniority, s)}
                className="text-xs font-semibold rounded-full px-3 py-1.5 border transition-all"
                style={seniority.includes(s)
                  ? { backgroundColor: GREEN_LT, color: GREEN, borderColor: GREEN }
                  : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }
                }>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">Role type</label>
          <div className="flex gap-2">
            {(['permanent', 'contract', 'both'] as const).map(t => (
              <button key={t} onClick={() => setHiringType(t)}
                className="flex-1 py-2 text-xs font-semibold rounded-xl border capitalize transition-all"
                style={hiringType === t
                  ? { backgroundColor: GREEN_LT, color: GREEN, borderColor: GREEN }
                  : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }
                }>
                {t}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setStep('rules')}
          disabled={functions.length === 0 || seniority.length === 0}
          className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          Continue
        </button>
      </div>
    ),

    rules: (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-extrabold text-stone-900">BeWatu recruiting rules</h2>
          <p className="text-stone-500 text-sm mt-1">These rules protect the community. Violations result in account suspension.</p>
        </div>

        <div className="space-y-3">
          {RULES.map(({ icon, rule }) => (
            <div key={rule} className="flex gap-3 p-3 rounded-xl" style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4' }}>
              <span className="text-base flex-shrink-0">{icon}</span>
              <p className="text-sm text-stone-700 leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rulesAccepted}
            onChange={e => setRulesAccepted(e.target.checked)}
            className="mt-1 rounded flex-shrink-0"
          />
          <span className="text-sm text-stone-700">
            I agree to BeWatu's recruiting rules and understand that violations will result in my recruiter access being revoked.
          </span>
        </label>

        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}

        <button
          onClick={handleFinish}
          disabled={!rulesAccepted || loading}
          className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          {loading ? 'Setting up your account…' : 'Activate recruiter access'}
        </button>
      </div>
    ),

    success: (
      <div className="text-center space-y-5 py-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ backgroundColor: GREEN_LT }}>
          <CheckCircle size={32} style={{ color: GREEN }} />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-stone-900">Recruiter access unlocked</h2>
          <p className="text-stone-500 text-sm mt-2 max-w-xs mx-auto">
            Your company profile for <strong>{companyName}</strong> has been created.
            You can now post up to 3 active roles for free.
          </p>
        </div>

        <div className="p-4 rounded-2xl text-left space-y-2" style={{ backgroundColor: GREEN_LT }}>
          {[
            `✓ Company: ${companyName}`,
            `✓ Domain verified: @${emailDomain}`,
            '✓ 3 free active job posts',
            '✓ Salary range required on all posts',
          ].map(item => (
            <p key={item} className="text-sm font-semibold" style={{ color: GREEN }}>{item}</p>
          ))}
        </div>

        <button
          onClick={onSuccess}
          className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          Go to Recruiter Console
        </button>
      </div>
    ),
  };

  // ── Step indicators ──────────────────────────────────────────────────────────

  const stepOrder: Step[] = ['benefits', 'details', 'verify', 'hiring', 'rules', 'success'];
  const currentIndex = stepOrder.indexOf(step);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        style={{ borderColor: '#e7e5e4' }}>

        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b z-10"
          style={{ borderColor: '#e7e5e4' }}>
          <div className="flex items-center gap-2">
            <Briefcase size={15} style={{ color: GREEN }} />
            <span className="font-bold text-stone-900 text-sm">Recruiter Access</span>
          </div>
          {step !== 'success' && (
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Progress dots */}
        {step !== 'success' && (
          <div className="flex items-center justify-center gap-1.5 py-3 border-b" style={{ borderColor: '#f3f4f6' }}>
            {stepOrder.slice(0, -1).map((s, i) => (
              <div key={s} className="rounded-full transition-all duration-300"
                style={{
                  width:  i === currentIndex ? 20 : 6,
                  height: 6,
                  backgroundColor: i < currentIndex ? GREEN : i === currentIndex ? GREEN : '#e5e7eb',
                  opacity: i > currentIndex ? 0.4 : 1,
                }} />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {steps[step]}
        </div>
      </div>
    </div>
  );
};

export default RecruiterUpgradeModal;
