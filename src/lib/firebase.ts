// src/lib/firebase.ts
// This file is no longer actively used as the application has been migrated to Supabase.
// The Supabase client is initialized in src/lib/supabase.ts.
// You can remove this file if no other part of your system (e.g., Genkit potentially, though unlikely for client-side init) depends on it.

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

console.warn("Firebase module (src/lib/firebase.ts) is loaded but the application is configured to use Supabase. This Firebase module should ideally be removed or not imported if Firebase is not in use.");

// Mock exports to prevent import errors if this file is still accidentally imported.
// These will not function.
const app: FirebaseApp | null = null;
const auth: Auth | null = null;
const db: Firestore | null = null;
const storage: FirebaseStorage | null = null;

export { app, auth, db, storage };
