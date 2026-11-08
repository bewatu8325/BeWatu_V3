/**
 * components/bridge/TalkPlayer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The player for a Bridge Talk. A 16:9 box with our own controls over a plain <video>: play and pause, a seek bar, volume, speed,
 * captions (when the speaker supplied them), fullscreen. It never plays by itself, offers to resume where the member stopped
 * (never resumes on its own), says clearly when the video is loading or cannot be played, and works with the keyboard.
 *
 * Time actually watched (not where the bar was dragged to) feeds the milestones in lib/bridgeTalks.ts (WatchTracker).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  TalkPlayIcon, PlayIcon, PauseIcon, VolumeIcon, MutedIcon, CaptionsIcon, FullscreenIcon, ExitFullscreenIcon, SpeedIcon,
} from '../icons/BridgeIcons';
import { WatchTracker, clock, loadPosition, savePosition } from '../../lib/bridgeTalks';

const GREEN = 'var(--bw-green)';
const RATES = [0.75, 1, 1.25, 1.5, 2];

interface Props {
  talkId: string; src: string; poster?: string | null; captionsVtt?: string; title: string; durationHint?: number;
  onStarted?: () => void; onMilestone?: (percent: number) => void; onCompleted?: () => void;
  /** A preview in the creation flow: nothing is remembered or reported. */
  preview?: boolean;
}

