// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/organizations/run-tests.mjs"
// Guards the organizations directory: the shared model (lib/ and api/ copies agree), categories,
// combinable filters with honest counts, paging without duplicates, the large-directory snapshot,
// and organization profiles.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runAction, resetDirectoryCache, categoryOf as apiCategoryOf, normalizeType as apiNormalizeType } from '../../api/companies.ts';
import { categoryOf, normalizeType, ORGANIZATION_TYPES, sanitizeProfile, locationText } from '../../lib/organizations.ts';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-orgs' });
const db = getFirestore();
const me = { uid: 'member1', email: 'm@example.org', emailVerified: true };
const list = (body, now) => runAction(db, me, { action: 'list', ...body }, now);

// ── model: the two copies must agree ──
console.log('== the shared model ==');
await check('lib/ and api/ agree on type and category for a spread of inputs', () => {
  const inputs = [
    [undefined, ''], ['business', 'Manufacturing'], ['business', 'Healthcare'], ['business', 'Medical Devices'], ['business', 'Biotechnology'],
    ['business', 'Pharmaceuticals'], ['college_university', 'Education'], ['hospital', 'Healthcare'], ['health_system', ''], ['nonprofit', 'Healthcare'],
    ['nonprofit', 'Manufacturing'], ['government', 'Manufacturing'], ['College University', 'x'], ['HOSPITAL', 'x'], ['nonsense', 'Finance'], [42, 7], [null, null],
    ['research_institute', 'Life Sciences'], ['business', 'Finance'], ['business', 'Industrial Manufacturing'],
  ];
  for (const [t, i] of inputs) {
    const o = { organizationType: t, industry: i };
    assert(categoryOf(o) === apiCategoryOf(o), `category differs for ${JSON.stringify(o)}: ${categoryOf(o)} vs ${apiCategoryOf(o)}`);
    assert(normalizeType(t) === apiNormalizeType(t), `type differs for ${JSON.stringify(t)}`);
  }
});
await check('a record with no organizationType is a business, so existing companies keep working', () => {
  assert(normalizeType(undefined) === 'business' && normalizeType('') === 'business' && normalizeType('weird') === 'business', 'default');
  assert(categoryOf({ industry: 'Finance' }) === 'other', 'finance business');
  assert(categoryOf({ industry: 'Healthcare' }) === 'medical' && categoryOf({ industry: 'Manufacturing' }) === 'manufacturing', 'industry placement');
});
await check('type decides before industry: a hospital is a hospital, a nonprofit in healthcare is not a medical company', () => {
  assert(categoryOf({ organizationType: 'hospital', industry: 'Manufacturing' }) === 'hospitals', 'hospital');
  assert(categoryOf({ organizationType: 'nonprofit', industry: 'Healthcare' }) === 'other', 'nonprofit');
});
await check('profile facts keep only known fields with sane values', () => {
  const p = sanitizeProfile('hospitals', { beds: '250', starRating: 9, emergencyServices: 'Y', facilityType: 'Acute Care', bogus: 'x', established: 1850 });
  assert(p.beds === 250 && p.emergencyServices === 'Yes' && p.facilityType === 'Acute Care' && p.established === 1850, JSON.stringify(p));
  assert(!('starRating' in p) && !('bogus' in p), 'rating 9 and unknown keys must be dropped: ' + JSON.stringify(p));
  assert(Object.keys(sanitizeProfile('colleges', null)).length === 0, 'null');
});
await check('every organization type is accepted by the model', () => { for (const t of ORGANIZATION_TYPES) assert(normalizeType(t) === t, t); });
await check('location text', () => { assert(locationText({ city: 'Boston', region: 'MA', country: 'United States' }) === 'Boston, MA, United States', 'full'); assert(locationText(null) === '', 'null'); });

