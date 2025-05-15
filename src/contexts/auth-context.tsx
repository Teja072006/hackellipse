// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser, UserCredential } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  auth, 
  db,
  GoogleAuthProvider, 
  GithubAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  updateProfile as firebaseUpdateProfile, // Renamed to avoid conflict
  sendPasswordResetEmail as firebaseSendPasswordResetEmail, // Renamed
  signOut as firebaseSignOut, // Renamed
  doc,
  setDoc,
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
  signInWithGitHub: () => Promise<UserCredential>;
  signOutUser: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateUserProfileInFirestore: (user: FirebaseUser, additionalData?: Record<string, any>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser as User | null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const updateUserProfileInFirestore = async (firebaseUser: FirebaseUser, additionalData: Record<string, any> = {}) => {
    if (!firebaseUser) return;
    const userRef = doc(db, `users/${firebaseUser.uid}`);
    const userData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      ...additionalData,
      // Ensure createdAt is only set once
      ...(additionalData.createdAt ? {} : { createdAt: serverTimestamp() }),
      lastLogin: serverTimestamp(),
    };
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
    await updateUserProfileInFirestore(userCredential.user, { displayName: name, email }); // Pass other initial data from form if needed
    // Reload user to get updated displayName
    await userCredential.user.reload();
    setUser(auth.currentUser as User | null); // Update context user
    return userCredential;
  };

  const handleSocialSignIn = async (provider: GoogleAuthProvider | GithubAuthProvider): Promise<UserCredential> => {
    const userCredential = await signInWithPopup(auth, provider);
    // Create or update user document in Firestore
    await updateUserProfileInFirestore(userCredential.user);
    return userCredential;
  };

  const signInWithGoogle = async (): Promise<UserCredential> => {
    const provider = new GoogleAuthProvider();
    return handleSocialSignIn(provider);
  };

  const signInWithGitHub = async (): Promise<UserCredential> => {
    const provider = new GithubAuthProvider();
    return handleSocialSignIn(provider);
  };

  const signOutUser = async (): Promise<void> => { 
    await firebaseSignOut(auth);
    setUser(null); 
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    await firebaseSendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signInWithGitHub, signOutUser, sendPasswordReset, updateUserProfileInFirestore }}>
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
