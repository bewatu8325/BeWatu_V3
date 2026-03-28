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
  collection, addDoc, getDocs, getDoc, doc, updateDoc,
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
    responses:    [],
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

export async function addPerspectiveResponse(
  postId:   string,
  content:  string,
  gen:      GenerationTag,
  author:   { uid: string; numericId: number; name: string; avatarUrl?: string }
): Promise<PerspectiveResponse> {
  const response: PerspectiveResponse = {
    id:           `${author.uid}_${Date.now()}`,
    authorId:     author.numericId,
    authorName:   author.name,
    authorAvatar: author.avatarUrl,
    authorGen:    gen,
    content,
    createdAt:    new Date(),
    helpful:      0,
  };

  await updateDoc(doc(db, 'perspective_posts', postId), {
    responses: arrayUnion({
      ...response,
      createdAt: serverTimestamp(),
    }),
    updatedAt: serverTimestamp(),
  });

  return response;
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
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id:           d.id,
      authorId:     data.authorId,
      authorName:   data.authorName,
      authorAvatar: data.authorAvatar,
      question:     data.question,
      context:      data.context ?? '',
      seekingFrom:  data.seekingFrom ?? ['Any generation'],
      responses:    (data.responses ?? []).map((r: any) => ({
        ...r,
        createdAt: r.createdAt?.toDate?.() ?? new Date(),
      })),
      createdAt:    data.createdAt?.toDate?.() ?? new Date(),
      _firestoreId: d.id,
    };
  });
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
      _firestoreId: d.id,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA — call once from console or a seed script to populate the DB
// ─────────────────────────────────────────────────────────────────────────────

export async function seedGenerationalContent(adminUid: string): Promise<void> {
  console.log('Seeding generational content...');

  // Perspective posts
  const perspectiveSeed = [
    {
      question:    'How did you know when you were ready to leave a stable job to start something of your own?',
      context:     "I've been at my company for 4 years and feel the itch but I'm terrified of throwing away security.",
      seekingFrom: ['Gen X (1965–1980)', 'Boomers (1946–1964)'] as GenerationTag[],
      authorName:  'Alex Chen',
      authorId:    1001,
    },
    {
      question:    "What's the most important thing you wish someone had told you about managing people for the first time?",
      context:     "I just got promoted to lead a team of 6 and I'm realising managing is completely different to doing.",
      seekingFrom: ['Millennials (1981–1996)', 'Gen X (1965–1980)'] as GenerationTag[],
      authorName:  'Priya Nair',
      authorId:    1002,
    },
    {
      question:    'For the experienced folks — how do you stay relevant in an industry that moves as fast as tech?',
      context:     "Asking as someone 2 years in who's watching colleagues with 20 years experience struggle with AI tools.",
      seekingFrom: ['Gen X (1965–1980)', 'Boomers (1946–1964)'] as GenerationTag[],
      authorName:  'Jordan Mills',
      authorId:    1003,
    },
  ];

  for (const p of perspectiveSeed) {
    await addDoc(collection(db, 'perspective_posts'), {
      ...p,
      authorUid:    adminUid,
      authorAvatar: null,
      responses:    [],
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
    });
  }

  // Wisdom threads
  const wisdomSeed = [
    {
      authorId:      2001,
      authorName:    'Sarah Okafor',
      authorYearsXp: 22,
      authorRole:    'Chief People Officer',
      headline:      'The first 90 days in any new role are not about proving yourself — they\'re about listening.',
      theLesson:     "Every time I\'ve rushed to show value in a new role, I\'ve created problems that took months to fix. The leaders I\'ve seen succeed consistently spend their first 90 days asking questions, mapping the real power structure (not the org chart), and identifying the two or three things that actually matter. They resist the pressure to act. Then, when they do move, they move with precision.",
      theContext:    "I learned this the hard way at 34 when I joined a Series B startup as VP People and spent my first month redesigning the performance review system. Nobody asked for it. Nobody wanted it. I spent the next six months undoing the damage to my own credibility.",
      doingItAgain:  "Shadow three people in the first week. Ask every direct report: what\'s the one thing that would make your job 10% easier? Don\'t touch anything structural until day 60.",
      whoNeedsThis:  "Anyone taking on their first senior leadership role. Especially those who\'ve been high-performing individual contributors — the instinct to do is strong and it will work against you.",
      tags:          ['leadership', 'career-transitions', 'first-90-days'],
    },
    {
      authorId:      2002,
      authorName:    'Marcus Webb',
      authorYearsXp: 15,
      authorRole:    'Engineering Director',
      headline:      'Your network isn\'t who you know — it\'s who knows what you\'re capable of.',
      theLesson:     "I spent years collecting LinkedIn connections and attending networking events. None of it moved my career. What did move it was writing about my work publicly, presenting at two conferences, and helping three junior engineers get promoted. Suddenly the right people knew my name — and more importantly, knew what I was good at. Passive networking is almost worthless. Active demonstration of competence is everything.",
      theContext:    "I was passed over for a director role at 32 in favour of someone external who had half my experience but had spoken at re:Invent. That was the wake-up call.",
      doingItAgain:  "Write one public post about something I learned each month. Mentor at least one person actively each year. Say yes to presenting even when it terrifies me.",
      whoNeedsThis:  "Mid-career engineers (5-12 years in) who are technically excellent but feel invisible to decision-makers.",
      tags:          ['networking', 'visibility', 'career-growth', 'engineering'],
    },
  ];

  for (const w of wisdomSeed) {
    await addDoc(collection(db, 'wisdom_threads'), {
      ...w,
      authorUid: adminUid,
      authorAvatar: null,
      saves:     0,
      hearts:    0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Generational pods
  const podSeed = [
    {
      name:      'Cross-Gen Product Circle',
      topic:     'Product strategy',
      purpose:   'A pod where product thinkers at every career stage meet weekly to discuss real product challenges. Veterans bring context. Emerging voices bring fresh thinking. Everyone leaves with something useful.',
      capacity:  12,
      isPrivate: false,
      createdBy: 3001,
      slots: {
        emerging:    { min: 2, max: 3 },
        growing:     { min: 2, max: 3 },
        established: { min: 1, max: 3 },
        veteran:     { min: 1, max: 3 },
      },
    },
    {
      name:      'The Pivot Pod',
      topic:     'Career transitions',
      purpose:   'For people at every stage who are navigating or considering a major career pivot. Share your story, get honest perspective from those who\'ve been through it, and help someone else find their footing.',
      capacity:  10,
      isPrivate: false,
      createdBy: 3002,
      slots: {
        emerging:    { min: 2, max: 3 },
        growing:     { min: 2, max: 3 },
        established: { min: 1, max: 2 },
        veteran:     { min: 1, max: 2 },
      },
    },
  ];

  for (const pod of podSeed) {
    await addDoc(collection(db, 'circles'), {
      // Standard Circle fields
      name:        pod.name,
      description: pod.purpose ?? pod.topic ?? '',
      members:     [],
      adminId:     0,
      podType:     'generational',
      visibility:  'open',
      // Generational-specific
      topic:       pod.topic ?? '',
      purpose:     pod.purpose ?? '',
      capacity:    pod.capacity,
      slots:       pod.slots,
      generationalMembers: [],
      creatorUid:  adminUid,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });
  }

  console.log('✅ Generational content seeded successfully');
}
