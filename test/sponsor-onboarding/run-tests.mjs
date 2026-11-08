// Run: tsx test/sponsor-onboarding/run-tests.mjs
// Guards how "Become a sponsor" remembers what you were doing and decides what to do when you come back.
import { saveIntent, loadIntent, clearIntent, resumeAction, INTENT_TTL_MS } from '../../lib/sponsorIntent.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); }, m }; };
const NOW = 1_800_000_000_000;

console.log('== remembering the Arena ==');
check('saving keeps only the Arena (no organization, branding or personal details) and reads back', () => {
  const s = mem(); saveIntent(s, 'u1', 'payments', 'Payments Arena', 'claim', NOW);
  const raw = JSON.parse(s.m.get('bewatuSponsorIntent:u1'));
  assert(Object.keys(raw).sort().join() === 'arenaId,arenaName,savedAt,via', 'only a pointer: ' + Object.keys(raw));
  const back = loadIntent(s, 'u1', NOW + 1000);
  assert(back.arenaId === 'payments' && back.arenaName === 'Payments Arena' && back.via === 'claim', JSON.stringify(back));
});
check('one pointer per member: another member, or no member, sees nothing', () => {
  const s = mem(); saveIntent(s, 'u1', 'payments', 'P', 'create', NOW);
  assert(loadIntent(s, 'u2', NOW) === null && loadIntent(s, '', NOW) === null, 'not shared');
  saveIntent(s, 'u1', 'insurance', 'I', 'create', NOW + 5);
  assert(loadIntent(s, 'u1', NOW + 10).arenaId === 'insurance', 'a new start replaces the old one: never two');
});
check('it expires, and anything not written by us is discarded rather than trusted', () => {
  const s = mem(); saveIntent(s, 'u1', 'payments', 'P', null, NOW);
  assert(loadIntent(s, 'u1', NOW + INTENT_TTL_MS - 1) !== null, 'still fresh');
  assert(loadIntent(s, 'u1', NOW + INTENT_TTL_MS + 1) === null && s.m.size === 0, 'expired and removed');
  for (const bad of ['not json', '{"arenaId":"../x","savedAt":1}', '{"arenaId":"payments"}', 'null', '[]', '{"arenaId":"payments","savedAt":' + (NOW + 10 * 86400000) + '}']) {
    s.m.set('bewatuSponsorIntent:u1', bad); assert(loadIntent(s, 'u1', NOW) === null, 'rejects ' + bad); assert(s.m.size === 0, 'and removes it');
  }
});
check('an invalid Arena or member is never saved; a broken store never throws', () => {
  const s = mem();
  assert(saveIntent(s, 'u1', '../etc', 'x', null, NOW) === null && saveIntent(s, '', 'payments', 'x', null, NOW) === null && s.m.size === 0, 'refused');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert(saveIntent(broken, 'u1', 'payments', 'P', null, NOW) === null && loadIntent(broken, 'u1', NOW) === null, 'private mode / blocked storage is fine');
  clearIntent(broken, 'u1');
});
check('clearing removes it', () => { const s = mem(); saveIntent(s, 'u1', 'payments', 'P', null, NOW); clearIntent(s, 'u1'); assert(loadIntent(s, 'u1', NOW) === null, 'gone'); });

console.log('== coming back ==');
const E = (o = {}) => ({ arena: { open: true }, organizations: [], pendingClaims: [], ...o });
const org = (state, existing = null) => ({ state, existing });
check('what to do when the member returns, from what the server says', () => {
  assert(resumeAction(E()) === 'finish_setup', 'no organization yet: finish setting one up');
  assert(resumeAction(E({ organizations: [org('eligible')] })) === 'open_flow', 'a verified organization: carry on');
  assert(resumeAction(E({ organizations: [org('pending_verification')] })) === 'wait_for_verification', 'verification pending: wait, and say so');
  assert(resumeAction(E({ pendingClaims: [{}] })) === 'wait_for_verification', 'a claim under review: wait');
  assert(resumeAction(E({ organizations: [org('ineligible')] })) === 'finish_setup', 'an ineligible organization is not progress');
  assert(resumeAction(E({ organizations: [org('eligible', 'pending_review')] })) === 'done', 'a request is already in: nothing to start (no duplicate)');
  assert(resumeAction(E({ arena: { open: false }, organizations: [org('eligible')] })) === 'arena_closed', 'the Arena closed in the meantime');
  assert(resumeAction(E({ organizations: [org('ineligible'), org('eligible')] })) === 'open_flow', 'any eligible organization is enough');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
