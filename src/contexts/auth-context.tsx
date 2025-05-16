// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, Session, Provider } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
// import { useRouter } from "next/navigation"; // Temporarily removed for diagnostics

// UserProfile interface based on your new schema: email is PK, id is the auth.uid() UUID
export interface UserProfile {
  id: string; // Stores auth.uid() (UUID) - This is the foreign key to auth.users.id and should be UNIQUE
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
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'email' | 'followers_count' | 'following_count'>>) => Promise<{ error: any | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // const router = useRouter(); // Temporarily removed for diagnostics

  const fetchUserProfile = useCallback(async (userEmail: string): Promise<UserProfile | null> => {
    if (!userEmail) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count') // 'id' here is the UUID
      .eq('email', userEmail)
      .single();

    if (error) {
      if (error.message.toLowerCase().includes('failed to fetch')) {
        console.error(
          'Error fetching profile (Network Issue - Failed to fetch):',
          'This usually means the application could not reach the Supabase server. Please double-check:',
          '1. Your NEXT_PUBLIC_SUPABASE_URL in the .env file (e.g., https://<your-project-ref>.supabase.co).',
          '2. Your NEXT_PUBLIC_SUPABASE_ANON_KEY in the .env file.',
          '3. Your internet connection and any firewalls/proxies.',
          'Detailed error:',
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
        );
      } else if (error.code !== 'PGRST116') { // PGRST116: "Exactly one row expected, but 0 or more rows were returned" (means no profile yet)
        console.error('Error fetching profile (Supabase DB Error):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      }
      // For PGRST116, we don't log an error, as it's expected if a profile doesn't exist yet.
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
        const localUser = user; // Compare against the state 'user' not a local var 'user'

        if (currentUser?.id !== localUser?.id || currentUser?.email !== localUser?.email) {
          setUser(currentUser);
          if (currentUser && currentUser.email) {
            const userProfileData = await fetchUserProfile(currentUser.email);
            setProfile(userProfileData);
          } else {
            setProfile(null);
          }
        } else if (currentUser && currentUser.email && !profile) { // If user is same but profile was missing
          const userProfileData = await fetchUserProfile(currentUser.email);
          setProfile(userProfileData);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, user, profile]); // Added user and profile to dependencies


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
        data: { // Data to be stored in auth.users.user_metadata
          name: credentials.data?.name?.trim() || credentials.email.split('@')[0],
          // photo_url will be set if Google sign in is used, not for email/pass by default
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
      setUser(null); // Clear potentially inconsistent state
      setProfile(null);
      return { error: { name: "IncompleteUserError", message: "User created in auth but essential info (id/email) missing." } as AuthError, user: null, profile: null };
    }

    const profileDataToInsert: Partial<UserProfile> = {
      id: authUser.id, // This is the auth.uid() UUID, for the 'id' column in 'profiles'
      email: authUser.email, // This is the email, PK for 'profiles'
      name: credentials.data?.name?.trim() || authUser.user_metadata?.name || authUser.email.split('@')[0],
      followers_count: 0, // Rely on DB default, but explicit for clarity
      following_count: 0, // Rely on DB default
    };

    if (credentials.data) {
        const { name, age, gender, skills, linkedin_url, github_url, description, achievements } = credentials.data;
        if (age && Number.isFinite(Number(age)) && Number(age) > 0) profileDataToInsert.age = Number(age); else if (String(age).trim() === '') profileDataToInsert.age = null;
        if (gender && String(gender).trim()) profileDataToInsert.gender = String(gender).trim(); else if (String(gender).trim() === '') profileDataToInsert.gender = null;

        if (skills) {
            let skillsArray: string[] = [];
            if (typeof skills === 'string' && skills.trim()) {
                skillsArray = skills.split(',').map(skill => skill.trim()).filter(skill => skill);
            } else if (Array.isArray(skills) && skills.length > 0) {
                skillsArray = skills.map(skill => String(skill).trim()).filter(skill => skill);
            }
            profileDataToInsert.skills = skillsArray.length > 0 ? skillsArray : null;
        } else {
          profileDataToInsert.skills = null;
        }

        if (linkedin_url && String(linkedin_url).trim()) profileDataToInsert.linkedin_url = String(linkedin_url).trim(); else profileDataToInsert.linkedin_url = null;
        if (github_url && String(github_url).trim()) profileDataToInsert.github_url = String(github_url).trim(); else profileDataToInsert.github_url = null;
        if (description && String(description).trim()) profileDataToInsert.description = String(description).trim(); else profileDataToInsert.description = null;
        if (achievements && String(achievements).trim()) profileDataToInsert.achievements = String(achievements).trim(); else profileDataToInsert.achievements = null;
    }


    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert(profileDataToInsert as any)
      .select('id, email, name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user from auth if profile creation fails to avoid inconsistent state
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); // Clear potentially inconsistent state
      setProfile(null);
      return { error: profileError as any, user: authUser, profile: null };
    }

    setProfile(newProfile as UserProfile);
    setUser(authUser); // Ensure user state is also updated
    setLoading(false);
    // router.push("/home"); // Temporarily removed for diagnostics
    return { error: null, user: authUser, profile: newProfile as UserProfile };

  }, [/* router */ fetchUserProfile]); // Temporarily removed router from dependencies


  const signInWithGoogleUser = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });

    if (error) {
      console.error("Google Sign-In Error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      setLoading(false); // Set loading to false only if there's an immediate error.
                         // For OAuth, loading state might be managed until redirection and session update.
    }
    // For OAuth, redirection happens, so setLoading might be better handled by onAuthStateChange
    // For now, if no immediate error, we assume redirection will occur.
    // If there's an error, it means the OAuth flow couldn't even start.
    return { error };
  }, []);

  const signOutUserFunc = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    // router.push("/"); // Temporarily removed for diagnostics
    return { error };
  }, [/* router */]); // Temporarily removed router

  const sendPasswordResetEmail = useCallback(async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    // For password reset, the redirect should ideally go to a page where users can set a new password
    // This often involves a specific route you set up in your app that handles password update tokens
    // For now, using login page, but this should be a dedicated password update page.
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password reset successful. Please log in with your new password.` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    return { error };
  }, []);

  const updateUserProfileFunc = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'email' | 'followers_count' | 'following_count'>>): Promise<{ error: any | null; data: UserProfile | null }> => {
    if (!user || !user.email) {
      return { error: { message: "User not authenticated or email missing." }, data: null };
    }
    setLoading(true);

    let processedUpdates: Partial<Omit<UserProfile, 'id' | 'email' | 'followers_count' | 'following_count'>> = { ...updates };

    // Process skills: string to string[] or null
    if (updates.skills) {
      let skillsArray: string[] = [];
      if (typeof updates.skills === 'string' && updates.skills.trim()) {
          skillsArray = (updates.skills as string).split(',').map(skill => skill.trim()).filter(skill => skill);
      } else if (Array.isArray(updates.skills) && updates.skills.length > 0) {
          skillsArray = updates.skills.map(skill => String(skill).trim()).filter(skill => skill);
      }
      processedUpdates.skills = skillsArray.length > 0 ? skillsArray : null;
    } else if (updates.skills === '' || (Array.isArray(updates.skills) && updates.skills.length === 0)) {
        processedUpdates.skills = null; // Ensure empty skills array is stored as null or empty array based on DB preference
    }


    // Process age: string to number or null
    if (updates.age !== undefined) {
        const ageNum = Number(updates.age);
        processedUpdates.age = (isNaN(ageNum) || ageNum <= 0) ? null : ageNum;
    } else if (String(updates.age).trim() === '') { // Handle empty string for age
        processedUpdates.age = null;
    }

    // Ensure other optional text fields become null if empty string (unless empty string is desired)
    (Object.keys(processedUpdates) as Array<keyof typeof processedUpdates>).forEach(key => {
      const k = key as keyof Omit<UserProfile, 'id' | 'email' | 'followers_count' | 'following_count' | 'age' | 'skills'>; // Narrow down the key type
      if (processedUpdates[k] === undefined) {
          delete processedUpdates[k];
      } else if (typeof processedUpdates[k] === 'string' && (processedUpdates[k] as string).trim() === '') {
           // Allow name, description, achievements, gender to be empty strings if desired by design
           // For URLs, explicitly set to null if empty, as empty string isn't a valid URL
           if (k === 'linkedin_url' || k === 'github_url') {
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
        ...(prevProfile || {} as UserProfile), // Ensure prevProfile is not null
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
  id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- This 'id' column STORES auth.uid() (UUID) and links to auth.users
  email TEXT PRIMARY KEY, -- Email is the PK for the profiles table
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
  -- Removed: resume_file_url, created_at, updated_at, last_login
);

-- Index the 'id' (UUID) column for faster lookups if needed for joins or direct access by auth.uid()
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON public.profiles(id);

-- RLS Policies (Assuming 'email' is PK, and 'id' is the UUID link to auth.users):
-- Drop old policies first if they exist and might conflict.
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = id)); -- 'id' is the UUID column in profiles


DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.jwt()->>'email' = email); -- Identify by email for viewing self

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.jwt()->>'email' = email) -- Row selection for update
WITH CHECK ((auth.jwt()->>'email' = email) AND (auth.uid() = id)); -- Cannot change email or the linking id by this policy

*/
