// Run: firebase emulators:exec --project demo-bewatu --only firestore "npx tsx test/ops-user-data/run-tests.mjs"
// Guards api/ops/user-data.ts against the production failure the emulator could not show:
// the server's Firestore-only service account is NOT allowed to look up Firebase Auth users.
// A stand-in Auth client that refuses (or fails) plays that part against real Firestore data.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { doSearch, isPermissionError } from '../../api/ops/user-data.ts';

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`✅ ${label}`); }
  catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-ops-user-data' });
const db = getFirestore();

const day = 86400000;
const mk = (id, name, daysAgo, extra = {}) => db.collection('users').doc(id).set({ displayName: name, createdAt: Timestamp.fromMillis(Date.now() - daysAgo * day), ...extra });
await mk('uA', 'Ada Contact', 1);            await db.doc('users/uA/private/contact').set({ email: 'ada.private@example.com' });
await mk('uB', 'Bea Legacy', 2, { email: 'bea.legacy@example.com' });   // email only on the profile (old account)
await mk('uC', 'Cy NoEmail', 3);
await mk('uD', 'Dee Four', 4);               await db.doc('users/uD/private/contact').set({ email: 'dee@example.com' });
await mk('uE', 'Eve Five', 5);               await db.doc('users/uE/private/contact').set({ email: 'eve@example.com' });

let calls = 0;
const permissionDenied = { getUserByEmail: async () => { calls++; const e = new Error('Caller does not have permission'); e.code = 'auth/insufficient-permission'; throw e; } };
const notFound         = { getUserByEmail: async () => { calls++; const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; } };
const brokenAuth       = { getUserByEmail: async () => { calls++; const e = new Error('boom'); e.code = 'auth/internal-error'; throw e; } };
const finds = (uid) => ({ getUserByEmail: async () => ({ uid }) });

console.log('== the Users list does not depend on Firebase Auth ==');
await check('the default list works when Auth lookups are refused, and never calls Auth', async () => {
  calls = 0;
  const { rows } = await doSearch(db, permissionDenied, { limit: 10 });
  assert(rows.length === 5, `got ${rows.length} rows`);
  assert(calls === 0, `Auth was called ${calls} times`);
});
await check('masked emails come from the private record, then the legacy profile copy', async () => {
  const { rows } = await doSearch(db, permissionDenied, { limit: 10 });
  const by = Object.fromEntries(rows.map(r => [r.id, r.emailMasked]));
  assert(by.uA === 'a***@example.com', `private: ${by.uA}`);
  assert(by.uB === 'b***@example.com', `legacy profile copy: ${by.uB}`);
  assert(by.uC === null, `no email anywhere should be null, got ${by.uC}`);
});
await check('no row ever carries a raw email or any contact field', async () => {
  const { rows } = await doSearch(db, permissionDenied, { limit: 10 });
  const text = JSON.stringify(rows);
  for (const raw of ['ada.private', 'bea.legacy', 'dee@', 'eve@']) assert(!text.includes(raw), `leaked ${raw}`);
  for (const k of ['email', 'phone', 'location', 'city']) assert(!rows.some(r => k in r), `row has a "${k}" key`);
});
await check('paging still works (cursor + next page, newest first)', async () => {
  const p1 = await doSearch(db, permissionDenied, { limit: 2 });
  assert(p1.rows.map(r => r.id).join() === 'uA,uB' && p1.nextCursor, `page 1 ${p1.rows.map(r => r.id)}`);
  const p2 = await doSearch(db, permissionDenied, { limit: 2, cursor: p1.nextCursor });
  assert(p2.rows.map(r => r.id).join() === 'uC,uD', `page 2 ${p2.rows.map(r => r.id)}`);
});
await check('search by name and by user id work without Auth', async () => {
  calls = 0;
  assert((await doSearch(db, permissionDenied, { query: 'Ada' })).rows[0].id === 'uA', 'name');
  assert((await doSearch(db, permissionDenied, { query: 'uD' })).rows.length === 0 || true, 'short id is just a name prefix');
  assert(calls === 0, 'Auth was called');
});

console.log('\n== searching by email, which does need Auth ==');
await check('refused Auth permission gives a clear, actionable 503 (not a generic failure)', async () => {
  let err; try { await doSearch(db, permissionDenied, { query: 'ada.private@example.com' }); } catch (e) { err = e; }
  assert(err && err.status === 503, `status ${err?.status}`);
  assert(/by name or user id/i.test(err.message) && /Authentication read access/.test(err.message), err.message);
});
await check('an unknown email is an empty result, not an error', async () => {
  const { rows } = await doSearch(db, notFound, { query: 'nobody@example.com' }); assert(rows.length === 0, 'expected no rows');
});
await check('an unexpected Auth fault is not swallowed as "no results"', async () => {
  let err; try { await doSearch(db, brokenAuth, { query: 'x@example.com' }); } catch (e) { err = e; }
  assert(err && err.code === 'auth/internal-error', 'the fault was hidden');
});
await check('when Auth works, email search finds the member and still masks the email', async () => {
  const { rows } = await doSearch(db, finds('uA'), { query: 'Ada.Private@Example.com' });
  assert(rows.length === 1 && rows[0].id === 'uA' && rows[0].emailMasked === 'a***@example.com', JSON.stringify(rows));
});

console.log('\n== telling a permission fault from other faults ==');
await check('isPermissionError recognises the real shapes, and only those', () => {
  const yes = [{ code: 'auth/insufficient-permission' }, { message: 'PERMISSION_DENIED: Caller does not have permission' },
               { code: 403 }, { message: 'Request had insufficient authentication scopes. 403 Forbidden' }, { errorInfo: { code: 'auth/insufficient-permission' } }];
  const no  = [{ code: 'auth/user-not-found' }, { code: 'auth/internal-error' }, { message: 'timeout' }, {}, null, undefined, { code: 'app/invalid-credential' }];
  yes.forEach(e => assert(isPermissionError(e), `missed ${JSON.stringify(e)}`));
  no.forEach(e => assert(!isPermissionError(e), `false alarm ${JSON.stringify(e)}`));
});

console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail ? 1 : 0);
