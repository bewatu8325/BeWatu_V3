// Run: tsx test/invitations/client-tests.mjs
// Guards the browser side of invitations: the wording, reading typed email addresses, and keeping the opened invitation
// through sign-up without ever trusting what is stored.
import {
  PURPOSES, purposeLabel, purposeForPod, defaultMessage, shareText, parseEmails, MAX_EMAILS, tokenFromPath, savePending, loadPending,
  clearPending, PENDING_TTL_MS, PENDING_KEY, resultText,
} from '../../lib/invitations.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); }, m }; };
const TOKEN = 'abcdefghijklmnop.ABCDEFGHIJKLMNOPQRSTUV';

check('the four purposes, worded as agreed', () => {
  assert(PURPOSES.map(p => p.label).join('|') === 'Connect on BeWatu|Join a Community|Join a Pod|Explore an Arena challenge', PURPOSES.map(p => p.label).join('|'));
  assert(purposeLabel('pod') === 'Join a Pod' && purposeLabel('nope') === 'Invitation', 'labels');
  assert(purposeForPod('community') === 'community' && purposeForPod('innovation') === 'pod' && purposeForPod(undefined) === 'pod', 'a community Pod is a community, every other Pod is a Pod');
});
check('the first draft names the destination when there is one, and is never empty', () => {
  for (const p of PURPOSES) assert(defaultMessage(p.id).length > 20, p.id + ' has a default');
  assert(defaultMessage('pod', { targetName: 'Fintech founders' }).includes('Fintech founders') && defaultMessage('arena', { targetName: 'Rethink payments' }).includes('Rethink payments'), 'named');
  assert(!defaultMessage('pod', { targetName: '  ' }).includes('undefined'), 'blank name ignored');
});
check('what is shared is their note, then the link', () => {
  assert(shareText('Hi', 'https://x/y') === 'Hi\n\nhttps://x/y' && shareText('  ', 'https://x/y') === 'https://x/y', 'share text');
});
check('typed addresses: split on spaces, commas and semicolons; lower-cased; duplicates and bad ones separated; capped', () => {
  const r = parseEmails('Sam@Work.test, kim@work.test; sam@work.test  nope  a@b');
  assert(r.valid.join() === 'sam@work.test,kim@work.test' && r.invalid.join() === 'nope,a@b' && !r.tooMany, JSON.stringify(r));
  const many = parseEmails(Array.from({ length: 8 }, (_, i) => `p${i}@a.test`).join(' '));
  assert(many.valid.length === MAX_EMAILS && many.tooMany, 'five at a time');
  assert(parseEmails('').valid.length === 0 && parseEmails('   ').invalid.length === 0, 'empty');
});
check('only a real-looking token is read from an address', () => {
  assert(tokenFromPath('/invite/' + TOKEN) === TOKEN && tokenFromPath('/invite/' + TOKEN + '/') === TOKEN, 'path');
  assert(tokenFromPath('/invite/short') === null && tokenFromPath('/invite/') === null && tokenFromPath('/be/ann') === null && tokenFromPath('/invite/' + TOKEN + '/x') === null && tokenFromPath('/invite/<script>.AAAAAAAAAAAAAAAAAAAAAA') === null, 'junk');
});
check('the opened invitation is remembered for a limited time and only if it is a token', () => {
  const s = mem(); const t = 1_800_000_000_000;
  assert(savePending(s, TOKEN, t) && loadPending(s, t + 1000) === TOKEN, 'kept');
  assert(loadPending(s, t + PENDING_TTL_MS + 1) === null && s.getItem(PENDING_KEY) === null, 'expires and is cleaned up');
  assert(!savePending(s, 'not a token', t) && s.getItem(PENDING_KEY) === null, 'junk is never stored');
  s.setItem(PENDING_KEY, 'not json'); assert(loadPending(s, t) === null, 'garbage');
  s.setItem(PENDING_KEY, JSON.stringify({ token: '../../etc', savedAt: t })); assert(loadPending(s, t) === null, 'edited token');
  s.setItem(PENDING_KEY, JSON.stringify({ token: TOKEN, savedAt: t + 10 * 86400000 })); assert(loadPending(s, t) === null, 'from the future');
  savePending(s, TOKEN, t); clearPending(s); assert(loadPending(s, t) === null, 'cleared');
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert(savePending(broken, TOKEN) === false && loadPending(broken) === null, 'blocked storage never throws'); clearPending(broken);
});
check('every outcome has a plain-words message, and the unhappy ones offer a way forward', () => {
  for (const r of ['sent', 'duplicate', 'invalid', 'self', 'not_delivered', 'limited', 'failed']) assert(resultText({ email: 'a@b.co', result: r }).text.length > 10, r);
  assert(resultText({ email: 'a@b.co', result: 'sent' }).ok && !resultText({ email: 'a@b.co', result: 'failed' }).ok, 'ok flags');
  assert(/link/i.test(resultText({ email: 'a@b.co', result: 'not_delivered' }).text), 'suggests the link');
  assert(!/opted|unsubscrib|member|account/i.test(resultText({ email: 'a@b.co', result: 'not_delivered' }).text), 'does not say why: nothing about the person is revealed');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
