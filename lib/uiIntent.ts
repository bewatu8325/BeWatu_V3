/**
 * lib/uiIntent.ts
 * A tiny way for one part of the app to ask another to do something once it is on screen:
 * "open the post composer", "open the create-a-pod dialog". The request is remembered until the
 * target mounts (the page may need to open first) and is consumed exactly once.
 */
import { useEffect } from 'react';

export type UiIntent = 'focus-composer' | 'create-pod';
const EVENT = 'bewatu:intent';
let pending: UiIntent | null = null;

export function requestIntent(intent: UiIntent) {
  pending = intent;
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: intent })); } catch { /* non-browser */ }
}

/** Runs `handler` when `intent` is requested, including a request made just before this mounted. */
export function useIntent(intent: UiIntent, handler: () => void) {
  useEffect(() => {
    const take = () => { if (pending === intent) { pending = null; handler(); } };
    take();
    const on = () => take();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);
}
