
// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser, AuthError } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseAuthProfile,
  GoogleAuthProvider, // Keep this for credential creation
  signInWithCredential, // Used with GAPI
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, FieldValue, increment, collection, query, where, getDocs } from "firebase/firestore";
import React, { createContext, useState, useEffect, useCallback, useContext, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "@/hooks/use-toast"; // Ensure this path is correct

// GAPI types for Google Sign-In
declare global {
  interface Window {
    gapi: any; // For gapi.auth2
    google: any; // For GIS library
  }
}

export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null;
  photoURL?: string | null; // From Firebase Auth or custom
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null; // Stored as array of strings
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

// For registration form data
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
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count'>>) => Promise<{ error: Error | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    if (!firebaseUser?.uid) return null;
    console.log("Fetching Firestore profile for UID:", firebaseUser.uid);
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const firestoreProfileData = userDocSnap.data() as Omit<UserProfile, 'uid'>; // uid is from firebaseUser
        return {
          uid: firebaseUser.uid, // Ensure UID from authUser is primary
          ...firestoreProfileData,
          email: firebaseUser.email, // Ensure email from authUser is primary
          photoURL: firebaseUser.photoURL || firestoreProfileData.photoURL || null, // Prioritize authUser.photoURL
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This is normal for a new user or if profile creation is pending.`);
        return { // Return a basic profile structure based on authUser
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
         toast({ title: "Network Error", description: "Could not connect to Firestore. Please check your internet connection and ensure Firestore is enabled with correct security rules.", variant: "destructive", duration: 7000 });
      } else if (error.code === 'permission-denied') {
         toast({ title: "Permission Denied", description: "Failed to fetch profile. Check Firestore security rules.", variant: "destructive", duration: 7000});
      }
      return null;
    }
  }, []);
  
  useEffect(() => {
    const gapiScriptId = "google-api-platform-script";
    if (!document.getElementById(gapiScriptId)) {
        const script = document.createElement('script');
        script.id = gapiScriptId;
        script.src = "https://apis.google.com/js/platform.js";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const userProfileData = await fetchUserProfile(firebaseUser);
        setProfile(userProfileData);
        if (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password") {
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


  const loadGapiAndInitClient = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!window.gapi || typeof window.gapi.load !== 'function') {
        console.error("GAPI client (platform.js) not loaded.");
        return reject(new Error("GAPI client (platform.js) not loaded."));
      }
      window.gapi.load("client:auth2", async () => {
        try {
          const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
          const scope = "profile email";
          console.log("GAPI Init - Client ID being used:", clientId, "Scope:", scope);
          if (!clientId) {
            console.error("Google Client ID is missing for GAPI initialization.");
            return reject(new Error("Google Client ID is missing."));
          }
          if (!window.gapi.auth2.getAuthInstance()) {
            await window.gapi.client.init({ clientId, scope });
          }
          console.log("GAPI client:auth2 initialized for Google Sign-In.");
          resolve();
        } catch (initError) {
          console.error("Error initializing GAPI client:auth2:", initError);
          reject(initError);
        }
      });
    });
  }, []);

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
      return { error: error as AuthError };
    } finally {
        setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpFormDataFromForm }) => {
    setLoading(true);
    const { email, password, data: formData } = credentials;
    console.log("Attempting Firebase auth sign up with email:", email);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const authUser = userCredential.user;

      if (!authUser || !authUser.uid || !authUser.email) {
        console.error("Firebase auth user not created properly or missing details.");
        toast({ title: "Registration Failed", description: "User authentication failed.", variant: "destructive" });
        return { error: { code: "auth/internal-error", message: "User authentication failed." } as AuthError, user: null, profile: null };
      }
      
      const displayName = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User";
      await updateFirebaseAuthProfile(authUser, { displayName, photoURL: authUser.photoURL }); // Ensure photoURL from provider is also set

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
          const numAge = parseInt(formData.age, 10);
          if (!isNaN(numAge) && numAge > 0) parsedAge = numAge;
      }
      
      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'photoURL'> & { photoURL?: string | null } = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: displayName,
        photoURL: authUser.photoURL || null, // Use photoURL from authUser
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
      
      console.log("Attempting to insert profile into Firestore with data:", profileDataToInsert);
      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, {
        ...profileDataToInsert,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      const newProfile = await fetchUserProfile(authUser);
      setProfile(newProfile);

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      return { error: null, user: authUser, profile: newProfile };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      
      toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      return { error: error as AuthError, user: null, profile: null };
    } finally {
      setLoading(false);
    }
  }, [fetchUserProfile]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      await loadGapiAndInitClient(); // Ensure GAPI is ready
      const googleAuthInstance = window.gapi.auth2.getAuthInstance();
      if (!googleAuthInstance) {
        throw new Error("Google Auth instance failed to initialize.");
      }
      
      const googleUser = await googleAuthInstance.signIn();
      const idToken = googleUser.getAuthResponse().id_token;
      if (!idToken) {
        throw new Error("No ID token from Google. Ensure 'profile' and 'email' scopes are requested.");
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      const authUser = result.user;

      console.log("Firebase Google Sign-In successful via GAPI. User UID:", authUser.uid);

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
          age: null, gender: null, skills: null,
          linkedin_url: null, github_url: null,
          description: null, achievements: null,
        };
        await setDoc(userDocRef, {
          ...basicProfileData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      
      toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
      return { error: null, user: authUser };

    } catch (error: any) {
      console.error("GAPI + Firebase Sign-In Error:", error);
      let desc = error.message || "An unexpected error occurred.";
      if (error.error === "popup_closed_by_user" || error.code === "auth/popup-closed-by-user") {
        desc = "Google Sign-In popup was closed. Please ensure popups are allowed and try again. Check Google Cloud OAuth Consent Screen settings if app is in 'Testing' mode.";
      } else if (error.error === 'idpiframe_initialization_failed' || error.message?.includes('idpiframe')) {
        desc = "Google Sign-In failed: Third-party cookies might be disabled or GAPI initialization issue.";
      } else if (error.message?.includes("client_id and scope must both be provided")) {
        desc = "Google Sign-In config error: Client ID or scope missing. Check NEXT_PUBLIC_GOOGLE_CLIENT_ID.";
      }
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive", duration: 7000 });
      return { error: error as AuthError, user: null };
    } finally {
      setLoading(false);
    }
  }, [loadGapiAndInitClient, fetchUserProfile]);


  const signOutUser = useCallback(async () => {
    setLoading(true);
    try {
      if (window.gapi?.auth2?.getAuthInstance()?.isSignedIn.get()) {
        await window.gapi.auth2.getAuthInstance().signOut();
        console.log("GAPI user signed out.");
      }
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
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
      toast({ title: "Password Reset Email Sent", description: "Please check your email to reset your password." });
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
      toast({ title: "Not Authenticated", description: "You must be logged in to update your profile.", variant: "destructive" });
      return { error: new Error("User not authenticated.") as AuthError, data: null };
    }
    setLoading(true);
    const userDocRef = doc(db, "users", user.uid);
    const firestoreUpdates: Record<string, any> = {};

    // Explicitly handle each field to avoid sending undefined
    if (updates.full_name !== undefined) firestoreUpdates.full_name = updates.full_name;
    if (updates.age !== undefined) firestoreUpdates.age = updates.age === '' ? null : Number(updates.age) || null;
    if (updates.gender !== undefined) firestoreUpdates.gender = updates.gender || null;
    if (updates.skills !== undefined) firestoreUpdates.skills = Array.isArray(updates.skills) ? updates.skills : (updates.skills as unknown as string)?.split(',').map(s => s.trim()).filter(Boolean) || null;
    if (updates.linkedin_url !== undefined) firestoreUpdates.linkedin_url = updates.linkedin_url || null;
    if (updates.github_url !== undefined) firestoreUpdates.github_url = updates.github_url || null;
    if (updates.description !== undefined) firestoreUpdates.description = updates.description || null;
    if (updates.achievements !== undefined) firestoreUpdates.achievements = updates.achievements || null;
    
    // Update Firebase Auth displayName if full_name is changing
    if (updates.full_name && auth.currentUser && updates.full_name !== auth.currentUser.displayName) {
        try {
            await updateFirebaseAuthProfile(auth.currentUser, { displayName: updates.full_name });
        } catch (authProfileError) {
            console.warn("Could not update Firebase Auth displayName:", authProfileError);
        }
    }
    // photoURL is managed by Firebase Auth user.photoURL, not directly in this Firestore update typically

    try {
      await updateDoc(userDocRef, { ...firestoreUpdates, updatedAt: serverTimestamp() });
      const updatedProfileData = await fetchUserProfile(user); // Re-fetch to get fresh data
      setProfile(updatedProfileData); // Update local profile state
      toast({ title: "Profile Updated!", description: "Your SkillForge profile has been saved." });
      return { error: null, data: updatedProfileData };
    } catch (error: any) {
      console.error("Error updating Firestore profile:", error);
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

