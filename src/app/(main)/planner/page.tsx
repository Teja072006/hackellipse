
// src/app/(main)/planner/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Lightbulb, BookOpen, Search, Sparkles, AlertTriangle, CalendarDays, Tag, ListChecks, Globe, Check, X, Brain, HelpCircle, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateLearningPlan, type GenerateLearningPlanOutput, type LearningMilestone } from "@/ai/flows/generate-learning-plan-flow";
import { type QuizQuestion, type QuizQuestionWithResult } from "@/ai/schemas/quiz-schemas";
import { suggestQuizFeedbackFlowWrapper, type SuggestQuizFeedbackInput } from "@/ai/flows/suggest-quiz-feedback-flow";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function LearningPlannerPage() {
  const [skillName, setSkillName] = useState("");
  const [learningPlan, setLearningPlan] = useState<GenerateLearningPlanOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // State for quizzes within milestones
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState<number | null>(null);
  const [activeMilestoneQuiz, setActiveMilestoneQuiz] = useState<QuizQuestion[] | null>(null);
  const [activeMilestoneUserAnswers, setActiveMilestoneUserAnswers] = useState<Record<number, number>>({});
  const [activeMilestoneQuizScore, setActiveMilestoneQuizScore] = useState<number | null>(null);
  const [activeMilestoneQuizSubmitted, setActiveMilestoneQuizSubmitted] = useState(false);
  const [activeMilestoneAiFeedback, setActiveMilestoneAiFeedback] = useState<string | null>(null);
  const [isGeneratingMilestoneFeedback, setIsGeneratingMilestoneFeedback] = useState(false);


  const handleGeneratePlan = async () => {
    if (!skillName.trim()) {
      toast({ title: "Skill Name Required", description: "Please enter the skill you want to learn.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setError(null);
    setLearningPlan(null);
    resetActiveQuizStates(); // Reset quiz states when new plan is generated
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
    resetActiveQuizStates();
  };

  const resetActiveQuizStates = () => {
    setActiveMilestoneIndex(null);
    setActiveMilestoneQuiz(null);
    setActiveMilestoneUserAnswers({});
    setActiveMilestoneQuizScore(null);
    setActiveMilestoneQuizSubmitted(false);
    setActiveMilestoneAiFeedback(null);
    setIsGeneratingMilestoneFeedback(false);
  };

  const handleStartMilestoneQuiz = (milestoneIndex: number) => {
    if (learningPlan && learningPlan.milestones[milestoneIndex]?.quiz) {
      resetActiveQuizStates(); // Reset before starting a new quiz
      setActiveMilestoneIndex(milestoneIndex);
      setActiveMilestoneQuiz(learningPlan.milestones[milestoneIndex].quiz!);
    }
  };
  
  const handleActiveMilestoneAnswerChange = (questionIndex: number, answerIndex: number) => {
    setActiveMilestoneUserAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const handleSubmitActiveMilestoneQuiz = async () => {
    if (!activeMilestoneQuiz || activeMilestoneIndex === null || !learningPlan) return;

    let score = 0;
    const detailedResults: QuizQuestionWithResult[] = activeMilestoneQuiz.map((q, index) => {
      const isCorrect = activeMilestoneUserAnswers[index] === q.correctAnswerIndex;
      if (isCorrect) score++;
      return { ...q, userAnswerIndex: activeMilestoneUserAnswers[index], isCorrect };
    });

    setActiveMilestoneQuizScore(score);
    setActiveMilestoneQuizSubmitted(true);
    toast({ title: "Milestone Quiz Submitted!", description: `You scored ${score} out of ${activeMilestoneQuiz.length}.` });

    // Generate AI feedback if not all answers were correct
    if (score < activeMilestoneQuiz.length && activeMilestoneQuiz.length > 0) {
      setIsGeneratingMilestoneFeedback(true);
      setActiveMilestoneAiFeedback(null);
      try {
        const milestoneDescription = learningPlan.milestones[activeMilestoneIndex].description;
        const feedbackInput: SuggestQuizFeedbackInput = {
          contentText: milestoneDescription, // Use milestone description as context
          quizResults: detailedResults,
        };
        const feedbackResponse = await suggestQuizFeedbackFlowWrapper(feedbackInput);
        setActiveMilestoneAiFeedback(feedbackResponse.feedbackText);
      } catch (feedbackError: any) {
        console.error("Error generating milestone quiz feedback:", feedbackError);
        setActiveMilestoneAiFeedback("Sorry, I couldn't generate feedback for this quiz attempt. Error: " + feedbackError.message);
        toast({ title: "Feedback Generation Error", description: feedbackError.message || "Could not generate AI feedback.", variant: "destructive" });
      } finally {
        setIsGeneratingMilestoneFeedback(false);
      }
    } else if (score === activeMilestoneQuiz.length && activeMilestoneQuiz.length > 0) {
        setActiveMilestoneAiFeedback("Excellent! You got all questions correct for this milestone. Keep up the great work!");
        setIsGeneratingMilestoneFeedback(false);
    }
  };

  const handleClearMilestoneQuiz = () => {
    resetActiveQuizStates();
  }


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
                <Accordion type="single" collapsible className="w-full space-y-3" 
                  onValueChange={(value) => {
                    // If a milestone is collapsed, clear the active quiz if it was for that milestone
                    if (!value && activeMilestoneIndex !== null) {
                      // Check if the currently active quiz belongs to the collapsed milestone
                      // This logic might need adjustment based on how Accordion's value works (e.g., if it's item-X)
                      const collapsingMilestoneIndex = parseInt(value?.split('-')[1] ?? "-1", 10);
                      if (activeMilestoneIndex === collapsingMilestoneIndex) {
                         // Do nothing or reset if you want to clear quiz when accordion closes
                      }
                    } else if (value) {
                        // If a new milestone is opened, clear any active quiz from other milestones
                        const openingMilestoneIndex = parseInt(value.split('-')[1] ?? "-1", 10);
                        if (activeMilestoneIndex !== null && activeMilestoneIndex !== openingMilestoneIndex) {
                            resetActiveQuizStates();
                        }
                    }
                  }}
                >
                  {learningPlan.milestones.map((milestone, index) => (
                    <AccordionItem value={`item-${index}`} key={index} className="bg-muted/30 border border-border/50 rounded-lg shadow-md">
                      <AccordionTrigger className="text-lg font-medium text-foreground hover:text-primary hover:no-underline px-4 py-3">
                        {milestone.milestoneTitle}
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-4">
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
                        {milestone.externalResourceSuggestions && milestone.externalResourceSuggestions.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/30">
                            <p className="text-sm font-medium text-foreground/90 mb-1.5 flex items-center">
                                <Globe className="mr-2 h-4 w-4 text-primary/80"/> External Resource & Search Ideas:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                                {milestone.externalResourceSuggestions.map((suggestion, sgIndex) => (
                                    <li key={sgIndex}>{suggestion}</li>
                                ))}
                            </ul>
                          </div>
                        )}

                        {/* Milestone Quiz Section */}
                        {milestone.quiz && milestone.quiz.length > 0 && (
                          <Card className="mt-4 glass-card bg-background/40 border-primary/30">
                            <CardHeader>
                              <CardTitle className="text-md text-primary flex items-center"><HelpCircle className="mr-2 h-5 w-5"/>Milestone Quiz</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {activeMilestoneIndex === index && activeMilestoneQuizSubmitted ? (
                                // Quiz Results View
                                <div className="space-y-4">
                                  <h4 className="text-lg font-semibold text-primary text-center">
                                    Quiz Score: {activeMilestoneQuizScore} / {activeMilestoneQuiz?.length}
                                  </h4>
                                  <ScrollArea className="h-60 pr-2">
                                  <div className="space-y-3 text-left">
                                    {activeMilestoneQuiz?.map((q, qIndex) => (
                                      <div key={qIndex} className="p-2.5 rounded-md border bg-muted/30">
                                        <p className="font-semibold mb-1.5 text-sm">{qIndex + 1}. {q.questionText}</p>
                                        {q.options.map((opt, oIndex) => {
                                          const isCorrect = oIndex === q.correctAnswerIndex;
                                          const isUserChoice = activeMilestoneUserAnswers[qIndex] === oIndex;
                                          return (
                                            <div key={oIndex}
                                              className={`flex items-center space-x-2 p-1.5 rounded text-xs
                                                ${isCorrect ? "bg-green-500/15 text-green-300 border-green-500/40" : ""}
                                                ${isUserChoice && !isCorrect ? "bg-red-500/15 text-red-300 border-red-500/40" : ""}
                                                ${isUserChoice && isCorrect ? "border-2 border-green-400" : ""}`}
                                            >
                                              {isUserChoice && isCorrect ? <Check className="h-3 w-3 text-green-400"/> : isUserChoice && !isCorrect ? <X className="h-3 w-3 text-red-400"/> : <span className="w-3 h-3"></span>}
                                              <span>{opt}</span>
                                            </div>
                                          );
                                        })}
                                        {q.explanation && <p className="text-xs text-muted-foreground/80 mt-1.5 pt-1 border-t border-border/20">Explanation: {q.explanation}</p>}
                                      </div>
                                    ))}
                                  </div>
                                  </ScrollArea>
                                  {isGeneratingMilestoneFeedback && (
                                    <div className="flex items-center justify-center p-3 text-muted-foreground">
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> Generating personalized feedback...
                                    </div>
                                  )}
                                  {activeMilestoneAiFeedback && !isGeneratingMilestoneFeedback && (
                                    <Card className="mt-3 glass-card bg-accent/5 border-accent/30">
                                      <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm text-accent flex items-center"><Brain className="mr-2 h-4 w-4"/> AI Feedback</CardTitle></CardHeader>
                                      <CardContent className="pt-0 pb-3"><p className="whitespace-pre-wrap text-xs text-accent-foreground/80 leading-relaxed">{activeMilestoneAiFeedback}</p></CardContent>
                                    </Card>
                                  )}
                                  <Button onClick={handleClearMilestoneQuiz} variant="outline" size="sm" className="w-full mt-3">Retake Milestone Quiz</Button>
                                </div>
                              ) : activeMilestoneIndex === index && activeMilestoneQuiz ? (
                                // Quiz Taking View
                                <div className="space-y-3">
                                  <ScrollArea className="h-60 pr-2">
                                  {activeMilestoneQuiz.map((q, qIndex) => (
                                    <div key={qIndex} className="mb-3 p-2.5 rounded-md border border-border/30 bg-muted/10">
                                      <Label className="font-semibold block mb-1.5 text-sm">{qIndex + 1}. {q.questionText}</Label>
                                      <RadioGroup onValueChange={(value) => handleActiveMilestoneAnswerChange(qIndex, parseInt(value))} value={activeMilestoneUserAnswers[qIndex]?.toString()}>
                                        {q.options.map((option, oIndex) => (
                                          <div key={oIndex} className="flex items-center space-x-2 hover:bg-primary/5 p-1 rounded-md">
                                            <RadioGroupItem value={oIndex.toString()} id={`m${index}-q${qIndex}-o${oIndex}`} />
                                            <Label htmlFor={`m${index}-q${qIndex}-o${oIndex}`} className="font-normal cursor-pointer text-xs">{option}</Label>
                                          </div>
                                        ))}
                                      </RadioGroup>
                                    </div>
                                  ))}
                                  </ScrollArea>
                                  <Button onClick={handleSubmitActiveMilestoneQuiz} size="sm" className="w-full bg-primary hover:bg-accent mt-3">
                                    <Send className="mr-2 h-4 w-4" /> Submit Milestone Quiz
                                  </Button>
                                </div>
                              ) : (
                                // Initial "Take Quiz" button
                                <Button onClick={() => handleStartMilestoneQuiz(index)} size="sm" variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                                  Take Milestone Quiz ({milestone.quiz.length} Questions)
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        )}
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

