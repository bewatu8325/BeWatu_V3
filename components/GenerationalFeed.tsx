/**
 * components/GenerationalFeed.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified feed combining perspective posts, wisdom threads and generational pods.
 * Accessible from the main nav as a tab or section within the feed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import BridgeForYou from './bridge/BridgeForYou';
import TalksLibrary from './bridge/TalksLibrary';
import TalkPage, { type FollowState } from './bridge/TalkPage';
import BecomeSpeaker from './bridge/BecomeSpeaker';
import { fetchMe, type Me } from '../lib/bridgeTalksService';
import { requestIntent } from '../lib/uiIntent';
import { TalkIcon } from './icons/BridgeIcons';
import type { ReportTarget } from './ReportModal';
import type { Talk } from '../lib/bridgeTalks';
import { PerspectiveIcon, WisdomIcon, PodsNetworkIcon, AllSparkIcon, GenerationalPairIcon } from './icons/PodIcons';
import { User } from '../types';
import { PerspectivePostCard, CreatePerspectivePost, PerspectivePostData, GenerationTag } from './PerspectivePost';
import { WisdomThreadCard, CreateWisdomThread, WisdomThreadData } from './WisdomThread';
import { GenerationalPodCard, CreateGenerationalPod, GenerationalPodData, CareerStage } from './GenerationalPod';
import {
  fetchPerspectivePosts, createPerspectivePost, addPerspectiveResponse,
  fetchWisdomThreads, createWisdomThread, heartWisdomThread, saveWisdomThread,
  fetchGenerationalPods, createGenerationalPod, joinGenerationalPod,
} from '../lib/generationalFeatures';

const GREEN    = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

type FeedTab = 'foryou' | 'talks' | 'perspectives' | 'wisdom' | 'pods';

type FeedItem =
  | { type: 'perspective'; data: PerspectivePostData }
  | { type: 'wisdom';      data: WisdomThreadData }
  | { type: 'pod';         data: GenerationalPodData };

const TAB_CONFIG: { id: FeedTab; label: string; icon: React.ReactNode }[] = [
  { id: 'foryou',       label: 'For You',      icon: <AllSparkIcon size={18} /> },
  { id: 'talks',        label: 'Talks',        icon: <TalkIcon className="h-[18px] w-[18px]" /> },
  { id: 'perspectives', label: 'Perspectives', icon: <PerspectiveIcon size={18} /> },
  { id: 'wisdom',       label: 'Wisdom',       icon: <WisdomIcon size={18} /> },
  { id: 'pods',         label: 'Pods',         icon: <PodsNetworkIcon size={18} /> },
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
  /** Bridge Talks: which page of them is open (the address says), and how to move between them. */
  talksOpen?:     boolean;
  talkId?:        string | null;
  onOpenTalks?:   (category?: string) => void;
  onOpenTalk?:    (id: string) => void;
  onLeaveTalks?:  () => void;
  isAdmin?:       boolean;
  followedIds?:   number[];
  followState?:   (speakerNumericId: number | null, speakerUid: string) => FollowState;
  onFollow?:      (speakerNumericId: number) => Promise<void>;
  onReport?:      (target: ReportTarget) => void;
  onOpenPodByDoc?: (pod: GenerationalPodData) => void;
}

