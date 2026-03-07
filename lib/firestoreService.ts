/**
 * lib/firestoreService.ts
 *
 * All Firestore reads/writes for BeWatu, typed against the app's existing
 * types.ts interfaces so no component changes are needed.
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Post,
  User,
  Job,
  Message,
  Notification,
  ConnectionRequest,
  Circle,
  Article,
  AppreciationType,
  NotificationType,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Firestore doc → BeWatu type
// ─────────────────────────────────────────────────────────────────────────────

function toPost(d: QueryDocumentSnapshot): Post {
  const data = d.data();
  return {
    id: data.numericId ?? (parseInt(d.id, 10) || Date.now()),
    authorId: data.authorNumericId,
    content: data.content,
    appreciations: data.appreciations ?? { helpful: 0, thoughtProvoking: 0, collaborationReady: 0 },
    comments: data.commentCount ?? 0,
    shares: data.shares ?? 0,
    timestamp: data.timestamp ?? 'Just now',
    circleId: data.circleId,
    // store firebase doc id for updates
    _firestoreId: d.id,
  } as Post & { _firestoreId: string };
}

function toMessage(d: QueryDocumentSnapshot): Message {
  const data = d.data();
  return {
   id: data.numericId ?? (parseInt(d.id, 10) || Date.now()),
    senderId: data.senderNumericId,
    receiverId: data.receiverNumericId,
    text: data.text,
    timestamp: data.createdAt?.toDate?.()?.toLocaleTimeString() ?? 'Just now',
    isRead: data.isRead ?? false,
    _firestoreId: d.id,
  } as Message & { _firestoreId: string };
}

function toNotification(d: QueryDocumentSnapshot): Notification {
  const data = d.data();
  return {
    id: (parseInt(d.id, 10) || Date.now()),
    userId: data.recipientNumericId,
    type: data.type as NotificationType,
    text: data.message,
    read: data.read ?? false,
    timestamp: data.createdAt?.toDate?.()?.toLocaleTimeString() ?? '',
    relatedId: data.relatedId,
    _firestoreId: d.id,
  } as Notification & { _firestoreId: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// POSTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createPost(
  content: string,
  author: User,
  authorUid: string,
  circleId?: number
): Promise<Post> {
  const ref = await addDoc(collection(db, 'posts'), {
    content,
    authorUid,
    authorNumericId: author.id,
    authorName: author.name,
    authorPhoto: author.avatarUrl,
    authorHeadline: author.headline,
    appreciations: { helpful: 0, thoughtProvoking: 0, collaborationReady: 0 },
    commentCount: 0,
    shares: 0,
    timestamp: 'Just now',
    ...(circleId !== undefined && { circleId }),
    numericId: Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: Date.now(),
    authorId: author.id,
    content,
    appreciations: { helpful: 0, thoughtProvoking: 0, collaborationReady: 0 },
    comments: 0,
    shares: 0,
    timestamp: 'Just now',
    circleId,
    _firestoreId: ref.id,
  } as Post & { _firestoreId: string };
}

export async function fetchPosts(pageSize = 30, after?: QueryDocumentSnapshot) {
  const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (after) constraints.push(startAfter(after));
  const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
  return {
    posts: snap.docs.map(toPost),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

export async function appreciatePost(
  firestoreId: string,
  type: AppreciationType,
  authorUid: string
) {
  await updateDoc(doc(db, 'posts', firestoreId), {
    [`appreciations.${type}`]: increment(1),
    updatedAt: serverTimestamp(),
  });

  // Award reputation + credits to author via their user doc
  const reputationMap: Record<AppreciationType, number> = {
    helpful: 1, thoughtProvoking: 3, collaborationReady: 2,
  };
  const creditMap: Record<AppreciationType, number> = {
    helpful: 5, thoughtProvoking: 10, collaborationReady: 7,
  };
  await updateDoc(doc(db, 'users', authorUid), {
    reputation: increment(reputationMap[type]),
    credits: increment(creditMap[type]),
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function sendConnectionRequest(
  senderUid: string,
  senderNumericId: number,
  receiverUid: string,
  receiverNumericId: number
): Promise<ConnectionRequest> {
  const id = [senderUid, receiverUid].sort().join('_');
  await addDoc(collection(db, 'connections'), {
    firestoreId: id,
    senderUid,
    senderNumericId,
    receiverUid,
    receiverNumericId,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return {
    id: Date.now(),
    fromUserId: senderNumericId,
    toUserId: receiverNumericId,
    status: 'pending',
  };
}

export async function respondToConnectionRequest(
  firestoreDocId: string,
  response: 'accepted' | 'declined',
  senderUid: string,
  receiverUid: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'connections', firestoreDocId), {
    status: response,
    updatedAt: serverTimestamp(),
  });
  if (response === 'accepted') {
    batch.update(doc(db, 'users', senderUid), { connectionCount: increment(1) });
    batch.update(doc(db, 'users', receiverUid), { connectionCount: increment(1) });
  }
  await batch.commit();
}

export async function fetchConnectionRequests(uid: string): Promise<ConnectionRequest[]> {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, 'connections'), where('senderUid', '==', uid))),
    getDocs(query(collection(db, 'connections'), where('receiverUid', '==', uid))),
  ]);
  return [...sent.docs, ...received.docs].map((d) => {
    const data = d.data();
    return {
      id: Date.now() + Math.random(),
      fromUserId: data.senderNumericId,
      toUserId: data.receiverNumericId,
      status: data.status,
      _firestoreId: d.id,
    } as ConnectionRequest & { _firestoreId: string };
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// FOLLOW REQUESTS
// ─────────────────────────────────────────────────────────────────────────────

export async function sendFollowRequest(
  senderUid: string,
  senderNumericId: number,
  receiverUid: string,
  receiverNumericId: number
): Promise<FollowRequest> {
  const ref = await addDoc(collection(db, 'followRequests'), {
    senderUid,
    senderNumericId,
    receiverUid,
    receiverNumericId,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Notify the receiver
  await createNotification(receiverUid, senderNumericId, 'FOLLOW_REQUEST', ref.id);
  return {
    id: Date.now(),
    fromUserId: senderNumericId,
    toUserId: receiverNumericId,
    status: 'pending',
    _firestoreId: ref.id,
  };
}

export async function respondToFollowRequest(
  firestoreDocId: string,
  response: 'accepted' | 'declined',
  receiverUid: string,
  senderUid: string,
  senderNumericId: number
): Promise<void> {
  await updateDoc(doc(db, 'followRequests', firestoreDocId), {
    status: response,
    updatedAt: serverTimestamp(),
  });
  if (response === 'accepted') {
    await createNotification(senderUid, senderNumericId, 'FOLLOW_ACCEPTED', firestoreDocId);
  }
}

export async function fetchFollowRequests(uid: string): Promise<FollowRequest[]> {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, 'followRequests'), where('senderUid', '==', uid))),
    getDocs(query(collection(db, 'followRequests'), where('receiverUid', '==', uid))),
  ]);
  return [...sent.docs, ...received.docs].map(d => {
    const data = d.data();
    return {
      id: Date.now() + Math.random(),
      fromUserId: data.senderNumericId,
      toUserId: data.receiverNumericId,
      status: data.status,
      _firestoreId: d.id,
    } as FollowRequest;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGING
// ─────────────────────────────────────────────────────────────────────────────

function getThreadId(uid1: string, uid2: string) {
  return [uid1, uid2].sort().join('_');
}

export async function sendMessage(
  senderUid: string,
  senderNumericId: number,
  receiverUid: string,
  receiverNumericId: number,
  text: string
): Promise<Message> {
  const threadId = getThreadId(senderUid, receiverUid);
  const batch = writeBatch(db);

  // Upsert thread metadata
  const threadRef = doc(db, 'messages', threadId);
  batch.set(
    threadRef,
    {
      participants: [senderUid, receiverUid],
      participantNumericIds: [senderNumericId, receiverNumericId],
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      lastSenderUid: senderUid,
    },
    { merge: true }
  );

  const msgRef = doc(collection(db, 'messages', threadId, 'messages'));
  const numericId = Date.now();
  batch.set(msgRef, {
    senderUid,
    senderNumericId,
    receiverUid,
    receiverNumericId,
    text,
    isRead: false,
    numericId,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  return {
    id: numericId,
    senderId: senderNumericId,
    receiverId: receiverNumericId,
    text,
    timestamp: 'Just now',
    isRead: false,
  };
}

export function subscribeToMessages(
  uid1: string,
  uid2: string,
  callback: (messages: Message[]) => void
): Unsubscribe {
  const threadId = getThreadId(uid1, uid2);
  return onSnapshot(
    query(
      collection(db, 'messages', threadId, 'messages'),
      orderBy('createdAt', 'asc')
    ),
    (snap) => callback(snap.docs.map(toMessage))
  );
}

export async function fetchAllMessagesForUser(
  uid: string,
  numericId: number
): Promise<Message[]> {
  // Fetch all threads where user participates, then flatten messages
  const snap = await getDocs(
    query(collection(db, 'messages'), where('participants', 'array-contains', uid))
  );

  const allMessages: Message[] = [];
  for (const threadDoc of snap.docs) {
    const msgSnap = await getDocs(
      query(
        collection(db, 'messages', threadDoc.id, 'messages'),
        orderBy('createdAt', 'asc')
      )
    );
    allMessages.push(...msgSnap.docs.map(toMessage));
  }
  return allMessages;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function subscribeToNotifications(
  uid: string,
  recipientNumericId: number,
  callback: (notifications: Notification[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'notifications', uid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(30)
    ),
    (snap) => callback(snap.docs.map(toNotification))
  );
}

export async function markNotificationsRead(uid: string, firestoreIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  firestoreIds.forEach((id) =>
    batch.update(doc(db, 'notifications', uid, 'items', id), { read: true })
  );
  await batch.commit();
}

export async function createNotification(
  recipientUid: string,
  recipientNumericId: number,
  type: NotificationType,
  message: string,
  senderName: string,
  relatedId?: number
): Promise<void> {
  await addDoc(collection(db, 'notifications', recipientUid, 'items'), {
    type,
    message,
    senderName,
    recipientNumericId,
    relatedId,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// JOBS
// ─────────────────────────────────────────────────────────────────────────────

export async function createJob(job: Omit<Job, 'id'>, recruiterUid: string): Promise<Job> {
  const numericId = Date.now();
  await addDoc(collection(db, 'jobs'), {
    ...job,
    numericId,
    recruiterUid,
    applicants: [],
    createdAt: serverTimestamp(),
  });
  return { ...job, id: numericId };
}

export async function fetchJobs(): Promise<Job[]> {
  const snap = await getDocs(
    query(collection(db, 'jobs'), where('status', '==', 'Active'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return { ...data, id: data.numericId, _firestoreId: d.id } as Job & { _firestoreId: string };
  });
}

export async function updateJob(firestoreId: string, updates: Partial<Job>): Promise<void> {
  await updateDoc(doc(db, 'jobs', firestoreId), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteJob(firestoreId: string): Promise<void> {
  await deleteDoc(doc(db, 'jobs', firestoreId));
}

export async function applyToJob(firestoreId: string, applicantUid: string): Promise<void> {
  await updateDoc(doc(db, 'jobs', firestoreId), {
    applicants: arrayUnion(applicantUid),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CIRCLES
// ─────────────────────────────────────────────────────────────────────────────

export async function createCircle(
  circle: Omit<Circle, 'id'>,
  creatorUid: string
): Promise<Circle> {
  const numericId = Date.now();
  await addDoc(collection(db, 'circles'), {
    ...circle,
    numericId,
    creatorUid,
    createdAt: serverTimestamp(),
  });
  return { ...circle, id: numericId };
}

export async function fetchCircles(): Promise<Circle[]> {
  const snap = await getDocs(query(collection(db, 'circles'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => {
    const data = d.data();
    return { ...data, id: data.numericId, _firestoreId: d.id } as Circle & { _firestoreId: string };
  });
}
// ----------------
//  Fetch Users
// ----------------
export async function fetchUsers(): Promise<User[]> {
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.numericId ?? Date.now(),
      name: data.displayName ?? '',
      headline: data.headline ?? '',
      bio: data.bio ?? '',
      avatarUrl: data.photoURL ?? `https://picsum.photos/seed/${d.id}/100`,
      industry: data.industry ?? '',
      professionalGoals: data.professionalGoals ?? [],
      reputation: data.reputation ?? 0,
      credits: data.credits ?? 100,
      isRecruiter: data.isRecruiter ?? false,
      isVerified: data.isVerified ?? false,
      portfolio: data.portfolio ?? [],
      verifiedAchievements: data.verifiedAchievements ?? [],
      thirdPartyIntegrations: data.thirdPartyIntegrations ?? [],
      workStyle: data.workStyle ?? {
        collaboration: 'Thrives in pairs',
        communication: 'Prefers asynchronous',
        workPace: 'Fast-paced and iterative',
      },
      values: data.values ?? [],
      availability: data.availability ?? 'Exploring opportunities',
      skills: data.skills ?? [],
      verifiedSkills: data.verifiedSkills ?? null,
      microIntroductionUrl: data.microIntroductionUrl ?? null,
      _firestoreUid: d.id,
    } as User & { _firestoreUid: string };
  });
}
// ─────────────────────────────────────────────────────────────────────────────
// ADD THESE FUNCTIONS TO YOUR EXISTING firestoreService.ts
// Also add these imports at the top if not already present:
// import { arrayUnion, arrayRemove, increment } from 'firebase/firestore';
// ─────────────────────────────────────────────────────────────────────────────

export type SparkFormat = 'win' | 'insight' | 'goal' | 'looking-for' | 'status';
export type ChallengeDifficulty = 'entry' | 'mid' | 'senior';
export type ChallengeType = 'code' | 'design' | 'strategy' | 'writing' | 'data';

// ─── Sparks ──────────────────────────────────────────────────────────────────

export async function createSpark(data: {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  format: SparkFormat;
  content: string;
  stat?: string;
}) {
  const ref = await addDoc(collection(db, 'sparks'), {
    ...data,
    reactions: { relate: [], inspire: [], collab: [] },
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });
  return ref.id;
}

export async function getActiveSparks(maxResults = 30) {
  const now = new Date();
  try {
    const q = query(
      collection(db, 'sparks'),
      where('expiresAt', '>', now),
      orderBy('expiresAt', 'asc'),
      limit(maxResults)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback if index not built yet
    const snap = await getDocs(collection(db, 'sparks'));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s: any) => {
        const exp = s.expiresAt?.toDate?.() ?? new Date(s.expiresAt);
        return exp > now;
      })
      .slice(0, maxResults);
  }
}

export async function toggleSparkReaction(
  sparkId: string,
  userId: string,
  type: 'relate' | 'inspire' | 'collab'
) {
  const sparkRef = doc(db, 'sparks', sparkId);
  const snap = await getDoc(sparkRef);
  if (!snap.exists()) return;
  const arr: string[] = snap.data().reactions?.[type] ?? [];
  if (arr.includes(userId)) {
    await updateDoc(sparkRef, { [`reactions.${type}`]: arrayRemove(userId) });
  } else {
    await updateDoc(sparkRef, { [`reactions.${type}`]: arrayUnion(userId) });
  }
}

// ─── Challenges (Prove) ───────────────────────────────────────────────────────

export async function createChallenge(data: {
  title: string;
  description: string;
  recruiterId: string;
  companyName: string;
  skills: string[];
  difficulty: ChallengeDifficulty;
  type: ChallengeType;
  timeLimit: number;
  reward: { credits: number; badge: string; visibility: boolean };
  expiresAt: string;
}) {
  const ref = await addDoc(collection(db, 'challenges'), {
    ...data,
    submissionCount: 0,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getChallenges(maxResults = 20) {
  const q = query(
    collection(db, 'challenges'),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function submitChallenge(
  challengeId: string,
  data: {
    userId: string;
    userName: string;
    userAvatar: string;
    content: string;
  }
) {
  const ref = await addDoc(
    collection(db, 'challenges', challengeId, 'submissions'),
    {
      ...data,
      score: null,
      feedback: null,
      isShortlisted: false,
      submittedAt: serverTimestamp(),
    }
  );
  await updateDoc(doc(db, 'challenges', challengeId), {
    submissionCount: increment(1),
  });
  return ref.id;
}

export async function getChallengeSubmissions(challengeId: string) {
  const snap = await getDocs(
    collection(db, 'challenges', challengeId, 'submissions')
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function scoreSubmission(
  challengeId: string,
  submissionId: string,
  score: number,
  feedback: string
) {
  await updateDoc(
    doc(db, 'challenges', challengeId, 'submissions', submissionId),
    { score, feedback }
  );
}

export async function shortlistSubmission(
  challengeId: string,
  submissionId: string,
  recruiterId: string,
  jobId?: string
) {
  await updateDoc(
    doc(db, 'challenges', challengeId, 'submissions', submissionId),
    { isShortlisted: true }
  );
  const subSnap = await getDoc(
    doc(db, 'challenges', challengeId, 'submissions', submissionId)
  );
  if (!subSnap.exists()) return;
  const sub = subSnap.data();
  if (jobId) {
    await addDoc(collection(db, 'applications'), {
      jobId,
      userId: sub.userId,
      message: 'Shortlisted from Prove challenge',
      status: 'applied',
      stage: 'challenge',
      source: 'prove',
      challengeId,
      submissionId,
      createdAt: serverTimestamp(),
    });
  }
}

// ─── Endorsements (Skill DNA) ─────────────────────────────────────────────────

export async function endorseSkill(
  userId: string,
  skillName: string,
  endorserId: string
) {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const endorsements = userSnap.data().endorsements ?? [];
  const idx = endorsements.findIndex(
    (e: { skillName: string }) => e.skillName === skillName
  );
  if (idx >= 0) {
    if (!endorsements[idx].endorsedBy.includes(endorserId)) {
      endorsements[idx].endorsedBy.push(endorserId);
    }
  } else {
    endorsements.push({ skillName, endorsedBy: [endorserId] });
  }
  await updateDoc(userRef, { endorsements, updatedAt: serverTimestamp() });
}

// ─── Talent Pipeline ──────────────────────────────────────────────────────────

export async function getPipelineCandidates(recruiterId: string) {
  const q = query(
    collection(db, 'applications'),
    where('recruiterId', '==', recruiterId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function movePipelineCandidate(
  applicationId: string,
  toStage: string
) {
  await updateDoc(doc(db, 'applications', applicationId), { stage:toStage });
}

export async function addPipelineNote(applicationId: string, note: string) {
  await updateDoc(doc(db, 'applications', applicationId), {
    notes: arrayUnion({ text: note, createdAt: new Date().toISOString() }),
  });
}

export async function schedulePipelineInterview(
  applicationId: string,
  date: string
) {
  await updateDoc(doc(db, 'applications', applicationId), {
    interviewDate: date,
  });
}

export async function rejectPipelineCandidate(
  applicationId: string,
  reason: string
) {
  await updateDoc(doc(db, 'applications', applicationId), {
    status: 'rejected',
    rejectionReason: reason,
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// PEER LEARNING
// ─────────────────────────────────────────────────────────────────────────────

import type { LearnRequest, MicroLesson, LessonFormat } from '../types';

export async function createLearnRequest(data: {
  circleId: number;
  authorId: number;
  skill: string;
  context?: string;
}): Promise<LearnRequest> {
  const ref = await addDoc(collection(db, 'learnRequests'), {
    ...data,
    status: 'open',
    lessonCount: 0,
    sparkedByIds: [],
    createdAt: serverTimestamp(),
  });
  return {
    id: ref.id,
    ...data,
    status: 'open',
    lessonCount: 0,
    sparkedByIds: [],
    createdAt: new Date().toISOString(),
  };
}

export async function fetchLearnRequests(circleId: number): Promise<LearnRequest[]> {
  const snap = await getDocs(
    query(collection(db, 'learnRequests'),
      where('circleId', '==', circleId),
      orderBy('createdAt', 'desc')
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnRequest));
}

export async function completeLearnRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'learnRequests', requestId), {
    status: 'complete',
    completedAt: serverTimestamp(),
  });
}

export async function sparkLearnRequest(requestId: string, userId: number): Promise<void> {
  await updateDoc(doc(db, 'learnRequests', requestId), {
    sparkedByIds: arrayUnion(userId),
  });
}

export async function createMicroLesson(data: {
  requestId: string;
  circleId: number;
  authorId: number;
  format: LessonFormat;
  body?: string;
  videoUrl?: string;
  videoDurationSec?: number;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  steps?: string[];
}): Promise<MicroLesson> {
  const ref = await addDoc(collection(db, 'microLessons'), {
    ...data,
    sparkedByIds: [],
    completedSteps: [],
    createdAt: serverTimestamp(),
  });
  // bump lessonCount on the request
  await updateDoc(doc(db, 'learnRequests', data.requestId), {
    lessonCount: increment(1),
  });
  return {
    id: ref.id,
    ...data,
    sparkedByIds: [],
    completedSteps: [],
    createdAt: new Date().toISOString(),
  };
}

export async function fetchMicroLessons(requestId: string): Promise<MicroLesson[]> {
  const snap = await getDocs(
    query(collection(db, 'microLessons'),
      where('requestId', '==', requestId),
      orderBy('createdAt', 'asc')
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as MicroLesson));
}

export async function sparkMicroLesson(lessonId: string, userId: number): Promise<void> {
  await updateDoc(doc(db, 'microLessons', lessonId), {
    sparkedByIds: arrayUnion(userId),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrCreateCompanyForRecruiter(
  recruiterUid: string,
  recruiterName: string,
  recruiterHeadline: string
): Promise<import('../types').Company> {
  if (!recruiterUid) {
    return { id: 1, _firestoreId: '', name: recruiterName, description: '', industry: '', logoUrl: '', website: '' };
  }
  const q = query(collection(db, 'companies'), where('adminUid', '==', recruiterUid));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    const data = d.data();
    return {
      id: data.numericId ?? 1,
      _firestoreId: d.id,
      name: data.name ?? recruiterName,
      description: data.description ?? '',
      industry: data.industry ?? '',
      logoUrl: data.logoUrl ?? '',
      website: data.website ?? '',
      adminUid: data.adminUid,
      verifiedRecruiters: data.verifiedRecruiters ?? [],
      verificationStatus: data.verificationStatus ?? 'unverified',
    };
  }
  // Create a new company record
  const ref = await addDoc(collection(db, 'companies'), {
    adminUid: recruiterUid,
    name: recruiterHeadline || recruiterName,
    description: '',
    industry: '',
    logoUrl: '',
    website: '',
    numericId: Date.now(),
    verifiedRecruiters: [],
    verificationStatus: 'unverified',
    createdAt: serverTimestamp(),
  });
  return {
    id: Date.now(),
    _firestoreId: ref.id,
    name: recruiterHeadline || recruiterName,
    description: '',
    industry: '',
    logoUrl: '',
    website: '',
    adminUid: recruiterUid,
    verifiedRecruiters: [],
    verificationStatus: 'unverified',
  };
}

export async function applyToJobWithProfile(
  jobFirestoreId: string,
  jobNumericId: number,
  applicantUid: string
): Promise<void> {
  await addDoc(collection(db, 'applications'), {
    jobFirestoreId,
    jobNumericId,
    applicantUid,
    status: 'applied',
    appliedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

export async function proposeInterviewSlots(
  recruiterId: string,
  applicationId: string,
  candidateUid: string,
  jobTitle: string,
  candidateName: string,
  slots: { datetime: string; duration: number }[]
): Promise<string> {
  const ref = await addDoc(collection(db, 'interviews'), {
    recruiterId,
    applicationId,
    candidateUid,
    jobTitle,
    candidateName,
    slots: slots.map((s, i) => ({ id: `slot_${i}`, ...s })),
    status: 'proposed',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchInterviewsForRecruiter(recruiterId: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, 'interviews'), where('recruiterId', '==', recruiterId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function confirmInterviewSlot(interviewId: string, slotId: string): Promise<void> {
  await updateDoc(doc(db, 'interviews', interviewId), {
    confirmedSlotId: slotId,
    status: 'confirmed',
    updatedAt: serverTimestamp(),
  });
}

export async function cancelInterview(interviewId: string, reason?: string): Promise<void> {
  await updateDoc(doc(db, 'interviews', interviewId), {
    status: 'cancelled',
    cancellationReason: reason ?? '',
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLICANT INBOX
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchJobsForRecruiter(recruiterId: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, 'jobs'), where('recruiterUid', '==', recruiterId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchApplicantsForJob(jobFirestoreId: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, 'applications'), where('jobFirestoreId', '==', jobFirestoreId))
  );
  const applicants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Hydrate user info where possible
  const withProfiles = await Promise.all(
    applicants.map(async (app: any) => {
      try {
        const userSnap = await getDocs(
          query(collection(db, 'users'), where('uid', '==', app.applicantUid))
        );
        if (!userSnap.empty) {
          const u = userSnap.docs[0].data();
          return { ...app, userName: u.name, userAvatar: u.avatarUrl, userHeadline: u.headline, userSkills: u.skills?.map((s: any) => s.name ?? s) ?? [] };
        }
      } catch {}
      return { ...app, userName: 'Applicant', userAvatar: '', userHeadline: '' };
    })
  );
  return withProfiles;
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string
): Promise<void> {
  await updateDoc(doc(db, 'applications', applicationId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPipelineAnalytics(recruiterId: string): Promise<any> {
  const [jobs, apps] = await Promise.all([
    getDocs(query(collection(db, 'jobs'), where('recruiterUid', '==', recruiterId))),
    getDocs(query(collection(db, 'applications'), where('recruiterUid', '==', recruiterId))),
  ]);
  const stages = ['new', 'reviewing', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];
  const stageCounts: Record<string, number> = {};
  stages.forEach(s => { stageCounts[s] = 0; });
  apps.docs.forEach(d => {
    const st = d.data().status ?? 'new';
    stageCounts[st] = (stageCounts[st] ?? 0) + 1;
  });
  return {
    totalJobs: jobs.size,
    totalApplications: apps.size,
    stageCounts,
    conversionRate: apps.size > 0 ? ((stageCounts['hired'] ?? 0) / apps.size * 100).toFixed(1) : '0',
  };
}

export async function fetchApplicantsWithProfiles(recruiterId: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, 'applications'), where('recruiterUid', '==', recruiterId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TALENT POOL
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchTalentPool(recruiterId: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, 'talentPool'), where('recruiterId', '==', recruiterId), orderBy('savedAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addToTalentPool(recruiterId: string, entry: {
  userId: string; userName: string; userAvatar?: string;
  userHeadline?: string; userLocation?: string; userSkills?: string[];
  tags: string[]; notes: string; rating: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'talentPool'), {
    ...entry,
    recruiterId,
    savedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTalentPoolEntry(entryId: string, updates: Partial<{
  tags: string[]; notes: string; rating: number;
}>): Promise<void> {
  await updateDoc(doc(db, 'talentPool', entryId), { ...updates, updatedAt: serverTimestamp() });
}

export async function removeFromTalentPool(entryId: string): Promise<void> {
  await deleteDoc(doc(db, 'talentPool', entryId));
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTREACH TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchOutreachTemplates(recruiterId: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, 'outreachTemplates'), where('recruiterId', '==', recruiterId), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveOutreachTemplate(recruiterId: string, template: {
  id?: string; name: string; subject: string; body: string;
  category: string; usageCount?: number;
}): Promise<string> {
  if (template.id) {
    await updateDoc(doc(db, 'outreachTemplates', template.id), {
      name: template.name, subject: template.subject,
      body: template.body, category: template.category,
      updatedAt: serverTimestamp(),
    });
    return template.id;
  }
  const ref = await addDoc(collection(db, 'outreachTemplates'), {
    ...template,
    recruiterId,
    usageCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteOutreachTemplate(templateId: string): Promise<void> {
  await deleteDoc(doc(db, 'outreachTemplates', templateId));
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export async function getCompanyForRecruiter(recruiterUid: string): Promise<any | null> {
  const snap = await getDocs(
    query(collection(db, 'companies'), where('adminUid', '==', recruiterUid))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function createCompanyWithAdmin(recruiterUid: string, data: {
  name: string; description: string; industry: string; website: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'companies'), {
    ...data,
    adminUid: recruiterUid,
    verifiedRecruiters: [recruiterUid],
    verificationStatus: 'pending',
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCompanyProfile(companyId: string, data: Partial<{
  name: string; description: string; industry: string; website: string; logoUrl: string;
}>): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId), { ...data, updatedAt: serverTimestamp() });
}

export async function generateInviteCode(companyId: string): Promise<string> {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  await updateDoc(doc(db, 'companies', companyId), { inviteCode: code });
  return code;
}

export async function redeemInviteCode(recruiterUid: string, code: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'companies'), where('inviteCode', '==', code.toUpperCase()))
  );
  if (snap.empty) return false;
  const company = snap.docs[0];
  await updateDoc(doc(db, 'companies', company.id), {
    verifiedRecruiters: arrayUnion(recruiterUid),
  });
  return true;
}

export async function removeRecruiterFromCompany(companyId: string, recruiterUid: string): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId), {
    verifiedRecruiters: arrayRemove(recruiterUid),
  });
}
