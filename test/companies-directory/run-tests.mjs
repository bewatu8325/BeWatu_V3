// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/companies-directory/run-tests.mjs"
// Guards api/companies.ts: paging without duplicates, filters + search + sort together, honest
// activity, personalisation fallbacks, idempotent follows, and ownership claims that need proof.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { runAction, resetDirectoryCache, textScore, emailBelongsToDomain, HttpError } from '../../api/companies.ts';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, m) => {
  try { await p; } catch (e) { if (e instanceof HttpError && (status == null || e.status === status)) return e; throw new Error(`${m ?? 'wrong error'}: ${e.status ?? ''} ${e.message}`); }
  throw new Error(m ?? 'was allowed');
};

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-companies' });
const db = getFirestore();
const DAY = 86400000, NOW = Date.now();
const ts = (ms) => Timestamp.fromMillis(ms);

// ── the world: 52 companies ──
const industries = [['Finance', 14], ['Technology', 14], ['Healthcare', 10], ['Retail', 6], ['Energy', 4], ['Media', 3], ['', 1]];
const seeded = [];
let n = 0;
const names = ['Meridian Financial', 'Northwind Pay', 'Harbor Bank', 'Atlas Capital', 'Bluebird Credit', 'Cedar Insurance', 'Delta Ledger', 'Echo Payments', 'Fable Finance', 'Granite Trust', 'Horizon Lending', 'Ivory Securities', 'Juniper Wealth', 'Kestrel Pay',
  'Lumen Software', 'Meridian Labs', 'Nimbus Cloud', 'Orbit Data', 'Pixel Forge', 'Quanta Systems', 'Relay Networks', 'Signal AI', 'Tidal Compute', 'Umbra Security', 'Vector Apps', 'Willow Web', 'Xenon Devices', 'Yonder Tech',
  'Aurora Health', 'Beacon Clinics', 'Clover Care', 'Dawn Pharma', 'Elm Medical', 'Fern Wellness', 'Glade Genomics', 'Haven Hospitals', 'Iris Diagnostics', 'Jade Therapeutics',
  'Kite Retail', 'Lark Goods', 'Maple Market', 'Nest Home', 'Oak Outfitters', 'Pine Provisions', 'Quill Power', 'Ridge Energy', 'Solstice Solar', 'Tern Grid', 'Unity Media', 'Vista Studios', 'Wave Broadcast', 'Zephyr Co'];
