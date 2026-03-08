/**
 * components/IdeaNetwork.tsx
 *
 * Sprint 2 — Idea Network
 *
 * Can be used two ways:
 *   1. Inside CircleDetail — pass podId to scope ideas to that pod
 *   2. As a standalone global Ideas feed — omit podId
 *
 * Features:
 *   - Create idea with domain tag and structured body
 *   - Spark ideas (auto-advances stage at 5 and 15 sparks)
 *   - Inline comments
 *   - Fork an idea
 *   - Arena pipeline CTA when stage reaches arena_ready
 *   - Domain filter tabs
 *   - Stage badges (Seed / Developing / Arena Ready / In Progress / Shipped)
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Idea, IdeaDomain, IdeaComment, User } from '../types';
import {
  createIdea,
  sparkIdea,
  forkIdea,
  addIdeaComment,
  getIdeaComments,
  subscribeToPodIdeas,
  getIdeasFeed,
  getIdeasByDomain,
} from '../lib/firestoreService';

// ─── Design tokens ────────────────────────────────────────────────────────────
const G    = '#1a4a3a';
const GM   = '#1a6b52';
const GLT  = '#e8f4f0';
const BDR  = '#e7e5e4';
const TXT  = '#1c1917';
const MUT  = '#78716c';
const SURF = '#ffffff';

// ─── Domain config ────────────────────────────────────────────────────────────
const DOMAINS: { value: IdeaDomain; label: string; color: string; bg: string }[] = [
  { value: 'Frontend',   label: 'Frontend',   color: '#6366f1', bg: '#eef2ff' },
  { value: 'Backend',    label: 'Backend',    color: '#0ea5e9', bg: '#e0f2fe' },
  { value: 'Data',       label: 'Data',       color: '#f59e0b', bg: '#fef3c7' },
  { value: 'Design',     label: 'Design',     color: '#ec4899', bg: '#fdf2f8' },
  { value: 'DevOps',     label: 'DevOps',     color: '#14b8a6', bg: '#f0fdfa' },
  { value: 'Product',    label: 'Product',    color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'AI/ML',      label: 'AI/ML',      color: '#f97316', bg: '#fff7ed' },
  { value: 'Leadership', label: 'Leadership', color: G,         bg: GLT       },
  { value: 'Other',      label: 'Other',      color: '#94a3b8', bg: '#f8fafc' },
];

function domainCfg(d: IdeaDomain) {
  return DOMAINS.find(x => x.value === d) ?? DOMAINS[DOMAINS.length - 1];
}

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  seed:        { label: 'Seed',        color: '#78716c', bg: '#f5f5f4', border: BDR       },
  developing:  { label: 'Developing',  color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd' },
  arena_ready: { label: 'Arena Ready', color: G,         bg: GLT,       border: '#b6ddd2' },
  in_progress: { label: 'In Progress', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
  shipped:     { label: 'Shipped',     color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  archived:    { label: 'Archived',    color: '#a8a29e', bg: '#fafaf9', border: BDR       },
};

// ─── Tiny inline icons ────────────────────────────────────────────────────────
const Zap = ({ filled, size = 14 }: { filled?: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const ChatBubble = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const Fork = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/>
    <path d="M6 8v2a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8M12 14v4"/>
  </svg>
);
const ArenaIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const ChevDown = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);
const Loader = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    className="animate-spin" style={{ animation: 'spin 1s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60)    return 'just now';
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE IDEA FORM
// ─────────────────────────────────────────────────────────────────────────────
interface CreateIdeaFormProps {
  currentUser: User;
  podId?: number;
  onCreated: (idea: Idea) => void;
}

const CreateIdeaForm: React.FC<CreateIdeaFormProps> = ({ currentUser, podId, onCreated }) => {
  const [open,    setOpen]    = useState(false);
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [domain,  setDomain]  = useState<IdeaDomain>('Product');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const uid    = (currentUser as any)._firestoreUid ?? String(currentUser.id);
  const avatar = (currentUser as any).photoURL ?? currentUser.avatarUrl ?? '';

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Give your idea a title.'); return; }
    if (body.trim().length < 20) { setError('Add at least 20 characters describing the problem.'); return; }
    setSaving(true); setError('');
    try {
      const id = await createIdea({
        authorUid:    uid,
        authorName:   currentUser.name,
        authorAvatar: avatar,
        title:        title.trim(),
        body:         body.trim(),
        domain,
        podId,
      });
      const newIdea: Idea = {
        id, authorUid: uid, authorName: currentUser.name, authorAvatar: avatar,
        title: title.trim(), body: body.trim(), domain, podId,
        stage: 'seed', sparkCount: 0, sparkedByUids: [], commentCount: 0, forkCount: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      onCreated(newIdea);
      setTitle(''); setBody(''); setOpen(false);
    } catch (e: any) {
      setError(e.message ?? 'Failed to post idea.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: SURF, border: `1px solid ${BDR}`, borderRadius: 16,
          padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = GM; e.currentTarget.style.background = GLT; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = BDR; e.currentTarget.style.background = SURF; }}
      >
        <img src={avatar || `https://picsum.photos/seed/${uid}/40`} alt=""
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        <span style={{ fontSize: 14, color: '#a8a29e' }}>Post a problem worth solving…</span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: G, background: GLT, padding: '4px 10px',
          borderRadius: 99, border: `1px solid ${GM}`, flexShrink: 0,
        }}>Idea</span>
      </button>
    );
  }

  return (
    <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: TXT }}>Post an Idea</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT, fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {/* Domain selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {DOMAINS.map(d => (
          <button key={d.value} onClick={() => setDomain(d.value)} style={{
            padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1.5px solid ${domain === d.value ? d.color : BDR}`,
            background: domain === d.value ? d.bg : '#fafaf9',
            color: domain === d.value ? d.color : MUT,
            transition: 'all 0.12s',
          }}>{d.label}</button>
        ))}
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="What's the problem worth solving?"
        maxLength={120}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 14px',
          border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 14, fontWeight: 600,
          color: TXT, outline: 'none', marginBottom: 10, fontFamily: 'inherit',
          background: '#fafaf9',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = GM; e.currentTarget.style.background = SURF; }}
        onBlur={e => { e.currentTarget.style.borderColor = BDR; e.currentTarget.style.background = '#fafaf9'; }}
      />

      {/* Body */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Describe the problem, context, and why it matters. What would a good solution look like?"
        rows={4}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 14px',
          border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, color: TXT,
          outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
          background: '#fafaf9', marginBottom: 12,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = GM; e.currentTarget.style.background = SURF; }}
        onBlur={e => { e.currentTarget.style.borderColor = BDR; e.currentTarget.style.background = '#fafaf9'; }}
      />

      {error && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => setOpen(false)} style={{
          padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          border: `1px solid ${BDR}`, background: SURF, color: MUT, cursor: 'pointer',
        }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving} style={{
          padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: saving ? '#a8a29e' : G, color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {saving && <Loader />}
          {saving ? 'Posting…' : 'Post Idea'}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// IDEA CARD
// ─────────────────────────────────────────────────────────────────────────────
interface IdeaCardProps {
  idea: Idea;
  currentUserUid: string;
  currentUser: User;
  onSpark: (id: string) => void;
  onForkClick: (idea: Idea) => void;
  onArenaClick: (idea: Idea) => void;
}

const IdeaCard: React.FC<IdeaCardProps> = ({
  idea, currentUserUid, currentUser, onSpark, onForkClick, onArenaClick,
}) => {
  const [comments,        setComments]        = useState<IdeaComment[]>([]);
  const [showComments,    setShowComments]     = useState(false);
  const [loadingComments, setLoadingComments]  = useState(false);
  const [commentDraft,    setCommentDraft]     = useState('');
  const [postingComment,  setPostingComment]   = useState(false);

  const isSparked = idea.sparkedByUids?.includes(currentUserUid);
  const stage     = STAGE_CFG[idea.stage] ?? STAGE_CFG.seed;
  const domain    = domainCfg(idea.domain);

  const loadComments = useCallback(async () => {
    if (!idea.id) return;
    setLoadingComments(true);
    try {
      const c = await getIdeaComments(idea.id);
      setComments(c);
    } finally {
      setLoadingComments(false);
    }
  }, [idea.id]);

  const toggleComments = async () => {
    if (!showComments && comments.length === 0) await loadComments();
    setShowComments(v => !v);
  };

  const submitComment = async () => {
    if (!commentDraft.trim() || !idea.id) return;
    setPostingComment(true);
    const uid    = (currentUser as any)._firestoreUid ?? String(currentUser.id);
    const avatar = (currentUser as any).photoURL ?? currentUser.avatarUrl ?? '';
    try {
      await addIdeaComment(idea.id, {
        authorUid:    uid,
        authorName:   currentUser.name,
        authorAvatar: avatar,
        body:         commentDraft.trim(),
      });
      setComments(prev => [...prev, {
        id: Date.now().toString(),
        authorUid: uid, authorName: currentUser.name, authorAvatar: avatar,
        body: commentDraft.trim(), createdAt: new Date().toISOString(),
      }]);
      setCommentDraft('');
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div style={{
      background: SURF, border: `1px solid ${BDR}`, borderRadius: 16,
      overflow: 'hidden', transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Arena Ready banner */}
      {idea.stage === 'arena_ready' && (
        <div style={{
          background: `linear-gradient(90deg, ${G}, ${GM})`,
          padding: '8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArenaIcon size={14} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
              This idea is ready for a Live Arena
            </span>
          </div>
          <button
            onClick={() => onArenaClick(idea)}
            style={{
              padding: '4px 14px', borderRadius: 99, fontSize: 11, fontWeight: 700,
              background: '#fff', color: G, border: 'none', cursor: 'pointer',
            }}
          >
            Launch Arena →
          </button>
        </div>
      )}

      <div style={{ padding: '18px 20px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <img
            src={idea.authorAvatar || `https://picsum.photos/seed/${idea.authorUid}/40`}
            alt={idea.authorName}
            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TXT }}>{idea.authorName}</span>
              <span style={{ fontSize: 11, color: MUT }}>{timeAgo(idea.createdAt)}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {/* Domain tag */}
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 99, background: domain.bg, color: domain.color,
              }}>{domain.label}</span>
              {/* Stage badge */}
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 99,
                background: stage.bg, color: stage.color, border: `1px solid ${stage.border}`,
              }}>{stage.label}</span>
              {/* Fork indicator */}
              {idea.parentIdeaId && (
                <span style={{ fontSize: 10, color: MUT, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Fork size={10} /> forked
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: TXT, lineHeight: 1.4 }}>
          {idea.title}
        </h3>

        {/* Body */}
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#44403c', lineHeight: 1.65 }}>
          {idea.body}
        </p>

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 12, borderTop: `1px solid ${BDR}` }}>
          {/* Spark */}
          <button
            onClick={() => onSpark(idea.id!)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 99, border: `1.5px solid ${isSparked ? G : BDR}`,
              background: isSparked ? GLT : 'transparent', cursor: 'pointer',
              color: isSparked ? G : MUT, fontWeight: 700, fontSize: 12,
              transition: 'all 0.12s',
            }}
          >
            <Zap filled={isSparked} size={13} />
            <span>{idea.sparkCount ?? 0}</span>
          </button>

          {/* Comments */}
          <button
            onClick={toggleComments}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 99, border: `1.5px solid ${BDR}`,
              background: 'transparent', cursor: 'pointer', color: MUT, fontSize: 12, fontWeight: 600,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = GM; e.currentTarget.style.color = G; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BDR; e.currentTarget.style.color = MUT; }}
          >
            <ChatBubble size={13} />
            <span>{idea.commentCount ?? 0}</span>
            <ChevDown />
          </button>

          {/* Fork */}
          <button
            onClick={() => onForkClick(idea)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 99, border: `1.5px solid ${BDR}`,
              background: 'transparent', cursor: 'pointer', color: MUT, fontSize: 12, fontWeight: 600,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = GM; e.currentTarget.style.color = G; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BDR; e.currentTarget.style.color = MUT; }}
          >
            <Fork size={13} />
            <span>{idea.forkCount > 0 ? idea.forkCount : 'Fork'}</span>
          </button>

          {/* Spark progress bar (shows for non-seed ideas) */}
          {idea.stage !== 'seed' && idea.sparkCount < 15 && (
            <div style={{ flex: 1, marginLeft: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: MUT }}>
                  {idea.stage === 'developing' ? `${15 - idea.sparkCount} sparks to Arena Ready` : ''}
                </span>
                <span style={{ fontSize: 10, color: G, fontWeight: 700 }}>{idea.sparkCount}/15</span>
              </div>
              <div style={{ height: 4, background: '#f5f5f4', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${Math.min((idea.sparkCount / 15) * 100, 100)}%`,
                  background: `linear-gradient(90deg, ${G}, ${GM})`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Comments section */}
        {showComments && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BDR}` }}>
            {loadingComments ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
                <Loader />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                {comments.length === 0 && (
                  <p style={{ fontSize: 12, color: MUT, textAlign: 'center', padding: '8px 0' }}>
                    No responses yet — be the first to think out loud.
                  </p>
                )}
                {comments.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <img
                      src={c.authorAvatar || `https://picsum.photos/seed/${c.authorUid}/32`}
                      alt={c.authorName}
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, background: '#f9f9f8', borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: TXT }}>{c.authorName}</span>
                        <span style={{ fontSize: 11, color: MUT }}>{timeAgo(c.createdAt)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#44403c', lineHeight: 1.5 }}>{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                placeholder="Add your thinking…"
                rows={2}
                style={{
                  flex: 1, padding: '8px 12px', border: `1px solid ${BDR}`, borderRadius: 10,
                  fontSize: 13, color: TXT, resize: 'none', outline: 'none', fontFamily: 'inherit',
                  lineHeight: 1.5, background: '#fafaf9',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = GM; e.currentTarget.style.background = SURF; }}
                onBlur={e => { e.currentTarget.style.borderColor = BDR; e.currentTarget.style.background = '#fafaf9'; }}
              />
              <button
                onClick={submitComment}
                disabled={postingComment || !commentDraft.trim()}
                style={{
                  padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: commentDraft.trim() ? G : '#e7e5e4',
                  color: commentDraft.trim() ? '#fff' : MUT,
                  border: 'none', cursor: commentDraft.trim() ? 'pointer' : 'default',
                }}
              >
                {postingComment ? '…' : 'Reply'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FORK MODAL
// ─────────────────────────────────────────────────────────────────────────────
interface ForkModalProps {
  parent: Idea;
  currentUser: User;
  podId?: number;
  onCreated: (idea: Idea) => void;
  onClose: () => void;
}

const ForkModal: React.FC<ForkModalProps> = ({ parent, currentUser, podId, onCreated, onClose }) => {
  const [title,  setTitle]  = useState(`Fork: ${parent.title}`);
  const [body,   setBody]   = useState('');
  const [domain, setDomain] = useState<IdeaDomain>(parent.domain);
  const [saving, setSaving] = useState(false);

  const uid    = (currentUser as any)._firestoreUid ?? String(currentUser.id);
  const avatar = (currentUser as any).photoURL ?? currentUser.avatarUrl ?? '';

  const handleSubmit = async () => {
    if (!title.trim() || body.trim().length < 20) return;
    setSaving(true);
    try {
      const id = await forkIdea(parent.id!, {
        authorUid: uid, authorName: currentUser.name, authorAvatar: avatar,
        title: title.trim(), body: body.trim(), domain, podId,
      });
      onCreated({
        id, authorUid: uid, authorName: currentUser.name, authorAvatar: avatar,
        title: title.trim(), body: body.trim(), domain, podId,
        parentIdeaId: parent.id, stage: 'seed',
        sparkCount: 0, sparkedByUids: [], commentCount: 0, forkCount: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: SURF, borderRadius: 20, padding: 28, maxWidth: 520, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: TXT }}>Fork this Idea</h3>
          <p style={{ margin: 0, fontSize: 12, color: MUT }}>
            Take it in a different direction from <strong>{parent.title}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {DOMAINS.map(d => (
            <button key={d.value} onClick={() => setDomain(d.value)} style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${domain === d.value ? d.color : BDR}`,
              background: domain === d.value ? d.bg : '#fafaf9',
              color: domain === d.value ? d.color : MUT,
            }}>{d.label}</button>
          ))}
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: TXT, marginBottom: 10, fontFamily: 'inherit', outline: 'none', background: '#fafaf9' }} />
        <textarea value={body} onChange={e => setBody(e.target.value)}
          placeholder="What's your different take? What angle are you exploring?"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, color: TXT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', background: '#fafaf9', marginBottom: 16 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${BDR}`, background: SURF, color: MUT, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || body.trim().length < 20} style={{ padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: body.trim().length >= 20 ? G : '#e7e5e4', color: body.trim().length >= 20 ? '#fff' : MUT, border: 'none', cursor: body.trim().length >= 20 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader />}
            {saving ? 'Forking…' : 'Fork Idea'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: IDEA NETWORK
// ─────────────────────────────────────────────────────────────────────────────

export interface IdeaNetworkProps {
  currentUser: User;
  podId?: number;           // if inside a Pod, scope ideas to that Pod
  onArenaLaunch?: (idea: Idea) => void;  // callback when user clicks Launch Arena
}

const IdeaNetwork: React.FC<IdeaNetworkProps> = ({ currentUser, podId, onArenaLaunch }) => {
  const [ideas,          setIdeas]          = useState<Idea[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [domainFilter,   setDomainFilter]   = useState<IdeaDomain | 'all'>('all');
  const [stageFilter,    setStageFilter]    = useState<'all' | 'arena_ready' | 'developing'>('all');
  const [forkTarget,     setForkTarget]     = useState<Idea | null>(null);

  const currentUserUid = (currentUser as any)._firestoreUid ?? String(currentUser.id);

  // ── Load / subscribe ────────────────────────────────────────────────────────
  useEffect(() => {
    if (podId !== undefined) {
      // Real-time subscription for pod ideas
      setLoading(true);
      const unsub = subscribeToPodIdeas(podId, (data) => {
        setIdeas(data);
        setLoading(false);
      });
      return unsub;
    } else {
      // One-time load for global feed
      setLoading(true);
      getIdeasFeed(40).then(data => { setIdeas(data); setLoading(false); });
    }
  }, [podId]);

  // ── Domain filter (global feed only) ────────────────────────────────────────
  useEffect(() => {
    if (podId !== undefined) return; // pod feed handles its own filtering
    if (domainFilter === 'all') {
      setLoading(true);
      getIdeasFeed(40).then(data => { setIdeas(data); setLoading(false); });
    } else {
      setLoading(true);
      getIdeasByDomain(domainFilter as IdeaDomain, 30).then(data => { setIdeas(data); setLoading(false); });
    }
  }, [domainFilter, podId]);

  // ── Spark handler (optimistic) ───────────────────────────────────────────────
  const handleSpark = useCallback(async (ideaId: string) => {
    setIdeas(prev => prev.map(idea => {
      if (idea.id !== ideaId) return idea;
      const alreadySparked = idea.sparkedByUids.includes(currentUserUid);
      const newCount = alreadySparked ? idea.sparkCount - 1 : idea.sparkCount + 1;
      const newUids  = alreadySparked
        ? idea.sparkedByUids.filter(u => u !== currentUserUid)
        : [...idea.sparkedByUids, currentUserUid];
      let newStage = idea.stage;
      if (!alreadySparked) {
        if (newStage === 'seed' && newCount >= 5) newStage = 'developing';
        if (newStage === 'developing' && newCount >= 15) newStage = 'arena_ready';
      }
      return { ...idea, sparkCount: newCount, sparkedByUids: newUids, stage: newStage };
    }));
    await sparkIdea(ideaId, currentUserUid);
  }, [currentUserUid]);

  // ── Add new idea to local state ─────────────────────────────────────────────
  const handleCreated = useCallback((idea: Idea) => {
    setIdeas(prev => [idea, ...prev]);
  }, []);

  // ── Filtered display ────────────────────────────────────────────────────────
  const displayed = ideas.filter(idea => {
    if (stageFilter === 'arena_ready'  && idea.stage !== 'arena_ready')  return false;
    if (stageFilter === 'developing'   && !['developing', 'arena_ready'].includes(idea.stage)) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Create */}
      <CreateIdeaForm currentUser={currentUser} podId={podId} onCreated={handleCreated} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Stage filters */}
        {(['all', 'developing', 'arena_ready'] as const).map(s => (
          <button key={s} onClick={() => setStageFilter(s)} style={{
            padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: stageFilter === s ? G : '#fafaf9',
            color: stageFilter === s ? '#fff' : MUT,
            border: `1.5px solid ${stageFilter === s ? G : BDR}`,
            transition: 'all 0.12s',
          }}>
            {s === 'all' ? 'All Ideas' : s === 'developing' ? 'Developing' : '⚡ Arena Ready'}
          </button>
        ))}

        {/* Domain filters (global feed only) */}
        {podId === undefined && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 4, flexWrap: 'wrap' }}>
            <button onClick={() => setDomainFilter('all')} style={{
              padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: domainFilter === 'all' ? '#f5f5f4' : 'transparent',
              color: MUT, border: `1px solid ${BDR}`,
            }}>All domains</button>
            {DOMAINS.slice(0, 5).map(d => (
              <button key={d.value} onClick={() => setDomainFilter(d.value)} style={{
                padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: domainFilter === d.value ? d.bg : 'transparent',
                color: domainFilter === d.value ? d.color : MUT,
                border: `1.5px solid ${domainFilter === d.value ? d.color : BDR}`,
              }}>{d.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 20 }}>
              <div style={{ height: 12, width: '60%', background: '#f5f5f4', borderRadius: 6, marginBottom: 10 }} />
              <div style={{ height: 10, width: '90%', background: '#f5f5f4', borderRadius: 6, marginBottom: 6 }} />
              <div style={{ height: 10, width: '75%', background: '#f5f5f4', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: SURF, border: `1px solid ${BDR}`, borderRadius: 16,
        }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: GLT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Zap size={22} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: TXT, margin: '0 0 6px' }}>No ideas here yet</p>
          <p style={{ fontSize: 13, color: MUT, margin: 0 }}>
            Post a problem worth solving — ideas that resonate get sparked into Arenas.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayed.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              currentUserUid={currentUserUid}
              currentUser={currentUser}
              onSpark={handleSpark}
              onForkClick={setForkTarget}
              onArenaClick={idea => onArenaLaunch?.(idea)}
            />
          ))}
        </div>
      )}

      {/* Fork modal */}
      {forkTarget && (
        <ForkModal
          parent={forkTarget}
          currentUser={currentUser}
          podId={podId}
          onCreated={idea => { handleCreated(idea); setForkTarget(null); }}
          onClose={() => setForkTarget(null)}
        />
      )}
    </div>
  );
};

export default IdeaNetwork;
