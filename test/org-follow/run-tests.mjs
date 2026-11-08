// Run: tsx test/org-follow/run-tests.mjs
// Guards the follow behaviour behind "Organizations to discover": optimistic and reversible, one request at a time, no duplicate
// follows, shared between lists, per member; and the list rules (never followed, never twice, refills, undo restores in place).
import { createFollowStore } from '../../lib/orgFollow.ts';
import { usable, refill, restoreAt, needsMore } from '../../lib/orgToDiscover.ts';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const gate = () => { let go; const p = new Promise(r => { go = r; }); return { p, go }; };

// A fake server that behaves like api/companies.ts: idempotent, and able to fail.
function fakeApi() {
  const db = new Set(); const calls = []; let failNext = null; let hold = null;
  return {
    db, calls, failWith: m => { failNext = m; }, holdNext: g => { hold = g; },
    api: {
      follow: async id => { calls.push(['follow', id]); if (hold) { const h = hold; hold = null; await h.p; } if (failNext) { const m = failNext; failNext = null; throw new Error(m); } db.add(id); },
      unfollow: async id => { calls.push(['unfollow', id]); if (failNext) { const m = failNext; failNext = null; throw new Error(m); } db.delete(id); },
    },
  };
}

console.log('== the follow store ==');
await check('following changes the state at once, before the server answers, and the server ends up with it', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api); s.seed('u1', []);
  const g = gate(); f.holdNext(g);
  const p = s.follow('a');
  assert(s.getSnapshot().followed.has('a') && s.getSnapshot().pending.has('a'), 'optimistic and pending');
  assert(!f.db.has('a'), 'not saved yet');
  g.go(); const r = await p;
  assert(r.ok && r.changed && f.db.has('a') && !s.getSnapshot().pending.has('a'), 'saved and settled');
});
await check('a failed save puts everything back and says why', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api); s.seed('u1', ['x']);
  f.failWith('Network down');
  const r = await s.follow('a');
  assert(!r.ok && r.reason === 'failed' && r.message === 'Network down', JSON.stringify(r));
  assert(!s.getSnapshot().followed.has('a') && !s.getSnapshot().pending.has('a') && s.getSnapshot().followed.has('x') && !f.db.has('a'), 'restored, nothing saved, others untouched');
  assert((await s.follow('a')).ok, 'a retry works');
});
await check('a second tap while the first is in flight is ignored: one request, never two', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api); s.seed('u1', []);
  const g = gate(); f.holdNext(g);
  const first = s.follow('a'); const second = await s.follow('a'); const third = await s.unfollow('a');
  assert(!second.ok && second.reason === 'busy' && !third.ok && third.reason === 'busy', 'ignored while pending');
  g.go(); await first;
  assert(f.calls.length === 1, 'exactly one request: ' + JSON.stringify(f.calls));
});
await check('following someone you already follow makes no request (no duplicate relationship)', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api); s.seed('u1', ['a']);
  const r = await s.follow('a');
  assert(r.ok && !r.changed && f.calls.length === 0, 'no request');
  assert((await s.unfollow('zzz')).ok && f.calls.length === 0, 'unfollowing someone not followed: no request either');
});
await check('Undo reverses the follow', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api); s.seed('u1', []);
  await s.follow('a'); assert(f.db.has('a'), 'followed');
  const r = await s.unfollow('a');
  assert(r.ok && !f.db.has('a') && !s.getSnapshot().followed.has('a'), 'undone everywhere');
});
await check('a failed undo leaves you following (it does not pretend)', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api); s.seed('u1', []);
  await s.follow('a'); f.failWith('nope');
  const r = await s.unfollow('a');
  assert(!r.ok && s.getSnapshot().followed.has('a') && f.db.has('a'), 'still followed');
});
await check('every list sees the same state: a follow made elsewhere (profile, directory) is marked once and listeners hear it', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api); s.seed('u1', []);
  let heard = 0; const off = s.subscribe(() => heard++);
  s.mark('b', true); s.mark('b', true);
  assert(s.getSnapshot().followed.has('b') && heard === 1, 'one change, one notification');
  s.mark('b', false); assert(!s.getSnapshot().followed.has('b') && heard === 2, 'and back');
  off(); s.mark('b', true); assert(heard === 2, 'unsubscribed listeners hear nothing');
});
await check('the account\'s own follows are always included, and switching member starts from that member\'s list', async () => {
  const f = fakeApi(); const s = createFollowStore(f.api);
  s.seed('u1', ['a', 'b']); s.seed('u1', ['b', 'c']);
  assert([...s.getSnapshot().followed].sort().join() === 'a,b,c', 'union for the same member');
  s.seed('u2', ['z']);
  assert([...s.getSnapshot().followed].join() === 'z' && s.getSnapshot().uid === 'u2', 'a different member never inherits the first one\'s follows');
});

console.log('== the list ==');
const o = (id) => ({ id, name: id });
const ids = (l) => l.map(x => x.id).join();
await check('suggestions never include followed or repeated organizations', () => {
  const r = usable([o('a'), o('b'), o('a'), o('c'), { id: '' }, o('d')], new Set(['b']), new Set(['d']));
  assert(ids(r) === 'a,c', ids(r));
});
await check('refilling keeps the list full, in order, without duplicates or followed organizations', () => {
  const r = refill([o('a'), o('b'), o('c'), o('d')], [o('e'), o('f'), o('b'), o('g')], new Set(['b']), 4);
  assert(ids(r.visible) === 'a,c,d,e' && ids(r.queue) === 'f,g', ids(r.visible) + ' | ' + ids(r.queue));
});
await check('when nothing is left, the list is simply shorter (never padded)', () => {
  const r = refill([o('a')], [], new Set(['a']), 4);
  assert(r.visible.length === 0 && r.queue.length === 0, 'empty');
});
await check('Undo puts the organization back where it was and keeps the list the same length', () => {
  const r = restoreAt([o('a'), o('c'), o('d'), o('e')], [o('f')], o('b'), 1, 4);
  assert(ids(r.visible) === 'a,b,c,d' && ids(r.queue) === 'e,f', ids(r.visible) + ' | ' + ids(r.queue));
  const twice = restoreAt(r.visible, r.queue, o('b'), 1, 4);
  assert(ids(twice.visible) === 'a,b,c,d', 'restoring twice never duplicates');
});
await check('more is fetched only when the list cannot stay full from what is waiting', () => {
  assert(needsMore(4, 0, 4, true) === true && needsMore(4, 5, 4, true) === false && needsMore(2, 0, 4, false) === false, 'needsMore');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
