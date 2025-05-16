
// src/lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;

if (!getApps().length) {
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.authDomain ||
    !firebaseConfig.projectId
  ) {
    console.error(
      'Firebase config is missing or incomplete. Check your .env file for NEXT_PUBLIC_FIREBASE_... variables.'
    );
    // Fallback or throw error if critical config is missing
    // For now, we'll let it initialize if some parts are there,
    // but Firebase services might not work correctly.
  }
  try {
    app = initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully with projectId:', firebaseConfig.projectId);
  } catch (e) {
    console.error("Error initializing Firebase app:", e);
    // Provide a non-functional mock if initialization fails to prevent runtime errors
    // This is a drastic fallback, ideally config should always be correct.
    app = {} as FirebaseApp; 
  }
} else {
  app = getApp();
  console.log('Firebase app already initialized.');
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
// const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);

const googleProvider = new GoogleAuthProvider();
// const githubProvider = new GithubAuthProvider(); // Keep if you plan to re-add GitHub auth

export { app, auth, db, storage, googleProvider /*, githubProvider, analytics */ };
