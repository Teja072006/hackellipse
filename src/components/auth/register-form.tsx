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
import { toast } from "@/hooks/use-toast";
import { Github, Chrome } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string().min(6, { message: "Password must be at least 6 characters." }),
  // Optional fields based on prompt
  age: z.coerce.number().optional(),
  gender: z.string().optional(),
  skills: z.string().optional().describe("Comma separated tags e.g., React,NodeJS,AI"),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().max(500).optional(),
  achievements: z.string().max(500).optional(),
  resume: z.instanceof(File).optional().nullable(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export function RegisterForm() {
  const { signUp, signInWithGoogle, signInWithGitHub, loading } = useAuth();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      age: '' as unknown as number, // Changed undefined to empty string to prevent uncontrolled input error
      gender: "",
      skills: "",
      linkedinUrl: "",
      githubUrl: "",
      description: "",
      achievements: "",
      resume: null,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await signUp(values.email, values.password, values.name);
      // Here you would typically also save other profile info (values.age, values.skills etc.) to your DB
      console.log("Profile data to save:", values);
      toast({ title: "Registration Successful", description: "Welcome to SkillSmith!" });
      router.push("/home");
    } catch (error: any) {
      toast({ title: "Registration Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    }
  }
  
  async function handleGoogleSignIn() {
    try {
      await signInWithGoogle();
      toast({ title: "Sign Up Successful", description: "Welcome!" });
      router.push("/home");
    } catch (error: any) {
      toast({ title: "Google Sign-Up Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    }
  }

  async function handleGitHubSignIn() {
    try {
      await signInWithGitHub();
      toast({ title: "Sign Up Successful", description: "Welcome!" });
      router.push("/home");
    } catch (error: any) {
      toast({ title: "GitHub Sign-Up Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    }
  }


  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl bg-card my-8">
      <CardHeader>
        <CardTitle className="text-3xl font-bold text-center text-neon-primary">Create Account</CardTitle>
        <CardDescription className="text-center">
          Join SkillSmith today or{" "}
          <Button variant="link" asChild className="p-0 text-primary hover:text-accent"><Link href="/login">sign in</Link></Button>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Name" {...field} className="input-glow-focus" />
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
                      <Input type="number" placeholder="Your Age" {...field} onChange={e => field.onChange(e.target.value === '' ? '' : parseInt(e.target.value,10))} value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value} className="input-glow-focus" />
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
                      <Input placeholder="Your Gender" {...field} className="input-glow-focus" />
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
                      <Input placeholder="e.g., React, Python, AI" {...field} className="input-glow-focus" />
                    </FormControl>
                    <FormDescription>Comma-separated list of your skills.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="linkedinUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://linkedin.com/in/yourprofile" {...field} className="input-glow-focus" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="githubUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://github.com/yourusername" {...field} className="input-glow-focus" />
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
                      <Textarea placeholder="Tell us a bit about yourself..." {...field} className="input-glow-focus" />
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
                    <FormLabel>Achievements</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Your key achievements..." {...field} className="input-glow-focus" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="resume"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Resume (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="file" 
                        accept=".pdf,.doc,.docx" 
                        onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)} 
                        className="input-glow-focus file:text-primary file:font-semibold file:mr-2"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
        <div className="grid grid-cols-2 gap-4">
          <Button variant="outline" onClick={handleGoogleSignIn} disabled={loading} className="border-input hover:border-primary hover:bg-primary/10">
            <Chrome className="mr-2 h-4 w-4" /> Google
          </Button>
          <Button variant="outline" onClick={handleGitHubSignIn} disabled={loading} className="border-input hover:border-primary hover:bg-primary/10">
            <Github className="mr-2 h-4 w-4" /> GitHub
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

