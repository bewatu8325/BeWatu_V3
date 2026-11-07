// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/arena-sponsorship/run-tests.mjs"
// Guards api/arena-sponsorship.ts: who may ask, who may approve, no overlapping exclusives,
// validated branding, and "active" being derived from status + dates (lib/arenaSponsorship.ts).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { runAction, HttpError } from '../../api/arena-sponsorship.ts';
import { toSponsorshipRecord, activeSponsorship, sponsorshipPhase } from '../../lib/arenaSponsorship.ts';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, m) => {
  try { await p; } catch (e) { if (e instanceof HttpError && (status == null || e.status === status)) return; throw new Error(`${m ?? 'wrong error'}: ${e.status ?? ''} ${e.message}`); }
  throw new Error(m ?? 'was allowed');
};

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-arena-sponsorship' });
const db = getFirestore();

const DAY = 86400000, NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();

// ── images ──
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const JPEG = 'data:image/jpeg;base64,' + jpegBytes.toString('base64');
const webpBytes = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(100, 2)]);
const WEBP = 'data:image/webp;base64,' + webpBytes.toString('base64');
const BIG_PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120 * 1024, 7)]).toString('base64');
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
const LIAR = 'data:image/png;base64,' + jpegBytes.toString('base64'); // says PNG, is JPEG

const branding = (over = {}) => ({ primaryColor: '#1a4a3a', tagline: 'Building the rails of global commerce', description: 'We move money.', website: 'https://meridian.example.com', links: [{ label: 'Careers', url: 'https://meridian.example.com/careers' }], logo: PNG, ...over });

// ── world ──
await db.doc('users/pa').set({ displayName: 'Pat Admin', isPlatformAdmin: true });
await db.doc('users/rando').set({ displayName: 'Random' });
await db.doc('users/a1').set({ displayName: 'Admin One' });
await db.doc('users/a2').set({ displayName: 'Admin Two' });
await db.doc('companies/c1').set({ name: 'Meridian Financial', adminUid: 'a1' });
await db.doc('companies/c2').set({ name: 'Northwind Pay', adminUid: 'a2' });
await db.doc('arena_industries/payments').set({ name: 'Payments Arena', isActive: true });
await db.doc('arena_industries/insurance').set({ name: 'Insurance Arena', isActive: true });
await db.doc('arena_industries/retired').set({ name: 'Retired Arena', isActive: false });

const req = (uid, extra = {}) => runAction(db, uid, { action: 'request', arenaId: 'payments', companyId: 'c1', branding: branding(), ...extra }, NOW);
const get = async (id) => (await db.collection('arena_sponsorships').doc(id).get()).data();
const rec = async (id) => toSponsorshipRecord(id, await get(id));
const approve = (uid, id, extra = {}) => runAction(db, uid, { action: 'approve', id, startDate: iso(NOW - DAY), endDate: iso(NOW + 90 * DAY), ...extra }, NOW);

console.log('== asking to sponsor ==');
let first;
await check('a company administrator can request sponsorship; it starts as "under review" with no dates', async () => {
  const r = await req('a1'); first = r.id;
  const d = await get(first);
  assert(d.status === 'pending_review' && d.startDate === null && d.endDate === null, JSON.stringify({ s: d.status }));
  assert(d.companyName === 'Meridian Financial' && d.companyAdminUid === 'a1', 'company details come from the company, not the request');
});
await check('a request is not an active sponsorship', async () => {
  const r = await rec(first);
  assert(activeSponsorship([r], 'payments', NOW) === null, 'treated as active'); assert(sponsorshipPhase(r, NOW) === 'pending', sponsorshipPhase(r, NOW));
});
await check('someone who is not that company\'s administrator cannot request', async () => refuses(req('rando'), 403));
await check('another company\'s administrator cannot request on c1\'s behalf', async () => refuses(req('a2'), 403));
await check('a company that does not exist is refused', async () => refuses(req('a1', { companyId: 'nope' }), 404));
await check('an unknown or retired Arena is refused', async () => {
  await refuses(req('a1', { arenaId: 'nope-arena' }), 404); await refuses(req('a1', { arenaId: 'retired' }), 404);
});
await check('a second open request for the same Arena is refused', async () => refuses(req('a1'), 409));
await check('a request cannot smuggle in approval, dates or status', async () => {
  const r = await req('a1', { arenaId: 'insurance', status: 'approved', startDate: iso(NOW), endDate: iso(NOW + DAY), approval: { by: 'a1' }, exclusive: false });
  const d = await get(r.id);
  assert(d.status === 'pending_review' && d.startDate === null && d.approval === null && d.exclusive === true, JSON.stringify(d));
});

