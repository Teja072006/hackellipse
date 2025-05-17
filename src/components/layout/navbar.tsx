
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
import { Home, LogIn, LogOut, PlusCircle, Search, User, UserPlus, Settings, MessageSquare, Users, Briefcase, Menu, Bell, MailIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import React from "react";

// Mock notifications - replace with actual data fetching later
const mockNotifications = [
  { id: "1", text: "New follower: Alice followed you.", time: "2h ago", read: false, href: "/followers" },
  { id: "2", text: "Bob commented on your 'React Hooks' video.", time: "5h ago", read: false, href: "/content/some-video-id#comments" },
  { id: "3", text: "Your content 'Advanced CSS Grid' was approved.", time: "1d ago", read: true, href: "/content/css-grid-id" },
  { id: "4", text: "Charlie replied to your comment.", time: "3d ago", read: true, href: "/content/some-video-id#comment-reply-id"},
];

export default function Navbar() {
  const { user, signOutUser, loading, profile } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState(mockNotifications); // Using mock for now
  const unreadCount = notifications.filter(n => !n.read).length;

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

  const displayName = profile?.full_name || user?.displayName || user?.email?.split('@')[0] || "User";
  const avatarUrl = user?.photoURL || profile?.photoURL || undefined;

  const navLinks = user ? [
    { href: "/home", label: "Home", icon: Home },
    { href: "/upload", label: "Upload", icon: PlusCircle },
    { href: "/search", label: "Search", icon: Search },
    { href: "/chat", label: "Chat", icon: MailIcon }, // Changed to MailIcon for direct chat
  ] : [
    { href: "/login", label: "Sign In", icon: LogIn },
    { href: "/register", label: "Join Now", icon: UserPlus, variant: "default" as const },
  ];

  const userMenuItems = [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/followers", label: "Connections", icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const handleNotificationClick = (notificationId: string) => {
    // In a real app, you'd navigate and mark as read on the backend
    setNotifications(prev => prev.map(n => n.id === notificationId ? {...n, read: true} : n));
    // router.push(href); // if DropdownMenuItem had Link asChild
  };


  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/85 backdrop-blur-xl shadow-2xl supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={user ? "/home" : "/"} className="flex items-center space-x-2 group">
          <Briefcase className="h-7 w-7 text-accent group-hover:text-primary smooth-transition" />
          <span className="font-bold text-xl text-neon-accent group-hover:text-neon-primary smooth-transition">SkillForge</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted"></div>
          ) : user ? (
            <>
              {navLinks.slice(0,4).map(link => (
                 <Button variant="ghost" asChild key={link.href} size="sm">
                    <Link href={link.href} className="flex items-center text-sm">
                      <link.icon className="mr-1.5 h-4 w-4" /> {link.label}
                    </Link>
                  </Button>
              ))}

              {/* Notification Bell Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5"/>
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80 glass-card" align="end">
                  <DropdownMenuLabel className="flex justify-between items-center">
                    Notifications
                    {unreadCount > 0 && <span className="text-xs font-normal text-primary">({unreadCount} new)</span>}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                     <DropdownMenuItem disabled className="text-muted-foreground text-center py-4">No notifications yet.</DropdownMenuItem>
                  ): (
                    notifications.slice(0, 5).map(notification => ( // Show max 5
                      <DropdownMenuItem key={notification.id} onSelect={() => handleNotificationClick(notification.id)} className={`cursor-pointer ${!notification.read ? 'font-semibold' : ''}`}>
                        <Link href={notification.href || "#"} className="block w-full">
                            <p className="text-sm leading-tight truncate">{notification.text}</p>
                            <p className="text-xs text-muted-foreground">{notification.time}</p>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                  {notifications.length > 5 && (
                     <DropdownMenuItem asChild className="text-center text-primary hover:underline">
                        <Link href="/notifications">View all notifications</Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Profile Dropdown */}
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
        <div className="md:hidden flex items-center gap-1">
           {loading ? <div className="h-8 w-8 animate-pulse rounded-md bg-muted"></div> :
           <>
           {user && ( /* Show notification bell on mobile if user is logged in */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5"/>
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80 glass-card" align="end">
                   <DropdownMenuLabel className="flex justify-between items-center">Notifications {unreadCount > 0 && <span className="text-xs font-normal text-primary">({unreadCount} new)</span>}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                     <DropdownMenuItem disabled className="text-muted-foreground text-center py-4">No notifications yet.</DropdownMenuItem>
                  ): (
                    notifications.slice(0, 5).map(notification => (
                      <DropdownMenuItem key={notification.id} onSelect={() => handleNotificationClick(notification.id)} className={`cursor-pointer ${!notification.read ? 'font-semibold' : ''}`}>
                         <Link href={notification.href || "#"} className="block w-full">
                            <p className="text-sm leading-tight truncate">{notification.text}</p>
                            <p className="text-xs text-muted-foreground">{notification.time}</p>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                   {notifications.length > 5 && (
                     <DropdownMenuItem asChild className="text-center text-primary hover:underline">
                        <Link href="/notifications">View all notifications</Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
           <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] p-0 glass-card flex flex-col">
              <div className="p-4 border-b border-border">
                 <SheetClose asChild>
                    <Link href={user ? "/home" : "/"} className="flex items-center space-x-2 group">
                        <Briefcase className="h-6 w-6 text-accent group-hover:text-primary smooth-transition" />
                        <span className="font-bold text-lg text-neon-accent group-hover:text-neon-primary smooth-transition">SkillForge</span>
                    </Link>
                 </SheetClose>
              </div>
              <nav className="flex-grow p-4 space-y-2">
                {user ? (
                  <>
                    {navLinks.slice(0,4).map(link => (
                      <SheetClose asChild key={link.href}>
                        <Button variant="ghost" asChild className="w-full justify-start">
                            <Link href={link.href} className="flex items-center">
                            <link.icon className="mr-2 h-4 w-4" /> {link.label}
                            </Link>
                        </Button>
                      </SheetClose>
                    ))}
                     <DropdownMenuSeparator className="my-3"/>
                     <p className="px-2 text-xs text-muted-foreground">My Account</p>
                     {userMenuItems.map(item => (
                        <SheetClose asChild key={item.href}>
                            <Button variant="ghost" asChild className="w-full justify-start">
                                <Link href={item.href}>
                                <item.icon className="mr-2 h-4 w-4" /> {item.label}
                                </Link>
                            </Button>
                        </SheetClose>
                     ))}
                  </>
                ) : (
                  navLinks.map(link => (
                    <SheetClose asChild key={link.href}>
                        <Button variant={link.variant || "ghost"} asChild className={`w-full justify-start ${link.variant === "default" ? "bg-primary hover:bg-accent" : ""}`}>
                        <Link href={link.href} className="flex items-center">
                            <link.icon className="mr-2 h-4 w-4" /> {link.label}
                        </Link>
                        </Button>
                    </SheetClose>
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
                    <SheetClose asChild>
                        <Button variant="outline" className="w-full" onClick={signOutUser}>
                            <LogOut className="mr-2 h-4 w-4" /> Log out
                        </Button>
                    </SheetClose>
                </div>
              )}
            </SheetContent>
          </Sheet>
          </>
          }
        </div>
      </div>
    </header>
  );
}
