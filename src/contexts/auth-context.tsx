
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// UserProfile interface:
// 'id' is the auto-incrementing BIGSERIAL/INT8 primary key from the 'profiles' table.
// 'user_id' is the UUID from auth.users table, used for RLS owner checks & linking.
export interface UserProfile {
  id?: number; // Auto-incrementing PK from 'profiles' table - will be optional as it's DB generated
  user_id: string; // UUID from auth.users table, this is the link and used for RLS
  email: string; // User's email
  full_name?: string | null; // Changed from 'name' to 'full_name'
  age?: string | null; // Storing as TEXT in DB as per last schema, app converts
  gender?: string | null;
  skills?: string[] | null; // Storing as TEXT[] in Supabase
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  // Removed: resume_file_url, created_at, updated_at, last_login
  followers_count?: number; // Default 0 in DB
  following_count?: number; // Default 0 in DB
}

// Data expected from the registration form
type SignUpFormData = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count'> & {
  full_name: string; // full_name is expected from form
  age?: string; // Age from form as string
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
        // Select all relevant fields, including the auto-incrementing 'id' and the 'user_id' (UUID)
        .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count")
        .eq("user_id", authUserId) // Query by the user_id (UUID) column that links to auth.users
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
        console.log("Supabase onAuthStateChange event:", _event, "session user:", session?.user?.id);
        setLoading(true);
        const authUser = session?.user ?? null;
        setUser(authUser);

        if (authUser && authUser.id && authUser.email) {
          const userProfileData = await fetchUserProfile(authUser.id);
          setProfile(userProfileData);

          if (_event === "SIGNED_IN" && user && user.id !== authUser.id) { // Only push if user actually changed
             console.log("User signed in, pushing to /home");
             router.push("/home");
          } else if (_event === "SIGNED_IN" && !userProfileData && !profile) {
             // This can happen if profile creation is part of the signUp flow but hasn't completed yet
             // or for an OAuth user signing in for the first time where profile creation is deferred.
             console.log("User signed in via OAuth or similar, no profile yet. Profile might be created on demand or via signUp flow.");
             router.push("/home"); // Still go to home, profile page can handle missing profile
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
  }, [fetchUserProfile, router, user, profile]); // Added user and profile to dependencies to re-evaluate on their change, carefully.


  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } else {
       toast({ title: "Login Successful", description: "Welcome back!" });
       // onAuthStateChange will handle navigation
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
        // Supabase Auth user_metadata can store some initial data if needed,
        // but we'll primarily rely on the 'profiles' table.
        data: {
          full_name: userData.full_name, // Example: store full_name in auth.users.user_metadata
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
    
    console.log("Authenticated user from signUp (for profile creation):", JSON.stringify({id: authUser.id, email: authUser.email, user_metadata_full_name: authUser.user_metadata?.full_name}, null, 2));

    // DIAGNOSTIC: Insert only user_id and email
    const profileDataToInsert: Pick<UserProfile, 'user_id' | 'email'> = {
      user_id: authUser.id,
      email: authUser.email!,
    };
    
    // Original fuller data preparation (commented out for diagnostic)
    /*
    let skillsArray: string[] | null = null;
    if (userData.skills && typeof userData.skills === 'string' && userData.skills.trim() !== '') {
      skillsArray = userData.skills.split(',').map(s => s.trim()).filter(s => s);
    }
    
    let ageValue: string | null = null; // Keep as string to match schema text type, or null
    if (userData.age !== undefined && userData.age !== null && String(userData.age).trim() !== '') {
        ageValue = String(userData.age).trim();
    }

    const finalFullName = userData.full_name?.trim() || authUser.user_metadata?.full_name?.trim() || authUser.email!.split('@')[0] || 'New User';

    // Prepare data for 'profiles' table, aligning with UserProfile interface and schema
    // The 'id' (BIGSERIAL PK) column is auto-generated by Supabase, so we don't include it here.
    const profileDataToInsert: Omit<UserProfile, 'id' | 'followers_count' | 'following_count'> & { user_id: string } = {
      user_id: authUser.id, // This is the UUID from auth.users, linking to profiles.user_id
      email: authUser.email!,
      full_name: finalFullName,
      age: ageValue, 
      gender: userData.gender?.trim() || null,
      skills: skillsArray, 
      linkedin_url: userData.linkedin_url?.trim() || null,
      github_url: userData.github_url?.trim() || null,
      description: userData.description?.trim() || null,
      achievements: userData.achievements?.trim() || null,
    };
    */
    
    console.log("Attempting to insert profile into Supabase with data (DIAGNOSTIC - MINIMAL):", JSON.stringify(profileDataToInsert, null, 2));

    const { error: profileError, data: newProfileData } = await supabase
      .from("profiles")
      .insert(profileDataToInsert) // Supabase expects an object or an array of objects
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

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile);
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created." });
    // Navigation handled by onAuthStateChange
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, [router]); // Removed fetchUserProfile as it's not directly called here and to simplify dependencies


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Google Sign-In with Supabase. redirectTo:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { 
          redirectTo,
          // Ensure you have configured Google provider in Supabase dashboard with Client ID & Secret
      }, 
    });
    
    // setLoading(false) will be handled by onAuthStateChange or if error occurs immediately
    if (error) {
      setLoading(false);
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Please check pop-up blockers and Google Cloud/Supabase OAuth configurations.`,
        variant: "destructive",
        duration: 10000,
      });
    }
    // If no immediate error, Supabase handles the redirect. onAuthStateChange will update state.
    return { error };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    // setLoading(false) will be handled by onAuthStateChange
    if (error) {
      setLoading(false); // only set loading false here if error, otherwise onAuthStateChange handles it
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // onAuthStateChange will set user/profile to null and handle router.push("/")
    }
    return { error };
  }, []); // router removed as onAuthStateChange handles it

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/forgot-password?reset=true` : undefined; 
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
       redirectTo, // This URL should be configured in your Supabase project's email templates
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

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email'>>) => {
    if (!user || !user.id || !user.email) { 
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      toast({ title: "Update Failed", description: authError.message, variant: "destructive" });
      return { error: authError, data: null };
    }
    setLoading(true);

    const updatesForSupabase: Record<string, any> = { ...updates }; // Start with all updates

    if (updates.full_name !== undefined) {
        updatesForSupabase.full_name = updates.full_name?.trim() || null;
    }
    if (updates.gender !== undefined) {
        updatesForSupabase.gender = updates.gender?.trim() || null;
    }
    if (updates.linkedin_url !== undefined) {
        updatesForSupabase.linkedin_url = updates.linkedin_url?.trim() || null;
    }
    if (updates.github_url !== undefined) {
        updatesForSupabase.github_url = updates.github_url?.trim() || null;
    }
    if (updates.description !== undefined) {
        updatesForSupabase.description = updates.description?.trim() || null;
    }
    if (updates.achievements !== undefined) {
        updatesForSupabase.achievements = updates.achievements?.trim() || null;
    }
    
    if (updates.age !== undefined) { 
        if (updates.age === null || String(updates.age).trim() === '') {
            updatesForSupabase.age = null;
        } else {
            updatesForSupabase.age = String(updates.age).trim(); // Keep as string for TEXT column
        }
    }

    if (updates.skills !== undefined) { 
        if (updates.skills === null) {
            updatesForSupabase.skills = null;
        } else if (Array.isArray(updates.skills)) {
             updatesForSupabase.skills = updates.skills.map(s => s.trim()).filter(s => s);
        } else if (typeof updates.skills === 'string' && updates.skills.trim() === '') {
            updatesForSupabase.skills = null; // or [] if db column is TEXT[] and allows empty array
        } else if (typeof updates.skills === 'string') {
            updatesForSupabase.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s);
        }
        if (Array.isArray(updatesForSupabase.skills) && updatesForSupabase.skills.length === 0) {
            updatesForSupabase.skills = null; // Store as NULL if empty, or [] if TEXT[] column type
        }
    }
    
    // Remove fields that should not be updated if they are not explicitly in the 'updates' object.
    // This ensures we only send changed data.
    const finalUpdates = Object.keys(updatesForSupabase).reduce((acc, key) => {
      if (updates.hasOwnProperty(key as keyof typeof updates)) {
        acc[key] = updatesForSupabase[key];
      }
      return acc;
    }, {} as Record<string, any>);


    if (Object.keys(finalUpdates).length === 0) {
      setLoading(false);
      toast({ title: "No Changes", description: "No information was changed." });
      return { error: null, data: profile }; // Return current profile if no actual updates
    }
    
    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(finalUpdates, null, 2), "for user_id:", user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(finalUpdates)
      .eq("user_id", user.id) // user.id is the auth.uid(), which should match profiles.user_id (UUID)
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
Example Supabase 'profiles' table schema:
(Ensure your actual table matches the UserProfile interface and application logic)
================================================================================
CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY, -- Auto-incrementing internal ID for the profile row itself
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Foreign key to auth.users.id (this IS the auth user's UUID)
  email TEXT UNIQUE NOT NULL, -- Should match auth.users.email;
  full_name TEXT,             -- Changed from 'name'
  age TEXT,                   -- Changed from INTEGER to TEXT to match user schema screenshot
  gender TEXT,
  skills TEXT[],              -- TEXT ARRAY for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL
  -- removed created_at, updated_at, last_login, resume_file_url as per user request
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies (ensure 'user_id' below refers to your UUID column linked to auth.users):
-- Example for SELECT:
-- CREATE POLICY "Users can view their own profile."
-- ON public.profiles FOR SELECT
-- TO authenticated
-- USING (auth.uid() = user_id);

-- Example for INSERT:
-- CREATE POLICY "Users can insert their own profile."
-- ON public.profiles FOR INSERT
-- TO authenticated
-- WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);

-- Example for UPDATE:
-- CREATE POLICY "Users can update their own profile."
-- ON public.profiles FOR UPDATE
-- TO authenticated
-- USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);
================================================================================
*/