export const TalkPlayer: React.FC<Props> = ({ talkId, src, poster, captionsVtt, title, durationHint = 0, onStarted, onMilestone, onCompleted, preview }) => {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const tracker = useRef(new WatchTracker(durationHint));
  const started = useRef(false);
  const lastSaved = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const cb = useRef({ onStarted, onMilestone, onCompleted }); cb.current = { onStarted, onMilestone, onCompleted };

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationHint);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [rateOpen, setRateOpen] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [showBar, setShowBar] = useState(true);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [tries, setTries] = useState(0);

  // Captions come from the Talk's own text and are given to the browser as a local file, so no other site is involved.
  const captionsUrl = useMemo(() => (captionsVtt ? URL.createObjectURL(new Blob([captionsVtt], { type: 'text/vtt' })) : null), [captionsVtt]);
  useEffect(() => () => { if (captionsUrl) URL.revokeObjectURL(captionsUrl); }, [captionsUrl]);
  useEffect(() => { tracker.current = new WatchTracker(duration || durationHint); }, [talkId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const wake = useCallback(() => {
    setShowBar(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (video.current && !video.current.paused) setShowBar(false); }, 2800);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const remember = useCallback(() => {
    const v = video.current; if (!v || preview || !v.duration) return;
    savePosition(talkId, v.currentTime, v.duration);
  }, [talkId, preview]);
  useEffect(() => () => remember(), [remember]);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggle = useCallback(() => {
    const v = video.current; if (!v) return;
    if (v.paused || v.ended) { setResumeAt(null); v.play().catch(() => setError('This video could not start. Check your connection and try again.')); } else v.pause();
  }, []);
  const seekBy = (s: number) => { const v = video.current; if (!v) return; tracker.current.seek(); v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + s)); };
  const toggleCaptions = useCallback(() => {
    const v = video.current; if (!v || !v.textTracks.length) return;
    const next = !captionsOn; v.textTracks[0].mode = next ? 'showing' : 'disabled'; setCaptionsOn(next);
  }, [captionsOn]);
  const goFullscreen = useCallback(() => {
    const el = box.current, v = video.current as any; if (!el || !v) return;
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();                  // iPhone Safari only fullscreens the video itself
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;   // sliders keep their own arrows
    const v = video.current; if (!v) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { if ((e.target as HTMLElement).tagName === 'BUTTON' && k === ' ') return; e.preventDefault(); toggle(); }
    else if (k === 'arrowleft') { e.preventDefault(); seekBy(-5); } else if (k === 'arrowright') { e.preventDefault(); seekBy(5); }
    else if (k === 'j') seekBy(-10); else if (k === 'l') seekBy(10);
    else if (k === 'arrowup') { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); } else if (k === 'arrowdown') { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); }
    else if (k === 'm') v.muted = !v.muted; else if (k === 'f') goFullscreen(); else if (k === 'c' && captionsUrl) toggleCaptions();
    wake();
  };

  const retry = () => { setError(''); setReady(false); setWaiting(true); setTries(n => n + 1); };
  const pct = duration ? (time / duration) * 100 : 0;
  const btn = 'inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white';

  return (
    <div
      ref={box} role="region" aria-label={`Video player: ${title}`} tabIndex={0} onKeyDown={onKey} onMouseMove={wake} onTouchStart={wake} onFocus={wake}
      className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ ['--tw-ring-color' as any]: GREEN }}
    >
      <video
        key={tries}
        ref={video} src={src} poster={poster ?? undefined} playsInline preload="metadata" className="h-full w-full bg-black object-contain"
        onClick={toggle} aria-label={title}
        onLoadedMetadata={e => {
          const v = e.currentTarget; const dur = Number.isFinite(v.duration) && v.duration >= 1 ? v.duration : durationHint;   // some files report no real length until played; a Talk is never under a second
          setDuration(dur); setReady(true); setWaiting(false); tracker.current = new WatchTracker(dur);
          if (!preview && dur) { const at = loadPosition(talkId, dur); if (at) setResumeAt(at); }
        }}
        onPlay={() => { setPlaying(true); wake(); if (!started.current) { started.current = true; cb.current.onStarted?.(); } }}
        onPause={() => { setPlaying(false); setShowBar(true); remember(); }}
        onEnded={() => { setPlaying(false); setShowBar(true); }}
        onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
        onSeeking={() => tracker.current.seek()}
        onTimeUpdate={e => {
          const v = e.currentTarget; setTime(v.currentTime);
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
          if (!preview) {
            for (const m of tracker.current.update(v.currentTime)) { if (m === 'completed') cb.current.onCompleted?.(); else cb.current.onMilestone?.(m); }
            if (Date.now() - lastSaved.current > 5000) { lastSaved.current = Date.now(); remember(); }
          }
        }}
        onVolumeChange={e => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
        onRateChange={e => setRate(e.currentTarget.playbackRate)}
        onError={() => setError('This video could not be played. It may still be processing, or your connection dropped.')}
      >
        {captionsUrl && <track kind="captions" label="Captions" srcLang="en" src={captionsUrl} />}
      </video>

      {/* nothing has started: a quiet play mark, never autoplay */}
      {!error && !playing && time === 0 && ready && resumeAt == null && (
        <button type="button" onClick={toggle} aria-label={`Play ${title}`} className="absolute inset-0 flex items-center justify-center bg-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg sm:h-20 sm:w-20" style={{ color: GREEN }}><TalkPlayIcon className="h-9 w-9 sm:h-11 sm:w-11" /></span>
        </button>
      )}
      {!ready && !error && <div className="absolute inset-0 flex items-center justify-center bg-black/30" role="status"><Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /><span className="sr-only">Loading video</span></div>}
      {ready && waiting && playing && <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /><span className="sr-only">Buffering</span></div>}

      {resumeAt != null && !error && (
        <div className="absolute inset-x-3 bottom-[84px] z-10 flex flex-wrap items-center gap-2 rounded-xl bg-black/80 px-3 py-2.5 text-sm backdrop-blur sm:inset-x-auto sm:left-4 sm:max-w-sm" role="group" aria-label="Resume watching">
          <span className="mr-auto">Pick up at {clock(resumeAt)}?</span>
          <button type="button" onClick={() => { const v = video.current; if (v) { v.currentTime = resumeAt; tracker.current.seek(); } setResumeAt(null); toggle(); }} className="min-h-[36px] rounded-full bg-white px-3.5 text-sm font-semibold text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Resume</button>
          <button type="button" onClick={() => setResumeAt(null)} className="min-h-[36px] rounded-full px-3 text-sm font-semibold text-white/90 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Start over</button>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-stone-900/95 px-6 text-center" role="alert">
          <p className="max-w-sm text-sm leading-relaxed">{error}</p>
          <button type="button" onClick={retry} className="min-h-[44px] rounded-full bg-white px-5 text-sm font-semibold text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Try again</button>
        </div>
      )}

      {/* controls */}
      {!error && ready && (
        <div className={'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 to-transparent px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-8 transition-opacity motion-reduce:transition-none ' + (showBar || !playing ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <div className="px-2">
            <label className="sr-only" htmlFor={`seek-${talkId}`}>Seek</label>
            <input
              id={`seek-${talkId}`} type="range" min={0} max={Math.max(1, Math.floor(duration))} step={1} value={Math.floor(time)}
              onChange={e => { const v = video.current; if (v) { tracker.current.seek(); v.currentTime = Number(e.target.value); } }}
              aria-valuetext={`${clock(time)} of ${clock(duration)}`}
              className="talk-range h-6 w-full cursor-pointer"
              style={{ ['--pct' as any]: pct + '%', ['--buf' as any]: (duration ? (buffered / duration) * 100 : 0) + '%' }}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={toggle} className={btn} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}</button>
            <span className="min-w-[88px] px-1 text-xs tabular-nums sm:text-sm" aria-hidden="true">{clock(time)} / {clock(duration)}</span>
            <span className="flex-1" />
            <div className="hidden items-center sm:flex">
              <button type="button" onClick={() => { const v = video.current; if (v) v.muted = !v.muted; }} className={btn} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}>{muted || volume === 0 ? <MutedIcon className="h-5 w-5" /> : <VolumeIcon className="h-5 w-5" />}</button>
              <label className="sr-only" htmlFor={`vol-${talkId}`}>Volume</label>
              <input id={`vol-${talkId}`} type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={e => { const v = video.current; if (v) { v.volume = Number(e.target.value); v.muted = Number(e.target.value) === 0; } }} className="talk-range h-6 w-20" style={{ ['--pct' as any]: (muted ? 0 : volume * 100) + '%', ['--buf' as any]: '0%' }} />
            </div>
            <div className="relative">
              <button type="button" onClick={() => setRateOpen(o => !o)} className={btn + ' w-auto gap-1 px-2.5 text-xs font-semibold'} aria-haspopup="menu" aria-expanded={rateOpen} aria-label={`Playback speed, ${rate}×`}><SpeedIcon className="h-5 w-5" />{rate}×</button>
              {rateOpen && (
                <ul role="menu" aria-label="Playback speed" className="absolute bottom-12 right-0 z-20 min-w-[96px] overflow-hidden rounded-xl bg-stone-900 py-1 shadow-xl ring-1 ring-white/10">
                  {RATES.map(r => (
                    <li key={r} role="none"><button role="menuitemradio" aria-checked={r === rate} type="button" onClick={() => { if (video.current) video.current.playbackRate = r; setRateOpen(false); }} className={'flex min-h-[40px] w-full items-center justify-between gap-3 px-3 text-sm hover:bg-white/10 focus:bg-white/10 focus:outline-none ' + (r === rate ? 'font-bold' : '')}>{r}×{r === rate && <span aria-hidden="true">✓</span>}</button></li>
                  ))}
                </ul>
              )}
            </div>
            {captionsUrl && <button type="button" onClick={toggleCaptions} className={btn + (captionsOn ? ' bg-white/20' : '')} aria-pressed={captionsOn} aria-label="Captions"><CaptionsIcon className="h-5 w-5" /></button>}
            <button type="button" onClick={goFullscreen} className={btn} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>{fullscreen ? <ExitFullscreenIcon className="h-5 w-5" /> : <FullscreenIcon className="h-5 w-5" />}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TalkPlayer;
