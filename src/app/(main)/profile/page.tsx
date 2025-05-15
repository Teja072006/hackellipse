// src/app/(main)/profile/page.tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Edit3, Mail, Phone, Linkedin, Github, Download, Briefcase, Award, UserCircle, CheckCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ContentCard, Content } from "@/components/content/content-card";

// Mock user profile data - in a real app, fetch this
interface UserProfile {
  name: string;
  email: string;
  age?: number;
  gender?: string;
  skills: string[];
  linkedinUrl?: string;
  githubUrl?: string;
  description?: string;
  achievements?: string;
  resumeFileUrl?: string; // URL to the resume file
  photoURL?: string;
  followersCount: number;
  followingCount: number;
  uploadedContent: Content[];
}

const MOCK_USER_PROFILE: UserProfile = {
  name: "Aarav Kumar",
  email: "aarav.kumar@example.com",
  age: 28,
  gender: "Male",
  skills: ["Next.js", "TypeScript", "AI/ML", "Tailwind CSS", "Firebase"],
  linkedinUrl: "https://linkedin.com/in/aaravkumar",
  githubUrl: "https://github.com/aaravkumar",
  description: "Passionate full-stack developer with a keen interest in building AI-driven applications. Always eager to learn and share knowledge.",
  achievements: "Winner of TechNova Hackathon 2023. Contributed to several open-source projects.",
  resumeFileUrl: "#", // Placeholder
  photoURL: "https://placehold.co/128x128/4DC0B5/FFFFFF.png?text=AK",
  followersCount: 150,
  followingCount: 75,
  uploadedContent: [
    { id: "user-content-1", title: "My Journey with Next.js", aiSummary: "Exploring the power of Next.js for modern web development, from SSR to API routes.", type: "video", author: "Aarav Kumar", tags: ["Next.js", "Web Dev"], imageUrl: "https://placehold.co/600x400/1abc9c/ffffff.png?text=NextJS", averageRating: 4.7, totalRatings: 50 },
    { id: "user-content-2", title: "AI for Beginners", aiSummary: "A simple introduction to fundamental AI concepts and their real-world applications.", type: "text", author: "Aarav Kumar", tags: ["AI", "Tutorial"], imageUrl: "https://placehold.co/600x400/3498db/ffffff.png?text=AI", averageRating: 4.3, totalRatings: 30 },
  ]
};


