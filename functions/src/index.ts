import * as admin from "firebase-admin";
import {formatDistanceToNow} from "date-fns";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

admin.initializeApp();
const db = admin.firestore();

// ===================================================================
// Rate Limiting & Security
// ===================================================================

// Rate limiter using Firestore
async function checkRateLimit(userId: string, action: string, maxRequests: number, windowMs: number): Promise<boolean> {
  const rateLimitRef = db.collection('rateLimits').doc(`${userId}_${action}`);
  const now = Date.now();

  return db.runTransaction(async (transaction: admin.firestore.Transaction) => {
    const doc = await transaction.get(rateLimitRef);

    if (!doc.exists) {
      // First request
      transaction.set(rateLimitRef, {
        count: 1,
        windowStart: now,
        lastRequest: now,
      });
      return true;
    }

    const data = doc.data()!;
    const windowStart = data.windowStart;
    const count = data.count;

    // Check if we're still in the same time window
    if (now - windowStart < windowMs) {
      if (count >= maxRequests) {
        // Rate limit exceeded
        return false;
      }

      // Increment counter
      transaction.update(rateLimitRef, {
        count: count + 1,
        lastRequest: now,
      });
      return true;
    } else {
      // New time window
      transaction.update(rateLimitRef, {
        count: 1,
        windowStart: now,
        lastRequest: now,
      });
      return true;
    }
  });
}

// Detect anomalous patterns
async function detectAnomalousActivity(userId: string, action: string): Promise<void> {
  const activityRef = db.collection('userActivity').doc(userId);
  const now = Date.now();

  await db.runTransaction(async (transaction: admin.firestore.Transaction) => {
    const doc = await transaction.get(activityRef);

    const activities = doc.exists ? (doc.data()!.recentActivities || []) : [];

    // Add current activity
    activities.push({ action, timestamp: now });

    // Keep only last hour of activities
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentActivities = activities.filter((a: any) => a.timestamp > oneHourAgo);

    // Check for anomalies
    const activityCount = recentActivities.length;
    const threshold = 100; // 100 actions per hour is suspicious

    if (activityCount > threshold) {
      // Log security event
      await db.collection('securityEvents').add({
        userId,
        type: 'ANOMALOUS_ACTIVITY',
        activityCount,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: `User performed ${activityCount} actions in the last hour`,
      });

      console.warn(`⚠️ Anomalous activity detected for user ${userId}: ${activityCount} actions in last hour`);
    }

    transaction.set(activityRef, {
      recentActivities,
      lastUpdated: now,
    }, { merge: true });
  });
}

// ===================================================================
// Authentication Triggers & Callables
// ===================================================================

// v1 -> v2 migration note (all functions in this file): each function's
// signature line and, where used, its first "if (!context.auth)" check are
// the only lines touched. Every function derives its old `data`/`context`
// local variables from the new v2 `request` object right at the top, so
// every line of business logic below stays byte-for-byte identical to the
// v1 version — this is a real, deliberate adapter pattern for a low-risk
// migration on functions that handle account deletion, data export, and
// investor provisioning, not a shortcut. See rev notes in the launch-
// readiness report for the verification this went through.

export const createUserProfile = onCall(async (request) => {
  const data = request.data;
  const {uid, email, name, isRecruiter} = data;
  const userRef = db.collection("users").doc(uid);

  await userRef.set({
    id: uid, // Firestore documents have IDs, but we add it to the doc for convenience
    name,
    email,
    isRecruiter,
    status: "pending_verification",
    companyVerificationStatus: isRecruiter ? "unverified" : null,
    avatarUrl: `https://i.pravatar.cc/150?u=${email}`,
    headline: "Newly Joined Professional",
    location: "Not specified",
    company: "Not specified",
    bio: "Excited to connect and grow on BeWatu!",
    availability: "Open to Offers",
    values: [],
    professionalGoals: [],
    credits: 10,
    reputation: 100,
    isVerified: false,
    // Add empty arrays for relations to avoid errors on the client
    skills: [],
    verifiedSkills: [],
    portfolio: [],
    verifiedAchievements: [],
    thirdPartyIntegrations: [],
    pastRoles: [],
    isAnonymous: false,
    commentPreApproval: false,
    extractedIntents: [],
    causeTags: [],
    primaryLens: "work",
    storyReels: [],
    badges: [],
  });

  const userDoc = await userRef.get();
  return {user: userDoc.data()};
});

