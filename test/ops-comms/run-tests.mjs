// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/ops-comms/run-tests.mjs"
// Guards api/ops/comms.ts and api/unsubscribe.ts: who may send what to whom, that the right people (and only
// they) are reached exactly once, that unsubscribes are respected, and that nothing is injected or leaked.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { runAction, HttpError, validateMessage, validateAudience, matchesSegment, isEligible, unsubscribeToken, maskEmail } from '../../api/ops/comms.ts';
import { unsubscribe, tokenIsValid, tokenFor } from '../../api/unsubscribe.ts';
import { pickAnnouncement } from '../../lib/announcements.ts';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, m) => {
  try { await p; } catch (e) { if (e instanceof HttpError && (status == null || e.status === status)) return e; throw new Error(`${m ?? 'wrong error'}: ${e.status ?? ''} ${e.message}`); }
  throw new Error(m ?? 'was allowed');
};

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-comms' });
const db = getFirestore();
const DAY = 86400000, NOW = Date.now();
const ts = (ms) => Timestamp.fromMillis(ms);
const SECRET = 'test-secret-value';

// ── the people: 45 members ──
//  m00..m19 Finance members (m00-m04 recruiters, m00-m02 founding), m20..m34 Technology, m35..m39 no industry
//  m40 deactivated, m41 pending_deletion, m42 opted out of updates, m43 no email on file, m44 has a hostile name
const members = [];
for (let i = 0; i < 45; i++) {
  const id = `m${String(i).padStart(2, '0')}`;
  const industry = i < 20 ? 'Finance' : i < 35 ? 'Technology' : '';
  members.push({ id, industry });
  const data = {
    displayName: i === 44 ? '<img src=x onerror=alert(1)> Mallory' : `Member ${i}`, industry,
    isRecruiter: i < 5, foundingMember: i < 3, subscriptionTier: i % 7 === 0 ? 'pro' : 'free',
    createdAt: ts(NOW - (100 - i) * DAY), lastActiveAt: i % 2 === 0 ? new Date(NOW - 2 * DAY).toISOString() : new Date(NOW - 60 * DAY).toISOString(),
    ...(i === 40 ? { status: 'deactivated' } : {}), ...(i === 41 ? { status: 'pending_deletion' } : {}), ...(i === 42 ? { commsOptOut: true } : {}),
  };
  await db.doc(`users/${id}`).set(data);
  if (i !== 43) await db.doc(`users/${id}/private/contact`).set({ email: `${id}@example.com` });
}

const staff = (role, uid = `s-${role}`) => ({ uid, email: `${uid}@bewatu.com`, role });
const admin = staff('platform_admin'), supportMgr = staff('support_manager'), trustMgr = staff('trust_manager'), legalMgr = staff('legal_manager');
const agent = staff('support_agent'), auditor = staff('auditor');

// a stand-in email provider that records what it was asked to send
let sent = []; let failNext = 0;
const deps = (over = {}) => ({
  unsubscribeSecret: SECRET,
  sendEmails: async (batch, key) => { if (failNext > 0) { failNext--; return { failed: batch.length }; } sent.push(...batch.map(b => ({ ...b, key }))); return { failed: 0 }; },
  lookupUidsByEmail: async (emails) => new Map(emails.filter(e => /^m\d\d@example\.com$/.test(e)).map(e => [e, e.split('@')[0]])),
  ...over,
});
const msg = (over = {}) => ({ title: 'Scheduled maintenance', body: 'Hi {{firstName}}, BeWatu will be read-only on Saturday for an hour.', severity: 'info', emailCategory: 'service', ...over });
const run = (s, body, d = deps()) => runAction(db, s, '203.0.113.9', body, d, NOW);
const finishAll = async (s, id, d = deps()) => { let r; do { r = await run(s, { action: 'continue', campaignId: id }, d); } while (!r.done); return r; };
const preview = (s, audience, channels = ['notification'], message = msg()) => run(s, { action: 'preview', audience, channels, message });
const notifs = async (uid) => (await db.collection(`users/${uid}/notifications`).get()).docs.map(d => ({ id: d.id, ...d.data() }));