console.log('== branding is validated ==');
const bad = {
  'colour that is not hex': { primaryColor: 'red' }, 'short hex': { primaryColor: '#fff' }, 'css injection in colour': { primaryColor: '#123456;background:url(x)' },
  'http website': { website: 'http://meridian.example.com' }, 'javascript: website': { website: 'javascript:alert(1)' },
  'website with credentials': { website: 'https://u:p@meridian.example.com' }, 'localhost website': { website: 'https://localhost/' },
  'link with javascript:': { links: [{ label: 'x', url: 'javascript:alert(1)' }] }, 'link with no label': { links: [{ label: '', url: 'https://a.example.com' }] },
  'five links': { links: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, url: `https://a${i}.example.com` })) },
  'links that is not a list': { links: 'https://a.example.com' }, 'svg logo': { logo: SVG }, 'logo over 100 KB': { logo: BIG_PNG },
  'logo that lies about its type': { logo: LIAR }, 'logo that is not a data URL': { logo: 'https://evil.example.com/logo.png' }, 'logo that is plain text': { logo: 'data:image/png;base64,AAAA' },
};
for (const [name, over] of Object.entries(bad)) {
  await check(`refused: ${name}`, async () => refuses(runAction(db, 'a2', { action: 'request', arenaId: 'insurance', companyId: 'c2', branding: branding(over) }, NOW), 400));
}
await check('a banner that is an SVG, or too big, is refused', async () => {
  await refuses(runAction(db, 'a2', { action: 'request', arenaId: 'insurance', companyId: 'c2', branding: branding(), banner: SVG }, NOW), 400);
  const huge = 'data:image/jpeg;base64,' + Buffer.concat([jpegBytes, Buffer.alloc(320 * 1024, 3)]).toString('base64');
  await refuses(runAction(db, 'a2', { action: 'request', arenaId: 'insurance', companyId: 'c2', branding: branding(), banner: huge }, NOW), 400);
});
await check('PNG, JPEG and WebP logos are accepted', async () => {
  for (const [i, logo] of [PNG, JPEG, WEBP].entries()) {
    await db.doc(`companies/ci${i}`).set({ name: `Img ${i}`, adminUid: `ai${i}` });
    await runAction(db, `ai${i}`, { action: 'request', arenaId: 'insurance', companyId: `ci${i}`, branding: branding({ logo }) }, NOW);
  }
});
await check('text is cleaned and clipped; the colour is lower-cased', async () => {
  await db.doc('companies/ct').set({ name: 'Clean Co', adminUid: 'at' });
  const r = await runAction(db, 'at', { action: 'request', arenaId: 'insurance', companyId: 'ct', branding: branding({ primaryColor: '#AABBCC', tagline: 'a\u0000b\n\nc ' + 'x'.repeat(300) }) }, NOW);
  const d = await get(r.id);
  assert(d.branding.primaryColor === '#aabbcc', d.branding.primaryColor); assert(d.branding.tagline.length <= 120 && !/[\u0000-\u001f]/.test(d.branding.tagline), d.branding.tagline);
});
await check('a banner is stored separately from the sponsorship', async () => {
  await db.doc('companies/cb').set({ name: 'Banner Co', adminUid: 'ab' });
  const r = await runAction(db, 'ab', { action: 'request', arenaId: 'insurance', companyId: 'cb', branding: branding(), banner: JPEG }, NOW);
  const a = (await db.doc(`arena_sponsorship_assets/${r.id}`).get()).data();
  assert(a?.banner === JPEG && (await get(r.id)).branding.hasBanner === true && !('banner' in (await get(r.id)).branding), 'banner not stored apart');
});