// ── a small world (test fixtures only; the product never creates organizations by itself) ──
const org = (id, o) => db.collection('companies').doc(id).set({ name: id, description: `${id} description`, industry: 'Other', followerCount: 0, ...o });
const loc = (city, region, country) => ({ city, region, country });
await org('legacy-corp', { name: 'Legacy Corp', industry: 'Finance' });                                   // no organizationType at all
await org('legacy-med', { name: 'Legacy Medical', industry: 'Healthcare', followerCount: 5 });
for (let i = 1; i <= 15; i++) {
  await org(`uni-${String(i).padStart(2, '0')}`, { name: `University ${String(i).padStart(2, '0')}`, organizationType: 'college_university', industry: 'Higher Education', location: loc(i % 2 ? 'Boston' : 'Nairobi', i % 2 ? 'MA' : '', i % 2 ? 'United States' : 'Kenya'), followerCount: i });
}
await org('mercy', { name: 'Mercy Hospital', organizationType: 'hospital', industry: 'Healthcare', location: loc('Boston', 'MA', 'United States'), parentId: 'mercy-system', profile: { beds: 320, emergencyServices: 'yes', facilityType: 'Acute Care' }, directorySource: { name: 'CMS Care Compare', url: 'https://data.cms.gov/provider-data/' } });
await org('mercy-system', { name: 'Mercy Health System', organizationType: 'health_system', industry: 'Healthcare', location: loc('St. Louis', 'MO', 'United States') });
await org('gears', { name: 'Gears Inc', industry: 'Manufacturing', subindustries: ['Machinery', 'Precision Parts'], location: loc('Detroit', 'MI', 'United States'), adminUid: 'owner1' });
await org('steel', { name: 'Steelworks', industry: 'Industrial Manufacturing', location: loc('Nairobi', '', 'Kenya') });
await org('biotech', { name: 'Helix Biotech', industry: 'Biotechnology', location: loc('Boston', 'MA', 'United States') });
await org('charity', { name: 'Care Foundation', organizationType: 'nonprofit', industry: 'Healthcare' });
await db.collection('jobs').doc('j1').set({ title: 'Machinist', companyId: 'gears', status: 'Active', createdAt: new Date(), location: 'Detroit' });
resetDirectoryCache();

console.log('== categories ==');
await check('every existing company is still listed, with no record altered', async () => {
  const r = await list({ limit: 24 });
  const ids = r.items.map(i => i.id);
  assert(ids.includes('legacy-corp') && ids.includes('legacy-med'), 'legacy records');
  const lc = r.items.find(i => i.id === 'legacy-corp');
  assert(lc.organizationType === 'business' && lc.category === 'other', JSON.stringify(lc));
  const doc = (await db.collection('companies').doc('legacy-corp').get()).data();
  assert(!('organizationType' in doc), 'must not rewrite existing records');
});
await check('the four categories and their counts are exact', async () => {
  const r = await list({});
  const c = Object.fromEntries(r.categories.map(x => [x.key, x.count]));
  assert(c.colleges === 15, 'colleges ' + c.colleges);
  assert(c.hospitals === 2, 'hospitals ' + c.hospitals);
  assert(c.medical === 2, 'medical ' + c.medical); // legacy-med and biotech; the charity is a nonprofit, the hospitals are hospitals
  assert(c.manufacturing === 2, 'manufacturing ' + c.manufacturing);
  assert(Object.values(c).reduce((a, b) => a + b, 0) === r.total, 'categories must sum to the total');
  assert(r.categories.length === 5, 'all categories are always listed');
});
await check('choosing a category returns exactly its members and the total matches', async () => {
  const r = await list({ category: 'colleges', limit: 24 });
  assert(r.total === 15 && r.items.length === 15 && r.items.every(i => i.category === 'colleges'), 'colleges');
  const h = await list({ category: 'hospitals' });
  assert(h.total === 2 && h.items.every(i => ['hospital', 'health_system'].includes(i.organizationType)), 'hospitals');
  const m = await list({ category: 'manufacturing' });
  assert(m.items.map(i => i.id).sort().join() === 'gears,steel', m.items.map(i => i.id).join());
});
await check('paging inside a category: 12 then 3, no duplicates', async () => {
  const p1 = await list({ category: 'colleges', sort: 'alpha' });
  assert(p1.items.length === 12 && p1.nextCursor, 'first page');
  const p2 = await list({ category: 'colleges', sort: 'alpha', cursor: p1.nextCursor });
  assert(p2.items.length === 3 && p2.nextCursor === null, 'second page');
  const all = [...p1.items, ...p2.items].map(i => i.id);
  assert(new Set(all).size === 15, 'duplicates');
  assert(all.join() === [...all].sort().join(), 'alphabetical across pages');
});

