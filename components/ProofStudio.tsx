/**
 * components/ProofStudio.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Two persistent proof artifacts for the Prove profile, in one tabbed section:
 *
 *   • Playbooks  — repeatable AI workflows (Feature 1)
 *   • Build Log  — persistent "what I built / what broke / next" (Feature 3)
 *
 * Drop into the Prove/Showcase view. Read-only for visitors; owner sees the
 * "+ New" affordance. Matches the platform design language: stone palette,
 * #1a4a3a brand green, rounded-2xl cards, lucide icons, no new nav.
 *
 * Mount:
 *   <ProofStudio
 *      profileUid={user.uid}
 *      isOwner={isCurrentUser}
 *      currentUser={currentUser}   // only needed when isOwner
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Wand2, BookOpen, Plus, X, Check, ThumbsUp, ExternalLink,
  Trash2, ChevronRight, Hammer, Sparkles,
} from 'lucide-react';
import {
  createPlaybook, getPlaybooksByAuthor, togglePlaybookHelpful, deletePlaybook,
  createBuildLog, getBuildLogsByAuthor, toggleBuildLogReaction, deleteBuildLog,
  type Playbook, type PlaybookStep, type BuildLog,
} from '../lib/proofArtifacts';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';
const AMBER    = '#d97706';
const AMBER_LT = '#fef3c7';
const BORDER   = '#e7e5e4';

function timeAgo(ts: any): string {
  const d = ts?.toDate?.() ?? (typeof ts === 'number' ? new Date(ts) : null);
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYBOOK — create form
// ═══════════════════════════════════════════════════════════════════════════════

function PlaybookComposer({ author, onClose, onCreated }: any) {
  const [title, setTitle]     = useState('');
  const [goal, setGoal]       = useState('');
  const [steps, setSteps]     = useState<PlaybookStep[]>([{ action: '', tool: '', humanCheck: '' }]);
  const [toolsRaw, setToolsRaw] = useState('');
  const [outcome, setOutcome] = useState('');
  const [saving, setSaving]   = useState(false);

  const updateStep = (i: number, field: keyof PlaybookStep, val: string) =>
    setSteps(s => s.map((step, idx) => idx === i ? { ...step, [field]: val } : step));
  const addStep    = () => setSteps(s => [...s, { action: '', tool: '', humanCheck: '' }]);
  const removeStep = (i: number) => setSteps(s => s.length > 1 ? s.filter((_, idx) => idx !== i) : s);

  const canSave = title.trim() && goal.trim() && steps.some(s => s.action.trim());

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await createPlaybook(author, {
        title, goal, steps,
        tools: toolsRaw.split(',').map(t => t.trim()).filter(Boolean),
        outcome,
      });
      onCreated();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ border: `1px solid ${BORDER}` }}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4" style={{ color: AMBER }} />
            <h2 className="font-bold text-stone-900 text-base">New Playbook</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-stone-100">
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-stone-500 -mt-1">
            Document a repeatable AI workflow — the steps, the tools, and the human checks that make it reliable.
            This is proof you orchestrate AI, not just use it.
          </p>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="My 5-step system for AI-assisted competitive research"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: BORDER }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">What it accomplishes</label>
            <input value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="Turn a vague market question into a sourced 1-page brief in under an hour"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: BORDER }} />
          </div>

          {/* Steps */}
          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">Steps</label>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="rounded-xl border p-3 relative" style={{ borderColor: BORDER, background: '#fafaf9' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold" style={{ color: GREEN }}>Step {i + 1}</span>
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(i)} className="text-stone-300 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input value={step.action} onChange={e => updateStep(i, 'action', e.target.value)}
                    placeholder="What you do"
                    className="w-full rounded-lg border bg-white px-2.5 py-2 text-sm mb-2 focus:outline-none focus:ring-1"
                    style={{ borderColor: BORDER }} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={step.tool} onChange={e => updateStep(i, 'tool', e.target.value)}
                      placeholder="Tool / prompt"
                      className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-1"
                      style={{ borderColor: BORDER }} />
                    <input value={step.humanCheck} onChange={e => updateStep(i, 'humanCheck', e.target.value)}
                      placeholder="Your human check"
                      className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-1"
                      style={{ borderColor: BORDER }} />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addStep} className="mt-2 flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: GREEN }}>
              <Plus className="w-3 h-3" /> Add step
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">Tools used <span className="font-normal text-stone-400">(comma-separated)</span></label>
            <input value={toolsRaw} onChange={e => setToolsRaw(e.target.value)}
              placeholder="Claude, Perplexity, a Python script"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: BORDER }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">Outcome <span className="font-normal text-stone-400">(optional)</span></label>
            <input value={outcome} onChange={e => setOutcome(e.target.value)}
              placeholder="Cut a 3-day task to 3 hours; adopted by my whole team"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: BORDER }} />
          </div>

          <button onClick={handleSave} disabled={saving || !canSave}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
            style={{ background: GREEN }}>
            {saving ? 'Publishing…' : 'Publish Playbook'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Playbook card ─────────────────────────────────────────────────────────────

function PlaybookCard({ pb, uid, isOwner, onChange }: { pb: Playbook; uid?: string; isOwner: boolean; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const helpful  = uid ? pb.helpfulByUids?.includes(uid) : false;
  const count    = pb.helpfulByUids?.length ?? 0;

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: BORDER }}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4 hover:bg-stone-50 transition-colors">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0" style={{ background: AMBER_LT }}>
            <Wand2 className="w-4 h-4" style={{ color: AMBER }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-stone-900 text-sm leading-snug">{pb.title}</p>
            <p className="text-xs text-stone-500 mt-0.5">{pb.goal}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: GREEN_LT, color: GREEN }}>
                {pb.steps.length} step{pb.steps.length !== 1 ? 's' : ''}
              </span>
              {pb.tools?.slice(0, 3).map((t, i) => (
                <span key={i} className="text-[10px] text-stone-500 px-2 py-0.5 rounded-full bg-stone-100">{t}</span>
              ))}
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-stone-300 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: BORDER }}>
          <ol className="mt-3 space-y-3">
            {pb.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white flex-shrink-0 mt-0.5" style={{ background: GREEN }}>{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm text-stone-800">{s.action}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    {s.tool && <span className="text-[11px] text-stone-500"><span className="font-semibold">Tool:</span> {s.tool}</span>}
                    {s.humanCheck && <span className="text-[11px] flex items-center gap-1" style={{ color: GREEN }}><Check className="w-3 h-3" /> {s.humanCheck}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {pb.outcome && (
            <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: GREEN_LT, color: GREEN }}>
              <span className="font-semibold">Outcome: </span>{pb.outcome}
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => uid && togglePlaybookHelpful(pb.id, uid).then(onChange)}
              disabled={!uid}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition"
              style={helpful ? { background: GREEN_LT, color: GREEN } : { color: '#78716c', background: '#f5f5f4' }}>
              <ThumbsUp className="w-3.5 h-3.5" /> Helpful{count > 0 ? ` · ${count}` : ''}
            </button>
            {isOwner && (
              <button onClick={() => { if (confirm('Delete this playbook?')) deletePlaybook(pb.id).then(onChange); }}
                className="text-stone-300 hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD LOG — create form
// ═══════════════════════════════════════════════════════════════════════════════

function BuildLogComposer({ author, onClose, onCreated }: any) {
  const [title, setTitle]   = useState('');
  const [built, setBuilt]   = useState('');
  const [broke, setBroke]   = useState('');
  const [next, setNext]     = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [link, setLink]     = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = built.trim();

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await createBuildLog(author, {
        title, built, broke, next,
        tags: tagsRaw.split(',').map(t => t.trim()).filter(Boolean),
        link,
      });
      onCreated();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ border: `1px solid ${BORDER}` }}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-2">
            <Hammer className="w-4 h-4" style={{ color: GREEN }} />
            <h2 className="font-bold text-stone-900 text-base">New Build Log entry</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-stone-100">
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-stone-500 -mt-1">
            A persistent entry in your build-in-public trail. Document what you made and what you learned —
            it compounds into a searchable record of your judgment.
          </p>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">Title <span className="font-normal text-stone-400">(optional)</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Week 3: shipped the restaurant finder"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ borderColor: BORDER }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">What I built</label>
            <textarea value={built} onChange={e => setBuilt(e.target.value)} rows={2}
              placeholder="Scored 200 local restaurants and built a finder with a live filter."
              className="w-full resize-none rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ borderColor: BORDER }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">What broke / what I learned <span className="font-normal text-stone-400">(optional)</span></label>
            <textarea value={broke} onChange={e => setBroke(e.target.value)} rows={2}
              placeholder="The geocoding API rate-limited me. Learned to batch and cache requests."
              className="w-full resize-none rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ borderColor: BORDER }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">What's next <span className="font-normal text-stone-400">(optional)</span></label>
            <input value={next} onChange={e => setNext(e.target.value)}
              placeholder="Add user reviews and a map view."
              className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ borderColor: BORDER }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1.5">Tags</label>
              <input value={tagsRaw} onChange={e => setTagsRaw(e.target.value)}
                placeholder="python, maps"
                className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ borderColor: BORDER }} />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1.5">Live link <span className="font-normal text-stone-400">(optional)</span></label>
              <input value={link} onChange={e => setLink(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ borderColor: BORDER }} />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !canSave}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
            style={{ background: GREEN }}>
            {saving ? 'Posting…' : 'Post to Build Log'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Build log entry ───────────────────────────────────────────────────────────

function BuildLogEntry({ log, uid, isOwner, onChange }: { log: BuildLog; uid?: string; isOwner: boolean; onChange: () => void }) {
  const inspired = uid ? log.reactions?.inspire?.includes(uid) : false;
  const count    = log.reactions?.inspire?.length ?? 0;

  return (
    <div className="rounded-2xl border bg-white p-4" style={{ borderColor: BORDER }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0" style={{ background: GREEN_LT }}>
            <Hammer className="w-3.5 h-3.5" style={{ color: GREEN }} />
          </div>
          {log.title
            ? <p className="font-semibold text-stone-900 text-sm">{log.title}</p>
            : <p className="text-xs text-stone-400">{timeAgo(log.createdAt)}</p>}
        </div>
        {log.title && <span className="text-[11px] text-stone-400">{timeAgo(log.createdAt)}</span>}
      </div>

      <div className="space-y-2 pl-9">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>Built</span>
          <p className="text-sm text-stone-800 mt-0.5">{log.built}</p>
        </div>
        {log.broke && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: AMBER }}>Broke / Learned</span>
            <p className="text-sm text-stone-700 mt-0.5">{log.broke}</p>
          </div>
        )}
        {log.next && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Next</span>
            <p className="text-sm text-stone-600 mt-0.5">{log.next}</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          {log.tags?.map((t, i) => (
            <span key={i} className="text-[10px] text-stone-500 px-2 py-0.5 rounded-full bg-stone-100">#{t}</span>
          ))}
          {log.link && (
            <a href={log.link} target="_blank" rel="noreferrer"
              className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{ color: GREEN }}>
              <ExternalLink className="w-3 h-3" /> Live
            </a>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button onClick={() => uid && toggleBuildLogReaction(log.id, uid, 'inspire').then(onChange)}
            disabled={!uid}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition"
            style={inspired ? { background: AMBER_LT, color: AMBER } : { color: '#78716c', background: '#f5f5f4' }}>
            <Sparkles className="w-3.5 h-3.5" /> Inspiring{count > 0 ? ` · ${count}` : ''}
          </button>
          {isOwner && (
            <button onClick={() => { if (confirm('Delete this entry?')) deleteBuildLog(log.id).then(onChange); }}
              className="text-stone-300 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN — tabbed section
// ═══════════════════════════════════════════════════════════════════════════════

interface ProofStudioProps {
  profileUid: string;
  isOwner:    boolean;
  currentUser?: any; // required when isOwner — supplies author fields
}

const ProofStudio: React.FC<ProofStudioProps> = ({ profileUid, isOwner, currentUser }) => {
  const [tab, setTab]             = useState<'playbooks' | 'buildlog'>('playbooks');
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [logs, setLogs]           = useState<BuildLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const [composer, setComposer]   = useState<null | 'playbook' | 'buildlog'>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pbs, bls] = await Promise.all([
      getPlaybooksByAuthor(profileUid),
      getBuildLogsByAuthor(profileUid),
    ]);
    setPlaybooks(pbs);
    setLogs(bls);
    setLoading(false);
  }, [profileUid]);

  useEffect(() => { load(); }, [load]);

  const author = currentUser ? {
    authorUid:      currentUser.uid ?? profileUid,
    authorId:       currentUser.id,
    authorName:     currentUser.name,
    authorAvatar:   currentUser.avatarUrl ?? '',
    authorHeadline: currentUser.headline ?? '',
  } : null;

  // Hide the whole section for visitors if there's nothing to show
  if (!isOwner && !loading && playbooks.length === 0 && logs.length === 0) return null;

  const tabs = [
    { id: 'playbooks' as const, label: 'Playbooks', icon: Wand2,  count: playbooks.length },
    { id: 'buildlog'  as const, label: 'Build Log', icon: Hammer, count: logs.length },
  ];

  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden" style={{ borderColor: BORDER }}>
      {/* Header + tab strip */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            {tabs.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full transition"
                  style={active ? { background: GREEN_LT, color: GREEN } : { color: '#78716c' }}>
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                  {t.count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: active ? GREEN : '#e7e5e4', color: active ? 'white' : '#78716c' }}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {isOwner && author && (
            <button onClick={() => setComposer(tab === 'playbooks' ? 'playbook' : 'buildlog')}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full text-white hover:opacity-90 transition"
              style={{ background: GREEN }}>
              <Plus className="w-3 h-3" /> New
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 pt-1 space-y-3">
        {loading ? (
          <p className="text-sm text-stone-400 text-center py-6">Loading…</p>
        ) : tab === 'playbooks' ? (
          playbooks.length === 0 ? (
            <EmptyState
              icon={Wand2}
              title="No playbooks yet"
              body={isOwner ? 'Publish a repeatable AI workflow to prove you orchestrate AI, not just use it.' : 'No AI workflows shared yet.'}
              cta={isOwner && author ? 'Create your first Playbook' : undefined}
              onCta={() => setComposer('playbook')}
            />
          ) : (
            playbooks.map(pb => (
              <PlaybookCard key={pb.id} pb={pb} uid={currentUser?.uid} isOwner={isOwner} onChange={load} />
            ))
          )
        ) : (
          logs.length === 0 ? (
            <EmptyState
              icon={Hammer}
              title="No build log entries yet"
              body={isOwner ? 'Document what you build week to week. It compounds into a searchable trail of your judgment.' : 'No build log entries yet.'}
              cta={isOwner && author ? 'Add your first entry' : undefined}
              onCta={() => setComposer('buildlog')}
            />
          ) : (
            logs.map(log => (
              <BuildLogEntry key={log.id} log={log} uid={currentUser?.uid} isOwner={isOwner} onChange={load} />
            ))
          )
        )}
      </div>

      {composer === 'playbook' && author && (
        <PlaybookComposer author={author} onClose={() => setComposer(null)} onCreated={load} />
      )}
      {composer === 'buildlog' && author && (
        <BuildLogComposer author={author} onClose={() => setComposer(null)} onCreated={load} />
      )}
    </div>
  );
};

function EmptyState({ icon: Icon, title, body, cta, onCta }: any) {
  return (
    <div className="text-center py-8 px-4">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl mb-3" style={{ background: '#f5f5f4' }}>
        <Icon className="w-5 h-5 text-stone-400" />
      </div>
      <p className="font-semibold text-stone-700 text-sm">{title}</p>
      <p className="text-xs text-stone-400 mt-1 max-w-xs mx-auto leading-relaxed">{body}</p>
      {cta && (
        <button onClick={onCta} className="mt-4 text-xs font-semibold px-4 py-2 rounded-xl text-white hover:opacity-90 transition" style={{ background: GREEN }}>
          {cta}
        </button>
      )}
    </div>
  );
}

export default ProofStudio;
