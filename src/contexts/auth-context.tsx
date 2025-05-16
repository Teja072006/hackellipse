
// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, Session, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// Define a shape for your user profile data stored in Supabase
export interface UserProfile {
  // If you have an auto-incrementing ID from Supabase (e.g., BIGSERIAL), it's not the primary link to auth.
  // This 'id' is now meant to be the auth.users.id (UUID).
  id: string; // Stores auth.uid() (UUID) - This is the foreign key to auth.users.id
  email: string; // Primary Key for the profiles table
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count: number;
  following_count: number;
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
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'email'>>) => Promise<{ error: any | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (userEmail: string): Promise<UserProfile | null> => {
    if (!userEmail) return null;
    // Select 'id' (which should be the UUID column linked to auth.users.id)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .eq('email', userEmail)
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
      if (currentUser && currentUser.email) {
        const userProfileData = await fetchUserProfile(currentUser.email);
        setProfile(userProfileData);
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
  }, [fetchUserProfile, profile, user]);


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
    credentials: SignUpWithPasswordCredentials & { data?: Partial<Omit<UserProfile, 'id' | 'email' | 'followers_count' | 'following_count'>> }
  ): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser }, error: signUpError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          name: credentials.data?.name?.trim() || credentials.email.split('@')[0],
        }
      }
    });

    if (signUpError) {
      setLoading(false);
      return { error: signUpError, user: null, profile: null };
    }

    if (!authUser || !authUser.id || !authUser.email) {
      setLoading(false);
      console.error("SignUp succeeded but Supabase user object is incomplete (missing id or email).", authUser);
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after incomplete user object from signUp:", e));
      return { error: { name: "IncompleteUserError", message: "User created in auth but essential info (id/email) missing." } as AuthError, user: null, profile: null };
    }

    const profileDataToInsert: Omit<UserProfile, 'followers_count' | 'following_count'> & { followers_count?: number, following_count?: number } = {
      id: authUser.id, // This 'id' is the UUID from auth.users, to be stored in profiles.id
      email: authUser.email, // This is the Primary Key for the 'profiles' table
      name: credentials.data?.name?.trim() || authUser.user_metadata?.name || authUser.email.split('@')[0],
      age: null,
      gender: null,
      skills: null,
      linkedin_url: null,
      github_url: null,
      description: null,
      achievements: null,
    };

    if (credentials.data?.age && Number.isFinite(Number(credentials.data.age)) && Number(credentials.data.age) > 0) {
      profileDataToInsert.age = Number(credentials.data.age);
    }
    if (credentials.data?.gender && String(credentials.data.gender).trim()) {
      profileDataToInsert.gender = String(credentials.data.gender).trim();
    }
    if (credentials.data?.skills) {
      let skillsArray: string[] = [];
      if (typeof credentials.data.skills === 'string' && credentials.data.skills.trim()) {
        skillsArray = credentials.data.skills.split(',').map(skill => skill.trim()).filter(skill => skill);
      } else if (Array.isArray(credentials.data.skills) && credentials.data.skills.length > 0) {
        skillsArray = credentials.data.skills.map(skill => String(skill).trim()).filter(skill => skill);
      }
      if (skillsArray.length > 0) {
        profileDataToInsert.skills = skillsArray;
      }
    }
    if (credentials.data?.linkedin_url && String(credentials.data.linkedin_url).trim()) {
      profileDataToInsert.linkedin_url = String(credentials.data.linkedin_url).trim();
    }
    if (credentials.data?.github_url && String(credentials.data.github_url).trim()) {
      profileDataToInsert.github_url = String(credentials.data.github_url).trim();
    }
    if (credentials.data?.description && String(credentials.data.description).trim()) {
      profileDataToInsert.description = String(credentials.data.description).trim();
    }
    if (credentials.data?.achievements && String(credentials.data.achievements).trim()) {
      profileDataToInsert.achievements = String(credentials.data.achievements).trim();
    }

    // Remove any keys with null values if Supabase is configured to not allow them or if it's cleaner
    // However, for nullable fields, sending null is generally fine.
    // The DB defaults for followers_count and following_count should apply.

    console.log("Attempting to insert profile with data:", JSON.stringify(profileDataToInsert, null, 2));

    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert(profileDataToInsert as any) // Cast as any because DB defaults will handle followers/following count
      .select('id, email, name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
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

  const updateUserProfileFunc = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'email'>>): Promise<{ error: any | null; data: UserProfile | null }> => {
    if (!user || !user.email) {
      return { error: { message: "User not authenticated or email missing." }, data: null };
    }
    setLoading(true);
    let processedUpdates: Partial<Omit<UserProfile, 'id' | 'email'>> = { ...updates };

    if (updates.skills) {
      let skillsArray: string[] = [];
      if (typeof updates.skills === 'string' && updates.skills.trim()) {
        skillsArray = (updates.skills as string).split(',').map(skill => skill.trim()).filter(skill => skill);
      } else if (Array.isArray(updates.skills) && updates.skills.length > 0) {
        skillsArray = updates.skills.map(skill => String(skill).trim()).filter(skill => skill);
      }
      processedUpdates.skills = skillsArray.length > 0 ? skillsArray : null;
    }


    if (updates.age !== undefined) {
      const ageNum = Number(updates.age);
      processedUpdates.age = (isNaN(ageNum) || ageNum <= 0) ? null : ageNum;
    } else if (String(updates.age).trim() === '') {
        processedUpdates.age = null;
    }


    (Object.keys(processedUpdates) as Array<keyof typeof processedUpdates>).forEach(key => {
      const k = key as keyof typeof processedUpdates; // Cast key to the correct type
      if (processedUpdates[k] === undefined) {
        delete processedUpdates[k];
      } else if (typeof processedUpdates[k] === 'string' && (processedUpdates[k] as string).trim() === '') {
         if (k !== 'name' && k !== 'description' && k !== 'achievements' && k !== 'gender') { // Allow some text fields to be empty strings
            (processedUpdates[k] as any) = null;
        }
      }
    });

    const { data, error } = await supabase
      .from('profiles')
      .update(processedUpdates)
      .eq('email', user.email) // Use current user's email to identify the profile for update
      .select('id, email, name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .single();

    setLoading(false);
    if (error) {
      console.error('Error updating profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { error, data: null };
    }
    if (data) {
      setProfile(prevProfile => ({
        ...(prevProfile || {} as UserProfile),
        ...(data as UserProfile)
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
Example SQL for 'profiles' table (email as PK, id as UUID foreign key to auth.users):

CREATE TABLE public.profiles (
  email TEXT PRIMARY KEY, -- Email is the PK for the profiles table
  id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- This 'id' column STORES auth.uid() (UUID) and links to auth.users
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

-- Index the 'id' (UUID) column for faster lookups if needed for joins or direct access by auth.uid()
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON public.profiles(id);

-- RLS Policies:
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = id)); -- 'id' in 'profiles' must match auth.uid()

DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.jwt()->>'email' = email); -- Identify by email

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.jwt()->>'email' = email) -- Identify by email
WITH CHECK (auth.jwt()->>'email' = email); -- Ensure email cannot be changed by this policy

*/

    