// src/app/(main)/content/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatbotWidget } from "@/components/content/chatbot-widget";
import VideoPlayer from "@/components/content/video-player";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ThumbsUp, MessageSquare, UserPlus, Loader2, PlayCircle, FileText, Volume2, Star, AlertTriangle, UserCheck, ExternalLink, Share2 as ShareIcon, Bookmark, HelpCircle, Send, Check, X, Brain, Eye, MessageCircle as ReplyIcon, Link as LinkIcon, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { UserProfile } from "@/contexts/auth-context";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { db, storage as firebaseStorage } from "@/lib/firebase";
import { doc, getDoc, updateDoc, runTransaction, serverTimestamp, collection, addDoc, query, orderBy, getDocs, Timestamp, where, deleteDoc, FieldValue, increment, writeBatch } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict } from 'date-fns';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { generateQuiz, type GenerateQuizInput, type QuizQuestion, type GenerateQuizOutput } from "@/ai/flows/generate-quiz-flow";
import { suggestQuizFeedbackFlowWrapper, type SuggestQuizFeedbackInput, type QuizQuestionWithResult } from "@/ai/flows/suggest-quiz-feedback-flow";
// Removed MOCK_CONTENT_ITEMS import and ContentCard import as similar content is not yet implemented

interface ContentDetails {
  id: string;
  title: string;
  contentType: "video" | "audio" | "text";
  uploader_uid: string;
  tags: string[];
  created_at: Timestamp;
  average_rating?: number;
  total_ratings?: number;
  download_url?: string | null;
  storage_path?: string | null; // Path in Firebase Storage
  text_content_inline?: string | null; // For direct text content
  ai_description?: string | null;
  user_manual_description?: string | null;
  duration_seconds?: number; // Placeholder
  author?: UserProfile;
  ai_transcript?: string | null; // Placeholder
  thumbnail_url?: string | null;
  view_count?: number;
  brief_summary?: string;
}

interface Comment {
    id: string; // Firestore document ID
    commenter_uid: string;
    commenter_full_name?: string | null;
    commenter_photoURL?: string | null;
    comment_text: string;
    commented_at: Timestamp;
    parent_comment_id?: string | null;
    likes?: number;
    replies?: ProcessedComment[]; // For client-side nesting
}

interface ProcessedComment extends Comment {
  replies: ProcessedComment[];
}


