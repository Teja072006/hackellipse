
// src/app/(main)/layout.tsx
"use client";

import { useAuth } from "@/hooks/use-auth"; // Firebase version
import { useRouter, usePathname } from "next/navigation";
import React, { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      // This layout is for authenticated routes under /(main)
      // If user is not logged in and not loading, redirect to login
      // Avoid redirecting if already on a public auth page (though they shouldn't use this layout)
      if (pathname !== "/login" && pathname !== "/register" && pathname !== "/") {
         router.push("/login");
      }
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="space-y-4 w-full max-w-md p-8">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-1/2" />
        </div>
        <p className="text-lg text-muted-foreground">Loading your SkillForge experience...</p>
      </div>
    );
  }

  if (!user && (pathname.startsWith("/(main)") || pathname === "/home" || pathname === "/profile" || pathname === "/upload" || pathname === "/search" || pathname === "/chat" || pathname === "/followers" || pathname === "/settings")) {
    // Explicitly return null if not loading, no user, and on a protected route
    // The useEffect above should have initiated redirect.
    return null; 
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </div>
  );
}