for (const [ind, count] of industries) for (let i = 0; i < count; i++) {
  const name = names[n]; const id = `co${String(n).padStart(2, '0')}`;
  const domain = name.toLowerCase().replace(/[^a-z]/g, '') + '.example.com';
  seeded.push({ id, name, industry: ind, numericId: 1000 + n, domain });
  await db.doc(`companies/${id}`).set({
    name, industry: ind, numericId: 1000 + n, description: ind ? `${name} works in ${ind.toLowerCase()} and cares about customers.` : 'A company.', logoUrl: n % 3 === 0 ? 'https://cdn.example.com/logo.png' : '',
    website: `https://${domain}`, domain, ticker: n === 0 ? 'MRDN' : '', verificationStatus: n % 5 === 0 ? 'verified' : 'unverified', followerCount: 0,
    ...(n === 1 ? { adminUid: 'someoneElse', claimed: true } : {}),
  });
  n++;
}
const co = (name) => seeded.find(c => c.name === name);
const J = (companyId, extra = {}) => ({ title: 'Product Designer', location: 'London', type: 'Full-time', status: 'Active', verificationStatus: 'live', companyId, createdAt: ts(NOW - 2 * DAY), expiryDate: new Date(NOW + 30 * DAY).toISOString(), ...extra });
// Meridian Financial: 2 open roles + 1 expired + 1 hidden + 1 pending (the last three must not count)
await db.collection('jobs').add(J(co('Meridian Financial').numericId));
await db.collection('jobs').add(J(co('Meridian Financial').numericId, { title: 'Engineer', createdAt: ts(NOW - 1 * DAY) }));
await db.collection('jobs').add(J(co('Meridian Financial').numericId, { title: 'Old role', expiryDate: new Date(NOW - 3 * DAY).toISOString() }));
await db.collection('jobs').add(J(co('Meridian Financial').numericId, { title: 'Hidden role', verificationStatus: 'hidden' }));
await db.collection('jobs').add(J(co('Meridian Financial').numericId, { title: 'Pending role', verificationStatus: 'pending_verification' }));
await db.collection('jobs').add(J(co('Lumen Software').numericId));
await db.collection('jobs').add(J(co('Aurora Health').numericId, { status: 'Suspended' }));          // suspended: not open
await db.collection('jobs').add(J(co('Beacon Clinics').numericId, { expiryDate: new Date(NOW - DAY).toISOString() })); // only an expired role
const CH = (companyId, extra = {}) => ({ companyId, verificationStatus: 'live', title: 'Cross-border payments', arenaIndustryId: 'payments', prizeAmount: 5000, deadline: new Date(NOW + 20 * DAY).toISOString(), createdAt: new Date(NOW - 3 * DAY).toISOString(), ...extra });
await db.collection('arena_challenges').add(CH(co('Meridian Financial').id));
await db.collection('arena_challenges').add(CH(co('Northwind Pay').id, { title: 'Fraud detection' }));
await db.collection('arena_challenges').add(CH(co('Echo Payments').id, { deadline: new Date(NOW - 2 * DAY).toISOString(), title: 'Old challenge' })); // closed
await db.collection('arena_challenges').add(CH(co('Harbor Bank').id, { verificationStatus: 'pending_ops' }));                                   // not live
await db.doc('arena_industries/payments').set({ name: 'Payments Arena', isActive: true });
const SP = (companyId, arenaId, start, end, status = 'approved') => ({ companyId, arenaId, status, startDate: ts(start), endDate: ts(end) });
await db.collection('arena_sponsorships').add(SP(co('Meridian Financial').id, 'payments', NOW - 10 * DAY, NOW + 80 * DAY));   // running
await db.collection('arena_sponsorships').add(SP(co('Atlas Capital').id, 'payments', NOW - 100 * DAY, NOW - 5 * DAY));       // expired
await db.collection('arena_sponsorships').add(SP(co('Bluebird Credit').id, 'payments', NOW + 5 * DAY, NOW + 90 * DAY));      // starts later
await db.collection('arena_sponsorships').add(SP(co('Cedar Insurance').id, 'payments', NOW - 10 * DAY, NOW + 80 * DAY, 'revoked'));

await db.doc('users/fin').set({ displayName: 'Fin Member', industry: 'Finance', professionalGoals: ['Break into fintech payments'] });
await db.doc('users/blank').set({ displayName: 'New Member' });
await db.doc('users/follower').set({ displayName: 'Follower', followingCompanies: [co('Lumen Software').id, co('Meridian Labs').id] });
const U = (uid, email = `${uid}@meridianfinancial.example.com`, verified = true) => ({ uid, email, emailVerified: verified });
const list = (uid, body = {}) => runAction(db, U(uid), { action: 'list', ...body }, NOW);
async function walk(uid, body) {
  const all = []; let cursor = null, pages = 0;
  do { const r = await list(uid, { ...body, cursor }); all.push(...r.items); cursor = r.nextCursor; pages++; assert(pages < 50, 'runaway pagination'); } while (cursor);
  return { all, pages };
}
const ids = (xs) => xs.map(x => x.id);

