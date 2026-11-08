// Run: tsx test/arenas-nav/run-tests.mjs
// Guards the navigation model (addresses, which nav item a view belongs to), the Create menu's permissions and
// ordering, and the Arenas landing logic (filters, featured pick, relevance, honest prize and deadline text).
import { readFileSync } from 'node:fs';
import { View } from '../../types.ts';
import { pathFor, parsePath, navKeyFor, ARENA_INDUSTRY_VIEW, ARENA_CHALLENGE_VIEW } from '../../lib/routes.ts';
import { createActions, canPostChallenge } from '../../lib/createActions.ts';
import { defaultTab, reelsFor, matchScore, optionsFrom, applyFilters, NO_PROVE_FILTERS, MEANINGFUL_FOLLOWING } from '../../lib/proveDiscovery.ts';
import { filterChallenges, pickFeatured, relevantFor, skillOptions, prizeText, deadlineText, statusOf, NO_FILTERS, anyFilter } from '../../lib/arenaDiscovery.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

console.log('== addresses ==');
check('every routed destination round-trips through its address', () => {
  for (const v of [View.Connections, View.Circles, View.Bridge, View.Arenas, View.Prove, View.Discover, View.People, View.Messaging, View.Jobs, View.Companies]) {
    const loc = parsePath(pathFor({ view: v }));
    assert(loc && loc.view === v, `${v} -> ${pathFor({ view: v })} -> ${JSON.stringify(loc)}`);
  }
});
check('Arena industries and challenges have their own addresses and read back exactly', () => {
  assert(pathFor({ view: ARENA_INDUSTRY_VIEW, industry: 'payments' }) === '/arenas/payments', 'industry path');
  assert(pathFor({ view: ARENA_CHALLENGE_VIEW, challengeId: 'abc123' }) === '/arenas/challenge/abc123', 'challenge path');
  assert(JSON.stringify(parsePath('/arenas/payments')) === JSON.stringify({ view: ARENA_INDUSTRY_VIEW, industry: 'payments' }), 'read industry');
  assert(JSON.stringify(parsePath('/arenas/challenge/abc123/')) === JSON.stringify({ view: ARENA_CHALLENGE_VIEW, challengeId: 'abc123' }), 'read challenge, trailing slash');
  assert(parsePath('/arenas/challenge') === null, '"challenge" alone is not an industry');
});
check('"/" and addresses that mean something else are never read as a destination', () => {
  for (const p of ['/', '', '/be/amina', '/terms', '/privacy', '/community-guidelines', '/login', '/register', '/endorse/abc', '/random', '/community-guidelines/x', '/arenas/a/b/c', '/api/companies']) assert(parsePath(p) === null, p + ' -> ' + JSON.stringify(parsePath(p)));
});
check('the older directory address still opens the directory; unsafe ids are refused', () => {
  assert(parsePath('/companies')?.view === View.Companies, '/companies');
  assert(parsePath('/arenas/..%2fetc') === null && parsePath('/arenas/challenge/a b') === null && parsePath('/arenas/' + 'x'.repeat(200)) === null, 'unsafe');
  assert(pathFor({ view: ARENA_CHALLENGE_VIEW, challengeId: '../x' }) === '/', 'unsafe id never reaches a path');
});
check('views with no address of their own are shown at "/"', () => { assert(pathFor({ view: View.Profile }) === '/' && pathFor({ view: View.Pricing }) === '/', 'unrouted'); });

console.log('== navigation grouping ==');
check('every destination belongs under the right navigation item', () => {
  const want = { [View.Feed]: 'home', [View.Connections]: 'community', [View.Circles]: 'community', [View.Bridge]: 'community',
    [View.Arenas]: 'arenas', [ARENA_INDUSTRY_VIEW]: 'arenas', [ARENA_CHALLENGE_VIEW]: 'arenas', [View.Prove]: 'prove',
    [View.Discover]: 'discover', [View.People]: 'discover', [View.Jobs]: 'discover', [View.Companies]: 'discover', [View.Messaging]: 'messages', [View.Profile]: 'you' };
  for (const [v, k] of Object.entries(want)) assert(navKeyFor(v) === k, `${v} should be ${k}, is ${navKeyFor(v)}`);
  assert(navKeyFor(View.Pricing) === null, 'unlisted views highlight nothing');
});