export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user) {
      // In a real app, fetch profile data based on user.uid
      // For now, use mock data and merge with auth user info
      setIsLoading(true);
      setTimeout(() => { // Simulate API call
        setProfile({
          ...MOCK_USER_PROFILE,
          email: user.email || MOCK_USER_PROFILE.email,
          name: user.displayName || MOCK_USER_PROFILE.name,
          photoURL: user.photoURL || MOCK_USER_PROFILE.photoURL,
        });
        setIsLoading(false);
      }, 500);
    } else if (!authLoading && !user) {
        // Redirect or handle not logged in
        setIsLoading(false);
    }
  }, [user, authLoading]);

  // Placeholder for form handling
  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    // Call API to update profile
    setIsEditing(false);
    alert("Profile update (mock) successful!");
  };
  
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-10">User profile not found.</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <Card className="bg-card shadow-xl overflow-hidden">
        <div className="relative h-48 bg-gradient-to-r from-primary via-accent to-secondary">
          {/* Cover image placeholder */}
          <Image src="https://placehold.co/1200x300/1a202c/4DC0B5.png?text=SkillSmith+Profile" alt="Profile cover" layout="fill" objectFit="cover" data-ai-hint="abstract tech" />
          <div className="absolute bottom-0 left-6 transform translate-y-1/2">
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
              <AvatarImage src={profile.photoURL} alt={profile.name} />
              <AvatarFallback className="text-4xl">{getInitials(profile.name)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <CardHeader className="pt-20 pb-6"> {/* Adjusted padding top */}
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-bold text-neon-primary">{profile.name}</CardTitle>
              <CardDescription className="text-muted-foreground">{profile.email}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => setIsEditing(!isEditing)} className="hover:border-primary hover:text-primary">
              <Edit3 className="mr-2 h-4 w-4" /> {isEditing ? "Cancel" : "Edit Profile"}
            </Button>
          </div>
          <div className="flex space-x-6 mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <p className="text-2xl font-semibold">{profile.uploadedContent.length}</p>
              <p className="text-sm text-muted-foreground">Uploads</p>
            </div>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{profile.followersCount}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </Link>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{profile.followingCount}</p>
              <p className="text-sm text-muted-foreground">Following</p>
            </Link>
          </div>
        </CardHeader>
      </Card>

      {isEditing ? (
        <Card className="bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Edit Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileUpdate} className="space-y-6">
              {/* Basic Info */}
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label htmlFor="edit-name">Full Name</Label><Input id="edit-name" defaultValue={profile.name} className="input-glow-focus" /></div>
                <div><Label htmlFor="edit-age">Age</Label><Input id="edit-age" type="number" defaultValue={profile.age} className="input-glow-focus" /></div>
                <div><Label htmlFor="edit-gender">Gender</Label><Input id="edit-gender" defaultValue={profile.gender} className="input-glow-focus" /></div>
                 <div><Label htmlFor="edit-photo-url">Photo URL</Label><Input id="edit-photo-url" defaultValue={profile.photoURL} className="input-glow-focus" /></div>
              </div>
              {/* Skills */}
              <div><Label htmlFor="edit-skills">Skills (comma-separated)</Label><Input id="edit-skills" defaultValue={profile.skills.join(', ')} className="input-glow-focus" /></div>
              {/* Social Links */}
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label htmlFor="edit-linkedin">LinkedIn URL</Label><Input id="edit-linkedin" defaultValue={profile.linkedinUrl} className="input-glow-focus" /></div>
                <div><Label htmlFor="edit-github">GitHub URL</Label><Input id="edit-github" defaultValue={profile.githubUrl} className="input-glow-focus" /></div>
              </div>
              {/* Bio &amp; Achievements */}
              <div><Label htmlFor="edit-description">Description</Label><Textarea id="edit-description" defaultValue={profile.description} className="input-glow-focus" /></div>
              <div><Label htmlFor="edit-achievements">Achievements</Label><Textarea id="edit-achievements" defaultValue={profile.achievements} className="input-glow-focus" /></div>
              {/* Resume */}
              <div><Label htmlFor="edit-resume">Resume (upload new)</Label><Input id="edit-resume" type="file" className="input-glow-focus" /></div>
              
              <Button type="submit" className="bg-primary hover:bg-accent text-primary-foreground">Save Changes</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><UserCircle className="mr-2 h-5 w-5 text-primary" /> About Me</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {profile.description && <p className="text-muted-foreground">{profile.description}</p>}
                {profile.age && <p><strong>Age:</strong> {profile.age}</p>}
                {profile.gender && <p><strong>Gender:</strong> {profile.gender}</p>}
                <Separator />
                <div className="space-y-2">
                  {profile.linkedinUrl && <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><Linkedin className="mr-2 h-4 w-4" /> LinkedIn</a>}
                  {profile.githubUrl && <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><Github className="mr-2 h-4 w-4" /> GitHub</a>}
                  {profile.resumeFileUrl && profile.resumeFileUrl !== "#" && <a href={profile.resumeFileUrl} target="_blank" download className="flex items-center text-primary hover:text-accent"><Download className="mr-2 h-4 w-4" /> Download Resume</a>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><Briefcase className="mr-2 h-5 w-5 text-primary" /> Skills</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {profile.skills.map(skill => <span key={skill} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{skill}</span>)}
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><Award className="mr-2 h-5 w-5 text-primary" /> Achievements</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{profile.achievements || "No achievements listed."}</p>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">My Uploaded Content</CardTitle></CardHeader>
              <CardContent>
                {profile.uploadedContent.length > 0 ? (
                  <div className="grid sm:grid-cols-1 lg:grid-cols-2 gap-6">
                    {profile.uploadedContent.map(content => <ContentCard key={content.id} content={content} />)}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No content uploaded yet.</p>
                )}
              </CardContent>
            </Card>
             {/* Placeholder for "My Learnings" section */}
            <Card id="learnings" className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">My Learnings / Bookmarks</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Your bookmarked or in-progress content will appear here. (Feature coming soon)</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
