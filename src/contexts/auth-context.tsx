
// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
// import { useRouter } from "next/navigation"; // Temporarily commented for diagnosis

// Define a shape for your user profile data stored in Supabase
export interface UserProfile {
  id: string;
  name?: string | null;
  email?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  resume_file_url?: string | null; // For storing URL to a file in Supabase Storage
  followers_count?: number;
  following_count?: number;
  created_at?: string;
  updated_at?: string;
  last_login?: string;
}

interface AuthContextType {
  user: SupabaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email' | 'created_at' | 'updated_at' | 'last_login' | 'followers_count' | 'following_count'>> }) => Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }>;
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
  // const router = useRouter(); // Still commented out

  const fetchUserProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is fine if profile not created yet
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as UserProfile | null;
  }, []);

  useEffect(() => {
    setLoading(true);
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

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        const currentUser = session?.user ?? null;
        // Handle race condition: if session becomes null shortly after a user logs in,
        // ensure loading state doesn't flicker user out prematurely.
        if (currentUser && !user) { // User just logged in
            setUser(currentUser);
            const userProfile = await fetchUserProfile(currentUser.id);
            setProfile(userProfile);
        } else if (!currentUser && user) { // User just logged out
            setUser(null);
            setProfile(null);
        } else if (currentUser && currentUser.id !== user?.id) { // Different user logged in
             setUser(currentUser);
            const userProfile = await fetchUserProfile(currentUser.id);
            setProfile(userProfile);
        }
        // setLoading(false) // Only set loading to false after initial load or if specifically needed
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, user]); // Added user to dependencies


  const signInWithPassword = useCallback(async (credentials: SignInWithPasswordCredentials): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (data.user) {
      setUser(data.user);
      const userProfileData = await fetchUserProfile(data.user.id);
      setProfile(userProfileData);
    } else {
      setUser(null);
      setProfile(null);
    }
    setLoading(false);
    return { error };
  }, [fetchUserProfile]);

  const signUpUser = useCallback(async (credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email' | 'created_at' | 'updated_at' | 'last_login' | 'followers_count' | 'following_count'>> }): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser, session }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        // Supabase user_metadata is limited, so we store most profile info in a separate 'profiles' table
        data: { name: credentials.data?.name } // Store name in auth.users.user_metadata for convenience
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }

    if (authUser && authUser.email) {
      const profileDataToInsert: any = {
        id: authUser.id,
        email: authUser.email, // Essential
        name: credentials.data?.name || authUser.user_metadata?.name || authUser.email, // Fallback for name
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        followers_count: 0,
        following_count: 0,
      };

      // Handle optional fields carefully
      if (credentials.data?.age && !isNaN(Number(credentials.data.age)) && Number(credentials.data.age) > 0) {
        profileDataToInsert.age = Number(credentials.data.age);
      } else {
        profileDataToInsert.age = null;
      }

      if (credentials.data?.gender && credentials.data.gender.trim() !== '') {
        profileDataToInsert.gender = credentials.data.gender.trim();
      } else {
        profileDataToInsert.gender = null;
      }
      
      if (credentials.data?.skills && Array.isArray(credentials.data.skills) && credentials.data.skills.length > 0) {
        profileDataToInsert.skills = credentials.data.skills.filter(s => typeof s === 'string' && s.trim() !== '');
         if (profileDataToInsert.skills.length === 0) profileDataToInsert.skills = null; // Store as null if array becomes empty
      } else if (typeof credentials.data?.skills === 'string' && credentials.data.skills.trim() !== '') {
        profileDataToInsert.skills = credentials.data.skills.split(',').map(skill => skill.trim()).filter(skill => skill);
        if (profileDataToInsert.skills.length === 0) profileDataToInsert.skills = null;
      } else {
        profileDataToInsert.skills = null;
      }

      profileDataToInsert.linkedin_url = (credentials.data?.linkedin_url && credentials.data.linkedin_url.trim() !== '') ? credentials.data.linkedin_url.trim() : null;
      profileDataToInsert.github_url = (credentials.data?.github_url && credentials.data.github_url.trim() !== '') ? credentials.data.github_url.trim() : null;
      profileDataToInsert.description = (credentials.data?.description && credentials.data.description.trim() !== '') ? credentials.data.description.trim() : null;
      profileDataToInsert.achievements = (credentials.data?.achievements && credentials.data.achievements.trim() !== '') ? credentials.data.achievements.trim() : null;
      profileDataToInsert.resume_file_url = (credentials.data?.resume_file_url && credentials.data.resume_file_url.trim() !== '') ? credentials.data.resume_file_url.trim() : null;


      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert(profileDataToInsert)
        .select()
        .single();

      if (profileError) {
        console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
        setLoading(false);
        // Attempt to sign out the user if profile creation failed to avoid inconsistent state
        await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
        setUser(null); // Ensure local user state is cleared
        setProfile(null);
        return { error: profileError as any, user: authUser, profile: null };
      }
      setProfile(newProfile as UserProfile);
      setUser(authUser); // Already set by onAuthStateChange, but good to be explicit
      setLoading(false);
      // if (router) router.push("/home"); // Temporarily commented
      return { error: null, user: authUser, profile: newProfile as UserProfile };
    }
    setLoading(false);
    return { error: { name: "SignUpError", message: "User not returned after sign up."} as AuthError, user: null, profile: null };
  }, [fetchUserProfile]); // router was removed from dependencies

  const signInWithGoogleProvider = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined; // Supabase handles the callback to its own endpoint first
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo } // This redirectTo is where Supabase will send the user AFTER successful auth with Google AND Supabase's own processing
    });
    // setLoading(false) will be handled by onAuthStateChange or if error
    if (error) {
      setLoading(false);
      console.error("Google Sign-In Error:", error);
    }
    return { error };
  }, []);

  const signOut = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    // if (router) router.push('/login'); // Temporarily commented
    return { error };
  }, []); // router was removed

  const resetPasswordForEmail = useCallback(async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    // The redirectTo here is where the user will be sent AFTER they click the link in the password reset email
    // This page should handle the password update form using the access_token from the URL fragment
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    return { error };
  }, []);

  const updateUserProfileData = useCallback(async (userId: string, updates: Partial<UserProfile>): Promise<{ error: any | null; data: UserProfile | null }> => {
    setLoading(true);
    let processedUpdates: Partial<UserProfile> = { ...updates };
    
    // Ensure skills is an array of strings or null
    if (updates.skills && typeof updates.skills === 'string') {
        processedUpdates.skills = (updates.skills as string).split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
        if (processedUpdates.skills.length === 0) processedUpdates.skills = null;
    } else if (Array.isArray(updates.skills)) {
        processedUpdates.skills = updates.skills.filter(s => typeof s === 'string' && s.trim().length > 0);
        if (processedUpdates.skills.length === 0) processedUpdates.skills = null;
    } else {
      processedUpdates.skills = null; // Default to null if not a string or valid array
    }

    // Convert empty strings for nullable text fields to null
    (Object.keys(processedUpdates) as Array<keyof Partial<UserProfile>>).forEach(key => {
      if (typeof processedUpdates[key] === 'string' && (processedUpdates[key] as string).trim() === '' && key !== 'name' && key !== 'email') {
        (processedUpdates[key] as any) = null;
      }
    });
    
    if (typeof processedUpdates.age === 'string' && processedUpdates.age.trim() === '') {
        processedUpdates.age = null;
    } else if (processedUpdates.age !== undefined && processedUpdates.age !== null) {
        const ageNum = Number(processedUpdates.age);
        processedUpdates.age = isNaN(ageNum) || ageNum <= 0 ? null : ageNum;
    }


    const { data, error } = await supabase
      .from('profiles')
      .update({ ...processedUpdates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    setLoading(false);
    if (error) {
      console.error('Error updating profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error, data: null };
    }
    if (data) {
      setProfile(prevProfile => ({...(prevProfile || {} as UserProfile), ...data} as UserProfile));
    }
    return { error: null, data: data as UserProfile };
  }, []);

  const contextValue: AuthContextType = {
    user,
    profile,
    loading,
    signIn: signInWithPassword,
    signUp: signUpUser,
    signInWithGoogle: signInWithGoogleProvider,
    signOutUser: signOut,
    sendPasswordReset: resetPasswordForEmail,
    updateUserProfile: updateUserProfileData,
  };

  return (
    <AuthContext.Provider value={contextValue}>
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

/*
Example SQL for 'profiles' table and RLS (run in Supabase SQL Editor):

-- Create the 'profiles' table
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT UNIQUE,
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- Array of text for skills
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

-- Function to automatically update the 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function before any update on the 'profiles' table
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- Enable Row Level Security (RLS) on the 'profiles' table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS POLICY: Allow users to view their own profile.
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- RLS POLICY: Allow users to insert their own profile.
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- RLS POLICY: Allow users to update their own profile.
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- RLS POLICY: Allow users to delete their own profile.
CREATE POLICY "Users can delete their own profile."
ON public.profiles FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- (Optional) If you want profile information to be publicly readable by anyone (even non-logged-in users)
-- CREATE POLICY "Public profiles are viewable by everyone."
-- ON public.profiles FOR SELECT
-- TO public -- or use 'anon' for non-authenticated, 'authenticated' for logged-in
-- USING (true);
-- Be careful with this policy and ensure you only expose data you intend to be public.
-- You might combine it with specific column selection in your queries or create a database VIEW.

*/

    