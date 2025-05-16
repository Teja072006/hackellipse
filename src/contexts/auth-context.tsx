// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignUpWithPasswordCredentials, Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation"; // For redirecting

// Define a shape for your user profile data stored in Supabase
// This might need to be adjusted based on your actual 'profiles' table schema
export interface UserProfile {
  id: string; // Corresponds to Supabase auth user ID
  name?: string | null;
  email?: string | null;
  photo_url?: string | null; 
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  // github_url?: string | null; // Removed as per request
  description?: string | null;
  achievements?: string | null;
  resume_file_url?: string | null;
  followers_count?: number;
  following_count?: number;
  created_at?: string; // ISO string
  updated_at?: string; // ISO string
  last_login?: string; // ISO string
}

interface AuthContextType {
  user: SupabaseUser | null;
  profile: UserProfile | null; // Add profile state
  loading: boolean;
  signIn: (credentials: SignUpWithPasswordCredentials) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data?: Record<string, any> }) => Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (userId: string, updates: Partial<UserProfile>) => Promise<{ error: any | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error && error.code !== 'PGRST116') { // PGRST116: "Searched item was not found"
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as UserProfile | null;
  };

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        setLoading(true);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const userProfile = await fetchUserProfile(currentUser.id);
          setProfile(userProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    // Check for initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
       const currentUser = session?.user ?? null;
       setUser(currentUser);
       if (currentUser) {
         const userProfile = await fetchUserProfile(currentUser.id);
         setProfile(userProfile);
       } else {
         setProfile(null);
       }
       setLoading(false);
    };
    getInitialSession();


    return () => {
      authListener?.unsubscribe();
    };
  }, []);

  const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<{ error: any | null; data: UserProfile | null }> => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating profile:', error);
      return { error, data: null };
    }
    if (data) {
      setProfile(prevProfile => ({...prevProfile, ...data} as UserProfile)); // Update local profile state
    }
    return { error: null, data: data as UserProfile };
  };

  const signIn = async (credentials: SignUpWithPasswordCredentials): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    // User will be set by onAuthStateChange, profile fetched there too
    setLoading(false);
    return { error };
  };

  const signUp = async (credentials: SignUpWithPasswordCredentials & { data?: Record<string, any> }): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser, session }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        // Store name directly in auth.users.user_metadata if Supabase supports it for email signups
        // Or pass it via credentials.data to be inserted into the profiles table
        data: { 
          name: credentials.data?.name,
          // photo_url: credentials.data?.photo_url // if you want to allow this at signup
        }
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }

    if (authUser) {
      // Create a corresponding profile in the 'profiles' table
      // Use a more flexible type for profileData before insertion
      const profileDataToInsert: { [key: string]: any } = {
        id: authUser.id,
        email: authUser.email,
        name: credentials.data?.name || authUser.user_metadata?.name || authUser.email,
        photo_url: credentials.data?.photo_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture,
        // gender: credentials.data?.gender, // Add if 'gender' column exists
        // skills: credentials.data?.skills, // Add if 'skills' column exists
        // linkedin_url: credentials.data?.linkedin_url, // Add if 'linkedin_url' column exists
        // description: credentials.data?.description, // Add if 'description' column exists
        // achievements: credentials.data?.achievements, // Add if 'achievements' column exists
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      };
      
      // Conditionally add fields if they are provided and valid
      if (typeof credentials.data?.age === 'number' && !isNaN(credentials.data.age) && credentials.data.age > 0) {
        profileDataToInsert.age = credentials.data.age;
      }
      if (credentials.data?.gender) {
        profileDataToInsert.gender = credentials.data.gender;
      }
      if (credentials.data?.skills && Array.isArray(credentials.data.skills) && credentials.data.skills.length > 0) {
        profileDataToInsert.skills = credentials.data.skills;
      }
      if (credentials.data?.linkedin_url) {
        profileDataToInsert.linkedin_url = credentials.data.linkedin_url;
      }
       if (credentials.data?.description) {
        profileDataToInsert.description = credentials.data.description;
      }
       if (credentials.data?.achievements) {
        profileDataToInsert.achievements = credentials.data.achievements;
      }


      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert(profileDataToInsert)
        .select()
        .single();

      if (profileError) {
        console.error("Error creating profile during signup:", profileError);
        setLoading(false);
        return { error: profileError as any, user: authUser, profile: null };
      }
      setProfile(newProfile as UserProfile);
      setUser(authUser); 
      setLoading(false);
      return { error: null, user: authUser, profile: newProfile as UserProfile };
    }
    
    setLoading(false);
    return { error: { name: "SignUpError", message: "User not returned after sign up."} as AuthError, user: null, profile: null };
  };

  const signInWithGoogle = async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined
      }
    });
    setLoading(false);
    return { error };
  };

  const signOutUser = async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    if (typeof window !== 'undefined') router.push('/login');
    return { error };
  };

  const sendPasswordReset = async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined
    });
    setLoading(false);
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signInWithGoogle, signOutUser, sendPasswordReset, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Note: You'll need to create a 'profiles' table in your Supabase database
// with appropriate columns (id (uuid, primary key, references auth.users.id), name (text), email (text), photo_url (text), etc.).
// Make sure RLS (Row Level Security) policies are set up for your 'profiles' table.
// e.g., users can read their own profile, users can update their own profile.
// Public users might be able to read some parts of profiles if needed for search/display.
//
// Example SQL for profiles table (run in Supabase SQL Editor):
/*
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE, -- Consider if email should be unique here or just rely on auth.users
  photo_url TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[],
  linkedin_url TEXT,
  -- github_url TEXT, -- Removed as per request
  description TEXT,
  achievements TEXT,
  resume_file_url TEXT,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login TIMESTAMPTZ
);

-- Function to update `updated_at` timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update `updated_at`
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- (Optional) Function to copy user metadata from auth.users to profiles on new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, photo_url, created_at, updated_at, last_login)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name', -- Access metadata if you store it there
    NEW.raw_user_meta_data->>'avatar_url', -- Access metadata
    NOW(),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER allows it to access auth.users

-- (Optional) Trigger to call handle_new_user on new auth.users entry
-- Make sure this trigger is on `auth.users` table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- RLS Policies Examples:
-- Allow users to read their own profile
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Allow users to insert their own profile (usually done via function or signup in app code)
-- The handle_new_user trigger handles initial insert, this policy allows app-side inserts if needed.
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- (Optional) Allow authenticated users to read some public profile info if your app needs it (e.g., view other user profiles)
-- Be careful with what you expose.
-- CREATE POLICY "Authenticated users can view public profile information."
-- ON public.profiles FOR SELECT TO authenticated
-- USING (true); -- Or more specific conditions, e.g. if a profile is marked as public

-- Enable RLS on the table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
*/
