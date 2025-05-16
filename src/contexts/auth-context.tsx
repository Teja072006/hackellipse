// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser, AuthError } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as updateFirebaseProfile,
  UserCredential
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase"; // Use the initialized Firebase instances

// Profile data stored in Firestore
export interface UserProfile {
  uid: string; // Matches Firebase Auth UID
  email: string | null; // From Firebase Auth
  name?: string | null; // Custom name, can differ from auth.displayName
  // photoURL is on auth.currentUser.photoURL, not typically duplicated here unless custom upload is implemented
  age?: number | null;
  gender?: string |null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Data passed during sign up for profile creation
type SignUpProfileData = Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count'> & {
    name: string; // Make name mandatory for initial profile data
};

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null; // Firestore profile data
  loading: boolean;
  signIn: (credentials: {email: string, password: string}) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: {email: string, password: string, data: SignUpProfileData }) => Promise<{ error: AuthError | null; user: FirebaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null, user: FirebaseUser | null, profile: UserProfile | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>) => Promise<{ error: any | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    if (!firebaseUser) return null;
    const profileRef = doc(db, "users", firebaseUser.uid);
    try {
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        return { uid: firebaseUser.uid, ...profileSnap.data() } as UserProfile;
      } else {
        console.log(`No profile found in Firestore for user ${firebaseUser.uid}, creating one.`);
        // If profile doesn't exist, create a basic one from auth data
        const newProfileData: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'New User',
          followers_count: 0,
          following_count: 0,
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
        };
        await setDoc(profileRef, newProfileData);
        return newProfileData;
      }
    } catch (error: any) {
      console.error("Error fetching/creating user profile from Firestore:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const userProfileData = await fetchUserProfile(firebaseUser);
        setProfile(userProfileData);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchUserProfile]);

  const signInUser = useCallback(async (credentials: {email: string, password: string}) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      // onAuthStateChanged will handle setting user and profile
      setLoading(false);
      return { error: null };
    } catch (error) {
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const signUpUser = useCallback(async (credentials: {email: string, password: string, data: SignUpProfileData }) => {
    setLoading(true);
    try {
      const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
      const authUser = userCredential.user;

      if (!authUser) {
        throw new Error("User creation failed, no user returned.");
      }

      // Update Firebase Auth display name
      await updateFirebaseProfile(authUser, {
        displayName: credentials.data.name,
      });

      // Create profile in Firestore
      const profileRef = doc(db, "users", authUser.uid);
      const newProfileData: UserProfile = {
        uid: authUser.uid,
        email: authUser.email,
        name: credentials.data.name, // Use provided name
        age: credentials.data.age ?? null,
        gender: credentials.data.gender ?? null,
        skills: credentials.data.skills ?? null,
        linkedin_url: credentials.data.linkedin_url ?? null,
        github_url: credentials.data.github_url ?? null,
        description: credentials.data.description ?? null,
        achievements: credentials.data.achievements ?? null,
        followers_count: 0,
        following_count: 0,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };
      await setDoc(profileRef, newProfileData);
      
      setProfile(newProfileData); // Optimistically update profile
      setUser(authUser); // Ensure user is set in context
      setLoading(false);
      router.push("/home");
      return { error: null, user: authUser, profile: newProfileData };
    } catch (error) {
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [router]);

  const signInWithGoogleUser = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const authUser = result.user;
      // onAuthStateChanged will fetch/create profile
      setLoading(false);
      // router.push("/home"); // Navigation can be handled by onAuthStateChanged effect or a redirect from login page
      return { error: null, user: authUser, profile }; // Profile might be stale here, onAuthStateChanged will get the latest
    } catch (error) {
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [profile]);

  const signOutUserFunc = useCallback(async () => {
    setLoading(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will set user and profile to null
      setLoading(false);
      router.push("/");
      return { error: null };
    } catch (error) {
      setLoading(false);
      return { error: error as AuthError };
    }
  }, [router]);

  const sendPasswordResetEmailFunc = useCallback(async (email: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setLoading(false);
      return { error: null };
    } catch (error) {
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const updateUserProfileFunc = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>) => {
    if (!user) {
      return { error: { message: "User not authenticated." } as any, data: null };
    }
    setLoading(true);
    
    const profileRef = doc(db, "users", user.uid);
    const dataToUpdate: any = { ...updates, updatedAt: serverTimestamp() };

    // Handle Firebase Auth profile updates for basic fields if they are part of 'updates'
    const authUpdates: { displayName?: string | null; photoURL?: string | null } = {};
    if (updates.name !== undefined) authUpdates.displayName = updates.name;
    // if (updates.photoURL !== undefined) authUpdates.photoURL = updates.photoURL; // If you add custom photoURL management

    try {
      if (Object.keys(authUpdates).length > 0) {
        await updateFirebaseProfile(user, authUpdates);
      }
      await updateDoc(profileRef, dataToUpdate);
      
      const updatedProfileSnap = await getDoc(profileRef);
      const updatedProfileData = updatedProfileSnap.exists() ? { uid: user.uid, ...updatedProfileSnap.data() } as UserProfile : null;
      
      setProfile(updatedProfileData);
      setUser(auth.currentUser); // Refresh auth user state
      setLoading(false);
      return { error: null, data: updatedProfileData };
    } catch (error: any) {
      console.error('Error updating profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      setLoading(false);
      return { error, data: null };
    }
  }, [user]);

  const contextValue: AuthContextType = {
    user,
    profile,
    loading,
    signIn: signInUser,
    signUp: signUpUser,
    signInWithGoogle: signInWithGoogleUser,
    signOutUser: signOutUserFunc,
    sendPasswordReset: sendPasswordResetEmailFunc,
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
