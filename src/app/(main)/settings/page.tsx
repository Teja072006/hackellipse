
// src/app/(main)/settings/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Shield, Palette, UserCircle, Trash2, Save, Loader2, SettingsIcon } from "lucide-react"; // Added SettingsIcon
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth"; 
import { useState, useEffect, FormEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton"; // For loading state

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, profile, updateUserProfile, loading: authLoading, sendPasswordResetEmail: firebaseSendPasswordReset } = useAuth(); 
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [currentBio, setCurrentBio] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // States for notification preferences (example)
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [profileVisibility, setProfileVisibility] = useState(true); // true for public

  useEffect(() => {
    if (profile?.full_name) setDisplayName(profile.full_name);
    else if (user?.displayName) setDisplayName(user.displayName);
    else if (user?.email) setDisplayName(user.email.split('@')[0] || "User");

    if (user?.email) setEmail(user.email);
    if (profile?.description) setCurrentBio(profile.description);
    else setCurrentBio("");

    // Here you would typically fetch saved notification preferences from user's profile/settings document
    // For now, we use default values.
  }, [user, profile]);


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
        toast({title: "Error", description: "You must be logged in.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    
    const updates: Parameters<typeof updateUserProfile>[0] = {};
    if (displayName !== (profile?.full_name || user.displayName || "")) {
        updates.full_name = displayName;
    }
    if (currentBio !== (profile?.description || "")) {
        updates.description = currentBio;
    }
    // In a real app, you'd also save notification preferences:
    // updates.preferences = { emailNotifications, inAppNotifications, profileVisibility };

    if (Object.keys(updates).length > 0) {
        const { error } = await updateUserProfile(updates);
        if (error) {
            toast({ title: "Update Failed", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Settings Saved", description: "Your preferences have been updated on SkillForge." });
        }
    } else {
        toast({description: "No changes to save in account details."});
    }
    // Separate toast for notification preferences if they were hypothetically saved
    // toast({ title: "Notification Settings Saved" }); 

    setIsSubmitting(false);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
        toast({title: "Error", description: "No email address found for password reset.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true); // Use same spinner for this action
    await firebaseSendPasswordReset(); // Call from context which has email
    setIsSubmitting(false);
  }

  const isLoading = authLoading || isSubmitting;

  if (authLoading && !profile) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-3xl space-y-8">
        <Skeleton className="h-16 w-1/2 mb-8 rounded-lg bg-muted/50" />
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="glass-card">
            <CardHeader><Skeleton className="h-8 w-1/3 rounded bg-muted/50" /><Skeleton className="h-4 w-2/3 mt-2 rounded bg-muted/40" /></CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full rounded bg-muted/40" />
              <Skeleton className="h-10 w-full rounded bg-muted/40" />
            </CardContent>
          </Card>
        ))}
        <CardFooter className="border-t border-border/30 pt-6 bg-transparent">
            <Skeleton className="h-10 w-36 rounded-md bg-muted/50" />
        </CardFooter>
      </div>
    )
  }
   if (!user && !authLoading) {
     router.push("/login");
     return null;
   }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <Card className="glass-card shadow-2xl mb-8">
        <CardHeader className="items-center">
          <SettingsIcon className="h-12 w-12 text-accent mb-3" />
          <CardTitle className="text-3xl md:text-4xl font-bold text-neon-primary">Settings</CardTitle>
          <CardDescription className="text-lg text-muted-foreground mt-1">Manage your SkillForge account and application preferences.</CardDescription>
        </CardHeader>
      </Card>


      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Account Settings */}
        <Card className="glass-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center text-neon-accent"><UserCircle className="mr-2 h-5 w-5 text-accent" /> Account Details</CardTitle>
            <CardDescription>Update your personal information and account details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input 
                  id="displayName" 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  className="input-glow-focus mt-1" 
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={email} disabled className="input-glow-focus bg-muted/30 mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="currentBio">Short Bio (from Profile)</Label>
              <Textarea
                id="currentBio" 
                placeholder="Tell us about yourself..." 
                value={currentBio} 
                onChange={(e) => setCurrentBio(e.target.value)} 
                className="input-glow-focus mt-1 min-h-[100px]" 
                rows={3}
                disabled={isLoading}
              />
            </div>
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/10 hover:text-primary" type="button" onClick={handlePasswordReset} disabled={isLoading}>
                {isLoading && isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Send Password Reset Email
            </Button>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="glass-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center text-neon-accent"><Bell className="mr-2 h-5 w-5 text-accent" /> Notification Preferences</CardTitle>
            <CardDescription>Control how you receive notifications from SkillForge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/30">
              <Label htmlFor="emailNotifications" className="flex flex-col space-y-1 cursor-pointer">
                <span>Email Notifications</span>
                <span className="font-normal leading-snug text-muted-foreground text-sm">
                  Receive updates about new content and platform announcements.
                </span>
              </Label>
              <Switch id="emailNotifications" checked={emailNotifications} onCheckedChange={setEmailNotifications} disabled={isLoading}/>
            </div>
            <Separator className="bg-border/30"/>
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/30">
              <Label htmlFor="inAppNotifications" className="flex flex-col space-y-1 cursor-pointer">
                <span>In-App Notifications</span>
                <span className="font-normal leading-snug text-muted-foreground text-sm">
                  Get notified directly within the SkillForge platform.
                </span>
              </Label>
              <Switch id="inAppNotifications" checked={inAppNotifications} onCheckedChange={setInAppNotifications} disabled={isLoading}/>
            </div>
          </CardContent>
        </Card>

        {/* Privacy Settings */}
        <Card className="glass-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center text-neon-accent"><Shield className="mr-2 h-5 w-5 text-accent" /> Privacy &amp; Security</CardTitle>
            <CardDescription>Manage your data and account security.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/30">
              <Label htmlFor="profileVisibility" className="flex flex-col space-y-1 cursor-pointer">
                <span>Profile Visibility</span>
                <span className="font-normal leading-snug text-muted-foreground text-sm">
                  Control who can see your profile (Current: Public).
                </span>
              </Label>
              <Switch id="profileVisibility" checked={profileVisibility} onCheckedChange={setProfileVisibility} disabled={isLoading}/>
            </div>
            <Button variant="destructive" className="flex items-center w-full sm:w-auto" type="button" disabled={isLoading} onClick={() => toast({title: "Action Not Implemented", description: "Account deletion will be available in a future update.", variant: "default"})}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete Account
            </Button>
            <p className="text-xs text-muted-foreground">Note: Deleting your account is permanent and cannot be undone. This feature is currently under development.</p>
          </CardContent>
        </Card>
        
        <CardFooter className="border-t border-border/30 pt-6 bg-transparent">
            <Button type="submit" className="w-full md:w-auto bg-primary hover:bg-accent text-primary-foreground text-base py-2.5 px-6" disabled={isLoading}>
                {isLoading && isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Save className="mr-2 h-5 w-5" />} 
                Save All Settings
            </Button>
        </CardFooter>
      </form>
    </div>
  );
}