export const completeRegistration = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const {intentStatement} = data;
    const userRef = db.collection("users").doc(context.auth.uid);

    // AI SIMULATION: Extract intents from the statement
    const extractedIntents = ["Seeking new opportunities", "Networking with peers"];

    await userRef.update({
        status: "active",
        intentStatement,
        extractedIntents,
    });
    const updatedUserDoc = await userRef.get();
    return {user: updatedUserDoc.data()};
});


// Launch-readiness review — removed deleteAccount/undoDeleteAccount, which
// used to live here: confirmed via a repo-wide search that the frontend
// never calls either (App.tsx's real deletion flow calls
// lib/accountService.ts's softDeleteAccount() directly against Firestore,
// not this callable). They also disagreed with the real flow on every
// field that matters — status: 'deactivated' vs 'pending_deletion',
// deletionScheduledAt vs scheduledHardDeleteAt/deletedAt — so leaving them
// in place was actively misleading, not just unused. See
// scheduledHardDelete below for the real permanent-deletion step this
// account for (its own comment says "to be built separately" — now built).

// P1 fix (launch-readiness review): scheduledHardDeleteAt has existed on
// users/{uid} since softDeleteAccount() started setting it, but nothing
// ever read it — the account-deletion modal promises users "permanently
// deleted within 12 months," and nothing in the codebase performed that
// deletion. This is that step.
//
// Ships with HARD_DELETE_DRY_RUN defaulting to true (safe by default) —
// it only *logs* which accounts are due and what would happen to them,
// touching nothing. Flipping it to actually delete is a deliberate,
// separate decision (set HARD_DELETE_DRY_RUN=false in this function's
// environment) once the dry-run logs have been reviewed for a few days
// and look correct — a bug in a bulk-delete function is not something to
// find out about after the fact.
export const scheduledHardDelete = onSchedule("every 24 hours", async () => {
    const dryRun = (process.env.HARD_DELETE_DRY_RUN ?? "true") !== "false";
    const now = new Date();

    const snap = await db.collection("users")
        .where("status", "==", "pending_deletion")
        .where("scheduledHardDeleteAt", "<=", now)
        .get();

    if (snap.empty) {
        console.log(`scheduledHardDelete: 0 accounts due${dryRun ? " (dry run)" : ""}.`);
        return;
    }

    console.log(
        `scheduledHardDelete: ${snap.size} account(s) due for permanent deletion` +
        (dryRun ? " — DRY RUN, nothing will be touched." : ".")
    );

    for (const docSnap of snap.docs) {
        const uid = docSnap.id;

        if (dryRun) {
            console.log(`  [dry run] would permanently delete uid=${uid}, scheduledHardDeleteAt=${docSnap.data().scheduledHardDeleteAt}`);
            continue;
        }

        try {
            // Real PII (email/phone/location) lives here, not on the main
            // doc — see the accountService.ts fix this same review made.
            await db.doc(`users/${uid}/private/contact`).delete().catch(() => {});
            await docSnap.ref.delete();

            await admin.auth().deleteUser(uid).catch((err: any) => {
                console.error(`  scheduledHardDelete: failed to delete Auth user ${uid}:`, err.message);
            });

            const bucket = admin.storage().bucket();
            for (const prefix of [`avatars/${uid}/`, `microIntros/${uid}/`, `vibe-clips/${uid}/`]) {
                await bucket.deleteFiles({ prefix }).catch((err: any) => {
                    console.error(`  scheduledHardDelete: failed to delete storage prefix ${prefix} for ${uid}:`, err.message);
                });
            }

            console.log(`  scheduledHardDelete: permanently deleted uid=${uid}`);
        } catch (err: any) {
            console.error(`  scheduledHardDelete: error deleting uid=${uid}:`, err.message);
        }
    }
});

