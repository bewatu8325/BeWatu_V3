// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/org-import/run-tests.mjs"
// Guards scripts/import-organizations.mjs: reading real datasets, cleaning, conservative dedupe,
// merge-only-fill-empty, idempotent writes, honest ownership, and a dry run that writes nothing.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRor, parseCms, parseGeneric, parseCsv, cleanWebsite, checkWebsite, isPublicIp, plan, toNewDoc, fillMissing, normalizeName, ORG_TYPES } from '../../scripts/lib/org-import.mjs';
import { run } from '../../scripts/import-organizations.mjs';
import { ORGANIZATION_TYPES } from '../../lib/organizations.ts';
import { runAction, resetDirectoryCache } from '../../api/companies.ts';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-orgimport' });
const db = getFirestore();
const dir = mkdtempSync(join(tmpdir(), 'org-import-'));
const quiet = () => {};

// ── fixtures: small, in the real shape of each publisher's file ──
const ror = [
  { id: 'https://ror.org/0aaa0001', status: 'active', types: ['education'], established: 1861, names: [{ value: 'Massachusetts Institute of Technology', types: ['ror_display', 'label'] }, { value: 'MIT', types: ['acronym'] }],
    links: [{ type: 'website', value: 'http://web.mit.edu' }], locations: [{ geonames_details: { name: 'Cambridge', country_name: 'United States', country_code: 'US', country_subdivision_name: 'Massachusetts' } }], relationships: [] },
  { id: 'https://ror.org/0bbb0002', status: 'active', types: ['education'], names: [{ value: 'University of Nairobi', types: ['ror_display'] }], links: [{ type: 'website', value: 'https://www.uonbi.ac.ke' }],
    locations: [{ geonames_details: { name: 'Nairobi', country_name: 'Kenya', country_code: 'KE' } }], relationships: [{ type: 'child', id: 'https://ror.org/0ccc0003' }] },
  { id: 'https://ror.org/0ccc0003', status: 'active', types: ['healthcare'], names: [{ value: 'Kenyatta National Hospital', types: ['ror_display'] }], links: [{ type: 'website', value: 'https://knh.or.ke' }],
    locations: [{ geonames_details: { name: 'Nairobi', country_name: 'Kenya', country_code: 'KE' } }], relationships: [{ type: 'parent', id: 'https://ror.org/0bbb0002' }] },
  { id: 'https://ror.org/0ddd0004', status: 'active', types: ['healthcare'], names: [{ value: 'Mercy Health System', types: ['ror_display'] }], links: [], locations: [{ geonames_details: { name: 'St. Louis', country_name: 'United States', country_code: 'US' } }], relationships: [] },
  { id: 'https://ror.org/0eee0005', status: 'inactive', types: ['education'], names: [{ value: 'Defunct College', types: ['ror_display'] }], links: [], locations: [], relationships: [] },
  { id: 'https://ror.org/0fff0006', status: 'active', types: ['company'], names: [{ value: 'Some Company Ltd', types: ['ror_display'] }], links: [], locations: [], relationships: [] },
];
const cms = `Facility ID,Facility Name,Address,City/Town,State,ZIP Code,County/Parish,Telephone Number,Hospital Type,Hospital Ownership,Emergency Services,Hospital overall rating
010001,SOUTHEAST HEALTH MEDICAL CENTER,"1108 ROSS CLARK CIRCLE",DOTHAN,AL,36301,HOUSTON,(334) 793-8701,Acute Care Hospitals,Government - Hospital District or Authority,Yes,3
010005,"MARSHALL MEDICAL CENTER, SOUTH",2505 U S HIGHWAY 431 NORTH,BOAZ,AL,35957,MARSHALL,(256) 593-8310,Acute Care Hospitals,Government - Hospital District or Authority,Yes,Not Available
020001,PROVIDENCE ALASKA MEDICAL CENTER,3200 PROVIDENCE DRIVE,ANCHORAGE,AK,99508,ANCHORAGE,(907) 212-3000,Acute Care Hospitals,Voluntary non-profit - Private,No,4
`;
const csvText = `name,organization_type,industry,subindustries,website,city,region,country,source_id,profile_established,profile_employeeRange
Gearworks Inc,business,Manufacturing,Machinery; Precision Parts,https://gearworks.example.com,Detroit,MI,United States,GW1,1948,1000-5000
"Hydra Pumps, Ltd",business,Manufacturing,,hydra.example.org,Leeds,,United Kingdom,HP7,,
Not A Type Co,spaceship,Manufacturing,,,,,,X1,,
`;
const rorFile = join(dir, 'ror.json'); writeFileSync(rorFile, JSON.stringify(ror));
const cmsFile = join(dir, 'cms.csv'); writeFileSync(cmsFile, cms);
const csvFile = join(dir, 'mfg.csv'); writeFileSync(csvFile, csvText);

