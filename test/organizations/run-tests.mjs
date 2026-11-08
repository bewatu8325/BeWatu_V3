// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/organizations/run-tests.mjs"
// Guards the organizations directory: the shared model (lib/ and api/ copies agree), categories,
// combinable filters with honest counts, paging without duplicates, the large-directory snapshot,
// and organization profiles.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runAction, resetDirectoryCache, categoryOf as apiCategoryOf, classify as apiClassify, BROAD_CATEGORIES as API_BROAD, normLabel as apiNorm, normalizeType as apiNormalizeType } from '../../api/companies.ts';
import { categoryOf, classify, BROAD_CATEGORIES, DEFAULT_PILLS, normLabel, normalizeType, ORGANIZATION_TYPES, sanitizeProfile, locationText } from '../../lib/organizations.ts';

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
    ['research_institute', 'Life Sciences'], ['business', 'Finance'], ['business', 'Industrial Manufacturing'], ['business', 'Banking'], ['business', 'Health Insurance'], ['nonprofit', 'Finance'], ['hospital', 'Insurance'],
  ];
  for (const [t, i] of inputs) {
    const o = { organizationType: t, industry: i };
    assert(categoryOf(o) === apiCategoryOf(o), `category differs for ${JSON.stringify(o)}: ${categoryOf(o)} vs ${apiCategoryOf(o)}`);
    assert(classify(o).join() === apiClassify(o).join(), `classification differs for ${JSON.stringify(o)}`);
    assert(normalizeType(t) === apiNormalizeType(t), `type differs for ${JSON.stringify(t)}`);
  }
});
await check('the category tables are identical in lib/ and api/ (one classification, two copies)', () => {
  assert(JSON.stringify(BROAD_CATEGORIES) === JSON.stringify(API_BROAD), 'BROAD_CATEGORIES differ');
  for (const v of ['Financial & Services', 'Café  Édition', 'a-b_c', null, 42]) assert(normLabel(v) === apiNorm(v), 'normLabel differs for ' + v);
});
await check('classification is by exact recorded label, never by keyword', () => {
  // the listed subcategories of every category land in that category
  for (const c of BROAD_CATEGORIES) for (const sub of c.subcategories) assert(classify({ industry: sub }).join() === c.key, `${sub} should be ${c.key}: ${classify({ industry: sub })}`);
  // case, punctuation and "&" do not matter
  assert(classify({ industry: 'financial   SERVICES' }).join() === 'finance' && classify({ industry: 'IT Services' }).join() === 'technology', 'normalisation');
  // a word that merely CONTAINS a category word is not classified by it
  for (const trap of ['Healthcare Staffing Agency', 'Bankruptcy Law', 'Software Licensing Litigation', 'Educational Toys', 'Manufacturing Consulting']) assert(classify({ industry: trap }).join() === 'other', `${trap} must not be guessed: ${classify({ industry: trap })}`);
  // subindustries count; types count; nothing recorded is Other
  assert(classify({ industry: 'Conglomerate', subindustries: ['Banking', 'Software'] }).join() === 'finance,technology', 'subindustries');
  assert(classify({ organizationType: 'college_university', industry: '' }).join() === 'education' && classify({ organizationType: 'hospital' }).join() === 'healthcare' && classify({ organizationType: 'health_system' }).join() === 'healthcare', 'types');
  assert(classify({}).join() === 'other' && classify({ industry: 42 }).join() === 'other', 'nothing recorded');
});
await check('the standard shortcuts are Finance, Healthcare, Technology, Education, in that order', () => { assert(DEFAULT_PILLS.join() === 'finance,healthcare,technology,education', DEFAULT_PILLS.join()); });
await check('a record with no organizationType is a business, so existing companies keep working', () => {
  assert(normalizeType(undefined) === 'business' && normalizeType('') === 'business' && normalizeType('weird') === 'business', 'default');
  assert(categoryOf({ industry: 'Finance' }) === 'finance' && categoryOf({ industry: 'Retail' }) === 'other', 'finance business');
  assert(categoryOf({ industry: 'Healthcare' }) === 'medical' && categoryOf({ industry: 'Manufacturing' }) === 'manufacturing', 'industry placement');
});
await check('type decides before industry: a hospital is a hospital, a nonprofit in healthcare is not a medical company', () => {
  assert(categoryOf({ organizationType: 'hospital', industry: 'Manufacturing' }) === 'hospitals', 'hospital');
  assert(categoryOf({ organizationType: 'nonprofit', industry: 'Healthcare' }) === 'other', 'a nonprofit has a general profile (its filter category is still Healthcare)');
  assert(classify({ organizationType: 'nonprofit', industry: 'Healthcare' }).join() === 'healthcare', 'nonprofit in healthcare is filterable as Healthcare');
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
  assert(lc.organizationType === 'business' && lc.category === 'finance', JSON.stringify(lc));
  const doc = (await db.collection('companies').doc('legacy-corp').get()).data();
  assert(!('organizationType' in doc), 'must not rewrite existing records');
});
await check('every category and its count is exact; an organization can be in more than one', async () => {
  const r = await list({});
  const c = Object.fromEntries(r.categories.map(x => [x.key, x.count]));
  assert(c.education === 15 && c.healthcare === 5 && c.manufacturing === 2 && c.finance === 1 && c.other === 0, JSON.stringify(c));
  assert(r.categories.map(x => x.key).join() === 'finance,healthcare,technology,education,manufacturing,other', 'order: ' + r.categories.map(x => x.key));
  assert(Object.values(c).reduce((a, b) => a + b, 0) === r.total, 'no overlaps in this data, so they sum to the total');
});
await check('choosing a category returns exactly its members and the total matches', async () => {
  const r = await list({ category: 'education', limit: 24 });
  assert(r.total === 15 && r.items.length === 15 && r.items.every(i => i.categories.includes('education')), 'education');
  const h = await list({ category: 'healthcare', limit: 24 });
  assert(h.total === 5 && h.items.every(i => i.categories.includes('healthcare')), 'healthcare ' + h.total);
  const m = await list({ category: 'manufacturing' });
  assert(m.items.map(i => i.id).sort().join() === 'gears,steel', m.items.map(i => i.id).join());
});
await check('paging inside a category: 12 then 3, no duplicates', async () => {
  const p1 = await list({ category: 'education', sort: 'alpha' });
  assert(p1.items.length === 12 && p1.nextCursor, 'first page');
  const p2 = await list({ category: 'education', sort: 'alpha', cursor: p1.nextCursor });
  assert(p2.items.length === 3 && p2.nextCursor === null, 'second page');
  const all = [...p1.items, ...p2.items].map(i => i.id);
  assert(new Set(all).size === 15, 'duplicates');
  assert(all.join() === [...all].sort().join(), 'alphabetical across pages');
});

