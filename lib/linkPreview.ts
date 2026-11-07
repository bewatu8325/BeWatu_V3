/**
 * lib/linkPreview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side helpers for article link previews (composer + feed).
 * Pure functions plus one fetch wrapper; no React, no Firebase imports, so the
 * logic can be tested in plain node (test/link-preview/client-tests.mjs).
 *
 * The server (api/link-preview.ts) builds previews. Anything read back from a
 * post is still treated as untrusted here: a post is written straight to
 * Firestore by the author's browser, so a modified client could put anything in
 * `linkPreview`. firestore.rules checks its shape; sanitizeLinkPreview() and
 * safeHref() are the render-time guard (http/https links only, https images).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { LinkPreview } from '../types';

const MAX_URL = 2048;

export interface FoundUrl { url: string; start: number; end: number }

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/** Every http(s) URL in the text, with trailing sentence punctuation left out of it. */
export function findUrls(text: string): FoundUrl[] {
  const out: FoundUrl[] = [];
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // "…read https://x.com/a." / "(see https://x.com/a)" -- the closer is not part of the link,
    // unless the URL has its own matching "(" as in Wikipedia article paths.
    for (;;) {
      const last = url[url.length - 1];
      if (/[.,;:!?'"\]}]/.test(last)) { url = url.slice(0, -1); continue; }
      if (last === ')' && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) { url = url.slice(0, -1); continue; }
      break;
    }
    if (url.length > 'http://'.length) out.push({ url, start: m.index!, end: m.index! + url.length });
  }
  return out;
}

/** True if this looks like a finished, previewable address (has a dotted host). */
export function isPreviewableUrl(raw: string): boolean {
  if (raw.length > MAX_URL) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    return host.includes('.') && !/\.$/.test(host);
  } catch { return false; }
}

/** The first URL in the text that is worth asking the server about. */
export function firstPreviewableUrl(text: string): string | null {
  return findUrls(text).find(f => isPreviewableUrl(f.url))?.url ?? null;
}

/**
 * Takes the pasted link out of the commentary once its card exists -- but only
 * when it stands on its own (last thing in the text, or alone on its line).
 * A link in the middle of a sentence is left where it is, so the sentence still reads.
 */
export function removeUrlFromText(text: string, url: string): { text: string; removed: boolean } {
  const found = findUrls(text).find(f => f.url === url);
  if (!found) return { text, removed: false };
  const before = text.slice(0, found.start);
  const after = text.slice(found.end);
  const atEnd = after.trim() === '';
  const aloneOnLine = /(^|\n)[ \t]*$/.test(before) && /^[ \t]*(\n|$)/.test(after);
  if (!atEnd && !aloneOnLine) return { text, removed: false };
  if (atEnd) return { text: (before.replace(/[ \t]+$/, '') + after.replace(/^[ \t]+/, '')).trimEnd(), removed: true };
  // Alone on its line: take the whole line, including one line break, so no blank gap is left.
  const next = (before + after.replace(/^[ \t]*\n/, '')).replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  return { text: next, removed: true };
}

/** Puts a link back (used when the author removes the card) without gluing it to a word. */
export function appendUrlToText(text: string, url: string): string {
  if (text.includes(url)) return text;
  if (!text.trim()) return url;
  return text.replace(/\s+$/, '') + (text.endsWith('\n') ? '\n' : ' ') + url;
}

export type TextPart = { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

/** Splits post text into plain runs and clickable links (rendered as React nodes, never as HTML). */
export function linkifyParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const f of findUrls(text)) {
    const href = safeHref(f.url);
    if (!href) continue;
    if (f.start > cursor) parts.push({ type: 'text', value: text.slice(cursor, f.start) });
    parts.push({ type: 'link', value: f.url, href });
    cursor = f.end;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  return parts;
}

/** Returns the URL only if it is a plain http(s) link; anything else (javascript:, data:, …) gives null. */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL) return null;
  try {
    const u = new URL(raw);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() && v.length <= max ? v : undefined;

/** Validates a preview read from Firestore. Returns null if it can't be shown safely. */
export function sanitizeLinkPreview(raw: unknown): LinkPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = safeHref(r.url);
  const title = str(r.title, 300);
  const hostname = str(r.hostname, 253);
  if (!url || !title || !hostname) return null;
  const out: LinkPreview = { url, title, hostname };
  const description = str(r.description, 300);
  const siteName = str(r.siteName, 100);
  if (description) out.description = description;
  if (siteName) out.siteName = siteName;
  const image = safeHref(r.image);
  if (image && image.startsWith('https://')) out.image = image;
  return out;
}

/** What goes into the Firestore document: only known keys, no undefined values. */
export function previewForStorage(p: LinkPreview): LinkPreview {
  return sanitizeLinkPreview(p) ?? (() => { throw new Error('Invalid link preview'); })();
}

// ── Server call ──────────────────────────────────────────────────────────────

const memo = new Map<string, LinkPreview | null>();

/**
 * Asks the server for a preview. Resolves null when none is available
 * (no metadata, unreachable, blocked, rate limited): the caller just keeps the plain link.
 * Results are remembered for the session so pasting the same link twice costs nothing.
 */
export async function fetchLinkPreview(
  url: string,
  getIdToken: () => Promise<string>,
  signal?: AbortSignal,
): Promise<LinkPreview | null> {
  if (memo.has(url)) return memo.get(url)!;
  try {
    const res = await fetch('/api/link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getIdToken()}` },
      body: JSON.stringify({ url }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const preview = data?.ok ? sanitizeLinkPreview(data.preview) : null;
    memo.set(url, preview);
    return preview;
  } catch {
    return null; // network error or aborted
  }
}
