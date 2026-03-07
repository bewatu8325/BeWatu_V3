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
  // Only returns Active + verified (live) jobs for the public feed
  const mapJob = (d: any) => {
    const data = d.data();
    return { ...data, id: data.numericId, _firestoreId: d.id } as Job & { _firestoreId: string };
  };
  try {
    const snap = await getDocs(
      query(collection(db, 'jobs'), where('status', '==', 'Active'), where('verificationStatus', '==', 'live'), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(mapJob);
  } catch {
    try {
      const snap = await getDocs(
        query(collection(db, 'jobs'), where('status', '==', 'Active'))
      );
      // Filter client-side: show jobs that are live OR have no verificationStatus (legacy)
      return snap.docs.map(mapJob).filter((j: any) =>
        !j.verificationStatus || j.verificationStatus === 'live'
      );
    } catch {
      const snap = await getDocs(collection(db, 'jobs'));
      return snap.docs.map(mapJob).filter((j: any) =>
        j.status === 'Active' && (!j.verificationStatus || j.verificationStatus === 'live')
      );
    }
  }
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
  const mapCircle = (d: any) => {
    const data = d.data();
    return { ...data, id: data.numericId, _firestoreId: d.id } as Circle & { _firestoreId: string };
  };
  try {
    const snap = await getDocs(query(collection(db, 'circles'), orderBy('createdAt', 'desc')));
    return snap.docs.map(mapCircle);
  } catch {
    const snap = await getDocs(collection(db, 'circles'));
    return snap.docs.map(mapCircle);
  }
}
// ----------------
//  Fetch Users
// ----------------
function docToUserPublic(d: any): User & { _firestoreUid: string } {
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
}

export async function fetchUsers(): Promise<User[]> {
  // Try composite index query first; fall back to simple query if index not built yet
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
    );
    return snap.docs.map(docToUserPublic);
  } catch {
    // Composite index may not exist yet — fall back to unordered query
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('isPublic', '==', true), limit(50))
      );
      return snap.docs.map(docToUserPublic);
    } catch {
      // Last resort — return all users without filter
      const snap = await getDocs(query(collection(db, 'users'), limit(50)));
      return snap.docs.map(docToUserPublic);
    }
  }
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
  await updateDoc(doc(db, 'applications', applicationId), { stage: toStage });
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

// ─── Companies (auto-generate from recruiter profile) ─────────────────────────

export async function getOrCreateCompanyForRecruiter(
  recruiterUid: string,
  recruiterName: string,
  recruiterHeadline: string
): Promise<{ id: number; _firestoreId: string; name: string; description: string; industry: string; logoUrl: string; website: string }> {
  const q = query(collection(db, 'companies'), where('recruiterUid', '==', recruiterUid));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.data().numericId, _firestoreId: d.id, ...d.data() } as any;
  }

  const numericId = Date.now();
  const companyName = recruiterHeadline || recruiterName || 'My Company';
  const ref = await addDoc(collection(db, 'companies'), {
    numericId,
    recruiterUid,
    name: companyName,
    description: '',
    industry: '',
    logoUrl: '',
    website: '',
    createdAt: serverTimestamp(),
  });

  return { id: numericId, _firestoreId: ref.id, name: companyName, description: '', industry: '', logoUrl: '', website: '' };
}

// ─── Jobs for Recruiter ───────────────────────────────────────────────────────

export async function fetchJobsForRecruiter(recruiterUid: string) {
  const snap = await getDocs(
    query(collection(db, 'jobs'), where('recruiterUid', '==', recruiterUid), orderBy('createdAt', 'desc'))
  ).catch(() => getDocs(query(collection(db, 'jobs'), where('recruiterUid', '==', recruiterUid))));
  const jobs = snap.docs.map(d => ({ _firestoreId: d.id, ...d.data() })) as any[];
  return Promise.all(jobs.map(async job => {
    const appSnap = await getDocs(query(collection(db, 'applications'), where('jobFirestoreId', '==', job._firestoreId)));
    const applicants = appSnap.docs.map(d => d.data());
    return { ...job, id: job.numericId, applicantCount: applicants.length, newCount: applicants.filter((a: any) => a.status === 'new').length };
  }));
}

// ─── Applicants for a Job ─────────────────────────────────────────────────────

