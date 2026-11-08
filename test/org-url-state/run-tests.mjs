// Run: tsx test/org-url-state/run-tests.mjs
// Guards the Organizations page's URL state: round trips, canonical form, and refusal of anything invalid.
import { toSearch, fromSearch, isDirectoryPath } from '../../lib/orgUrlState.ts';
import { parseCategoryParam, categoryParam, categorySelectionLabel, POPULAR_GROUPS, CATEGORIES } from '../../lib/organizations.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const base = { view: 'all', q: '', industry: '', category: '', orgType: '', country: '', hiring: false, challenges: false, sponsor: false, sort: 'relevance' };

check('a plain list is just its view', () => assert(toSearch(base) === '?view=all', toSearch(base)));
check('every choice round-trips', () => {
  const s = { view: 'for_you', q: 'st mary', industry: 'higher education', category: 'medical,hospitals', orgType: 'hospital', country: 'kenya', hiring: true, challenges: true, sponsor: true, sort: 'followers' };
  const back = fromSearch(toSearch(s));
  for (const k of Object.keys(s)) assert(back[k] === s[k], `${k}: ${back[k]} !== ${s[k]}`);
  assert(Object.keys(back).length === Object.keys(s).length, 'extra keys');
});
check('categories are written in one canonical order whatever order they were chosen in', () => {
  assert(toSearch({ ...base, category: 'hospitals,medical' }) === toSearch({ ...base, category: 'medical,hospitals' }), 'order matters');
  assert(categoryParam(parseCategoryParam('hospitals,medical,hospitals')) === 'medical,hospitals', 'dedupe/order');
});
check('invalid parts are dropped, valid ones kept', () => {
  const r = fromSearch('?view=weird&category=bogus,finance&type=spaceship&sort=random&hiring=yes&q=%00%00ok&country=Kenya');
  assert(!('view' in r) && !('orgType' in r) && !('sort' in r) && !('hiring' in r), JSON.stringify(r));
  assert(r.category === 'finance' && r.q === 'ok' && r.country === 'kenya', JSON.stringify(r));
});
check('text is length-limited and cannot smuggle control characters', () => {
  const r = fromSearch('?q=' + 'x'.repeat(500));
  assert(r.q.length === 80, 'q ' + r.q.length);
});
check('an empty or unrelated query states nothing', () => { assert(Object.keys(fromSearch('')).length === 0 && Object.keys(fromSearch('?utm_source=x')).length === 0, 'not empty'); });
check('selected categories are named in words: a popular group by its own name, otherwise the categories', () => {
  assert(categorySelectionLabel('colleges') === 'Universities', categorySelectionLabel('colleges'));
  assert(categorySelectionLabel('hospitals,medical') === 'Healthcare', categorySelectionLabel('hospitals,medical'));
  assert(categorySelectionLabel('hospitals') === 'Hospitals & Health Systems', categorySelectionLabel('hospitals'));
  assert(categorySelectionLabel('finance,manufacturing') === 'Manufacturing and Finance', categorySelectionLabel('finance,manufacturing'));
  assert(categorySelectionLabel('') === '' && categorySelectionLabel('nope') === '', 'empty');
});
check('the four popular choices are Universities, Healthcare, Manufacturing, Finance and between them cover every named category but Other', () => {
  assert(POPULAR_GROUPS.map(g => g.label).join() === 'Universities,Healthcare,Manufacturing,Finance', 'labels');
  const covered = new Set(POPULAR_GROUPS.flatMap(g => g.keys));
  assert(CATEGORIES.filter(c => c.key !== 'other').every(c => covered.has(c.key)), 'a category is unreachable from the popular choices');
});
check('only the directory\'s own addresses may have their query rewritten', () => {
  assert(isDirectoryPath('/organizations') && isDirectoryPath('/companies/') && !isDirectoryPath('/organizations/abc') && !isDirectoryPath('/') && !isDirectoryPath('/terms'), 'paths');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