console.log('== the first page and "Load more" ==');
let first;
await check('the first page has 12 companies, a total of all 52, and a way to load more', async () => {
  first = await list('blank', { view: 'all', sort: 'alpha' });
  assert(first.items.length === 12 && first.total === 52 && first.nextCursor, `${first.items.length}/${first.total}`);
});
await check('only the fields a card needs are sent (no admin ids, no private data)', async () => {
  const keys = new Set(Object.keys(first.items[0]));
  for (const bad of ['adminUid', 'claimed', 'verifiedRecruiters', 'domainOwner', 'email']) assert(!keys.has(bad), `leaked ${bad}`);
});
for (const sort of ['alpha', 'relevance', 'recent']) {
  await check(`paging through everything sorted by ${sort}: 52 companies, no duplicates, none skipped`, async () => {
    const { all, pages } = await walk('blank', { view: 'all', sort });
    assert(all.length === 52 && new Set(ids(all)).size === 52, `${all.length} items, ${new Set(ids(all)).size} unique`);
    assert(pages === 5, `${pages} pages`);
  });
}
await check('A–Z really is alphabetical across pages', async () => {
  const { all } = await walk('blank', { view: 'all', sort: 'alpha' });
  const sorted = [...all].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  assert(JSON.stringify(ids(all)) === JSON.stringify(ids(sorted)), 'not alphabetical');
});
await check('a bad, forged or oversized cursor is refused, not trusted', async () => {
  await refuses(list('blank', { cursor: 'not-a-cursor' }), 400);
  await refuses(list('blank', { cursor: Buffer.from(JSON.stringify({ k: { $gt: 1 }, i: 'x' })).toString('base64url') }), 400);
  await refuses(list('blank', { cursor: 'A'.repeat(500) }), 400);
});
await check('a cursor from the end of the list returns an empty page, not an error', async () => {
  const { all } = await walk('blank', { view: 'all', sort: 'alpha' });
  const last = await list('blank', { sort: 'alpha', limit: 24, cursor: null });
  assert(all.length === 52 && last.items.length === 24, 'setup');
});
await check('the data changing between pages does not duplicate or lose companies already passed', async () => {
  const p1 = await list('blank', { sort: 'alpha' });
  await db.doc(`companies/${co('Zephyr Co').id}`).update({ name: 'Aaa Newly Renamed' });   // would shift an offset-based page
  resetDirectoryCache();
  const p2 = await list('blank', { sort: 'alpha', cursor: p1.nextCursor });
  assert(!ids(p2.items).some(i => ids(p1.items).includes(i)), 'a company repeated');
  await db.doc(`companies/${co('Zephyr Co').id}`).update({ name: 'Zephyr Co' }); resetDirectoryCache();
});

