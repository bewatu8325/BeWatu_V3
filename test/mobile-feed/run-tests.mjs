// Run: npx tsx test/mobile-feed/run-tests.mjs
// Guards what the end of the feed recommends: only real, relevant, not-already-yours records.
import { suggestPeople, suggestPods } from '../../lib/feedSuggestions.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

const me = { id: 1, name: 'Me', industry: 'Technology', reputation: 0 };
const u = (id, name, industry, reputation = 0) => ({ id, name, industry, reputation, headline: '' });
const users = [me, u(2, 'Ann', 'Healthcare', 9), u(3, 'Bo', 'Technology', 1), u(4, 'Cy', 'Technology', 5), u(5, 'Di', 'Finance', 7), u(6, '', 'Technology', 9), u(7, 'Eli', 'Technology', 2)];

check('people: never yourself, never someone already connected or pending, never a nameless record', () => {
  const r = suggestPeople(users, me, new Set([1, 3]));
  assert(!r.some(x => x.id === 1 || x.id === 3 || x.id === 6), r.map(x => x.id).join());
});
check('people: your own industry first, then by reputation', () => {
  const r = suggestPeople(users, me, new Set([1]));
  assert(r.map(x => x.id).join() === '4,7,3', r.map(x => x.id).join());
});
check('people: asks for no more than three, and returns fewer when fewer are real', () => {
  assert(suggestPeople(users, me, new Set([1])).length === 3, 'max 3');
  assert(suggestPeople([me], me, new Set([1])).length === 0, 'nobody else is not padded');
});
check('people: with no industry on your profile, nobody is claimed to be "like you"', () => {
  const r = suggestPeople(users, { ...me, industry: '' }, new Set([1]));
  assert(r.map(x => x.id).join() === '2,5,4', 'falls back to reputation only: ' + r.map(x => x.id));
});
const pod = (id, name, members, visibility = 'open') => ({ id, name, description: '', members, adminId: 9, visibility });
check('pods: not ones you are in, not invite-only, largest first, at most three', () => {
  const r = suggestPods([pod(1, 'Mine', [1, 2, 3]), pod(2, 'Secret', [5, 6, 7, 8], 'invite'), pod(3, 'Small', [5]), pod(4, 'Big', [5, 6, 7]), pod(5, 'Apply', [5, 6], 'apply'), pod(6, 'Mid', [5, 6, 7, 8, 9]), pod(7, '', [5])], me);
  assert(r.map(x => x.id).join() === '6,4,5', r.map(x => x.id).join());
});
check('pods: none to offer means none shown', () => { assert(suggestPods([pod(1, 'Mine', [1])], me).length === 0, 'empty'); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