console.log('== filters combine, and counts stay honest ==');
await check('category + country: the count is the intersection', async () => {
  const r = await list({ category: 'colleges', country: 'kenya' });
  assert(r.total === 7 && r.items.every(i => i.location.country === 'Kenya'), 'kenya colleges ' + r.total);
});
await check('country facet ignores the country filter but respects the category', async () => {
  const r = await list({ category: 'colleges', country: 'kenya' });
  const c = Object.fromEntries(r.countries.map(x => [x.label, x.count]));
  assert(c['Kenya'] === 7 && c['United States'] === 8, JSON.stringify(c));
});
await check('category facet ignores the category filter but respects the country', async () => {
  const r = await list({ category: 'colleges', country: 'kenya' });
  const c = Object.fromEntries(r.categories.map(x => [x.key, x.count]));
  assert(c.colleges === 7 && c.manufacturing === 1 && c.hospitals === 0, JSON.stringify(c)); // steel is the one Kenyan manufacturer
});
await check('search + category + sort together', async () => {
  const r = await list({ q: 'university 1', category: 'colleges', sort: 'followers' });
  assert(r.items.length > 0 && r.items.every(i => /university/i.test(i.name) && i.name.includes('1')), r.items.map(i => i.name).join());
  assert(r.total === r.items.length, 'total');
  assert(r.items[0].followerCount >= r.items[r.items.length - 1].followerCount, 'followers order');
});
await check('search finds organizations by location and sub-industry', async () => {
  const nairobi = await list({ q: 'nairobi', limit: 24 });
  assert(nairobi.items.length === 8 && nairobi.items.every(i => i.location.city === 'Nairobi'), 'nairobi ' + nairobi.total);
  const sub = await list({ q: 'precision' });
  assert(sub.items.length === 1 && sub.items[0].id === 'gears', 'subindustry');
});
await check('organization type filter and its facet', async () => {
  const r = await list({ organizationType: 'nonprofit' });
  assert(r.total === 1 && r.items[0].id === 'charity', 'nonprofit');
  const t = Object.fromEntries(r.types.map(x => [x.key, x.count]));
  assert(t.business >= 5 && t.college_university === 15 && t.hospital === 1, JSON.stringify(t));
});
await check('activity filter combines with a category (hiring manufacturers)', async () => {
  const r = await list({ category: 'manufacturing', filters: { hiring: true } });
  assert(r.total === 1 && r.items[0].id === 'gears' && r.items[0].openJobs === 1, JSON.stringify(r.items.map(i => i.id)));
});
await check('an unknown category or type is ignored, not an error', async () => {
  const r = await list({ category: 'nope', organizationType: 'nope' });
  assert(r.total === 22 || r.total > 20, 'total ' + r.total);
});

console.log('== profiles ==');
await check('a hospital profile carries its facts, source, parent and claim status', async () => {
  const d = await runAction(db, me, { action: 'detail', companyId: 'mercy' });
  const o = d.organization;
  assert(o.organizationType === 'hospital' && o.category === 'hospitals', 'type');
  assert(o.profile.beds === 320 && o.profile.facilityType === 'Acute Care', JSON.stringify(o.profile));
  assert(o.source.name === 'CMS Care Compare', 'source');
  assert(o.parent && o.parent.id === 'mercy-system', 'parent');
  assert(o.claimStatus === 'unclaimed' && d.claim.available === true, 'claim');
  assert(o.location.city === 'Boston', 'location');
});
await check('a health system lists its member organizations', async () => {
  const d = await runAction(db, me, { action: 'detail', companyId: 'mercy-system' });
  assert(d.organization.childCount === 1 && d.organization.children[0].id === 'mercy', 'children');
});
await check('a claimed organization says so and offers no claim', async () => {
  const d = await runAction(db, me, { action: 'detail', companyId: 'gears' });
  assert(d.organization.claimStatus === 'claimed' && d.claim.available === false, 'claimed');
  assert(d.organization.subindustries.join() === 'Machinery,Precision Parts', 'subindustries');
});
await check('profile keys outside the model are never returned', async () => {
  await org('sneaky', { name: 'Sneaky Co', profile: { beds: 5, adminToken: 'secret', established: 1999 } });
  resetDirectoryCache();
  const d = await runAction(db, me, { action: 'detail', companyId: 'sneaky' });
  assert(!('adminToken' in d.organization.profile) && d.organization.profile.established === 1999, JSON.stringify(d.organization.profile));
});
await check('an old company id still opens (links keep working), and an unknown id is a clean 404', async () => {
  const d = await runAction(db, me, { action: 'detail', companyId: 'legacy-corp' });
  assert(d.organization.name === 'Legacy Corp' && d.organization.organizationType === 'business', 'legacy');
  let status = 0; try { await runAction(db, me, { action: 'detail', companyId: 'does-not-exist' }); } catch (e) { status = e.status; }
  assert(status === 404, 'status ' + status);
});

