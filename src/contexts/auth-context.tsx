
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// UserProfile reflects the structure of your 'profiles' table in Supabase.
// 'id' is the auto-incrementing BIGSERIAL/INT8 Primary Key.
// 'user_id' is the UUID from auth.users.id, used for RLS and linking.
export interface UserProfile {
  id?: number; // Auto-incrementing PK from 'profiles' table (e.g., BIGSERIAL)
  user_id: string; // UUID from auth.users.id - THIS IS THE KEY FOR RLS OWNERSHIP & app logic link
  email: string;
  full_name?: string | null;
  age?: number | null; // Stored as INTEGER in DB
  gender?: string | null;
  skills?: string[] | null; // Stored as TEXT[] in DB
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number; // Default 0 in DB
  following_count?: number; // Default 0 in DB
  created_at?: string; // Handled by DB
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
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'created_at' | 'followers_count' | 'following_count'>>) => Promise<{ error: AuthError | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    if (!userId) {
      console.warn("fetchUserProfile called with no userId.");
      return null;
    }
    console.log("Fetching Supabase profile for user_id (auth link):", userId);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at')
        .eq("user_id", userId) // Query by the UUID user_id
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
          console.log(`No Supabase profile found for user_id ${userId}. This is normal for a new user or if profile creation is pending.`);
        } else if (error.code === '406') {
             console.error('Error fetching profile (406 Not Acceptable): This often indicates an RLS issue with your SELECT policy, or requested columns/data format problem.', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }
         else {
          console.error('Error fetching Supabase user profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }
        return null;
      }
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
        } else if (session?.user) {
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

          // Only redirect if the user state actually changed to signed in
          // and not on every auth event (like TOKEN_REFRESHED)
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
  }, [fetchUserProfile, router, user]); // Added user to dependency array to re-evaluate if user changes externally

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
          full_name: userData.full_name?.trim(), // Match UserProfile's 'full_name'
        },
      },
    });
    
    const authUser = signUpResponse?.user;

    if (signUpError || !authUser?.id || !authUser.email) {
      setLoading(false);
      const specificError = signUpError || { name: "SignUpError", message: "User data not returned after sign up or missing id/email." } as AuthError;
      console.error("Supabase Sign-Up error (auth part):", JSON.stringify(specificError, Object.getOwnPropertyNames(specificError), 2));
      toast({ title: "Registration Failed", description: specificError.message, variant: "destructive" });
      return { error: specificError, user: null, profile: null };
    }

    console.log('Authenticated user from Supabase signUp:', { id: authUser.id, email: authUser.email, raw_user_meta_data: authUser.raw_user_meta_data });

    // Minimal insert for diagnostics
    const profileDataToInsert: Pick<UserProfile, 'user_id' | 'email' | 'full_name'> = {
      user_id: authUser.id, // This is the auth.uid()
      email: authUser.email!,
      full_name: userData.full_name?.trim() || authUser.email?.split('@')[0] || 'New User', // Add full_name here as well
    };
    console.log('Attempting to insert profile into Supabase with data (DIAGNOSTIC - MINIMAL):', profileDataToInsert);


    const { error: profileError, data: newProfileData } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select() // Select all columns of the newly inserted row
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user if profile creation failed, to avoid inconsistent state
      // Also, consider if the auth user should be deleted if profile creation is mandatory.
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); 
      setProfile(null);

      if (profileError.code === '42501') { // RLS violation
        toast({
            title: "Profile Creation RLS Error",
            description: "RLS policy violated. Check Supabase 'profiles' table INSERT policy. Crucial checks: 1. Policy is: (auth.uid() = user_id AND auth.jwt()->>'email' = email). 2. 'user_id' in policy MUST be your UUID column linked to auth.users. 3. 'email' in policy MUST be your TEXT column for user's email. 4. No typos in policy or column names. 5. Disable DB triggers for diagnostics.",
            variant: "destructive",
            duration: 20000, // Longer duration for this detailed message
        });
      } else {
        toast({ title: "Profile Creation Failed", description: profileError.message, variant: "destructive" });
      }
      return { error: profileError as any, user: authUser, profile: null };
    }

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile); // Set the full profile from the select
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created." });
    // Navigation to /home is handled by onAuthStateChange
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, [router]); // Added router to useCallback dependencies as it's used


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Supabase Google Sign-In. Final redirectTo for Supabase (after its callback):", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setLoading(false);
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Ensure pop-ups are not blocked. Check Google Cloud OAuth Consent Screen settings (especially 'Test users' if in testing mode).`,
        variant: "destructive",
        duration: 10000,
      });
    }
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
    // User and profile state are cleared by onAuthStateChange which should trigger router.push("/")
    return { error };
  }, [router]); // router is used by onAuthStateChange for redirection

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password-reset-link-sent` : undefined; // Or your update-password page
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
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

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'created_at' | 'followers_count' | 'following_count'>>) => {
    if (!user || !user.id) {
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      toast({ title: "Update Failed", description: authError.message, variant: "destructive" });
      return { error: authError, data: null };
    }
    setLoading(true);

    const updatesForSupabase: Record<string, any> = { ...updates };

    // Handle 'age' (string from form to number for DB)
    if (updates.hasOwnProperty('age')) {
      const ageStr = String(updates.age).trim();
      if (ageStr === '' || updates.age === null || updates.age === undefined) {
          updatesForSupabase.age = null;
      } else {
          const parsedAge = parseInt(ageStr, 10);
          if (!isNaN(parsedAge) && parsedAge > 0) {
              updatesForSupabase.age = parsedAge;
          } else {
              console.warn(`Invalid age value "${updates.age}" provided for update, storing as NULL.`);
              updatesForSupabase.age = null; // Or handle as an error if age is mandatory and invalid
          }
      }
    }

    // Handle 'skills' (comma-separated string from form to string[] for DB)
    if (updates.hasOwnProperty('skills')) {
        if (updates.skills === null || updates.skills === undefined || (typeof updates.skills === 'string' && updates.skills.trim() === '')) {
            updatesForSupabase.skills = null;
        } else if (typeof updates.skills === 'string') {
            const skillsArray = updates.skills.split(',').map(s => s.trim()).filter(s => s);
            updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
        } else if (Array.isArray(updates.skills)) { // Already an array
             const skillsArray = updates.skills.map(s => String(s).trim()).filter(s => s);
             updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
        }
    }
    
    Object.keys(updatesForSupabase).forEach(key => {
        if (updatesForSupabase[key] === undefined) {
            delete updatesForSupabase[key];
        }
    });

    if (Object.keys(updatesForSupabase).length === 0 && !updates.hasOwnProperty('age') && !updates.hasOwnProperty('skills')) { // Check if any actual values to update
      setLoading(false);
      toast({ title: "No Changes", description: "No information was changed." });
      return { error: null, data: profile };
    }
    
    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(updatesForSupabase, null, 2), "for user_id (auth link):", user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(updatesForSupabase)
      .eq("user_id", user.id) // Match based on the auth user's ID (UUID) stored in user_id column
      .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at')
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
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Links to auth.users.id (UUID), used for RLS ownership and app logic link
  email TEXT UNIQUE NOT NULL, -- Should match auth.users.email
  full_name TEXT,
  age INTEGER, -- Stored as INTEGER
  gender TEXT,
  skills TEXT[], -- TEXT ARRAY for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
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

*/
