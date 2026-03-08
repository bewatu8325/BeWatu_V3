/**
 * components/ReportModal.tsx
 *
 * Universal report and fraud/complaint flow for the BeWatu consumer app.
 * Self-contained — handles its own Firestore writes directly so nothing
 * else in the app needs to change except the three trigger points below.
 *
 * THREE REPORT PATHS:
 *   user    → content_reports (Trust & Safety) + support_tickets
 *   content → content_reports (Trust & Safety)
 *   fraud   → support_tickets (critical/high priority) + fraud_cases (if account compromise)
 *
 * ─── WHERE TO ADD THE TRIGGER ────────────────────────────────────────────────
 *
 * 1. PostCard — "Report post" in the ··· menu (see PostCard.tsx changes)
 * 2. ProfilePage — "Report user" button when !isCurrentUser (see ProfilePage.tsx changes)
 * 3. JobCard — "Report job" in the ··· menu (see JobCard.tsx changes)
 * 4. Footer — "Report a concern" link (see Footer.tsx changes)
 * 5. App.tsx — mount the modal once at the root (see App.tsx changes)
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────────
 *
 *   <ReportModal
 *     isOpen={showReport}
 *     onClose={() => setShowReport(false)}
 *     reporter={{ firestoreUid: fbUser.uid, name: currentUser.name, email: fbUser.email ?? '' }}
 *     target={{ user: { firestoreId: '...', name: 'Alex Chen' } }}
 *     defaultType="user"   // optional — skips type-selection step
 *   />
 */

import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportType = 'user' | 'content' | 'fraud';

export interface ReportTarget {
  user?:    { firestoreId: string; name: string };
  content?: { type: string; id: string; preview?: string };
}

export interface ReportReporter {
  firestoreUid: string;
  name:         string;
  email:        string;
}

