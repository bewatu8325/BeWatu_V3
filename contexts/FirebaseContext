/**
 * contexts/FirebaseContext.tsx
 *
 * Drop-in replacement for the manual authState / currentUser management in App.tsx.
 * Wrap <App> with <FirebaseProvider> and use the useFirebase() hook anywhere.
 */
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { onAuthChange } from '../lib/authService';
import { User } from '../types';

interface FirebaseContextValue {
  /** BeWatu User object (null if not logged in) */
  currentUser: User | null;
  /** Raw Firebase user (for UID access etc.) */
  fbUser: FirebaseUser | null;
  /** True while the initial auth check is in progress */
  authLoading: boolean;
  /** Call this after updating user data so context stays in sync */
  refreshUser: (updated: User) => void;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  currentUser: null,
  fbUser: null,
  authLoading: true,
  refreshUser: () => {},
});

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((user, firebaseUser) => {
      setCurrentUser(user);
      setFbUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshUser = (updated: User) => setCurrentUser(updated);

  return (
    <FirebaseContext.Provider value={{ currentUser, fbUser, authLoading, refreshUser }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}
