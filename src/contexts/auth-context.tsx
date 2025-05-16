// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase"; // Using Supabase client

// Define the UserProfile interface according to your Supabase 'profiles' table
// This version assumes 'id' in 'profiles' is a UUID matching auth.users.id and is the PK.
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
  // created_at and updated_at are typically handled by Supabase table defaults
}

// Data passed to signUp for profile creation (excluding id, which comes from auth user)
type SignUpProfileData = Omit<UserProfile, 'id' | 'followers_count' | 'following_count'> & {
  name: string; // Name is required for initial profile
};

interface AuthContextType {
  user: User | null; // Supabase User
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
  const router = useRouter();

  const fetchUserProfile = useCallback(async (authUser: User): Promise<UserProfile | null> => {
    if (!authUser) return null;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id) // Assuming 'id' in profiles is the UUID matching authUser.id
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // "Exactly one row expected, but 0 or more rows were returned" (means no profile yet)
          console.log(`No profile found for user ${authUser.id}. This is normal for new users before profile creation.`);
          return null;
        }
        console.error("Error fetching Supabase user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        return null;
      }
      return data as UserProfile | null;
    } catch (error: any) {
      console.error("Unexpected error in fetchUserProfile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
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
        setUser(session?.user ?? null);
        if (session?.user) {
          const userProfileData = await fetchUserProfile(session.user);
          setProfile(userProfileData);
        } else {
          setProfile(null);
        }
        setLoading(false);
        if (event === "SIGNED_IN" && router.pathname === '/login' || router.pathname === '/register') {
           router.push("/home");
        }
        if (event === "SIGNED_OUT") {
          router.push("/");
        }
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
        // Supabase typically uses user_metadata for this during signup, or you create profile in a separate step
        // For this example, we'll create the profile after successful signup.
        // data: { name: credentials.data.name } // This can be used to pass initial metadata
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }
    
    const authUser = signUpResponse?.user;
    if (!authUser) {
      setLoading(false);
      return { error: { name: "SignUpError", message: "User not returned after sign up." } as AuthError, user: null, profile: null };
    }

    // Create profile in 'profiles' table
    const profileDataToInsert: UserProfile = {
      id: authUser.id, // Crucial: link profile to auth user
      email: authUser.email || credentials.email,
      name: credentials.data.name,
      age: credentials.data.age || null,
      gender: credentials.data.gender || null,
      skills: credentials.data.skills && credentials.data.skills.length > 0 ? credentials.data.skills : null,
      linkedin_url: credentials.data.linkedin_url || null,
      github_url: credentials.data.github_url || null,
      description: credentials.data.description || null,
      achievements: credentials.data.achievements || null,
      followers_count: 0,
      following_count: 0,
    };

    const { error: profileError, data: newProfile } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select()
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Optionally, attempt to delete the auth user if profile creation fails to keep things clean
      // await supabase.auth.admin.deleteUser(authUser.id); // Requires admin privileges, usually not done client-side
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
      },
    });
    setLoading(false); // signInWithOAuth redirects, so loading state change here is brief
    if (error) {
      return { error };
    }
    return { error: null };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      return { error };
    }
    // onAuthStateChange handles user/profile state and navigation
    return { error: null };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password reset successful. You can now sign in with your new password.` : undefined,
    });
    setLoading(false);
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'email'>>) => {
    if (!user) {
      return { error: { name: "AuthError", message: "User not authenticated." } as AuthError, data: null };
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id) // Assuming 'id' in profiles is the UUID matching user.id
      .select()
      .single();
    
    setLoading(false);
    if (error) {
      console.error('Error updating Supabase profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error, data: null };
    }
    setProfile(data as UserProfile);
    return { error: null, data: data as UserProfile };
  }, [user]);

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

Example SQL to create the 'profiles' table:

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  name TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- Array of text for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Function to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies:
-- 1. Allow users to read their own profile
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 2. Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 3. Allow users to update their own profile
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- (Optional) Allow public read access to certain profile fields if needed
-- CREATE POLICY "Public can read basic profile info."
-- ON public.profiles FOR SELECT
-- TO public -- or 'anon' if you want unauthenticated users too
-- USING (true); -- Be careful with this, only expose what should be public.
--                 You would typically create a database VIEW for public profiles.

================================================================================
GOOGLE SIGN-IN SETUP WITH SUPABASE
================================================================================
1. In your Supabase Dashboard: Go to Authentication -> Providers.
2. Enable Google.
3. Supabase will provide a "Redirect URI" (e.g., https://<your-project-ref>.supabase.co/auth/v1/callback).
4. In your Google Cloud Console (for the project associated with your OAuth Client ID/Secret):
   - Go to APIs & Services -> Credentials.
   - Select your OAuth 2.0 Client ID for Web applications.
   - Under "Authorized JavaScript origins", add your app's URL (e.g., http://localhost:9002, your production URL).
   - Under "Authorized redirect URIs", add the exact Redirect URI provided by Supabase.
   - Save changes.
   - You will need to provide the Client ID and Client Secret from Google Cloud Console to Supabase in its Google provider settings.
================================================================================
*/
