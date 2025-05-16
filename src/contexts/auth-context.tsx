// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
// import { useRouter } from "next/navigation"; // Temporarily removed for diagnosing SSR issues
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

type SignUpProfileData = Omit<UserProfile, 'id' | 'followers_count' | 'following_count'> & {
  name: string;
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: { email: string, password: string }) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: { email: string, password: string, data: SignUpProfileData }) => Promise<{ error: AuthError | null; user: User | null; profile: UserProfile | null }>;
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
  // const router = useRouter(); // Temporarily removed

  const fetchUserProfile = useCallback(async (authUser: User): Promise<UserProfile | null> => {
    if (!authUser) return null;
    console.log("Fetching profile for user:", authUser.id, "with email:", authUser.email);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id) // Using the 'id' (UUID) from auth.users as the foreign key in profiles
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
        } else if (error.code === 'PGRST116') { // "Exactly one row expected, but 0 or more rows were returned" (means no profile yet)
          console.log(`No Supabase profile found for user ${authUser.id}. This is normal for new users before profile creation.`);
        } else {
          console.error('Error fetching Supabase user profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }
        return null;
      }
      console.log("Profile fetched successfully:", data);
      return data as UserProfile | null;
    } catch (error: any) {
      console.error("Unexpected error in fetchUserProfile (Supabase):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return null;
    }
  }, []);


  useEffect(() => {
    const getInitialSession = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        const userProfileData = await fetchUserProfile(session.user);
        setProfile(userProfileData);
      }
      setLoading(false);
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true);
        const authUser = session?.user ?? null;
        setUser(authUser);
        if (authUser) {
          const userProfileData = await fetchUserProfile(authUser);
          setProfile(userProfileData);
          if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
            // Check if profile exists, if not, create one for OAuth users if it's their first time
            // This is especially for users signing in via OAuth who might not have a profile row yet.
            if (!userProfileData && (event === "SIGNED_IN")) {
              console.log("User signed in (OAuth likely), attempting to ensure profile exists.");
              const defaultName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || "New User";
              const profileToEnsure: UserProfile = {
                id: authUser.id, // UUID from auth.users
                email: authUser.email || null,
                name: defaultName,
                // Initialize other fields as null or default
                age: null,
                gender: null,
                skills: null,
                linkedin_url: null,
                github_url: null,
                description: null,
                achievements: null,
                followers_count: 0,
                following_count: 0,
              };
              const { error: ensureProfileError } = await supabase
                .from('profiles')
                .upsert(profileToEnsure, { onConflict: 'id' }) // Upsert to avoid error if profile was created just moments ago
                .select()
                .single();

              if (ensureProfileError) {
                console.error("Error ensuring profile for OAuth user:", JSON.stringify(ensureProfileError, Object.getOwnPropertyNames(ensureProfileError), 2));
              } else {
                console.log("Profile ensured/created for OAuth user.");
                // Re-fetch profile after upsert
                const updatedProfile = await fetchUserProfile(authUser);
                setProfile(updatedProfile);
              }
            }
            // Temporarily removed router.push to diagnose SSR errors
            // if (router.pathname === '/login' || router.pathname === '/register') {
            // router.push("/home");
            // }
          }
        } else {
          setProfile(null);
          // if (event === "SIGNED_OUT") {
          // router.push("/");
          // }
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile /*, router */]); // router removed temporarily

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error };
    }
    // onAuthStateChange will handle user/profile state and navigation
    return { error: null };
  }, []);

  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpProfileData }) => {
    setLoading(true);
    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          name: credentials.data.name, // Pass name in options.data for potential use in auth.users.user_metadata
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

    console.log("User signed up, authUser.id:", authUser.id, "authUser.email:", authUser.email);

    const profileDataToInsert: UserProfile = {
      id: authUser.id, // This is the UUID from auth.users.id
      email: authUser.email,
      name: credentials.data.name || authUser.email.split('@')[0],
      age: credentials.data.age && !isNaN(Number(credentials.data.age)) ? Number(credentials.data.age) : null,
      gender: credentials.data.gender || null,
      skills: credentials.data.skills && credentials.data.skills.length > 0 ? credentials.data.skills : null,
      linkedin_url: credentials.data.linkedin_url || null,
      github_url: credentials.data.github_url || null,
      description: credentials.data.description || null,
      achievements: credentials.data.achievements || null,
      followers_count: 0,
      following_count: 0,
    };

    console.log("Attempting to insert profile data:", JSON.stringify(profileDataToInsert, null, 2));

    const { error: profileError, data: newProfile } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select()
      .single();

    if (profileError) {
      console.error("Error creating Supabase profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user if profile creation failed, to avoid inconsistent state
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); // Clear user state
      setProfile(null); // Clear profile state
      return { error: profileError as any, user: authUser, profile: null };
    }

    setProfile(newProfile as UserProfile);
    setLoading(false);
    // onAuthStateChange handles setting user and navigation typically
    return { error: null, user: authUser, profile: newProfile as UserProfile };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Google Sign-In with redirectTo:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
        // Optional: specify scopes if needed, e.g., ['profile', 'email']
        // scopes: 'profile email',
      },
    });

    if (error) {
      console.error("Google Sign-In error (Supabase):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Please check pop-up blockers or your Google OAuth Consent Screen settings if this persists.`,
        variant: "destructive",
        duration: 9000,
      });
      setLoading(false);
      return { error };
    }
    // On success, Supabase redirects; setLoading(false) might be handled by onAuthStateChange or page load.
    // It's generally okay to not set setLoading(false) here if a redirect is imminent.
    return { error: null };
  }, [toast]);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error };
    }
    // onAuthStateChange handles user/profile state and navigation
    return { error: null };
  }, []);

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
    if (!user || !user.email) { // Check for user.email as well since it's used in the query
      const authError = { name: "AuthError", message: "User not authenticated or email missing." } as AuthError;
      console.error(authError.message);
      return { error: authError, data: null };
    }
    setLoading(true);

    // Filter out any fields that are undefined, as Supabase might not like them in an update
    const cleanUpdates: Record<string, any> = {};
    for (const key in updates) {
      if (updates[key as keyof typeof updates] !== undefined) {
        cleanUpdates[key] = updates[key as keyof typeof updates];
      }
    }
    
    if (Object.keys(cleanUpdates).length === 0) {
      setLoading(false);
      console.log("No actual changes to update in profile.");
      return { error: null, data: profile }; // Return current profile if no changes
    }


    const { data, error } = await supabase
      .from("profiles")
      .update(cleanUpdates)
      .eq("id", user.id) // Match by user's auth ID, which is the PK in profiles table
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
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/*
================================================================================
IMPORTANT: SUPABASE DATABASE SETUP FOR 'profiles' TABLE
================================================================================

You need to create a 'profiles' table in your Supabase project.
The primary key 'id' of this table should be a UUID that references 'auth.users.id'.

Example SQL to create the 'profiles' table (ensure 'id' is PK and links to auth.users):

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE, -- Should match auth.users.email, can be useful for lookups if needed
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
  -- created_at and updated_at are automatically handled by Supabase if table settings are default
  -- or can be added with DEFAULT NOW() and a trigger for updated_at if preferred.
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies:
-- 1. Allow users to read their own profile
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id); -- 'id' here refers to the 'id' column in 'profiles' table

-- 2. Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id); -- 'id' here refers to the 'id' column in 'profiles' table

-- 3. Allow users to update their own profile
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id); -- 'id' here refers to the 'id' column in 'profiles' table


================================================================================
SUPABASE GOOGLE SIGN-IN SETUP
================================================================================
1. In your Supabase Dashboard: Go to Authentication -> Providers.
2. Enable Google.
3. Supabase will provide a "Redirect URI" (e.g., https://<your-project-ref>.supabase.co/auth/v1/callback).
4. In your Google Cloud Console (for the project associated with your OAuth Client ID/Secret):
   - Go to APIs & Services -> Credentials.
   - Select your OAuth 2.0 Client ID for Web applications.
   - Under "Authorized JavaScript origins", add your app's URL (e.g., http://localhost:9002 for dev, your production URL).
   - Under "Authorized redirect URIs", add the exact Redirect URI provided by Supabase.
   - Save changes.
   - You will need to provide the Client ID and Client Secret from Google Cloud Console to Supabase in its Google provider settings.
================================================================================
*/