export default function ViewContentPage() {
  const params = useParams();
  const contentId = params.id as string;
  const { user: currentUser, profile: currentUserProfile, loading: authLoading } = useAuth();
  const [content, setContent] = useState<ContentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isRating, setIsRating] = useState(false);
  const [isDeletingContent, setIsDeletingContent] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [processedComments, setProcessedComments] = useState<ProcessedComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);
  const [processingFollow, setProcessingFollow] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [numQuizQuestions, setNumQuizQuestions] = useState(5);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const [aiQuizFeedback, setAiQuizFeedback] = useState<string | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);

  const incrementViewCount = useCallback(async () => {
    if (!contentId) return;
    const contentRef = doc(db, "contents", contentId);
    try {
      await updateDoc(contentRef, {
        view_count: increment(1)
      });
      console.log("View count incremented for content:", contentId);
      setContent(prev => prev ? { ...prev, view_count: (prev.view_count || 0) + 1 } : null);
    } catch (error) {
      console.error("Error incrementing view count:", error);
    }
  }, [contentId]);

  const fetchContentDetails = useCallback(async () => {
    if (!contentId) return;
    setIsLoading(true);
    try {
      const contentDocRef = doc(db, "contents", contentId);
      const contentDocSnap = await getDoc(contentDocRef);

      if (!contentDocSnap.exists()) {
        setContent(null);
        toast({ title: "Not Found", description: "This content does not exist or has been removed.", variant: "destructive" });
        router.push("/search"); // Redirect if content not found
        return;
      }

      const contentData = contentDocSnap.data() as Omit<ContentDetails, 'id' | 'author'>;

      let authorProfile: UserProfile | undefined = undefined;
      if (contentData.uploader_uid) {
        const authorDocRef = doc(db, "users", contentData.uploader_uid);
        const authorDocSnap = await getDoc(authorDocRef);
        if (authorDocSnap.exists()) {
          authorProfile = { uid: authorDocSnap.id, ...(authorDocSnap.data() as Omit<UserProfile, 'uid'>) };
        }
      }

      setContent({
        id: contentDocSnap.id,
        ...contentData,
        author: authorProfile,
      });

      if (currentUser?.uid && authorProfile?.uid && currentUser.uid !== authorProfile.uid) {
        const followDocRef = doc(db, "users", currentUser.uid, "following", authorProfile.uid);
        const followDocSnap = await getDoc(followDocRef);
        setIsFollowingAuthor(followDocSnap.exists());
      }

      if (currentUser?.uid) {
        const ratingDocRef = doc(db, "contents", contentId, "ratings", currentUser.uid);
        const ratingDocSnap = await getDoc(ratingDocRef);
        if (ratingDocSnap.exists()) {
          setUserRating(ratingDocSnap.data().rating as number);
        } else {
          setUserRating(null);
        }
      }
      incrementViewCount();

    } catch (error: any) {
      console.error("Error fetching content details:", error);
      toast({ title: "Error", description: error.message || "Could not load content.", variant: "destructive" });
      setContent(null);
    } finally {
      setIsLoading(false);
    }
  }, [contentId, currentUser?.uid, toast, incrementViewCount, router]);

  const fetchComments = useCallback(async () => {
    if (!contentId) return;
    const commentsColRef = collection(db, "contents", contentId, "comments");
    const q = query(commentsColRef, orderBy("commented_at", "asc")); // Fetch oldest first for easier threading

    try {
        const snapshot = await getDocs(q);
        const fetchedCommentsPromises = snapshot.docs.map(async (docSnap) => {
            const commentData = docSnap.data();
            let commenterProfile: Partial<UserProfile> = {};
            if (commentData.commenter_uid) { // Renamed from commenter_user_id for consistency
                const userRef = doc(db, "users", commentData.commenter_uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    commenterProfile = userSnap.data() as UserProfile;
                }
            }
            return {
                id: docSnap.id,
                commenter_uid: commentData.commenter_uid,
                comment_text: commentData.comment_text,
                commented_at: commentData.commented_at as Timestamp,
                parent_comment_id: commentData.parent_comment_id || null,
                likes: commentData.likes || 0,
                commenter_full_name: commenterProfile.full_name || "Anonymous",
                commenter_photoURL: commenterProfile.photoURL,
            } as Comment;
        });
        const resolvedComments = await Promise.all(fetchedCommentsPromises);
        setComments(resolvedComments);
    } catch (error: any) {
        console.error("Error fetching comments:", error);
        toast({title: "Error", description: "Could not load comments: "+ error.message, variant: "destructive"});
    }
  }, [contentId, toast]);

  useEffect(() => { // Process flat comments into nested structure
    const commentsById: { [key: string]: ProcessedComment } = {};
    const rootComments: ProcessedComment[] = [];

    comments.forEach(comment => {
      commentsById[comment.id] = { ...comment, replies: [] };
    });

    comments.forEach(comment => {
      const processedComment = commentsById[comment.id];
      if (comment.parent_comment_id && commentsById[comment.parent_comment_id]) {
        commentsById[comment.parent_comment_id].replies.push(processedComment);
      } else {
        rootComments.push(processedComment);
      }
    });
    // Sort root comments by newest first, replies will maintain their fetched order (oldest first within a thread)
    setProcessedComments(rootComments.sort((a, b) => b.commented_at.toMillis() - a.commented_at.toMillis()));
  }, [comments]);


  useEffect(() => {
    if (contentId) {
        fetchContentDetails();
        fetchComments();
    }
  }, [contentId, fetchContentDetails, fetchComments]);


  const handleRating = async (newRating: number) => {
    if (!currentUser || !content) {
      toast({ title: "Login Required", description: "You must be logged in to rate SkillForge content.", variant: "destructive" });
      return;
    }
    if (currentUser.uid === content.uploader_uid) {
      toast({ title: "Cannot Rate Own Content", description: "You cannot rate your own uploaded content.", variant: "default" });
      return;
    }
    setIsRating(true);

    const contentRef = doc(db, "contents", content.id);
    const ratingRef = doc(db, "contents", content.id, "ratings", currentUser.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const contentDoc = await transaction.get(contentRef);
        if (!contentDoc.exists()) throw "Content document does not exist!";

        const currentTotalRatings = contentDoc.data()?.total_ratings || 0;
        const currentAverageRating = contentDoc.data()?.average_rating || 0;
        let newTotalRatings = currentTotalRatings;
        let newSumOfRatings = currentAverageRating * currentTotalRatings;

        const oldRatingDoc = await transaction.get(ratingRef);
        if (oldRatingDoc.exists()) {
          const previousRating = oldRatingDoc.data().rating;
          newSumOfRatings = newSumOfRatings - previousRating + newRating;
          transaction.update(ratingRef, { rating: newRating, rated_at: serverTimestamp() });
        } else {
          newSumOfRatings = newSumOfRatings + newRating;
          newTotalRatings = currentTotalRatings + 1;
          transaction.set(ratingRef, { user_id: currentUser.uid, rating: newRating, rated_at: serverTimestamp() });
        }

        const newAverage = newTotalRatings > 0 ? newSumOfRatings / newTotalRatings : 0;
        transaction.update(contentRef, {
          average_rating: newAverage,
          total_ratings: newTotalRatings
        });

        setContent(prev => prev ? {...prev, average_rating: newAverage, total_ratings: newTotalRatings} : null);
        setUserRating(newRating);
      });
      toast({ title: "Rating Submitted!", description: `You rated this content ${newRating} stars.` });
    } catch (error: any) {
      console.error("Error submitting rating:", error);
      toast({ title: "Rating Error", description: error.message || "Could not submit your rating.", variant: "destructive" });
    } finally {
      setIsRating(false);
    }
  };

  const handleSubmitComment = async (commentText: string, parentId: string | null = null) => {
    if (!currentUser || !content || !commentText.trim()) {
        toast({description: "Please write a comment and ensure you are logged in.", variant:"destructive"});
        parentId ? setIsSubmittingReply(false) : setIsSubmittingComment(false);
        return;
    }
    if(parentId) setIsSubmittingReply(true); else setIsSubmittingComment(true);

    try {
        const commentsColRef = collection(db, "contents", content.id, "comments");
        await addDoc(commentsColRef, {
            content_id: content.id,
            commenter_uid: currentUser.uid, // Use uid for consistency
            commenter_full_name: currentUserProfile?.full_name || currentUser.displayName || "Anonymous",
            commenter_photoURL: currentUserProfile?.photoURL || currentUser.photoURL || null,
            comment_text: commentText.trim(),
            commented_at: serverTimestamp(),
            parent_comment_id: parentId,
            likes: 0
        });
        if(parentId) setReplyText(""); else setNewComment("");
        if(parentId) setReplyingToCommentId(null);
        toast({title: parentId ? "Reply Posted!" : "Comment Posted!"});
        fetchComments(); // Refetch all comments to update UI with new comment/reply
    } catch (error: any) {
        console.error("Error posting comment/reply:", error);
        toast({title: "Error", description: "Could not post: " + error.message, variant: "destructive"});
    } finally {
        if(parentId) setIsSubmittingReply(false); else setIsSubmittingComment(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!currentUser || !contentId) {
      toast({ description: "Please log in to like comments.", variant: "destructive" });
      return;
    }
    const commentRef = doc(db, "contents", contentId, "comments", commentId);
    try {
      await updateDoc(commentRef, {
        likes: increment(1)
      });
      // Optimistically update UI or refetch comments
      setComments(prevComments => prevComments.map(c =>
        c.id === commentId ? { ...c, likes: (c.likes || 0) + 1 } : c
      ));
    } catch (error: any) {
      console.error("Error liking comment:", error);
      toast({ title: "Error", description: "Could not like comment: " + error.message, variant: "destructive" });
    }
  };


  const handleToggleFollow = async (targetAuthor: UserProfile | undefined) => {
    if (!currentUser || !currentUserProfile || !targetAuthor || !targetAuthor.uid) {
      toast({ title: "Error", description: "Cannot perform follow action. User or author not found.", variant: "destructive" });
      return;
    }
    if (currentUser.uid === targetAuthor.uid) {
      toast({ title: "Cannot Follow Self", description: "You cannot follow your own uploaded content.", variant: "default" });
      return;
    }

    setProcessingFollow(true);

    const currentUserFollowingTargetRef = doc(db, "users", currentUser.uid, "following", targetAuthor.uid);
    const targetUserFollowersCurrentUserRef = doc(db, "users", targetAuthor.uid, "followers", currentUser.uid);
    const currentUserDocRef = doc(db, "users", currentUser.uid);
    const targetUserDocRef = doc(db, "users", targetAuthor.uid);

    try {
        const isCurrentlyFollowing = isFollowingAuthor; // Use current state
        const batch = writeBatch(db);

        if (isCurrentlyFollowing) {
            batch.delete(currentUserFollowingTargetRef);
            batch.delete(targetUserFollowersCurrentUserRef);
            batch.update(currentUserDocRef, { following_count: increment(-1) });
            batch.update(targetUserDocRef, { followers_count: increment(-1) });
        } else {
            const timestamp = serverTimestamp();
            batch.set(currentUserFollowingTargetRef, { followed_at: timestamp, userName: targetAuthor.full_name || "User", userAvatar: targetAuthor.photoURL || null });
            batch.set(targetUserFollowersCurrentUserRef, { followed_at: timestamp, userName: currentUserProfile.full_name || "User", userAvatar: currentUserProfile.photoURL || null });
            batch.update(currentUserDocRef, { following_count: increment(1) });
            batch.update(targetUserDocRef, { followers_count: increment(1) });
        }
        await batch.commit();

        setIsFollowingAuthor(!isCurrentlyFollowing);
        // Update local author state for immediate UI feedback
        setContent(prev => {
            if (prev?.author?.uid === targetAuthor.uid) {
                return {
                    ...prev,
                    author: {
                        ...prev.author,
                        followers_count: (prev.author.followers_count || 0) + (!isCurrentlyFollowing ? 1 : -1)
                    }
                };
            }
            return prev;
        });
        toast({ title: !isCurrentlyFollowing ? "Followed!" : "Unfollowed!", description: `You are now ${!isCurrentlyFollowing ? "following" : "no longer following"} ${targetAuthor.full_name || "this user"}.` });
    } catch (error: any) {
        console.error("Error toggling follow:", error);
        toast({ title: "Follow Error", description: error.message || "Could not update follow status.", variant: "destructive" });
    } finally {
        setProcessingFollow(false);
    }
  };

  const handleDeleteContent = async () => {
    if (!content || !currentUser || currentUser.uid !== content.uploader_uid) {
        toast({ title: "Error", description: "You do not have permission to delete this content or content not found.", variant: "destructive"});
        return;
    }
    setIsDeletingContent(true);
    try {
        // 1. Delete file from Firebase Storage (if storage_path exists)
        if (content.storage_path) {
            const fileRef = ref(firebaseStorage, content.storage_path);
            await deleteObject(fileRef);
            console.log("File deleted from Storage:", content.storage_path);
        } else {
            console.log("No file in Storage to delete for this content or path missing.");
        }

        // 2. Delete content document from Firestore
        // Note: Deleting subcollections (comments, ratings) client-side recursively is inefficient and not recommended for large numbers.
        // A Cloud Function is the best way to handle cascading deletes of subcollections.
        // For now, we'll just delete the main content document.
        const contentDocRef = doc(db, "contents", content.id);
        await deleteDoc(contentDocRef);
        
        toast({ title: "Content Deleted", description: `"${content.title}" has been removed.`});
        router.push("/home"); // Redirect to home or search page after deletion
    } catch (error: any) {
        console.error("Error deleting content:", error);
        toast({ title: "Deletion Failed", description: `Could not delete content: ${error.message}`, variant: "destructive"});
        setIsDeletingContent(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!content) {
      toast({ title: "Content Error", description: "Content not loaded to generate quiz.", variant: "destructive" });
      return;
    }
    const quizContext = content.contentType === 'text'
        ? (content.text_content_inline || content.user_manual_description || content.title || "")
        : (content.ai_description || content.ai_transcript || content.user_manual_description || content.title || "");

    if (!quizContext || quizContext.length < 50) {
      toast({ title: "Quiz Context Too Short", description: "Not enough text content to generate a meaningful quiz.", variant: "default" });
      return;
    }

    setIsGeneratingQuiz(true);
    setQuizError(null);
    setQuizQuestions([]);
    setUserAnswers({});
    setQuizScore(null);
    setQuizSubmitted(false);
    setAiQuizFeedback(null);

    try {
      const input: GenerateQuizInput = {
        contentText: quizContext,
        numQuestions: Number(numQuizQuestions)
      };
      const result = await generateQuiz(input);
      if (result.questions && result.questions.length > 0) {
        setQuizQuestions(result.questions);
      } else {
        setQuizError("AI couldn't generate questions for this content. Try adjusting the number of questions or check content length.");
        toast({ title: "Quiz Generation Issue", description: "AI couldn't generate questions.", variant: "default"});
      }
    } catch (err: any) {
      console.error("Error generating quiz:", err);
      setQuizError(err.message || "An unknown error occurred while generating the quiz.");
      toast({ title: "Quiz Generation Error", description: err.message, variant: "destructive"});
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleAnswerChange = (questionIndex: number, answerIndex: number) => {
    setUserAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const handleSubmitQuiz = async () => {
    if (!content) return;

    let score = 0;
    const detailedResults: QuizQuestionWithResult[] = quizQuestions.map((q, index) => {
      const isCorrect = userAnswers[index] === q.correctAnswerIndex;
      if (isCorrect) {
        score++;
      }
      return {
        ...q,
        userAnswerIndex: userAnswers[index],
        isCorrect: isCorrect,
      };
    });

    setQuizScore(score);
    setQuizSubmitted(true);
    toast({title: "Quiz Submitted!", description: `You scored ${score} out of ${quizQuestions.length}.`})

    setIsGeneratingFeedback(true);
    setAiQuizFeedback(null);
    const quizContextForFeedback = content.contentType === 'text'
        ? (content.text_content_inline || content.user_manual_description || content.title || "")
        : (content.ai_description || content.ai_transcript || content.user_manual_description || content.title || "");
    try {
        const feedbackInput: SuggestQuizFeedbackInput = {
          contentText: quizContextForFeedback,
          quizResults: detailedResults,
        };
        const feedbackResponse = await suggestQuizFeedbackFlowWrapper(feedbackInput);
        setAiQuizFeedback(feedbackResponse.feedbackText);
    } catch (feedbackError: any) {
        console.error("Error generating quiz feedback:", feedbackError);
        setAiQuizFeedback("Sorry, I couldn't generate feedback for this quiz attempt. Error: " + feedbackError.message);
        toast({ title: "Feedback Generation Error", description: feedbackError.message || "Could not generate AI feedback.", variant: "destructive" });
    } finally {
        setIsGeneratingFeedback(false);
    }
  };

  const getInitials = (name?: string | null) => (name ? name.split(" ").map(n => n[0]).join("").toUpperCase() : "SF");

  const renderContentPlayer = () => {
    if (!content) return null;
    console.log("RenderContentPlayer: content.contentType =", content.contentType);
    console.log("RenderContentPlayer: Using download_url =", content.download_url, "OR storage_path =", content.storage_path);

    const playerContentProps = {
        type: content.contentType,
        download_url: content.download_url, // Prioritize this for direct Firebase Storage URLs
        storage_path: content.storage_path, // Fallback if only path is stored
        title: content.title,
        thumbnail_url: content.thumbnail_url,
      };

    switch (content.contentType?.toLowerCase()) {
      case "video":
        return <VideoPlayer content={playerContentProps} />;
      case "audio":
        return (
          <Card className="glass-card shadow-lg">
            <CardHeader className="items-center">
              <Volume2 className="h-16 w-16 md:h-24 md:w-24 text-primary mb-3" />
              <CardTitle className="text-2xl md:text-3xl text-center">{content.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {(playerContentProps.download_url || playerContentProps.storage_path) ? (
                  <audio controls src={playerContentProps.download_url || playerContentProps.storage_path} className="w-full max-w-md rounded-md shadow-inner">
                  Your browser does not support the audio element.
                  </audio>
              ) : <p className="text-muted-foreground">Audio source not available.</p>}
            </CardContent>
          </Card>
        );
      case "text":
        return (
          <Card className="glass-card shadow-lg">
            <CardHeader>
                <div className="flex items-center">
                    <FileText className="h-7 w-7 md:h-8 md:w-8 mr-3 text-primary" />
                    <CardTitle className="text-2xl md:text-3xl">{content.title}</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] md:h-[500px] p-4 border rounded-md bg-muted/30">
                <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">{content.text_content_inline || content.user_manual_description || "Text content not available."}</p>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      default:
        console.warn("Unsupported content type in renderContentPlayer. Actual type received:", content.contentType);
        return <div className="text-center text-muted-foreground p-8 glass-card rounded-lg">Unsupported content type: {content.contentType || 'Unknown'}</div>;
    }
  };


  if (isLoading || authLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-8">
        <Skeleton className="h-[40vh] md:h-[60vh] w-full rounded-lg glass-card" />
        <Card className="glass-card">
          <CardHeader><Skeleton className="h-8 w-3/4 rounded" /><Skeleton className="h-4 w-1/2 mt-2 rounded" /></CardHeader>
          <CardContent><Skeleton className="h-20 w-full rounded" /></CardContent>
        </Card>
         <Card className="glass-card">
          <CardHeader><Skeleton className="h-6 w-1/4 rounded" /></CardHeader>
          <CardContent className="space-y-4"><Skeleton className="h-10 w-full rounded" /><Skeleton className="h-16 w-full rounded" /></CardContent>
        </Card>
      </div>
    );
  }

  if (!content) {
    return <div className="text-center py-10 text-xl text-destructive flex items-center justify-center gap-2 glass-card rounded-lg p-8"><AlertTriangle/>Content not found or an error occurred.</div>;
  }

  const chatbotContextContent =
    content.contentType === 'text'
    ? (content.text_content_inline || content.user_manual_description || content.title || "")
    : (content.ai_description || content.ai_transcript || content.user_manual_description || content.title || "");
  const author = content.author;

  const renderComments = (commentsToRender: ProcessedComment[], level = 0) => {
    return commentsToRender.map(comment => (
      <div key={comment.id} className={`flex flex-col ${level > 0 ? `ml-6 pl-4 border-l border-border/30` : ''}`}>
        <div className="flex space-x-3 p-3 bg-muted/20 rounded-lg border border-border/30 mb-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={comment.commenter_photoURL || undefined} />
            <AvatarFallback className="bg-secondary">{getInitials(comment.commenter_full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-grow">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{comment.commenter_full_name}</p>
              <p className="text-xs text-muted-foreground">{comment.commented_at?.toDate ? formatDistanceToNowStrict(comment.commented_at.toDate(), { addSuffix: true }) : "just now"}</p>
            </div>
            <p className="text-sm mt-1 text-muted-foreground leading-relaxed">{comment.comment_text}</p>
            <div className="flex items-center space-x-3 mt-2">
              <Button variant="ghost" size="sm" onClick={() => handleLikeComment(comment.id)} className="text-muted-foreground hover:text-primary p-1 h-auto disabled:opacity-50" disabled={!currentUser || isSubmittingComment || isSubmittingReply}>
                <ThumbsUp className="h-4 w-4 mr-1" /> {comment.likes || 0}
              </Button>
              {currentUser && (
                <Button variant="ghost" size="sm" onClick={() => { setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id); setReplyText(""); }} className="text-muted-foreground hover:text-primary p-1 h-auto" disabled={isSubmittingComment || isSubmittingReply}>
                  <ReplyIcon className="h-4 w-4 mr-1" /> {replyingToCommentId === comment.id ? 'Cancel' : 'Reply'}
                </Button>
              )}
            </div>
          </div>
        </div>
        {replyingToCommentId === comment.id && (
          <div className="ml-12 mb-3 p-3 bg-muted/30 rounded-lg border border-border/40">
            <Label htmlFor={`reply-input-${comment.id}`} className="text-sm font-medium text-foreground">Replying to {comment.commenter_full_name}</Label>
            <Textarea
              id={`reply-input-${comment.id}`}
              placeholder="Write your reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              className="input-glow-focus mt-1 mb-2 bg-background/50"
              disabled={isSubmittingReply}
            />
            <div className="flex justify-end space-x-2">
              <Button variant="ghost" size="sm" onClick={() => { setReplyingToCommentId(null); setReplyText("");}} disabled={isSubmittingReply}>Cancel</Button>
              <Button onClick={() => handleSubmitComment(replyText, comment.id)} disabled={isSubmittingReply || !replyText.trim()} size="sm" className="bg-primary hover:bg-accent">
                {isSubmittingReply ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <Send className="h-4 w-4 mr-1" />} Post Reply
              </Button>
            </div>
          </div>
        )}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-1">{renderComments(comment.replies.sort((a,b) => a.commented_at.toMillis() - b.commented_at.toMillis()), level + 1)}</div>
        )}
      </div>
    ));
  };


  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">
          {renderContentPlayer()}

          <Card className="glass-card shadow-xl">
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <CardTitle className="text-2xl md:text-3xl text-neon-primary flex-grow">{content.title}</CardTitle>
                <div className="flex items-center space-x-2 shrink-0">
                  {currentUser?.uid === content.uploader_uid && (
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="text-destructive-foreground hover:bg-destructive/80" disabled={isDeletingContent}>
                                {isDeletingContent ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="glass-card">
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete "{content.title}" and all associated data (comments, ratings).
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteContent} disabled={isDeletingContent} className="bg-destructive hover:bg-destructive/90">
                                {isDeletingContent ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Yes, delete content
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary"><Bookmark className="h-5 w-5" /></Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary"><ShareIcon className="h-5 w-5" /></Button>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`h-5 w-5 cursor-pointer transition-colors ${i < Math.round(userRating ?? content.average_rating ?? 0) ? 'fill-yellow-400 text-yellow-400 hover:text-yellow-300' : 'text-muted-foreground/60 hover:text-yellow-400'}`}
                    onClick={() => !isRating && handleRating(i + 1)}
                    />
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">{content.average_rating?.toFixed(1) || 'N/A'} ({content.total_ratings || 0} ratings)</span>
                  {isRating && <Loader2 className="h-5 w-5 animate-spin text-primary ml-2" />}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Eye className="h-4 w-4 mr-1.5"/> {content.view_count || 0} views
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {content.contentType !== 'text' && content.ai_description && (
                <>
                  <h3 className="text-xl font-semibold mb-2 text-accent">AI Generated Description</h3>
                  <ScrollArea className="h-40 max-h-60 p-3 rounded-md bg-muted/20 border border-border/50">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{content.ai_description}</p>
                  </ScrollArea>
                </>
              )}
              {content.user_manual_description && (
                 <>
                  <h3 className="text-xl font-semibold mt-4 mb-2 text-accent">
                    {content.contentType === 'text' ? 'Content Description' : 'Author Provided Summary'}
                  </h3>
                  <ScrollArea className="h-40 max-h-60 p-3 rounded-md bg-muted/20 border border-border/50">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{content.user_manual_description}</p>
                  </ScrollArea>
                 </>
              )}
              {content.contentType === 'text' && content.text_content_inline && !content.user_manual_description && (
                 <>
                  <h3 className="text-xl font-semibold mt-4 mb-2 text-accent">Content</h3>
                  <ScrollArea className="h-40 max-h-60 p-3 rounded-md bg-muted/20 border border-border/50">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{content.text_content_inline}</p>
                  </ScrollArea>
                 </>
              )}
              {!content.ai_description && !content.user_manual_description && content.contentType !== 'text' && !content.text_content_inline &&(
                 <p className="text-sm text-muted-foreground">No description available for this content.</p>
              )}

              {author && author.uid && (
                <>
                  <Separator className="my-6 bg-border/50" />
                  <div className="flex flex-col sm:flex-row items-start space-y-3 sm:space-y-0 sm:space-x-4">
                    <Link href={`/profile/${author.uid}`}>
                      <Avatar className="h-16 w-16 md:h-20 md:w-20 border-2 border-primary hover:ring-2 hover:ring-accent smooth-transition">
                        <AvatarImage src={author.photoURL || undefined} alt={author.full_name || "Author"} />
                        <AvatarFallback className="bg-secondary text-lg">{getInitials(author.full_name)}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-grow">
                      <p className="text-xs text-muted-foreground">Content by</p>
                      <Link href={`/profile/${author.uid}`} className="hover:underline">
                        <h4 className="text-xl md:text-2xl font-semibold text-neon-accent group-hover:text-primary">{author.full_name || "Unknown Author"}</h4>
                      </Link>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{author.description || "No bio provided."}</p>
                       <p className="text-xs text-muted-foreground mt-1">
                        Followers: {author.followers_count ?? 0}
                      </p>
                    </div>
                    {currentUser && currentUser.uid !== author.uid && (
                      <Button
                        variant={isFollowingAuthor ? "outline" : "default"}
                        onClick={() => handleToggleFollow(author)}
                        disabled={processingFollow || authLoading}
                        className={`${isFollowingAuthor ? "border-accent text-accent hover:bg-accent/10" : "bg-primary hover:bg-accent"} smooth-transition px-4 py-2 text-sm shrink-0`}
                      >
                        {processingFollow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                         isFollowingAuthor ? <UserCheck className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        {isFollowingAuthor ? "Following" : "Follow"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl text-neon-accent flex items-center">
                <HelpCircle className="mr-2 h-5 w-5 text-accent" /> Interactive Quiz
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quizSubmitted ? (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold text-primary text-center">Quiz Results</h3>
                  <p className="text-lg text-center">
                    You scored <span className="font-bold text-accent">{quizScore}</span> out of <span className="font-bold text-accent">{quizQuestions.length}</span> correct!
                  </p>
                  <ScrollArea className="h-72 md:h-96 pr-2">
                  <div className="space-y-6 text-left p-2">
                    {quizQuestions.map((q, qIndex) => (
                      <div key={qIndex} className="p-3 rounded-md border bg-muted/20">
                        <p className="font-semibold mb-2">{qIndex + 1}. {q.questionText}</p>
                        {q.options.map((opt, oIndex) => {
                          const isCorrect = oIndex === q.correctAnswerIndex;
                          const isUserChoice = userAnswers[qIndex] === oIndex;
                          return (
                            <div key={oIndex}
                              className={`flex items-center space-x-2 p-2 rounded text-sm
                                ${isCorrect ? "bg-green-500/20 text-green-300 border-green-500/50" : ""}
                                ${isUserChoice && !isCorrect ? "bg-red-500/20 text-red-300 border-red-500/50" : ""}
                                ${isUserChoice && isCorrect ? "border-2 border-green-400" : ""}`}
                            >
                              {isUserChoice && isCorrect ? <Check className="h-4 w-4 text-green-400"/> : isUserChoice && !isCorrect ? <X className="h-4 w-4 text-red-400"/> : <span className="w-4 h-4"></span>}
                              <span>{opt}</span>
                            </div>
                          );
                        })}
                        {q.explanation && <p className="text-xs text-muted-foreground mt-2 pt-1 border-t border-border/30">Explanation: {q.explanation}</p>}
                      </div>
                    ))}
                  </div>
                  </ScrollArea>

                  {isGeneratingFeedback && (
                    <div className="flex items-center justify-center p-4 text-muted-foreground">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" /> Generating personalized feedback...
                    </div>
                  )}
                  {aiQuizFeedback && !isGeneratingFeedback && (
                    <Card className="mt-4 glass-card bg-accent/10 border-accent/50">
                      <CardHeader>
                        <CardTitle className="text-lg text-accent flex items-center"><Brain className="mr-2 h-5 w-5"/> AI Feedback</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-sm text-accent-foreground/90 leading-relaxed">{aiQuizFeedback}</p>
                      </CardContent>
                    </Card>
                  )}

                  <Button onClick={() => {setQuizQuestions([]); setQuizSubmitted(false); setQuizScore(null); setUserAnswers({}); setAiQuizFeedback(null);}} className="w-full bg-primary hover:bg-accent mt-4">
                    Try Another Quiz
                  </Button>
                </div>
              ) : quizQuestions.length > 0 ? (
                <div className="space-y-4">
                 <ScrollArea className="h-72 md:h-96 pr-2">
                  {quizQuestions.map((q, qIndex) => (
                    <div key={qIndex} className="mb-4 p-3 rounded-md border border-border/40 bg-muted/10">
                      <Label className="font-semibold block mb-2">{qIndex + 1}. {q.questionText}</Label>
                      <RadioGroup onValueChange={(value) => handleAnswerChange(qIndex, parseInt(value))} value={userAnswers[qIndex]?.toString()}>
                        {q.options.map((option, oIndex) => (
                          <div key={oIndex} className="flex items-center space-x-2 hover:bg-primary/10 p-1.5 rounded-md">
                            <RadioGroupItem value={oIndex.toString()} id={`q${qIndex}-o${oIndex}`} />
                            <Label htmlFor={`q${qIndex}-o${oIndex}`} className="font-normal cursor-pointer">{option}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                       {q.explanation && <p className="text-xs text-muted-foreground mt-2 pt-1 border-t border-border/30">Hint/Context: {q.explanation}</p>}
                    </div>
                  ))}
                  </ScrollArea>
                  <Button onClick={handleSubmitQuiz} className="w-full bg-primary hover:bg-accent mt-4">
                    <Send className="mr-2 h-4 w-4" /> Submit Answers
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-muted-foreground">Test your knowledge on this content!</p>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="numQuizQuestions" className="shrink-0">Number of Questions (1-10):</Label>
                    <Input
                      id="numQuizQuestions"
                      type="number"
                      min="1"
                      max="10"
                      value={numQuizQuestions}
                      onChange={(e) => setNumQuizQuestions(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="w-20 input-glow-focus"
                      disabled={isGeneratingQuiz}
                    />
                  </div>
                  <Button onClick={handleGenerateQuiz} disabled={isGeneratingQuiz || !currentUser} className="w-full bg-accent hover:bg-primary">
                    {isGeneratingQuiz ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HelpCircle className="mr-2 h-4 w-4" />}
                    Generate Quiz
                  </Button>
                  {!currentUser && <p className="text-xs text-destructive text-center">Please log in to generate a quiz.</p>}
                  {quizError && <p className="text-sm text-destructive mt-2">{quizError}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card shadow-xl">
            <CardHeader><CardTitle className="text-xl text-neon-accent">Comments ({processedComments.length})</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {currentUser && (
                <div className="flex space-x-3 items-start">
                  <Avatar className="mt-1">
                    <AvatarImage src={currentUserProfile?.photoURL || currentUser.photoURL || undefined} />
                    <AvatarFallback className="bg-secondary">{getInitials(currentUserProfile?.full_name || currentUser.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-grow">
                    <Textarea
                      placeholder="Write a thoughtful comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                      className="input-glow-focus mb-2 bg-muted/30 border-border/50"
                      disabled={isSubmittingComment}
                    />
                    <Button onClick={() => handleSubmitComment(newComment)} disabled={isSubmittingComment || !newComment.trim()} className="bg-primary hover:bg-accent text-sm px-4 py-2">
                      {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Send className="h-4 w-4 mr-1" />}
                      Post Comment
                    </Button>
                  </div>
                </div>
              )}
              <Separator className="my-4 bg-border/50"/>
              <ScrollArea className="max-h-96 pr-2 -mr-2">
                <div className="space-y-4">
                  {processedComments.length > 0 ? renderComments(processedComments) : (
                  <p className="text-muted-foreground text-center py-6">No comments yet. Be the first to share your thoughts!</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          {/* Similar Content Placeholder */}
          <Card className="glass-card shadow-xl">
            <CardHeader>
                <CardTitle className="text-xl text-neon-accent flex items-center">
                    <LinkIcon className="mr-2 h-5 w-5 text-accent"/> Similar Content
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground text-center py-8">Suggestions for similar content will appear here soon!</p>
            </CardContent>
          </Card>
        </div>

        <aside className="lg:col-span-1 space-y-6 sticky top-24 self-start">
          <ChatbotWidget fileContentContext={chatbotContextContent || ""} />
           <Card className="glass-card shadow-lg">
             <CardHeader><CardTitle className="text-lg text-neon-accent">Related Skills Tags</CardTitle></CardHeader>
             <CardContent>
                <div className="flex flex-wrap gap-2">
                    {(content?.tags || []).map(tag => (
                        <span key={tag} className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground shadow-sm">{tag}</span>
                    ))}
                    {(!content?.tags || content.tags.length === 0) && (
                        <p className="text-muted-foreground text-sm text-center py-4">No tags for this content.</p>
                    )}
                </div>
             </CardContent>
           </Card>
        </aside>
      </div>
    </div>
  );
}
