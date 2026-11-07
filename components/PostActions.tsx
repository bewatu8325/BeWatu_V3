/**
 * components/PostActions.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The pieces a post card needs for managing a post, shared by the feed card
 * (PostCard) and the pod wall card (PodPostCard):
 *
 *   PostActionsMenu  the "⋯" menu. Own post: Edit / Delete. Someone else's: Report.
 *   PostEditBox      edit the text in place (Save / Cancel, Ctrl/Cmd+Enter saves).
 *   DeleteConfirm    "Delete this post?" before anything is removed.
 *   AuthorAvatar     the photo, or initials when there is none / it fails to load.
 *
 * Who may edit or delete is decided by firestore.rules (the author only); these
 * components only decide what to show.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Flag, Loader2 } from 'lucide-react';

const GREEN = 'var(--bw-green)';
export const MAX_POST_LENGTH = 5000;

// ── Avatar ───────────────────────────────────────────────────────────────────

export const AuthorAvatar: React.FC<{ name?: string; src?: string | null; size?: number }> = ({ name, src, size = 48 }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const initials = (name ?? '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const box = { width: size, height: size };
  if (src && !failed) {
    return <img src={src} alt={name ?? ''} style={box} className="rounded-full object-cover flex-shrink-0" onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
  }
  return (
    <div style={{ ...box, backgroundColor: GREEN, fontSize: Math.round(size * 0.36) }}
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" aria-label={name} role="img">
      {initials}
    </div>
  );
};

// ── "⋯" menu ─────────────────────────────────────────────────────────────────

interface MenuProps {
  isOwn: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
}

export const PostActionsMenu: React.FC<MenuProps> = ({ isOwn, onEdit, onDelete, onReport }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: { key: string; label: string; icon: React.ReactNode; run: () => void; danger?: boolean }[] = [];
  if (isOwn) {
    if (onEdit)   items.push({ key: 'edit',   label: 'Edit post',   icon: <Pencil size={14} />, run: onEdit });
    if (onDelete) items.push({ key: 'delete', label: 'Delete post', icon: <Trash2 size={14} />, run: onDelete, danger: true });
  } else if (onReport) {
    items.push({ key: 'report', label: 'Report post', icon: <Flag size={14} />, run: onReport });
  }
  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative flex-shrink-0 ml-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Post options"
        title="Post options"
        className="w-9 h-9 flex items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2"
        style={{ ['--tw-ring-color' as any]: GREEN }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-50 min-w-[170px] overflow-hidden rounded-xl border bg-white shadow-lg" style={{ borderColor: '#e7e5e4' }}>
          {items.map(it => (
            <button
              key={it.key}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); it.run(); }}
              className={`flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium hover:bg-stone-50 focus:bg-stone-50 focus:outline-none ${it.danger ? 'text-red-700' : 'text-stone-700'}`}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Edit in place ────────────────────────────────────────────────────────────

interface EditProps {
  initial: string;
  /** A post with an article card may be saved with no text; one without may not. */
  allowEmpty: boolean;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}

export const PostEditBox: React.FC<EditProps> = ({ initial, allowEmpty, onSave, onCancel }) => {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);

  const trimmed = text.trim();
  const unchanged = trimmed === initial.trim();
  const tooLong = text.length > MAX_POST_LENGTH;
  const canSave = !saving && !unchanged && !tooLong && (allowEmpty || trimmed.length > 0);

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError(null);
    try { await onSave(trimmed); }
    catch { setError("Couldn't save your changes. Please try again."); setSaving(false); }
  };

  return (
    <div className="mb-4">
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); if (!saving) onCancel(); }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
        }}
        rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
        aria-label="Edit your post"
        disabled={saving}
        className="w-full resize-y rounded-xl border bg-white p-3 text-sm leading-relaxed text-stone-900 focus:outline-none focus-visible:ring-2 disabled:opacity-60"
        style={{ borderColor: '#d6d3d1', ['--tw-ring-color' as any]: GREEN }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tooLong && <span className="text-xs text-red-700">Posts can be up to {MAX_POST_LENGTH.toLocaleString()} characters.</span>}
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving}
            className="rounded-lg border px-3.5 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50" style={{ borderColor: '#e7e5e4' }}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40" style={{ backgroundColor: GREEN }}>
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Delete confirmation ──────────────────────────────────────────────────────

export const DeleteConfirm: React.FC<{ onConfirm: () => Promise<void>; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  const confirm = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(); }
    catch { setError("Couldn't delete the post. Please try again."); setBusy(false); }
  };

  return (
    <div role="alertdialog" aria-label="Delete this post?" className="mb-4 rounded-xl border bg-red-50 p-3.5" style={{ borderColor: '#fecaca' }}
      onKeyDown={e => { if (e.key === 'Escape' && !busy) onCancel(); }}>
      <p className="text-sm font-semibold text-stone-900">Delete this post?</p>
      <p className="mt-0.5 text-xs text-stone-700">It will be removed for everyone, along with its comments and reactions. This can't be undone.</p>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}
          className="rounded-lg border bg-white px-3.5 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50" style={{ borderColor: '#e7e5e4' }}>
          Keep post
        </button>
        <button type="button" onClick={confirm} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-1.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
};
