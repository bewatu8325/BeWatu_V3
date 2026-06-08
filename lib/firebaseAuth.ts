/**
 * lib/firebaseAuth.ts
 * Firebase auth wired to BeWatu's User type.
 *
 * Two fixes in this version:
 *
 * FIX 1 — Safari popup → redirect fallback
 *   Safari ITP blocks third-party popups in private browsing and strict
 *   tracking-prevention mode. We detect Safari and use signInWithRedirect
 *   instead. On redirect return, getRedirectResult() picks up the credential.
 *
 * FIX 2 — Race condition in onAuthChange for new Google users
 *   signInWithPopup fires onAuthStateChanged before loginWithGoogle has written
 *   the user's Firestore document. getUserFromFirestore threw "User document
 *   not found", catch called callback(null, null), app showed error screen.
 *   Fix: retry once (600ms delay) before treating a missing doc as an error.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { User } from '../types';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];

// ── Safari detection ──────────────────────────────────────────────────────────
function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /^((?!chrome|android).)*safari/i.test(ua);
}

// ── Convert Firestore doc → BeWatu User ──────────────────────────────────────
function docToUser(data: Record<string, any>): User {
  return {
    id: data.numericId ?? 1,
    name: data.displayName ?? '',
    headline: data.headline ?? '',
    bio: data.bio ?? '',
    avatarUrl: data.photoURL ?? `https://picsum.photos/seed/${data.uid}/100`,
    industry: data.industry ?? '',
    professionalGoals: data.professionalGoals ?? [],
    reputation: data.reputation ?? 0,
    credits: data.credits ?? 100,
    isRecruiter: data.isRecruiter ?? false,
    isVerified: data.isVerified ?? false,
    phone: data.phone ?? '',
    stripeCustomerId: data.stripeCustomerId,
    subscriptionTier:      data.subscriptionTier     ?? 'free',
    subscriptionStatus:    data.subscriptionStatus   ?? 'active',
    subscriptionId:        data.subscriptionId,
    subscriptionPriceId:   data.subscriptionPriceId,
    currentPeriodEnd:      data.currentPeriodEnd,
    trialEndsAt:           data.trialEndsAt,
    trialEndingSoon:       data.trialEndingSoon       ?? false,
    factoryUnlocked:       data.factoryUnlocked       ?? false,
    factoryUnlockedAt:     data.factoryUnlockedAt,
    factoryUnlockReason:   data.factoryUnlockReason,
    ideaTractionScore:     data.ideaTractionScore     ?? 0,
    collaborationScore:    data.collaborationScore    ?? 0,
    teamFormationScore:    data.teamFormationScore    ?? 0,
    arenaPerformanceScore: data.arenaPerformanceScore ?? 0,
    proSubscriptionDays:   data.proSubscriptionDays   ?? 0,
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
    microIntroductionThumbnail: data.microIntroductionThumbnail ?? null,
    careerArc: data.careerArc ?? [],
    recruiterProfile: data.recruiterProfile ?? null,
  } as any;
}

// ── Username derivation ───────────────────────────────────────────────────────
// Converts a display name to a URL-safe lowercase slug, e.g. "Eve Mwangi" → "emwangi"
// Uses first-initial + last-name (LinkedIn-style), falls back to first word if single name.
function deriveUsername(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1]).toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return parts[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'user';
}

// ── Build default Firestore doc ───────────────────────────────────────────────
function buildNewUserDoc(
  uid: string,
  name: string,
  email: string,
  isRecruiter: boolean,
  photoURL?: string
) {
  const isVerified = !freeEmailDomains.some((d) => email.endsWith(d));
  const baseUsername = deriveUsername(name);
  return {
    uid, numericId: Date.now(), displayName: name, email,
    photoURL: photoURL ?? '', headline: '', bio: '', industry: '',
    location: '', website: '', professionalGoals: [], reputation: 0,
    credits: 100, isRecruiter, isVerified, portfolio: [],
    verifiedAchievements: [], thirdPartyIntegrations: [],
    username: baseUsername,  // URL slug — /be/:username
    workStyle: { collaboration: 'Thrives in pairs', communication: 'Prefers asynchronous', workPace: 'Fast-paced and iterative' },
    values: [], availability: 'Exploring opportunities', skills: [],
    verifiedSkills: null, microIntroductionUrl: null, connectionCount: 0,
    isPublic: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}

// ── Shared Google upsert ──────────────────────────────────────────────────────
// Creates the user doc on first sign-in; returns the User on every call.
async function upsertGoogleUser(fbUser: FirebaseUser, isRecruiter: boolean): Promise<User> {
  const ref  = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const newDoc = buildNewUserDoc(
      fbUser.uid, fbUser.displayName ?? 'New User',
      fbUser.email ?? '', isRecruiter, fbUser.photoURL ?? undefined
    );
    await setDoc(ref, newDoc);
    return docToUser(newDoc);
  }
  return docToUser(snap.data() as Record<string, any>);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function registerWithEmail(
  name: string, email: string, password: string, isRecruiter: boolean
): Promise<User> {
  const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(fbUser);
  const newDoc = buildNewUserDoc(fbUser.uid, name, email, isRecruiter);
  await setDoc(doc(db, 'users', fbUser.uid), newDoc);
  return docToUser(newDoc);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return getUserFromFirestore(cred.user);
}

/**
 * Sign in / register with Google.
 * Safari → redirect (returns null; result arrives via onAuthChange on reload).
 * Other browsers → popup (returns User immediately).
 */
