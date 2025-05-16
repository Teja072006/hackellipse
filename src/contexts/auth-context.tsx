// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser, AuthError } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as updateFirebaseProfile, // Firebase Auth profile update
  UserCredential,
  onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, DocumentData } from "firebase/firestore";
import { auth, db } from "@/lib/firebase"; // Use the initialized Firebase instances

// Profile data stored in Firestore
export interface UserProfile {
  uid: string; // Matches Firebase Auth UID
  email: string | null; // From Firebase Auth
  name?: string | null;
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
  createdAt?: Timestamp; // Firestore Timestamp
  updatedAt?: Timestamp; // Firestore Timestamp
}

// Data passed during sign up for profile creation in Firestore
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
        // Convert Firestore Timestamps to serializable format if necessary, or handle as Timestamps
        const profileData = profileSnap.data() as Omit<UserProfile, 'uid'>;
        return { uid: firebaseUser.uid, ...profileData };
      } else {
        console.log(`No profile found in Firestore for user ${firebaseUser.uid}. A basic one might be created on demand or during signup.`);
        // Optionally create a basic profile if it doesn't exist, though signup handles this
        return null;
      }
    } catch (error: any) {
      console.error("Error fetching Firebase user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
        console.error(
          'Error fetching profile (Network Issue - Failed to fetch with Firebase):',
          'This usually means the application could not reach the Firebase/Firestore server. Please double-check:',
          '1. Your Firebase config in .env (NEXT_PUBLIC_FIREBASE_...).',
          '2. Your internet connection and any firewalls/proxies.',
          '3. Firestore security rules allow reads for authenticated users.',
          'Detailed error:',
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
        );
      }
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

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      // onAuthStateChanged will handle setting user and profile
      setLoading(false);
      router.push("/home");
      return { error: null };
    } catch (error) {
      setLoading(false);
      return { error: error as AuthError };
    }
  }, [router]);

  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpProfileData }) => {
    setLoading(true);
    try {
      const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
      const authUser = userCredential.user;

      if (!authUser) {
        throw new Error("User creation failed, no user returned from Firebase Auth.");
      }

      // Update Firebase Auth display name
      await updateFirebaseProfile(authUser, {
        displayName: credentials.data.name,
        // photoURL: credentials.data.photo_url || null, // If you manage photoURL via form
      });

      // Prepare profile data for Firestore, ensure all optional fields are handled
      const profileDataToCreate: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'> & { createdAt: Timestamp, updatedAt: Timestamp } = {
        email: authUser.email, // Should not be null for a newly created user
        name: credentials.data.name || authUser.email?.split('@')[0] || 'New User',
        age: credentials.data.age && !isNaN(Number(credentials.data.age)) ? Number(credentials.data.age) : null,
        gender: credentials.data.gender || null,
        skills: credentials.data.skills?.length ? credentials.data.skills : null,
        linkedin_url: credentials.data.linkedin_url || null,
        github_url: credentials.data.github_url || null,
        description: credentials.data.description || null,
        achievements: credentials.data.achievements || null,
        followers_count: 0,
        following_count: 0,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };
      
      const profileRef = doc(db, "users", authUser.uid);
      await setDoc(profileRef, profileDataToCreate);
      
      // Fetch the newly created profile to include server-generated timestamps
      const newProfileSnap = await getDoc(profileRef);
      const newProfile = newProfileSnap.exists() ? { uid: authUser.uid, ...newProfileSnap.data() } as UserProfile : null;

      setProfile(newProfile); // Optimistically update profile state
      setUser(authUser); // Ensure user is set in context
      setLoading(false);
      router.push("/home");
      return { error: null, user: authUser, profile: newProfile };
    } catch (error: any) {
      console.error("Error during Firebase signup or profile creation:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      // Attempt to sign out the user if auth succeeded but profile creation failed
      if (auth.currentUser) {
        await signOut(auth).catch(e => console.error("Error signing out user after profile creation failure:", e));
        setUser(null); // Clear user from state
      }
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [router]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const authUser = result.user;
      // onAuthStateChanged will fetch/create profile
      // If profile creation for Google users needs to be more explicit, add logic here:
      const profileRef = doc(db, "users", authUser.uid);
      const profileSnap = await getDoc(profileRef);
      let userProfile: UserProfile | null = null;

      if (!profileSnap.exists()) {
        console.log(`New Google user ${authUser.uid}. Creating profile in Firestore.`);
        const newProfileData: UserProfile = {
          uid: authUser.uid,
          email: authUser.email,
          name: authUser.displayName || authUser.email?.split('@')[0] || 'New User',
          followers_count: 0,
          following_count: 0,
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
          // Other fields can be null/undefined or set to defaults
        };
        await setDoc(profileRef, newProfileData);
        userProfile = newProfileData;
      } else {
        userProfile = { uid: authUser.uid, ...profileSnap.data() } as UserProfile;
      }
      
      setProfile(userProfile); // Update profile in context
      setLoading(false);
      router.push("/home");
      return { error: null, user: authUser, profile: userProfile };
    } catch (error) {
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [router]);

  const signOutUser = useCallback(async () => {
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

  const sendPasswordReset = useCallback(async (email: string) => {
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

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>) => {
    if (!user) {
      return { error: { message: "User not authenticated." } as any, data: null };
    }
    setLoading(true);
    
    const profileRef = doc(db, "users", user.uid);
    // Ensure Firebase Auth display name is updated if 'name' is in updates
    if (updates.name !== undefined && auth.currentUser) {
      await updateFirebaseProfile(auth.currentUser, { displayName: updates.name });
    }
    
    const dataToUpdateFirestore: Partial<UserProfile> & { updatedAt: Timestamp } = {
      ...updates,
      updatedAt: serverTimestamp() as Timestamp,
    };

    try {
      await updateDoc(profileRef, dataToUpdateFirestore as DocumentData); // Cast to DocumentData
      
      const updatedProfileSnap = await getDoc(profileRef);
      const updatedProfileData = updatedProfileSnap.exists() ? { uid: user.uid, ...updatedProfileSnap.data() } as UserProfile : null;
      
      setProfile(updatedProfileData);
      setUser(auth.currentUser); // Refresh auth user state just in case (e.g. displayName)
      setLoading(false);
      return { error: null, data: updatedProfileData };
    } catch (error: any) {
      console.error('Error updating Firebase profile:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      setLoading(false);
      return { error, data: null };
    }
  }, [user]);

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

    