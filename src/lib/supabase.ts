
// src/lib/supabase.ts
// This file is OBSOLETE as the application is now configured to use Firebase.
// The Firebase client is initialized in src/lib/firebase.ts.
// This file can be safely deleted.

import type { SupabaseClient } from '@supabase/supabase-js';

console.warn(
  "Supabase module (src/lib/supabase.ts) is loaded but the application is configured to use Firebase. " +
  "This Supabase module should be removed or not imported."
);

// Provide a non-functional mock if this file is still accidentally imported.
const supabaseMock = {
  auth: {
    signInWithPassword: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
    signUp: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
    signInWithOAuth: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
    signOut: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
    resetPasswordForEmail: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    updateUser: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
  },
  from: () => ({
    select: () => ({ 
      eq: () => ({ 
        single: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
        in: () => ({
            async data() { return { data: [], error: { message: 'Supabase not configured (using Firebase)' }}; }
        })
      }),
      or: () => ({
        order: () => ({
            async data() { return { data: [], error: { message: 'Supabase not configured (using Firebase)' }}; }
        })
      })
    }),
    insert: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }),
    update: () => ({ 
        eq: () => ({ 
            single: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } }) 
        }) 
    }),
    delete: () => ({
        eq: async () => ({ error: { message: 'Supabase not configured (using Firebase)' } })
    })
  }),
  // Add other Supabase client methods as needed for the mock
} as any; // Cast to any to satisfy SupabaseClient type for the mock

export const supabase = supabaseMock as SupabaseClient;
