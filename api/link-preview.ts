// api/link-preview.ts
// ─────────────────────────────────────────────────────────────────────────────
// Turns an article URL pasted into the post composer into a small preview card
// (headline, source, image, short description) using the page's Open Graph tags.
//
// This route makes the server fetch a URL a user chose, so the work is mostly
// about NOT being tricked into fetching the wrong thing (SSRF):
//   - http/https only, no embedded credentials, ports 80/443 only.
//   - The address is checked when the socket connects (custom `lookup`), so the
//     address that was validated is the address that is used. Resolving first
//     and connecting later would let a hostile DNS server answer "public" to
//     the check and "169.254.169.254" to the connection (DNS rebinding).
//   - Every address the name resolves to must be public; loopback, private,
//     link-local (cloud metadata), CGNAT, multicast, reserved and the IPv6
//     equivalents (including IPv4-mapped forms) are refused.
//   - Redirects are followed by hand, at most 3, and each hop gets all of the
//     same checks. An https page may not redirect to plain http.
//   - 5s total, 512 KB of HTML at most (decompressed too), HTML content types
//     only. Only the <head> metadata is read; nothing else is kept or stored.
//   - The og:image is never fetched here; it is returned as an https URL whose
//     host also has to resolve to public addresses.
//   - Failures return a generic { ok: false }: no detail about what the server
//     could or could not reach.
//
// Results (and failures, for less time) are cached in link_previews/{sha256(url)},
// which is deny-all in firestore.rules (server only). Callers must be signed in
// and are rate limited (link_preview_rate_limits, also server only).
//
// POST /api/link-preview
//   Headers: Authorization: Bearer <idToken>
//   Body:    { url: string }
//   Returns: { ok: true, preview: { url, title, description?, image?, siteName?, hostname } }
//         or { ok: false }
//
// Self-contained on purpose: this repo is "type": "module" on Vercel, where
// relative imports between api/ files do not resolve reliably.
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

// ── Limits ────────────────────────────────────────────────────────────────────
const MAX_URL_LENGTH      = 2048;
const MAX_REDIRECTS       = 3;
const TOTAL_TIMEOUT_MS    = 5000;
const MAX_HTML_BYTES      = 512 * 1024;
const CACHE_OK_MS         = 24 * 60 * 60 * 1000;
const CACHE_FAIL_MS       = 60 * 60 * 1000;
const RATE_WINDOW_MS      = 60 * 1000;
const RATE_MAX_PER_WINDOW = 20;

const MAX_TITLE       = 300;
const MAX_DESCRIPTION = 300;
const MAX_SITE_NAME   = 100;

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  hostname: string;
}

// ── Address policy ────────────────────────────────────────────────────────────

/** Only public, globally-routable unicast addresses are acceptable. */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

function isPublicV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = p;
  if (a === 0) return false;                              // "this" network
  if (a === 10) return false;                             // private
  if (a === 100 && b >= 64 && b <= 127) return false;    // CGNAT
  if (a === 127) return false;                            // loopback
  if (a === 169 && b === 254) return false;              // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;     // private
  if (a === 192 && b === 0 && c === 0) return false;     // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false;     // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false;   // 6to4 relay
  if (a === 192 && b === 168) return false;              // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;  // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false;   // TEST-NET-3
  if (a >= 224) return false;                             // multicast, reserved, broadcast
  return true;
}

function isPublicV6(ip: string): boolean {
  const bytes = parseV6(ip);
  if (!bytes) return false;
  const allZeroUntil = (n: number) => bytes.slice(0, n).every(x => x === 0);
  // ::  and ::1
  if (allZeroUntil(15) && (bytes[15] === 0 || bytes[15] === 1)) return false;
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d -> judge the embedded v4
  if (allZeroUntil(10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPublicV4(bytes.slice(12).join('.'));
  if (allZeroUntil(12)) return isPublicV4(bytes.slice(12).join('.'));
  // NAT64 64:ff9b::/96 -> judge the embedded v4
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every(x => x === 0)) {
    return isPublicV4(bytes.slice(12).join('.'));
  }
  // Only 2000::/3 is global unicast today; everything else is not for us.
  if ((bytes[0] & 0xe0) !== 0x20) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false; // documentation
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isPublicV4(bytes.slice(2, 6).join('.'));        // 6to4 embeds a v4
  return true;
}

/** Expands any textual IPv6 address to 16 bytes, or null if it isn't one. */
function parseV6(input: string): number[] | null {
  let ip = input.split('%')[0];
  if (net.isIP(ip) !== 6) return null;
  // Dotted-quad tail (::ffff:1.2.3.4) -> two hextets.
  const tail = ip.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number);
    ip = ip.slice(0, ip.length - tail[0].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest];
  const out: number[] = [];
  for (const g of groups) {
    const v = parseInt(g, 16);
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) return null;
    out.push(v >> 8, v & 0xff);
  }
  return out.length === 16 ? out : null;
}

