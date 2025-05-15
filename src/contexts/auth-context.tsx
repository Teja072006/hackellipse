// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser, UserCredential } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  auth, 
  db,
  GoogleAuthProvider, 
  // GithubAuthProvider, // Removed
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  updateProfile as firebaseUpdateProfile, // Renamed to avoid conflict
  sendPasswordResetEmail as firebaseSendPasswordResetEmail, // Renamed
  signOut as firebaseSignOut, // Renamed
  doc,
  setDoc,
  getDoc, // Added getDoc for fetching profile
  serverTimestamp
} from "@/lib/firebase";

interface User extends FirebaseUser {
  // Add any custom user properties if needed from your Firestore document
  // For example: age?: number; skills?: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<UserCredential>;
  signUp: (email: string, pass: string, name: string) => Promise<UserCredential>;
  signInWithGoogle: () => Promise<UserCredential>;
  // signInWithGitHub: () => Promise<UserCredential>; // Removed
  signOutUser: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateUserProfileInFirestore: (user: FirebaseUser, additionalData?: Record<string, any>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Optionally fetch full user profile from Firestore here if needed globally
        // For now, just setting the FirebaseUser object which might be stale regarding custom profile data
        setUser(firebaseUser as User);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const updateUserProfileInFirestore = async (firebaseUser: FirebaseUser, additionalData: Record<string, any> = {}) => {
    if (!firebaseUser) return;
    const userRef = doc(db, `users/${firebaseUser.uid}`);
    
    // Check if document exists to decide on createdAt
    const docSnap = await getDoc(userRef);
    
    const userData: Record<string, any> = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      ...additionalData,
      lastLogin: serverTimestamp(),
    };

    if (!docSnap.exists()) {
      userData.createdAt = serverTimestamp();
    }
    userData.updatedAt = serverTimestamp();


    await setDoc(userRef, userData, { merge: true });
  };
  
  const signIn = async (email: string, pass: string): Promise<UserCredential> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    if (userCredential.user) {
      await updateUserProfileInFirestore(userCredential.user); // Update lastLogin
    }
    return userCredential;
  };

  const signUp = async (email: string, pass: string, name: string): Promise<UserCredential> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await firebaseUpdateProfile(userCredential.user, { displayName: name });
    // Create user document in Firestore
    await updateUserProfileInFirestore(userCredential.user, { displayName: name, email }); 
    
    // Reload user to get updated displayName and ensure context is updated
    // This is important because the user object in userCredential might not immediately reflect the profile update
    const updatedUser = auth.currentUser;
    if (updatedUser) {
      await updatedUser.reload(); // Ensure latest data from Firebase Auth
      setUser(updatedUser as User); // Update context user state
    } else {
      // Fallback if auth.currentUser is somehow null after successful signup
      setUser(userCredential.user as User);
    }

    return userCredential;
  };

  const handleSocialSignIn = async (provider: GoogleAuthProvider /* | GithubAuthProvider // Removed */): Promise<UserCredential> => {
    const userCredential = await signInWithPopup(auth, provider);
    // Create or update user document in Firestore
    await updateUserProfileInFirestore(userCredential.user);
    const updatedUser = auth.currentUser;
     if (updatedUser) {
      await updatedUser.reload();
      setUser(updatedUser as User);
    } else {
      setUser(userCredential.user as User);
    }
    return userCredential;
  };

  const signInWithGoogle = async (): Promise<UserCredential> => {
    const provider = new GoogleAuthProvider();
    return handleSocialSignIn(provider);
  };

  // const signInWithGitHub = async (): Promise<UserCredential> => { // Removed
  //   const provider = new GithubAuthProvider(); // Removed
  //   return handleSocialSignIn(provider); // Removed
  // }; // Removed

  const signOutUser = async (): Promise<void> => { 
    await firebaseSignOut(auth);
    setUser(null); 
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    await firebaseSendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, /* signInWithGitHub, // Removed */ signOutUser, sendPasswordReset, updateUserProfileInFirestore }}>
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
