// src/lib/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error(
    'Supabase URL is missing. Check your .env file for NEXT_PUBLIC_SUPABASE_URL.'
  );
}
if (!supabaseAnonKey) {
  console.error(
    'Supabase Anon Key is missing. Check your .env file for NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  console.log('Initializing Supabase client with URL:', supabaseUrl, 'and a masked Anon Key.');
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.error(
    'Supabase client could not be initialized due to missing URL or Anon Key.'
  );
  // Provide a non-functional mock if initialization fails to prevent runtime errors,
  // though functionality will be broken.
  supabase = {
    auth: {
      signInWithPassword: async () => ({ error: { message: 'Supabase not configured' } }),
      signUp: async () => ({ error: { message: 'Supabase not configured' } }),
      signInWithOAuth: async () => ({ error: { message: 'Supabase not configured' } }),
      signOut: async () => ({ error: { message: 'Supabase not configured' } }),
      resetPasswordForEmail: async () => ({ error: { message: 'Supabase not configured' } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      updateUser: async () => ({ error: { message: 'Supabase not configured' } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ error: { message: 'Supabase not configured' } }) }) }),
      insert: async () => ({ error: { message: 'Supabase not configured' } }),
      update: () => ({ eq: () => ({ single: async () => ({ error: { message: 'Supabase not configured' } }) }) }),
    }),
  } as any; // Cast to any to satisfy SupabaseClient type for the mock
}

export { supabase };
