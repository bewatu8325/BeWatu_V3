// Run: npx tsx test/compliance-bundle/run-tests.mjs
// Proves the compliance bundle is really encrypted to the compliance public
// key, opens with the shipped decrypt script, and refuses to open if altered.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { encryptBundle, maskEmail } from '../../api/ops/user-data.ts';

const SCRIPT = path.resolve('scripts/decrypt-compliance-bundle.mjs');
let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-compliance-'));
const keypair = (bits) => crypto.generateKeyPairSync('rsa', {
  modulusLength: bits,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const good = keypair(3072);
const other = keypair(3072);
const goodPrivPath = path.join(dir, 'good.pem');
const otherPrivPath = path.join(dir, 'other.pem');
fs.writeFileSync(goodPrivPath, good.privateKey);
fs.writeFileSync(otherPrivPath, other.privateKey);

const SECRET = 'ada.lovelace.private@example.com +1-555-0100 12 Analytical Way';
const plaintext = Buffer.from(JSON.stringify({ subject: SECRET }));
const header = { bundleId: 'BW-test', caseRef: 'CASE-42', createdAt: '2026-01-01T00:00:00.000Z' };
const envelope = encryptBundle(plaintext, good.publicKey, header);
const envPath = path.join(dir, 'bundle.bwenc.json');
fs.writeFileSync(envPath, JSON.stringify(envelope));

const decrypt = (bundlePath, keyPath) => spawnSync('node', [SCRIPT, bundlePath, keyPath], { encoding: 'utf8' });
const writeVariant = (name, mutate) => {
  const copy = JSON.parse(JSON.stringify(envelope)); mutate(copy);
  const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(copy)); return p;
};
const flipByte = (b64) => { const b = Buffer.from(b64, 'base64'); b[0] ^= 0xff; return b.toString('base64'); };

check('the envelope contains none of the personal data in readable form', () => {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const piece of ['ada.lovelace', '555-0100', 'Analytical', 'subject']) assert(!raw.includes(piece), `found "${piece}"`);
});
check('compliance (private key) can decrypt it, and gets back exactly the original', () => {
  const r = decrypt(envPath, goodPrivPath);
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  assert(r.stdout === plaintext.toString(), 'decrypted text differs');
  assert(r.stderr.includes('BW-test') && r.stderr.includes('CASE-42'), 'header not reported');
});
check('a different private key CANNOT decrypt it', () => {
  const r = decrypt(envPath, otherPrivPath);
  assert(r.status !== 0 && r.stdout === '', 'decrypted with the wrong key');
});
check('altering the ciphertext is detected and refused', () => {
  const r = decrypt(writeVariant('t1.json', e => { e.ciphertext = flipByte(e.ciphertext); }), goodPrivPath);
  assert(r.status !== 0 && r.stdout === '', 'tampered ciphertext was accepted');
});
check('altering the authentication tag is detected and refused', () => {
  const r = decrypt(writeVariant('t2.json', e => { e.tag = flipByte(e.tag); }), goodPrivPath);
  assert(r.status !== 0 && r.stdout === '', 'tampered tag was accepted');
});
check('a truncated authentication tag is refused (tag-shortening attack)', () => {
  for (const bytes of [4, 8, 12, 15]) {
    const r = decrypt(writeVariant(`trunc${bytes}.json`, e => { e.tag = Buffer.from(e.tag, 'base64').subarray(0, bytes).toString('base64'); }), goodPrivPath);
    assert(r.status !== 0 && r.stdout === '', `a ${bytes}-byte tag was accepted`);
  }
});
check('an over-long or empty tag is refused', () => {
  const longer = decrypt(writeVariant('longtag.json', e => { e.tag = Buffer.concat([Buffer.from(e.tag, 'base64'), Buffer.alloc(4)]).toString('base64'); }), goodPrivPath);
  const empty = decrypt(writeVariant('notag.json', e => { e.tag = ''; }), goodPrivPath);
  assert(longer.status !== 0 && empty.status !== 0, 'accepted a malformed tag');
});
check('the envelope always carries a full 16-byte tag', () => assert(Buffer.from(envelope.tag, 'base64').length === 16, 'short tag produced'));
check('altering the case reference in the header is detected and refused', () => {
  const r = decrypt(writeVariant('t3.json', e => {
    e.aad = Buffer.from(JSON.stringify({ ...header, caseRef: 'CASE-99' })).toString('base64');
  }), goodPrivPath);
  assert(r.status !== 0 && r.stdout === '', 'tampered header was accepted');
});
check('every export uses a fresh key and IV (same input, different ciphertext)', () => {
  const again = encryptBundle(plaintext, good.publicKey, header);
  assert(again.iv !== envelope.iv && again.wrappedKey !== envelope.wrappedKey && again.ciphertext !== envelope.ciphertext, 'reused key material');
});
check('a public key under 3072 bits is refused', () => {
  let err;
  try { encryptBundle(plaintext, keypair(2048).publicKey, header); } catch (e) { err = e; }
  assert(err && err.status === 503, 'weak key was accepted');
});
check('a non-RSA key is refused', () => {
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  let err;
  try { encryptBundle(plaintext, ec.publicKey, header); } catch (e) { err = e; }
  assert(err && err.status === 503, 'EC key was accepted');
});
check('emails are masked for display (first letter + domain only)', () => {
  assert(maskEmail('ada@example.com') === 'a***@example.com', maskEmail('ada@example.com'));
  assert(maskEmail(null) === null && maskEmail('nonsense') === '***', 'edge cases');
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail ? 1 : 0);
