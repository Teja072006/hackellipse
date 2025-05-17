
// src/app/(main)/followers/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"; // Added CardDescription
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, UserCheck, MessageSquare, Users, Loader2, Users2Icon } from "lucide-react"; // Using Users2Icon
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth"; 
import type { UserProfile } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, doc, getDocs, query, runTransaction, serverTimestamp, 
  increment, onSnapshot, Unsubscribe, deleteDoc, setDoc, orderBy, where, getDoc, limit
} from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";


interface UserItem extends UserProfile { 
  isFollowingThisUser?: boolean; // Is current logged-in user following this itemUser? (Used for "Followers" list to show "Follow Back")
  isFollowedByCurrentUser?: boolean; // Is this itemUser followed by current logged-in user? (Used for "Following" list to show "Unfollow")
}


export default function FollowersPage() {
  const { user: currentUser, profile: currentUserProfile, loading: authLoading } = useAuth();
  const [followers, setFollowers] = useState<UserItem[]>([]);
  const [following, setFollowing] = useState<UserItem[]>([]);
  const [isLoadingFollowers, setIsLoadingFollowers] = useState(true);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true);
  const [processingFollowUids, setProcessingFollowUids] = useState<Set<string>>(new Set());


  const getInitials = (name?: string | null) => (name ? name.split(" ").map(n => n[0]).join("").toUpperCase() : "SF");

  // Fetch Followers (people who follow the current user)
  useEffect(() => {
    let unsubscribeFollowers: Unsubscribe | undefined;
    if (currentUser?.uid && !authLoading) {
      setIsLoadingFollowers(true);
      const followersRef = collection(db, "users", currentUser.uid, "followers");
      unsubscribeFollowers = onSnapshot(query(followersRef, orderBy("followed_at", "desc")), async (snapshot) => {
        const followerProfilesPromises = snapshot.docs.map(async (docSnap) => {
            const followerUid = docSnap.id;
            const userProfileRef = doc(db, "users", followerUid);
            const userProfileSnap = await getDoc(userProfileRef);
            if (userProfileSnap.exists()) {
                // Check if the current user is following this follower back
                let isFollowingThisFollower = false;
                if (currentUser?.uid) {
                    const followingCheckRef = doc(db, "users", currentUser.uid, "following", followerUid);
                    const followingCheckSnap = await getDoc(followingCheckRef);
                    isFollowingThisFollower = followingCheckSnap.exists();
                }
                return { 
                    uid: userProfileSnap.id, 
                    ...userProfileSnap.data(),
                    isFollowingThisUser: isFollowingThisFollower // Current user follows this person
                } as UserItem;
            }
            return null;
        });
        const resolvedFollowers = (await Promise.all(followerProfilesPromises)).filter(p => p !== null) as UserItem[];
        setFollowers(resolvedFollowers);
        setIsLoadingFollowers(false);
      }, (error) => {
        console.error("Error fetching followers:", error);
        toast({ title: "Error", description: "Could not fetch followers.", variant: "destructive" });
        setIsLoadingFollowers(false);
      });
    } else if (!authLoading) {
      setIsLoadingFollowers(false);
      setFollowers([]);
    }
    return () => unsubscribeFollowers?.();
  }, [currentUser, authLoading]);

  // Fetch Following (people the current user follows)
  useEffect(() => {
    let unsubscribeFollowing: Unsubscribe | undefined;
    if (currentUser?.uid && !authLoading) {
      setIsLoadingFollowing(true);
      const followingRef = collection(db, "users", currentUser.uid, "following");
      unsubscribeFollowing = onSnapshot(query(followingRef, orderBy("followed_at", "desc")), async (snapshot) => {
        const followingProfilesPromises = snapshot.docs.map(async (docSnap) => {
            const followedUserUid = docSnap.id;
            const userProfileRef = doc(db, "users", followedUserUid);
            const userProfileSnap = await getDoc(userProfileRef);
            if (userProfileSnap.exists()) {
                return { 
                    uid: userProfileSnap.id, 
                    ...userProfileSnap.data(),
                    isFollowedByCurrentUser: true // This user is followed by the current user
                } as UserItem;
            }
            return null;
        });
        const resolvedFollowing = (await Promise.all(followingProfilesPromises)).filter(p => p !== null) as UserItem[];
        setFollowing(resolvedFollowing);
        setIsLoadingFollowing(false);
      }, (error) => {
        console.error("Error fetching following:", error);
        toast({ title: "Error", description: "Could not fetch who you are following.", variant: "destructive" });
        setIsLoadingFollowing(false);
      });
    } else if (!authLoading) {
      setIsLoadingFollowing(false);
      setFollowing([]);
    }
    return () => unsubscribeFollowing?.();
  }, [currentUser, authLoading]);


  const handleToggleFollow = async (targetUser: UserItem) => {
    if (!currentUser || !currentUserProfile || !targetUser.uid) {
      toast({ title: "Error", description: "You must be logged in to follow users.", variant: "destructive" });
      return;
    }
    if (currentUser.uid === targetUser.uid) {
      toast({ title: "Error", description: "You cannot follow yourself.", variant: "destructive" });
      return;
    }

    setProcessingFollowUids(prev => new Set(prev).add(targetUser.uid));

    const currentUserDocRef = doc(db, "users", currentUser.uid);
    const targetUserDocRef = doc(db, "users", targetUser.uid);
    
    // Ref for current user's "following" subcollection (who current user follows)
    const currentUserFollowingTargetRef = doc(currentUserDocRef, "following", targetUser.uid);
    // Ref for target user's "followers" subcollection (who follows target user)
    const targetUserFollowersCurrentUserRef = doc(targetUserDocRef, "followers", currentUser.uid);

    try {
      await runTransaction(db, async (transaction) => {
        // Check if current user is already following the targetUser
        const isCurrentlyFollowingSnap = await transaction.get(currentUserFollowingTargetRef);
        const isCurrentlyFollowing = isCurrentlyFollowingSnap.exists();

        if (isCurrentlyFollowing) { // Unfollow action
          transaction.delete(currentUserFollowingTargetRef);
          transaction.delete(targetUserFollowersCurrentUserRef);
          transaction.update(currentUserDocRef, { following_count: increment(-1) });
          transaction.update(targetUserDocRef, { followers_count: increment(-1) });
        } else { // Follow action
          transaction.set(currentUserFollowingTargetRef, { 
            followed_at: serverTimestamp(), 
            // Denormalize basic info for easier listing in "following" list later if needed
            user_id: targetUser.uid, 
            full_name: targetUser.full_name, 
            photoURL: targetUser.photoURL 
          });
          transaction.set(targetUserFollowersCurrentUserRef, { 
            followed_at: serverTimestamp(),
             // Denormalize basic info for easier listing in "followers" list later if needed
            user_id: currentUser.uid,
            full_name: currentUserProfile.full_name,
            photoURL: currentUserProfile.photoURL
          });
          transaction.update(currentUserDocRef, { following_count: increment(1) });
          transaction.update(targetUserDocRef, { followers_count: increment(1) });
        }
      });
       toast({ title: targetUser.isFollowedByCurrentUser || targetUser.isFollowingThisUser ? "Unfollowed!" : "Followed!", description: `You are now ${targetUser.isFollowedByCurrentUser || targetUser.isFollowingThisUser ? "no longer following" : "following"} ${targetUser.full_name || "this user"}.` });
      // Firestore onSnapshot listeners will automatically update local state (followers, following arrays)
    } catch (error: any) {
      console.error("Error toggling follow:", error);
      toast({ title: "Error", description: `Could not update follow status: ${error.message}`, variant: "destructive" });
    } finally {
      setProcessingFollowUids(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetUser.uid);
        return newSet;
      });
    }
  };
  
  const UserCardComponent = ({ userItem, listType }: { userItem: UserItem; listType: "followers" | "following" }) => {
    const isProcessing = processingFollowUids.has(userItem.uid);
    
    // Determine button state/text
    // If viewing 'followers' list: 'Follow Back' (if not already following them), or 'Unfollow' (if already following them)
    // If viewing 'following' list: 'Unfollow'
    let buttonText = "Follow";
    let buttonVariant: "default" | "outline" = "default";
    let showButtonIcon = UserPlus;

    if (listType === 'followers') {
        if (userItem.isFollowingThisUser) { // Current user IS following this person from their followers list
            buttonText = "Unfollow";
            buttonVariant = "outline";
            showButtonIcon = UserCheck;
        } else {
            buttonText = "Follow Back";
            buttonVariant = "default";
            showButtonIcon = UserPlus;
        }
    } else if (listType === 'following') { // User is in the "following" list, so current user is definitely following them
        buttonText = "Unfollow";
        buttonVariant = "outline";
        showButtonIcon = UserCheck;
    }


    return (
    <Card className="glass-card shadow-md hover:shadow-primary/20 smooth-transition">
      <CardContent className="p-4 flex items-center space-x-3 sm:space-x-4">
        <Link href={`/profile/${userItem.uid}`} className="shrink-0">
            <Avatar className="h-12 w-12 md:h-14 md:w-14 border-2 border-transparent hover:border-primary smooth-transition">
            <AvatarImage src={userItem.photoURL || undefined} alt={userItem.full_name || userItem.email || "User"} />
            <AvatarFallback className="bg-secondary">{getInitials(userItem.full_name || userItem.email)}</AvatarFallback>
            </Avatar>
        </Link>
        <div className="flex-grow min-w-0">
          <Link href={`/profile/${userItem.uid}`} className="hover:underline">
             <h3 className="font-semibold text-base md:text-lg text-foreground group-hover:text-primary truncate">{userItem.full_name || userItem.email}</h3>
          </Link>
          <p className="text-sm text-muted-foreground truncate max-w-xs">{userItem.description || "SkillForge User"}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2 shrink-0">
          {currentUser?.uid !== userItem.uid && (
            <Button 
              variant={buttonVariant}
              size="sm"
              onClick={() => handleToggleFollow(userItem)}
              disabled={isProcessing}
              className={`${buttonVariant === "outline" ? "border-destructive text-destructive hover:bg-destructive/10" : "bg-primary hover:bg-accent"} text-xs px-3 py-1.5 md:px-4 md:py-2`}
            >
              {isProcessing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <showButtonIcon className="mr-1 h-4 w-4" />}
              {buttonText}
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="text-primary hover:text-accent hover:bg-primary/10 text-xs px-3 py-1.5 md:px-4 md:py-2">
            <Link href={`/chat?userId=${userItem.uid}`}>
              <MessageSquare className="mr-1 h-4 w-4" /> Message
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )};

  const renderSkeletonUserCard = (key: number) => (
    <Card key={key} className="glass-card shadow-md">
      <CardContent className="p-4 flex items-center space-x-4">
        <Skeleton className="h-14 w-14 rounded-full bg-muted/50" />
        <div className="flex-grow space-y-2">
          <Skeleton className="h-5 w-3/5 rounded bg-muted/50" />
          <Skeleton className="h-4 w-4/5 rounded bg-muted/40" />
        </div>
        <div className="flex space-x-2">
            <Skeleton className="h-8 w-20 rounded-md bg-muted/50" />
            <Skeleton className="h-8 w-20 rounded-md bg-muted/50" />
        </div>
      </CardContent>
    </Card>
  );


  if (authLoading && !currentUser) { 
     return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-4">
            <Users2Icon className="h-16 w-16 text-primary animate-pulse mb-4" />
            <p className="text-lg text-muted-foreground">Loading connections...</p>
        </div>
     );
  }
  if (!currentUser && !authLoading) {
    return <div className="text-center py-10 glass-card rounded-lg p-8">Please log in to manage your SkillForge connections.</div>;
  }


  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="glass-card shadow-2xl mb-8">
        <CardHeader className="items-center">
          <Users2Icon className="h-12 w-12 text-accent mb-3" />
          <CardTitle className="text-3xl md:text-4xl font-bold text-neon-primary">
            Your Connections
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground mt-1">
            Manage your followers and the people you follow on SkillForge.
          </CardDescription>
        </CardHeader>
      </Card>
      

      <Tabs defaultValue="followers" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 max-w-md mx-auto bg-muted/50 glass-card p-1 rounded-lg">
          <TabsTrigger value="followers" className="py-2.5 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg rounded-md">Followers ({followers.length})</TabsTrigger>
          <TabsTrigger value="following" className="py-2.5 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg rounded-md">Following ({following.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="followers">
          <div className="space-y-4">
            {isLoadingFollowers ? [...Array(3)].map((_, i) => renderSkeletonUserCard(i)) : 
            followers.length > 0 ? (
              followers.map(user => <UserCardComponent key={user.uid} userItem={user} listType="followers" />)
            ) : (
              <p className="text-center text-muted-foreground py-10 glass-card rounded-lg p-6">You don't have any followers yet. Share your skills to grow your network!</p>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="following">
          <div className="space-y-4">
             {isLoadingFollowing ? [...Array(3)].map((_, i) => renderSkeletonUserCard(i)) :
             following.length > 0 ? (
              following.map(user => <UserCardComponent key={user.uid} userItem={user} listType="following" />)
            ) : (
              <p className="text-center text-muted-foreground py-10 glass-card rounded-lg p-6">You are not following anyone yet. Explore SkillForge and connect with creators!</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
