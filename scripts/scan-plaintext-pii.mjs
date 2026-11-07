#!/usr/bin/env node
/**
 * scripts/scan-plaintext-pii.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * READ-ONLY audit: where does personal data sit in Firestore as plaintext?
 *
 * Firestore, Auth and Storage are encrypted at rest by Google, so nothing is
 * on disk unencrypted. The real exposure is plaintext COPIES of personal data
 * scattered across collections that staff, or other members, can read. This
 * finds them and ranks them by who can read the collection, so the worst
 * offenders get fixed first.
 *
 * It looks for:
 *   email   addresses, as a whole field value or embedded in free text, and as
 *           document ids or map keys
 *   phone   international / North-American formats anywhere, plus any
 *           phone-named field (phone, mobile, tel, whatsapp...)
 *   card    payment-card-like numbers (Luhn-valid with a real card prefix).
 *           BeWatu should never store these; the expected result is zero.
 *
 * What it will NOT do:
 *   - write, update, delete or create anything. It only calls listCollections
 *     and read queries. (test/pii-scan checks the source for write calls.)
 *   - print or save any value it finds. The console output and the JSON report
 *     contain collection names, field paths, kinds and COUNTS only, plus a few
 *     document paths per finding so you can locate them. A report full of the
 *     emails it found would just be one more plaintext copy.
 *
 * "Exposure" comes from firestore.rules: the read rule for each collection is
 * parsed and bucketed (public / any signed-in user / staff / owner / server
 * only). It is a hint, not a proof: read the quoted rule before acting on it.
 *
 * Cost: every document scanned is one Firestore read. By default each
 * collection is capped (--max-docs, default 5000) and the report says which
 * were truncated. --full removes the cap.
 *
 * Needs your own Google Application Default Credentials, as the other scripts:
 *   gcloud auth application-default login
 * or GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key.
 *
 * Usage:
 *   node scripts/scan-plaintext-pii.mjs --project bewatu-2d04e --yes
 *   node scripts/scan-plaintext-pii.mjs --project bewatu-2d04e --yes --only support_tickets,users
 *   node scripts/scan-plaintext-pii.mjs --project bewatu-2d04e --yes --full --out pii-report.json
 *
 * Options:
 *   --project <id>        required (bewatu-dev | bewatu-2d04e)
 *   --yes                 required for a real project (not needed for the emulator)
 *   --max-docs <n>        per-collection cap, default 5000
 *   --full                scan every document (ignores --max-docs)
 *   --only <a,b>          scan only these collection ids
 *   --extra <a,b>         also scan these collection ids (subcollections the
 *                         sampled discovery may have missed)
 *   --discover <n>        parent documents sampled to find subcollections, default 25
 *   --rules <path>        firestore.rules to read exposure from (default ./firestore.rules)
 *   --out <path>          JSON report path (default pii-scan-report.json)
 *   --no-samples          leave document paths out of the report
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// ── Detection ────────────────────────────────────────────────────────────────

const MAX_SCAN_CHARS = 20000;
const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const EMAIL_EXACT = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const INTL_PHONE_RE = /(?<![\w+])\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d[\d\s.-]{5,14}\d(?!\d)/g;
const NANP_PHONE_RE = /(?<!\d)(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\d)/g;
const PHONE_KEY_RE = /(^|[^a-z])(phone|mobile|cell|tel|telephone|whatsapp|sms)([^a-z]|$)/i;
const PHONE_VALUE_RE = /^[\s+()\-.\d]+(?:ext\.?\s*\d+)?$/i;
const CARD_CANDIDATE_RE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const NON_PII_LOCALPARTS = /^(no-?reply|do-?not-?reply|noreply)$/i;

/** Addresses that are not a person: account-deletion placeholders and system senders. */
export function isNonPersonalEmail(email) {
  const [local, domain = ''] = email.split('@');
  return /\.invalid$/i.test(domain) || NON_PII_LOCALPARTS.test(local);
}