console.log('== Create menu ==');
const ids = (ctx) => createActions(ctx).map(a => a.id).join();
check('everyone gets post, wisdom, reel, spark, pod and project; the challenge action only when authorized', () => {
  assert(ids({ view: View.Feed, canPostChallenge: false }) === 'post,wisdom,reel,spark,pod,project', ids({ view: View.Feed, canPostChallenge: false }));
  assert(ids({ view: View.Feed, canPostChallenge: true }) === 'post,wisdom,reel,spark,pod,project,challenge', ids({ view: View.Feed, canPostChallenge: true }));
});
check('the action that fits the page comes first and is the only one marked suggested', () => {
  assert(ids({ view: View.Prove, canPostChallenge: false }).startsWith('reel,'), 'prove');
  assert(ids({ view: View.Circles, canPostChallenge: false }).startsWith('pod,'), 'community');
  assert(ids({ view: View.Arenas, canPostChallenge: true }).startsWith('challenge,'), 'arenas, authorized');
  assert(ids({ view: View.Arenas, canPostChallenge: false }).startsWith('pod,'), 'arenas, not authorized: never the challenge action');
  assert(createActions({ view: View.Prove, canPostChallenge: true }).filter(a => a.suggested).length === 1, 'one suggestion');
  assert(!ids({ view: ARENA_INDUSTRY_VIEW, canPostChallenge: false }).includes('challenge'), 'unauthorized never sees it');
});
check('authorization to post a challenge: a recruiter whose organization is verified for an Arena industry', () => {
  assert(canPostChallenge({ isRecruiter: true }, { verifiedIndustries: ['payments'] }) === true, 'authorized');
  assert(canPostChallenge({ isRecruiter: false }, { verifiedIndustries: ['payments'] }) === false, 'not a recruiter');
  assert(canPostChallenge({ isRecruiter: true }, { verifiedIndustries: [] }) === false && canPostChallenge({ isRecruiter: true }, null) === false && canPostChallenge(null, null) === false, 'no verified industry');
});