export async function fetchApplicantsForJob(jobFirestoreId: string) {
  const snap = await getDocs(
    query(collection(db, 'applications'), where('jobFirestoreId', '==', jobFirestoreId), orderBy('createdAt', 'desc'))
  ).catch(() => getDocs(query(collection(db, 'applications'), where('jobFirestoreId', '==', jobFirestoreId))));

  return Promise.all(snap.docs.map(async d => {
    const data = d.data();
    let userProfile: any = {};
    try {
      const userSnap = await getDoc(doc(db, 'users', data.userId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        userProfile = { userName: u.displayName ?? '', userAvatar: u.photoURL ?? '', userHeadline: u.headline ?? '', userLocation: u.location ?? '', userSkills: u.skills?.map((s: any) => s.name ?? s) ?? [] };
      }
    } catch {}
    return { id: d.id, userId: data.userId, appliedAt: data.createdAt, status: data.status ?? 'new', source: data.source ?? 'applied', notes: data.notes ?? [], score: data.score ?? null, ...userProfile };
  }));
}

// ─── Update Application Status ────────────────────────────────────────────────

export async function updateApplicationStatus(
  applicationId: string,
  status: 'new' | 'reviewing' | 'shortlisted' | 'rejected' | 'hired'
) {
  await updateDoc(doc(db, 'applications', applicationId), { status, updatedAt: serverTimestamp() });
}

// ─── Apply to Job with Profile ────────────────────────────────────────────────

export async function applyToJobWithProfile(
  jobFirestoreId: string,
  jobNumericId: number,
  applicantUid: string,
  message?: string
) {
  const existing = await getDocs(
    query(collection(db, 'applications'), where('jobFirestoreId', '==', jobFirestoreId), where('userId', '==', applicantUid))
  );
  if (!existing.empty) return;

  await addDoc(collection(db, 'applications'), {
    jobFirestoreId, jobNumericId, userId: applicantUid, message: message ?? '',
    status: 'new', source: 'applied', notes: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'jobs', jobFirestoreId), { applicants: arrayUnion(applicantUid) });
}

// ─── INTERVIEW SCHEDULER ──────────────────────────────────────────────────────

export async function proposeInterviewSlots(data: {
  applicationId: string;
  recruiterUid: string;
  recruiterName: string;
  candidateUid: string;
  candidateName: string;
  jobTitle: string;
  proposedSlots: { id: string; datetime: string; duration: number }[];
  meetingLink?: string;
  notes?: string;
}) {
  const ref = await addDoc(collection(db, 'interviews'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'notifications', data.candidateUid, 'items'), {
    type: 'MESSAGE',
    message: `${data.recruiterName} wants to schedule an interview with you for ${data.jobTitle}. Pick a time!`,
    senderName: data.recruiterName,
    recipientNumericId: null,
    read: false,
    relatedId: ref.id,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchInterviewsForRecruiter(recruiterUid: string) {
  try {
    const snap = await getDocs(
      query(collection(db, 'interviews'), where('recruiterUid', '==', recruiterUid), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(
      query(collection(db, 'interviews'), where('recruiterUid', '==', recruiterUid))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function fetchInterviewsForCandidate(candidateUid: string) {
  try {
    const snap = await getDocs(
      query(collection(db, 'interviews'), where('candidateUid', '==', candidateUid), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(
      query(collection(db, 'interviews'), where('candidateUid', '==', candidateUid))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function confirmInterviewSlot(interviewId: string, slotId: string) {
  const ref = doc(db, 'interviews', interviewId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const confirmedSlot = data.proposedSlots?.find((s: any) => s.id === slotId);
  if (!confirmedSlot) return;
  await updateDoc(ref, { status: 'confirmed', confirmedSlot, updatedAt: serverTimestamp() });
  await addDoc(collection(db, 'notifications', data.recruiterUid, 'items'), {
    type: 'MESSAGE',
    message: `${data.candidateName} confirmed their interview for ${data.jobTitle} on ${new Date(confirmedSlot.datetime).toLocaleDateString()}.`,
    senderName: data.candidateName,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function cancelInterview(interviewId: string) {
  await updateDoc(doc(db, 'interviews', interviewId), { status: 'cancelled', updatedAt: serverTimestamp() });
}

// ─── OUTREACH TEMPLATES ───────────────────────────────────────────────────────

export async function fetchOutreachTemplates(recruiterUid: string) {
  try {
    const snap = await getDocs(
      query(collection(db, 'outreachTemplates', recruiterUid, 'templates'), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(collection(db, 'outreachTemplates', recruiterUid, 'templates'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function saveOutreachTemplate(
  recruiterUid: string,
  template: { name: string; subject: string; body: string; category: string },
  existingId?: string
) {
  if (existingId) {
    await updateDoc(doc(db, 'outreachTemplates', recruiterUid, 'templates', existingId), {
      ...template, updatedAt: serverTimestamp(),
    });
    return existingId;
  }
  const ref = await addDoc(collection(db, 'outreachTemplates', recruiterUid, 'templates'), {
    ...template, usageCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteOutreachTemplate(recruiterUid: string, templateId: string) {
  await deleteDoc(doc(db, 'outreachTemplates', recruiterUid, 'templates', templateId));
}

export async function incrementTemplateUsage(recruiterUid: string, templateId: string) {
  await updateDoc(doc(db, 'outreachTemplates', recruiterUid, 'templates', templateId), {
    usageCount: increment(1),
  });
}

// ─── TALENT POOL ──────────────────────────────────────────────────────────────

export async function fetchTalentPool(recruiterUid: string) {
  try {
    const snap = await getDocs(
      query(collection(db, 'talentPool', recruiterUid, 'candidates'), orderBy('savedAt', 'desc'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(collection(db, 'talentPool', recruiterUid, 'candidates'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function addToTalentPool(
  recruiterUid: string,
  candidate: {
    userId: string; userName: string; userAvatar?: string; userHeadline?: string;
    userLocation?: string; userSkills?: string[]; notes?: string; tags?: string[];
    rating?: number; forRoles?: string[]; availability?: string;
  }
) {
  const existing = await getDocs(
    query(collection(db, 'talentPool', recruiterUid, 'candidates'), where('userId', '==', candidate.userId))
  );
  if (!existing.empty) return existing.docs[0].id;
  const ref = await addDoc(collection(db, 'talentPool', recruiterUid, 'candidates'), {
    ...candidate,
    tags: candidate.tags ?? [], notes: candidate.notes ?? '',
    rating: candidate.rating ?? 3, forRoles: candidate.forRoles ?? [],
    savedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function removeFromTalentPool(recruiterUid: string, entryId: string) {
  await deleteDoc(doc(db, 'talentPool', recruiterUid, 'candidates', entryId));
}

export async function updateTalentPoolEntry(
  recruiterUid: string,
  entryId: string,
  updates: Partial<{ notes: string; tags: string[]; rating: number; forRoles: string[]; contactedAt: string }>
) {
  await updateDoc(doc(db, 'talentPool', recruiterUid, 'candidates', entryId), {
    ...updates, updatedAt: serverTimestamp(),
  });
}

// ─── PIPELINE ANALYTICS ───────────────────────────────────────────────────────

export async function fetchPipelineAnalytics(recruiterUid: string) {
  const jobsSnap = await getDocs(
    query(collection(db, 'jobs'), where('recruiterUid', '==', recruiterUid))
  );
  const jobIds = jobsSnap.docs.map(d => d.id);

  if (jobIds.length === 0) {
    return { totalApplications: 0, activeInPipeline: 0, hired: 0, rejected: 0, avgTimeToHire: 0, stageStats: [], sourceStats: [], recentActivity: [] };
  }

  const allApps: any[] = [];
  for (let i = 0; i < jobIds.length; i += 10) {
    const batch = jobIds.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'applications'), where('jobFirestoreId', 'in', batch)));
    allApps.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  const STAGES = ['applied', 'screening', 'challenge', 'interview', 'offer', 'hired'];
  const STAGE_LABELS: Record<string, string> = { applied: 'Applied', screening: 'Screening', challenge: 'Challenge', interview: 'Interview', offer: 'Offer', hired: 'Hired' };
  const stageStats = STAGES.map(stage => {
    const inStage = allApps.filter(a => (a.stage ?? a.status ?? 'applied') === stage);
    const avgDays = inStage.reduce((sum, a) => {
      const entered = a.stageEnteredAt?.[stage]?.toDate?.() ?? a.createdAt?.toDate?.() ?? new Date();
      return sum + (Date.now() - entered.getTime()) / (1000 * 60 * 60 * 24);
    }, 0) / Math.max(inStage.length, 1);
    return { stage, label: STAGE_LABELS[stage], count: inStage.length, avgDaysInStage: Math.min(avgDays, 99), dropOffRate: 0 };
  });

  const sources = ['applied', 'sourced', 'prove'] as const;
  const SOURCE_LABELS = { applied: 'Direct Apply', sourced: 'Sourced', prove: 'Prove Challenge' };
  const SOURCE_COLORS = { applied: 'text-blue-400 bg-blue-500/10 border-blue-500/20', sourced: 'text-amber-400 bg-amber-500/10 border-amber-500/20', prove: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
  const sourceStats = sources.map(source => {
    const group = allApps.filter(a => (a.source ?? 'applied') === source);
    const advanced = group.filter(a => !['new', 'applied', 'rejected'].includes(a.status ?? ''));
    return { source, label: SOURCE_LABELS[source], count: group.length, advancedCount: advanced.length, conversionRate: group.length > 0 ? Math.round((advanced.length / group.length) * 100) : 0, color: SOURCE_COLORS[source] };
  }).filter(s => s.count > 0);

  const hired = allApps.filter(a => a.status === 'hired');
  const avgTimeToHire = hired.length > 0
    ? Math.round(hired.reduce((sum, a) => {
        const start = a.createdAt?.toDate?.() ?? new Date();
        const end = a.hiredAt?.toDate?.() ?? new Date();
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / hired.length)
    : 0;

  const recentActivity = allApps
    .filter(a => a.updatedAt)
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
    .slice(0, 20)
    .map(a => ({ date: a.updatedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(), event: `Moved to ${a.status ?? 'applied'}`, candidateName: a.userName ?? 'A candidate' }));

  return { totalApplications: allApps.length, activeInPipeline: allApps.filter(a => !['rejected', 'hired'].includes(a.status ?? '')).length, hired: hired.length, rejected: allApps.filter(a => a.status === 'rejected').length, avgTimeToHire, stageStats, sourceStats, recentActivity };
}

// ─── CULTURE FIT — fetch applicants with full profiles ────────────────────────

export async function fetchApplicantsWithProfiles(jobFirestoreId: string) {
  const snap = await getDocs(
    query(collection(db, 'applications'), where('jobFirestoreId', '==', jobFirestoreId))
  );
  return Promise.all(snap.docs.map(async d => {
    const data = d.data();
    let profile: any = {};
    try {
      const userSnap = await getDoc(doc(db, 'users', data.userId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        profile = { workStyle: u.workStyle, values: u.values ?? [], skills: u.skills?.map((s: any) => s.name ?? s) ?? [], userName: u.displayName ?? '', userAvatar: u.photoURL ?? '', userHeadline: u.headline ?? '', userLocation: u.location ?? '' };
      }
    } catch {}
    return { id: d.id, userId: data.userId, ...profile };
  }));
}

// ─── COMPANY VERIFICATION ─────────────────────────────────────────────────────

/** Get a company doc by its Firestore ID */
export async function getCompanyById(firestoreId: string) {
  const snap = await getDoc(doc(db, 'companies', firestoreId));
  if (!snap.exists()) return null;
  return { _firestoreId: snap.id, ...snap.data() } as any;
}

/** Get company where this uid is admin or verified recruiter */
export async function getCompanyForRecruiter(uid: string): Promise<any | null> {
  // Check if admin
  try {
    const adminSnap = await getDocs(
      query(collection(db, 'companies'), where('adminUid', '==', uid))
    );
    if (!adminSnap.empty) {
      const d = adminSnap.docs[0];
      return { _firestoreId: d.id, ...d.data() };
    }
    // Check if in verifiedRecruiters array
    const memberSnap = await getDocs(
      query(collection(db, 'companies'), where('verifiedRecruiters', 'array-contains', uid))
    );
    if (!memberSnap.empty) {
      const d = memberSnap.docs[0];
      return { _firestoreId: d.id, ...d.data() };
    }
  } catch {}
  return null;
}

/** Create a company and set this uid as admin */
export async function createCompanyWithAdmin(
  adminUid: string,
  adminName: string,
  companyData: { name: string; description?: string; industry?: string; website?: string }
) {
  const numericId = Date.now();
  const ref = await addDoc(collection(db, 'companies'), {
    numericId,
    adminUid,
    verifiedRecruiters: [adminUid],
    verificationStatus: 'verified',
    name: companyData.name,
    description: companyData.description ?? '',
    industry: companyData.industry ?? '',
    logoUrl: '',
    website: companyData.website ?? '',
    createdAt: serverTimestamp(),
  });
  // Mark user as verified for this company
  await updateDoc(doc(db, 'users', adminUid), {
    verifiedCompanyIds: arrayUnion(ref.id),
    updatedAt: serverTimestamp(),
  });
  return { _firestoreId: ref.id, id: numericId, adminUid, name: companyData.name };
}

/** Generate a one-time invite code for a company (admin only) */
export async function generateInviteCode(
  companyFirestoreId: string,
  adminUid: string,
  forEmail?: string
): Promise<string> {
  const companyRef = doc(db, 'companies', companyFirestoreId);
  const snap = await getDoc(companyRef);
  if (!snap.exists() || snap.data().adminUid !== adminUid) {
    throw new Error('Only the company admin can generate invite codes.');
  }
  // Generate a short readable code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await updateDoc(companyRef, {
    pendingInvites: arrayUnion({
      code,
      forEmail: forEmail ?? null,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      usedBy: null,
    }),
  });
  return code;
}

/** Redeem an invite code — adds uid to verifiedRecruiters */
export async function redeemInviteCode(
  uid: string,
  code: string
): Promise<{ success: boolean; companyName?: string; error?: string }> {
  // Search all companies for this code
  const snap = await getDocs(collection(db, 'companies'));
  for (const d of snap.docs) {
    const data = d.data();
    const invites: any[] = data.pendingInvites ?? [];
    const invite = invites.find(
      i => i.code === code.toUpperCase() && !i.usedBy && new Date(i.expiresAt) > new Date()
    );
    if (invite) {
      // Mark code as used and add recruiter
      const updatedInvites = invites.map(i =>
        i.code === invite.code ? { ...i, usedBy: uid, usedAt: new Date().toISOString() } : i
      );
      await updateDoc(doc(db, 'companies', d.id), {
        pendingInvites: updatedInvites,
        verifiedRecruiters: arrayUnion(uid),
      });
      // Mark on user profile
      await updateDoc(doc(db, 'users', uid), {
        verifiedCompanyIds: arrayUnion(d.id),
        updatedAt: serverTimestamp(),
      });
      return { success: true, companyName: data.name };
    }
  }
  return { success: false, error: 'Code not found, already used, or expired.' };
}

/** Create a job — sets verificationStatus based on whether recruiter is verified */
export async function createVerifiedJob(
  job: Omit<Job, 'id'>,
  recruiterUid: string,
  companyFirestoreId: string
): Promise<Job & { verificationStatus: string }> {
  const numericId = Date.now();
  // Check if recruiter is verified for this company
  const companySnap = await getDoc(doc(db, 'companies', companyFirestoreId));
  const isVerified = companySnap.exists() &&
    (companySnap.data().verifiedRecruiters ?? []).includes(recruiterUid);

  const verificationStatus = isVerified ? 'live' : 'pending_verification';

  await addDoc(collection(db, 'jobs'), {
    ...job,
    numericId,
    recruiterUid,
    companyFirestoreId,
    verificationStatus,
    applicants: [],
    createdAt: serverTimestamp(),
  });
  return { ...job, id: numericId, verificationStatus };
}

/** Fetch only live (verified) jobs for the public feed */
export async function fetchVerifiedJobs(): Promise<Job[]> {
  const mapJob = (d: any) => {
    const data = d.data();
    return { ...data, id: data.numericId, _firestoreId: d.id } as Job & { _firestoreId: string };
  };
  try {
    // Only jobs that are Active AND live (verified)
    const snap = await getDocs(
      query(collection(db, 'jobs'),
        where('status', '==', 'Active'),
        where('verificationStatus', '==', 'live'),
        orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(mapJob);
  } catch {
    // Fallback without compound index — filter client-side
    try {
      const snap = await getDocs(
        query(collection(db, 'jobs'), where('status', '==', 'Active'))
      );
      return snap.docs.map(mapJob).filter((j: any) =>
        !j.verificationStatus || j.verificationStatus === 'live'
      );
    } catch {
      const snap = await getDocs(collection(db, 'jobs'));
      return snap.docs.map(mapJob).filter((j: any) =>
        j.status === 'Active' && (!j.verificationStatus || j.verificationStatus === 'live')
      );
    }
  }
}

/** Update company profile (admin only) */
export async function updateCompanyProfile(
  companyFirestoreId: string,
  adminUid: string,
  updates: Partial<{ name: string; description: string; industry: string; website: string; logoUrl: string }>
) {
  const companyRef = doc(db, 'companies', companyFirestoreId);
  const snap = await getDoc(companyRef);
  if (!snap.exists() || snap.data().adminUid !== adminUid) {
    throw new Error('Only the company admin can update this company.');
  }
  await updateDoc(companyRef, { ...updates, updatedAt: serverTimestamp() });
}

/** Remove a recruiter from a company (admin only) */
export async function removeRecruiterFromCompany(
  companyFirestoreId: string,
  adminUid: string,
  recruiterUid: string
) {
  const companyRef = doc(db, 'companies', companyFirestoreId);
  const snap = await getDoc(companyRef);
  if (!snap.exists() || snap.data().adminUid !== adminUid) {
    throw new Error('Only the company admin can remove recruiters.');
  }
  await updateDoc(companyRef, {
    verifiedRecruiters: arrayRemove(recruiterUid),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'users', recruiterUid), {
    verifiedCompanyIds: arrayRemove(companyFirestoreId),
    updatedAt: serverTimestamp(),
  });
}

