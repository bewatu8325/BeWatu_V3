// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/portfolio/run-tests.mjs"
// Guards "Share My Work":
//   - only the member's own, externally shareable records can be picked, and every pick is re-checked on the server
//   - nothing is called verified because it was uploaded: each item carries what it really is
//   - an unlisted link: signed token, noindex, a social preview that names nobody and shows nothing about the work, honest wording
//   - expiry and switching off work on their own; edits follow the chosen update policy (live or snapshot)
//   - the page carries no inline script/style, no third-party resource, no leaked token, and escapes everything
//   - the contact form is protected (honeypot, signed timing, rate limits) and never shows the member's address
//   - visits are counted without storing who visited, and robots are not people
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  runAction, servePage, serveResume, submitContact, renderPortfolio, buildModel, loadSources, parseConfig, arenaLevel, accessOf,
  tokenFor, idFromToken, formStamp, formStampAge, visitKind, safeHttps, LEVELS, LIMITS, HttpError,
} from '../../api/portfolio.ts';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status) => { try { await p; } catch (e) { if (e instanceof HttpError && e.status === status) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('was allowed'); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-portfolio' });
const db = getFirestore();
const SECRET = 'portfolio-test-secret';
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const HUMAN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1';
let outbox = []; let mailOk = true;
const files = { 'https://firebasestorage.googleapis.com/v0/b/x/o/resume.pdf?alt=media&token=t': { ok: true, type: 'application/pdf', length: 5, body: Buffer.from('%PDF-') } };
const deps = (o = {}) => ({ db, secret: SECRET, now: NOW, mail: async m => { if (mailOk) outbox.push(m); return mailOk; }, ownerEmail: async uid => (uid === 'ann' ? 'ann.private@home.test' : null), fetchFile: async u => files[u] ?? null, ...o });
const VIDEO = 'https://firebasestorage.googleapis.com/v0/b/x/o/reels%2Fann%2F1.mp4?alt=media&token=v';

let ANN_REF; // set below, once ANN exists
const wipe = async () => { for (const c of ['portfolio_shares', 'portfolio_rate_limits']) { const s = await db.collection(c).get(); await Promise.all(s.docs.map(x => x.ref.delete())); } await db.doc('users/ann').set(ANN_REF); outbox = []; mailOk = true; };

// ── the world ──
const ANN = {
  displayName: 'Ann Okoro', headline: 'Product lead, payments', bio: 'I build payment products people trust.', industry: 'Fintech', username: 'ann', isPublic: true, photoURL: 'https://img.test/ann.png',
  skills: [{ name: 'Product Strategy', endorsements: 3 }, { name: 'SQL', endorsements: 0 }, { name: 'Negotiation', endorsements: 0 }],
  endorsements: [{ skillName: 'Product Strategy', endorsedBy: ['u2', 'u3'], unclaimedEndorsers: [{ name: 'Kim', requestId: 'r' }] }],
  verifiedSkills: [{ name: 'Negotiation', proficiency: 'Proficient', evidence: 'x' }],
  portfolio: [
    { id: 1, title: 'Payments revamp', description: 'Rebuilt checkout.', technologies: ['Stripe', 'Postgres'], url: 'https://acme.test/case', outcome: 'Conversion up 12%', aiGeneratedSummary: '' },
    { id: 2, title: 'Risky link', description: 'x', technologies: [], url: 'javascript:alert(1)', outcome: '' },
    { id: 3, title: '<script>alert(1)</script>', description: 'Tag <b>soup</b> & "quotes"', technologies: ['<img src=x>'], url: 'http://insecure.test', outcome: '' },
  ],
  verifiedAchievements: [{ id: 7, achievement: 'Led the 2024 migration', verifierName: 'Sam Lee', verifierTitle: 'CTO', verifierCompany: 'Acme' }, { id: 8, achievement: 'No verifier', verifierName: '', verifierTitle: '', verifierCompany: '' }],
  resumeUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/resume.pdf?alt=media&token=t',
};
ANN_REF = ANN;
await db.doc('users/ann').set(ANN);
await db.doc('users/bo').set({ displayName: 'Bo Private', username: 'bo', isPublic: false, headline: 'Secret', skills: [{ name: 'Go', endorsements: 0 }] });
await db.doc('users/cy').set({ displayName: 'Cy Connections', username: 'cy', isPublic: true, privacySettings: { profileVisibility: 'connections' }, skills: [{ name: 'Rust', endorsements: 0 }] });
await db.doc('users/dee').set({ displayName: 'Dee NoName', isPublic: true, skills: [] });
await db.doc('reels/r1').set({ authorUid: 'ann', videoUrl: VIDEO, thumbnailUrl: 'https://img.test/t1.jpg', pitch: 'How I run discovery', skills: ['Research'], duration: 75 });
await db.doc('reels/r2').set({ authorUid: 'ann', videoUrl: 'http://evil.test/x.mp4', pitch: 'Bad host', duration: 30 });
await db.doc('reels/r3').set({ authorUid: 'ann', videoUrl: VIDEO, pitch: 'Arena entry', skills: [], duration: 40, arenaLink: { challengeId: 'ch1', challengeTitle: 'Rethink payments', industry: 'payments', contribution: 'I led pricing.', skills: ['Pricing'], outcome: 'winner', checkedAt: NOW } });
await db.doc('reels/r4').set({ authorUid: 'ann', videoUrl: VIDEO, pitch: 'Shortlist', arenaLink: { challengeId: 'ch2', challengeTitle: 'Claims triage', industry: 'insurance', outcome: 'shortlisted' } });
await db.doc('reels/r5').set({ authorUid: 'ann', videoUrl: VIDEO, pitch: 'Just submitted', arenaLink: { challengeId: 'ch3', challengeTitle: 'Third', outcome: 'submitted' } });
await db.doc('reels/rb').set({ authorUid: 'bo', videoUrl: VIDEO, pitch: 'Bo reel' });

const FULL = (o = {}) => ({
  label: 'Acme recruiting', kind: 'unlisted', sections: ['summary', 'skills', 'projects', 'arena', 'reels', 'achievements'],
  selection: { skills: ['Product Strategy', 'SQL', 'Negotiation'], projects: ['1', '3'], arena: ['r3', 'r4', 'r5'], reels: ['r1'], achievements: ['7'] },
  intro: 'I turn messy payment problems into simple products.', resume: true, contact: { mode: 'form' }, updatePolicy: 'live', expiry: '30d', ...o,
});
const save = (cfg, uid = 'ann', d = deps(), id) => runAction(d, uid, { action: 'save', config: cfg, ...(id ? { id } : {}) });
const page = async (token, ua = HUMAN, d = deps(), o) => servePage(d, { t: token }, ua, o);
const tokenOfShare = r => r.share.url.split('/w/')[1];

console.log('== what can be shared, and what each thing is ==');
await check('levels: nothing is called verified unless a reviewer recorded it', () => {
  assert(arenaLevel('winner').level === 'verified' && arenaLevel('shortlisted').level === 'reviewed' && arenaLevel('submitted').level === 'submitted' && arenaLevel(undefined).level === 'submitted' && arenaLevel('rejected').level === 'submitted' && arenaLevel('bogus').level === 'submitted', 'arena levels');
  assert(Object.keys(LEVELS).join() === 'self,submitted,confirmed,reviewed,verified', 'the five labels');
});
await check('sources: skills are self-reported, confirmed by colleagues, or reviewed, and uploaded work is only "submitted"', async () => {
  const s = await loadSources(db, 'ann');
  const lvl = n => s.skills.find(x => x.name === n).level;
  assert(lvl('Product Strategy') === 'confirmed' && s.skills.find(x => x.name === 'Product Strategy').endorsers === 3 && lvl('SQL') === 'self' && lvl('Negotiation') === 'reviewed', JSON.stringify(s.skills));
  assert(s.projects.every(p => p.level === 'submitted') && s.reels.every(r => r.level === 'submitted'), 'uploads are never verified');
  assert(s.arena.map(a => a.level).sort().join() === 'reviewed,submitted,verified', s.arena.map(a => a.level).join());
  assert(s.achievements.length === 1 && s.achievements[0].level === 'confirmed' && s.achievements[0].verifier === 'Sam Lee, CTO, Acme', 'an achievement needs a named verifier and is "confirmed", not verified');
});
await check('sources: only usable records: https links, storage-hosted video, nothing from another member', async () => {
  const s = await loadSources(db, 'ann');
  assert(s.reels.map(r => r.id).sort().join() === 'r1,r3,r4,r5', 'the reel on another host is out: ' + s.reels.map(r => r.id));
  assert(!s.reels.some(r => r.id === 'rb'), 'Bo\'s reel is not Ann\'s');
  assert(s.projects.find(p => p.id === '2').url === null && s.projects.find(p => p.id === '3').url === null, 'javascript: and http: links are dropped');
  assert((await loadSources(db, 'nobody')) === null, 'no account');
});
await check('the member sees what they can share', async () => {
  const r = await runAction(deps(), 'ann', { action: 'sources' });
  assert(r.profile.name === 'Ann Okoro' && r.profile.isPublic === true && r.email === 'ann.private@home.test' && r.resume === true && r.reels.length === 4, JSON.stringify(r.profile));
  assert(!JSON.stringify(r).includes('videoUrl') && !JSON.stringify(r).includes('token='), 'the picker never carries file addresses');
});

console.log('== saving ==');
await check('a save makes an unlisted link with a signed token and a 30-day expiry', async () => {
  await wipe();
  const r = await save(FULL());
  assert(r.created === true && r.share.kind === 'unlisted' && /^https:\/\/www\.bewatu\.com\/w\/[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/.test(r.share.url), r.share.url);
  assert(r.share.expiresAt === NOW + 30 * DAY && r.share.status === 'ok', 'expiry set');
  assert(idFromToken(SECRET, tokenOfShare(r)) === r.share.id && idFromToken('other', tokenOfShare(r)) === null && idFromToken(SECRET, tokenOfShare(r).slice(0, -1) + 'x') === null, 'the token is checked');
});
await check('every pick must be the member\'s own: someone else\'s reel, a made-up skill or project is refused', async () => {
  await wipe();
  await refuses(save(FULL({ selection: { ...FULL().selection, reels: ['rb'] } })), 400);
  await refuses(save(FULL({ selection: { ...FULL().selection, skills: ['Go'] } })), 400);
  await refuses(save(FULL({ selection: { ...FULL().selection, projects: ['99'] } })), 400);
  await refuses(save(FULL({ selection: { ...FULL().selection, arena: ['r1'] } })), 400);   // a reel with no Arena link is not an Arena contribution
  await refuses(save(FULL({ selection: { ...FULL().selection, achievements: ['8'] } })), 400);
  assert((await db.collection('portfolio_shares').get()).size === 0, 'nothing saved');
});
await check('a choice must contain something; email mode needs an address; a résumé needs one on file', async () => {
  await wipe();
  await refuses(save(FULL({ sections: [], intro: '' })), 400);
  await refuses(save(FULL({ sections: ['summary'], intro: '' })), 400);
  await refuses(save(FULL({ contact: { mode: 'email', email: 'nope' } })), 400);
  await refuses(save(FULL(), 'nobody'), 404);
  await db.doc('users/dee').set({ displayName: 'Dee', skills: [{ name: 'X', endorsements: 0 }] });
  const dee = o => FULL({ selection: { skills: ['X'], projects: [], arena: [], reels: [], achievements: [] }, sections: ['skills'], resume: false, contact: { mode: 'none' }, ...o });
  await refuses(save(dee({ resume: true }), 'dee'), 400);
  assert((await save(dee({}), 'dee')).created === true, 'a plain choice is fine');
});
await check('only the owner can edit, switch off or delete; the link stays the same when edited', async () => {
  await wipe();
  const a = await save(FULL());
  const again = await save(FULL({ label: 'Renamed', intro: 'New intro here.' }), 'ann', deps({ now: NOW + DAY }), a.share.id);
  assert(again.created === false && again.share.id === a.share.id && again.share.url === a.share.url && again.share.label === 'Renamed', 'same link, new content');
  assert(again.share.expiresAt === a.share.expiresAt, 'a plain edit does not stretch the expiry');
  const longer = await save(FULL({ expiry: '90d' }), 'ann', deps({ now: NOW + DAY }), a.share.id);
  assert(longer.share.expiresAt === NOW + DAY + 90 * DAY, 'a different expiry restarts it');
  await refuses(save(FULL({ selection: { skills: ['Go'], projects: [], arena: [], reels: [], achievements: [] }, sections: ['skills'], resume: false, contact: { mode: 'none' } }), 'bo', deps(), a.share.id), 404);
  await refuses(runAction(deps(), 'bo', { action: 'revoke', id: a.share.id }), 404);
  await refuses(runAction(deps(), 'ann', { action: 'delete', id: a.share.id }), 409);
});
await check('a member can have ten active links, not eleven; switching one off makes room', async () => {
  await wipe();
  const ids = [];
  for (let i = 0; i < LIMITS.SHARES_PER_MEMBER; i++) ids.push((await save(FULL({ label: 'L' + i }))).share.id);
  await refuses(save(FULL({ label: 'one too many' })), 409);
  await runAction(deps(), 'ann', { action: 'revoke', id: ids[0] });
  assert((await save(FULL({ label: 'fits now' }))).created === true, 'room made');
});
await check('different audiences get different links with different content', async () => {
  await wipe();
  const a = await save(FULL({ label: 'Recruiter A', sections: ['summary', 'projects'], selection: { skills: [], projects: ['1'], arena: [], reels: [], achievements: [] }, resume: false, contact: { mode: 'none' } }));
  const b = await save(FULL({ label: 'Recruiter B', sections: ['reels'], selection: { skills: [], projects: [], arena: [], reels: ['r1'], achievements: [] } }));
  assert(a.share.url !== b.share.url, 'two links');
  const pa = (await page(tokenOfShare(a))).html, pb = (await page(tokenOfShare(b))).html;
  assert(pa.includes('Payments revamp') && !pa.includes('How I run discovery') && !pa.includes('Download résumé'), 'A has the project only');
  assert(pb.includes('How I run discovery') && !pb.includes('Payments revamp') && pb.includes('Download résumé'), 'B has the reel and the résumé');
});

console.log('== the page a visitor sees ==');
await check('it opens with no login, in the chosen order, with a label on everything', async () => {
  await wipe();
  const s = await save(FULL({ sections: ['summary', 'reels', 'projects', 'skills', 'arena', 'achievements'] }));
  const p = await page(tokenOfShare(s));
  assert(p.status === 200 && p.html.startsWith('<!doctype html>'), 'ok');
  const order = ['s-reels', 's-projects', 's-skills', 's-arena', 's-ach'].map(id => p.html.indexOf(`id="${id}"`));
  assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'the member\'s order: ' + order);
  for (const l of ['Self-reported', 'Collaborator-confirmed', 'Submitted work', 'Reviewed', 'Verified outcome']) assert(p.html.includes(l), 'label ' + l);
  assert(p.html.includes('Confirmed by 3 colleagues') && p.html.includes('Selected as a winner') && p.html.includes('Confirmed by Sam Lee, CTO, Acme'), 'what each means');
  assert(p.html.includes('Outcome, as stated by the member') && p.html.includes('BeWatu has not independently checked'), 'honest wording');
  assert(p.html.includes('<video') && p.html.includes('preload="none"') && p.html.includes('poster="https://img.test/t1.jpg"') && p.html.includes('How I run discovery'), 'a reel with its caption');
  assert(p.html.includes('Download résumé') && p.html.includes('Contact Ann'), 'résumé and contact');
});
await check('Arenas are for members: a shared page never names the challenge or its sponsor, only the field and the recorded outcome', async () => {
  await wipe();
  const s = await save(FULL({ kind: 'public' }));
  for (const h of [(await page(tokenOfShare(await save(FULL({ label: 'u' }))))).html, (await servePage(deps(), { u: 'ann' }, HUMAN)).html, (await runAction(deps(), 'ann', { action: 'preview', config: FULL() })).html]) {
    assert(!/Rethink payments|Claims triage|Third/.test(h), 'no challenge name');
    assert(h.includes('Payments Arena challenge') && h.includes('Insurance Arena challenge') && h.includes('Selected as a winner') && h.includes('Shortlisted') && h.includes('I led pricing.'), 'field, outcome and the member\'s own words');
    assert(h.includes('visible to BeWatu members only'), 'says why');
  }
  const own = await runAction(deps(), 'ann', { action: 'sources' });
  assert(own.arena.some(a => a.title === 'Rethink payments'), 'the member still sees the real name when choosing');
  void s;
});
await check('nothing else leaks: no feed, no settings, no navigation, no email address, no raw file address for the résumé', async () => {
  await wipe();
  const s = await save(FULL());
  const h = (await page(tokenOfShare(s))).html;
  assert(!/ann\.private@home\.test/.test(h) && !h.includes('resume.pdf') && !/token=t/.test(h.replace(/token=v/g, '')), 'private details');
  assert(!/<nav|settings|notifications|feed/i.test(h.replace(/aria-label="[^"]*"/g, '')), 'no app chrome');
  assert(h.includes('href="?resume=1"'), 'résumé goes through the server');
});
await check('the page works under the strict policy: no inline script or style, no third-party loads, the token never leaves', async () => {
  await wipe();
  const s = await save(FULL());
  const tok = tokenOfShare(s);
  const h = (await page(tok)).html;
  assert(!/<script(?![^>]*\bsrc=)[^>]*>(?!\s*<)/i.test(h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), 'no inline script');
  assert(!/\sstyle=/i.test(h) && !/<style/i.test(h), 'no inline style');
  assert(!/on(click|load|error)=/i.test(h), 'no inline handlers');
  const srcs = [...h.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => new URL(m[1]).hostname);
  const allowed = new Set(['img.test', 'firebasestorage.googleapis.com', 'acme.test', 'www.bewatu.com']);
  assert(srcs.every(x => allowed.has(x)), 'only the member\'s own media and links: ' + [...new Set(srcs)]);
  assert(!/googleapis\.com\/css|fonts\.g/.test(h), 'no web font host');
  assert(h.includes('<meta name="referrer" content="no-referrer">'), 'no referrer');
  const withoutForm = h.replace(/<input type="hidden" name="t" value="[^"]*">/, '');
  assert(!withoutForm.includes(tok) && !/(?:href|src|content)="[^"]*\/w\//.test(h), 'the token appears only in the contact form\'s own hidden field, never in a link, source or preview');
  const out = [...h.matchAll(/<a [^>]*href="https?:[^"]+"[^>]*>/g)].map(m => m[0]);
  assert(out.every(a => /rel="[^"]*noopener/.test(a)), 'outbound links are noopener: ' + out.find(a => !/noopener/.test(a)));
});
await check('everything the member typed is escaped; unsafe links never become links', async () => {
  await wipe();
  const s = await save(FULL({ intro: 'Hello <img src=x onerror=alert(1)> & "friends"' }));
  const h = (await page(tokenOfShare(s))).html;
  assert(!h.includes('<script>alert') && !h.includes('<img src=x') && !h.includes('<b>soup</b>'), 'escaped');
  assert(h.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && h.includes('Tag &lt;b&gt;soup&lt;/b&gt; &amp; &quot;quotes&quot;'), 'shown as text');
  assert(!h.includes('javascript:') && !h.includes('http://insecure.test'), 'no unsafe links');
});
await check('unlisted: noindex everywhere, a preview that names nobody, and the page says anyone with the link can open it', async () => {
  await wipe();
  const s = await save(FULL());
  const p = await page(tokenOfShare(s));
  assert(p.headers['X-Robots-Tag'].includes('noindex') && p.html.includes('<meta name="robots" content="noindex,nofollow,noarchive">'), 'noindex');
  assert(p.headers['Cache-Control'] === 'private, no-store' && p.headers['Referrer-Policy'] === 'no-referrer' && p.headers['X-Frame-Options'] === 'DENY', 'headers');
  const head = p.html.slice(0, p.html.indexOf('</head>'));
  assert(head.includes('<title>A portfolio shared on BeWatu</title>') && !/Ann|Okoro|Payments|Product lead|Fintech|ann\.|Rethink/.test(head), 'the preview reveals nothing: ' + head.match(/<title>.*<\/title>/));
  assert(!head.includes('rel="canonical"') && !head.includes('ld+json') && head.includes('/android-chrome-512x512.png'), 'no canonical, no structured data, generic image');
  assert(p.html.includes('anyone who has it can open this page') && !/confidential|private to|only for you|restricted to/i.test(p.html.replace('It isn\'t private to one person', '')), 'honest about what an unlisted link is');
  assert(p.html.includes('stops working on'), 'the expiry is stated');
});
await check('public: indexable, canonical, structured data, and a preview that carries the member\'s own words', async () => {
  await wipe();
  const s = await save(FULL({ kind: 'public', contact: { mode: 'none' } }));
  assert(s.share.url === 'https://www.bewatu.com/be/ann/work' && s.share.expiresAt === null, s.share.url);
  const p = await servePage(deps(), { u: 'ann' }, HUMAN);
  assert(p.status === 200 && !p.headers['X-Robots-Tag'] && p.html.includes('<meta name="robots" content="index,follow">'), 'indexable');
  assert(p.html.includes('<link rel="canonical" href="https://www.bewatu.com/be/ann/work">') && p.html.includes('<title>Ann Okoro · Product lead, payments | BeWatu portfolio</title>'), 'canonical and title');
  const ld = JSON.parse(p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert(ld['@type'] === 'ProfilePage' && ld.mainEntity.name === 'Ann Okoro' && ld.mainEntity.knowsAbout.includes('SQL'), JSON.stringify(ld));
  assert(p.headers['Cache-Control'].includes('s-maxage=60'), 'cacheable for a minute');
});
await check('a public portfolio needs a public profile and an address; a private profile gets nothing public', async () => {
  await wipe();
  const pub = (skill, o = {}) => FULL({ kind: 'public', selection: { skills: skill ? [skill] : [], projects: [], arena: [], reels: [], achievements: [] }, sections: skill ? ['skills'] : ['summary'], resume: false, contact: { mode: 'none' }, ...o });
  await refuses(save(pub('Go'), 'bo'), 409);
  await refuses(save(pub('Rust'), 'cy'), 409);
  await db.doc('users/dee').set({ displayName: 'Dee NoName', isPublic: true, skills: [] });
  await refuses(save(pub(null), 'dee'), 409);
  // turning the profile private afterwards takes the public page down at once
  await save(FULL({ kind: 'public' }));
  assert((await servePage(deps(), { u: 'ann' }, HUMAN)).status === 200, 'up');
  await db.doc('users/ann').update({ isPublic: false });
  assert((await servePage(deps(), { u: 'ann' }, HUMAN)).status === 404, 'down');
  await db.doc('users/ann').update({ isPublic: true });
});
await check('an unlisted link is never served as a public page, and a username never opens an unlisted one', async () => {
  await wipe();
  const s = await save(FULL());
  assert((await servePage(deps(), { u: 'ann' }, HUMAN)).status === 404, 'no public page was published');
  assert((await servePage(deps(), { t: s.share.id }, HUMAN)).status === 404, 'the bare id is not a link');
  assert((await servePage(deps(), { t: 'garbage' }, HUMAN)).status === 404 && (await servePage(deps(), {}, HUMAN)).status === 404, 'junk');
  assert((await servePage(deps({ secret: undefined }), { t: 'x' }, HUMAN).catch(e => e.status)) === 503, 'no secret: closed');
});

console.log('== expiry, switching off, and editing ==');
await check('a link stops at its expiry and when switched off, each on its own', async () => {
  await wipe();
  const a = await save(FULL({ label: 'A' })); const b = await save(FULL({ label: 'B' }));
  const ta = tokenOfShare(a), tb = tokenOfShare(b);
  assert((await page(ta)).status === 200 && (await page(tb)).status === 200, 'both open');
  const off = await runAction(deps(), 'ann', { action: 'revoke', id: a.share.id });
  assert(off.share.status === 'revoked' && off.share.url === null, 'switched off');
  const pa = await page(ta);
  assert(pa.status === 410 && pa.html.includes('switched off') && !pa.html.includes('Ann') && pa.headers['X-Robots-Tag'].includes('noindex'), 'A is gone and says nothing about the member');
  assert((await page(tb)).status === 200, 'B is untouched');
  const late = await page(tb, HUMAN, deps({ now: NOW + 31 * DAY }));
  assert(late.status === 410 && late.html.includes('expired') && !late.html.includes('Ann'), 'B expires');
  assert(accessOf({ status: 'active', expiresAt: null }, NOW + 9999 * DAY) === 'ok', 'a public page has no expiry');
  const mine = await runAction(deps({ now: NOW + 31 * DAY }), 'ann', { action: 'list' });
  assert(mine.shares.map(x => x.status).sort().join() === 'expired,revoked', 'the list tells the truth');
  assert((await runAction(deps(), 'ann', { action: 'delete', id: a.share.id })).ok === true && (await db.doc(`portfolio_shares/${a.share.id}`).get()).exists === false, 'a switched-off link can be deleted');
});
await check('live links follow the member\'s edits; a snapshot stays as it was published', async () => {
  await wipe();
  await db.doc('users/ann').update({ portfolio: [{ id: 1, title: 'Payments revamp', description: 'Rebuilt checkout.', technologies: [], url: 'https://acme.test/case', outcome: 'Conversion up 12%' }] });
  const cfg = { sections: ['projects'], selection: { skills: [], projects: ['1'], arena: [], reels: [], achievements: [] }, resume: false, contact: { mode: 'none' } };
  const live = await save(FULL({ ...cfg, label: 'live', updatePolicy: 'live' })); const snap = await save(FULL({ ...cfg, label: 'snap', updatePolicy: 'snapshot' }));
  await db.doc('users/ann').update({ portfolio: [{ id: 1, title: 'Payments revamp v2', description: 'Rewrote it all.', technologies: [], url: 'https://acme.test/case', outcome: 'Conversion up 30%' }], headline: 'CPO, payments' });
  const pl = (await page(tokenOfShare(live))).html, ps = (await page(tokenOfShare(snap))).html;
  assert(pl.includes('Payments revamp v2') && pl.includes('CPO, payments') && pl.includes('up 30%'), 'live follows the edit');
  assert(ps.includes('Payments revamp') && !ps.includes('v2') && ps.includes('up 12%') && ps.includes('Product lead, payments'), 'snapshot keeps what was published');
  const refreshed = await save(FULL({ ...cfg, label: 'snap', updatePolicy: 'snapshot' }), 'ann', deps({ now: NOW + DAY }), snap.share.id);
  assert((await page(tokenOfShare(refreshed))).html.includes('v2') && refreshed.share.snapshotAt === NOW + DAY, 'saving again refreshes it');
  await db.doc('users/ann').update({ portfolio: [] });
  assert(!(await page(tokenOfShare(live))).html.includes('Payments revamp'), 'a live link drops what the member removed');
});
await check('a snapshot still obeys switching off the résumé and the contact option', async () => {
  await wipe();
  const s = await save(FULL({ updatePolicy: 'snapshot' }));
  const t = tokenOfShare(s);
  assert((await page(t)).html.includes('Download résumé'), 'on');
  await db.doc('users/ann').update({ resumeUrl: null });
  const h = (await page(t)).html;
  assert(!h.includes('Download résumé'), 'the résumé is gone as soon as the file is');
  await db.doc('users/ann').update({ resumeUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/resume.pdf?alt=media&token=t' });
});

console.log('== résumé ==');
await check('the résumé is served through the server only when enabled, and not at all after switching off', async () => {
  await wipe();
  const s = await save(FULL()); const t = tokenOfShare(s);
  const r = await serveResume(deps(), { t });
  assert(r.status === 200 && r.file.body.toString() === '%PDF-' && r.file.name === 'Ann-Okoro-resume.pdf', JSON.stringify({ ...r, file: r.file && r.file.name }));
  const noResume = await save(FULL({ resume: false }), 'ann', deps(), s.share.id);
  assert((await serveResume(deps(), { t })).status === 404, 'not enabled for this share');
  await save(FULL(), 'ann', deps(), s.share.id);
  await runAction(deps(), 'ann', { action: 'revoke', id: s.share.id });
  assert((await serveResume(deps(), { t })).status === 404 && (await serveResume(deps(), { t: 'bad' })).status === 404, 'switched off');
  void noResume;
});
await check('a résumé too big to pass along is sent to the file rather than failing', async () => {
  await wipe();
  const s = await save(FULL()); const big = { ok: true, type: 'application/pdf', length: LIMITS.RESUME_PROXY_MAX + 1, body: Buffer.alloc(1) };
  const r = await serveResume(deps({ fetchFile: async () => big }), { t: tokenOfShare(s) });
  assert(r.status === 302 && r.redirect.startsWith('https://firebasestorage.googleapis.com/'), 'redirect');
});

console.log('== contact ==');
const formOf = async (s, d = deps()) => { const h = (await servePage(d, { t: tokenOfShare(s) }, HUMAN)).html; return { ft: h.match(/name="ft" value="([^"]+)"/)[1], t: tokenOfShare(s) }; };
await check('the form: the member\'s address is never shown, and a good message reaches them with a reply-to', async () => {
  await wipe();
  const s = await save(FULL()); const f = await formOf(s);
  const ok = await submitContact(deps({ now: NOW + 5000 }), { ...f, name: 'Rae Recruiter', email: 'rae@corp.test', message: 'We would love to talk about a role.' }, '1.1.1.1');
  assert(ok.ok === true && outbox.length === 1, JSON.stringify(ok));
  assert(outbox[0].to === 'ann.private@home.test' && outbox[0].replyTo === 'rae@corp.test' && outbox[0].html.includes('Acme recruiting') && outbox[0].html.includes('We would love to talk'), 'delivered');
  assert((await db.doc(`portfolio_shares/${s.share.id}`).get()).data().contactCount === 1, 'counted');
});
await check('bots and floods are stopped: honeypot, forged or stale timing, instant posts, per-address and per-link limits', async () => {
  await wipe();
  const s = await save(FULL()); const f = await formOf(s);
  const good = { ...f, name: 'Rae', email: 'rae@corp.test', message: 'A perfectly good message here.' };
  const at = ms => deps({ now: NOW + ms });
  assert((await submitContact(at(5000), { ...good, website: 'http://spam.test' }, '2.2.2.2')).ok === true && outbox.length === 0, 'honeypot: quietly dropped');
  assert((await submitContact(at(5000), { ...good, ft: 'forged' }, '2.2.2.2')).status === 400, 'forged stamp');
  assert((await submitContact(at(5000), { ...good, ft: formStamp('wrong-secret', NOW, s.share.id) }, '2.2.2.2')).status === 400, 'wrong secret');
  assert((await submitContact(at(500), good, '2.2.2.2')).status === 429, 'instant post');
  assert((await submitContact(at(3 * 3_600_000), good, '2.2.2.2')).status === 400, 'stale form');
  assert((await submitContact(at(5000), { ...good, name: '' }, '2.2.2.2')).status === 400 && (await submitContact(at(5000), { ...good, email: 'bad' }, '2.2.2.2')).status === 400 && (await submitContact(at(5000), { ...good, message: 'short' }, '2.2.2.2')).status === 400, 'incomplete');
  assert((await submitContact(at(5000), { ...good, t: 'nonsense' }, '2.2.2.2')).status === 404, 'unknown link');
  for (let i = 0; i < LIMITS.CONTACT_PER_IP_HOUR; i++) assert((await submitContact(at(5000), good, '3.3.3.3')).ok === true, 'under the limit');
  assert((await submitContact(at(5000), good, '3.3.3.3')).status === 429, 'per address');
  let last; for (let i = 0; i < 30; i++) last = await submitContact(at(5000), good, `9.9.9.${i}`);
  assert(last.status === 429, 'per link per day');
  assert(formStampAge(SECRET, formStamp(SECRET, NOW, s.share.id), 'other-share', NOW + 5000) === null, 'a stamp is for one link only');
});
await check('the form works only where the member enabled it, and not after switching the link off or when mail fails', async () => {
  await wipe();
  const none = await save(FULL({ contact: { mode: 'none' } })); const email = await save(FULL({ contact: { mode: 'email', email: 'ann@public.test' } }));
  const body = (s) => ({ t: tokenOfShare(s), ft: formStamp(SECRET, NOW, s.share.id), name: 'Rae', email: 'rae@corp.test', message: 'A perfectly good message here.' });
  assert((await submitContact(deps({ now: NOW + 5000 }), body(none), '4.4.4.4')).status === 404 && (await submitContact(deps({ now: NOW + 5000 }), body(email), '4.4.4.4')).status === 404, 'not enabled');
  const form = await save(FULL()); mailOk = false;
  assert((await submitContact(deps({ now: NOW + 5000 }), body(form), '4.4.4.4')).status === 502, 'a failed send is reported');
  mailOk = true; await runAction(deps(), 'ann', { action: 'revoke', id: form.share.id });
  assert((await submitContact(deps({ now: NOW + 5000 }), body(form), '4.4.4.4')).status === 404, 'switched off');
});
await check('email mode: the address is in the page only encoded, never as text or a mailto link a scraper could read', async () => {
  await wipe();
  const s = await save(FULL({ contact: { mode: 'email', email: 'Ann@Public.test' } }));
  const h = (await page(tokenOfShare(s))).html;
  assert(!/ann@public\.test/i.test(h) && !h.includes('mailto:'), 'not readable');
  assert(Buffer.from(h.match(/data-reveal="([^"]+)"/)[1], 'base64').toString() === 'ann@public.test', 'revealed by the page script on request');
});

console.log('== visits ==');
await check('visits are counted without storing who visited; previews and crawlers are kept apart', async () => {
  await wipe();
  const s = await save(FULL()); const t = tokenOfShare(s);
  for (const ua of [HUMAN, HUMAN, 'WhatsApp/2.23.20', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0', 'Googlebot/2.1', null]) await page(t, ua);
  const doc = (await db.doc(`portfolio_shares/${s.share.id}`).get()).data();
  assert(doc.views.human === 2 && doc.views.preview === 3 && doc.views.bot === 2, JSON.stringify(doc.views));
  const dayKey = new Date(NOW).toISOString().slice(0, 10);
  assert(doc.lastViewedAt === NOW && doc.daily[dayKey].human === 2 && doc.daily[dayKey].preview === 3 && doc.daily[dayKey].bot === 2, 'a daily tally: ' + JSON.stringify(doc.daily));
  const text = JSON.stringify(doc);
  assert(!/Mozilla|WhatsApp|Googlebot|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(text), 'no user agent or address is stored');
  assert(visitKind(HUMAN) === 'human' && visitKind('') === 'bot' && visitKind('Twitterbot/1.0') === 'preview' && visitKind('LinkedInBot/1.0') === 'preview' && visitKind('curl/8.0.1') === 'bot', 'classifier');
  assert(runAction && (await runAction(deps(), 'ann', { action: 'list' })).shares[0].views.human === 2, 'the member sees the people count apart from the rest');
});
await check('an expired or switched-off link does not count a visit', async () => {
  await wipe();
  const s = await save(FULL()); await runAction(deps(), 'ann', { action: 'revoke', id: s.share.id });
  await page(tokenOfShare(s));
  assert((await db.doc(`portfolio_shares/${s.share.id}`).get()).data().views.human === 0, 'not counted');
});

console.log('== preview and helpers ==');
await check('the live preview shows exactly what would be shared, marks itself as a preview, and counts nothing', async () => {
  await wipe();
  const r = await runAction(deps(), 'ann', { action: 'preview', config: FULL({ contact: { mode: 'form' } }) });
  assert(r.html.includes('Payments revamp') && r.html.includes('Preview') && !r.html.includes('data-contact-form') && !r.html.includes('?resume=1') && !r.html.includes('data-reveal'), 'inert preview');
  assert((await db.collection('portfolio_shares').get()).size === 0, 'nothing saved');
  await refuses(runAction(deps(), 'ann', { action: 'preview', config: FULL({ selection: { ...FULL().selection, reels: ['rb'] } }) }), 400);
});
await check('safeHttps and the model builder', async () => {
  assert(safeHttps('https://a.test/x') && !safeHttps('http://a.test') && !safeHttps('javascript:alert(1)') && !safeHttps('data:text/html,x') && !safeHttps('https://u:p@a.test/') && !safeHttps(5) && !safeHttps('https://a.test/', /^b\.test$/), 'urls');
  const m = buildModel(await loadSources(db, 'ann'), parseConfig({ config: FULL({ sections: ['skills', 'skills', 'nonsense'] }) }, await loadSources(db, 'ann')), NOW);
  assert(m.sections.length === 1 && m.sections[0].key === 'skills', 'sections are de-duplicated and validated');
  assert(renderPortfolio({ ...m, sections: [] }, { kind: 'unlisted', preview: false, url: null, label: 'x', formStamp: null }).includes('Nothing has been added'), 'empty is handled');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
