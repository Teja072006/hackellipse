
// src/app/(main)/content/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatbotWidget } from "@/components/content/chatbot-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ThumbsUp, MessageSquare, UserPlus, Loader2, PlayCircle, FileText, Volume2, Star, AlertTriangle } from "lucide-react";
import Image from "next/image";
import type { UserProfile } from "@/contexts/auth-context"; // Firebase version
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, increment, arrayUnion, arrayRemove, runTransaction, serverTimestamp, collection, addDoc, query, orderBy, getDocs, Timestamp, where, deleteDoc } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict } from 'date-fns';


interface ContentDetails {
  id: string; // Firestore document ID from content_types
  title: string;
  type: "video" | "audio" | "text";
  uploader_user_id: string;
  tags: string[];
  uploaded_at: Timestamp;
  average_rating?: number;
  total_ratings?: number;
  
  // Specific content data
  path_or_data?: string; // URL for video/audio, or actual text data for text type
  ai_description?: string; // AI generated description
  duration_seconds?: number;

  // Author details (to be fetched)
  author?: UserProfile;
}

interface Comment {
    id: string; // Firestore document ID
    commenter_user_id: string;
    commenter_full_name?: string | null;
    commenter_photoURL?: string | null;
    comment_text: string;
    commented_at: Timestamp;
}


