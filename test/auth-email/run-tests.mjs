// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/auth-email/run-tests.mjs"
// Guards the account emails (api/auth-email.ts): "verify your email" and "reset your password".
//   - They come from BeWatu, in BeWatu's layout, and nothing a member can see names Firebase.
//   - A reset request never shows which addresses are members, and cannot be used to flood anyone's inbox.
//   - A verification email goes only to the address on the signed-in account, never one from the request.
//   - When an email could not be sent the member is told, not left waiting.
//   - Every route that sends mail uses the same layout block, and the logo files it points at exist.
//   - Nothing in the app asks Firebase to send these emails any more.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runAction, HttpError, LIMITS, actionLink, verificationMail, resetMail, emailHtml, emailText, normalizeEmail } from '../../api/auth-email.ts';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, text) => { try { await p; } catch (e) { if (e instanceof HttpError && e.status === status && (!text || e.message.includes(text))) return; throw new Error(`wrong error: ${e?.status} ${e?.message}`); } throw new Error('should have been refused'); };
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-authmail' });
const db = getFirestore();
const ROOT = new URL('../../', import.meta.url).pathname;

const MIN = 60_000, HOUR = 3_600_000;
let NOW = 1_800_000_000_000;
let mails = [], failMail = false, failLink = false, failLookup = false;
const users = new Map([
  ['u1', { uid: 'u1', email: 'ada@example.com', displayName: 'Ada Lovelace', emailVerified: false }],
  ['u2', { uid: 'u2', email: 'done@example.com', displayName: 'Done Already', emailVerified: true }],
  ['u3', { uid: 'u3', email: 'evil@example.com', displayName: '<script>alert(1)</script> Mallory', emailVerified: false }],
  ['u4', { uid: 'u4', email: 'off@example.com', displayName: 'Switched Off', emailVerified: false, disabled: true }],
  ['u5', { uid: 'u5', displayName: 'No Email', emailVerified: false }],
]);
const byEmail = e => [...users.values()].find(u => u.email === e);
const fb = (mode, c = 'CODE+123/abc') => `https://bewatu-2d04e.firebaseapp.com/__/auth/action?mode=${mode}&oobCode=${encodeURIComponent(c)}&apiKey=AIzaFAKE&lang=en`;
const auth = {
  getUser: async uid => { if (failLookup) throw { code: 'auth/insufficient-permission' }; const u = users.get(uid); if (!u) throw { code: 'auth/user-not-found' }; return u; },
  getUserByEmail: async email => { if (failLookup) throw { code: 'auth/insufficient-permission' }; const u = byEmail(email); if (!u) throw { code: 'auth/user-not-found' }; return u; },
  generateEmailVerificationLink: async () => { if (failLink) throw { code: 'auth/insufficient-permission' }; return fb('verifyEmail'); },
  generatePasswordResetLink: async () => { if (failLink) throw { code: 'auth/insufficient-permission' }; return fb('resetPassword'); },
};
const deps = () => ({ db, now: NOW, origin: 'https://www.bewatu.com', auth, mail: async m => { if (failMail) return false; mails.push(m); return true; } });
const reset = async () => { for (const d of (await db.collection('auth_email_rate_limits').get()).docs) await d.ref.delete(); mails = []; failMail = failLink = failLookup = false; NOW += 10 * HOUR; };
const IP = '203.0.113.7';

