
// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, Session, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
// import { useRouter } from "next/navigation"; // Temporarily commented for diagnosis

// Define a shape for your user profile data stored in Supabase
export interface UserProfile {
  id: number; // Auto-incrementing integer primary key
  user_id: string; // UUID from auth.users, for linking
  name?: string | null;
  email: string; // Primary Key, from auth.users
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count: number; // Should default to 0 in DB
  following_count: number; // Should default to 0 in DB
}

interface AuthContextType {
  user: SupabaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email' | 'user_id' | 'followers_count' | 'following_count'>> }) => Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'email' | 'user_id'>>) => Promise<{ error: any | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // const router = useRouter(); // Still commented out

  const fetchUserProfile = useCallback(async (userEmail: string): Promise<UserProfile | null> => {
    if (!userEmail) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, name, email, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .eq('email', userEmail)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: "Exactly one row expected, but 0 or more rows were returned" (means no profile yet)
      console.error('Error fetching profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return null;
    }
    return data as UserProfile | null;
  }, []);

  useEffect(() => {
    setLoading(true);
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser && currentUser.email) {
        const userProfile = await fetchUserProfile(currentUser.email);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    };
    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        setLoading(true);
        const currentUser = session?.user ?? null;
        const localUser = user;

        if (currentUser?.id !== localUser?.id || currentUser?.email !== localUser?.email) {
          setUser(currentUser);
          if (currentUser && currentUser.email) {
            const userProfileData = await fetchUserProfile(currentUser.email);
            setProfile(userProfileData);
          } else {
            setProfile(null);
          }
        } else if (currentUser && currentUser.email && !profile) {
            const userProfileData = await fetchUserProfile(currentUser.email);
            setProfile(userProfileData);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile]);