console.log('== a large directory is served from a snapshot ==');
{
  // 1,600 more records pushes the directory over the snapshot threshold.
  let batch = db.batch(), n = 0;
  for (let i = 0; i < 1600; i++) {
    batch.set(db.collection('companies').doc(`bulk-${String(i).padStart(4, '0')}`), {
      name: `Bulk College ${String(i).padStart(4, '0')}`, organizationType: 'college_university', industry: 'Higher Education', description: 'x', followerCount: 0,
      location: { city: 'Springfield', region: 'IL', country: 'United States' },
    });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
}
resetDirectoryCache();
await check('the first request builds a snapshot, and answers correctly from it', async () => {
  const r = await list({ category: 'colleges' });
  assert(r.total === 1615, 'total ' + r.total);
  const meta = (await db.collection('directory_snapshot').doc('meta').get()).data();
  assert(meta && meta.count >= 1600 && meta.chunks >= 4, JSON.stringify(meta));
});
await check('a later request reads the snapshot and not the whole collection', async () => {
  resetDirectoryCache();
  await db.collection('companies').doc('late-arrival').set({ name: 'Late Arrival University', organizationType: 'college_university', industry: 'Higher Education', followerCount: 0 });
  const r = await list({ category: 'colleges' });
  assert(r.total === 1615, 'a record created after the snapshot is not in it yet: ' + r.total);
});
await check('page items are live: a follower added after the snapshot shows at once', async () => {
  await db.collection('companies').doc('uni-01').update({ followerCount: 999 });
  resetDirectoryCache();
  const r = await list({ category: 'colleges', q: 'University 01' });
  const u = r.items.find(i => i.id === 'uni-01');
  assert(u && u.followerCount === 999, 'live follower count: ' + u?.followerCount);
});
await check('an expired snapshot is rebuilt and picks up new records', async () => {
  resetDirectoryCache();
  const later = Date.now() + 11 * 60_000;
  const r = await list({ category: 'colleges' }, later);
  assert(r.total === 1616, 'total ' + r.total);
});
await check('a held lease keeps other instances on the last good snapshot', async () => {
  resetDirectoryCache();
  await db.collection('directory_snapshot').doc('lease').set({ until: Date.now() + 40 * 60_000 });
  await db.collection('companies').doc('later-still').set({ name: 'Later Still University', organizationType: 'college_university', industry: 'Higher Education', followerCount: 0 });
  const r = await list({ category: 'colleges' }, Date.now() + 25 * 60_000);
  assert(r.total === 1616, 'served the stale snapshot: ' + r.total);
});
await check('a damaged snapshot falls back safely instead of failing', async () => {
  resetDirectoryCache();
  const meta = (await db.collection('directory_snapshot').doc('meta').get()).data();
  await db.collection('directory_snapshot').doc(`c_${meta.gen}_1`).delete();
  await db.collection('directory_snapshot').doc('lease').delete();
  const r = await list({ category: 'colleges' }, meta.builtAtMs + 1000);
  assert(r.total >= 1616, 'total ' + r.total);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