const GenerationalFeed: React.FC<GenerationalFeedProps> = ({
  currentUser, fbUserUid, onViewProfile, onSelectCircle,
  talksOpen = false, talkId = null, onOpenTalks, onOpenTalk, onLeaveTalks, isAdmin = false, followedIds = [], followState, onFollow, onReport, onOpenPodByDoc,
}) => {
  const [localTab, setLocalTab]           = useState<FeedTab>('foryou');
  const tab: FeedTab                      = talksOpen ? 'talks' : localTab;
  const [me, setMe]                       = useState<Me | null>(null);
  const [askOpen, setAskOpen]             = useState<'ask' | 'suggest' | null>(null);
  const [shareMenu, setShareMenu]         = useState(false);
  const [talksKey, setTalksKey]           = useState(0);
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
  useEffect(() => { fetchMe().then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => {
    const on = () => setTalksKey(k => k + 1);
    window.addEventListener('bewatu:talks-changed', on);
    return () => window.removeEventListener('bewatu:talks-changed', on);
  }, []);
  useEffect(() => {
    if (!shareMenu) return;
    const close = () => setShareMenu(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShareMenu(false); };
    document.addEventListener('click', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [shareMenu]);

  // ── Build combined feed ──────────────────────────────────────────────────────
  const feedItems: FeedItem[] = [];
  if (tab === 'foryou' || tab === 'perspectives') {
    perspectives.forEach(p => feedItems.push({ type: 'perspective', data: p }));
  }
  if (tab === 'foryou' || tab === 'wisdom') {
    wisdomThreads.forEach(w => feedItems.push({ type: 'wisdom', data: w }));
  }
  if (tab === 'foryou' || tab === 'pods') {
    pods.forEach(p => feedItems.push({ type: 'pod', data: p }));
  }

  // Interleave when showing all
  if (tab === 'foryou') {
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
  const interests = useMemo(() => [
    ...(((currentUser as any).skills ?? []) as (string | { name: string })[]).map(x => (typeof x === 'string' ? x : x?.name ?? '')),
    currentUser.headline ?? '', (currentUser as any).industry ?? '',
  ].filter(Boolean), [currentUser]);
  const canShareTalk = !!me?.contributor;
  const noFollow: (n: number | null, u: string) => FollowState = () => 'none';
  const GREEN_BTN = { backgroundColor: GREEN, ['--tw-ring-color' as any]: GREEN };
  const menuItem = 'flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:bg-stone-50 focus:outline-none';

  // One Talk is open: it has the whole page (the address names it).
  if (talkId && onOpenTalk && onLeaveTalks) {
    return (
      <TalkPage
        talkId={talkId} origin={typeof window !== 'undefined' ? window.location.origin : ''}
        me={{ uid: fbUserUid, numericId: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl, headline: currentUser.headline }}
        isAdmin={isAdmin} followState={followState ?? noFollow} onFollow={onFollow ?? (async () => {})}
        onViewProfile={onViewProfile} onOpenTalk={onOpenTalk} onBack={() => onOpenTalks?.()} onReport={onReport ?? (() => {})}
        onOpenPod={pod => { if (onOpenPodByDoc) onOpenPodByDoc(pod); else { const n = (pod as any).numericId; if (n && onSelectCircle) onSelectCircle(n); } }}
        onEdit={(t: Talk) => requestIntent('share-talk', { talkId: t.id })}
      />
    );
  }

  const pickTab = (id: FeedTab) => {
    if (id === 'talks') { onOpenTalks?.(); return; }
    setLocalTab(id);
    if (talksOpen) onLeaveTalks?.();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Bridge</h1>
          <p className="text-stone-600 text-sm mt-0.5">Where experience meets possibility.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} className="text-stone-600 hover:text-stone-800 transition-colors p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2" aria-label="Refresh Bridge"><RefreshCw size={15} /></button>
          <div className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={shareMenu} onClick={e => { e.stopPropagation(); setShareMenu(o => !o); }}
              className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={GREEN_BTN}>
              <WisdomIcon size={18} /> Share Wisdom
            </button>
            {shareMenu && (
              <ul role="menu" aria-label="Share Wisdom" className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-2xl border border-stone-200 bg-white py-1 shadow-xl">
                <li role="none"><button role="menuitem" type="button" className={menuItem} onClick={() => { setShareMenu(false); if (canShareTalk) requestIntent('share-talk'); else setAskOpen('ask'); }}><TalkIcon className="h-5 w-5 flex-shrink-0" /><span><span className="block">Share a Bridge Talk</span><span className="block text-xs font-normal text-stone-600">{canShareTalk ? 'A short video of a lesson you learned' : 'Ask to share a Talk'}</span></span></button></li>
                <li role="none"><button role="menuitem" type="button" className={menuItem} onClick={() => { setShareMenu(false); setCreating('wisdom'); setLocalTab(t => (t === 'talks' ? 'foryou' : t)); if (talksOpen) onLeaveTalks?.(); }}><WisdomIcon size={20} /><span><span className="block">Write a Wisdom Thread</span><span className="block text-xs font-normal text-stone-600">Pass on a hard-won career lesson</span></span></button></li>
                <li role="none"><button role="menuitem" type="button" className={menuItem} onClick={() => { setShareMenu(false); setCreating('perspective'); if (talksOpen) onLeaveTalks?.(); }}><PerspectiveIcon size={20} /><span><span className="block">Ask for Perspectives</span><span className="block text-xs font-normal text-stone-600">Hear from different generations</span></span></button></li>
                <li role="none"><button role="menuitem" type="button" className={menuItem} onClick={() => { setShareMenu(false); setCreating('pod'); if (talksOpen) onLeaveTalks?.(); }}><GenerationalPairIcon size={20} /><span><span className="block">Start a Generational Pod</span><span className="block text-xs font-normal text-stone-600">Learn across career stages</span></span></button></li>
              </ul>
            )}
          </div>
        </div>
      </div>

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
      <div role="tablist" aria-label="Bridge" className="flex gap-1 mb-5 border-b overflow-x-auto no-scrollbar" style={{ borderColor: '#e7e5e4' }}>
        {TAB_CONFIG.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => pickTab(t.id)}
            className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 min-h-[48px] text-sm font-bold transition-colors relative sm:px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
            style={{ color: tab === t.id ? GREEN : '#57534e', ['--tw-ring-color' as any]: GREEN }}>
            {t.icon}
            {t.label}
            {tab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ backgroundColor: GREEN }} />
            )}
          </button>
        ))}
      </div>

      {tab === 'talks' && onOpenTalk && (
        <TalksLibrary
          uid={fbUserUid} canContribute={canShareTalk} interests={interests} followedIds={followedIds} refreshKey={talksKey}
          onOpen={onOpenTalk} onEdit={(t: Talk) => requestIntent('share-talk', { talkId: t.id })} onShare={() => requestIntent('share-talk')}
          onRequest={() => setAskOpen('ask')} onSuggest={() => setAskOpen('suggest')} onExplorePerspectives={() => pickTab('perspectives')}
        />
      )}

      {tab === 'foryou' && onOpenTalk && (
        <BridgeForYou
          uid={fbUserUid} canContribute={canShareTalk} interests={interests} followedIds={followedIds} refreshKey={talksKey}
          onOpen={onOpenTalk} onSeeAll={cat => onOpenTalks?.(cat)} onShare={() => requestIntent('share-talk')}
          onRequest={() => setAskOpen('ask')} onSuggest={() => setAskOpen('suggest')} onExplorePerspectives={() => pickTab('perspectives')}
        />
      )}

      {/* Feed */}
      {tab !== 'talks' && (<>
      {tab === 'foryou' && feedItems.length > 0 && <h2 className="mb-3 mt-10 font-serif text-[22px] font-semibold text-stone-900">From the community</h2>}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border h-40 animate-pulse" style={{ borderColor: '#e7e5e4' }} />
          ))}
        </div>
      ) : feedItems.length === 0 ? (
        tab === 'foryou' ? null : (
        <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-3xl">
          <p className="font-bold text-stone-600 mb-1">Nothing here yet</p>
          <p className="text-sm text-stone-600">Be the first to share a perspective or wisdom thread.</p>
        </div>)
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
      </>)}

      <BecomeSpeaker open={askOpen !== null} onClose={() => setAskOpen(null)} initialTab={askOpen ?? 'ask'} />
    </div>
  );
};

export default GenerationalFeed;
