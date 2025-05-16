
// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser, AuthError } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseProfile,
  GoogleAuthProvider
} from "firebase/auth";
import { auth, db, googleProvider } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, FieldValue } from "firebase/firestore";
import React, { createContext, useState, useEffect, useCallback, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "@/hooks/use-toast";

// Firestore User Profile Structure
export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null;
  photoURL?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null; // Stored as an array in Firestore
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

// For the registration form data
type SignUpFormDataFromForm = {
  full_name: string;
  age?: string;
  gender?: string;
  skills?: string; // Comma-separated string from form
  linkedin_url?: string;
  github_url?: string;
  description?: string;
  achievements?: string;
};

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: { email: string, password: string }) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: { email: string, password: string, data: SignUpFormDataFromForm }) => Promise<{ error: AuthError | null; user: FirebaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null; user: FirebaseUser | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count'>>) => Promise<{ error: Error | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    if (!firebaseUser?.uid) {
      console.warn("fetchUserProfile: firebaseUser or UID is missing.");
      return null;
    }
    console.log("Fetching Firestore profile for UID:", firebaseUser.uid);
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data() as UserProfile;
        return {
          ...profileData,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || profileData.photoURL,
        };
      } else {
        console.log(`No Firestore profile for UID ${firebaseUser.uid}. This might be a new user.`);
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          full_name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "New User",
          photoURL: firebaseUser.photoURL,
          followers_count: 0,
          following_count: 0,
        };
      }
    } catch (error: any) {
      console.error("Error fetching Firestore user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      if (error.code === "unavailable" || error.message?.includes("client is offline")) {
        toast({
            title: "Network Error",
            description: "Could not connect to the database. Please check your internet connection and Firebase setup.",
            variant: "destructive",
            duration: 7000,
        });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Firebase onAuthStateChanged. User UID:", firebaseUser?.uid);
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const userProfileData = await fetchUserProfile(firebaseUser);
        setProfile(userProfileData);
        if (pathname === "/login" || pathname === "/register") {
            router.push("/home");
        }
      } else {
        setUser(null);
        setProfile(null);
        if (!["/", "/login", "/register", "/forgot-password"].includes(pathname) && !pathname.startsWith("/content/")) {
            // Only redirect if not on public pages
           // router.push("/login"); // AuthenticatedLayout handles this for / (main) routes
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchUserProfile, router, pathname]);

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      // onAuthStateChanged will handle user/profile state and navigation
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpFormDataFromForm }) => {
    setLoading(true);
    const { email, password, data: formData } = credentials;
    console.log("Attempting Firebase auth sign up with email:", email);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const authUser = userCredential.user;
      console.log("Firebase authUser created UID:", authUser.uid);

      await updateFirebaseProfile(authUser, {
        displayName: formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User",
      });

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
          const numAge = parseInt(formData.age, 10);
          if (!isNaN(numAge) && numAge > 0) parsedAge = numAge;
      }

      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataForFirestore: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User",
        photoURL: authUser.photoURL,
        age: parsedAge,
        gender: formData.gender?.trim() || null,
        skills: skillsArray,
        linkedin_url: formData.linkedin_url?.trim() || null,
        github_url: formData.github_url?.trim() || null,
        description: formData.description?.trim() || null,
        achievements: formData.achievements?.trim() || null,
        followers_count: 0,
        following_count: 0,
      };
      
      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, {
        ...profileDataForFirestore,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      const newProfile = await fetchUserProfile(authUser); // Fetch to ensure local state is up-to-date
      setProfile(newProfile); // Update local profile state immediately

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      setLoading(false);
      // onAuthStateChanged will handle user state, router.push in register page will navigate
      return { error: null, user: authUser, profile: newProfile };

    } catch (error: any) {
      console.error("Firebase Sign-Up error:", error);
      toast({ title: "Registration Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [fetchUserProfile]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const authUser = result.user;
      console.log("Firebase Google Sign-In successful. User UID:", authUser.uid);

      const userDocRef = doc(db, "users", authUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        console.log("No Firestore profile for Google user, creating basic profile...");
        const basicProfileData: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
          uid: authUser.uid,
          email: authUser.email,
          full_name: authUser.displayName || authUser.email?.split('@')[0] || "New User",
          photoURL: authUser.photoURL,
          followers_count: 0,
          following_count: 0,
          age: null, gender: null, skills: null, linkedin_url: null, github_url: null, description: null, achievements: null,
        };
        await setDoc(userDocRef, { ...basicProfileData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        // Profile will be fetched by onAuthStateChanged
      }
      toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
      // onAuthStateChanged will handle user/profile state and navigation
      return { error: null, user: authUser };
    } catch (error: any) {
      console.error("Firebase Google Sign-In error:", error);
      let desc = error.message || "An unexpected error occurred.";
      if (error.code === 'auth/popup-blocked') desc = "Google Sign-In popup was blocked by your browser. Please allow popups for this site.";
      if (error.code === 'auth/popup-closed-by-user') desc = "Google Sign-In popup was closed. Please try again.";
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive" });
      setLoading(false);
      return { error: error as AuthError, user: null };
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      // onAuthStateChanged will set user/profile to null
      router.push("/"); // Navigate to landing after sign out
    } catch (error: any) {
      console.error("Firebase Sign-Out error:", error);
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
    return { error: null };
  }, [router]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Password Reset Email Sent", description: "Check your email for instructions." });
      setLoading(false);
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Password Reset error:", error);
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count'>>) => {
    if (!user?.uid) {
      const err = { name: "AuthError", message: "User not authenticated." } as AuthError;
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
      return { error: err, data: null };
    }
    setLoading(true);
    const userDocRef = doc(db, "users", user.uid);
    
    const firestoreUpdates: Record<string, any> = { ...updates };
    if (updates.age && typeof updates.age === 'string') {
      firestoreUpdates.age = parseInt(updates.age, 10) || null;
    }
    if (updates.skills && typeof updates.skills === 'string') {
      firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else if (updates.skills === null || (Array.isArray(updates.skills) && updates.skills.length === 0)) {
      firestoreUpdates.skills = null;
    }


    try {
      await updateDoc(userDocRef, { ...firestoreUpdates, updatedAt: serverTimestamp() });
      if (updates.full_name || updates.photoURL) { // Firebase Auth profile update
        await updateFirebaseProfile(user, { displayName: updates.full_name, photoURL: updates.photoURL });
      }
      const updatedProfileData = await fetchUserProfile(user); // Re-fetch to get merged data
      setProfile(updatedProfileData);
      toast({ title: "Profile Updated!", description: "Your SkillForge profile has been saved." });
      setLoading(false);
      return { error: null, data: updatedProfileData };
    } catch (error: any) {
      console.error('Error updating Firestore profile:', error);
      toast({ title: "Profile Update Failed", description: error.message, variant: "destructive" });
      setLoading(false);
      return { error: error as Error, data: null };
    }
  }, [user, fetchUserProfile]);

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
    throw new Error("useAuth must be used within an AuthProvider (Firebase version)");
  }
  return context;
};
