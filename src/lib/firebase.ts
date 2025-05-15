// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { Auth, getAuth, GoogleAuthProvider, /* GithubAuthProvider, // Removed */ createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, updateProfile, sendPasswordResetEmail, signOut } from "firebase/auth";
import { Firestore, getFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";

const firebaseConfigBase = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

// Conditionally add measurementId if it exists
const firebaseConfig = measurementId && measurementId !== "undefined" && measurementId !== ""
  ? { ...firebaseConfigBase, measurementId }
  : firebaseConfigBase;

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { 
  app, 
  auth, 
  db, 
  storage, 
  GoogleAuthProvider, 
  // GithubAuthProvider, // Removed
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
};
