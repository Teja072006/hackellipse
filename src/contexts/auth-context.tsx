
// src/contexts/auth-context.tsx
"use client";

import type { User, Session, AuthError, SignUpWithPasswordCredentials, Provider } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, useCallback, useContext } from "react"; // Added useContext here
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
  // created_at is handled by DB (DEFAULT now())
}

// Data expected from the registration form for profile details
// This matches the form fields, conversion to DB types happens in signUp
type SignUpProfileDataFromForm = Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count' | 'age' | 'skills'> & {
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
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count'>>) => Promise<{ error: AuthError | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
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
        .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
        .eq("user_id", authUserId)
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
        } else if (error.code === 'PGRST116') { // PGRST116: "Exactly one row expected, but 0 or more rows were returned" (means no profile yet)
          console.log(`No Supabase profile found for user_id ${authUserId}. This is normal for a new user or if profile creation is pending.`);
        } else if (error.code === '406') { // Not Acceptable - often RLS issue or bad request for PostgREST
             console.error('Error fetching profile (406 Not Acceptable - Supabase): This often indicates an RLS issue with your SELECT policy or a requested columns/data format problem.', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }
         else {
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
      options: { // Data for auth.users.user_metadata (and potentially for profile trigger if you have one)
        data: {
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

    // Prepare data for the 'profiles' table, aligning with the UserProfile interface and DB schema
    const parsedAge = formData.age && formData.age.trim() !== '' ? parseInt(formData.age, 10) : null;
    if (formData.age && formData.age.trim() !== '' && (isNaN(parsedAge) || parsedAge <= 0)) {
      console.error("Invalid age value provided for profile:", formData.age);
      setLoading(false);
      const ageError = { name: "ValidationError", message: "Age must be a positive number if provided." } as AuthError;
      toast({ title: "Registration Failed", description: ageError.message, variant: "destructive" });
      // Attempt to sign out the user if profile creation failed due to form validation
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after form validation failure:", e));
      setUser(null);
      setProfile(null);
      return { error: ageError, user: authUser, profile: null };
    }

    const skillsArray = formData.skills && formData.skills.trim() !== ''
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
      : null; // Ensure null if empty, for TEXT[]

    const profileDataToInsert: Omit<UserProfile, 'id' | 'followers_count' | 'following_count'> = {
      user_id: authUser.id, // This is the UUID from auth.users.id, FK in profiles
      email: authUser.email!,
      full_name: formData.full_name?.trim() || authUser.email?.split('@')[0] || 'New User',
      age: (parsedAge !== null && !isNaN(parsedAge)) ? parsedAge : null, // number | null
      gender: formData.gender?.trim() || null,
      skills: skillsArray, // string[] | null
      linkedin_url: formData.linkedin_url?.trim() || null,
      github_url: formData.github_url?.trim() || null,
      description: formData.description?.trim() || null,
      achievements: formData.achievements?.trim() || null,
    };
    
    console.log('Attempting to insert profile into Supabase with data:', profileDataToInsert);

    const { error: profileError, data: newProfileData } = await supabase
      .from("profiles")
      .insert(profileDataToInsert)
      .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
      .single();

    if (profileError) {
      console.error("Error creating profile during signup:", JSON.stringify(profileError, Object.getOwnPropertyNames(profileError), 2));
      setLoading(false);
      // Attempt to sign out the user if profile creation failed, to avoid inconsistent state
      // Also, consider if the auth user should be deleted if profile creation is mandatory.
      await supabase.auth.signOut().catch(e => console.error("Error signing out user after profile creation failure:", e));
      setUser(null); 
      setProfile(null);

      let toastMessage = profileError.message;
      if (profileError.code === '42501') { // RLS violation
        toastMessage = "RLS policy violated. Check Supabase 'profiles' table INSERT policy. Crucial checks: 1. Policy is: (auth.uid() = user_id AND auth.jwt()->>'email' = email). 2. 'user_id' in policy MUST be your UUID column linked to auth.users. 3. 'email' in policy MUST be your TEXT column for user's email. 4. No typos in policy or column names. 5. Disable DB triggers for diagnostics.";
      } else if (profileError.code === '23505') { // Unique constraint violation
        toastMessage = `Profile creation failed: ${profileError.message}. This email or user ID might already have a profile.`;
      } else if (profileError.code === '23503') { // Foreign key violation
         toastMessage = `Profile creation failed due to a data inconsistency (foreign key): ${profileError.message}. Ensure user_id is valid.`;
      } else if (profileError.message.toLowerCase().includes("invalid input for type integer") && profileError.message.toLowerCase().includes("age")){
        toastMessage = "Profile creation failed: The age provided is not a valid number. Please enter a whole number for age."
      } else if (profileError.message.toLowerCase().includes("malformed array literal") && profileError.message.toLowerCase().includes("skills")) {
        toastMessage = "Profile creation failed: The skills format is incorrect. Ensure skills are comma-separated if providing multiple."
      }
      toast({ title: "Profile Creation Failed", description: toastMessage, variant: "destructive", duration: 15000 });
      return { error: profileError as any, user: authUser, profile: null };
    }

    console.log("Profile created successfully in Supabase:", newProfileData);
    setProfile(newProfileData as UserProfile);
    setLoading(false);
    toast({ title: "Registration Successful", description: "Welcome! Your profile has been created. Please check your email to verify your account." });
    // router.push("/home"); // Navigation handled by onAuthStateChange
    return { error: null, user: authUser, profile: newProfileData as UserProfile };
  }, [router, fetchUserProfile]);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    console.log("Attempting Supabase Google Sign-In. Final redirectTo for Supabase (after its callback):", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    // setLoading(false) is tricky here because signInWithOAuth redirects. 
    // The loading state will be reset by onAuthStateChange or page navigation.
    if (error) {
      console.error("Supabase Google Sign-In error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        title: "Google Sign-In Failed",
        description: `${error.message || "An unexpected error occurred."} Ensure pop-ups are not blocked. Check Google Cloud OAuth Consent Screen and Supabase Google Provider settings.`,
        variant: "destructive",
        duration: 10000,
      });
       setLoading(false); // Set loading false if error occurs before redirect
    }
    return { error };
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false); // Reset loading regardless of error, onAuthStateChange will handle state
    if (error) {
      console.error("Supabase Sign-Out error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // router.push("/"); // Navigation handled by onAuthStateChange
    }
    return { error };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    // Redirect URL for after the user clicks the password reset link in their email
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login?message=Password-reset-link-used-please-set-new-password` : undefined; 
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo, // This is where the user will be redirected to set a new password
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

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'email' | 'followers_count' | 'following_count'>>) => {
    if (!user || !user.id) { // Check against context's user state
      const authError = { name: "AuthError", message: "User not authenticated for Supabase profile update." } as AuthError;
      console.error(authError.message);
      toast({ title: "Update Failed", description: authError.message, variant: "destructive" });
      return { error: authError, data: null };
    }
    setLoading(true);

    const updatesForSupabase: Record<string, any> = {};

    // Handle 'full_name'
    if (updates.hasOwnProperty('full_name')) {
      updatesForSupabase.full_name = updates.full_name?.trim() || null;
    }

    // Handle 'age' (convert string from form to number for DB)
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
    
    // Handle 'gender'
    if (updates.hasOwnProperty('gender')) {
      updatesForSupabase.gender = updates.gender?.trim() || null;
    }
    
    // Handle 'skills' (convert comma-separated string from form to string array for DB)
    if (updates.hasOwnProperty('skills')) {
      if (updates.skills === null || updates.skills === undefined) {
        updatesForSupabase.skills = null;
      } else if (Array.isArray(updates.skills)) { // Already an array
        const skillsArray = updates.skills.map(s => String(s).trim()).filter(s => s);
        updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
      } else if (typeof updates.skills === 'string') { // Comma-separated string
        const skillsArray = updates.skills.split(',').map(s => s.trim()).filter(s => s);
        updatesForSupabase.skills = skillsArray.length > 0 ? skillsArray : null;
      }
    }
    
    // Handle other text fields
    if (updates.hasOwnProperty('linkedin_url')) updatesForSupabase.linkedin_url = updates.linkedin_url?.trim() || null;
    if (updates.hasOwnProperty('github_url')) updatesForSupabase.github_url = updates.github_url?.trim() || null;
    if (updates.hasOwnProperty('description')) updatesForSupabase.description = updates.description?.trim() || null;
    if (updates.hasOwnProperty('achievements')) updatesForSupabase.achievements = updates.achievements?.trim() || null;
    
    // Remove undefined properties that were not explicitly handled above
    Object.keys(updatesForSupabase).forEach(key => {
        if (updatesForSupabase[key] === undefined) {
            delete updatesForSupabase[key];
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
      .eq("user_id", user.id) // Use the auth user's UUID for matching
      .select('id, user_id, email, full_name, age, gender, skills, linkedin_url, github_url, description, achievements, followers_count, following_count')
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
  }, [user, profile, fetchUserProfile]); // Added fetchUserProfile to dependencies as profile update might affect other parts relying on fresh profile data.

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
  age INTEGER, -- Stored as INTEGER
  gender TEXT,
  skills TEXT[], -- Array of text for skills (TEXT[])
  linkedin_url TEXT,
  github_url TEXT,
  description TEXT,
  achievements TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL -- Added for good practice
);

-- RLS POLICIES (ensure 'user_id' refers to the UUID column linked to auth.users):
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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
