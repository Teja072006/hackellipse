
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
  signInWithRedirect, // Changed from signInWithPopup
  getRedirectResult,  // To handle the result of redirect
  signInWithCredential // Still needed if we were to re-implement GAPI/GIS token federation
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
import { useRouter, usePathname } from "next/navigation";
import { toast } from "@/hooks/use-toast";

// UserProfile interface based on your "Users Table" (adapted for Firestore)
export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null;
  photoURL?: string | null; // From Firebase Auth, can be synced
  age?: number | null;
  gender?: string | null;
  skills?: string[] | null; // Stored as an array in Firestore
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  createdAt?: Timestamp | FieldValue; // Firestore Timestamp
  updatedAt?: Timestamp | FieldValue; // Firestore Timestamp
}

// Type for data coming from the registration form
// Sticking to string for age and skills as they come from form inputs, conversion happens before DB save
type SignUpProfileDataFromForm = {
  full_name: string;
  age?: string; // Will be string from form, converted to number
  gender?: string;
  skills?: string; // Comma-separated from form, converted to array
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
  signInWithGoogle: () => Promise<{ error?: AuthError | null }>; // Using redirect, so direct user/error return is less applicable here
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
  const pathname = usePathname();

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    if (!firebaseUser?.uid) return null;
    console.log("Fetching Firestore profile for UID:", firebaseUser.uid);
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const firestoreProfileData = userDocSnap.data() as Omit<UserProfile, 'uid' | 'email' | 'photoURL'>;
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email, // Ensure email from auth is authoritative
          photoURL: firebaseUser.photoURL, // Ensure photoURL from auth is authoritative
          ...firestoreProfileData,
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This is normal for a new user if profile creation is pending.`);
        return { // Return a minimal profile based on authUser
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
          description: "Could not connect to the database. Check internet connection and Firestore setup (ensure database is created in Firebase console).",
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

    // Handle redirect result first
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          const authUser = result.user;
          console.log("Google Sign-In successful via redirect. User UID:", authUser.uid);
          setUser(authUser);

          const userDocRef = doc(db, "users", authUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (!userDocSnap.exists()) {
            console.log("No Firestore profile after Google redirect, creating basic profile...");
            const basicProfileData: Partial<UserProfile> = {
              uid: authUser.uid,
              email: authUser.email,
              full_name: authUser.displayName || authUser.email?.split('@')[0] || "New User",
              photoURL: authUser.photoURL,
              followers_count: 0,
              following_count: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userDocRef, basicProfileData, { merge: true });
            const newProfile = await fetchUserProfile(authUser);
            setProfile(newProfile);
          } else {
            const existingProfile = await fetchUserProfile(authUser);
            setProfile(existingProfile);
          }
          toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
          if (pathname === "/login" || pathname === "/register") {
            router.push("/home");
          }
        }
      })
      .catch((error) => {
        console.error("Error processing Firebase redirect result:", error);
        if (error.code === 'auth/account-exists-with-different-credential') {
            toast({title: "Sign-in Error", description: "An account already exists with the same email address but different sign-in credentials. Try signing in using a different method associated with this email.", variant: "destructive", duration: 7000});
        } else {
            toast({ title: "Google Sign-In Failed", description: error.message || "Could not process redirect sign-in.", variant: "destructive" });
        }
      })
      .finally(() => {
        // Set up the regular auth state listener AFTER processing redirect
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            console.log("onAuthStateChanged - User signed IN:", firebaseUser.uid);
            // Only set user if it's different or wasn't set by getRedirectResult
             if (!user || user.uid !== firebaseUser.uid) {
                setUser(firebaseUser);
                const userProfileData = await fetchUserProfile(firebaseUser);
                setProfile(userProfileData);
            }
            if (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password") {
              router.push("/home");
            }
          } else {
            console.log("onAuthStateChanged - User signed OUT");
            setUser(null);
            setProfile(null);
             if (pathname !== "/" && !pathname.startsWith("/auth") && pathname !== "/login" && pathname !== "/register" && pathname !== "/forgot-password" && !auth.currentUser) {
              // Redirect to login if on a protected page and not already on an auth page
              // This check helps avoid redirect loops
              // router.push("/login"); // This can be too aggressive, handled by AuthenticatedLayout better
            }
          }
          setLoading(false);
        });
        return () => unsubscribe();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile, router]); // router is for navigation

  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      // User state update handled by onAuthStateChanged
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      let errorMsg = error.message || "An unexpected error occurred.";
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        errorMsg = "Invalid email or password.";
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error. Please check your connection and ensure Firebase services are reachable from your environment.";
      }
      toast({ title: "Login Failed", description: errorMsg, variant: "destructive" });
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
        toast({ title: "Registration Failed", description: "User authentication failed (no authUser).", variant: "destructive" });
        setLoading(false);
        return { error: { code: "auth/internal-error", message: "User authentication failed (no authUser)." } as AuthError, user: null, profile: null };
      }
      console.log("Firebase auth user created successfully. UID:", authUser.uid, "Email:", authUser.email);

      const displayName = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New User";
      await updateFirebaseAuthProfile(authUser, { displayName }); // Update Firebase Auth profile
      console.log("Firebase Auth profile displayName updated.");

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
        const numAge = parseInt(formData.age, 10);
        if (!isNaN(numAge) && numAge > 0) parsedAge = numAge;
        else console.warn("Invalid age string provided:", formData.age);
      }

      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: UserProfile = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: displayName,
        photoURL: authUser.photoURL, // Firebase Auth photoURL
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
      console.log("Firestore profile created/updated for UID:", authUser.uid);
      
      // Set profile state immediately (onAuthStateChanged will also fetch, but this is quicker)
      setProfile(profileDataToInsert); 

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      // Navigation handled by onAuthStateChanged
      return { error: null, user: authUser, profile: profileDataToInsert };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during registration. Please check your connection.";
      } else if (error.code && (error.code.startsWith("permission-denied") || error.code.startsWith("unavailable"))) {
        errorMsg = "Database error during profile creation. Check Firestore rules and connectivity.";
      }
      
      toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      // Attempt to sign out partially created user if auth part succeeded but profile part failed
      if (auth.currentUser && auth.currentUser.email === email) {
        await signOut(auth).catch(e => console.warn("Error signing out after failed signup:", e));
      }
      setUser(null); // Ensure user state is cleared
      setProfile(null);
      setLoading(false);
      return { error: error as AuthError, user: null, profile: null };
    }
  }, [fetchUserProfile]);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      // This will navigate the user to Google's sign-in page
      // and then back to your app. The result is handled by getRedirectResult.
      console.log("Initiating Firebase signInWithRedirect for Google...");
      await signInWithRedirect(auth, provider);
      // Note: After this call, the page will redirect.
      // User/profile setting happens in the useEffect hook via getRedirectResult and onAuthStateChanged.
      // No need to setLoading(false) here as page will navigate away.
      return { error: null }; // Return type adjusted
    } catch (error: any) {
      console.error("Firebase signInWithRedirect initiation error:", error);
      let desc = error.message || "An unexpected error occurred with Google Sign-In initiation.";
      if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
          desc = "Google Sign-In was cancelled. Please try again.";
      } else if (error.code === "auth/network-request-failed") {
          desc = "Network error initiating Google Sign-In. Check connection and Firebase setup.";
      } else if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/unauthorized-domain') {
          desc = "Google Sign-In is not configured correctly for this domain or Firebase project. Check Firebase Console (Auth -> Sign-in method -> Google enabled & Authorized Domains) and Google Cloud Console (OAuth Client ID -> Authorized JavaScript origins & Redirect URIs).";
      }
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive", duration: 7000 });
      setLoading(false); // Set loading to false if redirect initiation fails
      return { error: error as AuthError };
    }
  }, []);


  const signOutUser = useCallback(async () => {
    // setLoading(true); // setLoading(true) here can cause UI flicker if onAuthStateChanged handles it quickly
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      // User state set to null by onAuthStateChanged
      // setLoading(false); // Handled by onAuthStateChanged
      router.push("/"); // Explicitly navigate to home after sign out
    } catch (error: any) {
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
      setLoading(false); // Ensure loading is false on error
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

    // Convert age string from form to number for Firestore
    if (updates.age && typeof updates.age === 'string') {
      const numAge = parseInt(updates.age, 10);
      firestoreUpdates.age = !isNaN(numAge) && numAge > 0 ? numAge : null;
    } else if (updates.age === '' || updates.age === null || updates.age === undefined) {
        firestoreUpdates.age = null;
    }


    // Convert skills string from form to array for Firestore
    if (updates.skills && typeof updates.skills === 'string') {
      firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else if (updates.skills === '' || updates.skills === null || updates.skills === undefined) {
        firestoreUpdates.skills = []; // Store as empty array if no skills
    }

    // Update Firebase Auth display name and photoURL if full_name or photoURL is changing
    const authProfileUpdates: { displayName?: string | null; photoURL?: string | null } = {};
    if (updates.full_name && auth.currentUser && updates.full_name !== auth.currentUser.displayName) {
        authProfileUpdates.displayName = updates.full_name;
    }
    if (updates.photoURL && auth.currentUser && updates.photoURL !== auth.currentUser.photoURL) {
        authProfileUpdates.photoURL = updates.photoURL;
    }

    if (Object.keys(authProfileUpdates).length > 0) {
        try {
            await updateFirebaseAuthProfile(auth.currentUser!, authProfileUpdates);
            console.log("Firebase Auth profile updated (displayName/photoURL).");
        } catch (authProfileError: any) {
            console.warn("Could not update Firebase Auth displayName/photoURL:", authProfileError);
            toast({title: "Auth Profile Update Warning", description: "Could not update Firebase Auth profile: " + authProfileError.message, variant: "default"});
            // Continue with Firestore update even if auth profile update fails
        }
    }
    
    try {
      await updateDoc(userDocRef, firestoreUpdates);
      const updatedProfileData = await fetchUserProfile(user); // Re-fetch to get fresh data including server timestamps
      setProfile(updatedProfileData);
      toast({ title: "Profile Updated!", description: "Your SkillForge profile has been saved." });
      setLoading(false);
      return { error: null, data: updatedProfileData };
    } catch (error: any) {
      console.error("Error updating Firestore profile:", error);
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

// Remove GAPI specific types/declarations if they were added for previous GAPI/GIS attempts
// declare global {
//   interface Window {
//     gapi?: any;
//     google?: any;
//   }
// }
