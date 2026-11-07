#!/usr/bin/env node
/**
 * scripts/decrypt-compliance-bundle.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Opens an encrypted compliance bundle produced by api/ops/user-data.ts
 * (action "compliance_export"). Run it on the compliance team's own machine:
 * the private key never needs to touch a BeWatu system.
 *
 *   node scripts/decrypt-compliance-bundle.mjs <bundle.bwenc.json> <private-key.pem> [output.json]
 *
 * If the private key is passphrase-protected, set KEY_PASSPHRASE in the
 * environment. With no output path the decrypted JSON is printed to stdout.
 * Decryption fails (non-zero exit) if the file was altered in any way,
 * including its bundle id / case reference header, because AES-GCM
 * authenticates both.
 *
 * One-time key setup (compliance does this, and keeps the private key offline):
 *   openssl genrsa -aes256 -out compliance-private.pem 4096
 *   openssl rsa -in compliance-private.pem -pubout -out compliance-public.pem
 * Give ONLY compliance-public.pem to engineering, to set as COMPLIANCE_PUBLIC_KEY.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , bundlePath, keyPath, outPath] = process.argv;
if (!bundlePath || !keyPath) {
  console.error('Usage: node scripts/decrypt-compliance-bundle.mjs <bundle.bwenc.json> <private-key.pem> [output.json]');
  process.exit(2);
}

function fail(message) {
  console.error(`Could not decrypt: ${message}`);
  process.exit(1);
}

let envelope;
try {
  envelope = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
} catch {
  fail('the bundle file is missing or is not valid JSON.');
}
if (envelope.format !== 'bewatu-compliance-bundle' || envelope.version !== 1) {
  fail('this is not a version 1 BeWatu compliance bundle.');
}

let privateKey;
try {
  privateKey = crypto.createPrivateKey({ key: fs.readFileSync(keyPath), passphrase: process.env.KEY_PASSPHRASE });
} catch {
  fail('the private key could not be read (wrong file, or set KEY_PASSPHRASE if it is passphrase-protected).');
}

let plaintext;
try {
  const dataKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.wrappedKey, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(envelope.aad, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  dataKey.fill(0);
} catch {
  fail('this private key does not match the bundle, or the file has been altered.');
}

try {
  const header = JSON.parse(Buffer.from(envelope.aad, 'base64').toString('utf8'));
  console.error(`Bundle ${header.bundleId}, case "${header.caseRef}", created ${header.createdAt}. Integrity verified.`);
} catch { /* header is informational only */ }

if (outPath) {
  fs.writeFileSync(outPath, plaintext, { mode: 0o600 });
  console.error(`Wrote ${outPath} (owner-read only). Handle it as confidential and delete it when the case is closed.`);
} else {
  process.stdout.write(plaintext);
}