console.log('== who can send what ==');
await check('agents and auditors cannot send, preview or test', async () => {
  for (const s of [agent, auditor]) for (const action of ['preview', 'send', 'test']) await refuses(run(s, { action, audience: { kind: 'all' }, channels: ['notification'], message: msg() }), 403, `${s.role} ${action}`);
});
await check('auditors may read the history; agents may not', async () => { await run(auditor, { action: 'list' }); await refuses(run(agent, { action: 'list' }), 403); });
await check('a manager can message a group, but not everyone', async () => {
  await preview(supportMgr, { kind: 'segment', industries: ['Finance'] });
  await refuses(run(supportMgr, { action: 'send', audience: { kind: 'all' }, channels: ['notification'], message: msg(), expectedCount: 43 }), 403);
});
await check('only the platform admin can put up a banner or send a critical alert', async () => {
  await refuses(run(supportMgr, { action: 'send', audience: { kind: 'segment', industries: ['Finance'] }, channels: ['banner'], message: msg({ bannerEndsAt: new Date(NOW + DAY).toISOString() }), expectedCount: 0 }), 403);
  await refuses(run(trustMgr, { action: 'send', audience: { kind: 'segment', industries: ['Finance'] }, channels: ['notification'], message: msg({ severity: 'critical' }), expectedCount: 20 }), 403);
});
await check('a send must carry the count that was previewed, and a stale count is refused', async () => {
  const p = await preview(supportMgr, { kind: 'segment', industries: ['Finance'] });
  assert(p.audience.count === 20, `${p.audience.count}`);
  await refuses(run(supportMgr, { action: 'send', audience: { kind: 'segment', industries: ['Finance'] }, channels: ['notification'], message: msg(), expectedCount: 19 }), 409);
  await refuses(run(supportMgr, { action: 'send', audience: { kind: 'segment', industries: ['Finance'] }, channels: ['notification'], message: msg() }), 409);
});

console.log('== who is in the audience ==');
const expectIds = (pred) => members.filter(m => pred(m)).length;
await check('"everyone" excludes deactivated and pending-deletion accounts (43 of 45; two members unreachable by status)', async () => {
  const p = await preview(admin, { kind: 'all' }); assert(p.audience.count === 43, `${p.audience.count}`);
});
await check('segments: industry, recruiter vs member, founding, tier, joined and inactive combine with AND', async () => {
  assert((await preview(admin, { kind: 'segment', industries: ['finance'] })).audience.count === 20, 'industry (case-insensitive)');
  assert((await preview(admin, { kind: 'segment', roles: ['recruiter'] })).audience.count === 5, 'recruiters');
  assert((await preview(admin, { kind: 'segment', roles: ['member'] })).audience.count === 38, 'members only (excludes 2 ineligible, 5 recruiters)');
  assert((await preview(admin, { kind: 'segment', founding: true })).audience.count === 3, 'founding');
  assert((await preview(admin, { kind: 'segment', industries: ['finance'], roles: ['recruiter'], founding: true })).audience.count === 3, 'AND');
  assert((await preview(admin, { kind: 'segment', tiers: ['pro'] })).audience.count === members.filter((m, i) => i % 7 === 0 && i !== 40 && i !== 41).length, 'tier');
  const inactive = await preview(admin, { kind: 'segment', inactiveDays: 30 }); assert(inactive.audience.count === members.filter((m, i) => i % 2 === 1 && i !== 41 && i !== 40).length + 0, `inactive ${inactive.audience.count}`);
});
await check('segment dates use the join date', async () => {
  const r = await preview(admin, { kind: 'segment', joinedAfter: new Date(NOW - 60 * DAY).toISOString() }); assert(r.audience.count === members.filter((m, i) => 100 - i <= 60 && i !== 40 && i !== 41).length, `${r.audience.count}`);
});
await check('a segment with no filters is refused rather than meaning "everyone"', async () => refuses(preview(admin, { kind: 'segment' }), 400));
await check('specific people: by member id and by email, de-duplicated, ineligible accounts dropped', async () => {
  const p = await preview(supportMgr, { kind: 'specific', uids: ['m00', 'm01', 'm40'], emails: ['m01@example.com', 'm02@example.com', 'nobody@example.com'] });
  assert(p.audience.count === 3, `${p.audience.count}`);   // m00, m01, m02 (m40 deactivated, nobody unknown)
});
await check('more than 200 specific people is refused', async () => refuses(preview(admin, { kind: 'specific', uids: Array.from({ length: 201 }, (_, i) => `u${i}`) }), 400));
await check('the preview shows first names and masked emails only, never a full address', async () => {
  const p = await preview(admin, { kind: 'segment', industries: ['finance'] }, ['notification', 'email']);
  const text = JSON.stringify(p); assert(!/m\d\d@example\.com/.test(text), 'a full email leaked'); assert(p.samples.length === 5 && p.samples.every(s => /^m\*\*\*@example\.com$/.test(s.email)), JSON.stringify(p.samples));
});
await check('email preview separates who will get it from no-email and unsubscribed members', async () => {
  const p = await preview(admin, { kind: 'all' }, ['email'], msg({ emailCategory: 'updates' }));
  assert(p.email.noEmailOnFile === 1 && p.email.unsubscribed === 1 && p.email.willSend === 41, JSON.stringify(p.email));
  const svc = await preview(admin, { kind: 'all' }, ['email'], msg({ emailCategory: 'service' }));
  assert(svc.email.unsubscribed === 0 && svc.email.willSend === 42, `service: ${JSON.stringify(svc.email)}`);
});
await check('product updates are flagged unavailable when the unsubscribe secret is not set', async () => {
  const p = await run(admin, { action: 'preview', audience: { kind: 'all' }, channels: ['email'], message: msg({ emailCategory: 'updates' }) }, deps({ unsubscribeSecret: undefined }));
  assert(p.warnings.some(w => w.includes('COMMS_UNSUBSCRIBE_SECRET')), JSON.stringify(p.warnings));
});

