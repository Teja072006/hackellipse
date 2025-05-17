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
export type SignUpFormDataFromForm = {
  full_name: string;
  email: string;
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
        console.log("Firestore profile found for UID:", firebaseUser.uid, firestoreProfileData);
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email, // Ensure email from auth is consistent
          photoURL: firebaseUser.photoURL, // Prioritize auth photoURL
          ...firestoreProfileData,
        };
      } else {
        console.warn(`No Firestore profile for UID ${firebaseUser.uid}. This is normal for a new user if profile creation is pending or failed.`);
        return null;
      }
    } catch (error: any) {
      console.error("Error fetching Firebase user profile:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let toastDescription = `Failed to load profile: ${error.message}`;
      if (error.code === "unavailable" || (error.message && error.message.toLowerCase().includes('offline'))) {
        toastDescription = "Network Error: Could not connect to Firestore. Please check your internet and Cloud Workstation network settings (firewalls, DNS). Also ensure you have CREATED a Firestore database in your Firebase project.";
      } else if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
        toastDescription = "Network Error: Could not reach Firestore. Please check internet/network settings and Firebase project configuration in your .env file.";
      }
      toast({ title: "Profile Fetch Error", description: toastDescription, variant: "destructive", duration: 10000 });
      return null;
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    console.log("AuthProvider: Setting up Firebase listeners.");

    const processUser = async (currentAuthUser: FirebaseUser | null) => {
      if (currentAuthUser) {
        setUser(currentAuthUser);
        const userProfileData = await fetchUserProfile(currentAuthUser);
        setProfile(userProfileData);
        // Redirection after login/signup is handled by those functions or page-level checks
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    };

    // Handle redirect result first
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          const authUserFromRedirect = result.user;
          console.log("AuthProvider: Google Sign-In via redirect successful. User UID:", authUserFromRedirect.uid);
          
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
              userProfile = basicProfileData; // Use directly as it's what we just set
            } catch (profileError: any) {
              console.error("AuthProvider: Error creating Firestore profile for Google user:", profileError);
              toast({ title: "Profile Setup Failed", description: `Could not create profile: ${profileError.message}`, variant: "destructive" });
            }
          }
          setUser(authUserFromRedirect);
          setProfile(userProfile);
          toast({ title: "Google Sign-In Successful!", description: "Welcome to SkillForge!" });
          if (router.pathname === "/login" || router.pathname === "/register") {
            router.push("/home");
          }
        }
        // Even if no redirect result, set up the main auth state listener
        const unsubscribe = onAuthStateChanged(auth, processUser);
        return unsubscribe;
      })
      .catch((error) => {
        console.error("AuthProvider: Error processing Google redirect result:", error);
        toast({ title: "Google Sign-In Error", description: `Error after redirect: ${error.message}`, variant: "destructive" });
        // Still set up the main auth state listener in case of error
        const unsubscribe = onAuthStateChanged(auth, processUser);
        return unsubscribe;
      });

    // Cleanup function will be handled by the returned unsubscribe from the listeners
  }, [fetchUserProfile, router]);


  const signIn = useCallback(async (credentials: { email: string, password: string }) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      // User state will be set by onAuthStateChanged
      toast({ title: "Login Successful!", description: "Welcome back to SkillForge!" });
      router.push('/home');
      return { error: null };
    } catch (error: any) {
      console.error("Firebase Sign-In error:", error);
      let errorMsg = error.message || "An unexpected error occurred.";
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        errorMsg = "Invalid email or password. Please try again.";
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error: Could not connect to Firebase Authentication. Check your internet connection and Cloud Workstation network settings (firewalls, DNS).";
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
    const { email, password, profileData: formData } = credentials;
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

      const nameToSetForAuth = formData.full_name?.trim() || authUser.email?.split('@')[0] || "New SkillForge User";
      await updateFirebaseAuthProfile(authUser, { displayName: nameToSetForAuth });
      console.log("Firebase Auth profile (displayName) updated for new user:", nameToSetForAuth);

      let parsedAge: number | null = null;
      if (formData.age && formData.age.trim() !== '') {
        const numAge = parseInt(formData.age, 10);
        if (!isNaN(numAge) && numAge > 0 && Number.isInteger(numAge)) parsedAge = numAge;
      }

      const skillsArray: string[] | null = formData.skills && formData.skills.trim() !== ''
        ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
        : null;

      const profileDataToInsert: Omit<UserProfile, 'createdAt' | 'updatedAt'> = { // Omit server timestamps
        uid: authUser.uid,
        email: authUser.email,
        full_name: nameToSetForAuth,
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
      
      const finalProfileDataWithTimestamps = {
        ...profileDataToInsert,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      console.log("Attempting to insert profile into Firestore with data:", finalProfileDataWithTimestamps);
      const userDocRef = doc(db, "users", authUser.uid);
      await setDoc(userDocRef, finalProfileDataWithTimestamps);
      console.log("Firestore profile created for UID:", authUser.uid);

      // User state will be set by onAuthStateChanged
      toast({ title: "Registration Successful!", description: "Welcome to SkillForge!" });
      router.push('/home');
      return { error: null, user: authUser, profile: profileDataToInsert as UserProfile };

    } catch (error: any) {
      console.error("Firebase Sign-Up error (auth or profile part):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      let errorMsg = error.message || "Registration failed.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already in use.";
      else if (error.code === "auth/invalid-email") errorMsg = `The email address "${email}" is invalid.`;
      else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error during registration. Check internet/network settings and ensure Firebase services are reachable.";
        toast({ title: "Registration Failed - Network Issue", description: errorMsg, variant: "destructive", duration: 10000 });
      } else if (error.code === "auth/weak-password") errorMsg = "Password is too weak. It must be at least 6 characters long.";
      else if (error.code === "permission-denied" || (error.message && error.message.toLowerCase().includes("permission denied"))) {
        errorMsg = "Profile creation failed: Permission denied. Check Firestore security rules for the 'users' collection.";
      } else {
         toast({ title: "Registration Failed", description: errorMsg, variant: "destructive" });
      }
      setLoading(false);
      // If authUser was created but profile failed, Firebase Auth will still have the user.
      // Consider if you need to delete the authUser here, or handle this state.
      // For now, it will just report the error.
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
      // setLoading will be managed by the useEffect hook.
      return { error: null }; // signInWithRedirect doesn't resolve with user directly
    } catch (error: any) {
      console.error("Error initiating Firebase Google Sign-In with Redirect:", error);
      let desc = error.message || "An unexpected error occurred with Google Sign-In.";
      if (error.code === "auth/network-request-failed") {
        desc = "Network error: Could not connect for Google Sign-In. Check internet/network settings and ensure Firebase services are reachable.";
      } else if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request" || error.code === "auth/popup-closed-by-user" ) {
        desc = "Google Sign-In was interrupted. Please ensure popups are allowed and try again. Also check Google Cloud OAuth Consent Screen settings.";
      }
      toast({ title: "Google Sign-In Failed", description: desc, variant: "destructive", duration: 10000 });
      setLoading(false);
      return { error: error as AuthError };
    }
  }, []);


  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      // User and profile state will be set to null by onAuthStateChanged
      toast({ title: "Signed Out", description: "You have been successfully signed out from SkillForge." });
      router.push('/login');
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
    } catch (error: any)
     {
      console.error("Firebase Password Reset error:", error);
      let errorMsg = error.message || "Password reset failed.";
      if (error.code === 'auth/user-not-found') errorMsg = "No user found with this email address.";
      else if (error.code === 'auth/network-request-failed') {
        errorMsg = "Network error during password reset. Check internet/network settings and ensure Firebase services are reachable.";
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
    console.log("Attempting to update Firestore profile for UID:", user.uid, "with updates:", updates);
    const userDocRef = doc(db, "users", user.uid);

    const firestoreUpdates: Record<string, any> = { ...updates, updatedAt: serverTimestamp() };

    // Handle specific type conversions if necessary
    if ('age' in updates && updates.age !== undefined && updates.age !== null) {
      const ageStr = String(updates.age);
      const numAge = parseInt(ageStr, 10);
      firestoreUpdates.age = !isNaN(numAge) && numAge > 0 ? numAge : null;
    } else if ('age' in updates && updates.age === null) {
        firestoreUpdates.age = null;
    }


    if ('skills' in updates && updates.skills !== undefined && updates.skills !== null) {
      if (typeof updates.skills === 'string' && updates.skills.trim() !== '') {
        firestoreUpdates.skills = updates.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
      } else if (Array.isArray(updates.skills)) {
         firestoreUpdates.skills = updates.skills.map(s => String(s).trim()).filter(s => s.length > 0);
      } else {
        firestoreUpdates.skills = []; // Default to empty array if not a valid string or array
      }
    } else if ('skills' in updates && updates.skills === null) {
        firestoreUpdates.skills = null;
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
        // Non-critical, proceed with Firestore update
      }
    }

    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        await updateDoc(userDocRef, firestoreUpdates);
        console.log("Firestore profile updated for UID:", user.uid);
      } else {
        console.warn("Profile document missing for UID:", user.uid, "Creating it with new updates.");
        // If document doesn't exist, create it with all essential fields
        const baseProfile: Omit<UserProfile, 'createdAt'|'updatedAt'> = {
            uid: user.uid,
            email: user.email,
            full_name: updates.full_name || profile?.full_name || user.displayName || user.email?.split('@')[0] || "User",
            photoURL: updates.photoURL !== undefined ? updates.photoURL : (profile?.photoURL || user.photoURL || null),
            age: 'age' in firestoreUpdates ? firestoreUpdates.age : (profile?.age || null),
            gender: 'gender' in firestoreUpdates ? firestoreUpdates.gender : (profile?.gender || null),
            skills: 'skills' in firestoreUpdates ? firestoreUpdates.skills : (profile?.skills || null),
            linkedin_url: 'linkedin_url' in firestoreUpdates ? firestoreUpdates.linkedin_url : (profile?.linkedin_url || null),
            github_url: 'github_url' in firestoreUpdates ? firestoreUpdates.github_url : (profile?.github_url || null),
            description: 'description' in firestoreUpdates ? firestoreUpdates.description : (profile?.description || null),
            achievements: 'achievements' in firestoreUpdates ? firestoreUpdates.achievements : (profile?.achievements || null),
            followers_count: profile?.followers_count || 0,
            following_count: profile?.following_count || 0,
        };
        await setDoc(userDocRef, {
            ...baseProfile,
            ...firestoreUpdates, // Apply specific updates
            createdAt: serverTimestamp(), // Set createdAt only if new
            updatedAt: serverTimestamp()  // This will be set by firestoreUpdates anyway
        });
        console.log("Firestore profile created during update for UID:", user.uid);
      }

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
      if (error.code === 'unavailable' || (error.message && error.message.toLowerCase().includes('offline'))) {
         errorMsg = "Network error updating profile. Check internet/network settings for Firestore access.";
      } else if (error.code === "permission-denied" || (error.message && error.message.toLowerCase().includes("permission denied"))) {
        errorMsg = "Profile update failed: Permission denied. Check Firestore security rules for the 'users' collection.";
      }
      toast({ title: "Profile Update Failed", description: errorMsg, variant: "destructive" });
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
