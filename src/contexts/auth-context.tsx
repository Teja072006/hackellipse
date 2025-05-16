// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, Provider, SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export interface UserProfile {
  id: string; // UUID from auth.users, also PK of profiles table
  email: string | null;
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
}

// Used for sign-up, ensuring essential fields for profile creation are included.
type SignUpData = {
  name: string;
  age?: number | null;
  gender?: string | null;
  skills?: string | null; // Comma-separated string from form
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: { email: string, password: string }) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data: SignUpData }) => Promise<{ error: AuthError | null; user: User | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'email'>>) => Promise<{ error: AuthError | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (userId: string, userEmail: string | null): Promise<UserProfile | null> => {
    if (!userId || !userEmail) return null;
    console.log("Fetching Supabase profile for user ID:", userId, "with email:", userEmail);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId) // Query by 'id' (UUID) which is PK and FK to auth.users.id
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
        } else if (error.code !== 'PGRST116') { // PGRST116: "Exactly one row expected, but 0 or more rows were returned" (means no profile yet)
          console.error('Error fetching Supabase user profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        } else {
          console.log(`No Supabase profile found for user ${userId}. This is normal for new users or if profile creation is pending/failed.`);
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
            console.warn("Supabase getSession: Invalid refresh token. Treating user as signed out.", JSON.stringify(sessionError, Object.getOwnPropertyNames(sessionError), 2));
            setUser(null);
            setProfile(null);
          } else {
            console.error("Error getting initial Supabase session:", JSON.stringify(sessionError, Object.getOwnPropertyNames(sessionError), 2));
            setUser(null); // Treat other session errors as signed out too for safety
            setProfile(null);
          }
        } else if (session?.user && session.user.email) {
          setUser(session.user);
          const userProfileData = await fetchUserProfile(session.user.id, session.user.email);
          setProfile(userProfileData);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (catchedError: any) {
         console.error("Unexpected critical error in getInitialSession:", JSON.stringify(catchedError, Object.getOwnPropertyNames(catchedError), 2));
         setUser(null);
         setProfile(null);
      }
      setLoading(false);
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true); // Set loading true at the start of state change
        const authUser = session?.user ?? null;
        setUser(authUser); // Update user state immediately

        if (authUser && authUser.id && authUser.email) {
          let userProfileData = null;
          // Always try to fetch profile if user exists, might be outdated or missing.
          userProfileData = await fetchUserProfile(authUser.id, authUser.email);

          if (event === "SIGNED_IN" && !userProfileData) {
            console.log("User signed in, attempting to ensure profile exists.");
            const defaultName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || "New User";
            
            const profileToEnsure: Partial<UserProfile> & { id: string; email: string; name: string } = {
              id: authUser.id,
              email: authUser.email,
              name: defaultName,
              followers_count: 0,
              following_count: 0,
            };

            const { error: ensureProfileError, data: ensuredProfile } = await supabase
              .from('profiles')
              .upsert(profileToEnsure, { onConflict: 'id' })
              .select()
              .single();

            if (ensureProfileError) {
              console.error("Error ensuring profile for OAuth user:", JSON.stringify(ensureProfileError, Object.getOwnPropertyNames(ensureProfileError), 2));
            } else {
              console.log("Profile ensured/created for user.");
              userProfileData = ensuredProfile as UserProfile;
            }
          }
          setProfile(userProfileData);
           if (event === "SIGNED_IN" && (router as any).pathname && ((router as any).pathname === '/login' || (router as any).pathname === '/register')) {
             router.push("/home");
           }

        } else { // No authUser, or missing id/email
          setProfile(null);
          // setUser(null); // Already set to authUser which would be null here
          if (event === "SIGNED_OUT") {
            router.push("/");
          }
        }
        setLoading(false); // Set loading false after all async operations
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, router]); // router is a dependency for navigation

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    // onAuthStateChange will handle user/profile state and navigation
    return { error };
  }, []);

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data: SignUpData }) => {
    setLoading(true);
    const { email, password, options, data: userData } = credentials;

    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { // Data to be stored in auth.users.user_metadata
          name: userData.name,
        }
      }
    });

    if (signUpError) {
      setLoading(false);
      console.error("Supabase Sign-Up error:", JSON.stringify(signUpError, Object.getOwnPropertyNames(signUpError), 2));
      return { error: signUpError, user: null, profile: null };
    }

    const authUser = signUpResponse?.user;
    if (!authUser || !authUser.id || !authUser.email) {
      setLoading(false);
      const missingDataError = { name: "SignUpError", message: "User data (ID or email) not returned after sign up." } as AuthError;
      console.error("Supabase Sign-Up error:", missingDataError.message, "Received user:", authUser);
      return { error: missingDataError, user: null, profile: null };
    }
    
    const profileDataToInsert: UserProfile = {
      id: authUser.id, // This is the UUID from auth.users.id
      email: authUser.email,
      name: userData.name || authUser.email.split('@')[0],
      age: userData.age && !isNaN(Number(userData.age)) ? Number(userData.age) : null,
      gender: userData.gender || null,
      skills: userData.skills ? userData.skills.split(',').map(skill => skill.trim()).filter(skill => skill) : null,
      linkedin_url: userData.linkedin_url || null,
      github_url: userData.github_url || null,
      description: userData.description || null,
      achievements: userData.achievements || null,
      followers_count: 0,
      following_count: 0,
    };
    
    Object.keys(profileDataToInsert).forEach(key => {
      const k = key as keyof UserProfile;
      if (profileDataToInsert[k] === '') { // Ensure empty strings become null if that's preferred for DB
        (profileDataToInsert[k] as any) = null;
      }
    });


    const { error: profileError, data: newProfile } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select()
      .single();

    if (profileError) {
      console.error("Error creating Supabase profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user if profile creation failed, to avoid inconsistent state
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2)));
      setUser(null); 
      setProfile(null); 
      return { error: profileError as any, user: authUser, profile: null };
    }

    setProfile(newProfile as UserProfile); // Optimistically set profile
    setUser(authUser); // Ensure user state is also updated
    setLoading(false);
    // onAuthStateChange might also fire, but good to be explicit.
    // Navigation typically handled by onAuthStateChange or consuming component
    return { error: null, user: authUser, profile: newProfile as UserProfile };
  }, [router]); // Added router dependency for consistency if it were used here

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Google Sign-In, will redirect to:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
      },
    });

    // setLoading(false) might not be hit if redirect happens immediately
    if (error) {
      console.error("Google Sign-In error (Supabase):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Check pop-up blockers & Google Cloud OAuth Consent Screen.`,
        variant: "destructive",
        duration: 10000,
      });
      setLoading(false);
    }
    return { error };
  }, [toast]);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false); // Set loading false after operation
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    } else {
      setUser(null); // Explicitly clear user
      setProfile(null); // Explicitly clear profile
      router.push("/"); // Navigate to home on sign out
    }
    return { error };
  }, [router]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password reset successful. You can now sign in with your new password.` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo,
    });
    setLoading(false);
    if (error) {
      console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'email'>>) => {
    if (!user || !user.id) {
      const authError = { name: "AuthError", message: "User not authenticated." } as AuthError;
      console.error(authError.message);
      return { error: authError, data: null };
    }
    setLoading(true);

    const cleanUpdates: Record<string, any> = {};
    for (const key in updates) {
      if (updates[key as keyof typeof updates] !== undefined) {
        cleanUpdates[key] = updates[key as keyof typeof updates];
      } else {
        cleanUpdates[key] = null; // Explicitly set undefined fields to null for Supabase
      }
    }
    
    if (Object.keys(cleanUpdates).length === 0) {
      setLoading(false);
      console.log("No actual changes to update in profile.");
      return { error: null, data: profile };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(cleanUpdates)
      .eq("id", user.id) // Match by user's auth ID (PK in profiles table)
      .select()
      .single();

    setLoading(false);
    if (error) {
      console.error('Error updating Supabase profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error: error as AuthError, data: null };
    }
    setProfile(data as UserProfile);
    return { error: null, data: data as UserProfile };
  }, [user, profile]); // profile is a dependency here, as we return it if no updates

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
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/*
================================================================================
IMPORTANT: SUPABASE DATABASE SETUP FOR 'profiles' TABLE
================================================================================

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  name TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[],
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL
  -- created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL, -- Removed as per user request
  -- updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL  -- Removed as per user request
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies:
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

================================================================================
SUPABASE GOOGLE SIGN-IN SETUP
================================================================================
1. Supabase Dashboard: Authentication -> Providers -> Enable Google.
2. Provide Client ID & Client Secret from Google Cloud Console.
3. Supabase provides a "Redirect URI" (e.g., https://<project-ref>.supabase.co/auth/v1/callback).
4. Google Cloud Console: APIs & Services -> Credentials -> Your OAuth 2.0 Client ID.
   - "Authorized JavaScript origins": Add your app's URL (e.g., http://localhost:9002).
   - "Authorized redirect URIs": Add the EXACT Redirect URI from Supabase.
================================================================================
*/