console.log('== reading the publishers\' files ==');
await check('the importer\'s type list matches the app\'s', () => { assert(ORG_TYPES.join() === ORGANIZATION_TYPES.join(), 'type lists differ'); });
await check('CSV parser: quotes, commas inside quotes, blank lines', () => {
  const r = parseCsv('a,b\n"x, y","he said ""hi"""\n\n1,2\n');
  assert(r.length === 2 && r[0].a === 'x, y' && r[0].b === 'he said "hi"' && r[1].a === '1', JSON.stringify(r));
});
await check('ROR: universities, hospitals vs health systems, parent, established; inactive and companies are left out', () => {
  const { candidates, skipped } = parseRor(JSON.stringify(ror));
  assert(candidates.length === 4, 'count ' + candidates.length);
  const mit = candidates.find(c => c.sourceId === '0aaa0001');
  assert(mit.name === 'Massachusetts Institute of Technology' && mit.organizationType === 'college_university' && mit.industry === 'Higher Education', 'mit');
  assert(mit.profile.established === 1861 && mit.location.city === 'Cambridge' && mit.location.country === 'United States', 'mit facts');
  assert(candidates.find(c => c.sourceId === '0ddd0004').organizationType === 'health_system', 'health system');
  const knh = candidates.find(c => c.sourceId === '0ccc0003');
  assert(knh.organizationType === 'hospital' && knh.parentSourceId === '0bbb0002', 'hospital + parent');
  assert(skipped.some(s => /inactive/.test(s.reason)), 'inactive reported');
});
await check('ROR: you can ask for education only', () => {
  const { candidates } = parseRor(JSON.stringify(ror), { types: ['education'] });
  assert(candidates.length === 2 && candidates.every(c => c.organizationType === 'college_university'), 'edu only');
});
await check('CMS: hospitals with facts from the file; unavailable ratings are left out, not zero', () => {
  const { candidates } = parseCms(cms);
  assert(candidates.length === 3, 'count');
  const a = candidates[0];
  assert(a.name === 'Southeast Health Medical Center' && a.location.city === 'Dothan' && a.location.region === 'AL', JSON.stringify(a.location) + a.name);
  assert(a.profile.starRating === 3 && a.profile.emergencyServices === 'Yes' && /Acute/.test(a.profile.facilityType), JSON.stringify(a.profile));
  assert(!('starRating' in candidates[1].profile), 'Not Available must not become a rating');
  assert(candidates[1].name.startsWith('Marshall Medical Center'), candidates[1].name);
  assert(candidates[2].profile.emergencyServices === 'No', 'No');
  assert(candidates.every(c => c.description === ''), 'nothing invented');
});
await check('CSV: needs a named source, rejects unknown types, reads profile columns', () => {
  let threw = false; try { parseGeneric(csvText, { sourceUrl: 'https://x.example' }); } catch { threw = true; } assert(threw, 'source name required');
  threw = false; try { parseGeneric(csvText, { sourceName: 'X', sourceUrl: 'http://x.example' }); } catch { threw = true; } assert(threw, 'https source url required');
  const { candidates, skipped } = parseGeneric(csvText, { sourceName: 'Test Source', sourceUrl: 'https://x.example/data' });
  assert(candidates.length === 2 && skipped.length === 1 && /organization_type/.test(skipped[0].reason), 'unknown type skipped');
  assert(candidates[0].subindustries.join() === 'Machinery,Precision Parts' && candidates[0].profile.established === 1948 && candidates[0].profile.employeeRange === '1000-5000', JSON.stringify(candidates[0]));
  assert(candidates[1].name === 'Hydra Pumps, Ltd', 'quoted comma');
});

