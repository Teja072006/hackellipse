
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, Provider, SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export interface UserProfile {
  id?: number; // Auto-incrementing BIGINT Primary Key from profiles table
  user_id: string; // UUID from auth.users table, stored in 'user_id' column of profiles table
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
  // Removed: created_at, updated_at, last_login as per user request
}

// Data expected from the registration form for profile creation
// 'id' (auto-incrementing) and 'user_id' (auth link) are handled by the backend/context.
type SignUpProfileData = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count'> & {
  full_name: string; // Making full_name required for initial profile
  skills?: string; // Skills come as a comma-separated string from the form
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
        .eq("user_id", authUserId) // Query by the user_id (UUID) column
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
          console.log(`No Supabase profile found for user_id ${authUserId}. This is normal for a new user before profile creation or if using OAuth and profile creation is pending.`);
        } else if (error.code === '42703') { // Column does not exist
           console.error('Error fetching Supabase profile (Column Mismatch):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2), "Ensure 'profiles' table has all selected columns: id, user_id, email, full_name, etc.");
        }
         else {
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
          if (event === "SIGNED_IN" && !userProfileData) {
            console.log("User signed in (possibly OAuth/new), creating profile in Supabase for user_id:", authUser.id);
            const defaultFullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || "New User";
            
            const profileToCreate: Omit<UserProfile, 'id'> = { // 'id' (BIGSERIAL) is auto-generated by the database
              user_id: authUser.id, // This is the UUID from auth.users
              email: authUser.email,
              full_name: defaultFullName,
              followers_count: 0,
              following_count: 0,
              // other fields default to null or empty array as per schema
              age: null,
              gender: null,
              skills: [],
              linkedin_url: null,
              github_url: null,
              description: null,
              achievements: null,
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
          if (event === "SIGNED_IN" && router && (router as any).pathname && ((router as any).pathname === '/login' || (router as any).pathname === '/register')) {
             // router.push("/home"); // Temporarily disabled for RLS debugging
           }
        } else {
          setProfile(null);
          if (event === "SIGNED_OUT" && router) {
            // router.push("/"); // Temporarily disabled for RLS debugging
          }
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, router]); // `router` dependency may not be strictly needed if navigation is handled elsewhere or conditionally

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return { error };
  }, []);

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data: SignUpProfileData }) => {
    setLoading(true);
    const { email, password, options, data: userData } = credentials;

    // Step 1: Sign up the user with Supabase Auth
    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: userData.full_name } } // Pass metadata to auth if needed, e.g., for email templates
    });

    if (signUpError) {
      setLoading(false);
      console.error("Supabase Sign-Up error (auth part):", JSON.stringify(signUpError, Object.getOwnPropertyNames(signUpError), 2));
      return { error: signUpError, user: null, profile: null };
    }

    const authUser = signUpResponse?.user;
    if (!authUser || !authUser.id || !authUser.email) {
      setLoading(false);
      const err = { name: "SignUpError", message: "Supabase user data (ID or email) not returned after sign up." } as AuthError;
      console.error(err.message, "Received Supabase user:", authUser);
      return { error: err, user: null, profile: null };
    }
    
    // Step 2: Create the profile in the 'profiles' table
    const profileDataToInsert: Omit<UserProfile, 'id'> & { user_id: string } = {
      user_id: authUser.id, // This is the UUID from auth.users.id
      email: authUser.email,
      full_name: userData.full_name || authUser.email.split('@')[0],
      age: userData.age && !isNaN(Number(userData.age)) && Number(userData.age) > 0 ? Number(userData.age) : null,
      gender: userData.gender?.trim() || null,
      skills: userData.skills ? userData.skills.split(',').map(skill => skill.trim()).filter(skill => skill) : [],
      linkedin_url: userData.linkedin_url?.trim() || null,
      github_url: userData.github_url?.trim() || null,
      description: userData.description?.trim() || null,
      achievements: userData.achievements?.trim() || null,
      followers_count: 0, // Defaulted by DB, but good to be explicit
      following_count: 0, // Defaulted by DB, but good to be explicit
    };
    
    // Clean up empty strings to null for optional text fields
    (Object.keys(profileDataToInsert) as Array<keyof typeof profileDataToInsert>).forEach(key => {
      if (typeof profileDataToInsert[key] === 'string' && (profileDataToInsert[key] as string).trim() === '' && 
          ['age', 'skills', 'followers_count', 'following_count', 'user_id', 'email', 'full_name'].indexOf(key) === -1) {
        (profileDataToInsert as any)[key] = null;
      }
    });

    console.log("Attempting to insert profile into Supabase:", profileDataToInsert);
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
      return { error: profileError as any, user: authUser, profile: null };
    }

    setProfile(newProfile as UserProfile);
    setLoading(false);
    // router.push("/home"); // Temporarily disabled
    return { error: null, user: authUser, profile: newProfile as UserProfile };
  }, []); 

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Initiating Google Sign-In with Supabase. RedirectTo:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Check console. Ensure popups are allowed. Verify Google Cloud OAuth Consent Screen (test users, publishing status) & Supabase Google provider config (Client ID, Secret, Redirect URI).`,
        variant: "destructive",
        duration: 10000,
      });
    }
    // setLoading(false) is often not hit here due to redirect
    return { error };
  }, [toast]); // Assuming toast is stable or add to dependencies if needed

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    } else {
      setUser(null);
      setProfile(null);
      // router.push("/"); // Temporarily disabled
    }
    return { error };
  }, []); // router removed as dependency for now

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    // For password reset, Supabase handles the redirect URL configuration in its dashboard (Authentication > Email Templates)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // redirectTo: `${window.location.origin}/reset-password-confirm-page` // Example, ensure this page exists
    });
    setLoading(false);
    if (error) console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email'>>) => {
    if (!user || !user.id) {
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      return { error: authError, data: null };
    }
    setLoading(true);

    const cleanUpdates: Record<string, any> = {};
    for (const key in updates) {
      const typedKey = key as keyof typeof updates;
      if (updates[typedKey] === undefined) {
        cleanUpdates[key] = null;
      } else if (typedKey === 'skills' && typeof updates.skills === 'string') {
        cleanUpdates.skills = (updates.skills as string).split(',').map(s => s.trim()).filter(s => s);
      } else {
        cleanUpdates[key] = updates[typedKey];
      }
    }
    
    if (Object.keys(cleanUpdates).length === 0) {
      setLoading(false);
      console.log("No actual changes to update in Supabase profile.");
      return { error: null, data: profile };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(cleanUpdates)
      .eq("user_id", user.id) // Update using the user_id (UUID)
      .select("id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count")
      .single();

    setLoading(false);
    if (error) {
      console.error('Error updating Supabase profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error: error as AuthError, data: null };
    }
    setProfile(data as UserProfile);
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
================================================================================
SUPABASE DATABASE 'profiles' TABLE SCHEMA (Example based on user description)
================================================================================
CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY, -- Auto-incrementing integer primary key (as per user)
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Links to auth.users table (UUID)
  email TEXT UNIQUE NOT NULL, -- Should match auth.users.email
  full_name TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- Array of text for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL
  -- created_at, updated_at, last_login removed as per user request
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

-- Optional: Allow authenticated users to view limited public info of other profiles
-- CREATE POLICY "Authenticated users can view limited public profile information."
-- ON public.profiles FOR SELECT
-- TO authenticated
-- USING (true); -- Adjust columns selected in your app's Supabase queries for public views.
================================================================================
*/
