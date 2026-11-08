// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/invitations/run-tests.mjs"
// Guards "Invite your people":
//   - the link is a signed random id: nothing guessable, nothing about anyone in it, checked on the server
//   - an invitation never grants anything (a private Pod is not even named to someone outside it)
//   - one invitation per person per destination, a cap on how often anyone is emailed, opt-outs honoured, no contact import
//   - the inviter's identity is shown only if their profile is public; the inviter hears about a join only if they want to
//   - statuses are true (expiry is derived), resend/revoke obey their rules, and "completed" is checked against real records
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  runAction, previewInvitation, markStarted, suppress, runDaily, funnel, hit,
  tokenFor, idFromToken, normalizeEmail, maskEmail, cleanMessage, statusOf, usable, destinationFor, publicIdentity, isBot,
  emailHash, LIMITS, HttpError,
} from '../../api/invitations.ts';
import { createHmac } from 'node:crypto';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status) => { try { await p; } catch (e) { if (e instanceof HttpError && e.status === status) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('was allowed'); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-invitations' });
const db = getFirestore();
const SECRET = 'test-secret-for-invitations';
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

let outbox = []; let mailOk = true;
const members = { 'ed@x.com': 'ed' };
const deps = (o = {}) => ({ db, secret: SECRET, now: NOW, mail: async m => { if (mailOk) outbox.push(m); return mailOk; }, memberByEmail: async e => members[e] ?? null, origin: 'https://example.test', ...o });
const wipe = async () => { for (const c of ['invitations', 'invitation_joins', 'invitation_events', 'invitation_metrics', 'invitation_rate_limits', 'email_suppressions', 'connections', 'followRequests']) { const s = await db.collection(c).get(); await Promise.all(s.docs.map(x => x.ref.delete())); } const u = await db.collection('users').doc('ann').collection('notifications').get(); await Promise.all(u.docs.map(x => x.ref.delete())); outbox = []; mailOk = true; };

// ── the world ──
const ts = ms => Timestamp.fromMillis(ms);
await db.doc('users/ann').set({ displayName: 'Ann Okoro', numericId: 1, username: 'ann', photoURL: 'https://img.test/ann.png', headline: 'Product lead', isPublic: true });
await db.doc('users/bo').set({ displayName: 'Bo Private', numericId: 2, isPublic: true, privacySettings: { profileVisibility: 'private' } });
await db.doc('users/cy').set({ displayName: 'Cy New', numericId: 3, isPublic: true, createdAt: ts(NOW + 1000) });
await db.doc('users/dee').set({ displayName: 'Dee Old', numericId: 4, isPublic: true, createdAt: ts(NOW - 400 * DAY) });
await db.doc('users/eve').set({ displayName: 'Eve Hidden', numericId: 5, isPublic: false, createdAt: ts(NOW + 1000) });
await db.doc('users/fay').set({ displayName: 'Fay Third', numericId: 6, isPublic: true, createdAt: ts(NOW + 1000) });
await db.doc('users/ed').set({ displayName: 'Ed Quiet', numericId: 7, commsOptOut: true });
await db.doc('users/closed').set({ displayName: 'Closed', numericId: 8, isPublic: true, privacySettings: { allowConnectionRequests: false } });
await db.doc('pods/p-open').set({ name: 'Fintech founders', visibility: 'open', members: ['ann'], adminUid: 'ann' });
await db.doc('pods/p-priv').set({ name: 'Secret Pod', visibility: 'invite', members: ['bo'], adminUid: 'bo' });
await db.doc('circles/c-num').set({ name: 'Numeric circle', visibility: 'open', members: [1], adminId: 1 });
await db.doc('arena_challenges/ch1').set({ title: 'Rethink payments', verificationStatus: 'live', deadline: new Date(NOW + 10 * DAY).toISOString() });
await db.doc('arena_challenges/ch-old').set({ title: 'Old', verificationStatus: 'live', deadline: new Date(NOW - DAY).toISOString() });
await db.doc('arena_challenges/ch-draft').set({ title: 'Draft', verificationStatus: 'pending_ops', deadline: new Date(NOW + 10 * DAY).toISOString() });

const link = (purpose = 'connect', extra = {}, uid = 'ann', d = deps()) => runAction(d, uid, { action: 'create', kind: 'link', purpose, ...extra });
const mail = (emails, purpose = 'connect', extra = {}, uid = 'ann', d = deps()) => runAction(d, uid, { action: 'create', kind: 'email', purpose, emails, ...extra }, { email: 'ann@me.test' });
const tokenOf = inv => tokenFor(SECRET, inv.id);

console.log('== the link ==');
await check('a token is a signed random id: it checks out, and nothing else does', () => {
  const t = tokenFor(SECRET, 'abcdefghijklmnop');
  assert(idFromToken(SECRET, t) === 'abcdefghijklmnop', 'round trip');
  assert(idFromToken('other-secret', t) === null, 'wrong secret');
  assert(idFromToken(SECRET, t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')) === null, 'one character off');
  assert(idFromToken(SECRET, 'abcdefghijklmnop.') === null && idFromToken(SECRET, 'x') === null && idFromToken(SECRET, null) === null && idFromToken(SECRET, 'abcdefghijklmnop.AAAAAAAAAAAAAAAAAAAAAA') === null, 'junk');
  assert(idFromToken(undefined, t) === null, 'no secret: nothing is valid (fail closed)');
});
await check('the link carries no email, name or account detail', async () => {
  await wipe();
  const r = await mail(['sam@work.test']);
  const url = outbox[0].text.match(/https:\/\/example\.test\/invite\/([A-Za-z0-9_.-]+)/)[1];
  assert(/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/.test(url), 'exactly an id and a signature: ' + url);
  assert(!url.includes('@') && !url.includes('=') && !url.includes('%'), 'no identity');
  assert(r.results[0].result === 'sent', 'sent');
});
await check('no secret configured: creating and opening both refuse', async () => {
  await refuses(link('connect', {}, 'ann', deps({ secret: undefined })), 503);
  await refuses(previewInvitation(deps({ secret: undefined }), 'x', 'Mozilla/5.0 Chrome', '1.1.1.1'), 503);
});
await check('helpers: emails, masking, message cleaning, bots', () => {
  assert(normalizeEmail(' Sam@Work.TEST ') === 'sam@work.test' && !normalizeEmail('nope') && !normalizeEmail('a@b') && !normalizeEmail('a b@c.com') && !normalizeEmail(5), 'emails');
  assert(maskEmail('samuel@work.test') === 's•••@work.test', maskEmail('samuel@work.test'));
  assert(cleanMessage('  hi\u0000 there\n\n\n\nbye  ', 50) === 'hi there\n\nbye' && cleanMessage('x'.repeat(900)).length === LIMITS.MESSAGE_MAX && cleanMessage(5) === '', 'message');
  assert(isBot('facebookexternalhit/1.1') && isBot('WhatsApp/2.2') && isBot(undefined) && !isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1'), 'bots');
});

console.log('== creating ==');
await check('a personal link is one link per destination: asking again gives the same one', async () => {
  await wipe();
  const a = await link('connect'); const b = await link('connect');
  assert(a.invitation.id === b.invitation.id && b.reused === true && a.invitation.url === b.invitation.url, 'same link');
  const pod = await link('pod', { targetId: 'p-open' });
  assert(pod.invitation.id !== a.invitation.id, 'a different destination is a different link');
  assert((await db.collection('invitations').get()).size === 2, 'two records');
});
await check('the destination must make sense', async () => {
  await refuses(link('nonsense'), 400);
  await refuses(runAction(deps(), 'ann', { action: 'create', kind: 'sms', purpose: 'connect' }), 400);
  await refuses(link('connect', { targetId: 'p-open' }), 400);
  await refuses(link('pod', { targetId: 'no/such' }), 400);
  await refuses(link('pod', { targetId: 'missing' }), 404);
  await refuses(link('arena', { targetId: 'ch-old' }), 404);
  await refuses(link('arena', { targetId: 'ch-draft' }), 404);
  await refuses(link('arena', { targetId: 'missing' }), 404);
  assert((await link('arena', { targetId: 'ch1' })).invitation.targetName === 'Rethink payments', 'a live challenge is fine');
  assert((await link('community')).invitation.targetId === null, 'a community with no destination is the community page');
  assert((await link('pod', { targetId: 'c-num' })).invitation.targetName === 'Numeric circle', 'circles work too');
});
await check('only members can invite people to a private Pod', async () => {
  await refuses(link('pod', { targetId: 'p-priv' }, 'ann'), 403);
  assert((await link('pod', { targetId: 'p-priv' }, 'bo')).invitation.targetName === 'Secret Pod', 'a member can');
});
await check('email: sent once, masked in the answer, the message is escaped and the opt-out is in it', async () => {
  await wipe();
  const r = await mail(['Sam@Work.test'], 'pod', { targetId: 'p-open', message: 'Join <b>us</b> & see' });
  assert(r.results.length === 1 && r.results[0].result === 'sent' && r.results[0].email === 's••@work.test', JSON.stringify(r));
  assert(outbox.length === 1 && outbox[0].to === 'sam@work.test', 'one email');
  assert(outbox[0].html.includes('Join &lt;b&gt;us&lt;/b&gt; &amp; see') && !outbox[0].html.includes('<b>us</b>'), 'escaped');
  assert(/api\/invitations\?optout=1&e=[0-9a-f]{64}&t=[0-9a-f]{64}/.test(outbox[0].html) && outbox[0].headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'opt-out and one-click header');
  assert(outbox[0].subject.includes('Fintech founders'), 'a public Pod can be named in the subject');
  assert(JSON.stringify(r).includes('sam@work.test') === false, 'the full address never comes back');
});
await check('a private Pod is never named in the email', async () => {
  await wipe(); await mail(['sam@work.test'], 'pod', { targetId: 'p-priv' }, 'bo');
  assert(!outbox[0].subject.includes('Secret') && !outbox[0].html.includes('Secret Pod') && !outbox[0].text.includes('Secret Pod'), 'not named');
});
await check('one invitation per person per destination; others on the same list still go out', async () => {
  await wipe();
  await mail(['sam@work.test']);
  const r = await mail(['sam@work.test', 'kim@work.test', 'bad', 'ann@me.test']);
  assert(r.results.map(x => x.result).join() === 'duplicate,sent,invalid,self', r.results.map(x => x.result).join());
  assert(outbox.length === 2, 'two emails in total, none for the duplicate');
  const other = await mail(['sam@work.test'], 'pod', { targetId: 'p-open' });
  assert(other.results[0].result === 'sent', 'the same person may be invited somewhere else');
  assert((await mail(['x1@a.test', 'x2@a.test', 'x3@a.test', 'x4@a.test', 'x5@a.test', 'x6@a.test']).catch(e => e.status)) === 400, 'five at a time');
});
await check('nobody is emailed more than three times a week, whoever asks', async () => {
  await wipe();
  for (const p of [['connect'], ['community'], ['pod', { targetId: 'p-open' }]]) assert((await mail(['pop@work.test'], ...p)).results[0].result === 'sent', 'first three go');
  const fourth = await mail(['pop@work.test'], 'arena', { targetId: 'ch1' }, 'bo');
  assert(fourth.results[0].result === 'limited' && fourth.results[0].reason === 'recipient', JSON.stringify(fourth));
  const later = await mail(['pop@work.test'], 'arena', { targetId: 'ch1' }, 'bo', deps({ now: NOW + 8 * DAY }));
  assert(later.results[0].result === 'sent', 'a week later it is fine');
});
await check('an inviter cannot email more than 20 people a day', async () => {
  await wipe();
  for (let i = 0; i < 20; i++) await mail([`p${i}@work.test`]);
  assert((await mail(['p99@work.test'])).results[0].reason === 'daily', 'capped');
  assert(outbox.length === 20, '20 sent');
});
await check('someone who opted out is not mailed; neither is a member who turned email off; both look the same', async () => {
  await wipe();
  const h = emailHash(SECRET, 'gone@work.test');
  const sig = createHmac('sha256', SECRET).update('invite-optout:' + h).digest('hex');
  assert(await suppress(deps(), h, sig) === true, 'opt out');
  const r = await mail(['gone@work.test', 'ed@x.com', 'ok@work.test']);
  assert(r.results.map(x => x.result).join() === 'not_delivered,not_delivered,sent', r.results.map(x => x.result).join());
  assert(outbox.length === 1 && outbox[0].to === 'ok@work.test', 'only the one');
  assert(await suppress(deps(), h, sig, true) === true && (await mail(['gone@work.test'])).results[0].result === 'sent', 'undo works');
  assert(await suppress(deps(), h, 'f'.repeat(64)) === false && await suppress(deps(), 'nothex', sig) === false && await suppress(deps({ secret: undefined }), h, sig) === false, 'forged opt-out links do nothing');
});
await check('a failed send is reported, kept, and can be sent again', async () => {
  await wipe(); mailOk = false;
  const r = await mail(['sam@work.test']);
  assert(r.results[0].result === 'failed' && r.results[0].invitation.deliveryFailed === true, JSON.stringify(r.results[0]));
  mailOk = true;
  const again = await runAction(deps({ now: NOW + 2 * DAY }), 'ann', { action: 'resend', id: r.results[0].invitation.id });
  assert(again.invitation.deliveryFailed === false && outbox.length === 1, 'delivered on the second try');
});
await check('a link counts as an invitation when it is shared, once; their note travels with it; the funnel never counts a bare link', async () => {
  await wipe();
  const l = (await link('connect')).invitation;
  const day = () => db.doc(`invitation_metrics/${new Date(NOW).toISOString().slice(0, 10)}`).get().then(s => s.data() ?? {});
  assert(!(await day()).created, 'just opening the sheet creates no invitation');
  await runAction(deps(), 'ann', { action: 'shared', id: l.id, channel: 'copy', message: 'Hello <b>there</b>' });
  await runAction(deps(), 'ann', { action: 'shared', id: l.id, channel: 'native' });
  const m = await day();
  assert(m.created === 1 && m.shared === 2, JSON.stringify(m));
  const p = (await previewInvitation(deps(), tokenOf(l), 'Mozilla/5.0 Chrome/120', '9.9.9.9')).body;
  assert(p.message === 'Hello <b>there</b>', 'the note is data, shown as text by the page: ' + p.message);
  assert((await db.doc(`invitations/${l.id}`).get()).data().shares === 2, 'shares counted');
  await refuses(runAction(deps(), 'bo', { action: 'shared', id: l.id }), 404);
  const e = (await mail(['z@work.test'])).results[0].invitation;
  await refuses(runAction(deps(), 'ann', { action: 'shared', id: e.id }), 400);
});
await check('creating is rate limited per member', async () => {
  await wipe();
  for (let i = 0; i < LIMITS.CREATES_PER_HOUR; i++) await link('connect');
  await refuses(link('connect'), 429);
  await link('connect', {}, 'ann', deps({ now: NOW + 2 * 3_600_000 }));
});

console.log('== resend and revoke ==');
await check('resend: once a day, three sends in all, only for email, only while pending', async () => {
  await wipe();
  const r = await mail(['sam@work.test']); const id = r.results[0].invitation.id;
  await refuses(runAction(deps({ now: NOW + 3600_000 }), 'ann', { action: 'resend', id }), 429);
  const r2 = await runAction(deps({ now: NOW + DAY + 1 }), 'ann', { action: 'resend', id });
  assert(r2.invitation.sends === 2, 'second');
  await runAction(deps({ now: NOW + 2 * DAY + 2 }), 'ann', { action: 'resend', id });
  await refuses(runAction(deps({ now: NOW + 3 * DAY + 3 }), 'ann', { action: 'resend', id }), 429);
  await refuses(runAction(deps(), 'bo', { action: 'resend', id }), 404);
  const l = (await link('connect')).invitation;
  await refuses(runAction(deps(), 'ann', { action: 'resend', id: l.id }), 400);
});
await check('revoke: the link stops working; a person who already joined stays joined', async () => {
  await wipe();
  const l = (await link('connect')).invitation;
  const t = tokenOf(l);
  assert((await previewInvitation(deps(), t, 'Mozilla/5.0 Chrome/120', '2.2.2.2')).body.state === 'ok', 'works');
  const rv = await runAction(deps(), 'ann', { action: 'revoke', id: l.id });
  assert(rv.invitation.status === 'revoked' && rv.invitation.url === null, 'revoked, no link given back');
  assert((await previewInvitation(deps(), t, 'Mozilla/5.0 Chrome/120', '2.2.2.2')).status === 410, 'preview says withdrawn');
  await refuses(runAction(deps(), 'cy', { action: 'accept', token: t }), 410);
  await refuses(runAction(deps(), 'bo', { action: 'revoke', id: l.id }), 404);
  const e = (await mail(['sam@work.test'])).results[0].invitation;
  await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(e) });
  await refuses(runAction(deps(), 'ann', { action: 'revoke', id: e.id }), 409);
});

console.log('== what the invited person sees ==');
await check('the inviter is shown only if their profile is public', async () => {
  await wipe();
  const a = (await link('connect')).invitation; const b = (await link('connect', {}, 'bo')).invitation;
  const pa = (await previewInvitation(deps(), tokenOf(a), 'Mozilla/5.0 Chrome/120', '3.3.3.3')).body;
  const pb = (await previewInvitation(deps(), tokenOf(b), 'Mozilla/5.0 Chrome/120', '3.3.3.3')).body;
  assert(pa.inviter.name === 'Ann Okoro' && pa.inviter.headline === 'Product lead' && pa.inviter.avatarUrl, JSON.stringify(pa.inviter));
  assert(pb.inviter === null, 'a private profile is just "a BeWatu member"');
  assert(!JSON.stringify(pa).includes('"ann"') && !('inviterUid' in pa) && !JSON.stringify(pa).includes('numericId'), 'no ids leak');
  assert(publicIdentity({ displayName: 'X', privacySettings: { profileVisibility: 'connections' } }) === null && publicIdentity({ displayName: 'X', isPublic: false }) === null && publicIdentity(undefined) === null, 'identity rules');
});
await check('a private Pod is described but not named; a public one is named', async () => {
  await wipe();
  const priv = (await link('pod', { targetId: 'p-priv' }, 'bo')).invitation; const open = (await link('pod', { targetId: 'p-open' })).invitation;
  const pp = (await previewInvitation(deps(), tokenOf(priv), 'Mozilla/5.0 Chrome/120', '4.4.4.4')).body;
  const po = (await previewInvitation(deps(), tokenOf(open), 'Mozilla/5.0 Chrome/120', '4.4.4.4')).body;
  assert(pp.target.private === true && pp.target.name === null && !JSON.stringify(pp).includes('Secret'), JSON.stringify(pp.target));
  assert(po.target.name === 'Fintech founders' && po.action === 'request_to_join', JSON.stringify(po));
});
await check('opens count people; link previews and scanners are kept apart', async () => {
  await wipe();
  const l = (await link('connect')).invitation; const t = tokenOf(l);
  await previewInvitation(deps(), t, 'Mozilla/5.0 (iPhone) Safari/604.1', '5.5.5.5');
  await previewInvitation(deps(), t, 'WhatsApp/2.23', '5.5.5.5');
  await previewInvitation(deps(), t, 'facebookexternalhit/1.1', '5.5.5.5');
  const m = (await db.doc(`invitation_metrics/${new Date(NOW).toISOString().slice(0, 10)}`).get()).data();
  assert(m.opened === 1 && m.opened_bot === 2 && !m.created, 'a link nobody shared yet is not an invitation: ' + JSON.stringify(m));
  assert((await db.doc(`invitations/${l.id}`).get()).data().opens === 1, 'only the person counts');
});
await check('a forged, expired or unknown link says so, and cannot be hammered', async () => {
  await wipe();
  assert((await previewInvitation(deps(), 'nonsense', 'Mozilla/5.0 Chrome', '6.6.6.6')).status === 404, 'forged');
  assert((await previewInvitation(deps(), tokenFor(SECRET, 'AAAAAAAAAAAAAAAA'), 'Mozilla/5.0 Chrome', '6.6.6.6')).status === 404, 'signed but not real');
  const l = (await link('connect')).invitation;
  const late = await previewInvitation(deps({ now: NOW + 31 * DAY }), tokenOf(l), 'Mozilla/5.0 Chrome', '6.6.6.6');
  assert(late.status === 200 && late.body.state === 'expired', 'expired is explained');
  let last; for (let i = 0; i < LIMITS.OPEN_PER_HOUR_PER_IP + 2; i++) last = await previewInvitation(deps(), 'x', 'Mozilla/5.0 Chrome', '7.7.7.7');
  assert(last.status === 429, 'throttled per address');
});
await check('starting to sign up is counted once per real person, not by scanners, and only while the link works', async () => {
  await wipe();
  const l = (await link('connect')).invitation; const t = tokenOf(l);
  await markStarted(deps(), t, '8.8.8.8', 'Mozilla/5.0 Chrome/120');
  await markStarted(deps(), t, '8.8.8.8', 'Slackbot-LinkExpanding 1.0');
  await markStarted(deps(), 'forged', '8.8.8.8', 'Mozilla/5.0 Chrome/120');
  const m = (await db.doc(`invitation_metrics/${new Date(NOW).toISOString().slice(0, 10)}`).get()).data();
  assert(m.signup_started === 1, JSON.stringify(m));
});

console.log('== arriving ==');
await check('accepting records the join once, tells them where to go, and grants nothing', async () => {
  await wipe();
  const l = (await link('pod', { targetId: 'p-priv' }, 'bo')).invitation;
  const a = await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(l) });
  assert(a.destination.type === 'pod' && a.destination.id === 'p-priv' && a.action === 'request_to_join', JSON.stringify(a));
  assert(a.existingMember === false && a.alreadyAccepted === false, 'a new member');
  const pod = (await db.doc('pods/p-priv').get()).data();
  assert(JSON.stringify(pod.members) === JSON.stringify(['bo']) && !pod.pendingMembers, 'the Pod is untouched: no seat, not even a request');
  const again = await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(l) });
  assert(again.alreadyAccepted === true && (await db.collection('invitation_joins').get()).size === 1, 'idempotent');
  assert((await db.doc(`invitations/${l.id}`).get()).data().joinedCount === 1, 'counted once');
});
await check('you cannot accept your own link', async () => {
  await wipe(); const l = (await link('connect')).invitation;
  await refuses(runAction(deps(), 'ann', { action: 'accept', token: tokenOf(l) }), 400);
});
await check('an email invitation is for one person; a personal link works for several', async () => {
  await wipe();
  const e = (await mail(['sam@work.test'])).results[0].invitation;
  await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(e) });
  await refuses(runAction(deps(), 'fay', { action: 'accept', token: tokenOf(e) }), 410);
  const l = (await link('connect')).invitation;
  await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(l) });
  await runAction(deps(), 'fay', { action: 'accept', token: tokenOf(l) });
  assert((await runAction(deps(), 'ann', { action: 'list' })).invitations.find(i => i.id === l.id).joinedCount === 2, 'two joined');
});
await check('someone who already has an account is not treated as new, and sees the same invitation', async () => {
  await wipe();
  const l = (await link('arena', { targetId: 'ch1' })).invitation;
  const a = await runAction(deps(), 'dee', { action: 'accept', token: tokenOf(l) });
  assert(a.existingMember === true && a.destination.type === 'challenge' && a.destination.id === 'ch1' && a.action === 'view_challenge', JSON.stringify(a));
  const m = (await db.doc(`invitation_metrics/${new Date(NOW).toISOString().slice(0, 10)}`).get()).data();
  assert(m.accepted_existing === 1 && !m.signup_completed, 'counted as an existing member, not a signup');
});
await check('a connection invitation to someone who closed connection requests offers nothing to press', async () => {
  await wipe(); const l = (await link('connect', {}, 'closed')).invitation;
  assert((await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(l) })).action === 'explore', 'no connect button');
});
await check('the inviter is told someone joined, by name only if the newcomer is public, and not at all if they switched it off', async () => {
  await wipe();
  const l = (await link('connect')).invitation;
  await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(l) });
  await runAction(deps(), 'eve', { action: 'accept', token: tokenOf(l) });
  const n = (await db.collection('users/ann/notifications').get()).docs.map(x => x.data());
  assert(n.length === 2 && n.every(x => x.type === 'invitation_joined' && x.isRead === false), JSON.stringify(n));
  assert(n.some(x => x.message === 'Cy New joined BeWatu from your invitation'), 'named');
  assert(n.some(x => x.message === 'Someone you invited joined BeWatu from your invitation') && !n.some(x => x.message.includes('Eve')), 'a private newcomer is not named');
  await wipe();
  assert((await runAction(deps(), 'ann', { action: 'prefs', joinedAlerts: false })).joinedAlerts === false, 'switched off');
  const l2 = (await link('connect')).invitation;
  await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(l2) });
  assert((await db.collection('users/ann/notifications').get()).size === 0, 'silent');
  await runAction(deps(), 'ann', { action: 'prefs', joinedAlerts: true });
});

