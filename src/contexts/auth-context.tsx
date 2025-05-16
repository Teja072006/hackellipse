// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, Provider, SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export interface UserProfile {
  user_id: string; // UUID from auth.users, also PK of profiles table
  email: string | null; // Should be synced with auth.users.email
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null; // Stored as TEXT[] in Supabase
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
}

// Data expected from the registration form for profile creation
type SignUpProfileData = Omit<UserProfile, 'user_id' | 'email' | 'followers_count' | 'following_count'> & {
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
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'user_id' | 'email'>>) => Promise<{ error: AuthError | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    if (!userId) {
        console.log("fetchUserProfile called with no userId.");
        return null;
    }
    console.log("Fetching Supabase profile for user_id:", userId);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId) // Query by user_id (UUID, PK)
        .single();

      if (error) {
        if (error.message.toLowerCase().includes('failed to fetch')) {
          console.error(
            'Error fetching profile (Network Issue - Failed to fetch with Supabase):',
            'This usually means the application could not reach the Supabase server. Please double-check:',
            '1. Your NEXT_PUBLIC_SUPABASE_URL in the .env file.',
            '2. Your NEXT_PUBLIC_SUPABASE_ANON_KEY in the .env file.',
            '3. Your internet connection and any firewalls/proxies.',
            'Detailed error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
          );
        } else if (error.code === 'PGRST116') { // PGRST116: "Exactly one row expected..." (no profile)
          console.log(`No Supabase profile found for user_id ${userId}. This is normal for new users or if profile creation is pending/failed.`);
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

          if (event === "SIGNED_IN" && !userProfileData) {
            console.log("User signed in (possibly OAuth/new), ensuring profile exists in Supabase.");
            const defaultName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || "New User";
            
            const profileToEnsure: UserProfile = {
              user_id: authUser.id, // PK, matches auth.users.id
              email: authUser.email,
              name: defaultName,
              followers_count: 0,
              following_count: 0,
              age: null,
              gender: null,
              skills: [],
              linkedin_url: null,
              github_url: null,
              description: null,
              achievements: null,
            };

            const { error: ensureProfileError, data: ensuredProfile } = await supabase
              .from('profiles')
              .upsert(profileToEnsure, { onConflict: 'user_id' })
              .select()
              .single();

            if (ensureProfileError) {
              console.error("Error ensuring/creating Supabase profile for user:", JSON.stringify(ensureProfileError, Object.getOwnPropertyNames(ensureProfileError), 2));
            } else {
              console.log("Supabase profile ensured/created for user:", authUser.id);
              userProfileData = ensuredProfile as UserProfile;
            }
          }
          setProfile(userProfileData);
           if (event === "SIGNED_IN" && (router as any).pathname && ((router as any).pathname === '/login' || (router as any).pathname === '/register')) {
             router.push("/home");
           }
        } else {
          setProfile(null);
          if (event === "SIGNED_OUT") {
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
    if (error) console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return { error };
  }, []);

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data: SignUpProfileData }) => {
    setLoading(true);
    const { email, password, options, data: userData } = credentials;

    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: userData.name } } 
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
    
    const profileDataToInsert: UserProfile = {
      user_id: authUser.id,
      email: authUser.email,
      name: userData.name || authUser.email.split('@')[0],
      age: userData.age && !isNaN(Number(userData.age)) ? Number(userData.age) : null,
      gender: userData.gender || null,
      skills: userData.skills ? userData.skills.split(',').map(skill => skill.trim()).filter(skill => skill) : [],
      linkedin_url: userData.linkedin_url || null,
      github_url: userData.github_url || null,
      description: userData.description || null,
      achievements: userData.achievements || null,
      followers_count: 0,
      following_count: 0,
    };
    
    Object.keys(profileDataToInsert).forEach(key => {
        const k = key as keyof UserProfile;
        if (profileDataToInsert[k] === '') (profileDataToInsert[k] as any) = null;
        if (k === 'skills' && !profileDataToInsert[k]) profileDataToInsert[k] = [];
      });


    const { error: profileError, data: newProfile } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select()
      .single();

    if (profileError) {
      console.error("Error creating Supabase profile during signup (db part):", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user if profile creation failed, to avoid inconsistent state
      await supabase.auth.signOut().catch(e => console.error("Error signing out Supabase user after profile creation failure:", e));
      setUser(null); 
      setProfile(null); 
      return { error: profileError as any, user: authUser, profile: null };
    }

    setProfile(newProfile as UserProfile);
    // setUser(authUser); // onAuthStateChange will handle this.
    setLoading(false);
    return { error: null, user: authUser, profile: newProfile as UserProfile };
  }, [router]); // router removed from deps if not used for nav here

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Supabase Google Sign-In, redirect URL for Supabase options:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Ensure popups are enabled. Check Google Cloud OAuth Consent Screen & Supabase Google Provider config.`,
        variant: "destructive",
        duration: 10000,
      });
      setLoading(false); // setLoading false only if error, as success means redirect
    }
    // On success, Supabase handles redirect, so loading might not be set to false here.
    return { error };
  }, [toast]); // router removed from deps

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    else {
      setUser(null);
      setProfile(null);
      router.push("/");
    }
    return { error };
  }, [router]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password reset successful. You can now sign in with your new password.` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'user_id' | 'email'>>) => {
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
      .eq("user_id", user.id) // Match by user_id (PK)
      .select()
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
SUPABASE DATABASE 'profiles' TABLE SCHEMA (for user_id as UUID PK from auth.users.id)
================================================================================
CREATE TABLE public.profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL, -- Ensures email from auth is synced and unique
  name TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- Array of text for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies:
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND auth.jwt()->>'email' = email);
================================================================================
*/