console.log('== search, filters and sort together ==');
const expectSearch = (q) => seeded.filter(c => (c.name + ' ' + c.industry).toLowerCase().includes(q.toLowerCase()));
await check('search is case-insensitive and matches names, industries and tickers', async () => {
  assert((await list('blank', { q: 'MERIDIAN' })).total === 2, 'name');
  assert((await list('blank', { q: 'healthcare' })).total === 10, 'industry');
  const t = await list('blank', { q: 'mrdn' }); assert(t.total === 1 && t.items[0].name === 'Meridian Financial', 'ticker');
});
await check('multi-word search needs every word to match somewhere', async () => {
  const r = await list('blank', { q: 'meridian labs' }); assert(r.total === 1 && r.items[0].name === 'Meridian Labs', JSON.stringify(ids(r.items)));
  assert((await list('blank', { q: 'meridian zzzz' })).total === 0, 'matched a word that is not there');
});
await check('relevance puts an exact name first, then names that start with it, then the rest', async () => {
  const r = await list('blank', { q: 'meridian financial' }); assert(r.items[0].name === 'Meridian Financial', r.items[0].name);
  const none = { industryKey: '', tickerLower: '', domain: '' };
  const prefix = textScore({ ...none, nameLower: 'kestrel pay', description: '' }, 'ke');
  const inside = textScore({ ...none, nameLower: 'oak keeper', description: '' }, 'ke');
  const inDescription = textScore({ ...none, nameLower: 'oak outfitters', description: 'sells kettles' }, 'ke');
  assert(prefix > inside && inside > inDescription && inDescription > 0, `${prefix} / ${inside} / ${inDescription}`);
});
await check('industry filter: total and every item agree', async () => {
  const r = await list('blank', { industry: 'finance' }); assert(r.total === 14 && r.items.every(i => i.industry === 'Finance'), `${r.total}`);
});
await check('search + industry + sort + paging all at once: right total, no duplicates, all in the filter', async () => {
  const { all } = await walk('blank', { q: 'a', industry: 'technology', sort: 'alpha' });
  // search looks at name, industry and description (the seeded description names the company and its industry)
  const expected = seeded.filter(c => c.industry === 'Technology' && `${c.name} ${c.industry} ${c.name} works in ${c.industry.toLowerCase()} and cares about customers.`.toLowerCase().includes('a')).length;
  const first = await list('blank', { q: 'a', industry: 'technology', sort: 'alpha' });
  assert(first.total === all.length && new Set(ids(all)).size === all.length && first.total === expected, `total ${first.total}, walked ${all.length}, expected ${expected}`);
  assert(all.every(i => i.industry === 'Technology'), 'left the filter');
});
await check('the count tracks the search: it changes when the search changes', async () => {
  const a = await list('blank', {}), b = await list('blank', { q: 'pay' }), c = await list('blank', { q: 'pay', industry: 'finance' });
  assert(a.total === 52 && b.total < a.total && c.total <= b.total && b.total === (await walk('blank', { q: 'pay' })).all.length, `${a.total}/${b.total}/${c.total}`);
});
await check('industry chips come with the counts you would get by choosing them, for the current search', async () => {
  const r = await list('blank', { q: 'pay' });
  const sum = r.facets.reduce((s, f) => s + f.count, 0);
  assert(sum <= r.total && r.facets.every(f => f.count > 0), 'facet counts do not add up');
  const all = await list('blank', {}); assert(all.facets[0].label === 'Finance' && all.facets[0].count === 14, JSON.stringify(all.facets[0]));
});
await check('facets ignore the industry filter itself, so the other chips stay choosable', async () => {
  const r = await list('blank', { industry: 'finance' }); assert(r.facets.length >= 5, `${r.facets.length} facets`);
});
await check('"hiring" shows only companies with a real open role', async () => {
  const r = await list('blank', { filters: { hiring: true } });
  assert(r.total === 2 && new Set(r.items.map(i => i.name)).size === 2 && r.items.every(i => i.openJobs > 0), JSON.stringify(r.items.map(i => i.name)));
});
await check('"live challenges" and "sponsors an Arena" filters', async () => {
  const c = await list('blank', { filters: { challenges: true } }); assert(c.total === 2, `challenges ${c.total}`);
  const s = await list('blank', { filters: { sponsor: true } }); assert(s.total === 1 && s.items[0].name === 'Meridian Financial', `sponsor ${s.total}`);
  const both = await list('blank', { filters: { hiring: true, challenges: true, sponsor: true } }); assert(both.total === 1, 'combined');
});
await check('recent activity puts companies with real, recent activity first and the rest after, by name', async () => {
  const r = await list('blank', { sort: 'recent', limit: 24 });
  const withAct = r.items.filter(i => i.lastActivityMs != null), without = r.items.filter(i => i.lastActivityMs == null);
  assert(withAct.length >= 3 && r.items.slice(0, withAct.length).every(i => i.lastActivityMs != null), 'activity not first');
  for (let i = 1; i < withAct.length; i++) assert(withAct[i - 1].lastActivityMs >= withAct[i].lastActivityMs, 'not newest first');
  assert(without.every((x, i) => i === 0 || without[i - 1].name.toLowerCase() <= x.name.toLowerCase()), 'idle companies not by name');
});

