// Run: tsx test/bridge-talks/client-tests.mjs
// Guards the browser side of Bridge Talks (lib/bridgeTalks.ts): the form's rules, search and ranking, threading, honest watch
// tracking, resume, addresses and sharing.
import * as t from '../../lib/bridgeTalks.ts';
import { parsePath, pathFor, navKeyFor } from '../../lib/routes.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m ?? ''} got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } }; };
const DAY = 86_400_000, NOW = 1_800_000_000_000;
const talk = (o = {}) => t.toTalk(o.id ?? 'a', { speakerUid: 'u1', speakerName: 'Sam Mwangi', speakerHeadline: 'Retired COO', title: 'What 30 years of leadership taught me about people', summary: 'Three lessons from running big teams.', category: 'leadership', status: 'published', publishedAt: NOW - DAY, createdAt: NOW - 2 * DAY, durationSec: 720, videoUrl: 'https://v', keyTakeaways: ['Listen first'], ...o });

check('the lifecycle: nothing becomes visible without a reviewer', () => {
  assert(!t.canMove('draft', 'published', 'speaker') && !t.canMove('draft', 'published', 'admin') && !t.canMove('submitted', 'published', 'speaker'), 'a shortcut exists');
  assert(t.canMove('draft', 'submitted', 'speaker') && t.canMove('submitted', 'published', 'admin') && t.canMove('under_review', 'rejected', 'admin'), 'normal path broken');
  assert(t.canMove('published', 'unpublished', 'speaker') && !t.canMove('unpublished', 'published', 'speaker'), 'unpublish/republish wrong');
  assert(Object.keys(t.TRANSITIONS.archived).length === 0, 'archived is not final');
  assert(t.speakerCanEdit('draft') && !['submitted', 'under_review', 'published', 'rejected', 'unpublished', 'archived'].some(s => t.speakerCanEdit(s)), 'edit rule');
});
check('who may contribute: a flag or an admin, never age or a title', () => {
  assert(!t.canContribute(null) && !t.canContribute({}) && t.canContribute({ bridgeContributor: true }) && t.canContribute({ isPlatformAdmin: true }) && !t.canContribute({ bridgeContributor: false }), 'contributor rule');
});
check('durations read as people say them', () => {
  eq([t.formatDuration(45), t.formatDuration(720), t.formatDuration(3600), t.formatDuration(3900)], ['45 sec', '12 min', '1 h', '1 h 5 min']);
  eq([t.clock(65), t.clock(3725), t.clock(-3), t.clock(NaN)], ['1:05', '1:02:05', '0:00', '0:00']);
});
check('length guidance is a note, never a block', () => {
  assert(t.lengthNote(720) === null && /8 to 15/.test(t.lengthNote(200)) && /8 to 15/.test(t.lengthNote(1800)) && t.lengthNote(0) === null, 'note');
  const d = { ...t.emptyDraft(), durationSec: 1800 }; assert(!t.problems(d, false).durationSec, 'a 30 minute Talk was blocked');
  assert(t.problems({ ...t.emptyDraft(), durationSec: 10 }, false).durationSec && t.problems({ ...t.emptyDraft(), durationSec: 4 * 3600 }, false).durationSec, 'outer bounds not enforced');
});
check('a draft needs almost nothing; a submission needs what a reviewer needs', () => {
  eq(Object.keys(t.problems(t.emptyDraft(), false)), []);
  const need = t.problems(t.emptyDraft(), true); for (const f of ['videoUrl', 'title', 'summary', 'category', 'experience', 'durationSec']) assert(need[f], `${f} not required`);
  const ok = { ...t.emptyDraft(), videoUrl: 'u', title: 'T', summary: 'S', category: 'career', experience: 'E', durationSec: 600 }; assert(t.firstProblem(t.problems(ok, true)) === null, 'a complete draft was refused');
});
check('public viewing needs the speaker\'s own confirmation', () => {
  const d = { ...t.emptyDraft(), visibility: 'public' }; assert(t.problems(d, false).publicConsent, 'consent not asked'); assert(!t.problems({ ...d, publicConsent: true }, false).publicConsent, 'consent ignored');
});
check('field limits, takeaways and captions', () => {
  const d = t.emptyDraft(); assert(t.problems({ ...d, title: 'x'.repeat(101) }, false).title, 'title'); assert(t.problems({ ...d, keyTakeaways: ['a', 'b', 'c', 'd'] }, false).keyTakeaways, 'takeaways');
  assert(t.problems({ ...d, captionsVtt: 'hello' }, false).captionsVtt && !t.problems({ ...d, captionsVtt: 'WEBVTT\n\n' }, false).captionsVtt, 'captions');
});
check('files are checked before an upload starts', () => {
  assert(t.fileProblem({ type: 'video/mp4', size: 1000 }, 'video') === null && /MP4/.test(t.fileProblem({ type: 'application/pdf', size: 10 }, 'video')), 'video type');
  assert(/limit/.test(t.fileProblem({ type: 'video/mp4', size: 600 * 1048576 }, 'video')) && t.fileProblem({ type: 'video/mp4', size: 0 }, 'video'), 'video size');
  assert(t.fileProblem({ type: 'image/png', size: 100 }, 'image') === null && t.fileProblem({ type: 'image/gif', size: 100 }, 'image'), 'image');
  assert(t.extOf('My Talk.MOV', 'mp4') === 'mov' && t.extOf('noext', 'mp4') === 'noext' && t.extOf('x.m p4!', 'mp4') === 'mp4', 'ext');
});
check('a stored Talk is read safely, even when a field is missing', () => {
  const x = t.toTalk('z', {}); assert(x.speakerName === 'BeWatu member' && x.status === 'draft' && x.visibility === 'members' && x.keyTakeaways.length === 0 && x.likedByUids.length === 0 && x.thumbnailUrl === null, JSON.stringify(x));
  const y = t.toTalk('z', { status: 'hacked', publishedAt: { toMillis: () => 5 }, createdAt: { seconds: 2 }, keyTakeaways: ['a', 3, null, 'b'], visibility: 'public' }); assert(y.status === 'draft' && y.publishedAt === 5 && y.createdAt === 2000 && y.keyTakeaways.join() === 'a,b' && y.visibility === 'public', JSON.stringify(y));
});
check('search: every word typed must start a word, in title, speaker, topic or takeaways; accents and case do not matter', () => {
  const a = talk();
  assert(t.matches(a, '') && t.matches(a, 'lead') && t.matches(a, 'SAM mwa') && t.matches(a, 'retired coo') && t.matches(a, 'listen') && t.matches(a, 'léadership'), 'should match');
  assert(!t.matches(a, 'finance') && !t.matches(a, 'lead zebra') && !t.matches(a, 'ership'), 'should not match');
  assert(t.matches(talk({ category: 'finance' }), 'finance & business') , 'topic label');
});
check('"relevant" favours people you follow and topics you have, then fresh; never how often a Talk was watched', () => {
  const followed = talk({ id: 'f', speakerUid: 'u9', category: 'healthcare', publishedAt: NOW - 40 * DAY });
  const topical = talk({ id: 't', speakerUid: 'u2', category: 'technology', title: 'Shipping software that lasts', publishedAt: NOW - 20 * DAY });
  const fresh = talk({ id: 'n', speakerUid: 'u3', category: 'wisdom', publishedAt: NOW - 1 * DAY });
  const ctx = { followedUids: new Set(['u9']), interests: ['Technology', 'software'], now: NOW };
  eq(t.sortTalks([fresh, topical, followed], 'relevant', ctx).map(x => x.id), ['f', 't', 'n']);
  eq(t.sortTalks([followed, topical, fresh], 'newest', ctx).map(x => x.id), ['n', 't', 'f']);
  const noInfo = { followedUids: new Set(), interests: [], now: NOW }; eq(t.sortTalks([followed, fresh], 'relevant', noInfo).map(x => x.id), ['n', 'f'], 'no signal falls back to newest');
  assert(t.reasonFor(followed, ctx) === 'From Sam, who you follow' && /interested in Technology/.test(t.reasonFor(topical, ctx)) && t.reasonFor(fresh, ctx) === null, 'reasons');
});
check('related Talks: same topic or speaker, never itself, never anything unpublished', () => {
  const cur = talk({ id: 'c' }), same = talk({ id: 's', speakerUid: 'u5' }), spk = talk({ id: 'p', category: 'career' }), other = talk({ id: 'o', speakerUid: 'u6', category: 'career' }), hidden = talk({ id: 'h', status: 'draft', speakerUid: 'u5' });
  eq(t.relatedTalks(cur, [cur, same, spk, other, hidden]).map(x => x.id), ['s', 'p']);
});
check('related Pods are suggested only when their own words overlap; nothing is joined', () => {
  const cur = talk({ category: 'leadership', title: 'Leading through change', keyTakeaways: ['Mentoring matters'] });
  const pods = [{ id: 'p1', name: 'Leadership circle', description: 'Mentoring' }, { id: 'p2', name: 'Pastry lovers', description: 'Cakes' }, { id: 'p3', name: 'Change makers', description: '' }];
  eq(t.relatedPods(cur, pods).map(p => p.id), ['p1', 'p3']); eq(t.relatedPods(cur, [pods[1]]).length, 0);
});
check('the discussion is one level deep; removed comments keep their replies', () => {
  const c = (id, o = {}) => t.toComment(id, 'a', { authorUid: 'u' + id, content: id, createdAt: Number(id.replace(/\D/g, '')) * 1000, ...o });
  const list = [c('1'), c('2'), c('3', { parentId: '1', depth: 1 }), c('4', { parentId: '1', depth: 1, authorUid: 'u1' }), c('5', { parentId: '9', depth: 1 })];
  const th = t.buildThread(list, 'u1');
  eq(th.map(n => n.id), ['2', '1', '9'], 'newest first, orphan group last'); eq(th[1].replies.map(r => r.id), ['3', '4'], 'replies oldest first');
  assert(th[2].comment === null && th[2].replies[0].id === '5', 'stub'); assert(th[1].isSpeaker && !th[0].isSpeaker, 'speaker label comes from the Talk, not the comment');
  const reply = c('3', { parentId: '1', depth: 1 }); assert(t.threadRoot(reply) === '1' && t.threadRoot(c('2')) === '2', 'a reply to a reply stays in the same thread');
  assert(t.commentProblem('  ') && t.commentProblem('x'.repeat(2001)) && t.commentProblem('A real question') === null, 'comment checks');
});
check('watching: only time actually watched counts; skipping to the end completes nothing', () => {
  const w = new t.WatchTracker(100);
  let fired = []; for (let s = 0; s <= 30; s++) fired.push(...w.update(s)); eq(fired, [25], 'a quarter');
  w.seek(); fired = w.update(99); fired.push(...w.update(100)); eq(fired, [], 'a skip to the end completes nothing'); assert(w.percent < 40, `percent ${w.percent}`);
  fired = []; w.seek(); for (let s = 30; s <= 96; s += 1) fired.push(...w.update(s)); eq(fired, [50, 75, 'completed'], 'milestones once, in order'); eq(w.update(97), [], 'never again');
  const zero = new t.WatchTracker(0); eq(zero.update(5), [], 'no duration, nothing');
  const big = new t.WatchTracker(100); big.update(0); eq(big.update(50), [], 'a 50 second jump is a seek, not watching');
});
check('resume: offered only when worth it, forgotten when done, never throws', () => {
  const s = mem(); t.savePosition('a', 125, 720, s, NOW); assert(t.loadPosition('a', 720, s, NOW + DAY) === 125, 'not remembered');
  t.savePosition('a', 5, 720, s, NOW); assert(t.loadPosition('a', 720, s, NOW) === null, 'barely started should be forgotten');
  t.savePosition('a', 125, 720, s, NOW); t.savePosition('a', 715, 720, s, NOW); assert(t.loadPosition('a', 720, s, NOW) === null, 'finished should be forgotten');
  t.savePosition('a', 125, 720, s, NOW); assert(t.loadPosition('a', 720, s, NOW + 61 * DAY) === null, 'stale');
  const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  t.savePosition('a', 100, 720, bad); assert(t.loadPosition('a', 720, bad) === null, 'blocked storage');
  s.setItem('bewatuTalkPos:b', '{bad json'); assert(t.loadPosition('b', 720, s) === null, 'corrupt');
});
check('addresses: a Talk and the Talks page have their own; unsafe ids are not read', () => {
  eq(pathFor({ view: 'BRIDGE_TALK', talkId: 'abc_1' }), '/community/bridge/talks/abc_1'); eq(parsePath('/community/bridge/talks/abc_1'), { view: 'BRIDGE_TALK', talkId: 'abc_1' });
  eq(parsePath('/community/bridge/talks'), { view: 'BRIDGE_TALKS' }); eq(parsePath('/community/bridge/talks/'), { view: 'BRIDGE_TALKS' });
  eq(parsePath('/community/bridge'), { view: 'BRIDGE' }); assert(parsePath('/community/bridge/talks/a%2Fb') === null && parsePath('/community/bridge/talks/a/b') === null, 'unsafe');
  assert(navKeyFor('BRIDGE_TALK') === 'community' && navKeyFor('BRIDGE_TALKS') === 'community', 'nav');
  eq(pathFor({ view: 'BRIDGE_TALK', talkId: '../x' }), '/', 'unsafe id falls back');
});
check('sharing: only an approved, consented public Talk gets a link anyone can open', () => {
  const o = 'https://www.bewatu.com';
  eq(t.shareUrl({ id: 'a', visibility: 'public', publicConsent: true, status: 'published' }, o), o + '/talks/a');
  for (const x of [{ visibility: 'members', publicConsent: true, status: 'published' }, { visibility: 'public', publicConsent: false, status: 'published' }, { visibility: 'public', publicConsent: true, status: 'unpublished' }]) eq(t.shareUrl({ id: 'a', ...x }, o), o + '/community/bridge/talks/a');
  assert(/Sam Mwangi/.test(t.shareText({ title: 'T', speakerName: 'Sam Mwangi' })), 'share text');
});
check('an unknown category still shows readably', () => { assert(t.categoryLabel('leadership') === 'Leadership' && t.categoryLabel('supply-chain') === 'Supply chain' && t.categoryLabel('') === '', 'labels'); });
check('"ago" is plain', () => { assert(t.ago(NOW - 5 * 60_000, NOW) === '5 min ago' && t.ago(NOW - 3 * 3_600_000, NOW) === '3 h ago' && t.ago(NOW - 3 * DAY, NOW) === '3 d ago' && t.ago(null) === '', 'ago'); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
