
// src/app/(main)/home/page.tsx
"use client";

import { useAuth, type UserProfile } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, BookOpen, Edit3, UploadCloud, Search, User, CheckCircle, BarChart3, Users, MessageSquare, TrendingUp, Zap } from "lucide-react";
import Image from "next/image";
import React from "react";
import { Progress } from "@/components/ui/progress";

export default function UserHomePage() {
  const { user, profile, loading } = useAuth();

  const calculateProfileCompleteness = React.useCallback((
    userAuth: ReturnType<typeof useAuth>['user'] | null,
    userProfile: UserProfile | null
  ): number => {
    if (!userProfile || !userAuth || loading) return 0;

    let completedFields = 0;
    const totalFields = 8;

    if (userProfile.full_name && userProfile.full_name.trim() !== "") completedFields++;
    if (userProfile.age && userProfile.age > 0) completedFields++;
    if (userProfile.gender && userProfile.gender.trim() !== "") completedFields++;
    if (userProfile.skills && userProfile.skills.length > 0) completedFields++;
    if (userProfile.description && userProfile.description.trim() !== "") completedFields++;
    if (userProfile.linkedin_url && userProfile.linkedin_url.trim() !== "") completedFields++;
    if (userProfile.github_url && userProfile.github_url.trim() !== "") completedFields++;
    if (userAuth.photoURL && userAuth.photoURL.trim() !== "") completedFields++;

    return Math.round((completedFields / totalFields) * 100);
  }, [loading]);

  const profileCompleteness = React.useMemo(() => calculateProfileCompleteness(user, profile), [user, profile, calculateProfileCompleteness]);

  if (loading) {
     return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-4">
        <BarChart3 className="h-16 w-16 text-primary animate-pulse mb-4" />
        <p className="text-lg text-muted-foreground">Loading your SkillForge dashboard...</p>
      </div>
     );
  }

  if (!user) {
    return <div className="text-center py-10">Please log in to view your SkillForge dashboard.</div>;
  }

  const displayName = profile?.full_name || user.displayName || user.email?.split('@')[0] || "Learner";

  const quickActionCards = [
    { title: "Upload Content", description: "Share your knowledge with the SkillForge community.", href: "/upload", icon: UploadCloud, cta: "Go to Upload" },
    { title: "Search Content", description: "Find new skills and learning materials.", href: "/search", icon: Search, cta: "Explore Content" },
    { title: "Your Connections", description: "Manage followers and users you follow.", href: "/followers", icon: Users, cta: "View Connections" },
    { title: "Chat Messages", description: "Connect and collaborate with others.", href: "/chat", icon: MessageSquare, cta: "Open Chat" },
    { title: "My Learnings", description: "Track your progress and bookmarked content.", href: "/profile#learnings", icon: BookOpen, cta: "View Learnings", variant: "outline" as const },
    { title: "Edit Profile", description: "Keep your information accurate and up-to-date.", href: "/profile", icon: Edit3, cta: "Edit Profile", variant: "outline" as const },
  ];


  return (
    <div className="space-y-8">
      <Card className="glass-card overflow-hidden">
        <div className="p-6 md:p-8 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardTitle className="text-3xl md:text-4xl text-neon-accent">{displayName ? `Welcome back, ${displayName}!` : "Welcome to SkillForge!"}</CardTitle>
          <CardDescription className="mt-2 text-lg text-muted-foreground">
            Here's your SkillForge dashboard. Ready to learn or share something new today?
          </CardDescription>
        </div>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-2 text-foreground flex items-center">
              <User className="mr-2 h-5 w-5 text-primary"/> Your Profile
            </h3>
             <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                    <p className="text-sm text-muted-foreground">Profile Completeness</p>
                    <p className="text-sm font-semibold text-primary">{profileCompleteness}%</p>
                </div>
                <Progress value={profileCompleteness} className="h-2 bg-muted/50" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
                {profileCompleteness < 100 && (
                <p className="text-xs text-primary mt-1.5">
                    Complete your profile to get better recommendations!
                </p>
                )}
            </div>
            <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10 hover:text-primary">
                <Link href="/profile">
                    <Edit3 className="mr-2 h-4 w-4" /> View & Edit Profile
                </Link>
            </Button>
          </div>
          <div>
             <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center"><Zap className="mr-2 h-5 w-5 text-primary"/>Your Skills</h3>
            <div className="flex flex-wrap gap-2">
              {profile?.skills && profile.skills.length > 0 ? (
                profile.skills.slice(0, 5).map(skill => (
                  <span key={skill} className="px-3 py-1.5 text-sm rounded-full bg-secondary text-secondary-foreground shadow-sm">
                    {skill}
                  </span>
                ))
              ) : (
                 <p className="text-sm text-muted-foreground">No skills added yet. <Link href="/profile" className="text-primary hover:underline">Add some!</Link></p>
              )}
              {profile?.skills && profile.skills.length > 5 && (
                <Link href="/profile" className="px-3 py-1.5 text-sm rounded-full bg-muted hover:bg-secondary text-muted-foreground hover:text-secondary-foreground shadow-sm">
                    + {profile.skills.length - 5} more
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {quickActionCards.map((item) => (
          <Card key={item.href} className="glass-card group smooth-transition transform hover:-translate-y-1 hover:shadow-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium text-foreground">{item.title}</CardTitle>
              <item.icon className="h-6 w-6 text-primary group-hover:text-accent smooth-transition" />
            </CardHeader>
            <CardContent className="pb-4">
              <CardDescription>{item.description}</CardDescription>
            </CardContent>
            <CardFooter>
                <Button asChild className={`w-full ${item.variant === 'outline' ? 'border-primary text-primary hover:bg-primary/10' : 'bg-primary hover:bg-accent'}`} variant={item.variant || "default"}>
                <Link href={item.href}>{item.cta} <ArrowRight className="ml-2 h-4 w-4"/></Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Card className="glass-card">
        <CardHeader>
            <CardTitle className="text-2xl text-neon-primary flex items-center"><TrendingUp className="mr-3 h-6 w-6"/> Continue Learning</CardTitle>
            <CardDescription>Pick up where you left off or discover new recommendations.</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground text-center py-8">Recommendations and recently viewed content will appear here soon!</p>
        </CardContent>
      </Card>
    </div>
  );
}