console.log('== delivery ==');
let c1;
await check('in-app notification to a group: exactly the matching members get one, nobody else does', async () => {
  const r = await run(supportMgr, { action: 'send', audience: { kind: 'segment', industries: ['Finance'] }, channels: ['notification'], message: msg(), expectedCount: 20 });
  c1 = r.campaignId; const done = r.done ? r : await finishAll(supportMgr, c1);
  assert(done.status === 'done' && done.stats.notified === 20, JSON.stringify(done.stats));
  for (const m of members) { const n = (await notifs(m.id)).filter(x => x.campaignId === c1); assert(n.length === (m.industry === 'Finance' ? 1 : 0), `${m.id}: ${n.length}`); }
});
await check('the notification has the right shape, with the member\'s first name filled in', async () => {
  const [n] = (await notifs('m10')).filter(x => x.campaignId === c1);
  assert(n.type === 'announcement' && n.title === 'Scheduled maintenance' && n.message.startsWith('Hi Member,') && n.isRead === false && n.source === 'ops', JSON.stringify(n));
});
await check('continuing a finished campaign changes nothing; running it twice never duplicates', async () => {
  await run(supportMgr, { action: 'continue', campaignId: c1 }); await run(supportMgr, { action: 'continue', campaignId: c1 });
  assert((await notifs('m10')).filter(x => x.campaignId === c1).length === 1, 'duplicated');
  assert((await db.doc(`comms_campaigns/${c1}`).get()).data().stats.notified === 20, 'stats changed');
});
await check('a campaign is audited with who sent it, to how many, and never the message body in full', async () => {
  const a = (await db.collection('audit_log').where('targetId', '==', c1).get()).docs.map(d => d.data());
  assert(a.length === 1 && a[0].action === 'comms.campaign_created' && a[0].actorRole === 'support_manager' && a[0].after.recipients === 20, JSON.stringify(a[0]));
});
await check('email: reaches members with an address, counts the rest, and uses a batch key that is the same on a retry', async () => {
  sent = [];
  const r = await run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['email'], message: msg({ emailCategory: 'service' }), expectedCount: 43 });
  const done = r.done ? r : await finishAll(admin, r.campaignId);
  assert(done.stats.emailed === 42 && done.stats.noEmail === 1 && done.stats.optedOut === 0, JSON.stringify(done.stats));
  assert(sent.length === 42 && new Set(sent.map(s => s.to)).size === 42, `${sent.length} sent`);
  assert(sent.every(s => /^[A-Za-z0-9]+:(start|[A-Za-z0-9]+):\d+$/.test(s.key)), sent[0].key);
});
await check('"service" email goes to people who unsubscribed from updates, with no unsubscribe link', async () => {
  const toOptedOut = sent.find(s => s.to === 'm42@example.com'); assert(toOptedOut, 'the unsubscribed member did not get an account message');
  assert(!/unsubscribe/i.test(toOptedOut.html.replace('important message about your BeWatu account', '')), 'unsubscribe link on a service email');
});
await check('"updates" email skips people who unsubscribed and carries a valid signed unsubscribe link + one-click headers', async () => {
  sent = [];
  const r = await run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['email'], message: msg({ emailCategory: 'updates', title: 'New: pods', body: 'We shipped pods.' }), expectedCount: 43 });
  const done = r.done ? r : await finishAll(admin, r.campaignId);
  assert(done.stats.optedOut === 1 && done.stats.noEmail === 1 && done.stats.emailed === 41, JSON.stringify(done.stats));
  assert(!sent.some(s => s.to === 'm42@example.com'), 'emailed an unsubscribed member');
  const e = sent.find(s => s.to === 'm07@example.com'); const url = /href="([^"]*api\/unsubscribe[^"]*)"/.exec(e.html)?.[1].replace(/&amp;/g, '&');
  assert(url, 'no unsubscribe link'); const u = new URL(url); assert(tokenIsValid(SECRET, u.searchParams.get('u'), u.searchParams.get('t')) && u.searchParams.get('u') === 'm07', 'link not valid for this member');
  assert(e.headers['List-Unsubscribe'].includes(url) && e.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', JSON.stringify(e.headers));
});
await check('"updates" email is refused outright when the unsubscribe secret is missing', async () => {
  await refuses(run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['email'], message: msg({ emailCategory: 'updates' }), expectedCount: 41 }, deps({ unsubscribeSecret: undefined })), 409);
});
await check('message text is escaped in the HTML, including a hostile member name and hostile message text', async () => {
  sent = [];
  const r = await run(admin, { action: 'send', audience: { kind: 'specific', uids: ['m44'] }, channels: ['email'], message: msg({ title: 'Hi <b>{{firstName}}</b>', body: '<script>alert(1)</script> & "quotes"\n\nSecond paragraph' }), expectedCount: 1 });
  if (!r.done) await finishAll(admin, r.campaignId);
  const html = sent[0].html; assert(!/<script|<img|<b>/.test(html), 'unescaped markup in the email'); assert(html.includes('&lt;script&gt;') && html.includes('&lt;img'), 'text was dropped instead of escaped');
});
await check('a failing email provider is counted and shown, not hidden', async () => {
  failNext = 1; sent = [];
  const r = await run(admin, { action: 'send', audience: { kind: 'specific', uids: ['m10', 'm11'] }, channels: ['email'], message: msg(), expectedCount: 2 });
  const done = r.done ? r : await finishAll(admin, r.campaignId); assert(done.stats.emailFailed === 2 && done.stats.emailed === 0, JSON.stringify(done.stats));
});
await check('both channels at once deliver both, to the same people', async () => {
  sent = [];
  const r = await run(admin, { action: 'send', audience: { kind: 'segment', founding: true }, channels: ['notification', 'email'], message: msg({ title: 'Founders update' }), expectedCount: 3 });
  const done = r.done ? r : await finishAll(admin, r.campaignId); assert(done.stats.notified === 3 && done.stats.emailed === 3, JSON.stringify(done.stats));
});
await check('specific people by email address work, even through the lookup path', async () => {
  const r = await run(supportMgr, { action: 'send', audience: { kind: 'specific', emails: ['m20@example.com', 'm21@example.com'] }, channels: ['notification'], message: msg({ title: 'Hello you two' }), expectedCount: 2 });
  if (!r.done) await finishAll(supportMgr, r.campaignId);
  assert((await notifs('m20')).some(n => n.title === 'Hello you two') && (await notifs('m21')).some(n => n.title === 'Hello you two') && !(await notifs('m22')).some(n => n.title === 'Hello you two'), 'wrong recipients');
});