console.log('== websites ==');
await check('addresses are cleaned and unsafe or unusable ones are refused', () => {
  assert(cleanWebsite('https://www.Example.com/about/?utm=1#x').url === 'https://www.example.com/about', cleanWebsite('https://www.Example.com/about/?utm=1#x').url);
  assert(cleanWebsite('example.org').url === 'https://example.org/', 'bare host');
  assert(cleanWebsite('http://example.org').url === '' && cleanWebsite('http://example.org', { upgradeHttp: true }).url === 'https://example.org/', 'http only when checked');
  for (const bad of ['javascript:alert(1)', 'https://user:pw@example.com', 'https://localhost', 'https://10.0.0.1/', 'https://intranet', 'ftp://example.com', 'not a url', 'https://printer.local']) {
    assert(cleanWebsite(bad).url === '', 'should refuse ' + bad);
  }
  assert(cleanWebsite('https://www.example.com').domain === 'example.com', 'domain');
});
await check('private and special addresses are never public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) assert(!isPublicIp(ip), ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) assert(isPublicIp(ip), ip);
});
{
  const pub = async () => [{ address: '93.184.216.34' }];
  const res = (status, headers = {}) => ({ status, headers: { get: k => headers[k.toLowerCase()] ?? null } });
  await check('a live site passes; a missing one fails; a site that declines robots (403) still counts as real', async () => {
    assert((await checkWebsite('https://a.example', { resolve: pub, fetchImpl: async () => res(200) })).ok, '200');
    assert(!(await checkWebsite('https://a.example', { resolve: pub, fetchImpl: async () => res(404) })).ok, '404');
    assert((await checkWebsite('https://a.example', { resolve: pub, fetchImpl: async () => res(403) })).ok, '403');
    assert(!(await checkWebsite('https://a.example', { resolve: async () => { throw new Error('ENOTFOUND'); }, fetchImpl: async () => res(200) })).ok, 'no dns');
  });
  await check('a site resolving to a private address, or redirecting there, is refused', async () => {
    assert(!(await checkWebsite('https://a.example', { resolve: async () => [{ address: '10.0.0.5' }], fetchImpl: async () => res(200) })).ok, 'private');
    let n = 0;
    const resolve = async (h) => [{ address: h === 'evil.example' ? '169.254.169.254' : '93.184.216.34' }];
    const r = await checkWebsite('https://a.example', { resolve, fetchImpl: async () => (n++ === 0 ? res(302, { location: 'https://evil.example/' }) : res(200)) });
    assert(!r.ok, 'redirect to a private host must fail');
    const loop = await checkWebsite('https://a.example', { resolve: pub, fetchImpl: async () => res(302, { location: 'https://a.example/' }) });
    assert(!loop.ok && /redirect/.test(loop.reason), 'loop');
  });
}

