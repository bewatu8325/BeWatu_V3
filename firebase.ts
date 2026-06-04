import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
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

export const auth     = getAuth(app);
export const db       = initializeFirestore(app, {
  // Safari blocks WebSocket connections in certain contexts (ITP, private browsing,
  // strict tracking prevention). experimentalAutoDetectLongPolling transparently
  // falls back to long-polling when WebSocket is unavailable — fixes the Safari
  // spinning wheel with no console error.
  experimentalAutoDetectLongPolling: true,
});
export const storage   = getStorage(app);
export const functions = getFunctions(app);
export default app;
