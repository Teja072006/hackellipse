
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, Provider, SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// This interface should match the columns in your Supabase 'profiles' table
export interface UserProfile {
  id?: number; // Your auto-incrementing BIGINT/INT8 Primary Key
  user_id: string; // UUID from auth.users table, used for RLS owner checks (auth.uid() = user_id)
  email: string; // User's email, should be unique
  full_name?: string | null;
  age?: string | null;      // Changed to string to match user's DB schema (was number)
  gender?: string | null;
  skills?: string | null;   // Changed to string (comma-separated) to match user's DB schema (was string[])
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
}

// Data expected from the registration form
type SignUpProfileData = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count'> & {
  full_name: string; // Making full_name required for initial profile
  skills?: string; // Skills come as a comma-separated string from the form
  age?: number | string; // Age might come as number or string from form
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: { email: string, password: string }) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data: SignUpProfileData }) => Promise<{ error: AuthError | null; user: User | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email'>>) => Promise<{ error: AuthError | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (authUserId: string): Promise<UserProfile | null> => {
    if (!authUserId) {
      console.warn("fetchUserProfile called with no authUserId.");
      return null;
    }
    console.log("Fetching Supabase profile for user_id (auth link):", authUserId);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count")
        .eq("user_id", authUserId) // Query by the user_id (UUID) column from your 'profiles' table
        .single();

      if (error) {
        if (error.message.toLowerCase().includes('failed to fetch')) {
          console.error(
            'Error fetching profile (Network Issue - Failed to fetch with Supabase):',
            'This usually means the application could not reach the Supabase server. Please double-check:',
            '1. Your NEXT_PUBLIC_SUPABASE_URL in the .env file (e.g., https://<your-project-ref>.supabase.co).',
            '2. Your NEXT_PUBLIC_SUPABASE_ANON_KEY in the .env file.',
            '3. Your internet connection and any firewalls/proxies.',
            'Detailed error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
          );
        } else if (error.code === 'PGRST116') { // No profile found
          console.log(`No Supabase profile found for user_id ${authUserId}. This is normal for a new user or if profile creation is pending.`);
        } else {
          console.error('Error fetching Supabase user profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }
        return null;
      }
      console.log("Supabase Profile fetched successfully:", data);
      return data as UserProfile | null;
    } catch (catchedError: any) {
      console.error("Unexpected error in fetchUserProfile (Supabase):", JSON.stringify(catchedError, Object.getOwnPropertyNames(catchedError), 2));
      return null;
    }
  }, []);


  useEffect(() => {
    const getInitialSession = async () => {
      setLoading(true);
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          if (sessionError.message.toLowerCase().includes("invalid refresh token")) {
            console.warn("Supabase getSession: Invalid refresh token. User treated as signed out.", JSON.stringify(sessionError, Object.getOwnPropertyNames(sessionError), 2));
          } else {
            console.error("Error getting initial Supabase session:", JSON.stringify(sessionError, Object.getOwnPropertyNames(sessionError), 2));
          }
          setUser(null);
          setProfile(null);
        } else if (session?.user && session.user.id) {
          setUser(session.user);
          const userProfileData = await fetchUserProfile(session.user.id);
          setProfile(userProfileData);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (catchedError: any) {
         console.error("Unexpected critical error in getInitialSession (Supabase):", JSON.stringify(catchedError, Object.getOwnPropertyNames(catchedError), 2));
         setUser(null);
         setProfile(null);
      }
      setLoading(false);
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true);
        const authUser = session?.user ?? null;
        setUser(authUser);

        if (authUser && authUser.id && authUser.email) {
          let userProfileData = await fetchUserProfile(authUser.id);

          // If user is signed in (especially via OAuth first time) and no profile exists, create one.
          // This logic primarily targets OAuth sign-ins where the profile might not be created during the initial auth step.
          // For email/password signup, the profile is created in the signUp function.
          if (event === "SIGNED_IN" && !userProfileData) {
            console.log("User signed in (possibly OAuth/new), attempting to create profile in Supabase for user_id:", authUser.id);
            const defaultFullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || "New User";
            
            const profileToCreate: Omit<UserProfile, 'id'> = {
              user_id: authUser.id,
              email: authUser.email,
              full_name: defaultFullName,
              // Default other fields as per your schema or to null/empty
              age: null,
              gender: null,
              skills: null, // Defaulting to null for a TEXT field
              linkedin_url: null,
              github_url: null,
              description: null,
              achievements: null,
              followers_count: 0,
              following_count: 0,
            };

            const { error: createProfileError, data: createdProfile } = await supabase
              .from('profiles')
              .insert(profileToCreate)
              .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count")
              .single();

            if (createProfileError) {
              console.error("Error creating Supabase profile for OAuth user:", JSON.stringify(createProfileError, Object.getOwnPropertyNames(createProfileError), 2));
            } else {
              console.log("Supabase profile created for OAuth user:", authUser.id, createdProfile);
              userProfileData = createdProfile as UserProfile;
            }
          }
          setProfile(userProfileData);
        } else {
          setProfile(null);
          if (event === "SIGNED_OUT" && router && (router as any).pathname !== '/') {
             router.push("/"); 
           }
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, router]);

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } else {
       toast({ title: "Login Successful", description: "Welcome back!" });
       router.push("/home");
    }
    return { error };
  }, [router]);

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data: SignUpProfileData }) => {
    setLoading(true);
    const { email, password, options, data: userData } = credentials;

    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: userData.full_name } } 
    });

    if (signUpError) {
      setLoading(false);
      console.error("Supabase Sign-Up error (auth part):", JSON.stringify(signUpError, Object.getOwnPropertyNames(signUpError), 2));
      toast({ title: "Registration Failed", description: signUpError.message, variant: "destructive" });
      return { error: signUpError, user: null, profile: null };
    }

    const authUser = signUpResponse?.user;
    if (!authUser || !authUser.id || !authUser.email) {
      setLoading(false);
      const err = { name: "SignUpError", message: "User data not returned after sign up." } as AuthError;
      console.error(err.message, "Received Supabase user:", authUser);
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
      return { error: err, user: null, profile: null };
    }
    
    // Prepare profile data for insertion, aligning with DB schema (skills as TEXT, age as TEXT)
    let skillsAsString: string | null = null;
    if (userData.skills && typeof userData.skills === 'string' && userData.skills.trim() !== '') {
      skillsAsString = userData.skills; // Assume it's already comma-separated string from form
    } else if (Array.isArray(userData.skills)) { // Should not happen if form sends string
        skillsAsString = userData.skills.join(',');
    }

    let ageAsString: string | null = null;
    if (userData.age !== undefined && userData.age !== null && String(userData.age).trim() !== '') {
        ageAsString = String(userData.age);
    }
    
    const profileDataToInsert: Omit<UserProfile, 'id' | 'followers_count' | 'following_count'> & { user_id: string } = {
      user_id: authUser.id,
      email: authUser.email!,
      full_name: userData.full_name || authUser.email!.split('@')[0],
      age: ageAsString, // Store as string or null
      gender: userData.gender?.trim() || null,
      skills: skillsAsString, // Store as comma-separated string or null
      linkedin_url: userData.linkedin_url?.trim() || null,
      github_url: userData.github_url?.trim() || null,
      description: userData.description?.trim() || null,
      achievements: userData.achievements?.trim() || null,
    };

    console.log("Attempting to insert profile into Supabase with data:", JSON.stringify(profileDataToInsert, null, 2));

    const { error: profileError, data: newProfile } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count")
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user if profile creation failed, to avoid inconsistent state
      // Also, consider if the auth user should be deleted if profile creation is mandatory.
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); 
      setProfile(null); 
      toast({ title: "Profile Creation Failed", description: profileError.message, variant: "destructive" });
      return { error: profileError as any, user: authUser, profile: null };
    }

    setProfile(newProfile as UserProfile);
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome to SkillSmith! Please check your email for verification if required." });
    router.push("/home");
    return { error: null, user: authUser, profile: newProfile as UserProfile };
  }, [router]); 

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Initiating Google Sign-In with Supabase. App Origin:", window.location.origin, "RedirectTo:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    setLoading(false); // Set loading false if there's an immediate error before redirect
    if (error) {
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Check console. Ensure popups are allowed & Google Cloud OAuth Consent Screen is correctly setup (test users, publishing status) & Supabase Google provider config (Client ID, Secret, Redirect URI).`,
        variant: "destructive",
        duration: 10000,
      });
    }
    // If successful, Supabase handles redirect. setLoading(false) might not be hit here if redirect happens.
    return { error };
  }, [router]); 

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      setUser(null);
      setProfile(null);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push("/");
    }
    return { error };
  }, [router]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
       redirectTo: `${window.location.origin}/reset-password`, // Ensure this page exists or adjust
    });
    setLoading(false);
    if (error) {
      console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset Email Sent", description: "If an account exists, you'll receive an email with instructions." });
    }
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'email' | 'user_id' | 'followers_count' | 'following_count'>>) => {
    if (!user || !user.id || !user.email) {
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      toast({ title: "Update Failed", description: authError.message, variant: "destructive" });
      return { error: authError, data: null };
    }
    setLoading(true);

    // Align data with DB schema (skills as TEXT, age as TEXT)
    const updatesForSupabase: Record<string, any> = { ...updates };

    if (updates.skills && Array.isArray(updates.skills)) { // Should come as string from form, but guard
        updatesForSupabase.skills = updates.skills.join(',');
    } else if (updates.skills === undefined || updates.skills === null || (typeof updates.skills === 'string' && updates.skills.trim() === '')) {
        updatesForSupabase.skills = null;
    }


    if (updates.age !== undefined && updates.age !== null && String(updates.age).trim() !== '') {
        updatesForSupabase.age = String(updates.age);
    } else if (updates.age === undefined || updates.age === null || String(updates.age).trim() === '') {
        updatesForSupabase.age = null;
    }
    
    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(updatesForSupabase, null, 2));

    const { data, error } = await supabase
      .from("profiles")
      .update(updatesForSupabase)
      .eq("user_id", user.id) // Update using the user_id (UUID)
      .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count")
      .single();

    setLoading(false);
    if (error) {
      console.error('Error updating Supabase profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      return { error: error as AuthError, data: null };
    }
    setProfile(data as UserProfile);
    toast({ title: "Profile Updated", description: "Your changes have been saved." });
    return { error: null, data: data as UserProfile };
  }, [user, profile]); // Added profile to deps if needed for optimistic updates elsewhere, though not strictly for this func

  const contextValue: AuthContextType = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOutUser,
    sendPasswordReset,
    updateUserProfile,
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
    throw new Error("useAuth must be used within an AuthProvider (Supabase version)");
  }
  return context;
};

/*
Example SUPABASE DATABASE 'profiles' TABLE SCHEMA (Based on user's screenshot & requirements):
================================================================================
CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY, -- Auto-incrementing integer primary key
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Links to auth.users table (UUID)
  email TEXT UNIQUE NOT NULL, -- Should match auth.users.email
  full_name TEXT,
  age TEXT, -- User schema has TEXT, app was sending number. Ideally INTEGER.
  gender TEXT,
  skills TEXT, -- User schema has TEXT, app was sending array. Ideally TEXT[].
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL
  -- created_at, updated_at, etc. are optional. Supabase adds its own by default.
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using user_id (UUID) for ownership checks):

-- SELECT Policy
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
ON public.profiles AS PERMISSIVE FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT Policy
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
ON public.profiles AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);

-- UPDATE Policy
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles AS PERMISSIVE FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);

-- (Optional) DELETE Policy
-- DROP POLICY IF EXISTS "Users can delete their own profile." ON public.profiles;
-- CREATE POLICY "Users can delete their own profile."
-- ON public.profiles AS PERMISSIVE FOR DELETE
-- TO authenticated
-- USING (auth.uid() = user_id);
================================================================================
*/
