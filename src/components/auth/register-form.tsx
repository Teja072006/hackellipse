// src/components/auth/register-form.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserPlus, Mail, Lock, Briefcase, CalendarDays, UsersIcon as GenderIcon, Zap, Linkedin, Github, Info, Award } from "lucide-react"; // Added more icons

const formSchema = z.object({
  full_name: z.string().min(2, { message: "Full name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string().min(6, { message: "Password must be at least 6 characters." }),
  age: z.string().optional().refine(val => {
    if (val === undefined || val.trim() === '') return true;
    const num = Number(val);
    return !isNaN(num) && num > 0 && Number.isInteger(num);
  }, { message: "Age must be a positive whole number if provided."}).nullable(),
  gender: z.string().optional().nullable(),
  skills: z.string().optional().nullable().describe("Comma separated skills e.g., React,NodeJS,AI"),
  linkedin_url: z.string().url({ message: "Invalid LinkedIn URL" }).optional().or(z.literal('')).nullable(),
  github_url: z.string().url({ message: "Invalid GitHub URL" }).optional().or(z.literal('')).nullable(),
  description: z.string().max(1000, { message: "Description too long (max 1000 chars)" }).optional().nullable(),
  achievements: z.string().max(1000, {message: "Achievements too long (max 1000 chars)"}).optional().nullable(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignUpFormDataForForm = z.infer<typeof formSchema>;

export function RegisterForm() {
  const { user, signUp, loading: authLoading } = useAuth();
  const router = useRouter();
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      router.push("/home");
    }
  }, [user, authLoading, router]);

  const form = useForm<SignUpFormDataForForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      confirmPassword: "",
      age: "",
      gender: "",
      skills: "",
      linkedin_url: "",
      github_url: "",
      description: "",
      achievements: "",
    },
  });

  async function onSubmit(values: SignUpFormDataForForm) {
    setFormSubmitting(true);
    const { confirmPassword, ...dataToSubmit } = values; // Exclude confirmPassword
    
    await signUp({
      email: dataToSubmit.email,
      password: dataToSubmit.password,
      profileData: { // Pass profile data separately as per AuthContext
        full_name: dataToSubmit.full_name,
        age: dataToSubmit.age || null,
        gender: dataToSubmit.gender || null,
        skills: dataToSubmit.skills || null,
        linkedin_url: dataToSubmit.linkedin_url || null,
        github_url: dataToSubmit.github_url || null,
        description: dataToSubmit.description || null,
        achievements: dataToSubmit.achievements || null,
      },
    });
    setFormSubmitting(false); 
  }
  
  const isLoading = authLoading || formSubmitting;

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl glass-card my-8"> {/* Added glass-card */}
      <CardHeader>
        <CardTitle className="text-3xl font-bold text-center text-neon-primary flex items-center justify-center">
          <UserPlus className="mr-3 h-8 w-8"/> Create Your SkillForge Account
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          Already have an account?{" "}
          <Button variant="link" asChild className="p-0 text-primary hover:text-accent"><Link href="/login">Sign in here</Link></Button>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Required Account Info Section */}
            <div className="pb-4 mb-4 border-b border-border/50">
                <h3 className="text-lg font-semibold text-foreground mb-3">Account Information</h3>
                <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
                <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Your Full Name" {...field} className="pl-10 input-glow-focus" disabled={isLoading}/>
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
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
                <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
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
                </div>
            </div>
            
            {/* Optional Profile Details Section */}
            <div className="pt-4">
                <h3 className="text-lg font-semibold text-foreground mb-3">Optional Profile Details</h3>
                <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
                <FormField
                    control={form.control}
                    name="age"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Age</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                type="text" // Keep as text for optional input, validation handles number check
                                placeholder="Your Age (e.g., 25)" 
                                {...field}
                                value={field.value ?? ""} 
                                className="pl-10 input-glow-focus" 
                                disabled={isLoading}
                            />
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <GenderIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Your Gender" {...field} value={field.value ?? ""} className="pl-10 input-glow-focus" disabled={isLoading}/>
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="skills"
                    render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <FormLabel>Skills</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="e.g., React, Python, AI" {...field} value={field.value ?? ""} className="pl-10 input-glow-focus" disabled={isLoading}/>
                        </div>
                        </FormControl>
                        <FormDescription>Comma-separated list of your skills.</FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="linkedin_url"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>LinkedIn URL</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="https://linkedin.com/in/yourprofile" {...field} value={field.value ?? ""} className="pl-10 input-glow-focus" disabled={isLoading}/>
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="github_url"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>GitHub URL</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="https://github.com/yourusername" {...field} value={field.value ?? ""} className="pl-10 input-glow-focus" disabled={isLoading}/>
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <FormLabel>Description (About Me)</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <Info className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Textarea placeholder="Tell us a bit about yourself..." {...field} value={field.value ?? ""} className="pl-10 input-glow-focus" rows={3} disabled={isLoading}/>
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="achievements"
                    render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <FormLabel>Achievements (Optional)</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <Award className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Textarea placeholder="Any achievements you'd like to share..." {...field} value={field.value ?? ""} className="pl-10 input-glow-focus" rows={3} disabled={isLoading}/>
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground smooth-transition text-lg py-3" disabled={isLoading}>
              {isLoading ? "Creating Account..." : "Create Account & Start Learning"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
