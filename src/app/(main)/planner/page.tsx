
// src/app/(main)/planner/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Lightbulb, BookOpen, Search, Sparkles, AlertTriangle, CalendarDays, Tag, ListChecks, Globe, Check, X, Brain, HelpCircle, Send, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateLearningPlan, type GenerateLearningPlanOutput, type LearningMilestone as AILearningMilestone } from "@/ai/flows/generate-learning-plan-flow";
import { type QuizQuestion } from "@/ai/schemas/quiz-schemas";
import { suggestQuizFeedbackFlowWrapper, type SuggestQuizFeedbackInput, type QuizQuestionWithResult } from "@/ai/flows/suggest-quiz-feedback-flow";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp, Timestamp, orderBy } from "firebase/firestore";
import { formatDistanceToNowStrict } from 'date-fns';


interface QuizAttempt {
  score: number;
  totalQuestions: number;
  feedback: string | null;
  attemptedAt: Timestamp;
}

interface LearningMilestoneForDB extends AILearningMilestone {
  completed: boolean;
  quizAttempts: QuizAttempt[];
}

interface LearningPlanForDB extends Omit<GenerateLearningPlanOutput, 'milestones'> {
  userId: string;
  status: "in-progress" | "completed";
  milestones: LearningMilestoneForDB[];
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export default function LearningPlannerPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [skillName, setSkillName] = useState("");
  const [learningPlan, setLearningPlan] = useState<LearningPlanForDB | null>(null);
  const [planId, setPlanId] = useState<string | null>(null); // Firestore document ID of the plan

  const [isLoading, setIsLoading] = useState(false); // For plan generation/loading
  const [isSaving, setIsSaving] = useState(false); // For updates to Firestore

  const [error, setError] = useState<string | null>(null);

  // State for quizzes within milestones
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState<number | null>(null);
  const [activeMilestoneQuiz, setActiveMilestoneQuiz] = useState<QuizQuestion[] | null>(null);
  const [activeMilestoneUserAnswers, setActiveMilestoneUserAnswers] = useState<Record<number, number>>({});
  const [activeMilestoneQuizScore, setActiveMilestoneQuizScore] = useState<number | null>(null);
  const [activeMilestoneQuizSubmitted, setActiveMilestoneQuizSubmitted] = useState(false);
  const [activeMilestoneAiFeedback, setActiveMilestoneAiFeedback] = useState<string | null>(null);
  const [isGeneratingMilestoneFeedback, setIsGeneratingMilestoneFeedback] = useState(false);

  const calculateProgress = () => {
    if (!learningPlan || learningPlan.milestones.length === 0) return 0;
    const completedMilestones = learningPlan.milestones.filter(m => m.completed).length;
    return Math.round((completedMilestones / learningPlan.milestones.length) * 100);
  };

