// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth } from "@/lib/firebase"; // Assuming firebase setup is in lib/firebase

interface User extends FirebaseUser {
  // Add any custom user properties if needed
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<any>; // Replace 'any' with actual return type
  signUp: (email: string, pass: string, name: string) => Promise<any>; // Replace 'any' with actual return type
  signInWithGoogle: () => Promise<any>;
  signInWithGitHub: () => Promise<any>;
  signOutUser: () => Promise<void>;
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
  
  // Placeholder functions - replace with actual Firebase calls
  const signIn = async (email: string, pass: string) => { console.log("signIn", email, pass); alert("Sign In (mock)"); return Promise.resolve(); };
  const signUp = async (email: string, pass: string, name: string) => { console.log("signUp", email, pass, name); alert("Sign Up (mock)"); return Promise.resolve(); };
  const signInWithGoogle = async () => { console.log("signInWithGoogle"); alert("Sign In With Google (mock)"); return Promise.resolve(); };
  const signInWithGitHub = async () => { console.log("signInWithGitHub"); alert("Sign In With GitHub (mock)"); return Promise.resolve(); };
  const signOutUser = async () => { 
    await auth.signOut(); // Actual Firebase sign out
    setUser(null); 
    alert("Signed Out (mock)"); 
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signInWithGitHub, signOutUser }}>
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
