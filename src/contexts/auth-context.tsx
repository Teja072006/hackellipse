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
  // GoogleAuthProvider, // No longer needed
  // signInWithPopup,    // No longer needed
  // signInWithRedirect, // No longer needed
  // getRedirectResult,  // No longer needed
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

// UserProfile interface based on your "Users Table" (adapted for Firestore)
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
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

// Type for data coming from the registration form
type SignUpProfileDataFromForm = {
  full_name: string;
  age?: string;
  gender?: string;
  skills?: string;
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
  // signInWithGoogle: () => Promise<{ error?: AuthError | null; user?: FirebaseUser | null }>; // Removed
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
    if (!firebaseUser?.uid) return null;
    console.log("Fetching Firestore profile for UID:", firebaseUser.uid);
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const firestoreProfileData = userDocSnap.data() as Omit<UserProfile, 'uid'>; // uid will be from firebaseUser
        return {
          uid: firebaseUser.uid, // Ensure UID from auth is authoritative
          email: firebaseUser.email, // Ensure email from auth is authoritative
          photoURL: firebaseUser.photoURL, // Sync photoURL from auth if needed
          ...firestoreProfileData,
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This might be normal for a new user if profile creation is pending, or if it failed.`);
        // Return a minimal profile based on authUser if Firestore profile doesn't exist
        return {
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
      if (error.code === "unavailable") {
         toast({
          title: "Network Error (Firestore)",
          description: "Could not connect to the database to fetch your profile. Please check your internet connection and ensure Firestore is enabled in your Firebase project.",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({ title: "Profile Fetch Error", description: error.message || "Could not load user profile.", variant: "destructive" });
      }
      return null;
    }
  }, []);


  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
    });

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
        errorMsg = "Network error during sign-in. Please check your connection and ensure Firebase services are reachable.";
      }
      toast({ title: "Login Failed", description: errorMsg, variant: "destructive" });
      setLoading(false);
      return { error: error as AuthError };
    }
  }, [router]);


  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpProfileDataFromForm }) => {
    setLoading(true);
    const { email, password, data: formData } = credentials;
    console.log("Attempting Firebase auth sign up with email:", email);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const authUser = userCredential.user;

      if (!authUser || !authUser.uid || !authUser.email) {
        console.error("Firebase auth user not created properly or missing details.");
        toast({ title: "Registration Failed", description: "User authentication failed (no authUser).", variant: "destructive" });
        setLoading(false);
        return { error: { code: "auth/internal-error", message: "User authentication failed (no authUser)." } as AuthError, user: null, profile: null };
      }
      console.log("Firebase auth user created. UID:", authUser.uid, "Email:", authUser.email);

      const displayName = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User";
      // Update Firebase Auth profile (this syncs displayName and photoURL to the Firebase Auth user object)
      await updateFirebaseAuthProfile(authUser, { displayName, photoURL: null /* Or a default avatar if you have one */ });
      console.log("Firebase Auth profile displayName updated.");

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
        const numAge = parseInt(formData.age, 10);
        if (!isNaN(numAge) && numAge > 0) parsedAge = numAge;
        else console.warn("Invalid age string provided during signup:", formData.age);
      }

      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: displayName,
        photoURL: authUser.photoURL, // This will be null or what Firebase Auth has
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

      const newProfile = await fetchUserProfile(authUser); // Fetch the just created profile
      setProfile(newProfile);

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      // setLoading(false); // Handled by onAuthStateChanged
      // router.push("/home"); // Handled by onAuthStateChanged
      return { error: null, user: authUser, profile: newProfile };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during registration. Please check your connection and ensure Firebase services are reachable.";
      } else if (error.code && (error.code.startsWith("permission-denied") || error.code.startsWith("unavailable"))) {
        errorMsg = "Database error during profile creation. Check Firestore rules and connectivity.";
      } else if (error.code === "auth/weak-password") {
        errorMsg = "Password is too weak. It must be at least 6 characters long.";
      }

      toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      // Attempt to sign out partially created user if auth part succeeded but profile part failed
      if (auth.currentUser && auth.currentUser.email === email) {
        await signOut(auth).catch(e => console.warn("Error signing out after failed signup:", e));
      }
      setUser(null);
      setProfile(null);
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [fetchUserProfile, router]);


  // const signInWithGoogle = useCallback(async () => { // Removed
  //   setLoading(true);
  //   const provider = new GoogleAuthProvider();
  //   try {
  //     await signInWithRedirect(auth, provider);
  //     // Result is handled by getRedirectResult in useEffect
  //     return { error: null };
  //   } catch (error: any) {
  //     console.error("Firebase signInWithRedirect initiation error:", error);
  //     let desc = error.message || "An unexpected error occurred with Google Sign-In initiation.";
  //     if (error.code === "auth/network-request-failed") {
  //         desc = "Network error initiating Google Sign-In. Check connection and Firebase setup.";
  //     } else if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/unauthorized-domain') {
  //         desc = "Google Sign-In is not configured correctly for this domain or Firebase project. Check Firebase Console.";
  //     }
  //     toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive", duration: 7000 });
  //     setLoading(false);
  //     return { error: error as AuthError };
  //   }
  // }, [router, fetchUserProfile]);


  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      router.push("/");
    } catch (error: any) {
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
    }
    return { error: null };
  }, [router]);


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
      else if (error.code === 'auth/network-request-failed') errorMsg = "Network error. Please check your connection.";
      toast({ title: "Password Reset Failed", description: errorMsg, variant: "destructive" });
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
    } else if (updates.age === '' || updates.age === null || updates.age === undefined) {
        firestoreUpdates.age = null;
    }

    if (updates.skills && typeof updates.skills === 'string') {
      firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else if (updates.skills === '' || updates.skills === null || updates.skills === undefined) {
        firestoreUpdates.skills = [];
    }

    // Update Firebase Auth display name and photoURL if full_name or photoURL is changing
    const authProfileUpdates: { displayName?: string | null; photoURL?: string | null } = {};
    if (updates.full_name && auth.currentUser && updates.full_name !== (profile?.full_name || auth.currentUser.displayName) ) {
        authProfileUpdates.displayName = updates.full_name;
    }
    if (updates.photoURL && auth.currentUser && updates.photoURL !== (profile?.photoURL || auth.currentUser.photoURL) ) {
        authProfileUpdates.photoURL = updates.photoURL;
    } else if (updates.photoURL === null && auth.currentUser && (profile?.photoURL || auth.currentUser.photoURL) !== null) {
        // Explicitly setting photoURL to null
        authProfileUpdates.photoURL = null;
    }


    if (Object.keys(authProfileUpdates).length > 0 && auth.currentUser) {
        try {
            await updateFirebaseAuthProfile(auth.currentUser, authProfileUpdates);
            console.log("Firebase Auth profile updated (displayName/photoURL).");
        } catch (authProfileError: any) {
            console.warn("Could not update Firebase Auth displayName/photoURL:", authProfileError);
            toast({title: "Auth Profile Update Warning", description: "Could not update Firebase Auth profile: " + authProfileError.message, variant: "default"});
        }
    }

    try {
      await updateDoc(userDocRef, firestoreUpdates);
      // Re-fetch to get fresh data including server timestamps and updated auth profile info
      const updatedAuthUser = auth.currentUser; // Get potentially updated auth user
      if (updatedAuthUser) {
        const updatedProfileData = await fetchUserProfile(updatedAuthUser);
        setProfile(updatedProfileData);
        toast({ title: "Profile Updated!", description: "Your SkillForge profile has been saved." });
        setLoading(false);
        return { error: null, data: updatedProfileData };
      } else {
        throw new Error("Current user became null after profile update, which is unexpected.");
      }
    } catch (error: any) {
      console.error("Error updating Firestore profile:", error);
      toast({ title: "Profile Update Failed", description: error.message, variant: "destructive" });
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
    // signInWithGoogle, // Removed
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
