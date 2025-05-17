
// src/app/(main)/layout.tsx
"use client";

import { useAuth } from "@/hooks/use-auth"; 
import { useRouter, usePathname } from "next/navigation";
import React, { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react"; // For a more engaging loading icon

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      // This layout is for authenticated routes under /(main)
      // If user is not logged in and not loading, redirect to login
      // Avoid redirecting if already on a public auth page (though they shouldn't use this layout)
      if (pathname !== "/login" && pathname !== "/register" && pathname !== "/" && !pathname.startsWith("/forgot-password")) {
         router.push("/login");
      }
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="space-y-6 w-full max-w-lg p-8 glass-card rounded-xl">
            <div className="flex justify-center mb-4">
                <BarChart3 className="h-16 w-16 text-primary animate-pulse" />
            </div>
            <Skeleton className="h-10 w-full rounded-md bg-muted/50" />
            <Skeleton className="h-8 w-3/4 mx-auto rounded-md bg-muted/50" />
            <Skeleton className="h-24 w-full rounded-md bg-muted/40" />
            <Skeleton className="h-8 w-1/2 mx-auto rounded-md bg-muted/50" />
        </div>
        <p className="mt-6 text-lg text-muted-foreground animate-pulse">Loading your SkillForge experience...</p>
      </div>
    );
  }

  // If not loading and no user, and on a protected route, redirect logic in useEffect should handle it.
  // Return null here to prevent rendering children before redirect potentially happens, or if stuck.
  if (!user && (pathname !== "/login" && pathname !== "/register" && pathname !== "/" && !pathname.startsWith("/forgot-password"))) {
    return null; 
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </div>
  );
}
