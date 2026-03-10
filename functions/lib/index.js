"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintHandoffToken = exports.updatePrivacySettings = exports.permanentlyDeleteUserData = exports.exportUserData = exports.invalidateAICaches = exports.setCachedSynergyAnalysis = exports.getCachedSynergyAnalysis = exports.setCachedJobAnalysis = exports.getCachedJobAnalysis = exports.syncUserProfileToPosts = exports.createChallenge = exports.deleteJob = exports.updateJob = exports.createJob = exports.sendMessage = exports.appreciatePost = exports.createPost = exports.updateUser = exports.getCurrentUser = exports.getPaginatedMessages = exports.getPaginatedUsers = exports.getPaginatedJobs = exports.getPaginatedPosts = exports.getInitialAppData = exports.undoDeleteAccount = exports.deleteAccount = exports.completeRegistration = exports.createUserProfile = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const date_fns_1 = require("date-fns");
const https_1 = require("firebase-functions/v2/https");
admin.initializeApp();
const db = admin.firestore();
// ===================================================================
// Rate Limiting & Security
// ===================================================================
// Rate limiter using Firestore
async function checkRateLimit(userId, action, maxRequests, windowMs) {
    const rateLimitRef = db.collection('rateLimits').doc(`${userId}_${action}`);
    const now = Date.now();
    return db.runTransaction(async (transaction) => {
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
        const data = doc.data();
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
        }
        else {
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
async function detectAnomalousActivity(userId, action) {
    const activityRef = db.collection('userActivity').doc(userId);
    const now = Date.now();
    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(activityRef);
        const activities = doc.exists ? (doc.data().recentActivities || []) : [];
        // Add current activity
        activities.push({ action, timestamp: now });
        // Keep only last hour of activities
        const oneHourAgo = now - 60 * 60 * 1000;
        const recentActivities = activities.filter((a) => a.timestamp > oneHourAgo);
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
exports.createUserProfile = functions.https.onCall(async (data, context) => {
    const { uid, email, name, isRecruiter } = data;
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
    return { user: userDoc.data() };
});
exports.completeRegistration = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { intentStatement } = data;
    const userRef = db.collection("users").doc(context.auth.uid);
    // AI SIMULATION: Extract intents from the statement
    const extractedIntents = ["Seeking new opportunities", "Networking with peers"];
    await userRef.update({
        status: "active",
        intentStatement,
        extractedIntents,
    });
    const updatedUserDoc = await userRef.get();
    return { user: updatedUserDoc.data() };
});
exports.deleteAccount = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const userRef = db.collection("users").doc(context.auth.uid);
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30); // 30-day grace period
    await userRef.update({
        status: "deactivated",
        deletionScheduledAt: deletionDate.toISOString(),
    });
    // In a real production app, you would schedule a Cloud Function to run in 30 days
    // to permanently delete all user data from Firestore, Storage, and Auth.
    // e.g., using Cloud Tasks or a scheduled function that checks for expired accounts.
    return { success: true };
});
exports.undoDeleteAccount = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const userRef = db.collection("users").doc(context.auth.uid);
    await userRef.update({
        status: "active",
        deletionScheduledAt: admin.firestore.FieldValue.delete(),
    });
    return { success: true };
});
// ===================================================================
// Helper Functions
// ===================================================================
const transformPost = (post) => {
    const createdAt = post.createdAt;
    const timestamp = createdAt && typeof createdAt.toDate === 'function'
        ? (0, date_fns_1.formatDistanceToNow)(createdAt.toDate()) + " ago"
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
const transformMessage = (message) => {
    const createdAt = message.createdAt;
    const timestamp = createdAt && typeof createdAt.toDate === 'function'
        ? (0, date_fns_1.formatDistanceToNow)(createdAt.toDate()) + " ago"
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
exports.getInitialAppData = functions.https.onCall(async (data, context) => {
    // data and context kept for backward compatibility
    try {
        // For initial load, only fetch essential data
        const [companiesSnap, circlesSnap, challengesSnap,] = await Promise.all([
            db.collection("companies").get(),
            db.collection("circles").get(),
            db.collection("challenges").get(),
        ]);
        const companies = companiesSnap.docs.map((doc) => doc.data());
        const circles = circlesSnap.docs.map((doc) => doc.data());
        const challenges = challengesSnap.docs.map((doc) => doc.data());
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
    }
    catch (error) {
        console.error("Error fetching initial app data:", error);
        throw new functions.https.HttpsError("internal", "Could not load application data");
    }
});
// ===================================================================
// Paginated Data Fetching Functions
// ===================================================================
exports.getPaginatedPosts = functions.https.onCall(async (data, context) => {
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
        const posts = snapshot.docs.map((doc) => {
            const data = doc.data();
            // Denormalize author info to avoid N+1 queries
            return transformPost(data);
        });
        const hasMore = snapshot.docs.length === limit;
        const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;
        return { posts, hasMore, lastDocId: lastDoc };
    }
    catch (error) {
        console.error("Error fetching paginated posts:", error);
        throw new functions.https.HttpsError("internal", "Could not load posts");
    }
});
exports.getPaginatedJobs = functions.https.onCall(async (data, context) => {
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
        const jobs = snapshot.docs.map((doc) => doc.data());
        const hasMore = snapshot.docs.length === limit;
        const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;
        return { jobs, hasMore, lastDocId: lastDoc };
    }
    catch (error) {
        console.error("Error fetching paginated jobs:", error);
        throw new functions.https.HttpsError("internal", "Could not load jobs");
    }
});
exports.getPaginatedUsers = functions.https.onCall(async (data, context) => {
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
        const users = snapshot.docs.map((doc) => doc.data());
        const hasMore = snapshot.docs.length === limit;
        const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;
        return { users, hasMore, lastDocId: lastDoc };
    }
    catch (error) {
        console.error("Error fetching paginated users:", error);
        throw new functions.https.HttpsError("internal", "Could not load users");
    }
});
exports.getPaginatedMessages = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
        }
        else {
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
        const messages = snapshot.docs.map((doc) => transformMessage(doc.data()));
        const hasMore = snapshot.docs.length === limit;
        const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;
        return { messages, hasMore, lastDocId: lastDoc };
    }
    catch (error) {
        console.error("Error fetching paginated messages:", error);
        throw new functions.https.HttpsError("internal", "Could not load messages");
    }
});
exports.getCurrentUser = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError("not-found", "User profile not found.");
    }
    return { user: userDoc.data() };
});
exports.updateUser = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { userData } = data;
    const userRef = db.collection("users").doc(context.auth.uid);
    await userRef.update(userData);
    const updatedUserDoc = await userRef.get();
    return { user: updatedUserDoc.data() };
});
exports.createPost = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    // Rate limiting: 10 posts per hour
    const canProceed = await checkRateLimit(context.auth.uid, 'createPost', 10, 60 * 60 * 1000);
    if (!canProceed) {
        throw new functions.https.HttpsError("resource-exhausted", "Rate limit exceeded. Please try again later.");
    }
    // Track activity for anomaly detection
    await detectAnomalousActivity(context.auth.uid, 'createPost');
    const { content, lens, circleId, expiresAt } = data;
    // Fetch author info for denormalization
    const authorDoc = await db.collection("users").doc(context.auth.uid).get();
    const author = authorDoc.data();
    if (!author) {
        throw new functions.https.HttpsError("not-found", "User not found");
    }
    // AI SIMULATION: Score content quality and check for spam/scams
    const qualityScore = Math.floor(Math.random() * 30) + 70; // 70-100
    const moderationStatus = content.includes("http") ? "pending" : "approved";
    // Denormalize author data to avoid N+1 queries when displaying posts
    const newPost = {
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
    return { post: transformPost(postDoc.data()) };
});
exports.appreciatePost = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { postId, appreciationType } = data;
    if (!['inspired', 'respect'].includes(appreciationType)) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid appreciation type.");
    }
    const postRef = db.collection("posts").doc(postId);
    // In a real app, you would also check if the user has already appreciated.
    // This is a simplified increment for the demo.
    await postRef.update({
        [appreciationType]: admin.firestore.FieldValue.increment(1),
    });
    const updatedPostDoc = await postRef.get();
    return { post: transformPost(updatedPostDoc.data()) };
});
exports.sendMessage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
    return { message: transformMessage(messageDoc.data()) };
});
exports.createJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
exports.updateJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { jobId, jobData } = data;
    const jobRef = db.collection("jobs").doc(jobId);
    await jobRef.update(jobData);
    const updatedJobDoc = await jobRef.get();
    return { job: updatedJobDoc.data() };
});
exports.deleteJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { jobId } = data;
    await db.collection("jobs").doc(jobId).delete();
    return { success: true };
});
exports.createChallenge = functions.https.onCall(async (data, context) => {
    if (!context.auth || !(await db.collection("users").doc(context.auth.uid).get()).data()?.isRecruiter) {
        throw new functions.https.HttpsError("permission-denied", "Only recruiters can create challenges.");
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
exports.syncUserProfileToPosts = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
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
    postsSnapshot.docs.forEach((doc) => {
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
// AI Analysis Caching
// ===================================================================
exports.getCachedJobAnalysis = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
            const cacheAge = Date.now() - cachedData.createdAt.toMillis();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            if (cacheAge < maxAge) {
                console.log(`Cache hit for job analysis: ${cacheKey}`);
                return { analysis: cachedData.analysis, cached: true };
            }
        }
        return { analysis: null, cached: false };
    }
    catch (error) {
        console.error("Error fetching cached analysis:", error);
        return { analysis: null, cached: false };
    }
});
exports.setCachedJobAnalysis = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
    }
    catch (error) {
        console.error("Error caching analysis:", error);
        throw new functions.https.HttpsError("internal", "Could not cache analysis");
    }
});
exports.getCachedSynergyAnalysis = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
            const cacheAge = Date.now() - cachedData.createdAt.toMillis();
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            if (cacheAge < maxAge) {
                console.log(`Cache hit for synergy analysis: ${cacheKey}`);
                return { analysis: cachedData.analysis, cached: true };
            }
        }
        return { analysis: null, cached: false };
    }
    catch (error) {
        console.error("Error fetching cached synergy:", error);
        return { analysis: null, cached: false };
    }
});
exports.setCachedSynergyAnalysis = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
    }
    catch (error) {
        console.error("Error caching synergy analysis:", error);
        throw new functions.https.HttpsError("internal", "Could not cache analysis");
    }
});
// Invalidate AI caches when user profile significantly changes
exports.invalidateAICaches = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;
    // Check if significant fields changed
    const significantFields = ['bio', 'skills', 'verifiedSkills', 'pastRoles'];
    const hasSignificantChange = significantFields.some(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
    if (!hasSignificantChange) {
        return null;
    }
    // Delete job analysis caches for this user
    const jobCachesSnapshot = await db.collection('aiAnalysisCache')
        .where('userId', '==', userId)
        .get();
    const batch1 = db.batch();
    jobCachesSnapshot.docs.forEach((doc) => {
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
    [...synergyCaches1.docs, ...synergyCaches2.docs].forEach((doc) => {
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
exports.exportUserData = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const userId = context.auth.uid;
    try {
        // Gather all user data from all collections
        const [userDoc, postsSnap, messagesSnap, jobsSnap, notificationsSnap, connectionsSnap,] = await Promise.all([
            db.collection('users').doc(userId).get(),
            db.collection('posts').where('authorId', '==', userId).get(),
            db.collection('messages').where('senderId', '==', userId).get(),
            db.collection('jobs').where('recruiterId', '==', userId).get(),
            db.collection('notifications').where('userId', '==', userId).get(),
            db.collection('connectionRequests').where('fromUserId', '==', userId).get(),
        ]);
        const userData = {
            profile: userDoc.data(),
            posts: postsSnap.docs.map((doc) => doc.data()),
            messages: messagesSnap.docs.map((doc) => doc.data()),
            jobs: jobsSnap.docs.map((doc) => doc.data()),
            notifications: notificationsSnap.docs.map((doc) => doc.data()),
            connectionRequests: connectionsSnap.docs.map((doc) => doc.data()),
            exportDate: new Date().toISOString(),
        };
        // Log the export for compliance
        await db.collection('dataExports').add({
            userId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'USER_REQUEST',
        });
        return { data: userData };
    }
    catch (error) {
        console.error('Error exporting user data:', error);
        throw new functions.https.HttpsError('internal', 'Could not export user data');
    }
});
// Permanent data deletion (GDPR Article 17 - Right to Erasure)
exports.permanentlyDeleteUserData = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const userId = context.auth.uid;
    try {
        // Verify user has deactivated account
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!userData || userData.status !== 'deactivated') {
            throw new functions.https.HttpsError('failed-precondition', 'Account must be deactivated first');
        }
        // Delete all user data
        const batch = db.batch();
        // Delete user profile
        batch.delete(db.collection('users').doc(userId));
        // Delete posts
        const postsSnap = await db.collection('posts').where('authorId', '==', userId).get();
        postsSnap.docs.forEach((doc) => batch.delete(doc.ref));
        // Delete messages
        const sentMessages = await db.collection('messages').where('senderId', '==', userId).get();
        const receivedMessages = await db.collection('messages').where('receiverId', '==', userId).get();
        [...sentMessages.docs, ...receivedMessages.docs].forEach((doc) => batch.delete(doc.ref));
        // Delete jobs
        const jobsSnap = await db.collection('jobs').where('recruiterId', '==', userId).get();
        jobsSnap.docs.forEach((doc) => batch.delete(doc.ref));
        // Delete notifications
        const notificationsSnap = await db.collection('notifications').where('userId', '==', userId).get();
        notificationsSnap.docs.forEach((doc) => batch.delete(doc.ref));
        // Delete connection requests
        const sentConnections = await db.collection('connectionRequests').where('fromUserId', '==', userId).get();
        const receivedConnections = await db.collection('connectionRequests').where('toUserId', '==', userId).get();
        [...sentConnections.docs, ...receivedConnections.docs].forEach((doc) => batch.delete(doc.ref));
        // Delete AI caches
        const aiCaches = await db.collection('aiAnalysisCache').where('userId', '==', userId).get();
        aiCaches.docs.forEach((doc) => batch.delete(doc.ref));
        const synergyCaches1 = await db.collection('synergyCache').where('user1Id', '==', userId).get();
        const synergyCaches2 = await db.collection('synergyCache').where('user2Id', '==', userId).get();
        [...synergyCaches1.docs, ...synergyCaches2.docs].forEach((doc) => batch.delete(doc.ref));
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
    }
    catch (error) {
        console.error('Error permanently deleting user data:', error);
        throw new functions.https.HttpsError('internal', 'Could not delete user data');
    }
});
// Update privacy settings
exports.updatePrivacySettings = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
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
    }
    catch (error) {
        console.error('Error updating privacy settings:', error);
        throw new functions.https.HttpsError('internal', 'Could not update privacy settings');
    }
});
// ===================================================================
// BeWatu Factory — Cross-site SSO Handoff
// ===================================================================
exports.mintHandoffToken = (0, https_1.onCall)({
    cors: ["https://bewatu.com", "https://www.bewatu.com", "http://localhost:3000"],
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in");
    }
    try {
        const customToken = await admin.auth().createCustomToken(request.auth.uid);
        return { token: customToken };
    }
    catch (err) {
        console.error("mintHandoffToken error:", err);
        throw new https_1.HttpsError("internal", "Failed to generate handoff token");
    }
});
//# sourceMappingURL=index.js.map