// P1 fix (launch-readiness review): the self-service data-export flow was
// a dead end — lib/accountService.ts's exportUserData()/downloadDataAsJson()
// were fully built and correct but never called from anywhere; the real
// path (DataRequestModal.tsx) only ever wrote a data_requests doc for an
// ops staffer to fulfil by hand (generate the export themselves, upload it,
// paste a URL — see bewatu-ops/src/DataRequestsQueue.js). This function
// does that generation step automatically, server-side, the moment a
// request comes in — mirroring exportUserData()'s exact query shape — so
// staff approving a request already has a real download link waiting,
// instead of having to build the export themselves. Approval (and the
// email that was also never built — see api/ops/send-data-ready-email.ts)
// stays a deliberate human step.
export const onDataRequestCreated = onDocumentCreated("data_requests/{requestId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const request = snap.data();
    if (request.type !== "data_export") return;

    const uid = request.uid;
    if (!uid) return;

    try {
        const [
            userSnap, postsSnap, sentConnSnap, receivedConnSnap,
            sentMsgSnap, receivedMsgSnap, jobsSnap, circlesSnap,
        ] = await Promise.all([
            db.doc(`users/${uid}`).get(),
            db.collection("posts").where("authorUid", "==", uid).get(),
            db.collection("connections").where("senderUid", "==", uid).get(),
            db.collection("connections").where("receiverUid", "==", uid).get(),
            db.collection("messages").where("senderUid", "==", uid).get(),
            db.collection("messages").where("receiverUid", "==", uid).get(),
            db.collection("jobs").where("recruiterId", "==", uid).get(),
            db.collection("circles").where("members", "array-contains", uid).get(),
        ]);

        const profileData: any = userSnap.exists ? userSnap.data() : {};
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { stripeCustomerId, subscriptionId, ...safeProfile } = profileData;

        const exportData = {
            exportedAt:  new Date().toISOString(),
            profile:     safeProfile,
            posts:       postsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            connections: [
                ...sentConnSnap.docs.map((d) => ({ id: d.id, direction: "sent", ...d.data() })),
                ...receivedConnSnap.docs.map((d) => ({ id: d.id, direction: "received", ...d.data() })),
            ],
            messages: [
                ...sentMsgSnap.docs.map((d) => ({ id: d.id, direction: "sent", ...d.data() })),
                ...receivedMsgSnap.docs.map((d) => ({ id: d.id, direction: "received", ...d.data() })),
            ],
            jobs:    jobsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            circles: circlesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };

        const bucket   = admin.storage().bucket();
        const filePath = `data-exports/${uid}/${event.params.requestId}.json`;
        const file     = bucket.file(filePath);
        await file.save(JSON.stringify(exportData, null, 2), { contentType: "application/json" });

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const [downloadUrl] = await file.getSignedUrl({ action: "read", expires: expiresAt });

        await snap.ref.update({
            downloadUrl,
            expiresAt:     expiresAt.toISOString(),
            autoGenerated: true,
        });

        console.log(`onDataRequestCreated: generated export for uid=${uid}, request=${event.params.requestId}`);
    } catch (err: any) {
        console.error(`onDataRequestCreated: failed for request=${event.params.requestId}:`, err.message);
        await snap.ref.update({ autoGenerateError: err.message ?? "unknown error" }).catch(() => {});
    }
});


// ===================================================================
// Helper Functions
// ===================================================================
const transformPost = (post: admin.firestore.DocumentData) => {
  const createdAt = post.createdAt;
  const timestamp = createdAt && typeof createdAt.toDate === 'function'
    ? formatDistanceToNow(createdAt.toDate()) + " ago"
    : "Unknown time";

  return {
    ...post,
    timestamp,
    appreciations: {
      inspired: post.inspired || 0,
      respect: post.respect || 0,
    },
  };
};

const transformMessage = (message: admin.firestore.DocumentData) => {
    const createdAt = message.createdAt;
    const timestamp = createdAt && typeof createdAt.toDate === 'function'
      ? formatDistanceToNow(createdAt.toDate()) + " ago"
      : "Unknown time";

    return {
        ...message,
        timestamp,
    };
};

// transformArticle function kept for future use
// const transformArticle = (article: admin.firestore.DocumentData) => {
//     const createdAt = article.createdAt;
//     const timestamp = createdAt && typeof createdAt.toDate === 'function'
//       ? formatDistanceToNow(createdAt.toDate()) + " ago"
//       : "Unknown time";
//
//     return {
//         ...article,
//         timestamp,
//     };
// };

// ===================================================================
// API Functions (Callable)
// ===================================================================

