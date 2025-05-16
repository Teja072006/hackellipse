// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignUpWithPasswordCredentials, Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation"; // For redirecting

// Define a shape for your user profile data stored in Supabase
export interface UserProfile {
  id: string; // Corresponds to Supabase auth user ID
  name?: string | null;
  email?: string | null;
  photo_url?: string | null; 
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null; // Added github_url
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
    // Ensure skills are an array if provided as a string
    let processedUpdates = { ...updates };
    if (updates.skills && typeof updates.skills === 'string') {
        processedUpdates.skills = updates.skills.split(',').map(skill => skill.trim()).filter(skill => skill);
    }


    const { data, error } = await supabase
      .from('profiles')
      .update({ ...processedUpdates, updated_at: new Date().toISOString() })
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
    setLoading(false);
    return { error };
  };

  const signUp = async (credentials: SignUpWithPasswordCredentials & { data?: Record<string, any> }): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser, session }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: { 
          name: credentials.data?.name,
          // photo_url for Google sign up can be sourced from user_metadata if available
        }
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }

    if (authUser) {
      const profileDataToInsert: { [key: string]: any } = {
        id: authUser.id,
        email: authUser.email,
        name: credentials.data?.name || authUser.user_metadata?.name || authUser.email,
        photo_url: credentials.data?.photo_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      };
      
      if (typeof credentials.data?.age === 'number' && !isNaN(credentials.data.age) && credentials.data.age > 0) {
        profileDataToInsert.age = credentials.data.age;
      }
      if (credentials.data?.gender && credentials.data.gender.trim() !== '') {
        profileDataToInsert.gender = credentials.data.gender;
      }
      
      // Correctly transform skills from comma-separated string to string array, only if provided and not empty
      if (credentials.data?.skills && typeof credentials.data.skills === 'string' && credentials.data.skills.trim() !== '') {
        profileDataToInsert.skills = credentials.data.skills.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
      } else if (credentials.data?.skills && Array.isArray(credentials.data.skills)) {
         // If skills is already an array, filter out empty strings
         profileDataToInsert.skills = credentials.data.skills.filter(skill => typeof skill === 'string' && skill.trim().length > 0);
      }


      if (credentials.data?.linkedin_url && credentials.data.linkedin_url.trim() !== '') {
        profileDataToInsert.linkedin_url = credentials.data.linkedin_url;
      }
      // Ensure github_url is also handled if present in credentials.data (it is in register-form)
      if (credentials.data?.github_url && credentials.data.github_url.trim() !== '') {
        profileDataToInsert.github_url = credentials.data.github_url;
      }
       if (credentials.data?.description && credentials.data.description.trim() !== '') {
        profileDataToInsert.description = credentials.data.description;
      }
       if (credentials.data?.achievements && credentials.data.achievements.trim() !== '') {
        profileDataToInsert.achievements = credentials.data.achievements;
      }

      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert(profileDataToInsert)
        .select()
        .single();

      if (profileError) {
        console.error("Error creating profile during signup:", profileError);
        // If profile creation fails, we might want to sign out the user or handle it differently
        // For now, we return the error and the authUser, but profile will be null.
        setLoading(false);
        return { error: profileError as any, user: authUser, profile: null };
      }
      setProfile(newProfile as UserProfile);
      setUser(authUser); 
      setLoading(false);
      return { error: null, user: authUser, profile: newProfile as UserProfile };
    }
    
    // Fallback if authUser is somehow null after a successful signUp call (should not happen ideally)
    setLoading(false);
    return { error: { name: "SignUpError", message: "User not returned after sign up."} as AuthError, user: null, profile: null };
  };

  const signInWithGoogle = async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined
        // It's good practice to define scopes if you need more than basic profile info
        // scopes: 'email profile https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      }
    });
    // Supabase handles the redirect and onAuthStateChange will pick up the session.
    // setLoading(false) will be handled by onAuthStateChange.
    if (error) setLoading(false); // Only set loading false here if there's an immediate error before redirect
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
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined // You'll need to create an /update-password page
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

// SQL for 'profiles' table (ensure this matches your Supabase table):
/*
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT UNIQUE,
  photo_url TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- Array of text
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  resume_file_url TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login TIMESTAMPTZ
);

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies:
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
*/