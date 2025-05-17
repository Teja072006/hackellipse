// src/components/auth/login-form.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Mail, Lock } from "lucide-react"; // Added Lock icon

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export function LoginForm() {
  const { user, signIn, loading: authLoading } = useAuth();
  const router = useRouter();
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      router.push("/home");
    }
  }, [user, authLoading, router]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setFormSubmitting(true);
    await signIn({ email: values.email, password: values.password });
    setFormSubmitting(false);
  }

  const isLoading = authLoading || formSubmitting;

  return (
    <Card className="w-full max-w-md mx-auto glass-card"> {/* Added glass-card */}
      <CardHeader>
        <CardTitle className="text-3xl font-bold text-center text-neon-primary">Welcome Back to SkillForge</CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          Sign in to continue your learning journey or{" "}
          <Button variant="link" asChild className="p-0 text-primary hover:text-accent"><Link href="/register">create an account</Link></Button>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="you@example.com" {...field} className="pl-10 input-glow-focus" disabled={isLoading}/>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                     <div className="relative">
                       <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                       <Input type="password" placeholder="••••••••" {...field} className="pl-10 input-glow-focus" disabled={isLoading}/>
                     </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground smooth-transition text-base py-3" disabled={isLoading}>
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>
        </Form>
        <div className="mt-4 text-right">
          <Button variant="link" asChild className="p-0 text-sm text-muted-foreground hover:text-primary">
            <Link href="/forgot-password">Forgot Password?</Link>
          </Button>
        </div>
        
        {/* Google Sign-In Button is removed as per previous request */}

      </CardContent>
    </Card>
  );
}
