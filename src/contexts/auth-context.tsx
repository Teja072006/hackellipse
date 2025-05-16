
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials, Provider } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// UserProfile reflects the structure of your 'profiles' table in Supabase.
// 'id' is the auto-incrementing BIGINT Primary Key of the profiles table.
// 'user_id' is the UUID from auth.users.id, used for RLS and linking.
export interface UserProfile {
  id?: number; // Auto-incrementing BIGINT PK from 'profiles' table
  user_id: string; // UUID from auth.users.id - THIS IS THE KEY FOR RLS OWNERSHIP
  email: string; // Should match auth.users.email
  full_name?: string | null;
  age?: number | null; // Stored as INTEGER in DB
  gender?: string | null;
  skills?: string[] | null; // Stored as TEXT[] in DB
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number; // Default 0 in DB
  following_count?: number; // Default 0 in DB
  created_at?: string; // Handled by DB (DEFAULT now())
}

// Data expected from the registration form for profile details
type SignUpProfileDataFromForm = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count' | 'created_at' | 'age' | 'skills'> & {
  full_name: string;
  age?: string; // Age from form as string
  skills?: string; // Skills from form as comma-separated string
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: { email: string, password: string }) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data: SignUpProfileDataFromForm }) => Promise<{ error: AuthError | null; user: User | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'created_at' | 'followers_count' | 'following_count'>>) => Promise<{ error: AuthError | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (authUserId: string): Promise<UserProfile | null> => {
    if (!authUserId) {
      console.warn("Supabase fetchUserProfile called with no authUserId.");
      return null;
    }
    console.log("Fetching Supabase profile for user_id (auth link):", authUserId);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at')
        .eq("user_id", authUserId) // Query by the UUID user_id (FK to auth.users)
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
        } else if (error.code === 'PGRST116') {
          console.log(`No Supabase profile found for user_id ${authUserId}. This is normal for a new user or if profile creation is pending.`);
        } else if (error.code === '406') {
             console.error('Error fetching profile (406 Not Acceptable - Supabase): This often indicates an RLS issue with your SELECT policy or a requested columns/data format problem.', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        } else {
          console.error('Error fetching Supabase user profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }
        return null;
      }
      return data as UserProfile | null;
    } catch (catchedError: any) {
      console.error("Unexpected error in fetchUserProfile (Supabase):", JSON.stringify(catchedError, Object.getOwnPropertyNames(catchedError), 2));
      return null;
    }
  }, []);


  useEffect(() => {
    setLoading(true);
    const getInitialSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
           if (sessionError.message?.toLowerCase().includes("invalid refresh token")) {
            console.warn("Supabase getSession: Invalid refresh token. User treated as signed out.");
          } else {
             console.error("Error getting initial Supabase session:", JSON.stringify(sessionError, Object.getOwnPropertyNames(sessionError), 2));
          }
          setUser(null);
          setProfile(null);
        } else if (session?.user) {
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
      } finally {
        setLoading(false);
      }
    };
    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("Supabase onAuthStateChange event:", _event, "session user_id:", session?.user?.id);
        setLoading(true);
        const authUser = session?.user ?? null;
        setUser(authUser);

        if (authUser && authUser.id && authUser.email) {
          const userProfileData = await fetchUserProfile(authUser.id);
          setProfile(userProfileData);
          if (_event === "SIGNED_IN" && router) {
             console.log("User signed in or session restored, navigating to /home");
             router.push("/home");
          }
        } else {
          setProfile(null);
          if (_event === "SIGNED_OUT" && router) {
            console.log("User signed out, redirecting to /");
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
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } else {
       toast({ title: "Login Successful", description: "Welcome back!" });
    }
    return { error };
  }, []);

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data: SignUpProfileDataFromForm }) => {
    setLoading(true);
    const { email, password, options, data: formData } = credentials;

    console.log("Attempting Supabase auth sign up with email:", email);
    const { data: signUpResponse, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { // Data to store in auth.users.user_metadata (and potentially profiles table via trigger/app logic)
          full_name: formData.full_name?.trim(),
        },
      },
    });
    
    const authUser = signUpResponse?.user;

    if (signUpError || !authUser?.id || !authUser.email) {
      setLoading(false);
      const specificError = signUpError || { name: "SignUpError", message: "User data not returned after sign up or missing id/email." } as AuthError;
      console.error("Supabase Sign-Up error (auth part):", JSON.stringify(specificError, Object.getOwnPropertyNames(specificError), 2));
      toast({ title: "Registration Failed", description: specificError.message || "An unexpected error occurred.", variant: "destructive" });
      return { error: specificError, user: null, profile: null };
    }
    console.log('Authenticated user from Supabase signUp:', { id: authUser.id, email: authUser.email });

    const parsedAge = formData.age && formData.age.trim() !== '' ? parseInt(formData.age, 10) : null;
    if (formData.age && formData.age.trim() !== '' && (isNaN(parsedAge) || parsedAge <= 0)) {
      console.error("Invalid age value provided:", formData.age);
      setLoading(false);
      const ageError = { name: "ValidationError", message: "Age must be a positive number." } as AuthError;
      toast({ title: "Registration Failed", description: ageError.message, variant: "destructive" });
      return { error: ageError, user: authUser, profile: null };
    }

    const skillsArray = formData.skills && formData.skills.trim() !== ''
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
      : null;

    const profileDataToInsert: Omit<UserProfile, 'id' | 'created_at' | 'followers_count' | 'following_count'> = {
      user_id: authUser.id, // This is the UUID from auth.users.id
      email: authUser.email!,
      full_name: formData.full_name?.trim() || authUser.email?.split('@')[0] || 'New User',
      age: (parsedAge !== null && !isNaN(parsedAge)) ? parsedAge : null,
      gender: formData.gender?.trim() || null,
      skills: skillsArray,
      linkedin_url: formData.linkedin_url?.trim() || null,
      github_url: formData.github_url?.trim() || null,
      description: formData.description?.trim() || null,
      achievements: formData.achievements?.trim() || null,
    };
    
    console.log('Attempting to insert profile into Supabase with data:', JSON.stringify(profileDataToInsert, null, 2));

    const { error: profileError, data: newProfileData } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at')
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); 
      setProfile(null);

      let toastMessage = profileError.message;
      if (profileError.code === '42501') { // RLS violation
        toastMessage = "RLS policy violated. Check Supabase 'profiles' table INSERT policy. Crucial checks: 1. Policy is: (auth.uid() = user_id AND auth.jwt()->>'email' = email). 2. 'user_id' in policy MUST be your UUID column linked to auth.users. 3. 'email' in policy MUST be your TEXT column for user's email. 4. No typos in policy or column names. 5. Disable DB triggers for diagnostics.";
      } else if (profileError.message.includes("violates unique constraint")) {
        toastMessage = "A profile with this email or user ID might already exist.";
      } else if (profileError.message.includes("violates foreign key constraint")) {
         toastMessage = "Profile creation failed due to a data inconsistency (foreign key). Ensure user_id is valid.";
      }
      toast({ title: "Profile Creation Failed", description: toastMessage, variant: "destructive", duration: 15000 });
      return { error: profileError as any, user: authUser, profile: null };
    }

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile);
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created." });
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, [router]);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Supabase Google Sign-In. Final redirectTo for Supabase (after its callback):", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setLoading(false);
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Ensure pop-ups are not blocked. Check Google Cloud OAuth Consent Screen and Supabase Google Provider settings.`,
        variant: "destructive",
        duration: 10000,
      });
    }
    return { error };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoading(false);
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    }
    return { error };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password-reset-link-sent` : undefined; 
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setLoading(false);
    if (error) {
      console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset Email Sent", description: "If an account exists for this email, you'll receive instructions to reset your password." });
    }
    return { error };
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'created_at' | 'followers_count' | 'following_count'>>) => {
    if (!user || !user.id || !user.email) {
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      toast({ title: "Update Failed", description: authError.message, variant: "destructive" });
      return { error: authError, data: null };
    }
    setLoading(true);

    const updatesForSupabase: Record<string, any> = {};

    // Explicitly handle type conversions and nulls for each updatable field
    if (updates.hasOwnProperty('full_name')) updatesForSupabase.full_name = updates.full_name?.trim() || null;
    
    if (updates.hasOwnProperty('age')) {
      const ageStr = String(updates.age).trim();
      if (ageStr === '' || updates.age === null || updates.age === undefined) {
        updatesForSupabase.age = null;
      } else {
        const parsedAge = parseInt(ageStr, 10);
        updatesForSupabase.age = (!isNaN(parsedAge) && parsedAge > 0) ? parsedAge : null;
      }
    }
    
    if (updates.hasOwnProperty('gender')) updatesForSupabase.gender = updates.gender?.trim() || null;
    
    if (updates.hasOwnProperty('skills')) {
      if (updates.skills === null || updates.skills === undefined) {
        updatesForSupabase.skills = null;
      } else if (typeof updates.skills === 'string') {
        const skillsArray = updates.skills.split(',').map(s => s.trim()).filter(s => s);
        updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
      } else if (Array.isArray(updates.skills)) {
        const skillsArray = updates.skills.map(s => String(s).trim()).filter(s => s);
        updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
      }
    }
    
    if (updates.hasOwnProperty('linkedin_url')) updatesForSupabase.linkedin_url = updates.linkedin_url?.trim() || null;
    if (updates.hasOwnProperty('github_url')) updatesForSupabase.github_url = updates.github_url?.trim() || null;
    if (updates.hasOwnProperty('description')) updatesForSupabase.description = updates.description?.trim() || null;
    if (updates.hasOwnProperty('achievements')) updatesForSupabase.achievements = updates.achievements?.trim() || null;
    
    // Remove undefined properties
    Object.keys(updatesForSupabase).forEach(key => {
        if (updatesForSupabase[key] === undefined) {
            delete updatesForSupabase[key];
        }
    });
    
    if (Object.keys(updatesForSupabase).length === 0) {
      setLoading(false);
      toast({ title: "No Changes", description: "No information was changed." });
      return { error: null, data: profile }; // Return current profile if no actual updates
    }

    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(updatesForSupabase, null, 2), "for user_id (auth link):", user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(updatesForSupabase)
      .eq("user_id", user.id) // Use user_id (UUID) for matching
      .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at')
      .single();

    setLoading(false);
    if (error) {
      console.error('Error updating Supabase profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      return { error: error as AuthError, data: null };
    }
    console.log("Profile updated successfully in Supabase:", data);
    setProfile(data as UserProfile);
    toast({ title: "Profile Updated", description: "Your changes have been saved." });
    return { error: null, data: data as UserProfile };
  }, [user, profile, router]); // Added router for consistency, though not used directly here

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
Example Supabase 'profiles' table schema (ensure 'user_id' is UUID, FK to auth.users.id):

CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY, -- Auto-incrementing internal ID for the profile row itself
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Links to auth.users.id (UUID)
  email TEXT UNIQUE NOT NULL, -- Should match auth.users.email
  full_name TEXT,
  age INTEGER,
  gender TEXT,
  skills TEXT[], -- Array of text for skills
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS POLICIES (ensure 'user_id' refers to the UUID column linked to auth.users):
-- Enable RLS: ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT Policy:
-- CREATE POLICY "Users can view their own profile."
-- ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- INSERT Policy:
-- CREATE POLICY "Users can insert their own profile."
-- ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND ((auth.jwt() ->> 'email'::text) = email));

-- UPDATE Policy:
-- CREATE POLICY "Users can update their own profile."
-- ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK ((auth.uid() = user_id) AND ((auth.jwt() ->> 'email'::text) = email));
*/