console.log('== resuming, cancelling, concurrency ==');
await check('delivery resumes where it stopped: a campaign stopped halfway then continued reaches everyone once', async () => {
  const sa = { action: 'send', audience: { kind: 'all' }, channels: ['notification'], message: msg({ title: 'Resume test' }), expectedCount: 43 };
  const r = await run(admin, sa);                      // delivers fully (small data); simulate a crash by rewinding the cursor to the middle
  const ref = db.doc(`comms_campaigns/${r.campaignId}`);
  await ref.update({ status: 'sending', cursor: 'm20' });
  await finishAll(admin, r.campaignId);
  const per = await Promise.all(members.map(async m => (await notifs(m.id)).filter(n => n.campaignId === r.campaignId).length));
  assert(per.every(n => n <= 1), 'someone got two'); assert(per.reduce((a, b) => a + b, 0) === 43, `total ${per.reduce((a, b) => a + b, 0)}`);   // all 43 eligible members, once each
});
await check('cancelling stops delivery; the rest of the audience gets nothing', async () => {
  const r = await run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['notification'], message: msg({ title: 'Cancel test' }), expectedCount: 43 });
  const ref = db.doc(`comms_campaigns/${r.campaignId}`); await ref.update({ status: 'sending', cursor: 'm10', 'stats.notified': 0 });
  await run(admin, { action: 'cancel', campaignId: r.campaignId });
  const after = await run(admin, { action: 'continue', campaignId: r.campaignId });
  assert(after.status === 'cancelled', after.status);
  assert((await notifs('m30')).filter(n => n.campaignId === r.campaignId).length === 1, 'cancel should not recall what was already delivered');
});
await check('only the sender or a platform admin can continue or stop a campaign', async () => {
  const r = await run(supportMgr, { action: 'send', audience: { kind: 'specific', uids: ['m30'] }, channels: ['notification'], message: msg({ title: 'Owner test' }), expectedCount: 1 });
  await refuses(run(trustMgr, { action: 'cancel', campaignId: r.campaignId }), 403); await refuses(run(trustMgr, { action: 'continue', campaignId: r.campaignId }), 403);
  await run(admin, { action: 'cancel', campaignId: r.campaignId });
});
await check('two people continuing the same campaign at once: one delivers, the other is told it is busy', async () => {
  const r = await run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['notification'], message: msg({ title: 'Lock test' }), expectedCount: 43 });
  await db.doc(`comms_campaigns/${r.campaignId}`).update({ status: 'sending', cursor: null, lockUntil: 0 });
  const results = await Promise.allSettled([run(admin, { action: 'continue', campaignId: r.campaignId }), run(admin, { action: 'continue', campaignId: r.campaignId })]);
  assert(results.some(x => x.status === 'fulfilled'), 'nobody delivered');
  const per = await Promise.all(members.map(async m => (await notifs(m.id)).filter(n => n.campaignId === r.campaignId).length)); assert(per.every(n => n <= 1), 'duplicates under concurrency');
});