console.log('== filters combine, and counts stay honest ==');
await check('category + country: the count is the intersection', async () => {
  const r = await list({ category: 'education', country: 'kenya' });
  assert(r.total === 7 && r.items.every(i => i.location.country === 'Kenya'), 'kenya colleges ' + r.total);
});
await check('country facet ignores the country filter but respects the category', async () => {
  const r = await list({ category: 'education', country: 'kenya' });
  const c = Object.fromEntries(r.countries.map(x => [x.label, x.count]));
  assert(c['Kenya'] === 7 && c['United States'] === 8, JSON.stringify(c));
});
await check('category facet ignores the category filter but respects the country', async () => {
  const r = await list({ category: 'education', country: 'kenya' });
  const c = Object.fromEntries(r.categories.map(x => [x.key, x.count]));
  assert(c.education === 7 && c.manufacturing === 1 && c.healthcare === 0, JSON.stringify(c)); // steel is the one Kenyan manufacturer
});
await check('search + category + sort together', async () => {
  const r = await list({ q: 'university 1', category: 'education', sort: 'followers' });
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

await check('several categories mean OR: in any of them', async () => {
  const r = await list({ category: 'healthcare,finance', limit: 24 });
  assert(r.total === 6 && r.items.every(i => i.categories.includes('healthcare') || i.categories.includes('finance')), 'healthcare or finance ' + r.total);
  assert(r.items.some(i => i.id === 'legacy-corp') && r.items.some(i => i.id === 'mercy'), 'both groups present');
  const withJunk = await list({ category: ' healthcare , bogus,,healthcare', limit: 24 });
  assert(withJunk.total === 5, 'unknown keys and repeats are ignored: ' + withJunk.total);
  const none = await list({ category: 'bogus' });
  assert(none.total > 20, 'only-unknown means no category filter: ' + none.total);
});
await check('OR across categories, AND with the other filters', async () => {
  const r = await list({ category: 'healthcare,education', country: 'kenya', limit: 24 });
  assert(r.items.length === r.total && r.items.every(i => i.location.country === 'Kenya' && (i.categories.includes('education') || i.categories.includes('healthcare'))), 'kenya within either');
  assert(r.total === 7, 'total ' + r.total);
  const h = await list({ category: 'healthcare,finance', filters: { hiring: true } });
  assert(h.total === 0, 'nobody in either is hiring: ' + h.total);
});
await check('with several categories chosen the category facet still shows every category (it ignores its own filter)', async () => {
  const r = await list({ category: 'healthcare,finance' });
  const c = Object.fromEntries(r.categories.map(x => [x.key, x.count]));
  assert(c.education === 15 && c.manufacturing === 2 && c.healthcare === 5 && c.finance === 1, JSON.stringify(c));
});
await check('an organization with several recorded subindustries is counted in each category once', async () => {
  await org('multi', { name: 'Multi Group', industry: 'Conglomerate', subindustries: ['Banking', 'Software'] });
  resetDirectoryCache();
  const r = await list({});
  const c = Object.fromEntries(r.categories.map(x => [x.key, x.count]));
  assert(c.finance === 2 && c.technology === 1, JSON.stringify(c));
  const both = await list({ category: 'finance,technology', limit: 24 });
  assert(both.items.filter(i => i.id === 'multi').length === 1 && both.total === 2, 'listed once: ' + both.total);
  await db.collection('companies').doc('multi').delete(); resetDirectoryCache();
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

console.log('== saved defaults and suggested shortcuts ==');
const me2 = { uid: 'prefs-user', email: 'p@example.org', emailVerified: true };
await db.doc('users/prefs-user').set({ name: 'P' });
const run2 = (body) => runAction(db, me2, body);
await check('a new member has no saved defaults and is offered no personalised shortcuts (the page shows the standard four)', async () => {
  assert((await run2({ action: 'prefs' })).categories.length === 0, 'prefs');
  const r = await run2({ action: 'list' });
  assert(r.meta.saved.length === 0 && r.meta.suggested.length === 0, JSON.stringify([r.meta.saved, r.meta.suggested]));
  assert(r.total > 20, 'and everything is listed');
});
await check('saving defaults stores only valid categories, in canonical order, and returns them', async () => {
  const r = await run2({ action: 'setPrefs', categories: ['healthcare', 'bogus', 'finance', 'healthcare'] });
  assert(r.categories.join() === 'finance,healthcare', r.categories.join());
  assert((await run2({ action: 'prefs' })).categories.join() === 'finance,healthcare', 'reads back');
  assert((await db.doc('users/prefs-user').get()).data().orgInterests.join() === 'finance,healthcare', 'stored on the member record');
});
await check('saved defaults are what the shortcuts lead with, and listing does not apply or change them', async () => {
  const r = await run2({ action: 'list' });
  assert(r.meta.saved.join() === 'finance,healthcare' && r.meta.suggested.join() === 'finance,healthcare,technology,education', JSON.stringify([r.meta.saved, r.meta.suggested]));
  assert(r.total > 20, 'the server never narrows the list by itself; the page sends the categories it wants');
  await run2({ action: 'list', category: 'education' });
  assert((await run2({ action: 'prefs' })).categories.join() === 'finance,healthcare', 'a temporary filter did not touch the saved defaults');
});
await check('followed organizations shape the shortcuts only when nothing is saved, and never write anything', async () => {
  await run2({ action: 'setPrefs', categories: [] });
  await db.doc('users/prefs-user').set({ followingCompanies: ['gears', 'steel', 'uni-01'] }, { merge: true });
  const r = await run2({ action: 'list' });
  assert(r.meta.suggested[0] === 'manufacturing' && r.meta.suggested.includes('education'), JSON.stringify(r.meta.suggested));
  assert(r.meta.suggested.length === 4 && !r.meta.suggested.includes('other'), 'four, never "other"');
  assert((await run2({ action: 'prefs' })).categories.length === 0, 'inferred interests were not saved');
});
await check('saving an empty list clears the defaults; bad input is refused', async () => {
  assert((await run2({ action: 'setPrefs', categories: [] })).categories.length === 0, 'cleared');
  for (const bad of ['finance', null, [1], new Array(13).fill('finance')]) {
    let status = 0; try { await run2({ action: 'setPrefs', categories: bad }); } catch (e) { status = e.status; }
    assert(status === 400, 'refused ' + JSON.stringify(bad));
  }
  let st = 0; try { await runAction(db, { uid: 'ghost', email: 'g@example.org', emailVerified: true }, { action: 'setPrefs', categories: ['finance'] }); } catch (e) { st = e.status; }
  assert(st === 404 && !(await db.doc('users/ghost').get()).exists, 'no record is created for a missing account');
});
await check('one member cannot read or change another member\'s defaults', async () => {
  await run2({ action: 'setPrefs', categories: ['education'] });
  const other = { uid: 'someone-else', email: 's@example.org', emailVerified: true };
  await db.doc('users/someone-else').set({ name: 'S' });
  assert((await runAction(db, other, { action: 'prefs' })).categories.length === 0, 'saw another member\'s defaults');
  await runAction(db, other, { action: 'setPrefs', categories: ['finance'] });
  assert((await run2({ action: 'prefs' })).categories.join() === 'education', 'changed another member\'s defaults');
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
  const r = await list({ category: 'education' });
  assert(r.total === 1615, 'total ' + r.total);
  const meta = (await db.collection('directory_snapshot').doc('meta').get()).data();
  assert(meta && meta.count >= 1600 && meta.chunks >= 4, JSON.stringify(meta));
});
await check('a later request reads the snapshot and not the whole collection', async () => {
  resetDirectoryCache();
  await db.collection('companies').doc('late-arrival').set({ name: 'Late Arrival University', organizationType: 'college_university', industry: 'Higher Education', followerCount: 0 });
  const r = await list({ category: 'education' });
  assert(r.total === 1615, 'a record created after the snapshot is not in it yet: ' + r.total);
});
await check('page items are live: a follower added after the snapshot shows at once', async () => {
  await db.collection('companies').doc('uni-01').update({ followerCount: 999 });
  resetDirectoryCache();
  const r = await list({ category: 'education', q: 'University 01' });
  const u = r.items.find(i => i.id === 'uni-01');
  assert(u && u.followerCount === 999, 'live follower count: ' + u?.followerCount);
});
await check('an expired snapshot is rebuilt and picks up new records', async () => {
  resetDirectoryCache();
  const later = Date.now() + 11 * 60_000;
  const r = await list({ category: 'education' }, later);
  assert(r.total === 1616, 'total ' + r.total);
});
await check('a held lease keeps other instances on the last good snapshot', async () => {
  resetDirectoryCache();
  await db.collection('directory_snapshot').doc('lease').set({ until: Date.now() + 40 * 60_000 });
  await db.collection('companies').doc('later-still').set({ name: 'Later Still University', organizationType: 'college_university', industry: 'Higher Education', followerCount: 0 });
  const r = await list({ category: 'education' }, Date.now() + 25 * 60_000);
  assert(r.total === 1616, 'served the stale snapshot: ' + r.total);
});
await check('a damaged snapshot falls back safely instead of failing', async () => {
  resetDirectoryCache();
  const meta = (await db.collection('directory_snapshot').doc('meta').get()).data();
  await db.collection('directory_snapshot').doc(`c_${meta.gen}_1`).delete();
  await db.collection('directory_snapshot').doc('lease').delete();
  const r = await list({ category: 'education' }, meta.builtAtMs + 1000);
  assert(r.total >= 1616, 'total ' + r.total);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