console.log('== approval ==');
await check('the company administrator cannot approve their own request', async () => refuses(approve('a1', first), 403));
await check('an ordinary member cannot approve', async () => refuses(approve('rando', first), 403));
await check('a request for dates in the past, or end before start, or over two years, is refused', async () => {
  await refuses(approve('pa', first, { endDate: iso(NOW - DAY) }), 400);
  await refuses(approve('pa', first, { startDate: iso(NOW + 5 * DAY), endDate: iso(NOW + 2 * DAY) }), 400);
  await refuses(approve('pa', first, { endDate: iso(NOW + 800 * DAY) }), 400);
  await refuses(approve('pa', first, { startDate: 'not a date' }), 400);
  assert((await get(first)).status === 'pending_review', 'changed despite refusal');
});
await check('a platform admin approves with dates; the sponsorship is then active', async () => {
  await approve('pa', first, { note: 'Verified with Meridian.' });
  const r = await rec(first);
  assert(r.status === 'approved' && r.approval?.byName === 'Pat Admin', JSON.stringify(r.approval));
  assert(activeSponsorship([r], 'payments', NOW)?.id === first, 'not active after approval');
  assert(activeSponsorship([r], 'insurance', NOW) === null, 'active on the wrong Arena');
});
await check('approving something already approved is refused', async () => refuses(approve('pa', first), 409));

console.log('== exclusive sponsorships cannot overlap ==');
let second;
await check('a second company can request the same Arena', async () => { second = (await runAction(db, 'a2', { action: 'request', arenaId: 'payments', companyId: 'c2', branding: branding({ primaryColor: '#0b5cad' }) }, NOW)).id; });
await check('approving it for dates that overlap the first is refused, and says who holds the Arena', async () => {
  try { await approve('pa', second, { startDate: iso(NOW + 30 * DAY), endDate: iso(NOW + 120 * DAY) }); } catch (e) { assert(e.status === 409 && e.message.includes('Meridian Financial'), e.message); return; }
  throw new Error('overlap allowed');
});
await check('the refused request stays under review', async () => assert((await get(second)).status === 'pending_review', 'changed'));
await check('a non-exclusive sponsorship cannot overlap an exclusive one either', async () => refuses(approve('pa', second, { exclusive: false, startDate: iso(NOW + 30 * DAY), endDate: iso(NOW + 120 * DAY) }), 409));
await check('dates that begin exactly when the first ends are fine (no overlap)', async () => {
  await approve('pa', second, { startDate: iso(NOW + 90 * DAY), endDate: iso(NOW + 180 * DAY) });
  const list = [await rec(first), await rec(second)];
  assert(activeSponsorship(list, 'payments', NOW)?.id === first, 'first should hold it now');
  assert(sponsorshipPhase(list[1], NOW) === 'scheduled', sponsorshipPhase(list[1], NOW));
  assert(activeSponsorship(list, 'payments', NOW + 100 * DAY)?.id === second, 'second should hold it later');
  assert(activeSponsorship(list, 'payments', NOW + 200 * DAY) === null, 'nobody should hold it after both end');
});
await check('after a revocation the Arena is free for those dates again', async () => {
  await db.doc('companies/c3').set({ name: 'Third Co', adminUid: 'a3' });
  const third = (await runAction(db, 'a3', { action: 'request', arenaId: 'payments', companyId: 'c3', branding: branding() }, NOW)).id;
  await refuses(approve('pa', third, { startDate: iso(NOW), endDate: iso(NOW + 30 * DAY) }), 409);
  await runAction(db, 'pa', { action: 'revoke', id: first, note: 'Policy breach' }, NOW);
  await approve('pa', third, { startDate: iso(NOW), endDate: iso(NOW + 30 * DAY) });
  assert(activeSponsorship([await rec(first), await rec(third)], 'payments', NOW)?.id === third, 'wrong holder');
});
await check('two non-exclusive sponsorships may run together', async () => {
  await db.doc('companies/n1').set({ name: 'Non One', adminUid: 'an1' }); await db.doc('companies/n2').set({ name: 'Non Two', adminUid: 'an2' });
  await db.doc('arena_industries/healthcare').set({ name: 'Healthcare Arena', isActive: true });
  const a = (await runAction(db, 'an1', { action: 'request', arenaId: 'healthcare', companyId: 'n1', branding: branding() }, NOW)).id;
  const b = (await runAction(db, 'an2', { action: 'request', arenaId: 'healthcare', companyId: 'n2', branding: branding() }, NOW)).id;
  await approve('pa', a, { exclusive: false }); await approve('pa', b, { exclusive: false });
});
await check('two approvals racing for the same dates: exactly one wins', async () => {
  await db.doc('arena_industries/retail').set({ name: 'Retail Arena', isActive: true });
  const ids = [];
  for (const n of ['r1', 'r2', 'r3']) { await db.doc(`companies/${n}`).set({ name: n, adminUid: `u-${n}` }); ids.push((await runAction(db, `u-${n}`, { action: 'request', arenaId: 'retail', companyId: n, branding: branding() }, NOW)).id); }
  const results = await Promise.allSettled(ids.map(id => approve('pa', id)));
  const ok = results.filter(r => r.status === 'fulfilled').length;
  assert(ok === 1, `${ok} of 3 approvals succeeded`);
});