console.log('== completing ==');
await check('"completed" is true only when the real record exists', async () => {
  await wipe();
  const c = (await link('connect')).invitation; const tc = tokenOf(c);
  await refuses(runAction(deps(), 'cy', { action: 'complete', token: tc }), 409);
  await runAction(deps(), 'cy', { action: 'accept', token: tc });
  assert((await runAction(deps(), 'cy', { action: 'complete', token: tc })).completed === false, 'not yet: no request exists');
  await db.collection('connections').add({ senderUid: 'cy', receiverUid: 'ann', status: 'pending' });
  assert((await runAction(deps(), 'cy', { action: 'complete', token: tc })).completed === true, 'now it is');
  assert((await runAction(deps(), 'cy', { action: 'complete', token: tc })).already === true && (await db.doc(`invitations/${c.id}`).get()).data().completedCount === 1, 'once');

  const p = (await link('pod', { targetId: 'p-open' })).invitation; const tp = tokenOf(p);
  await runAction(deps(), 'fay', { action: 'accept', token: tp });
  assert((await runAction(deps(), 'fay', { action: 'complete', token: tp })).completed === false, 'no request yet');
  await db.doc('pods/p-open').update({ pendingMembers: ['fay'] });
  assert((await runAction(deps(), 'fay', { action: 'complete', token: tp })).completed === true, 'a join request counts');

  const a = (await link('arena', { targetId: 'ch1' })).invitation; const ta = tokenOf(a);
  await runAction(deps(), 'cy', { action: 'accept', token: ta });
  assert((await runAction(deps(), 'cy', { action: 'complete', token: ta })).completed === false, 'looking at a challenge is not taking part');
  await db.doc('arena_challenges/ch1/submissions/s1').set({ authorUid: 'cy', status: 'submitted' });
  assert((await runAction(deps(), 'cy', { action: 'complete', token: ta })).completed === true, 'a submission is');
});

