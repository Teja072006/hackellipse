
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
  GoogleAuthProvider, // Keep for potential direct Firebase Google Sign-In
  signInWithPopup,    // Keep for potential direct Firebase Google Sign-In
  signInWithRedirect, // Keep for potential direct Firebase Google Sign-In
  getRedirectResult,  // Keep for potential direct Firebase Google Sign-In
  signInWithCredential, // For GAPI/GIS token federation
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
  increment
} from "firebase/firestore";
import React, { createContext, useState, useEffect, useCallback, useContext, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

// UserProfile interface matching your Firebase/Firestore structure
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

// Type for data coming from the registration form
type SignUpProfileDataFromForm = {
  full_name: string;
  age?: string; // From form, will be parsed to number
  gender?: string;
  skills?: string; // Comma-separated from form, will be parsed to array
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
          email: firebaseUser.email, // Use email from authUser as source of truth
          photoURL: firebaseUser.photoURL, // Use photoURL from authUser
          ...firestoreProfileData,
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This might be normal for a new user if profile creation is pending, or if it failed.`);
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
          description: "Could not connect to the database to fetch your profile. Please check your internet connection and ensure Firestore is enabled and accessible from your environment (e.g., Cloud Workstation network settings).",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({ title: "Profile Fetch Error", description: `Failed to load profile: ${error.message}`, variant: "destructive" });
      }
      return null;
    }
  }, []);


  useEffect(() => {
    setLoading(true);

    const handleAuthChange = async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        console.log("Firebase onAuthStateChanged - User signed IN:", firebaseUser.uid);
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
    
    // Check for redirect result first (if using signInWithRedirect)
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("Firebase getRedirectResult - User signed IN:", result.user.uid);
          // This block handles the user after a successful redirect.
          // The onAuthStateChanged listener below will also fire.
          // We can let onAuthStateChanged handle the profile fetching and state setting
          // to avoid duplicate logic, or handle it here and ensure onAuthStateChanged doesn't re-fetch unnecessarily.
          // For simplicity, let onAuthStateChanged handle the main logic.
          toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
        }
        // Whether there was a redirect result or not, now set up the main listener.
        const unsubscribe = onAuthStateChanged(auth, handleAuthChange);
        return unsubscribe;
      })
      .catch((error) => {
        console.error("Error processing Firebase redirect result:", error);
        toast({ title: "Sign-In Error", description: `Error after redirect: ${error.message}`, variant: "destructive" });
        // Still set up the main listener even if redirect processing failed
        const unsubscribe = onAuthStateChanged(auth, handleAuthChange);
        return unsubscribe;
      });

    // The cleanup function from onAuthStateChanged will be returned by the promise.
    // However, since we need to return a cleanup function directly from useEffect,
    // we'll just set up the listener and handle its direct unsubscribe.
    // For now, we'll rely on the direct unsubscribe from onAuthStateChanged.
    const unsubscribe = onAuthStateChanged(auth, handleAuthChange);
    return () => unsubscribe();

  }, [fetchUserProfile, router]);


  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      // onAuthStateChanged will handle setting user, profile, and navigation
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      setLoading(false); // setLoading(false) typically handled by onAuthStateChanged if successful
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      let errorMsg = error.message || "An unexpected error occurred.";
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        errorMsg = "Invalid email or password.";
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during sign-in. Please check your internet connection. If using a Cloud Workstation, ensure it has outbound internet access and can reach Firebase servers.";
         toast({ title: "Login Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 7000 });
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

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const authUser = userCredential.user;

      if (!authUser || !authUser.uid || !authUser.email) {
        console.error("Firebase auth user not created properly or missing details.");
        throw { code: "auth/internal-error", message: "User authentication failed to return expected user details." };
      }
      console.log("Firebase auth user created. UID:", authUser.uid, "Email:", authUser.email);

      const displayName = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User";
      await updateFirebaseAuthProfile(authUser, { displayName, photoURL: null });
      console.log("Firebase Auth profile (displayName) updated for new user.");

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
        const numAge = parseInt(formData.age, 10);
        if (!isNaN(numAge) && numAge > 0) parsedAge = numAge;
      }

      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
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
      };
      console.log("Attempting to insert profile into Firestore with data:", profileDataToInsert);

      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, {
        ...profileDataToInsert,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log("Firestore profile created for UID:", authUser.uid);

      // onAuthStateChanged will handle setting user, profile and navigation
      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      setLoading(false); // Typically handled by onAuthStateChanged
      return { error: null, user: authUser, profile: profileDataToInsert as UserProfile }; // Profile will be re-fetched by onAuthStateChanged

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during registration. Please check your connection. If using a Cloud Workstation, ensure it has outbound internet access and can reach Firebase servers.";
        toast({ title: "Registration Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 7000 });
      } else if (error.code === "auth/weak-password") {
        errorMsg = "Password is too weak. It must be at least 6 characters long.";
      } else {
        toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      }

      // Attempt to sign out partially created user if auth part succeeded but profile part failed
      if (auth.currentUser && auth.currentUser.email === email) {
        await signOut(auth).catch(e => console.warn("Error signing out after failed signup:", e));
      }
      setUser(null);
      setProfile(null);
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      // Using signInWithRedirect as it's more robust against popup blockers
      await signInWithRedirect(auth, provider);
      // The result will be handled by getRedirectResult in the useEffect hook
      // No need to setLoading(false) here as the page redirects
      return { error: null }; // This might not be fully accurate as result is pending
    } catch (error: any) {
      console.error("Firebase Google Sign-In (signInWithRedirect initiation) Error:", error);
      let desc = error.message || "An unexpected error occurred with Google Sign-In.";
      if (error.code === "auth/network-request-failed") {
        desc = "Network error initiating Google Sign-In. Please check your connection. If using a Cloud Workstation, ensure it has outbound internet access and can reach Google/Firebase servers.";
        toast({ title: "Google Sign-In Failed - Network Issue", description: desc, variant: "destructive", duration: 7000 });
      } else if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/unauthorized-domain') {
        desc = "Google Sign-In is not configured correctly for this domain or Firebase project. Check Firebase Console authorized domains and Google Cloud Console OAuth settings.";
      }
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive" });
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will set user/profile to null and handle navigation
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
    } catch (error: any) {
      console.error("Firebase Sign-Out error:", error);
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false); // Ensure loading is set to false even if onAuthStateChanged handles some state
    }
    return { error: null };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Password Reset Email Sent", description: "Please check your email to reset your password." });
      setLoading(false);
      return { error: null };
    } catch (error: any) {
      let errorMsg = error.message || "Password reset failed.";
      if (error.code === 'auth/user-not-found') errorMsg = "No user found with this email address.";
      else if (error.code === 'auth/network-request-failed') {
        errorMsg = "Network error. Please check your connection. If using a Cloud Workstation, ensure it can reach Firebase servers.";
         toast({ title: "Password Reset Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 7000 });
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

    if (updates.age && typeof updates.age === 'string') {
        const numAge = parseInt(updates.age, 10);
        firestoreUpdates.age = !isNaN(numAge) && numAge > 0 ? numAge : null;
    } else if (updates.age === '' || updates.age === undefined ) { // Explicitly allow null
        firestoreUpdates.age = null;
    }


    if (updates.skills && typeof updates.skills === 'string') {
        firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else if (updates.skills === '' || updates.skills === undefined) { // Explicitly allow null/empty array
        firestoreUpdates.skills = []; // Store as empty array if cleared
    }


    const authProfileUpdates: { displayName?: string | null; photoURL?: string | null } = {};
    if (updates.full_name && auth.currentUser && updates.full_name !== (profile?.full_name || auth.currentUser.displayName)) {
      authProfileUpdates.displayName = updates.full_name;
    }
    if (updates.photoURL !== undefined && auth.currentUser && updates.photoURL !== (profile?.photoURL || auth.currentUser.photoURL)) {
      authProfileUpdates.photoURL = updates.photoURL; // Can be null to remove photo
    }

    if (Object.keys(authProfileUpdates).length > 0 && auth.currentUser) {
      try {
        await updateFirebaseAuthProfile(auth.currentUser, authProfileUpdates);
        console.log("Firebase Auth profile (displayName/photoURL) updated.");
      } catch (authProfileError: any) {
        console.warn("Could not update Firebase Auth displayName/photoURL:", authProfileError);
        toast({ title: "Auth Profile Update Warning", description: `Could not update Firebase Auth profile: ${authProfileError.message}`, variant: "default" });
      }
    }

    try {
      await updateDoc(userDocRef, firestoreUpdates);
      const updatedAuthUser = auth.currentUser;
      if (updatedAuthUser) {
        const updatedProfileData = await fetchUserProfile(updatedAuthUser);
        setProfile(updatedProfileData); // Update local profile state
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
         errorMsg = "Network error updating profile. Please check your internet connection. If using a Cloud Workstation, ensure it can reach Firestore.";
          toast({ title: "Profile Update Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 7000 });
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