console.log('== Arenas landing ==');
const NOW = Date.parse('2026-11-01T12:00:00Z');
const day = 86_400_000;
const ch = (id, o = {}) => ({ id, title: `Challenge ${id}`, arenaIndustry: 'payments', companyName: 'Co', skills: [], deadline: new Date(NOW + 20 * day).toISOString(), verificationStatus: 'live', prizeAmount: 0, tier: 'standard', ...o });
const list = [
  ch('a', { arenaIndustry: 'payments', skills: ['Fraud', 'SQL'], prizeAmount: 5000, prizeType: 'cash', deadline: new Date(NOW + 3 * day).toISOString(), title: 'Rethink payments' }),
  ch('b', { arenaIndustry: 'healthcare', skills: ['SQL'], deadline: new Date(NOW + 10 * day).toISOString(), tier: 'featured' }),
  ch('c', { arenaIndustry: 'banking', skills: ['Python'], deadline: new Date(NOW + 40 * day).toISOString() }),
  ch('closed', { deadline: new Date(NOW - day).toISOString() }),
  ch('pending', { verificationStatus: 'pending_ops' }),
  ch('suspended', { verificationStatus: 'suspended' }),
];
check('only live challenges before their deadline are open; status is real', () => {
  assert(statusOf(list[0], NOW) === 'closing_soon' && statusOf(list[1], NOW) === 'open' && statusOf(list[3], NOW) === 'closed' && statusOf(list[4], NOW) === 'closed' && statusOf(list[5], NOW) === 'closed', 'statuses');
  assert(filterChallenges(list, NO_FILTERS, NOW).map(c => c.id).join() === 'a,b,c', filterChallenges(list, NO_FILTERS, NOW).map(c => c.id).join());
});
check('filters combine: industry, skill, status, prize and search', () => {
  const f = (o) => filterChallenges(list, { ...NO_FILTERS, ...o }, NOW).map(c => c.id).join();
  assert(f({ industry: 'healthcare' }) === 'b', 'industry');
  assert(f({ skill: 'sql' }) === 'a,b', 'skill, case-insensitive');
  assert(f({ status: 'closing_soon' }) === 'a', 'closing soon');
  assert(f({ prizeOnly: true }) === 'a', 'prize only means a real prize amount');
  assert(f({ q: 'rethink' }) === 'a' && f({ q: 'PYTHON' }) === 'c', 'search title and skills');
  assert(f({ skill: 'sql', industry: 'payments' }) === 'a', 'AND');
  assert(f({ industry: 'insurance' }) === '', 'nothing matches -> empty, not everything');
  assert(anyFilter(NO_FILTERS) === false && anyFilter({ ...NO_FILTERS, q: ' x ' }) === true && anyFilter({ ...NO_FILTERS, q: '   ' }) === false, 'anyFilter');
});
check('the featured challenge is a real open one, paid placement first, and absent when none are open', () => {
  assert(pickFeatured(list, NOW).id === 'b', 'featured tier first');
  assert(pickFeatured([list[3], list[4], list[5]], NOW) === null && pickFeatured([], NOW) === null, 'nothing open -> nothing featured');
  assert(pickFeatured([list[0], list[2]], NOW).id === 'a', 'otherwise the soonest deadline');
});
check('"for you" needs a real overlap: followed industries, your industry, your skills', () => {
  const name = (s) => ({ payments: 'Payments', healthcare: 'Healthcare', banking: 'Banking' }[s] ?? s);
  const r = relevantFor(list, { followedIndustries: ['healthcare'], skills: ['python'], industryNames: ['Payments'] }, name, NOW);
  assert(r.map(x => x.challenge.id).join() === 'b,a,c' || r.map(x => x.challenge.id).sort().join() === 'a,b,c', r.map(x => x.challenge.id).join());
  assert(r.find(x => x.challenge.id === 'b').reasons[0] === 'You follow Healthcare', 'reason is real');
  assert(relevantFor(list, {}, name, NOW).length === 0 && relevantFor(list, { skills: ['rust'] }, name, NOW).length === 0, 'no signal -> nothing is "for you"');
  assert(relevantFor([list[3]], { skills: ['SQL', 'Fraud'] }, name, NOW).length === 0, 'closed challenges never appear');
});
check('skill options come only from open challenges, most common first', () => {
  assert(skillOptions(list, NOW).join() === 'SQL,Fraud,Python', skillOptions(list, NOW).join());
});
check('a zero prize is never shown as a prize; deadlines are plain and honest', () => {
  assert(prizeText({ prizeAmount: 0, prizeType: 'cash' }) === null && prizeText({ prizeAmount: undefined }) === null, 'no prize');
  assert(prizeText({ prizeAmount: 5000, prizeType: 'cash' }) === '$5K' && prizeText({ prizeAmount: 1500, prizeType: 'cash' }) === '$1.5K' && prizeText({ prizeAmount: 250, prizeType: 'cash' }) === '$250' && prizeText({ prizeAmount: 2_000_000, prizeType: 'cash' }) === '$2M', 'cash');
  assert(prizeText({ prizeAmount: 1, prizeType: 'job_offer' }) === 'Job offer' && prizeText({ prizeAmount: 1, prizeType: 'equity' }) === 'Equity prize', 'non-cash is not given a dollar figure');
  assert(deadlineText(list[0], NOW) === '3 days left' && deadlineText({ deadline: new Date(NOW + 3600_000).toISOString(), verificationStatus: 'live' }, NOW) === 'Closes today' && deadlineText(list[3], NOW) === null, 'deadlines');
});

