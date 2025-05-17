
// src/lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

let app: FirebaseApp;

if (!getApps().length) {
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.authDomain ||
    !firebaseConfig.projectId
  ) {
    console.error(
      'Firebase config is MISSING or INCOMPLETE in .env file! Essential variables (apiKey, authDomain, projectId) are required.'
    );
    // Fallback or throw error if critical config is missing
    // For now, we'll let it initialize if some parts are there,
    // but Firebase services might not work correctly.
    // This will likely lead to runtime errors when Firebase services are called.
  }
  try {
    app = initializeApp(firebaseConfig);
    console.log(
      'Firebase initialized successfully with config:',
      {
        apiKey: firebaseConfig.apiKey ? 'SET' : 'MISSING!',
        authDomain: firebaseConfig.authDomain || 'MISSING!',
        projectId: firebaseConfig.projectId || 'MISSING!',
        storageBucket: firebaseConfig.storageBucket || 'NOT SET (Optional for some uses)',
        messagingSenderId: firebaseConfig.messagingSenderId || 'NOT SET (Optional for some uses)',
        appId: firebaseConfig.appId || 'NOT SET (Optional for some uses)',
        measurementId: firebaseConfig.measurementId || 'NOT SET (Optional)',
      }
    );
  } catch (e: any) {
    console.error("CRITICAL: Error initializing Firebase app:", e.message, e.code, e);
    // Provide a non-functional mock if initialization fails to prevent runtime errors
    // This is a drastic fallback, ideally config should always be correct.
    app = {} as FirebaseApp;
  }
} else {
  app = getApp();
  // console.log('Firebase app already initialized.');
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
