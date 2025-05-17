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
  GoogleAuthProvider, // Will be used with signInWithRedirect
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
import { useRouter } from "next/navigation"; // Keep for navigation after auth actions
import { toast } from "@/hooks/use-toast";

// UserProfile interface matching Firestore 'users' collection
export interface UserProfile {
  uid: string; // Firebase Auth UID, also document ID in 'users' collection
  email: string | null;
  full_name?: string | null;
  photoURL?: string | null; // Firebase Auth photoURL will be the source of truth if available
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
// This should align with the fields in RegisterForm Zod schema
export type SignUpFormDataFromForm = {
  full_name: string; // Zod schema makes this required
  email: string;     // Zod schema makes this required
  age?: string;       // From form, will be string, needs parsing
  gender?: string;
  skills?: string;    // From form, comma-separated string, needs parsing
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
  signUp: (credentials: { email: string, password: string, profileData: SignUpFormDataFromForm }) => Promise<{ error: AuthError | null; user: FirebaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error?: AuthError | null; user?: FirebaseUser | null }>;
  signOutUser: () => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (emailForReset: string) => Promise<{ error: AuthError | null }>;
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
        console.log("Firestore profile found for UID:", firebaseUser.uid);
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email, // Ensure email from auth is consistent
          photoURL: firebaseUser.photoURL, // Prioritize auth photoURL
          ...firestoreProfileData,
        };
      } else {
        console.warn(`No Firestore profile found for UID ${firebaseUser.uid}. This is normal for a new user if profile creation is pending.`);
        return null;
      }
    } catch (error: any) {
      console.error("Error fetching Firebase user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let toastDescription = `Failed to load profile: ${error.message}`;
      if (error.code === "unavailable") {
        toastDescription = "Network Error: Could not connect to Firestore. Please check your internet connection, Cloud Workstation network settings (firewalls, DNS), and ensure you have CREATED a Firestore database in your Firebase project and set up security rules.";
      } else if (error.message && (error.message.toLowerCase().includes('failed to fetch') || error.code === 'auth/network-request-failed')) {
        toastDescription = "Network Error: Could not reach Firebase/Firestore. Please check internet/network settings (firewalls, DNS on Cloud Workstation) and Firebase project configuration in your .env file.";
      } else if (error.code === 'permission-denied') {
        toastDescription = "Permission Denied: Could not fetch profile. Check Firestore security rules for the 'users' collection to allow reads.";
      }
      toast({ title: "Profile Fetch Error", description: toastDescription, variant: "destructive", duration: 10000 });
      return null;
    }
  }, []);


  useEffect(() => {
    setLoading(true);
    console.log("AuthProvider: Setting up Firebase listeners (onAuthStateChanged & getRedirectResult).");

    // Check for redirect result first (for Google Sign-In)
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
            const basicProfileData: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
              uid: authUserFromRedirect.uid,
              email: authUserFromRedirect.email,
              full_name: nameToSet,
              photoURL: authUserFromRedirect.photoURL,
              followers_count: 0,
              following_count: 0,
              // Optional fields are null by default
              age: null, gender: null, skills: null,
              linkedin_url: null, github_url: null,
              description: null, achievements: null,
            };
            try {
              await setDoc(userDocRef, {
                ...basicProfileData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              userProfile = await fetchUserProfile(authUserFromRedirect); // Re-fetch to get timestamps
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
        if (error.code !== "auth/no-redirect-operation") { // Ignore "no redirect operation" error
          toast({ title: "Google Sign-In Error", description: `Error after redirect: ${error.message}`, variant: "destructive" });
        }
      })
      .finally(() => {
        // Always set up onAuthStateChanged listener
        const unsubscribe = onAuthStateChanged(auth, async (currentAuthUser) => {
          console.log("Firebase onAuthStateChanged - User state:", currentAuthUser ? currentAuthUser.uid : null);
          if (currentAuthUser) {
            setUser(currentAuthUser); // Update auth user state
            const userProfileData = await fetchUserProfile(currentAuthUser);
            setProfile(userProfileData);
          } else {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
        });
        return () => {
          console.log("AuthProvider: Unsubscribing from onAuthStateChanged.");
          unsubscribe();
        };
      });
  }, [fetchUserProfile, router]);


  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      if(router) router.push('/home');
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      let errorMsg = error.message || "An unexpected error occurred.";
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        errorMsg = "Invalid email or password. Please try again.";
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error: Could not connect to Firebase Authentication. Check your internet and Cloud Workstation network settings.";
        toast({ title: "Login Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Login Failed", description: errorMsg, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError };
    }
  }, [router]);


  const signUp = useCallback(async (credentials: { email: string, password: string, profileData: SignUpFormDataFromForm }) => {
    setLoading(true);
    const { email, password, profileData: rawProfileData } = credentials;
    
    console.log("AuthContext signUp called with credentials:", JSON.stringify(credentials, null, 2));
    console.log("AuthContext signUp - Received rawProfileData from form:", JSON.stringify(rawProfileData, null, 2));

    const profileData = rawProfileData || {} as SignUpFormDataFromForm; // Ensure profileData is always an object
    console.log("AuthContext signUp - Effective profileData being used:", JSON.stringify(profileData, null, 2));


    let authUser: FirebaseUser | null = null;

    try {
      console.log("Attempting Firebase auth sign up with email:", email);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      authUser = userCredential.user;

      if (!authUser || !authUser.uid || !authUser.email) {
        console.error("Firebase auth user not created properly or missing details.");
        throw { code: "auth/internal-error", message: "User authentication failed to return expected user details." };
      }
      console.log("Firebase auth user created. UID:", authUser.uid, "Email:", authUser.email);
      
      // Prioritize full_name from the form, then fallback
      const nameFromForm = (typeof profileData.full_name === 'string' && profileData.full_name.trim()) ? profileData.full_name.trim() : '';
      const nameToSetForAuth = nameFromForm || authUser.email?.split('@')[0] || "New SkillForge User";

      await updateFirebaseAuthProfile(authUser, { displayName: nameToSetForAuth });
      console.log("Firebase Auth profile (displayName) updated for new user:", nameToSetForAuth);

      let parsedAge: number | null = null;
      if (profileData.age && typeof profileData.age === 'string' && profileData.age.trim() !== '') {
        const numAge = parseInt(profileData.age, 10);
        if (!isNaN(numAge) && numAge > 0 && Number.isInteger(numAge)) parsedAge = numAge;
      }

      const skillsArray: string[] | null = (profileData.skills && typeof profileData.skills === 'string' && profileData.skills.trim() !== '')
        ? profileData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'photoURL'> = {
        uid: authUser.uid,
        email: authUser.email,
        full_name: nameToSetForAuth, // Use the derived name
        age: parsedAge,
        gender: (typeof profileData.gender === 'string' && profileData.gender.trim()) ? profileData.gender.trim() : null,
        skills: skillsArray,
        linkedin_url: (typeof profileData.linkedin_url === 'string' && profileData.linkedin_url.trim()) ? profileData.linkedin_url.trim() : null,
        github_url: (typeof profileData.github_url === 'string' && profileData.github_url.trim()) ? profileData.github_url.trim() : null,
        description: (typeof profileData.description === 'string' && profileData.description.trim()) ? profileData.description.trim() : null,
        achievements: (typeof profileData.achievements === 'string' && profileData.achievements.trim()) ? profileData.achievements.trim() : null,
        followers_count: 0,
        following_count: 0,
      };
      
      const finalProfileDataWithTimestamps = {
        ...profileDataToInsert,
        photoURL: authUser.photoURL || null, // Get photoURL from authUser after it's potentially set by Google/provider
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log("Attempting to insert profile into Firestore with data:", finalProfileDataWithTimestamps);
      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, finalProfileDataWithTimestamps);
      console.log("Firestore profile created for UID:", authUser.uid);

      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      if(router) router.push('/home');
      // setLoading(false); // onAuthStateChanged will handle this
      return { error: null, user: authUser, profile: finalProfileDataWithTimestamps as UserProfile };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") {
        errorMsg = "This email address is already registered. Please try logging in or use a different email.";
      } else if (error.code === "auth/invalid-email") {
        errorMsg = `The email address "${email}" is invalid.`;
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during registration. Check Cloud Workstation network/firewall settings and internet connection.";
        toast({ title: "Registration Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else if (error.code === "auth/weak-password") {
        errorMsg = "Password is too weak. It must be at least 6 characters long.";
      } else if (error.code === "permission-denied" || (error.message && error.message.toLowerCase().includes("permission denied"))) {
        errorMsg = "Profile creation failed: Permission denied. Check Firestore security rules for the 'users' collection.";
      } else {
         toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      }
      
      if (authUser?.uid) { // If auth user was created but profile failed
        console.warn("Profile creation failed after auth user was created. User will be signed out. Auth user might need manual deletion if profile creation is mandatory:", authUser.uid);
        await signOut(auth).catch(e => console.error("Error signing out user after profile creation failure:", e));
        setUser(null); // Ensure local auth state is cleared
        setProfile(null);
      }
      setLoading(false);
      return { error: error as AuthError, user: authUser, profile: null };
    }
  }, [router]);


  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      console.log("Attempting Firebase Google Sign-In with Redirect...");
      await signInWithRedirect(auth, provider);
      // Redirect happens here. Result is handled by getRedirectResult in useEffect.
      // setLoading will be false after redirect result or onAuthStateChanged.
      return { error: null }; // signInWithRedirect doesn't resolve with user directly here
    } catch (error: any) {
      console.error("Error initiating Firebase Google Sign-In with Redirect:", error);
      let desc = error.message || "An unexpected error occurred with Google Sign-In.";
      if (error.code === "auth/network-request-failed") {
        desc = "Network error: Could not connect for Google Sign-In. Check Cloud Workstation network/firewall settings.";
      } else if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request" || error.code === "auth/popup-closed-by-user" ) {
        desc = "Google Sign-In was interrupted. Ensure popups are allowed. Check Google Cloud OAuth Consent Screen settings, especially if in 'Testing' mode (add test users).";
      }
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive", duration: 10000 });
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);


  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      if(router) router.push('/login');
      // User and profile state will be set to null by onAuthStateChanged
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-Out error:", error);
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
      return { error: error as AuthError };
    }
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
        errorMsg = "Network error during password reset. Check Cloud Workstation network/firewall settings.";
        toast({ title: "Password Reset Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Password Reset Failed", description: errorMsg, variant: "destructive" });
      }
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count' | 'photoURL'>>) => {
    if (!user?.uid) {
      toast({ title: "Not Authenticated", description: "You must be logged in to update your profile.", variant: "destructive" });
      return { error: new Error("User not authenticated.") as AuthError, data: null };
    }
    setLoading(true);
    console.log("Attempting to update Firestore profile for UID:", user.uid, "with updates:", updates);
    const userDocRef = doc(db, "users", user.uid);

    const firestoreUpdates: Record<string, any> = { ...updates, updatedAt: serverTimestamp() };

    if ('age' in updates && updates.age !== undefined) {
      firestoreUpdates.age = updates.age === null ? null : Number(updates.age);
    }
    if ('skills' in updates && updates.skills !== undefined) {
      firestoreUpdates.skills = updates.skills === null ? null : (Array.isArray(updates.skills) ? updates.skills : []);
    }

    // Update Firebase Auth profile (displayName) if full_name changed
    if (updates.full_name && auth.currentUser && updates.full_name !== (profile?.full_name || auth.currentUser.displayName)) {
      try {
        await updateFirebaseAuthProfile(auth.currentUser, { displayName: updates.full_name });
        console.log("Firebase Auth profile (displayName) updated.");
      } catch (authProfileError: any) {
        console.warn("Could not update Firebase Auth displayName:", authProfileError);
      }
    }
    // Note: Updating photoURL for Firebase Auth usually involves uploading to Storage and then calling updateProfile with photoURL.
    // The `updates.photoURL` is for the Firestore profile field.

    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        await updateDoc(userDocRef, firestoreUpdates);
      } else {
        console.warn("Profile document missing for UID during update:", user.uid, "Creating it with new updates.");
        const baseProfile: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'photoURL'> = {
            uid: user.uid,
            email: user.email,
            full_name: updates.full_name || profile?.full_name || user.displayName || user.email?.split('@')[0] || "User",
            age: 'age' in firestoreUpdates ? firestoreUpdates.age : (profile?.age || null),
            gender: 'gender' in updates ? updates.gender : (profile?.gender || null),
            skills: 'skills' in firestoreUpdates ? firestoreUpdates.skills : (profile?.skills || null),
            linkedin_url: 'linkedin_url' in updates ? updates.linkedin_url : (profile?.linkedin_url || null),
            github_url: 'github_url' in updates ? updates.github_url : (profile?.github_url || null),
            description: 'description' in updates ? updates.description : (profile?.description || null),
            achievements: 'achievements' in updates ? updates.achievements : (profile?.achievements || null),
            followers_count: profile?.followers_count || 0,
            following_count: profile?.following_count || 0,
        };
        await setDoc(userDocRef, {
            ...baseProfile, // Spread the base profile first
            ...firestoreUpdates, // Then spread the specific updates (which includes updatedAt)
            photoURL: profile?.photoURL || auth.currentUser?.photoURL || null, // Use existing photoURL
            createdAt: serverTimestamp(), // Set createdAt only if new
        }, { merge: true });
      }

      const updatedAuthUser = auth.currentUser; // Re-fetch current auth user
      if (updatedAuthUser) {
        const updatedProfileData = await fetchUserProfile(updatedAuthUser); // Re-fetch profile
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
       if (error.code === 'permission-denied') {
        errorMsg = "Profile update failed: Permission denied. Check Firestore security rules.";
      } else if (error.code === 'unavailable' || (error.message && error.message.toLowerCase().includes('offline'))) {
         errorMsg = "Network error updating profile. Check Cloud Workstation network/firewall settings.";
      }
      toast({ title: "Profile Update Failed", description: errorMsg, variant: "destructive" });
      setLoading(false);
      return { error: error as Error, data: null };
    }
  }, [user, profile, fetchUserProfile, router]);


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
