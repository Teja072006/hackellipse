
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
  signInWithRedirect, // Changed from signInWithPopup/signInWithCredential
  getRedirectResult,  // To handle the result of redirect
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, FieldValue, increment } from "firebase/firestore";
import React, { createContext, useState, useEffect, useCallback, useContext, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "@/hooks/use-toast";

// GAPI script is still loaded via layout.tsx for platform.js, but not directly used for signInWithGoogle anymore
declare global {
  interface Window {
    gapi?: any; // Keep for potential other GAPI uses, but not primary for this auth
  }
}

export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null;
  photoURL?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  created_at?: Timestamp | FieldValue;
  updated_at?: Timestamp | FieldValue;
}

type SignUpProfileDataFromForm = {
  full_name: string;
  age?: string;
  gender?: string;
  skills?: string; // Comma-separated
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
  signInWithGoogle: () => Promise<void>; // Changed signature, may not directly return error/user as redirect handles it
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'created_at' | 'updated_at' | 'followers_count' | 'following_count'>>) => Promise<{ error: Error | null; data: UserProfile | null }>;
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
        const firestoreProfileData = userDocSnap.data() as Omit<UserProfile, 'uid'>;
        return {
          uid: firebaseUser.uid,
          ...firestoreProfileData,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || firestoreProfileData.photoURL || null,
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This may be normal for a new user if profile creation is pending.`);
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
        toast({
          title: "Network Error (Firestore)",
          description: "Could not connect to the database. Please check your internet connection and ensure Firestore is enabled with correct security rules.",
          variant: "destructive",
          duration: 7000,
        });
      } else if (error.code === 'permission-denied') {
         toast({ title: "Permission Denied", description: "Failed to fetch profile. Check Firestore security rules.", variant: "destructive", duration: 7000});
      }
      return null;
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    // Check for redirect result first
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          const authUser = result.user;
          console.log("Google Sign-In successful via redirect. User UID:", authUser.uid);
          // User signed in via redirect. Fetch/create profile.
          setUser(authUser);
          let userProfile = await fetchUserProfile(authUser);
          if (!userProfile || !userProfile.full_name) { // Check if profile is minimal/needs creation
            const userDocRef = doc(db, "users", authUser.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (!userDocSnap.exists()) {
              console.log("No Firestore profile after redirect, creating basic profile...");
              const basicProfileData: Partial<UserProfile> = {
                uid: authUser.uid,
                email: authUser.email,
                full_name: authUser.displayName || authUser.email?.split('@')[0] || "New User",
                photoURL: authUser.photoURL,
                followers_count: 0,
                following_count: 0,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
              };
              await setDoc(userDocRef, basicProfileData, { merge: true });
              userProfile = await fetchUserProfile(authUser);
            }
          }
          setProfile(userProfile);
          toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
          if (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password") {
            router.push("/home");
          }
        }
        // Continue with onAuthStateChanged listener after processing redirect
      })
      .catch((error) => {
        console.error("Error processing Firebase redirect result:", error);
        toast({ title: "Google Sign-In Failed", description: error.message || "Could not process redirect sign-in.", variant: "destructive" });
      })
      .finally(() => {
        // Set up the regular auth state listener
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            if (!user || user.uid !== firebaseUser.uid) { // Avoid re-fetching if user is already set by redirect logic
                setUser(firebaseUser);
                const userProfileData = await fetchUserProfile(firebaseUser);
                setProfile(userProfileData);
            }
            if (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password") {
              router.push("/home");
            }
          } else {
            setUser(null);
            setProfile(null);
          }
          setLoading(false); // Set loading to false after auth state is determined
        });
        return () => unsubscribe(); // Cleanup listener
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile, router]); // router is for navigation, fetchUserProfile is stable


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
        errorMsg = "Network error. Please check your connection and try again.";
      }
      toast({ title: "Login Failed", description: errorMsg, variant: "destructive" });
      return { error: error as AuthError };
    } finally {
        setLoading(false);
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
        toast({ title: "Registration Failed", description: "User authentication failed.", variant: "destructive" });
        return { error: { code: "auth/internal-error", message: "User authentication failed." } as AuthError, user: null, profile: null };
      }
      console.log("Firebase auth user created successfully:", authUser.uid, authUser.email);
      
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

      const profileDataToInsert: Omit<UserProfile, 'updatedAt' | 'photoURL'> & { createdAt: FieldValue, photoURL?: string | null} = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: displayName,
        photoURL: authUser.photoURL || null,
        age: parsedAge,
        gender: formData.gender?.trim() || null,
        skills: skillsArray,
        linkedin_url: formData.linkedin_url?.trim() || null,
        github_url: formData.github_url?.trim() || null,
        description: formData.description?.trim() || null,
        achievements: formData.achievements?.trim() || null,
        followers_count: 0,
        following_count: 0,
        created_at: serverTimestamp(),
      };
      
      console.log("Attempting to insert profile into Firestore with data:", profileDataToInsert);
      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, { ...profileDataToInsert, updatedAt: serverTimestamp() });
      
      const newProfile = await fetchUserProfile(authUser);
      setProfile(newProfile);

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      return { error: null, user: authUser, profile: newProfile };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during registration. Please check your connection.";
      } else if (error.code && (error.code.startsWith("permission-denied") || error.code.startsWith("unavailable"))) {
        errorMsg = "Database error during profile creation. Please try again later.";
      }
      
      toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      if (auth.currentUser && auth.currentUser.email === email) { // Attempt to sign out partially created user
        await signOut(auth).catch(e => console.warn("Error signing out after failed signup:", e));
      }
      return { error: error as AuthError, user: null, profile: null };
    } finally {
      setLoading(false);
    }
  }, [fetchUserProfile]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      // This will navigate the user to Google's sign-in page
      // and then back to your app. The result is handled by getRedirectResult.
      await signInWithRedirect(auth, provider);
      // Note: After this call, the page will redirect, so code here might not execute
      // until the user returns. The actual user/profile setting happens via getRedirectResult.
    } catch (error: any) {
      console.error("Firebase signInWithRedirect error:", error);
      let desc = error.message || "An unexpected error occurred with Google Sign-In initiation.";
      if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
          desc = "Google Sign-In was cancelled. Please try again.";
      } else if (error.code === "auth/network-request-failed") {
          desc = "Network error initiating Google Sign-In. Please check your connection.";
      } else if (error.code === 'auth/operation-not-allowed') {
          desc = "Google Sign-In is not enabled for this Firebase project. Please contact support.";
      }
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive" });
      setLoading(false);
    }
    // setLoading(false) will be handled by onAuthStateChanged or redirect result processing
  }, []);


  const signOutUser = useCallback(async () => {
    setLoading(true);
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      // User state will be set to null by onAuthStateChanged
      // router.push("/"); // Navigation handled by onAuthStateChanged or consuming components
    } catch (error: any) {
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
    return { error: null };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Password Reset Email Sent", description: "Please check your email to reset your password." });
      return { error: null };
    } catch (error: any) {
      let errorMsg = error.message || "Password reset failed.";
      if (error.code === 'auth/user-not-found') errorMsg = "No user found with this email address.";
      toast({ title: "Password Reset Failed", description: errorMsg, variant: "destructive" });
      return { error: error as AuthError };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'created_at' | 'updated_at' | 'followers_count' | 'following_count'>>) => {
    if (!user?.uid) {
      toast({ title: "Not Authenticated", description: "You must be logged in to update your profile.", variant: "destructive" });
      return { error: new Error("User not authenticated.") as AuthError, data: null };
    }
    setLoading(true);
    const userDocRef = doc(db, "users", user.uid);
    const firestoreUpdates: Record<string, any> = { ...updates, updatedAt: serverTimestamp() };

    // Handle specific type conversions if necessary (e.g., age, skills)
    if (updates.age && typeof updates.age === 'string') {
      const numAge = parseInt(updates.age, 10);
      firestoreUpdates.age = !isNaN(numAge) ? numAge : null;
    } else if (updates.age === '') {
        firestoreUpdates.age = null;
    }

    if (updates.skills && typeof updates.skills === 'string') {
      firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s);
    } else if (updates.skills === '') {
        firestoreUpdates.skills = [];
    }


    // Update Firebase Auth display name if full_name is changing
    if (updates.full_name && auth.currentUser && updates.full_name !== auth.currentUser.displayName) {
        try {
            await updateFirebaseAuthProfile(auth.currentUser, { displayName: updates.full_name });
        } catch (authProfileError) {
            console.warn("Could not update Firebase Auth displayName:", authProfileError);
            // Continue with Firestore update even if auth profile update fails
        }
    }
    
    // Update photoURL in Firebase Auth if it's part of updates
    if (updates.photoURL && auth.currentUser && updates.photoURL !== auth.currentUser.photoURL) {
        try {
            await updateFirebaseAuthProfile(auth.currentUser, { photoURL: updates.photoURL });
        } catch (authProfileError) {
            console.warn("Could not update Firebase Auth photoURL:", authProfileError);
        }
    }


    try {
      await updateDoc(userDocRef, firestoreUpdates);
      const updatedProfileData = await fetchUserProfile(user);
      setProfile(updatedProfileData);
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

    