// ── Where the email comes from and what it looks like ────────────────────────
await reset();
await check('verification email: goes to the address on the account, with BeWatu\'s link', async () => {
  const r = await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify', email: 'attacker@example.com' });   // an address in the request is ignored
  assert(r.ok === true && mails.length === 1, 'one email');
  assert(mails[0].to === 'ada@example.com', 'sent to ' + mails[0].to);
  assert(mails[0].html.includes('https://www.bewatu.com/auth/action?mode=verifyEmail&amp;oobCode=CODE%2B123%2Fabc'), 'link goes to bewatu.com with the code intact');
  assert(mails[0].subject === 'Verify your email for BeWatu', 'subject');
});
await check('reset email: BeWatu\'s link, the member\'s first name', async () => {
  await reset(); await runAction(deps(), { ip: IP }, { kind: 'reset', email: ' ADA@Example.com ' });
  assert(mails.length === 1 && mails[0].to === 'ada@example.com', 'sent to the account');
  assert(mails[0].html.includes('mode=resetPassword') && mails[0].html.includes('Hi Ada,'), 'reset link and greeting');
  assert(!mails[0].html.includes('Lovelace'), 'only the first name');
});
await check('nothing a member can see names Firebase, Google or the project', async () => {
  await reset(); await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }); await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' });
  assert(mails.length === 2, 'both sent');
  for (const m of mails) for (const part of [m.html, m.text, m.subject]) assert(!/firebase|bewatu-2d04e|googleapis|identitytoolkit|apiKey|AIza/i.test(part), 'leaks the backend: ' + (part.match(/firebase|bewatu-2d04e|googleapis|identitytoolkit|apiKey|AIza/i) || [])[0]);
});
await check('layout: logo, contact details, a plain-text version, and a link they can paste', async () => {
  await reset(); await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' });
  const { html, text } = mails[0];
  assert(html.includes('https://www.bewatu.com/email/logo-white.png') && html.includes('alt="BeWatu"'), 'logo');
  assert(html.includes('mailto:support@bewatu.com') && html.includes('www.bewatu.com') && html.includes('BeWatu LLC'), 'contact details');
  assert(html.includes('Sent to ada@example.com'), 'says who it was sent to');
  assert(html.includes('If the button does not work'), 'a link to paste');
  assert(text.includes('support@bewatu.com') && text.includes('https://www.bewatu.com/auth/action?mode=verifyEmail&oobCode='), 'plain text has the link and the contact');
  assert(!/<[a-z]/i.test(text), 'plain text has no markup');
});
await check('a member\'s name cannot inject markup into the email', async () => {
  await reset(); await runAction(deps(), { uid: 'u3', ip: IP }, { kind: 'verify' });
  assert(!mails[0].html.includes('<script>') && mails[0].html.includes('Hi &lt;script&gt;alert(1)&lt;/script&gt;,'), 'escaped');
});
await check('layout: text is escaped, links keep their query string', async () => {
  const p = { preheader: 'a & b', heading: '<b>Hi</b>', paragraphs: ['x < y'], button: { label: 'Go "now"', url: 'https://www.bewatu.com/x?a=1&b=2' }, fine: ["it's"], to: 'a@b.co' };
  const h = emailHtml(p);
  assert(h.includes('&lt;b&gt;Hi&lt;/b&gt;') && h.includes('x &lt; y') && h.includes('Go &quot;now&quot;') && h.includes('href="https://www.bewatu.com/x?a=1&amp;b=2"') && !h.includes('<b>Hi</b>'), 'escaping');
  assert(emailText(p).includes('https://www.bewatu.com/x?a=1&b=2'), 'text link unescaped');
});
await check('actionLink refuses a link with no code', async () => { let threw = false; try { actionLink('https://www.bewatu.com', 'verifyEmail', 'https://x.test/?a=1'); } catch { threw = true; } assert(threw, 'no code, no link'); });

// ── Verification emails ──────────────────────────────────────────────────────
await check('verify: needs a signed-in member', async () => { await reset(); await refuses(runAction(deps(), { ip: IP }, { kind: 'verify' }), 401); assert(mails.length === 0, 'nothing sent'); });
await check('verify: already confirmed sends nothing and says so', async () => { await reset(); const r = await runAction(deps(), { uid: 'u2', ip: IP }, { kind: 'verify' }); assert(r.alreadyVerified === true && mails.length === 0, 'no email'); });
await check('verify: an account with no email address is refused', async () => { await reset(); await refuses(runAction(deps(), { uid: 'u5', ip: IP }, { kind: 'verify' }), 400); });
await check('verify: one a minute, five an hour', async () => {
  await reset();
  await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' });
  await refuses(runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }), 429, 'wait');
  for (let i = 1; i < LIMITS.VERIFY_PER_HOUR; i++) { NOW += MIN + 1; await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }); }
  assert(mails.length === LIMITS.VERIFY_PER_HOUR, 'five sent');
  NOW += MIN + 1; await refuses(runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }), 429, 'hour');
  NOW += HOUR; await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' });
  assert(mails.length === LIMITS.VERIFY_PER_HOUR + 1, 'allowed again after the hour');
});
await check('verify: limits are per member', async () => { await reset(); await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }); await runAction(deps(), { uid: 'u3', ip: IP }, { kind: 'verify' }); assert(mails.length === 2, 'independent'); });
await check('verify: if the email cannot be sent, the member is told', async () => {
  await reset(); failMail = true; await refuses(runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }), 502, 'could not send');
  failMail = false; failLink = true; await refuses(runAction({ ...deps(), now: NOW + 5 * MIN }, { uid: 'u1', ip: IP }, { kind: 'verify' }), 503, 'could not send');
  failLink = false; failLookup = true; await refuses(runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }), 503, 'could not send');
});

