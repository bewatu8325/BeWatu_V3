/**
 * components/PodFeatures.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered pod features for BeWatu:
 *
 *  1. PodNotificationPrefs  — per-pod notification settings (digest-only default)
 *  2. PodCatchUp            — AI "here's what you missed" summary
 *  3. PodWeeklyDigest       — weekly digest generator (called server-side Sunday)
 *  4. RoleTaggedPost        — wraps a post with career stage badge
 *  5. GenerationalInsight   — AI synthesis of cross-generational discussion
 *  6. PodChallenge          — admin posts a challenge, members respond, AI synthesises
 *  7. SmartMemberSuggestions — AI suggests members to invite
 *  8. ConversationStarter   — AI prompt when pod is quiet
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell, BellOff, BookOpen, Zap, Users, MessageSquare,
  ChevronDown, ChevronUp, Loader2, Send, Trophy, Lightbulb,
  CheckCircle, Clock, Star, RefreshCw,
} from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

// ── Career stage config (mirrors GenerationalPod.tsx) ────────────────────────

export type CareerStage = 'emerging' | 'growing' | 'established' | 'veteran';

const STAGE_CONFIG: Record<CareerStage, { label: string; colour: string; bg: string; years: string }> = {
  emerging:    { label: 'Emerging',    colour: '#7c3aed', bg: '#ede9fe', years: '0–3 yrs' },
  growing:     { label: 'Growing',     colour: '#0891b2', bg: '#cffafe', years: '4–10 yrs' },
  established: { label: 'Established', colour: '#d97706', bg: '#fef3c7', years: '11–20 yrs' },
  veteran:     { label: 'Veteran',     colour: '#1a4a3a', bg: '#d1fae5', years: '20+ yrs' },
};

// ── Claude API helper ─────────────────────────────────────────────────────────

async function askClaude(prompt: string, maxTokens = 800): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      system: 'You are a helpful assistant for BeWatu, a professional network. Be concise, insightful, and professional. Never use bullet points unless specifically asked.',
      maxTokens,
    }),
  });
  if (!res.ok) throw new Error('Claude API error');
  const data = await res.json();
  return (data.text ?? data.content ?? '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PodNotificationPrefs
// ─────────────────────────────────────────────────────────────────────────────

export type PodNotifPref = 'all' | 'digest' | 'mentions' | 'off';

interface PodNotificationPrefsProps {
  podId:     string;
  podName:   string;
  userUid:   string;
  onChange?: (pref: PodNotifPref) => void;
}

const NOTIF_OPTIONS: { value: PodNotifPref; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'all',      label: 'All activity',   desc: 'Every post and reply in this pod',          icon: <Bell size={14} /> },
  { value: 'digest',   label: 'Weekly digest',  desc: 'One summary every Sunday — recommended',   icon: <BookOpen size={14} /> },
  { value: 'mentions', label: 'Mentions only',  desc: 'Only when someone replies to you directly', icon: <MessageSquare size={14} /> },
  { value: 'off',      label: 'Off',            desc: 'No notifications from this pod',            icon: <BellOff size={14} /> },
];

export const PodNotificationPrefs: React.FC<PodNotificationPrefsProps> = ({
  podId, podName, userUid, onChange,
}) => {
  const storageKey = `pod_notif_${userUid}_${podId}`;
  const [pref, setPref] = useState<PodNotifPref>(() => {
    try { return (localStorage.getItem(storageKey) as PodNotifPref) ?? 'digest'; }
    catch { return 'digest'; }
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (val: PodNotifPref) => {
    setSaving(true);
    setPref(val);
    try {
      localStorage.setItem(storageKey, val);
      // Persist to Firestore pod membership doc
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      const memberDocRef = doc(db, 'circles', podId, 'members', userUid);
      await updateDoc(memberDocRef, { notifPref: val }).catch(() => {
        // Member doc may not exist as subcollection — write to user prefs instead
        const userPrefRef = doc(db, 'users', userUid, 'podPrefs', podId);
        return updateDoc(userPrefRef, { notifPref: val }).catch(() => {});
      });
      onChange?.(val);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  const current = NOTIF_OPTIONS.find(o => o.value === pref)!;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-stone-50"
        style={{ borderColor: '#e7e5e4', color: '#6b7280' }}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : current.icon}
        {current.label}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border shadow-lg z-20 w-64"
          style={{ borderColor: '#e7e5e4' }}>
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest px-3 pt-3 pb-1">
            Notifications for {podName}
          </p>
          {NOTIF_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleSelect(opt.value)}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left">
              <span className="mt-0.5 flex-shrink-0" style={{ color: pref === opt.value ? GREEN : '#9ca3af' }}>
                {opt.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-800">{opt.label}</p>
                <p className="text-xs text-stone-400">{opt.desc}</p>
              </div>
              {pref === opt.value && <CheckCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: GREEN }} />}
            </button>
          ))}
          <div className="px-3 pb-3 pt-1">
            <p className="text-xs text-stone-400 leading-relaxed">
              Default is "Weekly digest" — one Sunday summary instead of constant interruptions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PodCatchUp — AI "here's what you missed"
// ─────────────────────────────────────────────────────────────────────────────

interface PodCatchUpProps {
  podName:    string;
  podTopic?:  string;
  recentPosts: Array<{ content: string; authorName: string; authorStage?: CareerStage; createdAt?: any }>;
  lastVisited?: Date;
}

export const PodCatchUp: React.FC<PodCatchUpProps> = ({
  podName, podTopic, recentPosts, lastVisited,
}) => {
  const [summary,  setSummary]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [done,     setDone]     = useState(false);

  const newPosts = lastVisited
    ? recentPosts.filter(p => p.createdAt?.toDate?.() > lastVisited || !p.createdAt)
    : recentPosts;

  const generate = useCallback(async () => {
    if (newPosts.length === 0) return;
    setLoading(true);
    try {
      const postText = newPosts.slice(0, 10).map(p =>
        `${p.authorName}${p.authorStage ? ` (${STAGE_CONFIG[p.authorStage]?.label})` : ''}: "${p.content}"`
      ).join('\n');

      const prompt = `You are catching up a professional on what they missed in their BeWatu pod.

Pod: "${podName}"${podTopic ? ` — Topic: ${podTopic}` : ''}
Posts since last visit (${newPosts.length} total, showing up to 10):
${postText}

Write a 2-3 sentence catch-up summary in a warm, collegial tone. Mention the most interesting discussion thread or point raised. If there are perspectives from different career stages, highlight any interesting contrast. Do not use bullet points. Do not start with "In this pod" or "Here's what you missed".`;

      const text = await askClaude(prompt, 200);
      setSummary(text);
      setDone(true);
    } catch {
      setSummary('Could not generate summary — scroll down to catch up manually.');
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, [newPosts, podName, podTopic]);

  if (newPosts.length < 3) return null;

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
      <button
        onClick={() => { setExpanded(e => !e); if (!done && !loading) generate(); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: GREEN_LT }}>
            <Zap size={13} style={{ color: GREEN }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-stone-900">
              {newPosts.length} new post{newPosts.length !== 1 ? 's' : ''} since your last visit
            </p>
            <p className="text-xs text-stone-400">Tap to get an AI catch-up summary</p>
          </div>
        </div>
        {expanded ? <ChevronUp size={15} className="text-stone-400" /> : <ChevronDown size={15} className="text-stone-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#f5f5f4' }}>
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-stone-400">
              <Loader2 size={14} className="animate-spin" /> Reading the discussion…
            </div>
          ) : (
            <p className="text-sm text-stone-700 leading-relaxed pt-3">{summary}</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. RoleTaggedPost — wraps post content with career stage badge
// ─────────────────────────────────────────────────────────────────────────────

interface RoleTaggedPostProps {
  stage?:       CareerStage;
  authorName:   string;
  avatarUrl?:   string;
  content:      string;
  timestamp?:   string;
  isGenerationalPod: boolean;
}

export const RoleStageBadge: React.FC<{ stage: CareerStage; compact?: boolean }> = ({ stage, compact }) => {
  const cfg = STAGE_CONFIG[stage];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: cfg.bg, color: cfg.colour }}
    >
      {cfg.label}
      {!compact && <span className="opacity-60 font-normal">{cfg.years}</span>}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. GenerationalInsight — AI synthesis after a discussion
// ─────────────────────────────────────────────────────────────────────────────

interface GenerationalInsightProps {
  podName:  string;
  posts:    Array<{ content: string; authorName: string; stage?: CareerStage }>;
  minPosts?: number; // minimum posts needed to generate insight (default 4)
}

export const GenerationalInsight: React.FC<GenerationalInsightProps> = ({
  podName, posts, minPosts = 4,
}) => {
  const [insight,  setInsight]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [visible,  setVisible]  = useState(false);
  const [done,     setDone]     = useState(false);

  // Only render if we have posts from at least 2 different stages
  const stages = [...new Set(posts.filter(p => p.stage).map(p => p.stage))];
  if (stages.length < 2 || posts.length < minPosts) return null;

  const generate = async () => {
    setLoading(true);
    try {
      const byStage = posts.reduce((acc, p) => {
        if (!p.stage) return acc;
        if (!acc[p.stage]) acc[p.stage] = [];
        acc[p.stage].push(`${p.authorName}: "${p.content}"`);
        return acc;
      }, {} as Record<string, string[]>);

      const stageBlocks = Object.entries(byStage).map(([stage, msgs]) => {
        const cfg = STAGE_CONFIG[stage as CareerStage];
        return `${cfg?.label ?? stage} members:\n${msgs.join('\n')}`;
      }).join('\n\n');

      const prompt = `You are analysing a discussion in a cross-generational professional pod on BeWatu.

Pod: "${podName}"

Discussion by career stage:
${stageBlocks}

Write a 2-3 sentence synthesis that:
1. Identifies the most interesting point of agreement or tension between career stages
2. Names which stages held which perspective (e.g. "emerging members focused on X while veterans emphasised Y")
3. Ends with a forward-looking observation about what this generational contrast reveals

Be specific, not generic. Do not start with "In this discussion". Tone: warm, intellectually curious, collegial.`;

      const text = await askClaude(prompt, 250);
      setInsight(text);
      setDone(true);
    } catch {
      setInsight('Could not generate insight at this time.');
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: '#fefce8', borderColor: '#fde68a' }}>
      <button
        onClick={() => { setVisible(v => !v); if (!done && !loading) generate(); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#fde68a' }}>
            <Zap size={13} style={{ color: '#92400e' }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold" style={{ color: '#92400e' }}>Generational insight</p>
            <p className="text-xs" style={{ color: '#b45309' }}>
              AI synthesis of {stages.length} career-stage perspectives
            </p>
          </div>
        </div>
        {visible
          ? <ChevronUp size={15} style={{ color: '#b45309' }} />
          : <ChevronDown size={15} style={{ color: '#b45309' }} />}
      </button>

      {visible && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#fde68a' }}>
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm" style={{ color: '#b45309' }}>
              <Loader2 size={14} className="animate-spin" /> Synthesising perspectives…
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed pt-3" style={{ color: '#78350f' }}>{insight}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {stages.map(s => s && <RoleStageBadge key={s} stage={s} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. PodChallenge — admin poses a question, members respond, AI synthesises
// ─────────────────────────────────────────────────────────────────────────────

export interface PodChallengeData {
  id:           string;
  podId:        string;
  question:     string;
  context?:     string;
  postedBy:     string;
  postedAt:     Date;
  deadline?:    Date;
  responses:    PodChallengeResponse[];
  synthesis?:   string;
  status:       'open' | 'synthesised' | 'closed';
}

export interface PodChallengeResponse {
  id:           string;
  authorId:     number;
  authorName:   string;
  authorStage?: CareerStage;
  content:      string;
  createdAt:    Date;
  upvotes:      number;
}

interface PostChallengeFormProps {
  podId:    string;
  podName:  string;
  onPost:   (question: string, context: string, deadline?: Date) => Promise<void>;
  onCancel: () => void;
}

export const PostChallengeForm: React.FC<PostChallengeFormProps> = ({ podId, podName, onPost, onCancel }) => {
  const [question,  setQuestion]  = useState('');
  const [context,   setContext]   = useState('');
  const [deadline,  setDeadline]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const generateQuestion = async () => {
    setGenerating(true);
    try {
      const prompt = `Generate a thought-provoking discussion question for a professional pod called "${podName}". 
The question should invite different perspectives from professionals at different career stages (0-3 years, 4-10 years, 11-20 years, 20+ years).
Return only the question itself — no preamble, no explanation. Make it specific and intellectually interesting, not generic.`;
      const q = await askClaude(prompt, 100);
      setQuestion(q.replace(/^["']|["']$/g, ''));
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setSubmitting(true);
    await onPost(question.trim(), context.trim(), deadline ? new Date(deadline) : undefined);
    setSubmitting(false);
  };

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: '#f3f4f6' }}>
        <Trophy size={14} style={{ color: GREEN }} />
        <h3 className="font-bold text-stone-900 text-sm">Post a pod challenge</h3>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Question *</label>
          <button onClick={generateQuestion} disabled={generating}
            className="flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50"
            style={{ color: GREEN }}>
            {generating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            Generate with AI
          </button>
        </div>
        <textarea
          value={question} onChange={e => setQuestion(e.target.value)}
          rows={2} placeholder="What question would benefit from multiple career-stage perspectives?"
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none resize-none"
          style={{ borderColor: '#e7e5e4' }}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest block">Context (optional)</label>
        <textarea
          value={context} onChange={e => setContext(e.target.value)}
          rows={2} placeholder="Any background that would help members respond well?"
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none resize-none"
          style={{ borderColor: '#e7e5e4' }}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest block">Response deadline (optional)</label>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
          style={{ borderColor: '#e7e5e4' }}
          min={new Date().toISOString().split('T')[0]}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 text-sm text-stone-600 border rounded-xl hover:bg-stone-50 font-semibold"
          style={{ borderColor: '#e7e5e4' }}>Cancel</button>
        <button onClick={handleSubmit} disabled={!question.trim() || submitting}
          className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: GREEN }}>
          {submitting ? 'Posting…' : 'Post challenge'}
        </button>
      </div>
    </div>
  );
};

interface PodChallengeCardProps {
  challenge:    PodChallengeData;
  currentUser:  { id: number; name: string; stage?: CareerStage };
  isAdmin:      boolean;
  onRespond:    (challengeId: string, content: string) => Promise<void>;
  onSynthesise: (challengeId: string) => Promise<void>;
  onUpvote:     (challengeId: string, responseId: string) => Promise<void>;
}

export const PodChallengeCard: React.FC<PodChallengeCardProps> = ({
  challenge, currentUser, isAdmin, onRespond, onSynthesise, onUpvote,
}) => {
  const [response,     setResponse]     = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [synthesising, setSynthesising] = useState(false);
  const [expanded,     setExpanded]     = useState(true);

  const hasResponded = challenge.responses.some(r => r.authorId === currentUser.id);
  const isOpen       = challenge.status === 'open';
  const daysLeft     = challenge.deadline
    ? Math.ceil((challenge.deadline.getTime() - Date.now()) / 86400000)
    : null;

  const handleRespond = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    await onRespond(challenge.id, response.trim());
    setResponse('');
    setSubmitting(false);
  };

  const handleSynthesise = async () => {
    setSynthesising(true);
    await onSynthesise(challenge.id);
    setSynthesising(false);
  };

  // Sort: upvoted first, then by stage
  const sorted = [...challenge.responses].sort((a, b) => b.upvotes - a.upvotes);

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between"
        style={{ backgroundColor: GREEN_LT, borderColor: '#c7e8d8' }}>
        <div className="flex items-center gap-2">
          <Trophy size={13} style={{ color: GREEN }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: GREEN }}>Pod Challenge</span>
          {challenge.status === 'synthesised' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: GREEN, color: 'white' }}>AI Insight ready</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {daysLeft !== null && isOpen && (
            <span className="text-xs text-stone-400 flex items-center gap-1">
              <Clock size={11} /> {daysLeft > 0 ? `${daysLeft}d left` : 'Ended'}
            </span>
          )}
          <button onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Question */}
          <div>
            <p className="font-bold text-stone-900 text-sm leading-relaxed">{challenge.question}</p>
            {challenge.context && (
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">{challenge.context}</p>
            )}
            <p className="text-xs text-stone-400 mt-1.5">
              Asked by {challenge.postedBy} · {challenge.responses.length} response{challenge.responses.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* AI Synthesis */}
          {challenge.synthesis && (
            <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: '#fefce8', borderColor: '#fde68a' }}>
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#92400e' }}>
                <Zap size={11} /> Generational synthesis
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#78350f' }}>{challenge.synthesis}</p>
            </div>
          )}

          {/* Responses */}
          {sorted.length > 0 && (
            <div className="space-y-3">
              {sorted.map(r => (
                <div key={r.id} className="flex items-start gap-3 py-2 border-t" style={{ borderColor: '#f5f5f4' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: r.stage ? STAGE_CONFIG[r.stage].colour : GREEN }}>
                    {r.authorName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-stone-800">{r.authorName}</span>
                      {r.authorStage && <RoleStageBadge stage={r.authorStage} compact />}
                    </div>
                    <p className="text-sm text-stone-700 leading-relaxed">{r.content}</p>
                  </div>
                  <button onClick={() => onUpvote(challenge.id, r.id)}
                    className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border hover:bg-stone-50 transition-colors flex-shrink-0"
                    style={{ borderColor: '#e7e5e4', color: '#9ca3af' }}>
                    <Star size={11} /> {r.upvotes}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Respond */}
          {isOpen && !hasResponded && (
            <div className="space-y-2 border-t pt-3" style={{ borderColor: '#f5f5f4' }}>
              <textarea
                value={response} onChange={e => setResponse(e.target.value)}
                rows={2} placeholder="Share your perspective…"
                className="w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none resize-none"
                style={{ borderColor: '#e7e5e4' }}
              />
              {currentUser.stage && (
                <p className="text-xs text-stone-400">
                  Your response will be tagged as <RoleStageBadge stage={currentUser.stage} compact />
                </p>
              )}
              <button onClick={handleRespond} disabled={!response.trim() || submitting}
                className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: GREEN }}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? 'Posting…' : 'Submit response'}
              </button>
            </div>
          )}

          {hasResponded && isOpen && (
            <p className="text-xs text-center text-stone-400 py-1">✓ You've responded to this challenge</p>
          )}

          {/* Admin synthesise button */}
          {isAdmin && challenge.responses.length >= 2 && !challenge.synthesis && (
            <button onClick={handleSynthesise} disabled={synthesising}
              className="w-full py-2 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-colors hover:bg-stone-50"
              style={{ borderColor: '#e7e5e4', color: GREEN }}>
              {synthesising
                ? <><Loader2 size={13} className="animate-spin" /> Synthesising…</>
                : <><Zap size={13} /> Generate AI synthesis</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. SmartMemberSuggestions
// ─────────────────────────────────────────────────────────────────────────────

interface SmartMemberSuggestionsProps {
  podName:         string;
  podTopic?:       string;
  existingMembers: Array<{ name: string; skills?: string[]; stage?: CareerStage }>;
  candidates:      Array<{ id: number; name: string; headline?: string; skills?: string[]; stage?: CareerStage }>;
  onInvite:        (userId: number) => void;
}

export const SmartMemberSuggestions: React.FC<SmartMemberSuggestionsProps> = ({
  podName, podTopic, existingMembers, candidates, onInvite,
}) => {
  const [suggestions, setSuggestions] = useState<Array<{ id: number; reason: string }>>([]);
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);
  const [visible,     setVisible]     = useState(false);

  const generate = async () => {
    if (candidates.length === 0) return;
    setLoading(true);
    try {
      const memberSummary = existingMembers.slice(0, 8).map(m =>
        `${m.name}${m.stage ? ` (${STAGE_CONFIG[m.stage]?.label})` : ''}${m.skills?.length ? ': ' + m.skills.slice(0, 3).join(', ') : ''}`
      ).join('\n');

      const candidateSummary = candidates.slice(0, 20).map((c, i) =>
        `[${i}] ${c.name}${c.stage ? ` (${STAGE_CONFIG[c.stage]?.label})` : ''} — ${c.headline ?? ''}${c.skills?.length ? ' | Skills: ' + c.skills.slice(0, 3).join(', ') : ''}`
      ).join('\n');

      const prompt = `You are helping a pod admin on BeWatu find the best new members.

Pod: "${podName}"${podTopic ? ` — Topic: ${podTopic}` : ''}

Current members:
${memberSummary}

Candidates (by index):
${candidateSummary}

Choose the 3 best candidates to add. Consider: skills complementarity, career stage diversity, and relevance to the pod topic.

Return ONLY a JSON array with exactly 3 objects: [{"index": number, "reason": "one sentence why they'd add value"}]
No other text.`;

      const text = await askClaude(prompt, 300);
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean) as Array<{ index: number; reason: string }>;
      setSuggestions(parsed.map(s => ({ id: candidates[s.index]?.id ?? -1, reason: s.reason })).filter(s => s.id !== -1));
      setDone(true);
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => { setVisible(v => !v); if (!done && !loading) generate(); }}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-stone-50"
        style={{ borderColor: '#e7e5e4', color: GREEN }}>
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
        {loading ? 'Finding best matches…' : 'AI member suggestions'}
      </button>

      {visible && !loading && suggestions.length > 0 && (
        <div className="mt-2 space-y-2">
          {suggestions.map(s => {
            const candidate = candidates.find(c => c.id === s.id);
            if (!candidate) return null;
            return (
              <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl border"
                style={{ borderColor: '#e7e5e4', backgroundColor: GREEN_LT }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: GREEN }}>
                  {candidate.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800">{candidate.name}</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{s.reason}</p>
                </div>
                <button onClick={() => onInvite(s.id)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex-shrink-0"
                  style={{ backgroundColor: GREEN }}>
                  Invite
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. ConversationStarter — AI prompt when pod is quiet
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationStarterProps {
  podName:       string;
  podTopic?:     string;
  lastPostDate?: Date;
  isAdmin:       boolean;
  onPost:        (content: string) => void;
  circleId?:     number;
}

export const ConversationStarter: React.FC<ConversationStarterProps> = ({
  podName, podTopic, lastPostDate, isAdmin, onPost, circleId,
}) => {
  const [starter,  setStarter]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [visible,  setVisible]  = useState(false);

  const daysSincePost = lastPostDate
    ? Math.floor((Date.now() - lastPostDate.getTime()) / 86400000)
    : 999;

  // Only show if pod has been quiet for 3+ days
  if (daysSincePost < 3) return null;

  const generate = async () => {
    setLoading(true);
    try {
      const prompt = `Generate a single thought-provoking conversation starter for a professional BeWatu pod.

Pod: "${podName}"${podTopic ? ` — Topic: ${podTopic}` : ''}
The pod has been quiet for ${daysSincePost} days.

Requirements:
- The question should invite perspectives from professionals at different career stages
- It should feel timely and relevant to professional life in 2026
- One sentence. No preamble. Just the question.`;

      const text = await askClaude(prompt, 80);
      setStarter(text.replace(/^["']|["']$/g, ''));
      setVisible(true);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#ede9fe' }}>
          <Lightbulb size={14} style={{ color: '#7c3aed' }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-stone-900">This pod has been quiet for {daysSincePost} days</p>
          {!visible ? (
            <div className="flex items-center gap-2 mt-2">
              <button onClick={generate} disabled={loading}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: '#7c3aed' }}>
                {loading ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {loading ? 'Generating…' : 'Get a conversation starter'}
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-stone-700 leading-relaxed italic">"{starter}"</p>
              <div className="flex gap-2">
                {isAdmin && (
                  <button onClick={() => onPost(starter)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ backgroundColor: GREEN }}>
                    <Send size={11} /> Post this
                  </button>
                )}
                <button onClick={generate} disabled={loading}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-stone-50 transition-colors"
                  style={{ borderColor: '#e7e5e4', color: '#6b7280' }}>
                  <RefreshCw size={11} /> Try another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. PodHealthNarrative — AI-written pod health summary
// ─────────────────────────────────────────────────────────────────────────────

interface PodHealthNarrativeProps {
  podName:        string;
  memberCount:    number;
  postCount:      number;
  activeMembers:  number; // members who posted in last 7 days
  stages?:        Record<CareerStage, number>; // member count per stage for gen pods
}

export const PodHealthNarrative: React.FC<PodHealthNarrativeProps> = ({
  podName, memberCount, postCount, activeMembers, stages,
}) => {
  const [narrative, setNarrative] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  const participationRate = memberCount > 0 ? Math.round((activeMembers / memberCount) * 100) : 0;

  useEffect(() => {
    if (postCount < 5) return; // not enough data
    const generate = async () => {
      setLoading(true);
      try {
        const stageText = stages
          ? Object.entries(stages).map(([s, n]) => `${STAGE_CONFIG[s as CareerStage]?.label}: ${n}`).join(', ')
          : '';

        const prompt = `Write a one-sentence pod health narrative for a BeWatu pod admin.

Pod: "${podName}"
Stats: ${postCount} posts this week, ${activeMembers}/${memberCount} members active (${participationRate}% participation)${stageText ? `, Member stages: ${stageText}` : ''}

Write exactly one sentence. Make it specific and actionable — tell the admin something useful about their pod's health or a pattern you notice. Do not start with "Your pod" or "This pod". Vary the sentence structure.`;

        const text = await askClaude(prompt, 80);
        setNarrative(text);
        setDone(true);
      } catch {
        setDone(true);
      } finally {
        setLoading(false);
      }
    };
    generate();
  }, [podName, postCount, activeMembers, memberCount]);

  if (!done && !loading) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ backgroundColor: GREEN_LT }}>
      <div className="flex-shrink-0">
        {loading
          ? <Loader2 size={14} className="animate-spin" style={{ color: GREEN }} />
          : <Zap size={14} style={{ color: GREEN }} />}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: GREEN }}>
        {loading ? 'Analysing pod health…' : narrative}
      </p>
    </div>
  );
};