export async function loginWithGoogle(isRecruiter = false): Promise<User | null> {
  if (isSafari()) {
    await signInWithRedirect(auth, googleProvider);
    return null; // page reloads; result handled in onAuthChange
  }
  const cred = await signInWithPopup(auth, googleProvider);
  return upsertGoogleUser(cred.user, isRecruiter);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export async function forgotPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email, {
    url: `${window.location.origin}/`, handleCodeInApp: false,
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not signed in');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  await updatePassword(user, newPassword);
}

/**
 * Subscribe to auth state.
 *
 * Handles the Safari redirect result on page load via getRedirectResult().
 *
 * Race condition fix: retries getUserFromFirestore once after 600ms when
 * the user doc is missing — this covers new Google sign-ups where
 * onAuthStateChanged fires before upsertGoogleUser has written the doc.
 */
export function onAuthChange(
  callback: (user: User | null, fbUser: FirebaseUser | null) => void
): () => void {
  // Handle Safari redirect result on page load
  getRedirectResult(auth)
    .then(async result => {
      if (result?.user) {
        await upsertGoogleUser(result.user, false).catch(() => {});
      }
    })
    .catch(() => {});

  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) { callback(null, null); return; }

    // First attempt
    try {
      callback(await getUserFromFirestore(fbUser), fbUser);
      return;
    } catch {
      // Doc may not exist yet — new Google user race condition. Retry once.
    }

    await new Promise(r => setTimeout(r, 600));

    try {
      callback(await getUserFromFirestore(fbUser), fbUser);
    } catch (err) {
      console.error('[onAuthChange] user doc not found after retry:', err);
      callback(null, null);
    }
  });
}

export async function getUserFromFirestore(fbUser: FirebaseUser): Promise<User> {
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  if (!snap.exists()) throw new Error('User document not found');
  return docToUser(snap.data() as Record<string, any>);
}

/**
 * Persist updated User fields to Firestore.
 *
 * Root-cause fix: the previous version had an explicit allowlist that silently
 * dropped any field not in the list (e.g. experiences, resumeUrl, careerArc,
 * and fields from inline edit forms cast as `any`). When those fields were
 * passed, fsUpdates contained only { updatedAt } — the write appeared to
 * succeed but only touched the timestamp, so data reverted on refresh.
 *
 * This version passes every field through directly. The only renaming needed
 * is User.name → "displayName" and User.avatarUrl → "photoURL", because those
 * two field names differ between the User type and the Firestore schema.
 * Everything else writes under its own key.
 */