export interface FetchPolicy {
  /** Decides whether a resolved address may be connected to. */
  allowAddress: (ip: string) => boolean;
  /** Decides whether a port may be connected to. */
  allowPort: (port: number, protocol: 'http:' | 'https:') => boolean;
  /** Name -> addresses. Injectable so tests need no network. */
  resolve: (host: string) => Promise<string[]>;
  timeoutMs: number;
}

export const DEFAULT_POLICY: FetchPolicy = {
  allowAddress: isPublicAddress,
  allowPort: (port, protocol) => (protocol === 'https:' ? port === 443 : port === 80),
  resolve: async (host) => (await dns.promises.lookup(host, { all: true, verbatim: true })).map(a => a.address),
  timeoutMs: TOTAL_TIMEOUT_MS,
};

class Refused extends Error {}

/** Parses and screens a URL string before any network activity. */
export function parseSafeUrl(raw: unknown, policy: FetchPolicy = DEFAULT_POLICY): URL {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) throw new Refused('bad url');
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Refused('bad url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Refused('scheme');
  if (u.username || u.password) throw new Refused('credentials');
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (!policy.allowPort(port, u.protocol)) throw new Refused('port');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new Refused('host');
  if (net.isIP(host)) {
    // WHATWG URL has already normalised decimal / hex / octal IPv4 forms.
    if (!policy.allowAddress(host)) throw new Refused('address');
  } else if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
          || host.endsWith('.internal') || host.endsWith('.localdomain') || !host.includes('.')) {
    throw new Refused('host');
  }
  return u;
}

/** `lookup` for http(s).request: validates at connection time and pins the result. */
export function guardedLookup(policy: FetchPolicy) {
  return (hostname: string, _opts: unknown, cb: (err: Error | null, address?: any, family?: number) => void) => {
    const opts = _opts as { all?: boolean } | undefined;
    const literal = net.isIP(hostname);
    const resolve = literal ? Promise.resolve([hostname]) : policy.resolve(hostname);
    resolve.then(addrs => {
      if (addrs.length === 0 || !addrs.every(a => policy.allowAddress(a))) {
        return cb(new Refused('address'));
      }
      const first = addrs[0];
      const family = net.isIP(first);
      if (opts?.all) return cb(null, [{ address: first, family }]);
      cb(null, first, family);
    }, err => cb(err));
  };
}

// ── Fetching ──────────────────────────────────────────────────────────────────

interface Page { finalUrl: URL; html: string }

function requestOnce(u: URL, policy: FetchPolicy, signalDeadline: number): Promise<
  { kind: 'redirect'; location: string } | { kind: 'page'; html: string }
> {
  return new Promise((resolve, reject) => {
    const remaining = signalDeadline - Date.now();
    if (remaining <= 0) return reject(new Refused('timeout'));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'GET',
      lookup: guardedLookup(policy) as any,
      timeout: remaining,
      agent: false, // never reuse a connection that was opened under another check
      headers: {
        'User-Agent': 'BeWatuLinkPreview/1.0 (+https://www.bewatu.com)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }, res => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ kind: 'redirect', location: String(res.headers.location) });
      }
      if (status < 200 || status >= 300) { res.resume(); return reject(new Refused('status')); }
      const type = String(res.headers['content-type'] ?? '').toLowerCase();
      if (!/^(text\/html|application\/xhtml\+xml)\b/.test(type)) { res.resume(); return reject(new Refused('type')); }

      const enc = String(res.headers['content-encoding'] ?? 'identity').toLowerCase().trim();
      let source: NodeJS.ReadableStream = res;
      if (enc === 'gzip' || enc === 'x-gzip') source = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') source = res.pipe(zlib.createInflate());
      else if (enc === 'br') source = res.pipe(zlib.createBrotliDecompress());
      else if (enc !== 'identity' && enc !== '') { res.resume(); return reject(new Refused('encoding')); }

      const chunks: Buffer[] = [];
      let size = 0;
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        // Stop the decompressor as well as the socket, or it keeps inflating what it already holds.
        (source as any).destroy?.();
        res.destroy();
        resolve({ kind: 'page', html: Buffer.concat(chunks).toString('utf8') });
      };
      source.on('data', (c: Buffer) => {
        if (done) return;
        chunks.push(c);
        size += c.length;
        // The metadata lives in <head>; stop once it has ended or the cap is hit.
        if (size >= MAX_HTML_BYTES || /<\/head\s*>/i.test(c.toString('latin1'))) finish();
      });
      source.on('end', finish);
      source.on('error', err => { if (!done) { done = true; reject(err); } });
    });
    req.on('timeout', () => req.destroy(new Refused('timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchPage(rawUrl: string, policy: FetchPolicy = DEFAULT_POLICY): Promise<Page> {
  const deadline = Date.now() + policy.timeoutMs;
  let current = parseSafeUrl(rawUrl, policy);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await requestOnce(current, policy, deadline);
    if (result.kind === 'page') return { finalUrl: current, html: result.html };
    // Redirect: re-run every check on the target.
    let next: URL;
    try { next = new URL(result.location, current); } catch { throw new Refused('redirect'); }
    next.hash = '';
    if (current.protocol === 'https:' && next.protocol === 'http:') throw new Refused('downgrade');
    current = parseSafeUrl(next.toString(), policy);
  }
  throw new Refused('too many redirects');
}

// ── Metadata extraction ──────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  // eslint-disable-next-line no-control-regex
  const t = decodeEntities(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

export function extractMetadata(html: string, pageUrl: URL): Omit<LinkPreview, 'url' | 'hostname'> & { rawImage?: string } {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const a = attrs(m[1]);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    if (key && a.content !== undefined) meta[key] ??= a.content;
  }
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const title = clean(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, MAX_TITLE);
  const description = clean(meta['og:description'] ?? meta['twitter:description'] ?? meta['description'], MAX_DESCRIPTION);
  const siteName = clean(meta['og:site_name'], MAX_SITE_NAME);
  const rawImage = (meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['og:image:url'] ?? meta['twitter:image'])?.trim();

  let image: string | undefined;
  if (rawImage) {
    try {
      const abs = new URL(decodeEntities(rawImage), pageUrl);
      // https only (the app is https; plain http would be blocked as mixed content),
      // no credentials, no odd ports.
      if (abs.protocol === 'https:' && !abs.username && !abs.password && (abs.port === '' || abs.port === '443')
          && abs.toString().length <= MAX_URL_LENGTH) {
        image = abs.toString();
      }
    } catch { /* unusable image -> text card */ }
  }
  return { title: title ?? '', description, siteName, image, rawImage };
}

/** True when the image host resolves only to public addresses (never fetched here). */
async function imageHostIsPublic(image: string, policy: FetchPolicy): Promise<boolean> {
  try {
    const u = new URL(image);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) return policy.allowAddress(host);
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false;
    const addrs = await policy.resolve(host);
    return addrs.length > 0 && addrs.every(a => policy.allowAddress(a));
  } catch { return false; }
}