export function luhnValid(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

function plausibleCard(digits) {
  if (new Set(digits).size < 2) return false; // 0000..., 1111... are never real cards
  const len = digits.length;
  if (/^4/.test(digits)) return [13, 16, 19].includes(len);
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return len === 16;
  if (/^3[47]/.test(digits)) return len === 15;
  if (/^(6011|65|64[4-9])/.test(digits)) return [16, 19].includes(len);
  return false;
}

/**
 * Returns [{ kind, shape }] for one string value. kind: email | phone | card.
 * shape: exact (the whole value is one) | embedded (found inside longer text).
 * Never returns the matched text.
 */
export function detectInString(key, raw) {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const value = raw.length > MAX_SCAN_CHARS ? raw.slice(0, MAX_SCAN_CHARS) : raw;
  const trimmed = value.trim();
  const hits = [];

  const emails = (value.match(EMAIL_RE) ?? []).filter(e => !isNonPersonalEmail(e));
  if (emails.length) hits.push({ kind: 'email', shape: emails.length === 1 && trimmed === emails[0] ? 'exact' : 'embedded' });

  let phoneShape = null;
  if (PHONE_KEY_RE.test(key) && PHONE_VALUE_RE.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) phoneShape = 'exact';
  }
  if (!phoneShape) {
    for (const re of [INTL_PHONE_RE, NANP_PHONE_RE]) {
      re.lastIndex = 0;
      for (const m of value.matchAll(re)) {
        const digits = m[0].replace(/\D/g, '');
        if (digits.length < 8 || digits.length > 15) continue;
        phoneShape = m[0] === trimmed ? 'exact' : 'embedded';
        break;
      }
      if (phoneShape) break;
    }
  }
  if (phoneShape) hits.push({ kind: 'phone', shape: phoneShape });

  for (const m of value.matchAll(CARD_CANDIDATE_RE)) {
    const digits = m[0].replace(/\D/g, '');
    if (plausibleCard(digits) && luhnValid(digits)) {
      hits.push({ kind: 'card', shape: m[0] === trimmed ? 'exact' : 'embedded' });
      break;
    }
  }
  return hits;
}

function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Yields { field, key, value } for every string leaf, plus email-shaped map keys. Array indexes become []. */
export function* walkStrings(value, path = '') {
  if (typeof value === 'string') {
    yield { field: path || '(value)', key: path.split('.').pop().replace(/\[\]/g, ''), value };
  } else if (Array.isArray(value)) {
    for (const item of value) yield* walkStrings(item, `${path}[]`);
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (EMAIL_EXACT.test(k) && !isNonPersonalEmail(k)) {
        yield { field: `${path ? path + '.' : ''}{email-as-key}`, key: 'key', value: k };
        yield* walkStrings(v, `${path ? path + '.' : ''}{email-as-key}`);
      } else {
        yield* walkStrings(v, path ? `${path}.${k}` : k);
      }
    }
  }
  // Timestamps, references, GeoPoints and other class instances hold no free text.
}

// ── Output safety ────────────────────────────────────────────────────────────

/** A document path safe to print: ids that look like email addresses are hidden. */
export function safePath(path) {
  return path.split('/').map(seg => (EMAIL_EXACT.test(seg) ? '{email-as-doc-id}' : seg)).join('/');
}

export function pathTemplate(path) {
  return path.split('/').map((seg, i) => (i % 2 === 0 ? seg : '{id}')).join('/');
}

// ── Exposure, derived from firestore.rules ───────────────────────────────────

const LEVELS = {
  'public':               { weight: 4, label: 'public (some documents readable with no sign-in)' },
  'any-signed-in-user':   { weight: 3, label: 'any signed-in member' },
  'unclassified':         { weight: 2, label: 'unclassified: read the rule' },
  'staff':                { weight: 2, label: 'ops staff / platform admin' },
  'owner':                { weight: 1, label: 'the owner / participants' },
  'server-only':          { weight: 0, label: 'server only (no client access)' },
  'no-rule':              { weight: 0, label: 'no rule (denied by default)' },
};

export function classifyReadExpression(expr) {
  const e = expr.replace(/\s+/g, ' ').trim();
  if (/^false$/.test(e)) return 'server-only';
  const hasPublic = /^true$/.test(e) || /isPublic\s*==\s*true/.test(e);
  const standaloneAuth = /(^|\|\|\s*|if\s+)isAuth\(\)\s*(\|\||$)/.test(e);
  const hasStaff = /isOpsStaff|isPlatformAdmin|isOpsAdmin|opsRole/.test(e);
  const hasOwner = /request\.auth\.uid\s*==|==\s*request\.auth\.uid|request\.auth\.uid\s+in\s|\bin\s+resource\.data\./.test(e);
  if (hasPublic) return 'public';
  if (standaloneAuth) return 'any-signed-in-user';
  if (hasStaff) return 'staff'; // "owner OR staff" is still readable by staff: report the wider audience
  if (hasOwner) return 'owner';
  return 'unclassified';
}

