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
import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Content } from "@/components/content/content-card"; // Re-using from ContentCard
import { ContentCard } from "@/components/content/content-card";
import { db, doc, getDoc, setDoc, serverTimestamp } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import type { Timestamp } from "firebase/firestore";


interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string | null;
  age?: number | null;
  gender?: string | null;
  skills?: string[];
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  description?: string | null;
  achievements?: string | null;
  resumeFileUrl?: string | null; // URL to the resume file
  followersCount?: number;
  followingCount?: number;
  uploadedContent?: Content[]; // For now, this will be empty as content upload isn't fully integrated with DB
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}


export default function ProfilePage() {
  const { user, loading: authLoading, updateUserProfileInFirestore } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formValues, setFormValues] = useState<Partial<UserProfile>>({});


  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        setIsLoading(true);
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data() as UserProfile;
          setProfile(data);
          setFormValues({ // Initialize form values for editing
            name: data.name || '',
            age: data.age || undefined,
            gender: data.gender || '',
            skills: data.skills || [],
            linkedinUrl: data.linkedinUrl || '',
            githubUrl: data.githubUrl || '',
            description: data.description || '',
            achievements: data.achievements || '',
            photoURL: data.photoURL || '',
          });
        } else {
          // Fallback if Firestore doc doesn't exist but auth user does (should be rare after signup)
          const basicProfile: UserProfile = {
            uid: user.uid,
            name: user.displayName || "User",
            email: user.email || "no-email@example.com",
            photoURL: user.photoURL,
            followersCount: 0,
            followingCount: 0,
            uploadedContent: [],
          };
          setProfile(basicProfile);
          setFormValues(basicProfile);
        }
        setIsLoading(false);
      } else if (!authLoading && !user) {
         setIsLoading(false); // Not logged in, profile page might redirect via layout
      }
    };

    if (!authLoading) {
      fetchProfile();
    }
  }, [user, authLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSkillsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormValues(prev => ({ ...prev, skills: e.target.value.split(',').map(s => s.trim()).filter(s => s) }));
  };


  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const updatedData: Partial<UserProfile> = {
      ...formValues,
      updatedAt: serverTimestamp() as Timestamp,
    };
    // Clean up empty strings to null or remove them if they are optional
    Object.keys(updatedData).forEach(key => {
      const k = key as keyof Partial<UserProfile>;
      if (updatedData[k] === '') {
         if (k === 'age') updatedData[k] = undefined; // Allow age to be unset
         else if (k !== 'name' && k !== 'email') delete updatedData[k]; // Remove other optional empty strings
      }
    });
    if (typeof updatedData.age === 'string') {
      updatedData.age = parseInt(updatedData.age, 10);
      if (isNaN(updatedData.age)) updatedData.age = undefined;
    }


    try {
      await updateUserProfileInFirestore(user, updatedData);
      // Refresh profile data locally
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        setProfile(userDocSnap.data() as UserProfile);
      }
      toast({ title: "Profile Updated", description: "Your changes have been saved." });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast({ title: "Update Failed", description: "Could not save your profile changes.", variant: "destructive" });
    }
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
    return <div className="text-center py-10">User profile not found or not logged in.</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <Card className="bg-card shadow-xl overflow-hidden">
        <div className="relative h-48 bg-gradient-to-r from-primary via-accent to-secondary">
          <Image src={profile.photoURL || "https://placehold.co/1200x300/1a202c/4DC0B5.png?text=SkillSmith+Profile"} alt="Profile cover" layout="fill" objectFit="cover" data-ai-hint="abstract tech" />
          <div className="absolute bottom-0 left-6 transform translate-y-1/2">
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
              <AvatarImage src={profile.photoURL || undefined} alt={profile.name} />
              <AvatarFallback className="text-4xl">{getInitials(profile.name)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <CardHeader className="pt-20 pb-6">
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
              <p className="text-2xl font-semibold">{profile.uploadedContent?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Uploads</p>
            </div>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{profile.followersCount || 0}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </Link>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{profile.followingCount || 0}</p>
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
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label htmlFor="name">Full Name</Label><Input id="name" name="name" value={formValues.name || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="age">Age</Label><Input id="age" name="age" type="number" value={formValues.age || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="gender">Gender</Label><Input id="gender" name="gender" value={formValues.gender || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="photoURL">Photo URL</Label><Input id="photoURL" name="photoURL" value={formValues.photoURL || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
              </div>
              <div><Label htmlFor="skills">Skills (comma-separated)</Label><Input id="skills" name="skills" value={formValues.skills?.join(', ') || ''} onChange={handleSkillsChange} className="input-glow-focus" /></div>
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label htmlFor="linkedinUrl">LinkedIn URL</Label><Input id="linkedinUrl" name="linkedinUrl" value={formValues.linkedinUrl || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="githubUrl">GitHub URL</Label><Input id="githubUrl" name="githubUrl" value={formValues.githubUrl || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
              </div>
              <div><Label htmlFor="description">Description</Label><Textarea id="description" name="description" value={formValues.description || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
              <div><Label htmlFor="achievements">Achievements</Label><Textarea id="achievements" name="achievements" value={formValues.achievements || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
              <div><Label htmlFor="resume">Resume (upload new - feature pending)</Label><Input id="resume" type="file" className="input-glow-focus" disabled /></div>
              
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
                {profile.skills && profile.skills.length > 0 ? profile.skills.map(skill => <span key={skill} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{skill}</span>) : <p className="text-muted-foreground">No skills listed.</p>}
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
                {profile.uploadedContent && profile.uploadedContent.length > 0 ? (
                  <div className="grid sm:grid-cols-1 lg:grid-cols-2 gap-6">
                    {profile.uploadedContent.map(content => <ContentCard key={content.id} content={content} />)}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No content uploaded yet. (Feature coming soon)</p>
                )}
              </CardContent>
            </Card>
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
