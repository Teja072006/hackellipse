
// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, Session, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
// import { useRouter } from "next/navigation"; // Temporarily commented for diagnosis

// Define a shape for your user profile data stored in Supabase
export interface UserProfile {
  id: string;
  name?: string | null;
  email?: string | null;
  // photo_url is managed by auth.users.user_metadata.avatar_url or user.user_metadata.picture
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  // resume_file_url, created_at, updated_at, last_login are removed from client-side management
  followers_count?: number; // Should default to 0 in DB
  following_count?: number; // Should default to 0 in DB
}

interface AuthContextType {
  user: SupabaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email' | 'followers_count' | 'following_count'>> }) => Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (userId: string, updates: Partial<UserProfile>) => Promise<{ error: any | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // const router = useRouter(); // Still commented out

  const fetchUserProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count') // Select only defined columns
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
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
      if (currentUser) {
        const userProfile = await fetchUserProfile(currentUser.id);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    };
    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        const currentUser = session?.user ?? null;
        const localUser = user; 

        if (currentUser && !localUser) {
            setUser(currentUser);
            const userProfileData = await fetchUserProfile(currentUser.id);
            setProfile(userProfileData);
        } else if (!currentUser && localUser) {
            setUser(null);
            setProfile(null);
        } else if (currentUser && localUser && currentUser.id !== localUser.id) {
            setUser(currentUser);
            const userProfileData = await fetchUserProfile(currentUser.id);
            setProfile(userProfileData);
        } else if (currentUser && localUser && currentUser.id === localUser.id && !profile) {
            const userProfileData = await fetchUserProfile(currentUser.id);
            setProfile(userProfileData);
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, user, profile]);


  const signIn = useCallback(async (credentials: SignInWithPasswordCredentials): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (data.user) {
      setUser(data.user);
      const userProfileData = await fetchUserProfile(data.user.id);
      setProfile(userProfileData);
    } else {
      setUser(null);
      setProfile(null);
    }
    setLoading(false);
    return { error };
  }, [fetchUserProfile]);

  const signUp = useCallback(async (
    credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email' | 'followers_count' | 'following_count'>> }
  ): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: { name: credentials.data?.name } 
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }

    if (authUser && authUser.email) {
      // Prepare data for the profiles table, ensuring type correctness and handling optional fields
      const profileDataToInsert: { id: string; email: string; name?: string | null; age?: number | null; gender?: string | null; skills?: string[] | null; linkedin_url?: string | null; github_url?: string | null; description?: string | null; achievements?: string | null; } = {
        id: authUser.id,
        email: authUser.email,
        name: (credentials.data?.name && credentials.data.name.trim() !== '') ? credentials.data.name.trim() : null,
      };

      if (credentials.data?.age !== undefined && credentials.data.age !== null && credentials.data.age !== '') {
        const ageNum = Number(credentials.data.age);
        profileDataToInsert.age = !isNaN(ageNum) && ageNum > 0 ? ageNum : null;
      } else {
        profileDataToInsert.age = null;
      }

      profileDataToInsert.gender = (credentials.data?.gender && credentials.data.gender.trim() !== '') ? credentials.data.gender.trim() : null;
      
      if (credentials.data?.skills) {
        if (Array.isArray(credentials.data.skills)) {
            profileDataToInsert.skills = credentials.data.skills.filter(s => typeof s === 'string' && s.trim() !== '');
        } else if (typeof credentials.data.skills === 'string' && credentials.data.skills.trim() !== '') {
            profileDataToInsert.skills = credentials.data.skills.split(',').map(skill => skill.trim()).filter(skill => skill);
        }
        if (profileDataToInsert.skills && profileDataToInsert.skills.length === 0) {
            profileDataToInsert.skills = null; 
        }
      } else {
        profileDataToInsert.skills = null;
      }

      profileDataToInsert.linkedin_url = (credentials.data?.linkedin_url && credentials.data.linkedin_url.trim() !== '') ? credentials.data.linkedin_url.trim() : null;
      profileDataToInsert.github_url = (credentials.data?.github_url && credentials.data.github_url.trim() !== '') ? credentials.data.github_url.trim() : null;
      profileDataToInsert.description = (credentials.data?.description && credentials.data.description.trim() !== '') ? credentials.data.description.trim() : null;
      profileDataToInsert.achievements = (credentials.data?.achievements && credentials.data.achievements.trim() !== '') ? credentials.data.achievements.trim() : null;
      
      // followers_count and following_count are handled by database defaults

      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert(profileDataToInsert) 
        .select()
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
    }
    setLoading(false);
    return { error: { name: "SignUpError", message: "User not returned after sign up."} as AuthError, user: null, profile: null };
  }, [fetchUserProfile]);

  const signInWithGoogle = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined; // Supabase will redirect here after its own callback
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) {
      setLoading(false); // Only set loading false if there's an immediate error
      console.error("Google Sign-In Error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    // setLoading(false) will be handled by onAuthStateChange or if error for OAuth
    return { error };
  }, []);

  const signOutUser = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    return { error };
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (userId: string, updates: Partial<UserProfile>): Promise<{ error: any | null; data: UserProfile | null }> => {
    setLoading(true);
    let processedUpdates: Partial<UserProfile> = { ...updates };
    
    delete processedUpdates.id;
    delete (processedUpdates as any).email; // Email updates are usually handled differently if allowed

    if (updates.skills && typeof updates.skills === 'string') {
        processedUpdates.skills = (updates.skills as string).split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
        if (processedUpdates.skills.length === 0) processedUpdates.skills = null;
    } else if (Array.isArray(updates.skills)) {
        processedUpdates.skills = updates.skills.filter(s => typeof s === 'string' && s.trim().length > 0);
        if (processedUpdates.skills.length === 0) processedUpdates.skills = null;
    } else if (updates.skills !== undefined) {
      processedUpdates.skills = null;
    }

    (Object.keys(processedUpdates) as Array<keyof Partial<UserProfile>>).forEach(key => {
      if (typeof processedUpdates[key] === 'string' && (processedUpdates[key] as string).trim() === '' && key !== 'name') {
        (processedUpdates[key] as any) = null;
      }
    });
    
    if (typeof processedUpdates.age === 'string' && processedUpdates.age.trim() === '') {
        processedUpdates.age = null;
    } else if (processedUpdates.age !== undefined && processedUpdates.age !== null) {
        const ageNum = Number(processedUpdates.age);
        processedUpdates.age = isNaN(ageNum) || ageNum <= 0 ? null : ageNum;
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(processedUpdates)
      .eq('id', userId)
      .select('id, name, email, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
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
  }, []);

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
Example SQL for 'profiles' table and RLS (run in Supabase SQL Editor):

-- Create the 'profiles' table
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT UNIQUE, -- Email from auth.users is the source of truth, this can be for convenience
  -- photo_url TEXT, -- Removed from app-managed profile fields; use auth.users.user_metadata.avatar_url
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- Array of text for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  -- resume_file_url, created_at, updated_at, last_login have been removed
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL
  -- If you want DB to manage created_at/updated_at, add them back:
  -- created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
);