console.log('== Prove gallery ==');
const R = (id, uid, o = {}) => ({ id, authorUid: uid, authorName: uid, pitch: 'pitch ' + id, skills: [], industries: [], createdAtMs: 1000, ...o });
const ctx = (o = {}) => ({ uid: 'me', following: new Set(['f1', 'f2']), mySkills: ['SQL'], myIndustry: 'Payments', ...o });
const reels = [R('1', 'f1', { createdAtMs: 5 }), R('2', 'f2', { createdAtMs: 9, skills: ['SQL'] }), R('3', 'x', { createdAtMs: 7, skills: ['SQL', 'Go'], industries: ['Payments'] }), R('4', 'y', { createdAtMs: 8 }), R('5', 'me', { createdAtMs: 99, skills: ['SQL'] })];
check('a new member starts on Discover; Following only once it holds enough', () => {
  assert(MEANINGFUL_FOLLOWING === 3, 'threshold');
  assert(defaultTab(reels, ctx()) === 'discover', 'two followed reels is not enough');
  assert(defaultTab([...reels, R('6', 'f1')], ctx()) === 'following', 'three is');
  assert(defaultTab(reels, ctx({ following: undefined })) === 'discover' && defaultTab([], ctx()) === 'discover', 'nobody followed, nothing at all');
  assert(defaultTab([R('a', 'me'), R('b', 'me'), R('c', 'me')], ctx({ following: new Set(['me']) })) === 'discover', 'your own reels never count as followed');
});
check('Discover is everyone else, best skills/industry match first; Newest is an explicit choice', () => {
  const ids = (t, sort = 'match', f = NO_PROVE_FILTERS) => reelsFor(t, reels, reels.filter(r => r.authorUid === 'me'), ctx(), f, sort).map(r => r.id).join();
  assert(ids('discover') === '3,2,4,1' || ids('discover') === '3,2,4,1'.replace('4,1', '4,1'), ids('discover'));
  assert(!ids('discover').includes('5'), 'never your own reels');
  assert(ids('discover', 'newest') === '2,4,3,1', ids('discover', 'newest'));
  assert(matchScore(reels[2], ctx()) === 3 && matchScore(reels[3], ctx()) === 0, 'score: shared skill 1, industry 2');
});
check('Following shows only people you follow, newest first; My Reels only yours', () => {
  assert(reelsFor('following', reels, [], ctx(), NO_PROVE_FILTERS, 'match').map(r => r.id).join() === '2,1', 'following');
  assert(reelsFor('mine', reels, reels.filter(r => r.authorUid === 'me'), ctx(), NO_PROVE_FILTERS, 'match').map(r => r.id).join() === '5', 'mine');
});
check('search covers reels, skills and professionals; skill and industry filters combine', () => {
  const f = (o) => applyFilters(reels, { ...NO_PROVE_FILTERS, ...o }).map(r => r.id).join();
  assert(f({ q: 'pitch 3' }) === '3' && f({ q: 'GO' }).includes('3') && f({ q: 'f2' }) === '2', 'q matches pitch, skill, person');
  assert(f({ skill: 'sql' }) === '2,3,5' && f({ skill: 'sql', industry: 'payments' }) === '3' && f({ skill: 'rust' }) === '', 'filters');
});
check('filter options are only values that really occur, most common first', () => {
  assert(optionsFrom(reels, r => r.skills).join() === 'SQL,Go', optionsFrom(reels, r => r.skills).join());
  assert(optionsFrom([], r => r.skills).length === 0, 'no reels, no options');
});

console.log('== regressions found in production ==');
check('the Arenas page reads challenges with a query that needs no composite index (it once ordered by date and failed to load)', () => {
  const src = readFileSync(new URL('../../lib/arenaClient.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function loadChallenges'), src.indexOf('export interface ArenaInterests'));
  assert(body.includes("where('verificationStatus', '==', 'live')"), 'filters to live challenges');
  assert(!/orderBy\(/.test(body), 'must not order by a field: that needs an index that is not built');
  assert(!src.includes("from './arenaService'") || !/getAllArenaChallenges/.test(body), 'must not go through getAllArenaChallenges (it orders by createdAt)');
  const ind = src.slice(src.indexOf('export async function loadIndustries'), src.indexOf('/** A date stored as text'));
  assert(ind.length > 50 && !/orderBy\(|where\(/.test(ind), 'industries are read without a server-side filter or order, so no index is needed');
});
check('the Community tab strip sticks at top-0: a larger offset pushes it down over the page heading inside the page\'s scroll container', () => {
  const src = readFileSync(new URL('../../components/CommunityTabs.tsx', import.meta.url), 'utf8');
  assert(/<nav[^>]*sticky top-0/.test(src) && !/<nav[^>]*sticky top-(1[0-9]|[2-9])/.test(src), 'sticky offset');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
