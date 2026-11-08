// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/bridge-talks/page-tests.mjs"
// Guards the public Talk page (api/talks.ts):
//   - only a published, public, speaker-consented Talk is shown; everything else is the same plain page that names nothing
//   - the page carries the Talk and the speaker's public face, never the discussion, member ids, counts or addresses
//   - it works under the strict content policy (no inline script or style, nothing from a third party) and escapes everything
//   - link previews and search get accurate tags; structured data cannot be broken out of
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { loadPublicTalk, renderTalkPage, renderUnavailable, esc, jsonLd, safeHttps, isoDuration } from '../../api/talks.ts';
import fs from 'node:fs';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-bridge-page' });
const db = getFirestore();
const ORIGIN = 'https://www.bewatu.com';
const VIDEO = 'https://firebasestorage.googleapis.com/v0/b/b/o/bridge-talks%2Fsam%2Fv.mp4?alt=media&token=t';
const THUMB = 'https://firebasestorage.googleapis.com/v0/b/b/o/bridge-talks%2Fsam%2Ft.jpg?alt=media&token=t';
const BASE = { speakerUid: 'sam-private-uid', speakerId: 11, speakerName: 'Sam Mwangi', speakerHeadline: 'Retired COO', speakerAvatar: 'https://img.test/sam.png', speakerUsername: 'sam', title: 'What 30 years of leadership taught me about people', summary: 'Three lessons from running large teams.', category: 'leadership', keyTakeaways: ['Listen first', 'Be consistent'], durationSec: 725, videoUrl: VIDEO, thumbnailUrl: THUMB, visibility: 'public', publicConsent: true, status: 'published', publishedAt: Timestamp.fromMillis(1_800_000_000_000), likedByUids: ['u-liker-1', 'u-liker-2'], transcript: '', captionsVtt: '' };
const put = (id, o = {}) => db.collection('bridge_talks').doc(id).set({ ...BASE, ...o });
const page = async (id, o) => { await put(id, o); const t = await loadPublicTalk(db, id); return t && renderTalkPage(t, ORIGIN); };

