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
import { Chrome } from "lucide-react"; 
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Schema for form validation.
const formSchema = z.object({
  full_name: z.string().min(2, { message: "Full name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string().min(6, { message: "Password must be at least 6 characters." }),
  age: z.string().optional().refine(val => {
    if (val === undefined || val.trim() === '') return true; // Optional
    const num = Number(val);
    return !isNaN(num) && num > 0 && Number.isInteger(num);
  }, { message: "Age must be a positive whole number if provided."}),
  gender: z.string().optional(),
  skills: z.string().optional().describe("Comma separated skills e.g., React,NodeJS,AI"),
  linkedin_url: z.string().url({ message: "Invalid LinkedIn URL" }).optional().or(z.literal('')),
  description: z.string().max(1000, { message: "Description too long (max 1000 chars)" }).optional(),
  resume_path: z.string().optional(), // Placeholder for future file upload path
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignUpFormDataForForm = z.infer<typeof formSchema>;

export function RegisterForm() {
  const { user, signUp, signInWithGoogle, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.push("/home");
    }
  }, [user, loading, router]);

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
      description: "",
      resume_path: "",
    },
  });

  async function onSubmit(values: SignUpFormDataForForm) {
    const { email, password, confirmPassword, ...profileDataFromForm } = values;
  
    await signUp({
      email,
      password,
      data: { // This matches SignUpProfileDataFromForm in auth-context
        full_name: profileDataFromForm.full_name,
        age: profileDataFromForm.age || undefined, // Pass as string or undefined
        gender: profileDataFromForm.gender || undefined,
        skills: profileDataFromForm.skills || undefined, // Pass as comma-separated string or undefined
        linkedin_url: profileDataFromForm.linkedin_url || undefined,
        description: profileDataFromForm.description || undefined,
        resume_path: profileDataFromForm.resume_path || undefined,
      },
    });
    // Navigation and toasts handled by auth-context
  }
  
  async function handleGoogleSignIn() {
    await signInWithGoogle();
    // Navigation and toasts handled by auth-context
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl bg-card my-8">
      <CardHeader>
        <CardTitle className="text-3xl font-bold text-center text-neon-primary">Create Account</CardTitle>
        <CardDescription className="text-center">
          Join SkillForge today or{" "}
          <Button variant="link" asChild className="p-0 text-primary hover:text-accent"><Link href="/login">sign in</Link></Button>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Full Name" {...field} className="input-glow-focus" />
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
                      <Input placeholder="you@example.com" {...field} className="input-glow-focus" />
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
                      <Input type="password" placeholder="••••••••" {...field} className="input-glow-focus" />
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
                      <Input type="password" placeholder="••••••••" {...field} className="input-glow-focus" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <h3 className="text-lg font-semibold pt-4 border-t border-border">Optional Profile Details</h3>
            
            <div className="grid md:grid-cols-2 gap-6">
               <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input 
                        type="text" 
                        placeholder="Your Age (e.g., 25)" 
                        {...field}
                        value={field.value ?? ""} 
                        className="input-glow-focus" 
                      />
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
                      <Input placeholder="Your Gender" {...field} value={field.value ?? ""} className="input-glow-focus" />
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
                      <Input placeholder="e.g., React, Python, AI" {...field} value={field.value ?? ""} className="input-glow-focus" />
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
                      <Input placeholder="https://linkedin.com/in/yourprofile" {...field} value={field.value ?? ""} className="input-glow-focus" />
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Tell us a bit about yourself..." {...field} value={field.value ?? ""} className="input-glow-focus" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* resume_path might be handled by a file upload component later, so input is just a placeholder for now if needed */}
               {/* <FormField
                control={form.control}
                name="resume_path"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Resume Path (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Path to resume (e.g., if uploaded elsewhere)" {...field} value={field.value ?? ""} className="input-glow-focus" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              /> */}
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all" disabled={loading}>
              {loading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </Form>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              Or sign up with
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <Button variant="outline" onClick={handleGoogleSignIn} disabled={loading} className="border-input hover:border-primary hover:bg-primary/10">
            <Chrome className="mr-2 h-4 w-4" /> Google
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