interface Props {
  isOpen:       boolean;
  onClose:      () => void;
  reporter:     ReportReporter;
  target?:      ReportTarget;
  defaultType?: ReportType;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const USER_REASONS = [
  { value: 'harassment',    label: 'Harassment or bullying'        },
  { value: 'hate_speech',   label: 'Hate speech'                   },
  { value: 'fake_account',  label: 'Fake or impersonation account' },
  { value: 'scam',          label: 'Scam or fraud'                 },
  { value: 'spam',          label: 'Spam or solicitation'          },
  { value: 'doxxing',       label: 'Sharing private information'   },
  { value: 'inappropriate', label: 'Inappropriate behaviour'       },
  { value: 'other',         label: 'Other'                         },
];

const CONTENT_REASONS = [
  { value: 'misinformation', label: 'Misinformation'               },
  { value: 'fake_job',       label: 'Fake or misleading job post'  },
  { value: 'spam',           label: 'Spam'                         },
  { value: 'harassment',     label: 'Harassment'                   },
  { value: 'hate_speech',    label: 'Hate speech'                  },
  { value: 'scam',           label: 'Scam or fraud'                },
  { value: 'inappropriate',  label: 'Inappropriate content'        },
  { value: 'copyright',      label: 'Copyright violation'          },
  { value: 'other',          label: 'Other'                        },
];

const FRAUD_TYPES = [
  { value: 'account_compromised', label: 'I think my account was accessed by someone else', icon: '🔑' },
  { value: 'fake_recruiter',      label: 'A recruiter seems fake or asked for money',        icon: '🎭' },
  { value: 'fake_job',            label: 'A job posting looks fraudulent',                   icon: '📋' },
  { value: 'payment_fraud',       label: 'I was asked to pay or share financial details',    icon: '💳' },
  { value: 'identity_theft',      label: 'Someone is using my identity',                     icon: '👤' },
  { value: 'suspicious_activity', label: 'Other suspicious activity',                        icon: '⚠️' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityFromReason(r: string): 'critical' | 'high' | 'medium' {
  if (['csam','violence','self_harm'].includes(r)) return 'critical';
  if (['harassment','hate_speech','doxxing','scam','fraud','identity_theft','payment_fraud'].includes(r)) return 'high';
  return 'medium';
}

function slaMs(priority: string): number {
  return ({ critical: 2, high: 8, medium: 24, low: 72 } as any)[priority] * 3_600_000 || 86_400_000;
}

// ── Firestore writes ──────────────────────────────────────────────────────────

async function writeUserReport(
  reporter: ReportReporter, target: ReportTarget,
  reason: string, details: string
): Promise<string> {
  const severity = severityFromReason(reason);
  const priority = severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : 'medium';

  const reportRef = await addDoc(collection(db, 'content_reports'), {
    contentType: 'profile', contentId: target.user?.firestoreId ?? 'unknown',
    contentPreview: target.user?.name ?? null,
    reportedBy: reporter.firestoreUid, reportedByName: reporter.name,
    reason, details: details || '', status: 'pending', severity,
    reportCount: 1, assignedTo: null, assignedName: null,
    source: 'user_report', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'support_tickets'), {
    subject: `User report: ${reason.replace(/_/g,' ')} — ${target.user?.name ?? 'Unknown'}`,
    category: 'safety', priority,
    userId: reporter.firestoreUid, userName: reporter.name, userEmail: reporter.email,
    body: details || 'No additional details provided.',
    status: 'open', assignedTo: null, assignedName: null,
    slaBreached: false, slaDeadline: new Date(Date.now() + slaMs(priority)),
    notes: [], createdByOps: false, linkedReportId: reportRef.id,
    metadata: { reportType: 'user_report', targetUserId: target.user?.firestoreId ?? null, targetUserName: target.user?.name ?? null },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), resolvedAt: null,
  });

  return reportRef.id;
}

async function writeContentReport(
  reporter: ReportReporter, target: ReportTarget,
  reason: string, details: string
): Promise<string> {
  const ref = await addDoc(collection(db, 'content_reports'), {
    contentType: target.content?.type ?? 'unknown', contentId: target.content?.id ?? 'unknown',
    contentPreview: target.content?.preview ?? null,
    reportedBy: reporter.firestoreUid, reportedByName: reporter.name,
    reason, details: details || '', status: 'pending',
    severity: severityFromReason(reason), reportCount: 1,
    assignedTo: null, assignedName: null,
    source: 'user_report', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function writeFraudReport(
  reporter: ReportReporter, target: ReportTarget | undefined,
  fraudType: string, details: string
): Promise<string> {
  const isCompromise = ['account_compromised', 'identity_theft'].includes(fraudType);
  const priority = isCompromise ? 'critical' : 'high';

  const ticketRef = await addDoc(collection(db, 'support_tickets'), {
    subject: `Fraud report: ${fraudType.replace(/_/g,' ')}${target?.user ? ` — ${target.user.name}` : ''}`,
    category: 'safety', priority,
    userId: reporter.firestoreUid, userName: reporter.name, userEmail: reporter.email,
    body: details, status: 'open', assignedTo: null, assignedName: null,
    slaBreached: false, slaDeadline: new Date(Date.now() + slaMs(priority)),
    notes: [], createdByOps: false,
    metadata: { reportType: 'fraud_report', fraudType, isCompromise, targetUserId: target?.user?.firestoreId ?? null, targetUserName: target?.user?.name ?? null },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), resolvedAt: null,
  });

  if (isCompromise) {
    await addDoc(collection(db, 'fraud_cases'), {
      userId: reporter.firestoreUid, userName: reporter.name, userEmail: reporter.email,
      type: fraudType, severity: 'high', status: 'open', riskScore: 60,
      signals: [{ type: 'manual_flag', description: `User self-reported: ${details.slice(0, 200)}`, ts: new Date().toISOString() }],
      attestationsNeeded: 2, attestationsReceived: 0, attestations: [],
      assignedTo: null, assignedName: null,
      notes: [{ body: `Self-reported. Details: ${details}`, authorName: 'System (user self-report)', authorUid: reporter.firestoreUid, ts: new Date().toISOString() }],
      linkedTicketId: ticketRef.id, source: 'user_self_report',
      resolvedAt: null, resolution: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }

  if (!isCompromise && target?.user) {
    await addDoc(collection(db, 'content_reports'), {
      contentType: 'profile', contentId: target.user.firestoreId, contentPreview: target.user.name,
      reportedBy: reporter.firestoreUid, reportedByName: reporter.name,
      reason: fraudType, details, status: 'pending', severity: 'high', reportCount: 1,
      assignedTo: null, assignedName: null,
      source: 'fraud_report', linkedTicketId: ticketRef.id,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }

  return ticketRef.id;
}

// ── Small shared components ───────────────────────────────────────────────────

const ProgressDots: React.FC<{ step: number }> = ({ step }) => (
  <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', transition: 'background 0.2s', background: i < step ? '#1a4a3a' : i === step ? '#a7c4b5' : '#e7e5e4' }} />
    ))}
  </div>
);

const DetailsArea: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; required?: boolean }> = ({ value, onChange, placeholder, required }) => (
  <div>
    <label style={{ color: '#57534e', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
      {required ? <>What happened <span style={{ color: '#ef4444' }}>*</span></> : <>Additional details <span style={{ color: '#a8a29e', fontWeight: 400 }}>(optional)</span></>}
    </label>
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={required ? 4 : 3}
      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e7e5e4', background: '#fafaf9', color: '#1c1917', fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
      onFocus={e => (e.target.style.borderColor = '#1a4a3a')}
      onBlur={e  => (e.target.style.borderColor = '#e7e5e4')}
    />
    {required && <p style={{ color: value.trim().length < 10 ? '#f59e0b' : '#a8a29e', fontSize: 11, marginTop: 4 }}>{value.trim().length}/10 minimum characters</p>}
  </div>
);

const PrimaryBtn: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ background: disabled ? '#e7e5e4' : '#1a4a3a', color: disabled ? '#a8a29e' : '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8 }}>
    {children}
  </button>
);

const SecondaryBtn: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick}
    style={{ background: '#f5f5f4', color: '#78716c', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
    {children}
  </button>
);

// ── Main ──────────────────────────────────────────────────────────────────────

type Step = 'type' | 'detail' | 'confirm' | 'done';

const ReportModal: React.FC<Props> = ({ isOpen, onClose, reporter, target, defaultType }) => {
  const [step,       setStep]       = useState<Step>('type');
  const [reportType, setReportType] = useState<ReportType>(defaultType ?? 'user');
  const [reason,     setReason]     = useState('');
  const [fraudType,  setFraudType]  = useState('');
  const [details,    setDetails]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [caseRef,    setCaseRef]    = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(defaultType ? 'detail' : 'type');
    setReportType(defaultType ?? 'user');
    setReason(''); setFraudType(''); setDetails('');
    setError(null); setCaseRef(null);
  }, [isOpen, defaultType]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'done') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, step]);

  const canProceed = useCallback(() => {
    if (step !== 'detail') return true;
    if (reportType === 'fraud') return fraudType !== '' && details.trim().length >= 10;
    return reason !== '';
  }, [step, reportType, reason, fraudType, details]);

  const handleSubmit = async () => {
    setSubmitting(true); setError(null);
    try {
      let ref: string;
      if      (reportType === 'user')    ref = await writeUserReport(reporter, target ?? {}, reason, details);
      else if (reportType === 'content') ref = await writeContentReport(reporter, target ?? {}, reason, details);
      else                               ref = await writeFraudReport(reporter, target, fraudType, details);
      setCaseRef(ref); setStep('done');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // ─── Step renders ──────────────────────────────────────────────────────────

  const renderTypeStep = () => (
    <div>
      <p style={{ color: '#78716c', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>What would you like to report?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {([
          { type: 'user'    as const, icon: '👤', title: 'Report a person',                    desc: 'Fake account, harassment, scam, or inappropriate behaviour' },
          { type: 'content' as const, icon: '📄', title: 'Report content',                     desc: 'A post, job listing, comment, or video that violates guidelines' },
          { type: 'fraud'   as const, icon: '🛡️', title: 'Report fraud or suspicious activity', desc: 'Compromised account, fake recruiter, payment requests' },
        ]).map(opt => (
          <button key={opt.type}
            onClick={() => { setReportType(opt.type); setStep('detail'); }}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', background: '#fafaf9', border: '1.5px solid #e7e5e4', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.12s', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a4a3a'; e.currentTarget.style.background = '#f0f9f5'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e7e5e4'; e.currentTarget.style.background = '#fafaf9'; }}
          >
            <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>{opt.icon}</span>
            <div>
              <p style={{ color: '#1c1917', fontWeight: 700, fontSize: 14, margin: '0 0 3px' }}>{opt.title}</p>
              <p style={{ color: '#78716c', fontSize: 12, margin: 0, lineHeight: 1.4 }}>{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderDetailStep = () => {
    const contextChip = target?.user ?? target?.content;
    return (
      <div>
        {contextChip && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 8, padding: '9px 14px', marginBottom: 18 }}>
            <span style={{ fontSize: 15 }}>{target?.user ? '👤' : '📄'}</span>
            <p style={{ color: '#57534e', fontSize: 13, fontWeight: 600, margin: 0 }}>
              {target?.user ? `Reporting: ${target.user.name}` : `Reporting ${target?.content?.type.replace(/_/g, ' ')}`}
              {target?.content?.preview && <span style={{ color: '#a8a29e', fontWeight: 400 }}> — "{target.content.preview.slice(0, 55)}{target.content.preview.length > 55 ? '…' : ''}"</span>}
            </p>
          </div>
        )}

        {reportType === 'fraud' ? (
          <>
            <p style={{ color: '#57534e', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>What best describes what happened?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {FRAUD_TYPES.map(opt => (
                <button key={opt.value}
                  onClick={() => setFraudType(opt.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', border: `1.5px solid ${fraudType === opt.value ? '#1a4a3a' : '#e7e5e4'}`, background: fraudType === opt.value ? '#f0f9f5' : '#fafaf9', transition: 'all 0.12s' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{opt.icon}</span>
                  <p style={{ color: fraudType === opt.value ? '#1a4a3a' : '#44403c', fontSize: 13, fontWeight: fraudType === opt.value ? 700 : 500, margin: 0, lineHeight: 1.4, flex: 1 }}>{opt.label}</p>
                  {fraudType === opt.value && <span style={{ color: '#1a4a3a', fontSize: 15, flexShrink: 0 }}>✓</span>}
                </button>
              ))}
            </div>
            <DetailsArea value={details} onChange={setDetails} placeholder="Describe what happened, when it occurred, and any relevant details. The more context you provide, the faster we can act." required />
          </>
        ) : (
          <>
            <p style={{ color: '#57534e', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Select the reason that applies:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {(reportType === 'content' ? CONTENT_REASONS : USER_REASONS).map(r => (
                <button key={r.value} onClick={() => setReason(r.value)}
                  style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', border: `1.5px solid ${reason === r.value ? '#1a4a3a' : '#e7e5e4'}`, background: reason === r.value ? '#f0f9f5' : '#fafaf9', color: reason === r.value ? '#1a4a3a' : '#44403c', fontSize: 13, fontWeight: reason === r.value ? 700 : 500, transition: 'all 0.12s', lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  {reason === r.value && <span style={{ marginTop: 1, flexShrink: 0 }}>✓</span>}
                  {r.label}
                </button>
              ))}
            </div>
            <DetailsArea value={details} onChange={setDetails} placeholder="Any additional context that would help our team review this report…" />
          </>
        )}
      </div>
    );
  };

  const renderConfirmStep = () => {
    const reasonLabel = reportType === 'fraud'
      ? FRAUD_TYPES.find(f => f.value === fraudType)?.label
      : (reportType === 'content' ? CONTENT_REASONS : USER_REASONS).find(r => r.value === reason)?.label;
    const rows: [string, string][] = [
      ['Type',   reportType === 'fraud' ? 'Fraud / Suspicious Activity' : reportType === 'content' ? 'Content Report' : 'User Report'],
      ['Reason', reasonLabel ?? '—'],
      ...(target?.user    ? [['Reported', target.user.name]] as [string,string][]    : []),
      ...(target?.content ? [['Content', target.content.type.replace(/_/g,' ')]] as [string,string][] : []),
      ...(details.trim()  ? [['Details', details.trim().slice(0, 80) + (details.trim().length > 80 ? '…' : '')]] as [string,string][] : []),
    ];
    return (
      <div>
        <div style={{ background: '#f0f9f5', border: '1px solid #a7f3d0', borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ color: '#1a4a3a', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Review your report</p>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid #d1fae5' }}>
              <span style={{ color: '#6ee7b7', fontSize: 12, fontWeight: 700, minWidth: 80, flexShrink: 0 }}>{k}</span>
              <span style={{ color: '#1a4a3a', fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 10, padding: '12px 14px', marginBottom: error ? 14 : 0 }}>
          <p style={{ color: '#78716c', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            By submitting, you confirm this report is genuine. False reports may result in account action. Our Trust &amp; Safety team reviews every report within 24 hours — fraud reports are prioritised.
          </p>
        </div>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>⚠ {error}</p>
          </div>
        )}
      </div>
    );
  };

  const renderDoneStep = () => (
    <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#1a4a3a,#10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 26, color: '#fff' }}>✓</div>
      <h3 style={{ color: '#1c1917', fontWeight: 800, fontSize: 18, margin: '0 0 8px' }}>Report received</h3>
      <p style={{ color: '#78716c', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
        Thank you for helping keep BeWatu safe. Our Trust &amp; Safety team will review your report{reportType === 'fraud' ? ' as a priority' : ' within 24 hours'}.
      </p>
      {caseRef && (
        <div style={{ background: '#f5f5f4', borderRadius: 8, padding: '9px 16px', marginBottom: 18, display: 'inline-block' }}>
          <p style={{ color: '#a8a29e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 2px' }}>Reference number</p>
          <p style={{ color: '#44403c', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, margin: 0 }}>{caseRef.slice(0, 12).toUpperCase()}</p>
        </div>
      )}
      <div style={{ background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 10, padding: '12px 16px', textAlign: 'left' }}>
        <p style={{ color: '#57534e', fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>What happens next</p>
        {(reportType === 'fraud'
          ? ['Your case is assigned to our Fraud Ops team as a priority', 'We may contact you for additional information', 'If your account was compromised, we will initiate account recovery steps']
          : ['Our Trust & Safety team will review the report', 'If it violates our guidelines, appropriate action will be taken', 'Your identity is protected — the reported party will not know who filed this']
        ).map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 5 }}>
            <span style={{ color: '#1a4a3a', flexShrink: 0, marginTop: 1 }}>→</span>
            <p style={{ color: '#78716c', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{item}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Shell ─────────────────────────────────────────────────────────────────

  const stepIndex = { detail: 0, confirm: 1, done: 2, type: -1 }[step];

  const title = step === 'done'    ? 'Report submitted'
              : step === 'confirm' ? 'Review & submit'
              : reportType === 'fraud'   ? 'Report fraud or suspicious activity'
              : reportType === 'content' ? 'Report content'
              : step === 'type'          ? 'Make a report'
              :                           'Report a person';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => { if (step !== 'done') onClose(); }}
    >
      <div
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', animation: 'bwReportIn 0.18s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f5f5f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            {stepIndex >= 0 && <ProgressDots step={stepIndex} />}
            <h2 style={{ color: '#1c1917', fontWeight: 800, fontSize: 16, margin: 0 }}>{title}</h2>
          </div>
          <button onClick={onClose} style={{ background: '#f5f5f4', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#78716c', flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {step === 'type'    && renderTypeStep()}
          {step === 'detail'  && renderDetailStep()}
          {step === 'confirm' && renderConfirmStep()}
          {step === 'done'    && renderDoneStep()}
        </div>

        {/* Footer buttons */}
        {step !== 'type' && (
          <div style={{ padding: '4px 24px 22px', display: 'flex', gap: 10, justifyContent: step === 'done' ? 'center' : 'flex-end' }}>
            {step === 'done' ? (
              <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
            ) : (
              <>
                <SecondaryBtn onClick={() => setStep(step === 'confirm' ? 'detail' : 'type')}>Back</SecondaryBtn>
                {step === 'detail'  && <PrimaryBtn onClick={() => setStep('confirm')} disabled={!canProceed()}>Review →</PrimaryBtn>}
                {step === 'confirm' && (
                  <PrimaryBtn onClick={handleSubmit} disabled={submitting}>
                    {submitting && <span style={{ display: 'inline-block', animation: 'bwSpin 0.7s linear infinite' }}>⟳</span>}
                    {submitting ? 'Submitting…' : 'Submit Report'}
                  </PrimaryBtn>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes bwReportIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes bwSpin { to { transform:rotate(360deg) } }
      `}</style>
    </div>
  );
};

export default ReportModal;
