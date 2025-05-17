
// src/app/(main)/profile/page.tsx
"use client";

import { useAuth, UserProfile } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Edit3, Mail, Linkedin, Github, Briefcase, Award, UserCircle, Loader2, FileText, Save, CalendarDays, UsersIcon as GenderIcon, Zap, Info, Trash2 } from "lucide-react";
import { useState, useEffect, FormEvent, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { db, storage as firebaseStorage } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit, Timestamp, doc, deleteDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { ContentCard } from "@/components/content/content-card";
import type { Content as ContentCardType } from "@/components/content/content-card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type ProfileFormValues = Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt' | 'followers_count' | 'following_count' | 'photoURL' | 'skills' | 'age'>> & {
  age?: string;
  skills?: string;
  full_name?: string;
};

interface DisplayContent extends ContentCardType {
  // Ensure this includes all fields needed by ContentCard and for deletion logic
  uploader_uid?: string;
  storage_path?: string;
}


export default function ProfilePage() {
  const { user: authUser, profile: firestoreProfile, loading: authLoading, updateUserProfile } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ProfileFormValues>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [userUploadedContent, setUserUploadedContent] = useState<DisplayContent[]>([]);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isDeletingContent, setIsDeletingContent] = useState<string | null>(null); // Store ID of content being deleted

  const fetchUserUploadedContent = useCallback(async () => {
    if (!authUser?.uid) return;
    setIsLoadingContent(true);
    try {
      const contentQuery = query(
        collection(db, "contents"),
        where("uploader_uid", "==", authUser.uid),
        orderBy("created_at", "desc"),
        limit(10)
      );
      const contentSnapshot = await getDocs(contentQuery);
      const fetchedContent = contentSnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || "Untitled",
          aiSummary: data.ai_description || data.user_manual_description || "No summary available.",
          type: data.contentType || "text",
          author: firestoreProfile?.full_name || authUser.displayName || "Unknown Author",
          tags: data.tags || [],
          imageUrl: data.thumbnail_url || `https://placehold.co/600x400.png?text=${encodeURIComponent(data.title || "SkillForge")}`,
          average_rating: data.average_rating || 0,
          total_ratings: data.total_ratings || 0,
          uploader_uid: data.uploader_uid,
          storage_path: data.storage_path,
        } as DisplayContent;
      });
      setUserUploadedContent(fetchedContent);
    } catch (error: any) {
      console.error("Error fetching user uploaded content:", error);
      toast({ title: "Error", description: "Could not load your content. Ensure Firestore indexes are set up if prompted.", variant: "destructive" });
    } finally {
      setIsLoadingContent(false);
    }
  }, [authUser, firestoreProfile]);

  useEffect(() => {
    if (firestoreProfile) {
      setFormValues({
        full_name: firestoreProfile.full_name || authUser?.displayName || '',
        age: firestoreProfile.age !== undefined && firestoreProfile.age !== null ? String(firestoreProfile.age) : '',
        gender: firestoreProfile.gender || '',
        skills: firestoreProfile.skills?.join(', ') || '',
        linkedin_url: firestoreProfile.linkedin_url || '',
        github_url: firestoreProfile.github_url || '',
        description: firestoreProfile.description || '',
        achievements: firestoreProfile.achievements || '',
      });
      if (authUser?.uid) {
        fetchUserUploadedContent();
      }
    } else if (authUser && !authLoading) {
      setFormValues(prev => ({
        ...prev,
        full_name: authUser.displayName || authUser.email?.split('@')[0] || '',
      }));
      if (authUser?.uid) {
        fetchUserUploadedContent();
      }
    }
  }, [firestoreProfile, authUser, authLoading, fetchUserUploadedContent]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    setIsSubmitting(true);

    const updatesForContext: Partial<UserProfile> = {
      full_name: formValues.full_name?.trim() || null,
      age: formValues.age && formValues.age.trim() !== '' ? parseInt(formValues.age, 10) : null,
      gender: formValues.gender?.trim() || null,
      skills: formValues.skills ? formValues.skills.split(',').map(s => s.trim()).filter(s => s.length > 0) : null,
      linkedin_url: formValues.linkedin_url?.trim() || null,
      github_url: formValues.github_url?.trim() || null,
      description: formValues.description?.trim() || null,
      achievements: formValues.achievements?.trim() || null,
    };

    Object.keys(updatesForContext).forEach(key => {
      if (updatesForContext[key as keyof typeof updatesForContext] === undefined) {
        delete updatesForContext[key as keyof typeof updatesForContext];
      }
    });

    try {
      await updateUserProfile(updatesForContext);
      toast({ title: "Profile Updated", description: "Your SkillForge profile has been successfully updated." });
      setIsEditing(false);
    } catch (error: any) {
      console.error("Failed to update Firebase profile:", error);
      toast({ title: "Update Failed", description: error.message || "Could not save your profile changes.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContent = async (contentToDelete: DisplayContent) => {
    if (!authUser || authUser.uid !== contentToDelete.uploader_uid || !contentToDelete.id) {
        toast({ title: "Error", description: "You do not have permission to delete this content or content ID is missing.", variant: "destructive"});
        return;
    }
    setIsDeletingContent(contentToDelete.id);
    try {
        // Delete file from Firebase Storage if storage_path exists
        if (contentToDelete.storage_path) {
            const fileRef = ref(firebaseStorage, contentToDelete.storage_path);
            await deleteObject(fileRef);
            console.log("File deleted from Storage:", contentToDelete.storage_path);
        }

        // Delete content document from Firestore
        const contentDocRef = doc(db, "contents", contentToDelete.id);
        await deleteDoc(contentDocRef);
        
        toast({ title: "Content Deleted", description: `"${contentToDelete.title}" has been removed.`});
        // Refresh content list
        setUserUploadedContent(prev => prev.filter(item => item.id !== contentToDelete.id));
    } catch (error: any) {
        console.error("Error deleting content:", error);
        toast({ title: "Deletion Failed", description: `Could not delete content: ${error.message}`, variant: "destructive"});
    } finally {
        setIsDeletingContent(null);
    }
  };


  const getInitials = (name?: string | null) => {
    if (!name) return authUser?.email?.[0]?.toUpperCase() || "SF";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading your SkillForge profile...</p>
      </div>
    );
  }

  if (!authUser) {
    router.push("/login");
    return null;
  }

  const displayProfile = firestoreProfile || { uid: authUser.uid, email: authUser.email };
  const displayName = displayProfile?.full_name || authUser.displayName || authUser.email?.split('@')[0] || "User";
  const displayEmail = authUser.email || "No email specified";
  const avatarDisplayUrl = authUser.photoURL || displayProfile?.photoURL || undefined;

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <Card className="glass-card overflow-hidden shadow-2xl">
         <div className="relative h-48 md:h-64 bg-gradient-to-br from-primary/30 via-accent/30 to-secondary/30">
           <Image
            src={"https://placehold.co/1200x400/141E30/8B5CF6.png?text=Your+SkillForge+Journey"}
            alt="Profile cover"
            layout="fill"
            objectFit="cover"
            priority
            data-ai-hint="abstract technology gradient"
          />
          <div className="absolute inset-0 bg-black/30"></div>
          <div className="absolute bottom-0 left-6 md:left-8 transform translate-y-1/2">
            <Avatar className="h-24 w-24 md:h-32 md:w-32 border-4 border-background shadow-lg ring-2 ring-primary">
              <AvatarImage src={avatarDisplayUrl} alt={displayName} />
              <AvatarFallback className="text-4xl bg-secondary text-secondary-foreground">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <CardHeader className="pt-16 md:pt-20 pb-6 px-6 md:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="mb-4 sm:mb-0">
              <CardTitle className="text-3xl md:text-4xl font-bold text-neon-primary">{displayName}</CardTitle>
              <CardDescription className="text-base text-muted-foreground mt-1">{displayEmail}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => setIsEditing(!isEditing)} className="border-primary text-primary hover:bg-primary/10 hover:text-primary smooth-transition shrink-0">
              <Edit3 className="mr-2 h-4 w-4" /> {isEditing ? "Cancel Editing" : "Edit Profile"}
            </Button>
          </div>
          <Separator className="my-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-foreground">{userUploadedContent.length}</p>
              <p className="text-sm text-muted-foreground">Uploads</p>
            </div>
            <Link href="/followers" className="hover:bg-muted/50 p-2 rounded-md smooth-transition">
              <p className="text-2xl font-semibold text-foreground">{displayProfile?.followers_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </Link>
            <Link href="/followers" className="hover:bg-muted/50 p-2 rounded-md smooth-transition">
              <p className="text-2xl font-semibold text-foreground">{displayProfile?.following_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Following</p>
            </Link>
          </div>
        </CardHeader>
      </Card>

      {isEditing ? (
        <Card className="glass-card shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl text-neon-accent flex items-center"><Edit3 className="mr-2"/>Edit Your Profile Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileUpdate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><Label htmlFor="full_name">Full Name</Label>
                  <div className="relative mt-1">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="full_name" name="full_name" value={formValues.full_name || ''} onChange={handleInputChange} className="input-glow-focus pl-10" disabled={isSubmitting}/>
                  </div>
                </div>
                <div><Label htmlFor="age">Age</Label>
                  <div className="relative mt-1">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="age" name="age" type="number" placeholder="e.g., 25" value={formValues.age ?? ''} onChange={handleInputChange} className="input-glow-focus pl-10" disabled={isSubmitting}/>
                  </div>
                </div>
                <div><Label htmlFor="gender">Gender</Label>
                  <div className="relative mt-1">
                    <GenderIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="gender" name="gender" value={formValues.gender || ''} onChange={handleInputChange} placeholder="e.g., Male, Female, Non-binary" className="input-glow-focus pl-10" disabled={isSubmitting}/>
                  </div>
                </div>
                <div><Label htmlFor="skills">Skills (comma-separated)</Label>
                  <div className="relative mt-1">
                    <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="skills" name="skills" value={formValues.skills || ''} onChange={handleInputChange} placeholder="e.g., React, NodeJS, AI" className="input-glow-focus pl-10" disabled={isSubmitting}/>
                  </div>
                </div>
                <div><Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <div className="relative mt-1">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="linkedin_url" name="linkedin_url" value={formValues.linkedin_url || ''} onChange={handleInputChange} className="input-glow-focus pl-10" disabled={isSubmitting}/>
                  </div>
                </div>
                <div><Label htmlFor="github_url">GitHub URL</Label>
                  <div className="relative mt-1">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="github_url" name="github_url" value={formValues.github_url || ''} onChange={handleInputChange} className="input-glow-focus pl-10" disabled={isSubmitting}/>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (About Me)</Label>
                <Textarea id="description" name="description" value={formValues.description || ''} onChange={handleInputChange} className="input-glow-focus min-h-[100px]" rows={4} disabled={isSubmitting}/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="achievements">Achievements</Label>
                <Textarea id="achievements" name="achievements" value={formValues.achievements || ''} onChange={handleInputChange} className="input-glow-focus min-h-[100px]" rows={4} disabled={isSubmitting}/>
              </div>

              <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-accent text-primary-foreground smooth-transition text-base py-2.5 px-6" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Save className="mr-2 h-5 w-5" />}
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-1 space-y-6">
            <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center text-neon-accent"><UserCircle className="mr-2 h-5 w-5 text-accent" /> About Me</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground leading-relaxed">{displayProfile?.description || "No description provided. Click 'Edit Profile' to add one!"}</p>
                {(displayProfile?.age != null && displayProfile.age > 0) && <p><strong>Age:</strong> {displayProfile.age}</p>}
                {displayProfile?.gender && <p><strong>Gender:</strong> {displayProfile.gender}</p>}
                <Separator />
                <div className="space-y-2 pt-2">
                  {displayProfile?.linkedin_url && <a href={displayProfile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent smooth-transition"><Linkedin className="mr-2 h-4 w-4" /> LinkedIn Profile</a>}
                  {displayProfile?.github_url && <a href={displayProfile.github_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent smooth-transition"><Github className="mr-2 h-4 w-4" /> GitHub Profile</a>}
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center text-neon-accent"><Briefcase className="mr-2 h-5 w-5 text-accent" /> Skills</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {displayProfile?.skills && displayProfile.skills.length > 0 ? displayProfile.skills.map(skill => <span key={skill} className="px-3 py-1.5 text-sm rounded-full bg-secondary text-secondary-foreground shadow-sm">{skill}</span>) : <p className="text-muted-foreground">No skills listed yet.</p>}
              </CardContent>
            </Card>
             <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center text-neon-accent"><Award className="mr-2 h-5 w-5 text-accent" /> Achievements</CardTitle></CardHeader>
              <CardContent>
                 <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{displayProfile?.achievements || "No achievements listed yet."}</p>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">My Uploaded Content</CardTitle></CardHeader>
              <CardContent>
                {isLoadingContent ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : userUploadedContent.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {userUploadedContent.map(contentItem => (
                      <div key={contentItem.id} className="relative group">
                        <ContentCard content={contentItem} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-7 w-7 p-1"
                              disabled={isDeletingContent === contentItem.id}
                            >
                              {isDeletingContent === contentItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="glass-card">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Content?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{contentItem.title}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteContent(contentItem)}
                                disabled={isDeletingContent === contentItem.id}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                {isDeletingContent === contentItem.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">You haven't uploaded any content yet. <Link href="/upload" className="text-primary hover:underline">Share your knowledge!</Link></p>
                )}
              </CardContent>
            </Card>
            <Card id="learnings" className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">My Learnings / Bookmarks</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">Content you're learning or have bookmarked will be shown here.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
