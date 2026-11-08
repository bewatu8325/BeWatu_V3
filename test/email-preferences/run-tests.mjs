// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/email-preferences/run-tests.mjs"
// Guards api/email-preferences.ts: a member can read and change only their own product-update choice,
// the choice is the same field the unsubscribe link writes, and service email is never a preference.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runAction, HttpError } from '../../api/email-preferences.ts';
import unsubscribeHandler, { unsubscribe, resubscribe, tokenFor } from '../../api/unsubscribe.ts';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status) => { try { await p; } catch (e) { if (e instanceof HttpError && e.status === status) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('was allowed'); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-emailprefs' });
const db = getFirestore();
const SECRET = 'test-secret-123';
await db.doc('users/a').set({ name: 'A' });
await db.doc('users/b').set({ name: 'B', commsOptOut: true });
const u = (uid) => db.doc(`users/${uid}`).get().then(s => s.data());

await check('a member who never chose is subscribed; an opted-out member is not', async () => {
  assert((await runAction(db, 'a', { action: 'get' })).productUpdates === true, 'a');
  assert((await runAction(db, 'b', { action: 'get' })).productUpdates === false, 'b');
});
await check('opting out then back in is recorded with when, on the caller only', async () => {
  assert((await runAction(db, 'a', { action: 'set', productUpdates: false })).productUpdates === false, 'set false');
  let d = await u('a'); assert(d.commsOptOut === true && d.commsOptOutAt, JSON.stringify(d));
  assert((await runAction(db, 'a', { action: 'get' })).productUpdates === false, 'get after opt out');
  await runAction(db, 'a', { action: 'set', productUpdates: true });
  d = await u('a'); assert(d.commsOptOut === false && d.commsResubscribedAt, JSON.stringify(d));
  assert((await u('b')).commsOptOut === true, "someone else's choice changed");
});
await check('repeating the same choice does not rewrite when it was made', async () => {
  await runAction(db, 'a', { action: 'set', productUpdates: false });
  const first = (await u('a')).commsOptOutAt.toMillis();
  await new Promise(r => setTimeout(r, 30));
  await runAction(db, 'a', { action: 'set', productUpdates: false });
  assert((await u('a')).commsOptOutAt.toMillis() === first, 'timestamp moved');
});
await check('the email link and the Settings toggle are one choice', async () => {
  await runAction(db, 'a', { action: 'set', productUpdates: true });
  await unsubscribe(db, SECRET, 'a', tokenFor(SECRET, 'a'));
  assert((await runAction(db, 'a', { action: 'get' })).productUpdates === false, 'link opt-out not seen in Settings');
  await runAction(db, 'a', { action: 'set', productUpdates: true });
  assert((await u('a')).commsOptOut === false, 'Settings opt-in not stored');
  await unsubscribe(db, SECRET, 'a', tokenFor(SECRET, 'a'));
  await resubscribe(db, SECRET, 'a', tokenFor(SECRET, 'a'));
  assert((await runAction(db, 'a', { action: 'get' })).productUpdates === true, 'link resubscribe not seen in Settings');
});
await check('only a real true/false is accepted; no account and unknown actions are refused', async () => {
  for (const bad of ['yes', 1, null, undefined]) await refuses(runAction(db, 'a', { action: 'set', productUpdates: bad }), 400);
  await refuses(runAction(db, 'ghost', { action: 'set', productUpdates: false }), 404);
  await refuses(runAction(db, 'a', { action: 'purge' }), 400);
  await refuses(runAction(db, '', { action: 'get' }), 401);
  assert(!(await db.doc('users/ghost').get()).exists, 'a record was created for a missing account');
});
await check('nothing but the opt-out fields is ever written', async () => {
  const before = await u('a');
  await runAction(db, 'a', { action: 'set', productUpdates: false, isPlatformAdmin: true, name: 'X', commsOptOutAt: 1 });
  const after = await u('a');
  assert(after.name === before.name && !after.isPlatformAdmin, 'extra fields written: ' + JSON.stringify(after));
});

// ── the pages members see from the email link ──
process.env.COMMS_UNSUBSCRIBE_SECRET = SECRET;
const call = async (method, query) => {
  const res = { code: 200, body: '', headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, send(b) { this.body = String(b); return this; }, end() { return this; } };
  await unsubscribeHandler({ method, query, headers: {} }, res);
  return res;
};
await db.doc('users/p').set({ name: 'P' });
const t = tokenFor(SECRET, 'p');
await check('opening the link (GET) changes nothing, however many times a mail scanner fetches it', async () => {
  for (let i = 0; i < 3; i++) { const r = await call('GET', { u: 'p', t }); assert(r.code === 200 && /Unsubscribe/.test(r.body), 'page'); }
  const r2 = await call('GET', { u: 'p', t, a: 'resubscribe' });
  assert(!(await u('p')).commsOptOut, 'a GET changed the record');
});
await check('confirming unsubscribes, and the confirmation offers a way back', async () => {
  const r = await call('POST', { u: 'p', t });
  assert(r.code === 200 && (await u('p')).commsOptOut === true, 'not unsubscribed');
  assert(/Resubscribe/.test(r.body) && /a=resubscribe/.test(r.body) && /method="POST"/.test(r.body), 'no resubscribe button: ' + r.body.slice(-400));
  assert(r.body.includes(`u=p&amp;t=${t}&amp;a=resubscribe`), 'resubscribe link is not the signed link');
});
await check('the resubscribe button works, and a forged one does not', async () => {
  const bad = await call('POST', { u: 'p', t: tokenFor(SECRET, 'someone-else'), a: 'resubscribe' });
  assert(bad.code === 400 && (await u('p')).commsOptOut === true, 'forged resubscribe worked');
  const ok = await call('POST', { u: 'p', t, a: 'resubscribe' });
  assert(ok.code === 200 && /Welcome back/.test(ok.body) && (await u('p')).commsOptOut === false, 'not resubscribed');
});
await check('a mail app one-click unsubscribe (POST with no action) can only ever unsubscribe', async () => {
  const r = await call('POST', { u: 'p', t });
  assert((await u('p')).commsOptOut === true && !/Welcome back/.test(r.body), 'one-click did something else');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