console.log('== your invitations ==');
await check('statuses are pending, joined, expired and revoked, and expiry is never stale', async () => {
  await wipe();
  const p = (await link('connect')).invitation; const j = (await mail(['joined@work.test'])).results[0].invitation; const r = (await mail(['revoked@work.test'])).results[0].invitation; const x = (await link('community')).invitation;
  await runAction(deps(), 'cy', { action: 'accept', token: tokenOf(j) });
  await runAction(deps(), 'ann', { action: 'revoke', id: r.id });
  const now = await runAction(deps(), 'ann', { action: 'list' });
  const by = id => now.invitations.find(i => i.id === id);
  assert([p, j, r, x].map(i => by(i.id).status).join() === 'pending,joined,revoked,pending', [p, j, r, x].map(i => by(i.id).status).join());
  assert(now.summary.pending === 2 && now.summary.joined === 1, JSON.stringify(now.summary));
  const later = await runAction(deps({ now: NOW + 31 * DAY }), 'ann', { action: 'list' });
  assert(later.invitations.find(i => i.id === p.id).status === 'expired' && later.invitations.find(i => i.id === j.id).status === 'joined' && later.invitations.find(i => i.id === r.id).status === 'revoked', 'expired is derived');
  assert(later.invitations.find(i => i.id === p.id).url === null, 'an expired link is not offered');
  assert(by(j.id).recipient === 'j•••@work.test' && !JSON.stringify(now).includes('joined@work.test'), 'addresses are masked');
  assert((await runAction(deps(), 'bo', { action: 'list' })).invitations.length === 0, 'you see only your own');
});
await check('statusOf / usable / destinationFor', () => {
  const base = { status: 'pending', expiresAt: NOW + 1, joinedCount: 0 };
  assert(statusOf(base, NOW) === 'pending' && statusOf({ ...base, expiresAt: NOW }, NOW) === 'expired' && statusOf({ ...base, joinedCount: 1 }, NOW + 99) === 'joined' && statusOf({ ...base, status: 'revoked', joinedCount: 3 }, NOW) === 'revoked', 'status');
  assert(usable({ ...base, kind: 'email' }, NOW) && !usable({ ...base, kind: 'email', joinedCount: 1 }, NOW) && usable({ ...base, kind: 'link', joinedCount: 49 }, NOW) && !usable({ ...base, kind: 'link', joinedCount: 50 }, NOW), 'usable');
  assert(destinationFor({ purpose: 'connect', targetId: null }).type === 'profile' && destinationFor({ purpose: 'community', targetId: null }).type === 'community' && destinationFor({ purpose: 'pod', targetId: null }).type === 'pods' && destinationFor({ purpose: 'arena', targetId: null }).type === 'arenas', 'no destination');
});

