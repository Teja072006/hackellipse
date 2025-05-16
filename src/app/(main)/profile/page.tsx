// src/app/(main)/profile/page.tsx
"use client";

import { useAuth, UserProfile } from "@/hooks/use-auth"; 
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Edit3, Mail, Linkedin, Github, Briefcase, Award, UserCircle, Loader2 } from "lucide-react";
import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";

// Form values for profile editing.
// Matches SignUpProfileDataFromForm but without password fields.
type ProfileFormValues = {
  full_name: string;
  age?: string; // Age from form as string
  gender?: string;
  skills?: string; // Skills from form as comma-separated string
  linkedin_url?: string;
  description?: string;
  resume_path?: string;
  // Supabase Auth user details (not directly editable here but used for display)
  email?: string; 
  photoURL?: string | null; // From Supabase user object
};


export default function ProfilePage() {
  const { user: authUser, profile: supabaseProfile, loading: authLoading, updateUserProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ProfileFormValues>({
    full_name: '',
    email: '',
    photoURL: null,
    age: '',
    gender: '',
    skills: '',
    linkedin_url: '',
    description: '',
    resume_path: '',
  });
  
  useEffect(() => {
    if (authUser) { // Base values from auth user
      setFormValues(prev => ({
        ...prev,
        email: authUser.email || '',
        photoURL: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null, 
        // full_name might be from auth.user_metadata if not set in profile yet
        full_name: supabaseProfile?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
      }));
    }
    if (supabaseProfile) { // Override with values from 'profiles' table
      setFormValues(prev => ({
        ...prev,
        full_name: supabaseProfile.full_name || prev.full_name,
        age: supabaseProfile.age !== undefined && supabaseProfile.age !== null ? String(supabaseProfile.age) : '', 
        gender: supabaseProfile.gender || '',
        skills: supabaseProfile.skills?.join(', ') || '', 
        linkedin_url: supabaseProfile.linkedin_url || '',
        description: supabaseProfile.description || '',
        resume_path: supabaseProfile.resume_path || '',
      }));
    }
  }, [supabaseProfile, authUser, authLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser) return;

    const updatesForContext: Partial<Omit<UserProfile, 'user_id' | 'email' | 'created_at' | 'updated_at' | 'followers_count' | 'following_count'>> = {
        full_name: formValues.full_name,
        age: formValues.age ? parseInt(formValues.age, 10) : null,
        gender: formValues.gender || null,
        skills: formValues.skills ? formValues.skills.split(',').map(s => s.trim()).filter(s => s) : null,
        linkedin_url: formValues.linkedin_url || null,
        description: formValues.description || null,
        resume_path: formValues.resume_path || null,
    };
    
    try {
      const { error } = await updateUserProfile(updatesForContext);
      if (error) throw error;

      toast({ title: "Profile Updated", description: "Your changes have been saved." });
      setIsEditing(false);
    } catch (error: any) {
      console.error("Failed to update Supabase profile:", error);
      toast({ title: "Update Failed", description: error.message || "Could not save your profile changes.", variant: "destructive" });
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return authUser?.email?.[0]?.toUpperCase() || "U";
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

  if (!authUser) {
    return <div className="text-center py-10">User not logged in. Please sign in.</div>;
  }
  
  const displayProfile = supabaseProfile;
  const displayName = displayProfile?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || "User";
  const displayEmail = authUser.email || "No email";
  const avatarDisplayUrl = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || undefined;


  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <Card className="bg-card shadow-xl overflow-hidden">
        <div className="relative h-48 bg-gradient-to-r from-primary via-accent to-secondary">
          <Image 
            src={"https://placehold.co/1200x300/1a202c/4DC0B5.png?text=SkillForge+Profile"} 
            alt="Profile cover" layout="fill" objectFit="cover" data-ai-hint="abstract technology background"
          />
          <div className="absolute bottom-0 left-6 transform translate-y-1/2">
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
              <AvatarImage src={avatarDisplayUrl} alt={displayName} />
              <AvatarFallback className="text-4xl">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <CardHeader className="pt-20 pb-6">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-bold text-neon-primary">{displayName}</CardTitle>
              <CardDescription className="text-muted-foreground">{displayEmail}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => setIsEditing(!isEditing)} className="hover:border-primary hover:text-primary">
              <Edit3 className="mr-2 h-4 w-4" /> {isEditing ? "Cancel" : "Edit Profile"}
            </Button>
          </div>
          <div className="flex space-x-6 mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <p className="text-2xl font-semibold">0</p> 
              <p className="text-sm text-muted-foreground">Uploads</p>
            </div>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{displayProfile?.followers_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </Link>
            <Link href="/followers" className="text-center hover:text-primary transition-colors">
              <p className="text-2xl font-semibold">{displayProfile?.following_count ?? 0}</p>
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
                <div><Label htmlFor="full_name">Full Name</Label><Input id="full_name" name="full_name" value={formValues.full_name || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="age">Age</Label><Input id="age" name="age" type="text" placeholder="e.g. 25" value={formValues.age ?? ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                <div><Label htmlFor="gender">Gender</Label><Input id="gender" name="gender" value={formValues.gender || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
              </div>
              <div><Label htmlFor="skills">Skills (comma-separated)</Label><Input id="skills" name="skills" value={formValues.skills || ''} onChange={handleInputChange} placeholder="e.g. React,NodeJS,AI" className="input-glow-focus" /></div>
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label htmlFor="linkedin_url">LinkedIn URL</Label><Input id="linkedin_url" name="linkedin_url" value={formValues.linkedin_url || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
                 {/* For resume_path, a file upload component would be better. This is a placeholder. */}
                <div><Label htmlFor="resume_path">Resume Path (URL - optional)</Label><Input id="resume_path" name="resume_path" value={formValues.resume_path || ''} onChange={handleInputChange} placeholder="URL to your resume if hosted" className="input-glow-focus" /></div>
              </div>
              <div><Label htmlFor="description">Description</Label><Textarea id="description" name="description" value={formValues.description || ''} onChange={handleInputChange} className="input-glow-focus" /></div>
              
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
                {displayProfile?.description ? <p className="text-muted-foreground">{displayProfile.description}</p> : <p className="text-muted-foreground">No description provided.</p>}
                {displayProfile?.age != null && <p><strong>Age:</strong> {displayProfile.age}</p>}
                {displayProfile?.gender && <p><strong>Gender:</strong> {displayProfile.gender}</p>}
                <Separator />
                <div className="space-y-2">
                  {displayProfile?.linkedin_url && <a href={displayProfile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><Linkedin className="mr-2 h-4 w-4" /> LinkedIn</a>}
                  {displayProfile?.resume_path && <a href={displayProfile.resume_path} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><FileText className="mr-2 h-4 w-4" /> View Resume</a>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><Briefcase className="mr-2 h-5 w-5 text-primary" /> Skills</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {displayProfile?.skills && displayProfile.skills.length > 0 ? displayProfile.skills.map(skill => <span key={skill} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{skill}</span>) : <p className="text-muted-foreground">No skills listed.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">My Uploaded Content</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">No content uploaded yet. (Feature coming soon)</p>
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
