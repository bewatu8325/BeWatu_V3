import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Plus, Edit2, Trash2, Send, X,
  Loader2, Copy, Check, ChevronDown, Sparkles,
} from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  fetchOutreachTemplates,
  saveOutreachTemplate,
  deleteOutreachTemplate,
} from '../../lib/firestoreService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'invite' | 'rejection' | 'offer' | 'follow_up' | 'custom';
  usageCount: number;
  createdAt: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'invite',     label: 'Interview Invite', color: 'text-[#1a6b52]',   bg: 'bg-[#e8f4f0] border-[#1a4a3a]/20'   },
  { value: 'rejection',  label: 'Rejection',        color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20'     },
  { value: 'offer',      label: 'Job Offer',        color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  { value: 'follow_up',  label: 'Follow-up',        color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  { value: 'custom',     label: 'Custom',           color: 'text-stone-500',  bg: 'bg-stone-300/10 border-stone-300/20' },
] as const;

const STARTER_TEMPLATES: Omit<OutreachTemplate, 'id' | 'usageCount' | 'createdAt'>[] = [
  {
    name: 'Interview Invite',
    category: 'invite',
    subject: "We'd love to meet you — {jobTitle} at {company}",
    body: `Hi {candidateName},

Your profile stood out to us for the {jobTitle} role at {company}. We were particularly impressed by {specificDetail}.

We'd love to set up a {duration} conversation to learn more about your experience and share details about the role.

I'll send over a few time options separately — feel free to pick whichever works best.

Looking forward to connecting,
{recruiterName}`,
  },
  {
    name: 'Not Moving Forward',
    category: 'rejection',
    subject: 'Your application for {jobTitle} at {company}',
    body: `Hi {candidateName},

Thank you for taking the time to apply for the {jobTitle} position at {company} and for the conversations we've had.

After careful consideration, we've decided to move forward with another candidate whose experience more closely aligns with where we are right now.

This was a difficult decision — your {specificStrength} really stood out. We'll keep your profile on file and reach out if something better-suited comes up.

Wishing you every success in your search.

{recruiterName}`,
  },
  {
    name: 'Offer Letter Intro',
    category: 'offer',
    subject: "We'd like to make you an offer — {jobTitle}",
    body: `Hi {candidateName},

I'm thrilled to reach out with some great news — we'd like to offer you the {jobTitle} position at {company}!

I'll be sending the formal offer letter shortly with all the details including compensation, start date, and next steps.

If you have any questions before then, please don't hesitate to reach out. We're very excited about the possibility of you joining the team.

{recruiterName}`,
  },
  {
    name: 'Following Up',
    category: 'follow_up',
    subject: "Following up — {jobTitle} at {company}",
    body: `Hi {candidateName},

I wanted to follow up on my previous message regarding the {jobTitle} opportunity at {company}.

I understand you're likely weighing multiple options, and I respect that. I just wanted to make sure this didn't slip through the cracks and reiterate our genuine interest in your profile.

Happy to answer any questions you might have — just reply here or we can jump on a quick call.

{recruiterName}`,
  },
];

// Template variables for reference
const VARIABLES = ['{candidateName}', '{jobTitle}', '{company}', '{recruiterName}', '{specificDetail}', '{duration}', '{specificStrength}'];

// ─── Template Editor ──────────────────────────────────────────────────────────

function TemplateEditor({
  template,
  onSave,
  onClose,
}: {
  template?: OutreachTemplate;
  onSave: (t: Omit<OutreachTemplate, 'id' | 'usageCount' | 'createdAt'>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [category, setCategory] = useState<OutreachTemplate['category']>(template?.category ?? 'custom');
  const [saving, setSaving] = useState(false);

  function insertVariable(v: string) {
    setBody(b => b + v);
  }

  async function handleSave() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), subject: subject.trim(), body: body.trim(), category });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-stone-900">{template ? 'Edit Template' : 'New Template'}</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs font-medium text-stone-500 mb-1 block">Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Senior Invite"
              className="w-full rounded-lg border bg-white  px-3 py-2 text-sm text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as OutreachTemplate['category'])}
              className="w-full rounded-lg border bg-white  px-3 py-2 text-sm text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500 mb-1 block">Subject Line</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject..."
            className="w-full rounded-lg border bg-white  px-3 py-2 text-sm text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-stone-500">Message Body</label>
            <div className="flex gap-1 flex-wrap justify-end">
              {VARIABLES.map(v => (
                <button key={v} onClick={() => insertVariable(v)}
                  className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-700 hover:bg-stone-200 transition-colors">
                  {v}
                </button>
              ))}
            </div>
          </div>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
            className="w-full resize-none rounded-lg border bg-white  px-3 py-2 text-sm text-stone-800 font-mono focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }} />
          <p className="mt-1 text-xs text-stone-500">Use variables like {'{candidateName}'} — they'll be highlighted when you use the template.</p>
        </div>

        <button onClick={handleSave} disabled={saving || !name.trim() || !body.trim()}
          className="w-full rounded-lg bg-[#1a4a3a] py-2.5 text-sm font-semibold text-white hover:bg-[#1a4a3a] disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save Template'}
        </button>
      </div>
    </div>
  );
}

// ─── Send Modal ───────────────────────────────────────────────────────────────

