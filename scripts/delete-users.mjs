/**
 * scripts/delete-users.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Launch-readiness review, Phase 4 (test-account cleanup): deletes specific
 * `users` documents by ID, plus any `posts` authored by them (so a deleted
 * account doesn't leave a dangling post in the Feed). Only ever touches the
 * exact doc IDs you pass in -- no name matching, no "delete everything that
 * looks like a test account" heuristic, so review scripts/list-users.mjs's
 * output first and pick IDs deliberately.
 *
 * Does NOT touch connectionRequests, circle membership, or messages
 * involving the deleted user -- for throwaway pre-beta test accounts with no
 * real conversations, that residue is harmless; if any of these accounts
 * turn out to have real connections/messages, reconsider before deleting.
 *
 * Dry run by default: prints what WOULD be deleted, deletes nothing, until
 * you pass --execute.
 *
 * Requires your own Google Application Default Credentials:
 *   gcloud auth application-default login
 * or point GOOGLE_APPLICATION_CREDENTIALS at a real service account key file
 * for the target project.
 *
 * Usage:
 *   node scripts/delete-users.mjs --project bewatu-2d04e docId1 docId2 docId3            # dry run
 *   node scripts/delete-users.mjs --project bewatu-2d04e docId1 docId2 docId3 --execute  # actually delete
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const projectFlagIndex = args.indexOf('--project');
const projectId = projectFlagIndex !== -1 ? args[projectFlagIndex + 1] : null;
const execute = args.includes('--execute');
const docIds = args.filter((a, i) =>
  a !== '--execute' &&
  a !== projectId &&
  args[i - 1] !== '--project'
);

if (!projectId || docIds.length === 0) {
  console.error('Usage: node scripts/delete-users.mjs --project <bewatu-dev|bewatu-2d04e> <docId> [docId...] [--execute]');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

async function main() {
  console.log(`Project: ${projectId}`);
  console.log(execute ? 'Mode: EXECUTE (will delete)' : 'Mode: DRY RUN (nothing will be deleted)');
  console.log(`Target doc IDs: ${docIds.join(', ')}\n`);

  for (const docId of docIds) {
    const userRef = db.collection('users').doc(docId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      console.log(`  [skip] users/${docId} does not exist`);
      continue;
    }
    const data = userSnap.data();
    const numericId = data.numericId;
    console.log(`  users/${docId}  displayName=${JSON.stringify(data.displayName ?? '')}  numericId=${numericId}`);

    const postsSnap = numericId != null
      ? await db.collection('posts').where('authorId', '==', numericId).get()
      : { docs: [] };
    postsSnap.docs.forEach(p => console.log(`    -> would also delete posts/${p.id}`));

    if (execute) {
      const batch = db.batch();
      batch.delete(userRef);
      postsSnap.docs.forEach(p => batch.delete(p.ref));
      await batch.commit();
      console.log(`    deleted.`);
    }
  }

  if (!execute) {
    console.log('\nDry run complete. Re-run with --execute to actually delete.');
  }
}

main().catch(err => {
  console.error('Error deleting users:', err);
  process.exit(1);
});
