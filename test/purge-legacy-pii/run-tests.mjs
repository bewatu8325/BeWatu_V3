// Unit checks:        node test/purge-legacy-pii/run-tests.mjs
// Plus emulator run:  firebase emulators:exec --project demo-bewatu --only firestore "node test/purge-legacy-pii/run-tests.mjs"
// Guards scripts/purge-legacy-profile-pii.mjs, the first script here that WRITES to user data.
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { planFields, hasWork, describePlan, migrateUser, LEGACY_FIELDS } from '../../scripts/purge-legacy-profile-pii.mjs';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}`);

console.log('== planning (pure) ==');
await check('a field only on the profile is moved', () => eq(planFields({ email: 'a@x.com' }, {}).move, ['email'], 'move'));
await check('the same value already in the private record is a duplicate (removed, not copied)', () => {
  const p = planFields({ email: 'A@X.com', city: ' Paris ' }, { email: 'a@x.com', city: 'Paris' });
  eq(p.duplicate.sort(), ['city', 'email'], 'duplicate'); eq(p.move, [], 'move');
});
await check('a DIFFERENT value in the private record is a conflict and is never overwritten', () => {
  const p = planFields({ email: 'a@x.com' }, { email: 'b@x.com' });
  eq(p.conflict, ['email'], 'conflict'); assert(!hasWork(p), 'a conflict alone must not trigger any write');
});
await check('empty, null and missing values are ignored', () => assert(!hasWork(planFields({ email: '', phone: null, city: '   ' }, {})), 'acted on empty values'));
await check('only the listed legacy fields are ever considered', () => {
  const p = planFields({ displayName: 'x', bio: 'y', stripeCustomerId: 'cus_1', headline: 'z', email: 'a@x.com' }, {});
  eq(p.move, ['email'], 'only email');
  assert(!LEGACY_FIELDS.includes('stripeCustomerId'), 'stripeCustomerId must stay out of scope');
});
await check('describePlan names fields and actions but carries no values', () => {
  const text = describePlan(planFields({ email: 'secret@x.com', phone: '+1 555 010 0100' }, { phone: '+1 555 010 0100' }));
  assert(text === 'email:move phone:duplicate', text); assert(!/secret|555/.test(text), 'leaked a value');
});

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('\n(Emulator not running: skipping the end-to-end checks. Use firebase emulators:exec to run them.)');
  console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
  process.exit(fail ? 1 : 0);
}

console.log('\n== end to end against the emulator (real CLI) ==');
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const project = 'demo-purge-' + crypto.randomBytes(3).toString('hex');
initializeApp({ projectId: project });
const db = getFirestore();
const user = (id) => db.collection('users').doc(id);
const priv = (id) => user(id).collection('private').doc('contact');

await user('moveAll').set({ displayName: 'Move All', email: 'move.SECRET@x.com', phone: '+1 555 010 1111', city: 'Springfield', country: 'US' });
await user('dup').set({ displayName: 'Dup', email: 'DUP.SECRET@x.com' });                await priv('dup').set({ email: 'dup.secret@x.com' });
await user('conflict').set({ displayName: 'Conflict', email: 'one.SECRET@x.com', phone: '+1 555 010 2222' }); await priv('conflict').set({ email: 'two.SECRET@x.com' });
await user('mixed').set({ displayName: 'Mixed', email: 'mixed.SECRET@x.com' });           await priv('mixed').set({ location: 'Keep Me', phone: '+1 555 010 3333' });
await user('clean').set({ displayName: 'Clean', headline: 'Builder' });
await user('stripe').set({ displayName: 'Stripe', stripeCustomerId: 'cus_SECRET123' });
await user('empty').set({ displayName: 'Empty', email: '', phone: null });

async function fingerprint() {
  const out = [];
  for (const col of ['users']) {
    const snap = await db.collection(col).get();
    for (const d of snap.docs) {
      out.push([d.ref.path, d.updateTime.toMillis()]);
      for (const sub of await d.ref.listCollections()) for (const s of (await sub.get()).docs) out.push([s.ref.path, s.updateTime.toMillis()]);
    }
  }
  const audit = await db.collection('audit_log').get();
  return JSON.stringify([out.sort(), audit.size]);
}
const run = (args, env = {}) => spawnSync('node', ['scripts/purge-legacy-profile-pii.mjs', '--project', project, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
const SECRETS = ['SECRET', '555 010', 'Springfield', 'Keep Me', 'cus_'];
const noLeak = (r) => SECRETS.forEach(s => assert(!(r.stdout + r.stderr).includes(s), `output leaked "${s}"`));

await check('DRY RUN: lists the plan, flags the conflict, writes nothing, leaks nothing', async () => {
  const before = await fingerprint();
  const r = run([]);
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  for (const id of ['moveAll', 'dup', 'conflict', 'mixed']) assert(r.stdout.includes(id), `plan is missing ${id}`);
  assert(r.stdout.includes('moveAll') && /moveAll\s+email:move phone:move city:move country:move/.test(r.stdout), 'wrong plan for moveAll');
  assert(r.stdout.includes('email:CONFLICT'), 'conflict not flagged');
  assert(/Would change: 4 account\(s\)/.test(r.stdout) && /conflicts needing a human: 1/.test(r.stdout), r.stdout);
  assert(/1 profile\(s\) carry a stripeCustomerId/.test(r.stdout), 'stripe note missing');
  assert(!r.stdout.includes('clean ') && !r.stdout.includes('empty '), 'listed an account with nothing to do');
  noLeak(r);
  assert((await fingerprint()) === before, 'a dry run changed data');
});
await check('without --yes a real project is refused before connecting (exit 2)', () => {
  const r = spawnSync('node', ['scripts/purge-legacy-profile-pii.mjs', '--project', 'bewatu-2d04e', '--apply'], { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '' } });
  assert(r.status === 2 && /--yes/.test(r.stderr), `exit ${r.status}: ${r.stderr}`);
});
await check('APPLY on one account touches only that account', async () => {
  const r = run(['--apply', '--uids', 'moveAll']);
  assert(r.status === 0 && /Migrated: 1/.test(r.stdout), r.stdout); noLeak(r);
  const m = (await user('moveAll').get()).data(), p = (await priv('moveAll').get()).data();
  for (const f of ['email', 'phone', 'city', 'country']) assert(!(f in m), `${f} still on the profile`);
  eq(m.displayName, 'Move All', 'unrelated profile field changed');
  eq([p.email, p.phone, p.city, p.country], ['move.SECRET@x.com', '+1 555 010 1111', 'Springfield', 'US'], 'private copy wrong');
  assert((await user('dup').get()).data().email === 'DUP.SECRET@x.com', 'another account was changed');
});
await check('APPLY on everyone: moves, de-duplicates, merges, leaves conflicts and everything else alone', async () => {
  const r = run(['--apply']);
  assert(r.status === 0 && /Migrated: 3/.test(r.stdout), r.stdout); noLeak(r);
  const dupMain = (await user('dup').get()).data(), dupPriv = (await priv('dup').get()).data();
  assert(!('email' in dupMain) && dupPriv.email === 'dup.secret@x.com', 'duplicate handled wrong');
  const mixMain = (await user('mixed').get()).data(), mixPriv = (await priv('mixed').get()).data();
  assert(!('email' in mixMain), 'mixed: email left on profile');
  eq([mixPriv.email, mixPriv.location, mixPriv.phone], ['mixed.SECRET@x.com', 'Keep Me', '+1 555 010 3333'], 'mixed: private record not merged correctly');
  const cMain = (await user('conflict').get()).data(), cPriv = (await priv('conflict').get()).data();
  assert(cMain.email === 'one.SECRET@x.com' && cPriv.email === 'two.SECRET@x.com', 'conflicting values were overwritten or deleted');
  assert(!('phone' in cMain) && cPriv.phone === '+1 555 010 2222', 'the non-conflicting phone should still move');
  assert((await user('stripe').get()).data().stripeCustomerId === 'cus_SECRET123', 'stripeCustomerId was touched');
  eq((await user('clean').get()).data(), { displayName: 'Clean', headline: 'Builder' }, 'clean account changed');
  eq((await user('empty').get()).data(), { displayName: 'Empty', email: '', phone: null }, 'empty-value account changed');
});
await check('every migrated account has an audit entry, with field names only', async () => {
  const snap = await db.collection('audit_log').where('action', '==', 'user.legacy_pii_moved').get();
  eq(snap.docs.map(d => d.data().targetId).sort(), ['conflict', 'dup', 'mixed', 'moveAll'], 'audited accounts');
  assert(!JSON.stringify(snap.docs.map(d => d.data())).includes('SECRET'), 'audit entry holds a value');
});
await check('re-running is a no-op (idempotent), and only the conflict is left for a human', async () => {
  const before = await fingerprint();
  const r = run(['--apply']);
  assert(r.status === 0 && /Migrated: 0/.test(r.stdout) && /conflicts needing a human: 1/.test(r.stdout), r.stdout);
  assert((await fingerprint()) === before, 're-run changed data');
});
await check('migrateUser re-reads inside the transaction (never acts on a stale plan)', async () => {
  await user('race').set({ displayName: 'Race', email: 'race.SECRET@x.com' });
  await priv('race').set({ email: 'someone.else@x.com' }); // arrives "after planning"
  const res = await migrateUser(db, FieldValue, 'race');
  assert(!res.changed && res.plan.conflict[0] === 'email', 'acted on an outdated assumption');
  assert((await user('race').get()).data().email === 'race.SECRET@x.com', 'profile value was deleted despite a conflict');
});

console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail ? 1 : 0);