  const updatePlanInFirestore = async (updatedPlanData?: Partial<LearningPlanForDB>) => {
    if (!planId || !user) return;
    setIsSaving(true);
    try {
      const planRef = doc(db, "learningPlans", planId);
      const dataToUpdate = updatedPlanData || learningPlan; // Use provided data or current state
      if (!dataToUpdate) {
          console.warn("No plan data to update in Firestore.");
          setIsSaving(false);
          return;
      }
      await updateDoc(planRef, {
        ...dataToUpdate, // This might send the whole plan object, consider sending only changed fields if performance is an issue
        updatedAt: serverTimestamp()
      });
      toast({ title: "Plan Progress Saved!" });
    } catch (err: any) {
      console.error("Error updating plan in Firestore:", err);
      toast({ title: "Save Error", description: "Could not save plan progress: " + err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const searchAndLoadOrCreatePlan = async () => {
    if (!user || !skillName.trim()) {
      toast({ title: "Skill Name Required", description: "Please enter the skill you want to learn.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setError(null);
    setLearningPlan(null);
    setPlanId(null);
    resetActiveQuizStates();

    try {
      const plansRef = collection(db, "learningPlans");
      const q = query(
        plansRef,
        where("userId", "==", user.uid),
        where("skillToLearn", "==", skillName.trim()),
        where("status", "==", "in-progress"), // Only load active plans
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const existingPlanDoc = querySnapshot.docs[0];
        const planData = existingPlanDoc.data() as LearningPlanForDB;
        setLearningPlan(planData);
        setPlanId(existingPlanDoc.id);
        toast({ title: "Existing Plan Loaded", description: `Resuming your plan for "${planData.skillToLearn}".` });
      } else {
        await generateNewPlanAndSave();
      }
    } catch (err: any) {
      console.error("Error searching/loading plan:", err);
      setError(err.message || "Failed to load or generate plan.");
      toast({ title: "Error", description: err.message || "Could not process your request.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewPlanAndSave = async () => {
    if (!user || !skillName.trim()) return; // Should be caught by parent function
    setIsLoading(true); // Ensure loading state is active
    try {
      const aiGeneratedPlan = await generateLearningPlan({ skillName: skillName.trim() });
      const milestonesWithProgress: LearningMilestoneForDB[] = aiGeneratedPlan.milestones.map(m => ({
        ...m,
        completed: false,
        quizAttempts: []
      }));

      const newPlanForDB: Omit<LearningPlanForDB, 'userId'> & { userId: string } = {
        ...aiGeneratedPlan,
        userId: user.uid,
        status: "in-progress",
        milestones: milestonesWithProgress,
        createdAt: serverTimestamp() as Timestamp, // Cast for type consistency before send
        updatedAt: serverTimestamp() as Timestamp, // Cast
      };

      const docRef = await addDoc(collection(db, "learningPlans"), newPlanForDB);
      setLearningPlan({ ...newPlanForDB, createdAt: new Timestamp(0,0), updatedAt: new Timestamp(0,0) }); // Set local state with placeholder timestamps
      setPlanId(docRef.id);
      toast({ title: "New Learning Plan Generated!", description: `Your plan for "${aiGeneratedPlan.skillToLearn}" is ready and saved.` });
    } catch (err: any)
      console.error("Error generating new plan and saving:", err);
      setError(err.message || "Failed to generate and save new plan.");
      toast({ title: "Plan Generation Failed", description: err.message || "Could not generate plan.", variant: "destructive" });
    } finally {
      // setIsLoading will be handled by the calling function (searchAndLoadOrCreatePlan)
    }
  };


  const handleToggleMilestoneComplete = async (milestoneIndex: number) => {
    if (!learningPlan || !planId) return;
    const updatedMilestones = learningPlan.milestones.map((m, index) =>
      index === milestoneIndex ? { ...m, completed: !m.completed } : m
    );
    const updatedPlan = { ...learningPlan, milestones: updatedMilestones };
    setLearningPlan(updatedPlan);
    await updatePlanInFirestore(updatedPlan); // Pass the specific updated plan
  };

  const handleStartOver = () => {
    setSkillName("");
    setLearningPlan(null);
    setPlanId(null);
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
      resetActiveQuizStates();
      setActiveMilestoneIndex(milestoneIndex);
      setActiveMilestoneQuiz(learningPlan.milestones[milestoneIndex].quiz!);
    }
  };
  
  const handleActiveMilestoneAnswerChange = (questionIndex: number, answerIndex: number) => {
    setActiveMilestoneUserAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const handleSubmitActiveMilestoneQuiz = async () => {
    if (!activeMilestoneQuiz || activeMilestoneIndex === null || !learningPlan || !planId) return;

    let score = 0;
    const detailedResults: QuizQuestionWithResult[] = activeMilestoneQuiz.map((q, index) => {
      const isCorrect = activeMilestoneUserAnswers[index] === q.correctAnswerIndex;
      if (isCorrect) score++;
      return { ...q, userAnswerIndex: activeMilestoneUserAnswers[index], isCorrect };
    });

    setActiveMilestoneQuizScore(score);
    setActiveMilestoneQuizSubmitted(true);
    toast({ title: "Milestone Quiz Submitted!", description: `You scored ${score} out of ${activeMilestoneQuiz.length}.` });

    let feedbackText: string | null = null;
    if (score < activeMilestoneQuiz.length && activeMilestoneQuiz.length > 0) {
      setIsGeneratingMilestoneFeedback(true);
      setActiveMilestoneAiFeedback(null);
      try {
        const milestoneDescription = learningPlan.milestones[activeMilestoneIndex].description;
        const feedbackInput: SuggestQuizFeedbackInput = {
          contentText: milestoneDescription,
          quizResults: detailedResults,
        };
        const feedbackResponse = await suggestQuizFeedbackFlowWrapper(feedbackInput);
        feedbackText = feedbackResponse.feedbackText;
        setActiveMilestoneAiFeedback(feedbackText);
      } catch (feedbackError: any) {
        console.error("Error generating milestone quiz feedback:", feedbackError);
        feedbackText = "Sorry, I couldn't generate feedback for this quiz attempt. Error: " + feedbackError.message;
        setActiveMilestoneAiFeedback(feedbackText);
        toast({ title: "Feedback Generation Error", description: feedbackError.message || "Could not generate AI feedback.", variant: "destructive" });
      } finally {
        setIsGeneratingMilestoneFeedback(false);
      }
    } else if (score === activeMilestoneQuiz.length && activeMilestoneQuiz.length > 0) {
        feedbackText = "Excellent! You got all questions correct for this milestone. Keep up the great work!";
        setActiveMilestoneAiFeedback(feedbackText);
        setIsGeneratingMilestoneFeedback(false);
    }

    // Save quiz attempt to Firestore
    const newAttempt: QuizAttempt = {
      score,
      totalQuestions: activeMilestoneQuiz.length,
      feedback: feedbackText,
      attemptedAt: serverTimestamp() as Timestamp,
    };
    
    const updatedMilestones = learningPlan.milestones.map((m, index) =>
        index === activeMilestoneIndex
        ? { ...m, quizAttempts: [...(m.quizAttempts || []), newAttempt] }
        : m
    );
    const updatedPlan = { ...learningPlan, milestones: updatedMilestones };
    setLearningPlan(updatedPlan); // Update local state immediately
    await updatePlanInFirestore(updatedPlan); // Update Firestore
  };
  
  const handleClearMilestoneQuiz = (milestoneIndexToClear: number) => {
    // This function clears the *current attempt* UI for a specific milestone
    // so the user can retake it. It doesn't delete past attempts from history.
    if (activeMilestoneIndex === milestoneIndexToClear) {
        resetActiveQuizStates();
    }
    // To actually allow retaking, we just need to reset the UI state.
    // The history of attempts is preserved in learningPlan.milestones[X].quizAttempts.
  };

  const latestQuizAttemptForMilestone = (milestoneIndex: number): QuizAttempt | undefined => {
    if (!learningPlan || !learningPlan.milestones[milestoneIndex]?.quizAttempts) return undefined;
    const attempts = learningPlan.milestones[milestoneIndex].quizAttempts;
    return attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
  };


  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl space-y-8">
      <Card className="glass-card shadow-2xl">
        <CardHeader className="items-center text-center">
          <BookOpen className="h-12 w-12 text-accent mb-3" />
          <CardTitle className="text-3xl md:text-4xl font-bold text-neon-primary">AI Learning Planner</CardTitle>
          <CardDescription className="text-lg text-muted-foreground mt-1">
            Chart your learning journey for any skill. Saved plans can be resumed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!learningPlan ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="skillName" className="text-lg font-medium text-foreground">
                  What skill do you want to learn or resume?
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
              <Button onClick={searchAndLoadOrCreatePlan} disabled={isLoading || !skillName.trim() || !user} className="w-full bg-primary hover:bg-accent text-lg py-3">
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                {isLoading ? 'Processing...' : 'Generate / Load Plan'}
              </Button>
              {!user && <p className="text-sm text-destructive text-center">Please log in to generate or load learning plans.</p>}
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
              
              <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center text-foreground">
                        <ListChecks className="mr-2 h-5 w-5 text-primary"/> Your Progress
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Progress value={calculateProgress()} className="w-full h-3 bg-muted/50" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
                    <p className="text-sm text-muted-foreground mt-2 text-center">{calculateProgress()}% Complete</p>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-xl font-semibold text-foreground mb-3 flex items-center"><ListChecks className="mr-2 h-5 w-5 text-primary"/> Learning Milestones</h3>
                <Accordion type="single" collapsible className="w-full space-y-3">
                  {learningPlan.milestones.map((milestone, index) => {
                    const currentMilestoneQuizAttempt = latestQuizAttemptForMilestone(index);
                    return (
                    <AccordionItem value={`item-${index}`} key={index} className="bg-muted/30 border border-border/50 rounded-lg shadow-md">
                      <AccordionTrigger className="text-lg font-medium text-foreground hover:text-primary hover:no-underline px-4 py-3">
                        <div className="flex items-center flex-grow">
                            <Checkbox
                                id={`milestone-${index}-complete`}
                                checked={milestone.completed}
                                onCheckedChange={() => handleToggleMilestoneComplete(index)}
                                className="mr-3 h-5 w-5 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                disabled={isSaving}
                                onClick={(e) => e.stopPropagation()} // Prevent accordion toggle when clicking checkbox
                            />
                            <span className={milestone.completed ? "line-through text-muted-foreground" : ""}>{milestone.milestoneTitle}</span>
                        </div>
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
                              <CardTitle className="text-md text-primary flex items-center">
                                <HelpCircle className="mr-2 h-5 w-5"/>Milestone Quiz
                                {currentMilestoneQuizAttempt && (
                                    <span className="text-xs text-muted-foreground ml-auto">
                                        Last attempt: {currentMilestoneQuizAttempt.score}/{currentMilestoneQuizAttempt.totalQuestions}
                                        {' '}({currentMilestoneQuizAttempt.attemptedAt?.toDate ? formatDistanceToNowStrict(currentMilestoneQuizAttempt.attemptedAt.toDate(), {addSuffix: true}) : 'just now'})
                                    </span>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {activeMilestoneIndex === index && activeMilestoneQuizSubmitted ? (
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
                                  <Button onClick={() => handleClearMilestoneQuiz(index)} variant="outline" size="sm" className="w-full mt-3">Retake Milestone Quiz</Button>
                                </div>
                              ) : activeMilestoneIndex === index && activeMilestoneQuiz ? (
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
                                <Button onClick={() => handleStartMilestoneQuiz(index)} size="sm" variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                                  Take Milestone Quiz ({milestone.quiz.length} Questions)
                                </Button>
                              )}
                               {milestone.quizAttempts && milestone.quizAttempts.length > 0 && (
                                <div className="mt-2 text-xs">
                                  <details>
                                    <summary className="cursor-pointer text-muted-foreground hover:text-primary">View Past Attempts ({milestone.quizAttempts.length})</summary>
                                    <ul className="list-disc pl-5 mt-1 space-y-1">
                                      {milestone.quizAttempts.slice().reverse().slice(0,3).map((att, attIdx) => ( // Show latest 3
                                        <li key={attIdx}>
                                          Score: {att.score}/{att.totalQuestions} 
                                          ({att.attemptedAt?.toDate ? formatDistanceToNowStrict(att.attemptedAt.toDate(), {addSuffix: true}) : 'N/A'})
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  )})}
                </Accordion>
              </div>
              <Button onClick={handleStartOver} variant="outline" className="w-full border-primary text-primary hover:bg-primary/10 mt-6">
                <RotateCcw className="mr-2 h-4 w-4"/> Plan Another Skill or Reload Current
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