/** collection id -> { level, weight, label, rule } from the first read rule under each `match /id/{x}`. */
export function loadRuleHints(rulesText) {
  const text = rulesText.replace(/\/\/[^\n]*/g, '');
  const matchRe = /match\s+\/([A-Za-z0-9_]+)\/\{[A-Za-z0-9_=*]+\}\s*\{/g;
  const starts = [...text.matchAll(matchRe)].map(m => ({ id: m[1], at: m.index + m[0].length }));
  const nextMatchAt = (from) => {
    const idx = text.slice(from).search(/match\s+\//);
    return idx === -1 ? text.length : from + idx;
  };
  const hints = new Map();
  for (const s of starts) {
    const body = text.slice(s.at, nextMatchAt(s.at));
    const m = body.match(/allow\s+(?:[a-z]+\s*,\s*)*(?:read|get|list)(?:\s*,\s*[a-z]+)*\s*:\s*if\s+([^;]+);/);
    const key = m ? classifyReadExpression(m[1]) : 'no-rule';
    const hint = { level: key, weight: LEVELS[key].weight, label: LEVELS[key].label, rule: m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 160) : null };
    const existing = hints.get(s.id);
    if (!existing || hint.weight > existing.weight) hints.set(s.id, hint); // keep the most exposed reading
  }
  return hints;
}

// ── Scanning ─────────────────────────────────────────────────────────────────

function newAccumulator() {
  return { findings: new Map(), docsScanned: 0 };
}

export function scanDocument(acc, collectionId, docPath, docId, data, keepSamples = true) {
  acc.docsScanned++;
  const template = pathTemplate(docPath);
  const seenInDoc = new Set();
  const record = (field, kind, shape) => {
    const k = `${collectionId}|${template}|${field}|${kind}|${shape}`;
    let f = acc.findings.get(k);
    if (!f) { f = { collection: collectionId, pathTemplate: template, field, kind, shape, docs: 0, occurrences: 0, samples: [] }; acc.findings.set(k, f); }
    f.occurrences++;
    if (!seenInDoc.has(k)) {
      seenInDoc.add(k); f.docs++;
      if (keepSamples && f.samples.length < 3) f.samples.push(safePath(docPath));
    }
  };
  if (EMAIL_EXACT.test(docId) && !isNonPersonalEmail(docId)) record('(document id)', 'email', 'exact');
  for (const { field, key, value } of walkStrings(data)) {
    for (const hit of detectInString(key, value)) record(field, hit.kind, hit.shape);
  }
}

export function rankFindings(findings, hints) {
  return [...findings.values()]
    .map(f => {
      const h = hints.get(f.collection) ?? { level: 'no-rule', weight: 0, label: LEVELS['no-rule'].label, rule: null };
      return { ...f, exposure: { level: h.level, label: h.label, readRule: h.rule }, _w: h.weight };
    })
    .sort((a, b) => b._w - a._w || (a.kind === 'card' ? -1 : 0) - (b.kind === 'card' ? -1 : 0) || b.docs - a.docs)
    .map(({ _w, ...rest }) => rest);
}

async function discoverCollectionIds(db, sampleParents, maxDepth = 4) {
  const ids = new Set();
  const queue = (await db.listCollections()).map(ref => ({ ref, depth: 1 }));
  while (queue.length) {
    const { ref, depth } = queue.shift();
    if (ids.has(ref.id)) continue; // explore each collection id once; --extra covers the rest
    ids.add(ref.id);
    if (depth >= maxDepth) continue;
    const snap = await ref.select().limit(sampleParents).get();
    for (const parent of snap.docs) {
      for (const child of await parent.ref.listCollections()) queue.push({ ref: child, depth: depth + 1 });
    }
  }
  return [...ids].sort();
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
  const list = (flag) => (get(flag) ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    project: get('--project'),
    yes: argv.includes('--yes'),
    full: argv.includes('--full'),
    maxDocs: parseInt(get('--max-docs') ?? '5000', 10),
    discover: parseInt(get('--discover') ?? '25', 10),
    only: list('--only'),
    extra: list('--extra'),
    rules: get('--rules') ?? 'firestore.rules',
    out: get('--out') ?? 'pii-scan-report.json',
    samples: !argv.includes('--no-samples'),
  };
}

function printTable(rows, limit) {
  const header = ['EXPOSURE', 'COLLECTION', 'FIELD', 'KIND', 'DOCS'];
  const body = rows.slice(0, limit).map(f => [f.exposure.level, f.collection, f.field, `${f.kind} (${f.shape})`, String(f.docs)]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map(r => r[i].length)));
  const fmt = r => r.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  body.forEach(r => console.log(fmt(r)));
  if (rows.length > limit) console.log(`... and ${rows.length - limit} more in the report file`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (!opts.project) {
    console.error('Usage: node scripts/scan-plaintext-pii.mjs --project <bewatu-dev|bewatu-2d04e> --yes [--only a,b] [--max-docs N | --full] [--out file]');
    process.exit(2);
  }
  if (!usingEmulator && !opts.yes) {
    console.error(`This will READ documents in the live project "${opts.project}" (one Firestore read per document, capped at ${opts.full ? 'NO LIMIT' : opts.maxDocs + ' per collection'}).`);
    console.error('It writes nothing and does not print or save any personal data it finds. Re-run with --yes to proceed.');
    process.exit(2);
  }

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp(usingEmulator ? { projectId: opts.project } : { credential: applicationDefault(), projectId: opts.project });
  const db = getFirestore();

  let hints = new Map();
  try { hints = loadRuleHints(fs.readFileSync(opts.rules, 'utf8')); }
  catch { console.error(`(Could not read ${opts.rules}; findings will not be ranked by exposure.)`); }

  console.log(`Project: ${opts.project}${usingEmulator ? ' (emulator)' : ''} | mode: READ-ONLY | cap: ${opts.full ? 'none' : opts.maxDocs + ' docs per collection'}`);
  let ids = opts.only.length ? opts.only : await discoverCollectionIds(db, opts.discover);
  ids = [...new Set([...ids, ...opts.extra])].sort();
  console.log(`Collections to scan (${ids.length}): ${ids.join(', ')}\n`);

  const acc = newAccumulator();
  const scanned = [];
  for (const id of ids) {
    let count = 0;
    try {
      let q = db.collectionGroup(id);
      if (!opts.full) q = q.limit(opts.maxDocs);
      for await (const snap of q.stream()) {
        count++;
        scanDocument(acc, id, snap.ref.path, snap.id, snap.data(), opts.samples);
      }
      scanned.push({ collection: id, docsScanned: count, truncated: !opts.full && count >= opts.maxDocs });
    } catch (err) {
      scanned.push({ collection: id, docsScanned: count, truncated: false, error: String(err?.code ?? 'read-failed') });
    }
  }

  const ranked = rankFindings(acc.findings, hints);
  const byKind = {};
  for (const f of ranked) byKind[f.kind] = (byKind[f.kind] ?? 0) + f.docs;
  const report = {
    generatedAt: new Date().toISOString(),
    project: opts.project,
    readOnly: true,
    note: 'Counts and field names only. No personal data values are stored in this file.',
    capPerCollection: opts.full ? null : opts.maxDocs,
    totalDocsScanned: acc.docsScanned,
    collections: scanned,
    summary: { findings: ranked.length, documentsWithFindingsByKind: byKind },
    findings: ranked,
  };
  fs.writeFileSync(opts.out, JSON.stringify(report, null, 2), { mode: 0o600 });

  console.log(`Scanned ${acc.docsScanned} documents across ${scanned.length} collections.`);
  const truncated = scanned.filter(s => s.truncated).map(s => s.collection);
  if (truncated.length) console.log(`Capped (more documents exist): ${truncated.join(', ')}. Counts for these are lower bounds; use --only <name> --full to size one exactly.`);
  const failed = scanned.filter(s => s.error);
  if (failed.length) console.log(`Could not read: ${failed.map(s => `${s.collection} (${s.error})`).join(', ')}`);
  const cards = ranked.filter(f => f.kind === 'card');
  console.log(cards.length ? `\n!! CARD-LIKE NUMBERS FOUND in ${cards.map(c => c.collection + '.' + c.field).join(', ')}. Investigate first.` : '\nCard-like numbers: none found.');
  console.log(`\nPlaintext personal data findings (${ranked.length}), most exposed first:\n`);
  if (ranked.length) printTable(ranked, 30); else console.log('None.');
  console.log(`\nFull report (counts only): ${opts.out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error('Scan failed:', err?.code ?? err?.message ?? 'unknown error'); process.exit(1); });
}
