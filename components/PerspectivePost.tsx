/**
 * components/PerspectivePost.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A structured post type for cross-generational questions.
 * Users ask a question and tag which generation they want to hear from.
 * Others respond inline with their perspective.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { MessageCircle, ChevronDown, ChevronUp, Send, Users } from 'lucide-react';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

export type GenerationTag =
  | 'Gen Z (1997–2012)'
  | 'Millennials (1981–1996)'
  | 'Gen X (1965–1980)'
  | 'Boomers (1946–1964)'
  | 'Any generation';

export interface PerspectiveResponse {
  id:           string;
  authorId:     number;
  authorName:   string;
  authorAvatar?: string;
  authorGen:    GenerationTag;
  content:      string;
  createdAt:    Date;
  helpful:      number;
}

export interface PerspectivePostData {
  id:           string;
  authorId:     number;
  authorName:   string;
  authorAvatar?: string;
  question:     string;
  context:      string;
  seekingFrom:  GenerationTag[];
  responses:    PerspectiveResponse[];
  createdAt:    Date;
  _firestoreId?: string;
}

const GEN_COLOURS: Record<GenerationTag, { bg: string; text: string; border: string }> = {
  'Gen Z (1997–2012)':        { bg: '#ede9fe', text: '#4c1d95', border: '#ddd6fe' },
  'Millennials (1981–1996)':  { bg: '#dbeafe', text: '#1e3a8a', border: '#bfdbfe' },
  'Gen X (1965–1980)':        { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
  'Boomers (1946–1964)':      { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  'Any generation':           { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
};

function GenBadge({ gen }: { gen: GenerationTag }) {
  const c = GEN_COLOURS[gen];
  return (
    <span className="inline-flex items-center text-[11px] font-semibold rounded-full px-2.5 py-0.5"
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {gen}
    </span>
  );
}

function Avatar({ name, url, size = 8 }: { name: string; url?: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  if (url) return (
    <img src={url} alt={name}
      className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
  );
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
      style={{ backgroundColor: GREEN }}>
      {initials}
    </div>
  );
}

// ── Single perspective post card ──────────────────────────────────────────────

export const PerspectivePostCard: React.FC<{
  post:         PerspectivePostData;
  currentUser:  { id: number; name: string; avatarUrl?: string };
  onRespond:    (postId: string, content: string, gen: GenerationTag) => Promise<void>;
  onHelpful:    (postId: string, responseId: string) => void;
}> = ({ post, currentUser, onRespond, onHelpful }) => {
  const [expanded, setExpanded]       = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [response, setResponse]       = useState('');
  const [myGen, setMyGen]             = useState<GenerationTag>('Any generation');
  const [submitting, setSubmitting]   = useState(false);

  const handleSubmit = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    await onRespond(post.id, response.trim(), myGen);
    setResponse('');
    setShowForm(false);
    setExpanded(true);
    setSubmitting(false);
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e7e5e4' }}>

      {/* Header stripe */}
      <div className="px-5 py-3 flex items-center gap-2 border-b" style={{ backgroundColor: GREEN_LT, borderColor: '#c7e8d8' }}>
        <Users size={13} style={{ color: GREEN }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: GREEN }}>
          Perspective Post
        </span>
      </div>

      <div className="p-5">
        {/* Author */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={post.authorName} url={post.authorAvatar} size={9} />
          <div>
            <p className="font-semibold text-stone-900 text-sm">{post.authorName}</p>
            <p className="text-xs text-stone-400">
              {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>

        {/* Question */}
        <p className="text-stone-900 font-semibold text-base leading-snug mb-2">
          {post.question}
        </p>

        {/* Context */}
        {post.context && (
          <p className="text-stone-500 text-sm leading-relaxed mb-3">{post.context}</p>
        )}

        {/* Seeking from */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs text-stone-400 font-medium">Seeking perspectives from:</span>
          {post.seekingFrom.map(g => <GenBadge key={g} gen={g} />)}
        </div>

        {/* Response count + expand */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 text-sm font-semibold transition-colors mb-3"
          style={{ color: GREEN }}
        >
          <MessageCircle size={14} />
          {post.responses.length} perspective{post.responses.length !== 1 ? 's' : ''}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {/* Responses */}
        {expanded && post.responses.length > 0 && (
          <div className="space-y-3 mb-4 border-t pt-4" style={{ borderColor: '#f3f4f6' }}>
            {post.responses.map(r => (
              <div key={r.id} className="flex gap-3">
                <Avatar name={r.authorName} url={r.authorAvatar} size={7} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-stone-800">{r.authorName}</span>
                    <GenBadge gen={r.authorGen} />
                  </div>
                  <p className="text-sm text-stone-600 leading-relaxed">{r.content}</p>
                  <button
                    onClick={() => onHelpful(post.id, r.id)}
                    className="mt-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors flex items-center gap-1"
                  >
                    👍 Helpful · {r.helpful}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add perspective form */}
        {showForm ? (
          <div className="border rounded-xl p-4 space-y-3" style={{ borderColor: '#e7e5e4', backgroundColor: '#fafaf9' }}>
            <div>
              <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                Your generation
              </label>
              <select
                value={myGen}
                onChange={e => setMyGen(e.target.value as GenerationTag)}
                className="w-full px-3 py-2 rounded-lg border text-sm text-stone-800 bg-white focus:outline-none"
                style={{ borderColor: '#e7e5e4' }}
              >
                {Object.keys(GEN_COLOURS).map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              placeholder="Share your perspective from your career experience..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm text-stone-800 bg-white focus:outline-none resize-none placeholder:text-stone-400"
              style={{ borderColor: '#e7e5e4' }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setResponse(''); }}
                className="flex-1 py-2 text-sm text-stone-600 border rounded-lg hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#e7e5e4' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !response.trim()}
                className="flex-1 py-2 text-sm font-bold text-white rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                <Send size={13} />
                {submitting ? 'Posting…' : 'Share perspective'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-2 text-sm font-semibold rounded-xl border transition-colors hover:opacity-80"
            style={{ backgroundColor: GREEN_LT, color: GREEN, borderColor: '#c7e8d8' }}
          >
            + Share your perspective
          </button>
        )}
      </div>
    </div>
  );
};

// ── Create perspective post form ──────────────────────────────────────────────

export const CreatePerspectivePost: React.FC<{
  onSubmit: (question: string, context: string, seekingFrom: GenerationTag[]) => Promise<void>;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => {
  const [question, setQuestion]       = useState('');
  const [context, setContext]         = useState('');
  const [seeking, setSeeking]         = useState<GenerationTag[]>(['Any generation']);
  const [submitting, setSubmitting]   = useState(false);

  const GENS = Object.keys(GEN_COLOURS) as GenerationTag[];

  const toggleGen = (g: GenerationTag) => {
    if (g === 'Any generation') { setSeeking(['Any generation']); return; }
    setSeeking(prev => {
      const filtered = prev.filter(x => x !== 'Any generation');
      return filtered.includes(g) ? filtered.filter(x => x !== g) || ['Any generation'] : [...filtered, g];
    });
  };

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setSubmitting(true);
    await onSubmit(question.trim(), context.trim(), seeking.length ? seeking : ['Any generation']);
    setSubmitting(false);
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: GREEN }} />
        <h3 className="font-bold text-stone-900 text-sm">Ask for perspectives</h3>
      </div>

      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
          Your question
        </label>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="e.g. How did you navigate your first big career pivot? What do you wish you'd known?"
          rows={2}
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none placeholder:text-stone-400 resize-none"
          style={{ borderColor: '#e7e5e4' }}
        />
      </div>

      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
          Context (optional)
        </label>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="Give people context so they can give you a more useful answer..."
          rows={2}
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm text-stone-900 focus:outline-none placeholder:text-stone-400 resize-none"
          style={{ borderColor: '#e7e5e4' }}
        />
      </div>

      <div>
        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">
          Seeking perspectives from
        </label>
        <div className="flex flex-wrap gap-2">
          {GENS.map(g => {
            const selected = seeking.includes(g);
            const c = GEN_COLOURS[g];
            return (
              <button key={g} onClick={() => toggleGen(g)}
                className="text-xs font-semibold rounded-full px-3 py-1 border transition-all"
                style={selected
                  ? { backgroundColor: c.bg, color: c.text, borderColor: c.border }
                  : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }
                }>
                {g}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 text-sm text-stone-600 border rounded-xl hover:bg-stone-50 transition-colors font-semibold"
          style={{ borderColor: '#e7e5e4' }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={submitting || !question.trim()}
          className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: GREEN }}>
          {submitting ? 'Posting…' : 'Post question'}
        </button>
      </div>
    </div>
  );
};

export default PerspectivePostCard;
