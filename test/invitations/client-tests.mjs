// Run: tsx test/invitations/client-tests.mjs
// Guards the browser side of invitations: the wording, reading typed email addresses, and keeping the opened invitation
// through sign-up without ever trusting what is stored.
import {
  PURPOSES, purposeLabel, purposeForPod, defaultMessage, shareText, parseEmails, MAX_EMAILS, tokenFromPath, savePending, loadPending,
  clearPending, PENDING_TTL_MS, PENDING_KEY, resultText, loadPendingIntent, ACCEPT_INTENT_TTL_MS, headline, firstName, valueLine, acceptNote, acceptLabel, signInLabel,
  fineprint, successScreen, stateScreen,
} from '../../lib/invitations.ts';
import { scrubEvent, scrubInviteToken } from '../../lib/sentry.ts';

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

// ── the personal invitation page ─────────────────────────────────────────────
check('opening an invitation is not accepting it: only pressing Accept leaves an intent, and only for a day', () => {
  const s = mem(); const now = 1_000_000_000_000;
  savePending(s, TOKEN, now);                                                    // opened, signed in/up some other way
  assert(loadPending(s, now) === TOKEN && loadPendingIntent(s, now).accepted === false, 'no intent from just opening');
  savePending(s, TOKEN, now, true);                                              // pressed "Accept invitation"
  assert(loadPendingIntent(s, now + 1000).accepted === true, 'intent kept through sign-up');
  assert(loadPendingIntent(s, now + ACCEPT_INTENT_TTL_MS - 1).accepted === true, 'still good inside the day');
  const late = loadPendingIntent(s, now + ACCEPT_INTENT_TTL_MS + 1);
  assert(late && late.token === TOKEN && late.accepted === false, 'a day later the page asks again, and the invitation is still there');
  assert(loadPendingIntent(s, now + PENDING_TTL_MS + 1) === null, 'and a month later it is gone');
});
check('a stored intent cannot be forged or carried from the future, and garbage is ignored', () => {
  const s = mem(); const now = 1_000_000_000_000;
  s.setItem(PENDING_KEY, JSON.stringify({ token: TOKEN, savedAt: now, acceptedAt: now + 10 * ACCEPT_INTENT_TTL_MS })); assert(loadPendingIntent(s, now).accepted === false, 'future intent');
  s.setItem(PENDING_KEY, JSON.stringify({ token: TOKEN, savedAt: now, acceptedAt: 'yes' })); assert(loadPendingIntent(s, now).accepted === false, 'wrong type');
  s.setItem(PENDING_KEY, '{nope'); assert(loadPendingIntent(s, now) === null, 'garbage');
  assert(savePending(s, 'not-a-token', now, true) === false, 'a bad token is never stored');
});
check('the headline says who invited you, and never invents a name', () => {
  assert(headline('connect', 'Ephraim') === 'Ephraim invited you to connect.', headline('connect', 'Ephraim'));
  assert(headline('connect', '') === "You've been invited to connect.", 'no public name');
  assert(headline('pod', 'Ada') === 'Ada invited you to join a Pod.' && headline('arena', 'Ada') === 'Ada invited you to explore an Arena challenge.', 'other purposes');
  assert(firstName('  Ephraim  Mwangi ') === 'Ephraim' && firstName(null) === '' && firstName('') === '', 'first name');
});
check('the page tells someone who already has an invitation to ACCEPT it, never to send a request of their own', () => {
  const FORBIDDEN = /send them a connection request|they decide whether to accept|send .* a connection request|create my free account/i;
  const all = [];
  for (const purpose of ['connect', 'community', 'pod', 'arena']) {
    all.push(valueLine(purpose, 'Ephraim'), valueLine(purpose, ''), acceptLabel(purpose, true), acceptLabel(purpose, false), signInLabel(purpose), fineprint(purpose, 'Ephraim', 1_800_000_000_000));
    for (const mode of ['direct', 'request', null]) for (const action of ['connect', 'request_to_join', 'view_challenge', 'explore']) all.push(acceptNote(purpose, mode, 'Ephraim', action));
  }
  for (const t of all) assert(!FORBIDDEN.test(t), `outdated wording: ${t}`);
  assert(valueLine('connect', 'Ephraim') === 'Join Ephraim on BeWatu to connect, exchange ideas, and discover opportunities together.', 'the agreed line');
  assert(acceptLabel('connect', false) === 'Accept invitation' && acceptLabel('connect', true) === 'Accept invitation', 'the button');
});
check('before the tap, the page says what Accepting does: an emailed invitation connects, a shared link asks', () => {
  assert(acceptNote('connect', 'direct', 'Ephraim') === 'Accepting connects you with Ephraim.', acceptNote('connect', 'direct', 'Ephraim'));
  assert(/request to connect/.test(acceptNote('connect', 'request', 'Ephraim')) && /once they confirm/.test(acceptNote('connect', 'request', 'Ephraim')), 'a link only asks, and says so');
  assert(acceptNote('connect', 'direct', '') === 'Accepting connects you with them.', 'no public name');
  assert(signInLabel('connect') === 'Already on BeWatu? Sign in to accept', 'signing in is for accepting');
});
check('the page never says "connected" unless the server did: each outcome has its own wording', () => {
  const ok = successScreen('connected', 'Ephraim');
  assert(ok.title === "You're connected with Ephraim." && ok.body === 'Your BeWatu connection is ready. Start a conversation or explore your professional network.', JSON.stringify(ok));
  assert(ok.action.label === 'View profile' && ok.secondary.label === 'Explore BeWatu', 'actions');
  assert(successScreen('already_connected', 'Ephraim').title === ok.title, 'already connected reads the same');
  for (const c of ['requested', 'already_requested', 'not_accepting', 'already_accepted']) assert(!/connected with/i.test(successScreen(c, 'Ephraim').title), `${c} must not claim a connection: ${successScreen(c, 'Ephraim').title}`);
  assert(/Request sent to Ephraim/.test(successScreen('requested', 'Ephraim').title), 'requested');
  assert(/isn't taking new connection requests/.test(successScreen('not_accepting', 'Ephraim').title), 'not accepting');
  assert(successScreen('connected', '').title === "You're connected.", 'no name');
});
check('every state an invitation can be in has a friendly screen with a way forward and no jargon', () => {
  const states = ['expired', 'revoked', 'used', 'invalid', 'unavailable', 'own', 'already_accepted', 'already_connected', 'already_requested', 'busy'];
  const titles = new Set();
  for (const st of states) for (const signedIn of [true, false]) for (const first of ['Ephraim', '']) {
    const s = stateScreen(st, first, signedIn);
    assert(s.title.length > 8 && s.body.length > 20 && s.action && s.action.label, `${st}: needs a title, an explanation and an action`);
    assert(!/error|exception|undefined|null|token|401|403|404|410|500|failed/i.test(s.title + ' ' + s.body), `${st}: technical wording: ${s.title} ${s.body}`);
    titles.add(s.title);
  }
  assert(stateScreen('expired', 'Ephraim', false).action.to === 'join' && stateScreen('expired', 'Ephraim', true).action.to === 'home', 'sign-up when signed out, back to the app when in');
  assert(stateScreen('busy', 'Ephraim', true, 'Could not reach BeWatu.').body === 'Could not reach BeWatu.' && stateScreen('busy', '', true).action.to === 'retry', 'busy offers a retry');
  assert(/Ephraim/.test(stateScreen('already_connected', 'Ephraim', true).title) && stateScreen('already_connected', 'Ephraim', true).action.to === 'profile', 'already connected opens their profile');
  assert(titles.size >= 9, 'each state reads differently: ' + titles.size);
});
check('error reports never carry an invitation token', async () => {
  const t = 'abcdefghijklmnop.ABCDEFGHIJKLMNOPQRSTUV';
  const ev = scrubEvent({ request: { url: `https://www.bewatu.com/invite/${t}`, headers: { Referer: `https://www.bewatu.com/invite/${t}?x=1` } }, transaction: `/invite/${t}`, message: `GET /api/invitations?token=${t}`,
    breadcrumbs: [{ category: 'navigation', data: { from: `/invite/${t}`, to: '/register' } }, { category: 'fetch', data: { url: `/api/invitations?token=${t}&resume=1` } }, { category: 'fetch', data: { url: `/api/invitations?og=1&t=${t}` } }], exception: { values: [{ value: `failed at /invite/${t}` }] } });
  assert(!JSON.stringify(ev).includes(t) && !JSON.stringify(ev).includes('abcdefghijklmnop'), JSON.stringify(ev));
  assert(scrubInviteToken('/invite/[token]') === '/invite/[token]' && scrubInviteToken('/be/ann') === '/be/ann', 'other addresses untouched');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
