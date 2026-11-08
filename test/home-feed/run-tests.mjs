// Run: tsx test/home-feed/run-tests.mjs
// Guards what Home shows: who is in For You / Following, where recommendation cards go, and the small per-member memories.
import {
  followingIdsOf, followingPosts, forYouPosts, postEngagement, ENGAGEMENT_FLOOR, discoverySlots,
  suggestJobs, loadDismissed, dismissCard, DISMISS_MS, readRowHint, writeRowHint, parseTab,
} from '../../lib/homeFeed.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); }, m }; };

const U = (id, o = {}) => ({ id, name: 'U' + id, industry: '', skills: [], ...o });
const P = (id, authorId, o = {}) => ({ id, authorId, content: 'x', appreciations: { helpful: 0, thoughtProvoking: 0, collaborationReady: 0 }, comments: 0, shares: 0, timestamp: '1h ago', ...o });
const ME = U(1, { industry: 'Fintech', skills: [{ name: 'Product Strategy', endorsements: 0 }] });
const users = new Map([
  [2, U(2)], [3, U(3, { industry: 'fintech' })], [4, U(4, { skills: [{ name: 'product strategy', endorsements: 1 }] })],
  [5, U(5)], [6, U(6, { industry: 'Fintech', privacySettings: { profileVisibility: 'private' } })], [7, U(7)],
  [8, U(8, { industry: 'Fintech', privacySettings: { profileVisibility: 'connections' } })], [9, U(9)],
]);
const ctx = (o = {}) => ({ me: ME, networkIds: new Set([1, 2]), followingIds: new Set([9]), authorOf: id => users.get(id), ...o });
const ids = ps => ps.map(p => p.id).join();

console.log('== Following ==');
check('follows are only the accepted ones I sent', () => {
  const f = followingIdsOf(1, [
    { id: 1, fromUserId: 1, toUserId: 5, status: 'accepted' }, { id: 2, fromUserId: 1, toUserId: 6, status: 'pending' },
    { id: 3, fromUserId: 7, toUserId: 1, status: 'accepted' }, { id: 4, fromUserId: 1, toUserId: 8, status: 'declined' },
  ]);
  assert([...f].join() === '5', 'only 5: ' + [...f]);
  assert(followingIdsOf(1, undefined).size === 0, 'no data is no follows');
});
check('Following is people I follow, my connections and me, never a pod post or a stranger', () => {
  const posts = [P(1, 5), P(2, 2), P(3, 1), P(4, 7), P(5, 5, { circleId: 3 })];
  assert(ids(followingPosts(posts, 1, new Set([5]), new Set([2]))) === '1,2,3', ids(followingPosts(posts, 1, new Set([5]), new Set([2]))));
  assert(followingPosts(posts, 1, new Set(), new Set()).length === 1, 'new member: only their own');
});

console.log('== For You ==');
check('network and follows are in, and so is a post that has a real reason', () => {
  const posts = [P(1, 2), P(2, 9), P(3, 3), P(4, 4), P(5, 5, { comments: ENGAGEMENT_FLOOR })];
  assert(ids(forYouPosts(posts, ctx())) === '1,2,3,4,5', ids(forYouPosts(posts, ctx())));
});
check('a stranger with nothing in common and no engagement is left out: no padding', () => {
  const posts = [P(1, 5), P(2, 7, { appreciations: { helpful: 1, thoughtProvoking: 0, collaborationReady: 1 } })];
  assert(forYouPosts(posts, ctx()).length === 0, 'nothing qualifies');
  assert(postEngagement(posts[1]) === 2 && ENGAGEMENT_FLOOR === 3, 'floor is real');
});
check('private or connections-only profiles never surface to people outside their network, even with shared industry', () => {
  const posts = [P(1, 6), P(2, 8)];
  assert(forYouPosts(posts, ctx()).length === 0, 'hidden');
  assert(ids(forYouPosts(posts, ctx({ networkIds: new Set([1, 6, 8]) }))) === '1,2', 'their own network still sees them');
});
check('pod posts, unknown authors and a member with no industry or skills are handled', () => {
  const posts = [P(1, 2, { circleId: 4 }), P(2, 99), P(3, 5)];
  assert(forYouPosts(posts, ctx()).length === 0, 'pod post out, unknown author out, no shared industry');
  const bare = ctx({ me: U(1) });
  assert(forYouPosts([P(1, 3)], bare).length === 0, 'empty industry never matches empty industry');
});

