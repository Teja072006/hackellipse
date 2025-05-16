
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
  // photo_url is derived from auth.users.user_metadata.avatar_url
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  // resume_file_url, created_at, updated_at, last_login are removed
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
      .select('id, name, email, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
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
        setLoading(true); // Set loading true during auth state change processing
        const currentUser = session?.user ?? null;
        const localUser = user;

        if (currentUser?.id !== localUser?.id) { // More robust check for user change
          setUser(currentUser);
          if (currentUser) {
            const userProfileData = await fetchUserProfile(currentUser.id);
            setProfile(userProfileData);
          } else {
            setProfile(null);
          }
        } else if (currentUser && !profile) { // If user is same but profile was missing
            const userProfileData = await fetchUserProfile(currentUser.id);
            setProfile(userProfileData);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile]); // profile should not be a dependency here to avoid loops if fetchUserProfile itself causes a profile state change


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
        // Store essential initial data in auth.users.user_metadata
        // This can be useful if profile creation fails, or for direct use.
        data: {
          name: credentials.data?.name?.trim() || credentials.email, // Fallback name to email
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
        // Attempt to sign out the partially created user
        await supabase.auth.signOut().catch(e => console.error("Error signing out user after incomplete user object from signUp:", e));
        return { error: { name: "IncompleteUserError", message: "User created in auth but essential info (id/email) missing from returned object." } as AuthError, user: null, profile: null };
    }
    
    // Prepare minimal data for profile insertion to satisfy RLS & basic identification
    // Other fields are optional and can be added by the user later via profile edit.
    const profileDataToInsert: {
      id: string;
      email: string; // email in profiles table should allow unique constraint but be nullable if desired. For now, assume it's populated.
      name: string;
      // followers_count and following_count should use DB defaults (DEFAULT 0 NOT NULL)
    } = {
      id: authUser.id,
      email: authUser.email, // authUser.email is guaranteed by the check above
      name: (credentials.data?.name?.trim()) || (authUser.user_metadata?.name) || authUser.email, // Ensure name has a fallback
    };

    // Add optional fields only if they have actual values
    if (credentials.data?.age) {
      const ageNum = Number(credentials.data.age);
      if (!isNaN(ageNum) && ageNum > 0) (profileDataToInsert as any).age = ageNum;
    }
    if (credentials.data?.gender?.trim()) (profileDataToInsert as any).gender = credentials.data.gender.trim();
    if (credentials.data?.skills && credentials.data.skills.length > 0) (profileDataToInsert as any).skills = credentials.data.skills.filter(s => s.trim()).length > 0 ? credentials.data.skills.filter(s => s.trim()) : null;
    if (credentials.data?.linkedin_url?.trim()) (profileDataToInsert as any).linkedin_url = credentials.data.linkedin_url.trim();
    if (credentials.data?.github_url?.trim()) (profileDataToInsert as any).github_url = credentials.data.github_url.trim();
    if (credentials.data?.description?.trim()) (profileDataToInsert as any).description = credentials.data.description.trim();
    if (credentials.data?.achievements?.trim()) (profileDataToInsert as any).achievements = credentials.data.achievements.trim();


    console.log("Attempting to insert profile with data:", JSON.stringify(profileDataToInsert, null, 2));

    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert(profileDataToInsert)
      .select() // Select all columns to confirm what was inserted/defaulted
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Critical: If profile creation fails, sign out the user from auth.users to avoid orphaned auth entries.
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null);
      setProfile(null);
      return { error: profileError as any, user: authUser, profile: null }; // Return authUser for context if needed
    }

    // If profile creation is successful
    setProfile(newProfile as UserProfile);
    setUser(authUser); // User is already set by onAuthStateChange, but this reinforces it.
    setLoading(false);
    return { error: null, user: authUser, profile: newProfile as UserProfile };

  }, []);


  const signInWithGoogle = useCallback(async (): Promise<{ error: AuthError | null }> => {
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
    // setLoading(false) will be handled by onAuthStateChange or if error for OAuth
    return { error };
  }, []);

  const signOutUser = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    // if (router) router.push('/login'); // Re-enable if router is confirmed not to be the issue
    return { error };
  }, []); // Add router if re-enabled

  const sendPasswordReset = useCallback(async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password reset link sent. Check your email.` : undefined; // Changed from /update-password
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }); // redirectTo is for the link in the email
    setLoading(false);
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (userId: string, updates: Partial<UserProfile>): Promise<{ error: any | null; data: UserProfile | null }> => {
    setLoading(true);
    let processedUpdates: Partial<UserProfile> = { ...updates };

    delete processedUpdates.id; // Cannot update id
    delete (processedUpdates as any).email; // Email updates typically handled via auth.updateUser

    if (updates.skills) {
        if (typeof updates.skills === 'string') {
            processedUpdates.skills = (updates.skills as string).split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
        } else if (Array.isArray(updates.skills)) {
            processedUpdates.skills = updates.skills.filter(s => typeof s === 'string' && s.trim().length > 0);
        }
        if (processedUpdates.skills && processedUpdates.skills.length === 0) {
            processedUpdates.skills = null; // Store as null if array becomes empty
        }
    }


    (Object.keys(processedUpdates) as Array<keyof Partial<UserProfile>>).forEach(key => {
      if (processedUpdates[key] === '') { // Convert empty strings to null for optional fields
        if (key !== 'name' && key !== 'description' && key !== 'achievements' && key !== 'gender') { // Allow empty strings for some text fields
            (processedUpdates[key] as any) = null;
        }
      }
    });
    
    if (processedUpdates.age !== undefined && processedUpdates.age !== null) {
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

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile.
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to insert their own profile.
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile.
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- (Optional but recommended) Function and Trigger to synchronize user's email to profiles.email
-- This is useful if the user changes their email via Supabase Auth.
CREATE OR REPLACE FUNCTION public.sync_user_email_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- Important for triggers that modify other tables or use auth context

CREATE TRIGGER on_auth_user_updated_sync_email
  AFTER UPDATE OF email ON auth.users -- Only trigger if email changes
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email) -- Only if email actually changed
  EXECUTE PROCEDURE public.sync_user_email_to_profile();

*/
