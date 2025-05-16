
// src/app/(main)/settings/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Shield, Palette, UserCircle, Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth"; 
import { useState, useEffect, FormEvent } from "react";
import { Textarea } from "@/components/ui/textarea";

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, profile, updateUserProfile, loading: authLoading, sendPasswordReset } = useAuth(); 
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [currentBio, setCurrentBio] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (profile?.full_name) setDisplayName(profile.full_name);
    else if (user?.displayName) setDisplayName(user.displayName);
    else if (user?.email) setDisplayName(user.email.split('@')[0]);

    if (user?.email) setEmail(user.email);
    if (profile?.description) setCurrentBio(profile.description);
    else setCurrentBio("");
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

    if (Object.keys(updates).length > 0) {
        const { error } = await updateUserProfile(updates);
        if (error) {
            toast({ title: "Update Failed", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Settings Saved", description: "Your preferences have been updated on SkillForge." });
        }
    } else {
        toast({description: "No changes to save."});
    }
    setIsSubmitting(false);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
        toast({title: "Error", description: "No email address found for password reset.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    await sendPasswordReset(user.email); // Toast messages handled within sendPasswordReset
    setIsSubmitting(false);
  }

  const isLoading = authLoading || isSubmitting;

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-neon-primary">Settings</h1>
        <p className="text-lg text-muted-foreground mt-1">Manage your SkillForge account and application preferences.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Account Settings */}
        <Card className="bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center"><UserCircle className="mr-2 h-5 w-5 text-primary" /> Account Settings</CardTitle>
            <CardDescription>Update your personal information and account details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input 
                  id="displayName" 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  className="input-glow-focus" 
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={email} disabled className="input-glow-focus bg-muted/50" />
              </div>
            </div>
            <div>
              <Label htmlFor="currentBio">Short Bio (from Profile)</Label>
              <Textarea
                id="currentBio" 
                placeholder="Tell us about yourself..." 
                value={currentBio} 
                onChange={(e) => setCurrentBio(e.target.value)} 
                className="input-glow-focus" 
                rows={3}
                disabled={isLoading}
              />
            </div>
            <Button variant="outline" className="hover:border-primary hover:text-primary" type="button" onClick={handlePasswordReset} disabled={isLoading || !user?.email}>
                {isLoading && isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Change Password
            </Button>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center"><Bell className="mr-2 h-5 w-5 text-primary" /> Notification Preferences</CardTitle>
            <CardDescription>Control how you receive notifications from SkillForge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="emailNotifications" className="flex flex-col space-y-1">
                <span>Email Notifications</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Receive updates about new content and platform announcements.
                </span>
              </Label>
              <Switch id="emailNotifications" defaultChecked disabled={isLoading}/>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="inAppNotifications" className="flex flex-col space-y-1">
                <span>In-App Notifications</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Get notified directly within the SkillForge platform.
                </span>
              </Label>
              <Switch id="inAppNotifications" defaultChecked disabled={isLoading}/>
            </div>
          </CardContent>
        </Card>

        {/* Privacy Settings */}
        <Card className="bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center"><Shield className="mr-2 h-5 w-5 text-primary" /> Privacy &amp; Security</CardTitle>
            <CardDescription>Manage your data and account security.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="profileVisibility" className="flex flex-col space-y-1">
                <span>Profile Visibility</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Control who can see your profile (Public / Followers Only - option coming soon).
                </span>
              </Label>
              <Switch id="profileVisibility" defaultChecked disabled={isLoading}/>
            </div>
            <Button variant="destructive" className="flex items-center" type="button" disabled={isLoading}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete Account
            </Button>
            <p className="text-xs text-muted-foreground">Deleting your account is permanent and cannot be undone.</p>
          </CardContent>
        </Card>
        
        <CardFooter className="border-t border-border pt-6 bg-card">
            <Button type="submit" className="w-full md:w-auto bg-primary hover:bg-accent text-primary-foreground" disabled={isLoading}>
                {isLoading && isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />} 
                Save Account Settings
            </Button>
        </CardFooter>
      </form>
    </div>
  );
}
