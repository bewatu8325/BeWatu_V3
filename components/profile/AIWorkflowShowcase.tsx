/**
 * components/profile/AIWorkflowShowcase.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 1 — "Show your AI workflow as a deliverable"
 *
 * A persistent showcase on the Prove profile where a user publishes repeatable
 * AI workflows: the task, the tools, the step-by-step recipe (prompt / check /
 * human edit), and the outcome. Proves AI orchestration, not just AI usage.
 *
 * Matches platform design language: white rounded-2xl cards, #1a4a3a green,
 * stone palette, icon-in-rounded-square headers. Self-contained — manages its
 * own Firestore data, mirrors the SkillDNA / ExperienceSection pattern.
 *
 * Firestore: aiWorkflows/{id}  (owner write, public read)
 * Props mirror SkillDNA: profileUid, isOwn, currentUserUid
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

const GREEN = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

type StepType = 'prompt' | 'check' | 'edit';

interface WorkflowStep {
  type: StepType;
  content: string;
}

interface AIWorkflow {
  id: string;
  authorUid: string;
  title: string;
  task: string;
  tools: string[];
  steps: WorkflowStep[];
  outcome: string;
  createdAt?: any;
}

const STEP_META: Record<StepType, { label: string; color: string; bg: string; icon: string }> = {
  prompt: { label: 'Prompt',     color: '#1a6b52', bg: GREEN_LT,   icon: '›_' },
  check:  { label: 'Check',      color: '#b45309', bg: '#fef3c7',  icon: '✓'  },
  edit:   { label: 'Human edit', color: '#6d28d9', bg: '#ede9fe',  icon: '✎'  },
};

interface Props {
  profileUid: string;
  isOwn: boolean;
  currentUserUid?: string;
}

const AIWorkflowShowcase: React.FC<Props> = ({ profileUid, isOwn }) => {
  const [workflows, setWorkflows] = useState<AIWorkflow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing]     = useState<AIWorkflow | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);

  async function load() {
    try {
      const snap = await getDocs(query(
        collection(db, 'aiWorkflows'),
        where('authorUid', '==', profileUid),
        orderBy('createdAt', 'desc')
      ));
      setWorkflows(snap.docs.map(d => ({ id: d.id, ...d.data() } as AIWorkflow)));
    } catch {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [profileUid]);

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, 'aiWorkflows', id)).catch(() => {});
    setWorkflows(w => w.filter(x => x.id !== id));
  }

  if (loading) return null;
  // Hide entirely on others' profiles if empty — keeps non-owner profiles clean
  if (!isOwn && workflows.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: '#e7e5e4' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: GREEN }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-stone-900 text-sm">AI Workflows</h3>
            <p className="text-xs text-stone-400">How you orchestrate AI to do real work</p>
          </div>
        </div>
        {isOwn && (
          <button
            onClick={() => { setEditing(null); setEditorOpen(true); }}
            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Add
          </button>
        )}
      </div>

      {/* Empty state (own profile only) */}
      {workflows.length === 0 ? (
        <button
          onClick={() => { setEditing(null); setEditorOpen(true); }}
          className="w-full text-left rounded-xl border border-dashed p-4 hover:bg-stone-50 transition-colors"
          style={{ borderColor: '#d6d3d1' }}
        >
          <p className="text-sm font-medium text-stone-600">Publish your first AI workflow</p>
          <p className="text-xs text-stone-400 mt-1">
            e.g. "My 5-step system for AI-assisted competitive research." Employers pay a premium for people who orchestrate AI, not just use it.
          </p>
        </button>
      ) : (
        <div className="space-y-2.5">
          {workflows.map(wf => {
            const isExpanded = expanded === wf.id;
            return (
              <div key={wf.id} className="rounded-xl border overflow-hidden transition-all" style={{ borderColor: '#e7e5e4' }}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : wf.id)}
                  className="w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900">{wf.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{wf.task}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ backgroundColor: GREEN_LT, color: '#1a6b52' }}>
                        {wf.steps.length} steps
                      </span>
                      <svg className={`w-4 h-4 text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: '#f0efee' }}>
                    {/* Tools */}
                    {wf.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
                        {wf.tools.map((tool, i) => (
                          <span key={i} className="text-[11px] font-medium rounded-md px-2 py-0.5 bg-stone-100 text-stone-600">{tool}</span>
                        ))}
                      </div>
                    )}
                    {/* Steps */}
                    <ol className="space-y-2">
                      {wf.steps.map((step, i) => {
                        const meta = STEP_META[step.type];
                        return (
                          <li key={i} className="flex gap-2.5">
                            <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold mt-0.5" style={{ backgroundColor: meta.bg, color: meta.color }}>
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
                              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{step.content}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {/* Outcome */}
                    {wf.outcome && (
                      <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: GREEN_LT }}>
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#1a6b52' }}>Outcome</span>
                        <p className="text-sm text-stone-700 mt-0.5">{wf.outcome}</p>
                      </div>
                    )}
                    {/* Owner actions */}
                    {isOwn && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setEditing(wf); setEditorOpen(true); }} className="text-xs font-semibold text-stone-500 hover:text-stone-700">Edit</button>
                        <button onClick={() => handleDelete(wf.id)} className="text-xs font-semibold text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <WorkflowEditor
          existing={editing}
          authorUid={profileUid}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); setLoading(true); load(); }}
        />
      )}
    </div>
  );
};

// ─── Editor modal ─────────────────────────────────────────────────────────────

function WorkflowEditor({ existing, authorUid, onClose, onSaved }: {
  existing: AIWorkflow | null;
  authorUid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle]     = useState(existing?.title ?? '');
  const [task, setTask]       = useState(existing?.task ?? '');
  const [toolsStr, setToolsStr] = useState(existing?.tools?.join(', ') ?? '');
  const [steps, setSteps]     = useState<WorkflowStep[]>(existing?.steps ?? [{ type: 'prompt', content: '' }]);
  const [outcome, setOutcome] = useState(existing?.outcome ?? '');
  const [saving, setSaving]   = useState(false);

  function updateStep(i: number, patch: Partial<WorkflowStep>) {
    setSteps(s => s.map((step, idx) => idx === i ? { ...step, ...patch } : step));
  }
  function addStep() { setSteps(s => [...s, { type: 'prompt', content: '' }]); }
  function removeStep(i: number) { setSteps(s => s.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    if (!title.trim() || steps.every(s => !s.content.trim())) return;
    setSaving(true);
    const payload = {
      authorUid,
      title: title.trim(),
      task: task.trim(),
      tools: toolsStr.split(',').map(t => t.trim()).filter(Boolean),
      steps: steps.filter(s => s.content.trim()),
      outcome: outcome.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      if (existing) {
        await updateDoc(doc(db, 'aiWorkflows', existing.id), payload);
      } else {
        await addDoc(collection(db, 'aiWorkflows'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved();
    } catch (err) {
      console.error('save workflow failed', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#e7e5e4' }}>
          <h2 className="font-bold text-stone-900">{existing ? 'Edit workflow' : 'New AI workflow'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. "My 5-step system for AI-assisted competitive research"'
              className="w-full rounded-xl border bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
          </Field>

          <Field label="The task" hint="What real work does this workflow accomplish?">
            <input value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Researching 20 competitors in an afternoon instead of a week"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
          </Field>

          <Field label="Tools" hint="Comma-separated">
            <input value={toolsStr} onChange={e => setToolsStr(e.target.value)} placeholder="Claude, Perplexity, a spreadsheet"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
          </Field>

          {/* Steps */}
          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-2">The recipe</label>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="rounded-xl border p-2.5" style={{ borderColor: '#e7e5e4' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex gap-1">
                      {(['prompt', 'check', 'edit'] as StepType[]).map(t => (
                        <button key={t} onClick={() => updateStep(i, { type: t })}
                          className="text-[11px] font-semibold rounded-md px-2 py-0.5 transition-all"
                          style={step.type === t
                            ? { backgroundColor: STEP_META[t].bg, color: STEP_META[t].color }
                            : { backgroundColor: 'transparent', color: '#a8a29e' }}>
                          {STEP_META[t].label}
                        </button>
                      ))}
                    </div>
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(i)} className="text-stone-300 hover:text-red-500">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>
                  <textarea value={step.content} onChange={e => updateStep(i, { content: e.target.value })}
                    placeholder={step.type === 'prompt' ? 'The prompt you use…' : step.type === 'check' ? 'How you verify the output…' : 'The human judgment you apply…'}
                    rows={2}
                    className="w-full resize-none rounded-lg border bg-stone-50 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1" style={{ borderColor: '#f0efee' }} />
                </div>
              ))}
            </div>
            <button onClick={addStep} className="mt-2 text-xs font-semibold flex items-center gap-1" style={{ color: '#1a6b52' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Add step
            </button>
          </div>

          <Field label="Outcome" hint="The measurable result">
            <input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="e.g. Cut research time 80%; adopted by my whole team"
              className="w-full rounded-xl border bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: '#e7e5e4' }} />
          </Field>

          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
            style={{ backgroundColor: GREEN }}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Publish workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-stone-600 block mb-1.5">
        {label}{hint && <span className="font-normal text-stone-400 ml-1.5">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default AIWorkflowShowcase;