console.log('== expiry and revocation are automatic ==');
await check('an approved record past its end date is no longer active, with no job running', async () => {
  const r = await rec(second);
  assert(sponsorshipPhase(r, NOW + 181 * DAY) === 'expired' && activeSponsorship([r], 'payments', NOW + 181 * DAY) === null, 'still active');
});
await check('a revoked record is never active, whatever its dates', async () => {
  const r = await rec(first); assert(r.status === 'revoked' && sponsorshipPhase(r, NOW) === 'revoked' && activeSponsorship([r], 'payments', NOW) === null, 'active');
});
await check('an approved record with no dates is not a sponsorship', async () => {
  const r = toSponsorshipRecord('x', { arenaId: 'payments', status: 'approved', branding: branding() }); assert(activeSponsorship([r], 'payments', NOW) === null, 'active');
});
await check('a logo and a company name alone never make a sponsor', async () => {
  const r = toSponsorshipRecord('y', { arenaId: 'payments', status: 'pending_review', companyName: 'Meridian Financial', branding: branding() }); assert(activeSponsorship([r], 'payments', NOW) === null, 'active');
});

console.log('== revoke / reject ==');
await check('rejecting and revoking need a reason and a platform admin', async () => {
  await db.doc('companies/c9').set({ name: 'Nine', adminUid: 'a9' });
  const id = (await runAction(db, 'a9', { action: 'request', arenaId: 'insurance', companyId: 'c9', branding: branding() }, NOW)).id;
  await refuses(runAction(db, 'a9', { action: 'reject', id, note: 'because I say so' }, NOW), 403);
  await refuses(runAction(db, 'pa', { action: 'reject', id, note: 'no' }, NOW), 400);
  await refuses(runAction(db, 'pa', { action: 'revoke', id, note: 'not approved yet' }, NOW), 409);
  await runAction(db, 'pa', { action: 'reject', id, note: 'Logo is not yours.' }, NOW);
  assert((await get(id)).status === 'rejected' && (await get(id)).note === 'Logo is not yours.', 'not rejected');
  await refuses(runAction(db, 'pa', { action: 'reject', id, note: 'again please' }, NOW), 409);
});

