/**
 * scripts/migrate-application-stage.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Schema decision 2, part 2 (launch-readiness review): backfills `stage` on
 * every existing `applications` document that still carries the
 * pre-unification dual stage/status vocabulary onto the single canonical
 * vocabulary (lib/applicationStage.ts). Safe to run more than once --
 * documents already on a canonical value are left untouched.
 *
 * Dry run by default: prints what WOULD change, writes nothing, until you
 * pass --write.
 *
 * Requires your own Google Application Default Credentials or a real
 * service account key -- this repo's checked-in serviceAccountKey.json
 * (gitignored, untracked) is not a usable credential. Set up ADC first:
 *   gcloud auth application-default login
 * or point GOOGLE_APPLICATION_CREDENTIALS at a real service account key
 * file for the target project.
 *
 * Usage:
 *   node scripts/migrate-application-stage.mjs --project bewatu-dev             # dry run
 *   node scripts/migrate-application-stage.mjs --project bewatu-dev --write     # actually write
 *   node scripts/migrate-application-stage.mjs --project bewatu-2d04e           # dry run on prod
 *   node scripts/migrate-application-stage.mjs --project bewatu-2d04e --write   # write to prod
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const CANONICAL_STAGES = new Set([
  'New Applicants', 'Sourced', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected',
]);

function deriveApplicationStage(data) {
  if (data.stage && CANONICAL_STAGES.has(data.stage)) return data.stage;
  if (data.status === 'rejected') return 'Rejected';
  if (data.status === 'hired') return 'Hired';
  if (data.status === 'shortlisted') return 'Sourced';
  return 'New Applicants';
}

const args = process.argv.slice(2);
const projectFlagIdx = args.indexOf('--project');
const projectId = projectFlagIdx >= 0 ? args[projectFlagIdx + 1] : undefined;
const write = args.includes('--write');

if (!projectId) {
  console.error('Usage: node scripts/migrate-application-stage.mjs --project <bewatu-dev|bewatu-2d04e> [--write]');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

async function main() {
  console.log(`Project: ${projectId}  Mode: ${write ? 'WRITE' : 'dry run (no writes)'}\n`);

  const snap = await db.collection('applications').get();
  const changes = [];
  let batch = db.batch();
  let inBatch = 0;
  const BATCH_SIZE = 400;

  for (const doc of snap.docs) {
    const data = doc.data();
    const canonical = deriveApplicationStage(data);
    if (data.stage === canonical) continue;
    changes.push({ id: doc.id, from: data.stage ?? '(none)', status: data.status ?? '(none)', to: canonical });
    if (write) {
      batch.update(doc.ref, { stage: canonical });
      inBatch++;
      if (inBatch >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
  }
  if (write && inBatch > 0) await batch.commit();

  const byOldValue = {};
  for (const c of changes) {
    const key = `${c.from} / status=${c.status}`;
    byOldValue[key] = (byOldValue[key] ?? 0) + 1;
  }

  console.log(`Total applications: ${snap.size}`);
  console.log(`Documents needing a stage change: ${changes.length}\n`);
  console.log('Breakdown by old (stage / status):');
  for (const [key, count] of Object.entries(byOldValue)) {
    console.log(`  ${count.toString().padStart(4)}  ${key}`);
  }
  if (changes.length > 0) {
    console.log('\nFirst 10 changes:');
    changes.slice(0, 10).forEach(c => console.log(`  ${c.id}: "${c.from}" (status=${c.status}) -> "${c.to}"`));
  }
  console.log(write ? '\nWrites committed.' : '\nDry run only -- re-run with --write to apply.');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
