// src/app/login/page.tsx
"use client";

import { LoginForm } from "@/components/auth/login-form";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";


export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/home"); // Or your desired dashboard/home page
    }
  }, [user, loading, router]);

  if (loading || (!loading && user)) { // Show loading or nothing if redirecting
    return (
       <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="space-y-4 w-full max-w-md p-8">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-1/2" />
        </div>
        <p className="text-lg text-muted-foreground">Loading SkillForge...</p>
      </div>
    );
  }


  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] py-12 px-4">
      <LoginForm />
    </div>
  );
}
