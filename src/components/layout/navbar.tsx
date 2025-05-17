
// src/components/layout/navbar.tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
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
import { Home, LogIn, LogOut, PlusCircle, Search, User, UserPlus, Settings, MessageSquare, Users, Briefcase, Menu } from "lucide-react"; 
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import React from "react";

export default function Navbar() {
  const { user, signOutUser, loading, profile } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

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
  const avatarUrl = user?.photoURL || profile?.photoURL || undefined; 

  const navLinks = user ? [
    { href: "/home", label: "Home", icon: Home },
    { href: "/upload", label: "Upload", icon: PlusCircle },
    { href: "/search", label: "Search", icon: Search },
    { href: "/chat", label: "Chat", icon: MessageSquare },
  ] : [
    { href: "/login", label: "Sign In", icon: LogIn },
    { href: "/register", label: "Join Now", icon: UserPlus, variant: "default" as const },
  ];

  const userMenuItems = [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/followers", label: "Connections", icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg shadow-lg supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={user ? "/home" : "/"} className="flex items-center space-x-2 group">
          <Briefcase className="h-7 w-7 text-accent group-hover:text-primary smooth-transition" /> 
          <span className="font-bold text-xl text-neon-accent group-hover:text-neon-primary smooth-transition">SkillForge</span>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-2">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted"></div>
          ) : user ? (
            <>
              {navLinks.slice(0,4).map(link => ( // Only first 4 for desktop main nav
                 <Button variant="ghost" asChild key={link.href}>
                    <Link href={link.href} className="flex items-center text-sm">
                      <link.icon className="mr-2 h-4 w-4" /> {link.label}
                    </Link>
                  </Button>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9 border-2 border-primary hover:border-accent smooth-transition">
                      <AvatarImage src={avatarUrl} alt={displayName} />
                      <AvatarFallback className="bg-secondary">{getInitials()}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 glass-card" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{displayName}</p>
                      {user.email && <p className="text-xs leading-none text-muted-foreground">{user.email}</p>}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userMenuItems.map(item => (
                     <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href}>
                          <item.icon className="mr-2 h-4 w-4" /> {item.label}
                        </Link>
                      </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOutUser}>
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
             navLinks.map(link => (
                <Button variant={link.variant || "ghost"} asChild key={link.href} className={link.variant === "default" ? "bg-primary hover:bg-accent" : ""}>
                  <Link href={link.href} className="flex items-center">
                    <link.icon className="mr-2 h-4 w-4" /> {link.label}
                  </Link>
                </Button>
              ))
          )}
        </nav>

        {/* Mobile Navigation Trigger */}
        <div className="md:hidden">
           {loading ? <div className="h-8 w-8 animate-pulse rounded-md bg-muted"></div> :
           <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] p-0 glass-card flex flex-col">
              <div className="p-4 border-b border-border">
                 <Link href={user ? "/home" : "/"} className="flex items-center space-x-2 group" onClick={() => setIsMobileMenuOpen(false)}>
                    <Briefcase className="h-6 w-6 text-accent group-hover:text-primary smooth-transition" /> 
                    <span className="font-bold text-lg text-neon-accent group-hover:text-neon-primary smooth-transition">SkillForge</span>
                  </Link>
              </div>
              <nav className="flex-grow p-4 space-y-2">
                {user ? (
                  <>
                    {navLinks.slice(0,4).map(link => (
                      <Button variant="ghost" asChild key={link.href} className="w-full justify-start" onClick={() => setIsMobileMenuOpen(false)}>
                        <Link href={link.href} className="flex items-center">
                          <link.icon className="mr-2 h-4 w-4" /> {link.label}
                        </Link>
                      </Button>
                    ))}
                     <DropdownMenuSeparator className="my-3"/>
                     <p className="px-2 text-xs text-muted-foreground">My Account</p>
                     {userMenuItems.map(item => (
                        <Button variant="ghost" asChild key={item.href} className="w-full justify-start" onClick={() => setIsMobileMenuOpen(false)}>
                            <Link href={item.href}>
                            <item.icon className="mr-2 h-4 w-4" /> {item.label}
                            </Link>
                        </Button>
                     ))}
                  </>
                ) : (
                  navLinks.map(link => (
                    <Button variant={link.variant || "ghost"} asChild key={link.href} className={`w-full justify-start ${link.variant === "default" ? "bg-primary hover:bg-accent" : ""}`} onClick={() => setIsMobileMenuOpen(false)}>
                      <Link href={link.href} className="flex items-center">
                        <link.icon className="mr-2 h-4 w-4" /> {link.label}
                      </Link>
                    </Button>
                  ))
                )}
              </nav>
              {user && (
                <div className="p-4 border-t border-border mt-auto">
                   <div className="flex items-center space-x-3 mb-3">
                     <Avatar className="h-10 w-10 border-2 border-primary">
                        <AvatarImage src={avatarUrl} alt={displayName} />
                        <AvatarFallback className="bg-secondary">{getInitials()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium leading-none">{displayName}</p>
                        {user.email && <p className="text-xs leading-none text-muted-foreground">{user.email}</p>}
                      </div>
                   </div>
                  <Button variant="outline" className="w-full" onClick={() => { signOutUser(); setIsMobileMenuOpen(false); }}>
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>}
        </div>
      </div>
    </header>
  );
}
