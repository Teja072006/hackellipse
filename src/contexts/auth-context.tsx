
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
  GoogleAuthProvider,
  signInWithRedirect, // Using redirect for Google Sign-In
  getRedirectResult,  // To handle the result of the redirect
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  FieldValue,
  increment,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  deleteDoc,
  orderBy,
  limit,
  runTransaction,
  addDoc,
} from "firebase/firestore";
import React, { createContext, useState, useEffect, useCallback, useContext, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

// UserProfile interface matching Firestore 'users' collection
export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null;
  photoURL?: string | null; // Firebase Auth photoURL is the primary source
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

// Type for data coming from the registration form
type SignUpProfileDataFromForm = {
  full_name: string;
  age?: string;
  gender?: string;
  skills?: string; // Comma-separated from form
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
  signUp: (credentials: { email: string, password: string, data: SignUpProfileDataFromForm }) => Promise<{ error: AuthError | null; user: FirebaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error?: AuthError | null; user?: FirebaseUser | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>) => Promise<{ error: Error | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    if (!firebaseUser?.uid) {
      console.warn("fetchUserProfile called with no Firebase user or UID.");
      return null;
    }
    console.log("Fetching Firestore profile for UID:", firebaseUser.uid);
    const userDocRef = doc(db, "users", firebaseUser.uid);
    try {
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const firestoreProfileData = userDocSnap.data() as Omit<UserProfile, 'uid'>;
        console.log("Firestore profile found for UID:", firebaseUser.uid);
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          ...firestoreProfileData,
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This is normal for a new user if profile creation is pending.`);
        return { // Return a minimal profile based on auth user
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          full_name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
          photoURL: firebaseUser.photoURL,
          followers_count: 0,
          following_count: 0,
        };
      }
    } catch (error: any) {
      console.error("Error fetching Firebase user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      if (error.code === 'unavailable') {
        toast({
          title: "Network Error (Firestore)",
          description: "Could not connect to the database to fetch your profile. Ensure Firestore is enabled in your Firebase project and that your Cloud Workstation has network access to Google services.",
          variant: "destructive",
          duration: 10000,
        });
      } else if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
        toast({
          title: "Network Error (Firestore - Failed to Fetch)",
          description: "Could not reach Firestore. Please check your internet connection and Cloud Workstation network/firewall settings.",
          variant: "destructive",
          duration: 10000
        });
      } else {
        toast({ title: "Profile Fetch Error", description: `Failed to load profile: ${error.message}`, variant: "destructive" });
      }
      return null;
    }
  }, []);


  useEffect(() => {
    setLoading(true);

    const processUser = async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        console.log("Firebase onAuthStateChanged - User state changed (signed IN or token refreshed):", firebaseUser.uid);
        setUser(firebaseUser);
        const userProfileData = await fetchUserProfile(firebaseUser);
        setProfile(userProfileData);
        if (router && (router.pathname === "/login" || router.pathname === "/register" || router.pathname === "/forgot-password")) {
          router.push("/home");
        }
      } else {
        console.log("Firebase onAuthStateChanged - User signed OUT");
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    };

    // Handle redirect result first for Google Sign-In
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("Firebase getRedirectResult - User signed IN via redirect:", result.user.uid);
          toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
          // Let onAuthStateChanged handle further processing (profile fetch, navigation)
          // to avoid race conditions and keep logic centralized.
          // The onAuthStateChanged listener below will fire due to this result.
        }
        // Whether there was a redirect result or not, now set up the main auth state listener.
        const unsubscribe = onAuthStateChanged(auth, processUser);
        return unsubscribe;
      })
      .catch((error) => {
        console.error("Error processing Firebase redirect result:", error);
        toast({ title: "Google Sign-In Error", description: `Error after redirect: ${error.message}`, variant: "destructive" });
        // Still set up the main listener even if redirect processing failed
        const unsubscribe = onAuthStateChanged(auth, processUser);
        return unsubscribe;
      })
      .finally(() => {
        // Ensure loading is set to false if getRedirectResult completes without user
        // and onAuthStateChanged might not fire immediately.
        if (!auth.currentUser) {
          setLoading(false);
        }
      });

    const unsubscribe = onAuthStateChanged(auth, processUser);
    return () => unsubscribe();
  }, [fetchUserProfile, router]);


  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      let errorMsg = error.message || "An unexpected error occurred.";
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        errorMsg = "Invalid email or password.";
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error: Could not connect to Firebase Authentication. Please check your internet connection and ensure your Cloud Workstation has network access to Google services (e.g., firewall, DNS).";
        toast({ title: "Login Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Login Failed", description: errorMsg, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);


  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpProfileDataFromForm }) => {
    setLoading(true);
    const { email, password, data: formData } = credentials;
    console.log("Attempting Firebase auth sign up with email:", email);

    let authUser: FirebaseUser | null = null;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      authUser = userCredential.user;

      if (!authUser || !authUser.uid || !authUser.email) {
        console.error("Firebase auth user not created properly or missing details.");
        throw { code: "auth/internal-error", message: "User authentication failed to return expected user details." };
      }
      console.log("Firebase auth user created. UID:", authUser.uid, "Email:", authUser.email);

      const displayName = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User";
      await updateFirebaseAuthProfile(authUser, { displayName, photoURL: null }); // Keep photoURL null for now, user can add it later
      console.log("Firebase Auth profile (displayName) updated for new user:", displayName);

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
        const numAge = parseInt(formData.age, 10);
        if (!isNaN(numAge) && numAge > 0 && Number.isInteger(numAge)) parsedAge = numAge;
        else console.warn("Invalid age string provided:", formData.age);
      }

      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: displayName,
        photoURL: authUser.photoURL, // This will be null initially unless Google Sign-In provides it
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
      console.log("Firestore profile created for UID:", authUser.uid);

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      return { error: null, user: authUser, profile: profileDataToInsert as UserProfile };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error: Could not connect to Firebase Authentication for registration. Please check your internet connection and ensure your Cloud Workstation has network access to Google services (e.g., firewall, DNS).";
        toast({ title: "Registration Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else if (error.code === "auth/weak-password") {
        errorMsg = "Password is too weak. It must be at least 6 characters long.";
      } else {
        toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      }

      if (authUser) { // If auth user was created but profile failed, attempt to clean up auth user
        console.warn("Profile creation failed after auth user was created. Attempting to delete auth user:", authUser.uid);
        // Firebase doesn't have a simple "delete self" without re-auth for security.
        // Best to sign out and let user know profile creation failed.
        // A more robust solution might involve a Cloud Function to clean up orphaned auth users.
        await signOut(auth).catch(e => console.warn("Error signing out after failed signup:", e));
      }
      setUser(null); // Ensure user state is cleared
      setProfile(null); // Ensure profile state is cleared
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      console.log("Attempting Firebase Google Sign-In with Redirect...");
      await signInWithRedirect(auth, provider);
      // Redirect happens, result processed in useEffect by getRedirectResult
      // No need to return anything here or setLoading(false) as page navigates
      return { error: null, user: null }; // Placeholder, as redirect takes over
    } catch (error: any) {
      console.error("Error initiating Firebase Google Sign-In with Redirect:", error);
      let desc = error.message || "An unexpected error occurred with Google Sign-In.";
       if (error.code === "auth/network-request-failed") {
        desc = "Network error: Could not connect to Google for Sign-In. Please check your internet connection and ensure your Cloud Workstation has network access to Google services (e.g., firewall, DNS).";
        toast({ title: "Google Sign-In Failed - Network Issue", description: desc, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError, user: null };
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true); // Keep loading true until onAuthStateChanged confirms sign out
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      // setUser and setProfile to null will be handled by onAuthStateChanged
    } catch (error: any) {
      console.error("Firebase Sign-Out error:", error);
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
      setLoading(false); // Reset loading if sign-out call itself fails
    }
    return { error: null }; // signOut doesn't usually throw for already signed out user
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Password Reset Email Sent", description: "Please check your email to reset your password." });
      setLoading(false);
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Password Reset error:", error);
      let errorMsg = error.message || "Password reset failed.";
      if (error.code === 'auth/user-not-found') errorMsg = "No user found with this email address.";
      else if (error.code === 'auth/network-request-failed') {
        errorMsg = "Network error: Could not connect to Firebase for password reset. Please check your internet connection and ensure your Cloud Workstation has network access to Google services (e.g., firewall, DNS).";
         toast({ title: "Password Reset Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Password Reset Failed", description: errorMsg, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>) => {
    if (!user?.uid) {
      toast({ title: "Not Authenticated", description: "You must be logged in to update your profile.", variant: "destructive" });
      return { error: new Error("User not authenticated.") as AuthError, data: null };
    }
    setLoading(true);
    const userDocRef = doc(db, "users", user.uid);

    const firestoreUpdates: Record<string, any> = { ...updates, updatedAt: serverTimestamp() };

    if (updates.age && typeof updates.age === 'string') { // Ensure age is number or null
        const numAge = parseInt(updates.age, 10);
        firestoreUpdates.age = !isNaN(numAge) && numAge > 0 ? numAge : null;
    } else if (updates.age === '' || updates.age === undefined || updates.age === null) {
        firestoreUpdates.age = null;
    } else if (typeof updates.age === 'number') {
        firestoreUpdates.age = updates.age > 0 ? updates.age : null;
    }


    if (updates.skills && typeof updates.skills === 'string') { // Ensure skills is array or null
        firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else if (updates.skills === '' || updates.skills === undefined || updates.skills === null) {
        firestoreUpdates.skills = [];
    } else if (Array.isArray(updates.skills)) {
        firestoreUpdates.skills = updates.skills.map(s => String(s).trim()).filter(s => s.length > 0);
    }

    const authProfileUpdates: { displayName?: string | null; photoURL?: string | null } = {};
    if (updates.full_name && auth.currentUser && updates.full_name !== (profile?.full_name || auth.currentUser.displayName)) {
      authProfileUpdates.displayName = updates.full_name;
    }
    // Firebase Auth photoURL is the source of truth. Update it directly if needed.
    // For custom photo uploads to Storage, save the URL to Firestore's photoURL field.
    if (updates.photoURL !== undefined && auth.currentUser && updates.photoURL !== (profile?.photoURL || auth.currentUser.photoURL)) {
      authProfileUpdates.photoURL = updates.photoURL;
    }

    if (Object.keys(authProfileUpdates).length > 0 && auth.currentUser) {
      try {
        await updateFirebaseAuthProfile(auth.currentUser, authProfileUpdates);
        console.log("Firebase Auth profile (displayName/photoURL) updated.");
      } catch (authProfileError: any) {
        console.warn("Could not update Firebase Auth displayName/photoURL:", authProfileError);
        toast({ title: "Auth Profile Update Warning", description: `Could not update basic Firebase Auth profile: ${authProfileError.message}`, variant: "default" });
      }
    }

    try {
      await updateDoc(userDocRef, firestoreUpdates);
      const updatedAuthUser = auth.currentUser; // Re-fetch or use existing
      if (updatedAuthUser) {
        const updatedProfileData = await fetchUserProfile(updatedAuthUser);
        setProfile(updatedProfileData);
        toast({ title: "Profile Updated!", description: "Your SkillForge profile has been saved." });
        setLoading(false);
        return { error: null, data: updatedProfileData };
      } else {
        throw new Error("Current user became null after profile update unexpectedly.");
      }
    } catch (error: any) {
      console.error("Error updating Firestore profile:", error);
      let errorMsg = `Failed to update profile: ${error.message}`;
       if (error.code === 'unavailable') {
         errorMsg = "Network error updating profile. Please check your Cloud Workstation network/firewall settings for Firestore access.";
          toast({ title: "Profile Update Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
       } else {
        toast({ title: "Profile Update Failed", description: errorMsg, variant: "destructive" });
       }
      setLoading(false);
      return { error: error as Error, data: null };
    }
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
    throw new Error("useAuth must be used within an AuthProvider (Firebase version)");
  }
  return context;
};

// GAPI related type definitions (if not using GIS, these might be needed for window.gapi)
// These are generally not needed if using Firebase's own GoogleAuthProvider or GIS
declare global {
  interface Window {
    gapi?: any; // Google API (gapi.auth2, gapi.client)
    google?: any; // Google Identity Services (GIS) (google.accounts.id)
  }
}