function SendModal({
  template,
  defaultVars,
  onClose,
}: {
  template: OutreachTemplate;
  defaultVars?: Record<string, string>;
  onClose: () => void;
}) {
  const [vars, setVars] = useState<Record<string, string>>(defaultVars ?? {});
  const [copied, setCopied] = useState(false);

  function fill(text: string) {
    return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
  }

  const filledSubject = fill(template.subject);
  const filledBody = fill(template.body);

  const usedVars = Array.from(new Set([...template.subject.matchAll(/\{(\w+)\}/g), ...template.body.matchAll(/\{(\w+)\}/g)].map(m => m[1])));

  function copyAll() {
    navigator.clipboard.writeText(`Subject: ${filledSubject}\n\n${filledBody}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-stone-900">Use Template: {template.name}</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800"><X className="h-5 w-5" /></button>
        </div>

        {usedVars.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-stone-500">Fill in the variables</p>
            <div className="grid grid-cols-2 gap-2">
              {usedVars.map(v => (
                <div key={v}>
                  <label className="text-xs text-stone-500 mb-0.5 block">{'{' + v + '}'}</label>
                  <input
                    value={vars[v] ?? ''}
                    onChange={e => setVars(prev => ({ ...prev, [v]: e.target.value }))}
                    placeholder={v}
                    className="w-full rounded-lg border bg-white  px-2 py-1.5 text-xs text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-white  p-4 space-y-2" style={{ borderColor:"#e7e5e4" }}>
          <div className="text-xs">
            <span className="font-semibold text-stone-500">Subject: </span>
            <span className="text-stone-800">{filledSubject}</span>
          </div>
          <div className="h-px bg-stone-100" />
          <pre className="whitespace-pre-wrap text-xs text-stone-700 font-sans leading-relaxed">{filledBody}</pre>
        </div>

        <div className="flex gap-2">
          <button onClick={copyAll}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1a4a3a] py-2.5 text-sm font-semibold text-white hover:bg-[#1a4a3a] transition-colors">
            {copied ? <><Check className="h-4 w-4" />Copied!</> : <><Copy className="h-4 w-4" />Copy Message</>}
          </button>
          <a href={`mailto:?subject=${encodeURIComponent(filledSubject)}&body=${encodeURIComponent(filledBody)}`}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-800 hover:bg-white transition-colors">
            <Send className="h-4 w-4" />Open in Mail
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onUse,
}: {
  template: OutreachTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onUse: () => void;
}) {
  const cat = CATEGORIES.find(c => c.value === template.category)!;

  return (
    <div className="rounded-xl border bg-white  p-4 flex flex-col gap-3 hover:border-stone-200 transition-colors" style={{ borderColor:"#e7e5e4" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900 truncate">{template.name}</p>
          <p className="text-xs text-stone-500 truncate mt-0.5">{template.subject}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cat.bg} ${cat.color}`}>
          {cat.label}
        </span>
      </div>
      <p className="text-xs text-stone-500 line-clamp-2 font-mono">{template.body.split('\n')[0]}</p>
      <div className="flex items-center justify-between pt-1 border-t border-stone-200">
        <span className="text-[10px] text-stone-500">Used {template.usageCount} times</span>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-stone-500 hover:bg-red-900/20 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
          <button onClick={onUse} className="flex items-center gap-1 rounded-lg bg-[#1a4a3a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1a4a3a] transition-colors">
            <Send className="h-3 w-3" />Use
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OutreachTemplates() {
  const { fbUser } = useFirebase();
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<OutreachTemplate | undefined>();
  const [using, setUsing] = useState<OutreachTemplate | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<OutreachTemplate['category'] | 'all'>('all');
  const [seeded, setSeeded] = useState(false);

  async function load() {
    if (!fbUser) return;
    setLoading(true);
    try {
      const data = await fetchOutreachTemplates(fbUser.uid);
      if (data.length === 0 && !seeded) {
        // Seed with starter templates on first visit
        await Promise.all(STARTER_TEMPLATES.map(t => saveOutreachTemplate(fbUser.uid, t)));
        const fresh = await fetchOutreachTemplates(fbUser.uid);
        setTemplates(fresh as OutreachTemplate[]);
        setSeeded(true);
      } else {
        setTemplates(data as OutreachTemplate[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [fbUser]);

  async function handleSave(t: Omit<OutreachTemplate, 'id' | 'usageCount' | 'createdAt'>) {
    if (!fbUser) return;
    await saveOutreachTemplate(fbUser.uid, t, editing?.id);
    await load();
  }

  async function handleDelete(id: string) {
    if (!fbUser || !window.confirm('Delete this template?')) return;
    await deleteOutreachTemplate(fbUser.uid, id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  const filtered = templates.filter(t => categoryFilter === 'all' || t.category === categoryFilter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-stone-900">
            <MessageSquare className="h-5 w-5 text-[#1a6b52]" />Outreach Templates
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">Fill in variables and send in one click — no drafting from scratch.</p>
        </div>
        <button onClick={() => { setEditing(undefined); setShowEditor(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-[#1a4a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a4a3a] transition-colors">
          <Plus className="h-4 w-4" />New Template
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setCategoryFilter('all')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${categoryFilter === 'all' ? 'bg-[#1a4a3a] text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
          All ({templates.length})
        </button>
        {CATEGORIES.map(c => {
          const count = templates.filter(t => t.category === c.value).length;
          return (
            <button key={c.value} onClick={() => setCategoryFilter(c.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${categoryFilter === c.value ? `border ${c.bg} ${c.color}` : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-stone-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 py-16 text-center">
          <MessageSquare className="h-10 w-10 text-stone-400" />
          <p className="mt-3 text-sm text-stone-500">No templates yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => { setEditing(t); setShowEditor(true); }}
              onDelete={() => handleDelete(t.id)}
              onUse={() => setUsing(t)}
            />
          ))}
        </div>
      )}

      {showEditor && (
        <TemplateEditor
          template={editing}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditing(undefined); }}
        />
      )}

      {using && (
        <SendModal
          template={using}
          onClose={() => setUsing(undefined)}
        />
      )}
    </div>
  );
}

export default OutreachTemplates;
