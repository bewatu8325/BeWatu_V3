// Run: tsx test/portfolio/client-tests.mjs
// Guards the browser side of Share My Work: a sensible first choice, moving things, what must be filled in, and honest descriptions.
import {
  defaultConfig, move, moveSection, toggleSection, togglePick, problem, describeShare, describeViews, mailtoFor, printUrl, EXPIRIES, SECTION_KEYS, SECTION_LABEL,
} from '../../lib/portfolio.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

const SRC = {
  profile: { name: 'Ann Okoro', headline: 'Product lead', bio: 'I build payment products.', username: 'ann', isPublic: true }, email: 'ann@home.test',
  skills: Array.from({ length: 12 }, (_, i) => ({ name: 'Skill ' + i, level: 'self', endorsers: 0, note: null })),
  projects: [{ id: '1', title: 'P1', summary: '' }, { id: '2', title: 'P2', summary: '' }],
  arena: [{ id: 'r3', title: 'A', outcome: 'winner', level: 'verified' }], reels: [{ id: 'r1', caption: 'c', poster: null, duration: 30 }], achievements: [{ id: '7', text: 't', verifier: 'v' }],
  resume: true, levels: {},
};

check('a first choice uses what the member has, keeps risky things off, and is shareable as it stands', () => {
  const c = defaultConfig(SRC);
  assert(c.sections.join() === 'summary,skills,projects,arena,reels,achievements', c.sections.join());
  assert(c.selection.skills.length === 8 && c.selection.projects.length === 2, 'a sensible handful');
  assert(c.resume === false && c.contact.mode === 'none' && c.kind === 'unlisted' && c.updatePolicy === 'live' && c.expiry === '30d', 'résumé and contact are never on by default; unlisted, 30 days');
  assert(c.intro === 'I build payment products.', 'their own bio is the first draft');
  assert(problem(c, SRC) === null, 'shareable as it stands');
});
check('a member with little still gets a valid starting point; one with nothing is told what to do', () => {
  const none = { ...SRC, skills: [], projects: [], arena: [], reels: [], achievements: [], profile: { ...SRC.profile, bio: '' } };
  const c = defaultConfig(none);
  assert(c.sections.join() === 'summary', 'only the summary slot');
  assert(/Choose something/.test(problem(c, none)), 'asked to add something');
  assert(problem({ ...c, intro: 'Hello there.' }, none) === null, 'a summary alone is enough');
});
check('moving a list entry never mutates, never leaves the list, and does nothing at the ends', () => {
  const l = ['a', 'b', 'c'];
  assert(move(l, 1, -1).join() === 'b,a,c' && move(l, 1, 1).join() === 'a,c,b' && l.join() === 'a,b,c', 'swap');
  assert(move(l, 0, -1).join() === 'a,b,c' && move(l, 2, 1).join() === 'a,b,c' && move(l, 9, 1).join() === 'a,b,c' && move([], 0, 1).length === 0, 'ends and bad index');
});
check('sections move among themselves while the summary stays on top', () => {
  const s = ['summary', 'skills', 'projects', 'reels'];
  assert(moveSection(s, 'reels', -1).join() === 'summary,skills,reels,projects' && moveSection(s, 'skills', -1).join() === 'summary,skills,projects,reels', 'the first section cannot rise above the summary');
  assert(moveSection(['skills', 'projects'], 'projects', -1).join() === 'projects,skills' && moveSection(s, 'reels', 1).join() === s.join(), 'no summary, and the end');
});
check('turning a section or an item on adds it last; turning it off keeps the order of the rest; the cap holds', () => {
  assert(toggleSection(['summary', 'skills'], 'reels', true).join() === 'summary,skills,reels' && toggleSection(['summary', 'skills', 'reels'], 'skills', false).join() === 'summary,reels', 'sections');
  assert(toggleSection(['skills'], 'skills', true).join() === 'skills', 'no duplicate');
  assert(togglePick(['a', 'b'], 'c', true).join() === 'a,b,c' && togglePick(['a', 'b', 'c'], 'b', false).join() === 'a,c' && togglePick(['a', 'b'], 'a', true).join() === 'b,a', 'items');
  assert(togglePick(['1', '2', '3'], '4', true, 3).join() === '1,2,3' && togglePick(['1', '2', '3'], '2', true, 3).join() === '1,3,2', 'at the cap nothing is added and nothing is dropped');
});
check('what stops a member going on, in words', () => {
  const c = defaultConfig(SRC);
  assert(/email address/.test(problem({ ...c, contact: { mode: 'email', email: '' } }, SRC)) && /email address/.test(problem({ ...c, contact: { mode: 'email', email: 'nope' } }, SRC)) && problem({ ...c, contact: { mode: 'email', email: 'a@b.co' } }, SRC) === null, 'email mode');
  assert(/résumé/.test(problem({ ...c, resume: true }, { ...SRC, resume: false })) && problem({ ...c, resume: true }, SRC) === null, 'résumé');
  assert(/profile address/.test(problem({ ...c, kind: 'public' }, { ...SRC, profile: { ...SRC.profile, username: null } })), 'public needs an address');
  assert(/isn't public/.test(problem({ ...c, kind: 'public' }, { ...SRC, profile: { ...SRC.profile, isPublic: false } })) && problem({ ...c, kind: 'public' }, SRC) === null, 'public needs a public profile');
  assert(/Choose something/.test(problem({ ...c, sections: ['skills'], selection: { ...c.selection, skills: [] }, intro: '' }, SRC)), 'a section with nothing picked does not count');
});
check('links are described truthfully, and previews are not passed off as people', () => {
  const fmt = ms => 'D' + ms;
  assert(describeShare({ status: 'ok', kind: 'unlisted', expiresAt: 5 }, fmt) === 'Open · expires D5' && describeShare({ status: 'ok', kind: 'unlisted', expiresAt: null }, fmt) === 'Open · no expiry' && describeShare({ status: 'ok', kind: 'public', expiresAt: null }, fmt) === 'Public', 'open');
  assert(describeShare({ status: 'revoked', kind: 'unlisted', expiresAt: 5 }, fmt) === 'Switched off' && describeShare({ status: 'expired', kind: 'unlisted', expiresAt: 5 }, fmt) === 'Expired D5', 'closed');
  assert(describeViews({ human: 1, preview: 0, bot: 0 }) === '1 visit' && describeViews({ human: 4, preview: 2, bot: 1 }) === '4 visits · 3 from link previews and crawlers', 'views');
});
check('the email that carries a link is honest about an unlisted link and includes everything needed', () => {
  const m = mailtoFor({ url: 'https://www.bewatu.com/w/abc.def', name: 'Ann Okoro', label: 'Acme recruiting', kind: 'unlisted' });
  const body = decodeURIComponent(m.split('body=')[1]);
  assert(m.startsWith('mailto:?subject=') && body.includes('https://www.bewatu.com/w/abc.def') && body.includes("The link is unlisted") && body.includes("don't need an account"), body);
  assert(!decodeURIComponent(mailtoFor({ url: 'https://www.bewatu.com/be/ann/work', name: 'Ann', kind: 'public' }).split('body=')[1]).includes('unlisted'), 'a public page is not called unlisted');
  assert(printUrl('https://x/w/a') === 'https://x/w/a?print=1' && printUrl('https://x/w/a?r=1') === 'https://x/w/a?r=1&print=1', 'print link');
});
check('the sections and expiries on offer', () => {
  assert(SECTION_KEYS.every(k => SECTION_LABEL[k]) && EXPIRIES.map(e => e.id).join() === '7d,30d,90d,never', 'complete');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
