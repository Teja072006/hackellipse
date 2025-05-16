
// src/app/(main)/profile/[userId]/page.tsx
"use client";

import { useAuth, UserProfile } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Mail, Linkedin, Github, Briefcase, Award, UserCircle, Loader2, UserPlus, UserCheck, MessageSquare, FileText, AlertTriangle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, runTransaction, serverTimestamp, increment, collection, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { ContentCard } from "@/components/content/content-card";
import type { Content as ContentCardType } from "@/components/content/content-card";


interface DisplayContent extends ContentCardType {
  // Any additional fields specific to content display on profile if different from ContentCardType
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const profileUserId = params.userId as string;

  const { user: currentUser, profile: currentUserProfile, loading: authLoading } = useAuth();
  const [viewedProfile, setViewedProfile] = useState<UserProfile | null>(null);
  const [userContent, setUserContent] = useState<DisplayContent[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [processingFollow, setProcessingFollow] = useState(false);

  const fetchViewedUserProfile = useCallback(async () => {
    if (!profileUserId) return;
    setIsLoadingProfile(true);
    try {
      const userDocRef = doc(db, "users", profileUserId);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        setViewedProfile({ uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile);
      } else {
        toast({ title: "Profile Not Found", description: "This user profile does not exist.", variant: "destructive" });
        setViewedProfile(null);
      }
    } catch (error: any) {
      console.error("Error fetching viewed profile:", error);
      toast({ title: "Error", description: "Could not load user profile.", variant: "destructive" });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [profileUserId]);

  const fetchUserContent = useCallback(async () => {
    if (!profileUserId) return;
    setIsLoadingContent(true);
    setContentError(null);
    try {
      console.log(`Fetching content for uploader_uid: ${profileUserId}`);
      const contentQuery = query(
        collection(db, "contents"), // Ensure this collection name matches where uploads are saved
        where("uploader_uid", "==", profileUserId),
        orderBy("created_at", "desc"), // This query requires a composite index in Firestore
        limit(10)
      );
      const contentSnapshot = await getDocs(contentQuery);
      const fetchedContent = contentSnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || "Untitled",
          aiSummary: data.ai_description || "No summary available.",
          type: data.contentType || "text",
          author: viewedProfile?.full_name || "Unknown Author",
          tags: data.tags || [],
          imageUrl: data.thumbnail_url || `https://placehold.co/600x400.png?text=${encodeURIComponent(data.title || "SkillForge")}`,
          average_rating: data.average_rating || 0,
          total_ratings: data.total_ratings || 0,
        } as DisplayContent;
      });
      setUserContent(fetchedContent);
      if (fetchedContent.length === 0) {
        console.log("No content found for this user.");
      } else {
        console.log(`Fetched ${fetchedContent.length} content items.`);
      }
    } catch (error: any) {
      console.error("Error fetching user content:", error);
      if (error.code === 'failed-precondition' && error.message.includes('index')) {
        setContentError(`Firestore query requires an index. Please create it in the Firebase Console. The error message in your browser's Network tab or Firebase console logs will provide a direct link to create it.`);
        toast({ title: "Database Index Required", description: "An index is needed to display content. Check console for link.", variant: "destructive", duration: 10000 });
      } else {
        setContentError("Could not load user's content.");
        toast({ title: "Error", description: "Could not load user's content.", variant: "destructive" });
      }
      setUserContent([]); // Clear content on error
    } finally {
      setIsLoadingContent(false);
    }
  }, [profileUserId, viewedProfile?.full_name]);


  useEffect(() => {
    if (profileUserId) {
      fetchViewedUserProfile();
    }
  }, [profileUserId, fetchViewedUserProfile]);

  useEffect(() => {
    if (viewedProfile) {
        fetchUserContent();
    }
  }, [viewedProfile, fetchUserContent]);


  useEffect(() => {
    if (currentUser?.uid && viewedProfile?.uid && currentUser.uid !== viewedProfile.uid) {
      const checkFollowingStatus = async () => {
        const followDocRef = doc(db, "users", currentUser.uid, "following", viewedProfile.uid);
        const followDocSnap = await getDoc(followDocRef);
        setIsFollowing(followDocSnap.exists());
      };
      checkFollowingStatus();
    } else if (currentUser?.uid && viewedProfile?.uid && currentUser.uid === viewedProfile.uid) {
      setIsFollowing(false);
    }
  }, [currentUser, viewedProfile]);

