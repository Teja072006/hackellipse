
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export interface UserProfile {
  id?: number; // Auto-incrementing BIGSERIAL PK from 'profiles' table
  user_id: string; // UUID from auth.users table, used for RLS and linking
  email: string; // User's email, should be unique
  full_name?: string | null;
  age?: number | null; // Storing as INTEGER in DB
  gender?: string | null;
  skills?: string[] | null; // Storing as TEXT[] (array of text) in Supabase
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number; // Default 0 in DB
  following_count?: number; // Default 0 in DB
  created_at?: string; // Handled by DB default
}

// Data expected from the registration form
type SignUpFormData = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count' | 'created_at' | 'age' | 'skills'> & {
  full_name: string;
  age?: string; // Age from form as string, will be parsed to number
  skills?: string; // Skills come as a comma-separated string from the form
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: { email: string, password: string }) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data: SignUpFormData }) => Promise<{ error: AuthError | null; user: User | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'created_at'>>) => Promise<{ error: AuthError | null; data: UserProfile | null }>;
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
        .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at")
        .eq("user_id", authUserId) 
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
        } else if (error.code === 'PGRST116') { 
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
    setLoading(true);
    const getInitialSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          if (sessionError.message?.toLowerCase().includes("invalid refresh token")) {
            console.warn("Supabase getSession: Invalid refresh token. User treated as signed out.");
          } else {
             console.error("Error getting initial Supabase session:", JSON.stringify(sessionError, Object.getOwnPropertyNames(sessionError), 2));
          }
          setUser(null);
          setProfile(null);
        } else if (session?.user && session.user.id && session.user.email) {
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
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("Supabase onAuthStateChange event:", _event, "session user_id:", session?.user?.id);
        setLoading(true);
        const authUser = session?.user ?? null;
        setUser(authUser);

        if (authUser && authUser.id && authUser.email) {
          const userProfileData = await fetchUserProfile(authUser.id);
          setProfile(userProfileData);

          if (_event === "SIGNED_IN" && (!user || user.id !== authUser.id)) {
             console.log("User signed in or session restored, navigating to /home");
             router.push("/home");
          }
        } else {
          setProfile(null);
          if (_event === "SIGNED_OUT") {
            console.log("User signed out, redirecting to /");
            router.push("/");
          }
        }
        setLoading(false);
      }
    );
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, router, user]);


  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } else {
       toast({ title: "Login Successful", description: "Welcome back!" });
    }
    return { error };
  }, []);

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data: SignUpFormData }) => {
    setLoading(true);
    const { email, password, options, data: userData } = credentials;

    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { 
          full_name: userData.full_name,
        },
      },
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
      const err = { name: "SignUpError", message: "User data not returned after sign up or missing id/email." } as AuthError;
      console.error(err.message, "Received Supabase authUser:", authUser);
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
      return { error: err, user: null, profile: null };
    }
    
    console.log("Authenticated user from signUp:", JSON.stringify({id: authUser.id, email: authUser.email, user_metadata_full_name: authUser.user_metadata?.full_name}, null, 2));

    let skillsArray: string[] | null = null;
    if (userData.skills && typeof userData.skills === 'string' && userData.skills.trim() !== '') {
      skillsArray = userData.skills.split(',').map(s => s.trim()).filter(s => s);
    }
    if (Array.isArray(skillsArray) && skillsArray.length === 0) {
        skillsArray = null; 
    }

    let ageNumber: number | null = null;
    if (userData.age !== undefined && userData.age !== null && String(userData.age).trim() !== '') {
        const parsedAge = parseInt(String(userData.age), 10);
        if (!isNaN(parsedAge) && parsedAge > 0) { // Ensure positive age
            ageNumber = parsedAge;
        } else {
            console.warn("Invalid age input, storing as null:", userData.age);
        }
    }
    
    const finalFullName = userData.full_name?.trim() || authUser.user_metadata?.full_name?.trim() || authUser.email!.split('@')[0] || 'New User';

    const profileDataToInsert: Omit<UserProfile, 'id' | 'followers_count' | 'following_count' | 'created_at'> = {
      user_id: authUser.id, 
      email: authUser.email!,
      full_name: finalFullName,
      age: ageNumber,
      gender: userData.gender?.trim() || null,
      skills: skillsArray,
      linkedin_url: userData.linkedin_url?.trim() || null,
      github_url: userData.github_url?.trim() || null,
      description: userData.description?.trim() || null,
      achievements: userData.achievements?.trim() || null,
    };
    
    console.log("Attempting to insert profile into Supabase with data:", JSON.stringify(profileDataToInsert, null, 2));

    const { error: profileError, data: newProfileData } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at")
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); 
      setProfile(null);
      toast({ title: "Profile Creation Failed", description: profileError.message, variant: "destructive" });
      return { error: profileError as any, user: authUser, profile: null };
    }

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile);
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created." });
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, [router]);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Google Sign-In with Supabase. redirectTo:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setLoading(false);
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Please check pop-up blockers and ensure your Google Cloud OAuth Consent screen is correctly configured (especially if in 'testing' mode, add test users).`,
        variant: "destructive",
        duration: 10000,
      });
    }
    return { error };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoading(false);
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    }
    return { error };
  }, [router]); // router dependency for onAuthStateChange

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/forgot-password?reset=true` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) {
      console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset Email Sent", description: "If an account exists, you'll receive an email with instructions." });
    }
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'created_at'>>) => {
    if (!user || !user.id) {
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      toast({ title: "Update Failed", description: authError.message, variant: "destructive" });
      return { error: authError, data: null };
    }
    setLoading(true);

    const updatesForSupabase: Record<string, any> = {};

    if (updates.hasOwnProperty('full_name')) updatesForSupabase.full_name = updates.full_name?.trim() || null;
    if (updates.hasOwnProperty('gender')) updatesForSupabase.gender = updates.gender?.trim() || null;
    if (updates.hasOwnProperty('linkedin_url')) updatesForSupabase.linkedin_url = updates.linkedin_url?.trim() || null;
    if (updates.hasOwnProperty('github_url')) updatesForSupabase.github_url = updates.github_url?.trim() || null;
    if (updates.hasOwnProperty('description')) updatesForSupabase.description = updates.description?.trim() || null;
    if (updates.hasOwnProperty('achievements')) updatesForSupabase.achievements = updates.achievements?.trim() || null;
    
    if (updates.hasOwnProperty('age')) {
        if (updates.age === undefined || updates.age === null || String(updates.age).trim() === '') {
            updatesForSupabase.age = null;
        } else {
            const parsedAge = parseInt(String(updates.age), 10);
            updatesForSupabase.age = isNaN(parsedAge) || parsedAge <=0 ? null : parsedAge; // Store as number
        }
    }

    if (updates.hasOwnProperty('skills')) {
        if (updates.skills === null || updates.skills === undefined) {
            updatesForSupabase.skills = null;
        } else if (Array.isArray(updates.skills)) { // If it's already an array (e.g. from profile state)
            updatesForSupabase.skills = updates.skills.map(s => String(s).trim()).filter(s => s);
             if (updatesForSupabase.skills.length === 0) updatesForSupabase.skills = null;
        } else if (typeof updates.skills === 'string') { // Assume comma-separated string from form input
            updatesForSupabase.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s);
            if (updatesForSupabase.skills.length === 0) updatesForSupabase.skills = null;
        }
    }

    if (Object.keys(updatesForSupabase).length === 0) {
      setLoading(false);
      toast({ title: "No Changes", description: "No information was changed." });
      return { error: null, data: profile };
    }
    
    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(updatesForSupabase, null, 2), "for user_id:", user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(updatesForSupabase)
      .eq("user_id", user.id)
      .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at")
      .single();

    setLoading(false);
    if (error) {
      console.error('Error updating Supabase profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      return { error: error as AuthError, data: null };
    }
    console.log("Profile updated successfully in Supabase:", data);
    setProfile(data as UserProfile);
    toast({ title: "Profile Updated", description: "Your changes have been saved." });
    return { error: null, data: data as UserProfile };
  }, [user, profile]);


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
IDEAL Supabase 'profiles' table schema:
(Ensure your actual table matches the UserProfile interface and application logic)
================================================================================
CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY,                                 -- Auto-incrementing internal ID for the profile row itself
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Foreign key to auth.users.id (this IS the auth user's UUID)
  email TEXT UNIQUE NOT NULL,                               -- Should match auth.users.email
  full_name TEXT,
  age INTEGER,                                              -- Store age as a number
  gender TEXT,
  skills TEXT[],                                            -- TEXT ARRAY for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies (ensure 'user_id' below refers to your UUID column linked to auth.users):
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
================================================================================
*/
