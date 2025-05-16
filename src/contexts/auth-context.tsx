
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// UserProfile reflects the structure of your 'profiles' table in Supabase
export interface UserProfile {
  id?: number; // Your auto-incrementing BIGSERIAL/INT8 Primary Key for the profiles table itself
  user_id: string; // UUID from auth.users.id, used for RLS and linking
  email: string; // User's email
  full_name?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null; // Stored as TEXT[] in Supabase
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  // created_at is handled by DB default, removed from here
}

// Data expected from the registration form for profile details
// This is slightly different from UserProfile as form might send age/skills as strings
type SignUpProfileData = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count'> & {
  full_name: string; // full_name is mandatory from the form
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
        setLoading(true); // Ensure loading is true while processing auth state
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
            router.push("/"); // Redirect to landing on sign out
          }
        }
        setLoading(false);
      }
    );
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, router]); // Removed 'user' from dependencies to avoid potential loops. fetchUserProfile and router are stable.

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
        data: { // Data to be stored in auth.users.raw_user_meta_data
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
    console.log('Authenticated user from signUp:', { id: authUser.id, email: authUser.email, raw_user_meta_data: authUser.raw_user_meta_data });

    // DIAGNOSTIC: Minimal profile insert
    const profileDataToInsert: Pick<UserProfile, 'user_id' | 'email'> = {
      user_id: authUser.id,
      email: authUser.email!,
    };
    
    console.log("Attempting to insert profile into Supabase with data (DIAGNOSTIC - MINIMAL):", profileDataToInsert);

    const { error: profileError, data: newProfileData } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count") // Select all fields expected by UserProfile (excluding created_at)
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user if profile creation failed, to avoid inconsistent state
      // Also, consider if the auth user should be deleted if profile creation is mandatory.
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); 
      setProfile(null); // Clear profile state
      toast({ title: "Profile Creation Failed", description: profileError.message, variant: "destructive" });
      return { error: profileError as any, user: authUser, profile: null };
    }

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile); // Set full profile after successful insertion
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created." });
    // Navigation to /home is handled by onAuthStateChange
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, [router, fetchUserProfile]); // Added fetchUserProfile as it's used indirectly by onAuthStateChange

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    // The redirectTo URL should point to a page in your app that can handle the auth callback,
    // or simply your home page if Supabase handles the session persistence correctly on redirect.
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Supabase Google Sign-In. redirectTo:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    // setLoading(false) might not be reached if OAuth redirects.
    // onAuthStateChange will handle setting user and loading state upon successful redirect.
    if (error) {
      setLoading(false);
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Ensure pop-ups are not blocked and check your Google Cloud OAuth Consent screen configuration (especially if in 'testing' mode, add test users).`,
        variant: "destructive",
        duration: 10000,
      });
    }
    // If no error, Supabase handles the redirect. User state will be updated by onAuthStateChange.
    return { error };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false); // Set loading false after sign out attempt
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // User and profile state are cleared by onAuthStateChange
    }
    return { error };
  }, [router]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    // Supabase handles the redirect URL configuration in its dashboard for password resets.
    // You can specify a redirectTo here if you want to override the dashboard settings.
    // const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email /*, { redirectTo }*/);
    setLoading(false);
    if (error) {
      console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset Email Sent", description: "If an account exists for this email, you'll receive instructions to reset your password." });
    }
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email'>>) => {
    if (!user || !user.id || !user.email) {
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
        }
    }

    if (updates.hasOwnProperty('skills')) {
        if (updates.skills === null || updates.skills === undefined) {
            updatesForSupabase.skills = null;
        } else if (Array.isArray(updates.skills)) {
            updatesForSupabase.skills = updates.skills.map(s => String(s).trim()).filter(s => s);
            if (updatesForSupabase.skills.length === 0) updatesForSupabase.skills = null;
        } else if (typeof updates.skills === 'string') { // From form
            updatesForSupabase.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s);
            if (updatesForSupabase.skills.length === 0) updatesForSupabase.skills = null;
        }
    }
    
    // Remove fields that should not be directly updated or are typed differently for update
    if (updatesForSupabase.age === undefined) delete updatesForSupabase.age;
    if (updatesForSupabase.skills === undefined) delete updatesForSupabase.skills;


    if (Object.keys(updatesForSupabase).length === 0) {
      setLoading(false);
      toast({ title: "No Changes", description: "No information was changed." });
      return { error: null, data: profile };
    }
    
    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(updatesForSupabase, null, 2), "for user_id:", user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(updatesForSupabase)
      .eq("user_id", user.id) // Match based on the auth user's ID (UUID)
      .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count")
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
Example Supabase 'profiles' table schema to align with this context:
(Primary Key is 'user_id' which is the UUID from auth.users.id)

CREATE TABLE public.profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- Links to auth.users.id
  email TEXT UNIQUE NOT NULL,                 -- Should match auth.users.email, unique constraint helps
  full_name TEXT,
  age INTEGER,                                -- Store age as a number
  gender TEXT,
  skills TEXT[],                              -- TEXT ARRAY for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  -- If you need an auto-incrementing internal ID for other purposes, add it as 'profile_pk_id BIGSERIAL' for example.
  -- The 'id' field in UserProfile in the app can map to this if needed, or be removed if not used.
  -- For simplicity, if user_id is PK, UserProfile.id can be removed or remapped.
  -- The UserProfile above maps its 'id' to an auto-incrementing 'id' from profiles,
  -- and 'user_id' to the auth link. Ensure your table matches this.
);

-- RLS POLICIES (ensure 'user_id' refers to the UUID column linked to auth.users):
-- Enable RLS on the table first in Supabase UI or with: ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT Policy:
-- CREATE POLICY "Users can view their own profile."
-- ON public.profiles AS PERMISSIVE FOR SELECT
-- TO authenticated
-- USING (auth.uid() = user_id);

-- INSERT Policy:
-- CREATE POLICY "Users can insert their own profile."
-- ON public.profiles AS PERMISSIVE FOR INSERT
-- TO authenticated
-- WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);

-- UPDATE Policy:
-- CREATE POLICY "Users can update their own profile."
-- ON public.profiles AS PERMISSIVE FOR UPDATE
-- TO authenticated
-- USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);
*/

    