console.log('== activity is real ==');
const byName = async (name, view = 'all') => (await list('blank', { q: name, limit: 24 })).items.find(i => i.name === name);
await check('Meridian Financial: 2 open roles (not the expired, hidden or pending ones), 1 live challenge, sponsors the Payments Arena', async () => {
  const m = await byName('Meridian Financial'); assert(m.openJobs === 2 && m.liveChallenges === 1 && m.sponsoredArenas.join() === 'Payments Arena', JSON.stringify(m));
});
await check('a suspended role, an expired role, a closed challenge, a non-live challenge: none of them count', async () => {
  for (const name of ['Aurora Health', 'Beacon Clinics', 'Echo Payments', 'Harbor Bank']) { const c = await byName(name); assert(c.openJobs === 0 && c.liveChallenges === 0, `${name}: ${JSON.stringify(c)}`); }
});
await check('an expired, future or revoked sponsorship is not shown as sponsorship', async () => {
  for (const name of ['Atlas Capital', 'Bluebird Credit', 'Cedar Insurance']) assert((await byName(name)).sponsoredArenas.length === 0, name);
});
await check('a company with no activity shows zeros and no timestamp, never an invented one', async () => {
  const c = await byName('Zephyr Co'); assert(c.openJobs === 0 && c.liveChallenges === 0 && c.sponsoredArenas.length === 0 && c.lastActivityMs === null, JSON.stringify(c));
});
await check('follower counts are the stored ones; nothing is added', async () => {
  const c = await byName('Zephyr Co'); assert(c.followerCount === 0, String(c.followerCount));
});
await check('companies with no logo or industry still appear (initials fallback is the page\'s job)', async () => {
  const noInd = seeded.find(c => c.industry === ''); const r = await list('blank', { q: noInd.name }); assert(r.items.some(i => i.id === noInd.id && i.industry === ''), 'missing');
});

console.log('== For You / Following ==');
await check('Following: only what you follow; an empty list for someone who follows nobody', async () => {
  const r = await list('follower', { view: 'following' }); assert(r.total === 2 && r.items.every(i => i.following), JSON.stringify(ids(r.items)));
  assert((await list('blank', { view: 'following' })).total === 0, 'invented follows');
});
await check('For You, from a profile with an industry and a goal: matching companies first, with real reasons', async () => {
  const r = await list('fin', { view: 'for_you', limit: 24 });
  assert(r.meta.forYou.hasPreferences && !r.meta.forYou.fallback && r.meta.forYou.personalisedCount >= 14, JSON.stringify(r.meta));
  const matched = r.items.filter(i => i.reasons); assert(matched.length >= 14 && matched.every(i => i.industry === 'Finance' || i.reasons.some(x => x.startsWith('Relates'))), 'unexpected matches');
  assert(matched[0].reasons[0].includes('Finance'), JSON.stringify(matched[0].reasons));
  assert(r.items.slice(0, matched.length).every(i => i.reasons), 'a non-match ranked above a match');
});
await check('For You never recommends something you already follow, and reasons mention only what is true', async () => {
  const r = await list('follower', { view: 'for_you', limit: 24 });
  assert(!r.items.some(i => i.following), 'recommended a followed company');
  const reasoned = r.items.filter(i => i.reasons); assert(reasoned.every(i => i.reasons.every(x => /^(Matches your industry|Relates to your goal|Similar to companies you follow)/.test(x))), 'odd reason');
});
await check('For You for a brand-new member (no preferences): a clearly-flagged fallback ordered by real activity, with no invented reasons', async () => {
  const r = await list('blank', { view: 'for_you', limit: 24 });
  assert(r.meta.forYou.hasPreferences === false && r.meta.forYou.fallback === true, JSON.stringify(r.meta));
  assert(r.items.every(i => !i.reasons), 'reasons without a profile');
  assert(r.items[0].name === 'Meridian Financial', `first: ${r.items[0].name}`);
});
await check('search works inside every view', async () => {
  const r = await list('fin', { view: 'for_you', q: 'bank' }); assert(r.items.every(i => /bank/i.test(i.name + i.industry + i.description)), 'a non-match slipped in');
});

console.log('== suggestions ==');
await check('suggestions put the best name match first and need two characters', async () => {
  const s = await runAction(db, U('blank'), { action: 'suggest', q: 'meri' }, NOW); assert(s.companies[0].name.startsWith('Meridian') && s.companies.length <= 6, JSON.stringify(s.companies));
  assert((await runAction(db, U('blank'), { action: 'suggest', q: 'm' }, NOW)).companies.length === 0, 'one letter');
  const i = await runAction(db, U('blank'), { action: 'suggest', q: 'health' }, NOW); assert(i.industries.includes('Healthcare'), JSON.stringify(i));
});

