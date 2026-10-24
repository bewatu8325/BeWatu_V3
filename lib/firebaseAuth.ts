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

// ── Owner-only PII: users/{uid}/private/contact ───────────────────────────────
// email, phone, location and stripeCustomerId used to live on the users/{uid}
// doc itself — readable by any authenticated caller (isPublic==true || isAuth()
// covers the whole document, not per field; Firestore rules can't restrict
// individual fields on one doc). Split out so a stranger reading someone
// else's profile never gets these, while the owner (and ops) still can.
interface PrivateContact {
  email?: string;
  phone?: string;
  location?: string;
  stripeCustomerId?: string;
}

async function getPrivateContact(uid: string): Promise<PrivateContact> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'contact'));
    return snap.exists() ? (snap.data() as PrivateContact) : {};
  } catch {
    // Reading another user's contact doc correctly denies — return empty
    // rather than surface a permission error to a caller that doesn't need it.
    return {};
  }
}

async function setPrivateContact(uid: string, fields: PrivateContact): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'private', 'contact'), {
    ...fields,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── Convert Firestore doc → BeWatu User ──────────────────────────────────────
// Async: merges in users/{uid}/private/contact for the CURRENT user's own
// doc. Every call site below is loading the signed-in user's own profile —
// none of this is used to render another user's card.
async function docToUser(data: Record<string, any>): Promise<User> {
  const contact = await getPrivateContact(data.uid);
  return {
    id: data.numericId ?? 1,
    createdAt: data.createdAt ?? null,
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
    email: contact.email ?? '',
    location: contact.location ?? '',
    phone: contact.phone ?? '',
    stripeCustomerId: contact.stripeCustomerId,
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
    openTo: data.openTo ?? [],
    builderType: data.builderType ?? 'Professional',
    skills: data.skills ?? [],
    verifiedSkills: data.verifiedSkills ?? null,
    microIntroductionUrl: data.microIntroductionUrl ?? null,
    microIntroductionThumbnail: data.microIntroductionThumbnail ?? null,
    careerArc: data.careerArc ?? [],
    // Real, pre-existing User field, written correctly by ExperienceSection
    // (onSaveProfile({ experiences })) but never read back here — same class
    // of bug already fixed for location/createdAt earlier in this audit.
    // Confirmed live: the Firestore write was correct, this was the only
    // thing missing, so every manually-added experience has been vanishing
    // on reload/relogin for every real user until now, not just imports.
    experiences: data.experiences ?? [],
    // New field — hydrated here from day one, unlike experiences above,
    // since that gap (write path existed, read path didn't) is exactly
    // what this line exists to avoid repeating.
    education: data.education ?? [],
    recruiterProfile: data.recruiterProfile ?? null,
    recruiterStatus: data.recruiterStatus,
    // Hardening (launch-readiness review): the Firestore-backed replacement
    // for the old localStorage recruiterTrialEndDate. Must be surfaced here
    // or every read of currentUser.recruiterTrialEndDate app-wide sees
    // undefined even after the field is written server-side.
    recruiterTrialEndDate: data.recruiterTrialEndDate ?? undefined,
    recruiterFeeWaived: data.recruiterFeeWaived ?? false,
    recruiterFeeWaivedAt: data.recruiterFeeWaivedAt,
    recruiterFeeWaivedReason: data.recruiterFeeWaivedReason,
    // Real, pre-existing field written by endorseSkill() but never read back
    // here — same class of bug already fixed for experiences/recruiterStatus
    // elsewhere in this audit.
    endorsements: data.endorsements ?? [],
    lastActiveAt: data.lastActiveAt ?? undefined,
    engagementGateApplies: data.engagementGateApplies ?? false,
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

async function usernameTaken(candidate: string): Promise<boolean> {
  const { getDocs, collection, query, where, limit } = await import('firebase/firestore');
  const { db: fdb } = await import('./firebase');
  const snap = await getDocs(
    query(collection(fdb, 'users'), where('username', '==', candidate), limit(1))
  );
  return !snap.empty;
}

// Two users with the same name (e.g. two "Eve Mwangi"s) would otherwise both
// derive the same /be/:username slug — whichever doc Firestore happened to
// return first for that slug would be the only one reachable at that URL,
// silently shadowing the other person's public profile link. Appends a
// numeric suffix (emwangi, emwangi2, emwangi3, ...) until a free slug is
// found. Exported so both signup paths and the one-time migration in
// ProfilePage.tsx share this instead of each deriving a username on their own.
export async function generateUniqueUsername(name: string): Promise<string> {
  const base = deriveUsername(name);
  let candidate = base;
  let suffix = 2;
  while (await usernameTaken(candidate)) {
    candidate = `${base}${suffix}`;
    suffix++;
  }
  return candidate;
}

// ── Build default Firestore doc ───────────────────────────────────────────────
// email and location no longer go on the main doc — see getPrivateContact
// above. Callers write them to users/{uid}/private/contact separately
// (setPrivateContact, right after this doc is created).
async function buildNewUserDoc(
  uid: string,
  name: string,
  email: string,
  isRecruiter: boolean,
  photoURL?: string
) {
  const isVerified = !freeEmailDomains.some((d) => email.endsWith(d));
  const username = await generateUniqueUsername(name);
  return {
    uid, numericId: Date.now(), displayName: name,
    photoURL: photoURL ?? '', headline: '', bio: '', industry: '',
    website: '', professionalGoals: [], reputation: 0,
    credits: 100, isRecruiter, isVerified, portfolio: [],
    verifiedAchievements: [], thirdPartyIntegrations: [],
    username,  // URL slug — /be/:username, unique (see generateUniqueUsername)
    workStyle: { collaboration: 'Thrives in pairs', communication: 'Prefers asynchronous', workPace: 'Fast-paced and iterative' },
    values: [], availability: 'Exploring opportunities', openTo: [], builderType: 'Professional', skills: [],
    verifiedSkills: null, microIntroductionUrl: null, connectionCount: 0,
    isPublic: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    // New signups from here on are weekly-active gated for Factory, the
    // investor tier, and the recruiter upgrade path — see
    // lib/engagementGate.ts. Omitted for every pre-existing account, which
    // is what grandfathers them in automatically.
    engagementGateApplies: true,
  };
}

// ── Shared Google upsert ──────────────────────────────────────────────────────
// Creates the user doc on first sign-in; returns the User on every call.
// `isNewUser` lets callers tell a fresh signup apart from a returning user
// logging back in -- needed so a brand-new recruiter can be prompted for
// payment right away instead of silently getting a trial with no payment
// method on file (the same gap the email/password signup already closes by
// showing PaymentForm before the account is even created).
async function upsertGoogleUser(fbUser: FirebaseUser, isRecruiter: boolean): Promise<{ user: User; isNewUser: boolean }> {
  const ref  = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const email = fbUser.email ?? '';
    const newDoc = await buildNewUserDoc(
      fbUser.uid, fbUser.displayName ?? 'New User',
      email, isRecruiter, fbUser.photoURL ?? undefined
    );
    await setDoc(ref, newDoc);
    await setPrivateContact(fbUser.uid, { email, location: '' });
    return { user: await docToUser(newDoc), isNewUser: true };
  }
  return { user: await docToUser(snap.data() as Record<string, any>), isNewUser: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function registerWithEmail(
  name: string, email: string, password: string, isRecruiter: boolean
): Promise<User> {
  const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(fbUser);
  const newDoc = await buildNewUserDoc(fbUser.uid, name, email, isRecruiter);
  await setDoc(doc(db, 'users', fbUser.uid), newDoc);
  await setPrivateContact(fbUser.uid, { email, location: '' });
  return docToUser(newDoc);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return getUserFromFirestore(cred.user);
  } catch (err: any) {
    // Firebase auth errors have a `code` field. Translate to plain English so
    // the UI can display something useful instead of the raw SDK message.
    throw new Error(translateAuthError(err?.code ?? err?.message ?? ''));
  }
}

/** Map Firebase auth error codes → plain-English messages for display in UI. */
function translateAuthError(code: string): string {
  switch (code) {
    // Wrong password or email (Firebase v9+ consolidates these)
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
      return 'Incorrect email or password. Please try again.';
    case 'auth/user-not-found':
      return 'No account found with that email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error — please check your connection and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled. Please try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email. Try signing in with a different method.';
    default:
      return 'Incorrect email or password. Please try again.';
  }
}

// Real bug, found alongside the payment-prompt work below: the Safari
// redirect path's result handler (in onAuthChange) had no way to know what
// isRecruiter the user actually intended -- the page fully reloads between
// signInWithRedirect and getRedirectResult, so any in-memory value is lost.
// It hardcoded `false`, meaning a Safari user checking "recruiter access"
// silently got a regular member account instead. Persisted across the
// reload via sessionStorage, same mechanism this app already uses for
// other cross-reload state (see beWatuData/termsAgreedThisSession).
const GOOGLE_SIGNIN_RECRUITER_INTENT_KEY = 'googleSignInIsRecruiterIntent';

/**
 * Sign in / register with Google.
 * Safari → redirect (returns null; result arrives via onAuthChange on reload).
 * Other browsers → popup (returns User + whether this was a brand-new signup).
 */
export async function loginWithGoogle(isRecruiter = false): Promise<{ user: User; isNewUser: boolean } | null> {
  if (isSafari()) {
    sessionStorage.setItem(GOOGLE_SIGNIN_RECRUITER_INTENT_KEY, String(isRecruiter));
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

// Bug fix: getRedirectResult()'s handler used to call upsertGoogleUser and
// swallow any failure with `.catch(() => {})`, with the sessionStorage
// intent key removed beforehand regardless of outcome. If that single
// upsert attempt failed for any reason (a transient Firestore error, the
// write racing with Firestore not yet having picked up the just-completed
// auth state, etc.), nothing ever retried the actual document creation —
// onAuthStateChanged's own "race condition" handling only retried the
// *read* (getUserFromFirestore), which was always going to keep failing
// against a doc that was never created. The user ended up redirected back
// from Google, silently treated as logged out, with no account created and
// no error shown. Confirmed as the real-world symptom a Safari user hit.
//
// Fixed by sharing one idempotent helper between both call sites (upsert is
// itself idempotent — getDoc-then-create-if-missing) and only clearing the
// intent key on success, so a failed first attempt leaves it in place for
// onAuthStateChanged's fallback to retry with the correct recruiter intent
// rather than just re-reading a document that was never written.
async function tryUpsertFromGoogleRedirect(fbUser: FirebaseUser): Promise<User | undefined> {
  const intendedRecruiter = sessionStorage.getItem(GOOGLE_SIGNIN_RECRUITER_INTENT_KEY) === 'true';
  try {
    const { user } = await upsertGoogleUser(fbUser, intendedRecruiter);
    sessionStorage.removeItem(GOOGLE_SIGNIN_RECRUITER_INTENT_KEY);
    return user;
  } catch (err) {
    console.error('[onAuthChange] upsertGoogleUser failed — will retry from the onAuthStateChanged fallback:', err);
    return undefined;
  }
}

/**
 * Subscribe to auth state.
 *
 * Handles the Safari redirect result on page load via getRedirectResult().
 *
 * Race condition fix: retries once after 600ms when the user doc is
 * missing — covers new Google sign-ups where onAuthStateChanged fires
 * before the doc has been written. The retry now actively attempts
 * creation via tryUpsertFromGoogleRedirect (idempotent — a no-op if the
 * doc already exists) rather than only re-reading, so a failed first
 * attempt from the getRedirectResult handler below still gets a real
 * second chance instead of permanently failing silently.
 */
export function onAuthChange(
  callback: (user: User | null, fbUser: FirebaseUser | null) => void
): () => void {
  // Handle Safari redirect result on page load. isRecruiter is read back
  // from sessionStorage (set just before the redirect in loginWithGoogle) --
  // see GOOGLE_SIGNIN_RECRUITER_INTENT_KEY's comment for why that's needed.
  getRedirectResult(auth)
    .then(async result => {
      if (result?.user) await tryUpsertFromGoogleRedirect(result.user);
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
      return;
    } catch {
      // Still missing — if this is a pending Google redirect sign-in whose
      // first upsert attempt failed above, this actively retries creating
      // the doc instead of just reading it again.
    }

    const user = await tryUpsertFromGoogleRedirect(fbUser);
    if (user) { callback(user, fbUser); return; }

    console.error('[onAuthChange] user doc not found after retry');
    callback(null, null);
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

  // email/phone/location/stripeCustomerId live in users/{uid}/private/contact,
  // not on the main doc — route them there instead of leaking them back onto
  // the doc every other authenticated user can read.
  const PRIVATE_FIELDS = new Set(['email', 'phone', 'location', 'stripeCustomerId']);

  const fsUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
  const privateUpdates: PrivateContact = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (PRIVATE_FIELDS.has(key)) {
      (privateUpdates as any)[key] = value;
    } else {
      fsUpdates[RENAME[key] ?? key] = value;
    }
  }

  await updateDoc(doc(db, 'users', fbUid), fsUpdates);
  if (Object.keys(privateUpdates).length > 0) {
    await setPrivateContact(fbUid, privateUpdates);
  }
}

export async function setStripeCustomerId(fbUid: string, stripeCustomerId: string): Promise<void> {
  await setPrivateContact(fbUid, { stripeCustomerId });
}

/**
 * Start the 30-day recruiter trial clock, exactly once, server-side.
 *
 * Hardening (launch-readiness review, P1): this used to be a synchronous
 * localStorage read/write in App.tsx — trivially bypassed by clearing site
 * data, an incognito window, or a different browser, giving a recruiter an
 * unbounded string of fresh 30-day trials. recruiterTrialEndDate now lives
 * on the user's own Firestore doc.
 *
 * Re-reads the doc directly (rather than trusting a possibly-stale User
 * object from a React closure) so the "already started?" check is correct
 * regardless of caller timing. firestore.rules' isFirstTimeTrialDateSet is
 * the actual enforcement — this updateDoc would be rejected server-side if
 * it somehow raced past the check below — this is just the normal path.
 */
export async function startRecruiterTrialIfNeeded(fbUid: string): Promise<string> {
  const ref = doc(db, 'users', fbUid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as any).recruiterTrialEndDate : undefined;
  if (existing) return existing;

  const end = new Date();
  end.setDate(end.getDate() + 30);
  const iso = end.toISOString();
  await updateDoc(ref, { recruiterTrialEndDate: iso, updatedAt: serverTimestamp() });
  return iso;
}

export async function fetchPublicProfileByUsername(username: string): Promise<{
  found: true; isPublic: true; profile: Record<string, any>; firestoreUid: string;
} | { found: false } | { found: true; isPublic: false }> {
  try {
    const { getDocs, collection, query, where, limit } = await import('firebase/firestore');
    const { db: fdb } = await import('./firebase');
    // IMPORTANT: include where('isPublic', '==', true) so unauthenticated Firestore
    // queries satisfy the security rule (which only allows reads where isPublic==true
    // for unauthenticated callers). Without this filter Firestore blocks the query.
    const snap = await getDocs(
      query(
        collection(fdb, 'users'),
        where('username', '==', username.toLowerCase()),
        where('isPublic', '==', true),
        limit(1)
      )
    );
    if (snap.empty) {
      // Could be not-found OR private. Try a second read with just username
      // to distinguish (this second query only runs server-side / when auth is present).
      // For unauthenticated callers a private user simply shows as not-found — correct.
      return { found: false };
    }
    const d = snap.docs[0];
    return { found: true, isPublic: true, profile: { ...d.data(), _firestoreUid: d.id }, firestoreUid: d.id };
  } catch (err) {
    console.error('[fetchPublicProfileByUsername]', err);
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
