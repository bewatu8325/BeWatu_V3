/**
 * lib/firebaseAuth.ts
 * Firebase auth wired to BeWatu's User type.
 * Replaces the fake handleLoginSuccess / handleRegisterSuccess logic in App.tsx.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
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

// ── Convert Firestore doc → BeWatu User ───────────────────────────────────────
function docToUser(data: Record<string, any>): User {
  return {
    id: data.numericId ?? 1,           // legacy numeric id kept for compatibility
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
  };
}

// ── Build default Firestore doc from registration inputs ──────────────────────
function buildNewUserDoc(
  uid: string,
  name: string,
  email: string,
  isRecruiter: boolean,
  photoURL?: string
) {
  const isVerified = !freeEmailDomains.some((d) => email.endsWith(d));
  return {
    uid,
    numericId: Date.now(), // simple unique numeric id for legacy component compatibility
    displayName: name,
    email,
    photoURL: photoURL ?? '',
    headline: '',
    bio: '',
    industry: '',
    location: '',
    website: '',
    professionalGoals: [],
    reputation: 0,
    credits: 100,
    isRecruiter,
    isVerified,
    portfolio: [],
    verifiedAchievements: [],
    thirdPartyIntegrations: [],
    workStyle: {
      collaboration: 'Thrives in pairs',
      communication: 'Prefers asynchronous',
      workPace: 'Fast-paced and iterative',
    },
    values: [],
    availability: 'Exploring opportunities',
    skills: [],
    verifiedSkills: null,
    microIntroductionUrl: null,
    connectionCount: 0,
    isPublic: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Register with email + password. Returns a BeWatu User. */
export async function registerWithEmail(
  name: string,
  email: string,
  password: string,
  isRecruiter: boolean
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const { user: fbUser } = cred;

  await sendEmailVerification(fbUser);

  const newDoc = buildNewUserDoc(fbUser.uid, name, email, isRecruiter);
  await setDoc(doc(db, 'users', fbUser.uid), newDoc);

  return docToUser(newDoc);
}

/** Sign in with email + password. Returns a BeWatu User. */
export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return getUserFromFirestore(cred.user);
}

/** Sign in with Google. Creates user doc on first sign-in. Returns a BeWatu User. */
export async function loginWithGoogle(isRecruiter = false): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  const { user: fbUser } = cred;

  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const newDoc = buildNewUserDoc(
      fbUser.uid,
      fbUser.displayName ?? 'New User',
      fbUser.email ?? '',
      isRecruiter,
      fbUser.photoURL ?? undefined
    );
    await setDoc(ref, newDoc);
    return docToUser(newDoc);
  }

  return docToUser(snap.data() as Record<string, any>);
}

/** Sign out. */
export async function logout(): Promise<void> {
  await signOut(auth);
}

/** Send password reset email. */
export async function forgotPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/** Change password — requires the current password for re-auth. */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not signed in');

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

/** Subscribe to auth state. Returns unsubscribe fn. */
export function onAuthChange(
  callback: (user: User | null, fbUser: FirebaseUser | null) => void
): () => void {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      callback(null, null);
      return;
    }
    try {
      const bewatuUser = await getUserFromFirestore(fbUser);
      callback(bewatuUser, fbUser);
    } catch {
      callback(null, null);
    }
  });
}

/** Fetch a BeWatu User from Firestore by Firebase UID. */
export async function getUserFromFirestore(fbUser: FirebaseUser): Promise<User> {
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  if (!snap.exists()) throw new Error('User document not found');
  return docToUser(snap.data() as Record<string, any>);
}

/** Persist updated User fields to Firestore. */
export async function updateUserInFirestore(
  fbUid: string,
  updates: Partial<User>
): Promise<void> {
  // Map BeWatu User fields → Firestore field names
  const fsUpdates: Record<string, any> = {
    ...(updates.name !== undefined && { displayName: updates.name }),
    ...(updates.avatarUrl !== undefined && { photoURL: updates.avatarUrl }),
    ...(updates.headline !== undefined && { headline: updates.headline }),
    ...(updates.bio !== undefined && { bio: updates.bio }),
    ...(updates.industry !== undefined && { industry: updates.industry }),
    ...(updates.professionalGoals !== undefined && { professionalGoals: updates.professionalGoals }),
    ...(updates.skills !== undefined && { skills: updates.skills }),
    ...(updates.verifiedSkills !== undefined && { verifiedSkills: updates.verifiedSkills }),
    ...(updates.microIntroductionUrl !== undefined && { microIntroductionUrl: updates.microIntroductionUrl }),
    ...(updates.portfolio !== undefined && { portfolio: updates.portfolio }),
    ...(updates.availability !== undefined && { availability: updates.availability }),
    ...(updates.values !== undefined && { values: updates.values }),
    ...(updates.workStyle !== undefined && { workStyle: updates.workStyle }),
    ...(updates.reputation !== undefined && { reputation: updates.reputation }),
    ...(updates.credits !== undefined && { credits: updates.credits }),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(db, 'users', fbUid), fsUpdates);
}

/** Store Stripe customer ID on the user doc. */
export async function setStripeCustomerId(fbUid: string, stripeCustomerId: string): Promise<void> {
  await updateDoc(doc(db, 'users', fbUid), { stripeCustomerId, updatedAt: serverTimestamp() });
}
