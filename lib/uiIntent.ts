/**
 * lib/uiIntent.ts
 * A tiny way for one part of the app to ask another to do something once it is on screen:
 * "open the post composer", "open the create-a-pod dialog", "open the reel uploader". The request is remembered until
 * the target mounts (the page may need to open first) and is consumed exactly once. It can carry a small payload
 * (for example which kind of pod to start, or which Arena challenge a pod is for).
 */
import { useEffect } from 'react';

export type UiIntent = 'focus-composer' | 'create-pod' | 'upload-reel' | 'post-challenge' | 'create-spark' | 'invite' | 'share-work';
export interface IntentPayload { invite?: { purpose: 'connect' | 'community' | 'pod' | 'arena'; targetId?: string | null; targetName?: string | null }; composeMode?: 'standard' | 'perspective' | 'wisdom'; podType?: 'community' | 'innovation' | 'challenge' | 'generational'; challengeId?: string; challengeTitle?: string }

const EVENT = 'bewatu:intent';
let pending: { intent: UiIntent; payload?: IntentPayload } | null = null;

export function requestIntent(intent: UiIntent, payload?: IntentPayload) {
  pending = { intent, payload };
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: intent })); } catch { /* non-browser */ }
}

/** Runs `handler` when `intent` is requested, including a request made just before this mounted. */
export function useIntent(intent: UiIntent, handler: (payload?: IntentPayload) => void) {
  useEffect(() => {
    const take = () => { if (pending && pending.intent === intent) { const p = pending.payload; pending = null; handler(p); } };
    take();
    const on = () => take();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);
}
