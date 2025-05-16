// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional but good to have if used
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("Firebase API Key or Project ID is missing. Check your .env file and ensure NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID are set.");
  // Potentially throw an error here or handle this state appropriately
  // For now, we'll let it proceed, but Firebase services might fail.
}


if (!getApps().length) {
  try {
    console.log("Initializing Firebase with config:", {
      apiKey: firebaseConfig.apiKey ? '********' : 'MISSING!', // Mask API key
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      // Add other config properties if needed for logging, masking sensitive ones
    });
    app = initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully.");
  } catch (error: any) {
    console.error("Firebase initialization error:", error.message);
    if (!firebaseConfig.apiKey) console.error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
    if (!firebaseConfig.authDomain) console.error("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is missing.");
    if (!firebaseConfig.projectId) console.error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing.");
    // It's better to throw an error or have a clear failure state if initialization fails due to missing core config
    // throw new Error("Firebase initialization failed. Critical configuration is missing. Check .env file.");
  }
} else {
  app = getApp();
  console.log("Firebase app already initialized.");
}

// Initialize services only if app was successfully initialized
// @ts-ignore
if (app) {
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  console.error("Firebase app object is not available. Services (Auth, Firestore, Storage) cannot be initialized.");
  // @ts-ignore
  // Assign null or mock objects if needed to prevent runtime errors, though functionality will be broken.
  auth = null as any; 
  // @ts-ignore
  db = null as any;
  // @ts-ignore
  storage = null as any;
}


export { app, auth, db, storage };

    