export async function updateUserInFirestore(
  fbUid: string,
  updates: Partial<User> & Record<string, any>
): Promise<void> {
  // The only two fields whose User-type name differs from Firestore field name.
  const RENAME: Record<string, string> = {
    name:      'displayName',
    avatarUrl: 'photoURL',
  };

  const fsUpdates: Record<string, any> = { updatedAt: serverTimestamp() };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    fsUpdates[RENAME[key] ?? key] = value;
  }

  await updateDoc(doc(db, 'users', fbUid), fsUpdates);
}

export async function setStripeCustomerId(fbUid: string, stripeCustomerId: string): Promise<void> {
  await updateDoc(doc(db, 'users', fbUid), { stripeCustomerId, updatedAt: serverTimestamp() });
}

/** Fetch a public profile by URL username slug. Returns null if not found or private. */
export async function fetchPublicProfileByUsername(username: string): Promise<{
  found: true; isPublic: true; profile: Record<string, any>; firestoreUid: string;
} | { found: false } | { found: true; isPublic: false }> {
  try {
    const { getDocs, collection, query, where, limit } = await import('firebase/firestore');
    const { db: fdb } = await import('./firebase');
    const snap = await getDocs(
      query(collection(fdb, 'users'), where('username', '==', username.toLowerCase()), limit(1))
    );
    if (snap.empty) return { found: false };
    const d = snap.docs[0];
    const data = d.data();
    if (!data.isPublic) return { found: true, isPublic: false };
    return { found: true, isPublic: true, profile: { ...data, _firestoreUid: d.id }, firestoreUid: d.id };
  } catch {
    return { found: false };
  }
}

// ── Account takeover protection

import { multiFactor, PhoneMultiFactorGenerator, getMultiFactorResolver } from 'firebase/auth';

export async function logSecurityEvent(uid: string, event: {
  type: 'login' | 'password_change' | 'email_change' | 'suspicious_login' | 'session_revoked' | 'two_factor_enrolled' | 'two_factor_removed';
  ip?: string; userAgent?: string; location?: string; details?: string;
}): Promise<void> {
  const { addDoc, collection, serverTimestamp: st } = await import('firebase/firestore');
  const { db: fdb } = await import('./firebase');
  await addDoc(collection(fdb, 'users', uid, 'securityEvents'), {
    ...event, timestamp: st(), userAgent: event.userAgent ?? navigator.userAgent,
  });
}

export async function getSecurityEvents(uid: string, limit_ = 20): Promise<any[]> {
  const { getDocs, collection, query, orderBy, limit } = await import('firebase/firestore');
  const { db: fdb } = await import('./firebase');
  const snap = await getDocs(query(collection(fdb, 'users', uid, 'securityEvents'), orderBy('timestamp', 'desc'), limit(limit_)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function revokeOtherSessions(uid: string): Promise<void> {
  const { updateDoc: upd, doc: d, serverTimestamp: st } = await import('firebase/firestore');
  const { db: fdb } = await import('./firebase');
  await upd(d(fdb, 'users', uid), { sessionToken: `${uid}_${Date.now()}`, sessionsRevokedAt: st() });
  await logSecurityEvent(uid, { type: 'session_revoked', details: 'User manually revoked all other sessions' });
}

export async function sendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await sendEmailVerification(user);
}

export function isEmailVerified(): boolean {
  return auth.currentUser?.emailVerified ?? false;
}

export async function changeEmail(currentPassword: string, newEmail: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not signed in');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  const { updateEmail } = await import('firebase/auth');
  await updateEmail(user, newEmail);
  await sendEmailVerification(user);
}
