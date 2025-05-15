// src/app/(main)/home/page.tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle, Edit3, UploadCloud, Search } from "lucide-react";
import Image from "next/image";

// Mock data for suggested content and profile completeness
const suggestedContent = [
  { id: "1", title: "Advanced React Patterns", type: "video", author: "Alice Wonderland", tags: ["React", "Frontend"], image: "https://placehold.co/600x400/4DC0B5/FFFFFF.png?text=React", dataAiHint: "technology code" },
  { id: "2", title: "Node.js Performance Optimization", type: "text", author: "Bob The Builder", tags: ["Node.js", "Backend"], image: "https://placehold.co/600x400/1E293B/FFFFFF.png?text=NodeJS", dataAiHint: "server code"  },
  { id: "3", title: "Introduction to Machine Learning", type: "audio", author: "Charlie Brown", tags: ["AI", "Machine Learning"], image: "https://placehold.co/600x400/F59E0B/FFFFFF.png?text=AI", dataAiHint: "artificial intelligence"  },
];

const profileCompleteness = 75; // Example percentage

export default function UserHomePage() {
  const { user } = useAuth();

  if (!user) {
    return null; // Or a loading state, though layout should handle redirect
  }

  return (
    <div className="space-y-8">
      <Card className="bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl text-neon-accent">Welcome back, {user.displayName || user.email}!</CardTitle>
          <CardDescription>Here's what's new and suggested for you on SkillSmith.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-2">Your Skills</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {/* Placeholder skills, fetch from user profile later */}
              {["React", "TypeScript", "AI", "Next.js"].map(tag => (
                <span key={tag} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{tag}</span>
              ))}
            </div>
             <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10">
                <Link href="/profile">
                    <Edit3 className="mr-2 h-4 w-4" /> Edit Profile &amp; Skills
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

      <div>
        <h2 className="text-2xl font-bold mb-4 mt-8 text-neon-primary">Suggested For You</h2>
        {suggestedContent.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {suggestedContent.map((content) => (
              <Card key={content.id} className="overflow-hidden bg-card shadow-lg group hover:shadow-primary/30 transition-all duration-300">
                 <Image 
                    src={content.image} 
                    alt={content.title} 
                    width={600} 
                    height={300} 
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform"
                    data-ai-hint={content.dataAiHint}
                  />
                <CardHeader>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">{content.title}</CardTitle>
                  <CardDescription>By {content.author} • {content.type.charAt(0).toUpperCase() + content.type.slice(1)}</CardDescription>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {content.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground">{tag}</span>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full bg-primary hover:bg-accent">
                    <Link href={`/content/${content.id}`}>
                      View Content <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No suggestions yet. Explore content or update your skills!</p>
        )}
      </div>
    </div>
  );
}
