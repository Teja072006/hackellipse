// src/app/(main)/followers/page.tsx
"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, UserCheck, MessageSquare, User, ThumbsUp, Users } from "lucide-react";
import Link from "next/link";

interface UserItem {
  id: string;
  name: string;
  avatarUrl?: string;
  bio: string;
  isFollowing?: boolean; // Only relevant for 'following' list to show unfollow
}

// Mock data
const MOCK_FOLLOWERS: UserItem[] = [
  { id: "f1", name: "Aisha Khan", avatarUrl: "https://placehold.co/40x40/FFC0CB/000000.png?text=AK", bio: "Frontend Developer | React Enthusiast" },
  { id: "f2", name: "Ben Miller", avatarUrl: "https://placehold.co/40x40/ADD8E6/000000.png?text=BM", bio: "Backend Engineer | Loves Python &amp; Django" },
  { id: "f3", name: "Chloe Davis", avatarUrl: "https://placehold.co/40x40/90EE90/000000.png?text=CD", bio: "AI Researcher | Exploring LLMs" },
];

const MOCK_FOLLOWING: UserItem[] = [
  { id: "fg1", name: "David Lee (Tech Guru)", avatarUrl: "https://placehold.co/40x40/FFA07A/000000.png?text=DL", bio: "Sharing insights on cutting-edge tech.", isFollowing: true },
  { id: "fg2", name: "Emma Wilson (Design Lead)", avatarUrl: "https://placehold.co/40x40/DDA0DD/000000.png?text=EW", bio: "Passionate about UI/UX and accessibility.", isFollowing: true },
];


export default function FollowersPage() {
  const [followers, setFollowers] = useState<UserItem[]>(MOCK_FOLLOWERS);
  const [following, setFollowing] = useState<UserItem[]>(MOCK_FOLLOWING);

  const toggleFollow = (userId: string, listType: "followers" | "following") => {
    // This is a mock function. In a real app, you'd call an API.
    if (listType === "following") {
      setFollowing(prev => prev.map(user => user.id === userId ? {...user, isFollowing: !user.isFollowing} : user));
    } else {
      // For followers list, if you implement follow back
      // setFollowers(prev => prev.map(user => user.id === userId ? {...user, isFollowing: !user.isFollowing} : user));
      alert(`Mock: Toggled follow for user ${userId} from ${listType} list.`);
    }
  };
  
  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase();

  const UserCard = ({ user, listType }: { user: UserItem; listType: "followers" | "following" }) => (
    <Card className="bg-card shadow-md hover:shadow-primary/10 transition-shadow">
      <CardContent className="p-4 flex items-center space-x-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user.avatarUrl} alt={user.name} />
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-grow">
          <Link href={`/profile/${user.id}`} className="hover:underline"> {/* Assume dynamic profile route */}
             <h3 className="font-semibold text-lg text-foreground group-hover:text-primary">{user.name}</h3>
          </Link>
          <p className="text-sm text-muted-foreground truncate">{user.bio}</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          {listType === "following" ? (
            <Button 
              variant={user.isFollowing ? "destructive" : "outline"} 
              size="sm"
              onClick={() => toggleFollow(user.id, listType)}
              className={user.isFollowing ? "bg-destructive hover:bg-destructive/90" : "hover:bg-primary/10 hover:border-primary"}
            >
              {user.isFollowing ? <UserCheck className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />}
              {user.isFollowing ? "Unfollow" : "Follow Back"}
            </Button>
          ) : (
             <Button variant="outline" size="sm" onClick={() => alert(`Follow ${user.name}`)} className="hover:bg-primary/10 hover:border-primary">
                <UserPlus className="mr-1 h-4 w-4" /> Follow
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="text-primary hover:bg-primary/10">
            <Link href={`/chat?userId=${user.id}`}> {/* Assume chat page can take userId query */}
              <MessageSquare className="mr-1 h-4 w-4" /> Message
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-8 px-4">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-neon-primary flex items-center justify-center">
          <Users className="mr-3 h-10 w-10" /> Connections
        </h1>
        <p className="text-lg text-muted-foreground mt-2">Manage your followers and the people you follow.</p>
      </header>

      <Tabs defaultValue="followers" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 max-w-md mx-auto bg-muted">
          <TabsTrigger value="followers" className="py-2 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">Followers ({followers.length})</TabsTrigger>
          <TabsTrigger value="following" className="py-2 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">Following ({following.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="followers">
          <div className="space-y-4">
            {followers.length > 0 ? (
              followers.map(user => <UserCard key={user.id} user={user} listType="followers" />)
            ) : (
              <p className="text-center text-muted-foreground py-8">You don't have any followers yet.</p>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="following">
          <div className="space-y-4">
             {following.length > 0 ? (
              following.map(user => <UserCard key={user.id} user={user} listType="following" />)
            ) : (
              <p className="text-center text-muted-foreground py-8">You are not following anyone yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
