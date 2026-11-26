// Run: tsx test/cors-and-html/run-tests.mjs
// Guards the fixes for the scanner's CORS and HTML warnings, by checking the behaviour rather than the scanner's silence:
//   - a route's Access-Control-Allow-Origin is always one of its own listed sites, never the request's Origin echoed back
//   - local dev servers are allowed only outside production; no route lists localhost for production
//   - the team's contact and feedback emails escape everything a visitor typed, and keep the subject on one line
//   - a portfolio's search-engine data cannot close its <script> element, whatever the member wrote
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { corsPermitted } from '../../api/factory-token.ts';
import { renderContactEmail, contactSubject } from '../../api/contact.ts';
import { renderFeedbackEmail, feedbackSubject } from '../../api/submit-feedback.ts';
import { jsonLdScript } from '../../api/portfolio.ts';

let pass = 0, fail = 0;
async function t(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const ROOT = new URL('../../', import.meta.url).pathname;
const files = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
const API = files(ROOT + 'api').map(p => ({ rel: p.slice(ROOT.length), src: readFileSync(p, 'utf8') }));
const HOSTILE = `"><img src=x onerror=alert(1)></div><script>alert('x')</script>&amp;`;

console.log('== CORS ==');
await t('every Access-Control-Allow-Origin is a fixed site, or picked from the route\'s own list (never the request\'s value)', () => {
  const bad = [];
  for (const { rel, src } of API) for (const [i, line] of src.split('\n').entries()) {
    const m = line.match(/setHeader\(\s*'Access-Control-Allow-Origin'\s*,\s*(.+?)\);/); if (!m) continue;
    const v = m[1].trim();
    const literal = /^'https:\/\/[a-z.]+'$/.test(v);
    const picked = /^[\w.()]+\.find\(o => o === [\w.]+\) \?\? [A-Z_]+\[0\]$/.test(v);
    if (!literal && !picked) bad.push(`${rel}:${i + 1} ${v}`);
  }
  assert(!bad.length, bad.join('\n'));
});
await t('the copied <cors> block is identical in every route that carries it', () => {
  const block = src => { const m = src.match(/\/\/ <cors>\n([\s\S]*?)\/\/ <\/cors>/); return m ? m[1] : null; };
  const carriers = API.filter(f => f.src.includes('// <cors>'));
  assert(carriers.length >= 18, `only ${carriers.length} carriers`);
  const canonical = block(carriers[0].src);
  for (const f of carriers) assert(block(f.src) === canonical, `${f.rel} has a different <cors> block: copy it from ${carriers[0].rel}`);
  for (const f of carriers) assert(f.src.includes('corsPermitted(ALLOWED_ORIGINS).find(o => o === requested) ?? ALLOWED_ORIGINS[0]'), `${f.rel} carries the block but does not use it`);
});
await t('no route lists localhost among the sites allowed in production', () => {
  const bad = API.filter(f => /const ALLOWED_ORIGINS[^;]*localhost/.test(f.src)).map(f => f.rel);
  assert(!bad.length, bad.join(', '));
});
await t('local dev servers are allowed only outside production; a forged origin falls back to the first listed site', () => {
  const ALLOWED = ['https://www.bewatu.com', 'https://bewatu.com'];
  const pick = requested => { const p = corsPermitted(ALLOWED); return p.find(o => o === requested) ?? ALLOWED[0]; };
  const saved = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'production';
    assert(pick('http://localhost:5173') === 'https://www.bewatu.com', 'production must not admit localhost');
    assert(pick('https://bewatu.com') === 'https://bewatu.com', 'a listed site is answered with itself');
    for (const forged of ['https://evil.example', 'https://www.bewatu.com.evil.example', 'null', '', undefined]) assert(pick(forged) === 'https://www.bewatu.com', `forged ${forged}`);
    process.env.VERCEL_ENV = 'preview';
    assert(pick('http://localhost:5173') === 'http://localhost:5173', 'preview admits the dev server');
    assert(pick('http://localhost:9999') === 'https://www.bewatu.com', 'only the known dev ports');
  } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved; }
});

console.log('== the team\'s emails ==');
await t('contact email: name, email and message are escaped; the subject is one line', () => {
  const html = renderContactEmail({ name: HOSTILE, email: HOSTILE, message: HOSTILE });
  assert(!html.includes('<script') && !html.includes('<img'), 'raw markup got through');
  assert((html.match(/&lt;script&gt;/g) ?? []).length === 3 && html.includes('&amp;amp;'), 'every field escaped');
  assert(!/[\r\n]/.test(contactSubject('Ann\r\nBcc: x@evil.example')) && contactSubject('Ann\r\nBcc: x').startsWith('New message from Ann Bcc: x'), contactSubject('Ann\r\nBcc: x'));
});
await t('feedback email: name, email and message are escaped; the subject is one line', () => {
  const html = renderFeedbackEmail({ category: 'idea', name: HOSTILE, email: HOSTILE, text: HOSTILE, foundingMember: true });
  assert(!html.includes('<script') && !html.includes('<img'), 'raw markup got through');
  assert((html.match(/&lt;script&gt;/g) ?? []).length === 3 && html.includes('Founding Member'), 'every field escaped');
  assert(!renderFeedbackEmail({ category: 'idea', name: 'A', email: null, text: 'x', foundingMember: false }).includes('&lt;'), 'no email, no brackets');
  assert(!/[\r\n]/.test(feedbackSubject('idea', 'Ann\nBcc: x')), 'subject');
});

console.log('== portfolio search data ==');
await t('JSON-LD cannot close its <script> element, and reads back exactly what the member wrote', () => {
  const data = { name: `</script><script>alert(1)</script>`, about: 'Tom & Jerry > cats \u2028 line' };
  const out = jsonLdScript(data);
  assert(out.startsWith('<script type="application/ld+json">') && out.endsWith('</script>'), out);
  assert((out.match(/<\/script/gi) ?? []).length === 1 && (out.match(/<script/gi) ?? []).length === 1, 'one element only: ' + out);
  const inner = out.slice('<script type="application/ld+json">'.length, -'</script>'.length);
  assert(!/[<>&\u2028\u2029]/.test(inner), 'unescaped character inside');
  assert(JSON.stringify(JSON.parse(inner)) === JSON.stringify(data), 'round trip');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
