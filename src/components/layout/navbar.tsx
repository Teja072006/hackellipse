
// src/components/layout/navbar.tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth"; // Using Firebase version
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, LogIn, LogOut, PlusCircle, Search, User, UserPlus, Settings, MessageSquare, Users, Briefcase } from "lucide-react"; 

export default function Navbar() {
  const { user, signOutUser, loading, profile } = useAuth();

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase();
    }
    if (user?.displayName) {
        return user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "SF"; // SkillForge
  };
  
  const displayName = profile?.full_name || user?.displayName || user?.email || "User";
  // For Firebase, auth user's photoURL is the primary source for avatar
  const avatarUrl = user?.photoURL || profile?.photoURL || undefined; 


  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={user ? "/home" : "/"} className="flex items-center space-x-2">
          <Briefcase className="h-7 w-7 text-primary" /> 
          <span className="font-bold text-xl text-neon-primary">SkillForge</span>
        </Link>
        
        <nav className="flex items-center space-x-4">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted"></div>
          ) : user ? (
            <>
              <Button variant="ghost" asChild>
                <Link href="/home" className="flex items-center">
                  <Home className="mr-2 h-4 w-4" /> Home
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/upload" className="flex items-center">
                  <PlusCircle className="mr-2 h-4 w-4" /> Upload
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/search" className="flex items-center">
                  <Search className="mr-2 h-4 w-4" /> Search
                </Link>
              </Button>
               <Button variant="ghost" asChild>
                <Link href="/chat" className="flex items-center">
                    <MessageSquare className="mr-2 h-4 w-4" /> Chat
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={avatarUrl} alt={displayName} />
                      <AvatarFallback>{getInitials()}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{displayName}</p>
                      {user.email && <p className="text-xs leading-none text-muted-foreground">{user.email}</p>}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/followers">
                        <Users className="mr-2 h-4 w-4" /> Followers
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOutUser}>
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login" className="flex items-center">
                  <LogIn className="mr-2 h-4 w-4" /> Sign In
                </Link>
              </Button>
              <Button asChild>
                <Link href="/register" className="flex items-center">
                  <UserPlus className="mr-2 h-4 w-4" /> Join Now
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