await check('a published, public, consented Talk is shown', async () => { const h = await page('ok'); assert(h && h.includes('What 30 years of leadership') && h.includes('Sam Mwangi') && h.includes('Retired COO'), 'not shown'); });
await check('every other state is the same plain page, naming nothing', async () => {
  for (const [id, o] of [['m', { visibility: 'members' }], ['nc', { publicConsent: false }], ['d', { status: 'draft' }], ['s', { status: 'submitted' }], ['u', { status: 'unpublished' }], ['r', { status: 'rejected' }], ['a', { status: 'archived' }], ['nv', { videoUrl: 'http://insecure.test/v.mp4' }], ['nt', { title: '' }]]) {
    await put(id, o); assert((await loadPublicTalk(db, id)) === null, `${id} was shown`);
  }
  assert((await loadPublicTalk(db, 'no-such-talk')) === null, 'a missing Talk was shown');
  for (const bad of ['../x', 'a/b', '', 'x'.repeat(200), null, undefined, 42, ['a']]) assert((await loadPublicTalk(db, bad)) === null, `odd id ${String(bad).slice(0, 10)} was accepted`);
  const gone = renderUnavailable(ORIGIN);
  assert(!/What 30 years|Sam Mwangi|Retired COO/.test(gone) && /noindex/.test(gone) && /not available/.test(gone), 'unavailable page leaks or is indexable');
});
await check('the page carries nothing private: no discussion, member ids, counts, speaker uid or addresses', async () => {
  const h = await page('p', { speakerEmail: 'sam.private@home.test', ownerEmail: 'x@y.test' });
  for (const s of ['sam-private-uid', 'u-liker', 'likedByUids', 'sam.private@home.test', 'x@y.test', 'comments', '"11"', 'speakerId']) assert(!h.includes(s), `leaked ${s}`);
  assert(!/\b\d+ (views|likes|comments|appreciations)\b/i.test(h), 'shows a count');
  assert(/members discuss each talk/i.test(h) && /Join BeWatu/.test(h), 'does not point to membership for the discussion');
});
await check('it works under the strict content policy', async () => {
  const h = await page('csp', { captionsVtt: 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello', transcript: 'Words.' });
  assert(!/<script(?![^>]*(src=|type="application\/ld\+json"))/i.test(h), 'inline script'); assert(!/<style|\sstyle=|\son[a-z]+=/i.test(h), 'inline style or handler');
  const hosts = [...h.matchAll(/(?:src|href|poster|content)="(https?:\/\/[^"/]+)/g)].map(m => m[1]);
  const allowed = new Set([ORIGIN, 'https://firebasestorage.googleapis.com', 'https://img.test']);
  for (const x of hosts) assert(allowed.has(x), `third party host ${x}`);
  assert(h.includes('/talk-page/talk.css') && h.includes('/talk-page/talk.js') && /name="referrer" content="no-referrer"/.test(h), 'assets or referrer');
});
await check('link previews and search get accurate tags', async () => {
  const h = await page('og');
  for (const s of [`<link rel="canonical" href="${ORIGIN}/talks/og">`, 'og:title" content="What 30 years', `og:image" content="${THUMB.replace(/&/g, "&amp;")}`, 'og:type" content="video.other"', 'twitter:card" content="summary_large_image"', 'content="index, follow"']) assert(h.includes(s), `missing ${s}`);
  const noimg = await page('og2', { thumbnailUrl: null }); assert(noimg.includes('twitter:card" content="summary"') && !noimg.includes('og:image'), 'no-thumbnail tags');
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert(ld['@type'] === 'VideoObject' && ld.duration === 'PT12M5S' && ld.name.startsWith('What 30') && ld.author.name === 'Sam Mwangi' && ld.author.url === `${ORIGIN}/be/sam` && ld.contentUrl === VIDEO, JSON.stringify(ld));
});
await check('a long summary is trimmed for previews, not for the page', async () => {
  const h = await page('long', { summary: 'word '.repeat(80).trim() }); const d = h.match(/name="description" content="([^"]*)"/)[1]; assert(d.length <= 201 && d.endsWith('…'), `${d.length}`);
});
await check('everything is escaped, and structured data cannot be broken out of', async () => {
  const evil = '"><script>alert(1)</script>';
  const h = await page('x', { title: evil, summary: evil, speakerName: evil, speakerHeadline: evil, keyTakeaways: [evil], transcript: evil, category: evil });
  assert(!h.includes('<script>alert') && !h.includes('"><script'), 'unescaped markup'); assert((h.match(/<\/script>/g) ?? []).length === 2, `script tag count ${(h.match(/<\/script>/g) ?? []).length}`);
  const ld = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]; assert(!/<|>/.test(ld) && JSON.parse(ld).name.includes('<script>'), 'structured data');
  assert(jsonLd({ a: '</script><!--' }).indexOf('<') === -1, 'jsonLd');
});
await check('the speaker links to their profile only when they have a public one', async () => {
  const withP = await page('pr'); assert(withP.includes(`href="${ORIGIN}/be/sam"`), 'no link'); const without = await page('pr2', { speakerUsername: null }); assert(!without.includes('/be/'), 'link without a public profile');
  const weird = await page('pr3', { speakerUsername: 'a b/<x>' }); assert(!weird.includes('<x>') && weird.includes('/be/a%20b%2F%3Cx%3E'), 'username not encoded');
});
await check('captions are carried as text for the player, and absent when there are none', async () => {
  const h = await page('cap', { captionsVtt: 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello "there"' }); assert(/id="tk-vtt" hidden data-vtt="WEBVTT[^"]*Hello &quot;there&quot;/.test(h), 'captions missing or unescaped'); assert(!(await page('cap2')).includes('tk-vtt'), 'captions holder without captions');
  const js = fs.readFileSync('public/talk-page/talk.js', 'utf8'); assert(/createObjectURL/.test(js) && !/https?:\/\//.test(js) && !/fetch|XMLHttp/.test(js), 'the script reaches out');
});
await check('the page is usable: one h1, a skip link, a labelled player, real links', async () => {
  const h = await page('a11y'); assert((h.match(/<h1/g) ?? []).length === 1 && /class="tk-skip" href="#talk"/.test(h) && /<video controls playsinline preload="none"/.test(h) && /aria-label="What 30/.test(h) && /<html lang="en">/.test(h), 'structure');
  assert(!/autoplay/i.test(h), 'autoplays');
});
await check('helpers: safeHttps, isoDuration, esc', async () => {
  assert(safeHttps('http://x.test') === null && safeHttps('javascript:1') === null && safeHttps('https://u:p@x.test') === null && !!safeHttps('https://x.test/a'), 'safeHttps');
  assert(isoDuration(65) === 'PT1M5S' && isoDuration(3725) === 'PT1H2M5S' && isoDuration(-1) === 'PT0M0S', 'isoDuration'); assert(esc(`<&>"'`) === '&lt;&amp;&gt;&quot;&#39;', 'esc');
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
