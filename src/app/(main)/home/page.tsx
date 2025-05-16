// src/app/(main)/home/page.tsx
"use client";

import { useAuth, UserProfile } from "@/hooks/use-auth"; // Ensure UserProfile is exported if not already
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle, Edit3, UploadCloud, Search, User } from "lucide-react";
import Image from "next/image";
import React from "react"; // Import React for useEffect and useState if needed, or direct calculation

export default function UserHomePage() {
  const { user, profile } = useAuth();

  const calculateProfileCompleteness = (
    userAuth: typeof user | null,
    userProfile: UserProfile | null
  ): number => {
    if (!userProfile || !userAuth) return 0;

    let completedFields = 0;
    const totalFields = 8; // Define the total number of fields we're checking

    // Check fields from Firestore profile
    if (userProfile.full_name && userProfile.full_name.trim() !== "") completedFields++;
    if (userProfile.age && userProfile.age > 0) completedFields++;
    if (userProfile.gender && userProfile.gender.trim() !== "") completedFields++;
    if (userProfile.skills && userProfile.skills.length > 0) completedFields++;
    if (userProfile.description && userProfile.description.trim() !== "") completedFields++;
    if (userProfile.linkedin_url && userProfile.linkedin_url.trim() !== "") completedFields++;
    if (userProfile.github_url && userProfile.github_url.trim() !== "") completedFields++;
    
    // Check photoURL from the auth user object
    if (userAuth.photoURL && userAuth.photoURL.trim() !== "") completedFields++;

    return Math.round((completedFields / totalFields) * 100);
  };

  const profileCompleteness = React.useMemo(() => calculateProfileCompleteness(user, profile), [user, profile]);

  if (!user) {
    return null; // Or a loading state, though layout should handle redirect
  }

  const displayName = profile?.full_name || user.email;

  return (
    <div className="space-y-8">
      <Card className="bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl text-neon-accent">Welcome back, {displayName}!</CardTitle>
          <CardDescription>Here's what's new and suggested for you on SkillForge.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-2">Your Skills</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {profile?.skills && profile.skills.length > 0 ? (
                profile.skills.map(tag => (
                  <span key={tag} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{tag}</span>
                ))
              ) : (
                 ["React", "TypeScript", "AI", "Next.js"].map(tag => ( // Placeholder if no skills
                    <span key={tag} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{tag}</span>
                 ))
              )}
            </div>
             <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10">
                <Link href="/profile">
                    <Edit3 className="mr-2 h-4 w-4" /> Edit Profile & Skills
                </Link>
            </Button>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2">Profile Completeness</h3>
            <div className="w-full bg-muted rounded-full h-2.5 mb-1">
              <div className="bg-primary h-2.5 rounded-full" style={{ width: `${profileCompleteness}%` }}></div>
            </div>
            <p className="text-sm text-muted-foreground">{profileCompleteness}% complete</p>
            {profileCompleteness < 100 && (
              <p className="text-xs text-primary mt-1">
                Complete your profile to get better recommendations!
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-card shadow-md hover:shadow-primary/20 transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Upload Content</CardTitle>
            <UploadCloud className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <CardDescription>Share your knowledge with the community.</CardDescription>
            <Button asChild className="mt-4 w-full bg-primary hover:bg-accent">
              <Link href="/upload">Go to Upload <ArrowRight className="ml-2 h-4 w-4"/></Link>
            </Button>
          </CardContent>
        </Card>
         <Card className="bg-card shadow-md hover:shadow-primary/20 transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Search Content</CardTitle>
            <Search className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <CardDescription>Find new skills to learn.</CardDescription>
            <Button asChild className="mt-4 w-full bg-primary hover:bg-accent">
              <Link href="/search">Explore Content <ArrowRight className="ml-2 h-4 w-4"/></Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-md hover:shadow-primary/20 transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">My Learnings</CardTitle>
            <BookOpen className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <CardDescription>Continue where you left off.</CardDescription>
             <Button asChild variant="outline" className="mt-4 w-full border-primary text-primary hover:bg-primary/10">
              <Link href="/profile#learnings">View My Learnings <ArrowRight className="ml-2 h-4 w-4"/></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
