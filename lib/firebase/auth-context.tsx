// lib/firebase/auth-context.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Wraps Firebase Auth in a React context so any component can call
// useAuth() to get the current user and loading state.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn:        (email: string, password: string) => Promise<void>;
  signUp:        (email: string, password: string, name: string) => Promise<void>;
  signInGoogle:  () => Promise<void>;
  logOut:        () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Ensure a Firestore user profile exists after first sign-in
  async function ensureProfile(user: FirebaseUser, name?: string) {
    const ref = doc(db, "factory_users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid:               user.uid,
        name:              name ?? user.displayName ?? "Anonymous",
        email:             user.email,
        avatar:            user.photoURL ?? "",
        role:              "solver",
        title:             "",
        company:           "",
        bio:               "",
        skills:            [],
        reputation:        0,
        problemsSolved:    0,
        solutionsSubmitted:0,
        teamsJoined:       0,
        xp:                0,
        level:             1,
        streak:            0,
        longestStreak:     0,
        lastActiveDate:    new Date().toISOString().split("T")[0],
        badges:            [],
        createdAt:         serverTimestamp(),
      });
    }
  }

  async function signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureProfile(cred.user);
  }

  async function signUp(email: string, password: string, name: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureProfile(cred.user, name);
  }

  async function signInGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureProfile(cred.user);
  }

  async function logOut() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, loading, signIn, signUp, signInGoogle, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
