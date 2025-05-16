// src/app/(main)/settings/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Shield, Palette, UserCircle, Trash2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth"; // Import useAuth
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, profile } = useAuth(); // Get user and profile from useAuth
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState(""); // Assuming bio might be part of UserProfile later

  useEffect(() => {
    if (profile?.full_name) {
      setDisplayName(profile.full_name);
    } else if (user?.email) {
      setDisplayName(user.email.split('@')[0]); // Fallback to email part
    }
    if (user?.email) {
      setEmail(user.email);
    }
    // if (profile?.description) setBio(profile.description); // If bio is part of UserProfile
  }, [user, profile]);


  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Handle form submission logic here (e.g., call updateUserProfile from useAuth)
    // For now, just show a toast
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated on SkillForge.",
    });
  };

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
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={email} disabled className="input-glow-focus" />
              </div>
            </div>
            <div>
              <Label htmlFor="bio">Short Bio</Label>
              <Input 
                id="bio" 
                placeholder="Tell us about yourself (e.g., from profile description)" 
                value={bio} 
                onChange={(e) => setBio(e.target.value)} 
                className="input-glow-focus" 
              />
            </div>
            <Button variant="outline" className="hover:border-primary hover:text-primary">Change Password</Button>
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
              <Switch id="emailNotifications" defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="inAppNotifications" className="flex flex-col space-y-1">
                <span>In-App Notifications</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Get notified directly within the SkillForge platform.
                </span>
              </Label>
              <Switch id="inAppNotifications" defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Appearance Settings - Basic Placeholder */}
        <Card className="bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center"><Palette className="mr-2 h-5 w-5 text-primary" /> Appearance</CardTitle>
            <CardDescription>Customize the look and feel of SkillForge (Theme options coming soon).</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Currently using Dark Theme. More theme options will be available in the future.</p>
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
              <Switch id="profileVisibility" defaultChecked />
            </div>
            <Button variant="outline" className="hover:border-primary hover:text-primary">Manage Connected Apps</Button>
            <Button variant="destructive" className="flex items-center">
              <Trash2 className="mr-2 h-4 w-4" /> Delete Account
            </Button>
            <p className="text-xs text-muted-foreground">Deleting your account is permanent and cannot be undone.</p>
          </CardContent>
        </Card>
        
        <CardFooter className="border-t border-border pt-6 bg-card">
            <Button type="submit" className="w-full md:w-auto bg-primary hover:bg-accent text-primary-foreground">
                <Save className="mr-2 h-4 w-4" /> Save All Settings
            </Button>
        </CardFooter>
      </form>
    </div>
  );
}
