import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        'bewatu-2d04e.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// initializeFirestore must only be called once. If the module is evaluated a
// second time (e.g. due to chunk splitting or HMR), it throws
// "Firestore has already been initialized." which breaks all db operations
// silently. Guard with try/catch and fall back to getFirestore().
let _db: ReturnType<typeof getFirestore>;
try {
  _db = initializeFirestore(app, {
    // Safari ITP / private browsing blocks WebSocket. Long-polling transparently
    // falls back so the app works in all Safari contexts.
    experimentalAutoDetectLongPolling: true,
  });
} catch {
  // Already initialized — retrieve the existing instance.
  _db = getFirestore(app);
}
export const db = _db;

export const storage   = getStorage(app);
export const functions = getFunctions(app);
export default app;
