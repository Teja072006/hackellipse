
// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, Session, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// Define a shape for your user profile data stored in Supabase
export interface UserProfile {
  id: number; // Auto-incrementing integer primary key (database-generated)
  user_id: string; // UUID from auth.users, for linking. THIS IS ESSENTIAL.
  name?: string | null;
  email: string; // Primary Key for application logic now, also from auth.users
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

  const fetchUserProfile = useCallback(async (userEmail: string): Promise<UserProfile | null> => {
    if (!userEmail) return null;
    // Temporarily removed 'user_id' from select to avoid "column does not exist" error.
    // IMPORTANT: The 'user_id' column MUST be added to the 'profiles' table in Supabase.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
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
        } else if (currentUser && currentUser.email && !profile) { // If user is same but profile wasn't fetched
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
    credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email'| 'user_id'| 'followers_count' | 'following_count'>> }
  ): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          name: credentials.data?.name?.trim() || credentials.email.split('@')[0], // Use email prefix as fallback for name in user_metadata
        }
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }
    
    console.log("Auth user from signUp:", JSON.stringify(authUser, null, 2));

    if (!authUser || !authUser.id || !authUser.email) {
        setLoading(false);
        console.error("SignUp succeeded but Supabase user object is incomplete (missing id or email).", authUser);
        // Attempt to sign out the partially created user to prevent orphaned auth entries
        await supabase.auth.signOut().catch(e => console.error("Error signing out user after incomplete user object from signUp:", e));
        return { error: { name: "IncompleteUserError", message: "User created in auth but essential info (id/email) missing." } as AuthError, user: null, profile: null };
    }
    
    const profileDataToInsert: Partial<Omit<UserProfile, 'id'>> & { user_id: string; email: string; } = {
      user_id: authUser.id, // Link to auth.users table using the auth user's ID
      email: authUser.email, // Email from the auth user
      name: credentials.data?.name?.trim() || authUser.user_metadata?.name || authUser.email.split('@')[0], // Name from form, fallback to metadata, then email prefix
    };

    // Add optional fields only if they are provided and valid
    if (credentials.data?.age && Number.isFinite(Number(credentials.data.age)) && Number(credentials.data.age) > 0) {
      profileDataToInsert.age = Number(credentials.data.age);
    } else {
      profileDataToInsert.age = null;
    }
    profileDataToInsert.gender = credentials.data?.gender?.trim() || null;

    if (credentials.data?.skills && typeof credentials.data.skills === 'string' && credentials.data.skills.trim()) {
        profileDataToInsert.skills = credentials.data.skills.split(',').map(skill => skill.trim()).filter(skill => skill);
        if (profileDataToInsert.skills.length === 0) profileDataToInsert.skills = null; // Store as null if empty after processing
    } else if (Array.isArray(credentials.data?.skills) && credentials.data.skills.length > 0) {
        profileDataToInsert.skills = credentials.data.skills.map(skill => String(skill).trim()).filter(skill => skill);
         if (profileDataToInsert.skills.length === 0) profileDataToInsert.skills = null;
    } else {
        profileDataToInsert.skills = null;
    }
    
    profileDataToInsert.linkedin_url = credentials.data?.linkedin_url?.trim() || null;
    profileDataToInsert.github_url = credentials.data?.github_url?.trim() || null;
    profileDataToInsert.description = credentials.data?.description?.trim() || null;
    profileDataToInsert.achievements = credentials.data?.achievements?.trim() || null;

    // Clean up any undefined fields that might have been added
    (Object.keys(profileDataToInsert) as Array<keyof typeof profileDataToInsert>).forEach(key => {
      if (profileDataToInsert[key] === undefined) {
        delete profileDataToInsert[key];
      }
    });

    console.log("Attempting to insert profile with data:", JSON.stringify(profileDataToInsert, null, 2));

    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert(profileDataToInsert as any) 
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
    setUser(authUser); // Keep the authUser from signUp result
    setLoading(false);
    return { error: null, user: authUser, profile: newProfile as UserProfile };

  }, []);


  const signInWithGoogleUser = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    // Determine redirectTo based on environment
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined; // Or your production URL
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    // Supabase handles the redirect, so loading might not need to be set to false here if a redirect occurs.
    // If error, it means the redirect didn't initiate.
    if (error) {
        console.error("Google Sign-In Error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        setLoading(false);
    }
    return { error };
  }, []);

  const signOutUserFunc = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
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
            processedUpdates.skills = null; // Store as null if empty after processing
        }
    }
    
    if (processedUpdates.age !== undefined && processedUpdates.age !== null) {
        const ageNum = Number(processedUpdates.age);
        processedUpdates.age = isNaN(ageNum) || ageNum <= 0 ? null : ageNum;
    } else if (processedUpdates.age === '') { // Handle empty string explicitly for age
        processedUpdates.age = null;
    }


    (Object.keys(processedUpdates) as Array<keyof typeof processedUpdates>).forEach(key => {
      if (processedUpdates[key] === '') {
        // Allow name, description, achievements, gender to be empty strings if desired
        if (key !== 'name' && key !== 'description' && key !== 'achievements' && key !== 'gender') {
            (processedUpdates[key] as any) = null; // Set other empty strings to null
        }
      }
      if (processedUpdates[key] === undefined) {
        delete processedUpdates[key]; // Remove undefined keys
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
      // Ensure profile state is updated correctly, merging with previous state if necessary
      setProfile(prevProfile => ({
          ...(prevProfile || {} as UserProfile), // Spread previous profile if it exists
          ...(data as UserProfile) // Spread new data, ensuring type compatibility
      }));
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
Example SQL for 'profiles' table (email as PK, id as SERIAL):

CREATE TABLE public.profiles (
  id BIGSERIAL, -- Auto-incrementing integer, NOT the primary key for app logic but can be DB PK
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Link to auth.users
  email TEXT PRIMARY KEY, -- Email is the PK now
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

-- Index user_id for faster lookups if needed often
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- RLS Policies (assuming email is PK for ownership and user_id for linking)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies before creating new ones to avoid "already exists" errors
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;

-- Policy for INSERT: Authenticated users can insert their own profile.
-- The 'email' being inserted must match the authenticated user's email from JWT.
-- The 'user_id' being inserted must match the authenticated user's id from JWT.
CREATE POLICY "Users can insert their own profile."
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = user_id));


-- Policy for SELECT: Authenticated users can view their own profile.
CREATE POLICY "Users can view their own profile."
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.jwt()->>'email' = email); -- Or using (auth.uid() = user_id); if you prefer querying by user_id

-- Policy for UPDATE: Authenticated users can update their own profile.
CREATE POLICY "Users can update their own profile."
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.jwt()->>'email' = email) -- Row selection for update
WITH CHECK (auth.jwt()->>'email' = email); -- Condition on new data (e.g. can't change email)


-- (Optional but recommended) Function and Trigger to synchronize auth.users.email to profiles.email
-- if the user changes their email via Supabase Auth, and email is the PK.
-- This is important if profiles.email IS the PK.
CREATE OR REPLACE FUNCTION public.sync_user_email_to_profile_email_pk()
RETURNS TRIGGER AS $$
BEGIN
  -- This trigger assumes 'email' in 'profiles' is the PK to update,
  -- and 'user_id' in 'profiles' links to 'auth.users.id'.
  -- If a user changes their email in auth.users, this updates the corresponding profile's PK.
  -- This is a DANGEROUS operation if 'email' is a PK with foreign keys pointing to it.
  -- For this app structure, it might be better to prevent email changes or handle this relation carefully.
  -- For now, let's assume profile email is updated if auth email changes.
  -- A more robust solution might involve a separate 'profiles_auth_link' table if emails change often and are PKs.
  UPDATE public.profiles
  SET email = NEW.email
  WHERE user_id = NEW.id; -- Find profile via user_id
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DROP TRIGGER IF EXISTS on_auth_user_updated_sync_email_pk ON auth.users;
-- CREATE TRIGGER on_auth_user_updated_sync_email_pk
--   AFTER UPDATE OF email ON auth.users
--   FOR EACH ROW
--   WHEN (OLD.email IS DISTINCT FROM NEW.email)
--   EXECUTE PROCEDURE public.sync_user_email_to_profile_email_pk();

*/