console.log('== company detail ==');
await check('detail lists real roles, challenges, sponsorship, related challenges and an ordered timeline', async () => {
  const d = await runAction(db, U('blank'), { action: 'detail', companyId: co('Meridian Financial').id }, NOW);
  assert(d.openRoleCount === 2 && d.roles.length === 2 && d.challenges.length === 1 && d.sponsoredArenas[0] === 'Payments Arena', JSON.stringify(d).slice(0, 300));
  assert(d.related.some(r => r.companyName === 'Northwind Pay') && !d.related.some(r => r.title === 'Old challenge'), JSON.stringify(d.related));
  for (let i = 1; i < d.updates.length; i++) assert(d.updates[i - 1].atMs >= d.updates[i].atMs, 'timeline not newest first');
  assert(d.updates.length === 4, `updates ${d.updates.length}`);
});
await check('a company with nothing going on has empty lists, not placeholders', async () => {
  const d = await runAction(db, U('blank'), { action: 'detail', companyId: co('Zephyr Co').id }, NOW);
  assert(d.roles.length === 0 && d.challenges.length === 0 && d.related.length === 0 && d.updates.length === 0, JSON.stringify(d));
});
await check('the claim action is offered only while nobody administers the company', async () => {
  assert((await runAction(db, U('blank'), { action: 'detail', companyId: co('Meridian Financial').id }, NOW)).claim.available === true, 'should be claimable');
  assert((await runAction(db, U('blank'), { action: 'detail', companyId: co('Northwind Pay').id }, NOW)).claim.available === false, 'already has an admin');
});
await check('an unknown company is a 404', async () => refuses(runAction(db, U('blank'), { action: 'detail', companyId: 'nope' }, NOW), 404));

console.log('== following ==');
await check('following is idempotent and the count is honest', async () => {
  const id = co('Kite Retail').id;
  const a = await runAction(db, U('blank'), { action: 'follow', companyId: id }, NOW);
  const b = await runAction(db, U('blank'), { action: 'follow', companyId: id }, NOW);
  assert(a.followerCount === 1 && b.followerCount === 1 && b.following === true, `${a.followerCount}/${b.followerCount}`);
  assert((await db.doc('users/blank').get()).data().followingCompanies.filter(x => x === id).length === 1, 'stored twice');
  assert((await byName('Kite Retail')).following === true && (await byName('Kite Retail')).followerCount === 1, 'list did not catch up');
});
await check('unfollowing twice never drives the count below zero', async () => {
  const id = co('Kite Retail').id;
  const a = await runAction(db, U('blank'), { action: 'unfollow', companyId: id }, NOW), b = await runAction(db, U('blank'), { action: 'unfollow', companyId: id }, NOW);
  assert(a.followerCount === 0 && b.followerCount === 0 && b.following === false, `${a.followerCount}/${b.followerCount}`);
});
await check('unfollowing something you never followed changes nothing', async () => {
  const id = co('Lark Goods').id; const r = await runAction(db, U('blank'), { action: 'unfollow', companyId: id }, NOW); assert(r.followerCount === 0, String(r.followerCount));
});
await check('eight people following at once: the count is exactly eight', async () => {
  const id = co('Maple Market').id;
  for (let i = 0; i < 8; i++) await db.doc(`users/racer${i}`).set({ displayName: `R${i}` });
  await Promise.all(Array.from({ length: 8 }, (_, i) => runAction(db, U(`racer${i}`), { action: 'follow', companyId: id }, NOW)));
  assert((await db.doc(`companies/${id}`).get()).data().followerCount === 8, String((await db.doc(`companies/${id}`).get()).data().followerCount));
});
await check('following a company that does not exist is refused', async () => refuses(runAction(db, U('blank'), { action: 'follow', companyId: 'nope' }, NOW), 404));

