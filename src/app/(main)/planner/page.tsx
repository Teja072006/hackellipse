
// src/app/(main)/planner/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Lightbulb, BookOpen, Search, Sparkles, AlertTriangle, CalendarDays, Tag, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateLearningPlan, type GenerateLearningPlanOutput, type LearningMilestone } from "@/ai/flows/generate-learning-plan-flow";
import { Separator } from "@/components/ui/separator";

export default function LearningPlannerPage() {
  const [skillName, setSkillName] = useState("");
  const [learningPlan, setLearningPlan] = useState<GenerateLearningPlanOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGeneratePlan = async () => {
    if (!skillName.trim()) {
      toast({ title: "Skill Name Required", description: "Please enter the skill you want to learn.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setError(null);
    setLearningPlan(null);
    try {
      const plan = await generateLearningPlan({ skillName });
      setLearningPlan(plan);
      toast({ title: "Learning Plan Generated!", description: `Your plan for "${plan.skillToLearn}" is ready.` });
    } catch (err: any) {
      console.error("Error generating learning plan:", err);
      const errorMessage = err.message || "An unknown error occurred while generating the plan.";
      setError(errorMessage);
      toast({ title: "Plan Generation Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    setSkillName("");
    setLearningPlan(null);
    setError(null);
    setIsLoading(false);
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl space-y-8">
      <Card className="glass-card shadow-2xl">
        <CardHeader className="items-center text-center">
          <BookOpen className="h-12 w-12 text-accent mb-3" />
          <CardTitle className="text-3xl md:text-4xl font-bold text-neon-primary">AI Learning Planner</CardTitle>
          <CardDescription className="text-lg text-muted-foreground mt-1">
            Enter a skill you want to master, and let SkillForge AI chart your learning journey!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!learningPlan ? (
            <>
              <div className="space-y-2">
                <label htmlFor="skillName" className="text-lg font-medium text-foreground">
                  What skill do you want to learn?
                </label>
                <Input
                  id="skillName"
                  placeholder="e.g., 'React Native development', 'Advanced Public Speaking'"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="input-glow-focus text-base py-3"
                  disabled={isLoading}
                />
              </div>
              <Button onClick={handleGeneratePlan} disabled={isLoading || !skillName.trim()} className="w-full bg-primary hover:bg-accent text-lg py-3">
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-5 w-5" />
                )}
                Generate Learning Plan
              </Button>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5"/> {error}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="text-center p-4 rounded-lg bg-accent/10 border border-accent/50">
                <h2 className="text-2xl font-semibold text-neon-accent mb-1">{learningPlan.planTitle}</h2>
                <p className="text-sm text-accent-foreground/90">For Skill: {learningPlan.skillToLearn}</p>
              </div>

              <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center text-foreground"><Lightbulb className="mr-2 h-5 w-5 text-primary"/> Plan Overview</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{learningPlan.overview}</p>
                </CardContent>
              </Card>
              
              <Separator />

              <div>
                <h3 className="text-xl font-semibold text-foreground mb-3 flex items-center"><ListChecks className="mr-2 h-5 w-5 text-primary"/> Learning Milestones</h3>
                <Accordion type="single" collapsible className="w-full space-y-2">
                  {learningPlan.milestones.map((milestone, index) => (
                    <AccordionItem value={`item-${index}`} key={index} className="bg-muted/30 border-border/50 rounded-lg px-1">
                      <AccordionTrigger className="text-lg font-medium text-foreground hover:text-primary hover:no-underline px-4 py-3">
                        {milestone.milestoneTitle}
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-3">
                        <p className="text-muted-foreground leading-relaxed">{milestone.description}</p>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <CalendarDays className="mr-2 h-4 w-4 text-primary/80" />
                          Estimated Duration: <span className="font-medium text-foreground/90 ml-1">{milestone.estimatedDuration}</span>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground/90 mb-1.5 flex items-center">
                                <Search className="mr-2 h-4 w-4 text-primary/80"/> Suggested Keywords for SkillForge Search:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {milestone.suggestedSearchKeywords.map((keyword, kwIndex) => (
                                    <span key={kwIndex} className="px-2.5 py-1 text-xs rounded-full bg-secondary text-secondary-foreground shadow-sm flex items-center">
                                      <Tag className="mr-1.5 h-3 w-3"/> {keyword}
                                    </span>
                                ))}
                            </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
              <Button onClick={handleStartOver} variant="outline" className="w-full border-primary text-primary hover:bg-primary/10 mt-6">
                Plan Another Skill
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