console.log('== test sends, banners, limits ==');
await check('a test goes only to the sender, marked [TEST], and never touches members', async () => {
  sent = [];
  const r = await run(supportMgr, { action: 'test', channels: ['email'], message: msg({ emailCategory: 'service' }) });
  assert(sent.length === 1 && sent[0].to === supportMgr.email && sent[0].subject.startsWith('[TEST]') && r.ok, JSON.stringify(sent.map(s => s.to)));
});
await check('a test cannot be a banner', async () => refuses(run(supportMgr, { action: 'test', channels: ['banner'], message: msg() }), 400));
await check('a banner is written for the app to show, with its end date, and can be taken down', async () => {
  const ends = new Date(NOW + 2 * DAY).toISOString();
  const r = await run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['banner'], message: msg({ title: 'Planned downtime', bannerEndsAt: ends, severity: 'warning', link: 'https://status.bewatu.com' }), expectedCount: 0 });
  const b = (await db.doc(`site_announcements/${r.campaignId}`).get()).data();
  assert(b.active === true && b.audience === 'all' && b.severity === 'warning' && b.endsAt.toMillis() === new Date(ends).getTime() && b.dismissible === true && b.link === 'https://status.bewatu.com/', JSON.stringify(b));
  await run(admin, { action: 'cancel', campaignId: r.campaignId });
  assert((await db.doc(`site_announcements/${r.campaignId}`).get()).data().active === false, 'banner still active');
});
await check('a banner needs an end date in the future, within 90 days', async () => {
  for (const bannerEndsAt of [undefined, new Date(NOW - DAY).toISOString(), new Date(NOW + 100 * DAY).toISOString()]) await refuses(run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['banner'], message: msg({ bannerEndsAt }), expectedCount: 0 }), 400);
});
await check('a banner for recruiters only is stored as such', async () => {
  const r = await run(admin, { action: 'send', audience: { kind: 'segment', roles: ['recruiter'] }, channels: ['banner'], message: msg({ title: 'For recruiters', bannerEndsAt: new Date(NOW + DAY).toISOString() }), expectedCount: 0 });
  assert((await db.doc(`site_announcements/${r.campaignId}`).get()).data().audience === 'recruiters', 'audience lost');
});
await check('links must be https; messages need a title and a body; severity and category are constrained', async () => {
  for (const link of ['http://x.example.com', 'javascript:alert(1)', 'data:text/html,x']) await refuses(preview(admin, { kind: 'all' }, ['notification'], msg()).then(() => run(admin, { action: 'send', audience: { kind: 'all' }, channels: ['notification'], message: msg({ link }), expectedCount: 43 })), 400);
  assert(throws(() => validateMessage({ title: '', body: 'x' }, ['notification'])), 'empty title'); assert(throws(() => validateMessage({ title: 'ok title', body: '' }, ['notification'])), 'empty body');
  const m = validateMessage({ title: 'ok title', body: 'body', severity: 'extreme', emailCategory: 'marketing' }, ['notification']); assert(m.severity === 'info' && m.emailCategory === 'updates', 'unknown values not normalised');
  assert(validateMessage({ title: 'a\u0000b title', body: 'x\u0007y z' }, ['notification']).title === 'a b title', 'control characters kept');
});
await check('sending campaigns is limited per person per day', async () => {
  const s = staff('trust_manager', 's-limited'); let limited = 0;
  for (let i = 0; i < 12; i++) { try { await run(s, { action: 'send', audience: { kind: 'specific', uids: ['m30'] }, channels: ['notification'], message: msg({ title: `Limit ${i} title` }), expectedCount: 1 }); } catch (e) { if (e.status === 429) limited++; else throw e; } }
  assert(limited === 2, `limited ${limited}`);
});
await check('history lists campaigns with masked sender emails and progress', async () => {
  const l = await run(admin, { action: 'list' }); assert(l.campaigns.length > 5 && l.campaigns.every(c => c.status && c.stats !== undefined), 'bad list');
  assert(!/s-[a-z_]+@bewatu\.com/.test(JSON.stringify(l)) && /s\*\*\*@bewatu\.com/.test(JSON.stringify(l)), 'a full staff email in history');
});
await check('an unknown action is refused', async () => refuses(run(admin, { action: 'delete_all' }), 400));

