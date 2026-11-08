// api/talks.ts
// ─────────────────────────────────────────────────────────────────────────────
// The public page of a Bridge Talk: /talks/<id>, watchable with no account, for a Talk its speaker explicitly made public.
//
//   - A Talk is shown only if it is published AND its visibility is "public" AND the speaker ticked the consent box. Anything
//     else (a members-only Talk, a draft, a Talk taken down, a Talk that does not exist) gets the same plain "not available"
//     page, which names nothing, so the page cannot be used to learn what exists.
//   - The page carries the Talk and the speaker's public face only: title, summary, takeaways, the video, the speaker's name, photo
//     and headline (the headline and photo are the speaker's public choices, copied when it was published). Never the discussion,
//     who commented or appreciated, counts, ids of members, or any email address.
//   - Rendered on the server for link previews and search: Open Graph and Twitter tags, a canonical address, structured data
//     (VideoObject). Nothing is counted about who looks.
//   - Works under the site's strict content policy: no inline script or style, no third-party hosts (the only script is
//     /talk-page/talk.js, the stylesheet /talk-page/talk.css). The video comes from BeWatu's own storage.
//
// GET /talks/<id>  →  /api/talks?id=<id>
//
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** JSON for a <script type="application/ld+json"> block: nothing in it can close the tag or start a comment. */
export const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export const safeHttps = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 2048) return null;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null; } catch { return null; }
};
const CATEGORY: Record<string, string> = {
  leadership: 'Leadership', career: 'Career Development', entrepreneurship: 'Entrepreneurship', technology: 'Technology & Innovation',
  finance: 'Finance & Business', healthcare: 'Healthcare', engineering: 'Engineering & Manufacturing', wisdom: 'Life & Professional Wisdom',
};
const categoryLabel = (id: string) => CATEGORY[id] ?? id.replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
export const isoDuration = (sec: number) => { const s = Math.max(0, Math.round(sec || 0)); return `PT${Math.floor(s / 3600) ? Math.floor(s / 3600) + 'H' : ''}${Math.floor((s % 3600) / 60)}M${s % 60}S`; };
const minutes = (sec: number) => { const m = Math.round((sec || 0) / 60); return m < 1 ? `${Math.round(sec || 0)} sec` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`; };
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

export interface PublicTalk {
  id: string; title: string; summary: string; category: string; durationSec: number; takeaways: string[]; transcript: string; captionsVtt: string;
  videoUrl: string; thumbnailUrl: string | null; publishedAtMs: number | null;
  speaker: { name: string; headline: string; avatarUrl: string | null; username: string | null };
}

/** The Talk, only if it may be shown to anyone. Returns null for everything else, without saying why. */
export async function loadPublicTalk(db: Firestore, id: unknown): Promise<PublicTalk | null> {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await db.collection('bridge_talks').doc(id).get();
  const t = snap.data();
  if (!t || t.status !== 'published' || t.visibility !== 'public' || t.publicConsent !== true) return null;
  const videoUrl = safeHttps(t.videoUrl);
  if (!videoUrl || !t.title) return null;
  return {
    id, title: String(t.title).slice(0, 100), summary: String(t.summary ?? '').slice(0, 400), category: String(t.category ?? ''), durationSec: Number(t.durationSec) || 0,
    takeaways: Array.isArray(t.keyTakeaways) ? t.keyTakeaways.filter((x: unknown) => typeof x === 'string').slice(0, 3).map((x: string) => x.slice(0, 140)) : [],
    transcript: String(t.transcript ?? '').slice(0, 30_000), captionsVtt: String(t.captionsVtt ?? '').slice(0, 120_000),
    videoUrl, thumbnailUrl: safeHttps(t.thumbnailUrl), publishedAtMs: t.publishedAt?.toMillis?.() ?? null,
    speaker: { name: String(t.speakerName ?? 'BeWatu member').slice(0, 80), headline: String(t.speakerHeadline ?? '').slice(0, 120), avatarUrl: safeHttps(t.speakerAvatar), username: typeof t.speakerUsername === 'string' ? t.speakerUsername.slice(0, 40) : null },
  };
}

const shell = (o: { title: string; description?: string; head?: string; body: string; robots: string }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>${o.description ? `\n<meta name="description" content="${esc(o.description)}">` : ''}
<meta name="robots" content="${o.robots}"><meta name="referrer" content="no-referrer">
<link rel="stylesheet" href="/talk-page/talk.css">${o.head ? '\n' + o.head : ''}
</head><body class="tk">${o.body}<script src="/talk-page/talk.js" defer></script></body></html>`;

/** What anyone sees for a Talk that is not public, missing or gone: the same page every time, naming nothing. */
export function renderUnavailable(origin: string): string {
  return shell({
    title: 'This Talk is not available · BeWatu', robots: 'noindex, nofollow',
    body: `<main class="tk-main tk-main--narrow"><p class="tk-brand">BeWatu Bridge</p><h1 class="tk-h1">This Talk is not available</h1>
<p class="tk-lede">It may be for BeWatu members only, or it has been taken down. If you have a BeWatu account, sign in to look for it.</p>
<p class="tk-actions"><a class="tk-btn" href="${esc(origin)}/login">Sign in</a><a class="tk-btn tk-btn--quiet" href="${esc(origin)}/">About BeWatu</a></p></main>`,
  });
}

export function renderTalkPage(t: PublicTalk, origin: string): string {
  const url = `${origin}/talks/${t.id}`;
  const desc = clip(t.summary || `A Bridge Talk by ${t.speaker.name} on BeWatu.`, 200);
  const profile = t.speaker.username ? `${origin}/be/${encodeURIComponent(t.speaker.username)}` : null;
  const ld = {
    '@context': 'https://schema.org', '@type': 'VideoObject', name: t.title, description: desc, ...(t.thumbnailUrl ? { thumbnailUrl: [t.thumbnailUrl] } : {}),
    ...(t.publishedAtMs ? { uploadDate: new Date(t.publishedAtMs).toISOString() } : {}), duration: isoDuration(t.durationSec), contentUrl: t.videoUrl, embedUrl: url,
    author: { '@type': 'Person', name: t.speaker.name, ...(t.speaker.headline ? { jobTitle: t.speaker.headline } : {}), ...(profile ? { url: profile } : {}) },
    publisher: { '@type': 'Organization', name: 'BeWatu', url: origin },
  };
  const head = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="video.other"><meta property="og:site_name" content="BeWatu Bridge"><meta property="og:title" content="${esc(t.title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">`,
    t.thumbnailUrl ? `<meta property="og:image" content="${esc(t.thumbnailUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(t.thumbnailUrl)}">` : `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(t.title)}"><meta name="twitter:description" content="${esc(desc)}">`,
    `<script type="application/ld+json">${jsonLd(ld)}</script>`,
  ].join('\n');
  const initials = t.speaker.name.split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  const avatar = t.speaker.avatarUrl ? `<img class="tk-avatar" src="${esc(t.speaker.avatarUrl)}" alt="" width="52" height="52">` : `<span class="tk-avatar tk-avatar--init" aria-hidden="true">${esc(initials)}</span>`;
  const speaker = `${avatar}<span><span class="tk-name">${esc(t.speaker.name)}</span>${t.speaker.headline ? `<span class="tk-headline">${esc(t.speaker.headline)}</span>` : ''}</span>`;
  const when = t.publishedAtMs ? new Date(t.publishedAtMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const body = `<a class="tk-skip" href="#talk">Skip to the Talk</a>
<header class="tk-top"><a class="tk-brand" href="${esc(origin)}/">BeWatu</a><span class="tk-top-note">Bridge Talks</span></header>
<main id="talk" class="tk-main">
<div class="tk-player"><video controls playsinline preload="none"${t.thumbnailUrl ? ` poster="${esc(t.thumbnailUrl)}"` : ''} aria-label="${esc(t.title)}" src="${esc(t.videoUrl)}">${t.captionsVtt ? '' : ''}</video></div>
${t.captionsVtt ? `<div id="tk-vtt" hidden data-vtt="${esc(t.captionsVtt)}"></div>` : ''}
<p class="tk-kicker">${esc(categoryLabel(t.category))} · ${esc(minutes(t.durationSec))}${when ? ' · ' + esc(when) : ''}</p>
<h1 class="tk-h1">${esc(t.title)}</h1>
<p class="tk-speaker">${profile ? `<a class="tk-speaker-link" href="${esc(profile)}">${speaker}</a>` : speaker}</p>
${t.summary ? `<p class="tk-summary">${esc(t.summary)}</p>` : ''}
${t.takeaways.length ? `<section aria-labelledby="tk-k"><h2 id="tk-k" class="tk-h2">Key takeaways</h2><ul class="tk-list">${t.takeaways.map(k => `<li>${esc(k)}</li>`).join('')}</ul></section>` : ''}
${t.transcript ? `<details class="tk-details"><summary>Read the transcript</summary><p class="tk-transcript">${esc(t.transcript)}</p></details>` : ''}
<section class="tk-join" aria-labelledby="tk-j"><h2 id="tk-j" class="tk-h2">Continue the conversation</h2>
<p>Members discuss each Talk, ask the speaker questions and share their own experience. Join BeWatu to take part.</p>
<p class="tk-actions"><a class="tk-btn" href="${esc(origin)}/register">Join BeWatu</a><a class="tk-btn tk-btn--quiet" href="${esc(origin)}/login">Sign in</a></p></section>
</main>
<footer class="tk-foot">Shared publicly by ${esc(t.speaker.name)}. BeWatu Bridge: wisdom worth passing on.</footer>`;
  return shell({ title: `${t.title} · ${t.speaker.name} · BeWatu Bridge`, description: desc, head, body, robots: 'index, follow' });
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}
const originOf = (req: VercelRequest) => {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '');
  return /^(www\.)?bewatu\.com$/.test(host) ? 'https://www.bewatu.com' : (/^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${host.startsWith('localhost') ? 'http' : 'https'}://${host}` : 'https://www.bewatu.com');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Method not allowed');
  const origin = originOf(req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    const talk = await loadPublicTalk(getFirestore(getAdminApp()), id);
    if (!talk) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); return res.status(404).send(renderUnavailable(origin)); }
    // A minute at the edge: fast for a shared link, and a Talk taken down stops being served almost at once.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).send(renderTalkPage(talk, origin));
  } catch (e: any) {
    console.error('talks page error:', e?.code ?? e?.message);
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(500).send(renderUnavailable(origin));
  }
}