// ── Password reset ───────────────────────────────────────────────────────────
await check('reset: an unknown address gets the same answer and no email', async () => {
  await reset();
  const known = await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' });
  const unknown = await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'nobody@example.com' });
  assert(JSON.stringify(known) === JSON.stringify(unknown), 'different answers: ' + JSON.stringify([known, unknown]));
  assert(mails.length === 1 && mails[0].to === 'ada@example.com', 'only the real account was emailed');
});
await check('reset: a disabled account gets nothing and the same answer', async () => { await reset(); const r = await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'off@example.com' }); assert(r.ok === true && mails.length === 0, 'silent'); });
await check('reset: not an email address', async () => { await reset(); for (const e of ['', 'nope', 'a@b', undefined, 'x'.repeat(260) + '@a.co']) await refuses(runAction(deps(), { ip: IP }, { kind: 'reset', email: e }), 400); assert(normalizeEmail(' A@B.co ') === 'a@b.co', 'normalised'); });
await check('reset: asking again at once does not send a second email, and does not say so', async () => {
  await reset();
  const a = await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' });
  const b = await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' });
  assert(mails.length === 1 && JSON.stringify(a) === JSON.stringify(b), 'one email, same answer');
});
await check('reset: three an hour per address, then quietly none', async () => {
  await reset();
  for (let i = 0; i < 6; i++) { await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' }); NOW += MIN + 1; }
  assert(mails.length === LIMITS.RESET_PER_HOUR, 'capped at ' + mails.length);
  NOW += HOUR; await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' }); assert(mails.length === LIMITS.RESET_PER_HOUR + 1, 'allowed after the hour');
});
await check('reset: one IP cannot try endless addresses', async () => {
  await reset();
  for (let i = 0; i < LIMITS.RESET_PER_IP_PER_HOUR; i++) await runAction(deps(), { ip: IP }, { kind: 'reset', email: `person${i}@example.com` });
  await refuses(runAction(deps(), { ip: IP }, { kind: 'reset', email: 'another@example.com' }), 429);
  await runAction(deps(), { ip: '198.51.100.9' }, { kind: 'reset', email: 'another@example.com' });   // a different IP is unaffected
});
await check('reset: when the email cannot be sent, the member is told', async () => {
  await reset(); failMail = true; await refuses(runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' }), 502, 'could not send');
  await reset(); failLink = true; await refuses(runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' }), 503, 'could not send');
  await reset(); failLookup = true; await refuses(runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' }), 503, 'could not send');
});
await check('unknown request kinds are refused', async () => { await refuses(runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'delete' }), 400); await refuses(runAction(deps(), { uid: 'u1', ip: IP }, {}), 400); });
await check('rate-limit records hold no address, no IP and no uid', async () => {
  await reset(); await runAction(deps(), { uid: 'u1', ip: IP }, { kind: 'verify' }); await runAction(deps(), { ip: IP }, { kind: 'reset', email: 'ada@example.com' });
  const docs = (await db.collection('auth_email_rate_limits').get()).docs; assert(docs.length >= 3, 'counters exist');
  for (const d of docs) { const blob = d.id + JSON.stringify(d.data()); assert(!/ada@|example\.com|203\.0\.113|u1/.test(blob), 'identifying data in ' + d.id); assert(/^[0-9a-f]{64}$/.test(d.id), 'id is a hash'); }
});

// ── The pieces that make it work in production ───────────────────────────────
const read = p => readFileSync(join(ROOT, p), 'utf8');
const shellOf = src => { const m = src.match(/\/\/ <email-shell>\n([\s\S]*?)\/\/ <\/email-shell>/); return m ? m[1] : null; };
await check('the logo files the emails point at exist and are PNG images', async () => {
  const sig = f => readFileSync(join(ROOT, f)).subarray(0, 8).toString('hex');
  for (const f of ['public/email/logo-white.png', 'public/logo.png']) { assert(existsSync(join(ROOT, f)), f + ' missing'); assert(sig(f) === '89504e470d0a1a0a', f + ' is not a PNG'); assert(statSync(join(ROOT, f)).size < 60_000, f + ' is too big for an email'); }
  assert(read('api/auth-email.ts').includes("logo: 'https://www.bewatu.com/email/logo-white.png'"), 'the layout points at the white logo');
});
await check('every route that carries the email layout carries the same one', async () => {
  const canonical = shellOf(read('api/auth-email.ts')); assert(canonical && canonical.length > 500, 'canonical layout not found');
  const files = []; const walk = d => { for (const n of readdirSync(join(ROOT, d))) { const p = d + '/' + n; if (statSync(join(ROOT, p)).isDirectory()) walk(p); else if (/\.ts$/.test(n)) files.push(p); } }; walk('api');
  const carriers = files.filter(f => read(f).includes('// <email-shell>'));
  assert(carriers.length >= 1, 'no carriers');
  for (const f of carriers) assert(shellOf(read(f)) === canonical, `${f} has a different email layout from api/auth-email.ts. Copy the block between the email-shell markers.`);
  console.log('   (layout carried by: ' + carriers.join(', ') + ')');
});
await check('nothing in the app asks Firebase to send these emails any more', async () => {
  const files = ['lib/firebaseAuth.ts', 'App.tsx', 'components/SecurityPrivacyPage.tsx', 'components/auth/ForgotPasswordPage.tsx', 'components/auth/RegistrationPage.tsx', 'components/auth/LoginPage.tsx'];
  for (const f of files) assert(!/sendEmailVerification|sendPasswordResetEmail|verifyBeforeUpdateEmail/.test(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), f + ' still calls Firebase to send an email');
  const svc = read('lib/authEmail.ts'); assert(svc.includes("'/api/auth-email'"), 'the browser uses BeWatu\'s route');
});
await check('the link page is reachable at /auth/action and is not a destination inside the app', async () => {
  assert(JSON.parse(read('vercel.json')).rewrites.some(r => r.source === '/auth/action' && r.destination === '/index.html'), 'rewrite missing');
  assert(read('App.tsx').includes("window.location.pathname === '/auth/action'"), 'App does not render the page outside sign-in');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
