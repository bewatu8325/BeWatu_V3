/**
 * components/bridge/TalkDiscussion.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Continue the conversation." Comments and questions on a Talk, with one level of replies, appreciation, edit and delete for
 * your own, and a report on anyone else's. The speaker is marked with a quiet "Speaker" label (worked out from the Talk, never
 * from the comment), and nothing says or implies they must answer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppreciateIcon } from '../icons/BridgeIcons';
import {
  LIMITS, SPEAKER_LABEL, ago, buildThread, commentProblem, type Comment, type Talk,
} from '../../lib/bridgeTalks';
import { addComment, deleteComment, editComment, setCommentLike, watchComments, type Author } from '../../lib/bridgeTalksService';
import { trackTalkComment, trackTalkDiscussionStarted } from '../../lib/analytics/track';

const GREEN = 'var(--bw-green)';
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

interface Props {
  talk: Talk; me: Author; isAdmin?: boolean;
  onReport: (c: Comment) => void;
}

const Avatar: React.FC<{ name: string; url: string | null; size?: number }> = ({ name, url, size = 36 }) => (
  url
    ? <img src={url} alt="" className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} loading="lazy" />
    : <span className="flex flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ width: size, height: size, backgroundColor: GREEN }} aria-hidden="true">{name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}</span>
);

const Composer: React.FC<{
  placeholder: string; label: string; submitLabel: string; initial?: string; autoFocus?: boolean; compact?: boolean;
  onSubmit: (text: string) => Promise<void>; onCancel?: () => void;
}> = ({ placeholder, label, submitLabel, initial = '', autoFocus, compact, onSubmit, onCancel }) => {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) area.current?.focus({ preventScroll: false }); }, [autoFocus]);
  const left = LIMITS.comment - text.length;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    const p = commentProblem(text); if (p) { setError(p); return; }
    setBusy(true); setError('');
    try { await onSubmit(text); setText(''); }
    catch (err: any) { setError(err?.code === 'permission-denied' ? 'This Talk is no longer open for comments.' : 'That did not post. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="sr-only" htmlFor={label}>{placeholder}</label>
      <textarea
        id={label} ref={area} value={text} onChange={e => { setText(e.target.value); setError(''); }} rows={compact ? 2 : 3} maxLength={LIMITS.comment + 200} placeholder={placeholder}
        aria-invalid={!!error} aria-describedby={error ? label + '-err' : undefined}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e as any); }}
        className={'block w-full resize-y rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-[15px] leading-relaxed text-stone-900 placeholder:text-stone-500 ' + FOCUS} style={ring}
      />
      {error && <p id={label + '-err'} role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className={'text-xs tabular-nums ' + (left < 0 ? 'font-semibold text-red-700' : 'text-stone-500')} aria-live="polite">{left < 200 ? `${left} left` : ''}</span>
        <span className="flex items-center gap-2">
          {onCancel && <button type="button" onClick={onCancel} className={'min-h-[44px] rounded-full px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 ' + FOCUS} style={ring}>Cancel</button>}
          <button type="submit" disabled={busy || !text.trim()} className={'inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm font-bold text-white disabled:opacity-50 ' + FOCUS} style={{ backgroundColor: GREEN, ...ring }}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{submitLabel}
          </button>
        </span>
      </div>
    </form>
  );
};

export const TalkDiscussion: React.FC<Props> = ({ talk, me, isAdmin, onReport }) => {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [shown, setShown] = useState(20);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setComments(null); setError('');
    return watchComments(talk.id, setComments, () => setError('We could not load the conversation.'));
  }, [talk.id, attempt]);
  useEffect(() => { if (!menu) return; const close = () => setMenu(null); document.addEventListener('click', close); return () => document.removeEventListener('click', close); }, [menu]);

  const thread = useMemo(() => buildThread(comments ?? [], talk.speakerUid), [comments, talk.speakerUid]);
  const prompt = talk.discussionPrompt.trim();

  const post = async (text: string, parent: Comment | null) => {
    const first = !parent && (comments?.length ?? 0) === 0;
    const id = await addComment(talk.id, me, { content: text, parent });
    if (first) trackTalkDiscussionStarted(me.uid, talk.id);
    trackTalkComment(me.uid, talk.id, id, text.trim().length, !!parent, me.uid === talk.speakerUid);
    setReplyTo(null);
  };

  // A plain function, not a component: a component defined here would be a new type on every render and remount (and so empty) an open reply box.
  const renderRow = (c: Comment, reply = false) => {
    const mine = c.authorUid === me.uid, bySpeaker = c.authorUid === talk.speakerUid, liked = c.likedByUids.includes(me.uid);
    return (
      <li key={c.id} id={'c-' + c.id} className="flex gap-3">
        <Avatar name={c.authorName} url={c.authorAvatar} size={reply ? 30 : 38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-stone-900">{c.authorName}</span>
            {bySpeaker && <span className="rounded-full px-2 py-px text-[11px] font-semibold" style={{ backgroundColor: 'var(--bw-green-light)', color: GREEN }}>{SPEAKER_LABEL}</span>}
            <span className="text-xs text-stone-500">{ago(c.createdAt)}{c.edited ? ' · edited' : ''}</span>
          </div>
          {!bySpeaker && c.authorHeadline && <p className="truncate text-xs text-stone-600">{c.authorHeadline}</p>}
          {editing === c.id ? (
            <div className="mt-2"><Composer label={'edit-' + c.id} placeholder="Edit your comment" submitLabel="Save" initial={c.content} autoFocus compact onCancel={() => setEditing(null)} onSubmit={async t => { await editComment(talk.id, c.id, t); setEditing(null); }} /></div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-stone-800">
              {reply && c.replyToName && c.replyToUid !== talk.speakerUid && <span className="mr-1 font-medium text-stone-500">↩ {c.replyToName}</span>}{c.content}
            </p>
          )}
          {editing !== c.id && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[13px]">
              <button type="button" aria-pressed={liked} onClick={() => setCommentLike(talk.id, c.id, me.uid, !liked).catch(() => {})} className={'inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-2.5 font-semibold hover:bg-stone-100 ' + FOCUS} style={{ color: liked ? GREEN : '#57534e', ...ring }} aria-label={`${liked ? 'Remove your appreciation' : 'Appreciate this'}${c.likedByUids.length ? `, ${c.likedByUids.length} so far` : ''}`}>
                <AppreciateIcon className="h-[18px] w-[18px]" style={liked ? { fill: GREEN } : undefined} />{c.likedByUids.length > 0 && <span className="tabular-nums">{c.likedByUids.length}</span>}
              </button>
              <button type="button" onClick={() => setReplyTo(c)} className={'min-h-[40px] rounded-full px-2.5 font-semibold text-stone-700 hover:bg-stone-100 ' + FOCUS} style={ring}>Reply</button>
              <span className="relative">
                <button type="button" aria-haspopup="menu" aria-expanded={menu === c.id} aria-label="More actions" onClick={e => { e.stopPropagation(); setMenu(m => m === c.id ? null : c.id); }} className={'min-h-[40px] min-w-[40px] rounded-full px-2 font-bold text-stone-600 hover:bg-stone-100 ' + FOCUS} style={ring}>···</button>
                {menu === c.id && (
                  <ul role="menu" className="absolute left-0 top-10 z-20 min-w-[150px] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
                    {mine && <li role="none"><button role="menuitem" type="button" onClick={() => { setEditing(c.id); setMenu(null); }} className="block min-h-[40px] w-full px-3 text-left text-sm hover:bg-stone-50">Edit</button></li>}
                    {(mine || isAdmin) && <li role="none"><button role="menuitem" type="button" onClick={() => { setMenu(null); if (window.confirm('Delete this comment? This cannot be undone.')) deleteComment(talk.id, c.id).catch(() => setError('That could not be deleted. Try again.')); }} className="block min-h-[40px] w-full px-3 text-left text-sm text-red-700 hover:bg-red-50">Delete</button></li>}
                    {!mine && <li role="none"><button role="menuitem" type="button" onClick={() => { setMenu(null); onReport(c); }} className="block min-h-[40px] w-full px-3 text-left text-sm hover:bg-stone-50">Report</button></li>}
                  </ul>
                )}
              </span>
            </div>
          )}
          {replyTo?.id === c.id && (
            <div className="mt-2"><Composer label={'reply-' + c.id} placeholder={`Reply to ${c.authorName.split(' ')[0]}`} submitLabel="Reply" autoFocus compact onCancel={() => setReplyTo(null)} onSubmit={t => post(t, c)} /></div>
          )}
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="talk-discussion" className="border-t border-stone-200 pt-8">
      <h2 id="talk-discussion" className="font-serif text-2xl font-semibold text-stone-900">Continue the conversation</h2>
      <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-stone-600">What stood out to you? Share a perspective, ask a question, or contribute your own experience.</p>
      {prompt && (
        <p className="mt-4 rounded-xl border border-stone-200 px-4 py-3 text-[15px] leading-relaxed text-stone-800" style={{ backgroundColor: 'var(--bw-green-light)' }}>
          <span className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: GREEN }}>A question from {talk.speakerName.split(' ')[0]}</span>{prompt}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <Avatar name={me.name} url={me.avatarUrl ?? null} size={38} />
        <div className="min-w-0 flex-1">
          <Composer label="talk-comment" placeholder={prompt ? 'Share your answer, or ask your own question' : 'Add to the conversation'} submitLabel="Post" onSubmit={t => post(t, null)} />
        </div>
      </div>

      <div className="mt-8">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error} <button type="button" className="font-semibold underline" onClick={() => setAttempt(a => a + 1)}>Try again</button>
          </div>
        )}
        {!error && comments === null && <div className="space-y-5" aria-busy="true" role="status"><span className="sr-only">Loading the conversation</span>{[0, 1].map(i => <div key={i} className="flex gap-3"><div className="h-9 w-9 animate-pulse rounded-full bg-stone-100" /><div className="flex-1 space-y-2"><div className="h-3 w-1/3 animate-pulse rounded bg-stone-100" /><div className="h-3 w-5/6 animate-pulse rounded bg-stone-100" /></div></div>)}</div>}
        {!error && comments !== null && thread.length === 0 && <p className="py-6 text-center text-[15px] text-stone-600">No comments yet. Be the first to share what stood out.</p>}
        {!error && thread.length > 0 && (
          <>
            <ul className="space-y-7">
              {thread.slice(0, shown).map(n => (
                <React.Fragment key={n.id}>
                  {n.comment ? renderRow(n.comment) : <li className="text-sm italic text-stone-500">A comment was removed</li>}
                  {n.replies.length > 0 && (
                    <li className="-mt-3 ml-5 border-l-2 border-stone-200 pl-4 sm:ml-[18px]">
                      <ul className="space-y-5 pt-3">{n.replies.map(r => renderRow(r, true))}</ul>
                    </li>
                  )}
                </React.Fragment>
              ))}
            </ul>
            {thread.length > shown && <button type="button" onClick={() => setShown(s => s + 20)} className={'mt-6 min-h-[44px] rounded-full border border-stone-300 px-5 text-sm font-semibold text-stone-800 hover:bg-stone-50 ' + FOCUS} style={ring}>Show more comments</button>}
          </>
        )}
      </div>
    </section>
  );
};

export default TalkDiscussion;