console.log('== reminder and activation ==');
await check('one gentle reminder, only if the member asked for it, never to someone who opted out', async () => {
  await wipe();
  await mail(['yes@work.test'], 'connect', { reminder: true }); await mail(['no@work.test']); await mail(['quiet@work.test'], 'community', { reminder: true });
  const h = emailHash(SECRET, 'quiet@work.test');
  outbox = [];
  assert((await runDaily(deps({ now: NOW + 2 * DAY }))).reminded === 0, 'too early');
  await suppress(deps(), h, createHmac('sha256', SECRET).update('invite-optout:' + h).digest('hex'));
  const day = await runDaily(deps({ now: NOW + 6 * DAY }));
  assert(day.reminded === 1 && outbox.length === 1 && outbox[0].to === 'yes@work.test' && outbox[0].subject.startsWith('A reminder'), JSON.stringify(day) + outbox.map(o => o.to));
  assert((await runDaily(deps({ now: NOW + 7 * DAY }))).reminded === 0 && outbox.length === 1, 'never a second');
});
await check('a member is "active" after a real connection, a Pod seat or a reel, not just for joining; the window closes after 14 days', async () => {
  await wipe();
  const l = (await link('connect')).invitation; const t = tokenOf(l);
  await runAction(deps(), 'cy', { action: 'accept', token: t });
  await runAction(deps(), 'fay', { action: 'accept', token: t });
  await runAction(deps(), 'dee', { action: 'accept', token: t });
  assert((await runDaily(deps({ now: NOW + 3 * DAY }))).activated === 0, 'joining alone is not activity');
  await db.collection('connections').add({ senderUid: 'ann', receiverUid: 'cy', status: 'accepted' });
  await db.collection('reels').add({ authorUid: 'fay', pitch: 'x' });
  const r = await runDaily(deps({ now: NOW + 4 * DAY }));
  assert(r.activated === 2, JSON.stringify(r));
  assert((await runDaily(deps({ now: NOW + 5 * DAY }))).activated === 0, 'counted once');
  const late = await runDaily(deps({ now: NOW + 20 * DAY }));
  assert(late.lapsed === 1, 'dee never became active inside the window: ' + JSON.stringify(late));
  const m = (await db.doc(`invitation_metrics/${new Date(NOW + 4 * DAY).toISOString().slice(0, 10)}`).get()).data();
  assert(m.activated === 2, JSON.stringify(m));
});
await check('the funnel measures people who engaged, not invitations sent', () => {
  const f = funnel({ created: 100, opened: 40, signup_started: 20, signup_completed: 8, accepted_existing: 2, completed: 5, activated: 3 });
  assert(f.joined === 10 && f.openedPerCreated === 40 && f.joinedPerOpened === 25 && f.completedPerJoined === 50 && f.activatedPerJoined === 30, JSON.stringify(f));
  assert(funnel({}).joinedPerOpened === null, 'no division by zero');
});
await check('rate limit window resets', async () => {
  await wipe();
  for (let i = 0; i < 3; i++) assert(await hit(db, 'k', 3, 1000, NOW), 'in');
  assert(!(await hit(db, 'k', 3, 1000, NOW + 10)), 'out');
  assert(await hit(db, 'k', 3, 1000, NOW + 1001), 'reset');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
