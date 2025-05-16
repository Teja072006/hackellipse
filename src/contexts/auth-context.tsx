// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as updateFirebaseProfile,
  UserCredential,
  onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, DocumentData } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export interface UserProfile {
  uid: string;
  email: string | null;
  name?: string | null;
  age?: number | null;
  gender?: string |null;
  skills?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  description?: string | null;
  achievements?: string | null;
  followers_count?: number;
  following_count?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

type SignUpProfileData = Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count'> & {
    name: string;
};

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (credentials: {email: string, password: string}) => Promise<{ error: any | null }>;
  signUp: (credentials: {email: string, password: string, data: SignUpProfileData }) => Promise<{ error: any | null; user: FirebaseUser | null; profile: UserProfile | null }>;
  signInWithGoogle: () => Promise<{ error: any | null, user: FirebaseUser | null, profile: UserProfile | null }>;
  signOutUser: () => Promise<{ error: any | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: any | null }>;
  updateUserProfile: (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>) => Promise<{ error: any | null; data: UserProfile | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    if (!firebaseUser || !db) { // Added !db check
        console.error("fetchUserProfile: Firebase user or DB not available.");
        return null;
    }
    console.log(`fetchUserProfile: Attempting to fetch profile for UID: ${firebaseUser.uid}`);
    const profileRef = doc(db, "users", firebaseUser.uid);
    try {
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as Omit<UserProfile, 'uid'>;
        return { uid: firebaseUser.uid, ...profileData };
      } else {
        console.log(`No profile found in Firestore for user ${firebaseUser.uid}.`);
        return null;
      }
    } catch (error: any) {
      const fullErrorString = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
      console.error("Error fetching Firebase user profile:", fullErrorString);

      if (error.code === 'unavailable') {
        console.error(
          "Firestore Error (unavailable): Client is offline. This often means:",
          "\n1. Actual network disconnection from the client to Firestore servers.",
          "\n2. The Firestore database has not been created/enabled in your Firebase project console (`skillforge-ddcc1`). Go to Firebase Console -> Firestore Database -> Create database.",
          "\n3. A misconfiguration in Firebase project settings (e.g., wrong `projectId` in .env) or severe network restrictions (e.g., firewall on your Cloud Workstation).",
          "\nPlease verify your Firebase project's Firestore setup and your environment's network connectivity.",
          "\nOriginal error object:", fullErrorString
        );
      } else if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
         console.error(
          'Error fetching profile (Network Issue - Failed to fetch with Firebase):',
          'This usually means the application could not reach the Firebase/Firestore server. Please double-check:',
          '1. Your Firebase config in .env (NEXT_PUBLIC_FIREBASE_...). Ensure projectId is correct.',
          '2. Your internet connection and any firewalls/proxies on your development environment (e.g., Cloud Workstation).',
          '3. Firestore security rules allow reads for authenticated users (though this usually gives a permission-denied error, not offline).',
          'Detailed error:', fullErrorString
        );
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (!auth) {
        console.error("Firebase auth object is not available. Check Firebase initialization.");
        setLoading(false);
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const userProfileData = await fetchUserProfile(firebaseUser);
        setProfile(userProfileData);
        // if (!userProfileData && router.pathname !== '/register' && !router.pathname.startsWith('/profile-setup')) {
        //   // Optional: redirect to a profile setup page if profile is missing after login
        // }
      } else {
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
      // onAuthStateChanged will handle setting user and profile
      setLoading(false);
      router.push("/home");
      return { error: null };
    } catch (error: any) {
      setLoading(false);
      return { error };
    }
  }, [router]);

  const signUp = useCallback(async (credentials: { email: string, password: string, data: SignUpProfileData }) => {
    setLoading(true);
    try {
      const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
      const authUser = userCredential.user;

      if (!authUser) {
        throw new Error("User creation failed, no user returned from Firebase Auth.");
      }

      await updateFirebaseProfile(authUser, {
        displayName: credentials.data.name,
      });

      const profileDataToCreate: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'> & { createdAt: Timestamp, updatedAt: Timestamp } = {
        email: authUser.email,
        name: credentials.data.name || authUser.email?.split('@')[0] || 'New User',
        age: credentials.data.age && !isNaN(Number(credentials.data.age)) ? Number(credentials.data.age) : null,
        gender: credentials.data.gender || null,
        skills: credentials.data.skills?.length ? credentials.data.skills : null,
        linkedin_url: credentials.data.linkedin_url || null,
        github_url: credentials.data.github_url || null,
        description: credentials.data.description || null,
        achievements: credentials.data.achievements || null,
        followers_count: 0,
        following_count: 0,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };
      
      const profileRef = doc(db, "users", authUser.uid);
      await setDoc(profileRef, profileDataToCreate);
      
      const newProfileSnap = await getDoc(profileRef);
      const newProfile = newProfileSnap.exists() ? { uid: authUser.uid, ...newProfileSnap.data() } as UserProfile : null;

      setProfile(newProfile);
      setUser(authUser); 
      setLoading(false);
      router.push("/home");
      return { error: null, user: authUser, profile: newProfile };
    } catch (error: any) {
      const fullErrorString = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
      console.error("Error during Firebase signup or profile creation:", fullErrorString);
      
      if (auth.currentUser) {
        await signOut(auth).catch(e => console.error("Error signing out user after profile creation failure:", e));
        setUser(null);
      }
      setLoading(false);
      return { error, user: null, profile: null };
    }
  }, [router]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const authUser = result.user;
      
      const profileRef = doc(db, "users", authUser.uid);
      const profileSnap = await getDoc(profileRef);
      let userProfile: UserProfile | null = null;

      if (!profileSnap.exists()) {
        console.log(`New Google user ${authUser.uid}. Creating profile in Firestore.`);
        const newProfileData: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'> & { createdAt: Timestamp, updatedAt: Timestamp } = {
          email: authUser.email,
          name: authUser.displayName || authUser.email?.split('@')[0] || 'New User',
          followers_count: 0,
          following_count: 0,
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
        };
        await setDoc(profileRef, newProfileData);
        userProfile = { uid: authUser.uid, ...newProfileData, createdAt: newProfileData.createdAt, updatedAt: newProfileData.updatedAt } as UserProfile;
      } else {
        userProfile = { uid: authUser.uid, ...profileSnap.data() } as UserProfile;
      }
      
      setProfile(userProfile);
      setLoading(false);
      router.push("/home");
      return { error: null, user: authUser, profile: userProfile };
    } catch (error: any) {
      setLoading(false);
      return { error, user: null, profile: null };
    }
  }, [router]);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setLoading(false);
      router.push("/");
      return { error: null };
    } catch (error: any) {
      setLoading(false);
      return { error };
    }
  }, [router]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setLoading(false);
      return { error: null };
    } catch (error: any) {
      setLoading(false);
      return { error };
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>) => {
    if (!user) {
      return { error: { message: "User not authenticated." } as any, data: null };
    }
    setLoading(true);
    
    const profileRef = doc(db, "users", user.uid);
    if (updates.name !== undefined && auth.currentUser) {
      try {
        await updateFirebaseProfile(auth.currentUser, { displayName: updates.name });
      } catch (authProfileError: any) {
        console.error("Error updating Firebase Auth display name:", authProfileError);
        // Optionally decide if this should halt the Firestore update
      }
    }
    
    const dataToUpdateFirestore: Partial<UserProfile> & { updatedAt: Timestamp } = {
      ...updates,
      updatedAt: serverTimestamp() as Timestamp,
    };

    try {
      await updateDoc(profileRef, dataToUpdateFirestore as DocumentData);
      
      const updatedProfileSnap = await getDoc(profileRef);
      const updatedProfileData = updatedProfileSnap.exists() ? { uid: user.uid, ...updatedProfileSnap.data() } as UserProfile : null;
      
      setProfile(updatedProfileData);
      setUser(auth.currentUser); 
      setLoading(false);
      return { error: null, data: updatedProfileData };
    } catch (error: any) {
      console.error('Error updating Firebase profile in Firestore:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      setLoading(false);
      return { error, data: null };
    }
  }, [user]);

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
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
