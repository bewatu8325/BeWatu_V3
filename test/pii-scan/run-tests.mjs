// Run: node test/pii-scan/run-tests.mjs
// Guards scripts/scan-plaintext-pii.mjs: detection accuracy (few false alarms,
// no misses on realistic shapes), output safety, exposure ranking from the real
// firestore.rules, and that the script can never write to Firestore.
import fs from 'node:fs';
import {
  detectInString, walkStrings, luhnValid, isNonPersonalEmail, safePath, pathTemplate,
  classifyReadExpression, loadRuleHints, scanDocument, rankFindings,
} from '../../scripts/scan-plaintext-pii.mjs';

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const kinds = (key, v) => detectInString(key, v).map(h => `${h.kind}:${h.shape}`).sort().join(',');

console.log('== emails ==');
check('a field that is exactly an email is "exact"', () => assert(kinds('userEmail', 'ada@example.com') === 'email:exact', kinds('userEmail', 'ada@example.com')));
check('upper case and plus-tags are caught', () => assert(kinds('x', 'Ada.Lovelace+beta@Example.COM') === 'email:exact', 'missed'));
check('an email inside free text is "embedded"', () => assert(kinds('message', 'please reply to ada@example.com thanks') === 'email:embedded', kinds('message', 'please reply to ada@example.com thanks')));
check('two emails in one field are "embedded"', () => assert(kinds('x', 'a@x.com, b@y.org') === 'email:embedded', 'wrong shape'));
check('account-deletion placeholders (.invalid) are ignored', () => assert(kinds('email', 'deleted_abc123@bewatu.invalid') === '', 'flagged a placeholder'));
check('noreply system addresses are ignored', () => assert(kinds('from', 'noreply@bewatu.com') === '' && kinds('from', 'no-reply@x.com') === '', 'flagged system sender'));
check('user ids, urls and handles are not emails', () => {
  for (const v of ['oUfEv1vGKSuPAXL76zJTGgKEDFGT', 'https://www.bewatu.com/be/ada', '@ada', 'a@b', 'ada at example dot com']) assert(kinds('x', v) === '', `flagged "${v}"`);
});

console.log('\n== phones ==');
check('international numbers are caught anywhere', () => {
  for (const v of ['+1 (555) 010-0100', '+44 20 7946 0958', '+254712345678']) assert(kinds('contact', v).includes('phone'), `missed ${v}`);
});
check('North-American formats are caught', () => {
  for (const v of ['(555) 010-0100', '555-010-0100', '555.010.0100']) assert(kinds('note', v).includes('phone'), `missed ${v}`);
});
check('a phone-named field with plain digits is caught', () => assert(kinds('phone', '5550100100') === 'phone:exact', kinds('phone', '5550100100')));
check('phone-named keys match as words (mobile, whatsapp, tel)', () => {
  for (const k of ['mobile', 'whatsappNumber'.replace('Number', ''), 'tel', 'contact_phone']) assert(kinds(k, '0712 345 678') === 'phone:exact', `missed key ${k}`);
});
check('a phone inside a sentence is "embedded"', () => assert(kinds('message', 'call me on +1 555 010 0100 after 5') === 'phone:embedded', kinds('message', 'call me on +1 555 010 0100 after 5')));
check('the same plain digits in an unrelated field are NOT flagged', () => assert(kinds('orderRef', '5550100100') === '', 'false alarm'));
check('timestamps, ips, versions, epoch strings and ids are NOT phones', () => {
  for (const v of ['2026-11-07T19:59:15.713Z', '2026-11-07', '192.168.100.200', 'v1.2.3', '1792876172692', 'NPkTaCZoEuRfWejFdhFwXBqch23C', '+05:30', 'cus_NffrFeUfNV2Hib']) assert(kinds('createdAt', v) === '', `flagged "${v}"`);
});
check('a phone-named field holding words is not flagged', () => assert(kinds('phone', 'not provided') === '' && kinds('phone', '') === '', 'false alarm'));

console.log('\n== card numbers (should never be stored) ==');
check('a valid test Visa/Mastercard/Amex is caught, with spaces or dashes', () => {
  for (const v of ['4242424242424242', '4242 4242 4242 4242', '5555-5555-5555-4444', '378282246310005']) assert(kinds('x', v).includes('card'), `missed ${v}`);
});
check('Luhn-invalid and non-card-prefix numbers are not flagged', () => {
  for (const v of ['4242424242424243', '1792876172692', '1234567812345678', '0000000000000000', '9999999999999995']) assert(!kinds('x', v).includes('card'), `flagged ${v}`);
});
check('luhnValid agrees with known numbers', () => assert(luhnValid('4242424242424242') && !luhnValid('4242424242424241'), 'luhn wrong'));