console.log('== recommendation cards ==');
const ALL = { arena: true, community: true, opportunities: true };
const kinds = s => s.map(x => x.kind + '@' + x.after).join();
check('established feed: Arena after 3, community after 7, opportunities after 11, each once', () => {
  assert(kinds(discoverySlots(20, new Set(), ALL)) === 'arena@3,community@7,opportunities@11', kinds(discoverySlots(20, new Set(), ALL)));
});
check('a short feed keeps Arena and opportunities at its end, and leaves community to the end-of-feed suggestions', () => {
  assert(kinds(discoverySlots(0, new Set(), ALL)) === 'arena@0,opportunities@0', kinds(discoverySlots(0, new Set(), ALL)));
  assert(kinds(discoverySlots(5, new Set(), ALL)) === 'arena@3,opportunities@5', kinds(discoverySlots(5, new Set(), ALL)));
  assert(kinds(discoverySlots(7, new Set(), ALL)) === 'arena@3,community@7,opportunities@7', 'community from 7');
});
check('closed or empty kinds are not placed', () => {
  assert(kinds(discoverySlots(20, new Set(['arena']), ALL)) === 'community@7,opportunities@11', 'dismissed');
  assert(kinds(discoverySlots(20, new Set(), { ...ALL, opportunities: false })) === 'arena@3,community@7', 'nothing real to show');
});
check('closing a card keeps it away for a week, per member, and old closes expire', () => {
  const s = mem(); const t = 1_800_000_000_000;
  dismissCard(s, 'u1', 'arena', t);
  assert(loadDismissed(s, 'u1', t + 1000).has('arena'), 'closed');
  assert(!loadDismissed(s, 'u2', t + 1000).has('arena'), 'per member');
  assert(!loadDismissed(s, 'u1', t + DISMISS_MS + 1).has('arena'), 'a week later it returns');
  dismissCard(s, 'u1', 'community', t + DISMISS_MS + 5);
  const left = JSON.parse(s.m.get('bewatuHomeDismissed:u1'));
  assert(!('arena' in left) && 'community' in left, 'expired entries are dropped: ' + JSON.stringify(left));
});
check('junk or blocked storage never throws and nothing is dismissed', () => {
  const s = mem(); s.m.set('bewatuHomeDismissed:u1', 'not json'); assert(loadDismissed(s, 'u1').size === 0, 'junk');
  s.m.set('bewatuHomeDismissed:u1', '{"arena":"x","community":99999999999999}'); assert(loadDismissed(s, 'u1', 1_800_000_000_000).size === 0, 'wrong types and future dates');
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert(loadDismissed(broken, 'u1').size === 0, 'blocked'); dismissCard(broken, 'u1', 'arena'); writeRowHint(broken, 'u1', 'sparks', true); assert(!readRowHint(broken, 'u1', 'sparks'), 'blocked hint');
  dismissCard(s, 'u1', 'nonsense', 1); assert(!JSON.parse(s.m.get('bewatuHomeDismissed:u1') ?? '{}').nonsense, 'unknown kind ignored');
});

console.log('== opportunities ==');
const NOW = 1_800_000_000_000;
const J = (id, o = {}) => ({ id, title: 'Role ' + id, description: 'desc', status: 'Active', verificationStatus: 'live', liveDate: new Date(NOW - id * 86_400_000).toISOString(), expiryDate: new Date(NOW + 5 * 86_400_000).toISOString(), ...o });
check('only live, active, unexpired jobs; a skill match first, then the newest', () => {
  const jobs = [J(1), J(2, { status: 'Suspended' }), J(3, { verificationStatus: 'pending_verification' }), J(4, { expiryDate: new Date(NOW - 1000).toISOString() }), J(5, { title: 'Product Strategy lead' }), J(6, { verificationStatus: undefined })];
  const got = suggestJobs(jobs, ME, 5, NOW).map(j => j.id).join();
  assert(got === '5,1,6', got);
  assert(suggestJobs(jobs, ME, 1, NOW).length === 1, 'respects max');
  assert(suggestJobs([], ME, 2, NOW).length === 0 && suggestJobs([J(2, { status: 'Suspended' })], ME, 2, NOW).length === 0, 'nothing real: no card');
});

console.log('== rows and tab ==');
check('a row that had content last time reserves room; one that never did reserves nothing', () => {
  const s = mem();
  assert(!readRowHint(s, 'u1', 'sparks'), 'new member: nothing reserved');
  writeRowHint(s, 'u1', 'sparks', true); assert(readRowHint(s, 'u1', 'sparks') && !readRowHint(s, 'u1', 'reels') && !readRowHint(s, 'u2', 'sparks'), 'per row, per member');
  writeRowHint(s, 'u1', 'sparks', false); assert(!readRowHint(s, 'u1', 'sparks'), 'cleared when it empties');
});
check('the saved tab is either of ours, otherwise For You', () => {
  assert(parseTab('following') === 'following' && parseTab('for_you') === 'for_you' && parseTab('x') === 'for_you' && parseTab(null) === 'for_you', 'tabs');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
