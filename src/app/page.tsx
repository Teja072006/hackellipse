// src/app/page.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight, Brain, Share2, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]"> {/* Adjust for navbar height */}
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center flex-grow text-center px-4 py-16 md:py-24 bg-gradient-to-br from-background via-slate-900 to-background">
        <div className="absolute inset-0 opacity-10 bg-[url('https://placehold.co/1920x1080/000000/4DC0B5.png&text=Abstract+Network')] bg-cover bg-center" data-ai-hint="abstract network"></div>
        <div className="relative z-10">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-6">
            <span className="text-neon-accent">SkillForge</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Share Your Knowledge, Empower Others.
            <br />
            Discover, Learn, and Teach on an AI-Powered Platform.
          </p>
          <div className="space-x-4">
            <Button size="lg" asChild className="bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all duration-300 transform hover:scale-105 shadow-lg shadow-primary/30">
              <Link href="/register">
                Join Now <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="border-primary text-primary hover:bg-primary/10 transition-all duration-300 transform hover:scale-105">
              <Link href="/search">
                Explore Content
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-neon-primary">
            Why SkillForge?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-card shadow-xl hover:shadow-primary/20 transition-shadow duration-300">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <Brain className="h-12 w-12 text-primary" />
                </div>
                <CardTitle className="text-center text-2xl">AI-Powered Learning</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-muted-foreground">
                  Content validation, AI-generated descriptions, and a personal chatbot tutor for every skill.
                </CardDescription>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-xl hover:shadow-primary/20 transition-shadow duration-300">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <Share2 className="h-12 w-12 text-primary" />
                </div>
                <CardTitle className="text-center text-2xl">Share &amp; Discover</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-muted-foreground">
                  Upload your expertise in video, audio, or text. Explore a vast library of skills from diverse creators.
                </CardDescription>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-xl hover:shadow-primary/20 transition-shadow duration-300">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <Users className="h-12 w-12 text-primary" />
                </div>
                <CardTitle className="text-center text-2xl">Community Focused</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-muted-foreground">
                  Connect with learners and tutors, engage in discussions, and grow together.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Featured Content Placeholder Section */}
      <section className="py-16 md:py-24 bg-slate-900">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-neon-accent">
            Featured Skills
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((item) => (
              <Card key={item} className="bg-card shadow-lg overflow-hidden group">
                <Image 
                  src={`https://placehold.co/600x400.png?random=${item}`} 
                  alt={`Featured Skill ${item}`} 
                  width={600} 
                  height={400} 
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                  data-ai-hint="technology code"
                />
                <CardHeader>
                  <CardTitle className="text-xl">Awesome Skill #{item}</CardTitle>
                  <CardDescription className="text-muted-foreground">By Expert Creator {item}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="link" asChild className="text-primary p-0">
                    <Link href="/search">Learn More <ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
