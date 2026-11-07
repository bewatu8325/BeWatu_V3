// Run: npx tsx test/arena-sponsorship/client-tests.mjs   (no emulator needed)
// lib/arenaSponsorship.ts: accessible colours, what is safe to show, and when a sponsorship is "active".
import {
  brandTheme, contrastRatio, normalizeBranding, safeImage, safeHttpsUrl, sponsorshipPhase, activeSponsorship,
  sponsorshipsConflict, toSponsorshipRecord, dataUrlBytes, DEFAULT_BRAND,
} from '../../lib/arenaSponsorship.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

console.log('== colour: readable whatever the company picks ==');
check('BeWatu green keeps its colour with white text', () => { const t = brandTheme('#1a4a3a'); eq([t.bg, t.fg, t.adjusted], ['#1a4a3a', '#ffffff', false]); });
check('a light yellow gets dark text and is not changed', () => { const t = brandTheme('#f5e6a8'); assert(t.fg !== '#ffffff' && !t.adjusted && t.ratio >= 4.5, JSON.stringify(t)); });
check('white and black work', () => { assert(brandTheme('#ffffff').ratio >= 4.5 && brandTheme('#000000').ratio >= 4.5, 'bad'); });
check('a mid-tone that fails both ways is darkened until it passes, and says so', () => {
  const t = brandTheme('#777777'); assert(t.ratio >= 4.5, JSON.stringify(t)); assert(t.adjusted, 'should be flagged as adjusted');
});
check('a missing, malformed or injected colour falls back to the BeWatu default', () => {
  for (const bad of [undefined, null, '', 'red', '#fff', '#12345', '#GGGGGG', 'url(x)', '#123456;background:red']) eq(brandTheme(bad).bg, DEFAULT_BRAND);
});
check('across 20,000 random colours, text on the header is always at least 4.5:1', () => {
  let worst = 99; let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 20000; i++) {
    const hex = '#' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
    const t = brandTheme(hex);
    const real = contrastRatio(t.bg, t.fg); worst = Math.min(worst, real);
    assert(real >= 4.5, `${hex} -> ${t.bg}/${t.fg} = ${real.toFixed(2)}`);
    assert(contrastRatio(t.bg, t.fgMuted) >= 4.5, `muted text on ${t.bg}`);
  }
  console.log(`   worst contrast seen: ${worst.toFixed(2)}`);
});

console.log('== what is safe to show ==');
check('https links only, no credentials, no internal hosts', () => {
  eq(safeHttpsUrl('https://example.com/a'), 'https://example.com/a');
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'https://u:p@example.com', 'https://localhost/x', 'https://printer.local/', '//evil.com', 'data:text/html,x', 5, null, '']) eq(safeHttpsUrl(bad), null);
});
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
check('re-encoded raster images are allowed; SVG, remote URLs and oversize are not', () => {
  eq(safeImage(PNG, 100 * 1024), PNG);
  eq(safeImage('data:image/svg+xml;base64,PHN2Zy8+', 100 * 1024), null);
  eq(safeImage('https://evil.example.com/a.png', 100 * 1024), null);
  eq(safeImage('data:image/png;base64,' + 'A'.repeat(200 * 1024), 100 * 1024), null);
  eq(safeImage('data:text/html;base64,PHNjcmlwdD4=', 100 * 1024), null);
  assert(dataUrlBytes(PNG) === 70, String(dataUrlBytes(PNG)));
});
check('branding from Firestore is cleaned before it is rendered', () => {
  const b = normalizeBranding({ primaryColor: 'JAVASCRIPT', tagline: 'a\u0000b ' + 'x'.repeat(300), website: 'http://x.example.com', logo: 'https://evil/x.png',
    links: [{ label: 'Ok', url: 'https://ok.example.com' }, { label: 'Bad', url: 'javascript:alert(1)' }, { label: '', url: 'https://nolabel.example.com' }] });
  eq([b.primaryColor, b.website, b.logo, b.links.length], [DEFAULT_BRAND, null, null, 1]);
  assert(b.tagline.length <= 120 && !/\u0000/.test(b.tagline), b.tagline);
});
check('five links are cut to four', () => eq(normalizeBranding({ links: Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, url: `https://a${i}.example.com` })) }).links.length, 4));

console.log('== when a sponsorship is active ==');
const NOW = 1_800_000_000_000, DAY = 86400000;
const mk = (over) => toSponsorshipRecord(over.id ?? 'x', { arenaId: 'payments', companyId: 'c', companyName: 'Co', status: 'approved', startDate: NOW - DAY, endDate: NOW + DAY, branding: {}, ...over });
check('approved and inside its dates -> active', () => eq(sponsorshipPhase(mk({}), NOW), 'active'));
check('approved before its start date -> scheduled, not shown', () => { const r = mk({ startDate: NOW + DAY, endDate: NOW + 5 * DAY }); eq(sponsorshipPhase(r, NOW), 'scheduled'); eq(activeSponsorship([r], 'payments', NOW), null); });
check('approved after its end date -> expired, not shown', () => { const r = mk({ startDate: NOW - 5 * DAY, endDate: NOW - DAY }); eq(sponsorshipPhase(r, NOW), 'expired'); eq(activeSponsorship([r], 'payments', NOW), null); });
check('the end instant itself is already over (end date is exclusive)', () => eq(sponsorshipPhase(mk({ startDate: NOW - DAY, endDate: NOW }), NOW), 'expired'));
check('the start instant itself is active', () => eq(sponsorshipPhase(mk({ startDate: NOW, endDate: NOW + DAY }), NOW), 'active'));
check('pending, rejected, revoked and withdrawn are never active, even with valid dates', () => {
  for (const status of ['pending_review', 'rejected', 'revoked', 'withdrawn']) eq(activeSponsorship([mk({ status })], 'payments', NOW), null);
});
check('Firestore timestamps and plain numbers both work', () => {
  const ts = { toMillis: () => NOW - DAY }, te = { seconds: Math.floor((NOW + DAY) / 1000) };
  eq(sponsorshipPhase(toSponsorshipRecord('t', { arenaId: 'a', status: 'approved', startDate: ts, endDate: te, branding: {} }), NOW), 'active');
});
check('only the Arena asked about is matched', () => eq(activeSponsorship([mk({ arenaId: 'insurance' })], 'payments', NOW), null));
check('if two were somehow active, the later start wins every time (order does not matter)', () => {
  const a = mk({ id: 'a', startDate: NOW - 5 * DAY }), b = mk({ id: 'b', startDate: NOW - DAY });
  eq(activeSponsorship([a, b], 'payments', NOW)?.id, 'b'); eq(activeSponsorship([b, a], 'payments', NOW)?.id, 'b');
});
check('overlap rules: overlapping + any exclusive conflicts; touching ranges and two non-exclusive do not', () => {
  const r = (s, e, x) => ({ startMs: s, endMs: e, exclusive: x });
  eq(sponsorshipsConflict(r(0, 10, true), r(5, 15, true)), true); eq(sponsorshipsConflict(r(0, 10, false), r(5, 15, true)), true);
  eq(sponsorshipsConflict(r(0, 10, true), r(10, 20, true)), false); eq(sponsorshipsConflict(r(0, 10, false), r(5, 15, false)), false);
});
check('a missing or unknown status is treated as pending, not active', () => eq(activeSponsorship([toSponsorshipRecord('z', { arenaId: 'payments', status: 'banana', startDate: NOW - DAY, endDate: NOW + DAY })], 'payments', NOW), null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
