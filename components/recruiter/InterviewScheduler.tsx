import React, { useState, useEffect } from 'react';
import {
  Calendar, Clock, CheckCircle, X, Loader2,
  ChevronLeft, ChevronRight, Send, User, Copy, Check,
} from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  proposeInterviewSlots,
  fetchInterviewsForRecruiter,
  confirmInterviewSlot,
  cancelInterview,
} from '../../lib/firestoreService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeSlot {
  id: string;
  datetime: string; // ISO
  duration: number; // minutes
}

export interface Interview {
  id: string;
  applicationId: string;
  jobTitle: string;
  candidateName: string;
  candidateUid: string;
  candidateAvatar?: string;
  proposedSlots: TimeSlot[];
  confirmedSlot?: TimeSlot;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  meetingLink?: string;
  notes?: string;
  createdAt: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSlot(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    full: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Slot Picker ──────────────────────────────────────────────────────────────

function SlotPicker({
  slots,
  onChange,
}: {
  slots: TimeSlot[];
  onChange: (slots: TimeSlot[]) => void;
}) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(30);

  function addSlot() {
    if (!date || !time || slots.length >= 3) return;
    const iso = new Date(`${date}T${time}`).toISOString();
    if (slots.some(s => s.datetime === iso)) return;
    onChange([...slots, { id: crypto.randomUUID(), datetime: iso, duration }]);
    setDate('');
  }

  function removeSlot(id: string) {
    onChange(slots.filter(s => s.id !== id));
  }

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <label className="text-xs font-medium text-slate-400 mb-1 block">Date</label>
          <input
            type="date"
            min={minDate}
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">Time</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">Duration</label>
          <select
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
          </select>
        </div>
      </div>
      <button
        onClick={addSlot}
        disabled={!date || !time || slots.length >= 3}
        className="w-full rounded-lg border border-dashed border-slate-600 py-2 text-xs font-medium text-slate-400 hover:border-cyan-500 hover:text-cyan-400 disabled:opacity-40 transition-colors"
      >
        + Add slot ({slots.length}/3)
      </button>
      {slots.length > 0 && (
        <div className="space-y-1.5">
          {slots.map((s, i) => {
            const f = formatSlot(s.datetime);
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2">
                <span className="text-xs font-bold text-cyan-400 w-4">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200">{f.date}</p>
                  <p className="text-xs text-slate-400">{f.time} · {s.duration} min</p>
                </div>
                <button onClick={() => removeSlot(s.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Propose Modal ────────────────────────────────────────────────────────────

function ProposeModal({
  applicationId,
  candidateName,
  jobTitle,
  candidateUid,
  onClose,
  onSent,
}: {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  candidateUid: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { fbUser, currentUser } = useFirebase();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    if (slots.length === 0) { setError('Add at least one time slot.'); return; }
    if (!fbUser || !currentUser) return;
    setSending(true);
    try {
      await proposeInterviewSlots({
        applicationId,
        recruiterUid: fbUser.uid,
        recruiterName: currentUser.name,
        candidateUid,
        candidateName,
        jobTitle,
        proposedSlots: slots,
        meetingLink: meetingLink.trim(),
        notes: notes.trim(),
      });
      onSent();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to send.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100">Propose Interview Times</h3>
            <p className="text-xs text-slate-400 mt-0.5">{candidateName} · {jobTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>

        <p className="text-xs text-slate-400">
          Propose up to 3 time slots. The candidate will receive a notification and can pick one — no emails needed.
        </p>

        <SlotPicker slots={slots} onChange={setSlots} />

        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">Meeting Link (optional)</label>
          <input
            value={meetingLink}
            onChange={e => setMeetingLink(e.target.value)}
            placeholder="https://meet.google.com/..."
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">Note to candidate (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. We'll be discussing your approach to system design..."
            className="w-full resize-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={handleSend}
          disabled={sending || slots.length === 0}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send to Candidate
        </button>
      </div>
    </div>
  );
}

// ─── Interview Card ───────────────────────────────────────────────────────────

function InterviewCard({
  interview,
  onCancel,
  onRefresh,
}: {
  interview: Interview;
  onCancel: (id: string) => void;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    if (!interview.meetingLink) return;
    navigator.clipboard.writeText(interview.meetingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusColors = {
    pending:   'bg-amber-500/10 border-amber-500/20 text-amber-400',
    confirmed: 'bg-green-500/10 border-green-500/20 text-green-400',
    cancelled: 'bg-red-500/10 border-red-500/20 text-red-400',
    completed: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {interview.candidateAvatar ? (
            <img src={interview.candidateAvatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-slate-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{interview.candidateName}</p>
            <p className="text-xs text-slate-400 truncate">{interview.jobTitle}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusColors[interview.status]}`}>
          {interview.status.toUpperCase()}
        </span>
      </div>

      {interview.status === 'confirmed' && interview.confirmedSlot && (
        <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3">
          <p className="text-xs font-semibold text-green-400 mb-1">Confirmed time</p>
          <p className="text-sm font-medium text-slate-100">{formatSlot(interview.confirmedSlot.datetime).full}</p>
          <p className="text-xs text-slate-400">{interview.confirmedSlot.duration} minutes</p>
          {interview.meetingLink && (
            <div className="mt-2 flex items-center gap-2">
              <a href={interview.meetingLink} target="_blank" rel="noreferrer"
                className="text-xs text-cyan-400 hover:underline truncate flex-1">{interview.meetingLink}</a>
              <button onClick={copyLink} className="shrink-0 text-slate-400 hover:text-cyan-400 transition-colors">
                {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      )}

      {interview.status === 'pending' && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-400">Proposed slots (awaiting candidate response)</p>
          {interview.proposedSlots.map((s, i) => {
            const f = formatSlot(s.datetime);
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-700/50 px-3 py-2">
                <span className="text-xs font-bold text-amber-400 w-4">#{i + 1}</span>
                <p className="text-xs text-slate-200">{f.date} at {f.time}</p>
                <span className="text-xs text-slate-500 ml-auto">{s.duration} min</span>
              </div>
            );
          })}
        </div>
      )}

      {interview.notes && (
        <p className="text-xs text-slate-400 italic">"{interview.notes}"</p>
      )}

      {interview.status === 'pending' && (
        <button
          onClick={() => onCancel(interview.id)}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Cancel interview
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface InterviewSchedulerProps {
  // If passed, opens directly into propose flow for a specific candidate
  quickPropose?: {
    applicationId: string;
    candidateName: string;
    jobTitle: string;
    candidateUid: string;
  };
  onClose?: () => void;
}

export function InterviewScheduler({ quickPropose, onClose }: InterviewSchedulerProps) {
  const { fbUser } = useFirebase();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPropose, setShowPropose] = useState(!!quickPropose);
  const [filter, setFilter] = useState<Interview['status'] | 'all'>('all');

  async function load() {
    if (!fbUser) return;
    setLoading(true);
    try {
      const data = await fetchInterviewsForRecruiter(fbUser.uid);
      setInterviews(data as Interview[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [fbUser]);

  async function handleCancel(interviewId: string) {
    await cancelInterview(interviewId);
    setInterviews(prev => prev.map(i => i.id === interviewId ? { ...i, status: 'cancelled' } : i));
  }

  const filtered = interviews.filter(i => filter === 'all' || i.status === filter);

  const counts = interviews.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <Calendar className="h-5 w-5 text-cyan-400" />Interview Scheduler
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">Propose times, candidates confirm — no email chains.</p>
        </div>
        <button
          onClick={() => setShowPropose(true)}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
        >
          <Calendar className="h-4 w-4" />Schedule Interview
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'confirmed', 'completed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === s ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {s === 'all' ? `All (${interviews.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-16 text-center">
          <Calendar className="h-10 w-10 text-slate-600" />
          <p className="mt-3 text-sm text-slate-400">
            {interviews.length === 0 ? 'No interviews scheduled yet.' : 'No interviews match this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(interview => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              onCancel={handleCancel}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {showPropose && quickPropose && (
        <ProposeModal
          {...quickPropose}
          onClose={() => setShowPropose(false)}
          onSent={load}
        />
      )}
    </div>
  );
}

export default InterviewScheduler;
