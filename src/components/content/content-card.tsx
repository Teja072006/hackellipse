
// src/components/content/content-card.tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Tag, Star } from "lucide-react";

// Updated Content interface to match Firestore structure + display needs
export interface Content {
  id: string; // Firestore document ID for content_types
  title: string;
  aiSummary: string; // Or brief_summary from content_types
  type: "video" | "audio" | "text";
  author: string; // Author's full name
  tags: string[];
  imageUrl?: string; // Placeholder or thumbnail URL
  average_rating?: number; 
  total_ratings?: number;
  // Not needed directly in card, but good for context:
  // uploader_user_id?: string; 
  // uploaded_at?: any; // Firestore Timestamp
}

interface ContentCardProps {
  content: Content;
}

export function ContentCard({ content }: ContentCardProps) {
  const displaySummary = content.aiSummary && content.aiSummary.length > 150 
    ? content.aiSummary.substring(0, 147) + "..." 
    : (content.aiSummary || "No summary available.");

  const placeholderImage = `https://placehold.co/600x400.png?text=${encodeURIComponent(content.title)}`;

  return (
    <Card className="flex flex-col h-full bg-card shadow-lg hover:shadow-primary/20 transition-all duration-300 group">
      <div className="relative w-full h-48 overflow-hidden rounded-t-lg">
        <Image 
          src={content.imageUrl || placeholderImage} 
          alt={content.title} 
          fill 
          style={{objectFit:"cover"}}
          className="group-hover:scale-105 transition-transform duration-300"
          data-ai-hint={content.type === "video" ? "video screen" : content.type === "audio" ? "audio waveform" : "text document"}
        />
      </div>
      <CardHeader>
        <CardTitle className="text-xl group-hover:text-primary transition-colors">{content.title}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground capitalize">
          {content.type} by {content.author || "Unknown Author"}
        </CardDescription>
        {content.average_rating !== undefined && content.total_ratings !== undefined && (
          <div className="flex items-center mt-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < Math.round(content.average_rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
            ))}
            <span className="ml-1 text-xs text-muted-foreground">({content.total_ratings} ratings)</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-3">{displaySummary}</p>
      </CardContent>
      <CardFooter className="flex flex-col items-start space-y-2">
        <div className="flex flex-wrap gap-2 mb-2">
          {content.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground flex items-center">
              <Tag className="mr-1 h-3 w-3" /> {tag}
            </span>
          ))}
        </div>
        <Button asChild className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all">
          <Link href={`/content/${content.id}`}>
            View Content <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