  const handleToggleFollow = async () => {
    if (!currentUser || !currentUserProfile || !viewedProfile?.uid) {
      toast({ title: "Error", description: "Cannot perform follow action.", variant: "destructive" });
      return;
    }
    if (currentUser.uid === viewedProfile.uid) return;

    setProcessingFollow(true);

    const currentUserDocRef = doc(db, "users", currentUser.uid);
    const targetUserDocRef = doc(db, "users", viewedProfile.uid);
    // Path for current user's following list
    const currentUserFollowingTargetRef = doc(collection(currentUserDocRef, "following"), viewedProfile.uid);
    // Path for target user's followers list
    const targetUserFollowersCurrentUserRef = doc(collection(targetUserDocRef, "followers"), currentUser.uid);


    try {
      await runTransaction(db, async (transaction) => {
        const isCurrentlyFollowing = (await transaction.get(currentUserFollowingTargetRef)).exists();

        if (isCurrentlyFollowing) { // Unfollow
          transaction.delete(currentUserFollowingTargetRef);
          transaction.delete(targetUserFollowersCurrentUserRef);
          transaction.update(currentUserDocRef, { following_count: increment(-1) });
          transaction.update(targetUserDocRef, { followers_count: increment(-1) });
        } else { // Follow
          transaction.set(currentUserFollowingTargetRef, { followed_at: serverTimestamp() });
          transaction.set(targetUserFollowersCurrentUserRef, { followed_at: serverTimestamp() });
          transaction.update(currentUserDocRef, { following_count: increment(1) });
          transaction.update(targetUserDocRef, { followers_count: increment(1) });
        }
      });

      setIsFollowing(prev => !prev);
      setViewedProfile(prev => prev ? { ...prev, followers_count: (prev.followers_count || 0) + (isFollowing ? -1 : 1) } : null);
      toast({ title: isFollowing ? "Unfollowed!" : "Followed!", description: `You are now ${isFollowing ? "no longer following" : "following"} ${viewedProfile.full_name || "this user"}.` });
    } catch (error: any) {
      console.error("Error toggling follow:", error);
      toast({ title: "Follow Error", description: error.message || "Could not update follow status.", variant: "destructive" });
    } finally {
      setProcessingFollow(false);
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
  };

  if (isLoadingProfile || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!viewedProfile) {
    return <div className="text-center py-10 text-xl text-destructive">User profile not found.</div>;
  }
  
  const isOwnProfile = currentUser?.uid === viewedProfile.uid;
  const displayName = viewedProfile.full_name || "User";
  const displayEmail = viewedProfile.email || "No email";
  const avatarDisplayUrl = viewedProfile.photoURL || undefined;


  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <Card className="bg-card shadow-xl overflow-hidden">
        <div className="relative h-48 bg-gradient-to-r from-primary via-accent to-secondary">
          <Image 
            src={`https://placehold.co/1200x300.png?text=${encodeURIComponent(displayName)}`}
            alt={`${displayName}'s Profile Cover`} 
            fill
            style={{objectFit:"cover"}}
            priority
            data-ai-hint="abstract background user"
          />
          <div className="absolute bottom-0 left-6 transform translate-y-1/2">
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
              <AvatarImage src={avatarDisplayUrl} alt={displayName} />
              <AvatarFallback className="text-4xl">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <CardHeader className="pt-20 pb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-bold text-neon-primary">{displayName}</CardTitle>
              <CardDescription className="text-muted-foreground">{displayEmail}</CardDescription>
            </div>
            {isOwnProfile ? (
              <Button variant="outline" onClick={() => router.push('/profile')} className="hover:border-primary hover:text-primary mt-4 sm:mt-0">
                Edit My Profile
              </Button>
            ) : currentUser ? (
              <div className="flex space-x-2 mt-4 sm:mt-0">
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  onClick={handleToggleFollow}
                  disabled={processingFollow}
                  className={isFollowing ? "border-primary text-primary hover:bg-primary/10" : "bg-primary hover:bg-accent"}
                >
                  {processingFollow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 
                   isFollowing ? <UserCheck className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  {isFollowing ? "Following" : "Follow"}
                </Button>
                <Button variant="ghost" asChild className="text-primary hover:bg-primary/10">
                  <Link href={`/chat?userId=${viewedProfile.uid}`}>
                    <MessageSquare className="mr-1 h-4 w-4" /> Message
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
           <div className="flex space-x-6 mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <p className="text-2xl font-semibold">{userContent.length}</p> 
              <p className="text-sm text-muted-foreground">Uploads</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold">{viewedProfile.followers_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold">{viewedProfile.following_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Following</p>
            </div>
          </div>
        </CardHeader>
      </Card>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><UserCircle className="mr-2 h-5 w-5 text-primary" /> About {displayName}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {viewedProfile.description ? <p className="text-muted-foreground">{viewedProfile.description}</p> : <p className="text-muted-foreground">No description provided.</p>}
                {viewedProfile.age != null && <p><strong>Age:</strong> {viewedProfile.age}</p>}
                {viewedProfile.gender && <p><strong>Gender:</strong> {viewedProfile.gender}</p>}
                <Separator />
                <div className="space-y-2">
                  {viewedProfile.linkedin_url && <a href={viewedProfile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><Linkedin className="mr-2 h-4 w-4" /> LinkedIn</a>}
                  {viewedProfile.github_url && <a href={viewedProfile.github_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent"><Github className="mr-2 h-4 w-4" /> GitHub</a>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><Briefcase className="mr-2 h-5 w-5 text-primary" /> Skills</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {viewedProfile.skills && viewedProfile.skills.length > 0 ? viewedProfile.skills.map(skill => <span key={skill} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">{skill}</span>) : <p className="text-muted-foreground">No skills listed.</p>}
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center"><Award className="mr-2 h-5 w-5 text-primary" /> Achievements</CardTitle></CardHeader>
              <CardContent>
                 {viewedProfile.achievements ? <p className="text-muted-foreground whitespace-pre-line">{viewedProfile.achievements}</p> : <p className="text-muted-foreground">No achievements listed.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="bg-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">{displayName}&apos;s Content</CardTitle></CardHeader>
              <CardContent>
                {isLoadingContent ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-muted-foreground">Loading content...</p>
                  </div>
                ) : contentError ? (
                  <div className="text-center py-8 text-destructive">
                     <AlertTriangle className="inline h-5 w-5 mr-2"/> {contentError}
                     {contentError.includes("index") && <p className="text-sm mt-2">Please follow the link in your browser's console to create the required Firestore index.</p>}
                  </div>
                ) : userContent.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {userContent.map(contentItem => (
                      <ContentCard key={contentItem.id} content={contentItem} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">This user hasn&apos;t uploaded any content yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
    
