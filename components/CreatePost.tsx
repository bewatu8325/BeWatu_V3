/**
 * components/CreatePost.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified post composer with type selector.
 * Supports: standard post, perspective post, wisdom thread.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { User } from '../types';
import { BookOpen, Users, FileText, ChevronDown } from 'lucide-react';
import { CreatePerspectivePost, GenerationTag } from './PerspectivePost';
import { CreateWisdomThread }                   from './WisdomThread';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

type PostMode = 'standard' | 'perspective' | 'wisdom';

interface CreatePostProps {
  addPost:         (content: string, circleId?: number) => void;
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

  const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const currentType = POST_TYPES.find(t => t.mode === mode)!;

  const handleStandardPost = () => {
    if (!content.trim()) return;
    addPost(content.trim(), circleId);  // circleId scopes post to pod
    setContent('');
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
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e7e5e4' }}>
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
              value={content}
              onChange={e => setContent(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder={circleId ? `Share something with this pod…` : `What's on your mind, ${currentUser.name.split(' ')[0]}?`}
              rows={focused ? 3 : 1}
              className="w-full resize-none text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none bg-transparent"
              style={{ lineHeight: 1.6 }}
            />
          </div>
        </div>

        {/* Actions row */}
        {(focused || content.trim()) && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: '#f3f4f6' }}>
            {/* Post type selector */}
            <div className="relative">
              <button
                onClick={() => setShowTypes(t => !t)}
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
                        <p className="text-xs text-stone-400 mt-0.5">{t.description}</p>
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
              disabled={!content.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: GREEN }}
            >
              Post
            </button>
          </div>
        )}

        {/* Post type quick buttons when not focused */}
        {!focused && !content.trim() && (onPerspective || onWisdomThread) && (
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
