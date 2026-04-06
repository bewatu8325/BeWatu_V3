/**
 * components/ArenaChallengeDetail.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full challenge detail page with:
 *  - Challenge overview, rules, and legal terms
 *  - Sign up / register for challenge
 *  - Create a pod to collaborate on a solution
 *  - Invite collaborators to the pod
 *  - Submit solution
 *  - Blind review mode (identity hidden until shortlisted)
 *  - Company view: anonymous submission review + shortlist
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Clock, Users, Trophy, Shield, AlertTriangle,
  CheckCircle, Send, Plus, Lock, Eye, EyeOff, Loader2,
  FileText, UserPlus, Zap, Star, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

// ── Legal terms (protects BeWatu, Users, and Companies) ──────────────────────

const CHALLENGE_LEGAL_TERMS = `
BEWATU ARENA CHALLENGE TERMS

By participating in this challenge, you agree to the following:

1. NO EMPLOYMENT OR CONTRACT IMPLIED
This challenge is not an offer of employment, a contract for services, a freelance engagement, or any other form of commercial arrangement. Participation does not create any employment relationship, agency, partnership, or joint venture between you and the company posting the challenge ("Company") or BeWatu LLC.

2. SUBMISSION OWNERSHIP AND USE
Your submitted solution remains your intellectual property unless and until the Company pays the applicable challenge prize and formally engages with you as described in Section 3. No Company may use, implement, reproduce, distribute, or derive work from your submission without first completing payment and formal engagement. Any unauthorised use of submitted work prior to payment constitutes a breach of these terms and may expose the Company to legal liability.

3. PAYMENT AND ENGAGEMENT
If your submission is selected as a winner:
(a) The Company must pay the stated challenge prize before receiving any rights to the submitted solution.
(b) Upon payment, the Company receives a licence to the solution as submitted — including all materials, files, and documentation included in the submission.
(c) Any additional information, elaboration, implementation support, or derivative work beyond what was submitted requires a separate direct engagement between you and the Company.
(d) BeWatu facilitates the prize payment and is not responsible for any disputes arising from post-challenge engagement.

4. BLIND REVIEW
All submissions are reviewed anonymously. Your name, profile, photo, and other identifying information are hidden from the Company until you are shortlisted. Companies evaluate work on merit, not identity. BeWatu cannot guarantee that all evaluators will maintain this standard, but all reasonable technical measures are taken to enforce anonymity.

5. NO GUARANTEE OF SHORTLISTING OR PAYMENT
Participation does not guarantee shortlisting, selection, or payment. Companies retain sole discretion in selecting winners, subject to the condition that payment must precede any use of the submitted solution.

6. RESERVATION OF EMPLOYMENT RIGHTS
Companies may, at their sole discretion, offer employment or other commercial engagement to challenge participants. Any such offer is separate from this challenge and subject to its own terms.

7. PLATFORM RESPONSIBILITY
BeWatu LLC operates as a neutral platform facilitating the challenge. BeWatu is not responsible for the quality, accuracy, or completeness of challenge briefs, nor for the outcome of any engagement between participants and Companies.

8. DISPUTE RESOLUTION
Any disputes regarding challenge prizes or use of submitted work should first be raised with BeWatu at trust@bewatu.com. BeWatu will act as a good-faith mediator but is not liable for the outcome of any such dispute.

By clicking "I agree and sign up", you confirm you have read, understood, and agree to these terms.
`.trim();

// ── Types ─────────────────────────────────────────────────────────────────────

interface Challenge {
  id: string;
  _firestoreId: string;
  title: string;
  description: string;
  companyId: number;
  companyName?: string;
  companyLogoUrl?: string;
  skills: string[];
  difficulty: 'entry' | 'mid' | 'senior';
  type: string;
  prize: string;
  badge?: string;
  credits?: number;
  dueDate?: string;
  timeLimit?: number;
  instructions?: string;
  submissionFormat?: string;
  rubric?: Array<{ label: string; weight: number; description?: string }>;
  verificationStatus?: string;
  recruiterId?: string;
  viewCount?: number;
}

interface Submission {
  id: string;
  authorUid: string;
  authorId?: number;
  authorName?: string;   // hidden until shortlisted
  authorAvatar?: string; // hidden until shortlisted
  content: string;
  podId?: string;
  podName?: string;
  submittedAt: any;
  status: 'submitted' | 'shortlisted' | 'winner' | 'rejected';
  score?: number;
  collaborators?: string[];
  attachmentUrl?: string;
  isShortlisted?: boolean;
}

interface ArenaChallengeDetailProps {
  challenge: Challenge;
  onBack: () => void;
  currentUser: any;
  fbUser: any;
  allUsers?: any[];
  onCreatePod?: (name: string, description: string) => Promise<any>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLeft(dueDate?: string): number | null {
  if (!dueDate) return null;
  const diff = new Date(dueDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function difficultyLabel(d: string) {
  return { entry: 'Entry level', mid: 'Mid level', senior: 'Senior' }[d] ?? d;
}

function difficultyColor(d: string) {
  return { entry: '#16a34a', mid: '#d97706', senior: '#dc2626' }[d] ?? '#6b7280';
}

// ── Anonymous submission card (company view) ──────────────────────────────────

function SubmissionCard({
  submission, isRecruiter, onShortlist, onScore, challengeId,
}: {
  submission: Submission;
  isRecruiter: boolean;
  onShortlist: (id: string) => void;
  onScore: (id: string, score: number) => void;
  challengeId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scoring,  setScoring]  = useState(false);

  const isShortlisted = submission.status === 'shortlisted' || submission.status === 'winner';

  return (
    <div className="bg-white rounded-2xl border overflow-hidden transition-all"
      style={{ borderColor: isShortlisted ? GREEN : '#e7e5e4' }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Anonymous avatar until shortlisted */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: isShortlisted ? GREEN_LT : '#f3f4f6' }}>
              {isShortlisted
                ? (submission.authorAvatar
                  ? <img src={submission.authorAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : <span className="text-sm font-bold" style={{ color: GREEN }}>{submission.authorName?.[0]}</span>)
                : <Lock size={16} className="text-stone-400" />
              }
            </div>
            <div>
              <p className="text-sm font-bold text-stone-900">
                {isShortlisted ? submission.authorName : 'Anonymous participant'}
              </p>
              <p className="text-xs text-stone-400">
                {isShortlisted ? 'Identity revealed after shortlist' : 'Identity hidden — merit review only'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isShortlisted && (
              <span className="text-xs font-bold px-2 py-1 rounded-full"
                style={{ backgroundColor: GREEN_LT, color: GREEN }}>
                {submission.status === 'winner' ? '🏆 Winner' : '✓ Shortlisted'}
              </span>
            )}
            <button onClick={() => setExpanded(e => !e)}
              className="text-stone-400 hover:text-stone-600">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3">
            <div className="bg-stone-50 rounded-xl p-3">
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                {submission.content}
              </p>
            </div>

            {submission.podName && (
              <p className="text-xs text-stone-400 flex items-center gap-1.5">
                <Users size={11} /> Collaborated in pod: {submission.podName}
              </p>
            )}

            {isRecruiter && (
              <div className="flex gap-2 pt-1">
                {!isShortlisted && (
                  <button onClick={() => onShortlist(submission.id)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-white"
                    style={{ backgroundColor: GREEN }}>
                    <Star size={12} /> Shortlist
                  </button>
                )}
                {isShortlisted && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500">Score (1–10):</span>
                    {[...Array(10)].map((_, i) => (
                      <button key={i} onClick={() => { onScore(submission.id, i + 1); }}
                        className="w-6 h-6 rounded-full text-xs font-bold border transition-all"
                        style={{
                          backgroundColor: (submission.score ?? 0) >= i + 1 ? GREEN : 'white',
                          color: (submission.score ?? 0) >= i + 1 ? 'white' : '#9ca3af',
                          borderColor: (submission.score ?? 0) >= i + 1 ? GREEN : '#e7e5e4',
                        }}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Legal reminder for recruiters */}
            {isRecruiter && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100">
                <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  You may not use, implement, or derive work from this submission without first completing payment to the winner. Shortlisting reveals identity — it does not grant usage rights.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ArenaChallengeDetail({
  challenge, onBack, currentUser, fbUser, allUsers = [], onCreatePod,
}: ArenaChallengeDetailProps) {
  const [tab,          setTab]          = useState<'overview' | 'submissions' | 'submit'>('overview');
  const [submissions,  setSubmissions]  = useState<Submission[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [registered,   setRegistered]   = useState(false);
  const [showTerms,    setShowTerms]    = useState(false);
  const [agreedTerms,  setAgreedTerms]  = useState(false);
  const [registering,  setRegistering]  = useState(false);

  // Submit state
  const [solutionText, setSolutionText] = useState('');
  const [podName,      setPodName]      = useState('');
  const [podDesc,      setPodDesc]      = useState('');
  const [creatingPod,  setCreatingPod]  = useState(false);
  const [myPod,        setMyPod]        = useState<any | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [showCreatePod, setShowCreatePod] = useState(false);

  // Invite state
  const [inviteQuery,  setInviteQuery]  = useState('');
  const [showInvites,  setShowInvites]  = useState(false);

  const isRecruiter = challenge.recruiterId === fbUser?.uid ||
    (currentUser as any)?.isRecruiter;
  const days = daysLeft(challenge.dueDate);
  const mySubmission = submissions.find(s => s.authorUid === fbUser?.uid);

  // Load submissions
  useEffect(() => {
    if (!challenge._firestoreId) { setLoading(false); return; }
    import('firebase/firestore').then(async ({ collection, query, orderBy, onSnapshot, where }) => {
      const { db } = await import('../lib/firebase');
      const colRef = collection(db, 'arena_challenges', challenge._firestoreId, 'submissions');
      const q = isRecruiter
        ? query(colRef, orderBy('submittedAt', 'desc'))
        : query(colRef, where('authorUid', '==', fbUser?.uid ?? ''));

      const unsub = onSnapshot(q, snap => {
        setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
        setLoading(false);
      });
      return () => unsub();
    });
  }, [challenge._firestoreId, isRecruiter, fbUser?.uid]);

  // Check if registered
  useEffect(() => {
    if (!fbUser?.uid || !challenge._firestoreId) return;
    import('firebase/firestore').then(async ({ doc, getDoc }) => {
      const { db } = await import('../lib/firebase');
      const reg = await getDoc(doc(db, 'arena_challenges', challenge._firestoreId, 'registrations', fbUser.uid));
      if (reg.exists()) setRegistered(true);
    });
  }, [fbUser?.uid, challenge._firestoreId]);

  async function handleRegister() {
    if (!agreedTerms || !fbUser?.uid) return;
    setRegistering(true);
    try {
      const { doc, setDoc, serverTimestamp, updateDoc, increment } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      await setDoc(doc(db, 'arena_challenges', challenge._firestoreId, 'registrations', fbUser.uid), {
        uid:         fbUser.uid,
        name:        currentUser.name,
        registeredAt: serverTimestamp(),
        agreedTermsAt: serverTimestamp(),
        termsVersion: '1.0',
      });
      await updateDoc(doc(db, 'arena_challenges', challenge._firestoreId), {
        registrationCount: increment(1),
      }).catch(() => {});
      setRegistered(true);
      setShowTerms(false);
    } catch (e) {
      console.error('Registration failed:', e);
    } finally {
      setRegistering(false);
    }
  }

  async function handleCreatePod() {
    if (!podName.trim() || !onCreatePod) return;
    setCreatingPod(true);
    try {
      const pod = await onCreatePod(podName.trim(), podDesc.trim() || `Collaboration pod for: ${challenge.title}`);
      setMyPod(pod);
      setShowCreatePod(false);
    } catch (e) {
      console.error('Pod creation failed:', e);
    } finally {
      setCreatingPod(false);
    }
  }

  async function handleSubmit() {
    if (!solutionText.trim() || !fbUser?.uid) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { addDoc, collection, serverTimestamp, updateDoc, doc, increment } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      await addDoc(collection(db, 'arena_challenges', challenge._firestoreId, 'submissions'), {
        authorUid:   fbUser.uid,
        authorId:    currentUser.id,
        // Name + avatar stored but NOT exposed to recruiters until shortlisted
        _authorName:   currentUser.name,
        _authorAvatar: currentUser.avatarUrl,
        content:     solutionText.trim(),
        podId:       myPod?.id ?? null,
        podName:     myPod?.name ?? null,
        submittedAt: serverTimestamp(),
        status:      'submitted',
        termsVersion: '1.0',
        challengeRecruiterId: challenge.recruiterId,
      });
      await updateDoc(doc(db, 'arena_challenges', challenge._firestoreId), {
        submissionCount: increment(1),
      }).catch(() => {});
      setSubmitted(true);
    } catch (e: any) {
      setSubmitError(e.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShortlist(submissionId: string) {
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      const subRef = doc(db, 'arena_challenges', challenge._firestoreId, 'submissions', submissionId);
      // Reveal identity when shortlisting
      const sub = submissions.find(s => s.id === submissionId);
      await updateDoc(subRef, {
        status:       'shortlisted',
        isShortlisted: true,
        shortlistedAt: new Date(),
        // Reveal identity fields
        authorName:   (sub as any)?._authorName ?? 'Participant',
        authorAvatar: (sub as any)?._authorAvatar ?? null,
      });
    } catch (e) { console.error('Shortlist failed:', e); }
  }

  async function handleScore(submissionId: string, score: number) {
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      await updateDoc(doc(db, 'arena_challenges', challenge._firestoreId, 'submissions', submissionId), { score });
    } catch (e) { console.error('Score failed:', e); }
  }

  const inviteCandidates = allUsers.filter(u =>
    inviteQuery.trim().length > 0 &&
    (u.name.toLowerCase().includes(inviteQuery.toLowerCase()) ||
     u.headline?.toLowerCase().includes(inviteQuery.toLowerCase()))
  ).slice(0, 5);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f5f4' }}>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b" style={{ borderColor: '#e7e5e4' }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-stone-100 transition-colors">
            <ArrowLeft size={18} className="text-stone-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-stone-900 text-sm truncate">{challenge.title}</h1>
            <p className="text-xs text-stone-400 truncate">{challenge.companyName} · Arena Challenge</p>
          </div>
          {!isRecruiter && !registered && (
            <button
              onClick={() => setShowTerms(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 flex-shrink-0"
              style={{ backgroundColor: GREEN }}>
              Sign up
            </button>
          )}
          {!isRecruiter && registered && !mySubmission && (
            <button
              onClick={() => setTab('submit')}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 flex-shrink-0"
              style={{ backgroundColor: GREEN }}>
              Submit solution
            </button>
          )}
          {isRecruiter && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ backgroundColor: GREEN_LT, color: GREEN }}>
              Recruiter view
            </span>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Challenge hero */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#e7e5e4' }}>
          <div className="flex items-start gap-4">
            {challenge.companyLogoUrl ? (
              <img src={challenge.companyLogoUrl} alt="" className="w-14 h-14 rounded-2xl object-cover border flex-shrink-0" style={{ borderColor: '#e7e5e4' }} />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black flex-shrink-0"
                style={{ backgroundColor: GREEN }}>
                {challenge.companyName?.[0] ?? 'B'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-stone-900 leading-tight">{challenge.title}</h2>
              <p className="text-sm text-stone-500 mt-1">{challenge.companyName}</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                  style={{ color: difficultyColor(challenge.difficulty), borderColor: difficultyColor(challenge.difficulty) + '40', backgroundColor: difficultyColor(challenge.difficulty) + '10' }}>
                  {difficultyLabel(challenge.difficulty)}
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 capitalize">
                  {challenge.type}
                </span>
                {days !== null && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${days <= 3 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                    <Clock size={11} /> {days === 0 ? 'Due today' : `${days}d left`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Prize */}
          <div className="mt-4 p-3.5 rounded-2xl flex items-center gap-3"
            style={{ backgroundColor: '#fefce8' }}>
            <Trophy size={20} className="text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-black text-stone-900">{challenge.prize}</p>
              {challenge.badge && <p className="text-xs text-stone-500 mt-0.5">{challenge.badge}</p>}
            </div>
          </div>

          {/* Skills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {challenge.skills?.map(s => (
              <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ backgroundColor: GREEN_LT, color: GREEN }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white rounded-2xl border" style={{ borderColor: '#e7e5e4' }}>
          {[
            { id: 'overview',    label: 'Overview'    },
            { id: 'submissions', label: `Submissions${submissions.length > 0 ? ` (${submissions.length})` : ''}` },
            ...(registered && !isRecruiter ? [{ id: 'submit', label: mySubmission ? '✓ Submitted' : 'Submit' }] : []),
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: tab === t.id ? 'white' : 'transparent',
                color: tab === t.id ? '#1c1917' : '#78716c',
                boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ──────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Description */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
              <h3 className="font-bold text-stone-900 mb-3">The challenge</h3>
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                {challenge.description}
              </p>
            </div>

            {/* Instructions */}
            {challenge.instructions && (
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
                <h3 className="font-bold text-stone-900 mb-3">Instructions</h3>
                <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                  {challenge.instructions}
                </p>
              </div>
            )}

            {/* Rubric */}
            {challenge.rubric && challenge.rubric.length > 0 && (
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
                <h3 className="font-bold text-stone-900 mb-3">How solutions are scored</h3>
                <div className="space-y-2">
                  {challenge.rubric.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0"
                      style={{ borderColor: '#f5f5f4' }}>
                      <div>
                        <p className="text-sm font-semibold text-stone-800">{r.label}</p>
                        {r.description && <p className="text-xs text-stone-400 mt-0.5">{r.description}</p>}
                      </div>
                      <span className="text-sm font-bold ml-4 flex-shrink-0" style={{ color: GREEN }}>
                        {r.weight}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Blind review notice */}
            {!isRecruiter && (
              <div className="rounded-2xl border p-4 flex items-start gap-3"
                style={{ backgroundColor: GREEN_LT, borderColor: '#b6ddd2' }}>
                <EyeOff size={16} className="flex-shrink-0 mt-0.5" style={{ color: GREEN }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: GREEN }}>Your identity is protected</p>
                  <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                    Companies review your work anonymously. Your name, photo, and profile are hidden until you are shortlisted. They judge your thinking, not your CV.
                  </p>
                </div>
              </div>
            )}

            {/* Legal summary */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={15} style={{ color: GREEN }} />
                <h3 className="font-bold text-stone-900">Your protections</h3>
              </div>
              <div className="space-y-2.5">
                {[
                  { icon: '🚫', text: 'This challenge is not an offer of employment, contract, or commercial engagement' },
                  { icon: '🔒', text: 'Companies cannot use your submission until they have paid the prize' },
                  { icon: '💰', text: 'Payment must happen before the winner grants any usage rights' },
                  { icon: '➕', text: 'Any work beyond what you submitted requires a separate direct engagement' },
                  { icon: '⚖️', text: 'BeWatu mediates any disputes regarding prize payment or unauthorised use' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0">{item.icon}</span>
                    <p className="text-xs text-stone-600 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowTerms(true)}
                className="mt-3 text-xs font-semibold hover:underline"
                style={{ color: GREEN }}>
                Read full challenge terms →
              </button>
            </div>

            {/* Sign up CTA for non-members */}
            {!isRecruiter && !registered && (
              <button
                onClick={() => setShowTerms(true)}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                Sign up for this challenge
              </button>
            )}
          </div>
        )}

        {/* ── Submissions tab ───────────────────────────────────────────────── */}
        {tab === 'submissions' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={20} className="animate-spin text-stone-300" />
              </div>
            ) : submissions.length === 0 ? (
              <div className="bg-white rounded-2xl border p-10 text-center" style={{ borderColor: '#e7e5e4' }}>
                <Trophy size={32} className="text-stone-200 mx-auto mb-3" />
                <p className="font-bold text-stone-500">No submissions yet</p>
                <p className="text-xs text-stone-400 mt-1">Be the first to submit a solution</p>
              </div>
            ) : isRecruiter ? (
              <>
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
                    {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-stone-400">
                    {submissions.filter(s => s.isShortlisted).length} shortlisted
                  </p>
                </div>
                {submissions.map(sub => (
                  <SubmissionCard
                    key={sub.id}
                    submission={sub}
                    isRecruiter={isRecruiter}
                    onShortlist={handleShortlist}
                    onScore={handleScore}
                    challengeId={challenge._firestoreId}
                  />
                ))}
              </>
            ) : mySubmission ? (
              <div className="bg-white rounded-2xl border p-5 space-y-3" style={{ borderColor: '#e7e5e4' }}>
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} style={{ color: GREEN }} />
                  <p className="font-bold text-stone-900">Your submission</p>
                  <span className="text-xs px-2 py-0.5 rounded-full ml-auto capitalize font-semibold"
                    style={{
                      backgroundColor: mySubmission.status === 'shortlisted' ? GREEN_LT : '#f3f4f6',
                      color: mySubmission.status === 'shortlisted' ? GREEN : '#6b7280',
                    }}>
                    {mySubmission.status}
                  </span>
                </div>
                <p className="text-sm text-stone-700 leading-relaxed bg-stone-50 p-3 rounded-xl">
                  {mySubmission.content}
                </p>
                {mySubmission.status === 'shortlisted' && (
                  <div className="p-3 rounded-xl" style={{ backgroundColor: GREEN_LT }}>
                    <p className="text-sm font-bold" style={{ color: GREEN }}>🎉 You've been shortlisted!</p>
                    <p className="text-xs text-stone-600 mt-0.5">The company can now see your profile. They may reach out directly.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border p-6 text-center" style={{ borderColor: '#e7e5e4' }}>
                <Lock size={24} className="text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-500">Sign up for the challenge to view submissions</p>
              </div>
            )}
          </div>
        )}

        {/* ── Submit tab ────────────────────────────────────────────────────── */}
        {tab === 'submit' && registered && !isRecruiter && (
          <div className="space-y-4">
            {submitted || mySubmission ? (
              <div className="bg-white rounded-2xl border p-8 text-center space-y-4" style={{ borderColor: '#e7e5e4' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                  style={{ backgroundColor: GREEN_LT }}>
                  <CheckCircle size={28} style={{ color: GREEN }} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-stone-900">Solution submitted</h3>
                  <p className="text-sm text-stone-500 mt-1 leading-relaxed max-w-xs mx-auto">
                    Your solution has been submitted anonymously. You'll be notified if you're shortlisted.
                  </p>
                </div>
                <div className="text-left p-4 rounded-xl space-y-2" style={{ backgroundColor: GREEN_LT }}>
                  <p className="text-xs font-bold" style={{ color: GREEN }}>What happens next:</p>
                  {[
                    'Company reviews all submissions anonymously',
                    'Shortlisted candidates are revealed and notified',
                    'Winner receives prize payment before any IP transfer',
                    'Company may offer additional engagement directly',
                  ].map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs" style={{ color: GREEN }}>
                      <CheckCircle size={11} className="flex-shrink-0 mt-0.5" /> {s}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Collaboration pod */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-stone-900 text-sm">Collaboration pod</h3>
                      <p className="text-xs text-stone-400 mt-0.5">Optional — work with others on your solution</p>
                    </div>
                    {!myPod && onCreatePod && (
                      <button onClick={() => setShowCreatePod(s => !s)}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors hover:bg-stone-50"
                        style={{ borderColor: '#e7e5e4', color: GREEN }}>
                        <Plus size={12} /> Create pod
                      </button>
                    )}
                  </div>

                  {myPod ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: GREEN_LT }}>
                      <Users size={16} style={{ color: GREEN }} />
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: GREEN }}>{myPod.name}</p>
                        <p className="text-xs text-stone-500">Collaboration pod created</p>
                      </div>
                      {/* Invite collaborators */}
                      <button onClick={() => setShowInvites(s => !s)}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white"
                        style={{ backgroundColor: GREEN }}>
                        <UserPlus size={11} /> Invite
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400">
                      No pod created — you can submit individually.
                    </p>
                  )}

                  {showCreatePod && !myPod && (
                    <div className="mt-3 space-y-2 pt-3 border-t" style={{ borderColor: '#f5f5f4' }}>
                      <input
                        type="text" value={podName} onChange={e => setPodName(e.target.value)}
                        placeholder="Pod name (e.g. Team Payments)"
                        className="w-full px-3 py-2 text-sm border rounded-xl focus:outline-none"
                        style={{ borderColor: '#e7e5e4' }}
                      />
                      <textarea
                        value={podDesc} onChange={e => setPodDesc(e.target.value)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border rounded-xl focus:outline-none resize-none"
                        style={{ borderColor: '#e7e5e4' }}
                      />
                      <button onClick={handleCreatePod} disabled={!podName.trim() || creatingPod}
                        className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                        style={{ backgroundColor: GREEN }}>
                        {creatingPod ? 'Creating…' : 'Create collaboration pod'}
                      </button>
                    </div>
                  )}

                  {showInvites && myPod && (
                    <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: '#f5f5f4' }}>
                      <input
                        type="text" value={inviteQuery} onChange={e => setInviteQuery(e.target.value)}
                        placeholder="Search collaborators by name…"
                        className="w-full px-3 py-2 text-sm border rounded-xl focus:outline-none"
                        style={{ borderColor: '#e7e5e4' }}
                      />
                      {inviteCandidates.map(u => (
                        <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-stone-50">
                          {u.avatarUrl
                            ? <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                            : <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ backgroundColor: GREEN }}>{u.name[0]}</div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-800 truncate">{u.name}</p>
                            <p className="text-xs text-stone-400 truncate">{u.headline}</p>
                          </div>
                          <button className="text-xs font-bold px-2.5 py-1 rounded-lg text-white flex-shrink-0"
                            style={{ backgroundColor: GREEN }}>
                            Invite
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Solution input */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#e7e5e4' }}>
                  <h3 className="font-bold text-stone-900 text-sm mb-1">Your solution</h3>
                  <p className="text-xs text-stone-400 mb-3">
                    {challenge.submissionFormat === 'url'
                      ? 'Paste a link to your solution (GitHub, Figma, doc, etc.)'
                      : 'Describe your solution clearly and concisely.'}
                  </p>
                  <textarea
                    value={solutionText}
                    onChange={e => setSolutionText(e.target.value)}
                    rows={8}
                    placeholder={
                      challenge.submissionFormat === 'url'
                        ? 'https://github.com/yourname/solution'
                        : 'Describe your approach, methodology, and solution…'
                    }
                    className="w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none resize-none"
                    style={{ borderColor: '#e7e5e4' }}
                  />
                  <p className="text-xs text-stone-400 mt-2">
                    {solutionText.length} characters
                  </p>
                </div>

                {/* Submission notice */}
                <div className="flex items-start gap-2 p-3 rounded-xl"
                  style={{ backgroundColor: '#fefce8', borderColor: '#fde68a' }}>
                  <Info size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Your submission is final. Your identity is hidden from the company until you are shortlisted. No company may use your work without paying the prize first.
                  </p>
                </div>

                {submitError && (
                  <p className="text-xs text-red-500 text-center">{submitError}</p>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!solutionText.trim() || submitting}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: GREEN }}>
                  {submitting
                    ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                    : <><Send size={15} /> Submit solution anonymously</>}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Terms modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border w-full max-w-lg overflow-hidden shadow-2xl"
            style={{ borderColor: '#e7e5e4' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#f3f4f6' }}>
              <div className="flex items-center gap-2">
                <Shield size={16} style={{ color: GREEN }} />
                <h3 className="font-black text-stone-900">Challenge Terms</h3>
              </div>
              <button onClick={() => setShowTerms(false)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>
            <div className="px-5 py-4 max-h-80 overflow-y-auto">
              <pre className="text-xs text-stone-600 leading-relaxed whitespace-pre-wrap font-sans">
                {CHALLENGE_LEGAL_TERMS}
              </pre>
            </div>
            <div className="px-5 py-4 border-t space-y-3" style={{ borderColor: '#f3f4f6' }}>
              <label className="flex items-start gap-3 cursor-pointer">
                <div
                  onClick={() => setAgreedTerms(v => !v)}
                  className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all cursor-pointer"
                  style={{
                    borderColor: agreedTerms ? GREEN : '#d1d5db',
                    backgroundColor: agreedTerms ? GREEN : 'white',
                  }}>
                  {agreedTerms && <CheckCircle size={12} className="text-white" />}
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  I have read and agree to the BeWatu Arena Challenge Terms. I understand this is not an offer of employment or contract, and that my submission cannot be used until the prize is paid.
                </p>
              </label>
              <button
                onClick={handleRegister}
                disabled={!agreedTerms || registering}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: GREEN }}>
                {registering ? 'Signing up…' : 'I agree and sign up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