export async function buildPreview(rawUrl: string, policy: FetchPolicy = DEFAULT_POLICY): Promise<LinkPreview | null> {
  try {
    const page = await fetchPage(rawUrl, policy);
    const meta = extractMetadata(page.html, page.finalUrl);
    if (!meta.title) return null; // nothing worth a card; the composer keeps the plain link
    const original = new URL(rawUrl.trim());
    let image = meta.image;
    if (image && !(await imageHostIsPublic(image, policy))) image = undefined;
    const hostname = original.hostname.replace(/^www\./, '');
    const preview: LinkPreview = { url: original.toString(), title: meta.title, hostname };
    if (meta.description) preview.description = meta.description;
    if (image) preview.image = image;
    if (meta.siteName) preview.siteName = meta.siteName;
    return preview;
  } catch {
    return null;
  }
}

// ── Cache + rate limit ───────────────────────────────────────────────────────

export function cacheKey(url: string): string {
  // Normalise lightly so trivial differences share an entry: host case and the fragment.
  const u = new URL(url.trim());
  u.hash = '';
  return createHash('sha256').update(u.toString()).digest('hex');
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function getLinkPreview(
  db: Firestore,
  uid: string,
  rawUrl: unknown,
  policy: FetchPolicy = DEFAULT_POLICY,
  now: number = Date.now(),
): Promise<LinkPreview | null> {
  const u = parseSafeUrl(rawUrl, policy); // throws Refused -> 400
  const url = u.toString();

  // Cache first: a hit costs no outbound request and does not count against the limit.
  const ref = db.collection('link_previews').doc(cacheKey(url));
  const cached = (await ref.get()).data() as { preview?: LinkPreview | null; expiresAt?: Timestamp } | undefined;
  if (cached?.expiresAt && cached.expiresAt.toMillis() > now) return cached.preview ?? null;

  const rl = db.collection('link_preview_rate_limits').doc(uid);
  await db.runTransaction(async tx => {
    const existing = (await tx.get(rl)).data() as { windowStart?: number; count?: number } | undefined;
    const inWindow = !!existing?.windowStart && now - existing.windowStart < RATE_WINDOW_MS;
    const count = inWindow ? (existing?.count ?? 0) : 0;
    if (count >= RATE_MAX_PER_WINDOW) throw new HttpError(429, 'Too many link previews. Please wait a moment.');
    tx.set(rl, { windowStart: inWindow ? existing!.windowStart : now, count: count + 1 });
  });

  const preview = await buildPreview(url, policy);
  await ref.set({
    preview: preview ?? null,
    fetchedAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + (preview ? CACHE_OK_MS : CACHE_FAIL_MS)),
  });
  return preview;
}

// ── Handler ───────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com'];

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(authHeader.split('Bearer ')[1]);
    const preview = await getLinkPreview(getFirestore(app), decoded.uid, req.body?.url);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(preview ? { ok: true, preview } : { ok: false });
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof Refused) return res.status(400).json({ error: 'That link cannot be previewed.' });
    if (String(err?.code ?? '').startsWith('auth/')) return res.status(401).json({ error: 'Unauthorized' });
    console.error('link-preview error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
