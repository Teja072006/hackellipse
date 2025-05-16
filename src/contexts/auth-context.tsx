
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// UserProfile reflects the structure of your 'profiles' table in Supabase
// 'id' is the auto-incrementing BIGSERIAL/INT8 Primary Key of the profiles table itself.
// 'user_id' is the UUID from auth.users.id, used for RLS and linking.
export interface UserProfile {
  id?: number; // Auto-incrementing PK from 'profiles' table
  user_id: string; // UUID from auth.users.id - THIS IS THE KEY FOR RLS OWNERSHIP
  email: string;
  full_name?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  created_at?: string; // Added back for good practice, DB handles default
}

// Data expected from the registration form for profile details
// This is slightly different from UserProfile as form might send age/skills as strings
type SignUpProfileData = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count' | 'created_at'> & {
  full_name: string;
  age?: string; // Age from form as string
  skills?: string; // Skills from form as comma-separated string
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
      // Select all fields defined in UserProfile interface (except auto-gen 'id' if not needed immediately)
      // Ensure 'user_id' (UUID) is selected as it's key for RLS.
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at")
        .eq("user_id", authUserId) // Query by the UUID user_id
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
        } else if (error.code === 'PGRST116') { // "Exactly one row expected, but 0 or more rows were returned"
          console.log(`No Supabase profile found for user_id ${authUserId}. This is normal for a new user or if profile creation is pending.`);
        } else if (error.code === '406') { // Not Acceptable
             console.error('Error fetching profile (406 Not Acceptable): This often indicates an RLS issue with your SELECT policy or a problem with the requested columns/data format.', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
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
    let isEffectMounted = true;

    const getInitialSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!isEffectMounted) return;

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
          if (isEffectMounted) setProfile(userProfileData);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (catchedError: any) {
         console.error("Unexpected critical error in getInitialSession (Supabase):", JSON.stringify(catchedError, Object.getOwnPropertyNames(catchedError), 2));
         if (isEffectMounted) {
           setUser(null);
           setProfile(null);
         }
      } finally {
        if (isEffectMounted) setLoading(false);
      }
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isEffectMounted) return;
        console.log("Supabase onAuthStateChange event:", _event, "session user_id:", session?.user?.id);
        setLoading(true);
        const authUser = session?.user ?? null;
        setUser(authUser);

        if (authUser && authUser.id && authUser.email) {
          const userProfileData = await fetchUserProfile(authUser.id);
          if (isEffectMounted) setProfile(userProfileData);

          if (_event === "SIGNED_IN" && (!user || user.id !== authUser.id)) {
             console.log("User signed in or session restored, navigating to /home");
             router.push("/home");
          }
        } else {
          if (isEffectMounted) setProfile(null);
          if (_event === "SIGNED_OUT") {
            console.log("User signed out, redirecting to /");
            router.push("/");
          }
        }
        if (isEffectMounted) setLoading(false);
      }
    );
    return () => {
      isEffectMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, router, user]); // Added 'user' to re-evaluate if user changes from outside (e.g. another tab)

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } else {
       toast({ title: "Login Successful", description: "Welcome back!" });
       // Navigation to /home is handled by onAuthStateChange
    }
    return { error };
  }, []);

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data: SignUpProfileData }) => {
    setLoading(true);
    const { email, password, options, data: userData } = credentials;

    console.log("Attempting Supabase auth sign up with email:", email);
    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { // Data to be stored in auth.users.raw_user_meta_data (e.g., full_name for display before profile creation)
          full_name: userData.full_name?.trim(),
        },
      },
    });

    if (signUpError || !signUpResponse?.user?.id || !signUpResponse?.user?.email) {
      setLoading(false);
      const specificError = signUpError || { name: "SignUpError", message: "User data not returned after sign up or missing id/email." } as AuthError;
      console.error("Supabase Sign-Up error (auth part):", JSON.stringify(specificError, Object.getOwnPropertyNames(specificError), 2));
      toast({ title: "Registration Failed", description: specificError.message, variant: "destructive" });
      return { error: specificError, user: null, profile: null };
    }

    const authUser = signUpResponse.user;
    console.log('Authenticated user from Supabase signUp:', { id: authUser.id, email: authUser.email, raw_user_meta_data: authUser.raw_user_meta_data });

    // Prepare data for 'profiles' table, aligning with UserProfile interface
    // and ideal schema (skills as array, age as number)
    let skillsArray: string[] | null = null;
    if (userData.skills && typeof userData.skills === 'string' && userData.skills.trim() !== '') {
      skillsArray = userData.skills.split(',').map(s => s.trim()).filter(s => s);
    }

    let ageNumber: number | null = null;
    if (userData.age !== undefined && userData.age !== null && String(userData.age).trim() !== '') {
        const parsedAge = parseInt(String(userData.age), 10);
        if (!isNaN(parsedAge) && parsedAge > 0) {
            ageNumber = parsedAge;
        } else {
            console.warn(`Invalid age value "${userData.age}" provided, storing as NULL.`);
        }
    }

    // DIAGNOSTIC - MINIMAL INSERT: Only insert user_id and email
    const profileDataToInsert: Pick<UserProfile, 'user_id' | 'email'> = {
      user_id: authUser.id, // This is the auth.uid()
      email: authUser.email!,
    };
    
    // For full insert (if minimal diagnostic passes, uncomment and adjust):
    /*
    const profileDataToInsert: Omit<UserProfile, 'id' | 'followers_count' | 'following_count' | 'created_at'> = {
      user_id: authUser.id, // This is the auth.uid()
      email: authUser.email!,
      full_name: userData.full_name?.trim() || authUser.email?.split('@')[0] || 'New User',
      age: ageNumber,
      gender: userData.gender?.trim() || null,
      skills: skillsArray,
      linkedin_url: userData.linkedin_url?.trim() || null,
      github_url: userData.github_url?.trim() || null,
      description: userData.description?.trim() || null,
      achievements: userData.achievements?.trim() || null,
    };
    */

    console.log('Attempting to insert profile into Supabase with data (DIAGNOSTIC - MINIMAL):', profileDataToInsert);

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
      if (profileError.code === '42501') { // RLS violation
        toast({ title: "Profile Creation RLS Error", description: "RLS policy violated. Check Supabase RLS for 'profiles' table INSERT. Ensure 'user_id' in policy matches your UUID auth link column and 'email' matches the email column.", variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Profile Creation Failed", description: profileError.message, variant: "destructive" });
      }
      return { error: profileError as any, user: authUser, profile: null };
    }

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile);
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created." });
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, []);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Supabase Google Sign-In. Final redirectTo for Supabase:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setLoading(false);
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Check pop-up blockers and ensure your Google Cloud OAuth Consent screen is correctly configured (especially test users if in 'testing' mode).`,
        variant: "destructive",
        duration: 10000,
      });
    }
    // setLoading(false) might not be reached if OAuth redirects.
    // onAuthStateChange will handle setting user and loading state upon successful redirect.
    return { error };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    }
    // User and profile state are cleared by onAuthStateChange
    return { error };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // redirectTo: `${window.location.origin}/update-password` // Optional: customize redirect
    });
    setLoading(false);
    if (error) {
      console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset Email Sent", description: "If an account exists for this email, you'll receive instructions to reset your password." });
    }
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'created_at'>>) => {
    if (!user || !user.id) { // Check against the auth user from context
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      toast({ title: "Update Failed", description: authError.message, variant: "destructive" });
      return { error: authError, data: null };
    }
    setLoading(true);

    const updatesForSupabase: Record<string, any> = { ...updates };

    if (updates.hasOwnProperty('age')) {
      if (updates.age === undefined || updates.age === null || String(updates.age).trim() === '') {
          updatesForSupabase.age = null;
      } else {
          const parsedAge = parseInt(String(updates.age), 10);
          updatesForSupabase.age = isNaN(parsedAge) || parsedAge <= 0 ? null : parsedAge;
          if (isNaN(parsedAge) && String(updates.age).trim() !== '') console.warn(`Invalid age "${updates.age}" will be stored as NULL.`);
      }
    }


    if (updates.hasOwnProperty('skills')) {
        if (updates.skills === null || updates.skills === undefined || (Array.isArray(updates.skills) && updates.skills.length === 0)) {
            updatesForSupabase.skills = null; // Send null if empty array or null/undefined
        } else if (typeof updates.skills === 'string') { // From form, comma-separated
            updatesForSupabase.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s);
            if (updatesForSupabase.skills.length === 0) updatesForSupabase.skills = null;
        } else if (Array.isArray(updates.skills)) { // Already an array
            updatesForSupabase.skills = updates.skills.map(s => String(s).trim()).filter(s => s);
             if (updatesForSupabase.skills.length === 0) updatesForSupabase.skills = null;
        }
    }
    
    // Clean up fields that should not be directly updated or are typed differently for update
    Object.keys(updatesForSupabase).forEach(key => {
        if (updatesForSupabase[key] === undefined) {
            delete updatesForSupabase[key]; // Remove undefined properties
        }
        if (key === 'age' && updatesForSupabase.age === null && !updates.hasOwnProperty('age')) delete updatesForSupabase.age;
        if (key === 'skills' && updatesForSupabase.skills === null && !updates.hasOwnProperty('skills')) delete updatesForSupabase.skills;
    });


    if (Object.keys(updatesForSupabase).length === 0) {
      setLoading(false);
      toast({ title: "No Changes", description: "No information was changed." });
      return { error: null, data: profile };
    }
    
    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(updatesForSupabase, null, 2), "for user_id (auth link):", user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(updatesForSupabase)
      .eq("user_id", user.id) // Match based on the auth user's ID (UUID) stored in user_id column
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
Example Supabase 'profiles' table schema (ensure this aligns with your actual table):

CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY, -- Auto-incrementing internal ID for the profile row itself
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Links to auth.users.id (UUID)
  email TEXT UNIQUE NOT NULL, -- Should match auth.users.email
  full_name TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- TEXT ARRAY for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  -- updated_at can be handled by a DB trigger or app logic if needed
);

-- RLS POLICIES (ensure 'user_id' refers to the UUID column linked to auth.users):

-- Enable RLS on the table first in Supabase UI or with: ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT Policy:
-- CREATE POLICY "Users can view their own profile."
-- ON public.profiles FOR SELECT
-- TO authenticated
-- USING (auth.uid() = user_id);

-- INSERT Policy:
-- CREATE POLICY "Users can insert their own profile."
-- ON public.profiles FOR INSERT
-- TO authenticated
-- WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);

-- UPDATE Policy:
-- CREATE POLICY "Users can update their own profile."
-- ON public.profiles FOR UPDATE
-- TO authenticated
-- USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);

-- DELETE Policy (Optional):
-- CREATE POLICY "Users can delete their own profile."
-- ON public.profiles FOR DELETE
-- TO authenticated
-- USING (auth.uid() = user_id);
*/
