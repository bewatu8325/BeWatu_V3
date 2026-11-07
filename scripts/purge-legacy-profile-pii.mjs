#!/usr/bin/env node
/**
 * scripts/purge-legacy-profile-pii.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off migration: move contact details that older accounts still carry on
 * their PUBLIC profile document (users/{uid}) into the owner-only record
 * users/{uid}/private/contact, then remove them from the profile.
 *
 * Why: the profile document is readable by every signed-in member (and, for
 * public profiles, by anyone). The app moved email / phone / location into
 * users/{uid}/private/contact a while ago, but accounts created before that
 * kept their old copies on the profile. The app itself reads only the private
 * record (lib/firebaseAuth.ts docToUser), so the profile copies are dead data
 * that is nonetheless readable by everyone. scripts/scan-plaintext-pii.mjs is
 * what found them.
 *
 * Fields handled: email, phone, location, city, state, country.
 * Deliberately NOT touched: stripeCustomerId. A legacy Stripe webhook
 * (api/stripe-webhook.ts) still finds customers by that field on the profile
 * document, so moving it could stop subscription updates. It is only counted
 * in the report.
 *
 * Safety:
 *   - DRY RUN BY DEFAULT. Nothing is written unless you pass --apply (and --yes
 *     for a real project).
 *   - Never overwrites. If the private record already holds a DIFFERENT value
 *     for a field, that field is reported as a conflict and left exactly as it
 *     is, in both places, for a human to decide.
 *   - Never loses data. A profile copy is only deleted in the same transaction
 *     that writes it to the private record (or after confirming the private
 *     record already holds the same value).
 *   - Never prints or stores a value. Output is user ids, field names and
 *     counts. (Nothing is exported to a file, so there is no new plaintext copy.)
 *   - Idempotent: re-running after --apply finds nothing to do.
 *   - Every changed account gets an audit_log entry (user.legacy_pii_moved).
 *
 * Needs your own credentials, like the other scripts:
 *   gcloud auth application-default login
 *
 * Suggested order:
 *   node scripts/purge-legacy-profile-pii.mjs --project bewatu-2d04e --yes            # dry run, see the plan
 *   node scripts/purge-legacy-profile-pii.mjs --project bewatu-2d04e --yes --apply --uids <one uid>   # try ONE account
 *   node scripts/purge-legacy-profile-pii.mjs --project bewatu-2d04e --yes --apply    # the rest
 *   node scripts/scan-plaintext-pii.mjs --project bewatu-2d04e --yes --only users     # confirm it is clean
 *
 * Options:
 *   --project <id>   required
 *   --yes            required for a real project (not for the emulator)
 *   --apply          actually write (default is a dry run)
 *   --uids a,b       only these accounts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { pathToFileURL } from 'node:url';

export const LEGACY_FIELDS = ['email', 'phone', 'location', 'city', 'state', 'country'];

const isSet = (v) => (typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null);
function sameValue(field, a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    const x = a.trim(), y = b.trim();
    return field === 'email' ? x.toLowerCase() === y.toLowerCase() : x === y;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Decide, per legacy field present on the profile (`main`), what to do given
 * the owner-only record (`priv`).
 *   move       private has no value: copy it there, then remove from profile
 *   duplicate  private already holds the same value: just remove from profile
 *   conflict   private holds a different value: change nothing, flag for a human
 */
export function planFields(main, priv) {
  const plan = { move: [], duplicate: [], conflict: [] };
  for (const f of LEGACY_FIELDS) {
    if (!isSet(main?.[f])) continue;
    if (!isSet(priv?.[f])) plan.move.push(f);
    else if (sameValue(f, main[f], priv[f])) plan.duplicate.push(f);
    else plan.conflict.push(f);
  }
  return plan;
}

export const hasWork = (plan) => plan.move.length + plan.duplicate.length > 0;
export const describePlan = (plan) =>
  [...plan.move.map(f => `${f}:move`), ...plan.duplicate.map(f => `${f}:duplicate`), ...plan.conflict.map(f => `${f}:CONFLICT`)].join(' ');

/** Apply one account's plan atomically. Re-reads inside the transaction so it never acts on stale data. */
export async function migrateUser(db, FieldValue, uid) {
  const mainRef = db.collection('users').doc(uid);
  const privRef = mainRef.collection('private').doc('contact');
  return db.runTransaction(async (tx) => {
    const [mainSnap, privSnap] = await Promise.all([tx.get(mainRef), tx.get(privRef)]);
    const main = mainSnap.data() ?? {};
    const priv = privSnap.data() ?? {};
    const plan = planFields(main, priv);
    if (!hasWork(plan)) return { plan, changed: false };
    if (plan.move.length) {
      const copy = {};
      for (const f of plan.move) copy[f] = main[f];
      tx.set(privRef, copy, { merge: true });
    }
    const removal = {};
    for (const f of [...plan.move, ...plan.duplicate]) removal[f] = FieldValue.delete();
    tx.update(mainRef, removal);
    return { plan, changed: true };
  });
}

