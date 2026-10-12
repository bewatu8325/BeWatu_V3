/**
 * lib/generationalFeatures.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore service functions for all generational bridge features:
 *   - Perspective posts
 *   - Wisdom threads
 *   - Generational pods
 *
 * Collections:
 *   perspective_posts    — { question, context, seekingFrom, responses[], authorUid, ... }
 *   wisdom_threads       — { headline, theLesson, theContext, doingItAgain, whoNeedsThis, ... }
 *   circles (podType: 'generational') — generational pods, merged with Pods tab
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, addDoc, setDoc, getDocs, getDoc, doc, updateDoc,
  query, orderBy, limit, arrayUnion, increment,
  serverTimestamp, where, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

import type { PerspectivePostData, PerspectiveResponse, GenerationTag } from '../components/PerspectivePost';
import type { WisdomThreadData }                                         from '../components/WisdomThread';
import type { GenerationalPodData, CareerStage }                        from '../components/GenerationalPod';

// ─────────────────────────────────────────────────────────────────────────────
// PERSPECTIVE POSTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createPerspectivePost(
  question:    string,
  context:     string,
  seekingFrom: GenerationTag[],
  author:      { uid: string; numericId: number; name: string; avatarUrl?: string }
): Promise<PerspectivePostData> {
  const ref = await addDoc(collection(db, 'perspective_posts'), {
    question,
    context,
    seekingFrom,
    authorUid:    author.uid,
    authorId:     author.numericId,
    authorName:   author.name,
    authorAvatar: author.avatarUrl ?? null,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  });

  return {
    id:           ref.id,
    authorId:     author.numericId,
    authorName:   author.name,
    authorAvatar: author.avatarUrl,
    question,
    context,
    seekingFrom,
    responses:    [],
    createdAt:    new Date(),
    _firestoreId: ref.id,
  };
}

// P1 fix (launch-readiness review): responses used to be an array field on
// the post doc itself, written via arrayUnion() — any authed non-owner
// could overwrite the whole array in one write (delete every response,
// tamper with one, inject fakes), because Firestore's rules language can't
// verify "the one new element" in a list diff. Real fix: a subcollection,
// same pattern as posts/{id}/comments and this file's own helpful_votes —
// ownership is now enforced per-document, the same way it already was
// everywhere else in this codebase.
//
// Also fixes a second bug for free: the old code couldn't use
// serverTimestamp() for createdAt (the SDK rejects that sentinel nested
// inside an arrayUnion() element) and fell back to a client-clock
// new Date() instead. A subcollection document has no such restriction.
export async function addPerspectiveResponse(
  postId:   string,
  content:  string,
  gen:      GenerationTag,
  author:   { uid: string; numericId: number; name: string; avatarUrl?: string }
): Promise<PerspectiveResponse> {
  const ref = await addDoc(collection(db, 'perspective_posts', postId, 'responses'), {
    authorUid:    author.uid,
    authorId:     author.numericId,
    authorName:   author.name,
    authorAvatar: author.avatarUrl ?? null,
    authorGen:    gen,
    content,
    createdAt:    serverTimestamp(),
    helpful:      0,
  });

  // Deliberately doesn't also touch the parent post's updatedAt: nothing
  // reads that field (the feed orders by createdAt, and a responder isn't
  // the post's owner, so writing to the parent from here would need its
  // own carve-out in the parent's update rule for no real benefit).

  return {
    id:           ref.id,
    authorId:     author.numericId,
    authorName:   author.name,
    authorAvatar: author.avatarUrl,
    authorGen:    gen,
    content,
    createdAt:    new Date(),
    helpful:      0,
  };
}

export async function markPerspectiveHelpful(postId: string, responseId: string): Promise<void> {
  // Firestore doesn't support updating nested array items directly —
  // we store a separate helpful_votes subcollection instead
  await addDoc(collection(db, 'perspective_posts', postId, 'helpful_votes'), {
    responseId,
    createdAt: serverTimestamp(),
  });
}

export async function fetchPerspectivePosts(count = 20): Promise<PerspectivePostData[]> {
  const snap = await getDocs(
    query(collection(db, 'perspective_posts'), orderBy('createdAt', 'desc'), limit(count))
  );
  return Promise.all(snap.docs.map(async d => {
    const data = d.data();
    const responsesSnap = await getDocs(
      query(collection(db, 'perspective_posts', d.id, 'responses'), orderBy('createdAt', 'asc'))
    );
    return {
      id:           d.id,
      authorId:     data.authorId,
      authorName:   data.authorName,
      authorAvatar: data.authorAvatar,
      question:     data.question,
      context:      data.context ?? '',
      seekingFrom:  data.seekingFrom ?? ['Any generation'],
      responses:    responsesSnap.docs.map(r => {
        const rd = r.data();
        return {
          id:           r.id,
          authorId:     rd.authorId,
          authorName:   rd.authorName,
          authorAvatar: rd.authorAvatar,
          authorGen:    rd.authorGen,
          content:      rd.content,
          helpful:      rd.helpful ?? 0,
          createdAt:    rd.createdAt?.toDate?.() ?? new Date(),
        };
      }),
      createdAt:    data.createdAt?.toDate?.() ?? new Date(),
      _firestoreId: d.id,
    };
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// WISDOM THREADS
// ─────────────────────────────────────────────────────────────────────────────

export async function createWisdomThread(
  threadData: Omit<WisdomThreadData, 'id' | 'saves' | 'hearts' | 'createdAt'>,
  authorUid:  string
): Promise<WisdomThreadData> {
  const ref = await addDoc(collection(db, 'wisdom_threads'), {
    ...threadData,
    authorUid,
    saves:     0,
    hearts:    0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    ...threadData,
    id:        ref.id,
    saves:     0,
    hearts:    0,
    createdAt: new Date(),
  };
}

export async function heartWisdomThread(threadId: string, userUid: string): Promise<void> {
  await updateDoc(doc(db, 'wisdom_threads', threadId), {
    hearts: increment(1),
  });
  // Track who hearted to prevent duplicates
  await addDoc(collection(db, 'wisdom_threads', threadId, 'hearts'), {
    userUid,
    createdAt: serverTimestamp(),
  });
}

export async function saveWisdomThread(threadId: string, userUid: string): Promise<void> {
  await updateDoc(doc(db, 'wisdom_threads', threadId), {
    saves: increment(1),
  });
  await addDoc(collection(db, 'wisdom_threads', threadId, 'saves'), {
    userUid,
    createdAt: serverTimestamp(),
  });
}

export async function fetchWisdomThreads(count = 20): Promise<WisdomThreadData[]> {
  const snap = await getDocs(
    query(collection(db, 'wisdom_threads'), orderBy('createdAt', 'desc'), limit(count))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id:            d.id,
      authorId:      data.authorId,
      authorName:    data.authorName,
      authorAvatar:  data.authorAvatar,
      authorYearsXp: data.authorYearsXp ?? 0,
      authorRole:    data.authorRole ?? '',
      headline:      data.headline,
      theLesson:     data.theLesson,
      theContext:    data.theContext ?? '',
      doingItAgain:  data.doingItAgain ?? '',
      whoNeedsThis:  data.whoNeedsThis ?? '',
      tags:          data.tags ?? [],
      saves:         data.saves ?? 0,
      hearts:        data.hearts ?? 0,
      createdAt:     data.createdAt?.toDate?.() ?? new Date(),
      _firestoreId:  d.id,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATIONAL PODS
// ─────────────────────────────────────────────────────────────────────────────

export async function createGenerationalPod(
  podData:    Omit<GenerationalPodData, 'id' | 'members' | 'createdAt'>,
  creatorUid: string,
  creator:    { numericId: number; name: string; avatarUrl?: string; stage: CareerStage; role: string }
): Promise<GenerationalPodData> {
  const firstMember = {
    userId:    creator.numericId,
    name:      creator.name,
    avatarUrl: creator.avatarUrl ?? null,
    stage:     creator.stage,
    role:      creator.role,
    joinedAt:  new Date().toISOString(),
  };

  // Write to 'circles' collection with podType: 'generational'
  // Standard fields: members (numeric IDs) for Circles.tsx compatibility
  // Extended fields: generationalMembers (rich objects) for GenerationalFeed
  const ref = await addDoc(collection(db, 'circles'), {
    // Standard Circle fields
    name:        podData.name,
    description: podData.purpose ?? podData.topic ?? '',
    members:     [creator.numericId],   // numeric array for Circles.tsx
    adminId:     creator.numericId,
    podType:     'generational',
    visibility:  'open',
    // Generational-specific fields
    topic:       podData.topic ?? '',
    purpose:     podData.purpose ?? '',
    capacity:    podData.capacity ?? 12,
    slots:       podData.slots,
    generationalMembers: [firstMember], // rich member objects for GenerationalFeed
    creatorUid,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
  });

  return {
    ...podData,
    id:        ref.id,
    members:   [{ ...firstMember, joinedAt: new Date() }],
    createdAt: new Date(),
  };
}

export async function joinGenerationalPod(
  podId:  string,
  member: { numericId: number; name: string; avatarUrl?: string; stage: CareerStage; role: string }
): Promise<void> {
  const richMember = {
    userId:    member.numericId,
    name:      member.name,
    avatarUrl: member.avatarUrl ?? null,
    stage:     member.stage,
    role:      member.role,
    joinedAt:  new Date().toISOString(),
  };
  // Update both the numeric members array (for Circles.tsx) and rich generationalMembers
  await updateDoc(doc(db, 'circles', podId), {
    members:             arrayUnion(member.numericId),
    generationalMembers: arrayUnion(richMember),
    updatedAt:           serverTimestamp(),
  });
}

export async function fetchGenerationalPods(count = 20): Promise<GenerationalPodData[]> {
  const snap = await getDocs(
    query(
      collection(db, 'circles'),
      where('podType', '==', 'generational'),
      orderBy('createdAt', 'desc'),
      limit(count)
    )
  );
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id:        d.id,
      name:      data.name,
      purpose:   data.purpose ?? data.description ?? '',
      topic:     data.topic ?? '',
      capacity:  data.capacity ?? 12,
      slots:     data.slots ?? {
        emerging:    { min: 1, max: 3 },
        growing:     { min: 1, max: 3 },
        established: { min: 1, max: 3 },
        veteran:     { min: 1, max: 3 },
      },
      // Use rich generationalMembers if available, fall back to empty
      members:   (data.generationalMembers ?? []).map((m: any) => ({
        ...m,
        joinedAt: m.joinedAt ? new Date(m.joinedAt) : new Date(),
      })),
      createdAt: data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(data.createdAt ?? Date.now()),
      // These were missing entirely — the doc stores the creator as
      // `adminId` (same convention as circles generally), not `createdBy`;
      // isPrivate is never written on create, so default to false (public)
      // to match how these pods actually behave (open join requests).
      isPrivate: data.isPrivate ?? false,
      createdBy: data.adminId ?? data.createdBy ?? 0,
      _firestoreId: d.id,
    };
  });
}

