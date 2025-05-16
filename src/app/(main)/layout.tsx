// src/app/(main)/layout.tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname } from "next/navigation";
import React, { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      // Only redirect if not already on a public-ish page like /login, /register, /
      // to prevent redirect loops if those pages also use this layout (though they shouldn't)
      // This layout is for / (main) routes.
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

  if (!user) {
    // If still no user after loading, and on a protected route, router.push handled it.
    // If on a page that manually checks user and this layout is used (should not happen often),
    // this prevents rendering children.
    return null; 
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </div>
  );
}
