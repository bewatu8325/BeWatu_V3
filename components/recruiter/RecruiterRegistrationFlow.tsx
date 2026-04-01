// src/components/recruiter/RecruiterRegistrationFlow.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 4-gate recruiter registration flow:
//   Gate 1 — Account completeness (profile ≥ 70%)
//   Gate 2 — Company email domain (no free providers)
//   Gate 3 — No-agency declaration (explicit checkbox)
//   Gate 4 — Ops approval (writes application to Firestore queue)
//
// Usage: render when user wants to become a recruiter but isRecruiter === false
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  Building2, Mail, Shield, Clock, Loader2, User,
} from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

// ── Free email domain blocklist ───────────────────────────────────────────────
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me',
  'mail.com', 'ymail.com', 'msn.com', 'googlemail.com', 'fastmail.com',
  'tutanota.com', 'zoho.com', 'yandex.com', 'inbox.com', 'gmx.com',
]);

function isPersonalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return FREE_EMAIL_DOMAINS.has(domain);
}

// ── Profile completeness scoring ──────────────────────────────────────────────
interface ProfileScore {
  score: number;
  missing: string[];
}

function scoreProfile(user: any): ProfileScore {
  const checks = [
    { field: 'displayName',    label: 'Full name',              weight: 15 },
    { field: 'photoURL',       label: 'Profile photo',          weight: 15 },
    { field: 'headline',       label: 'Professional headline',  weight: 15 },
    { field: 'bio',            label: 'Bio',                    weight: 10 },
    { field: 'industry',       label: 'Industry',               weight: 10 },
    { field: 'location',       label: 'Location',               weight: 5  },
    { field: 'skills',         label: 'At least 3 skills',      weight: 15, check: (v: any) => Array.isArray(v) && v.length >= 3 },
    { field: 'website',        label: 'LinkedIn or website',    weight: 5  },
    { field: 'connectionCount',label: 'At least 5 connections', weight: 10, check: (v: any) => (v ?? 0) >= 5 },
  ];

  let score = 0;
  const missing: string[] = [];

  for (const c of checks) {
    const val = user[c.field];
    const passes = c.check ? c.check(val) : (val && String(val).trim().length > 0);
    if (passes) {
      score += c.weight;
    } else {
      missing.push(c.label);
    }
  }

  return { score, missing };
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Gate = 1 | 2 | 3 | 4 | 'submitted';

interface RecruiterRegistrationFlowProps {
  user:             any;       // bewatu User object
  fbUserUid:        string;
  fbUserEmail:      string;
  onSuccess:        () => void; // called after ops application submitted
  onCancel:         () => void;
}

// ── Gate indicator ────────────────────────────────────────────────────────────
function GateStep({ num, label, status }: { num: number; label: string; status: 'done' | 'active' | 'pending' }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all ${
        status === 'done'   ? 'text-white'   :
        status === 'active' ? 'text-white'   : 'text-stone-400'
      }`} style={{
        backgroundColor: status === 'done' ? GREEN : status === 'active' ? '#1a6b52' : '#e7e5e4',
      }}>
        {status === 'done' ? <CheckCircle2 size={14} /> : num}
      </div>
      <span className={`text-xs font-medium hidden sm:block ${
        status === 'active' ? 'text-stone-900' : 'text-stone-400'
      }`}>{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RecruiterRegistrationFlow({
  user,
  fbUserUid,
  fbUserEmail,
  onSuccess,
  onCancel,
}: RecruiterRegistrationFlowProps) {
  const [gate, setGate] = useState<Gate>(1);

  // Gate 2 state
  const [workEmail, setWorkEmail] = useState(
    isPersonalEmail(fbUserEmail) ? '' : fbUserEmail
  );
  const [emailError, setEmailError] = useState('');

  // Gate 3 state
  const [agreedNoAgency, setAgreedNoAgency] = useState(false);
  const [agreedAccurate, setAgreedAccurate] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Gate 4 state
  const [jobTitle,     setJobTitle]     = useState('');
  const [companyName,  setCompanyName]  = useState('');
  const [companySize,  setCompanySize]  = useState('');
  const [hiringFor,    setHiringFor]    = useState('');
  const [linkedinUrl,  setLinkedinUrl]  = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');

  // Profile score for Gate 1
  const profileScore = useMemo(() => scoreProfile(user), [user]);
  const passesGate1  = profileScore.score >= 70;

  // Email check for Gate 2
  const emailDomain     = workEmail.split('@')[1]?.toLowerCase() ?? '';
  const passesEmailCheck = workEmail.includes('@') && !isPersonalEmail(workEmail) && workEmail.includes('.');

  // Gate 3 check
  const passesGate3 = agreedNoAgency && agreedAccurate && agreedTerms;

  // Gate 4 check
  const passesGate4 = jobTitle.trim().length > 0 && companyName.trim().length > 0 && companySize && hiringFor.trim().length > 0;

  async function handleSubmit() {
    if (!passesGate4) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');

      await addDoc(collection(db, 'recruiter_applications'), {
        // Applicant
        uid:          fbUserUid,
        email:        fbUserEmail,
        workEmail:    workEmail,
        name:         user.displayName ?? user.name ?? '',
        avatarUrl:    user.photoURL ?? user.avatarUrl ?? '',
        linkedinUrl:  linkedinUrl.trim(),
        // Company
        jobTitle:     jobTitle.trim(),
        companyName:  companyName.trim(),
        companySize:  companySize,
        hiringFor:    hiringFor.trim(),
        // Verification
        profileScore: profileScore.score,
        agreedNoAgency: true,
        agreedAccurate: true,
        agreedTerms:    true,
        emailDomain:  emailDomain,
        // Status
        status:       'pending_ops',
        submittedAt:  serverTimestamp(),
        reviewedAt:   null,
        reviewedBy:   null,
        decisionNote: null,
      });

      // Also update user doc to reflect pending status
      const { updateUserInFirestore } = await import('../../lib/firebaseAuth');
      await updateUserInFirestore(fbUserUid, {
        recruiterApplicationStatus: 'pending_ops',
      } as any);

      setGate('submitted');
    } catch (err: any) {
      setSubmitError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const gateStatus = (n: number): 'done' | 'active' | 'pending' => {
    if (gate === 'submitted') return 'done';
    if (n < (gate as number)) return 'done';
    if (n === (gate as number)) return 'active';
    return 'pending';
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-8 pb-20 px-4" style={{ backgroundColor: '#f5f5f4' }}>
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-6">
          <button onClick={onCancel} className="text-xs text-stone-400 hover:text-stone-600 mb-4 flex items-center gap-1">
            ← Back
          </button>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: GREEN_LT }}>
              <Building2 size={18} style={{ color: GREEN }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900">Recruiter Registration</h1>
              <p className="text-xs text-stone-500">4-step eligibility verification</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        {gate !== 'submitted' && (
          <div className="flex items-center gap-1 mb-6 p-4 bg-white rounded-2xl border border-stone-200">
            <GateStep num={1} label="Profile"     status={gateStatus(1)} />
            <div className="h-px flex-1 bg-stone-100 mx-1" />
            <GateStep num={2} label="Work email"  status={gateStatus(2)} />
            <div className="h-px flex-1 bg-stone-100 mx-1" />
            <GateStep num={3} label="Declaration" status={gateStatus(3)} />
            <div className="h-px flex-1 bg-stone-100 mx-1" />
            <GateStep num={4} label="Details"     status={gateStatus(4)} />
          </div>
        )}

        {/* ── Gate 1 — Profile completeness ────────────────────────────────── */}
        {gate === 1 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
            <div>
              <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
                <User size={16} style={{ color: GREEN }} /> Profile completeness
              </h2>
              <p className="text-xs text-stone-500">Your profile must be at least 70% complete to post as a recruiter.</p>
            </div>

            {/* Score bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-700">Your score</span>
                <span className="text-sm font-bold" style={{ color: passesGate1 ? GREEN : '#b45309' }}>
                  {profileScore.score}%
                </span>
              </div>
              <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${profileScore.score}%`, backgroundColor: passesGate1 ? GREEN : '#d97706' }} />
              </div>
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>0%</span>
                <span className="text-stone-500 font-medium">70% required</span>
                <span>100%</span>
              </div>
            </div>

            {/* Missing items */}
            {profileScore.missing.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-stone-600">Missing from your profile:</p>
                <div className="space-y-1.5">
                  {profileScore.missing.map(item => (
                    <div key={item} className="flex items-center gap-2 text-xs text-stone-500">
                      <XCircle size={13} className="text-red-400 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {passesGate1 && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-medium" style={{ backgroundColor: GREEN_LT, color: GREEN }}>
                <CheckCircle2 size={14} /> Profile complete — you may proceed
              </div>
            )}

            {!passesGate1 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                Complete the missing profile fields first, then return here to continue.
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-50">
                Cancel
              </button>
              <button onClick={() => setGate(2)} disabled={!passesGate1}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                Continue <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── Gate 2 — Work email ───────────────────────────────────────────── */}
        {gate === 2 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
            <div>
              <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
                <Mail size={16} style={{ color: GREEN }} /> Work email verification
              </h2>
              <p className="text-xs text-stone-500">
                Recruiters must use a company email address. Free email providers (Gmail, Yahoo, Outlook, etc.) are not accepted.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-600">Company email address</label>
              <input
                type="email"
                value={workEmail}
                onChange={e => { setWorkEmail(e.target.value); setEmailError(''); }}
                placeholder="you@yourcompany.com"
                className="w-full px-4 py-3 text-sm border rounded-xl focus:outline-none transition-colors"
                style={{
                  borderColor: emailError ? '#f87171' : passesEmailCheck ? GREEN : '#e7e5e4',
                  backgroundColor: passesEmailCheck ? GREEN_LT : 'white',
                }}
              />
              {emailError && <p className="text-xs text-red-500">{emailError}</p>}
              {passesEmailCheck && (
                <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: GREEN }}>
                  <CheckCircle2 size={12} /> @{emailDomain} — company domain accepted
                </p>
              )}
              {workEmail && isPersonalEmail(workEmail) && (
                <p className="text-xs text-red-500 flex items-center gap-1.5">
                  <XCircle size={12} /> Free email providers are not accepted
                </p>
              )}
            </div>

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-100 text-xs text-stone-500 leading-relaxed">
              Your work email must match the company you will be posting jobs for. If your company uses a custom domain, make sure it matches.
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setGate(1)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-50">
                Back
              </button>
              <button
                onClick={() => {
                  if (!passesEmailCheck) { setEmailError('Please enter a valid company email address.'); return; }
                  setGate(3);
                }}
                disabled={!passesEmailCheck}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ backgroundColor: GREEN }}>
                Continue <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── Gate 3 — No-agency declaration ───────────────────────────────── */}
        {gate === 3 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
            <div>
              <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
                <Shield size={16} style={{ color: GREEN }} /> Recruiter declaration
              </h2>
              <p className="text-xs text-stone-500">
                BeWatu only allows in-house recruiters and hiring managers. Recruitment agencies and staffing firms are not permitted.
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  id: 'no-agency',
                  checked: agreedNoAgency,
                  onChange: setAgreedNoAgency,
                  label: 'I am not a recruitment agency, staffing firm, or third-party recruiter',
                  desc: 'I am an employee of the company I will be posting roles for.',
                },
                {
                  id: 'accurate',
                  checked: agreedAccurate,
                  onChange: setAgreedAccurate,
                  label: 'All jobs I post will be genuine, accurate, and for real open positions',
                  desc: 'No ghost postings, bait-and-switch, or misleading compensation information.',
                },
                {
                  id: 'terms',
                  checked: agreedTerms,
                  onChange: setAgreedTerms,
                  label: 'I agree to the BeWatu Recruiter Terms of Service',
                  desc: 'Violations may result in immediate account suspension and permanent ban.',
                },
              ].map(({ id, checked, onChange, label, desc }) => (
                <label key={id}
                  className="flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all"
                  style={{ borderColor: checked ? GREEN : '#e7e5e4', backgroundColor: checked ? GREEN_LT : 'white' }}>
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      checked ? 'border-transparent' : 'border-stone-300'
                    }`} style={{ backgroundColor: checked ? GREEN : 'white' }}>
                      {checked && <CheckCircle2 size={13} className="text-white" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900">{label}</p>
                    <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                  <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
                </label>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setGate(2)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-50">
                Back
              </button>
              <button onClick={() => setGate(4)} disabled={!passesGate3}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ backgroundColor: GREEN }}>
                Continue <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── Gate 4 — Company details + submit ────────────────────────────── */}
        {gate === 4 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
            <div>
              <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
                <Building2 size={16} style={{ color: GREEN }} /> Company details
              </h2>
              <p className="text-xs text-stone-500">
                Tell us about your company and role. Our ops team will review your application within 2 business days.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-600 mb-1 block">Your job title *</label>
                <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Head of Talent, Hiring Manager"
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 bg-white" />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 mb-1 block">Company name *</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 bg-white" />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 mb-1 block">Company size *</label>
                <select value={companySize} onChange={e => setCompanySize(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 bg-white text-stone-700">
                  <option value="">Select company size</option>
                  <option value="1-10">1–10 employees</option>
                  <option value="11-50">11–50 employees</option>
                  <option value="51-200">51–200 employees</option>
                  <option value="201-500">201–500 employees</option>
                  <option value="501-1000">501–1,000 employees</option>
                  <option value="1001+">1,000+ employees</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 mb-1 block">What roles are you typically hiring for? *</label>
                <textarea value={hiringFor} onChange={e => setHiringFor(e.target.value)}
                  placeholder="e.g. Software engineers, product managers, data scientists"
                  rows={2}
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 bg-white resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 mb-1 block">LinkedIn profile URL (optional)</label>
                <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400 bg-white" />
              </div>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {submitError}
              </div>
            )}

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-100 text-xs text-stone-500 leading-relaxed">
              Your application will be reviewed by the BeWatu team within <strong>2 business days</strong>. You'll receive an email notification when a decision is made.
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setGate(3)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-50">
                Back
              </button>
              <button onClick={handleSubmit} disabled={!passesGate4 || submitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ backgroundColor: GREEN }}>
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <>Submit application <ChevronRight size={15} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── Submitted ─────────────────────────────────────────────────────── */}
        {gate === 'submitted' && (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: GREEN_LT }}>
              <Clock size={28} style={{ color: GREEN }} />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-stone-900">Application submitted</h2>
              <p className="text-sm text-stone-500 leading-relaxed max-w-xs mx-auto">
                Your recruiter application is under review. We'll notify you at <strong>{fbUserEmail}</strong> within 2 business days.
              </p>
            </div>
            <div className="text-left space-y-2.5 p-4 rounded-xl" style={{ backgroundColor: GREEN_LT }}>
              <p className="text-xs font-semibold" style={{ color: GREEN }}>While you wait:</p>
              {[
                'Complete your profile if you haven\'t already',
                'Explore talent already on BeWatu',
                'Prepare your first job posting',
              ].map(item => (
                <div key={item} className="flex items-center gap-2 text-xs" style={{ color: GREEN }}>
                  <CheckCircle2 size={12} /> {item}
                </div>
              ))}
            </div>
            <button onClick={onSuccess}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: GREEN }}>
              Back to BeWatu
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
