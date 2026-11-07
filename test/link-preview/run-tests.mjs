// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/link-preview/run-tests.mjs"
// Guards api/link-preview.ts: the SSRF defences first, then metadata extraction, then cache + rate limit.
// Real sockets are used for the fetch behaviour (local servers on 127.0.0.1). The default policy would
// refuse 127.0.0.1 and ports other than 80/443, so the tests loosen ONLY those two rules, as a function
// argument; nothing a caller can send reaches that argument in the real route.
import http from 'node:http';
import zlib from 'node:zlib';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  isPublicAddress, parseSafeUrl, guardedLookup, fetchPage, extractMetadata, buildPreview,
  getLinkPreview, cacheKey, DEFAULT_POLICY, decodeEntities, HttpError,
} from '../../api/link-preview.ts';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const rejects = async (p, m) => { try { await p; } catch { return; } throw new Error(m); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-link-preview' });
const db = getFirestore();

// ── a local web with a few pages ──
// Built before any measuring: 60 MB of 'A' behind a tiny head, gzip'd to ~60 KB.
const BOMB = zlib.gzipSync(Buffer.from(`<html><head><meta property="og:title" content="Bomb head"></head><body>` + 'A'.repeat(60 * 1024 * 1024)));
const hits = [];
const html = (head) => `<!doctype html><html><head>${head}</head><body>${'x'.repeat(100)}</body></html>`;
const server = http.createServer((req, res) => {
  hits.push(req.url);
  const send = (status, headers, body) => { res.writeHead(status, headers); res.end(body); };
  const H = { 'content-type': 'text/html; charset=utf-8' };
  switch (req.url.split('?')[0]) {
    case '/article': return send(200, H, html(`
      <title>Fallback title</title>
      <meta property="og:title" content="Why &quot;weekly active&quot; beats signups &amp; clicks">
      <meta property="og:description" content="A short   description
        across lines.">
      <meta property="og:site_name" content="The Daily Build">
      <meta property="og:image" content="/img/cover.png">`));
    case '/noimage': return send(200, H, html(`<meta property="og:title" content="Text only"><meta property="og:site_name" content="Plain Press">`));
    case '/titleonly': return send(200, H, html(`<title>Just a title tag</title>`));
    case '/empty': return send(200, H, html(`<meta name="robots" content="noindex">`));
    case '/httpimage': return send(200, H, html(`<meta property="og:title" content="T"><meta property="og:image" content="http://cdn.example.com/a.png">`));
    case '/jsimage': return send(200, H, html(`<meta property="og:title" content="T"><meta property="og:image" content="javascript:alert(1)">`));
    case '/privimage': return send(200, H, html(`<meta property="og:title" content="T"><meta property="og:image" content="https://169.254.169.254/latest/meta-data">`));
    case '/hop1': return send(302, { location: '/hop2' }, '');
    case '/hop2': return send(302, { location: '/article' }, '');
    case '/loop': return send(302, { location: '/loop' }, '');
    case '/to-metadata': return send(302, { location: 'http://169.254.169.254/latest/meta-data/' }, '');
    case '/to-private': return send(301, { location: 'http://10.0.0.5/admin' }, '');
    case '/to-file': return send(302, { location: 'file:///etc/passwd' }, '');
    case '/to-localhost-name': return send(302, { location: 'http://localhost/secret' }, '');
    case '/to-decimal': return send(302, { location: 'http://2130706433/' }, '');
    case '/to-other-port': return send(302, { location: `http://127.0.0.1:${OTHER_PORT}/secret-service` }, '');
    case '/to-credentials': return send(302, { location: `http://user:pw@127.0.0.1:${PORT}/article` }, '');
    case '/to-v6': return send(302, { location: 'http://[::ffff:127.0.0.1]/' }, '');
    case '/pdf': return send(200, { 'content-type': 'application/pdf' }, '%PDF-1.4');
    case '/json': return send(200, { 'content-type': 'application/json' }, '{"og:title":"x"}');
    case '/404': return send(404, H, 'nope');
    case '/gz': return send(200, { ...H, 'content-encoding': 'gzip' }, zlib.gzipSync(html(`<meta property="og:title" content="Compressed title">`)));
    case '/bomb': return send(200, { ...H, 'content-encoding': 'gzip' }, BOMB);
    case '/huge': { // 3 MB of body with the title far past the cap
      const filler = '<!-- ' + 'x'.repeat(3 * 1024 * 1024) + ' -->';
      return send(200, H, `<html><head>${filler}<meta property="og:title" content="Too far down"></head></html>`);
    }
    case '/early': return send(200, H, `<html><head><meta property="og:title" content="Early title"></head><body>${'y'.repeat(2 * 1024 * 1024)}</body></html>`);
    case '/slow': { res.writeHead(200, H); res.write('<html><head>'); return; /* never ends */ }
    case '/unknown-encoding': return send(200, { ...H, 'content-encoding': 'compress' }, 'zzz');
    default: return send(404, H, '');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
// A second live server on a port the policy does not allow: if a redirect reaches it, it records the visit.
const otherHits = [];
const other = http.createServer((q, r) => { otherHits.push(q.url); r.writeHead(200, { 'content-type': 'text/html' }); r.end('<html><head><meta property="og:title" content="Reached the wrong port"></head></html>'); });
await new Promise(r => other.listen(0, '127.0.0.1', r));
const OTHER_PORT = other.address().port;
const base = `http://127.0.0.1:${PORT}`;

// Test policy: identical to production EXCEPT that this one loopback address and this one port are allowed.
const testPolicy = {
  ...DEFAULT_POLICY,
  allowAddress: (ip) => ip === '127.0.0.1' || isPublicAddress(ip),
  allowPort: (p) => p === PORT || DEFAULT_POLICY.allowPort(p, 'https:') || DEFAULT_POLICY.allowPort(p, 'http:'),
  resolve: async (h) => (h === 'article.test' ? ['127.0.0.1'] : h === 'cdn.example.com' ? ['93.184.216.34'] : h === 'evil.test' ? ['10.1.2.3'] : DEFAULT_POLICY.resolve(h)),
  timeoutMs: 1500,
};

console.log('== address policy ==');
const blocked = ['0.0.0.0', '10.0.0.1', '10.255.255.255', '100.64.0.1', '127.0.0.1', '127.1.2.3', '169.254.169.254', '172.16.0.1', '172.31.255.255',
  '192.0.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
  '::', '::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::7f00:1', '64:ff9b::7f00:1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fec0::1', 'ff02::1',
  '2001:db8::1', '2002:7f00:1::', '2002:a9fe:a9fe::1', '100::1', 'not-an-ip', ''];
const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1', '192.0.3.1', '198.17.0.1', '198.20.0.1',
  '::ffff:8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4009:81f::200e'];
await check(`${blocked.length} loopback / private / link-local / reserved / mapped addresses are refused`, async () => {
  const bad = blocked.filter(ip => isPublicAddress(ip));
  assert(bad.length === 0, `treated as public: ${bad.join(', ')}`);
});
await check(`${allowed.length} ordinary public addresses (incl. near-miss ranges) are accepted`, async () => {
  const bad = allowed.filter(ip => !isPublicAddress(ip));
  assert(bad.length === 0, `treated as non-public: ${bad.join(', ')}`);
});

console.log('== URL screening (production policy) ==');
const badUrls = {
  'file scheme': 'file:///etc/passwd', 'ftp scheme': 'ftp://example.com/a', 'javascript scheme': 'javascript:alert(1)', 'data scheme': 'data:text/html,hi',
  'credentials': 'https://user:pw@example.com/a', 'username only': 'https://user@example.com/a',
  'localhost': 'http://localhost/', 'localhost subdomain': 'http://app.localhost/', 'loopback ip': 'http://127.0.0.1/', 'metadata ip': 'http://169.254.169.254/latest/meta-data/',
  'private ip': 'http://192.168.0.10/', 'decimal ip': 'http://2130706433/', 'hex ip': 'http://0x7f000001/', 'octal ip': 'http://0177.0.0.1/', 'short ip': 'http://127.1/',
  'ipv6 loopback': 'http://[::1]/', 'ipv4-mapped v6': 'http://[::ffff:127.0.0.1]/', 'ipv6 unique-local': 'http://[fd00::1]/',
  'non-standard port': 'https://example.com:8443/a', 'ssh port': 'http://example.com:22/', 'redis port': 'http://example.com:6379/',
  'single-label host': 'http://intranet/', '.internal host': 'http://metadata.google.internal/', '.local host': 'http://printer.local/',
  'empty': '', 'not a url': 'not a url', 'too long': 'https://example.com/' + 'a'.repeat(2100), 'number': 42, 'null': null, 'object': { href: 'https://example.com' },
};
for (const [name, u] of Object.entries(badUrls)) {
  await check(`refused: ${name}`, async () => { try { parseSafeUrl(u); } catch { return; } throw new Error('accepted'); });
}
await check('ordinary https / http article URLs are accepted', async () => {
  parseSafeUrl('https://www.example.com/news/2026/story?id=3#top');
  parseSafeUrl('http://example.com/a');
  parseSafeUrl('https://example.com:443/a');
});

console.log('== connect-time check (DNS rebinding) ==');
const lookup = (policy, host) => new Promise(r => guardedLookup(policy)(host, {}, (err, addr) => r({ err, addr })));
await check('a name that resolves to a private address is refused when connecting', async () => {
  const r = await lookup(testPolicy, 'evil.test'); assert(r.err && !r.addr, 'connected');
});
await check('a name with ANY private address among public ones is refused', async () => {
  const mixed = { ...testPolicy, resolve: async () => ['93.184.216.34', '10.0.0.9'] };
  const r = await lookup(mixed, 'mixed.example.com'); assert(r.err, 'accepted a mixed answer');
});
await check('the address that passed the check is the one handed to the socket (public)', async () => {
  const r = await lookup(testPolicy, 'cdn.example.com'); assert(!r.err && r.addr === '93.184.216.34', `${r.err?.message} ${r.addr}`);
});
await check('a resolver that flips from public to private is judged each time it is asked', async () => {
  let n = 0;
  const flip = { ...testPolicy, resolve: async () => (n++ === 0 ? ['93.184.216.34'] : ['169.254.169.254']) };
  const first = await lookup(flip, 'rebind.example.com');
  const second = await lookup(flip, 'rebind.example.com');
  assert(!first.err && second.err, 'second lookup was not refused');
});
await check('production policy refuses a connection to 127.0.0.1 even if the URL slipped through', async () => {
  const r = await lookup(DEFAULT_POLICY, '127.0.0.1'); assert(r.err, 'connected');
});

console.log('== fetching ==');
await check('fetches a page and reads its Open Graph tags', async () => {
  const p = await buildPreview(`${base}/article`, testPolicy);
  assert(p, 'no preview');
  assert(p.title === 'Why "weekly active" beats signups & clicks', `title: ${p.title}`);
  assert(p.description === 'A short description across lines.', `desc: ${p.description}`);
  assert(p.siteName === 'The Daily Build', `site: ${p.siteName}`);
  assert(p.url === `${base}/article`, `url: ${p.url}`);
});
await check('a relative og:image on a non-https page is dropped (http images would be blocked as mixed content)', async () => {
  const p = await buildPreview(`${base}/article`, testPolicy); assert(!p.image, `image: ${p.image}`);
});
await check('extractMetadata resolves a relative og:image against the page and keeps https', async () => {
  const m = extractMetadata('<meta property="og:title" content="T"><meta property="og:image" content="/img/cover.png">', new URL('https://news.example.com/a/b'));
  assert(m.image === 'https://news.example.com/img/cover.png', m.image);
});
await check('og:image prefers secure_url, falls back to twitter:image', async () => {
  const a = extractMetadata('<meta property="og:title" content="T"><meta property="og:image" content="http://a.com/1.png"><meta property="og:image:secure_url" content="https://a.com/2.png">', new URL('https://a.com/'));
  const b = extractMetadata('<meta property="og:title" content="T"><meta name="twitter:image" content="https://a.com/3.png">', new URL('https://a.com/'));
  assert(a.image === 'https://a.com/2.png' && b.image === 'https://a.com/3.png', `${a.image} ${b.image}`);
});
await check('no image -> a text-only preview with title and source', async () => {
  const p = await buildPreview(`${base}/noimage`, testPolicy);
  assert(p && p.title === 'Text only' && p.siteName === 'Plain Press' && !('image' in p), JSON.stringify(p));
});
await check('falls back to the <title> tag, and the hostname stands in for a missing site name', async () => {
  const p = await buildPreview(`${base}/titleonly`, testPolicy);
  assert(p && p.title === 'Just a title tag' && !p.siteName && p.hostname === '127.0.0.1', JSON.stringify(p));
});
await check('a page with no usable title gives no preview (the composer keeps the plain link)', async () => {
  assert((await buildPreview(`${base}/empty`, testPolicy)) === null, 'got a preview');
});
await check('http, javascript: and metadata-address images are never returned', async () => {
  for (const path of ['/httpimage', '/jsimage', '/privimage']) {
    const p = await buildPreview(`${base}${path}`, testPolicy); assert(p && !p.image, `${path}: ${p?.image}`);
  }
});
await check('an https image whose host resolves to a private address is dropped', async () => {
  const m = extractMetadata('<meta property="og:title" content="T"><meta property="og:image" content="https://evil.test/a.png">', new URL('https://a.com/'));
  assert(m.image === 'https://evil.test/a.png', 'extraction should keep it');
  const html = `<meta property="og:title" content="T"><meta property="og:image" content="https://evil.test/a.png">`;
  // route it through buildPreview via a page that serves this
  const s = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(`<html><head>${html}</head></html>`); });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  try {
    const p = await buildPreview(`http://127.0.0.1:${port}/`, { ...testPolicy, allowPort: () => true });
    assert(p && !p.image, `image kept: ${p?.image}`);
  } finally { s.close(); }
});
await check('follows up to 3 redirects', async () => {
  const p = await buildPreview(`${base}/hop1`, testPolicy); assert(p?.title?.includes('weekly active'), JSON.stringify(p));
});
await check('a redirect loop ends', async () => { assert((await buildPreview(`${base}/loop`, testPolicy)) === null, 'previewed'); });
for (const [name, path] of [['cloud metadata address', '/to-metadata'], ['a private address', '/to-private'], ['a file: URL', '/to-file'], ['localhost by name', '/to-localhost-name'], ['a decimal-encoded loopback', '/to-decimal'], ['an IPv4-mapped IPv6 loopback', '/to-v6']]) {
  await check(`a redirect to ${name} is refused`, async () => {
    hits.length = 0;
    await rejects(fetchPage(`${base}${path}`, testPolicy), 'followed the redirect');
  });
}
await check('a redirect to a live service on a port the policy does not allow is refused, and the service is never contacted', async () => {
  await rejects(fetchPage(`${base}/to-other-port`, testPolicy), 'followed the redirect');
  assert(otherHits.length === 0, `the other service was hit: ${otherHits.join(',')}`);
});
await check('a redirect to a URL carrying credentials is refused even though the address is reachable', async () => {
  await rejects(fetchPage(`${base}/to-credentials`, testPolicy), 'followed the redirect');
});
await check('nothing was requested from the redirect targets', async () => {
  assert(!hits.some(h => h.includes('secret') || h.includes('meta-data')), hits.join(','));
});
await check('non-HTML (pdf, json), error statuses and unknown encodings give nothing', async () => {
  for (const p of ['/pdf', '/json', '/404', '/unknown-encoding']) assert((await buildPreview(`${base}${p}`, testPolicy)) === null, `${p} previewed`);
});
await check('a gzip-compressed page is read', async () => {
  const p = await buildPreview(`${base}/gz`, testPolicy); assert(p?.title === 'Compressed title', JSON.stringify(p));
});
await check('a decompression bomb is cut off and does not hang or exhaust memory', async () => {
  const t0 = Date.now(), before = process.memoryUsage().rss;
  const p = await buildPreview(`${base}/bomb`, testPolicy);
  const grew = (process.memoryUsage().rss - before) / 1048576;
  assert(Date.now() - t0 < 2500, 'took too long');
  assert(grew < 40, `memory grew ${grew.toFixed(0)} MB`);
  assert(p?.title === 'Bomb head', 'did not read the head before cutting');
});
await check('a 3 MB page is cut at the cap: metadata beyond 512 KB is not read', async () => {
  assert((await buildPreview(`${base}/huge`, testPolicy)) === null, 'read past the cap');
});
await check('reading stops at </head> on a page with a huge body', async () => {
  const t0 = Date.now(); const p = await buildPreview(`${base}/early`, testPolicy);
  assert(p?.title === 'Early title', 'no title'); assert(Date.now() - t0 < 1000, 'read the whole body');
});
await check('a server that never finishes is abandoned at the timeout', async () => {
  const t0 = Date.now(); const p = await buildPreview(`${base}/slow`, testPolicy);
  assert(p === null, 'previewed'); assert(Date.now() - t0 < 3000, `took ${Date.now() - t0}ms`);
});
await check('the production policy refuses to connect to the test server at all', async () => {
  assert((await buildPreview(`${base}/article`, DEFAULT_POLICY)) === null, 'fetched a loopback address');
});

console.log('== metadata hygiene ==');
await check('entities are decoded; control characters and runaway lengths are cleaned', async () => {
  assert(decodeEntities('A &amp; B &lt;i&gt; &#8217; &#x2014; &bogus; &#0; &#xD800;') === 'A & B <i> ’ — &bogus;  ', decodeEntities('A &amp; B &lt;i&gt; &#8217; &#x2014; &bogus; &#0; &#xD800;'));
  const m = extractMetadata(`<meta property="og:title" content="${'T'.repeat(500)}"><meta property="og:description" content="a\u0000b\u0007c ${'d'.repeat(600)}">`, new URL('https://a.com/'));
  assert(m.title.length <= 300 && m.title.endsWith('…'), `title ${m.title.length}`);
  assert(m.description.length <= 300 && !/[\u0000-\u001f]/.test(m.description), 'description not cleaned');
});
await check('tags in a title stay as literal text (rendered by React, never as HTML)', async () => {
  const m = extractMetadata('<meta property="og:title" content="&lt;script&gt;alert(1)&lt;/script&gt;">', new URL('https://a.com/'));
  assert(m.title === '<script>alert(1)</script>', m.title);
});
await check('meta tags in the body, past </head>, are ignored', async () => {
  const m = extractMetadata('<head><meta property="og:title" content="Real"></head><body><meta property="og:title" content="Injected"></body>', new URL('https://a.com/'));
  assert(m.title === 'Real', m.title);
});
await check('single-quoted and unquoted attributes and either attribute order are read', async () => {
  const m = extractMetadata(`<meta content='Single' property='og:title'><meta property=og:site_name content=Plain>`, new URL('https://a.com/'));
  assert(m.title === 'Single' && m.siteName === 'Plain', JSON.stringify(m));
});
await check('only title, description, source and image are produced (no article body text)', async () => {
  const p = await buildPreview(`${base}/article`, testPolicy);
  assert(Object.keys(p).every(k => ['url', 'title', 'description', 'image', 'siteName', 'hostname'].includes(k)), Object.keys(p).join(','));
});

console.log('== cache and rate limit (real Firestore) ==');
const hitsFor = (p) => hits.filter(h => h.startsWith(p)).length;
await check('the first request fetches and stores; the second is served from cache with no outbound request', async () => {
  hits.length = 0; const u = `${base}/article?cache=1`;
  const a = await getLinkPreview(db, 'cacheUser', u, testPolicy);
  const b = await getLinkPreview(db, 'cacheUser', u, testPolicy);
  assert(a && b && a.title === b.title, 'no preview'); assert(hitsFor('/article?cache=1') === 1, `fetched ${hitsFor('/article?cache=1')} times`);
  const stored = (await db.collection('link_previews').doc(cacheKey(u)).get()).data();
  assert(stored.preview.title === a.title && stored.expiresAt, 'cache doc missing fields');
});
await check('the cache holds only the preview fields, never page content', async () => {
  const stored = (await db.collection('link_previews').doc(cacheKey(`${base}/article?cache=1`)).get()).data();
  assert(Object.keys(stored).sort().join() === 'expiresAt,fetchedAt,preview', Object.keys(stored).join());
  assert(JSON.stringify(stored).length < 2000, 'cache doc is large');
});
await check('a fragment does not create a separate cache entry', async () => {
  assert(cacheKey(`${base}/a#x`) === cacheKey(`${base}/a#y`), 'different keys');
});
await check('failures are cached too (shorter), so a broken link is not re-fetched on every keystroke', async () => {
  hits.length = 0; const u = `${base}/empty?cache=2`;
  const a = await getLinkPreview(db, 'cacheUser2', u, testPolicy), b = await getLinkPreview(db, 'cacheUser2', u, testPolicy);
  assert(a === null && b === null, 'previewed'); assert(hitsFor('/empty?cache=2') === 1, `fetched ${hitsFor('/empty?cache=2')} times`);
  const s = (await db.collection('link_previews').doc(cacheKey(u)).get()).data();
  assert(s.preview === null, 'failure not stored as null');
});
await check('an expired entry is fetched again', async () => {
  hits.length = 0; const u = `${base}/article?cache=3`;
  await getLinkPreview(db, 'cacheUser3', u, testPolicy, Date.now() - 48 * 3600e3);
  await getLinkPreview(db, 'cacheUser3', u, testPolicy);
  assert(hitsFor('/article?cache=3') === 2, `fetched ${hitsFor('/article?cache=3')} times`);
});
await check('a member is limited to 20 uncached lookups a minute; cache hits do not count', async () => {
  let ok = 0, limited = 0;
  for (let i = 0; i < 25; i++) {
    try { await getLinkPreview(db, 'busyUser', `${base}/article?rl=${i}`, testPolicy); ok++; }
    catch (e) { if (e instanceof HttpError && e.status === 429) limited++; else throw e; }
  }
  assert(ok === 20 && limited === 5, `ok ${ok}, limited ${limited}`);
  await getLinkPreview(db, 'busyUser', `${base}/article?rl=0`, testPolicy); // cached: still served
});
await check('the limit is per member: another member is unaffected', async () => {
  const p = await getLinkPreview(db, 'quietUser', `${base}/article?rl=0`, testPolicy); assert(p, 'blocked');
});
await check('an unsafe URL is refused before the cache or the limiter are touched', async () => {
  const before = (await db.collection('link_preview_rate_limits').doc('unsafeUser').get()).exists;
  await rejects(getLinkPreview(db, 'unsafeUser', 'http://169.254.169.254/latest/meta-data/'), 'accepted');
  const after = (await db.collection('link_preview_rate_limits').doc('unsafeUser').get()).exists;
  assert(!before && !after, 'touched the limiter');
});

server.closeAllConnections?.(); server.close(); other.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
