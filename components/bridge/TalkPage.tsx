/**
 * components/bridge/TalkPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One Bridge Talk: the player, who is speaking, what the Talk is about, the actions that turn watching into something more
 * (appreciate, save, share, follow, discuss), then related Talks and Pods, then the conversation.
 *
 * It shows a Talk only if the member is allowed to see it (rules: published, or yours, or a reviewer's); anything else reads as
 * "not available", the same as a Talk that does not exist.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Link2, Loader2, Share2 } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';
import TalkPlayer from './TalkPlayer';
import TalkDiscussion from './TalkDiscussion';
import { Speaker, TalkCard } from './TalkCard';
import { AppreciateIcon, SaveIcon, SendIcon } from '../icons/BridgeIcons';
import {
  STATUS_HINT, STATUS_LABEL, ago, categoryLabel, formatDuration, relatedPods, relatedTalks, shareText, shareUrl, type Comment, type Talk,
} from '../../lib/bridgeTalks';
import {
  fetchBySpeakers, fetchPublished, fetchReview, fetchSavedIds, fetchTalk, setLike, setSaved, type Author, type ReviewNote,
} from '../../lib/bridgeTalksService';
import { fetchGenerationalPods } from '../../lib/generationalFeatures';
import type { GenerationalPodData } from '../GenerationalPod';
import type { ReportTarget } from '../ReportModal';
import {
  trackTalkCompleted, trackTalkOpened, trackTalkProgress, trackTalkRelatedPod, trackTalkSaved, trackTalkShared, trackTalkSpeakerFollowed, trackTalkVideoStarted,
} from '../../lib/analytics/track';

const GREEN = 'var(--bw-green)';
const ring = { ['--tw-ring-color' as any]: GREEN };
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

export type FollowState = 'self' | 'none' | 'pending' | 'following';
interface Props {
  talkId: string; me: Author & { numericId: number }; isAdmin?: boolean; origin: string;
  followState: (speakerNumericId: number | null, speakerUid: string) => FollowState;
  onFollow: (speakerNumericId: number) => Promise<void>;
  onViewProfile: (numericId: number) => void;
  onOpenTalk: (id: string) => void;
  onOpenPod: (pod: GenerationalPodData) => void;
  onBack: () => void;
  onReport: (target: ReportTarget) => void;
  /** Edit a draft (the creation flow). */
  onEdit?: (talk: Talk) => void;
}

const actionBtn = 'inline-flex min-h-[44px] items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50 ' + FOCUS;

