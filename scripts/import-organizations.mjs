#!/usr/bin/env node
/**
 * scripts/import-organizations.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports REAL organizations into the BeWatu directory from a published dataset you have
 * downloaded. It never makes organizations up and it never writes anything unless you
 * ask it to. By default it is a DRY RUN: it reads your file, plans, and writes a report.
 *
 *   # 1. Look before you leap (no credentials, no network):
 *   node scripts/import-organizations.mjs --source ror --file ror-v2.json --types education
 *   node scripts/import-organizations.mjs --source cms --file Hospital_General_Information.csv
 *   node scripts/import-organizations.mjs --source csv --file my-manufacturers.csv \
 *        --source-name "SEC EDGAR" --source-url https://www.sec.gov/edgar/searchedgar/companysearch
 *
 *   # 2. Check the websites answer (network; optional but recommended), and compare with what
 *   #    BeWatu already holds (read-only; needs your Firebase credentials):
 *   ... --check-websites --check-existing --project bewatu-2d04e
 *
 *   # 3. Read the report, then write for real:
 *   ... --check-websites --apply --project bewatu-2d04e --yes
 *
 * Sources (download them yourself from the publisher):
 *   ror   Research Organization Registry data dump (https://ror.org/registry/), v2 JSON.
 *         --types education,healthcare  (default both)
 *   cms   CMS "Hospital General Information" CSV (https://data.cms.gov/provider-data/topics/hospitals).
 *   csv   Your own file from another reliable source: columns name, organization_type,
 *         industry, subindustries (; separated), website, city, region, country,
 *         country_code, description, source_id, parent_source_id, profile_<field>.
 *         Requires --source-name and --source-url so every record names its origin.
 *
 * Safety:
 *   - Idempotent: ids come from the source's own ids, new records are CREATED (never overwritten),
 *     re-running adds only what is new. Existing records are only ever filled where empty.
 *   - Possible duplicates are held back in the report ("review"), never guessed at.
 *   - Imported organizations are unclaimed: nobody administers them until someone proves it.
 *   - Writing needs all of --apply, --project and --yes. --max-create caps a run (default 5000).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseRor, parseCms, parseGeneric, plan, toNewDoc, fillMissing, checkWebsite, cleanWebsite } from './lib/org-import.mjs';

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2); const next = argv[i + 1];
    if (['apply', 'yes', 'check-websites', 'check-existing', 'help'].includes(k)) o[k] = true;
    else { o[k] = next; i++; }
  }
  return o;
}

export async function run(argv, { log = console.log, firestore = null } = {}) {
  const a = args(argv);
  if (a.help || !a.source || !a.file) { log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('\n').slice(2).map(l => l.replace(/^ \* ?/, '')).join('\n')); return a.help ? 0 : 2; }
  if (a.apply && !(a.project && a.yes)) { log('Writing needs --apply --project <firebase project id> --yes. Nothing was changed.'); return 2; }

  const text = readFileSync(a.file, 'utf8');
  let parsed;
  if (a.source === 'ror') parsed = parseRor(text, { types: (a.types ?? 'education,healthcare').split(',').map(s => s.trim()) });
  else if (a.source === 'cms') parsed = parseCms(text);
  else if (a.source === 'csv') parsed = parseGeneric(text, { sourceName: a['source-name'], sourceUrl: a['source-url'] });
  else { log(`Unknown --source ${a.source}. Use ror, cms or csv.`); return 2; }
  let candidates = parsed.candidates;
  if (a.limit) candidates = candidates.slice(0, Math.max(0, parseInt(a.limit, 10) || 0));
  log(`Read ${candidates.length} candidate organizations from ${a.file} (${parsed.skipped.length} skipped while reading).`);

  // Existing records, to dedupe against. Needed to apply; optional for a dry run.
  let db = firestore, existing = [], existingDocs = new Map();
  if (a.apply || a['check-existing']) {
    if (!a.project && !firestore) { log('--check-existing needs --project <firebase project id>.'); return 2; }
    if (!db) {
      const { initializeApp } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      initializeApp({ projectId: a.project });
      db = getFirestore();
    }
    const snap = await db.collection('companies').select('name', 'domain', 'website', 'location', 'directorySource', 'adminUid', 'organizationType', 'industry', 'subindustries', 'profile', 'parentId').get();
    for (const d of snap.docs) {
      const x = d.data();
      existingDocs.set(d.id, x);
      existing.push({ id: d.id, name: x.name ?? '', domain: String(x.domain ?? '').toLowerCase() || (x.website ? (cleanWebsite(x.website, { upgradeHttp: true }).domain) : ''), city: x.location?.city ?? '', country: x.location?.country ?? '', directorySource: x.directorySource ?? null, hasAdmin: !!x.adminUid });
    }
    log(`Compared with ${existing.length} organizations already in BeWatu.`);
  } else log('Not comparing with BeWatu (add --check-existing --project <id> to do so; applying always does).');

  // Websites
  const websiteStatus = new Map();
  if (a['check-websites']) {
    const urls = [...new Set(candidates.map(c => cleanWebsite(c.websiteRaw, { upgradeHttp: true }).url).filter(Boolean))];
    log(`Checking ${urls.length} websites…`);
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < urls.length) {
        const u = urls[next++]; websiteStatus.set(u, await checkWebsite(u));
        if (++done % 200 === 0) log(`  checked ${done}/${urls.length}`);
      }
    }));
  }

  const result = plan(candidates, existing, { websiteStatus, max: a['max-create'] ? parseInt(a['max-create'], 10) : 5000 });

  // Report
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = a['report-dir'] ?? 'import-reports';
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, `organizations-${a.source}-${a.apply ? 'applied' : 'dry-run'}-${stamp}.json`);
  const summary = { create: result.create.length, merge: result.merge.length, review: result.review.length, skipped: result.skipped.length + parsed.skipped.length, websitesDropped: result.websiteDropped.length };
  writeFileSync(reportPath, JSON.stringify({
    summary, source: a.source, file: a.file, applied: !!a.apply,
    create: result.create.map(p => ({ id: p.id, name: p.name, type: p.organizationType, city: p.location.city, country: p.location.country, website: p.website, note: p.hint || undefined })),
    merge: result.merge.map(p => ({ id: p.id, name: p.name })), review: result.review, skipped: [...parsed.skipped, ...result.skipped], websiteDropped: result.websiteDropped,
  }, null, 2));
  log(`\nWould create ${summary.create} · fill ${summary.merge} existing · hold ${summary.review} for review · skip ${summary.skipped} · dropped ${summary.websitesDropped} unusable websites`);
  log(`Report: ${reportPath}`);
  if (!a.apply) { log('\nDry run: nothing was written. Re-run with --apply --project <id> --yes to write.'); return 0; }

  // Apply
  const { FieldValue } = await import('firebase-admin/firestore');
  const idOfSource = new Map(result.create.map(p => [p.sourceId, p.id]));
  for (const [id, x] of existingDocs) if (x.directorySource?.id) idOfSource.set(x.directorySource.id, id);
  const parentIdFor = (p) => (p.parentSourceId ? (idOfSource.get(p.parentSourceId) ?? '') : '');
  const writer = db.bulkWriter();
  let created = 0, filled = 0, already = 0;
  const failures = [];
  writer.onWriteError(err => { if (err.code === 6) { already++; return false; } failures.push(err.message); return false; });
  const serverNow = FieldValue.serverTimestamp();
  for (const p of result.create) {
    const doc = toNewDoc(p, serverNow, parentIdFor);
    writer.create(db.collection('companies').doc(p.id), doc).then(() => { created++; }).catch(() => {});
  }
  for (const p of result.merge) {
    const changes = fillMissing(existingDocs.get(p.id) ?? {}, p, parentIdFor(p));
    if (Object.keys(changes).length === 0) continue;
    writer.update(db.collection('companies').doc(p.id), { ...changes, updatedAt: serverNow }).then(() => { filled++; }).catch(() => {});
  }
  await writer.close();
  // Make the new records appear in the directory soon: mark the server's condensed copy as due for a rebuild.
  try { await db.collection('directory_snapshot').doc('meta').update({ builtAtMs: 0 }); } catch { /* none yet: the directory reads the collection directly */ }
  log(`\nDone. Created ${created}, filled ${filled} existing, ${already} already existed.${failures.length ? ` ${failures.length} writes failed: ${failures[0]}` : ''}`);
  return failures.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e.message); process.exit(1); });
}