function parseArgs(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
  return {
    project: get('--project'),
    yes: argv.includes('--yes'),
    apply: argv.includes('--apply'),
    uids: (get('--uids') ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (!opts.project) {
    console.error('Usage: node scripts/purge-legacy-profile-pii.mjs --project <bewatu-dev|bewatu-2d04e> --yes [--apply] [--uids a,b]');
    process.exit(2);
  }
  if (!emulator && !opts.yes) {
    console.error(`This will READ the users in the live project "${opts.project}"${opts.apply ? ' and WRITE changes to them' : ' (dry run: nothing will be written)'}.`);
    console.error('Re-run with --yes to proceed.');
    process.exit(2);
  }

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  initializeApp(emulator ? { projectId: opts.project } : { credential: applicationDefault(), projectId: opts.project });
  const db = getFirestore();

  console.log(`Project: ${opts.project}${emulator ? ' (emulator)' : ''} | mode: ${opts.apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);

  // 1. Find accounts that still carry legacy fields on the profile document.
  const candidates = [];
  let examined = 0, stripeOnProfile = 0;
  const consider = (snap) => {
    examined++;
    const d = snap.data() ?? {};
    if (isSet(d.stripeCustomerId)) stripeOnProfile++;
    if (LEGACY_FIELDS.some(f => isSet(d[f]))) candidates.push(snap.id);
  };
  if (opts.uids.length) {
    for (const uid of opts.uids) { const s = await db.collection('users').doc(uid).get(); if (s.exists) consider(s); else console.log(`(no such user: ${uid})`); }
  } else {
    for await (const snap of db.collection('users').stream()) consider(snap);
  }

  // 2. Plan each (read-only), then optionally apply.
  const rows = [];
  let wouldChange = 0, conflicts = 0;
  for (const uid of candidates) {
    const [m, p] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('users').doc(uid).collection('private').doc('contact').get(),
    ]);
    const plan = planFields(m.data(), p.data());
    if (hasWork(plan)) wouldChange++;
    if (plan.conflict.length) conflicts++;
    rows.push({ uid, plan, status: 'planned' });
  }

  if (opts.apply) {
    for (const row of rows) {
      if (!hasWork(row.plan)) { row.status = 'nothing to do'; continue; }
      try {
        const res = await migrateUser(db, FieldValue, row.uid);
        row.plan = res.plan;
        row.status = res.changed ? 'MIGRATED' : 'nothing to do';
        if (res.changed) {
          await db.collection('audit_log').add({
            action: 'user.legacy_pii_moved', actorUid: 'script', actorEmail: 'scripts/purge-legacy-profile-pii.mjs', actorRole: 'system',
            targetId: row.uid, targetType: 'user', before: null,
            after: { moved: res.plan.move, removedDuplicates: res.plan.duplicate, conflicts: res.plan.conflict },
            reason: 'Move legacy contact details off the public profile document into users/{uid}/private/contact',
            ip: 'script', requiresApproval: false, approved: false, ts: FieldValue.serverTimestamp(),
          });
        }
      } catch (err) {
        row.status = `FAILED (${err?.code ?? 'error'})`;
      }
    }
  }

  // 3. Report (ids, field names, actions only; never values).
  console.log(`\nUsers examined: ${examined} | with legacy contact fields on the profile: ${candidates.length}`);
  if (rows.length) {
    console.log('');
    for (const r of rows) console.log(`${r.uid.padEnd(30)} ${describePlan(r.plan)}${opts.apply ? `   -> ${r.status}` : ''}`);
  }
  const failed = rows.filter(r => r.status.startsWith('FAILED')).length;
  const migrated = rows.filter(r => r.status === 'MIGRATED').length;
  console.log(`\n${opts.apply ? `Migrated: ${migrated} | failed: ${failed} | ` : `Would change: ${wouldChange} account(s) | `}conflicts needing a human: ${conflicts}`);
  if (stripeOnProfile) console.log(`Note: ${stripeOnProfile} profile(s) carry a stripeCustomerId. Left alone on purpose (a legacy webhook still reads it from the profile).`);
  if (!opts.apply && wouldChange) console.log('\nDry run only. Nothing was written. Try one account first:  --apply --uids <uid>');
  if (opts.apply && !failed) console.log('\nDone. Re-run without --apply to confirm nothing is left, then re-run scripts/scan-plaintext-pii.mjs.');
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error('Failed:', err?.code ?? err?.message ?? 'unknown error'); process.exit(1); });
}