console.log('== deduplication ==');
const cand = (o) => ({ name: 'X', organizationType: 'hospital', industry: 'Healthcare', subindustries: [], description: '', websiteRaw: '', location: { city: '', region: '', country: 'United States', countryCode: 'US' }, profile: {}, parentSourceId: '', sourceId: '', source: { name: 'T', url: 'https://t.example', key: 't' }, hint: '', ...o });
await check('same name and website inside one file: one record', () => {
  const r = plan([cand({ name: 'Alpha University', websiteRaw: 'https://alpha.edu', sourceId: '1', location: { city: 'A', region: '', country: 'US' } }), cand({ name: 'Alpha University', websiteRaw: 'https://www.alpha.edu/', sourceId: '2', location: { city: 'A', region: '', country: 'US' } })]);
  assert(r.create.length === 1 && r.skipped.length === 1, JSON.stringify({ c: r.create.length, s: r.skipped, r: r.review }));
});
await check('the same name in two different cities is two organizations', () => {
  const r = plan([cand({ name: 'Memorial Hospital', sourceId: '1', websiteRaw: 'https://hca.example', location: { city: 'Boston', region: '', country: 'United States' } }), cand({ name: 'Memorial Hospital', sourceId: '2', websiteRaw: 'https://hca.example', location: { city: 'Dallas', region: '', country: 'United States' } })]);
  assert(r.create.length === 2 && r.review.length === 0, `create ${r.create.length} review ${r.review.length}`);
});
await check('the same name with no place to tell them apart is held for review, not created', () => {
  const r = plan([cand({ name: 'Riverside Clinic', sourceId: '1' }), cand({ name: 'Riverside Clinic', sourceId: '2' })]);
  assert(r.create.length === 1 && r.review.length === 1 && r.merge.length === 0, JSON.stringify({ c: r.create.length, r: r.review.length }));
});
await check('one website under two different names is held for review', () => {
  const r = plan([cand({ name: 'MIT', organizationType: 'college_university', websiteRaw: 'https://mit.edu', sourceId: '1', location: { city: 'Cambridge', region: '', country: 'US' } }), cand({ name: 'Massachusetts Institute of Technology', organizationType: 'college_university', websiteRaw: 'https://www.mit.edu', sourceId: '2', location: { city: 'Cambridge', region: '', country: 'US' } })]);
  assert(r.create.length === 1 && r.review.length === 1 && /mit\.edu/.test(r.review[0].reason), JSON.stringify(r.review));
});
await check('against what BeWatu already holds: same name + website merges; ambiguous waits; unrelated is created', () => {
  const existing = [
    { id: 'e1', name: 'Gearworks Inc', domain: 'gearworks.example.com', city: '', country: '', directorySource: null, hasAdmin: true },
    { id: 'e2', name: 'Hydra Pumps, Ltd', domain: '', city: '', country: '', directorySource: null, hasAdmin: false },
  ];
  const { candidates } = parseGeneric(csvText, { sourceName: 'Test Source', sourceUrl: 'https://x.example/data' });
  const r = plan(candidates, existing);
  assert(r.merge.length === 1 && r.merge[0].id === 'e1', 'gearworks merges: ' + JSON.stringify(r.merge.map(m => m.id)));
  assert(r.review.length === 1 && r.review[0].name === 'Hydra Pumps, Ltd', 'hydra waits: ' + JSON.stringify(r.review));
  assert(r.create.length === 0, 'nothing new');
});
await check('names match across case, accents, punctuation and "The"', () => {
  assert(normalizeName('The  Université  de Montréal, Inc.') === normalizeName('universite de montreal inc'), normalizeName('The Université de Montréal, Inc.'));
  assert(normalizeName('Johns Hopkins & Co') === 'johns hopkins and co', 'ampersand');
});
await check('a record already imported from the same source id is recognised, not duplicated', () => {
  const existing = [{ id: 'org_t_1', name: 'Anything', domain: '', city: '', country: '', directorySource: { name: 'T', id: '1' } }];
  const r = plan([cand({ name: 'Renamed Hospital', sourceId: '1' })], existing);
  assert(r.merge.length === 1 && r.create.length === 0, 'recognised');
});
await check('merging only fills empty fields and never touches ownership, claim, name or counts', () => {
  const p = { organizationType: 'college_university', industry: 'Higher Education', subindustries: ['Research'], website: 'https://u.example/', domain: 'u.example', location: { city: 'Leeds', region: '', country: 'United Kingdom', countryCode: 'GB' }, profile: { established: 1900, enrollment: 5000 }, source: { name: 'T', url: 'https://t.example' }, sourceId: '9' };
  const changes = fillMissing({ name: 'Real Name', industry: 'Education', adminUid: 'owner', claimed: true, website: 'https://theirs.example', location: { country: 'United Kingdom' }, profile: { established: 1850 }, directorySource: { name: 'Old' } }, p);
  assert(!('industry' in changes) && !('website' in changes) && !('name' in changes) && !('adminUid' in changes) && !('claimed' in changes) && !('followerCount' in changes) && !('verificationStatus' in changes), 'protected: ' + Object.keys(changes));
  assert(changes['location.city'] === 'Leeds' && !('location.country' in changes) && changes['profile.enrollment'] === 5000 && !('profile.established' in changes) && changes.organizationType === 'college_university', JSON.stringify(changes));
  assert(!('directorySource' in changes), 'existing attribution is kept');
});
await check('a new document is unclaimed, unowned, unverified, with a named source and nothing invented', () => {
  const { candidates } = parseCms(cms);
  const d = toNewDoc(plan(candidates).create[0], 'NOW');
  assert(d.claimed === false && !('adminUid' in d) && d.verificationStatus === 'unverified' && d.followerCount === 0 && d.logoUrl === '' && d.description === '', JSON.stringify(d));
  assert(d.directorySource.name === 'CMS Hospital General Information' && d.directorySource.id === '010001', 'source');
  assert(!('numericId' in d), 'imported records have no numericId (keeps them out of the member-company lists)');
});

