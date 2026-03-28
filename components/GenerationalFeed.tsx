/**
 * components/GenerationalFeed.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified feed combining perspective posts, wisdom threads and generational pods.
 * Accessible from the main nav as a tab or section within the feed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Users, Zap, Plus, RefreshCw } from 'lucide-react';
import { User } from '../types';
import { PerspectivePostCard, CreatePerspectivePost, PerspectivePostData, GenerationTag } from './PerspectivePost';
import { WisdomThreadCard, CreateWisdomThread, WisdomThreadData } from './WisdomThread';
import { GenerationalPodCard, CreateGenerationalPod, GenerationalPodData, CareerStage } from './GenerationalPod';
import {
  fetchPerspectivePosts, createPerspectivePost, addPerspectiveResponse,
  fetchWisdomThreads, createWisdomThread, heartWisdomThread, saveWisdomThread,
  fetchGenerationalPods, createGenerationalPod, joinGenerationalPod,
} from '../lib/generationalFeatures';

const GREEN    = '#1a4a3a';
const GREEN_LT = '#e8f4f0';

type FeedTab = 'all' | 'perspectives' | 'wisdom' | 'pods';

type FeedItem =
  | { type: 'perspective'; data: PerspectivePostData }
  | { type: 'wisdom';      data: WisdomThreadData }
  | { type: 'pod';         data: GenerationalPodData };

const TAB_CONFIG: { id: FeedTab; label: string; icon: React.ReactNode }[] = [
  { id: 'all',          label: 'All',        icon: <Zap size={13} /> },
  { id: 'perspectives', label: 'Perspectives', icon: <Users size={13} /> },
  { id: 'wisdom',       label: 'Wisdom',     icon: <BookOpen size={13} /> },
  { id: 'pods',         label: 'Pods',       icon: <Zap size={13} /> },
];

function inferCareerStage(user: User): CareerStage {
  const years = (user as any).yearsExperience ?? 0;
  if (years >= 20) return 'veteran';
  if (years >= 11) return 'established';
  if (years >= 4)  return 'growing';
  return 'emerging';
}

interface GenerationalFeedProps {
  currentUser:    User;
  fbUserUid:      string;
  onViewProfile:  (userId: number) => void;
  onSelectCircle?: (circleId: number) => void;
}

const GenerationalFeed: React.FC<GenerationalFeedProps> = ({
  currentUser, fbUserUid, onViewProfile, onSelectCircle,
}) => {
  const [tab, setTab]                     = useState<FeedTab>('all');
  const [creating, setCreating]           = useState<'perspective' | 'wisdom' | 'pod' | null>(null);
  const [perspectives, setPerspectives]   = useState<PerspectivePostData[]>([]);
  const [wisdomThreads, setWisdomThreads] = useState<WisdomThreadData[]>([]);
  const [pods, setPods]                   = useState<GenerationalPodData[]>([]);
  const [loading, setLoading]             = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, w, pd] = await Promise.all([
        fetchPerspectivePosts(10),
        fetchWisdomThreads(10),
        fetchGenerationalPods(8),
      ]);
      setPerspectives(p);
      setWisdomThreads(w);
      setPods(pd);
    } catch (err) {
      console.error('GenerationalFeed load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Build combined feed ──────────────────────────────────────────────────────
  const feedItems: FeedItem[] = [];
  if (tab === 'all' || tab === 'perspectives') {
    perspectives.forEach(p => feedItems.push({ type: 'perspective', data: p }));
  }
  if (tab === 'all' || tab === 'wisdom') {
    wisdomThreads.forEach(w => feedItems.push({ type: 'wisdom', data: w }));
  }
  if (tab === 'all' || tab === 'pods') {
    pods.forEach(p => feedItems.push({ type: 'pod', data: p }));
  }

  // Interleave when showing all
  if (tab === 'all') {
    feedItems.sort((a, b) => {
      const da = a.data.createdAt instanceof Date ? a.data.createdAt : new Date(a.data.createdAt);
      const db_ = b.data.createdAt instanceof Date ? b.data.createdAt : new Date(b.data.createdAt);
      return db_.getTime() - da.getTime();
    });
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handlePerspectiveSubmit = async (question: string, context: string, seeking: GenerationTag[]) => {
    const post = await createPerspectivePost(question, context, seeking, {
      uid:       fbUserUid,
      numericId: currentUser.id,
      name:      currentUser.name,
      avatarUrl: currentUser.avatarUrl,
    });
    setPerspectives(prev => [post, ...prev]);
    setCreating(null);
  };

  const handlePerspectiveRespond = async (postId: string, content: string, gen: GenerationTag) => {
    const response = await addPerspectiveResponse(postId, content, gen, {
      uid:       fbUserUid,
      numericId: currentUser.id,
      name:      currentUser.name,
      avatarUrl: currentUser.avatarUrl,
    });
    setPerspectives(prev => prev.map(p =>
      p.id === postId ? { ...p, responses: [...p.responses, response] } : p
    ));
  };

  const handleWisdomSubmit = async (data: any) => {
    const thread = await createWisdomThread({
      ...data,
      authorId:   currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatarUrl,
    }, fbUserUid);
    setWisdomThreads(prev => [thread, ...prev]);
    setCreating(null);
  };

  const handlePodSubmit = async (data: any) => {
    const pod = await createGenerationalPod(data, fbUserUid, {
      numericId: currentUser.id,
      name:      currentUser.name,
      avatarUrl: currentUser.avatarUrl,
      stage:     inferCareerStage(currentUser),
      role:      currentUser.headline ?? '',
    });
    setPods(prev => [pod, ...prev]);
    setCreating(null);
  };

  const handleJoinPod = async (podId: string, stage: CareerStage) => {
    await joinGenerationalPod(podId, {
      numericId: currentUser.id,
      name:      currentUser.name,
      avatarUrl: currentUser.avatarUrl,
      stage,
      role:      currentUser.headline ?? '',
    });
    setPods(prev => prev.map(p => {
      if (p.id !== podId) return p;
      return {
        ...p,
        members: [...p.members, {
          userId: currentUser.id,
          name:   currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          stage,
          role:   currentUser.headline ?? '',
          joinedAt: new Date(),
        }],
      };
    }));
  };

  const myStage = inferCareerStage(currentUser);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Bridge</h1>
          <p className="text-stone-500 text-sm mt-0.5">
            Cross-generational perspectives, wisdom, and community
          </p>
        </div>
        <button onClick={load} className="text-stone-400 hover:text-stone-600 transition-colors p-2">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Create buttons */}
      {!creating && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <button onClick={() => setCreating('perspective')}
            className="flex items-center gap-1.5 text-xs font-bold rounded-xl px-3.5 py-2 border hover:opacity-80 transition-opacity"
            style={{ backgroundColor: GREEN_LT, color: GREEN, borderColor: '#c7e8d8' }}>
            <Plus size={12} /> Perspective Post
          </button>
          <button onClick={() => setCreating('wisdom')}
            className="flex items-center gap-1.5 text-xs font-bold rounded-xl px-3.5 py-2 border hover:opacity-80 transition-opacity"
            style={{ backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
            <Plus size={12} /> Wisdom Thread
          </button>
          <button onClick={() => setCreating('pod')}
            className="flex items-center gap-1.5 text-xs font-bold rounded-xl px-3.5 py-2 border hover:opacity-80 transition-opacity"
            style={{ backgroundColor: '#ede9fe', color: '#4c1d95', borderColor: '#ddd6fe' }}>
            <Plus size={12} /> Generational Pod
          </button>
        </div>
      )}

      {/* Create forms */}
      {creating === 'perspective' && (
        <div className="mb-5">
          <CreatePerspectivePost onSubmit={handlePerspectiveSubmit} onCancel={() => setCreating(null)} />
        </div>
      )}
      {creating === 'wisdom' && (
        <div className="mb-5">
          <CreateWisdomThread
            onSubmit={handleWisdomSubmit}
            onCancel={() => setCreating(null)}
            authorYearsXp={(currentUser as any).yearsExperience ?? 0}
            authorRole={currentUser.headline ?? ''}
          />
        </div>
      )}
      {creating === 'pod' && (
        <div className="mb-5">
          <CreateGenerationalPod onSubmit={handlePodSubmit} onCancel={() => setCreating(null)} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: '#e7e5e4' }}>
        {TAB_CONFIG.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold transition-colors relative"
            style={{ color: tab === t.id ? GREEN : '#9ca3af' }}>
            {t.icon}
            {t.label}
            {tab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ backgroundColor: GREEN }} />
            )}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border h-40 animate-pulse" style={{ borderColor: '#e7e5e4' }} />
          ))}
        </div>
      ) : feedItems.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-3xl">
          <p className="font-bold text-stone-500 mb-1">Nothing here yet</p>
          <p className="text-sm text-stone-400">Be the first to share a perspective or wisdom thread.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedItems.map(item => {
            if (item.type === 'perspective') return (
              <PerspectivePostCard
                key={item.data.id}
                post={item.data}
                currentUser={{ id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl }}
                onRespond={handlePerspectiveRespond}
                onHelpful={(postId, responseId) => {}} // implement later
              />
            );
            if (item.type === 'wisdom') return (
              <WisdomThreadCard
                key={item.data.id}
                thread={item.data}
                onHeart={id => heartWisdomThread(id, fbUserUid)}
                onSave={id => saveWisdomThread(id, fbUserUid)}
                onViewProfile={onViewProfile}
              />
            );
            if (item.type === 'pod') return (
              <GenerationalPodCard
                key={item.data.id}
                pod={item.data}
                currentStage={myStage}
                onJoin={handleJoinPod}
                onClick={() => {
                  // Navigate to circle detail — pod id is the Firestore circle doc id
                  // We use the numeric id stored in the pod data if available
                  const numericId = (item.data as any).numericId;
                  if (numericId && onSelectCircle) onSelectCircle(numericId);
                }}
                isMember={item.data.members.some(m => m.userId === currentUser.id)}
              />
            );
            return null;
          })}
        </div>
      )}
    </div>
  );
};

export default GenerationalFeed;