console.log('== managing branding while active ==');
let live;
await check('setup: an approved, running sponsorship', async () => {
  await db.doc('companies/c5').set({ name: 'Five Co', adminUid: 'a5' });
  await db.doc('arena_industries/banking').set({ name: 'Banking Arena', isActive: true });
  live = (await runAction(db, 'a5', { action: 'request', arenaId: 'banking', companyId: 'c5', branding: branding() }, NOW)).id;
  await approve('pa', live);
});
await check('the company administrator can change branding and the banner while active', async () => {
  await runAction(db, 'a5', { action: 'update_branding', id: live, branding: branding({ primaryColor: '#7a1f3d', tagline: 'New line' }), banner: JPEG }, NOW);
  const d = await get(live);
  assert(d.branding.primaryColor === '#7a1f3d' && d.branding.tagline === 'New line' && d.branding.hasBanner === true, JSON.stringify(d.branding));
  assert(d.status === 'approved' && d.startDate && d.endDate, 'status or dates changed by a branding edit');
});
await check('the edit is flagged for BeWatu to review, and the platform admin can clear the flag', async () => {
  assert((await get(live)).brandingChangedSinceApproval === true, 'not flagged');
  await refuses(runAction(db, 'a5', { action: 'acknowledge', id: live }, NOW), 403);
  await runAction(db, 'pa', { action: 'acknowledge', id: live }, NOW);
  assert((await get(live)).brandingChangedSinceApproval === false, 'flag stays');
});
await check('the banner can be removed', async () => {
  await runAction(db, 'a5', { action: 'update_branding', id: live, branding: branding(), banner: null }, NOW);
  assert(!(await db.doc(`arena_sponsorship_assets/${live}`).get()).exists && (await get(live)).branding.hasBanner === false, 'banner remains');
});
await check('omitting the banner keeps the current one', async () => {
  await runAction(db, 'a5', { action: 'update_branding', id: live, branding: branding(), banner: WEBP }, NOW);
  await runAction(db, 'a5', { action: 'update_branding', id: live, branding: branding({ tagline: 'again' }) }, NOW);
  assert((await db.doc(`arena_sponsorship_assets/${live}`).get()).data().banner === WEBP, 'banner lost');
});
await check('another company\'s administrator cannot change it', async () => refuses(runAction(db, 'a2', { action: 'update_branding', id: live, branding: branding() }, NOW), 403));
await check('an edit with invalid branding changes nothing', async () => {
  const before = JSON.stringify((await get(live)).branding);
  await refuses(runAction(db, 'a5', { action: 'update_branding', id: live, branding: branding({ website: 'http://x.example.com' }) }, NOW), 400);
  assert(JSON.stringify((await get(live)).branding) === before, 'changed');
});
await check('a company that has lost its administrator role can no longer edit', async () => {
  await db.doc('companies/c5').update({ adminUid: 'someone-else' });
  await refuses(runAction(db, 'a5', { action: 'update_branding', id: live, branding: branding() }, NOW), 403);
  await db.doc('companies/c5').update({ adminUid: 'a5' });
});
await check('a rejected, revoked, withdrawn or expired sponsorship cannot be edited', async () => {
  const id = (await db.collection('arena_sponsorships').where('status', '==', 'rejected').limit(1).get()).docs[0].id;
  await refuses(runAction(db, (await get(id)).companyAdminUid, { action: 'update_branding', id, branding: branding() }, NOW), 409);
  await refuses(runAction(db, 'a2', { action: 'update_branding', id: second, branding: branding() }, NOW + 200 * DAY), 409); // ended
});
await check('the company can withdraw; it stops being active at once', async () => {
  await refuses(runAction(db, 'a2', { action: 'withdraw', id: live }, NOW), 403);
  await runAction(db, 'a5', { action: 'withdraw', id: live }, NOW);
  assert(activeSponsorship([await rec(live)], 'banking', NOW) === null, 'still active');
});
await check('a rate limit stops a runaway client', async () => {
  await db.doc('companies/c7').set({ name: 'Seven', adminUid: 'a7' });
  const id = (await runAction(db, 'a7', { action: 'request', arenaId: 'retail', companyId: 'c7', branding: branding() }, NOW)).id;
  let blocked = 0;
  for (let i = 0; i < 45; i++) { try { await runAction(db, 'a7', { action: 'update_branding', id, branding: branding({ tagline: `t${i}` }) }, NOW); } catch (e) { if (e.status === 429) blocked++; else throw e; } }
  assert(blocked > 0, 'never limited');
});
await check('an unknown action is refused', async () => refuses(runAction(db, 'pa', { action: 'make_me_sponsor' }, NOW), 400));
await check('history is kept on the record', async () => { const h = (await get(first)).history; assert(h.length >= 3 && h[0].action === 'requested' && h.some(x => x.action === 'approved') && h.some(x => x.action === 'revoked'), JSON.stringify(h.map(x => x.action))); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
