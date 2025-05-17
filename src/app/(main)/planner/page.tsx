// src/app/(main)/planner/page.tsx
"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Lightbulb, BookOpen, Search, Sparkles, AlertTriangle, CalendarDays, Tag, ListChecks, Globe, Check, X, Brain, HelpCircle, Send, Download, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateLearningPlan, type GenerateLearningPlanOutput, type LearningMilestone } from "@/ai/flows/generate-learning-plan-flow";
import { type QuizQuestion } from "@/ai/schemas/quiz-schemas";
import { suggestQuizFeedbackFlowWrapper, type SuggestQuizFeedbackInput, type QuizQuestionWithResult } from "@/ai/flows/suggest-quiz-feedback-flow";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";


// Interface for quiz attempts (local state only for current session)
interface LocalQuizAttempt {
  score: number;
  totalQuestions: number;
  feedback: string | null;
  attemptedAt: Date; // Using client-side Date for local state
}

export default function LearningPlannerPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [skillName, setSkillName] = useState("");
  const [learningPlan, setLearningPlan] = useState<GenerateLearningPlanOutput | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for handling quizzes within milestones (client-side only per session)
  const [activeMilestoneQuiz, setActiveMilestoneQuiz] = useState<{
    milestoneIndex: number;
    questions: QuizQuestion[];
    userAnswers: Record<number, number>;
    submitted: boolean;
    latestAttempt: LocalQuizAttempt | null;
    isGeneratingFeedback: boolean;
  } | null>(null);


  const handleGeneratePlan = useCallback(async () => {
    if (!skillName.trim()) {
      toast({ title: "Skill Name Required", description: "Please enter the skill you want to learn.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setError(null);
    setLearningPlan(null);
    setActiveMilestoneQuiz(null);

    try {
      const planInput = { skillName: skillName.trim() };
      const aiGeneratedPlan = await generateLearningPlan(planInput);
      
      setLearningPlan(aiGeneratedPlan);
      toast({ title: "New Learning Plan Generated!", description: `Your plan for "${aiGeneratedPlan.skillToLearn}" is ready.` });
    } catch (err: any) {
      console.error("Error generating learning plan on page:", err);
      let userFriendlyError = err.message || "Failed to generate learning plan. Please try rephrasing or check server logs.";
       if (err.message && err.message.toLowerCase().includes("too many states")) {
          userFriendlyError = "The AI had trouble with the complexity of the plan requested. Try a more general skill or try again.";
      } else if (err.message && err.message.toLowerCase().includes("incomplete plan")) {
          userFriendlyError = err.message; 
      }
      setError(userFriendlyError);
      toast({ title: "Plan Generation Failed", description: userFriendlyError, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [skillName, toast]);

  const handleStartMilestoneQuiz = (milestoneIndex: number) => {
    if (learningPlan && learningPlan.milestones[milestoneIndex]?.quiz && (learningPlan.milestones[milestoneIndex].quiz?.length ?? 0) > 0) {
      setActiveMilestoneQuiz({
        milestoneIndex,
        questions: learningPlan.milestones[milestoneIndex].quiz!,
        userAnswers: {},
        submitted: false,
        latestAttempt: null,
        isGeneratingFeedback: false,
      });
    } else {
      toast({ title: "No Quiz Available", description: "This milestone does not have an AI-generated quiz.", variant: "default" });
    }
  };

  const handleActiveMilestoneAnswerChange = (questionIndex: number, answerIndex: number) => {
    if (activeMilestoneQuiz) {
      setActiveMilestoneQuiz(prev => prev ? ({
        ...prev,
        userAnswers: { ...prev.userAnswers, [questionIndex]: answerIndex }
      }) : null);
    }
  };

  const handleSubmitActiveMilestoneQuiz = async () => {
    if (!activeMilestoneQuiz || !learningPlan) return;

    let score = 0;
    const detailedResults: QuizQuestionWithResult[] = activeMilestoneQuiz.questions.map((q, index) => {
      const isCorrect = activeMilestoneQuiz.userAnswers[index] === q.correctAnswerIndex;
      if (isCorrect) score++;
      return { ...q, userAnswerIndex: activeMilestoneQuiz.userAnswers[index], isCorrect };
    });
    
    toast({ title: "Milestone Quiz Submitted!", description: `You scored ${score} out of ${activeMilestoneQuiz.questions.length}.` });

    let feedbackTextForDisplay: string | null = null;
    const currentMilestoneForFeedback = learningPlan.milestones[activeMilestoneQuiz.milestoneIndex];

    if ((score < activeMilestoneQuiz.questions.length && activeMilestoneQuiz.questions.length > 0) || (activeMilestoneQuiz.questions.length === 0 && score === 0)) {
       setActiveMilestoneQuiz(prev => prev ? ({ ...prev, isGeneratingFeedback: true }) : null);
      try {
        const feedbackInput: SuggestQuizFeedbackInput = {
          contentText: currentMilestoneForFeedback.description, 
          quizResults: detailedResults,
        };
        const feedbackResponse = await suggestQuizFeedbackFlowWrapper(feedbackInput);
        feedbackTextForDisplay = feedbackResponse.feedbackText;
      } catch (feedbackError: any) {
        console.error("Error generating milestone quiz feedback:", feedbackError);
        feedbackTextForDisplay = "Sorry, I couldn't generate feedback for this quiz attempt. Error: " + feedbackError.message;
        toast({ title: "Feedback Error", description: feedbackError.message || "Could not generate AI feedback.", variant: "destructive" });
      } finally {
         setActiveMilestoneQuiz(prev => prev ? ({ ...prev, isGeneratingFeedback: false }) : null);
      }
    } else if (score === activeMilestoneQuiz.questions.length && activeMilestoneQuiz.questions.length > 0) {
      feedbackTextForDisplay = "Excellent! You got all questions correct for this milestone. Keep up the great work!";
    }

    const newAttempt: LocalQuizAttempt = {
      score,
      totalQuestions: activeMilestoneQuiz.questions.length,
      feedback: feedbackTextForDisplay,
      attemptedAt: new Date(), // Using client-side Date
    };
    setActiveMilestoneQuiz(prev => prev ? ({ ...prev, submitted: true, latestAttempt: newAttempt }) : null);
  };
  
  const resetOrRetakeCurrentMilestoneQuiz = () => {
    if (activeMilestoneQuiz) {
        handleStartMilestoneQuiz(activeMilestoneQuiz.milestoneIndex);
    }
  };

  const handleStartOver = () => {
    setSkillName("");
    setLearningPlan(null);
    setError(null);
    setIsLoading(false);
    setActiveMilestoneQuiz(null);
  };
  
  const exportPlanAsText = () => {
    if (!learningPlan) {
      toast({ title: "No Plan to Export", description: "Please generate a plan first.", variant: "destructive"});
      return;
    }

    let planText = `Learning Plan for: ${learningPlan.skillToLearn}\n`;
    planText += `Title: ${learningPlan.planTitle}\n\n`;
    planText += `Overview:\n${learningPlan.overview}\n\n`;
    planText += "---------------------------------------\n";
    planText += "Milestones:\n";
    planText += "---------------------------------------\n\n";

    learningPlan.milestones.forEach((milestone, index) => {
      planText += `Milestone ${index + 1}: ${milestone.milestoneTitle}\n`;
      planText += `Description: ${milestone.description}\n`;
      planText += `Estimated Duration: ${milestone.estimatedDuration}\n`;
      planText += `Suggested SkillForge Keywords: ${milestone.suggestedSearchKeywords.join(', ')}\n`;
      if (milestone.externalResourceSuggestions && milestone.externalResourceSuggestions.length > 0) {
        planText += `External Resource Ideas: ${milestone.externalResourceSuggestions.join(', ')}\n`;
      }
      if (milestone.quiz && milestone.quiz.length > 0) {
        planText += "\n  Quiz:\n";
        milestone.quiz.forEach((q, qIndex) => {
          planText += `  ${qIndex + 1}. ${q.questionText}\n`;
          q.options.forEach((opt, oIndex) => {
            planText += `     ${String.fromCharCode(97 + oIndex)}) ${opt}\n`;
          });
          planText += `     Correct Answer Index: ${q.correctAnswerIndex}\n`;
          if (q.explanation) {
            planText += `     Explanation: ${q.explanation}\n`;
          }
        });
      }
      planText += "\n---------------------------------------\n\n";
    });

    const blob = new Blob([planText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${learningPlan.skillToLearn.replace(/\s+/g, '_')}_learning_plan.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast({title: "Plan Exported", description: "Your learning plan has been downloaded as a text file."});
  };


  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl space-y-8">
      <Card className="glass-card shadow-2xl">
        <CardHeader className="items-center text-center">
          <BookOpen className="h-12 w-12 text-accent mb-3" />
          <CardTitle className="text-3xl md:text-4xl font-bold text-neon-primary">AI Learning Planner</CardTitle>
          <CardDescription className="text-lg text-muted-foreground mt-1">
            Chart your learning journey for any skill. Generated plans are for this session only and can be exported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!learningPlan ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="skillName" className="text-lg font-medium text-foreground">
                  What skill do you want the AI to plan for you?
                </Label>
                <Input
                  id="skillName"
                  placeholder="e.g., 'React Native development', 'Advanced Public Speaking'"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="input-glow-focus text-base py-3"
                  disabled={isLoading}
                />
              </div>
              <Button onClick={handleGeneratePlan} disabled={isLoading || !skillName.trim() || !user} className="w-full bg-primary hover:bg-accent text-lg py-3">
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                {isLoading ? 'Generating Your Plan...' : 'Generate Learning Plan'}
              </Button>
              {!user && <p className="text-sm text-destructive text-center">Please log in to use the AI Learning Planner.</p>}
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" /> {error}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="text-center p-4 rounded-lg bg-accent/10 border border-accent/50">
                <h2 className="text-2xl font-semibold text-neon-accent mb-1">{learningPlan.planTitle}</h2>
                <p className="text-sm text-accent-foreground/90">For Skill: {learningPlan.skillToLearn}</p>
              </div>

              <Button onClick={exportPlanAsText} variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                <Download className="mr-2 h-4 w-4"/> Export Plan as Text
              </Button>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center text-foreground"><Lightbulb className="mr-2 h-5 w-5 text-primary" /> Plan Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{learningPlan.overview}</p>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-xl font-semibold text-foreground mb-3 flex items-center"><ListChecks className="mr-2 h-5 w-5 text-primary" /> Learning Milestones</h3>
                <Accordion type="single" collapsible className="w-full space-y-3">
                  {learningPlan.milestones.map((milestone, index) => (
                    <AccordionItem value={`item-${index}`} key={index} className="bg-muted/30 border border-border/50 rounded-lg shadow-md data-[state=open]:bg-muted/50">
                      {/* Simplified AccordionTrigger - removed asChild, Checkbox, and manual ChevronDown */}
                      <AccordionTrigger className="text-lg font-medium text-foreground hover:no-underline px-4 py-3 text-left group w-full cursor-pointer">
                          <span className="text-left flex-grow mr-2">{milestone.milestoneTitle}</span>
                          {/* Default chevron from AccordionTrigger (ui/accordion.tsx) will appear here,
                              and it will handle its own open/close rotation.
                              The `[&[data-state=open]>svg.default-chevron]:rotate-180` style in accordion.tsx handles this.
                          */}
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-4 border-t border-border/30">
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{milestone.description}</p>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <CalendarDays className="mr-2 h-4 w-4 text-primary/80" />
                          Estimated Duration: <span className="font-medium text-foreground/90 ml-1">{milestone.estimatedDuration}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground/90 mb-1.5 flex items-center">
                            <Search className="mr-2 h-4 w-4 text-primary/80" /> Suggested SkillForge Keywords:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {milestone.suggestedSearchKeywords.map((keyword, kwIndex) => (
                              <span key={kwIndex} className="px-2.5 py-1 text-xs rounded-full bg-secondary text-secondary-foreground shadow-sm flex items-center">
                                <Tag className="mr-1.5 h-3 w-3" /> {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                        {milestone.externalResourceSuggestions && milestone.externalResourceSuggestions.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/30">
                            <p className="text-sm font-medium text-foreground/90 mb-1.5 flex items-center">
                              <Globe className="mr-2 h-4 w-4 text-primary/80" /> External Resource Ideas:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                              {milestone.externalResourceSuggestions.map((suggestion, sgIndex) => (
                                <li key={sgIndex}>{suggestion}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {milestone.quiz && milestone.quiz.length > 0 && (
                          <Card className="mt-4 glass-card bg-background/40 border-primary/30">
                            <CardHeader className="pb-3 pt-4">
                              <CardTitle className="text-md text-primary flex items-center justify-between">
                                <div className="flex items-center"><HelpCircle className="mr-2 h-5 w-5" />Milestone Quiz</div>
                                {activeMilestoneQuiz?.milestoneIndex === index && activeMilestoneQuiz.submitted && activeMilestoneQuiz.latestAttempt && (
                                  <span className="text-xs text-muted-foreground ml-auto font-normal">
                                    Latest Attempt: {activeMilestoneQuiz.latestAttempt.score}/{activeMilestoneQuiz.latestAttempt.totalQuestions}
                                    {' '}({activeMilestoneQuiz.latestAttempt.attemptedAt.toLocaleTimeString()})
                                  </span>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {activeMilestoneQuiz?.milestoneIndex === index && activeMilestoneQuiz.submitted ? (
                                <div className="space-y-4">
                                  <h4 className="text-lg font-semibold text-primary text-center">
                                    Quiz Score: {activeMilestoneQuiz.latestAttempt?.score} / {activeMilestoneQuiz.questions.length}
                                  </h4>
                                   <ScrollArea className="h-60 pr-2">
                                    <div className="space-y-3 text-left">
                                      {activeMilestoneQuiz.questions.map((q, qIndex) => (
                                        <div key={qIndex} className="p-2.5 rounded-md border bg-muted/30">
                                          <p className="font-semibold mb-1.5 text-sm">{qIndex + 1}. {q.questionText}</p>
                                          {q.options.map((opt, oIndex) => {
                                            const isCorrect = oIndex === q.correctAnswerIndex;
                                            const isUserChoice = activeMilestoneQuiz.userAnswers[qIndex] === oIndex;
                                            return (
                                              <div key={oIndex}
                                                className={cn(`flex items-center space-x-2 p-1.5 rounded text-xs`,
                                                  isCorrect ? "bg-green-500/15 text-green-300 border-green-500/40" : "",
                                                  isUserChoice && !isCorrect ? "bg-red-500/15 text-red-300 border-red-500/40" : "",
                                                  isUserChoice && isCorrect ? "border-2 border-green-400" : ""
                                                )}
                                              >
                                                {isUserChoice && isCorrect ? <Check className="h-3 w-3 text-green-400" /> : isUserChoice && !isCorrect ? <X className="h-3 w-3 text-red-400" /> : <span className="w-3 h-3"></span>}
                                                <span>{opt}</span>
                                              </div>
                                            );
                                          })}
                                          {q.explanation && <p className="text-xs text-muted-foreground/80 mt-1.5 pt-1 border-t border-border/20">Explanation: {q.explanation}</p>}
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                  {activeMilestoneQuiz.isGeneratingFeedback && (
                                    <div className="flex items-center justify-center p-3 text-muted-foreground">
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> Generating personalized feedback...
                                    </div>
                                  )}
                                  {activeMilestoneQuiz.latestAttempt?.feedback && !activeMilestoneQuiz.isGeneratingFeedback && (
                                    <Card className="mt-3 glass-card bg-accent/5 border-accent/30">
                                      <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm text-accent flex items-center"><Brain className="mr-2 h-4 w-4" /> AI Feedback</CardTitle></CardHeader>
                                      <CardContent className="pt-0 pb-3"><p className="whitespace-pre-wrap text-xs text-accent-foreground/80 leading-relaxed">{activeMilestoneQuiz.latestAttempt.feedback}</p></CardContent>
                                    </Card>
                                  )}
                                  <Button onClick={resetOrRetakeCurrentMilestoneQuiz} variant="outline" size="sm" className="w-full mt-3">Retake Milestone Quiz</Button>
                                </div>
                              ) : activeMilestoneQuiz?.milestoneIndex === index && !activeMilestoneQuiz.submitted ? (
                                <div className="space-y-3">
                                  <ScrollArea className="h-60 pr-2">
                                    {activeMilestoneQuiz.questions.map((q, qIndex) => (
                                      <div key={qIndex} className="mb-3 p-2.5 rounded-md border border-border/30 bg-muted/10">
                                        <Label className="font-semibold block mb-1.5 text-sm">{qIndex + 1}. {q.questionText}</Label>
                                        <RadioGroup onValueChange={(value) => handleActiveMilestoneAnswerChange(qIndex, parseInt(value))} value={activeMilestoneQuiz.userAnswers[qIndex]?.toString()}>
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
                                <Button onClick={() => handleStartMilestoneQuiz(index)} size="sm" variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                                  Take Milestone Quiz ({milestone.quiz ? milestone.quiz.length : 0} Questions)
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
              <Button onClick={handleStartOver} variant="outline" className="w-full border-accent text-accent hover:bg-accent/10 mt-6">
                <RotateCcw className="mr-2 h-4 w-4" /> Plan Another Skill
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