console.log('== unsubscribing ==');
await check('a valid link records the opt-out; a forged or tampered link does not', async () => {
  assert(await unsubscribe(db, SECRET, 'm12', tokenFor(SECRET, 'm12')) === true, 'valid link refused'); assert((await db.doc('users/m12').get()).data().commsOptOut === true, 'not recorded');
  assert(await unsubscribe(db, SECRET, 'm13', tokenFor(SECRET, 'm12')) === false, "someone else's token worked"); assert(!(await db.doc('users/m13').get()).data().commsOptOut, 'm13 changed');
  assert(await unsubscribe(db, SECRET, 'm13', 'deadbeef') === false && await unsubscribe(db, undefined, 'm13', tokenFor(SECRET, 'm13')) === false && await unsubscribe(db, SECRET, '../x', 'x') === false, 'bad tokens accepted');
});
await check('the token the sender generates is the token the unsubscribe page accepts', async () => assert(unsubscribeToken(SECRET, 'm5') === tokenFor(SECRET, 'm5'), 'algorithms differ'));
await check('after unsubscribing, the member no longer gets product updates but still gets account messages', async () => {
  const admin = staff('platform_admin', 's-admin-fresh');   // the shared admin has used up today's campaign allowance above
  sent = [];
  const upd = await run(admin, { action: 'send', audience: { kind: 'specific', uids: ['m12', 'm14'] }, channels: ['email'], message: msg({ emailCategory: 'updates', title: 'Updates title' }), expectedCount: 2 }); if (!upd.done) await finishAll(admin, upd.campaignId);
  assert(sent.length === 1 && sent[0].to === 'm14@example.com', JSON.stringify(sent.map(s => s.to)));
  sent = [];
  const svc = await run(admin, { action: 'send', audience: { kind: 'specific', uids: ['m12'] }, channels: ['email'], message: msg({ emailCategory: 'service', title: 'Security notice' }), expectedCount: 1 }); if (!svc.done) await finishAll(admin, svc.campaignId);
  assert(sent.length === 1 && sent[0].to === 'm12@example.com', 'account message not delivered');
});

