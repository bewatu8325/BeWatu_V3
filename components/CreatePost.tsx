/**
 * components/CreatePost.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified post composer with type selector.
 * Supports: standard post, perspective post, wisdom thread.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, LinkPreview } from '../types';
import { BookOpen, Users, FileText, ChevronDown } from 'lucide-react';
import { auth } from '../lib/firebase';
import { firstPreviewableUrl, fetchLinkPreview, removeUrlFromText, appendUrlToText } from '../lib/linkPreview';
import { LinkPreviewCard, LinkPreviewSkeleton } from './LinkPreviewCard';
import { CreatePerspectivePost, GenerationTag } from './PerspectivePost';
import { CreateWisdomThread }                   from './WisdomThread';
import { useIntent } from '../lib/uiIntent';

const GREEN    = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

type PostMode = 'standard' | 'perspective' | 'wisdom';

interface CreatePostProps {
  addPost:         (content: string, circleId?: number, linkPreview?: LinkPreview) => void;
  onPerspective?:  (question: string, context: string, seeking: GenerationTag[]) => Promise<void>;
  onWisdomThread?: (data: any) => Promise<void>;
  currentUser:     User;
  circleId?:       number;  // set when posting inside a pod
}

const POST_TYPES: { mode: PostMode; label: string; icon: React.ReactNode; description: string }[] = [
  {
    mode: 'standard',
    label: 'Post',
    icon: <FileText size={14} />,
    description: 'Share a thought, update, or idea',
  },
  {
    mode: 'perspective',
    label: 'Perspective Post',
    icon: <Users size={14} />,
    description: 'Ask for perspectives from different generations',
  },
  {
    mode: 'wisdom',
    label: 'Wisdom Thread',
    icon: <BookOpen size={14} />,
    description: 'Share a hard-won career lesson',
  },
];

const CreatePost: React.FC<CreatePostProps> = ({
  addPost, onPerspective, onWisdomThread, currentUser, circleId,
}) => {
  const [mode, setMode]           = useState<PostMode>('standard');
  const [content, setContent]     = useState('');
  const [showTypes, setShowTypes] = useState(false);
  const [focused, setFocused]     = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // "Write a post" from the Create tab lands here with the box ready to type in.
  useIntent('focus-composer', () => { if (!circleId) textareaRef.current?.focus({ preventScroll: true }); });

  // ── Article preview ──────────────────────────────────────────────────────
  // Paste a link and a card appears by itself. `preview` is the card, `loadingUrl`
  // the link being looked up. `urlTaken` records that we moved the link out of the
  // text (so removing the card can put it back). `skip` holds links that already
  // failed or that the author dismissed, so they are not looked up again.
  const [preview, setPreview]       = useState<LinkPreview | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [urlTaken, setUrlTaken]     = useState(false);
  const skip = useRef<Set<string>>(new Set());
  const candidate = useMemo(() => firstPreviewableUrl(content), [content]);

  useEffect(() => {
    // Nothing to do when the text has no link, it is the card we already have, or we gave up on it.
    if (!candidate || candidate === preview?.url || skip.current.has(candidate)) return;
    const ctrl = new AbortController();
    // Wait briefly so a link that is being typed isn't looked up letter by letter.
    const timer = setTimeout(async () => {
      setLoadingUrl(candidate);
      const result = await fetchLinkPreview(
        candidate,
        () => auth.currentUser!.getIdToken(),
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setLoadingUrl(null);
      if (!result) { skip.current.add(candidate); return; } // keep the plain link in the text
      setPreview(result);
      // The card carries the link now, so take the raw URL out of the commentary
      // (only when it stands alone; a link inside a sentence stays put).
      const r = removeUrlFromText(content, candidate);
      setContent(c => removeUrlFromText(c, candidate).text);
      setUrlTaken(r.removed);
    }, 600);
    return () => { clearTimeout(timer); ctrl.abort(); setLoadingUrl(null); };
    // `content` is read only to decide whether the link was taken out; the lookup is keyed on the link itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, preview?.url]);

  // The post-type menu closes on a click elsewhere or Escape.
  const typesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTypes) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (typesRef.current && !typesRef.current.contains(e.target as Node)) setShowTypes(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowTypes(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('touchstart', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); document.removeEventListener('keydown', onKey); };
  }, [showTypes]);

  const removePreview = () => {
    if (!preview) return;
    skip.current.add(preview.url);
    // Give the link back if we had moved it out of the text, so nothing silently disappears.
    if (urlTaken) setContent(c => appendUrlToText(c, preview.url));
    setPreview(null);
    setUrlTaken(false);
  };

  const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const currentType = POST_TYPES.find(t => t.mode === mode)!;

  const handleStandardPost = () => {
    if (!content.trim() && !preview) return;
    addPost(content.trim(), circleId, preview ?? undefined);  // circleId scopes post to pod
    setContent('');
    setPreview(null);
    setLoadingUrl(null);
    setUrlTaken(false);
    skip.current.clear();
    setFocused(false);
  };

  // If a special mode is active, render that form
  if (mode === 'perspective' && onPerspective) {
    return (
      <CreatePerspectivePost
        onSubmit={onPerspective}
        onCancel={() => setMode('standard')}
      />
    );
  }

  if (mode === 'wisdom' && onWisdomThread) {
    return (
      <CreateWisdomThread
        onSubmit={onWisdomThread}
        onCancel={() => setMode('standard')}
        authorYearsXp={(currentUser as any).yearsExperience ?? 0}
        authorRole={currentUser.headline ?? ''}
      />
    );
  }

  // Standard post composer
  return (
    <div className="bg-white rounded-2xl border shadow-sm" style={{ borderColor: '#e7e5e4' }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.name}
                className="w-9 h-9 rounded-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: GREEN }}>
                {initials}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder={circleId ? `Share something with this pod…` : `What's on your mind, ${currentUser.name.split(' ')[0]}?`}
              rows={focused ? 3 : 1}
              className="w-full resize-none text-sm text-stone-900 placeholder:text-stone-600 focus:outline-none bg-transparent"
              style={{ lineHeight: 1.6 }}
            />
          </div>
        </div>

        {/* Article card: below the commentary box so the author's own words come first */}
        {(preview || loadingUrl) && (
          <div className="mt-3 sm:ml-12">
            {loadingUrl ? <LinkPreviewSkeleton /> : <LinkPreviewCard preview={preview!} onRemove={removePreview} />}
          </div>
        )}

        {/* Actions row */}
        {(focused || content.trim() || preview) && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: '#f3f4f6' }}>
            {/* Post type selector */}
            <div className="relative" ref={typesRef}>
              <button
                onClick={() => setShowTypes(t => !t)}
                aria-haspopup="menu"
                aria-expanded={showTypes}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors hover:bg-stone-50"
                style={{ borderColor: '#e7e5e4', color: mode === 'standard' ? '#6b7280' : GREEN }}
              >
                {currentType.icon}
                {currentType.label}
                <ChevronDown size={11} />
              </button>

              {showTypes && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border shadow-lg z-20 min-w-[220px]"
                  style={{ borderColor: '#e7e5e4' }}>
                  {POST_TYPES.map(t => (
                    <button key={t.mode}
                      onClick={() => { setMode(t.mode); setShowTypes(false); }}
                      className="w-full flex items-start gap-3 px-3.5 py-3 hover:bg-stone-50 transition-colors text-left first:rounded-t-xl last:rounded-b-xl"
                    >
                      <span className="mt-0.5" style={{ color: t.mode === mode ? GREEN : '#9ca3af' }}>
                        {t.icon}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-stone-800">{t.label}</p>
                        <p className="text-xs text-stone-600 mt-0.5">{t.description}</p>
                      </div>
                      {t.mode === mode && (
                        <span className="ml-auto text-xs font-bold" style={{ color: GREEN }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Post button */}
            <button
              onClick={handleStandardPost}
              disabled={!content.trim() && !preview}
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: GREEN }}
            >
              Post
            </button>
          </div>
        )}

        {/* Post type quick buttons when not focused */}
        {!focused && !content.trim() && !preview && (onPerspective || onWisdomThread) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: '#f3f4f6' }}>
            {onPerspective && (
              <button onClick={() => setMode('perspective')}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors hover:opacity-80"
                style={{ backgroundColor: GREEN_LT, color: GREEN, borderColor: '#c7e8d8' }}>
                <Users size={12} /> Perspective Post
              </button>
            )}
            {onWisdomThread && (
              <button onClick={() => setMode('wisdom')}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors hover:opacity-80"
                style={{ backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                <BookOpen size={12} /> Wisdom Thread
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatePost;
