// src/app/page.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight, Brain, Share2, Users, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]"> {/* Adjust for navbar height */}
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center flex-grow text-center px-4 py-20 md:py-32 overflow-hidden">
        {/* Subtle animated gradient background */}
        <div className="absolute inset-0 -z-10 h-full w-full bg-background">
          <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:30px_30px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent -z-10"></div>


        <div className="relative z-10">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-pink-400">
            SkillForge
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto">
            Unlock Your Potential. Share Your Expertise.
            <br />
            Discover, Learn, and Teach on an AI-Enhanced Platform.
          </p>
          <div className="space-y-4 sm:space-y-0 sm:space-x-4">
            <Button size="lg" asChild className="bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all duration-300 ease-in-out hover:shadow-accent/40 transform hover:scale-105 shadow-lg shadow-primary/30 px-8 py-3 text-lg">
              <Link href="/register">
                Join Now <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="border-primary text-primary hover:bg-primary/10 transition-all duration-300 ease-in-out transform hover:scale-105 px-8 py-3 text-lg">
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
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-neon-primary">
            Why Choose SkillForge?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "AI-Powered Learning", description: "Content validation, AI-generated descriptions, and a personal chatbot tutor for every skill." },
              { icon: Share2, title: "Share & Discover", description: "Upload your expertise in video, audio, or text. Explore a vast library of skills from diverse creators." },
              { icon: Users, title: "Community Focused", description: "Connect with learners and tutors, engage in discussions, and grow together in a vibrant community." },
            ].map((feature, index) => (
              <Card key={index} className="glass-card hover:shadow-primary/30 smooth-transition transform hover:-translate-y-1">
                <CardHeader>
                  <div className="flex justify-center mb-4">
                    <feature.icon className="h-12 w-12 text-accent" />
                  </div>
                  <CardTitle className="text-center text-2xl text-foreground">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-muted-foreground text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Removed Featured Skills (Dummy Data) Section */}
      
    </div>
  );
}
