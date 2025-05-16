
// src/lib/firebase.ts
// This file is OBSOLETE as the application is now configured to use Supabase exclusively.
// The Supabase client is initialized in src/lib/supabase.ts.
// This file can be safely deleted if no other part of your system depends on it.

console.warn(
  "Firebase module (src/lib/firebase.ts) is loaded but the application is configured to use Supabase. " +
  "This Firebase module should be removed or not imported."
);

// Mock exports to prevent import errors if this file is still accidentally imported.
// These will not function.
export const app = null;
export const auth = null;
export const db = null;
export const storage = null;