export const TalkPage: React.FC<Props> = ({ talkId, me, isAdmin, origin, followState, onFollow, onViewProfile, onOpenTalk, onOpenPod, onBack, onReport, onEdit }) => {
  const [talk, setTalk] = useState<Talk | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [saved, setSavedState] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState<'idle' | 'busy' | 'error'>('idle');
  const [related, setRelated] = useState<Talk[]>([]);
  const [pods, setPods] = useState<GenerationalPodData[]>([]);
  const [review, setReview] = useState<ReviewNote | null>(null);
  const [pulse, setPulse] = useState('');
  const discussion = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const t = await fetchTalk(talkId);
      if (!t) { setState('missing'); return; }
      setTalk(t); setLiked(t.likedByUids.includes(me.uid)); setLikes(t.likedByUids.length); setState('ready');
    } catch { setState('error'); }
  }, [talkId, me.uid]);
  useEffect(() => { load(); window.scrollTo({ top: 0 }); }, [load]);

  // When the Talk is open: note it, and find what is saved, related and written by the reviewer to this speaker.
  useEffect(() => {
    if (!talk) return;
    if (talk.status === 'published') trackTalkOpened(me.uid, talk.id, talk.category, talk.speakerUid);
    fetchSavedIds(me.uid).then(ids => setSavedState(ids.has(talk.id)));
    if (talk.status === 'published') {
      Promise.all([fetchPublished({ category: talk.category, size: 8 }).then(p => p.items).catch(() => []), fetchBySpeakers([talk.speakerUid], 4).catch(() => [])])
        .then(([a, b]) => setRelated(relatedTalks(talk, [...a, ...b.filter(x => !a.some(y => y.id === x.id))])));
      fetchGenerationalPods(24).then(ps => setPods(relatedPods(talk, ps))).catch(() => {});
    }
    if (talk.speakerUid === me.uid || isAdmin) fetchReview(talk.id).then(setReview);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talk?.id]);

  const flash = (t: string) => { setPulse(t); setTimeout(() => setPulse(''), 2200); };
  const own = talk?.speakerUid === me.uid;
  const live = talk?.status === 'published';
  const fstate = useMemo(() => (talk ? (own ? 'self' : followState(talk.speakerId, talk.speakerUid)) : 'none'), [talk, own, followState]);

  if (state === 'loading') return <div className="mx-auto max-w-3xl px-4 py-6" aria-busy="true"><div className="aspect-video animate-pulse rounded-2xl bg-stone-100" /><div className="mt-6 space-y-3"><div className="h-7 w-3/4 animate-pulse rounded bg-stone-100" /><div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" /></div></div>;
  if (state !== 'ready' || !talk) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-serif text-2xl font-semibold text-stone-900">{state === 'error' ? 'We could not open this Talk' : 'This Talk is not available'}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{state === 'error' ? 'Check your connection and try again.' : 'It may have been taken down, or it is not shared with you.'}</p>
        <div className="mt-6 flex justify-center gap-2">
          {state === 'error' && <button type="button" onClick={load} className={'min-h-[44px] rounded-full px-5 text-sm font-bold text-white ' + FOCUS} style={{ backgroundColor: GREEN, ...ring }}>Try again</button>}
          <button type="button" onClick={onBack} className={actionBtn} style={ring}>Back to Talks</button>
        </div>
      </div>
    );
  }

  const toggleLike = async () => {
    if (!live) return;
    const next = !liked; setLiked(next); setLikes(n => n + (next ? 1 : -1));
    try { await setLike(talk.id, me.uid, next); } catch { setLiked(!next); setLikes(n => n + (next ? -1 : 1)); flash('That did not save. Try again.'); }
  };
  const toggleSave = async () => {
    const next = !saved; setSavedState(next);
    try { await setSaved(me.uid, talk.id, next); trackTalkSaved(me.uid, talk.id, next); flash(next ? 'Saved to your Talks' : 'Removed from saved'); } catch { setSavedState(!next); flash('That did not save. Try again.'); }
  };
  const link = shareUrl(talk, origin);
  const publicLink = link.includes('/talks/') && !link.includes('/community/');
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); trackTalkShared(me.uid, talk.id, 'copy'); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('Copy this link', link); }
  };
  const nativeShare = async () => {
    try { await (navigator as any).share({ title: talk.title, text: shareText(talk), url: link }); trackTalkShared(me.uid, talk.id, 'native'); setShareOpen(false); } catch { /* cancelled */ }
  };
  // Sharing inside BeWatu: the Home composer, with the link already in it (it keeps unsent drafts under this key).
  const toFeed = () => {
    const text = `${shareText(talk)}\n${link}`;
    try { const k = 'bewatuDraft:home'; const cur = sessionStorage.getItem(k); sessionStorage.setItem(k, cur ? `${cur}\n\n${text}` : text); } catch { /* storage unavailable */ }
    trackTalkShared(me.uid, talk.id, 'feed'); setShareOpen(false);
    window.dispatchEvent(new CustomEvent('bewatu:compose-share'));
  };
  const follow = async () => {
    if (talk.speakerId == null) return;
    setFollowing('busy');
    try { await onFollow(talk.speakerId); trackTalkSpeakerFollowed(me.uid, talk.id, talk.speakerUid); setFollowing('idle'); flash('Follow request sent'); } catch { setFollowing('error'); }
  };
  const report = (c: Comment) => onReport({ content: { type: 'talk_comment', id: `${talk.id}/${c.id}`, preview: c.content.slice(0, 120) } });

  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-4 sm:pt-6">
      <button type="button" onClick={onBack} className={'-ml-2 mb-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100 ' + FOCUS} style={ring}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Talks</button>

      {!live && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <p className="font-semibold">{STATUS_LABEL[talk.status]}</p>
          <p className="mt-0.5">{own ? STATUS_HINT[talk.status] : 'Only you and the speaker can see this Talk right now.'}</p>
          {review?.note && talk.status !== 'published' && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-stone-800"><span className="font-semibold">Note from BeWatu: </span>{review.note}</p>}
          {own && talk.status === 'draft' && onEdit && <button type="button" onClick={() => onEdit(talk)} className={'mt-3 min-h-[40px] rounded-full bg-white px-4 text-sm font-semibold text-stone-900 ring-1 ring-amber-300 ' + FOCUS} style={ring}>Continue editing</button>}
        </div>
      )}

      <TalkPlayer
        talkId={talk.id} src={talk.videoUrl} poster={talk.thumbnailUrl} captionsVtt={talk.captionsVtt} title={talk.title} durationHint={talk.durationSec} preview={!live}
        onStarted={() => live && trackTalkVideoStarted(me.uid, talk.id, talk.category, talk.speakerUid)}
        onMilestone={p => trackTalkProgress(me.uid, talk.id, p, talk.category, talk.speakerUid)}
        onCompleted={() => trackTalkCompleted(me.uid, talk.id, talk.category, talk.speakerUid)}
      />

      <header className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: GREEN }}>{categoryLabel(talk.category)}</p>
        <h1 className="mt-1.5 font-serif text-[26px] font-semibold leading-tight text-stone-900 sm:text-[32px]">{talk.title}</h1>
        <p className="mt-2 text-sm text-stone-600">{formatDuration(talk.durationSec)}{talk.publishedAt ? ` · Published ${new Date(talk.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}{talk.visibility === 'members' ? ' · For BeWatu members' : ''}</p>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Talk actions">
        <button type="button" onClick={toggleLike} disabled={!live} aria-pressed={liked} className={actionBtn + ' disabled:opacity-50'} style={{ color: liked ? GREEN : undefined, borderColor: liked ? GREEN : undefined, ...ring }}>
          <AppreciateIcon className="h-5 w-5" style={liked ? { fill: GREEN } : undefined} />{liked ? 'Appreciated' : 'Appreciate'}{likes > 0 && <span className="tabular-nums text-stone-600">{likes}</span>}
        </button>
        <button type="button" onClick={toggleSave} aria-pressed={saved} className={actionBtn} style={{ color: saved ? GREEN : undefined, borderColor: saved ? GREEN : undefined, ...ring }}><SaveIcon className="h-5 w-5" style={saved ? { fill: GREEN } : undefined} />{saved ? 'Saved' : 'Save'}</button>
        <button type="button" onClick={() => setShareOpen(true)} className={actionBtn} style={ring}><Share2 className="h-[18px] w-[18px]" aria-hidden="true" />Share</button>
        {live && <button type="button" onClick={() => discussion.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })} className={actionBtn} style={ring}><SendIcon className="h-5 w-5" />Discuss this Talk</button>}
        <span className="sr-only" role="status">{pulse}</span>
      </div>
      {pulse && <p aria-hidden="true" className="mt-2 text-sm font-medium" style={{ color: GREEN }}>{pulse}</p>}

      <section aria-label="The speaker" className="mt-7 rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => talk.speakerId != null && onViewProfile(talk.speakerId)} className={'min-w-0 rounded-xl text-left ' + FOCUS} style={ring} aria-label={`View ${talk.speakerName}'s profile`}><Speaker talk={talk} size="md" /></button>
          {fstate !== 'self' && talk.speakerId != null && (
            <button type="button" onClick={follow} disabled={fstate !== 'none' || following === 'busy'} className={actionBtn + ' disabled:opacity-70'} style={ring}>
              {following === 'busy' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {fstate === 'following' ? <><Check className="h-4 w-4" aria-hidden="true" />Following</> : fstate === 'pending' ? 'Requested' : 'Follow'}
            </button>
          )}
        </div>
        {following === 'error' && <p role="alert" className="mt-2 text-sm text-red-700">That did not go through. Try again.</p>}
        {talk.experience && <p className="mt-3 text-[15px] leading-relaxed text-stone-700"><span className="font-semibold text-stone-900">Speaking from: </span>{talk.experience}</p>}
      </section>

      <section className="mt-7 max-w-prose">
        <h2 className="sr-only">About this Talk</h2>
        <p className="whitespace-pre-wrap text-[17px] leading-relaxed text-stone-800">{talk.summary}</p>
        {talk.keyTakeaways.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600">Key takeaways</h3>
            <ul className="mt-2 space-y-2">{talk.keyTakeaways.map((k, i) => <li key={i} className="flex gap-2.5 text-[16px] leading-relaxed text-stone-800"><Check className="mt-1 h-4 w-4 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" />{k}</li>)}</ul>
          </div>
        )}
        {talk.transcript && (
          <details className="mt-6 rounded-xl border border-stone-200 bg-white">
            <summary className={'cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-stone-800 ' + FOCUS} style={ring}>Read the transcript</summary>
            <p className="max-h-96 overflow-y-auto whitespace-pre-wrap px-4 pb-4 text-[15px] leading-relaxed text-stone-700">{talk.transcript}</p>
          </details>
        )}
      </section>

      {live && (related.length > 0 || pods.length > 0) && (
        <section aria-label="Keep exploring" className="mt-10 border-t border-stone-200 pt-8">
          {related.length > 0 && (
            <>
              <h2 className="font-serif text-2xl font-semibold text-stone-900">Explore related Talks</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">{related.map(r => <li key={r.id}><TalkCard talk={r} onOpen={onOpenTalk} /></li>)}</ul>
            </>
          )}
          {pods.length > 0 && (
            <div className={related.length ? 'mt-8' : ''}>
              <h2 className="font-serif text-xl font-semibold text-stone-900">Pods where this conversation continues</h2>
              <p className="mt-1 text-sm text-stone-600">A Pod is yours to look at and choose. Nothing is joined for you.</p>
              <ul className="mt-3 space-y-2">
                {pods.map(p => (
                  <li key={p.id}>
                    <button type="button" onClick={() => { trackTalkRelatedPod(me.uid, talk.id, p.id); onOpenPod(p); }} className={'flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left hover:bg-stone-50 ' + FOCUS} style={ring}>
                      <span className="min-w-0"><span className="block truncate font-semibold text-stone-900">{p.name}</span><span className="block truncate text-sm text-stone-600">{p.purpose || p.topic}</span></span>
                      <span aria-hidden="true" className="text-stone-500">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div ref={discussion} className="mt-10 scroll-mt-20">
        {live
          ? <TalkDiscussion talk={talk} me={me} isAdmin={isAdmin} onReport={report} />
          : <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-600">The conversation opens when this Talk is published.</p>}
      </div>

      <BottomSheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share this Talk" allWidths>
        <div className="space-y-4 pb-2">
          <p className="text-sm leading-relaxed text-stone-600">
            {publicLink ? 'The speaker has allowed this Talk to be watched without an account. Anyone with the link can see the video and the summary. The conversation stays with BeWatu members.'
              : 'This Talk is for BeWatu members. People you send the link to will need to sign in to watch it.'}
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5"><Link2 className="h-4 w-4 flex-shrink-0 text-stone-500" aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-sm text-stone-800" title={link}>{link}</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={copy} className={'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white ' + FOCUS} style={{ backgroundColor: GREEN, ...ring }}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Link copied' : 'Copy link'}</button>
            {typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function' && <button type="button" onClick={nativeShare} className={actionBtn + ' justify-center'} style={ring}><Share2 className="h-4 w-4" aria-hidden="true" />Share from your phone</button>}
            <button type="button" onClick={toFeed} className={actionBtn + ' justify-center sm:col-span-2'} style={ring}>Share to your BeWatu feed</button>
          </div>
        </div>
      </BottomSheet>
    </article>
  );
};

export default TalkPage;