-- RLS Policies

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Ensure this policy is for 'authenticated' role
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated -- Target authenticated users
USING (auth.uid() = id);

-- Ensure this policy is for 'authenticated' role
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated -- Target authenticated users
WITH CHECK (auth.uid() = id);

-- Ensure this policy is for 'authenticated' role
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated -- Target authenticated users
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);


-- The handle_updated_at trigger and function would be removed if 'updated_at' column is removed.
-- DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
-- DROP FUNCTION IF EXISTS public.handle_updated_at();

-- The handle_new_user_profile_creation trigger might be redundant if app handles all profile creation logic.
-- If used, it must align with the current table schema.
-- DROP TRIGGER IF EXISTS on_auth_user_created_create_profile ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user_profile_creation();
*/
/*
-- Example SQL for the 'handle_new_user_profile_creation' trigger if you wanted to use it,
-- adapted for the REMOVED columns:
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into profiles, only providing fields that exist and relying on defaults for others
  INSERT INTO public.profiles (id, email, name, followers_count, following_count)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name', -- Assumes 'name' might be in user_metadata from OAuth
    0, -- Default followers_count
    0  -- Default following_count
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger is correctly associated if you decide to use it:
-- CREATE TRIGGER on_auth_user_created_create_profile
--  AFTER INSERT ON auth.users
--  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile_creation();
*/