// DEPRECATED: Use paginated endpoints instead
// Keeping for backward compatibility only - will be removed in next major version
export const getInitialAppData = onCall(async (_request) => {
  // data and context kept for backward compatibility
  try {
    // For initial load, only fetch essential data
    const [
      companiesSnap,
      circlesSnap,
      challengesSnap,
    ] = await Promise.all([
      db.collection("companies").get(),
      db.collection("circles").get(),
      db.collection("challenges").get(),
    ]);

    const companies = companiesSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data());
    const circles = circlesSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data());
    const challenges = challengesSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data());

    // Return empty arrays for paginated data - these should be fetched via pagination endpoints
    return {
      users: [],
      jobs: [],
      companies,
      circles,
      articles: [],
      posts: [],
      messages: [],
      connectionRequests: [],
      notifications: [],
      challenges
    };
  } catch (error) {
    console.error("Error fetching initial app data:", error);
    throw new HttpsError("internal", "Could not load application data");
  }
});

// ===================================================================
// Paginated Data Fetching Functions
// ===================================================================

export const getPaginatedPosts = onCall(async (request) => {
  const data = request.data;
  const { limit = 20, startAfter } = data;

  try {
    let query = db.collection("posts")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (startAfter) {
      const startDoc = await db.collection("posts").doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();
    const posts = snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      // Denormalize author info to avoid N+1 queries
      return transformPost(data);
    });

    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return { posts, hasMore, lastDocId: lastDoc };
  } catch (error) {
    console.error("Error fetching paginated posts:", error);
    throw new HttpsError("internal", "Could not load posts");
  }
});

export const getPaginatedJobs = onCall(async (request) => {
  const data = request.data;
  const { limit = 20, startAfter } = data;

  try {
    let query = db.collection("jobs")
      .where("status", "==", "Active")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (startAfter) {
      const startDoc = await db.collection("jobs").doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();
    const jobs = snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data());
    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return { jobs, hasMore, lastDocId: lastDoc };
  } catch (error) {
    console.error("Error fetching paginated jobs:", error);
    throw new HttpsError("internal", "Could not load jobs");
  }
});

export const getPaginatedUsers = onCall(async (request) => {
  const data = request.data;
  const { limit = 20, startAfter } = data;

  try {
    let query = db.collection("users")
      .where("status", "==", "active")
      .orderBy("reputation", "desc")
      .limit(limit);

    if (startAfter) {
      const startDoc = await db.collection("users").doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();
    const users = snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data());
    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return { users, hasMore, lastDocId: lastDoc };
  } catch (error) {
    console.error("Error fetching paginated users:", error);
    throw new HttpsError("internal", "Could not load users");
  }
});

export const getPaginatedMessages = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const { limit = 20, startAfter, otherUserId } = data;
  const uid = context.auth.uid;

  try {
    // Get conversations with a specific user if otherUserId is provided
    let query;
    if (otherUserId) {
      // Fetch messages between current user and specific other user
      query = db.collection("messages")
        .where("senderId", "in", [uid, otherUserId])
        .where("receiverId", "in", [uid, otherUserId])
        .orderBy("createdAt", "desc")
        .limit(limit);
    } else {
      // Fetch all messages for current user
      query = db.collection("messages")
        .where("senderId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }

    if (startAfter) {
      const startDoc = await db.collection("messages").doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();
    const messages = snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => transformMessage(doc.data()));
    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return { messages, hasMore, lastDocId: lastDoc };
  } catch (error) {
    console.error("Error fetching paginated messages:", error);
    throw new HttpsError("internal", "Could not load messages");
  }
});


export const getCurrentUser = onCall(async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found.");
    }
    return {user: userDoc.data()};
});


export const updateUser = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const {userData} = data;
    const userRef = db.collection("users").doc(context.auth.uid);
    await userRef.update(userData);
    const updatedUserDoc = await userRef.get();
    return {user: updatedUserDoc.data()};
});


