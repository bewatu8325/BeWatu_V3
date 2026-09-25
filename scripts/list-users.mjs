/**
 * scripts/list-users.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Launch-readiness review, Phase 4 (test-account cleanup): lists every
 * document in the `users` collection so you can see the full picture and
 * decide which ones are junk/duplicate test accounts before anything gets
 * deleted. Read-only -- writes nothing.
 *
 * For each user, also counts how many `posts` documents reference them as
 * author, so you know the blast radius of deleting a given account.
 *
 * Requires your own Google Application Default Credentials:
 *   gcloud auth application-default login
 * or point GOOGLE_APPLICATION_CREDENTIALS at a real service account key file
 * for the target project.
 *
 * Usage:
 *   node scripts/list-users.mjs --project bewatu-dev
 *   node scripts/list-users.mjs --project bewatu-2d04e
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const projectFlagIndex = args.indexOf('--project');
const projectId = projectFlagIndex !== -1 ? args[projectFlagIndex + 1] : null;

if (!projectId) {
  console.error('Usage: node scripts/list-users.mjs --project <bewatu-dev|bewatu-2d04e>');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

async function main() {
  const usersSnap = await db.collection('users').orderBy('createdAt', 'desc').get();
  const postsSnap = await db.collection('posts').get();

  const postCountByAuthorId = new Map();
  postsSnap.docs.forEach(d => {
    const authorId = d.data().authorId;
    if (authorId == null) return;
    postCountByAuthorId.set(authorId, (postCountByAuthorId.get(authorId) ?? 0) + 1);
  });

  console.log(`Project: ${projectId}`);
  console.log(`Total users: ${usersSnap.size}\n`);

  usersSnap.docs.forEach(d => {
    const data = d.data();
    const numericId = data.numericId ?? '(none)';
    const posts = postCountByAuthorId.get(data.numericId) ?? 0;
    const createdAt = data.createdAt?.toDate?.()?.toISOString() ?? '(no createdAt)';
    console.log(
      `docId=${d.id}\n` +
      `  numericId=${numericId}  isRecruiter=${!!data.isRecruiter}  posts=${posts}\n` +
      `  displayName=${JSON.stringify(data.displayName ?? '')}\n` +
      `  headline=${JSON.stringify(data.headline ?? '')}\n` +
      `  bio=${JSON.stringify((data.bio ?? '').slice(0, 60))}\n` +
      `  createdAt=${createdAt}\n`
    );
  });
}

main().catch(err => {
  console.error('Error listing users:', err);
  process.exit(1);
});
