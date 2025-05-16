// src/lib/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  const errorMessage = "CRITICAL ERROR: Missing env.NEXT_PUBLIC_SUPABASE_URL. Please ensure it is set in your .env file. Application cannot connect to Supabase.";
  console.error(errorMessage);
  throw new Error(errorMessage);
}
if (!supabaseAnonKey) {
  const errorMessage = "CRITICAL ERROR: Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY. Please ensure it is set in your .env file. Application cannot connect to Supabase.";
  console.error(errorMessage);
  throw new Error(errorMessage);
}

// Log the values being used for diagnostics, masking most of the anon key for security.
console.log('Attempting to initialize Supabase client with URL:', supabaseUrl);
if (typeof supabaseAnonKey === 'string' && supabaseAnonKey.length > 10) {
  console.log('Using Supabase Anon Key (masked):', `${supabaseAnonKey.substring(0, 5)}...${supabaseAnonKey.substring(supabaseAnonKey.length - 5)}`);
} else if (typeof supabaseAnonKey === 'string') {
  console.log('Using Supabase Anon Key (short, verify this is correct):', supabaseAnonKey);
} else {
  console.error('Supabase Anon Key is not a string or is undefined after check. This is unexpected.');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Optional: Verify client creation
if (supabase) {
  console.log('Supabase client instance created successfully.');
} else {
  // This case should ideally not be reached if createClient doesn't throw for bad args but returns null/undefined.
  // However, createClient typically throws if URL/key are fundamentally malformed before even making a network request.
  console.error('CRITICAL ERROR: Supabase client instance creation failed despite URL and Key being present. Review createClient call or library version.');
}
