
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
import { db } from "@/lib/firebase"; // Firestore instance
import { doc, getDoc, runTransaction, serverTimestamp, increment, collection, query, where, getDocs, orderBy, limit, Timestamp, setDoc, deleteDoc } from "firebase/firestore";
import { ContentCard } from "@/components/content/content-card"; // Assuming this is your ContentCard
import type { Content as ContentCardType } from "@/components/content/content-card";


interface DisplayContent extends ContentCardType {
  // Add any additional fields if necessary
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const profileUserId = params.userId as string; // UID of the profile being viewed

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
      toast({ title: "Error", description: "Could not load user profile: " + error.message, variant: "destructive" });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [profileUserId, toast]);

  const fetchUserContent = useCallback(async () => {
    if (!profileUserId || !viewedProfile) return; // Ensure viewedProfile is loaded so authorName is available
    setIsLoadingContent(true);
    setContentError(null);
    try {
      const contentQuery = query(
        collection(db, "contents"), 
        where("uploader_uid", "==", profileUserId),
        orderBy("created_at", "desc"), 
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
          author: viewedProfile?.full_name || "Unknown Author", // Use fetched author name
          tags: data.tags || [],
          imageUrl: data.thumbnail_url || `https://placehold.co/600x400.png?text=${encodeURIComponent(data.title || "SkillForge")}`,
          average_rating: data.average_rating || 0,
          total_ratings: data.total_ratings || 0,
        } as DisplayContent;
      });
      setUserContent(fetchedContent);
       if (fetchedContent.length === 0) {
        console.log("No content found for this user on their profile page.");
      }
    } catch (error: any)
     {
      console.error("Error fetching user content for profile page:", error);
      let detailedError = "Could not load user's content.";
      if (error.code === 'failed-precondition' && error.message.includes('index')) {
        detailedError = `Firestore query requires an index which is missing. Please create it in the Firebase Console. The error message in your browser's Network tab or Firebase console logs will provide a direct link. The query likely needs an index on 'uploader_uid' and 'created_at'.`;
        toast({ title: "Database Index Required", description: detailedError, variant: "destructive", duration: 15000 });
      } else {
        toast({ title: "Content Load Error", description: error.message, variant: "destructive" });
      }
      setContentError(detailedError);
      setUserContent([]);
    } finally {
      setIsLoadingContent(false);
    }
  }, [profileUserId, viewedProfile, toast]);


  useEffect(() => {
    if (profileUserId) {
      fetchViewedUserProfile();
    }
  }, [profileUserId, fetchViewedUserProfile]);

  useEffect(() => {
    if (viewedProfile) { // Fetch content only after viewedProfile is loaded
        fetchUserContent();
    }
  }, [viewedProfile, fetchUserContent]);


  useEffect(() => {
    if (currentUser?.uid && viewedProfile?.uid && currentUser.uid !== viewedProfile.uid) {
      const checkFollowingStatus = async () => {
        // Path to check if currentUser is following viewedProfile
        const followingDocRef = doc(db, "users", currentUser.uid, "following", viewedProfile.uid);
        const followingDocSnap = await getDoc(followingDocRef);
        setIsFollowing(followingDocSnap.exists());
      };
      checkFollowingStatus();
    } else if (currentUser?.uid && viewedProfile?.uid && currentUser.uid === viewedProfile.uid) {
      setIsFollowing(false); // Cannot follow self
    }
  }, [currentUser, viewedProfile]);

  const handleToggleFollow = async () => {
    if (!currentUser || !currentUserProfile || !viewedProfile?.uid) {
      toast({ title: "Error", description: "Login required to follow users.", variant: "destructive" });
      return;
    }
    if (currentUser.uid === viewedProfile.uid) return;

    setProcessingFollow(true);

    const currentUserDocRef = doc(db, "users", currentUser.uid);
    const targetUserDocRef = doc(db, "users", viewedProfile.uid);
    
    // Document in current user's "following" subcollection
    const followingRef = doc(currentUserDocRef, "following", viewedProfile.uid);
    // Document in target user's "followers" subcollection
    const followerRef = doc(targetUserDocRef, "followers", currentUser.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const isCurrentlyFollowing = (await transaction.get(followingRef)).exists();

        if (isCurrentlyFollowing) { // Unfollow
          transaction.delete(followingRef);
          transaction.delete(followerRef);
          transaction.update(currentUserDocRef, { following_count: increment(-1) });
          transaction.update(targetUserDocRef, { followers_count: increment(-1) });
        } else { // Follow
          transaction.set(followingRef, { followed_at: serverTimestamp() });
          transaction.set(followerRef, { followed_at: serverTimestamp() });
          transaction.update(currentUserDocRef, { following_count: increment(1) });
          transaction.update(targetUserDocRef, { followers_count: increment(1) });
        }
      });

      setIsFollowing(prev => !prev); // Toggle local state
      // Update viewed profile's follower count locally for immediate UI update
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
    return <div className="text-center py-10 text-xl text-destructive flex items-center justify-center gap-2"><AlertTriangle/> User profile not found.</div>;
  }
  
  const isOwnProfile = currentUser?.uid === viewedProfile.uid;
  const displayName = viewedProfile.full_name || "SkillForge User";
  const displayEmail = viewedProfile.email || "Email not available";
  const avatarDisplayUrl = viewedProfile.photoURL || undefined;


  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <Card className="glass-card overflow-hidden shadow-2xl">
         <div className="relative h-48 md:h-64 bg-gradient-to-br from-primary/30 via-accent/30 to-secondary/30">
           <Image 
            src={`https://placehold.co/1200x400/${viewedProfile.uid.substring(0,6)}/${viewedProfile.uid.substring(6,12)}.png?text=${encodeURIComponent(displayName)}`}
            alt={`${displayName}'s Profile Cover`} 
            fill
            style={{objectFit:"cover"}}
            priority
            data-ai-hint="abstract technology gradient user"
          />
          <div className="absolute inset-0 bg-black/30"></div> {/* Subtle overlay */}
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
            {isOwnProfile ? (
              <Button variant="outline" onClick={() => router.push('/profile')} className="border-primary text-primary hover:bg-primary/10 hover:text-primary smooth-transition shrink-0">
                Edit My Profile
              </Button>
            ) : currentUser ? (
              <div className="flex space-x-2 mt-4 sm:mt-0 shrink-0">
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  onClick={handleToggleFollow}
                  disabled={processingFollow}
                  className={`${isFollowing ? "border-accent text-accent hover:bg-accent/10" : "bg-primary hover:bg-accent"} smooth-transition`}
                >
                  {processingFollow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 
                   isFollowing ? <UserCheck className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  {isFollowing ? "Following" : "Follow"}
                </Button>
                <Button variant="ghost" asChild className="text-primary hover:bg-primary/10 hover:text-accent smooth-transition">
                  <Link href={`/chat?userId=${viewedProfile.uid}`}>
                    <MessageSquare className="mr-1 h-4 w-4" /> Message
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
           <Separator className="my-6" />
           <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-foreground">{userContent.length}</p> 
              <p className="text-sm text-muted-foreground">Uploads</p>
            </div>
            <Link href={`/profile/${profileUserId}/followers`} className="hover:bg-muted/50 p-2 rounded-md smooth-transition">
              <p className="text-2xl font-semibold text-foreground">{viewedProfile.followers_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </Link>
            <Link href={`/profile/${profileUserId}/following`} className="hover:bg-muted/50 p-2 rounded-md smooth-transition">
              <p className="text-2xl font-semibold text-foreground">{viewedProfile.following_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Following</p>
            </Link>
          </div>
        </CardHeader>
      </Card>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-1 space-y-6">
            <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center text-neon-accent"><UserCircle className="mr-2 h-5 w-5 text-accent" /> About {displayName.split(' ')[0]}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground leading-relaxed">{viewedProfile.description || "No description provided."}</p>
                {(viewedProfile.age != null && viewedProfile.age > 0) && <p><strong>Age:</strong> {viewedProfile.age}</p>}
                {viewedProfile.gender && <p><strong>Gender:</strong> {viewedProfile.gender}</p>}
                <Separator />
                <div className="space-y-2 pt-2">
                  {viewedProfile.linkedin_url && <a href={viewedProfile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent smooth-transition"><Linkedin className="mr-2 h-4 w-4" /> LinkedIn Profile</a>}
                  {viewedProfile.github_url && <a href={viewedProfile.github_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:text-accent smooth-transition"><Github className="mr-2 h-4 w-4" /> GitHub Profile</a>}
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center text-neon-accent"><Briefcase className="mr-2 h-5 w-5 text-accent" /> Skills</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {viewedProfile.skills && viewedProfile.skills.length > 0 ? viewedProfile.skills.map(skill => <span key={skill} className="px-3 py-1.5 text-sm rounded-full bg-secondary text-secondary-foreground shadow-sm">{skill}</span>) : <p className="text-muted-foreground">No skills listed.</p>}
              </CardContent>
            </Card>
            <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl flex items-center text-neon-accent"><Award className="mr-2 h-5 w-5 text-accent" /> Achievements</CardTitle></CardHeader>
              <CardContent>
                 <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{viewedProfile.achievements || "No achievements listed."}</p>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="glass-card shadow-lg">
              <CardHeader><CardTitle className="text-xl text-neon-primary">{displayName.split(' ')[0]}&apos;s Content</CardTitle></CardHeader>
              <CardContent>
                {isLoadingContent ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-muted-foreground">Loading content...</p>
                  </div>
                ) : contentError ? (
                  <div className="text-center py-8 text-destructive flex flex-col items-center gap-2">
                     <AlertTriangle className="h-8 w-8"/> 
                     <p>{contentError}</p>
                     {contentError.includes("index") && <p className="text-sm mt-1 text-muted-foreground">Please check the Firebase console to create the required Firestore index.</p>}
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
