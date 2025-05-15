// src/app/(main)/content/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatbotWidget } from "@/components/content/chatbot-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThumbsUp, MessageSquare, UserPlus, Loader2, PlayCircle, FileText, Volume2, Star } from "lucide-react";
import Image from "next/image";
import { MOCK_CONTENT_ITEMS } from "@/app/(main)/search/page"; // Re-using mock data type from search page
import type { Content } from "@/components/content/content-card"; // Ensure type consistency
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";


// Mock function to get content details by ID
const getContentById = async (id: string): Promise<Content | undefined> => {
  // In a real app, this would be an API call
  return new Promise(resolve => setTimeout(() => resolve(MOCK_CONTENT_ITEMS.find(item => item.id === id)), 300));
};


export default function ViewContentPage() {
  const params = useParams();
  const id = params.id as string;
  const [content, setContent] = useState<Content | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isRating, setIsRating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (id) {
      const fetchContent = async () => {
        setIsLoading(true);
        const fetchedContent = await getContentById(id);
        setContent(fetchedContent || null);
        // Mock: fetch user's existing rating for this content if any
        // setUserRating(fetchedContent?.userExistingRating || null); 
        setIsLoading(false);
      };
      fetchContent();
    }
  }, [id]);

  const handleRating = async (rating: number) => {
    if (!content) return;
    setIsRating(true);
    // Simulate API call to save rating
    await new Promise(resolve => setTimeout(resolve, 500));
    const oldRating = userRating;
    setUserRating(rating);
    // Update content's average rating (mock)
    const newTotalRatings = (content.totalRatings || 0) + (oldRating ? 0 : 1);
    const newAverageRating = ((content.averageRating || 0) * (content.totalRatings || 0) - (oldRating || 0) + rating) / newTotalRatings;
    setContent(prev => prev ? {...prev, averageRating: newAverageRating, totalRatings: newTotalRatings } : null);

    setIsRating(false);
    toast({ title: oldRating ? "Rating Updated!" : "Thanks for rating!", description: `You rated this content ${rating} stars.` });
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading content...</p>
      </div>
    );
  }

  if (!content) {
    return <div className="text-center py-10">Content not found.</div>;
  }

  const renderContentPlayer = () => {
    switch (content.type) {
      case "video":
        return (
          <div className="aspect-video bg-muted rounded-lg overflow-hidden shadow-lg">
            {/* Placeholder for video player. In a real app, use a video player component */}
            <Image src={content.imageUrl || `https://placehold.co/1280x720.png?text=${content.title}`} alt={content.title} width={1280} height={720} className="w-full h-full object-cover" data-ai-hint="video screen" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <PlayCircle className="h-20 w-20 text-white/80 hover:text-white cursor-pointer transition-colors"/>
            </div>
          </div>
        );
      case "audio":
        return (
          <div className="p-8 bg-muted rounded-lg shadow-lg flex flex-col items-center space-y-4">
            <Volume2 className="h-24 w-24 text-primary" />
            <h3 className="text-2xl font-semibold">{content.title}</h3>
            <audio controls src={content.imageUrl /* Assuming imageUrl can be audio src for mock */} className="w-full max-w-md">
              Your browser does not support the audio element.
            </audio>
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
                <p className="whitespace-pre-wrap leading-relaxed">{content.aiSummary}  {/* Displaying summary as text content for now */}</p>
                <p className="mt-4 italic text-muted-foreground">(Full text content would be displayed here)</p>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      default:
        return <p>Unsupported content type.</p>;
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {renderContentPlayer()}
          
          <Card className="bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-3xl text-neon-primary">{content.title}</CardTitle>
              <CardDescription>By {content.author} • Published on {new Date().toLocaleDateString() /* Placeholder date */}</CardDescription>
               <div className="flex items-center mt-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`h-5 w-5 ${i < Math.round(content.averageRating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                ))}
                <span className="ml-2 text-sm text-muted-foreground">{content.averageRating?.toFixed(1) || 'N/A'} ({content.totalRatings || 0} ratings)</span>
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="text-xl font-semibold mb-2 text-primary">AI Generated Description</h3>
              <Textarea value={content.aiSummary} readOnly rows={10} className="bg-muted/30 border-border focus:ring-0" />
            </CardContent>
          </Card>

          {/* Interaction and Rating Section */}
          <Card className="bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Enjoyed this content?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-4">
                <Button variant="outline" className="hover:bg-primary/10 hover:border-primary">
                  <ThumbsUp className="mr-2 h-5 w-5" /> Like (123) {/* Placeholder count */}
                </Button>
                <Button variant="outline" className="hover:bg-primary/10 hover:border-primary">
                  <MessageSquare className="mr-2 h-5 w-5" /> Comment (45) {/* Placeholder count */}
                </Button>
                <Button variant="outline" className="hover:bg-primary/10 hover:border-primary">
                  <UserPlus className="mr-2 h-5 w-5" /> Follow {content.author}
                </Button>
              </div>
              <div>
                <h4 className="text-md font-semibold mb-2">Rate this content:</h4>
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      key={star}
                      variant="ghost"
                      size="icon"
                      onClick={() => !isRating && handleRating(star)}
                      disabled={isRating}
                      className={`hover:text-yellow-400 transition-colors ${userRating && star <= userRating ? 'text-yellow-400' : 'text-muted-foreground'}`}
                    >
                      <Star className={`h-6 w-6 ${userRating && star <= userRating ? 'fill-current' : ''}`} />
                    </Button>
                  ))}
                  {isRating && <Loader2 className="h-5 w-5 animate-spin text-primary ml-2" />}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chatbot Widget Area */}
        <aside className="lg:col-span-1 space-y-6">
          <ChatbotWidget fileContentContext={content.aiSummary} /> {/* Pass actual content text or summary */}
        </aside>
      </div>
    </div>
  );
}
