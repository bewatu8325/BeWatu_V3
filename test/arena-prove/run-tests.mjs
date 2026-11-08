// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/arena-prove/run-tests.mjs"
// Guards the Arenas <-> Prove connection and the Arena follow/alert preferences:
//   - a reel can be linked only to a challenge its owner really submitted to, only by its owner, only through the server
//   - the outcome shown is the reviewer's recorded status, never inferred, and a rejection is never published
//   - following Arena industries is real (validated) and separate from the opt-in to be notified
//   - the alert goes only to followers who opted in, once, never to the poster
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runAction as link, outcomeOf, HttpError as LinkError } from '../../api/reel-arena-link.ts';
import { runAction as interests, HttpError as IntError } from '../../api/arena-interests.ts';
// functions/ is a CommonJS project, so its module arrives as one object whichever way it is imported.
import * as alertsNs from '../../functions/src/arenaAlerts.ts';
const alerts = alertsNs.default ?? alertsNs;
const { wentLive, alertFor, wantsAlert } = alerts;

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status) => { try { await p; } catch (e) { if ((e instanceof LinkError || e instanceof IntError) && e.status === status) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('was allowed'); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-arena-prove' });
const db = getFirestore();
const NOW = 1_800_000_000_000;

// ── the world ──
await db.doc('arena_challenges/c1').set({ title: 'Rethink payments', arenaIndustry: 'payments', verificationStatus: 'live', recruiterId: 'poster' });
await db.doc('arena_challenges/c2').set({ title: 'Claims triage', arenaIndustry: 'insurance', verificationStatus: 'live', recruiterId: 'poster' });
await db.doc('arena_challenges/c3').set({ title: 'Third challenge', arenaIndustry: 'banking', verificationStatus: 'live', recruiterId: 'poster' });
await db.doc('arena_challenges/c1/submissions/s-ann').set({ authorUid: 'ann', status: 'submitted' });
await db.doc('arena_challenges/c2/submissions/s-ann2').set({ authorUid: 'ann', status: 'shortlisted', isShortlisted: true });
await db.doc('arena_challenges/c3/submissions/s-ann3').set({ authorUid: 'ann', status: 'rejected' });
await db.doc('arena_challenges/c1/submissions/s-bo').set({ authorUid: 'bo', status: 'winner' });
await db.doc('reels/r-ann').set({ authorUid: 'ann', pitch: 'My reel', skills: ['SQL'] });
await db.doc('reels/r-bo').set({ authorUid: 'bo', pitch: 'Bo reel' });
await db.doc('reels/r-cy').set({ authorUid: 'cy', pitch: 'Cy reel' });
for (const [id, active] of [['payments', true], ['insurance', true], ['banking', true], ['retired', false]]) await db.doc(`arena_industries/${id}`).set({ name: id, isActive: active });
for (const u of ['ann', 'bo', 'cy', 'poster']) await db.doc(`users/${u}`).set({ name: u });
const reel = (id) => db.doc(`reels/${id}`).get().then(s => s.data());

console.log('== linking a reel to a challenge ==');
await check('the outcome comes only from the reviewer\'s recorded status; rejections and unknowns are not shown', () => {
  assert(outcomeOf({ status: 'winner' }) === 'winner' && outcomeOf({ status: 'shortlisted' }) === 'shortlisted' && outcomeOf({ isShortlisted: true }) === 'shortlisted', 'recorded');
  assert(outcomeOf({ status: 'rejected' }) === 'submitted' && outcomeOf({}) === 'submitted' && outcomeOf(undefined) === 'submitted' && outcomeOf({ status: 'bogus' }) === 'submitted', 'never published as anything else');
});
await check('the member sees exactly the challenges they have submitted to', async () => {
  const r = await link(db, 'ann', { action: 'mine' }, NOW);
  assert(r.challenges.map(c => c.challengeId).sort().join() === 'c1,c2,c3', JSON.stringify(r));
  assert(r.challenges.find(c => c.challengeId === 'c2').outcome === 'shortlisted' && r.challenges.find(c => c.challengeId === 'c3').outcome === 'submitted', 'outcomes');
  assert((await link(db, 'cy', { action: 'mine' }, NOW)).challenges.length === 0, 'someone who has submitted nothing sees nothing');
});
await check('a reel is linked with the member\'s own words and the real challenge details', async () => {
  const r = await link(db, 'ann', { action: 'link', reelId: 'r-ann', challengeId: 'c1', contribution: '  I built the fraud   model  ', skills: ['SQL', 'sql ', 'Fraud', '', 'x'.repeat(100)] }, NOW);
  const l = r.arenaLink;
  assert(l.challengeTitle === 'Rethink payments' && l.industry === 'payments' && l.submissionId === 's-ann' && l.outcome === 'submitted', JSON.stringify(l));
  assert(l.contribution === 'I built the fraud model' && l.skills.length === 3 && l.skills.includes('SQL') && l.skills.includes('Fraud'), 'cleaned: ' + JSON.stringify(l));
  assert(l.linkedAt === NOW && l.outcomeCheckedAt === NOW, 'when it was checked is recorded');
  assert((await reel('r-ann')).arenaLink.challengeId === 'c1', 'stored on the reel');
});
await check('no submission, no link: uploading a reel alone proves nothing', async () => {
  await refuses(link(db, 'cy', { action: 'link', reelId: 'r-cy', challengeId: 'c1' }, NOW), 403);
  await refuses(link(db, 'ann', { action: 'link', reelId: 'r-ann', challengeId: 'does-not-exist' }, NOW), 404);
  assert(!(await reel('r-cy')).arenaLink, 'nothing was written');
});
await check('only your own reel, and only with a real reel and challenge id', async () => {
  await refuses(link(db, 'ann', { action: 'link', reelId: 'r-bo', challengeId: 'c1' }, NOW), 403);   // bo's reel, ann's submission
  await refuses(link(db, 'bo', { action: 'link', reelId: 'r-ann', challengeId: 'c1' }, NOW), 403);
  await refuses(link(db, 'ann', { action: 'link', reelId: '../x', challengeId: 'c1' }, NOW), 400);
  await refuses(link(db, 'ann', { action: 'link', reelId: 'r-ann', challengeId: '' }, NOW), 400);
  await refuses(link(db, 'ann', { action: 'link', reelId: 'nope', challengeId: 'c1' }, NOW), 404);
  await refuses(link(db, '', { action: 'mine' }, NOW), 401);
  await refuses(link(db, 'ann', { action: 'purge' }, NOW), 400);
  assert(!(await reel('r-bo')).arenaLink, 'bo\'s reel untouched');
});
await check('a shortlisted or winning submission is shown as such, a rejected one as plain "submitted"', async () => {
  await db.doc('reels/r-ann2').set({ authorUid: 'ann', pitch: 'x' });
  assert((await link(db, 'ann', { action: 'link', reelId: 'r-ann2', challengeId: 'c2' }, NOW)).arenaLink.outcome === 'shortlisted', 'shortlisted');
  await db.doc('reels/r-ann3').set({ authorUid: 'ann', pitch: 'x' });
  assert((await link(db, 'ann', { action: 'link', reelId: 'r-ann3', challengeId: 'c3' }, NOW)).arenaLink.outcome === 'submitted', 'rejected is not published');
  await db.doc('reels/r-bo2').set({ authorUid: 'bo', pitch: 'x' });
  assert((await link(db, 'bo', { action: 'link', reelId: 'r-bo2', challengeId: 'c1' }, NOW)).arenaLink.outcome === 'winner', 'winner');
});
await check('refresh re-reads the reviewer\'s status; if the submission is gone the link goes with it', async () => {
  await db.doc('arena_challenges/c1/submissions/s-ann').update({ status: 'shortlisted' });
  const r = await link(db, 'ann', { action: 'refresh', reelId: 'r-ann' }, NOW + 1000);
  assert(r.arenaLink.outcome === 'shortlisted' && r.arenaLink.outcomeCheckedAt === NOW + 1000 && r.arenaLink.linkedAt === NOW, JSON.stringify(r));
  await db.doc('arena_challenges/c1/submissions/s-ann').delete();
  assert((await link(db, 'ann', { action: 'refresh', reelId: 'r-ann' }, NOW + 2000)).arenaLink === null && !(await reel('r-ann')).arenaLink, 'link removed with its evidence');
  await db.doc('arena_challenges/c1/submissions/s-ann').set({ authorUid: 'ann', status: 'submitted' });
});
await check('unlinking removes it, and nothing else on the reel changes', async () => {
  await link(db, 'ann', { action: 'link', reelId: 'r-ann', challengeId: 'c1', contribution: 'x' }, NOW);
  await link(db, 'ann', { action: 'unlink', reelId: 'r-ann' }, NOW);
  const r = await reel('r-ann'); assert(!r.arenaLink && r.pitch === 'My reel' && r.skills[0] === 'SQL', JSON.stringify(r));
  await refuses(link(db, 'bo', { action: 'unlink', reelId: 'r-ann' }, NOW), 403);
});

console.log('== following Arena industries ==');
await check('following is validated against real, active Arena industries', async () => {
  assert((await interests(db, 'ann', { action: 'get' })).industries.length === 0, 'starts empty');
  const r = await interests(db, 'ann', { action: 'follow', industry: 'payments', follow: true });
  assert(r.industries.join() === 'payments' && r.notify === false, 'following does not turn notifications on: ' + JSON.stringify(r));
  await refuses(interests(db, 'ann', { action: 'follow', industry: 'made-up', follow: true }), 400);
  await refuses(interests(db, 'ann', { action: 'follow', industry: 'retired', follow: true }), 400);
  assert((await interests(db, 'ann', { action: 'get' })).industries.join() === 'payments', 'unchanged by refused requests');
});
await check('notifications are a separate opt-in; set replaces both; unfollowing keeps the choice about alerts', async () => {
  const r = await interests(db, 'ann', { action: 'set', industries: ['payments', 'insurance', 'payments'], notify: true });
  assert(r.industries.join() === 'payments,insurance' && r.notify === true, JSON.stringify(r));
  const u = await interests(db, 'ann', { action: 'follow', industry: 'payments', follow: false });
  assert(u.industries.join() === 'insurance' && u.notify === true, JSON.stringify(u));
  const off = await interests(db, 'ann', { action: 'set', industries: ['insurance'], notify: false });
  assert(off.notify === false, 'off');
});
await check('bad input is refused, one member cannot change another, no record is invented', async () => {
  await refuses(interests(db, 'ann', { action: 'set', industries: 'payments', notify: true }), 400);
  await refuses(interests(db, 'ann', { action: 'set', industries: ['payments'], notify: 'yes' }), 400);
  await refuses(interests(db, 'ann', { action: 'set', industries: ['made-up'], notify: true }), 400);
  await refuses(interests(db, 'ann', { action: 'set', industries: Array.from({ length: 13 }, (_, i) => 'industry-' + i), notify: true }), 400);
  await refuses(interests(db, 'ghost', { action: 'set', industries: ['payments'], notify: true }), 404);
  assert(!(await db.doc('users/ghost').get()).exists, 'no account created');
  assert((await interests(db, 'bo', { action: 'get' })).industries.length === 0, 'bo unaffected by ann');
  await refuses(interests(db, '', { action: 'get' }), 401);
});

console.log('== alerts when a challenge goes live ==');
await check('an alert fires on the change TO live, not on every later write', () => {
  assert(wentLive({ verificationStatus: 'pending_ops' }, { verificationStatus: 'live' }) === true, 'approved');
  assert(wentLive(undefined, { verificationStatus: 'live' }) === true, 'created live');
  assert(wentLive({ verificationStatus: 'live' }, { verificationStatus: 'live', viewCount: 5 }) === false, 'a view bump is not news');
  assert(wentLive({ verificationStatus: 'live' }, { verificationStatus: 'suspended' }) === false && wentLive({ verificationStatus: 'live' }, undefined) === false, 'going away');
});
await check('only followers who opted in are told, and never the poster', () => {
  const u = (o) => ({ arenaFollows: ['payments'], arenaNotify: true, ...o });
  assert(wantsAlert(u({}), 'payments', 'poster', 'ann') === true, 'follower who opted in');
  assert(wantsAlert(u({ arenaNotify: false }), 'payments', 'poster', 'ann') === false, 'following alone sends nothing');
  assert(wantsAlert(u({ arenaNotify: undefined }), 'payments', 'poster', 'ann') === false, 'no opt-in recorded');
  assert(wantsAlert(u({ arenaFollows: ['banking'] }), 'payments', 'poster', 'ann') === false, 'different industry');
  assert(wantsAlert(u({}), 'payments', 'ann', 'ann') === false, 'the poster is not told about their own challenge');
  assert(wantsAlert(u({ arenaFollows: 'payments' }), 'payments', 'p', 'ann') === false && wantsAlert(u({}), '', 'p', 'ann') === false, 'malformed');
});
await check('the alert text is plain, bounded and names the company when there is one', () => {
  assert(alertFor('c1', { arenaIndustry: 'payments', title: 'Rethink payments', companyName: 'Acme' }).message === 'Acme posted a new challenge: Rethink payments', 'with company');
  assert(alertFor('c1', { arenaIndustry: 'payments', title: 'T' }).message === 'A new challenge is live: T', 'without');
  assert(alertFor('c1', { title: 'x'.repeat(500) }).message.length < 230, 'bounded');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