console.log('== the command ==');
const quietRun = (argv, extra = {}) => { const lines = []; return run(argv, { log: l => lines.push(l), ...extra }).then(code => ({ code, lines })); };
await check('a dry run reads, reports, and writes nothing to BeWatu', async () => {
  const before = (await db.collection('companies').get()).size;
  const { code, lines } = await quietRun(['--source', 'cms', '--file', cmsFile, '--report-dir', join(dir, 'reports')], { firestore: db });
  assert(code === 0 && /Dry run/.test(lines.join('\n')), lines.join('\n'));
  assert((await db.collection('companies').get()).size === before, 'wrote something');
  const rep = JSON.parse(readFileSync(join(dir, 'reports', readdirSync(join(dir, 'reports'))[0]), 'utf8'));
  assert(rep.summary.create === 3 && rep.applied === false, JSON.stringify(rep.summary));
});
await check('writing needs --apply, --project and --yes together', async () => {
  for (const argv of [['--apply'], ['--apply', '--project', 'p'], ['--apply', '--yes']]) {
    const before = (await db.collection('companies').get()).size;
    const { code } = await quietRun(['--source', 'cms', '--file', cmsFile, ...argv], { firestore: db });
    assert(code === 2, 'refused ' + argv.join(' '));
    assert((await db.collection('companies').get()).size === before, 'wrote anyway');
  }
});

