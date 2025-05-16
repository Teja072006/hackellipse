
// src/app/(main)/followers/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, UserCheck, MessageSquare, Users, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth, UserProfile } from "@/hooks/use-auth"; // Firebase version
import { db } from "@/lib/firebase";
import { 
  collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp, 
  increment, runTransaction, onSnapshot, Unsubscribe
} from "firebase/firestore";
import { toast } from "@/hooks/use-toast";

// Extended UserItem to include uid for Firebase
interface UserItem extends Partial<UserProfile> { // Make UserProfile fields optional for UserItem
  uid: string; // Firebase UID
  isFollowing?: boolean; // For "following" list to show unfollow button
  // Retain other fields from UserProfile like full_name, photoURL, description for display
}


export default function FollowersPage() {
  const { user: currentUser, profile: currentUserProfile, loading: authLoading } = useAuth();
  const [followers, setFollowers] = useState<UserItem[]>([]);
  const [following, setFollowing] = useState<UserItem[]>([]);
  const [isLoadingFollowers, setIsLoadingFollowers] = useState(true);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true);

  const getInitials = (name?: string | null) => (name ? name.split(" ").map(n => n[0]).join("").toUpperCase() : "??");

  const fetchUserProfiles = async (uids: string[]): Promise<UserItem[]> => {
    if (uids.length === 0) return [];
    const users: UserItem[] = [];
    // Firestore 'in' query limit is 30. Batch if needed for larger lists.
    // For simplicity, assuming uids length is manageable.
    const userProfilePromises = uids.map(uid => getDoc(doc(db, "users", uid)));
    const userProfileSnapshots = await Promise.all(userProfilePromises);
    
    userProfileSnapshots.forEach(docSnap => {
      if (docSnap.exists()) {
        users.push({ uid: docSnap.id, ...docSnap.data() } as UserItem);
      }
    });
    return users;
  };

  // Fetch Followers
  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    if (currentUser?.uid && !authLoading) {
      setIsLoadingFollowers(true);
      const followersRef = collection(db, "users", currentUser.uid, "followers");
      unsubscribe = onSnapshot(followersRef, async (snapshot) => {
        const followerUids = snapshot.docs.map(doc => doc.id);
        const followerProfiles = await fetchUserProfiles(followerUids);
        setFollowers(followerProfiles);
        setIsLoadingFollowers(false);
      }, (error) => {
        console.error("Error fetching followers:", error);
        toast({ title: "Error", description: "Could not fetch followers.", variant: "destructive" });
        setIsLoadingFollowers(false);
      });
    } else if (!authLoading) {
      setIsLoadingFollowers(false);
    }
    return () => unsubscribe?.();
  }, [currentUser, authLoading]);

  // Fetch Following
  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    if (currentUser?.uid && !authLoading) {
      setIsLoadingFollowing(true);
      const followingRef = collection(db, "users", currentUser.uid, "following");
      unsubscribe = onSnapshot(followingRef, async (snapshot) => {
        const followingUids = snapshot.docs.map(doc => doc.id);
        const followingProfiles = await fetchUserProfiles(followingUids);
        // Mark them as being followed for button state
        setFollowing(followingProfiles.map(p => ({ ...p, isFollowing: true })));
        setIsLoadingFollowing(false);
      }, (error) => {
        console.error("Error fetching following:", error);
        toast({ title: "Error", description: "Could not fetch who you are following.", variant: "destructive" });
        setIsLoadingFollowing(false);
      });
    } else if (!authLoading) {
      setIsLoadingFollowing(false);
    }
    return () => unsubscribe?.();
  }, [currentUser, authLoading]);


  const handleToggleFollow = async (targetUserUid: string, targetUserName?: string | null) => {
    if (!currentUser || !currentUserProfile) {
      toast({ title: "Error", description: "You must be logged in to follow users.", variant: "destructive" });
      return;
    }
    if (currentUser.uid === targetUserUid) {
      toast({ title: "Error", description: "You cannot follow yourself.", variant: "destructive" });
      return;
    }

    const currentFollowingRef = doc(db, "users", currentUser.uid, "following", targetUserUid);
    const targetUserFollowersRef = doc(db, "users", targetUserUid, "followers", currentUser.uid);
    
    const currentUserDocRef = doc(db, "users", currentUser.uid);
    const targetUserDocRef = doc(db, "users", targetUserUid);

    try {
      await runTransaction(db, async (transaction) => {
        const currentFollowingSnap = await transaction.get(currentFollowingRef);

        if (currentFollowingSnap.exists()) { // Currently following, so unfollow
          transaction.delete(currentFollowingRef);
          transaction.delete(targetUserFollowersRef);
          transaction.update(currentUserDocRef, { following_count: increment(-1) });
          transaction.update(targetUserDocRef, { followers_count: increment(-1) });
          toast({ title: "Unfollowed", description: `You are no longer following ${targetUserName || "this user"}.` });
        } else { // Not following, so follow
          transaction.set(currentFollowingRef, { followed_at: serverTimestamp() });
          transaction.set(targetUserFollowersRef, { followed_at: serverTimestamp() });
          transaction.update(currentUserDocRef, { following_count: increment(1) });
          transaction.update(targetUserDocRef, { followers_count: increment(1) });
          toast({ title: "Followed!", description: `You are now following ${targetUserName || "this user"}.` });
        }
      });
    } catch (error: any) {
      console.error("Error toggling follow:", error);
      toast({ title: "Error", description: `Could not update follow status: ${error.message}`, variant: "destructive" });
    }
  };
  
  const UserCard = ({ user, listType }: { user: UserItem; listType: "followers" | "following" }) => {
    // Check if the currentUser is following this user (for "followers" list "Follow Back" button)
    const isCurrentUserFollowingThisUser = listType === 'followers' && following.some(f => f.uid === user.uid);
    // For the "following" list, user.isFollowing should be true
    const showUnfollow = listType === 'following' || isCurrentUserFollowingThisUser;

    return (
    <Card className="bg-card shadow-md hover:shadow-primary/10 transition-shadow">
      <CardContent className="p-4 flex items-center space-x-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user.photoURL || undefined} alt={user.full_name || user.email || "User"} />
          <AvatarFallback>{getInitials(user.full_name || user.email)}</AvatarFallback>
        </Avatar>
        <div className="flex-grow">
          <Link href={`/profile/${user.uid}`} className="hover:underline">
             <h3 className="font-semibold text-lg text-foreground group-hover:text-primary">{user.full_name || user.email}</h3>
          </Link>
          <p className="text-sm text-muted-foreground truncate">{user.description || "No bio yet."}</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          {currentUser?.uid !== user.uid && ( // Don't show follow button for self
            <Button 
              variant={showUnfollow ? "destructive" : "outline"} 
              size="sm"
              onClick={() => handleToggleFollow(user.uid, user.full_name)}
              className={showUnfollow ? "bg-destructive hover:bg-destructive/90" : "hover:bg-primary/10 hover:border-primary"}
            >
              {showUnfollow ? <UserCheck className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />}
              {showUnfollow ? "Unfollow" : "Follow"}
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="text-primary hover:bg-primary/10">
            <Link href={`/chat?userId=${user.uid}`}>
              <MessageSquare className="mr-1 h-4 w-4" /> Message
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )};

  if (authLoading) {
     return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-neon-primary flex items-center justify-center">
          <Users className="mr-3 h-10 w-10" /> Connections
        </h1>
        <p className="text-lg text-muted-foreground mt-2">Manage your followers and the people you follow on SkillForge.</p>
      </header>

      <Tabs defaultValue="followers" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 max-w-md mx-auto bg-muted">
          <TabsTrigger value="followers" className="py-2 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">Followers ({followers.length})</TabsTrigger>
          <TabsTrigger value="following" className="py-2 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">Following ({following.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="followers">
          <div className="space-y-4">
            {isLoadingFollowers ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /> : 
            followers.length > 0 ? (
              followers.map(user => <UserCard key={user.uid} user={user} listType="followers" />)
            ) : (
              <p className="text-center text-muted-foreground py-8">You don't have any followers yet.</p>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="following">
          <div className="space-y-4">
             {isLoadingFollowing ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /> :
             following.length > 0 ? (
              following.map(user => <UserCard key={user.uid} user={user} listType="following" />)
            ) : (
              <p className="text-center text-muted-foreground py-8">You are not following anyone yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