  const signInUser = useCallback(async (credentials: SignInWithPasswordCredentials): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (data.user && data.user.email) {
      setUser(data.user);
      const userProfileData = await fetchUserProfile(data.user.email);
      setProfile(userProfileData);
    } else {
      setUser(null);
      setProfile(null);
    }
    setLoading(false);
    return { error };
  }, [fetchUserProfile]);

  const signUpUser = useCallback(async (
    credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email'| 'user_id' | 'followers_count' | 'following_count'>> }
  ): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          name: credentials.data?.name?.trim() || credentials.email,
        }
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }
    
    console.log("authUser from signUp:", JSON.stringify(authUser, null, 2));

    if (!authUser || !authUser.id || !authUser.email) {
        setLoading(false);
        console.error("SignUp succeeded but Supabase user object is incomplete (missing id or email).", authUser);
        await supabase.auth.signOut().catch(e => console.error("Error signing out user after incomplete user object from signUp:", e));
        return { error: { name: "IncompleteUserError", message: "User created in auth but essential info (id/email) missing from returned object." } as AuthError, user: null, profile: null };
    }
    
    const profileDataToInsert: Omit<UserProfile, 'id' | 'followers_count' | 'following_count'> & { followers_count?: number, following_count?: number } = {
      user_id: authUser.id, // Link to auth.users table
      email: authUser.email,
      name: (credentials.data?.name?.trim()) || (authUser.user_metadata?.name) || authUser.email,
      // Optional fields based on credentials.data
      age: credentials.data?.age ? (Number.isFinite(Number(credentials.data.age)) && Number(credentials.data.age) > 0 ? Number(credentials.data.age) : null) : null,
      gender: credentials.data?.gender?.trim() || null,
      skills: credentials.data?.skills && Array.isArray(credentials.data.skills) && credentials.data.skills.filter(s => s.trim()).length > 0 ? credentials.data.skills.filter(s => s.trim()) : null,
      linkedin_url: credentials.data?.linkedin_url?.trim() || null,
      github_url: credentials.data?.github_url?.trim() || null,
      description: credentials.data?.description?.trim() || null,
      achievements: credentials.data?.achievements?.trim() || null,
    };
    
    Object.keys(profileDataToInsert).forEach(key => {
        const k = key as keyof typeof profileDataToInsert;
        if (profileDataToInsert[k] === undefined) {
            delete profileDataToInsert[k];
        }
    });

    console.log("Attempting to insert profile with data:", JSON.stringify(profileDataToInsert, null, 2));

    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert(profileDataToInsert as any) // Cast as any to handle potential followers/following defaults
      .select('id, user_id, name, email, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null);
      setProfile(null);
      return { error: profileError as any, user: authUser, profile: null };
    }

    setProfile(newProfile as UserProfile);
    setUser(authUser);
    setLoading(false);
    return { error: null, user: authUser, profile: newProfile as UserProfile };

  }, []);


  const signInWithGoogleUser = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) {
      setLoading(false);
      console.error("Google Sign-In Error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    return { error };
  }, []);

  const signOutUserFunc = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    // if (router) router.push('/login'); // Re-enable if router is confirmed not to be the issue
    return { error };
  }, []); 

  const sendPasswordResetEmail = useCallback(async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password reset link sent. Check your email.` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    return { error };
  }, []);

  const updateUserProfileFunc = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'email' | 'user_id'>>): Promise<{ error: any | null; data: UserProfile | null }> => {
    if (!user || !user.email) {
      return { error: { message: "User not authenticated or email missing." }, data: null };
    }
    setLoading(true);
    let processedUpdates: Partial<Omit<UserProfile, 'id' | 'email' | 'user_id'>> = { ...updates };

    if (updates.skills) {
        if (typeof updates.skills === 'string') {
            processedUpdates.skills = (updates.skills as string).split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
        } else if (Array.isArray(updates.skills)) {
            processedUpdates.skills = updates.skills.filter(s => typeof s === 'string' && s.trim().length > 0);
        }
        if (processedUpdates.skills && processedUpdates.skills.length === 0) {
            processedUpdates.skills = null;
        }
    }
    
    if (processedUpdates.age !== undefined && processedUpdates.age !== null) {
        const ageNum = Number(processedUpdates.age);
        processedUpdates.age = isNaN(ageNum) || ageNum <= 0 ? null : ageNum;
    }

    (Object.keys(processedUpdates) as Array<keyof typeof processedUpdates>).forEach(key => {
      if (processedUpdates[key] === '') {
        if (key !== 'name' && key !== 'description' && key !== 'achievements' && key !== 'gender' && key !== 'linkedin_url' && key !== 'github_url') {
            (processedUpdates[key] as any) = null;
        } else if (processedUpdates[key] === '' && (key === 'linkedin_url' || key === 'github_url')) {
            (processedUpdates[key] as any) = null; // Ensure empty URLs are null
        }
      }
      if (processedUpdates[key] === undefined) {
        delete processedUpdates[key];
      }
    });

    const { data, error } = await supabase
      .from('profiles')
      .update(processedUpdates)
      .eq('email', user.email) // Use current user's email to identify the profile
      .select('id, user_id, name, email, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .single();

    setLoading(false);
    if (error) {
      console.error('Error updating profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error, data: null };
    }
    if (data) {
      setProfile(prevProfile => ({...(prevProfile || {} as UserProfile), ...data} as UserProfile));
    }
    return { error: null, data: data as UserProfile };
  }, [user, setProfile]);

  const contextValue: AuthContextType = {
    user,
    profile,
    loading,
    signIn: signInUser,
    signUp: signUpUser,
    signInWithGoogle: signInWithGoogleUser,
    signOutUser: signOutUserFunc,
    sendPasswordReset: sendPasswordResetEmail,
    updateUserProfile: updateUserProfileFunc,
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
Example SQL for 'profiles' table and RLS (run in Supabase SQL Editor):
(Assumes email is PK, id is auto-incrementing SERIAL, and user_id links to auth.users)

-- Ensure pgcrypto extension is enabled for uuid_generate_v4() if you use it for user_id
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the 'profiles' table
CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY, -- Auto-incrementing integer ID
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE, -- Link to auth.users
  name TEXT,
  email TEXT NOT NULL UNIQUE, -- This is the primary key for application logic linking
  age INTEGER,
  gender TEXT,
  skills TEXT[],
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL
);

-- Add unique constraint on user_id as well if you want to ensure one profile per auth user via user_id
-- CREATE UNIQUE INDEX profiles_user_id_key ON public.profiles(user_id);
-- Ensure email from auth.users is copied/synced if you are not making 'email' in profiles table the PK from auth.users.email
-- For simplicity, the app now assumes profiles.email will be populated with auth.users.email and is UNIQUE.


-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies before creating new ones to avoid "already exists" errors
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;

-- Allow authenticated users to view their own profile (identified by matching email from JWT).
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.jwt()->>'email' = email);

-- Allow authenticated users to insert their own profile.
-- The 'email' being inserted must match the authenticated user's email from JWT.
-- The 'user_id' being inserted must match the authenticated user's id from JWT.
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = user_id));

-- Allow authenticated users to update their own profile (identified by matching email from JWT).
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING ((auth.jwt()->>'email' = email) AND (auth.uid() = user_id)) -- Row selection
WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = user_id)); -- Condition on new data (e.g. can't change email or user_id)


-- (Optional but recommended) Function and Trigger to synchronize auth.users.email to profiles.email
-- if the user changes their email via Supabase Auth.
-- This is useful if profiles.email is not the PK but needs to stay in sync.
-- Given your change, profiles.email IS the PK for app logic, so this sync is important.
/*
CREATE OR REPLACE FUNCTION public.sync_user_email_to_profile_email_pk()
RETURNS TRIGGER AS $$
BEGIN
  -- This trigger assumes 'email' in 'profiles' is the field to update,
  -- and 'user_id' in 'profiles' links to 'auth.users.id'.
  -- If a user changes their email in auth.users, this updates the corresponding profile.
  UPDATE public.profiles
  SET email = NEW.email
  WHERE user_id = NEW.id; -- Find profile via user_id
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_updated_sync_email_pk
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE PROCEDURE public.sync_user_email_to_profile_email_pk();

-- Initial population trigger if new users are created directly in auth.users
-- and you want profile rows auto-created. The application currently handles this.
CREATE OR REPLACE FUNCTION public.handle_new_user_auto_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name' -- Or NEW.email as fallback
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_create_profile_auto
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_auto_profile();
*/

/*
Simplified table for your specific request (email as PK, id as SERIAL):

DROP TABLE IF EXISTS public.profiles; -- Careful, this deletes existing table
CREATE TABLE public.profiles (
  id BIGSERIAL, -- Auto-incrementing integer, not PK for app logic but can be DB PK
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Still link to auth.users
  email TEXT PRIMARY KEY, -- Email is the PK
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
);

-- RLS Policies (assuming email is PK):
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;

CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT TO authenticated USING (auth.jwt()->>'email' = email);

CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = user_id));

CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE TO authenticated USING (auth.jwt()->>'email' = email) WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = user_id));

*/
