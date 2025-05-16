// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, UserCredentials, Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation"; // For redirecting

// Define a shape for your user profile data stored in Supabase
// This might need to be adjusted based on your actual 'profiles' table schema
export interface UserProfile {
  id: string; // Corresponds to Supabase auth user ID
  name?: string | null;
  email?: string | null;
  photo_url?: string | null; // Supabase often uses snake_case for columns
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
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
  signIn: (credentials: UserCredentials) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: UserCredentials & { data?: Record<string, any> }) => Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }>;
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
    setProfile(data as UserProfile); // Update local profile state
    return { error: null, data: data as UserProfile };
  };

  const signIn = async (credentials: UserCredentials): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (!error) {
      // User will be set by onAuthStateChange, profile fetched there too
    }
    setLoading(false);
    return { error };
  };

  const signUp = async (credentials: UserCredentials & { data?: Record<string, any> }): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser, session }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: credentials.data // This can include name, etc., to be stored in auth.users.user_metadata
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }

    if (authUser) {
      // Create a corresponding profile in the 'profiles' table
      const profileData: Partial<UserProfile> = {
        id: authUser.id,
        email: authUser.email,
        name: credentials.data?.name || authUser.user_metadata?.name || authUser.email,
        photo_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture,
        age: credentials.data?.age,
        gender: credentials.data?.gender,
        skills: credentials.data?.skills,
        linkedin_url: credentials.data?.linkedin_url,
        github_url: credentials.data?.github_url,
        description: credentials.data?.description,
        achievements: credentials.data?.achievements,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      };

      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert(profileData)
        .select()
        .single();

      if (profileError) {
        console.error("Error creating profile during signup:", profileError);
        // Potentially roll back auth user or mark as incomplete? For now, log and proceed.
        setLoading(false);
        // User is signed up in auth, but profile creation failed.
        // This is a tricky state. For now, we'll return the auth user but no profile.
        return { error: profileError as any, user: authUser, profile: null };
      }
      setProfile(newProfile as UserProfile);
      setUser(authUser); // Ensure user state is updated if onAuthStateChange hasn't fired yet
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
        redirectTo: `${window.location.origin}/home` // Or your desired redirect path
      }
    });
    // User will be set by onAuthStateChange after redirect
    setLoading(false);
    return { error };
  };

  const signOutUser = async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    // router.push('/login'); // Optionally redirect after sign out
    return { error };
  };

  const sendPasswordReset = async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password` // You'll need to create this page
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
  email TEXT UNIQUE,
  photo_url TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[],
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  resume_file_url TEXT,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- RLS Policies Examples:
-- Allow users to read their own profile
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Allow users to insert their own profile (usually done via function or signup)
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- (Optional) Allow public read access to certain profile fields if needed
-- CREATE POLICY "Public can view some profile information."
-- ON public.profiles FOR SELECT TO anon, authenticated
-- USING (true); -- Or more restrictive conditions

-- Enable RLS on the table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
*/
