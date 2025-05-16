// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
// import { getAnalytics, Analytics } from "firebase/analytics"; // Only import if/when used

// Base Firebase configuration from environment variables
const firebaseConfigBase = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Conditionally add measurementId if it exists
const firebaseConfig: Record<string, string | undefined> = { ...firebaseConfigBase };
if (process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) {
  firebaseConfig.measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
// let analytics: Analytics; // Declare if/when used

const isConfigSufficient = firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain;

if (!isConfigSufficient) {
  console.error(
    "Firebase core configuration (API Key, Project ID, or Auth Domain) is missing. " +
    "Check your .env file and ensure NEXT_PUBLIC_FIREBASE_API_KEY, " +
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID, and NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN are set."
  );
  // Log which specific keys are missing for easier debugging
  if (!firebaseConfig.apiKey) console.error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  if (!firebaseConfig.authDomain) console.error("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is missing.");
  if (!firebaseConfig.projectId) console.error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing.");
}

if (!getApps().length) {
  if (isConfigSufficient) {
    try {
      console.log("Initializing Firebase with config:", {
        apiKey: firebaseConfig.apiKey ? '********' : 'MISSING!',
        authDomain: firebaseConfig.authDomain || 'MISSING!',
        projectId: firebaseConfig.projectId || 'MISSING!',
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId,
        measurementId: firebaseConfig.measurementId,
      });
      app = initializeApp(firebaseConfig as Record<string,string>); // Cast to Record<string,string> as initializeApp expects definite strings
      console.log("Firebase initialized successfully.");
    } catch (error: any) {
      console.error("Firebase initialization error:", error.message, error);
    }
  } else {
    console.error("Firebase initialization skipped due to missing core configuration.");
  }
} else {
  app = getApp();
  console.log("Firebase app already initialized.");
}

// Initialize services only if app was successfully initialized
// @ts-ignore
if (app && isConfigSufficient) {
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  // if (firebaseConfig.measurementId) { // Initialize Analytics only if measurementId is present and you intend to use it
  //   analytics = getAnalytics(app);
  // }
} else {
  console.error(
    "Firebase app object is not available or configuration is insufficient. " +
    "Services (Auth, Firestore, Storage) cannot be initialized."
  );
  // Assign null or mock objects if needed to prevent runtime errors, though functionality will be broken.
  auth = null as any; 
  db = null as any;
  storage = null as any;
  // analytics = null as any;
}

export { app, auth, db, storage };
