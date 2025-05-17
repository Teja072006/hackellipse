
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
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([key, value]) => !value && key !== 'measurementId' && (key === 'apiKey' || key === 'authDomain' || key === 'projectId'))
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    console.error(
      `CRITICAL: Firebase config is MISSING or INCOMPLETE in .env file! Essential variables (${missingKeys.join(', ')}) are required.`
    );
    console.error('Firebase will NOT be initialized correctly. Application features relying on Firebase will fail.');
    // Fallback or throw error if critical config is missing
    // For now, we'll let it initialize if some parts are there,
    // but Firebase services might not work correctly.
    // This will likely lead to runtime errors when Firebase services are called.
  }
  try {
    app = initializeApp(firebaseConfig);
    console.log(
      'Firebase initialized successfully with projectId:',
      firebaseConfig.projectId || "WARNING: Project ID is MISSING in config!"
    );
     if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
      console.warn("WARNING: Essential Firebase config keys (apiKey, authDomain, projectId) are missing. Firebase may not function correctly.");
    }
  } catch (e: any) {
    console.error("CRITICAL: Error initializing Firebase app:", e.message, e.code, e);
    app = {} as FirebaseApp; // Provide a non-functional mock
  }
} else {
  app = getApp();
  // console.log('Firebase app already initialized.');
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