export default function ViewContentPage() {
  const params = useParams();
  const contentId = params.id as string;
  const { user: currentUser, profile: currentUserProfile } = useAuth();
  const [content, setContent] = useState<ContentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRating, setUserRating] = useState<number | null>(null); // User's rating for this content
  const [isRating, setIsRating] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const { toast } = useToast();

  const fetchContentDetails = useCallback(async () => {
    if (!contentId) return;
    setIsLoading(true);
    try {
      const contentDocRef = doc(db, "content_types", contentId);
      const contentDocSnap = await getDoc(contentDocRef);

      if (!contentDocSnap.exists()) {
        setContent(null);
        throw new Error("Content not found.");
      }

      const contentData = contentDocSnap.data() as Omit<ContentDetails, 'id' | 'author' | 'path_or_data' | 'ai_description'>;
      let specificData: Partial<Pick<ContentDetails, 'path_or_data' | 'ai_description' | 'duration_seconds'>> = {};

      let specificContentCollectionName = "";
      if (contentData.type === "video") specificContentCollectionName = "videos";
      else if (contentData.type === "audio") specificContentCollectionName = "audios";
      else if (contentData.type === "text") specificContentCollectionName = "texts";

      if (specificContentCollectionName) {
        const specificContentDocRef = doc(db, specificContentCollectionName, contentId); // Using contentId as specific doc ID
        const specificDocSnap = await getDoc(specificContentDocRef);
        if (specificDocSnap.exists()) {
          const sData = specificDocSnap.data();
          specificData.ai_description = sData?.ai_description;
          if (contentData.type === "video") specificData.path_or_data = sData?.video_path;
          else if (contentData.type === "audio") specificData.path_or_data = sData?.audio_path;
          else if (contentData.type === "text") specificData.path_or_data = sData?.text_data || sData?.text_data_path;
          specificData.duration_seconds = sData?.duration_seconds;
        }
      }
      
      let authorProfile: UserProfile | undefined = undefined;
      if (contentData.uploader_user_id) {
        const authorDocRef = doc(db, "users", contentData.uploader_user_id);
        const authorDocSnap = await getDoc(authorDocRef);
        if (authorDocSnap.exists()) {
          authorProfile = { uid: authorDocSnap.id, ...authorDocSnap.data() } as UserProfile;
        }
      }

      setContent({
        id: contentDocSnap.id,
        ...contentData,
        ...specificData,
        author: authorProfile,
      });

      // Fetch user's rating for this content if logged in
      if (currentUser?.uid) {
        const ratingDocRef = doc(db, "content_types", contentId, "ratings", currentUser.uid);
        const ratingDocSnap = await getDoc(ratingDocRef);
        if (ratingDocSnap.exists()) {
          setUserRating(ratingDocSnap.data().rating as number);
        } else {
          setUserRating(null);
        }
      }

    } catch (error: any) {
      console.error("Error fetching content details:", error);
      toast({ title: "Error", description: error.message || "Could not load content.", variant: "destructive" });
      setContent(null);
    } finally {
      setIsLoading(false);
    }
  }, [contentId, currentUser?.uid]);

  const fetchComments = useCallback(async () => {
    if (!contentId) return;
    const commentsColRef = collection(db, "content_types", contentId, "comments");
    const q = query(commentsColRef, orderBy("commented_at", "desc"), where("parent_comment_id", "==", null)); // Top-level comments

    try {
        const snapshot = await getDocs(q);
        const fetchedCommentsPromises = snapshot.docs.map(async (docSnap) => {
            const commentData = docSnap.data();
            let commenterProfile: Partial<UserProfile> = {};
            if (commentData.commenter_user_id) {
                const userRef = doc(db, "users", commentData.commenter_user_id);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    commenterProfile = userSnap.data() as UserProfile;
                }
            }
            return {
                id: docSnap.id,
                ...commentData,
                commenter_full_name: commenterProfile.full_name || "Anonymous",
                commenter_photoURL: commenterProfile.photoURL,
            } as Comment;
        });
        const resolvedComments = await Promise.all(fetchedCommentsPromises);
        setComments(resolvedComments);
    } catch (error) {
        console.error("Error fetching comments:", error);
        toast({title: "Error", description: "Could not load comments.", variant: "destructive"});
    }
  }, [contentId]);

  useEffect(() => {
    fetchContentDetails();
    fetchComments();
  }, [fetchContentDetails, fetchComments]);


  const handleRating = async (newRating: number) => {
    if (!currentUser || !content) {
      toast({ title: "Login Required", description: "You must be logged in to rate content.", variant: "destructive" });
      return;
    }
    setIsRating(true);
    
    const contentRef = doc(db, "content_types", content.id);
    const ratingRef = doc(db, "content_types", content.id, "ratings", currentUser.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const contentDoc = await transaction.get(contentRef);
        if (!contentDoc.exists()) throw "Content document does not exist!";
        
        const currentTotalRatings = contentDoc.data()?.total_ratings || 0;
        const currentAverageRating = contentDoc.data()?.average_rating || 0;
        let newTotalRatings = currentTotalRatings;
        let newSumOfRatings = currentAverageRating * currentTotalRatings;

        const oldRatingDoc = await transaction.get(ratingRef);
        if (oldRatingDoc.exists()) { // User is changing their rating
          const previousRating = oldRatingDoc.data().rating;
          newSumOfRatings = newSumOfRatings - previousRating + newRating;
          transaction.update(ratingRef, { rating: newRating, rated_at: serverTimestamp() });
        } else { // User is rating for the first time
          newSumOfRatings = newSumOfRatings + newRating;
          newTotalRatings = currentTotalRatings + 1;
          transaction.set(ratingRef, { user_id: currentUser.uid, rating: newRating, rated_at: serverTimestamp() });
        }
        
        const newAverage = newTotalRatings > 0 ? newSumOfRatings / newTotalRatings : 0;
        transaction.update(contentRef, {
          average_rating: newAverage,
          total_ratings: newTotalRatings
        });
        
        // Update local state optimistically (or after transaction)
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

  const handleSubmitComment = async () => {
    if (!currentUser || !content || !newComment.trim()) {
        toast({description: "Please write a comment and ensure you are logged in.", variant:"destructive"});
        return;
    }
    setIsSubmittingComment(true);
    try {
        const commentsColRef = collection(db, "content_types", content.id, "comments");
        await addDoc(commentsColRef, {
            content_id: content.id,
            commenter_user_id: currentUser.uid,
            comment_text: newComment.trim(),
            parent_comment_id: null, // For top-level comment
            commented_at: serverTimestamp()
        });
        setNewComment("");
        toast({title: "Comment Posted!"});
        fetchComments(); // Re-fetch comments
    } catch (error: any) {
        console.error("Error posting comment:", error);
        toast({title: "Error", description: "Could not post comment: " + error.message, variant: "destructive"});
    } finally {
        setIsSubmittingComment(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading SkillForge content...</p>
      </div>
    );
  }

  if (!content) {
    return <div className="text-center py-10 text-xl text-destructive"><AlertTriangle className="inline h-6 w-6 mr-2"/>Content not found or an error occurred.</div>;
  }

  const renderContentPlayer = () => {
    const placeholderImageUrl = `https://placehold.co/1280x720.png?text=${encodeURIComponent(content.title)}`;
    switch (content.type) {
      case "video":
        return (
          <div className="aspect-video bg-muted rounded-lg overflow-hidden shadow-lg relative">
            {content.path_or_data ? (
              <video src={content.path_or_data} controls className="w-full h-full object-cover" />
            ) : (
              <Image src={placeholderImageUrl} alt={content.title} layout="fill" objectFit="cover" data-ai-hint="video screen" />
            )}
             {!content.path_or_data && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <PlayCircle className="h-20 w-20 text-white/80 hover:text-white cursor-pointer transition-colors"/>
                </div>
             )}
          </div>
        );
      case "audio":
        return (
          <div className="p-8 bg-muted rounded-lg shadow-lg flex flex-col items-center space-y-4">
            <Volume2 className="h-24 w-24 text-primary" />
            <h3 className="text-2xl font-semibold">{content.title}</h3>
            {content.path_or_data ? (
                <audio controls src={content.path_or_data} className="w-full max-w-md">
                Your browser does not support the audio element.
                </audio>
            ) : <p className="text-muted-foreground">Audio source not available.</p>}
          </div>
        );
      case "text":
        return (
          <Card className="bg-card shadow-lg">
            <CardHeader>
                <div className="flex items-center">
                    <FileText className="h-8 w-8 mr-3 text-primary" />
                    <CardTitle className="text-3xl">{content.title}</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] p-4 border rounded-md bg-muted/30">
                <p className="whitespace-pre-wrap leading-relaxed">{content.path_or_data || "Text content not available."}</p>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      default:
        return <p>Unsupported content type.</p>;
    }
  };
  
  const getInitials = (name?: string | null) => (name ? name.split(" ").map(n => n[0]).join("").toUpperCase() : "??");

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {renderContentPlayer()}
          
          <Card className="bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-3xl text-neon-primary">{content.title}</CardTitle>
              <CardDescription>
                By {content.author?.full_name || "Unknown Author"} • Published on {content.uploaded_at?.toDate().toLocaleDateString() || "N/A"}
              </CardDescription>
               <div className="flex items-center mt-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`h-5 w-5 cursor-pointer ${i < Math.round(userRating || content.average_rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-300'}`} 
                  onClick={() => !isRating && handleRating(i + 1)}
                  />
                ))}
                <span className="ml-2 text-sm text-muted-foreground">{content.average_rating?.toFixed(1) || 'N/A'} ({content.total_ratings || 0} ratings)</span>
                {isRating && <Loader2 className="h-5 w-5 animate-spin text-primary ml-2" />}
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="text-xl font-semibold mb-2 text-primary">AI Generated Description</h3>
              <Textarea value={content.ai_description || "No AI description available."} readOnly rows={8} className="bg-muted/30 border-border focus:ring-0" />
            </CardContent>
          </Card>

          <Card className="bg-card shadow-lg">
            <CardHeader><CardTitle className="text-xl">Comments ({comments.length})</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {currentUser && (
                <div className="flex space-x-3">
                  <Avatar>
                    <AvatarImage src={currentUserProfile?.photoURL || currentUser.photoURL || undefined} />
                    <AvatarFallback>{getInitials(currentUserProfile?.full_name || currentUser.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-grow">
                    <Textarea 
                      placeholder="Write a comment..." 
                      value={newComment} 
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                      className="input-glow-focus mb-2"
                    />
                    <Button onClick={handleSubmitComment} disabled={isSubmittingComment || !newComment.trim()} className="bg-primary hover:bg-accent">
                      {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}
                      Post Comment
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {comments.length > 0 ? comments.map(comment => (
                  <div key={comment.id} className="flex space-x-3 p-3 bg-muted/30 rounded-md">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={comment.commenter_photoURL || undefined} />
                      <AvatarFallback>{getInitials(comment.commenter_full_name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{comment.commenter_full_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNowStrict(comment.commented_at.toDate(), { addSuffix: true })}</p>
                      <p className="text-sm mt-1">{comment.comment_text}</p>
                    </div>
                  </div>
                )) : <p className="text-muted-foreground text-center">No comments yet. Be the first!</p>}
              </div>
            </CardContent>
          </Card>

        </div>

        <aside className="lg:col-span-1 space-y-6">
          <ChatbotWidget fileContentContext={content.ai_description || content.path_or_data || content.title} />
        </aside>
      </div>
    </div>
  );
}
