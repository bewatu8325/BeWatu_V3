// Run: tsx test/org-url-state/run-tests.mjs
// Guards the Organizations page's URL state: round trips, canonical form, and refusal of anything invalid.
import { toSearch, fromSearch, isDirectoryPath } from '../../lib/orgUrlState.ts';
import { parseCategoryParam, categoryParam, BROAD_CATEGORIES, BROAD_LABEL, DEFAULT_PILLS } from '../../lib/organizations.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const base = { view: 'all', q: '', industry: '', category: '', orgType: '', country: '', hiring: false, challenges: false, sponsor: false, sort: 'relevance' };

check('a plain list is just its view', () => assert(toSearch(base) === '?view=all', toSearch(base)));
check('every choice round-trips', () => {
  const s = { view: 'for_you', q: 'st mary', industry: 'higher education', category: 'finance,healthcare', orgType: 'hospital', country: 'kenya', hiring: true, challenges: true, sponsor: true, sort: 'followers' };
  const back = fromSearch(toSearch(s));
  for (const k of Object.keys(s)) assert(back[k] === s[k], `${k}: ${back[k]} !== ${s[k]}`);
  assert(Object.keys(back).length === Object.keys(s).length, 'extra keys');
});
check('categories are written in one canonical order whatever order they were chosen in', () => {
  assert(toSearch({ ...base, category: 'healthcare,finance' }) === toSearch({ ...base, category: 'finance,healthcare' }), 'order matters');
  assert(categoryParam(parseCategoryParam('healthcare,finance,healthcare')) === 'finance,healthcare', 'dedupe/order');
});
check('invalid parts are dropped, valid ones kept', () => {
  const r = fromSearch('?view=weird&category=bogus,finance,colleges&type=spaceship&sort=random&hiring=yes&q=%00%00ok&country=Kenya');
  assert(!('view' in r) && !('orgType' in r) && !('sort' in r) && !('hiring' in r), JSON.stringify(r));
  assert(r.category === 'finance' && r.q === 'ok' && r.country === 'kenya', JSON.stringify(r));
});
check('text is length-limited and cannot smuggle control characters', () => {
  const r = fromSearch('?q=' + 'x'.repeat(500));
  assert(r.q.length === 80, 'q ' + r.q.length);
});
check('an empty or unrelated query states nothing', () => { assert(Object.keys(fromSearch('')).length === 0 && Object.keys(fromSearch('?utm_source=x')).length === 0, 'not empty'); });
check('categories in a link are the filter categories; the old profile-kind names are not accepted', () => {
  assert(parseCategoryParam('colleges,medical,hospitals').length === 0, 'old keys must not select anything');
  assert(parseCategoryParam('education,other').join() === 'education,other', 'other is allowed');
  assert(parseCategoryParam(['technology', 'finance']).join() === 'finance,technology', 'array input is canonicalised');
  assert(parseCategoryParam(undefined).length === 0 && parseCategoryParam(42).length === 0, 'junk');
});
check('the standard shortcuts: Finance, Healthcare, Technology, Education; Manufacturing and Other live only in More', () => {
  assert(DEFAULT_PILLS.map(k => BROAD_LABEL[k]).join() === 'Finance,Healthcare,Technology,Education', 'labels');
  assert(BROAD_CATEGORIES.map(c => c.key).join() === 'finance,healthcare,technology,education,manufacturing,other', 'all categories reachable from More');
  const sub = Object.fromEntries(BROAD_CATEGORIES.map(c => [c.key, c.subcategories.join(', ')]));
  assert(sub.finance === 'Banking, Fintech, Financial Services, Insurance', sub.finance);
  assert(sub.healthcare === 'Hospitals, Health Systems, Pharmaceuticals, Biotechnology, Medical Devices', sub.healthcare);
  assert(sub.technology === 'Software, Hardware, AI, IT Services', sub.technology);
  assert(sub.education === 'Colleges, Universities, Technical Institutions, Education Technology', sub.education);
});
check('only the directory\'s own addresses may have their query rewritten', () => {
  assert(isDirectoryPath('/organizations') && isDirectoryPath('/companies/') && !isDirectoryPath('/organizations/abc') && !isDirectoryPath('/') && !isDirectoryPath('/terms'), 'paths');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
