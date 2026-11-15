// Run: node test/posture-env/run-tests.mjs
// Guards the Vercel environment posture check: what it flags, what it deliberately ignores, and that no value is ever printed.
import { readFileSync } from 'node:fs';
import { analyzeEnv, formatReport } from '../../scripts/check-vercel-env.mjs';
let pass = 0, fail = 0;
const t = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const expected = JSON.parse(readFileSync(new URL('../../config/expected-env.json', import.meta.url), 'utf8'));
const E = (key, type = 'encrypted', target = ['production', 'preview']) => ({ key, type, target });
const good = [...expected.required, 'INVITATION_SECRET', 'SECURITY_ALERT_EMAIL', 'STRIPE_INVESTOR_WEBHOOK_SECRET', 'STRIPE_INVESTOR_PRICE_ID', 'ANTHROPIC_API_KEY'].map(k => E(k, 'sensitive'));

t('a healthy project has no findings', () => { const r = analyzeEnv(good, expected); assert(r.critical.length === 0 && r.warnings.length === 0, JSON.stringify(r)); });
t('a secret baked into the browser bundle is CRITICAL (the only thing that fails the job)', () => {
  for (const k of ['VITE_STRIPE_SECRET_KEY', 'NEXT_PUBLIC_SERVICE_ACCOUNT', 'VITE_ADMIN_TOKEN', 'VITE_DB_PASSWORD']) assert(analyzeEnv([...good, E(k)], expected).critical.length === 1, k);
});
t('public-by-design client keys are not flagged, and an ordinary client variable is fine', () => {
  const r = analyzeEnv([...good, E('VITE_FIREBASE_API_KEY'), E('VITE_SENTRY_DSN'), E('VITE_FEATURE_FLAG')], expected); assert(r.critical.length === 0 && r.warnings.length === 0, JSON.stringify(r));
  assert(analyzeEnv([...good, E('NEXT_PUBLIC_SUPABASE_URL')], expected).critical.length === 0, 'a plain URL');
});
t('a secret stored as plain text is a warning; encrypted or sensitive is fine', () => {
  assert(analyzeEnv([...good, E('NEW_API_TOKEN', 'plain')], expected).warnings.some(w => /plain/.test(w) && /NEW_API_TOKEN/.test(w)), 'plain');
  assert(analyzeEnv([...good, E('NEW_API_TOKEN', 'encrypted')], expected).warnings.length === 0 && analyzeEnv([...good, E('NEW_API_TOKEN', 'sensitive')], expected).warnings.length === 0, 'encrypted/sensitive');
});
t('missing required variables, missing either-or groups, and variables not set for Production are warnings', () => {
  const noCron = good.filter(e => e.key !== 'CRON_SECRET'); assert(analyzeEnv(noCron, expected).warnings.some(w => /CRON_SECRET is required but not set/.test(w)), 'missing');
  const previewOnly = good.map(e => (e.key === 'RESEND_API_KEY' ? { ...e, target: ['preview'] } : e)); assert(analyzeEnv(previewOnly, expected).warnings.some(w => /RESEND_API_KEY is set, but not for Production/.test(w)), 'preview only');
  const noInvite = good.filter(e => e.key !== 'INVITATION_SECRET'); assert(analyzeEnv(noInvite, expected).warnings.some(w => /INVITATION_SECRET \/ COMMS_UNSUBSCRIBE_SECRET/.test(w)), 'either-or');
  assert(analyzeEnv(good.filter(e => e.key !== 'SECURITY_ALERT_EMAIL'), expected).warnings.some(w => /SECURITY_ALERT_EMAIL \/ UPTIME_ALERT_EMAIL/.test(w)), 'alert address');
  assert(analyzeEnv(good.filter(e => e.key !== 'ANTHROPIC_API_KEY'), expected).warnings.some(w => /ANTHROPIC_API_KEY is recommended/.test(w)), 'recommended');
});
t('the report never contains a value, even when the API object carries one', () => {
  const leaky = [...good, { key: 'LEAKY_SECRET', type: 'plain', target: ['production'], value: 'SUPERSECRET-123' }];
  const r = analyzeEnv(leaky, expected); const text = formatReport(r);
  assert(!JSON.stringify(r).includes('SUPERSECRET-123') && !text.includes('SUPERSECRET-123'), 'a value reached the output');
  assert(/LEAKY_SECRET/.test(text), 'the NAME is reported');
  const src = readFileSync(new URL('../../scripts/check-vercel-env.mjs', import.meta.url), 'utf8');
  assert(/drops `value`/.test(src) && !/console\.log\([^)]*\.value/.test(src), 'the script strips value before analysing');
});
t('the expected-env file is well formed', () => { assert(Array.isArray(expected.required) && expected.required.length > 5 && expected.anyOf.every(Array.isArray) && expected.publicByDesign.includes('VITE_FIREBASE_API_KEY'), 'shape'); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
