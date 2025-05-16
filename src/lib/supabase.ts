// src/lib/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("Missing env.NEXT_PUBLIC_SUPABASE_URL. Please ensure it is set in your .env file.");
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL");
}
if (!supabaseAnonKey) {
  console.error("Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY. Please ensure it is set in your .env file.");
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
