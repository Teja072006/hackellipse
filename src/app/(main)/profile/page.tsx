// src/app/(main)/profile/page.tsx
"use client";

import { useAuth, UserProfile as AuthUserProfile } from "@/hooks/use-auth"; // Use UserProfile from auth context
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
import { toast } from "@/hooks/use-toast";

// Type for form values, subset of AuthUserProfile
type ProfileFormValues = Partial<Omit<AuthUserProfile, 'id' | 'created_at' | 'updated_at' | 'last_login' | 'email'>>;


export default function ProfilePage() {
  const { user, profile: authProfile, loading: authLoading, updateUserProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ProfileFormValues>({});
  const [localProfile, setLocalProfile] = useState<AuthUserProfile | null>(null); // Local state to hold the profile for display

  useEffect(() => {
    if (authProfile) {
      setLocalProfile(authProfile);
      setFormValues({ // Initialize form values for editing
        name: authProfile.name || '',
        age: authProfile.age || undefined,
        gender: authProfile.gender || '',
        skills: authProfile.skills || [],
        linkedin_url: authProfile.linkedin_url || '',
        github_url: authProfile.github_url || '',
        description: authProfile.description || '',
        achievements: authProfile.achievements || '',
        photo_url: authProfile.photo_url || '',
        // resume_file_url: authProfile.resume_file_url || '', // resume upload not handled yet
      });
    } else if (!authLoading && user) { // If authProfile is null but user exists, try to fill basic info
        setLocalProfile({
            id: user.id,
            name: user.user_metadata?.name || user.email,
            email: user.email,
            photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        } as AuthUserProfile);
         setFormValues({
            name: user.user_metadata?.name || user.email || '',
            photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
         });
    }
  }, [authProfile, user, authLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSkillsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormValues(prev => ({ ...prev, skills: e.target.value.split(',').map(s => s.trim()).filter(s => s) }));
  };

  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !localProfile) return;
    
    const updatedData: Partial<AuthUserProfile> = {
      ...formValues,
    };
    // Clean up empty strings to null or remove them if they are optional
    Object.keys(updatedData).forEach(key => {
      const k = key as keyof Partial<AuthUserProfile>;
      if (updatedData[k] === '') {
         if (k === 'age') (updatedData[k] as any) = null; 
         else if (k !== 'name' && k !== 'email') delete updatedData[k];
      }
    });
    if (typeof updatedData.age === 'string') {
      updatedData.age = parseInt(updatedData.age, 10);
      if (isNaN(updatedData.age)) (updatedData.age as any) = null;
    }


    try {
      const { data: newProfileData, error } = await updateUserProfile(user.id, updatedData);
      if (error) throw error;

      if (newProfileData) {
        setLocalProfile(newProfileData); // Update local profile state
         setFormValues({ // Re-Initialize form values for editing with new data
            name: newProfileData.name || '',
            age: newProfileData.age || undefined,
            gender: newProfileData.gender || '',
            skills: newProfileData.skills || [],
            linkedin_url: newProfileData.linkedin_url || '',
            github_url: newProfileData.github_url || '',
            description: newProfileData.description || '',
            achievements: newProfileData.achievements || '',
            photo_url: newProfileData.photo_url || '',
          });
      }
      toast({ title: "Profile Updated", description: "Your changes have been saved." });
      setIsEditing(false);
    } catch (error: any) {
      console.error("Failed to update profile:", error);
      toast({ title: "Update Failed", description: error.message || "Could not save your profile changes.", variant: "destructive" });
    }
  };
  
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!user || !localProfile) { // Check for user and localProfile
    return <div className="text-center py-10">User profile not found or not logged in.</div>;
  }

  // Mocked uploaded content for UI display
  const MOCK_UPLOADED_CONTENT: Content[] = []; 

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <Card className="bg-card shadow-xl overflow-hidden">
        <div className="relative h-48 bg-gradient-to-r from-primary via-accent to-secondary">
          <Image src={localProfile.photo_url || "https://placehold.co/1200x300/1a202c/4DC0B5.png?text=SkillSmith+Profile"} alt="Profile cover" layout="fill" objectFit="cover" data-ai-hint="abstract tech" />
          <div className="absolute bottom-0 left-6 transform translate-y-1/2">
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
              <AvatarImage src={localProfile.photo_url || undefined} alt={localProfile.name || "User"} />
              <AvatarFallback className="text-4xl">{getInitials(localProfile.name)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <CardHeader className="pt-20 pb-6">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-bold text-neon-primary">{localProfile.name}</CardTitle>
              <CardDescription className="text-muted-foreground">{localProfile.email}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => setIsEditing(!isEditing)} className="hover:border-primary hover:text-primary">
              <Edit3 className="mr-2 h-4 w-4" /> {isEditing ? "Cancel" : "Edit Profile"}
            </Button>
          </div>
          <div className="flex space-x-6 mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <p className="text-2xl font-semibold">{MOCK_UPLOADED_CONTENT.length || 0}</p>
              <p className="text-sm text-muted-foreground">Uploads</p>
            </div>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{localProfile.followers_count || 0}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </Link>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{localProfile.following_count || 0}</p>
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
                <div><Label htmlFor="age">Age</Label><Input id="age" name="age" type="number" value={formValues.age ?? ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="gender">Gender</Label><Input id="gender" name="gender" value={formValues.gender || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="photo_url">Photo URL</Label><Input id="photo_url" name="photo_url" value={formValues.photo_url || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
              </div>
              <div><Label htmlFor="skills">Skills (comma-separated)</Label><Input id="skills" name="skills" value={formValues.skills?.join(', ') || ''} onChange={handleSkillsChange} className="input-glow-focus" /></div>
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label htmlFor="linkedin_url">LinkedIn URL</Label><Input id="linkedin_url" name="linkedin_url" value={formValues.linkedin_url || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="github_url">GitHub URL</Label><Input id="github_url" name="github_url" value={formValues.github_url || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
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
                {localProfile.description && <p className="text-muted-foreground">{localProfile.description}</p>}
                {localProfile.age && <p><strong>Age:</strong> {localProfile.age}</p>}
                {localProfile.gender && <p><strong>Gender:</strong> {localProfile.gender}</p>}
                <Separator />
                <div className="space-y-2">
                  {localProfile.linkedin_url && <a href={localProfile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><Linkedin className="mr-2 h-4 w-4" /> LinkedIn</a>}
                  {localProfile.github_url && <a href={localProfile.github_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><Github className="mr-2 h-4 w-4" /> GitHub</a>}
                  {localProfile.resume_file_url && localProfile.resume_file_url !== "#" && <a href={localProfile.resume_file_url} target="_blank" download className="flex items-center text-primary hover:text-accent"><Download className="mr-2 h-4 w-4" /> Download Resume</a>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><Briefcase className="mr-2 h-5 w-5 text-primary" /> Skills</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {localProfile.skills && localProfile.skills.length > 0 ? localProfile.skills.map(skill => <span key={skill} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{skill}</span>) : <p className="text-muted-foreground">No skills listed.</p>}
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><Award className="mr-2 h-5 w-5 text-primary" /> Achievements</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{localProfile.achievements || "No achievements listed."}</p>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">My Uploaded Content</CardTitle></CardHeader>
              <CardContent>
                {MOCK_UPLOADED_CONTENT && MOCK_UPLOADED_CONTENT.length > 0 ? (
                  <div className="grid sm:grid-cols-1 lg:grid-cols-2 gap-6">
                    {MOCK_UPLOADED_CONTENT.map(content => <ContentCard key={content.id} content={content} />)}
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
