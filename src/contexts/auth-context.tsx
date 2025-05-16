
// src/contexts/auth-context.tsx
"use client";

import type { User as SupabaseUser, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
// import { useRouter } from "next/navigation"; // Temporarily commented for diagnosis

// Define a shape for your user profile data stored in Supabase
export interface UserProfile {
  id: string;
  name?: string | null;
  email?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  resume_file_url?: string | null;
  followers_count?: number;
  following_count?: number;
  created_at?: string;
  updated_at?: string;
  last_login?: string;
}

interface AuthContextType {
  user: SupabaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: SignUpWithPasswordCredentials & { data?: Record<string, any> }) => Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }>;
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
      .select('*')
      .eq('id', userId)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as UserProfile | null;
  }, []); // supabase is stable

  useEffect(() => {
    setLoading(true);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const userProfile = await fetchUserProfile(currentUser.id);
          setProfile(userProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

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

    return () => {
      authListener?.unsubscribe();
    };
  }, [fetchUserProfile]);

  // Simplified signIn for diagnosis
  const signIn = useCallback(async (credentials: SignInWithPasswordCredentials): Promise<{ error: AuthError | null }> => {
    console.log("Attempting to call actual signIn logic for:", credentials.email);
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
  }, [fetchUserProfile, setLoading, setUser, setProfile]); // Dependencies are state setters and memoized fetchUserProfile

  const signUp = useCallback(async (credentials: SignUpWithPasswordCredentials & { data?: Record<string, any> }): Promise<{ error: AuthError | null; user: SupabaseUser | null; profile: UserProfile | null }> => {
    setLoading(true);
    const { data: { user: authUser, session }, error: signUpError } = await supabase.auth.signUp({
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

    if (authUser) {
      const profileDataToInsert: Omit<UserProfile, 'id' | 'created_at' | 'updated_at' | 'last_login' | 'followers_count' | 'following_count'> & { id: string, created_at: string, updated_at: string, last_login: string } = {
        id: authUser.id,
        email: authUser.email,
        name: credentials.data?.name || authUser.user_metadata?.name || authUser.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      };
      
      if (credentials.data?.age && typeof credentials.data.age === 'number' && !isNaN(credentials.data.age) && credentials.data.age > 0) {
        profileDataToInsert.age = credentials.data.age;
      }
      if (credentials.data?.gender && credentials.data.gender.trim() !== '') {
        profileDataToInsert.gender = credentials.data.gender;
      }
      if (credentials.data?.skills) {
        const skillsArray = Array.isArray(credentials.data.skills) ? credentials.data.skills.filter(s => s && s.trim() !== '') : String(credentials.data.skills).split(',').map(skill => skill.trim()).filter(skill => skill);
        if (skillsArray.length > 0) {
            profileDataToInsert.skills = skillsArray;
        }
      }
      if (credentials.data?.linkedin_url && credentials.data.linkedin_url.trim() !== '') {
        profileDataToInsert.linkedin_url = credentials.data.linkedin_url;
      }
      if (credentials.data?.github_url && credentials.data.github_url.trim() !== '') {
        profileDataToInsert.github_url = credentials.data.github_url;
      }
      if (credentials.data?.description && credentials.data.description.trim() !== '') {
        profileDataToInsert.description = credentials.data.description;
      }
      if (credentials.data?.achievements && credentials.data.achievements.trim() !== '') {
        profileDataToInsert.achievements = credentials.data.achievements;
      }

      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert(profileDataToInsert as any)
        .select()
        .single();

      if (profileError) {
        console.error("Error creating profile during signup:", profileError);
        setLoading(false);
        return { error: profileError as any, user: authUser, profile: null };
      }
      setProfile(newProfile as UserProfile);
      setUser(authUser);
      setLoading(false);
      // if (router) router.push("/home"); // Temporarily commented
      return { error: null, user: authUser, profile: newProfile as UserProfile };
    }
    setLoading(false);
    return { error: { name: "SignUpError", message: "User not returned after sign up."} as AuthError, user: null, profile: null };
  }, [fetchUserProfile, setLoading, setUser, setProfile]);

  const signInWithGoogle = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) setLoading(false);
    return { error };
  }, [setLoading]);

  const signOutUser = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    // if (router) router.push('/login'); // Temporarily commented
    return { error };
  }, [setLoading, setUser, setProfile]);

  const sendPasswordReset = useCallback(async (email: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    return { error };
  }, [setLoading]);

  const updateUserProfile = useCallback(async (userId: string, updates: Partial<UserProfile>): Promise<{ error: any | null; data: UserProfile | null }> => {
    let processedUpdates = { ...updates };
    if (updates.skills && typeof updates.skills === 'string') {
        processedUpdates.skills = (updates.skills as string).split(',').map(skill => skill.trim()).filter(skill => skill);
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ ...processedUpdates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return { error, data: null };
    }
    if (data) {
      setProfile(prevProfile => ({...(prevProfile || {} as UserProfile), ...data} as UserProfile));
    }
    return { error: null, data: data as UserProfile };
  }, [setProfile]);

  // Ensure all functions are defined before this point
  const contextValue: AuthContextType = {
    user,
    profile,
    loading,
    signIn, // Uses the 'signIn' const defined above
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