console.log('\n== walking documents ==');
check('nested maps and arrays give stable field paths', () => {
  const paths = [...walkStrings({ a: { b: [{ c: 'x@y.com' }, { c: 'z@y.com' }], d: 'k' } })].map(w => w.field);
  assert(JSON.stringify(paths) === JSON.stringify(['a.b[].c', 'a.b[].c', 'a.d']), JSON.stringify(paths));
});
check('an email used as a map key is reported as a field, not echoed', () => {
  const fields = [...walkStrings({ invitedBy: { 'ada@example.com': true } })].map(w => w.field);
  assert(fields.length === 1 && fields[0] === 'invitedBy.{email-as-key}', JSON.stringify(fields));
  assert(!fields.join('').includes('ada@'), 'leaked the key');
});
check('timestamps / class instances are skipped, not crawled', () => {
  class Timestamp { constructor() { this.note = 'x@y.com'; } }
  assert([...walkStrings({ at: new Timestamp() })].length === 0, 'walked into a class instance');
});

console.log('\n== output safety ==');
check('document paths with an email as the id are hidden', () => {
  assert(safePath('waitlist/ada@example.com') === 'waitlist/{email-as-doc-id}', safePath('waitlist/ada@example.com'));
  assert(pathTemplate('users/abc/private/contact') === 'users/{id}/private/{id}', pathTemplate('users/abc/private/contact'));
});
check('a scan result contains no value it found', () => {
  const acc = { findings: new Map(), docsScanned: 0 };
  const secrets = ['ada.private@example.com', '+1 555 010 0199', '4242424242424242'];
  scanDocument(acc, 'support_tickets', 'support_tickets/t1', 't1', { userEmail: secrets[0], body: `call ${secrets[1]}`, card: secrets[2], at: new Date() });
  scanDocument(acc, 'waitlist', 'waitlist/zed@example.com', 'zed@example.com', {});
  const out = JSON.stringify(rankFindings(acc.findings, new Map()));
  for (const s of [...secrets, 'zed@example.com']) assert(!out.includes(s), `report leaked ${s}`);
  assert(out.includes('userEmail') && out.includes('(document id)'), 'report is missing expected field names');
});
check('docs are counted once per finding, occurrences per hit', () => {
  const acc = { findings: new Map(), docsScanned: 0 };
  scanDocument(acc, 'c', 'c/1', '1', { list: ['a@x.com', 'b@x.com'] });
  const f = [...acc.findings.values()][0];
  assert(f.docs === 1 && f.occurrences === 2, `docs=${f.docs} occ=${f.occurrences}`);
});

console.log('\n== exposure from the real firestore.rules ==');
const hints = loadRuleHints(fs.readFileSync('firestore.rules', 'utf8'));
const level = id => hints.get(id)?.level;
check('classifier: bucketing of typical rule expressions', () => {
  const cases = [['false', 'server-only'], ['isAuth()', 'any-signed-in-user'], ['(resource.data.isPublic == true) || isAuth()', 'public'],
    ['isOpsStaff() && opsRole() != "x"', 'staff'], ['isAuth() && request.auth.uid == uid', 'owner'], ['isAuth() && request.auth.uid in resource.data.members', 'owner']];
  for (const [expr, want] of cases) assert(classifyReadExpression(expr) === want, `${expr} -> ${classifyReadExpression(expr)} (wanted ${want})`);
});
check('users (main profile doc) is the most exposed', () => assert(level('users') === 'public', level('users')));
check('"owner OR staff" is reported as staff-readable, not owner-only', () => {
  assert(classifyReadExpression('isAuth() && (request.auth.uid == uid || isPlatformAdmin() || isOpsStaff())') === 'staff', 'understated exposure');
  assert(classifyReadExpression('isAuth() && request.auth.uid == uid') === 'owner', 'owner-only mislabelled');
});
check('support tickets are staff-only', () => assert(level('support_tickets') === 'staff', level('support_tickets')));
check('rate-limit bookkeeping is server-only', () => assert(level('feedback_rate_limits') === 'server-only' && level('endorsement_request_rate_limits') === 'server-only', `${level('feedback_rate_limits')} / ${level('endorsement_request_rate_limits')}`));
check('ranking puts the most exposed collection first, whatever the counts', () => {
  const acc = { findings: new Map(), docsScanned: 0 };
  for (let i = 0; i < 5; i++) scanDocument(acc, 'support_tickets', `support_tickets/${i}`, String(i), { userEmail: `p${i}@x.com` });
  scanDocument(acc, 'users', 'users/u1', 'u1', { email: 'legacy@x.com' });
  const ranked = rankFindings(acc.findings, hints);
  assert(ranked[0].collection === 'users', `first was ${ranked[0].collection}`);
});

console.log('\n== read-only guarantee ==');
check('the script source contains no Firestore write call', () => {
  const src = fs.readFileSync('scripts/scan-plaintext-pii.mjs', 'utf8').split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  // A tripwire, not a proof. Plain Map/Set .set()/.add() are fine; a Firestore write needs a doc
  // or collection reference, or one of the batch/transaction helpers, so ban all of those.
  const banned = ['.doc(', '.collection(', '.ref.set(', '.ref.update(', '.ref.delete(', '.ref.create(', '.update(', '.delete(', '.create(',
    'batch(', 'bulkWriter', 'runTransaction', 'recursiveDelete', 'FieldValue', 'setDoc', 'addDoc', 'updateDoc', 'deleteDoc'];
  for (const w of banned) assert(!src.includes(w), `contains ${w}`);
  assert(src.includes('collectionGroup') && src.includes('listCollections'), 'expected read APIs are missing');
});

console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail ? 1 : 0);
