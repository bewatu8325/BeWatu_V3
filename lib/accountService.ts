// src/lib/accountService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Account deletion and data portability functions.
//
// DELETION FLOW:
//   1. softDeleteAccount()  — called immediately when user confirms
//      - Sets status: 'pending_deletion', deletedAt on users/{uid}
//      - Anonymises display fields (name, email, photo, bio, headline)
//      - Anonymises users/{uid}/private/contact (real email/phone/location —
//        see the P1 fix below for why this is a separate step)
//      - Removes from connections, circles, pods
//      - Signs user out
//
//   2. Hard delete after scheduledHardDeleteAt (1 year) — handled by the
//      scheduled Cloud Function functions/src/index.ts's scheduledHardDelete
//      (launch-readiness review — this used to say "to be built separately"
//      and nothing ever read scheduledHardDeleteAt at all; that function now
//      exists, deployed dry-run-only until explicitly enabled — see its own
//      header comment for the safety reasoning).
//
// DATA PORTABILITY:
//   exportUserData() — returns a JSON object with all user data
//   triggeredFromProfile() — downloads as bewatu-data.json
//   (as of the launch-readiness review, the real self-service path calls
//   this server-side, from functions/src/index.ts's onDataRequestCreated —
//   see components/DataRequestModal.tsx's header comment for the full flow)
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ── Soft Delete ────────────────────────────────────────────────────────────────

export async function softDeleteAccount(uid: string): Promise<void> {
  const batch = writeBatch(db);
  const userRef = doc(db, 'users', uid);

  // P1 fix (launch-readiness review): this function anonymised email/phone/
  // location by writing them onto the MAIN users/{uid} doc — but the P0 2
  // fix earlier in this same review moved those exact fields off the main
  // doc entirely, into users/{uid}/private/contact. That made this step a
  // dead write: it touched fields that no longer exist on the main doc,
  // while the caller's real email/phone/location sat in the private
  // subcollection completely untouched — a "deleted" account's actual PII
  // was never anonymised at all. stripeCustomerId is deliberately left
  // alone here, matching the deletion modal's own stated policy ("billing
  // records required by law, retained 7 years").
  batch.set(
    doc(db, 'users', uid, 'private', 'contact'),
    { email: `deleted_${uid}@bewatu.invalid`, phone: '', location: '', updatedAt: serverTimestamp() },
    { merge: true }
  );
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) throw new Error('User not found');

  // 1. Anonymise and mark user doc for deletion
  batch.update(userRef, {
    status:         'pending_deletion',
    deletedAt:      serverTimestamp(),
    scheduledHardDeleteAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    // Anonymise personal fields immediately
    displayName:    'Deleted User',
    name:           'Deleted User',
    email:          `deleted_${uid}@bewatu.invalid`,
    photoURL:       '',
    avatarUrl:      '',
    bio:            '',
    headline:       '',
    location:       '',
    website:        '',
    phone:          '',
    skills:         [],
    professionalGoals: [],
    microIntroductionUrl: null,
    microIntroductionThumbnail: null,
    resumeUrl:      null,
    isPublic:       false,
    factoryAccess:  false,
  });

  // 2. Remove from connections (mark as deleted, not hard delete — preserves history shape)
  const sentConnections = await getDocs(
    query(collection(db, 'connections'), where('senderUid', '==', uid))
  );
  const receivedConnections = await getDocs(
    query(collection(db, 'connections'), where('receiverUid', '==', uid))
  );
  [...sentConnections.docs, ...receivedConnections.docs].forEach(d => {
    batch.update(d.ref, { status: 'deleted', deletedAt: serverTimestamp() });
  });

  // 3. Remove from circles — pull uid from members array
  const circles = await getDocs(
    query(collection(db, 'circles'), where('members', 'array-contains', uid))
  );
  circles.docs.forEach(d => {
    const members = (d.data().members ?? []).filter((m: string) => m !== uid);
    batch.update(d.ref, { members });
  });

  // 4. Anonymise posts (don't delete — preserves conversation threads)
  const posts = await getDocs(
    query(collection(db, 'posts'), where('authorUid', '==', uid))
  );
  posts.docs.forEach(d => {
    batch.update(d.ref, {
      authorName:   'Deleted User',
      authorAvatar: '',
      isAnonymised: true,
    });
  });

  await batch.commit();
}

// ── Data Export ────────────────────────────────────────────────────────────────

export interface UserDataExport {
  exportedAt:   string;
  profile:      Record<string, any>;
  posts:        any[];
  connections:  any[];
  messages:     any[];
  jobs:         any[];
  circles:      any[];
  applications: any[];
}

export async function exportUserData(uid: string, numericId: number): Promise<UserDataExport> {
  const [
    userSnap,
    postsSnap,
    sentConnSnap,
    receivedConnSnap,
    sentMsgSnap,
    receivedMsgSnap,
    jobsSnap,
    circlesSnap,
  ] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDocs(query(collection(db, 'posts'), where('authorUid', '==', uid))),
    getDocs(query(collection(db, 'connections'), where('senderUid', '==', uid))),
    getDocs(query(collection(db, 'connections'), where('receiverUid', '==', uid))),
    getDocs(query(collection(db, 'messages'), where('senderUid', '==', uid))),
    getDocs(query(collection(db, 'messages'), where('receiverUid', '==', uid))),
    getDocs(query(collection(db, 'jobs'), where('recruiterId', '==', uid))),
    getDocs(query(collection(db, 'circles'), where('members', 'array-contains', uid))),
  ]);

  // Strip internal fields from profile
  const profileData = userSnap.exists() ? userSnap.data() : {};
  const { stripeCustomerId, subscriptionId, _firestoreUid, ...safeProfile } = profileData as any;

  return {
    exportedAt:   new Date().toISOString(),
    profile:      safeProfile,
    posts:        postsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    connections:  [
      ...sentConnSnap.docs.map(d => ({ id: d.id, direction: 'sent', ...d.data() })),
      ...receivedConnSnap.docs.map(d => ({ id: d.id, direction: 'received', ...d.data() })),
    ],
    messages:     [
      ...sentMsgSnap.docs.map(d => ({ id: d.id, direction: 'sent', ...d.data() })),
      ...receivedMsgSnap.docs.map(d => ({ id: d.id, direction: 'received', ...d.data() })),
    ],
    jobs:         jobsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    circles:      circlesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    applications: [], // populated separately if needed
  };
}

// ── Download helper ────────────────────────────────────────────────────────────

export function downloadDataAsJson(data: UserDataExport): void {
  const json    = JSON.stringify(data, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const anchor  = document.createElement('a');
  anchor.href   = url;
  anchor.download = `bewatu-data-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