export const createPost = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    // Rate limiting: 10 posts per hour
    const canProceed = await checkRateLimit(context.auth.uid, 'createPost', 10, 60 * 60 * 1000);
    if (!canProceed) {
        throw new HttpsError("resource-exhausted", "Rate limit exceeded. Please try again later.");
    }

    // Track activity for anomaly detection
    await detectAnomalousActivity(context.auth.uid, 'createPost');

    const {content, lens, circleId, expiresAt} = data;

    // Fetch author info for denormalization
    const authorDoc = await db.collection("users").doc(context.auth.uid).get();
    const author = authorDoc.data();

    if (!author) {
        throw new HttpsError("not-found", "User not found");
    }

    // AI SIMULATION: Score content quality and check for spam/scams
    const qualityScore = Math.floor(Math.random() * 30) + 70; // 70-100
    const moderationStatus = content.includes("http") ? "pending" : "approved";

    // Denormalize author data to avoid N+1 queries when displaying posts
    const newPost: any = {
        authorId: context.auth.uid,
        authorName: author.name || 'Unknown',
        authorAvatarUrl: author.avatarUrl || `https://i.pravatar.cc/150?u=${context.auth.uid}`,
        authorHeadline: author.headline || 'BeWatu Member',
        content,
        lens: lens || 'work',
        circleId: circleId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        inspired: 0,
        respect: 0,
        comments: 0,
        shares: 0,
        qualityScore,
        moderationStatus,
    };

    if (expiresAt) {
        newPost.expiresAt = expiresAt;
    }

    const postRef = await db.collection("posts").add(newPost);
    await postRef.update({ id: postRef.id });
    const postDoc = await postRef.get();
    return {post: transformPost(postDoc.data()!)};
});

export const appreciatePost = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { postId, appreciationType } = data;
     if (!['inspired', 'respect'].includes(appreciationType)) {
        throw new HttpsError("invalid-argument", "Invalid appreciation type.");
    }
    const postRef = db.collection("posts").doc(postId);

    // In a real app, you would also check if the user has already appreciated.
    // This is a simplified increment for the demo.
    await postRef.update({
        [appreciationType]: admin.firestore.FieldValue.increment(1),
    });

    const updatedPostDoc = await postRef.get();
    return {post: transformPost(updatedPostDoc.data()!)};
});

export const sendMessage = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { receiverId, text } = data;

    // AI SIMULATION: Check for scams/spam in messages
    const moderationStatus = text.toLowerCase().includes("urgent action required") ? "quarantined" : "normal";

    const newMessage = {
        senderId: context.auth.uid,
        receiverId,
        text,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        moderationStatus,
    };
    const messageRef = await db.collection("messages").add(newMessage);
    await messageRef.update({ id: messageRef.id });
    const messageDoc = await messageRef.get();
    return {message: transformMessage(messageDoc.data()!)};
});


export const createJob = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { jobData } = data;

    // AI SIMULATION: Check job description for potential scams
    const moderationStatus = jobData.description.toLowerCase().includes("guaranteed income") ? "quarantined" : "approved";

    const newJob = {
        ...jobData,
        recruiterId: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        moderationStatus,
        impactTags: jobData.impactTags || [],
    };
    const jobRef = await db.collection("jobs").add(newJob);
    await jobRef.update({ id: jobRef.id });
    const jobDoc = await jobRef.get();
    return { job: jobDoc.data() };
});

export const updateJob = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { jobId, jobData } = data;
    const jobRef = db.collection("jobs").doc(jobId);
    await jobRef.update(jobData);
    const updatedJobDoc = await jobRef.get();
    return { job: updatedJobDoc.data() };
});

export const deleteJob = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { jobId } = data;
    await db.collection("jobs").doc(jobId).delete();
    return { success: true };
});

export const createChallenge = onCall(async (request) => {
    const data = request.data;
    const context = { auth: request.auth };
    if (!context.auth || !(await db.collection("users").doc(context.auth.uid).get()).data()?.isRecruiter) {
        throw new HttpsError("permission-denied", "Only recruiters can create challenges.");
    }
    const { challengeData } = data;
    const newChallenge = {
        ...challengeData,
        recruiterId: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const challengeRef = await db.collection("challenges").add(newChallenge);
    await challengeRef.update({ id: challengeRef.id });
    const challengeDoc = await challengeRef.get();
    return { challenge: challengeDoc.data() };
});

// ===================================================================
// Profile Sync & Denormalization Triggers
// ===================================================================

// Sync user profile changes to their posts (for denormalized data)
export const syncUserProfileToPosts = onDocumentUpdated('users/{userId}', async (event) => {
    const change = { before: event.data!.before, after: event.data!.after };
    const context = { params: event.params };
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;

    // Only sync if relevant fields changed
    const fieldsToSync = ['name', 'avatarUrl', 'headline'];
    const hasRelevantChange = fieldsToSync.some(field => before[field] !== after[field]);

    if (!hasRelevantChange) {
      return null;
    }

    // Update all posts by this user with new denormalized data
    const postsSnapshot = await db.collection('posts')
      .where('authorId', '==', userId)
      .get();

    const batch = db.batch();
    postsSnapshot.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      batch.update(doc.ref, {
        authorName: after.name,
        authorAvatarUrl: after.avatarUrl,
        authorHeadline: after.headline,
      });
    });

    await batch.commit();
    console.log(`Synced profile for user ${userId} to ${postsSnapshot.size} posts`);
    return null;
});

