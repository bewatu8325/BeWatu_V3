/**
 * cleanup-fake-companies.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Deletes auto-created companies that were created from user names/headlines
 * (i.e. companies with no website, no domain, source !== 'cosentiment',
 *  and adminUid matching a user's UID).
 *
 * Usage:
 *   node cleanup-fake-companies.mjs           # preview only
 *   node cleanup-fake-companies.mjs --delete  # actually delete
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const SERVICE_ACCOUNT = './service-account.json';
const LIVE_DELETE = process.argv.includes('--delete');

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  console.log('🧹 BeWatu Fake Company Cleanup');
  console.log(`   Mode: ${LIVE_DELETE ? 'LIVE DELETE' : 'PREVIEW (pass --delete to actually delete)'}\n`);

  const snap = await db.collection('companies').get();
  const toDelete = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    // A fake company has no website, no domain, and was not seeded from CoSentiment
    const isFake = (
      !data.website &&
      !data.domain &&
      data.source !== 'cosentiment' &&
      !data.claimed
    );

    if (isFake) {
      console.log(`🗑️  ${LIVE_DELETE ? 'Deleting' : 'Would delete'}: "${data.name}" (id: ${doc.id})`);
      toDelete.push(doc.ref);
    } else {
      console.log(`✅ Keeping: "${data.name}"`);
    }
  }

  console.log(`\nTotal to delete: ${toDelete.length}`);

  if (LIVE_DELETE && toDelete.length > 0) {
    const batch = db.batch();
    toDelete.forEach(ref => batch.delete(ref));
    await batch.commit();
    console.log('✅ Deleted successfully');
  } else if (!LIVE_DELETE) {
    console.log('\nRun with --delete to actually delete these companies');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
