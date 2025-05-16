
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials, Provider } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, useCallback, useContext } from "react";
import { useRouter } from "next/navigation"; // Ensure useRouter is imported
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export interface UserProfile {
  id?: number; // Auto-incrementing BIGINT PK from 'profiles' table
  user_id: string; // UUID from auth.users.id - THIS IS THE KEY FOR RLS OWNERSHIP & FK
  email: string;
  full_name?: string | null;
  age?: number | null; // Stored as INTEGER in DB
  gender?: string | null;
  skills?: string[] | null; // Stored as TEXT[] in DB (array of strings)
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number; // Default 0 in DB
  following_count?: number; // Default 0 in DB
  created_at?: string; // TIMESTAMPTZ
}

type SignUpProfileDataFromForm = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count' | 'created_at' | 'age' | 'skills'> & {
  full_name: string;
  age?: string;
  gender?: string;
  skills?: string;
  linkedin_url?: string;
  github_url?: string;
  description?: string;
  achievements?: string;
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter(); // Re-initialize useRouter

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
        .eq("user_id", authUserId)
        .single();

      if (error) {
        if (error.message?.toLowerCase().includes('failed to fetch')) {
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
          console.error('Error fetching Supabase user profile (other):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
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
            console.warn("Supabase getSession: Invalid refresh token. User will be treated as signed out.");
          } else {
            console.error("Error getting initial Supabase session:", sessionError.message, sessionError);
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
         console.error("Unexpected error in getInitialSession:", catchedError.message, catchedError);
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
        const authUser = session?.user ?? null;
        setUser(authUser);

        if (authUser && authUser.id && authUser.email) {
          const userProfileData = await fetchUserProfile(authUser.id);
          setProfile(userProfileData);
          if (_event === "SIGNED_IN") {
             console.log("User signed in or session restored, navigating to /home");
             router.push("/home");
          }
        } else {
          setProfile(null);
          if (_event === "SIGNED_OUT") {
            console.log("User signed out, redirecting to /");
            router.push("/");
          }
        }
      }
    );
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, router]); // Added router back as a dependency

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      console.error("Supabase Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } else {
       toast({ title: "Login Successful", description: "Welcome back!" });
       // router.push("/home"); // Navigation handled by onAuthStateChange
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
        data: {
          full_name: formData.full_name?.trim(), // Pass full_name to auth.users.user_metadata
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
      setLoading(false);
      const ageError = { name: "ValidationError", message: "Age must be a positive whole number if provided." } as AuthError;
      toast({ title: "Registration Failed", description: ageError.message, variant: "destructive" });
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after form validation failure:", e));
      setUser(null); setProfile(null);
      return { error: ageError, user: authUser, profile: null };
    }

    const skillsArray = formData.skills && formData.skills.trim() !== ''
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
      : null;

    const profileDataToInsert: Omit<UserProfile, 'id' | 'followers_count' | 'following_count' | 'created_at'> & { created_at?: string } = {
      user_id: authUser.id,
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
    
    console.log('Attempting to insert profile into Supabase with data:', profileDataToInsert);

    const { error: profileError, data: newProfileData } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count, created_at')
      .single();

    if (profileError) {
       let toastMessage = profileError.message;
       if (profileError.code === '42501') { // RLS violation
        toastMessage = "Profile Creation RLS Error: Policy violated. Check Supabase 'profiles' table INSERT policy. Ensure: 1. Policy is `(auth.uid() = user_id AND auth.jwt()->>'email' = email)`. 2. `user_id` in policy refers to your UUID column linked to auth.users. 3. `email` in policy refers to your TEXT column. 4. No typos. 5. DB Triggers disabled for diagnostics.";
      } else if (profileError.code === '23505') { // Unique constraint violation
        toastMessage = `Profile creation failed (Unique Constraint): ${profileError.details || profileError.message}. This email or user ID might already have a profile.`;
      } else if (profileError.message.toLowerCase().includes("invalid input for type integer") && profileError.message.toLowerCase().includes("age")){
        toastMessage = "Profile creation failed: The age provided is not a valid number. Please enter a whole number for age."
      } else if (profileError.message.toLowerCase().includes("malformed array literal") && profileError.message.toLowerCase().includes("skills")) {
        toastMessage = "Profile creation failed: Skills format is incorrect (DB expects array, e.g. {'skill1','skill2'}). Ensure skills are comma-separated in form if providing multiple.";
      }
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); setProfile(null);
      toast({ title: "Profile Creation Failed", description: toastMessage, variant: "destructive", duration: 15000 });
      return { error: profileError as any, user: authUser, profile: null };
    }

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile);
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created. Please check your email to verify your account." });
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, [fetchUserProfile]);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Supabase Google Sign-In. Final redirectTo for Supabase (after its callback):", redirectTo);
    console.log("Ensure Google Provider is enabled in Supabase Auth settings with correct Client ID/Secret, and the Supabase callback URI is in Google Cloud Console OAuth authorized redirect URIs.");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Check pop-up blockers. Verify Google Cloud OAuth Consent Screen (are test users added if in 'testing' mode?) and Supabase Google Provider settings.`,
        variant: "destructive",
        duration: 10000,
      });
       setLoading(false);
    }
    // setLoading(false) is tricky here due to redirect. onAuthStateChange will handle loading.
    return { error };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    // setLoading(false); // Reset by onAuthStateChange
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // router.push("/"); // Navigation handled by onAuthStateChange
    }
    // State (user, profile, loading) will be updated by onAuthStateChange
    return { error };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password-reset-link-used-please-set-new-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setLoading(false);
    if (error) {
      console.error("Supabase Password Reset error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset Email Sent", description: "If an account exists for this email, you'll receive instructions to reset your password. Check your spam folder." });
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

    const updatesForSupabase: Record<string, any> = { ...updates };

    if (updates.hasOwnProperty('age')) {
        const ageStr = String(updates.age).trim();
        if (ageStr === '' || updates.age === null || updates.age === undefined) {
            updatesForSupabase.age = null;
        } else {
            const parsedAge = parseInt(ageStr, 10);
            if (!isNaN(parsedAge) && parsedAge > 0) {
                updatesForSupabase.age = parsedAge;
            } else {
                setLoading(false);
                const ageError = { name: "ValidationError", message: "Age must be a positive whole number if provided." } as AuthError;
                toast({ title: "Update Failed", description: ageError.message, variant: "destructive" });
                return { error: ageError, data: null };
            }
        }
    }

    if (updates.hasOwnProperty('skills')) {
        if (updates.skills === null || updates.skills === undefined) {
            updatesForSupabase.skills = null;
        } else if (Array.isArray(updates.skills)) {
            const skillsArray = updates.skills.map(s => String(s).trim()).filter(s => s);
            updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
        } else if (typeof updates.skills === 'string') { // Assuming comma-separated string from form
            const skillsArray = updates.skills.split(',').map(s => s.trim()).filter(s => s);
            updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
        }
    }
    
    Object.keys(updatesForSupabase).forEach(key => {
      if (updatesForSupabase[key] === undefined) {
          delete updatesForSupabase[key];
      } else if (typeof updatesForSupabase[key] === 'string') {
        updatesForSupabase[key] = (updatesForSupabase[key] as string).trim() || null;
      }
    });
    
    if (Object.keys(updatesForSupabase).length === 0) {
      setLoading(false);
      toast({ title: "No Changes", description: "No information was changed." });
      return { error: null, data: profile };
    }

    console.log("Attempting to update profile in Supabase with data:", JSON.stringify(updatesForSupabase, null, 2), "for user_id (auth link):", user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(updatesForSupabase)
      .eq("user_id", user.id)
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
  }, [user, profile, fetchUserProfile]);

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
Example Supabase 'profiles' table schema for this context:

CREATE TABLE public.profiles (
  id BIGSERIAL PRIMARY KEY, -- Auto-incrementing internal ID for the profile row itself
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Links to auth.users.id (UUID)
  email TEXT UNIQUE NOT NULL, -- Should match auth.users.email
  full_name TEXT,
  age INTEGER,          -- Stored as INTEGER
  gender TEXT,
  skills TEXT[],        -- Array of text for skills (TEXT[])
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS POLICIES (ensure 'user_id' refers to the UUID column linked to auth.users):
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND ((auth.jwt() ->> 'email'::text) = email));

CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK ((auth.uid() = user_id) AND ((auth.jwt() ->> 'email'::text) = email));
*/