// A member company that already exists, with an owner.
await db.collection('companies').doc('member-co').set({ name: 'Gearworks Inc', domain: 'gearworks.example.com', website: 'https://gearworks.example.com', industry: 'Manufacturing', numericId: 123, adminUid: 'owner-1', claimed: true, followerCount: 7, verificationStatus: 'verified', description: 'Their own words.' });
await check('apply: creates new records, fills a matching member company without touching its ownership', async () => {
  const { code, lines } = await quietRun(['--source', 'csv', '--file', csvFile, '--source-name', 'Test Source', '--source-url', 'https://x.example/data', '--apply', '--project', 'demo', '--yes', '--report-dir', join(dir, 'r2')], { firestore: db });
  assert(code === 0, lines.join('\n'));
  const member = (await db.collection('companies').doc('member-co').get()).data();
  assert(member.adminUid === 'owner-1' && member.claimed === true && member.followerCount === 7 && member.verificationStatus === 'verified' && member.description === 'Their own words.' && member.name === 'Gearworks Inc', 'protected fields changed: ' + JSON.stringify(member));
  assert(JSON.stringify(member.subindustries) === JSON.stringify(['Machinery', 'Precision Parts']) && member.profile.established === 1948, 'empty fields filled: ' + JSON.stringify(member));
  assert(member.numericId === 123, 'numericId kept');
});
await check('apply: ROR import creates colleges and links hospital to parent university', async () => {
  const { code, lines } = await quietRun(['--source', 'ror', '--file', rorFile, '--apply', '--project', 'demo', '--yes', '--report-dir', join(dir, 'r3')], { firestore: db });
  assert(code === 0, lines.join('\n'));
  const mit = (await db.collection('companies').doc('org_ror_0aaa0001').get()).data();
  assert(mit && mit.organizationType === 'college_university' && mit.claimed === false && !mit.adminUid && mit.directorySource.name.includes('ROR'), JSON.stringify(mit));
  assert(mit.website === '' , 'http-only site is not stored without a live check: ' + mit.website);
  const knh = (await db.collection('companies').doc('org_ror_0ccc0003').get()).data();
  assert(knh.parentId === 'org_ror_0bbb0002' && knh.website === 'https://knh.or.ke/', JSON.stringify(knh));
  assert(!(await db.collection('companies').doc('org_ror_0eee0005').get()).exists, 'inactive record must not be imported');
});
await check('running it again changes nothing', async () => {
  const snap1 = (await db.collection('companies').get()).size;
  const { code, lines } = await quietRun(['--source', 'ror', '--file', rorFile, '--apply', '--project', 'demo', '--yes', '--report-dir', join(dir, 'r4')], { firestore: db });
  assert(code === 0, lines.join('\n'));
  assert((await db.collection('companies').get()).size === snap1, 'duplicates created');
  assert(/Created 0/.test(lines.join('\n')), lines.join('\n'));
});
await check('--max-create stops a run from writing more than asked', async () => {
  const before = (await db.collection('companies').get()).size;
  await quietRun(['--source', 'cms', '--file', cmsFile, '--apply', '--project', 'demo', '--yes', '--max-create', '2', '--report-dir', join(dir, 'r5')], { firestore: db });
  assert((await db.collection('companies').get()).size === before + 2, 'cap');
});
await check('imported organizations show up in the directory by category, with accurate counts and claim status', async () => {
  resetDirectoryCache();
  const me = { uid: 'u1', email: 'a@b.org', emailVerified: true };
  const r = await runAction(db, me, { action: 'list', category: 'education', limit: 24 });
  assert(r.items.some(i => i.id === 'org_ror_0aaa0001') && r.items.every(i => i.categories.includes('education')), 'colleges listed');
  assert(r.items.find(i => i.id === 'org_ror_0aaa0001').claimStatus === 'unclaimed', 'unclaimed');
  const h = await runAction(db, me, { action: 'list', category: 'healthcare', limit: 24 });
  assert(h.total === h.items.length && h.items.some(i => i.id === 'org_ror_0ccc0003') && h.items.some(i => i.id === 'org_ror_0ddd0004'), 'hospitals + health systems');
  const m = await runAction(db, me, { action: 'list', category: 'manufacturing', limit: 24 });
  assert(m.items.some(i => i.id === 'member-co'), 'the member company stays in manufacturing');
  const d = await runAction(db, me, { action: 'detail', companyId: 'org_ror_0ccc0003' });
  assert(d.organization.parent?.id === 'org_ror_0bbb0002' && d.organization.claimStatus === 'unclaimed' && /ROR/.test(d.organization.source.name), JSON.stringify(d.organization));
  const claimed = await runAction(db, me, { action: 'detail', companyId: 'member-co' });
  assert(claimed.organization.claimStatus === 'claimed', 'claimed stays claimed');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