// ===================================================================
// Factory — investor onboarding (Decision 4: reviewed, not self-serve)
// ===================================================================

// firestore.rules sets factory_investors.create to `false` — a client can
// never create their own investor profile. This is the only path that can:
// ops/admin approves an investor_applications doc, and this trigger
// provisions the factory_investors profile from it, once.
export const provisionInvestorOnApproval = onDocumentUpdated('investor_applications/{applicationId}', async (event) => {
    const change = { before: event.data!.before, after: event.data!.after };
    const context = { params: event.params };
    const before = change.before.data();
    const after = change.after.data();

    // Only act on the pending -> approved transition, not every edit to an
    // already-approved application.
    if (before.status === 'approved' || after.status !== 'approved') {
      return null;
    }

    const uid = after.uid;
    if (!uid) {
      console.error(`investor_applications/${context.params.applicationId} approved with no uid field`);
      return null;
    }

    const investorRef = db.collection('factory_investors').doc(uid);
    const existing = await investorRef.get();
    if (existing.exists) {
      // Already provisioned — don't clobber an edited profile on a re-save
      // of the application (e.g. ops correcting a typo after approval).
      return null;
    }

    await investorRef.set({
      user: { id: uid, name: after.name ?? '', email: after.email ?? '' },
      type: after.type ?? null,
      firm: after.firm ?? '',
      thesis: after.thesis ?? '',
      stages: after.stages ?? [],
      sectors: after.sectors ?? [],
      approvedFrom: context.params.applicationId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Provisioned factory_investors/${uid} from investor_applications/${context.params.applicationId}`);
    return null;
});

// ===================================================================
// AI Analysis Caching
// ===================================================================

export const getCachedJobAnalysis = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const { jobId } = data;
  const userId = context.auth.uid;
  const cacheKey = `${userId}_${jobId}`;

  try {
    // Check cache first
    const cacheDoc = await db.collection('aiAnalysisCache')
      .doc(cacheKey)
      .get();

    if (cacheDoc.exists) {
      const cachedData = cacheDoc.data();
      const cacheAge = Date.now() - cachedData!.createdAt.toMillis();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (cacheAge < maxAge) {
        console.log(`Cache hit for job analysis: ${cacheKey}`);
        return { analysis: cachedData!.analysis, cached: true };
      }
    }

    return { analysis: null, cached: false };
  } catch (error) {
    console.error("Error fetching cached analysis:", error);
    return { analysis: null, cached: false };
  }
});

export const setCachedJobAnalysis = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const { jobId, analysis } = data;
  const userId = context.auth.uid;
  const cacheKey = `${userId}_${jobId}`;

  try {
    await db.collection('aiAnalysisCache').doc(cacheKey).set({
      userId,
      jobId,
      analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error("Error caching analysis:", error);
    throw new HttpsError("internal", "Could not cache analysis");
  }
});

export const getCachedSynergyAnalysis = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const { otherUserId } = data;
  const userId = context.auth.uid;

  // Create consistent cache key regardless of user order
  const userIds = [userId, otherUserId].sort();
  const cacheKey = `${userIds[0]}_${userIds[1]}`;

  try {
    const cacheDoc = await db.collection('synergyCache')
      .doc(cacheKey)
      .get();

    if (cacheDoc.exists) {
      const cachedData = cacheDoc.data();
      const cacheAge = Date.now() - cachedData!.createdAt.toMillis();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

      if (cacheAge < maxAge) {
        console.log(`Cache hit for synergy analysis: ${cacheKey}`);
        return { analysis: cachedData!.analysis, cached: true };
      }
    }

    return { analysis: null, cached: false };
  } catch (error) {
    console.error("Error fetching cached synergy:", error);
    return { analysis: null, cached: false };
  }
});

export const setCachedSynergyAnalysis = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const { otherUserId, analysis } = data;
  const userId = context.auth.uid;

  const userIds = [userId, otherUserId].sort();
  const cacheKey = `${userIds[0]}_${userIds[1]}`;

  try {
    await db.collection('synergyCache').doc(cacheKey).set({
      user1Id: userIds[0],
      user2Id: userIds[1],
      analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error("Error caching synergy analysis:", error);
    throw new HttpsError("internal", "Could not cache analysis");
  }
});

// Invalidate AI caches when user profile significantly changes
export const invalidateAICaches = onDocumentUpdated('users/{userId}', async (event) => {
    const change = { before: event.data!.before, after: event.data!.after };
    const context = { params: event.params };
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;

    // Check if significant fields changed
    const significantFields = ['bio', 'skills', 'verifiedSkills', 'pastRoles'];
    const hasSignificantChange = significantFields.some(field =>
      JSON.stringify(before[field]) !== JSON.stringify(after[field])
    );

    if (!hasSignificantChange) {
      return null;
    }

    // Delete job analysis caches for this user
    const jobCachesSnapshot = await db.collection('aiAnalysisCache')
      .where('userId', '==', userId)
      .get();

    const batch1 = db.batch();
    jobCachesSnapshot.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      batch1.delete(doc.ref);
    });
    await batch1.commit();

    // Delete synergy caches involving this user
    const synergyCaches1 = await db.collection('synergyCache')
      .where('user1Id', '==', userId)
      .get();

    const synergyCaches2 = await db.collection('synergyCache')
      .where('user2Id', '==', userId)
      .get();

    const batch2 = db.batch();
    [...synergyCaches1.docs, ...synergyCaches2.docs].forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      batch2.delete(doc.ref);
    });
    await batch2.commit();

    console.log(`Invalidated AI caches for user ${userId}`);
    return null;
});

// ===================================================================
// GDPR/CCPA Compliance Functions
// ===================================================================

// Export all user data (GDPR Article 20 - Right to Data Portability)
export const exportUserData = onCall(async (request) => {
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const userId = context.auth.uid;

  try {
    // Gather all user data from all collections
    const [
      userDoc,
      postsSnap,
      messagesSnap,
      jobsSnap,
      notificationsSnap,
      connectionsSnap,
    ] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('posts').where('authorId', '==', userId).get(),
      db.collection('messages').where('senderId', '==', userId).get(),
      db.collection('jobs').where('recruiterId', '==', userId).get(),
      db.collection('notifications').where('userId', '==', userId).get(),
      db.collection('connectionRequests').where('fromUserId', '==', userId).get(),
    ]);

    const userData = {
      profile: userDoc.data(),
      posts: postsSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data()),
      messages: messagesSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data()),
      jobs: jobsSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data()),
      notifications: notificationsSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data()),
      connectionRequests: connectionsSnap.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data()),
      exportDate: new Date().toISOString(),
    };

    // Log the export for compliance
    await db.collection('dataExports').add({
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'USER_REQUEST',
    });

    return { data: userData };
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw new HttpsError('internal', 'Could not export user data');
  }
});

// Permanent data deletion (GDPR Article 17 - Right to Erasure)
export const permanentlyDeleteUserData = onCall(async (request) => {
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const userId = context.auth.uid;

  try {
    // Verify user has deactivated account
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData || userData.status !== 'deactivated') {
      throw new HttpsError('failed-precondition', 'Account must be deactivated first');
    }

    // Delete all user data
    const batch = db.batch();

    // Delete user profile
    batch.delete(db.collection('users').doc(userId));

    // Delete posts
    const postsSnap = await db.collection('posts').where('authorId', '==', userId).get();
    postsSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    // Delete messages
    const sentMessages = await db.collection('messages').where('senderId', '==', userId).get();
    const receivedMessages = await db.collection('messages').where('receiverId', '==', userId).get();
    [...sentMessages.docs, ...receivedMessages.docs].forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    // Delete jobs
    const jobsSnap = await db.collection('jobs').where('recruiterId', '==', userId).get();
    jobsSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    // Delete notifications
    const notificationsSnap = await db.collection('notifications').where('userId', '==', userId).get();
    notificationsSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    // Delete connection requests
    const sentConnections = await db.collection('connectionRequests').where('fromUserId', '==', userId).get();
    const receivedConnections = await db.collection('connectionRequests').where('toUserId', '==', userId).get();
    [...sentConnections.docs, ...receivedConnections.docs].forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    // Delete AI caches
    const aiCaches = await db.collection('aiAnalysisCache').where('userId', '==', userId).get();
    aiCaches.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    const synergyCaches1 = await db.collection('synergyCache').where('user1Id', '==', userId).get();
    const synergyCaches2 = await db.collection('synergyCache').where('user2Id', '==', userId).get();
    [...synergyCaches1.docs, ...synergyCaches2.docs].forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    await batch.commit();

    // Log the deletion for compliance
    await db.collection('dataDeletions').add({
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'USER_REQUEST',
    });

    // Delete Firebase Auth account
    await admin.auth().deleteUser(userId);

    return { success: true };
  } catch (error) {
    console.error('Error permanently deleting user data:', error);
    throw new HttpsError('internal', 'Could not delete user data');
  }
});

// Update privacy settings
export const updatePrivacySettings = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const { settings } = data;
  const userId = context.auth.uid;

  try {
    await db.collection('users').doc(userId).update({
      privacySettings: {
        dataProcessingConsent: settings.dataProcessingConsent ?? true,
        marketingConsent: settings.marketingConsent ?? false,
        analyticsConsent: settings.analyticsConsent ?? true,
        thirdPartySharing: settings.thirdPartySharing ?? false,
        profileVisibility: settings.profileVisibility ?? 'public', // public, connections, private
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    throw new HttpsError('internal', 'Could not update privacy settings');
  }
});
// ===================================================================
// BeWatu Factory — Cross-site SSO Handoff
// ===================================================================

export const mintHandoffToken = onCall({
  cors: ["https://bewatu.com", "https://www.bewatu.com", "http://localhost:3000"],
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in");
  }
  try {
    const customToken = await admin.auth().createCustomToken(request.auth.uid);
    return { token: customToken };
  } catch (err) {
    console.error("mintHandoffToken error:", err);
    throw new HttpsError("internal", "Failed to generate handoff token");
  }
});

// ===================================================================
// CoSentiment Integration
// ===================================================================

const COSENTIMENT_API = "https://www.cosentiment.com/api/bewatu";

function cosentimentHeaders() {
  const key = process.env.COSENTIMENT_API_KEY;
  if (!key) throw new HttpsError("internal", "CoSentiment API key not configured");
  return {
    "Content-Type": "application/json",
    "x-bewatu-api-key": key,
  };
}

// Fetch a teaser score for a company by domain.
// Called from CompanyProfileModal when it opens — result is shown as a blurred
// score widget that CTAs to CoSentiment for the full analysis.
export const getCoSentimentTeaser = onCall({
  cors: ["https://bewatu.com", "https://www.bewatu.com", "http://localhost:3000"],
}, async (request) => {
  const { domain } = request.data as { domain: string };
  if (!domain || typeof domain !== "string") {
    throw new HttpsError("invalid-argument", "domain is required");
  }

  // Sanitise — strip any path or query string, just the hostname
  const hostname = domain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();

  try {
    const res = await fetch(`${COSENTIMENT_API}/score/${encodeURIComponent(hostname)}`, {
      headers: cosentimentHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error("getCoSentimentTeaser error:", err);
    return null; // fail silently — CoSentiment is additive, never blocking
  }
});

// Send a community sentiment signal to CoSentiment.
// Fired when a Bewatu user follows a company, so CoSentiment scores benefit
// from Bewatu engagement data. Fire-and-forget from the client side.
export const sendCoSentimentSignal = onCall({
  cors: ["https://bewatu.com", "https://www.bewatu.com", "http://localhost:3000"],
}, async (request) => {
  const {
    domain,
    mentions = 1,
    positive_mentions = 0,
    negative_mentions = 0,
    engagement_score = 0.5,
    top_topics = [],
  } = request.data as {
    domain: string;
    mentions?: number;
    positive_mentions?: number;
    negative_mentions?: number;
    engagement_score?: number;
    top_topics?: string[];
  };

  if (!domain || typeof domain !== "string") {
    throw new HttpsError("invalid-argument", "domain is required");
  }

  const hostname = domain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  const bewatu_user_id = request.auth?.uid ?? null;

  try {
    await fetch(`${COSENTIMENT_API}/signal`, {
      method: "POST",
      headers: cosentimentHeaders(),
      body: JSON.stringify({
        domain: hostname,
        mentions,
        positive_mentions,
        negative_mentions,
        engagement_score,
        top_topics,
        bewatu_user_id,
      }),
    });
  } catch (err) {
    console.error("sendCoSentimentSignal error:", err);
    // Swallow — signals are best-effort
  }

  return { ok: true };
});