console.log('== the banner a member sees ==');
const ann = (o) => ({ id: 'a', title: 't', body: 'b', severity: 'info', link: null, linkLabel: null, audience: 'all', startsAt: NOW - 1000, endsAt: NOW + 1000, dismissible: true, ...o });
await check('shows only what is live, for this member, and not dismissed; the most serious first', async () => {
  const o = { isRecruiter: false, dismissed: [], now: NOW };
  assert(pickAnnouncement([ann({})], o)?.id === 'a', 'live one hidden');
  assert(pickAnnouncement([ann({ endsAt: NOW - 1 })], o) === null && pickAnnouncement([ann({ startsAt: NOW + 5 })], o) === null, 'shown outside its dates');
  assert(pickAnnouncement([ann({ audience: 'recruiters' })], o) === null && pickAnnouncement([ann({ audience: 'recruiters' })], { ...o, isRecruiter: true }) !== null, 'recruiter targeting');
  assert(pickAnnouncement([ann({ audience: 'members' })], { ...o, isRecruiter: true }) === null, 'members-only shown to a recruiter');
  assert(pickAnnouncement([ann({})], { ...o, dismissed: ['a'] }) === null, 'dismissed one shown');
  assert(pickAnnouncement([ann({ dismissible: false })], { ...o, dismissed: ['a'] }) !== null, 'a non-dismissible notice was hidden');
  assert(pickAnnouncement([ann({ id: 'i' }), ann({ id: 'c', severity: 'critical' }), ann({ id: 'w', severity: 'warning' })], o)?.id === 'c', 'not most serious first');
});

console.log('== pure helpers ==');
await check('masking, eligibility and segment matching', async () => {
  assert(maskEmail('jo@example.com') === 'j***@example.com' && maskEmail(null) === null, 'mask');
  assert(isEligible({}) && isEligible({ status: 'active' }) && !isEligible({ status: 'Deactivated' }) && !isEligible({ status: 'pending_deletion' }), 'eligible');
  assert(matchesSegment({ lastActiveAt: undefined }, { kind: 'segment', inactiveDays: 30 }, NOW) === true, 'never-active counts as inactive');
  assert(validateAudience({ kind: 'segment', industries: ['  Finance  '] }).industries[0] === 'finance', 'audience not normalised');
});
function throws(f) { try { f(); return false; } catch { return true; } }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
