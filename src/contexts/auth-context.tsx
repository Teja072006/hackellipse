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
  signInWithRedirect,
  getRedirectResult,
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
} from "firebase/firestore";
import React, { createContext, useState, useEffect, useCallback, useContext, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

// UserProfile interface matching Firestore 'users' collection
export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null; // Changed from 'name'
  photoURL?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null; // Stored as array in Firestore
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue; // For profile updates
}

// Type for data coming from the registration form
export type SignUpFormDataFromForm = {
  full_name: string;
  email: string;
  age?: string; // Comes as string from form
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
  signUp: (credentials: { email: string, password: string, data: SignUpFormDataFromForm }) => Promise<{ error: AuthError | null; user: FirebaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error?: AuthError | null; user?: FirebaseUser | null }>;
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
        console.log("Firestore profile found for UID:", firebaseUser.uid, firestoreProfileData);
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email, // Ensure email from auth is consistent
          photoURL: firebaseUser.photoURL, // Prioritize auth photoURL
          ...firestoreProfileData,
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This is normal for a new user if profile creation is pending or failed.`);
        return null; // Return null if no profile exists, signUp will create it
      }
    } catch (error: any) {
      console.error("Error fetching Firebase user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let toastDescription = `Failed to load profile: ${error.message}`;
      if (error.code === "unavailable" || (error.message && error.message.toLowerCase().includes('offline'))) {
        toastDescription = "Network Error: Could not connect to Firestore. Please check your internet and Cloud Workstation network settings (firewalls, DNS).";
      } else if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
        toastDescription = "Network Error: Could not reach Firestore. Please check internet/network settings.";
      }
      toast({ title: "Profile Fetch Error", description: toastDescription, variant: "destructive", duration: 10000 });
      return null;
    }
  }, []);


  useEffect(() => {
    setLoading(true);
    console.log("AuthProvider: Setting up Firebase listeners.");

    // Handle Google Sign-In redirect result first
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          const authUserFromRedirect = result.user;
          console.log("AuthProvider: Google Sign-In via redirect successful. User UID:", authUserFromRedirect.uid);
          setUser(authUserFromRedirect);
          let userProfile = await fetchUserProfile(authUserFromRedirect);

          if (!userProfile) {
            console.log("AuthProvider: No Firestore profile for Google user after redirect, creating basic profile...");
            const userDocRef = doc(db, "users", authUserFromRedirect.uid);
            const nameToSet = authUserFromRedirect.displayName || authUserFromRedirect.email?.split('@')[0] || "SkillForge User";
            const basicProfileData: UserProfile = {
              uid: authUserFromRedirect.uid,
              email: authUserFromRedirect.email,
              full_name: nameToSet,
              photoURL: authUserFromRedirect.photoURL,
              followers_count: 0,
              following_count: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            try {
              await setDoc(userDocRef, basicProfileData);
              userProfile = await fetchUserProfile(authUserFromRedirect); // Re-fetch to get all fields
            } catch (profileError: any) {
              console.error("AuthProvider: Error creating Firestore profile for Google user:", profileError);
              toast({ title: "Profile Setup Failed", description: `Could not create profile: ${profileError.message}`, variant: "destructive" });
            }
          }
          setProfile(userProfile);
          toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
          if (router && (router.pathname === "/login" || router.pathname === "/register")) {
            router.push("/home");
          }
        }
      })
      .catch((error) => {
        console.error("AuthProvider: Error processing Google redirect result:", error);
        toast({ title: "Google Sign-In Error", description: `Error after redirect: ${error.message}`, variant: "destructive" });
      })
      .finally(() => {
        // Set up the main auth state listener
        const unsubscribe = onAuthStateChanged(auth, async (currentAuthUser) => {
          console.log("AuthProvider: Firebase onAuthStateChanged - User state:", currentAuthUser ? currentAuthUser.uid : "null");
          if (currentAuthUser) {
            setUser(currentAuthUser);
            const userProfileData = await fetchUserProfile(currentAuthUser);
            setProfile(userProfileData);
            // Redirection after normal login/signup is handled by those functions or page-level checks
          } else {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
        });
        return unsubscribe;
      });
  }, [fetchUserProfile, router]);


  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      setUser(userCredential.user); // Eagerly set user
      const userProfile = await fetchUserProfile(userCredential.user);
      setProfile(userProfile);
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      router.push('/home');
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      let errorMsg = error.message || "An unexpected error occurred.";
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        errorMsg = "Invalid email or password. Please try again.";
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error: Could not connect to Firebase. Check internet and Cloud Workstation network settings.";
        toast({ title: "Login Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Login Failed", description: errorMsg, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError };
    }
  }, [fetchUserProfile, router]);


  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpFormDataFromForm }) => {
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

      const nameToSetForAuth = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User";
      await updateFirebaseAuthProfile(authUser, { displayName: nameToSetForAuth });
      console.log("Firebase Auth profile (displayName) updated for new user:", nameToSetForAuth);

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
        const numAge = parseInt(formData.age, 10);
        if (!isNaN(numAge) && numAge > 0 && Number.isInteger(numAge)) parsedAge = numAge;
        else console.warn("Invalid age string during signup:", formData.age);
      }

      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: UserProfile = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: nameToSetForAuth, // Use the validated and trimmed name
        photoURL: authUser.photoURL, // Firebase Auth photoURL, initially null for email signup
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

      console.log("Attempting to insert profile into Firestore with data:", profileDataToInsert);
      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, profileDataToInsert);
      console.log("Firestore profile created for UID:", authUser.uid);

      setUser(authUser); // Eagerly set user and profile
      setProfile(profileDataToInsert);
      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      router.push('/home');
      return { error: null, user: authUser, profile: profileDataToInsert };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during registration. Check internet/network settings.";
        toast({ title: "Registration Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else if (error.code === "auth/weak-password") errorMsg = "Password is too weak. It must be at least 6 characters long.";
      else if (error.code === "failed-precondition" && error.message.includes("users")) { // Firestore permission error
        errorMsg = "Profile creation failed: Permission denied. Check Firestore security rules for the 'users' collection.";
      } else {
        toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      }
      // Do not sign out user here if authUser was created but profile failed; allow manual recovery or re-fetch attempt.
      // If authUser itself is null, then auth failed.
      setLoading(false);
      return { error: error as AuthError, user: authUser, profile: null }; // Return authUser if it exists
    }
  }, [fetchUserProfile, router]);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      console.log("AuthProvider: Attempting Firebase Google Sign-In with Redirect...");
      await signInWithRedirect(auth, provider);
      // Redirect happens, result processed by getRedirectResult in useEffect
      // setLoading(false) will be called in the useEffect after redirect or if error during init
      return { error: null, user: null }; // Placeholder, actual user set after redirect
    } catch (error: any) {
      console.error("AuthProvider: Error initiating Firebase Google Sign-In with Redirect:", error);
      let desc = error.message || "An unexpected error occurred with Google Sign-In.";
      if (error.code === "auth/network-request-failed") {
        desc = "Network error: Could not connect for Google Sign-In. Check internet/network settings.";
        toast({ title: "Google Sign-In Failed - Network Issue", description: desc, variant: "destructive", duration: 10000 });
      } else if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request" || error.code === "auth/popup-closed-by-user" ) {
        desc = "Google Sign-In popup was blocked or closed. Ensure popups are allowed and try again. Check Google Cloud OAuth Consent Screen settings if in 'Testing' mode (add test users).";
        toast({ title: "Google Sign-In Issue", description: desc, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError, user: null };
    }
  }, [/* router, fetchUserProfile, toast */]); // Removed dependencies that might cause issues if not stable


  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      router.push('/login');
    } catch (error: any) {
      console.error("Firebase Sign-Out error:", error);
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    }
    return { error: null };
  }, [router]);

  const sendPasswordReset = useCallback(async (emailForReset: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, emailForReset);
      toast({ title: "Password Reset Email Sent", description: "Please check your email to reset your password." });
      setLoading(false);
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Password Reset error:", error);
      let errorMsg = error.message || "Password reset failed.";
      if (error.code === 'auth/user-not-found') errorMsg = "No user found with this email address.";
      else if (error.code === 'auth/network-request-failed') {
        errorMsg = "Network error during password reset. Check internet/network settings.";
         toast({ title: "Password Reset Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Password Reset Failed", description: errorMsg, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count'>>) => {
    if (!user?.uid) {
      toast({ title: "Not Authenticated", description: "You must be logged in to update your profile.", variant: "destructive" });
      return { error: new Error("User not authenticated.") as AuthError, data: null };
    }
    setLoading(true);
    const userDocRef = doc(db, "users", user.uid);

    const firestoreUpdates: Record<string, any> = { ...updates, updatedAt: serverTimestamp() };

    if ('age' in updates && updates.age !== undefined) {
      const ageStr = String(updates.age);
      const numAge = parseInt(ageStr, 10);
      firestoreUpdates.age = !isNaN(numAge) && numAge > 0 ? numAge : null;
    }

    if ('skills' in updates && updates.skills !== undefined) {
      if (typeof updates.skills === 'string' && updates.skills.trim() !== '') {
        firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
      } else if (Array.isArray(updates.skills)) {
         firestoreUpdates.skills = updates.skills.map(s => String(s).trim()).filter(s => s.length > 0);
      } else {
        firestoreUpdates.skills = [];
      }
    }

    // Update Firebase Auth profile (displayName, photoURL if they changed)
    const authProfileUpdates: { displayName?: string | null; photoURL?: string | null } = {};
    if (updates.full_name && auth.currentUser && updates.full_name !== (profile?.full_name || auth.currentUser.displayName)) {
      authProfileUpdates.displayName = updates.full_name;
    }
    if (updates.photoURL !== undefined && auth.currentUser && updates.photoURL !== (profile?.photoURL || auth.currentUser.photoURL)) {
      authProfileUpdates.photoURL = updates.photoURL;
    }

    if (Object.keys(authProfileUpdates).length > 0 && auth.currentUser) {
      try {
        await updateFirebaseAuthProfile(auth.currentUser, authProfileUpdates);
        console.log("Firebase Auth profile (displayName/photoURL) updated.");
      } catch (authProfileError: any) {
        console.warn("Could not update Firebase Auth displayName/photoURL:", authProfileError);
      }
    }

    try {
      await updateDoc(userDocRef, firestoreUpdates);
      const updatedAuthUser = auth.currentUser; // Re-fetch or ensure auth user is up-to-date
      if (updatedAuthUser) {
        const updatedProfileData = await fetchUserProfile(updatedAuthUser); // Fetch updated profile from Firestore
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
       if (error.code === 'unavailable' || (error.message && error.message.toLowerCase().includes('offline'))) {
         errorMsg = "Network error updating profile. Check internet/network settings for Firestore access.";
          toast({ title: "Profile Update Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
       } else if (error.code === "permission-denied" || error.code === "failed-precondition") {
        errorMsg = "Profile update failed: Permission denied. Check Firestore security rules for the 'users' collection.";
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
