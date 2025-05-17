
// src/app/(main)/planner/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Lightbulb, BookOpen, Search, Sparkles, AlertTriangle, CalendarDays, Tag, ListChecks, Globe, Check, X, Brain, HelpCircle, Send, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateLearningPlan, type GenerateLearningPlanOutput, type LearningMilestone as AILearningMilestone, type GenerateLearningPlanInput } from "@/ai/flows/generate-learning-plan-flow";
import { type QuizQuestion, type QuizQuestionSchema } from "@/ai/schemas/quiz-schemas"; // Import QuizQuestionSchema for type usage
import { suggestQuizFeedbackFlowWrapper, type SuggestQuizFeedbackInput, type QuizQuestionWithResult } from "@/ai/flows/suggest-quiz-feedback-flow";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp, Timestamp, FieldValue, limit, orderBy } from "firebase/firestore";
import { formatDistanceToNowStrict } from 'date-fns';


interface QuizAttempt {
  score: number;
  totalQuestions: number;
  feedback: string | null;
  attemptedAt: Timestamp; // Changed from FieldValue to client-generated Timestamp
}

interface LearningMilestoneForDB extends AILearningMilestone {
  completed: boolean;
  quizAttempts: QuizAttempt[];
}

interface LearningPlanForDB extends GenerateLearningPlanOutput {
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
  const [planId, setPlanId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for the currently active quiz within a milestone
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState<number | null>(null);
  const [activeMilestoneUserAnswers, setActiveMilestoneUserAnswers] = useState<Record<number, number>>({});
  const [activeMilestoneQuizSubmitted, setActiveMilestoneQuizSubmitted] = useState(false);
  const [isGeneratingMilestoneFeedback, setIsGeneratingMilestoneFeedback] = useState(false);

  // Derived state for the active milestone's quiz questions and latest attempt
  const activeMilestone = activeMilestoneIndex !== null && learningPlan ? learningPlan.milestones[activeMilestoneIndex] : null;
  const activeMilestoneQuizQuestions: QuizQuestion[] = activeMilestone?.quiz || [];
  const activeMilestoneLatestAttempt = activeMilestone?.quizAttempts?.[activeMilestone.quizAttempts.length - 1];


  const calculateProgress = useCallback(() => {
    if (!learningPlan || !learningPlan.milestones || learningPlan.milestones.length === 0) return 0;
    const completedMilestones = learningPlan.milestones.filter(m => m.completed).length;
    return Math.round((completedMilestones / learningPlan.milestones.length) * 100);
  }, [learningPlan]);

  const updatePlanInFirestore = useCallback(async (updatedPlanData?: Partial<LearningPlanForDB>) => {
    if (!planId || !user) {
      console.warn("Plan ID or user missing, cannot update in Firestore.");
      return;
    }
    setIsSaving(true);
    try {
      const planRef = doc(db, "learningPlans", planId);
      const dataToUpdate = updatedPlanData || learningPlan;
      if (!dataToUpdate) {
        console.warn("No plan data to update in Firestore.");
        setIsSaving(false);
        return;
      }
      // Ensure all timestamps are correctly formatted before sending
      const planWithFirestoreTimestamps = {
        ...dataToUpdate,
        updatedAt: serverTimestamp(), // Always update this to server timestamp
        // Ensure nested attemptedAt are already client Timestamps
        milestones: dataToUpdate.milestones.map(m => ({
            ...m,
            quizAttempts: m.quizAttempts.map(qa => ({
                ...qa,
                // attemptedAt should already be a client Timestamp, no change needed here if already correct
            }))
        }))
      };

      await updateDoc(planRef, planWithFirestoreTimestamps);
      toast({ title: "Plan Progress Saved!" });
    } catch (err: any) {
      console.error("Error updating plan in Firestore:", err);
      toast({ title: "Save Error", description: "Could not save plan progress: " + err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [planId, user, learningPlan, toast]);


  const searchAndLoadOrCreatePlan = useCallback(async () => {
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
      console.log(`Searching for plan: userId=${user.uid}, skill=${skillName.trim()}, status=in-progress`);
      
      const q = query(
        plansRef,
        where("userId", "==", user.uid),
        where("skillToLearn", "==", skillName.trim()),
        where("status", "==", "in-progress"),
        // orderBy("createdAt", "desc"), // Removed due to index requirement, will load any in-progress
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const existingPlanDoc = querySnapshot.docs[0];
        // Ensure timestamps are correctly converted if needed
        const planData = existingPlanDoc.data() as LearningPlanForDB;
        
        // Convert Firestore Timestamps to JS Dates if necessary for display or logic,
        // but ensure they are Firestore Timestamps when saving back.
        // For now, assume they are handled correctly by Firestore SDK for direct use.
        setLearningPlan(planData);
        setPlanId(existingPlanDoc.id);
        toast({ title: "Existing Plan Loaded", description: `Resuming your plan for "${planData.skillToLearn}".` });
      } else {
        await generateNewPlanAndSave();
      }
    } catch (err: any) {
      console.error("Error searching/loading plan:", err);
      let userFriendlyError = "Failed to load or generate learning plan.";
      if (err.code === 'failed-precondition' && err.message.includes('index')) {
        userFriendlyError = "This query requires a Firestore index. Please create it in your Firebase Console. The link is usually in your browser's developer console. For now, ordering of existing plans has been disabled.";
        toast({ title: "Firestore Index Information", description: userFriendlyError, variant: "default", duration: 15000 });
      } else {
        toast({ title: "Error", description: err.message || "Could not process your request.", variant: "destructive" });
      }
      setError(userFriendlyError);
    } finally {
      setIsLoading(false);
    }
  }, [user, skillName, toast]); // Removed generateNewPlanAndSave from deps as it's called within

  const generateNewPlanAndSave = useCallback(async () => {
    if (!user || !skillName.trim()) {
      console.error("GenerateNewPlan: User or skillName missing.");
      return;
    }
    
    try {
      const planInput: GenerateLearningPlanInput = { skillName: skillName.trim() };
      const aiGeneratedPlan = await generateLearningPlan(planInput);
      
      if (!aiGeneratedPlan || !aiGeneratedPlan.milestones || aiGeneratedPlan.milestones.length === 0) {
        throw new Error("AI failed to generate any milestones for the plan.");
      }

      const milestonesWithProgress: LearningMilestoneForDB[] = aiGeneratedPlan.milestones.map(m => ({
        ...m,
        completed: false,
        quizAttempts: []
      }));

      const newPlanForDB: Omit<LearningPlanForDB, 'createdAt' | 'updatedAt'> & { createdAt: FieldValue, updatedAt: FieldValue } = {
        ...aiGeneratedPlan,
        userId: user.uid,
        status: "in-progress",
        milestones: milestonesWithProgress,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "learningPlans"), newPlanForDB);
      
      const placeholderTimestamp = Timestamp.now(); // For initial client state
      setLearningPlan({
        ...newPlanForDB,
        createdAt: placeholderTimestamp, // Use client-side for immediate display
        updatedAt: placeholderTimestamp, // Use client-side for immediate display
      } as LearningPlanForDB);
      setPlanId(docRef.id);
      toast({ title: "New Learning Plan Generated!", description: `Your plan for "${aiGeneratedPlan.skillToLearn}" is ready and saved.` });
    } catch (err: any) {
      console.error("Error generating new plan and saving:", err);
      setError(err.message || "Failed to generate and save new plan.");
      toast({ title: "Plan Generation Failed", description: err.message || "Could not generate plan.", variant: "destructive" });
    }
  }, [user, skillName, toast]);


  const handleToggleMilestoneComplete = async (milestoneIndex: number) => {
    if (!learningPlan || !planId || !user) return;
    
    const updatedMilestones = learningPlan.milestones.map((m, index) =>
      index === milestoneIndex ? { ...m, completed: !m.completed } : m
    );
    
    const allCompleted = updatedMilestones.every(m => m.completed);

    const updatedPlan = { 
        ...learningPlan, 
        milestones: updatedMilestones,
        status: allCompleted ? "completed" : "in-progress" as "in-progress" | "completed"
    };
    setLearningPlan(updatedPlan);
    await updatePlanInFirestore(updatedPlan);
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
    setActiveMilestoneUserAnswers({});
    setActiveMilestoneQuizSubmitted(false);
  };

  const handleStartMilestoneQuiz = (milestoneIndex: number) => {
    if (learningPlan && learningPlan.milestones[milestoneIndex]?.quiz && (learningPlan.milestones[milestoneIndex].quiz?.length ?? 0) > 0) {
      setActiveMilestoneIndex(milestoneIndex);
      setActiveMilestoneUserAnswers({}); 
      setActiveMilestoneQuizSubmitted(false);
    } else {
      toast({ title: "No Quiz Available", description: "This milestone does not have a quiz generated by the AI.", variant: "default" });
    }
  };

  const handleActiveMilestoneAnswerChange = (questionIndex: number, answerIndex: number) => {
    setActiveMilestoneUserAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const handleSubmitActiveMilestoneQuiz = async () => {
    if (!activeMilestoneQuizQuestions || activeMilestoneIndex === null || !learningPlan || !planId || !user) return;

    let score = 0;
    const detailedResults: QuizQuestionWithResult[] = activeMilestoneQuizQuestions.map((q, index) => {
      const isCorrect = activeMilestoneUserAnswers[index] === q.correctAnswerIndex;
      if (isCorrect) score++;
      return { ...q, userAnswerIndex: activeMilestoneUserAnswers[index], isCorrect };
    });
    
    setActiveMilestoneQuizSubmitted(true); 
    toast({ title: "Milestone Quiz Submitted!", description: `You scored ${score} out of ${activeMilestoneQuizQuestions.length}.` });

    let feedbackTextForSave: string | null = null;
    const currentMilestoneForFeedback = learningPlan.milestones[activeMilestoneIndex];

    if ((score < activeMilestoneQuizQuestions.length && activeMilestoneQuizQuestions.length > 0) || (activeMilestoneQuizQuestions.length === 0 && score === 0)) {
      setIsGeneratingMilestoneFeedback(true);
      try {
        const feedbackInput: SuggestQuizFeedbackInput = {
          contentText: currentMilestoneForFeedback.description,
          quizResults: detailedResults,
        };
        const feedbackResponse = await suggestQuizFeedbackFlowWrapper(feedbackInput);
        feedbackTextForSave = feedbackResponse.feedbackText;
      } catch (feedbackError: any) {
        console.error("Error generating milestone quiz feedback:", feedbackError);
        feedbackTextForSave = "Sorry, I couldn't generate feedback for this quiz attempt. Error: " + feedbackError.message;
        toast({ title: "Feedback Error", description: feedbackError.message || "Could not generate AI feedback.", variant: "destructive" });
      } finally {
        setIsGeneratingMilestoneFeedback(false);
      }
    } else if (score === activeMilestoneQuizQuestions.length && activeMilestoneQuizQuestions.length > 0) {
      feedbackTextForSave = "Excellent! You got all questions correct for this milestone. Keep up the great work!";
    }

    const newAttempt: QuizAttempt = {
      score,
      totalQuestions: activeMilestoneQuizQuestions.length,
      feedback: feedbackTextForSave,
      attemptedAt: Timestamp.now(), // Use client-generated Timestamp
    };

    const updatedMilestones = learningPlan.milestones.map((m, index) =>
      index === activeMilestoneIndex
        ? { ...m, quizAttempts: [...(m.quizAttempts || []), newAttempt] }
        : m
    );
    const updatedPlan = { ...learningPlan, milestones: updatedMilestones };
    setLearningPlan(updatedPlan); 
    await updatePlanInFirestore(updatedPlan);
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
                  What skill do you want to learn or resume planning for?
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
                  <AlertTriangle className="h-5 w-5" /> {error}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="text-center p-4 rounded-lg bg-accent/10 border border-accent/50">
                <h2 className="text-2xl font-semibold text-neon-accent mb-1">{learningPlan.planTitle}</h2>
                <p className="text-sm text-accent-foreground/90">For Skill: {learningPlan.skillToLearn}</p>
                 {learningPlan.createdAt instanceof Timestamp && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Plan created: {formatDistanceToNowStrict(learningPlan.createdAt.toDate(), { addSuffix: true })}
                    </p>
                 )}
              </div>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center text-foreground"><Lightbulb className="mr-2 h-5 w-5 text-primary" /> Plan Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{learningPlan.overview}</p>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center text-foreground">
                    <ListChecks className="mr-2 h-5 w-5 text-primary" /> Your Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={calculateProgress()} className="w-full h-3 bg-muted/50" indicatorClassName="bg-gradient-to-r from-primary to-accent" />
                  <p className="text-sm text-muted-foreground mt-2 text-center">{calculateProgress()}% Complete ({learningPlan.milestones.filter(m => m.completed).length} of {learningPlan.milestones.length} milestones)</p>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-xl font-semibold text-foreground mb-3 flex items-center"><ListChecks className="mr-2 h-5 w-5 text-primary" /> Learning Milestones</h3>
                <Accordion type="single" collapsible className="w-full space-y-3">
                  {learningPlan.milestones.map((milestone, index) => (
                    <AccordionItem value={`item-${index}`} key={index} className="bg-muted/30 border border-border/50 rounded-lg shadow-md data-[state=open]:bg-muted/50">
                      <AccordionTrigger className="text-lg font-medium text-foreground hover:text-primary hover:no-underline px-4 py-3 text-left group">
                        <div className="flex items-center flex-grow mr-4">
                          <Checkbox
                            id={`milestone-${index}-complete`}
                            checked={milestone.completed}
                            onCheckedChange={() => handleToggleMilestoneComplete(index)}
                            className="mr-3 h-5 w-5 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground shrink-0"
                            disabled={isSaving}
                            onClick={(e) => e.stopPropagation()} // Stop propagation to prevent accordion toggle
                          />
                          <span className={milestone.completed ? "line-through text-muted-foreground" : ""}>{milestone.milestoneTitle}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-4 border-t border-border/30">
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{milestone.description}</p>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <CalendarDays className="mr-2 h-4 w-4 text-primary/80" />
                          Estimated Duration: <span className="font-medium text-foreground/90 ml-1">{milestone.estimatedDuration}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground/90 mb-1.5 flex items-center">
                            <Search className="mr-2 h-4 w-4 text-primary/80" /> Suggested Keywords for SkillForge Search:
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
                              <Globe className="mr-2 h-4 w-4 text-primary/80" /> External Resource & Search Ideas:
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
                                {activeMilestoneIndex === index && activeMilestoneQuizSubmitted && activeMilestoneLatestAttempt && (
                                  <span className="text-xs text-muted-foreground ml-auto font-normal">
                                    Latest: {activeMilestoneLatestAttempt.score}/{activeMilestoneLatestAttempt.totalQuestions}
                                    {' '}({activeMilestoneLatestAttempt.attemptedAt instanceof Timestamp ? formatDistanceToNowStrict(activeMilestoneLatestAttempt.attemptedAt.toDate(), { addSuffix: true }) : 'just now'})
                                  </span>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {activeMilestoneIndex === index && activeMilestoneQuizSubmitted ? (
                                <div className="space-y-4">
                                  <h4 className="text-lg font-semibold text-primary text-center">
                                    Quiz Score: {activeMilestoneLatestAttempt?.score} / {activeMilestoneQuizQuestions.length}
                                  </h4>
                                  <ScrollArea className="h-60 pr-2">
                                    <div className="space-y-3 text-left">
                                      {activeMilestoneQuizQuestions.map((q, qIndex) => (
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
                                  {isGeneratingMilestoneFeedback && (
                                    <div className="flex items-center justify-center p-3 text-muted-foreground">
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> Generating personalized feedback...
                                    </div>
                                  )}
                                  {activeMilestoneLatestAttempt?.feedback && !isGeneratingMilestoneFeedback && (
                                    <Card className="mt-3 glass-card bg-accent/5 border-accent/30">
                                      <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm text-accent flex items-center"><Brain className="mr-2 h-4 w-4" /> AI Feedback</CardTitle></CardHeader>
                                      <CardContent className="pt-0 pb-3"><p className="whitespace-pre-wrap text-xs text-accent-foreground/80 leading-relaxed">{activeMilestoneLatestAttempt.feedback}</p></CardContent>
                                    </Card>
                                  )}
                                  <Button onClick={() => handleStartMilestoneQuiz(index)} variant="outline" size="sm" className="w-full mt-3">Retake Milestone Quiz</Button>
                                </div>
                              ) : activeMilestoneIndex === index && !activeMilestoneQuizSubmitted ? (
                                <div className="space-y-3">
                                  <ScrollArea className="h-60 pr-2">
                                    {activeMilestoneQuizQuestions.map((q, qIndex) => (
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
                            </CardContent>
                             {milestone.quizAttempts && milestone.quizAttempts.length > 0 && !(activeMilestoneIndex === index && activeMilestoneQuizSubmitted) && (
                                <CardFooter className="pt-2 text-xs border-t border-primary/20">
                                    <details>
                                    <summary className="cursor-pointer text-muted-foreground hover:text-primary">View Past Attempts ({milestone.quizAttempts.length})</summary>
                                    <ScrollArea className="max-h-24 mt-1">
                                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground/90">
                                        {milestone.quizAttempts.slice().reverse().slice(0, 3).map((att, attIdx) => (
                                            <li key={attIdx}>
                                            Score: {att.score}/{att.totalQuestions}
                                            {' '}({att.attemptedAt instanceof Timestamp ? formatDistanceToNowStrict(att.attemptedAt.toDate(), { addSuffix: true }) : 'N/A'})
                                            {att.feedback && <details className="mt-0.5"><summary className="text-xs cursor-pointer">Show Feedback</summary><p className="text-xs whitespace-pre-wrap p-1 bg-muted/30 rounded">{att.feedback}</p></details>}
                                            </li>
                                        ))}
                                        </ul>
                                    </ScrollArea>
                                    </details>
                                </CardFooter>
                            )}
                          </Card>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
              <Button onClick={handleStartOver} variant="outline" className="w-full border-accent text-accent hover:bg-accent/10 mt-6">
                <RotateCcw className="mr-2 h-4 w-4" /> Plan Another Skill or Reload
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    