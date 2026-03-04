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
    return { ...docToUser(data), _firestoreUid: d.id } as User & { _firestoreUid: string };
  });
}
