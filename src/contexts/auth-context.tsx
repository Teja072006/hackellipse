
// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser, AuthError } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  signOut,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseAuthProfile,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, FieldValue, increment } from "firebase/firestore";
import React, { createContext, useState, useEffect, useCallback, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "@/hooks/use-toast";

// GAPI client for Google Sign-In
declare global {
  interface Window {
    gapi: any;
    google?: any; // For newer GIS if we ever switch back
  }
}

export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null;
  photoURL?: string | null; // Primarily from Firebase Auth, can be custom later
  age?: number | null; // Stored as number in Firestore
  gender?: string | null;
  skills?: string[] | null; // Stored as array of strings in Firestore
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

type SignUpFormDataFromForm = {
  full_name: string;
  age?: string; // From form, will be converted to number
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
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count' | 'photoURL'>>) => Promise<{ error: Error | null; data: UserProfile | null }>;
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
        const firestoreProfileData = userDocSnap.data() as Omit<UserProfile, 'uid' | 'email' | 'photoURL'>;
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || firestoreProfileData.photoURL || null,
          ...firestoreProfileData,
        };
      } else {
        console.log(`No Firestore profile for UID ${firebaseUser.uid}. This is normal for a new user or if profile creation is pending.`);
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
      console.error("Error fetching Firebase user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      if (error.code === "unavailable") {
        toast({ title: "Network Error", description: "Could not connect to the database. Ensure Firestore is enabled and rules are set.", variant: "destructive" });
      } else if (error.code === 'permission-denied') {
         toast({ title: "Permission Denied", description: "Failed to fetch profile. Check Firestore security rules.", variant: "destructive"});
      }
      return null;
    }
  }, []);
  
  useEffect(() => {
    const gapiInit = () => {
      if (window.gapi && typeof window.gapi.load === 'function') {
        window.gapi.load("client:auth2", async () => {
          try {
            if (!window.gapi.auth2.getAuthInstance()) {
              await window.gapi.client.init({
                clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
                scope: "profile email",
              });
              console.log("GAPI client:auth2 initialized for Google Sign-In.");
            }
          } catch (initError) {
            console.error("Error initializing GAPI client:auth2:", initError);
          }
        });
      } else {
         console.warn("GAPI client (platform.js) not loaded yet.");
      }
    };
    if (typeof window !== 'undefined') gapiInit();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
      const displayName = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User";
      await updateFirebaseAuthProfile(authUser, { displayName });

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
          const numAge = parseInt(formData.age, 10);
          if (!isNaN(numAge) && numAge > 0) parsedAge = numAge;
      }
      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataForFirestore: UserProfile = { // Use UserProfile type directly
        uid: authUser.uid,
        email: authUser.email,
        full_name: displayName,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, profileDataForFirestore);
      
      const newProfile = await fetchUserProfile(authUser);
      setProfile(newProfile);

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      setLoading(false);
      return { error: null, user: authUser, profile: newProfile };
    } catch (error: any) {
      console.error("Firebase Sign-Up error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [fetchUserProfile]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    console.log("Attempting Google Sign-In via GAPI for SkillForge...");

    const loadGapiAndInitClient = (): Promise<void> => {
        return new Promise((resolve, reject) => {
          if (!window.gapi || typeof window.gapi.load !== 'function') {
            return reject(new Error("GAPI client (platform.js) not loaded."));
          }
          window.gapi.load("client:auth2", async () => {
            try {
              if (!window.gapi.auth2.getAuthInstance()) {
                await window.gapi.client.init({
                  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
                  scope: "profile email",
                });
              }
              resolve();
            } catch (initError) { reject(initError); }
          });
        });
      };
  
    try {
      await loadGapiAndInitClient();
      const googleAuthInstance = window.gapi.auth2.getAuthInstance();
      if (!googleAuthInstance) throw new Error("Google Auth instance failed to initialize.");
      
      const googleUser = await googleAuthInstance.signIn();
      const idToken = googleUser.getAuthResponse().id_token;
      if (!idToken) throw new Error("No ID token from Google.");

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      const authUser = result.user;

      const userDocRef = doc(db, "users", authUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        const profileData: UserProfile = {
          uid: authUser.uid,
          email: authUser.email,
          full_name: authUser.displayName || authUser.email?.split('@')[0] || "New User",
          photoURL: authUser.photoURL,
          followers_count: 0,
          following_count: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userDocRef, profileData);
      }
      
      toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
      setLoading(false);
      return { error: null, user: authUser };
    } catch (error: any) {
      console.error("GAPI + Firebase Sign-In Error:", error);
      let desc = error.message || "An unexpected error occurred.";
      if (error.code === "auth/popup-closed-by-user" || error.error === "popup_closed_by_user") {
        desc = "Google Sign-In popup was closed. Please allow popups and check Google OAuth Consent screen settings if in 'Testing' mode.";
      } else if (error.error === 'idpiframe_initialization_failed') {
        desc = "Google Sign-In failed: Third-party cookies might be disabled.";
      }
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive", duration: 7000 });
      setLoading(false);
      return { error: error as AuthError, user: null };
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    try {
      if (window.gapi?.auth2?.getAuthInstance()?.isSignedIn.get()) {
        await window.gapi.auth2.getAuthInstance().signOut();
      }
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push("/");
    } catch (error: any) {
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
      toast({ title: "Password Reset Email Sent", description: "Check your email." });
      return { error: null };
    } catch (error: any) {
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
      return { error: error as AuthError };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count' | 'photoURL'>>) => {
    if (!user?.uid) {
      return { error: new Error("User not authenticated.") as AuthError, data: null };
    }
    setLoading(true);
    const userDocRef = doc(db, "users", user.uid);
    const firestoreUpdates: Record<string, any> = { ...updates };

    if (updates.age && typeof updates.age === 'string') {
        const numAge = parseInt(updates.age, 10);
        firestoreUpdates.age = !isNaN(numAge) ? numAge : null;
    } else if (updates.age === undefined) {
        delete firestoreUpdates.age; // Don't send if undefined
    }

    if (updates.skills && typeof updates.skills === 'string') {
      firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(Boolean);
    } else if (updates.skills === undefined) {
        delete firestoreUpdates.skills;
    } else if (Array.isArray(updates.skills) && updates.skills.length === 0) {
        firestoreUpdates.skills = [];
    }
    
    // Update Firebase Auth displayName if full_name is changing
    if (updates.full_name && auth.currentUser && updates.full_name !== auth.currentUser.displayName) {
        try {
            await updateFirebaseAuthProfile(auth.currentUser, { displayName: updates.full_name });
        } catch (authProfileError) {
            console.warn("Could not update Firebase Auth displayName:", authProfileError);
        }
    }

    try {
      await updateDoc(userDocRef, { ...firestoreUpdates, updatedAt: serverTimestamp() });
      const updatedProfileData = await fetchUserProfile(user);
      setProfile(updatedProfileData);
      toast({ title: "Profile Updated!", description: "Your SkillForge profile has been saved." });
      return { error: null, data: updatedProfileData };
    } catch (error: any) {
      toast({ title: "Profile Update Failed", description: error.message, variant: "destructive" });
      return { error: error as Error, data: null };
    } finally {
      setLoading(false);
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