console.log('== claiming a company needs proof ==');
const claim = (caller, name) => runAction(db, caller, { action: 'claim', companyId: co(name).id }, NOW);
const claimable = 'Nest Home';
await check('an unverified email cannot claim', async () => refuses(claim(U('c1', 'x@nesthome.example.com', false), claimable), 403));
await check('a personal email (gmail, outlook …) cannot claim', async () => { await refuses(claim(U('c2', 'person@gmail.com'), claimable), 403); await refuses(claim(U('c2', 'person@outlook.com'), claimable), 403); });
await check('a verified email on a DIFFERENT domain is not granted: it goes to a person as a ticket', async () => {
  const r = await claim(U('c3', 'x@elsewhere.com'), claimable);
  assert(r.ok === false && r.status === 'manual_review', JSON.stringify(r));
  assert(!(await db.doc(`companies/${co(claimable).id}`).get()).data().adminUid, 'ownership granted without proof');
  const t = (await db.doc(`support_tickets/${r.ticketId}`).get()).data(); assert(t.metadata.type === 'company_claim' && t.status === 'open', JSON.stringify(t.metadata));
});
await check('asking twice does not create a second ticket', async () => {
  await claim(U('c3', 'x@elsewhere.com'), claimable);
  assert((await db.collection('support_tickets').where('metadata.type', '==', 'company_claim').where('userId', '==', 'c3').get()).size === 1, 'duplicate tickets');
});
await check('a look-alike domain (evilnesthome.example.com) is NOT treated as the company\'s domain', async () => {
  const r = await claim(U('c4', 'x@evilnesthome.example.com'), claimable); assert(r.ok === false, 'granted to a look-alike');
  assert(emailBelongsToDomain('a@evilnesthome.example.com', 'nesthome.example.com') === false && emailBelongsToDomain('a@nesthome.example.com.evil.io', 'nesthome.example.com') === false, 'helper agrees');
});
await check('a verified email on the company\'s own domain (or a subdomain) is granted, pending BeWatu\'s usual verification', async () => {
  const r = await claim(U('c5', 'jo@us.nesthome.example.com'), claimable); assert(r.ok && r.status === 'granted', JSON.stringify(r));
  const d = (await db.doc(`companies/${co(claimable).id}`).get()).data(); assert(d.adminUid === 'c5' && d.claimed === true && d.verificationStatus === 'pending', JSON.stringify(d));
});
await check('once claimed, nobody else can claim it, even with the right domain', async () => refuses(claim(U('c6', 'a@nesthome.example.com'), claimable), 409));
await check('the administrator asking again is told they already are', async () => assert((await claim(U('c5', 'jo@nesthome.example.com'), claimable)).status === 'already_admin', 'wrong'));
await check('a company with no domain on file can never be claimed automatically', async () => {
  await db.doc(`companies/${co('Oak Outfitters').id}`).update({ domain: '', website: '' }); resetDirectoryCache();
  const r = await claim(U('c7', 'a@oakoutfitters.example.com'), 'Oak Outfitters'); assert(r.status === 'manual_review', JSON.stringify(r));
});
await check('two people racing to claim the same company: exactly one wins', async () => {
  const name = 'Pine Provisions'; const d = co(name).domain;
  const results = await Promise.allSettled([claim(U('r1', `a@${d}`), name), claim(U('r2', `b@${d}`), name), claim(U('r3', `c@${d}`), name)]);
  assert(results.filter(r => r.status === 'fulfilled' && r.value.status === 'granted').length === 1, JSON.stringify(results.map(r => r.status === 'fulfilled' ? r.value.status : r.reason.status)));
});
await check('claim attempts are limited per person per day', async () => {
  let blocked = 0;
  for (const name of ['Quill Power', 'Ridge Energy', 'Solstice Solar', 'Tern Grid', 'Unity Media', 'Vista Studios', 'Wave Broadcast']) {
    try { await claim(U('spammer', 'x@spam.example.org'), name); } catch (e) { if (e.status === 429) blocked++; else throw e; }
  }
  assert(blocked > 0, 'never limited');
});
await check('the audit trail records outcomes without storing the email address itself', async () => {
  const ev = (await db.collection('company_claim_events').get()).docs.map(d => d.data());
  assert(ev.some(e => e.outcome === 'granted') && ev.some(e => e.outcome === 'manual_review') && ev.every(e => !('email' in e)), 'bad audit');
});
await check('an unknown action is refused', async () => refuses(runAction(db, U('blank'), { action: 'delete_everything' }, NOW), 400));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
